const prisma = require('../config/db')
const { logActivity, getClientIp } = require('../utils/logger')

/**
 * GET /api/admin/staff?status=pending
 * Daftar staf dengan filter status opsional
 */
async function getStaffList(req, res) {
  try {
    const { status } = req.query

    const whereClause = {
      role: {
        in: ['superadmin', 'adminfinance', 'developer'],
      },
    }

    if (status) {
      whereClause.staffStatus = status
    }

    const staff = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        rejectionReason: true,
        approvedAt: true,
        failedLogin: true,
        lockedUntil: true,
        createdAt: true,
        approver: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.status(200).json({ staff })
  } catch (error) {
    console.error('Error in getStaffList:', error)
    return res.status(500).json({ error: 'Gagal mengambil daftar staf' })
  }
}

/**
 * PATCH /api/admin/staff/:id/approve
 * Persetujuan akun staf (hanya superadmin)
 */
async function approveStaff(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna staf tidak ditemukan' })
    }

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: {
        staffStatus: 'approved',
        approvedById: req.user.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        approvedAt: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'STAFF_APPROVE',
      target: targetUser.username,
      details: `Superadmin ${req.user.username} menyetujui akun ${targetUser.username}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: `Akun staf ${updated.username} berhasil disetujui`,
      user: updated,
    })
  } catch (error) {
    console.error('Error in approveStaff:', error)
    return res.status(500).json({ error: 'Gagal menyetujui staf' })
  }
}

/**
 * PATCH /api/admin/staff/:id/reject
 * Penolakan akun staf (alasan wajib)
 */
async function rejectStaff(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    const { alasan, reason } = req.body
    const rejectReason = (alasan || reason || '').trim()

    if (!rejectReason) {
      return res.status(400).json({
        error: 'Alasan penolakan wajib diisi',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna staf tidak ditemukan' })
    }

    // Superadmin tidak boleh menolak dirinya sendiri
    if (targetUser.id === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh menolak akun diri sendiri',
      })
    }

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: {
        staffStatus: 'rejected',
        rejectionReason: rejectReason,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        rejectionReason: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'STAFF_REJECT',
      target: targetUser.username,
      details: `Superadmin ${req.user.username} menolak akun ${targetUser.username}. Alasan: ${rejectReason}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: `Akun staf ${updated.username} telah ditolak`,
      user: updated,
    })
  } catch (error) {
    console.error('Error in rejectStaff:', error)
    return res.status(500).json({ error: 'Gagal menolak staf' })
  }
}

/**
 * PATCH /api/admin/staff/:id/suspend
 * Nonaktifkan staf
 * Aturan: Superadmin tidak boleh menonaktifkan diri sendiri, dan harus tersisa minimal 1 superadmin aktif
 */
async function suspendStaff(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna staf tidak ditemukan' })
    }

    // Tidak boleh menonaktifkan diri sendiri
    if (targetUser.id === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh menonaktifkan dirinya sendiri',
      })
    }

    // Jika yang disuspend adalah superadmin, pastikan tersisa minimal 1 superadmin aktif
    if (targetUser.role === 'superadmin') {
      const activeSuperadminCount = await prisma.user.count({
        where: {
          role: 'superadmin',
          staffStatus: 'approved',
          NOT: { id: staffId },
        },
      })

      if (activeSuperadminCount < 1) {
        return res.status(400).json({
          error: 'Tindakan dibatalkan: harus tersisa minimal 1 superadmin aktif di sistem',
        })
      }
    }

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: {
        staffStatus: 'suspended',
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'STAFF_SUSPEND',
      target: targetUser.username,
      details: `Superadmin ${req.user.username} menonaktifkan (suspend) staf ${targetUser.username}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: `Akun staf ${updated.username} berhasil dinonaktifkan (suspended)`,
      user: updated,
    })
  } catch (error) {
    console.error('Error in suspendStaff:', error)
    return res.status(500).json({ error: 'Gagal menonaktifkan staf' })
  }
}

/**
 * PATCH /api/admin/staff/:id/role
 * Mengubah role staf
 * Aturan: Superadmin tidak boleh mengubah role dirinya sendiri, dan harus tersisa minimal 1 superadmin aktif
 */
async function changeStaffRole(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    const { role: newRole } = req.body
    if (!newRole || !['superadmin', 'adminfinance', 'developer', 'user'].includes(newRole)) {
      return res.status(400).json({
        error: 'Role baru tidak valid. Pilihan: superadmin, adminfinance, developer, user',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna staf tidak ditemukan' })
    }

    // Tidak boleh mengubah role diri sendiri
    if (targetUser.id === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh mengubah role dirinya sendiri',
      })
    }

    // Jika yang diubah adalah superadmin menjadi non-superadmin, pastikan tersisa minimal 1 superadmin aktif
    if (targetUser.role === 'superadmin' && newRole !== 'superadmin') {
      const activeSuperadminCount = await prisma.user.count({
        where: {
          role: 'superadmin',
          staffStatus: 'approved',
          NOT: { id: staffId },
        },
      })

      if (activeSuperadminCount < 1) {
        return res.status(400).json({
          error: 'Tindakan dibatalkan: harus tersisa minimal 1 superadmin aktif di sistem',
        })
      }
    }

    // Sinkronkan username suffix dengan role baru jika ada username
    let updatedUsername = targetUser.username
    if (targetUser.username && targetUser.username.includes('@')) {
      const namePart = targetUser.username.split('@')[0]
      updatedUsername = `${namePart}@${newRole}`

      // Cek bentrok username baru
      const conflict = await prisma.user.findUnique({
        where: { username: updatedUsername },
      })
      if (conflict && conflict.id !== staffId) {
        return res.status(409).json({
          error: `Username ${updatedUsername} sudah digunakan oleh akun lain`,
        })
      }
    }

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: {
        role: newRole,
        username: updatedUsername,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'STAFF_ROLE_CHANGE',
      target: targetUser.username,
      details: `Mengubah role ${targetUser.username} dari ${targetUser.role} menjadi ${newRole}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: `Role staf berhasil diubah menjadi ${newRole}`,
      user: updated,
    })
  } catch (error) {
    console.error('Error in changeStaffRole:', error)
    return res.status(500).json({ error: 'Gagal mengubah role staf' })
  }
}

module.exports = {
  getStaffList,
  approveStaff,
  rejectStaff,
  suspendStaff,
  changeStaffRole,
}
