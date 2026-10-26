const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const { queueTelegramNotification, queuePaymentNotification } = require('../worker')
const { escapeHtml } = require('../utils/crypto')
const { formatPaymentNotificationMessage } = require('../utils/mask')
const { publishAdminEvent } = require('../utils/sseManager')

/**
 * PENGGUNA (USERS)
 * Izin: user.view & user.manage
 */
async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        staffStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.status(200).json({ total: users.length, users })
  } catch (error) {
    console.error('Error saat listUsers:', error)
    return res.status(500).json({ error: 'Gagal mengambil data pengguna', details: error.message })
  }
}

async function getUserDetail(req, res) {
  try {
    const userId = parseInt(req.params.id, 10)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        staffStatus: true,
        createdAt: true,
      },
    })
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }
    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil detail pengguna', details: error.message })
  }
}

async function updateUser(req, res) {
  try {
    const userId = parseInt(req.params.id, 10)
    const { name, email } = req.body

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_USER',
      target: updated.email,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui data pengguna #${userId}`,
    })

    return res.status(200).json({ message: 'Pengguna berhasil diperbarui', user: updated })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memperbarui pengguna', details: error.message })
  }
}

/**
 * PENARIKAN (WITHDRAWALS)
 * Izin: withdrawal.view, withdrawal.approve, withdrawal.reject
 */
// Simulasi data penarikan jika belum ada tabel terpisah
let dummyWithdrawals = [
  { id: 101, userId: 1, userName: 'Budi Santoso', amount: 500000, bank: 'BCA', status: 'pending', createdAt: new Date() },
  { id: 102, userId: 2, userName: 'Siti Rahma', amount: 250000, bank: 'Mandiri', status: 'approved', createdAt: new Date() },
]

async function listWithdrawals(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query
    const where = {}
    if (status && status !== 'all') {
      where.status = status.toLowerCase()
    }

    const [total, withdrawals] = await Promise.all([
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              hideFromPaymentChannel: true,
              telegramChatId: true,
              telegramVerifiedAt: true,
            },
          },
          paymentNotifications: {
            select: {
              id: true,
              event: true,
              status: true,
              sentAt: true,
              lastError: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10) || 50,
      }),
    ])

    const formatted = withdrawals.map((w) => ({
      id: w.id,
      userId: w.userId,
      userName: w.user?.name || 'Member',
      userEmail: w.user?.email,
      hideFromPaymentChannel: Boolean(w.user?.hideFromPaymentChannel),
      telegramLinked: Boolean(w.user?.telegramChatId && w.user?.telegramVerifiedAt),
      amount: w.amount,
      bank: w.bank,
      accountNumber: w.accountNumber,
      accountName: w.accountName,
      status: w.status,
      note: w.note,
      rejectionReason: w.rejectionReason,
      createdAt: w.createdAt,
      paymentNotifications: w.paymentNotifications || [],
      latestNotification: w.paymentNotifications?.[0] || null,
    }))

    return res.status(200).json({
      total,
      withdrawals: formatted,
    })
  } catch (error) {
    console.error('Error in listWithdrawals:', error)
    return res.status(500).json({ error: 'Gagal mengambil data penarikan' })
  }
}

/**
 * Helper internal merekam riwayat notifikasi pembayaran grup ke tabel payment_notifications dalam transaksi
 * @param {Object} tx Prisma Transaction Client
 * @param {Object} params
 * @param {Object} params.withdrawal Data withdrawal
 * @param {Object} [params.user] Data user (untuk cek hideFromPaymentChannel)
 * @param {'processing'|'success'|'rejected'} params.event Jenis kejadian
 */
