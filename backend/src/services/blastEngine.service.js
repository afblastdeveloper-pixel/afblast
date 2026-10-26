/**
 * Service Mesin WhatsApp Blast Per Perangkat (backend/src/services/blastEngine.service.js)
 * Mengelola siklus hidup mesin blast: start, stop, start-all, stop-all,
 * alokasi atomik target, kalkulasi interval (standard/safe/brutal),
 * pencatatan Earning, backoff 429, dan notifikasi realtime.
 */

const prisma = require('../config/db')
const { redis } = require('../config/redis')
const watsap = require('../providers/watsap')
const { getBlastSettings } = require('./blastSettings.service')
const targetStatsService = require('./targetStats.service')
const { publishMemberEvent } = require('../utils/sseManager')

function maskPhone(phone) {
  if (!phone) return ''
  const clean = String(phone).replace(/\D/g, '')
  if (clean.length < 8) return clean
  const prefix = clean.slice(0, 4)
  const suffix = clean.slice(-3)
  const maskedLength = Math.max(3, clean.length - 7)
  return `${prefix}${'*'.repeat(maskedLength)}${suffix}`
}

async function releaseDeviceLock(deviceId) {
  try {
    await redis.del(`afblast:lock:device:${deviceId}`)
  } catch (_) {}
}

async function checkAndResetDailyLimit(device) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const lastDateStr = device.sentTodayDate
    ? new Date(device.sentTodayDate).toISOString().slice(0, 10)
    : null

  if (lastDateStr !== todayStr) {
    return await prisma.device.update({
      where: { id: device.id },
      data: {
        sentToday: 0,
        sentTodayDate: now,
      },
    })
  }
  return device
}

/**
 * 1. Menjalankan mesin blast pada perangkat tertentu
 */
