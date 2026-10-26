/**
 * Controller Operasional Staf untuk WhatsApp Blast & Pengaturan Kampanye
 * Endpoint dilindungi aud=staff + requirePermission dan dicatat ke ActivityLog.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity, getClientIp } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')

// Direktori penyimpanan file kampanye
const UPLOAD_DIR = path.join(__dirname, '../../uploads/campaign')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Multer memory storage untuk validasi magic bytes sebelum disimpan ke disk
const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // Maksimal 2 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Format file tidak didukung. Hanya JPEG, PNG, dan WEBP yang diizinkan.'))
    }
  },
})

/**
 * Validasi Magic Bytes Buffer Gambar
 * @param {Buffer} buffer
 * @returns {string|null} ekstensi file yang valid ('.jpg', '.png', '.webp') atau null
 */
function validateImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return null

  // JPEG / JPG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg'
  }

  // PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png'
  }

  // WEBP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return '.webp'
  }

  return null
}

/**
 * Middleware untuk menyimpan file upload setelah lolos verifikasi magic bytes
 */
async function processCampaignImage(req, res, next) {
  if (!req.file) {
    return next()
  }

  try {
    const ext = validateImageMagicBytes(req.file.buffer)
    if (!ext) {
      return res.status(400).json({
        error: 'File gambar rusak atau ekstensi tidak sesuai dengan isi berkas (magic bytes invalid).',
      })
    }

    const randomName = `${crypto.randomBytes(16).toString('hex')}${ext}`
    const targetPath = path.join(UPLOAD_DIR, randomName)

    await fs.promises.writeFile(targetPath, req.file.buffer)
    req.file.savedUrl = `/media/campaign/${randomName}`
    next()
  } catch (err) {
    console.error('Error in processCampaignImage:', err)
    return res.status(500).json({ error: 'Gagal memproses dan menyimpan berkas gambar kampanye' })
  }
}

// ============================================================
// 1. CRUD BLAST CAMPAIGNS (Izin: blastCampaign.manage)
// ============================================================

/**
 * Mengisi tugas pending (BlastTask) untuk seluruh kontak pada batch jika belum terisi
 */
async function populateCampaignTasks(campaignId, batchId) {
  const contacts = await prisma.poolContact.findMany({
    where: { batchId },
    select: { id: true },
  })

  if (contacts.length === 0) return 0

  const taskData = contacts.map((c) => ({
    campaignId,
    contactId: c.id,
    status: 'pending',
  }))

  const result = await prisma.blastTask.createMany({
    data: taskData,
    skipDuplicates: true,
  })

  return result.count
}

async function listCampaigns(req, res) {
  try {
    const campaigns = await prisma.blastCampaign.findMany({
      include: {
        batch: {
          select: { id: true, title: true, totalContacts: true, status: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { participations: true, tasks: true },
        },
      },
      orderBy: { id: 'desc' },
    })

    // Hitung ringkasan status tugas untuk tiap kampanye
    const campaignIds = campaigns.map((c) => c.id)
    const taskStats = await prisma.blastTask.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaignIds } },
      _count: true,
    })

    const statsMap = {}
    for (const stat of taskStats) {
      if (!statsMap[stat.campaignId]) statsMap[stat.campaignId] = {}
      statsMap[stat.campaignId][stat.status] = stat._count
    }

    const result = campaigns.map((c) => ({
      ...c,
      taskStats: statsMap[c.id] || { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 },
    }))

    return res.status(200).json({ campaigns: result })
  } catch (error) {
    console.error('Error in listCampaigns:', error)
    return res.status(500).json({ error: 'Gagal mengambil daftar kampanye blast' })
  }
}

async function getCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const campaign = await prisma.blastCampaign.findUnique({
      where: { id },
      include: {
        batch: true,
        createdBy: { select: { id: true, name: true, email: true } },
        participations: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            device: { select: { id: true, phone: true, status: true } },
          },
        },
      },
    })

    if (!campaign) return res.status(404).json({ error: 'Kampanye blast tidak ditemukan' })

    const taskStats = await prisma.blastTask.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    })

    const stats = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 }
    for (const s of taskStats) {
      stats[s.status] = s._count
    }

    return res.status(200).json({ campaign, taskStats: stats })
  } catch (error) {
    console.error('Error in getCampaign:', error)
    return res.status(500).json({ error: 'Gagal mengambil detail kampanye blast' })
  }
}