async function recordPaymentNotificationTx(tx, { withdrawal, user, event }) {
  const settings = await tx.siteSetting.findMany({
    where: {
      key: {
        in: [
          'paymentGroup.enabled',
          'paymentGroup.notifySuccess',
          'paymentGroup.notifyProcessing',
          'paymentGroup.notifyRejected',
          'paymentGroup.minAmount',
        ],
      },
    },
  })

  const map = {}
  for (const s of settings) {
    map[s.key] = s.value
  }

  const enabled = map['paymentGroup.enabled'] === 'true'
  const notifySuccess = map['paymentGroup.notifySuccess'] !== 'false'
  const notifyProcessing = map['paymentGroup.notifyProcessing'] === 'true'
  const notifyRejected = map['paymentGroup.notifyRejected'] === 'true'
  const minAmount = parseInt(map['paymentGroup.minAmount'] || '0', 10)

  // Cek apakah jenis event ini diizinkan
  if (event === 'success' && !notifySuccess) return null
  if (event === 'processing' && !notifyProcessing) return null
  if (event === 'rejected' && !notifyRejected) return null

  // Cek apakah notifikasi harus di-skip
  let isSkipped = false
  let skipReason = null

  if (!enabled) {
    isSkipped = true
    skipReason = 'Pengiriman notifikasi grup dinonaktifkan di pengaturan sistem'
  } else if (user?.hideFromPaymentChannel) {
    isSkipped = true
    skipReason = 'Member memilih menyembunyikan aktivitas dari grup'
  } else if (withdrawal.amount < minAmount) {
    isSkipped = true
    skipReason = `Nominal penarikan (Rp ${withdrawal.amount.toLocaleString('id-ID')}) di bawah batas minimal (Rp ${minAmount.toLocaleString('id-ID')})`
  }

  // Format pesan Telegram
  const msgPayload = formatPaymentNotificationMessage({
    event,
    amount: withdrawal.amount,
    bank: withdrawal.bank,
    accountName: event === 'rejected' ? null : withdrawal.accountName,
    accountNumber: withdrawal.accountNumber,
  })

  // Cek apakah sudah pernah dibuat untuk [withdrawalId, event] ini
  const existing = await tx.paymentNotification.findUnique({
    where: {
      withdrawalId_event: {
        withdrawalId: withdrawal.id,
        event,
      },
    },
  })

  if (existing) {
    return {
      notification: existing,
      isPending: existing.status === 'pending',
    }
  }

  const created = await tx.paymentNotification.create({
    data: {
      withdrawalId: withdrawal.id,
      event,
      status: isSkipped ? 'skipped' : 'pending',
      lastError: isSkipped ? skipReason : null,
      payload: {
        ...msgPayload,
        skipReason: isSkipped ? skipReason : null,
      },
    },
  })

  return {
    notification: created,
    isPending: !isSkipped && created.status === 'pending',
  }
}