async function startDevice(deviceId, userId, options = {}) {
  const lockKey = `afblast:lock:device:${deviceId}`
  const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 5)
  if (acquired !== 'OK') {
    throw new Error('Perangkat sedang diproses oleh permintaan lain. Silakan coba sesaat lagi.')
  }

  try {
    const settings = await getBlastSettings()

    const device = await prisma.device.findUnique({
      where: { id: parseInt(deviceId, 10) },
    })

    if (!device || device.deletedAt) {
      const err = new Error('Perangkat tidak ditemukan')
      err.status = 404
      throw err
    }

    if (device.userId !== userId) {
      const err = new Error('Akses ditolak: Bukan perangkat milik Anda')
      err.status = 403
      throw err
    }

    if (device.status !== 'connected') {
      const err = new Error(`Perangkat belum terhubung (status: ${device.status}). Tautkan WhatsApp terlebih dahulu.`)
      err.status = 400
      throw err
    }

    if (device.engineState === 'running') {
      const activeRun = await prisma.deviceRun.findFirst({
        where: { deviceId: device.id, endedAt: null },
      })
      return { success: true, message: 'Mesin sudah berjalan', runId: activeRun?.id, deviceId: device.id }
    }

    // Periksa batas harian perangkat
    const checkedDev = await checkAndResetDailyLimit(device)
    if (checkedDev.sentToday >= checkedDev.dailyLimit) {
      const err = new Error(`Batas pengiriman harian perangkat (${checkedDev.dailyLimit}) telah tercapai hari ini.`)
      err.status = 400
      throw err
    }

    // Tentukan mode pengiriman dan periksa eksklusivitas
    const safeRequested = Boolean(options.safeMode || options.mode === 'safe')
    const brutalRequested = Boolean(options.brutalMode || options.mode === 'brutal')

    if (safeRequested && brutalRequested) {
      const err = new Error('Safe Mode dan Brutal Mode saling eksklusif.')
      err.status = 400
      throw err
    }

    const mode = brutalRequested ? 'brutal' : safeRequested ? 'safe' : (options.mode || (device.brutalMode ? 'brutal' : device.safeMode ? 'safe' : 'standard'))
    const safeMode = mode === 'safe'
    const brutalMode = mode === 'brutal'

    // Kecepatan
    const speedSeconds = options.speedSeconds !== undefined
      ? parseInt(options.speedSeconds, 10)
      : (device.speedSeconds || settings.defaultSpeed)

    if (!settings.allowedSpeeds.includes(speedSeconds)) {
      const err = new Error(`Kecepatan ${speedSeconds}s tidak diizinkan. Pilihan yang tersedia: ${settings.allowedSpeeds.join(', ')}`)
      err.status = 400
      throw err
    }

    // Aturan Safe Mode
    if (safeMode && !settings.safeModeEnabled) {
      const err = new Error('Safe Mode saat ini dinonaktifkan oleh administrator.')
      err.status = 400
      throw err
    }

    // Aturan Brutal Mode
    if (brutalMode) {
      if (!settings.brutalModeEnabled) {
        const err = new Error('Mode Brutal saat ini dinonaktifkan oleh sistem.')
        err.status = 403
        throw err
      }

      if (options.confirmText !== 'SAYA PAHAM') {
        const err = new Error('Persetujuan wajib: Anda harus menyertakan confirmText "SAYA PAHAM" untuk Mode Brutal.')
        err.status = 400
        throw err
      }

      // Cek apakah member memiliki RiskAck aktif
      const activeRiskAck = await prisma.riskAck.findFirst({
        where: { userId },
      })
      if (!activeRiskAck) {
        const err = new Error('Akses ditolak: Anda belum menandatangani Pernyataan Risiko aktif untuk mengaktifkan Mode Brutal.')
        err.status = 403
        throw err
      }

      // Selama ada device member berjalan brutal, tolak
      const runningBrutalCount = await prisma.device.count({
        where: { userId, engineState: 'running', brutalMode: true, id: { not: device.id } },
      })
      if (runningBrutalCount > 0) {
        const err = new Error('Hanya satu perangkat yang diperbolehkan berjalan dalam Mode Brutal pada saat bersamaan.')
        err.status = 400
        throw err
      }
    }

    // Tentukan Kategori Target
    const targetCategoryId = options.categoryId || device.categoryId
    if (!targetCategoryId) {
      const err = new Error('Kategori target belum dipilih.')
      err.status = 400
      throw err
    }

    const category = await prisma.contactCategory.findUnique({
      where: { id: parseInt(targetCategoryId, 10) },
    })
    if (!category || !category.isActive) {
      const err = new Error('Kategori target tidak aktif atau tidak ditemukan.')
      err.status = 400
      throw err
    }

    // Cek kampanye aktif untuk kategori ini
    const activeCampaign = await prisma.blastCampaign.findFirst({
      where: { categoryId: category.id, status: 'active' },
    })
    if (!activeCampaign) {
      const err = new Error(`Tidak ada kampanye aktif untuk kategori "${category.name}".`)
      err.status = 400
      throw err
    }

    // Cek sisa target
    const catStats = await prisma.categoryStats.findUnique({
      where: { categoryId: category.id },
    })
    if (!catStats || catStats.none <= 0) {
      const err = new Error(`Seluruh data kontak dalam kategori "${category.name}" telah habis diproses.`)
      err.status = 400
      throw err
    }

    // Buat DeviceRun baru
    const runLimit = options.runLimit !== undefined && options.runLimit !== null
      ? parseInt(options.runLimit, 10)
      : (device.runLimit || null)

    const isSimulated = Boolean(
      category.isSimulated ||
      device.isSimulated ||
      watsap.WATSAP_MODE === 'sim' ||
      watsap.WATSAP_MODE === 'mock'
    )

    const run = await prisma.deviceRun.create({
      data: {
        deviceId: device.id,
        userId,
        categoryId: category.id,
        speedSeconds,
        mode,
        limit: runLimit,
        isSimulated,
        startedAt: new Date(),
      },
    })

    // Update status Device menjadi running
    await prisma.device.update({
      where: { id: device.id },
      data: {
        engineState: 'running',
        categoryId: category.id,
        speedSeconds,
        safeMode,
        brutalMode,
        runLimit,
        runStartedAt: new Date(),
        consecutiveFails: 0,
        disconnectedReason: null,
      },
    })

    // Jadwalkan job BullMQ pertama untuk step pengiriman
    const { scheduleDeviceStep } = require('../worker')
    await scheduleDeviceStep(device.id, run.id, 0)

    publishMemberEvent(userId, 'device.status', {
      deviceId: device.id,
      status: device.status,
      engineState: 'running',
      mode,
    })

    return {
      success: true,
      message: `Mesin perangkat ${device.id} berhasil dimulai dalam Mode ${mode.toUpperCase()}.`,
      runId: run.id,
      deviceId: device.id,
    }
  } finally {
    await releaseDeviceLock(deviceId)
  }
}

