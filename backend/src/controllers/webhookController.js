const crypto = require('crypto')
const prisma = require('../config/db')
const { publishAdminEvent, publishMemberEvent } = require('../utils/sseManager')
const targetStatsService = require('../services/targetStats.service')
const blastEngine = require('../services/blastEngine.service')

const WATSAP_SECRET = process.env.WATSAP_WEBHOOK_SECRET || 'afblast_watsap_webhook_secret_key_2026'
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 // 5 menit

/**
 * Verifikasi signature HMAC SHA-256 dan timestamp
 * Header yang diharapkan:
 * - X-Watsap-Signature: sha256 hex digest
 * - X-Watsap-Timestamp: unix timestamp dalam milidetik atau detik
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-watsap-signature'] || req.headers['x-signature']
  const timestampHeader = req.headers['x-watsap-timestamp'] || req.headers['x-timestamp']

  if (!signature) {
    return { valid: false, error: 'Signature header (X-Watsap-Signature) tidak ditemukan' }
  }

  // Verifikasi timestamp untuk mencegah replay attack
  let timestampMs = Date.now()
  if (timestampHeader) {
    const rawTs = parseInt(timestampHeader, 10)
    // Jika format detik, konversi ke ms
    timestampMs = rawTs < 10000000000 ? rawTs * 1000 : rawTs
    const delta = Math.abs(Date.now() - timestampMs)
    if (delta > TIMESTAMP_TOLERANCE_MS) {
      return { valid: false, error: 'Timestamp kedaluwarsa atau selisih waktu terlalu besar' }
    }
  }

  // Payload string
  const payloadString = JSON.stringify(req.body)
  const dataToSign = timestampHeader ? `${timestampHeader}.${payloadString}` : payloadString

  const expectedHmac = crypto.createHmac('sha256', WATSAP_SECRET).update(dataToSign).digest('hex')
  const expectedAltHmac = crypto.createHmac('sha256', WATSAP_SECRET).update(payloadString).digest('hex')

  let valid = false
  if (signature === expectedHmac || signature === expectedAltHmac) {
    valid = true
  } else {
    try {
      const sigBuf = Buffer.from(signature, 'hex')
      const expBuf = Buffer.from(expectedHmac, 'hex')
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        valid = true
      }
    } catch (_) {}
  }

  if (!valid) {
    return { valid: false, error: 'Signature HMAC tidak valid' }
  }

  return { valid: true }
}

/**
 * POST /api/webhooks/watsap
 * Webhook handler watsap.id
 *
 * TODO: Dokumentasi API watsap.id resmi belum dirilis secara publik.
 * Format payload di bawah ini disesuaikan dengan webhook standar WhatsApp provider
 * (providerMsgId, phone, status: sent|delivered|read|failed, text untuk inbound reply).
 * Jangan mengarang endpoint eksternal sebelum dokumentasi watsap.id resmi diperoleh.
 */