async function approveWithdrawal(req, res) {
  try {
    const wdId = parseInt(req.params.id, 10)
    if (isNaN(wdId)) return res.status(400).json({ error: 'ID penarikan tidak valid' })

    const wd = await prisma.withdrawal.findUnique({
      where: { id: wdId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
            hideFromPaymentChannel: true,
          },
        },
      },
    })

    if (!wd) {
      return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
    }

    if (wd.status === 'approved' || wd.status === 'processing' || wd.status === 'success') {
      return res.status(400).json({ error: 'Penarikan ini sudah disetujui atau diproses sebelumnya' })
    }

    if (wd.status === 'rejected') {
      return res.status(400).json({ error: 'Penarikan yang sudah ditolak tidak dapat disetujui' })
    }

    const clientNote = (req.body?.note || req.body?.review || '').trim()

    // Ubah status ke processing dan simpan payment notification dalam satu transaksi atomik
    const { updated, notifResult } = await prisma.$transaction(async (tx) => {
      const updatedWd = await tx.withdrawal.update({
        where: { id: wdId },
        data: {
          status: 'processing',
          note: clientNote || 'Disetujui oleh admin keuangan',
        },
      })

      const notifRes = await recordPaymentNotificationTx(tx, {
        withdrawal: wd,
        user: wd.user,
        event: 'processing',
      })

      return { updated: updatedWd, notifResult: notifRes }
    })

    // Kirim notifikasi grup ke BullMQ antrean jika pending
    if (notifResult?.isPending && notifResult?.notification?.id) {
      await queuePaymentNotification(notifResult.notification.id)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'APPROVAL_WITHDRAWAL',
      target: `WD-${wdId} (Rp${wd.amount})`,
      ipAddress: req.ip,
      status: 'success',
      details: `Menyetujui penarikan untuk ${wd.user?.name || wd.userId} (Status: Diproses)${clientNote ? ` - Review: ${clientNote}` : ''}`,
    })

    // Notifikasi Bot langsung ke member jika memiliki Telegram terverifikasi
    if (wd.user?.telegramChatId && wd.user?.telegramVerifiedAt) {
      const amountStr = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(wd.amount)

      await queueTelegramNotification(
        wd.user.telegramChatId,
        `⏳ <b>Penarikan Dana Sedang Diproses</b>\n\n` +
          `Pengajuan penarikan dana <b>#${wdId}</b> sebesar <b>${amountStr}</b> telah disetujui oleh admin finance dan sedang dalam proses pengiriman ke rekening Anda.` +
          (clientNote ? `\n\n📝 <b>Catatan / Review Admin:</b> <i>${escapeHtml(clientNote)}</i>` : '')
      )
    }

    publishAdminEvent('withdrawal.changed', {
      withdrawalId: updated.id,
      status: updated.status,
      amount: wd.amount,
      userId: wd.userId,
    })
    publishAdminEvent('dashboard.stats', { timestamp: new Date().toISOString() })

    return res.status(200).json({ message: 'Penarikan berhasil disetujui untuk diproses', withdrawal: updated })
  } catch (error) {
    console.error('Error in approveWithdrawal:', error)
    return res.status(500).json({ error: 'Gagal menyetujui penarikan' })
  }
}

async function markWithdrawalSuccess(req, res) {
  try {
    const wdId = parseInt(req.params.id, 10)
    if (isNaN(wdId)) return res.status(400).json({ error: 'ID penarikan tidak valid' })

    const wd = await prisma.withdrawal.findUnique({
      where: { id: wdId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
            hideFromPaymentChannel: true,
          },
        },
      },
    })

    if (!wd) {
      return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
    }

    if (wd.status === 'success') {
      return res.status(400).json({ error: 'Penarikan ini sudah ditandai berhasil sebelumnya' })
    }

    if (wd.status === 'rejected') {
      return res.status(400).json({ error: 'Penarikan yang sudah ditolak tidak dapat ditandai berhasil' })
    }

    const { updated, notifResult } = await prisma.$transaction(async (tx) => {
      const updatedWd = await tx.withdrawal.update({
        where: { id: wdId },
        data: {
          status: 'success',
          note: req.body?.note || 'Transfer berhasil diselesaikan dan diverifikasi',
        },
      })

      const notifRes = await recordPaymentNotificationTx(tx, {
        withdrawal: wd,
        user: wd.user,
        event: 'success',
      })

      return { updated: updatedWd, notifResult: notifRes }
    })

    // Masukkan ke antrean BullMQ jika statusnya pending
    if (notifResult?.isPending && notifResult?.notification?.id) {
      await queuePaymentNotification(notifResult.notification.id)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'SUCCESS_WITHDRAWAL',
      target: `WD-${wdId} (Rp${wd.amount})`,
      ipAddress: req.ip,
      status: 'success',
      details: `Menandai penarikan selesai/sukses untuk ${wd.user?.name || wd.userId}`,
    })

    // Notifikasi Bot langsung ke member
    if (wd.user?.telegramChatId && wd.user?.telegramVerifiedAt) {
      const amountStr = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(wd.amount)

      await queueTelegramNotification(
        wd.user.telegramChatId,
        `🎉 <b>Penarikan Dana Berhasil Ditransfer!</b>\n\n` +
          `Pengajuan penarikan dana <b>#${wdId}</b> sebesar <b>${amountStr}</b> telah sukses dikirim ke rekening ${wd.bank || ''} (${wd.accountNumber || ''}). Silakan periksa mutasi rekening Anda.`
      )
    }

    publishAdminEvent('withdrawal.changed', {
      withdrawalId: updated.id,
      status: updated.status,
      amount: wd.amount,
      userId: wd.userId,
    })
    publishAdminEvent('dashboard.stats', { timestamp: new Date().toISOString() })

    return res.status(200).json({
      message: 'Penarikan berhasil ditandai selesai/berhasil',
      withdrawal: updated,
    })
  } catch (error) {
    console.error('Error in markWithdrawalSuccess:', error)
    return res.status(500).json({ error: 'Gagal menandai penarikan berhasil' })
  }
}

