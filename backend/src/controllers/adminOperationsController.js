const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity, getClientIp } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')

// ============================================================
// 1. WITHDRAWAL PRESETS CRUD (Izin: withdrawPreset.manage)
// ============================================================

const presetSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Nominal wajib angka' })
    .int('Nominal harus bilangan bulat')
    .min(1000, 'Nominal minimal Rp1.000')
    .refine((val) => val % 1000 === 0, {
      message: 'Nominal harus kelipatan 1000 (contoh: 20000, 50000)',
    }),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
})

async function listPresets(req, res) {
  try {
    const presets = await prisma.withdrawalPreset.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return res.status(200).json({ presets })
  } catch (error) {
    console.error('Error in listPresets:', error)
    return res.status(500).json({ error: 'Gagal mengambil daftar preset penarikan' })
  }
}

async function createPreset(req, res) {
  try {
    const parse = presetSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const { amount, sortOrder, isActive } = parse.data

    const existing = await prisma.withdrawalPreset.findUnique({
      where: { amount },
    })
    if (existing) {
      return res.status(409).json({ error: `Preset nominal Rp${amount.toLocaleString('id-ID')} sudah ada` })
    }

    const preset = await prisma.withdrawalPreset.create({
      data: { amount, sortOrder, isActive },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_WITHDRAW_PRESET',
      target: `Preset Rp${amount}`,
      details: `Menambah preset penarikan Rp${amount}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({ message: 'Preset penarikan berhasil dibuat', preset })
  } catch (error) {
    console.error('Error in createPreset:', error)
    return res.status(500).json({ error: 'Gagal membuat preset penarikan' })
  }
}

async function updatePreset(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID preset tidak valid' })

    const parse = presetSchema.partial().safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const existing = await prisma.withdrawalPreset.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Preset tidak ditemukan' })

    const { amount, sortOrder, isActive } = parse.data

    if (amount && amount !== existing.amount) {
      const conflict = await prisma.withdrawalPreset.findUnique({ where: { amount } })
      if (conflict) {
        return res.status(409).json({ error: `Preset nominal Rp${amount.toLocaleString('id-ID')} sudah digunakan` })
      }
    }

    const updated = await prisma.withdrawalPreset.update({
      where: { id },
      data: {
        ...(amount !== undefined ? { amount } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_WITHDRAW_PRESET',
      target: `Preset #${id}`,
      details: `Memperbarui preset penarikan #${id}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Preset penarikan berhasil diperbarui', preset: updated })
  } catch (error) {
    console.error('Error in updatePreset:', error)
    return res.status(500).json({ error: 'Gagal memperbarui preset penarikan' })
  }
}

async function deletePreset(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID preset tidak valid' })

    const existing = await prisma.withdrawalPreset.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Preset tidak ditemukan' })

    await prisma.withdrawalPreset.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_WITHDRAW_PRESET',
      target: `Preset #${id}`,
      details: `Menghapus preset penarikan Rp${existing.amount}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Preset penarikan berhasil dihapus' })
  } catch (error) {
    console.error('Error in deletePreset:', error)
    return res.status(500).json({ error: 'Gagal menghapus preset penarikan' })
  }
}

// ============================================================
// 2. WITHDRAWAL SETTINGS (Izin: withdrawSetting.manage)
// ============================================================

const settingsSchema = z
  .object({
    min: z.number().int().min(1000, 'Minimal penarikan minimal Rp1.000'),
    max: z.number().int().min(1000, 'Maksimal penarikan minimal Rp1.000'),
    allowCustom: z.boolean(),
  })
  .refine((data) => data.min <= data.max, {
    message: 'Nominal minimum harus lebih kecil atau sama dengan nominal maksimum',
  })

async function getWithdrawSettings(req, res) {
  try {
    const [minSetting, maxSetting, customSetting] = await Promise.all([
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.min' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.max' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.allowCustom' } }),
    ])

    return res.status(200).json({
      min: minSetting ? parseInt(minSetting.value, 10) : 20000,
      max: maxSetting ? parseInt(maxSetting.value, 10) : 5000000,
      allowCustom: customSetting ? customSetting.value === 'true' : true,
    })
  } catch (error) {
    console.error('Error in getWithdrawSettings:', error)
    return res.status(500).json({ error: 'Gagal mengambil pengaturan penarikan' })
  }
}

async function updateWithdrawSettings(req, res) {
  try {
    const parse = settingsSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const { min, max, allowCustom } = parse.data

    await Promise.all([
      prisma.siteSetting.upsert({
        where: { key: 'withdraw.min' },
        update: { value: min.toString() },
        create: { key: 'withdraw.min', value: min.toString() },
      }),
      prisma.siteSetting.upsert({
        where: { key: 'withdraw.max' },
        update: { value: max.toString() },
        create: { key: 'withdraw.max', value: max.toString() },
      }),
      prisma.siteSetting.upsert({
        where: { key: 'withdraw.allowCustom' },
        update: { value: allowCustom ? 'true' : 'false' },
        create: { key: 'withdraw.allowCustom', value: allowCustom ? 'true' : 'false' },
      }),
    ])

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_WITHDRAW_SETTINGS',
      target: 'Withdraw Settings',
      details: `Min: Rp${min}, Max: Rp${max}, Custom: ${allowCustom}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Pengaturan penarikan berhasil diperbarui',
      settings: { min, max, allowCustom },
    })
  } catch (error) {
    console.error('Error in updateWithdrawSettings:', error)
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan penarikan' })
  }
}

