/**
 * Controller Staf untuk Permintaan Ganti Rekening & Pesan Bantuan
 * AF Blast Backend - Express + Prisma + BullMQ
 *
 * PRINSIP:
 * - Wajib aud: staff & requirePermission
 * - Dicatat lengkap ke ActivityLog
 * - Izin payoutChange.manage untuk superadmin dan adminfinance
 * - Izin support.manage untuk superadmin dan developer
 * - Nomor rekening penuh tidak pernah dikirim ke endpoint staf selain untuk finance saat memproses penarikan
 */

const prisma = require('../config/db')
const { getClientIp, logActivity } = require('../utils/logger')
const { queueTelegramNotification } = require('../worker')
const { escapeHtml, decryptAccountNumber } = require('../utils/crypto')

/**
 * GET /api/admin/payout-requests
 * Mengambil daftar permohonan penggantian rekening
 * Izin: payoutChange.manage
 */
async function getPayoutRequests(req, res) {
  try {
    const { status } = req.query
    const where = {}
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where.status = status
    }

    const requests = await prisma.payoutChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            username: true,
            email: true,
            telegramUsername: true,
            payoutAccount: {
              select: {
                id: true,
                type: true,
                providerName: true,
                accountNumberLast4: true,
                holderName: true,
                lockedAt: true,
                withdrawHoldUntil: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    const formatted = requests.map((r) => {
      const payout = r.user?.payoutAccount
      return {
        id: r.id,
        userId: r.userId,
        reason: r.reason,
        requestedType: r.requestedType,
        status: r.status,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        reviewer: r.reviewer
          ? {
              id: r.reviewer.id,
              name: r.reviewer.name,
              username: r.reviewer.username,
            }
          : null,
        user: {
          id: r.user.id,
          name: r.user.fullName || r.user.name,
          username: r.user.username,
          email: r.user.email,
          telegramUsername: r.user.telegramUsername,
        },
        currentPayoutAccount: payout
          ? {
              id: payout.id,
              type: payout.type,
              providerName: payout.providerName,
              accountNumberMasked: `••••${payout.accountNumberLast4}`,
              holderName: payout.holderName,
              locked: Boolean(payout.lockedAt),
              withdrawHoldUntil: payout.withdrawHoldUntil,
            }
          : null,
      }
    })

    return res.status(200).json({
      total: formatted.length,
      requests: formatted,
    })
  } catch (error) {
    console.error('Error in getPayoutRequests:', error)
    return res.status(500).json({ error: 'Gagal mengambil data permohonan ganti rekening' })
  }
}

/**
 * POST /api/admin/payout-requests/:id/approve
 * Menyetujui permohonan penggantian rekening
 * Membuka kunci rekening satu kali (lockedAt = null) agar member dapat mengisi rekening baru
 * Izin: payoutChange.manage
 */
async function approvePayoutRequest(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID permohonan tidak valid' })
    }

    const { note } = req.body || {}
    const ip = getClientIp(req)

    const request = await prisma.payoutChangeRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
            payoutAccount: true,
          },
        },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'Data permohonan tidak ditemukan' })
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Permohonan ini sudah diproses sebelumnya dengan status '${request.status}'`,
      })
    }

    // Eksekusi pembaruan dalam transaksi
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update status permohonan
      const reqUpdated = await tx.payoutChangeRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: req.user.id,
          reviewedAt: new Date(),
          reviewNote: note || 'Disetujui oleh admin',
        },
      })

      // 2. Buka kunci PayoutAccount milik member agar bisa menginput rekening baru
      if (request.user?.payoutAccount) {
        await tx.payoutAccount.update({
          where: { id: request.user.payoutAccount.id },
          data: {
            lockedAt: null, // Buka kunci
          },
        })
      }

      return reqUpdated
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'PAYOUT_CHANGE_APPROVE',
      target: `Request #${id} (User #${request.userId})`,
      details: `Menyetujui permohonan ganti rekening untuk ${request.user?.email}`,
      ipAddress: ip,
      status: 'success',
    })

    // Kirim notifikasi bot jika member memiliki telegram terverifikasi
    if (request.user?.telegramChatId && request.user?.telegramVerifiedAt) {
      await queueTelegramNotification(
        request.user.telegramChatId,
        '✅ <b>Permintaan Ganti Rekening Disetujui</b>\n\n' +
          'Admin telah menyetujui permohonan penggantian rekening penarikan Anda.\n\n' +
          'Silakan akses menu <b>Pengaturan Akun</b> di website untuk menyimpan rekening baru Anda. ' +
          '<i>Demi keamanan, penarikan dana akan ditahan selama 24 jam setelah rekening baru disimpan.</i>'
      )
    }

    return res.status(200).json({
      message: 'Permohonan ganti rekening berhasil disetujui. Rekening member telah dibuka kuncinya.',
      request: updated,
    })
  } catch (error) {
    console.error('Error in approvePayoutRequest:', error)
    return res.status(500).json({ error: 'Gagal menyetujui permohonan ganti rekening' })
  }
}