async function rejectWithdrawal(req, res) {
  try {
    const wdId = parseInt(req.params.id, 10)
    const { reason, alasan, review } = req.body
    const rejectReason = (reason || alasan || review || '').trim()

    if (isNaN(wdId)) return res.status(400).json({ error: 'ID penarikan tidak valid' })

    const wd = await prisma.withdrawal.findUnique({
      where: { id: wdId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
            hideFromPaymentChannel: true,
          },
        },
      },
    })
    if (!wd) {
      return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
    }

    if (wd.status === 'rejected') {
      return res.status(400).json({ error: 'Penarikan ini sudah ditolak sebelumnya' })
    }

    if (wd.status === 'success') {
      return res.status(400).json({ error: 'Penarikan yang sudah berhasil tidak dapat ditolak' })
    }

    // Kembalikan saldo pengguna, ubah status withdrawal, dan catat notifikasi dalam transaksi atomik
    const { updated, notifResult } = await prisma.$transaction(async (tx) => {
      // Kembalikan saldo pengguna
      await tx.user.update({
        where: { id: wd.userId },
        data: { balance: { increment: wd.amount } },
      })

      const updatedWd = await tx.withdrawal.update({
        where: { id: wdId },
        data: {
          status: 'rejected',
          rejectionReason: rejectReason || 'Ditolak oleh admin',
        },
      })

      const notifRes = await recordPaymentNotificationTx(tx, {
        withdrawal: wd,
        user: wd.user,
        event: 'rejected',
      })

      return { updated: updatedWd, notifResult: notifRes }
    })

    // Masukkan ke antrean BullMQ jika pending
    if (notifResult?.isPending && notifResult?.notification?.id) {
      await queuePaymentNotification(notifResult.notification.id)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'REJECT_WITHDRAWAL',
      target: `WD-${wdId} (Rp${wd.amount})`,
      ipAddress: req.ip,
      status: 'warning',
      details: `Menolak penarikan dan mengembalikan saldo: ${rejectReason || 'Tanpa alasan'}`,
    })

    // Notifikasi Bot jika member memiliki Telegram terverifikasi
    if (wd.user?.telegramChatId && wd.user?.telegramVerifiedAt) {
      const amountStr = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(wd.amount)

      await queueTelegramNotification(
        wd.user.telegramChatId,
        `❌ <b>Penarikan Dana Ditolak</b>\n\n` +
          `Pengajuan penarikan dana <b>#${wdId}</b> sebesar <b>${amountStr}</b> telah ditolak oleh admin dan saldo Anda telah dikembalikan.\n\n` +
          `📝 <b>Alasan / Review:</b> <i>${escapeHtml(rejectReason || 'Tidak memenuhi kriteria')}</i>`
      )
    }

    publishAdminEvent('withdrawal.changed', {
      withdrawalId: updated.id,
      status: updated.status,
      amount: wd.amount,
      userId: wd.userId,
    })
    publishAdminEvent('dashboard.stats', { timestamp: new Date().toISOString() })

    return res.status(200).json({ message: 'Penarikan berhasil ditolak dan saldo dikembalikan', withdrawal: updated })
  } catch (error) {
    console.error('Error in rejectWithdrawal:', error)
    return res.status(500).json({ error: 'Gagal menolak penarikan' })
  }
}

/**
 * KOMISI (COMMISSIONS)
 * Izin: commission.view
 */
