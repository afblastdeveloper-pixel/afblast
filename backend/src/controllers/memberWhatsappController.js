/**
 * Controller Member untuk WhatsApp Pengirim (src/controllers/memberWhatsappController.js)
 * Membangun seluruh fitur penautan perangkat (QR & Code), pemantauan performa,
 * kampanye blast, partisipasi, dan aturan profil pengirim.
 * Seluruh endpoint terisolasi untuk data milik member sendiri (aud: member).
 */

const { z } = require('zod')
const prisma = require('../config/db')
const watsap = require('../providers/watsap')
const { scheduleNextBlast } = require('../worker')
const targetStatsService = require('../services/targetStats.service')
const blastEngine = require('../services/blastEngine.service')

/**
 * Masking nomor kontak (hanya tampilkan prefix dan suffix, tengah disamarkan)
 * @param {string|null} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (!phone) return ''
  const clean = String(phone).replace(/[^0-9]/g, '')
  if (clean.length < 8) return clean
  const prefix = clean.slice(0, 4)
  const suffix = clean.slice(-3)
  const maskedLength = Math.max(3, clean.length - 7)
  return `${prefix}${'*'.repeat(maskedLength)}${suffix}`
}

/**
 * Normalisasi nomor WhatsApp ke format internasional 62...
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  let clean = String(phone).replace(/[^0-9]/g, '')
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1)
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.slice(1)
  }
  return clean
}

// ============================================================
// 1. RINGKASAN WHATSAPP PENGIRIM (/api/member/whatsapp/summary)
// ============================================================

async function getWhatsappSummary(req, res) {
  try {
    const userId = req.user.id

    // Ambil batas maksimal perangkat dari SiteSetting
    const maxSetting = await prisma.siteSetting.findUnique({
      where: { key: 'device.maxPerMember' },
    })
    const maxDevices = parseInt(maxSetting?.value || '3', 10)

    // 1. Hitung perangkat yang digunakan (tidak terhapus)
    const usedDevices = await prisma.device.count({
      where: { userId, deletedAt: null },
    })

    // 2. Hitung slot partisipasi aktif
    const slotAktif = await prisma.campaignParticipation.count({
      where: { userId, status: 'active' },
    })

    // 3. Hitung total blast sent & failed all-time
    const [sentAllTime, failedAllTime] = await Promise.all([
      prisma.blastLog.count({ where: { userId, status: 'sent' } }),
      prisma.blastLog.count({ where: { userId, status: 'failed' } }),
    ])

    // 4. Hitung kampanye berbeda yang pernah diikuti
    const userParticipations = await prisma.campaignParticipation.findMany({
      where: { userId },
      select: { campaignId: true },
    })
    const distinctCampaigns = new Set(userParticipations.map((p) => p.campaignId)).size

    // 5. Hitung jumlah nomor unik yang pernah ditautkan
    const allUserDevices = await prisma.device.findMany({
      where: { userId, phone: { not: null } },
      select: { phone: true },
    })
    const linkedUnique = new Set(allUserDevices.map((d) => d.phone)).size

    // 6. Hitung sisa data kontak resmi dari Service Tunggal (CategoryStats kategori aktif)
    const poolStats = await targetStatsService.getGlobalStats()
    const remainingData = poolStats.remaining

    // 7. Hitung rata-rata selisih waktu antar pesan terkirim berurutan pada perangkat yang sama
    // Abaikan jeda > 10 menit (600 detik)
    const sentLogs = await prisma.blastLog.findMany({
      where: { userId, status: 'sent', deviceId: { not: null } },
      select: { deviceId: true, createdAt: true },
      orderBy: [{ deviceId: 'asc' }, { createdAt: 'asc' }],
    })

    let totalDiffSeconds = 0
    let pairCount = 0

    for (let i = 1; i < sentLogs.length; i++) {
      const prev = sentLogs[i - 1]
      const curr = sentLogs[i]

      if (prev.deviceId === curr.deviceId) {
        const diffMs = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()
        const diffSec = diffMs / 1000
        if (diffSec > 0 && diffSec <= 600) {
          totalDiffSeconds += diffSec
          pairCount++
        }
      }
    }

    const avgSecondsPerMessage =
      pairCount > 0 ? Math.round((totalDiffSeconds / pairCount) * 10) / 10 : 0

    return res.status(200).json({
      remainingData,
      devices: {
        used: usedDevices,
        max: maxDevices,
      },
      performance: {
        slotAktif,
        sent: sentAllTime,
        failed: failedAllTime,
        // Format performa Number (sesuai spesifikasi)
        participationCampaigns: distinctCampaigns,
        participationProcessed: sentAllTime + failedAllTime,
        // Struktur lama untuk kompatibilitas mundur frontend
        participations: {
          campaigns: distinctCampaigns,
          totalProcessed: sentAllTime + failedAllTime,
        },
        linkedUnique,
        avgSecondsPerMessage,
      },
    })
  } catch (error) {
    console.error('Error in getWhatsappSummary:', error)
    return res.status(500).json({ error: 'Gagal memuat ringkasan performa WhatsApp' })
  }
}

/**
 * GET /api/member/pool/summary
 * Ringkasan pool kontak resmi untuk member (HANYA angka agregat, tanpa kontak/nomor)
 */
