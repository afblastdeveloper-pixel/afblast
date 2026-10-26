/**
 * Worker BullMQ untuk Pengiriman WhatsApp Blast (src/worker.js)
 * Menggunakan BullMQ + Redis untuk penjadwalan antrean pengiriman pesan secara aman,
 * atomik, dan terkontrol.
 */

const { Queue, Worker } = require('bullmq')
const prisma = require('./config/db')
const { redis } = require('./config/redis')
const watsap = require('./providers/watsap')
const targetStatsService = require('./services/targetStats.service')

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)

const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
}

const QUEUE_NAME = 'whatsapp-blast'
const PAYMENT_QUEUE_NAME = 'payment-notifications'

// Inisialisasi Queue
let blastQueue = null
let paymentQueue = null
try {
  blastQueue = new Queue(QUEUE_NAME, { connection: redisConnection })
  paymentQueue = new Queue(PAYMENT_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  })
} catch (err) {
  console.warn('[BullMQ] Gagal menginisialisasi Queue:', err.message)
}

/**
 * Mengambil konfigurasi delay dan limit dari SiteSetting
 */
async function getBlastSettings() {
  const settings = await prisma.siteSetting.findMany({
    where: {
      key: {
        in: ['blast.delayMin', 'blast.delayMax', 'device.maxPerMember'],
      },
    },
  })

  const map = {}
  for (const s of settings) {
    map[s.key] = s.value
  }

  return {
    delayMin: parseInt(map['blast.delayMin'] || '8', 10),
    delayMax: parseInt(map['blast.delayMax'] || '25', 10),
  }
}

/**
 * Render caption dengan penggantian placeholder {{name}} dan penambahan tautan tombol
 * @param {string} templateCaption
 * @param {string} contactName
 * @param {string|null} buttonLabel
 * @param {string|null} buttonUrl
 * @returns {string}
 */
function renderCaption(templateCaption, contactName, buttonLabel, buttonUrl) {
  let rendered = (templateCaption || '').replace(
    /\{\{\s*name\s*\}\}/gi,
    contactName ? contactName.trim() : ''
  )

  if (buttonLabel && buttonUrl) {
    rendered += `\n\n👉 ${buttonLabel.trim()}: ${buttonUrl.trim()}`
  }

  return rendered
}

/**
 * Memeriksa dan mereset hitungan batas harian jika sudah berganti tanggal
 * @param {Object} device
 * @returns {Promise<Object>} Updated device
 */
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
 * Memproses 1 tugas blast untuk partisipasi tertentu
 * @param {number} participationId
 * @returns {Promise<{ status: string, details?: any }>}
 */