async function listCommissions(req, res) {
  return res.status(200).json({
    commissions: [
      { id: 1, user: 'Budi Santoso', amount: 75000, referral: 'Siti Rahma', status: 'paid' },
      { id: 2, user: 'Ahmad Dani', amount: 50000, referral: 'Dewi Lestari', status: 'pending' },
    ],
  })
}

/**
 * PAKET / RENCANA (PLANS)
 * Izin: plan.view
 */
async function listPlans(req, res) {
  return res.status(200).json({
    plans: [
      { id: 'starter', name: 'Paket Starter', price: 99000, quota: 1000 },
      { id: 'pro', name: 'Paket Professional', price: 249000, quota: 5000 },
      { id: 'enterprise', name: 'Paket Enterprise', price: 699000, quota: 20000 },
    ],
  })
}

/**
 * PENGUMUMAN (ANNOUNCEMENTS)
 * Izin: announcement.view & announcement.manage
 */
let dummyAnnouncements = [
  { id: 1, title: 'Pemeliharaan Server Berkala', type: 'warning', active: true, createdAt: new Date() },
]

async function listAnnouncements(req, res) {
  return res.status(200).json({ announcements: dummyAnnouncements })
}

async function createAnnouncement(req, res) {
  const { title, type = 'info', content } = req.body
  if (!title) {
    return res.status(400).json({ error: 'Judul pengumuman wajib diisi' })
  }
  const newAnn = {
    id: dummyAnnouncements.length + 1,
    title,
    type,
    content,
    active: true,
    createdAt: new Date(),
  }
  dummyAnnouncements.push(newAnn)

  await logActivity({
    userId: req.user.id,
    adminName: req.user.name,
    action: 'CREATE_ANNOUNCEMENT',
    target: title,
    ipAddress: req.ip,
    status: 'success',
    details: `Menambahkan pengumuman baru: ${title}`,
  })

  return res.status(201).json({ message: 'Pengumuman berhasil dibuat', announcement: newAnn })
}

/**
 * DASHBOARDS
 */
async function getFinanceDashboard(req, res) {
  return res.status(200).json({
    summary: {
      totalRevenue: 15400000,
      totalWithdrawals: 4200000,
      pendingWithdrawals: dummyWithdrawals.filter((w) => w.status === 'pending').length,
      commissionPayout: 1850000,
    },
  })
}

async function getAdminDashboard(req, res) {
  const userCount = await prisma.user.count()
  const contactCount = await prisma.contact.count()
  const templateCount = await prisma.template.count()
  const campaignCount = await prisma.campaign.count()

  return res.status(200).json({
    metrics: {
      users: userCount,
      contacts: contactCount,
      templates: templateCount,
      campaigns: campaignCount,
    },
  })
}

/**
 * AUDIT LOGS
 * Izin: log.view
 */
async function listActivityLogs(req, res) {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
    })
    return res.status(200).json({ total: logs.length, logs })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil log aktivitas', details: error.message })
  }
}

/**
 * PENGATURAN UMUM WEBSITE
 * Izin: settings.view & settings.manage
 */
async function getSettings(req, res) {
  try {
    const settings = await prisma.siteSetting.findMany()
    return res.status(200).json({ settings })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil pengaturan', details: error.message })
  }
}

async function updateSetting(req, res) {
  try {
    const { key, value } = req.body
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key dan value wajib diisi' })
    }

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value)
    const setting = await prisma.siteSetting.upsert({
      where: { key },
      update: { value: valueStr },
      create: { key, value: valueStr },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_SETTINGS',
      target: key,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui pengaturan ${key}`,
    })

    return res.status(200).json({ message: 'Pengaturan berhasil diperbarui', setting })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan', details: error.message })
  }
}

module.exports = {
  listUsers,
  getUserDetail,
  updateUser,
  listWithdrawals,
  approveWithdrawal,
  markWithdrawalSuccess,
  rejectWithdrawal,
  listCommissions,
  listPlans,
  listAnnouncements,
  createAnnouncement,
  getFinanceDashboard,
  getAdminDashboard,
  listActivityLogs,
  getSettings,
  updateSetting,
}