async function getMemberPoolSummary(req, res) {
  try {
    const summary = await targetStatsService.getMemberPoolSummary()
    return res.status(200).json(summary)
  } catch (error) {
    console.error('Error in getMemberPoolSummary:', error)
    return res.status(500).json({ error: 'Gagal memuat ringkasan kolam target' })
  }
}

// ============================================================
// 2. MANAJEMEN PERANGKAT (/api/member/devices)
// ============================================================

async function listMemberDevices(req, res) {
  try {
    const userId = req.user.id

    const devices = await prisma.device.findMany({
      where: { userId, deletedAt: null },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        phone: true,
        status: true,
        linkMethod: true,
        dailyLimit: true,
        sentToday: true,
        consecutiveFails: true,
        linkedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
    })

    // Mask nomor telepon untuk keamanan tampilan
    const masked = devices.map((d) => ({
      ...d,
      phone: maskPhone(d.phone),
      rawPhone: d.phone,
    }))

    return res.status(200).json({ devices: masked })
  } catch (error) {
    console.error('Error in listMemberDevices:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar perangkat WhatsApp' })
  }
}

async function createMemberDevice(req, res) {
  try {
    const userId = req.user.id

    // Larangan: Selama ada device member berjalan brutal, POST device baru ditolak
    const brutalRunning = await prisma.device.findFirst({
      where: {
        userId,
        engineState: 'running',
        brutalMode: true,
        deletedAt: null,
      },
    })
    if (brutalRunning) {
      return res.status(400).json({
        error: 'tidak bisa menambah perangkat selama Mode Brutal aktif',
      })
    }

    // Ambil batas maksimal perangkat dari SiteSetting
    const maxSetting = await prisma.siteSetting.findUnique({
      where: { key: 'device.maxPerMember' },
    })
    const maxAllowed = parseInt(maxSetting?.value || '3', 10)

    const currentCount = await prisma.device.count({
      where: { userId, deletedAt: null },
    })

    if (currentCount >= maxAllowed) {
      return res.status(400).json({
        error: `Batas maksimum perangkat tercapai (maksimal ${maxAllowed} perangkat).`,
      })
    }

    const maxSlotDevice = await prisma.device.findFirst({
      where: { userId },
      orderBy: { slotNumber: 'desc' },
      select: { slotNumber: true },
    })
    const nextSlot = (maxSlotDevice?.slotNumber || 0) + 1
    const label = req.body?.label?.trim() || `Slot #${nextSlot}`

    const device = await prisma.device.create({
      data: {
        userId,
        slotNumber: nextSlot,
        label,
        status: 'pending',
        engineState: 'idle',
        dailyLimit: 200,
        sentToday: 0,
        consecutiveFails: 0,
      },
      select: {
        id: true,
        label: true,
        slotNumber: true,
        status: true,
        engineState: true,
        dailyLimit: true,
        sentToday: true,
        createdAt: true,
      },
    })

    return res.status(201).json({
      message: 'Slot perangkat berhasil dibuat. Silakan tautkan nomor via QR atau kode.',
      device,
    })
  } catch (error) {
    console.error('Error in createMemberDevice:', error)
    return res.status(500).json({ error: 'Gagal membuat slot perangkat baru' })
  }
}