async function handleWatsapWebhook(req, res) {
  try {
    const isMock = req.query.mock === 'true' || req.body.mock === true || req.headers['x-mock-mode'] === 'true'

    // 1. Verifikasi HMAC (kecuali jika dalam mode mock eksplisit untuk pengetesan UI)
    if (!isMock) {
      const auth = verifyWebhookSignature(req)
      if (!auth.valid) {
        return res.status(401).json({ error: auth.error })
      }
    }

    const {
      event, // device.connected | device.disconnected | device.logged_out | message.sent | dll
      deviceId,
      providerMsgId,
      campaignId,
      taskId,
      phone,
      status: rawStatus, // sent | delivered | read | failed
      text, // Isi pesan balasan inbound jika ada
      error: errorReason,
    } = req.body

    const status = rawStatus || (event && event.startsWith('message.') ? event.replace('message.', '') : null)

    // 2. Mode Mock Simulation: mensimulasikan delivered 90% dan read 40% untuk pengujian UI
    if (isMock) {
      const mockResult = await simulateMockDelivery(req.body)
      return res.status(200).json({
        message: 'Mock simulation berhasil diproses',
        simulation: mockResult,
      })
    }

    // 3. Penanganan Event Perangkat (device.connected, device.disconnected, device.logged_out)
    if (event === 'device.connected' || event === 'device.disconnected' || event === 'device.logged_out') {
      const targetDeviceId = deviceId ? (isNaN(deviceId) ? String(deviceId) : parseInt(deviceId, 10)) : null
      if (targetDeviceId) {
        const existingDevice = await prisma.device.findFirst({
          where: {
            OR: [
              ...(typeof targetDeviceId === 'number' ? [{ id: targetDeviceId }] : []),
              { externalDeviceId: String(targetDeviceId) },
            ],
          },
          include: { user: true },
        })

        if (existingDevice) {
          if (event === 'device.connected') {
            await prisma.device.update({
              where: { id: existingDevice.id },
              data: {
                status: 'connected',
                phone: phone || existingDevice.phone,
                linkedAt: new Date(),
                lastSeenAt: new Date(),
                disconnectedReason: null,
              },
            })

            publishMemberEvent(existingDevice.userId, 'device.status', {
              deviceId: existingDevice.id,
              status: 'connected',
              phone: blastEngine.maskPhone(phone || existingDevice.phone),
            })
          } else if (event === 'device.disconnected' || event === 'device.logged_out') {
            const stopReason = event === 'device.logged_out' ? 'logout' : 'disconnected'

            // Hentikan run mesin blast jika sedang berjalan
            await blastEngine.stopDevice(existingDevice.id, existingDevice.userId, stopReason).catch((err) => {
              console.warn(`[Webhook] stopDevice warning on ${existingDevice.id}:`, err.message)
            })

            await prisma.device.update({
              where: { id: existingDevice.id },
              data: {
                status: event === 'device.logged_out' ? 'logged_out' : 'disconnected',
                engineState: 'idle',
                disconnectedReason: stopReason,
                lastLogoutAt: event === 'device.logged_out' ? new Date() : existingDevice.lastLogoutAt,
                lastSeenAt: new Date(),
              },
            })

            // Mengembalikan target queued yang belum terkirim ke status none
            if (existingDevice.categoryId) {
              const queuedTargets = await prisma.target.findMany({
                where: { categoryId: existingDevice.categoryId, queueStatus: 'queued' },
                take: 1000,
              })
              if (queuedTargets.length > 0) {
                await prisma.$transaction(async (tx) => {
                  await tx.target.updateMany({
                    where: { id: { in: queuedTargets.map((t) => t.id) } },
                    data: { queueStatus: 'none' },
                  })
                  await targetStatsService.updateCategoryStatsAtomic(tx, existingDevice.categoryId, {
                    queued: -queuedTargets.length,
                    none: queuedTargets.length,
                  })
                })
                await targetStatsService.invalidateStatsCache()
              }
            }

            // Kirim notifikasi Telegram ke member jika akun terverifikasi
            const memberUser = existingDevice.user
            if (memberUser && memberUser.telegramChatId && memberUser.telegramVerifiedAt) {
              const maskedNum = blastEngine.maskPhone(existingDevice.phone || phone)
              const tgText = `Nomor ${maskedNum} terputus dari WhatsApp. Sambungkan ulang di dashboard`
              try {
                const { sendDirectBotMessage } = require('../telegram/bot')
                await sendDirectBotMessage(memberUser.telegramChatId, tgText)
              } catch (tgErr) {
                console.warn('[Webhook] Gagal mengirim notifikasi Telegram ke member:', tgErr.message)
              }
            }

            // Realtime SSE event ke member
            publishMemberEvent(existingDevice.userId, 'device.status', {
              deviceId: existingDevice.id,
              status: event === 'device.logged_out' ? 'logged_out' : 'disconnected',
              phone: blastEngine.maskPhone(existingDevice.phone || phone),
              reason: stopReason,
            })
            publishMemberEvent(existingDevice.userId, 'engine.stopped', {
              deviceId: existingDevice.id,
              reason: stopReason,
            })

            // Jeda otomatis seluruh partisipasi aktif yang menggunakan perangkat ini (legacy)
            await prisma.campaignParticipation.updateMany({
              where: { deviceId: existingDevice.id, status: 'active' },
              data: { status: 'paused' },
            }).catch(() => {})
          }
        }
      }

      publishAdminEvent('device.status', {
        deviceId,
        event,
        phone: blastEngine.maskPhone(phone),
      })

      return res.status(200).json({ status: 'device_event_processed', event, deviceId })
    }

    // 4. Cek apakah ini pesan balasan "STOP" / "BERHENTI" dari penerima -> otomatis optOut
    if (text && typeof text === 'string') {
      const upperText = text.trim().toUpperCase()
      if (upperText === 'STOP' || upperText === 'BERHENTI') {
        if (phone) {
          const cleanPhone = phone.replace(/\D/g, '')
          const matchingTargets = await prisma.target.findMany({
            where: { phone: { contains: cleanPhone }, optOut: false },
          })

          if (matchingTargets.length > 0) {
            await prisma.$transaction(async (tx) => {
              await tx.target.updateMany({
                where: { id: { in: matchingTargets.map((t) => t.id) } },
                data: { optOut: true, lastError: 'Opt-out diminta oleh pengguna melalui balasan WhatsApp' },
              })

              for (const target of matchingTargets) {
                await targetStatsService.updateCategoryStatsAtomic(tx, target.categoryId, {
                  [target.queueStatus]: -1,
                  optOut: 1,
                })
              }
            })
            await targetStatsService.invalidateStatsCache()
            console.log(`[Webhook] Target ${cleanPhone} ditandai sebagai opt-out (STOP/BERHENTI).`)
          }
        }
        return res.status(200).json({ status: 'opt_out_processed' })
      }
    }

    if (!providerMsgId || !status) {
      return res.status(400).json({ error: 'providerMsgId dan status wajib disertakan dalam webhook' })
    }

    // 4. Idempotent lewat MessageEvent unik [providerMsgId, status]
    let messageEvent = null
    let resolvedCampaignId = null
    if (campaignId) {
      const camp = await prisma.blastCampaign.findUnique({ where: { id: parseInt(campaignId, 10) } })
      if (camp) resolvedCampaignId = camp.id
    }
    if (!resolvedCampaignId) {
      const defaultCamp = await prisma.blastCampaign.findFirst({ select: { id: true } })
      if (defaultCamp) resolvedCampaignId = defaultCamp.id
    }

    if (resolvedCampaignId) {
      try {
        messageEvent = await prisma.messageEvent.create({
          data: {
            campaignId: resolvedCampaignId,
            taskId: taskId ? parseInt(taskId, 10) : null,
            providerMsgId,
            status,
            at: new Date(),
          },
        })
      } catch (e) {
        // Kode P2002 di Prisma adalah unique constraint violation (idempotency check)
        if (e.code === 'P2002') {
          return res.status(200).json({ status: 'duplicate_event_ignored' })
        }
        console.warn('[Webhook] MessageEvent create warning:', e.message)
      }
    }

    // 5. Perbarui counter di BlastCampaign jika campaignId valid
    if (campaignId) {
      const campId = parseInt(campaignId, 10)
      const counterUpdate = {}
      if (status === 'sent') counterUpdate.sentCount = { increment: 1 }
      if (status === 'delivered') counterUpdate.deliveredCount = { increment: 1 }
      if (status === 'read') counterUpdate.readCount = { increment: 1 }
      if (status === 'failed') counterUpdate.failedCount = { increment: 1 }

      if (Object.keys(counterUpdate).length > 0) {
        await prisma.blastCampaign.update({
          where: { id: campId },
          data: counterUpdate,
        }).catch((err) => console.warn('Update campaign counter warning:', err.message))
      }
    }

    // 6. Perbarui Target.queueStatus secara atomik
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '')
      let newQueueStatus = null
      if (status === 'delivered' || status === 'read') newQueueStatus = 'success'
      if (status === 'failed') newQueueStatus = 'failed'

      if (newQueueStatus) {
        const matchingTargets = await prisma.target.findMany({
          where: {
            phone: { contains: cleanPhone },
            queueStatus: { in: ['none', 'queued', 'active'] },
            optOut: false,
          },
        })

        if (matchingTargets.length > 0) {
          await prisma.$transaction(async (tx) => {
            await tx.target.updateMany({
              where: { id: { in: matchingTargets.map((t) => t.id) } },
              data: {
                queueStatus: newQueueStatus,
                lastError: status === 'failed' ? errorReason || 'Pengiriman gagal' : null,
              },
            })

            for (const target of matchingTargets) {
              await targetStatsService.updateCategoryStatsAtomic(tx, target.categoryId, {
                [target.queueStatus]: -1,
                [newQueueStatus]: 1,
              })
            }
          })
          await targetStatsService.invalidateStatsCache()
        }
      }
    }

    // Kirim notifikasi realtime SSE
    publishAdminEvent('campaign.progress', {
      campaignId,
      status,
      providerMsgId,
      phone,
    })

    return res.status(200).json({ status: 'processed', eventId: messageEvent.id })
  } catch (error) {
    console.error('Error in handleWatsapWebhook:', error)
    return res.status(500).json({ error: 'Gagal memproses webhook', details: error.message })
  }
}