/**
 * 2. Menghentikan mesin blast pada perangkat
 */
async function stopDevice(deviceId, userId = null, stopReason = 'user_stop') {
  const lockKey = `afblast:lock:device:${deviceId}`
  const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 5)

  try {
    const device = await prisma.device.findUnique({
      where: { id: parseInt(deviceId, 10) },
    })

    if (!device) return { success: false, message: 'Perangkat tidak ditemukan' }

    if (userId && device.userId !== userId) {
      const err = new Error('Akses ditolak: Bukan perangkat Anda')
      err.status = 403
      throw err
    }

    // Perbarui status device
    await prisma.device.update({
      where: { id: device.id },
      data: {
        engineState: 'idle',
      },
    })

    // Akhiri DeviceRun aktif
    await prisma.deviceRun.updateMany({
      where: { deviceId: device.id, endedAt: null },
      data: {
        endedAt: new Date(),
        stopReason,
      },
    })

    publishMemberEvent(device.userId, 'engine.stopped', {
      deviceId: device.id,
      reason: stopReason,
    })

    publishMemberEvent(device.userId, 'device.status', {
      deviceId: device.id,
      engineState: 'idle',
    })

    return {
      success: true,
      message: `Mesin perangkat ${device.id} berhasil dihentikan (${stopReason}).`,
      deviceId: device.id,
      stopReason,
    }
  } finally {
    await releaseDeviceLock(deviceId)
  }
}

/**
 * 3. Kendali Massal: Mulai semua perangkat yang terhubung dan idle
 */
async function startAll(userId, options = {}) {
  const devices = await prisma.device.findMany({
    where: {
      userId,
      status: 'connected',
      engineState: 'idle',
      deletedAt: null,
    },
  })

  if (devices.length === 0) {
    return {
      success: true,
      message: 'Tidak ada perangkat terhubung yang dalam keadaan idle.',
      startedCount: 0,
    }
  }

  let startedCount = 0
  const errors = []

  for (const dev of devices) {
    try {
      await startDevice(dev.id, userId, options)
      startedCount++
    } catch (e) {
      errors.push({ deviceId: dev.id, error: e.message })
    }
  }

  return {
    success: startedCount > 0,
    message: `${startedCount} dari ${devices.length} perangkat berhasil dijalankan.`,
    startedCount,
    totalEligible: devices.length,
    errors,
  }
}

/**
 * 4. Kendali Massal: Hentikan semua perangkat yang sedang berjalan
 */
async function stopAll(userId) {
  const devices = await prisma.device.findMany({
    where: {
      userId,
      engineState: 'running',
      deletedAt: null,
    },
  })

  let stoppedCount = 0
  for (const dev of devices) {
    try {
      await stopDevice(dev.id, userId, 'mass_stop')
      stoppedCount++
    } catch (_) {}
  }

  return {
    success: true,
    message: `${stoppedCount} perangkat berhasil dihentikan.`,
    stoppedCount,
  }
}

/**
 * 5. Memproses 1 Step Pengiriman Pesan (Dieksekusi oleh BullMQ Worker)
 */
