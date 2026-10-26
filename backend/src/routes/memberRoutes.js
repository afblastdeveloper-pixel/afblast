const express = require('express')
const router = express.Router()
const memberController = require('../controllers/memberController')
const memberWhatsapp = require('../controllers/memberWhatsappController')
const { requireMemberAuth } = require('../middlewares/authMiddleware')
const { createRateLimiter } = require('../middlewares/rateLimiter')
const { createTicket, consumeTicket, handleStreamConnection } = require('../utils/sseManager')

/**
 * GET /api/member/stream (SSE, aud=member)
 * Koneksi SSE realtime untuk member menggunakan tiket sekali pakai (30 detik).
 * Heartbeat 20 detik, mengirim event pool.stats.
 */
router.get('/stream', async (req, res) => {
  try {
    const { ticket } = req.query
    if (!ticket) {
      return res.status(401).json({ error: 'Tiket SSE (ticket) wajib disertakan' })
    }
    const clientData = await consumeTicket(ticket)
    if (!clientData) {
      return res.status(403).json({ error: 'Tiket SSE tidak valid atau telah kedaluwarsa' })
    }
    if (clientData.audience !== 'member' && clientData.role !== 'user') {
      return res.status(403).json({ error: 'Akses ditolak: tiket bukan untuk audiens member' })
    }
    handleStreamConnection(req, res, clientData, 20000)
  } catch (error) {
    console.error('Error member stream:', error)
    return res.status(500).json({ error: 'Gagal menghubungkan ke SSE stream', details: error.message })
  }
})

// Seluruh rute di bawah ini wajib token member (aud: "member" & role: "user")
router.use(requireMemberAuth)

/**
 * POST /api/member/stream/ticket
 * Membuat tiket sekali pakai 30 detik untuk koneksi SSE member
 */
router.post('/stream/ticket', async (req, res) => {
  try {
    const ticket = await createTicket(req.user, [], 'member')
    return res.status(200).json({ ticket, expiresIn: 30 })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal membuat tiket stream', details: error.message })
  }
})

// Rate limiter khusus untuk endpoint sensitif
const deviceLinkLimiter = createRateLimiter({
  windowMs: 60000,
  max: 5,
  message: 'Terlalu banyak permintaan penautan perangkat. Silakan tunggu 1 menit.',
})

const withdrawalLimiter = createRateLimiter({
  windowMs: 60000,
  max: 5,
  message: 'Terlalu banyak permintaan penarikan. Silakan tunggu 1 menit.',
})

// 1. Dashboard Ringkasan
router.get('/dashboard', memberController.getDashboard)

// 2. Pool Kontak & Kolam Target Resmi (Spesifikasi Baru)
router.get('/pool/summary', memberWhatsapp.getMemberPoolSummary)
router.get('/pool/batches', memberController.getPoolBatches)
router.post('/pool/batches/:id/claim', memberController.claimBatch)
router.post('/pool/slots/:id/release', memberController.releaseSlot)

const engineControlLimiter = createRateLimiter({
  windowMs: 10000,
  max: 30,
  message: 'Terlalu banyak permintaan kendali mesin. Silakan tunggu sebentar.',
})

// 3. WhatsApp Pengirim, Mesin Blast & Perangkat (Spesifikasi Baru)
router.get('/whatsapp/overview', memberWhatsapp.getWhatsappOverview)
router.get('/whatsapp/summary', memberWhatsapp.getWhatsappSummary)

// Kendali Massal Engine
router.post('/engine/start-all', engineControlLimiter, memberWhatsapp.startAllDevices)
router.post('/engine/stop-all', engineControlLimiter, memberWhatsapp.stopAllDevices)
router.post('/whatsapp/engine/start-all', engineControlLimiter, memberWhatsapp.startAllDevices)
router.post('/whatsapp/engine/stop-all', engineControlLimiter, memberWhatsapp.stopAllDevices)

// Manajemen Perangkat & Konfigurasi Engine
router.get('/devices', memberWhatsapp.listMemberDevices)
router.post('/devices', memberWhatsapp.createMemberDevice)
router.post('/devices/link', deviceLinkLimiter, memberController.linkDevice) // backward compatibility
router.post('/devices/:id/link/qr', deviceLinkLimiter, memberWhatsapp.linkDeviceQr)
router.post('/devices/:id/link/code', deviceLinkLimiter, memberWhatsapp.linkDeviceCode)
router.get('/devices/:id/status', memberWhatsapp.getDeviceStatus)
router.patch('/devices/:id/config', memberWhatsapp.configDevice)
router.post('/devices/:id/start', engineControlLimiter, memberWhatsapp.startDevice)
router.post('/devices/:id/stop', engineControlLimiter, memberWhatsapp.stopDevice)
router.post('/devices/:id/reconnect', deviceLinkLimiter, memberWhatsapp.reconnectDevice)
router.post('/devices/:id/disconnect', memberWhatsapp.disconnectDevice)
router.delete('/devices/:id', memberWhatsapp.deleteMemberDevice)

// Riwayat Pesan & Riwayat Run Perangkat
router.get('/devices/:id/history', memberWhatsapp.getDeviceHistory)
router.get('/devices/:id/runs', memberWhatsapp.getDeviceRuns)

// 4. Aturan Profil Pengirim Resmi
router.get('/profile-rule', memberWhatsapp.getProfileRule)

// 5. Kampanye WhatsApp Blast & Partisipasi Member
router.get('/blast/risk-policy', memberWhatsapp.getRiskPolicy)
router.post('/blast/risk-ack', memberWhatsapp.acceptRiskAck)
router.get('/blast/campaigns', memberWhatsapp.listMemberCampaigns)
router.post('/blast/campaigns/:id/join', memberWhatsapp.joinCampaign)
router.post('/blast/campaigns/:id/leave', memberWhatsapp.leaveCampaign)
router.get('/blast/participations', memberWhatsapp.listParticipations)

// 4. Performa & Statistik
router.get('/performance', memberController.getPerformance)

// 5. Saldo & Komisi
router.get('/earnings', memberController.getEarnings)

// 6. Penarikan Dana (Withdrawals)
router.get('/withdraw/options', memberController.getWithdrawOptions)
router.post('/withdrawals', withdrawalLimiter, memberController.createWithdrawal)
router.get('/withdrawals', memberController.getWithdrawals)

// 7. Anggota Tim
router.get('/team', memberController.getTeam)

// Rate limiter untuk pesan bantuan member (3 per jam)
const supportLimiter = createRateLimiter({
  windowMs: 3600000, // 1 jam
  max: 3,
  message: 'Batas pengiriman pesan bantuan adalah 3 kali per jam. Silakan coba lagi nanti.',
})

// 8. Bot Telegram Pemulihan Akun
const memberTelegram = require('../controllers/memberTelegramController')

router.post('/telegram/link-token', memberTelegram.createLinkToken)
router.get('/telegram/status', memberTelegram.getTelegramStatus)
router.delete('/telegram', memberTelegram.unlinkTelegram)

// 9. Pengaturan Akun, Rekening Penarikan & Bantuan (Spesifikasi Baru)
const memberAccount = require('../controllers/memberAccountController')

router.get('/account', memberAccount.getAccount)
router.put('/account', memberAccount.updateAccount)
router.put('/payout', memberAccount.setPayoutAccount)
router.post('/payout/change-request', memberAccount.requestPayoutChange)
router.post('/support', supportLimiter, memberAccount.createSupportMessage)
router.get('/privacy', memberAccount.getPrivacy)
router.put('/privacy', memberAccount.updatePrivacy)

module.exports = router