/**
 * Simulasi mock delivered 90% dan read 40%
 */
async function simulateMockDelivery({ campaignId, sampleSize = 10 }) {
  const campId = campaignId ? parseInt(campaignId, 10) : null
  const results = {
    total: sampleSize,
    sent: sampleSize,
    delivered: Math.round(sampleSize * 0.9),
    read: Math.round(sampleSize * 0.4),
    failed: sampleSize - Math.round(sampleSize * 0.9),
  }

  if (campId) {
    await prisma.blastCampaign.update({
      where: { id: campId },
      data: {
        sentCount: { increment: results.sent },
        deliveredCount: { increment: results.delivered },
        readCount: { increment: results.read },
        failedCount: { increment: results.failed },
      },
    }).catch((e) => console.warn('Mock update campaign warning:', e.message))

    // Buat event contoh
    const fakeMsgId = `mock_${Date.now()}`
    try {
      await prisma.messageEvent.createMany({
        data: [
          { campaignId: campId, providerMsgId: `${fakeMsgId}_1`, status: 'sent' },
          { campaignId: campId, providerMsgId: `${fakeMsgId}_1`, status: 'delivered' },
          { campaignId: campId, providerMsgId: `${fakeMsgId}_1`, status: 'read' },
        ],
        skipDuplicates: true,
      })
    } catch (_) {}

    publishAdminEvent('campaign.progress', {
      campaignId: campId,
      mockSimulation: results,
    })
  }

  return results
}

