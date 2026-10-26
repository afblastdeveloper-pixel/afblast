const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')

/**
 * GET /api/admin/staff?status=pending
 * Mengambil daftar akun staf (hanya izin staff.approve)
 */
async function listStaff(req, res) {
  try {
    const { status } = req.query

    const where = {
      role: {
        in: ['superadmin', 'adminfinance', 'developer'],
      },
    }

    if (status) {
      where.staffStatus = status
    }

    const staffList = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        rejectionReason: true,
        failedLogin: true,
        lockedUntil: true,
        mustChangePassword: true,
        approvedAt: true,
        approvedById: true,
        createdAt: true,
        updatedAt: true,
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

    return res.status(200).json({
      total: staffList.length,
      staff: staffList,
    })
  } catch (error) {
    console.error('Error saat mengambil daftar staf:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan server saat mengambil daftar staf',
      details: error.message,
    })
  }
}

/**
 * PATCH /api/admin/staff/:id/approve
 * Menyetujui pendaftaran akun staf
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
      return res.status(404).json({ error: 'Akun staf tidak ditemukan' })
    }

    const updatedUser = await prisma.user.update({
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
        role: true,
        staffStatus: true,
        approvedAt: true,
        approvedById: true,
      },
    })

    // Catat ke ActivityLog
    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'APPROVE_STAFF',
      target: targetUser.username || targetUser.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Superadmin ${req.user.name} menyetujui akun staf ${targetUser.username} (${targetUser.role})`,
    })

    return res.status(200).json({
      message: `Akun staf ${targetUser.username} berhasil disetujui (approved)`,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error saat menyetujui staf:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan saat menyetujui akun staf',
      details: error.message,
    })
  }
}

/**
 * PATCH /api/admin/staff/:id/reject
 * Menolak akun staf (alasan wajib)
 * Superadmin tidak boleh menolak dirinya sendiri, dan minimal 1 superadmin aktif.
 */
async function rejectStaff(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    const { reason, alasan } = req.body
    const rejectionReason = (reason || alasan || '').trim()

    if (!rejectionReason) {
      return res.status(400).json({
        error: 'Alasan penolakan wajib diisi (reason)',
      })
    }

    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    // Tidak boleh menolak akun dirinya sendiri
    if (staffId === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh menolak atau menonaktifkan dirinya sendiri',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Akun staf tidak ditemukan' })
    }

    // Jika target adalah superadmin, pastikan minimal 1 superadmin aktif tersisa
    if (targetUser.role === 'superadmin' && targetUser.staffStatus === 'approved') {
      const activeSuperadmins = await prisma.user.count({
        where: {
          role: 'superadmin',
          staffStatus: 'approved',
          NOT: { id: staffId },
        },
      })

      if (activeSuperadmins < 1) {
        return res.status(400).json({
          error: 'Tidak dapat menolak akun superadmin. Harus tersisa minimal 1 superadmin aktif.',
        })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: {
        staffStatus: 'rejected',
        rejectionReason,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        staffStatus: true,
        rejectionReason: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'REJECT_STAFF',
      target: targetUser.username || targetUser.name,
      ipAddress: req.ip,
      status: 'rejected',
      details: `Menolak akun staf ${targetUser.username}. Alasan: ${rejectionReason}`,
    })

    return res.status(200).json({
      message: `Akun staf ${targetUser.username} ditolak`,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error saat menolak staf:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan saat menolak akun staf',
      details: error.message,
    })
  }
}

/**
 * PATCH /api/admin/staff/:id/suspend
 * Menonaktifkan sementara akun staf
 * Superadmin tidak boleh menonaktifkan dirinya sendiri, minimal 1 superadmin aktif.
 */
async function suspendStaff(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    if (staffId === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh menonaktifkan dirinya sendiri',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Akun staf tidak ditemukan' })
    }

    if (targetUser.role === 'superadmin' && targetUser.staffStatus === 'approved') {
      const activeSuperadmins = await prisma.user.count({
        where: {
          role: 'superadmin',
          staffStatus: 'approved',
          NOT: { id: staffId },
        },
      })

      if (activeSuperadmins < 1) {
        return res.status(400).json({
          error: 'Tidak dapat menonaktifkan superadmin. Harus tersisa minimal 1 superadmin aktif.',
        })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: {
        staffStatus: 'suspended',
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        staffStatus: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'SUSPEND_STAFF',
      target: targetUser.username || targetUser.name,
      ipAddress: req.ip,
      status: 'warning',
      details: `Menonaktifkan sementara akun staf ${targetUser.username}`,
    })

    return res.status(200).json({
      message: `Akun staf ${targetUser.username} berhasil dinonaktifkan (suspended)`,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error saat suspend staf:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan saat menonaktifkan akun staf',
      details: error.message,
    })
  }
}

/**
 * PATCH /api/admin/staff/:id/role
 * Mengubah role akun staf
 * Superadmin tidak boleh mengubah dirinya sendiri, minimal 1 superadmin aktif.
 */
async function updateStaffRole(req, res) {
  try {
    const staffId = parseInt(req.params.id, 10)
    const { role } = req.body

    if (!role) {
      return res.status(400).json({ error: 'Role baru wajib diisi' })
    }

    const validRoles = ['superadmin', 'adminfinance', 'developer']
    const newRole = String(role).trim().toLowerCase()

    if (!validRoles.includes(newRole)) {
      return res.status(400).json({
        error: `Role tidak valid. Harus salah satu dari: ${validRoles.join(', ')}`,
      })
    }

    if (isNaN(staffId)) {
      return res.status(400).json({ error: 'ID staf tidak valid' })
    }

    if (staffId === req.user.id) {
      return res.status(400).json({
        error: 'Superadmin tidak boleh mengubah role dirinya sendiri',
      })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: staffId },
    })

    if (!targetUser) {
      return res.status(404).json({ error: 'Akun staf tidak ditemukan' })
    }

    // Jika target sebelumnya superadmin aktif dan diubah ke role lain
    if (
      targetUser.role === 'superadmin' &&
      newRole !== 'superadmin' &&
      targetUser.staffStatus === 'approved'
    ) {
      const activeSuperadmins = await prisma.user.count({
        where: {
          role: 'superadmin',
          staffStatus: 'approved',
          NOT: { id: staffId },
        },
      })

      if (activeSuperadmins < 1) {
        return res.status(400).json({
          error: 'Tidak dapat mengubah role superadmin. Harus tersisa minimal 1 superadmin aktif.',
        })
      }
    }

    // Perbarui username agar suffix sesuai dengan role baru jika berformat nama@role
    let updatedUsername = targetUser.username
    if (targetUser.username && targetUser.username.includes('@')) {
      const baseName = targetUser.username.split('@')[0]
      const candidateUsername = `${baseName}@${newRole}`

      // Cek keunikan jika nama berubah
      if (candidateUsername !== targetUser.username) {
        const existingWithUsername = await prisma.user.findUnique({
          where: { username: candidateUsername },
        })
        if (!existingWithUsername) {
          updatedUsername = candidateUsername
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: {
        role: newRole,
        username: updatedUsername,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        staffStatus: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CHANGE_STAFF_ROLE',
      target: targetUser.username || targetUser.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengubah role staf ${targetUser.username} dari ${targetUser.role} menjadi ${newRole}`,
    })

    return res.status(200).json({
      message: `Role akun staf ${targetUser.username} berhasil diubah menjadi ${newRole}`,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error saat ubah role staf:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengubah role akun staf',
      details: error.message,
    })
  }
}

module.exports = {
  listStaff,
  approveStaff,
  rejectStaff,
  suspendStaff,
  updateStaffRole,
}