async function processSingleBlastTask(participationId) {
  // 1. Ambil data partisipasi aktif
  const participation = await prisma.campaignParticipation.findUnique({
    where: { id: participationId },
    include: {
      user: true,
      device: true,
      campaign: true,
    },
  })

  if (!participation || participation.status !== 'active') {
    return { status: 'skipped', reason: 'Partisipasi tidak aktif' }
  }

  const { campaign, device, user } = participation

  // Periksa status kampanye
  if (campaign.status !== 'active') {
    return { status: 'paused', reason: 'Kampanye tidak aktif' }
  }

  // Periksa perangkat
  if (device.status !== 'connected' || device.deletedAt) {
    await prisma.campaignParticipation.update({
      where: { id: participation.id },
      data: { status: 'paused' },
    })
    return { status: 'paused', reason: 'Perangkat tidak terhubung atau dihapus' }
  }

  // 2. Periksa batas harian perangkat (reset harian)
  const currentDevice = await checkAndResetDailyLimit(device)
  if (currentDevice.sentToday >= currentDevice.dailyLimit) {
    console.log(`[Worker] Perangkat ${device.id} (${device.phone}) mencapai batas harian (${currentDevice.dailyLimit})`)
    return { status: 'daily_limit_reached', reason: 'Batas harian pengiriman perangkat tercapai' }
  }

  // 3. Alokasi Kontak / Tugas Secara Atomik
  let targetContact = null
  let candidateTask = null
  let isTargetModel = false

  if (campaign.categoryId) {
    // Alokasi Target kontak buatan admin berdasarkan ContactCategory aktif
    isTargetModel = true

    // Cari kandidat target yang berstatus 'none' dan BUKAN optOut
    const candidate = await prisma.target.findFirst({
      where: {
        categoryId: campaign.categoryId,
        queueStatus: 'none',
        optOut: false,
      },
      orderBy: { id: 'asc' },
    })

    if (!candidate) {
      // Tidak ada target berstatus 'none', cek apakah masih ada yang sedang antre/aktif
      const inProgressCount = await prisma.target.count({
        where: {
          categoryId: campaign.categoryId,
          queueStatus: { in: ['queued', 'active'] },
          optOut: false,
        },
      })

      if (inProgressCount === 0) {
        await prisma.blastCampaign.update({
          where: { id: campaign.id },
          data: { status: 'ended', endAt: new Date() },
        })
      }
      return { status: 'completed', reason: 'Seluruh target dalam kategori telah diproses' }
    }

    // Pastikan unik [campaignId, targetId] lintas member/perangkat
    const claimKey = `afblast:claim:camp_${campaign.id}:target_${candidate.id}`
    const acquired = await redis.set(claimKey, `${participation.id}:${device.id}`, 'NX', 'EX', 86400 * 7)
    if (acquired !== 'OK') {
      return { status: 'retry', reason: 'Target sedang/sudah diklaim oleh proses lain' }
    }

    // Alokasi atomik: updateMany none -> queued dengan batas 1 baris
    const claimResult = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.target.updateMany({
        where: {
          id: candidate.id,
          categoryId: campaign.categoryId,
          queueStatus: 'none',
          optOut: false,
        },
        data: {
          queueStatus: 'queued',
        },
      })

      if (updateResult.count > 0) {
        // Increment CategoryStats atomik
        await targetStatsService.updateCategoryStatsAtomic(tx, campaign.categoryId, {
          none: -1,
          queued: 1,
        })
      }

      return updateResult.count
    })

    if (claimResult === 0) {
      await redis.del(claimKey).catch(() => {})
      return { status: 'retry', reason: 'Target diambil oleh worker/perangkat lain' }
    }

    targetContact = {
      id: candidate.id,
      phone: candidate.phone,
      name: candidate.name,
      optOut: candidate.optOut,
    }
  } else {
    // Fallback lama jika kampanye berbasis batchId / BlastTask
    candidateTask = await prisma.blastTask.findFirst({
      where: {
        campaignId: campaign.id,
        status: 'pending',
      },
      include: {
        contact: true,
      },
      orderBy: { id: 'asc' },
    })

    if (!candidateTask) {
      const remainingPending = await prisma.blastTask.count({
        where: { campaignId: campaign.id, status: 'pending' },
      })
      if (remainingPending === 0) {
        await prisma.blastCampaign.update({
          where: { id: campaign.id },
          data: { status: 'ended', endAt: new Date() },
        })
      }
      return { status: 'completed', reason: 'Seluruh tugas kampanye telah selesai' }
    }

    const claimed = await prisma.blastTask.updateMany({
      where: {
        id: candidateTask.id,
        status: 'pending',
      },
      data: {
        status: 'processing',
        participationId: participation.id,
        startedAt: new Date(),
      },
    })

    if (claimed.count === 0) {
      return { status: 'retry', reason: 'Tugas diambil proses lain' }
    }

    if (candidateTask.contact.optOut) {
      await prisma.blastTask.update({
        where: { id: candidateTask.id },
        data: {
          status: 'skipped',
          error: 'Kontak telah memilih opt-out',
          updatedAt: new Date(),
        },
      })
      return { status: 'skipped', contactId: candidateTask.contactId, reason: 'Opt-out' }
    }

    targetContact = {
      id: candidateTask.id,
      phone: candidateTask.contact.phone,
      name: candidateTask.contact.name,
      optOut: candidateTask.contact.optOut,
    }
  }

  // 4. Ubah status target menjadi 'active' saat proses pengiriman dimulai
  if (isTargetModel) {
    await prisma.$transaction(async (tx) => {
      await tx.target.update({
        where: { id: targetContact.id },
        data: { queueStatus: 'active' },
      })
      await targetStatsService.updateCategoryStatsAtomic(tx, campaign.categoryId, {
        queued: -1,
        active: 1,
      })
    })
  }

  // 5. Render caption
  const finalCaption = renderCaption(
    campaign.caption,
    targetContact.name,
    campaign.buttonLabel,
    campaign.buttonUrl
  )

  // 6. Kirim pesan lewat adapter watsap dengan retry maksimal 2 kali
  let attempt = 0
  let sendSuccess = false
  let lastError = null
  let providerMsgId = null

  while (attempt < 3 && !sendSuccess) {
    attempt++
    try {
      const sendRes = await watsap.sendImage({
        deviceId: currentDevice.externalDeviceId || currentDevice.id,
        phone: targetContact.phone,
        imageUrl: campaign.imageUrl,
        caption: finalCaption,
      })
      sendSuccess = true
      providerMsgId = sendRes.providerMsgId || null
    } catch (err) {
      lastError = err
      if (err.status === 429) {
        const backoffSeconds = err.retryAfter || 5
        console.warn(`[Worker] Gateway 429 Rate Limit pada device ${currentDevice.id}. Menghormati Retry-After ${backoffSeconds}s...`)
        if (attempt < 3 && backoffSeconds <= 5) {
          await new Promise((r) => setTimeout(r, backoffSeconds * 1000))
        } else {
          break
        }
      } else if (attempt < 3) {
        // Jeda singkat antar retry biasa (500ms)
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  // 7. Proses Hasil Pengiriman & Update Status Atomik
  if (sendSuccess) {
    if (isTargetModel) {
      await prisma.$transaction(async (tx) => {
        await tx.target.update({
          where: { id: targetContact.id },
          data: { queueStatus: 'success', lastError: null },
        })
        await targetStatsService.updateCategoryStatsAtomic(tx, campaign.categoryId, {
          active: -1,
          success: 1,
        })
        await tx.blastLog.create({
          data: {
            userId: user.id,
            deviceId: currentDevice.id,
            campaignId: campaign.id,
            phone: targetContact.phone,
            status: 'sent',
            providerMsgId,
          },
        })
      })
      await targetStatsService.invalidateStatsCache()
    } else {
      await prisma.blastTask.update({
        where: { id: candidateTask.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          error: null,
        },
      })
      await prisma.blastLog.create({
        data: {
          userId: user.id,
          deviceId: currentDevice.id,
          campaignId: campaign.id,
          phone: targetContact.phone,
          status: 'sent',
          providerMsgId,
        },
      })
    }

    // Update perangkat: reset kegagalan berturut-turut & tambah hitungan
    await prisma.device.update({
      where: { id: currentDevice.id },
      data: {
        sentToday: { increment: 1 },
        consecutiveFails: 0,
        lastSeenAt: new Date(),
      },
    })

    return { status: 'sent', targetId: targetContact.id, providerMsgId }
  } else {
    // Gagal setelah retry maksimal 2 kali
    const errorMsg = lastError?.message || 'Gagal mengirim pesan setelah retry'

    if (isTargetModel) {
      await prisma.$transaction(async (tx) => {
        await tx.target.update({
          where: { id: targetContact.id },
          data: { queueStatus: 'failed', lastError: errorMsg },
        })
        await targetStatsService.updateCategoryStatsAtomic(tx, campaign.categoryId, {
          active: -1,
          failed: 1,
        })
        await tx.blastLog.create({
          data: {
            userId: user.id,
            deviceId: currentDevice.id,
            campaignId: campaign.id,
            phone: targetContact.phone,
            status: 'failed',
            error: errorMsg,
          },
        })
      })
      await targetStatsService.invalidateStatsCache()
    } else {
      await prisma.blastTask.update({
        where: { id: candidateTask.id },
        data: {
          status: 'failed',
          error: errorMsg,
        },
      })
      await prisma.blastLog.create({
        data: {
          userId: user.id,
          deviceId: currentDevice.id,
          campaignId: campaign.id,
          phone: targetContact.phone,
          status: 'failed',
          error: errorMsg,
        },
      })
    }

    // Tambah kegagalan berturut-turut pada perangkat
    const updatedDev = await prisma.device.update({
      where: { id: currentDevice.id },
      data: {
        consecutiveFails: { increment: 1 },
      },
    })

    // Hentikan/putuskan perangkat setelah 5 kegagalan berturut-turut
    if (updatedDev.consecutiveFails >= 5) {
      console.warn(`[Worker] Perangkat ${updatedDev.id} dihentikan otomatis karena 5 kegagalan berturut-turut!`)
      await prisma.device.update({
        where: { id: updatedDev.id },
        data: { status: 'disconnected' },
      })
      await prisma.campaignParticipation.updateMany({
        where: { deviceId: updatedDev.id, status: 'active' },
        data: { status: 'paused' },
      })
    }

    return { status: 'failed', targetId: targetContact.id, error: errorMsg }
  }
}

/**
 * Menjadwalkan pengiriman berikutnya untuk partisipasi dalam queue BullMQ
 * @param {number} participationId
 * @param {number} delaySeconds
 */
async function scheduleNextBlast(participationId, delaySeconds = 0) {
  if (!blastQueue) return
  try {
    await blastQueue.add(
      'blast-task',
      { participationId },
      {
        delay: delaySeconds * 1000,
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    )
  } catch (err) {
    console.warn('[BullMQ] Gagal menjadwalkan job:', err.message)
  }
}

/**
 * Menjadwalkan langkah pengiriman blast per perangkat
 */
async function scheduleDeviceStep(deviceId, runId, delayMs = 0) {
  if (!blastQueue) return
  try {
    await blastQueue.add(
      'device-blast-step',
      { deviceId, runId },
      {
        delay: Math.max(0, delayMs),
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    )
  } catch (err) {
    console.warn('[BullMQ] Gagal menjadwalkan device-blast-step:', err.message)
  }
}

/**
 * Mendaftarkan cron job harian BullMQ untuk membersihkan PasswordResetRequest kedaluwarsa > 24 jam
 */
async function scheduleCleanupResetRequests() {
  if (!blastQueue) return
  try {
    await blastQueue.add(
      'cleanup-expired-reset-requests',
      {},
      {
        repeat: { pattern: '0 3 * * *' }, // Tiap pukul 03:00 pagi setiap hari
        removeOnComplete: true,
        removeOnFail: true,
      }
    )
  } catch (err) {
    console.warn('[BullMQ] Gagal mendaftarkan cron pembersihan reset request:', err.message)
  }
}

/**
 * Mendaftarkan cron job harian rekonsiliasi counter target & kategori (stats.reconcile)
 */
async function scheduleDailyReconciliation() {
  if (!blastQueue) return
  try {
    await blastQueue.add(
      'stats.reconcile',
      {},
      {
        repeat: { pattern: '0 4 * * *' }, // Tiap pukul 04:00 pagi setiap hari
        removeOnComplete: true,
        removeOnFail: true,
      }
    )
  } catch (err) {
    console.warn('[BullMQ] Gagal mendaftarkan cron rekonsiliasi counter:', err.message)
  }
}

/**
 * Mendaftarkan cron job harian backup database otomatis
 */
async function scheduleDailyBackup() {
  if (!blastQueue) return
  try {
    await blastQueue.add(
      'daily-backup',
      {},
      {
        repeat: { pattern: '0 2 * * *' }, // Tiap pukul 02:00 pagi setiap hari
        removeOnComplete: true,
        removeOnFail: true,
      }
    )
  } catch (err) {
    console.warn('[BullMQ] Gagal mendaftarkan cron backup database:', err.message)
  }
}

/**
 * Inisialisasi BullMQ Worker
 */
let bullWorker = null

function startWorker() {
  if (bullWorker) return bullWorker

  try {
    bullWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        // Cron harian pembersihan PasswordResetRequest yang kedaluwarsa > 24 jam
        if (job.name === 'cleanup-expired-reset-requests') {
          const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const result = await prisma.passwordResetRequest.deleteMany({
            where: {
              expiresAt: { lt: threshold },
            },
          })
          return { deletedRequests: result.count }
        }

        // Job BullMQ harian stats.reconcile (recalculate per kategori dari tabel Target)
        if (job.name === 'stats.reconcile' || job.name === 'daily-reconciliation') {
          return await targetStatsService.recalculateStats()
        }

        // Cron harian backup database otomatis dengan retensi
        if (job.name === 'daily-backup') {
          const { performBackup } = require('./controllers/adminBackupController')
          const backup = await performBackup({ type: 'scheduled' })
          const setting = await prisma.siteSetting.findUnique({ where: { key: 'backupRetentionDays' } })
          const retentionDays = parseInt(setting?.value || '30', 10)
          const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
          const oldBackups = await prisma.backupFile.findMany({
            where: { createdAt: { lt: cutoffDate }, type: 'scheduled' },
          })
          const fs = require('fs')
          const path = require('path')
          const BACKUP_DIR = path.join(__dirname, '../backups')
          for (const b of oldBackups) {
            const p = path.join(BACKUP_DIR, b.filePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
            await prisma.backupFile.delete({ where: { id: b.id } })
          }
          return { backupId: backup.id, cleanedCount: oldBackups.length }
        }

        // Notifikasi Telegram otomatis lewat antrean BullMQ
        if (job.name === 'telegram-notification') {
          const { chatId, message } = job.data
          if (chatId && message) {
            const { sendDirectBotMessage } = require('./telegram/bot')
            await sendDirectBotMessage(chatId, message)
          }
          return { success: true }
        }

        // Job eksekusi mesin blast per perangkat
        if (job.name === 'device-blast-step') {
          const { deviceId, runId } = job.data
          const { processDeviceStep } = require('./services/blastEngine.service')
          return await processDeviceStep(deviceId, runId)
        }

        const { participationId } = job.data
        if (!participationId) return

        const result = await processSingleBlastTask(participationId)

        // Jika berhasil atau skipped, dan kampanye masih berjalan, jadwalkan tugas berikutnya dengan delay acak
        if (result.status === 'sent' || result.status === 'skipped' || result.status === 'retry') {
          const { delayMin, delayMax } = await getBlastSettings()
          const randomDelay = Math.floor(delayMin + Math.random() * (delayMax - delayMin + 1))
          await scheduleNextBlast(participationId, randomDelay)
        }

        return result
      },
      { connection: redisConnection, concurrency: 5 }
    )

    // Daftarkan cron harian pembersihan reset request, rekonsiliasi, dan backup
    scheduleCleanupResetRequests()
    scheduleDailyReconciliation()
    scheduleDailyBackup()

    bullWorker.on('completed', (job, result) => {
      // console.log(`[BullMQ Worker] Job ${job.id} selesai:`, result?.status)
    })

    bullWorker.on('failed', (job, err) => {
      console.error(`[BullMQ Worker] Job ${job.id} gagal:`, err.message)
    })

    console.log('[BullMQ] WhatsApp Blast Worker siap memproses antrean.')
  } catch (err) {
    console.warn('[BullMQ] Gagal menginisialisasi Worker:', err.message)
  }

  // Inisialisasi Worker Notifikasi Pembayaran ke Grup Telegram
  startPaymentWorker()

  return bullWorker
}

/**
 * Worker BullMQ khusus untuk Notifikasi Penarikan ke Grup Telegram (@AFBlastPaymentBot)
 * - Mengambil notifikasi secara atomik
 * - Rate limit: Maksimal 15 pesan/menit (limiter BullMQ)
 * - Concurrency: 1 agar pesan terkirim berurutan sesuai waktu kejadian
 * - Timeout 10 detik per request HTTP
 * - Penanganan 429 (retry_after) & 5xx (backoff eksponensial hingga 5 kali)
 * - Penanganan 400/403 langsung failed dengan pesan aman
 */
let paymentWorker = null

function startPaymentWorker() {
  if (paymentWorker) return paymentWorker

  try {
    paymentWorker = new Worker(
      PAYMENT_QUEUE_NAME,
      async (job) => {
        const { notificationId } = job.data
        if (!notificationId) return { skipped: true }
        return await processSinglePaymentNotification(notificationId)
      },
      {
        connection: redisConnection,
        concurrency: 1, // Urut sesuai waktu kejadian
        limiter: {
          max: 15,
          duration: 60000, // 15 pesan per menit
        },
      }
    )

    paymentWorker.on('completed', (job, result) => {
      // Job selesai
    })

    paymentWorker.on('failed', (job, err) => {
      console.warn(`[BullMQ Payment Worker] Job ${job.id} gagal:`, err.message)
    })

    console.log('[BullMQ] Payment Notification Worker siap memproses antrean.')

    // Pulihkan notifikasi pending yang tertunda saat worker hidup kembali
    resumePendingPaymentNotifications().catch((err) => {
      console.warn('[BullMQ] Gagal memulihkan pending payment notifications:', err.message)
    })
  } catch (err) {
    console.warn('[BullMQ] Gagal menginisialisasi Payment Worker:', err.message)
  }

  return paymentWorker
}

/**
 * Memproses 1 notifikasi pembayaran secara atomik
 * @param {number} notificationId
 */
async function processSinglePaymentNotification(notificationId) {
  const notif = await prisma.paymentNotification.findUnique({
    where: { id: notificationId },
    include: { withdrawal: { include: { user: true } } },
  })

  if (!notif) {
    return { skipped: true, reason: 'Notifikasi tidak ditemukan' }
  }

  if (notif.status !== 'pending') {
    return { skipped: true, reason: `Status notifikasi sudah '${notif.status}'` }
  }

  // Update attempts
  const updatedNotif = await prisma.paymentNotification.update({
    where: { id: notificationId },
    data: { attempts: { increment: 1 } },
  })

  // Ekstrak pesan dari payload
  const text = notif.payload?.text
  if (!text) {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: {
        status: 'failed',
        lastError: 'Payload teks tidak ditemukan',
      },
    })
    return { failed: true, error: 'Empty text payload' }
  }

  const { sendTelegramPaymentMessage } = require('./telegram/paymentBot')
  const result = await sendTelegramPaymentMessage({ text })

  if (result.ok) {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: {
        status: 'sent',
        telegramMessageId: result.messageId || null,
        sentAt: new Date(),
        lastError: null,
      },
    })
    return { success: true, messageId: result.messageId }
  }

  // Tangani error fatal (400, 403, konfigurasi hilang) -> langsung failed, jangan ulang
  if (result.isFatal) {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: {
        status: 'failed',
        lastError: result.error,
      },
    })
    return { failed: true, fatal: true, error: result.error }
  }

  // Tangani rate limit (429)
  if (result.isRateLimit) {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: { lastError: result.error },
    })
    const delayMs = (result.retryAfter || 5) * 1000
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    throw new Error(result.error) // Biarkan BullMQ mencoba lagi setelah jeda
  }

  // Tangani transient error (5xx, jaringan, timeout)
  if (updatedNotif.attempts >= 5) {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: {
        status: 'failed',
        lastError: result.error || 'Batas maksimal 5 kali percobaan tercapai',
      },
    })
    return { failed: true, error: result.error }
  } else {
    await prisma.paymentNotification.update({
      where: { id: notificationId },
      data: { lastError: result.error },
    })
    throw new Error(result.error || 'Gagal mengirim pesan Telegram, mencoba kembali...')
  }
}

