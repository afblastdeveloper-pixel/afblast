/**
 * Controller Admin untuk Mesin WhatsApp Blast (backend/src/controllers/adminEngineController.js)
 * Mengelola setting global mesin, monitoring seluruh perangkat, dan force-stop.
 * Dicatat secara transparan ke tabel ActivityLog.
 */

const { z } = require('zod')
const prisma = require('../config/db')
const { getBlastSettings } = require('../services/blastSettings.service')
const blastEngine = require('../services/blastEngine.service')

// Skema validasi setting mesin
const engineSettingsSchema = z.object({
  allowedSpeeds: z.array(z.number().int().positive()).min(1).optional(),
  defaultSpeed: z.number().int().positive().optional(),
  safeModeEnabled: z.boolean().optional(),
  brutalModeEnabled: z.boolean().optional(),
  brutalMinIntervalMs: z.number().int().min(100).max(10000).optional(),
  dailyLimitDefault: z.number().int().min(1).max(50000).optional(),
  failStopThreshold: z.number().int().min(1).max(100).optional(),
  safeJitterPercent: z.number().int().min(0).max(100).optional(),
  safePauseEvery: z.number().int().min(1).max(1000).optional(),
  safePauseSeconds: z.number().int().min(1).max(3600).optional(),
  creditOn: z.enum(['accepted', 'delivered', 'read']).optional(),
})

/**
 * GET /api/admin/engine-settings
 */
async function getEngineSettings(req, res) {
  try {
    const settings = await getBlastSettings()
    return res.status(200).json({ settings })
  } catch (error) {
    console.error('Error in getEngineSettings:', error)
    return res.status(500).json({ error: 'Gagal memuat pengaturan mesin blast' })
  }
}

/**
 * PUT /api/admin/engine-settings
 */
async function updateEngineSettings(req, res) {
  try {
    const parse = engineSettingsSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        error: 'Data pengaturan tidak valid',
        details: parse.error.errors.map((e) => e.message),
      })
    }

    const data = parse.data

    // Proteksi: brutalModeEnabled HANYA boleh diubah oleh Superadmin
    if (data.brutalModeEnabled !== undefined && req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Hanya Superadmin yang memiliki izin mengubah status Mode Brutal.',
      })
    }

    const updates = []

    if (data.allowedSpeeds !== undefined) {
      updates.push({ key: 'blast.allowedSpeeds', value: JSON.stringify(data.allowedSpeeds) })
    }
    if (data.defaultSpeed !== undefined) {
      updates.push({ key: 'blast.defaultSpeed', value: String(data.defaultSpeed) })
    }
    if (data.safeModeEnabled !== undefined) {
      updates.push({ key: 'blast.safeModeEnabled', value: String(data.safeModeEnabled) })
    }
    if (data.brutalModeEnabled !== undefined) {
      updates.push({ key: 'blast.brutalModeEnabled', value: String(data.brutalModeEnabled) })
    }
    if (data.brutalMinIntervalMs !== undefined) {
      updates.push({ key: 'blast.brutalMinIntervalMs', value: String(data.brutalMinIntervalMs) })
    }
    if (data.dailyLimitDefault !== undefined) {
      updates.push({ key: 'blast.dailyLimitDefault', value: String(data.dailyLimitDefault) })
    }
    if (data.failStopThreshold !== undefined) {
      updates.push({ key: 'blast.failStopThreshold', value: String(data.failStopThreshold) })
    }
    if (data.safeJitterPercent !== undefined) {
      updates.push({ key: 'blast.safeJitterPercent', value: String(data.safeJitterPercent) })
    }
    if (data.safePauseEvery !== undefined) {
      updates.push({ key: 'blast.safePauseEvery', value: String(data.safePauseEvery) })
    }
    if (data.safePauseSeconds !== undefined) {
      updates.push({ key: 'blast.safePauseSeconds', value: String(data.safePauseSeconds) })
    }
    if (data.creditOn !== undefined) {
      updates.push({ key: 'earning.creditOn', value: data.creditOn })
    }

    for (const item of updates) {
      await prisma.siteSetting.upsert({
        where: { key: item.key },
        create: { key: item.key, value: item.value },
        update: { value: item.value },
      })
    }

    // Catat ke ActivityLog
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        adminName: req.user.name || req.user.username || 'Admin',
        action: 'UPDATE_ENGINE_SETTINGS',
        target: 'blast_engine',
        status: 'success',
        details: JSON.stringify(data),
      },
    })

    const updated = await getBlastSettings()
    return res.status(200).json({
      message: 'Pengaturan mesin blast berhasil diperbarui',
      settings: updated,
    })
  } catch (error) {
    console.error('Error in updateEngineSettings:', error)
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan mesin blast' })
  }
}