async function linkDeviceQr(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device || device.deletedAt) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    }

    // Keamanan data: hanya pemilik perangkat
    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Minta QR code dari adapter
    const qrResult = await watsap.getQr(device.id)

    await prisma.device.update({
      where: { id: device.id },
      data: { linkMethod: 'qr' },
    })

    return res.status(200).json({
      qr: qrResult.qr,
      expiresAt: qrResult.expiresAt,
      status: qrResult.status,
    })
  } catch (error) {
    console.error('Error in linkDeviceQr:', error)
    return res.status(500).json({ error: error.message || 'Gagal membuat QR code penautan' })
  }
}

const linkCodeSchema = z.object({
  phone: z.string().min(8, 'Nomor WhatsApp minimal 8 digit'),
})

async function linkDeviceCode(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const parse = linkCodeSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid (minimal 8 digit)' })
    }

    const normalized = normalizePhone(parse.data.phone)

    // Validasi: satu nomor tidak boleh tertaut di dua akun berbeda
    const existingOther = await prisma.device.findFirst({
      where: {
        phone: normalized,
        userId: { not: userId },
        deletedAt: null,
      },
    })

    if (existingOther) {
      return res.status(409).json({
        error: `Nomor ${normalized} sudah tertaut pada akun lain. Satu nomor WhatsApp tidak boleh digunakan di dua akun berbeda.`,
      })
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device || device.deletedAt) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    }

    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Minta kode 8 karakter dari adapter
    const codeResult = await watsap.requestPairingCode(device.id, normalized)

    await prisma.device.update({
      where: { id: device.id },
      data: {
        phone: normalized,
        linkMethod: 'code',
      },
    })

    return res.status(200).json({
      code: codeResult.code,
      expiresAt: codeResult.expiresAt,
    })
  } catch (error) {
    console.error('Error in linkDeviceCode:', error)
    return res.status(500).json({ error: error.message || 'Gagal meminta kode penautan perangkat' })
  }
}

async function getDeviceStatus(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device || device.deletedAt) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    }

    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Polling status dari adapter
    const statusData = await watsap.getStatus(device.id)

    let updatedDevice = device
    if (statusData.status === 'connected' && device.status !== 'connected') {
      updatedDevice = await prisma.device.update({
        where: { id: device.id },
        data: {
          status: 'connected',
          linkedAt: new Date(),
          lastSeenAt: new Date(),
          phone: device.phone || statusData.phone,
        },
      })
    } else if (statusData.status === 'disconnected' && device.status !== 'disconnected') {
      updatedDevice = await prisma.device.update({
        where: { id: device.id },
        data: { status: 'disconnected' },
      })
    }

    return res.status(200).json({
      status: updatedDevice.status,
      phone: maskPhone(updatedDevice.phone),
      linkedAt: updatedDevice.linkedAt,
      lastSeenAt: updatedDevice.lastSeenAt,
    })
  } catch (error) {
    console.error('Error in getDeviceStatus:', error)
    return res.status(500).json({ error: 'Gagal memeriksa status perangkat' })
  }
}

async function disconnectDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device) return res.status(404).json({ error: 'Perangkat tidak ditemukan' })

    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Hentikan mesin jika sedang berjalan
    await blastEngine.stopDevice(device.id, userId, 'manual_disconnect')

    // Putuskan pada adapter
    await watsap.disconnect(device.id).catch(() => {})

    // Tandai status disconnected
    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: 'disconnected',
        engineState: 'idle',
      },
    })

    // Jeda otomatis seluruh partisipasi aktif yang menggunakan perangkat ini
    await prisma.campaignParticipation.updateMany({
      where: { deviceId: device.id, status: 'active' },
      data: { status: 'paused' },
    })

    return res.status(200).json({
      success: true,
      message: 'Perangkat berhasil diputuskan secara manual.',
    })
  } catch (error) {
    console.error('Error in disconnectDevice:', error)
    return res.status(500).json({ error: 'Gagal memutuskan perangkat' })
  }
}

