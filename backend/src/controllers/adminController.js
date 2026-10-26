const prisma = require('../config/db')
const { logActivity, getClientIp } = require('../utils/logger')

// --- USERS (PENGGUNA) ---
async function getUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.status(200).json({ users })
  } catch (error) {
    console.error('Error in getUsers:', error)
    return res.status(500).json({ error: 'Gagal mengambil data pengguna' })
  }
}

async function createUser(req, res) {
  try {
    const { name, email, password, role = 'user' } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' })
    }

    const bcrypt = require('bcrypt')
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'ADMIN_CREATE_USER',
      target: user.email,
      details: `Menambahkan pengguna baru: ${user.email}`,
      ipAddress: getClientIp(req),
    })

    return res.status(201).json({ message: 'Pengguna berhasil dibuat', user })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email sudah digunakan' })
    }
    return res.status(500).json({ error: 'Gagal membuat pengguna' })
  }
}

async function updateUser(req, res) {
  try {
    const userId = parseInt(req.params.id, 10)
    const { name, email } = req.body

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    return res.status(200).json({ message: 'Pengguna berhasil diperbarui', user: updated })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memperbarui pengguna' })
  }
}

async function deleteUser(req, res) {
  try {
    const userId = parseInt(req.params.id, 10)
    await prisma.user.delete({ where: { id: userId } })
    return res.status(200).json({ message: 'Pengguna berhasil dihapus' })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghapus pengguna' })
  }
}

// --- WITHDRAWALS (PENARIKAN) ---
// Data penarikan dalam in-memory store atau terhubung tabel
let mockWithdrawals = [
  { id: 1, userId: 1, userName: 'Budi Santoso', amount: 500000, bank: 'BCA', accountNumber: '1234567890', status: 'pending', createdAt: new Date() },
  { id: 2, userId: 2, userName: 'Siti Rahma', amount: 1250000, bank: 'Mandiri', accountNumber: '9876543210', status: 'pending', createdAt: new Date() },
]

async function getWithdrawals(req, res) {
  return res.status(200).json({ withdrawals: mockWithdrawals })
}

async function approveWithdrawal(req, res) {
  const id = parseInt(req.params.id, 10)
  const item = mockWithdrawals.find((w) => w.id === id)
  if (!item) {
    return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
  }

  item.status = 'approved'
  item.approvedBy = req.user.username
  item.approvedAt = new Date()

  await logActivity({
    userId: req.user.id,
    adminName: req.user.name,
    action: 'WITHDRAWAL_APPROVE',
    target: `Withdrawal #${id}`,
    details: `Persetujuan penarikan dana ID #${id} sebesar Rp ${item.amount}`,
    ipAddress: getClientIp(req),
  })

  return res.status(200).json({ message: 'Penarikan berhasil disetujui', item })
}

async function rejectWithdrawal(req, res) {
  const id = parseInt(req.params.id, 10)
  const { reason, alasan } = req.body
  const rejectReason = (reason || alasan || '').trim()

  const item = mockWithdrawals.find((w) => w.id === id)
  if (!item) {
    return res.status(404).json({ error: 'Data penarikan tidak ditemukan' })
  }

  item.status = 'rejected'
  item.rejectedBy = req.user.username
  item.rejectionReason = rejectReason || 'Tidak memenuhi syarat'

  await logActivity({
    userId: req.user.id,
    adminName: req.user.name,
    action: 'WITHDRAWAL_REJECT',
    target: `Withdrawal #${id}`,
    details: `Penolakan penarikan dana ID #${id}. Alasan: ${item.rejectionReason}`,
    ipAddress: getClientIp(req),
  })

  return res.status(200).json({ message: 'Penarikan telah ditolak', item })
}

// --- ANNOUNCEMENTS (PENGUMUMAN) ---
let mockAnnouncements = [
  { id: 1, title: 'Pemeliharaan Server Berkala', type: 'info', content: 'Pemeliharaan server dijadwalkan setiap akhir pekan.', isActive: true },
  { id: 2, title: 'Peningkatan Fitur WhatsApp Gateway', type: 'success', content: 'Kecepatan pengiriman pesan kini 2x lebih cepat.', isActive: true },
]

async function getAnnouncements(req, res) {
  return res.status(200).json({ announcements: mockAnnouncements })
}

async function createAnnouncement(req, res) {
  const { title, type = 'info', content } = req.body
  if (!title || !content) {
    return res.status(400).json({ error: 'Judul dan isi pengumuman wajib diisi' })
  }

  const newAnn = {
    id: mockAnnouncements.length + 1,
    title,
    type,
    content,
    isActive: true,
    createdBy: req.user.username,
    createdAt: new Date(),
  }
  mockAnnouncements.unshift(newAnn)

  await logActivity({
    userId: req.user.id,
    adminName: req.user.name,
    action: 'ANNOUNCEMENT_CREATE',
    target: title,
    details: `Membuat pengumuman baru: ${title}`,
    ipAddress: getClientIp(req),
  })

  return res.status(201).json({ message: 'Pengumuman berhasil dibuat', announcement: newAnn })
}

// --- COMMISSIONS & PLANS ---
async function getCommissions(req, res) {
  return res.status(200).json({
    totalCommission: 15450000,
    paidCommission: 11200000,
    pendingCommission: 4250000,
    items: [],
  })
}

async function getPlans(req, res) {
  return res.status(200).json({
    plans: [
      { id: 'starter', name: 'Paket Starter', price: 99000, quota: 1000 },
      { id: 'pro', name: 'Paket Pro', price: 299000, quota: 5000 },
      { id: 'enterprise', name: 'Paket Enterprise', price: 799000, quota: 20000 },
    ],
  })
}

// --- DASHBOARD ---
async function getDashboard(req, res) {
  const totalUsers = await prisma.user.count()
  const totalCampaigns = await prisma.campaign.count()
  const totalMessages = await prisma.campaignMessage.count()

  return res.status(200).json({
    stats: {
      totalUsers,
      totalCampaigns,
      totalMessages,
    },
  })
}

async function getDashboardFinance(req, res) {
  return res.status(200).json({
    finance: {
      totalRevenue: 45800000,
      monthlyRevenue: 12500000,
      pendingWithdrawals: 1750000,
      completedWithdrawals: 8500000,
    },
  })
}

// --- LOGS ---
async function getActivityLogs(req, res) {
  try {
    const logs = await prisma.activityLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
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
    return res.status(200).json({ logs })
  } catch (error) {
    console.error('Error in getActivityLogs:', error)
    return res.status(500).json({ error: 'Gagal mengambil log aktivitas' })
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getAnnouncements,
  createAnnouncement,
  getCommissions,
  getPlans,
  getDashboard,
  getDashboardFinance,
  getActivityLogs,
}