/**
 * POST /api/webhooks/waha
 * Webhook handler resmi untuk WAHA (WhatsApp HTTP API)
 */
async function handleWahaWebhook(req, res) {
  try {
    const { event, session, payload, engine } = req.body || {}

    if (!event) {
      return res.status(400).json({ error: 'Field event wajib disertakan dalam webhook WAHA' })
    }

    // 1. Ekstraksi Device ID dari session name (misal: device_59 -> 59)
    let deviceId = null
    if (session && session.startsWith('device_')) {
      const parsedId = parseInt(session.replace('device_', ''), 10)
      if (!isNaN(parsedId)) deviceId = parsedId
    }

    // Cari device di database
    let existingDevice = null
    if (deviceId) {
      existingDevice = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { user: true },
      })
    } else if (session) {
      existingDevice = await prisma.device.findFirst({
        where: {
          OR: [{ externalDeviceId: session }, { externalDeviceId: `watsap_${session}` }],
        },
        include: { user: true },
      })
    }

    // Fallback jika single-session (WAHA Core default session)
    if (!existingDevice && session === 'default' && payload?.me?.id) {
      const cleanPhone = String(payload.me.id).replace(/[^0-9]/g, '')
      existingDevice = await prisma.device.findFirst({
        where: { phone: cleanPhone, deletedAt: null },
        include: { user: true },
      })
    }

    // 2. Penanganan Event: session.status
    if (event === 'session.status') {
      const rawStatus = (payload?.status || '').toUpperCase()

      if (existingDevice) {
        if (rawStatus === 'WORKING' || rawStatus === 'CONNECTED') {
          let detectedPhone = existingDevice.phone
          if (payload?.me?.id) {
            detectedPhone = String(payload.me.id).replace(/[^0-9]/g, '')
          }

          await prisma.device.update({
            where: { id: existingDevice.id },
            data: {
              status: 'connected',
              phone: detectedPhone || existingDevice.phone,
              linkedAt: existingDevice.linkedAt || new Date(),
              lastSeenAt: new Date(),
              disconnectedReason: null,
            },
          })

          publishMemberEvent(existingDevice.userId, 'device.status', {
            deviceId: existingDevice.id,
            status: 'connected',
            phone: blastEngine.maskPhone(detectedPhone || existingDevice.phone),
          })

          return res.status(200).json({ success: true, action: 'device_connected' })
        } else if (rawStatus === 'STOPPED') {
          await blastEngine.stopDevice(existingDevice.id, existingDevice.userId, 'disconnected').catch(() => {})

          await prisma.device.update({
            where: { id: existingDevice.id },
            data: {
              status: 'disconnected',
              engineState: 'idle',
              disconnectedReason: 'disconnected',
              lastSeenAt: new Date(),
            },
          })

          publishMemberEvent(existingDevice.userId, 'device.status', {
            deviceId: existingDevice.id,
            status: 'disconnected',
            phone: blastEngine.maskPhone(existingDevice.phone),
          })

          return res.status(200).json({ success: true, action: 'device_disconnected' })
        } else if (rawStatus === 'FAILED' || rawStatus === 'LOGGED_OUT') {
          await blastEngine.stopDevice(existingDevice.id, existingDevice.userId, 'logout').catch(() => {})

          await prisma.device.update({
            where: { id: existingDevice.id },
            data: {
              status: 'logged_out',
              engineState: 'idle',
              disconnectedReason: 'logout',
              lastLogoutAt: new Date(),
              lastSeenAt: new Date(),
            },
          })

          publishMemberEvent(existingDevice.userId, 'device.status', {
            deviceId: existingDevice.id,
            status: 'logged_out',
            disconnectedReason: 'logout',
            phone: blastEngine.maskPhone(existingDevice.phone),
          })

          return res.status(200).json({ success: true, action: 'device_logged_out' })
        }
      }

      return res.status(200).json({ success: true, message: `Status ${rawStatus} tercatat` })
    }

    // 3. Penanganan Event: message.ack (Status terkirim, delivered, read)
    if (event === 'message.ack' && payload) {
      const msgId = payload.id || payload.messageId
      const ackVal = payload.ack // 1: sent, 2: delivered, 3: read
      const ackName = (payload.ackName || '').toUpperCase()

      let status = null
      if (ackVal === 3 || ackName === 'READ') {
        status = 'read'
      } else if (ackVal === 2 || ackName === 'DELIVERED') {
        status = 'delivered'
      } else if (ackVal === 1 || ackName === 'SENT') {
        status = 'sent'
      }

      if (msgId && status) {
        const blastLog = await prisma.blastLog.findFirst({
          where: { providerMsgId: msgId },
          include: { campaign: true },
        })

        if (blastLog) {
          await prisma.blastLog.update({
            where: { id: blastLog.id },
            data: { status },
          })

          if (blastLog.campaignId) {
            await prisma.messageEvent.create({
              data: {
                campaignId: blastLog.campaignId,
                providerMsgId: msgId,
                status,
              },
            }).catch(() => {})

            publishAdminEvent('campaign.progress', {
              campaignId: blastLog.campaignId,
              providerMsgId: msgId,
              status,
            })
          }
        }
      }

      return res.status(200).json({ success: true, action: 'message_ack_processed' })
    }

    // 4. Penanganan Event Inbound Reply / Opt-Out (STOP / BERHENTI)
    if (event === 'message' && payload && !payload.fromMe) {
      const bodyText = (payload.body || payload.text || '').trim().toUpperCase()
      const rawFrom = payload.from || ''
      const cleanPhone = rawFrom.replace(/[^0-9]/g, '')

      if (
        bodyText === 'STOP' ||
        bodyText === 'BERHENTI' ||
        bodyText === 'UNSUBSCRIBE' ||
        bodyText === 'KELUAR'
      ) {
        if (cleanPhone) {
          await prisma.target.updateMany({
            where: { phone: cleanPhone },
            data: { isOptedOut: true },
          })
          console.log(`[WAHA Webhook] Target ${cleanPhone} opt-out (STOP).`)
        }
      }

      return res.status(200).json({ success: true, action: 'inbound_message_processed' })
    }

    return res.status(200).json({ success: true, message: `Event ${event} diterima` })
  } catch (error) {
    console.error('[WAHA Webhook] Error handleWahaWebhook:', error)
    return res.status(500).json({ error: 'Gagal memproses webhook WAHA', details: error.message })
  }
}

module.exports = {
  handleWatsapWebhook,
  handleWahaWebhook,
  verifyWebhookSignature,
}