async function deleteMemberDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device) return res.status(404).json({ error: 'Perangkat tidak ditemukan' })

    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Hanya jika engine berhenti (idle/paused)
    if (device.engineState === 'running') {
      return res.status(400).json({
        error: 'Tidak bisa menghapus perangkat saat mesin sedang berjalan. Hentikan mesin terlebih dahulu.',
      })
    }

    await watsap.disconnect(device.id).catch(() => {})

    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: 'disconnected',
        engineState: 'idle',
        deletedAt: new Date(),
      },
    })

    return res.status(200).json({
      success: true,
      message: 'Perangkat berhasil dihapus.',
    })
  } catch (error) {
    console.error('Error in deleteMemberDevice:', error)
    return res.status(500).json({ error: 'Gagal menghapus perangkat' })
  }
}

async function getWhatsappOverview(req, res) {
  try {
    const overview = await blastEngine.getMemberOverview(req.user.id)
    return res.status(200).json(overview)
  } catch (error) {
    console.error('Error in getWhatsappOverview:', error)
    return res.status(500).json({ error: error.message || 'Gagal memuat ringkasan overview' })
  }
}

const configDeviceSchema = z.object({
  label: z.string().max(50).optional(),
  speedSeconds: z.number().int().positive().optional(),
  safeMode: z.boolean().optional(),
  brutalMode: z.boolean().optional(),
  runLimit: z.number().int().positive().nullable().optional(),
  confirmText: z.string().optional(),
})

async function configDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const parse = configDeviceSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: 'Data konfigurasi tidak valid', details: parse.error.errors })
    }

    const { label, speedSeconds, safeMode, brutalMode, runLimit, confirmText } = parse.data

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })
    if (!device || device.deletedAt) return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    if (device.userId !== userId) return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })

    const { getBlastSettings } = require('../services/blastSettings.service')
    const settings = await getBlastSettings()

    if (safeMode && brutalMode) {
      return res.status(400).json({ error: 'Safe Mode dan Brutal Mode saling eksklusif.' })
    }

    if (safeMode && !settings.safeModeEnabled) {
      return res.status(400).json({ error: 'Safe Mode saat ini dinonaktifkan oleh administrator.' })
    }

    if (brutalMode) {
      if (!settings.brutalModeEnabled) {
        return res.status(403).json({ error: 'Mode Brutal saat ini dinonaktifkan oleh sistem.' })
      }
      if (confirmText !== 'SAYA PAHAM') {
        return res.status(400).json({ error: 'Konfirmasi teks "SAYA PAHAM" wajib untuk Mode Brutal.' })
      }
      const activeRiskAck = await prisma.riskAck.findFirst({ where: { userId } })
      if (!activeRiskAck) {
        return res.status(403).json({ error: 'Anda belum menyetujui Pernyataan Risiko aktif untuk Mode Brutal.' })
      }
    }

    if (speedSeconds !== undefined && !settings.allowedSpeeds.includes(speedSeconds)) {
      return res.status(400).json({
        error: `speedSeconds ${speedSeconds} tidak diizinkan. Pilihan yang valid: ${settings.allowedSpeeds.join(', ')}`,
      })
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        label: label !== undefined ? label : device.label,
        speedSeconds: speedSeconds !== undefined ? speedSeconds : device.speedSeconds,
        safeMode: safeMode !== undefined ? safeMode : device.safeMode,
        brutalMode: brutalMode !== undefined ? brutalMode : device.brutalMode,
        runLimit: runLimit !== undefined ? runLimit : device.runLimit,
      },
    })

    return res.status(200).json({
      success: true,
      message: 'Konfigurasi perangkat berhasil disimpan.',
      device: {
        id: updated.id,
        label: updated.label,
        slotNumber: updated.slotNumber,
        speedSeconds: updated.speedSeconds,
        safeMode: updated.safeMode,
        brutalMode: updated.brutalMode,
        runLimit: updated.runLimit,
      },
    })
  } catch (error) {
    console.error('Error in configDevice:', error)
    return res.status(500).json({ error: error.message || 'Gagal menyimpan konfigurasi perangkat' })
  }
}