/**
 * POST /api/admin/payout-requests/:id/reject
 * Menolak permohonan penggantian rekening (wajib alasan penolakan)
 * Izin: payoutChange.manage
 */
async function rejectPayoutRequest(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID permohonan tidak valid' })
    }

    const { reason, alasan, reviewNote } = req.body || {}
    const rejectReason = (reason || alasan || reviewNote || '').trim()

    if (!rejectReason || rejectReason.length < 3) {
      return res.status(400).json({
        error: 'Alasan penolakan wajib diisi (minimal 3 karakter).',
      })
    }

    const ip = getClientIp(req)

    const request = await prisma.payoutChangeRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
          },
        },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'Data permohonan tidak ditemukan' })
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Permohonan ini sudah diproses sebelumnya dengan status '${request.status}'`,
      })
    }

    const updated = await prisma.payoutChangeRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: rejectReason,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'PAYOUT_CHANGE_REJECT',
      target: `Request #${id} (User #${request.userId})`,
      details: `Menolak permohonan ganti rekening: ${rejectReason}`,
      ipAddress: ip,
      status: 'warning',
    })

    // Kirim notifikasi bot jika member memiliki telegram terverifikasi
    if (request.user?.telegramChatId && request.user?.telegramVerifiedAt) {
      await queueTelegramNotification(
        request.user.telegramChatId,
        '❌ <b>Permintaan Ganti Rekening Ditolak</b>\n\n' +
          'Mohon maaf, permohonan penggantian rekening penarikan Anda tidak dapat disetujui.\n\n' +
          `<b>Alasan:</b> <i>${escapeHtml(rejectReason)}</i>\n\n` +
          '<i>Jika membutuhkan informasi lebih lanjut, silakan hubungi tim admin via /hubungiadmin.</i>'
      )
    }

    return res.status(200).json({
      message: 'Permohonan ganti rekening berhasil ditolak.',
      request: updated,
    })
  } catch (error) {
    console.error('Error in rejectPayoutRequest:', error)
    return res.status(500).json({ error: 'Gagal menolak permohonan ganti rekening' })
  }
}

/**
 * GET /api/admin/support
 * Mengambil daftar tiket pesan bantuan member
 * Izin: support.manage
 */
async function getSupportMessages(req, res) {
  try {
    const { status } = req.query
    const where = {}
    if (status && ['open', 'answered', 'closed'].includes(status)) {
      where.status = status
    }

    const messages = await prisma.supportMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            username: true,
            email: true,
            telegramUsername: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
          },
        },
      },
    })

    const formatted = messages.map((m) => ({
      id: m.id,
      userId: m.userId,
      text: m.text,
      status: m.status,
      adminReply: m.adminReply,
      createdAt: m.createdAt,
      user: {
        id: m.user.id,
        name: m.user.fullName || m.user.name,
        username: m.user.username,
        email: m.user.email,
        telegramUsername: m.user.telegramUsername,
        hasTelegramVerified: Boolean(m.user.telegramChatId && m.user.telegramVerifiedAt),
      },
    }))

    return res.status(200).json({
      total: formatted.length,
      messages: formatted,
    })
  } catch (error) {
    console.error('Error in getSupportMessages:', error)
    return res.status(500).json({ error: 'Gagal mengambil data pesan bantuan' })
  }
}

