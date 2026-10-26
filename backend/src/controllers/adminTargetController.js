const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const multer = require('multer')
const bcrypt = require('bcrypt')
const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const targetStatsService = require('../services/targetStats.service')
const { normalizePhone, processCsvImport } = require('../utils/targetImportWorker')

// Multer config untuk temp import CSV
const TEMP_DIR = path.join(__dirname, '../../uploads/temp')
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.csv'
    cb(null, `import_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`)
  },
})

const uploadCsv = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Maks 50 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/plain' ||
      ext === '.csv' ||
      ext === '.txt'
    ) {
      cb(null, true)
    } else {
      cb(new Error('Hanya file format CSV atau TXT yang diperbolehkan'))
    }
  },
})

/**
 * GET /api/admin/targets
 * Mengambil daftar target dengan cursor pagination dan statistik dari targetStatsService
 */
async function listTargets(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100)
    const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : undefined
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : undefined
    const status = req.query.status || req.query.tab // all, queued, none, active, success, failed
    const phonePrefix = req.query.phonePrefix ? req.query.phonePrefix.replace('+', '').trim() : undefined

    const where = {}
    if (categoryId && !isNaN(categoryId)) {
      where.categoryId = categoryId
    }
    if (status && status !== 'all') {
      where.queueStatus = status
    }
    if (phonePrefix) {
      where.phone = { startsWith: phonePrefix }
    }

    const items = await prisma.target.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where,
      orderBy: { id: 'desc' },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            countryCode: true,
            ratePerMessage: true,
          },
        },
      },
    })

    let nextCursor = null
    let hasMore = false
    if (items.length > limit) {
      hasMore = true
      items.pop()
      nextCursor = items[items.length - 1].id
    }

    // Ambil statistik global resmi dari service tunggal (CategoryStats)
    const stats = await targetStatsService.getGlobalStats()

    return res.status(200).json({
      targets: items,
      nextCursor,
      hasMore,
      counters: stats,
      stats,
      totalCount: stats.total,
    })
  } catch (error) {
    console.error('Error listTargets:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar target', details: error.message })
  }
}

/**
 * POST /api/admin/targets
 * Tambah satu target
 */
/**
 * POST /api/admin/targets
 * Tambah satu target kontak (increment atomik CategoryStats di dalam transaksi Prisma)
 */
async function createTarget(req, res) {
  try {
    const { categoryId, phone: rawPhone, name, queueStatus = 'none', consentSource } = req.body

    if (!consentSource || typeof consentSource !== 'string' || !consentSource.trim()) {
      return res.status(400).json({ error: 'Sumber persetujuan (consentSource) wajib diisi' })
    }

    const phone = normalizePhone(rawPhone)
    if (!phone) {
      return res.status(400).json({ error: 'Nomor telepon tidak valid' })
    }

    // Cek apakah nomor sudah ada
    const existing = await prisma.target.findUnique({
      where: { phone },
    })
    if (existing) {
      if (existing.optOut) {
        return res.status(400).json({ error: 'Nomor ini telah memilih berhenti (opt-out) dan tidak dapat ditambahkan' })
      }
      return res.status(400).json({ error: 'Nomor telepon sudah terdaftar di database target' })
    }

    const parsedCatId = parseInt(categoryId, 10)
    if (isNaN(parsedCatId)) {
      return res.status(400).json({ error: 'Kategori kontak wajib dipilih' })
    }

    // Verifikasi kategori
    const category = await prisma.contactCategory.findUnique({
      where: { id: parsedCatId },
    })
    if (!category) {
      return res.status(400).json({ error: 'Kategori kontak tidak ditemukan' })
    }

    // Validasi kecocokan kode negara
    let countryWarning = null
    if (category.countryCode) {
      const cleanCountry = category.countryCode.replace(/\D/g, '')
      if (cleanCountry && !phone.startsWith(cleanCountry)) {
        // Cek SiteSetting import.rejectCountryMismatch
        const rejectSetting = await prisma.siteSetting.findUnique({
          where: { key: 'import.rejectCountryMismatch' },
        })
        const shouldReject = rejectSetting && (rejectSetting.value === 'true' || rejectSetting.value === true)
        if (shouldReject) {
          return res.status(400).json({
            error: `Nomor telepon tidak cocok dengan kode negara kategori (+${cleanCountry})`,
          })
        }
        countryWarning = `Nomor tidak berawalan kode negara kategori (+${cleanCountry})`
      }
    }

    // Simpan ke database dan update CategoryStats secara atomik di dalam satu transaksi
    const target = await prisma.$transaction(async (tx) => {
      const created = await tx.target.create({
        data: {
          categoryId: parsedCatId,
          phone,
          name: name || null,
          queueStatus,
          consentSource: consentSource.trim(),
          optOut: false,
        },
        include: {
          category: true,
        },
      })

      // Increment atomik CategoryStats
      await targetStatsService.updateCategoryStatsAtomic(tx, parsedCatId, {
        total: 1,
        [queueStatus]: 1,
      })

      return created
    })

    // Invalidate cache Redis & picu realtime stream
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_TARGET',
      target: phone,
      ipAddress: req.ip,
      status: 'success',
      details: `Menambahkan target kontak: ${phone} (${name || 'Tanpa Nama'}) ke kategori ${category.name}`,
    })

    return res.status(201).json({
      message: 'Target kontak berhasil ditambahkan',
      target,
      warning: countryWarning,
    })
  } catch (error) {
    console.error('Error createTarget:', error)
    return res.status(500).json({ error: 'Gagal menambahkan target', details: error.message })
  }
}

