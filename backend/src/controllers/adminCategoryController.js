const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const { publishAdminEvent } = require('../utils/sseManager')
const targetStatsService = require('../services/targetStats.service')

const categorySchema = z.object({
  name: z.string().min(2, 'Nama kategori minimal 2 karakter').max(50),
  countryCode: z
    .string()
    .regex(/^\d{1,4}$/, 'Kode negara harus berupa 1-4 digit angka')
    .optional()
    .nullable(),
  ratePerMessage: z.number().int().min(0, 'Tarif per pesan tidak boleh negatif').default(0),
  isActive: z.boolean().optional().default(true),
})

/**
 * GET /api/admin/categories
 * Mengambil seluruh kategori kontak dengan statistik dari CategoryStats
 */
async function listCategories(req, res) {
  try {
    const categories = await prisma.contactCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        stats: true,
        _count: {
          select: {
            blastCampaigns: true,
          },
        },
      },
    })

    return res.status(200).json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        countryCode: c.countryCode,
        ratePerMessage: c.ratePerMessage,
        totalContacts: c.stats?.total || 0,
        isActive: c.isActive,
        stats: c.stats || null,
        campaignsCount: c._count.blastCampaigns,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    })
  } catch (error) {
    console.error('Error in listCategories:', error)
    return res.status(500).json({ error: 'Gagal memuat kategori kontak', details: error.message })
  }
}

/**
 * GET /api/admin/categories/:id
 */
async function getCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kategori tidak valid' })

    const category = await prisma.contactCategory.findUnique({
      where: { id },
      include: {
        stats: true,
        _count: {
          select: {
            blastCampaigns: true,
          },
        },
      },
    })

    if (!category) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' })
    }

    return res.status(200).json({
      category: {
        ...category,
        totalContacts: category.stats?.total || 0,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat detail kategori', details: error.message })
  }
}

/**
 * POST /api/admin/categories
 */
async function createCategory(req, res) {
  try {
    const validated = categorySchema.parse(req.body)

    const existing = await prisma.contactCategory.findUnique({
      where: { name: validated.name },
    })
    if (existing) {
      return res.status(400).json({ error: `Kategori dengan nama '${validated.name}' sudah ada` })
    }

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.contactCategory.create({
        data: {
          name: validated.name,
          countryCode: validated.countryCode ? validated.countryCode.replace(/\D/g, '') : null,
          ratePerMessage: validated.ratePerMessage,
          isActive: validated.isActive !== undefined ? validated.isActive : true,
          totalContacts: 0,
        },
      })

      // Inisialisasi CategoryStats dengan nilai 0
      await tx.categoryStats.create({
        data: {
          categoryId: created.id,
          total: 0,
          none: 0,
          queued: 0,
          active: 0,
          success: 0,
          failed: 0,
          optOut: 0,
        },
      })

      return created
    })

    // Invalidate Redis cache & picu update realtime
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_CATEGORY',
      target: category.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Membuat kategori kontak: ${category.name} (Kode Negara: +${category.countryCode || '-'}, Tarif: Rp ${category.ratePerMessage})`,
    })

    return res.status(201).json({
      message: 'Kategori berhasil dibuat',
      category,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const msg = error.issues?.[0]?.message || error.errors?.[0]?.message || error.message
      return res.status(400).json({ error: msg })
    }
    return res.status(500).json({ error: 'Gagal membuat kategori', details: error.message })
  }
}

/**
 * PATCH /api/admin/categories/:id
 */
async function updateCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kategori tidak valid' })

    const validated = categorySchema.partial().parse(req.body)

    if (validated.name) {
      const existing = await prisma.contactCategory.findFirst({
        where: { name: validated.name, NOT: { id } },
      })
      if (existing) {
        return res.status(400).json({ error: `Nama kategori '${validated.name}' sudah digunakan` })
      }
    }

    const updated = await prisma.contactCategory.update({
      where: { id },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.countryCode !== undefined && {
          countryCode: validated.countryCode ? validated.countryCode.replace(/\D/g, '') : null,
        }),
        ...(validated.ratePerMessage !== undefined && { ratePerMessage: validated.ratePerMessage }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
      },
      include: { stats: true },
    })

    // Invalidate cache Redis & picu update realtime
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_CATEGORY',
      target: updated.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui kategori kontak: ${updated.name} (Aktif: ${updated.isActive})`,
    })

    return res.status(200).json({
      message: 'Kategori berhasil diperbarui',
      category: {
        ...updated,
        totalContacts: updated.stats?.total || 0,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const msg = error.issues?.[0]?.message || error.errors?.[0]?.message || error.message
      return res.status(400).json({ error: msg })
    }
    return res.status(500).json({ error: 'Gagal memperbarui kategori', details: error.message })
  }
}

/**
 * DELETE /api/admin/categories/:id
 * Hapus hanya jika kosong atau dengan pemindahan kontak (atomik CategoryStats)
 */
async function deleteCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kategori tidak valid' })

    const category = await prisma.contactCategory.findUnique({
      where: { id },
      include: { stats: true },
    })
    if (!category) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' })
    }

    const contactCount = await prisma.target.count({
      where: { categoryId: id },
    })

    const moveToCategoryId = req.body.moveToCategoryId || req.query.moveToCategoryId

    if (contactCount > 0) {
      if (!moveToCategoryId) {
        return res.status(400).json({
          error: `Kategori '${category.name}' memiliki ${contactCount} kontak. Hapus hanya jika kosong atau tentukan 'moveToCategoryId' untuk memindahkan kontak.`,
          contactCount,
        })
      }

      const targetCategory = await prisma.contactCategory.findUnique({
        where: { id: parseInt(moveToCategoryId, 10) },
      })
      if (!targetCategory || targetCategory.id === id) {
        return res.status(400).json({ error: 'Kategori tujuan pemindahan kontak tidak valid' })
      }

      // Pindahkan semua kontak ke kategori tujuan di dalam transaksi Prisma
      await prisma.$transaction(async (tx) => {
        // Ambil data status yang sedang ada di kategori yang akan dihapus
        const groups = await tx.target.groupBy({
          by: ['queueStatus', 'optOut'],
          where: { categoryId: id },
          _count: { id: true },
        })

        await tx.target.updateMany({
          where: { categoryId: id },
          data: { categoryId: targetCategory.id },
        })

        // Tambah ke targetCategory
        for (const g of groups) {
          const cnt = g._count.id
          const deltas = { total: cnt }
          if (g.optOut) deltas.optOut = cnt
          else deltas[g.queueStatus] = cnt
          await targetStatsService.updateCategoryStatsAtomic(tx, targetCategory.id, deltas)
        }

        // Hapus kategori lama (Cascade akan menghapus CategoryStats milik kategori ini)
        await tx.contactCategory.delete({
          where: { id },
        })
      })
    } else {
      // Hapus kategori kosong
      await prisma.contactCategory.delete({
        where: { id },
      })
    }

    // Invalidate Redis cache & picu update realtime
    await targetStatsService.invalidateStatsCache()

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_CATEGORY',
      target: category.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Menghapus kategori: ${category.name} (Dipindahkan ${contactCount} kontak ke ${moveToCategoryId || 'tidak ada'})`,
    })

    return res.status(200).json({
      message: 'Kategori berhasil dihapus',
      movedContacts: contactCount,
    })
  } catch (error) {
    console.error('Error in deleteCategory:', error)
    return res.status(500).json({ error: 'Gagal menghapus kategori', details: error.message })
  }
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
}