/**
 * Menjadwalkan pengiriman payment notification ke antrean BullMQ
 * @param {number} notificationId
 */
async function queuePaymentNotification(notificationId) {
  if (!notificationId) return

  try {
    if (paymentQueue) {
      await paymentQueue.add(
        'send-payment-notification',
        { notificationId },
        {
          jobId: `payment-${notificationId}`,
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
      return
    }
  } catch (err) {
    console.warn('[BullMQ] Gagal menambahkan ke paymentQueue:', err.message)
  }

  // Fallback langsung jika queue tidak tersedia
  processSinglePaymentNotification(notificationId).catch((err) => {
    console.error('[Payment Fallback] Error pemrosesan:', err.message)
  })
}

/**
 * Memulihkan dan memasukkan semua notifikasi berstatus pending ke antrean saat worker dimulai
 */
async function resumePendingPaymentNotifications() {
  try {
    const pendingNotifs = await prisma.paymentNotification.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    if (pendingNotifs.length > 0) {
      console.log(`[BullMQ] Memulihkan ${pendingNotifs.length} notifikasi pembayaran tertunda...`)
      for (const notif of pendingNotifs) {
        await queuePaymentNotification(notif.id)
      }
    }
  } catch (err) {
    console.warn('[BullMQ] Error saat memulihkan pending notifikasi:', err.message)
  }
}

// Eksekusi langsung jika dipanggil via node src/worker.js
if (require.main === module) {
  startWorker()
  console.log('Worker running in standalone process. Press Ctrl+C to stop.')
}

/**
 * Menjadwalkan pengiriman notifikasi Telegram ke antrean BullMQ (dengan fallback langsung jika antrean tertunda)
 * @param {string} chatId
 * @param {string} message
 */
async function queueTelegramNotification(chatId, message) {
  if (!chatId || !message) return
  try {
    if (blastQueue) {
      await blastQueue.add(
        'telegram-notification',
        { chatId, message },
        { removeOnComplete: true, removeOnFail: true }
      )
      return
    }
  } catch (err) {
    // Fallback jika Redis/queue bermasalah
  }

  // Fallback langsung
  try {
    const { sendDirectBotMessage } = require('./telegram/bot')
    await sendDirectBotMessage(chatId, message)
  } catch (err) {
    // Tangani tanpa crash
  }
}

module.exports = {
  blastQueue,
  paymentQueue,
  startWorker,
  startPaymentWorker,
  processSingleBlastTask,
  scheduleNextBlast,
  scheduleDeviceStep,
  getBlastSettings,
  renderCaption,
  checkAndResetDailyLimit,
  queueTelegramNotification,
  queuePaymentNotification,
  processSinglePaymentNotification,
  resumePendingPaymentNotifications,
}