/**
 * POST /api/admin/support/:id/reply
 * Membalas pesan bantuan member
 * Balasan dikirim langsung ke obrolan Telegram bot member jika terverifikasi
 * Izin: support.manage
 */
async function replySupportMessage(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID pesan bantuan tidak valid' })
    }

    const { text, reply } = req.body || {}
    const replyText = (text || reply || '').trim()

    if (!replyText || replyText.length < 2) {
      return res.status(400).json({ error: 'Isi balasan wajib diisi (minimal 2 karakter)' })
    }

    const ip = getClientIp(req)

    const supportMsg = await prisma.supportMessage.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
            telegramVerifiedAt: true,
          },
        },
      },
    })

    if (!supportMsg) {
      return res.status(404).json({ error: 'Pesan bantuan tidak ditemukan' })
    }

    const updated = await prisma.supportMessage.update({
      where: { id },
      data: {
        adminReply: replyText,
        status: 'answered',
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'SUPPORT_MESSAGE_REPLY',
      target: `Support #${id} (User #${supportMsg.userId})`,
      details: `Membalas pesan bantuan: ${replyText.slice(0, 50)}...`,
      ipAddress: ip,
      status: 'success',
    })

    // Kirim balasan lewat bot ke obrolan Telegram member jika terverifikasi
    if (supportMsg.user?.telegramChatId && supportMsg.user?.telegramVerifiedAt) {
      await queueTelegramNotification(
        supportMsg.user.telegramChatId,
        `💬 <b>Balasan dari Admin AF Blast</b>\n\n` +
          `<b>Pesan Anda:</b>\n<i>"${escapeHtml(supportMsg.text)}"</i>\n\n` +
          `<b>Jawaban Admin:</b>\n${escapeHtml(replyText)}`
      )
    }

    return res.status(200).json({
      message: 'Balasan berhasil disimpan dan dikirimkan ke Telegram member.',
      supportMessage: updated,
    })
  } catch (error) {
    console.error('Error in replySupportMessage:', error)
    return res.status(500).json({ error: 'Gagal membalas pesan bantuan' })
  }
}

/**
 * GET /api/admin/withdrawals/:id/payout-detail
 * Khusus admin finance untuk melihat nomor rekening utuh saat memproses transfer penarikan dana
 * Izin: withdrawal.approve
 */
async function getWithdrawalPayoutDetail(req, res) {
  try {
    // Nomor rekening penuh hanya boleh dilihat oleh finance (adminfinance dan superadmin) saat memproses penarikan
    if (req.user.role !== 'adminfinance' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Akses ditolak: Hanya admin finance yang diizinkan melihat nomor rekening utuh untuk memproses transfer penarikan dana.',
      })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID penarikan tidak valid' })
    }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            payoutAccount: true,
          },
        },
      },
    })

    if (!withdrawal) {
      return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
    }

    const payout = withdrawal.user?.payoutAccount
    let decryptedNumber = null
    if (payout && payout.accountNumber) {
      decryptedNumber = decryptAccountNumber(payout.accountNumber)
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'FINANCE_VIEW_PAYOUT_DETAIL',
      target: `WD #${id}`,
      details: `Finance mengakses detail rekening untuk penarikan #${id}`,
      ipAddress: getClientIp(req),
      status: 'info',
    })

    return res.status(200).json({
      withdrawalId: withdrawal.id,
      amount: withdrawal.amount,
      status: withdrawal.status,
      bank: payout?.providerName || withdrawal.bank,
      type: payout?.type || 'bank',
      accountNumber: decryptedNumber || withdrawal.accountNumber,
      accountName: payout?.holderName || withdrawal.accountName,
    })
  } catch (error) {
    console.error('Error in getWithdrawalPayoutDetail:', error)
    return res.status(500).json({ error: 'Gagal mengambil detail rekening transfer' })
  }
}

module.exports = {
  getPayoutRequests,
  approvePayoutRequest,
  rejectPayoutRequest,
  getSupportMessages,
  replySupportMessage,
  getWithdrawalPayoutDetail,
}