async function processDeviceStep(deviceId, runId) {
  const stepLockKey = `afblast:step:device:${deviceId}`
  const acquired = await redis.set(stepLockKey, 'executing', 'NX', 'EX', 10)
  if (acquired !== 'OK') {
    return { status: 'skipped_locked' }
  }

  try {
    const device = await prisma.device.findUnique({
      where: { id: parseInt(deviceId, 10) },
    })
    const run = await prisma.deviceRun.findUnique({
      where: { id: parseInt(runId, 10) },
    })

    if (!device || device.engineState !== 'running' || !run || run.endedAt) {
      return { status: 'stopped_or_ended' }
    }

    // Periksa status konektivitas perangkat
    if (device.status !== 'connected' || device.deletedAt) {
      const reason = device.status === 'logged_out' ? 'logout' : 'device_disconnected'
      await stopDevice(device.id, device.userId, reason)
      return { status: 'stopped', reason }
    }

    // Periksa batas harian (reset jika sudah berganti tanggal)
    const currentDev = await checkAndResetDailyLimit(device)
    if (currentDev.sentToday >= currentDev.dailyLimit) {
      await stopDevice(device.id, device.userId, 'daily_limit_reached')
      return { status: 'stopped', reason: 'daily_limit_reached' }
    }

    // Periksa batas runLimit jika disetel
    if (run.limit && run.sent >= run.limit) {
      await stopDevice(device.id, device.userId, 'run_limit_reached')
      return { status: 'stopped', reason: 'run_limit_reached' }
    }

    const settings = await getBlastSettings()

    // Periksa batas kegagalan beruntun
    if (currentDev.consecutiveFails >= settings.failStopThreshold) {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          engineState: 'paused',
          disconnectedReason: `Kegagalan beruntun mencapai ambang batas (${settings.failStopThreshold})`,
        },
      })
      await prisma.deviceRun.update({
        where: { id: run.id },
        data: { endedAt: new Date(), stopReason: 'consecutive_fails' },
      })
      publishMemberEvent(device.userId, 'engine.stopped', {
        deviceId: device.id,
        reason: 'consecutive_fails',
      })
      publishMemberEvent(device.userId, 'device.status', {
        deviceId: device.id,
        engineState: 'paused',
      })
      return { status: 'paused', reason: 'consecutive_fails' }
    }

    // Validasi Kampanye Aktif & Kategori
    const campaign = await prisma.blastCampaign.findFirst({
      where: { categoryId: run.categoryId, status: 'active' },
    })
    if (!campaign) {
      await stopDevice(device.id, device.userId, 'campaign_inactive')
      return { status: 'stopped', reason: 'campaign_inactive' }
    }

    const category = await prisma.contactCategory.findUnique({
      where: { id: run.categoryId },
    })
    if (!category || !category.isActive) {
      await stopDevice(device.id, device.userId, 'category_inactive')
      return { status: 'stopped', reason: 'category_inactive' }
    }

    // Alokasi Atomik Target
    const candidate = await prisma.target.findFirst({
      where: {
        categoryId: run.categoryId,
        queueStatus: 'none',
        optOut: false,
      },
      orderBy: { id: 'asc' },
    })

    if (!candidate) {
      const remainingCount = await prisma.target.count({
        where: {
          categoryId: run.categoryId,
          queueStatus: 'none',
          optOut: false,
        },
      })
      if (remainingCount === 0) {
        await stopDevice(device.id, device.userId, 'category_depleted')
        return { status: 'completed', reason: 'category_depleted' }
      }
      return { status: 'retry_candidate' }
    }

    // Klaim unik lintas worker/perangkat
    const claimKey = `afblast:claim:camp_${campaign.id}:target_${candidate.id}`
    const acquiredClaim = await redis.set(claimKey, `${device.id}:${run.id}`, 'NX', 'EX', 86400 * 7)
    if (acquiredClaim !== 'OK') {
      const { scheduleDeviceStep } = require('../worker')
      await scheduleDeviceStep(device.id, run.id, 100)
      return { status: 'retry_claimed' }
    }

    // Update status atomik none -> queued
    const claimCount = await prisma.$transaction(async (tx) => {
      const updateRes = await tx.target.updateMany({
        where: {
          id: candidate.id,
          categoryId: run.categoryId,
          queueStatus: 'none',
          optOut: false,
        },
        data: { queueStatus: 'queued' },
      })
      if (updateRes.count > 0) {
        await targetStatsService.updateCategoryStatsAtomic(tx, run.categoryId, {
          none: -1,
          queued: 1,
        })
      }
      return updateRes.count
    })

    if (claimCount === 0) {
      await redis.del(claimKey).catch(() => {})
      const { scheduleDeviceStep } = require('../worker')
      await scheduleDeviceStep(device.id, run.id, 100)
      return { status: 'retry_concurrent' }
    }

    // Render pesan
    let renderedCaption = (campaign.caption || '')
      .replace(/\{\{\s*nama\s*\}\}/gi, candidate.name ? candidate.name.trim() : '')
      .replace(/\{\{\s*name\s*\}\}/gi, candidate.name ? candidate.name.trim() : '')

    if (campaign.buttonLabel && campaign.buttonUrl) {
      renderedCaption += `\n\n👉 ${campaign.buttonLabel.trim()}: ${campaign.buttonUrl.trim()}`
    }

    // Kirim pesan lewat adapter watsap
    let sendResult = null
    let sendError = null

    try {
      sendResult = await watsap.sendMessage({
        deviceId: currentDev.externalDeviceId || currentDev.id,
        phone: candidate.phone,
        text: renderedCaption,
        imageUrl: campaign.imageUrl,
        caption: renderedCaption,
        campaignId: campaign.id,
      })
    } catch (err) {
      sendError = err
    }

    const { scheduleDeviceStep } = require('../worker')

    // 1. Sukses
    if (sendResult && !sendError) {
      const providerMsgId = sendResult.providerMsgId || `sim_${Date.now()}`
      const isSimulated = Boolean(
        category.isSimulated ||
        device.isSimulated ||
        run.isSimulated ||
        watsap.WATSAP_MODE === 'sim' ||
        watsap.WATSAP_MODE === 'mock'
      )
      const rate = category.ratePerMessage || 0

      await prisma.$transaction(async (tx) => {
        await tx.target.update({
          where: { id: candidate.id },
          data: { queueStatus: 'success', lastError: null },
        })
        await targetStatsService.updateCategoryStatsAtomic(tx, run.categoryId, {
          queued: -1,
          success: 1,
        })
        await tx.blastLog.create({
          data: {
            userId: currentDev.userId,
            deviceId: currentDev.id,
            runId: run.id,
            campaignId: campaign.id,
            phone: candidate.phone,
            status: 'sent',
            providerMsgId,
          },
        })
        await tx.earning.create({
          data: {
            userId: currentDev.userId,
            deviceId: currentDev.id,
            runId: run.id,
            campaignId: campaign.id,
            targetId: candidate.id,
            amount: rate,
            isSimulated,
            description: `Blast ${category.name} (${candidate.phone})`,
          },
        })
        // Jika BUKAN simulasi, tambahkan saldo penarikan member
        if (!isSimulated && rate > 0) {
          await tx.user.update({
            where: { id: currentDev.userId },
            data: { balance: { increment: rate } },
          })
        }
        await tx.deviceRun.update({
          where: { id: run.id },
          data: {
            sent: { increment: 1 },
            success: { increment: 1 },
            earned: { increment: rate },
          },
        })
        await tx.device.update({
          where: { id: currentDev.id },
          data: {
            sentToday: { increment: 1 },
            consecutiveFails: 0,
            lastSeenAt: new Date(),
          },
        })
      })

      // Kirim event progress SSE
      publishMemberEvent(currentDev.userId, 'device.progress', {
        deviceId: currentDev.id,
        runId: run.id,
        sent: run.sent + 1,
        success: run.success + 1,
        failed: run.failed,
        earned: run.earned + rate,
      })

      // Hitung jeda interval berikutnya sesuai mode
      let delayMs = run.speedSeconds * 1000

      if (run.mode === 'safe') {
        const jitterFraction = (Math.random() * 2 - 1) * (settings.safeJitterPercent / 100)
        const jitterSec = run.speedSeconds * jitterFraction
        delayMs = Math.max(1000, Math.round((run.speedSeconds + jitterSec) * 1000))

        // Jeda panjang safePauseSeconds setiap safePauseEvery pesan
        if ((run.sent + 1) % settings.safePauseEvery === 0) {
          delayMs += settings.safePauseSeconds * 1000
        }
      } else if (run.mode === 'brutal') {
        delayMs = Math.max(settings.brutalMinIntervalMs, 700)
      }

      await scheduleDeviceStep(device.id, run.id, delayMs)
      return { status: 'sent', targetId: candidate.id }
    } else {
      // 2. Gagal / 429
      if (sendError?.status === 429) {
        const backoffSec = sendError.retryAfter || 10
        console.warn(`[Engine] Rate limit 429 pada device ${device.id}. Mengembalikan target ke status none dan jeda ${backoffSec}s.`)

        // Kembalikan target ke status none agar tidak hilang
        await prisma.$transaction(async (tx) => {
          await tx.target.updateMany({
            where: { id: candidate.id, queueStatus: 'queued' },
            data: { queueStatus: 'none' },
          })
          await targetStatsService.updateCategoryStatsAtomic(tx, run.categoryId, {
            queued: -1,
            none: 1,
          })
        })
        await redis.del(claimKey).catch(() => {})

        // Jadwalkan kembali setelah jeda backoff
        await scheduleDeviceStep(device.id, run.id, backoffSec * 1000)
        return { status: 'rate_limited', retryAfter: backoffSec }
      }

      // Kegagalan pengiriman biasa
      const errorMsg = sendError?.message || 'Pengiriman pesan gagal'

      await prisma.$transaction(async (tx) => {
        await tx.target.update({
          where: { id: candidate.id },
          data: { queueStatus: 'failed', lastError: errorMsg },
        })
        await targetStatsService.updateCategoryStatsAtomic(tx, run.categoryId, {
          queued: -1,
          failed: 1,
        })
        await tx.blastLog.create({
          data: {
            userId: currentDev.userId,
            deviceId: currentDev.id,
            runId: run.id,
            campaignId: campaign.id,
            phone: candidate.phone,
            status: 'failed',
            error: errorMsg,
          },
        })
        await tx.deviceRun.update({
          where: { id: run.id },
          data: {
            sent: { increment: 1 },
            failed: { increment: 1 },
          },
        })
        await tx.device.update({
          where: { id: currentDev.id },
          data: {
            consecutiveFails: { increment: 1 },
            lastSeenAt: new Date(),
          },
        })
      })

      publishMemberEvent(currentDev.userId, 'device.progress', {
        deviceId: currentDev.id,
        runId: run.id,
        sent: run.sent + 1,
        success: run.success,
        failed: run.failed + 1,
        earned: run.earned,
      })

      // Jadwalkan langkah berikutnya
      const nextDelay = run.mode === 'brutal'
        ? Math.max(settings.brutalMinIntervalMs, 700)
        : run.speedSeconds * 1000
      await scheduleDeviceStep(device.id, run.id, nextDelay)

      return { status: 'failed', targetId: candidate.id, error: errorMsg }
    }
  } finally {
    await redis.del(stepLockKey).catch(() => {})
  }
}