async function startDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.startDevice(deviceId, userId, req.body)
    return res.status(200).json(result)
  } catch (error) {
    const status = error.status || 400
    return res.status(status).json({ error: error.message || 'Gagal memulai mesin perangkat' })
  }
}

async function stopDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.stopDevice(deviceId, userId, 'user_stop')
    return res.status(200).json(result)
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Gagal menghentikan mesin perangkat' })
  }
}

async function startAllDevices(req, res) {
  try {
    const result = await blastEngine.startAll(req.user.id, req.body)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal memulai semua perangkat' })
  }
}

async function stopAllDevices(req, res) {
  try {
    const result = await blastEngine.stopAll(req.user.id)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal menghentikan semua perangkat' })
  }
}

async function reconnectDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.reconnectDevice(deviceId, userId, req.body?.phone)
    return res.status(200).json(result)
  } catch (error) {
    const status = error.status || 400
    return res.status(status).json({ error: error.message || 'Gagal memulai ulang penautan' })
  }
}

async function getDeviceHistory(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.getDeviceHistory(deviceId, userId, req.query)
    return res.status(200).json(result)
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Gagal memuat riwayat pengiriman' })
  }
}

async function getDeviceRuns(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.getDeviceRuns(deviceId, userId)
    return res.status(200).json(result)
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Gagal memuat riwayat run perangkat' })
  }
}

// ============================================================
// 3. ATURAN PROFIL RESMI (/api/member/profile-rule)
// ============================================================

