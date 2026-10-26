/**
 * Controller Pengaturan & Riwayat Grup Pembayaran Telegram (/api/admin/payment-group/*)
 * AF Blast Backend - Express + Prisma + BullMQ
 *
 * Mengelola konfigurasi notifikasi riwayat penarikan ke Grup Telegram (@AFBlastPaymentBot)
 * Fitur:
 * 1. GET /settings: Ambil pengaturan grup (enabled, event toggles, minAmount, status env)
 * 2. PUT /settings: Perbarui pengaturan (hanya superadmin & adminfinance)
 * 3. POST /test: Kirim pesan uji ke grup pengujian (max 3/jam)
 * 4. GET /notifications: Riwayat notifikasi penarikan (paginated, filter status/event)
 * 5. POST /notifications/:id/retry: Kirim ulang notifikasi yang gagal
 */

const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const {
  getPaymentGroupSettings,
  updatePaymentGroupSettings,
  sendTestPaymentMessage,
} = require('../telegram/paymentBot')
const { queuePaymentNotification } = require('../worker')

/**
 * GET /api/admin/payment-group/settings
 * Izin: paymentGroup.view
 */
async function getSettings(req, res) {
  try {
    const settings = await getPaymentGroupSettings()
    return res.status(200).json({ settings })
  } catch (error) {
    console.error('Error in getSettings (payment-group):', error)
    return res.status(500).json({ error: 'Gagal memuat pengaturan grup pembayaran' })
  }
}

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notifySuccess: z.boolean().optional(),
  notifyProcessing: z.boolean().optional(),
  notifyRejected: z.boolean().optional(),
  minAmount: z.number().int().min(0, 'Nominal minimal tidak boleh negatif').optional(),
})

/**
 * PUT /api/admin/payment-group/settings
 * Izin: paymentGroup.manage
 */
async function updateSettings(req, res) {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues?.[0]?.message || 'Data pengaturan tidak valid',
      })
    }

    const updated = await updatePaymentGroupSettings(parsed.data)

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_PAYMENT_GROUP_SETTINGS',
      target: 'Telegram Payment Group',
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui pengaturan grup notifikasi pembayaran Telegram`,
    })

    return res.status(200).json({
      message: 'Pengaturan grup pembayaran berhasil disimpan',
      settings: updated,
    })
  } catch (error) {
    console.error('Error in updateSettings (payment-group):', error)
    return res.status(500).json({ error: 'Gagal menyimpan pengaturan grup pembayaran' })
  }
}

/**
 * POST /api/admin/payment-group/test
 * Izin: paymentGroup.manage
 * Maksimal 3 kali per jam (dibatasi di tingkat backend dan telegram service)
 */
async function sendTest(req, res) {
  try {
    const adminName = req.user?.name || 'Staff'
    const result = await sendTestPaymentMessage(adminName)

    if (!result.ok) {
      if (result.isRateLimit) {
        return res.status(429).json({ error: result.error })
      }
      return res.status(400).json({ error: result.error })
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'TEST_PAYMENT_GROUP_MESSAGE',
      target: 'Telegram Payment Test Group',
      ipAddress: req.ip,
      status: 'success',
      details: `Mengirim pesan uji integrasi bot pembayaran`,
    })

    return res.status(200).json({
      message: 'Pesan tes berhasil dikirim ke grup Telegram pengujian',
      result,
    })
  } catch (error) {
    console.error('Error in sendTest (payment-group):', error)
    return res.status(500).json({ error: 'Gagal mengirim pesan pengujian ke Telegram' })
  }
}

/**
 * GET /api/admin/payment-group/notifications
 * Izin: paymentGroup.view
 * Query: status, event, page, limit, search
 */
async function listNotifications(req, res) {
  try {
    const { status, event, page = 1, limit = 20, search } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    const where = {}
    if (status && status !== 'all') {
      where.status = status.toLowerCase()
    }
    if (event && event !== 'all') {
      where.event = event.toLowerCase()
    }

    if (search && search.trim().length > 0) {
      const q = search.trim()
      const qNum = parseInt(q, 10)
      where.OR = [
        ...(isNaN(qNum) ? [] : [{ withdrawalId: qNum }]),
        { withdrawal: { user: { name: { contains: q } } } },
        { withdrawal: { user: { email: { contains: q } } } },
        { withdrawal: { bank: { contains: q } } },
      ]
    }

    const [total, notifications] = await Promise.all([
      prisma.paymentNotification.count({ where }),
      prisma.paymentNotification.findMany({
        where,
        include: {
          withdrawal: {
            select: {
              id: true,
              amount: true,
              bank: true,
              accountNumber: true,
              accountName: true,
              status: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  hideFromPaymentChannel: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ])

    return res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      notifications,
    })
  } catch (error) {
    console.error('Error in listNotifications (payment-group):', error)
    return res.status(500).json({ error: 'Gagal memuat riwayat notifikasi pembayaran' })
  }
}

/**
 * POST /api/admin/payment-group/notifications/:id/retry
 * Izin: paymentGroup.manage
 */
async function retryNotification(req, res) {
  try {
    const notifId = parseInt(req.params.id, 10)
    if (isNaN(notifId)) {
      return res.status(400).json({ error: 'ID notifikasi tidak valid' })
    }

    const notif = await prisma.paymentNotification.findUnique({
      where: { id: notifId },
      include: { withdrawal: true },
    })

    if (!notif) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan' })
    }

    if (notif.status === 'sent') {
      return res.status(400).json({ error: 'Notifikasi ini sudah berhasil terkirim sebelumnya' })
    }

    // Reset status ke pending dan reset lastError
    const updated = await prisma.paymentNotification.update({
      where: { id: notifId },
      data: {
        status: 'pending',
        lastError: null,
      },
    })

    // Masukkan ke antrean BullMQ
    await queuePaymentNotification(notifId)

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'RETRY_PAYMENT_NOTIFICATION',
      target: `Notif #${notifId} (WD #${notif.withdrawalId})`,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengirim ulang notifikasi penarikan #${notif.withdrawalId} ke antrean Telegram`,
    })

    return res.status(200).json({
      message: 'Notifikasi berhasil dimasukkan kembali ke antrean untuk dikirim ulang',
      notification: updated,
    })
  } catch (error) {
    console.error('Error in retryNotification (payment-group):', error)
    return res.status(500).json({ error: 'Gagal mengulang pengiriman notifikasi' })
  }
}

module.exports = {
  getSettings,
  updateSettings,
  sendTest,
  listNotifications,
  retryNotification,
}