// ============================================================
// 3. CONTACT BATCHES CRUD & CSV IMPORT (Izin: contactPool.manage)
// ============================================================

const batchSchema = z.object({
  title: z.string().min(1, 'Judul batch wajib diisi'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
})

async function listBatches(req, res) {
  try {
    const batches = await prisma.contactBatch.findMany({
      include: {
        _count: {
          select: { contacts: true, slots: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.status(200).json({ batches })
  } catch (error) {
    console.error('Error in listBatches:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar batch kontak' })
  }
}

async function createBatch(req, res) {
  try {
    const parse = batchSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const { title, description, status } = parse.data

    const batch = await prisma.contactBatch.create({
      data: {
        title,
        description,
        status,
        createdById: req.user.id,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_CONTACT_BATCH',
      target: `Batch #${batch.id}`,
      details: `Membuat batch kontak: ${title}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({ message: 'Batch kontak berhasil dibuat', batch })
  } catch (error) {
    console.error('Error in createBatch:', error)
    return res.status(500).json({ error: 'Gagal membuat batch kontak' })
  }
}

async function getBatch(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID batch tidak valid' })

    const batch = await prisma.contactBatch.findUnique({
      where: { id },
      include: {
        contacts: {
          take: 100,
          select: { id: true, name: true, phone: true, createdAt: true },
        },
        slots: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
      },
    })

    if (!batch) return res.status(404).json({ error: 'Batch tidak ditemukan' })

    return res.status(200).json({ batch })
  } catch (error) {
    console.error('Error in getBatch:', error)
    return res.status(500).json({ error: 'Gagal memuat detail batch' })
  }
}

async function updateBatch(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID batch tidak valid' })

    const parse = batchSchema.partial().safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const existing = await prisma.contactBatch.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Batch tidak ditemukan' })

    const updated = await prisma.contactBatch.update({
      where: { id },
      data: parse.data,
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_CONTACT_BATCH',
      target: `Batch #${id}`,
      details: `Memperbarui batch kontak #${id}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Batch kontak berhasil diperbarui', batch: updated })
  } catch (error) {
    console.error('Error in updateBatch:', error)
    return res.status(500).json({ error: 'Gagal memperbarui batch kontak' })
  }
}

async function deleteBatch(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID batch tidak valid' })

    const existing = await prisma.contactBatch.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Batch tidak ditemukan' })

    await prisma.contactBatch.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_CONTACT_BATCH',
      target: `Batch #${id}`,
      details: `Menghapus batch kontak: ${existing.title}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Batch kontak berhasil dihapus' })
  } catch (error) {
    console.error('Error in deleteBatch:', error)
    return res.status(500).json({ error: 'Gagal menghapus batch kontak' })
  }
}

/**
 * Normalisasi nomor HP ke format standar 628xxxx
 */
function normalizeIndonesianPhone(raw) {
  if (!raw) return null
  let digits = raw.toString().replace(/[^0-9]/g, '')
  if (!digits) return null

  if (digits.startsWith('08')) {
    digits = '628' + digits.slice(2)
  } else if (digits.startsWith('8')) {
    digits = '628' + digits.slice(1)
  } else if (digits.startsWith('+62')) {
    digits = digits.slice(1)
  }

  // Validasi panjang nomor Indonesia (antara 10 dan 16 digit)
  if (digits.length < 10 || digits.length > 16) return null
  return digits
}

/**
 * POST /api/admin/contact-batches/:id/import
 * Impor CSV kontak ke batch dengan normalisasi 08xx -> 628xx dan deduplikasi
 */
async function importBatchContacts(req, res) {
  try {
    const batchId = parseInt(req.params.id, 10)
    if (isNaN(batchId)) return res.status(400).json({ error: 'ID batch tidak valid' })

    const batch = await prisma.contactBatch.findUnique({ where: { id: batchId } })
    if (!batch) return res.status(404).json({ error: 'Batch tidak ditemukan' })

    const { csvData, contacts: directList } = req.body

    let rawRows = []

    if (csvData && typeof csvData === 'string') {
      // Batasi ukuran CSV (maks 2MB)
      if (Buffer.byteLength(csvData, 'utf8') > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Ukuran CSV melebihi batas maksimum 2MB' })
      }

      const lines = csvData.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length > 5000) {
        return res.status(400).json({ error: 'Jumlah baris CSV melebihi batas maksimum 5000 baris' })
      }

      // Deteksi header jika baris pertama mengandung huruf bukan angka
      const startIndex = lines[0].toLowerCase().includes('phone') || lines[0].toLowerCase().includes('telepon') ? 1 : 0

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]/).map((p) => p.trim())
        if (parts.length >= 2) {
          rawRows.push({ name: parts[0], phone: parts[1] })
        } else if (parts.length === 1) {
          rawRows.push({ name: null, phone: parts[0] })
        }
      }
    } else if (Array.isArray(directList)) {
      rawRows = directList.slice(0, 5000)
    } else {
      return res.status(400).json({ error: 'Data CSV atau daftar kontak wajib disertakan' })
    }

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada baris kontak yang valid untuk diimpor' })
    }

    // Normalisasi dan buang duplikat dalam upload
    const uniquePhonesMap = new Map()

    for (const row of rawRows) {
      const normalizedPhone = normalizeIndonesianPhone(row.phone)
      if (normalizedPhone && !uniquePhonesMap.has(normalizedPhone)) {
        uniquePhonesMap.set(normalizedPhone, {
          batchId,
          phone: normalizedPhone,
          name: (row.name || '').trim() || null,
        })
      }
    }

    const contactsToInsert = Array.from(uniquePhonesMap.values())

    if (contactsToInsert.length === 0) {
      return res.status(400).json({ error: 'Tidak ada nomor telepon valid setelah normalisasi' })
    }

    // Bulk insert dengan skipDuplicates
    const insertResult = await prisma.poolContact.createMany({
      data: contactsToInsert,
      skipDuplicates: true,
    })

    // Hitung ulang total kontak pada batch
    const totalContactsCount = await prisma.poolContact.count({ where: { batchId } })

    await prisma.contactBatch.update({
      where: { id: batchId },
      data: { totalContacts: totalContactsCount },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'IMPORT_BATCH_CONTACTS',
      target: `Batch #${batchId}`,
      details: `Mengimpor ${insertResult.count} kontak baru ke batch ${batch.title}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Impor kontak berhasil',
      importedCount: insertResult.count,
      totalContacts: totalContactsCount,
    })
  } catch (error) {
    console.error('Error in importBatchContacts:', error)
    return res.status(500).json({ error: 'Gagal mengimpor kontak ke batch' })
  }
}

// ============================================================
// 4. TEAM MEMBERS CRUD (Izin: team.manage)
// ============================================================

const teamSchema = z.object({
  name: z.string().min(1, 'Nama anggota tim wajib diisi'),
  roleTitle: z.string().min(1, 'Jabatan/peran wajib diisi'),
  photoUrl: z.string().optional(),
  contact: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
})

async function listTeam(req, res) {
  try {
    const team = await prisma.teamMember.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return res.status(200).json({ team })
  } catch (error) {
    console.error('Error in listTeam:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar anggota tim' })
  }
}

async function createTeamMember(req, res) {
  try {
    const parse = teamSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const member = await prisma.teamMember.create({
      data: parse.data,
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_TEAM_MEMBER',
      target: member.name,
      details: `Menambah anggota tim: ${member.name} (${member.roleTitle})`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({ message: 'Anggota tim berhasil ditambahkan', member })
  } catch (error) {
    console.error('Error in createTeamMember:', error)
    return res.status(500).json({ error: 'Gagal menambah anggota tim' })
  }
}

async function updateTeamMember(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID anggota tim tidak valid' })

    const parse = teamSchema.partial().safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: getZodErrorMessage(parse.error) })
    }

    const existing = await prisma.teamMember.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Anggota tim tidak ditemukan' })

    const updated = await prisma.teamMember.update({
      where: { id },
      data: parse.data,
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_TEAM_MEMBER',
      target: updated.name,
      details: `Memperbarui anggota tim: ${updated.name}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Anggota tim berhasil diperbarui', member: updated })
  } catch (error) {
    console.error('Error in updateTeamMember:', error)
    return res.status(500).json({ error: 'Gagal memperbarui anggota tim' })
  }
}

async function deleteTeamMember(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID anggota tim tidak valid' })

    const existing = await prisma.teamMember.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Anggota tim tidak ditemukan' })

    await prisma.teamMember.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_TEAM_MEMBER',
      target: existing.name,
      details: `Menghapus anggota tim: ${existing.name}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Anggota tim berhasil dihapus' })
  } catch (error) {
    console.error('Error in deleteTeamMember:', error)
    return res.status(500).json({ error: 'Gagal menghapus anggota tim' })
  }
}

module.exports = {
  listPresets,
  createPreset,
  updatePreset,
  deletePreset,
  getWithdrawSettings,
  updateWithdrawSettings,
  listBatches,
  createBatch,
  getBatch,
  updateBatch,
  deleteBatch,
  importBatchContacts,
  listTeam,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
}