/**
 * GET /api/admin/engine/devices
 * Menampilkan semua perangkat, status, dan run yang sedang aktif
 */
async function getEngineDevices(req, res) {
  try {
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      include: {
        user: { select: { id: true, name: true, username: true, email: true } },
        category: { select: { id: true, name: true, ratePerMessage: true } },
      },
      orderBy: [{ engineState: 'desc' }, { id: 'desc' }],
    })

    const runningIds = devices.filter((d) => d.engineState === 'running').map((d) => d.id)
    const activeRuns = await prisma.deviceRun.findMany({
      where: { deviceId: { in: runningIds }, endedAt: null },
    })
    const runMap = new Map(activeRuns.map((r) => [r.deviceId, r]))

    const mapped = devices.map((d) => {
      const r = runMap.get(d.id)
      return {
        id: d.id,
        label: d.label || `Slot #${d.slotNumber}`,
        slotNumber: d.slotNumber,
        phone: blastEngine.maskPhone(d.phone),
        userId: d.userId,
        userName: d.user?.name || d.user?.username || '-',
        userEmail: d.user?.email || '-',
        status: d.status,
        engineState: d.engineState,
        speedSeconds: d.speedSeconds,
        safeMode: d.safeMode,
        brutalMode: d.brutalMode,
        categoryName: d.category?.name || '-',
        sentToday: d.sentToday,
        dailyLimit: d.dailyLimit,
        consecutiveFails: d.consecutiveFails,
        disconnectedReason: d.disconnectedReason,
        activeRun: r ? {
          id: r.id,
          sent: r.sent,
          success: r.success,
          failed: r.failed,
          earned: r.earned,
          mode: r.mode,
          startedAt: r.startedAt,
        } : null,
      }
    })

    return res.status(200).json({ devices: mapped })
  } catch (error) {
    console.error('Error in getEngineDevices:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar perangkat mesin blast' })
  }
}

/**
 * POST /api/admin/engine/devices/:id/force-stop
 */
async function forceStopDevice(req, res) {
  try {
    const deviceId = parseInt(req.params.id, 10)
    if (isNaN(deviceId)) return res.status(400).json({ error: 'ID perangkat tidak valid' })

    const result = await blastEngine.stopDevice(deviceId, null, 'admin_force_stop')

    // Catat ke ActivityLog
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        adminName: req.user.name || 'Admin',
        action: 'FORCE_STOP_DEVICE',
        target: String(deviceId),
        status: 'success',
        details: 'Admin menghentikan paksa mesin perangkat',
      },
    })

    return res.status(200).json({
      success: true,
      message: `Perangkat #${deviceId} berhasil dihentikan paksa oleh admin.`,
      result,
    })
  } catch (error) {
    console.error('Error in forceStopDevice:', error)
    return res.status(500).json({ error: error.message || 'Gagal menghentikan paksa perangkat' })
  }
}

module.exports = {
  getEngineSettings,
  updateEngineSettings,
  getEngineDevices,
  forceStopDevice,
}