/**
 * PATCH /api/admin/targets/:id
 * Ubah target (pindah kategori / status / optOut atomik di dalam transaksi Prisma)
 */
async function updateTarget(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID target tidak valid' })

    const existing = await prisma.target.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Target tidak ditemukan' })

    const { name, categoryId, queueStatus, optOut, consentSource } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (consentSource) updateData.consentSource = consentSource
    if (optOut !== undefined) updateData.optOut = Boolean(optOut)
    if (queueStatus !== undefined) updateData.queueStatus = queueStatus
    if (categoryId !== undefined) updateData.categoryId = parseInt(categoryId, 10)

    const newCatId = updateData.categoryId !== undefined ? updateData.categoryId : existing.categoryId
    const newStatus = updateData.queueStatus !== undefined ? updateData.queueStatus : existing.queueStatus
    const newOptOut = updateData.optOut !== undefined ? updateData.optOut : existing.optOut

    const catChanged = newCatId !== existing.categoryId
    const statusChanged = newStatus !== existing.queueStatus
    const optOutChanged = newOptOut !== existing.optOut

    // Eksekusi atomik dalam transaksi Prisma
    const updated = await prisma.$transaction(async (tx) => {
      if (catChanged) {
        // Kurangi di kategori lama
        const oldGroup = existing.optOut ? 'optOut' : existing.queueStatus
        await targetStatsService.updateCategoryStatsAtomic(tx, existing.categoryId, {
          total: -1,
          [oldGroup]: -1,
        })

        // Tambah di kategori baru
        const newGroup = newOptOut ? 'optOut' : newStatus
        await targetStatsService.updateCategoryStatsAtomic(tx, newCatId, {
          total: 1,
          [newGroup]: 1,
        })
      } else if (optOutChanged || statusChanged) {
        const deltas = {}
        if (optOutChanged) {
          if (newOptOut) {
            // Berubah menjadi optOut (tidak lagi dihitung di queueStatus tersisa)
            deltas[existing.queueStatus] = -1
            deltas.optOut = 1
          } else {
            // Berhenti optOut
            deltas.optOut = -1
            deltas[newStatus] = 1
          }
        } else if (statusChanged && !existing.optOut) {
          deltas[existing.queueStatus] = -1
          deltas[newStatus] = 1
        }

        if (Object.keys(deltas).length > 0) {
          await targetStatsService.updateCategoryStatsAtomic(tx, existing.categoryId, deltas)
        }
      }

      return await tx.target.update({
        where: { id },
        data: updateData,
        include: { category: true },
      })
    })

    // Invalidate cache Redis & picu realtime stream
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_TARGET',
      target: updated.phone,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui target kontak ID ${id} (${updated.phone})`,
    })

    return res.status(200).json({ message: 'Target berhasil diperbarui', target: updated })
  } catch (error) {
    console.error('Error updateTarget:', error)
    return res.status(500).json({ error: 'Gagal memperbarui target', details: error.message })
  }
}

/**
 * DELETE /api/admin/targets/:id
 * Hapus target kontak (decrement atomik CategoryStats di dalam transaksi Prisma)
 */
async function deleteTarget(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID target tidak valid' })

    const target = await prisma.target.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: 'Target tidak ditemukan' })

    // Hapus dan update CategoryStats di dalam transaksi Prisma yang sama
    await prisma.$transaction(async (tx) => {
      await tx.target.delete({ where: { id } })

      const group = target.optOut ? 'optOut' : target.queueStatus
      await targetStatsService.updateCategoryStatsAtomic(tx, target.categoryId, {
        total: -1,
        [group]: -1,
      })
    })

    // Invalidate cache Redis & picu realtime stream
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_TARGET',
      target: target.phone,
      ipAddress: req.ip,
      status: 'success',
      details: `Menghapus kontak target ${target.phone}`,
    })

    return res.status(200).json({ message: 'Target berhasil dihapus' })
  } catch (error) {
    console.error('Error deleteTarget:', error)
    return res.status(500).json({ error: 'Gagal menghapus target', details: error.message })
  }
}

/**
 * POST /api/admin/targets/import
 * Stream CSV / TXT, chunk 5000 createMany, auto-map kategori, SSE progress
 */
async function importTargets(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File CSV atau TXT wajib diunggah' })
    }

    const { consentConfirmed, consentAgreed, consentSource, categoryId } = req.body

    const isConfirmed =
      consentConfirmed === true ||
      consentConfirmed === 'true' ||
      consentAgreed === true ||
      consentAgreed === 'true'

    if (!isConfirmed) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      return res.status(400).json({
        error: 'Pernyataan persetujuan kepatuhan wajib dicentang (consentAgreed=true)',
      })
    }

    if (!consentSource || !consentSource.trim()) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'Sumber persetujuan (consentSource) wajib diisi' })
    }

    const defaultCategoryId = categoryId && categoryId !== 'auto' ? parseInt(categoryId, 10) : null
    const filePath = req.file.path

    // Jalankan impor file target
    const report = await processCsvImport({
      filePath,
      defaultCategoryId,
      consentSource: consentSource.trim(),
      adminId: req.user.id,
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'IMPORT_TARGETS',
      target: `${report.insertedCount} kontak`,
      ipAddress: req.ip,
      status: 'success',
      details: `Impor berkas (${req.file.originalname}) selesai. Masuk: ${report.insertedCount}, Duplikat/Invalid: ${report.duplicateOrInvalidCount}, OptOut: ${report.optOutSkippedCount}`,
    })

    return res.status(200).json({
      success: true,
      message: `Pemrosesan berkas ${req.file.originalname} selesai. ${report.insertedCount} kontak baru berhasil ditambahkan ke database.`,
      accepted: report.insertedCount,
      duplicates: report.duplicateOrInvalidCount,
      invalid: report.invalidCount || 0,
      optOutSkipped: report.optOutSkippedCount,
      mismatchCount: report.mismatchCount || 0,
      warnings: report.warnings || [],
      total: report.totalLines,
      rejectedData: report.rejectedData || [],
      fileName: req.file.originalname,
      sizeBytes: req.file.size,
    })
  } catch (error) {
    console.error('Error importTargets:', error)
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path)
      } catch {}
    }
    return res.status(500).json({ error: 'Gagal memproses impor file target', details: error.message })
  }
}

/**
 * POST /api/admin/targets/reset-queue
 * Reset antrean target per kategori atau filter (atomik CategoryStats di dalam transaksi Prisma)
 */
async function resetQueue(req, res) {
  try {
    const { categoryId, targetStatus = 'queued', fromStatus } = req.body

    const where = {}
    if (categoryId) {
      where.categoryId = parseInt(categoryId, 10)
    }
    if (fromStatus) {
      where.queueStatus = fromStatus
    } else {
      where.queueStatus = { in: ['failed', 'none', 'active'] }
    }
    where.optOut = false

    const updateResult = await prisma.$transaction(async (tx) => {
      // Ambil grup target yang terpengaruh
      const groups = await tx.target.groupBy({
        by: ['categoryId', 'queueStatus'],
        where,
        _count: { id: true },
      })

      const updated = await tx.target.updateMany({
        where,
        data: {
          queueStatus: targetStatus,
          lastError: null,
        },
      })

      // Update CategoryStats atomik untuk tiap grup
      for (const group of groups) {
        const count = group._count.id
        if (count > 0 && group.queueStatus !== targetStatus) {
          await targetStatsService.updateCategoryStatsAtomic(tx, group.categoryId, {
            [group.queueStatus]: -count,
            [targetStatus]: count,
          })
        }
      }

      return updated
    })

    // Invalidate cache Redis & picu realtime stream
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'RESET_QUEUE',
      target: `${updateResult.count} kontak`,
      ipAddress: req.ip,
      status: 'success',
      details: `Mereset antrean ${updateResult.count} kontak ke status '${targetStatus}' (Kategori: ${categoryId || 'Semua'})`,
    })

    return res.status(200).json({
      message: `Berhasil mereset status antrean ${updateResult.count} kontak ke '${targetStatus}'`,
      updatedCount: updateResult.count,
    })
  } catch (error) {
    console.error('Error resetQueue:', error)
    return res.status(500).json({ error: 'Gagal mereset antrean', details: error.message })
  }
}

/**
 * POST /api/admin/targets/bulk-delete
 * Aksi Massal Target: Hapus Semua Permanen, Jadikan Draft, atau Aktifkan ke Antrean
 * Memperbarui counter CategoryStats secara atomik di dalam transaksi Prisma
 */
async function bulkDeleteTargets(req, res) {
  try {
    const {
      action = 'delete', // 'delete' (permanen) | 'draft' (nonaktifkan/jadikan draft) | 'activate' (kembalikan ke antrean)
      scope = 'filter', // 'all' (seluruh target) | 'selected' (berdasarkan ids) | 'filter' (berdasarkan filter aktif)
      ids = [],
      filter = {},
      confirmText,
      confirmWord,
      password,
      categoryId,
      queueStatus,
      optOutOnly,
    } = req.body

    // 1. Validasi Keamanan untuk Tindakan Hapus Permanen
    if (action === 'delete') {
      const isConfirmed = confirmText === 'HAPUS' || confirmWord === 'HAPUS'
      if (!isConfirmed) {
        return res.status(400).json({
          error: 'Konfirmasi gagal. Wajib menyertakan kata konfirmasi "HAPUS"',
        })
      }

      if (!password) {
        return res.status(400).json({
          error: 'Kata sandi admin diperlukan untuk konfirmasi penghapusan permanen',
        })
      }

      // Verifikasi password admin
      const admin = await prisma.user.findUnique({ where: { id: req.user.id } })
      const isPasswordValid = await bcrypt.compare(password, admin.password)
      if (!isPasswordValid) {
        return res.status(403).json({ error: 'Kata sandi admin tidak sesuai' })
      }
    }

    // 2. Bangun Kriteria WHERE Berdasarkan Scope
    const where = {}

    if (scope === 'selected' && Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids.map((id) => parseInt(id, 10)) }
    } else if (scope === 'all') {
      // Seluruh target di kategori tertentu (jika dipilih) atau seluruh database
      const targetCatId = categoryId || filter.categoryId
      if (targetCatId && targetCatId !== 'all' && !isNaN(targetCatId)) {
        where.categoryId = parseInt(targetCatId, 10)
      }
    } else {
      // Scope 'filter'
      const targetCatId = categoryId || filter.categoryId
      if (targetCatId && targetCatId !== 'all' && !isNaN(targetCatId)) {
        where.categoryId = parseInt(targetCatId, 10)
      }
      const targetStatus = queueStatus || filter.status
      if (targetStatus && targetStatus !== 'all') {
        where.queueStatus = targetStatus
      }
      if (optOutOnly) {
        where.optOut = true
      }
      const q = filter.q
      if (q && q.trim()) {
        const cleanQ = q.trim().replace(/\D/g, '')
        if (cleanQ) {
          where.phone = { contains: cleanQ }
        }
      }
    }

    // 3. Eksekusi Atomik di dalam Transaksi Prisma
    let affectedCount = 0

    if (action === 'delete') {
      // --- HAPUS SEMUA PERMANEN ---
      affectedCount = await prisma.$transaction(async (tx) => {
        const groups = await tx.target.groupBy({
          by: ['categoryId', 'queueStatus', 'optOut'],
          where,
          _count: { id: true },
        })

        const delResult = await tx.target.deleteMany({ where })

        for (const group of groups) {
          const count = group._count.id
          if (count > 0) {
            const deltas = { total: -count }
            if (group.optOut) {
              deltas.optOut = -count
            } else {
              deltas[group.queueStatus] = -count
            }
            await targetStatsService.updateCategoryStatsAtomic(tx, group.categoryId, deltas)
          }
        }

        return delResult.count
      })
    } else if (action === 'draft') {
      // --- PINDAHKAN KE DRAFT (TIDAK AKTIF / HILANG DARI MEMBER DATA TERSISA) ---
      const draftWhere = { ...where, optOut: false, queueStatus: { not: 'draft' } }
      affectedCount = await prisma.$transaction(async (tx) => {
        const groups = await tx.target.groupBy({
          by: ['categoryId', 'queueStatus'],
          where: draftWhere,
          _count: { id: true },
        })

        const updResult = await tx.target.updateMany({
          where: draftWhere,
          data: { queueStatus: 'draft' },
        })

        for (const group of groups) {
          const count = group._count.id
          if (count > 0) {
            // Kurangi status lama, tambah counter draft. Total kontak tetap sama.
            await targetStatsService.updateCategoryStatsAtomic(tx, group.categoryId, {
              [group.queueStatus]: -count,
              draft: count,
            })
          }
        }

        return updResult.count
      })
    } else if (action === 'activate') {
      // --- AKTIFKAN DARI DRAFT KEMBALI KE ANTREAN (KEMBALI KE NONE/SIAP KIRIM) ---
      const activateWhere = { ...where, queueStatus: 'draft' }
      affectedCount = await prisma.$transaction(async (tx) => {
        const groups = await tx.target.groupBy({
          by: ['categoryId'],
          where: activateWhere,
          _count: { id: true },
        })

        const updResult = await tx.target.updateMany({
          where: activateWhere,
          data: { queueStatus: 'none' },
        })

        for (const group of groups) {
          const count = group._count.id
          if (count > 0) {
            // Kurangi draft, tambah none (siap kirim)
            await targetStatsService.updateCategoryStatsAtomic(tx, group.categoryId, {
              draft: -count,
              none: count,
            })
          }
        }

        return updResult.count
      })
    } else {
      return res.status(400).json({ error: `Aksi tidak dikenal: '${action}'` })
    }

    // 4. Invalidate Redis Cache & Picu Realtime Stream SSE (pool.stats terkirim ke member & admin)
    await targetStatsService.invalidateStatsCache()

    // 5. Catat Log Audit
    const actionLabel =
      action === 'delete'
        ? 'BULK_DELETE_TARGETS'
        : action === 'draft'
        ? 'BULK_DRAFT_TARGETS'
        : 'BULK_ACTIVATE_TARGETS'

    const detailsMsg =
      action === 'delete'
        ? `Menghapus massal ${affectedCount} kontak target secara permanen`
        : action === 'draft'
        ? `Memindahkan ${affectedCount} kontak target ke Draft (dinonaktifkan)`
        : `Mengaktifkan ${affectedCount} kontak target dari Draft kembali ke Antrean`

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: actionLabel,
      target: `${affectedCount} kontak`,
      ipAddress: req.ip,
      status: 'success',
      details: `${detailsMsg}. Scope: ${scope}, Filter: ${JSON.stringify(where)}`,
    })

    const successMessage =
      action === 'delete'
        ? `Berhasil menghapus permanen ${affectedCount} kontak target. Data tersisa di dashboard member telah diperbarui.`
        : action === 'draft'
        ? `Berhasil memindahkan ${affectedCount} kontak target ke Draft. Kontak tersebut tidak lagi aktif di dashboard member.`
        : `Berhasil mengaktifkan kembali ${affectedCount} kontak target ke antrean siap kirim.`

    return res.status(200).json({
      success: true,
      message: successMessage,
      action,
      affectedCount,
      deletedCount: action === 'delete' ? affectedCount : 0,
    })
  } catch (error) {
    console.error('Error bulkDeleteTargets:', error)
    return res.status(500).json({ error: 'Gagal memproses aksi massal target', details: error.message })
  }
}

/**
 * GET /api/admin/targets/export
 * Streaming CSV gzip
 */
async function exportTargets(req, res) {
  try {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : undefined
    const status = req.query.status

    const where = {}
    if (categoryId) where.categoryId = categoryId
    if (status && status !== 'all') where.queueStatus = status

    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="targets-export-${Date.now()}.csv.gz"`,
      'X-Accel-Buffering': 'no',
    })

    const gzip = zlib.createGzip()
    gzip.pipe(res)

    // Header CSV
    gzip.write('id,categoryId,phone,name,queueStatus,optOut,consentSource,createdAt\n')

    // Stream read dari database menggunakan cursor batch
    const BATCH_SIZE = 1000
    let lastId = 0
    let totalExported = 0

    while (true) {
      const batchWhere = { ...where, id: { gt: lastId } }
      const rows = await prisma.target.findMany({
        where: batchWhere,
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          categoryId: true,
          phone: true,
          name: true,
          queueStatus: true,
          optOut: true,
          consentSource: true,
          createdAt: true,
        },
      })

      if (rows.length === 0) break

      for (const row of rows) {
        const cleanName = (row.name || '').replace(/[",\n\r]/g, ' ')
        const cleanConsent = (row.consentSource || '').replace(/[",\n\r]/g, ' ')
        const line = `${row.id},${row.categoryId},"${row.phone}","${cleanName}",${row.queueStatus},${row.optOut},"${cleanConsent}",${row.createdAt.toISOString()}\n`
        gzip.write(line)
        lastId = row.id
        totalExported++
      }
    }

    gzip.end()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'EXPORT_TARGETS',
      target: `${totalExported} kontak`,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengekspor ${totalExported} kontak ke CSV gzip`,
    })
  } catch (error) {
    console.error('Error exportTargets:', error)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Gagal mengekspor data target', details: error.message })
    }
  }
}

/**
 * POST /api/admin/targets/stats/recalculate
 * Rekonsiliasi statistik Target vs CategoryStats
 * Izin: target.manage, rate limited, dicatat ke ActivityLog
 */
async function recalculateStats(req, res) {
  try {
    const report = await targetStatsService.recalculateStats()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'RECALCULATE_TARGET_STATS',
      target: 'CategoryStats',
      ipAddress: req.ip,
      status: 'success',
      details: `Rekonsiliasi statistik target selesai. Kategori diperbaiki: ${report.differencesCount}, Total target: ${report.totalReconciled}`,
    })

    return res.status(200).json({
      success: true,
      message: 'Rekonsiliasi statistik target berhasil diselesaikan',
      report,
    })
  } catch (error) {
    console.error('Error recalculateStats:', error)
    return res.status(500).json({ error: 'Gagal melakukan rekonsiliasi statistik', details: error.message })
  }
}

module.exports = {
  listTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  uploadCsv,
  importTargets,
  resetQueue,
  bulkDeleteTargets,
  exportTargets,
  recalculateStats,
}