async function getProfileRule(req, res) {
  try {
    const settings = await prisma.siteSetting.findMany({
      where: {
        key: {
          in: ['profile.notice', 'profile.photoUrl', 'profile.nameOptions', 'profile.channelUrl'],
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
    })
  } catch (error) {
    console.error('Error in getProfileRule:', error)
    return res.status(500).json({ error: 'Gagal memuat aturan profil pengirim' })
  }
}

// ============================================================
// 4. KAMPANYE BLAST & PARTISIPASI (/api/member/blast/*)
// ============================================================

async function listMemberCampaigns(req, res) {
  try {
    const userId = req.user.id

    const campaigns = await prisma.blastCampaign.findMany({
      where: { status: 'active' },
      include: {
        batch: {
          select: { id: true, title: true, totalContacts: true },
        },
        participations: {
          where: { userId },
          include: {
            device: {
              select: { id: true, phone: true, status: true },
            },
          },
        },
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { id: 'desc' },
    })

    // Saring dan format preview kampanye (nomor kontak tidak pernah dikirim ke member)
    const result = campaigns.map((c) => {
      const userPart = c.participations.find((p) => p.userId === userId) || null
      return {
        id: c.id,
        title: c.title,
        imageUrl: c.imageUrl,
        caption: c.caption,
        buttonLabel: c.buttonLabel,
        buttonUrl: c.buttonUrl,
        totalContacts: c.batch?.totalContacts || c._count.tasks,
        userParticipation: userPart
          ? {
              id: userPart.id,
              status: userPart.status,
              joinedAt: userPart.joinedAt,
              device: {
                id: userPart.device.id,
                phone: maskPhone(userPart.device.phone),
                status: userPart.device.status,
              },
            }
          : null,
      }
    })

    return res.status(200).json({ campaigns: result })
  } catch (error) {
    console.error('Error in listMemberCampaigns:', error)
    return res.status(500).json({ error: 'Gagal memuat kampanye blast aktif' })
  }
}

async function joinCampaign(req, res) {
  try {
    const userId = req.user.id
    const campaignId = parseInt(req.params.id, 10)
    const { deviceId } = req.body

    if (isNaN(campaignId)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const parsedDeviceId = parseInt(deviceId, 10)
    if (isNaN(parsedDeviceId)) {
      return res.status(400).json({ error: 'Perangkat WhatsApp wajib dipilih' })
    }

    // 1. Validasi kampanye aktif / running
    const campaign = await prisma.blastCampaign.findUnique({
      where: { id: campaignId },
      include: { batch: true },
    })
    if (!campaign || (campaign.status !== 'active' && campaign.status !== 'running')) {
      return res.status(404).json({ error: 'Kampanye blast tidak ditemukan atau sedang tidak aktif' })
    }

    // 1b. Validasi Pernyataan Risiko (RiskAck) wajib disetujui
    const riskVersionSetting = await prisma.siteSetting.findUnique({
      where: { key: 'riskPolicy.version' },
    })
    const currentRiskVersion = riskVersionSetting ? riskVersionSetting.value : '1.0'

    const riskAck = await prisma.riskAck.findUnique({
      where: {
        userId_version: {
          userId,
          version: currentRiskVersion,
        },
      },
    })

    if (!riskAck) {
      return res.status(403).json({
        error: 'Pernyataan Risiko belum disetujui. Anda wajib membaca dan menyetujui Pernyataan Risiko sebelum mengikuti kampanye blast.',
        code: 'RISK_ACK_REQUIRED',
        requiredVersion: currentRiskVersion,
      })
    }

    // 2. Validasi perangkat (harus milik sendiri, tidak terhapus, dan connected)
    const device = await prisma.device.findUnique({
      where: { id: parsedDeviceId },
    })
    if (!device || device.deletedAt) {
      return res.status(404).json({ error: 'Perangkat WhatsApp tidak ditemukan' })
    }
    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat WhatsApp Anda' })
    }
    if (device.status !== 'connected') {
      return res.status(400).json({
        error: 'Perangkat harus berstatus terhubung (connected) untuk dapat bergabung ke kampanye blast.',
      })
    }

    // 3. Pastikan tugas kampanye sudah terisi dari batch kontak
    const taskCount = await prisma.blastTask.count({
      where: { campaignId },
    })
    if (taskCount === 0 && campaign.batchId) {
      const contacts = await prisma.poolContact.findMany({
        where: { batchId: campaign.batchId },
        select: { id: true },
      })
      if (contacts.length > 0) {
        await prisma.blastTask.createMany({
          data: contacts.map((c) => ({
            campaignId,
            contactId: c.id,
            status: 'pending',
          })),
          skipDuplicates: true,
        })
      }
    }

    // 4. Upsert partisipasi kampanye
    const participation = await prisma.campaignParticipation.upsert({
      where: {
        userId_campaignId: { userId, campaignId },
      },
      update: {
        deviceId: parsedDeviceId,
        status: 'active',
        leftAt: null,
      },
      create: {
        userId,
        campaignId,
        deviceId: parsedDeviceId,
        status: 'active',
      },
      include: {
        device: { select: { id: true, phone: true, status: true } },
      },
    })

    // 5. Jadwalkan eksekusi worker antrean
    scheduleNextBlast(participation.id, 0).catch((e) =>
      console.warn('[Queue] Gagal trigger schedule:', e.message)
    )

    return res.status(200).json({
      message: 'Berhasil bergabung dengan sesi kampanye blast',
      participation: {
        id: participation.id,
        campaignId: participation.campaignId,
        status: participation.status,
        joinedAt: participation.joinedAt,
        device: {
          id: participation.device.id,
          phone: maskPhone(participation.device.phone),
          status: participation.device.status,
        },
      },
    })
  } catch (error) {
    console.error('Error in joinCampaign:', error)
    return res.status(500).json({ error: 'Gagal bergabung dengan kampanye blast' })
  }
}

async function leaveCampaign(req, res) {
  try {
    const userId = req.user.id
    const campaignId = parseInt(req.params.id, 10)
    if (isNaN(campaignId)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const participation = await prisma.campaignParticipation.findUnique({
      where: {
        userId_campaignId: { userId, campaignId },
      },
    })

    if (!participation) {
      return res.status(404).json({ error: 'Partisipasi kampanye tidak ditemukan' })
    }

    const updated = await prisma.campaignParticipation.update({
      where: { id: participation.id },
      data: {
        status: 'left',
        leftAt: new Date(),
      },
    })

    return res.status(200).json({
      message: 'Berhasil keluar dari sesi pengiriman kampanye blast',
      participation: updated,
    })
  } catch (error) {
    console.error('Error in leaveCampaign:', error)
    return res.status(500).json({ error: 'Gagal keluar dari kampanye blast' })
  }
}

async function listParticipations(req, res) {
  try {
    const userId = req.user.id

    const participations = await prisma.campaignParticipation.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            status: true,
            createdAt: true,
          },
        },
        device: {
          select: { id: true, phone: true, status: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    // Hitung progres masing-masing partisipasi
    const results = await Promise.all(
      participations.map(async (p) => {
        const [total, sent, failed, pending] = await Promise.all([
          prisma.blastTask.count({ where: { campaignId: p.campaignId } }),
          prisma.blastTask.count({ where: { campaignId: p.campaignId, status: 'sent' } }),
          prisma.blastTask.count({ where: { campaignId: p.campaignId, status: 'failed' } }),
          prisma.blastTask.count({ where: { campaignId: p.campaignId, status: 'pending' } }),
        ])

        return {
          id: p.id,
          status: p.status,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          campaign: p.campaign,
          device: {
            id: p.device.id,
            phone: maskPhone(p.device.phone),
            status: p.device.status,
          },
          progress: {
            total,
            sent,
            failed,
            pending,
          },
        }
      })
    )

    return res.status(200).json({ participations: results })
  } catch (error) {
    console.error('Error in listParticipations:', error)
    return res.status(500).json({ error: 'Gagal memuat data partisipasi kampanye' })
  }
}

async function getRiskPolicy(req, res) {
  try {
    const [versionSetting, textSetting] = await Promise.all([
      prisma.siteSetting.findUnique({ where: { key: 'riskPolicy.version' } }),
      prisma.siteSetting.findUnique({ where: { key: 'riskPolicy.text' } }),
    ])
    const version = versionSetting ? versionSetting.value : '1.0'
    const text =
      textSetting?.value ||
      'Pernyataan Risiko: Partisipasi dalam kampanye blast WhatsApp melibatkan pengiriman pesan dari nomor Anda ke kontak tujuan. Pastikan nomor mematuhi batas wajar dan ketentuan layanan WhatsApp.'

    const userAck = await prisma.riskAck.findUnique({
      where: {
        userId_version: {
          userId: req.user.id,
          version,
        },
      },
    })

    return res.status(200).json({
      version,
      text,
      isAccepted: Boolean(userAck),
      acceptedAt: userAck ? userAck.acceptedAt : null,
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat pernyataan risiko', details: error.message })
  }
}

async function acceptRiskAck(req, res) {
  try {
    const versionSetting = await prisma.siteSetting.findUnique({ where: { key: 'riskPolicy.version' } })
    const version = req.body.version || (versionSetting ? versionSetting.value : '1.0')

    const ack = await prisma.riskAck.upsert({
      where: {
        userId_version: {
          userId: req.user.id,
          version,
        },
      },
      update: {
        acceptedAt: new Date(),
        ip: req.ip,
      },
      create: {
        userId: req.user.id,
        version,
        acceptedAt: new Date(),
        ip: req.ip,
      },
    })

    return res.status(200).json({
      message: 'Pernyataan risiko berhasil disetujui',
      version: ack.version,
      acceptedAt: ack.acceptedAt,
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menyetujui pernyataan risiko', details: error.message })
  }
}

module.exports = {
  maskPhone,
  normalizePhone,
  getWhatsappSummary,
  getWhatsappOverview,
  getMemberPoolSummary,
  listMemberDevices,
  createMemberDevice,
  linkDeviceQr,
  linkDeviceCode,
  getDeviceStatus,
  disconnectDevice,
  deleteMemberDevice,
  configDevice,
  startDevice,
  stopDevice,
  startAllDevices,
  stopAllDevices,
  reconnectDevice,
  getDeviceHistory,
  getDeviceRuns,
  getProfileRule,
  listMemberCampaigns,
  joinCampaign,
  leaveCampaign,
  listParticipations,
  getRiskPolicy,
  acceptRiskAck,
}