async function createCampaign(req, res) {
  try {
    const { title, caption, buttonLabel, buttonUrl, batchId, status, startAt, endAt } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Judul kampanye wajib diisi' })
    }
    if (!caption || !caption.trim()) {
      return res.status(400).json({ error: 'Caption kampanye wajib diisi' })
    }

    const parsedBatchId = parseInt(batchId, 10)
    if (isNaN(parsedBatchId)) {
      return res.status(400).json({ error: 'Batch kontak wajib dipilih' })
    }

    const batch = await prisma.contactBatch.findUnique({
      where: { id: parsedBatchId },
    })
    if (!batch) {
      return res.status(404).json({ error: 'Batch kontak tidak ditemukan' })
    }

    let imageUrl = req.file?.savedUrl || req.body.imageUrl
    if (!imageUrl) {
      imageUrl = '/media/campaign/default_profile.png'
    }

    const campaignStatus = status && ['draft', 'active', 'paused'].includes(status) ? status : 'draft'

    const campaign = await prisma.blastCampaign.create({
      data: {
        title: title.trim(),
        caption: caption.trim(),
        buttonLabel: buttonLabel ? buttonLabel.trim() : null,
        buttonUrl: buttonUrl ? buttonUrl.trim() : null,
        batchId: parsedBatchId,
        imageUrl,
        status: campaignStatus,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        createdById: req.user.id,
      },
      include: { batch: true },
    })

    // Jika langsung aktif, otomatis isi tugas dari batch
    if (campaignStatus === 'active') {
      await populateCampaignTasks(campaign.id, parsedBatchId)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_BLAST_CAMPAIGN',
      target: campaign.title,
      details: `Membuat kampanye blast: ${campaign.title} (Batch ID: ${parsedBatchId})`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({
      message: 'Kampanye blast berhasil dibuat',
      campaign,
    })
  } catch (error) {
    console.error('Error in createCampaign:', error)
    return res.status(500).json({ error: 'Gagal membuat kampanye blast' })
  }
}

async function updateCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const existing = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Kampanye blast tidak ditemukan' })

    const { title, caption, buttonLabel, buttonUrl, batchId, status, startAt, endAt } = req.body

    const updateData = {}
    if (title !== undefined) updateData.title = title.trim()
    if (caption !== undefined) updateData.caption = caption.trim()
    if (buttonLabel !== undefined) updateData.buttonLabel = buttonLabel ? buttonLabel.trim() : null
    if (buttonUrl !== undefined) updateData.buttonUrl = buttonUrl ? buttonUrl.trim() : null

    if (req.file?.savedUrl) {
      updateData.imageUrl = req.file.savedUrl
    } else if (req.body.imageUrl) {
      updateData.imageUrl = req.body.imageUrl
    }

    let targetBatchId = existing.batchId
    if (batchId !== undefined) {
      const parsedBatchId = parseInt(batchId, 10)
      if (isNaN(parsedBatchId)) {
        return res.status(400).json({ error: 'Batch kontak tidak valid' })
      }
      targetBatchId = parsedBatchId
      updateData.batchId = targetBatchId
    }

    if (status !== undefined && ['draft', 'active', 'paused', 'ended'].includes(status)) {
      updateData.status = status
    }

    if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null
    if (endAt !== undefined) updateData.endAt = endAt ? new Date(endAt) : null

    const updated = await prisma.blastCampaign.update({
      where: { id },
      data: updateData,
      include: { batch: true },
    })

    // Jika status diaktifkan, pastikan tugas terisi
    if (updated.status === 'active') {
      await populateCampaignTasks(updated.id, updated.batchId)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_BLAST_CAMPAIGN',
      target: updated.title,
      details: `Memperbarui kampanye blast: ${updated.title} (Status: ${updated.status})`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Kampanye blast berhasil diperbarui',
      campaign: updated,
    })
  } catch (error) {
    console.error('Error in updateCampaign:', error)
    return res.status(500).json({ error: 'Gagal memperbarui kampanye blast' })
  }
}