/**
 * 6. Memulai ulang penautan untuk device yang sama (menggunakan slot & statistik yang ada)
 */
async function reconnectDevice(deviceId, userId, phone = null) {
  const device = await prisma.device.findUnique({
    where: { id: parseInt(deviceId, 10) },
  })

  if (!device || device.deletedAt) {
    const err = new Error('Perangkat tidak ditemukan')
    err.status = 404
    throw err
  }

  if (device.userId !== userId) {
    const err = new Error('Akses ditolak: Bukan perangkat Anda')
    err.status = 403
    throw err
  }

  // Hentikan mesin jika sedang berjalan
  if (device.engineState === 'running') {
    await stopDevice(device.id, userId, 'reconnecting')
  }

  // Reset status perangkat ke pending
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      status: 'pending',
      phone: phone || device.phone,
      consecutiveFails: 0,
      disconnectedReason: null,
    },
  })

  return {
    success: true,
    message: 'Perangkat siap untuk ditautkan ulang.',
    device: {
      id: updated.id,
      slotNumber: updated.slotNumber,
      status: updated.status,
      phone: maskPhone(updated.phone),
    },
  }
}

/**
 * 7. Mengambil Ringkasan Overview Member (GET /api/member/whatsapp/overview)
 */
async function getMemberOverview(userId) {
  const settings = await getBlastSettings()

  // 1. Ambil perangkat member
  const devices = await prisma.device.findMany({
    where: { userId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true, ratePerMessage: true } },
    },
    orderBy: { slotNumber: 'asc' },
  })

  // 2. Run aktif untuk tiap perangkat
  const runningDeviceIds = devices.filter((d) => d.engineState === 'running').map((d) => d.id)
  const activeRuns = await prisma.deviceRun.findMany({
    where: {
      deviceId: { in: runningDeviceIds },
      endedAt: null,
    },
  })
  const activeRunMap = new Map(activeRuns.map((r) => [r.deviceId, r]))

  const mappedDevices = devices.map((d) => {
    const r = activeRunMap.get(d.id)
    return {
      id: d.id,
      label: d.label || `Slot #${d.slotNumber}`,
      slotNumber: d.slotNumber,
      phone: maskPhone(d.phone),
      rawPhoneMasked: maskPhone(d.phone),
      status: d.status,
      engineState: d.engineState,
      speedSeconds: d.speedSeconds,
      safeMode: d.safeMode,
      brutalMode: d.brutalMode,
      runLimit: d.runLimit,
      categoryId: d.categoryId,
      categoryName: d.category?.name || null,
      sentToday: d.sentToday,
      dailyLimit: d.dailyLimit,
      consecutiveFails: d.consecutiveFails,
      runStartedAt: d.runStartedAt,
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

  // 3. Hitung ringkasan performa all-time
  const [sentAllTime, failedAllTime] = await Promise.all([
    prisma.blastLog.count({ where: { userId, status: 'sent' } }),
    prisma.blastLog.count({ where: { userId, status: 'failed' } }),
  ])

  // Partisipasi kampanye
  const userLogs = await prisma.blastLog.findMany({
    where: { userId },
    select: { campaignId: true },
  })
  const distinctCampaigns = new Set(userLogs.map((l) => l.campaignId).filter(Boolean)).size

  // Nomor tertaut unik
  const allPhones = await prisma.device.findMany({
    where: { userId, phone: { not: null } },
    select: { phone: true },
  })
  const uniqueLinkedPhones = new Set(allPhones.map((p) => p.phone)).size

  // Rata-rata detik per pesan
  const recentLogs = await prisma.blastLog.findMany({
    where: { userId, status: 'sent', deviceId: { not: null } },
    select: { deviceId: true, createdAt: true },
    orderBy: [{ deviceId: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  })

  let totalDiff = 0
  let pairs = 0
  for (let i = 1; i < recentLogs.length; i++) {
    const prev = recentLogs[i - 1]
    const curr = recentLogs[i]
    if (prev.deviceId === curr.deviceId) {
      const diffSec = (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) / 1000
      if (diffSec > 0 && diffSec <= 600) {
        totalDiff += diffSec
        pairs++
      }
    }
  }
  const avgSecondsPerMessage = pairs > 0 ? Math.round((totalDiff / pairs) * 10) / 10 : 0

  // 4. Kategori yang bisa dipilih
  const categories = await prisma.contactCategory.findMany({
    where: { isActive: true },
    include: {
      stats: true,
      blastCampaigns: { where: { status: 'active' }, select: { id: true } },
    },
  })

  const selectableCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    remaining: c.stats?.none || 0,
    ratePerMessage: c.ratePerMessage,
    hasActiveCampaign: c.blastCampaigns.length > 0,
  }))

  return {
    performance: {
      slotAktif: runningDeviceIds.length,
      sentAllTime,
      failedAllTime,
      totalProcessed: sentAllTime + failedAllTime,
      distinctCampaigns,
      participations: {
        campaigns: distinctCampaigns,
        totalProcessed: sentAllTime + failedAllTime,
      },
      participationCampaigns: distinctCampaigns,
      participationProcessed: sentAllTime + failedAllTime,
      nomorTertaut: uniqueLinkedPhones,
      avgSecondsPerMessage,
    },
    devices: mappedDevices,
    kategori: selectableCategories,
    settings: {
      allowedSpeeds: settings.allowedSpeeds,
      defaultSpeed: settings.defaultSpeed,
      safeModeEnabled: settings.safeModeEnabled,
      brutalModeEnabled: settings.brutalModeEnabled,
      dailyLimitDefault: settings.dailyLimitDefault,
      failStopThreshold: settings.failStopThreshold,
      safeJitterPercent: settings.safeJitterPercent,
      safePauseEvery: settings.safePauseEvery,
      safePauseSeconds: settings.safePauseSeconds,
    },
  }
}

/**
 * 8. Riwayat Pesan Per Perangkat (Cursor Pagination & Masked Numbers)
 */
async function getDeviceHistory(deviceId, userId, { cursor, status, limit = 20 }) {
  const device = await prisma.device.findUnique({
    where: { id: parseInt(deviceId, 10) },
  })

  if (!device || device.userId !== userId) {
    const err = new Error('Akses ditolak: Bukan perangkat Anda')
    err.status = 403
    throw err
  }

  const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const where = {
    deviceId: device.id,
    ...(status ? { status } : {}),
  }

  const logs = await prisma.blastLog.findMany({
    where,
    take: take + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: parseInt(cursor, 10) } : undefined,
    orderBy: { id: 'desc' },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  })

  let nextCursor = null
  if (logs.length > take) {
    const nextItem = logs.pop()
    nextCursor = nextItem.id
  }

  const mapped = logs.map((l) => ({
    id: l.id,
    phone: maskPhone(l.phone),
    status: l.status,
    error: l.error,
    campaignTitle: l.campaign?.title || '-',
    categoryName: l.campaign?.category?.name || '-',
    createdAt: l.createdAt,
  }))

  return {
    logs: mapped,
    nextCursor,
  }
}

/**
 * 9. Riwayat Run Perangkat
 */
async function getDeviceRuns(deviceId, userId) {
  const device = await prisma.device.findUnique({
    where: { id: parseInt(deviceId, 10) },
  })

  if (!device || device.userId !== userId) {
    const err = new Error('Akses ditolak: Bukan perangkat Anda')
    err.status = 403
    throw err
  }

  const runs = await prisma.deviceRun.findMany({
    where: { deviceId: device.id },
    orderBy: { id: 'desc' },
    take: 50,
    include: {
      category: { select: { id: true, name: true } },
    },
  })

  return {
    runs: runs.map((r) => ({
      id: r.id,
      categoryName: r.category?.name || '-',
      mode: r.mode,
      speedSeconds: r.speedSeconds,
      limit: r.limit,
      sent: r.sent,
      success: r.success,
      failed: r.failed,
      earned: r.earned,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      stopReason: r.stopReason,
    })),
  }
}

module.exports = {
  startDevice,
  stopDevice,
  startAll,
  stopAll,
  processDeviceStep,
  reconnectDevice,
  getMemberOverview,
  getDeviceHistory,
  getDeviceRuns,
  checkAndResetDailyLimit,
  maskPhone,
}