async function deleteCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const existing = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Kampanye blast tidak ditemukan' })

    await prisma.blastCampaign.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_BLAST_CAMPAIGN',
      target: existing.title,
      details: `Menghapus kampanye blast: ${existing.title}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Kampanye blast berhasil dihapus' })
  } catch (error) {
    console.error('Error in deleteCampaign:', error)
    return res.status(500).json({ error: 'Gagal menghapus kampanye blast' })
  }
}

/**
 * GET /api/admin/profile-rule (Izin: profileRule.manage)
 */
async function getProfileRule(req, res) {
  try {
    const settings = await prisma.siteSetting.findMany({
      where: {
        key: {
          in: [
            'profile.notice',
            'profile.photoUrl',
            'profile.nameOptions',
            'profile.channelUrl',
            'device.maxPerMember',
            'blast.delayMin',
            'blast.delayMax',
          ],
        },
      },
    })

    const map = {}
    for (const s of settings) {
      map[s.key] = s.value
    }

    let nameOptions = []
    try {
      nameOptions = JSON.parse(map['profile.nameOptions'] || '[]')
    } catch {
      nameOptions = ['AF Blast Official', 'CS AF Blast', 'Admin AF Blast']
    }

    return res.status(200).json({
      notice:
        map['profile.notice'] ||
        'Gunakan nama dan foto profil resmi AF Blast saat menjalankan sesi blast pesan agar akun tetap terpercaya.',
      photoUrl: map['profile.photoUrl'] || '/media/campaign/default_profile.png',
      nameOptions,
      channelUrl: map['profile.channelUrl'] || 'https://whatsapp.com/channel/afblast-official',
      maxPerMember: parseInt(map['device.maxPerMember'] || '3', 10),
      delayMin: parseInt(map['blast.delayMin'] || '5', 10),
      delayMax: parseInt(map['blast.delayMax'] || '15', 10),
    })
  } catch (error) {
    console.error('Error in getProfileRule:', error)
    return res.status(500).json({ error: 'Gagal mengambil aturan profil' })
  }
}

/**
 * PUT /api/admin/profile-rule (Izin: profileRule.manage)
 */
async function updateProfileRule(req, res) {
  try {
    const { notice, nameOptions, channelUrl, maxPerMember, delayMin, delayMax } = req.body
    let photoUrl = req.file?.savedUrl || req.body.photoUrl

    const updates = []

    if (notice !== undefined) {
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'profile.notice' },
          update: { value: String(notice) },
          create: { key: 'profile.notice', value: String(notice) },
        })
      )
    }

    if (photoUrl !== undefined) {
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'profile.photoUrl' },
          update: { value: String(photoUrl) },
          create: { key: 'profile.photoUrl', value: String(photoUrl) },
        })
      )
    }

    if (nameOptions !== undefined) {
      const optionsVal = Array.isArray(nameOptions)
        ? JSON.stringify(nameOptions)
        : typeof nameOptions === 'string'
        ? nameOptions
        : JSON.stringify([])

      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'profile.nameOptions' },
          update: { value: optionsVal },
          create: { key: 'profile.nameOptions', value: optionsVal },
        })
      )
    }

    if (channelUrl !== undefined) {
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'profile.channelUrl' },
          update: { value: String(channelUrl) },
          create: { key: 'profile.channelUrl', value: String(channelUrl) },
        })
      )
    }

    // Juga dukung update maxPerMember & delay jika dikirim dari form Aturan Profil
    if (maxPerMember !== undefined) {
      const maxVal = parseInt(maxPerMember, 10)
      if (!isNaN(maxVal) && maxVal >= 1) {
        updates.push(
          prisma.siteSetting.upsert({
            where: { key: 'device.maxPerMember' },
            update: { value: String(maxVal) },
            create: { key: 'device.maxPerMember', value: String(maxVal) },
          })
        )
      }
    }

    if (delayMin !== undefined) {
      const minVal = parseInt(delayMin, 10)
      if (!isNaN(minVal) && minVal >= 1) {
        updates.push(
          prisma.siteSetting.upsert({
            where: { key: 'blast.delayMin' },
            update: { value: String(minVal) },
            create: { key: 'blast.delayMin', value: String(minVal) },
          })
        )
      }
    }

    if (delayMax !== undefined) {
      const maxVal = parseInt(delayMax, 10)
      if (!isNaN(maxVal) && maxVal >= 1) {
        updates.push(
          prisma.siteSetting.upsert({
            where: { key: 'blast.delayMax' },
            update: { value: String(maxVal) },
            create: { key: 'blast.delayMax', value: String(maxVal) },
          })
        )
      }
    }

    await Promise.all(updates)

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_PROFILE_RULE',
      target: 'Aturan Profil Pengirim WhatsApp',
      details: 'Memperbarui aturan nama, foto, notice, atau channel pengirim resmi',
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Aturan profil berhasil diperbarui', photoUrl })
  } catch (error) {
    console.error('Error in updateProfileRule:', error)
    return res.status(500).json({ error: 'Gagal memperbarui aturan profil' })
  }
}

/**
 * GET /api/admin/device-settings (Izin: blastCampaign.manage / setting.view)
 */
async function getDeviceSettings(req, res) {
  try {
    const settings = await prisma.siteSetting.findMany({
      where: {
        key: {
          in: ['device.maxPerMember', 'blast.delayMin', 'blast.delayMax'],
        },
      },
    })
    const map = {}
    for (const s of settings) {
      map[s.key] = s.value
    }
    return res.status(200).json({
      maxPerMember: parseInt(map['device.maxPerMember'] || '3', 10),
      delayMin: parseInt(map['blast.delayMin'] || '5', 10),
      delayMax: parseInt(map['blast.delayMax'] || '15', 10),
    })
  } catch (error) {
    console.error('Error in getDeviceSettings:', error)
    return res.status(500).json({ error: 'Gagal mengambil pengaturan perangkat' })
  }
}

/**
 * PUT /api/admin/device-settings (Izin: blastCampaign.manage / setting.manage)
 */
async function updateDeviceSettings(req, res) {
  try {
    const { maxPerMember, delayMin, delayMax } = req.body

    const updates = []

    if (maxPerMember !== undefined) {
      const maxVal = parseInt(maxPerMember, 10)
      if (isNaN(maxVal) || maxVal < 1) {
        return res.status(400).json({ error: 'Batas perangkat per member minimal 1' })
      }
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'device.maxPerMember' },
          update: { value: String(maxVal) },
          create: { key: 'device.maxPerMember', value: String(maxVal) },
        })
      )
    }

    if (delayMin !== undefined) {
      const minVal = parseInt(delayMin, 10)
      if (isNaN(minVal) || minVal < 1) {
        return res.status(400).json({ error: 'Jeda minimal harus angka positif' })
      }
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'blast.delayMin' },
          update: { value: String(minVal) },
          create: { key: 'blast.delayMin', value: String(minVal) },
        })
      )
    }

    if (delayMax !== undefined) {
      const maxVal = parseInt(delayMax, 10)
      if (isNaN(maxVal) || maxVal < 1) {
        return res.status(400).json({ error: 'Jeda maksimal harus angka positif' })
      }
      updates.push(
        prisma.siteSetting.upsert({
          where: { key: 'blast.delayMax' },
          update: { value: String(maxVal) },
          create: { key: 'blast.delayMax', value: String(maxVal) },
        })
      )
    }

    await Promise.all(updates)

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_DEVICE_SETTINGS',
      target: 'Pengaturan Perangkat & Jeda Blast',
      details: `Memperbarui batas perangkat/delay blast`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Pengaturan perangkat berhasil diperbarui' })
  } catch (error) {
    console.error('Error in updateDeviceSettings:', error)
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan perangkat' })
  }
}

module.exports = {
  upload,
  processCampaignImage,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getProfileRule,
  updateProfileRule,
  getDeviceSettings,
  updateDeviceSettings,
}
