const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../config/db')
const { getPermissionsForRole } = require('../config/permissions')
const { logActivity, getClientIp } = require('../utils/logger')
const { JWT_SECRET } = require('../middleware/auth')

/**
 * POST /api/staff/register
 * Input: nama, password, role (hanya adminfinance atau developer; tolak superadmin)
 * Server membuat username = nama@role (huruf kecil, unik), staffStatus=pending. Tidak mengembalikan token.
 */
async function register(req, res) {
  try {
    const { nama, name, password, role } = req.body
    const staffName = nama || name

    if (!staffName || !password || !role) {
      return res.status(400).json({
        error: 'Nama, password, dan role wajib diisi',
      })
    }

    const normalizedRole = role.toLowerCase().trim()

    // Tolak superadmin & role tidak sah
    if (normalizedRole === 'superadmin') {
      return res.status(400).json({
        error: 'Pendaftaran role superadmin tidak diizinkan melalui endpoint ini',
      })
    }

    if (!['adminfinance', 'developer'].includes(normalizedRole)) {
      return res.status(400).json({
        error: 'Role staf yang diizinkan hanya adminfinance atau developer',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password minimal 6 karakter',
      })
    }

    // Format username: nama@role (huruf kecil)
    const cleanName = staffName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')

    if (!cleanName) {
      return res.status(400).json({
        error: 'Format nama tidak valid untuk pembuatan username',
      })
    }

    const username = `${cleanName}@${normalizedRole}`

    // Cek apakah username sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { username },
    })

    if (existingUser) {
      return res.status(409).json({
        error: `Username ${username} sudah terdaftar. Silakan gunakan nama lain.`,
      })
    }

    // Buat email unik internal jika tidak disediakan
    const staffEmail = `${cleanName}.${normalizedRole}.${Date.now()}@staff.afblast.internal`

    const hashedPassword = await bcrypt.hash(password, 10)

    const newUser = await prisma.user.create({
      data: {
        name: staffName.trim(),
        username,
        email: staffEmail,
        password: hashedPassword,
        role: normalizedRole,
        staffStatus: 'pending',
        failedLogin: 0,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        createdAt: true,
      },
    })

    await logActivity({
      userId: newUser.id,
      adminName: newUser.name,
      action: 'STAFF_REGISTER',
      target: username,
      details: `Pendaftaran staf baru ${username} dengan status pending`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    // Tidak mengembalikan token
    return res.status(201).json({
      message: 'Pendaftaran staf berhasil. Akun Anda sedang menunggu persetujuan Superadmin.',
      user: newUser,
    })
  } catch (error) {
    console.error('Error in staff register:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan pada server saat mendaftarkan staf',
      details: error.message,
    })
  }
}

/**
 * POST /api/staff/login
 * Input: username (nama@role) + password.
 * Server parse suffix, wajib sama dengan role di database, staffStatus harus approved, bcrypt compare.
 * Pesan error seragam ("Username atau password salah").
 * Rate limit + kunci akun 15 menit setelah 5 gagal.
 * Kembalikan JWT berisi id, role, permissions.
 */
async function login(req, res) {
  try {
    const { username, password } = req.body

    const UNIFORM_ERROR = 'Username atau password salah'

    if (!username || !password) {
      return res.status(400).json({ error: UNIFORM_ERROR })
    }

    const trimmedUsername = username.trim().toLowerCase()
    const parts = trimmedUsername.split('@')

    // Parse suffix role
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    const [, roleSuffix] = parts

    // Cari user berdasarkan username
    const user = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    })

    if (!user || user.role === 'user') {
      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    // Role di database wajib sama dengan suffix role di username
    if (user.role !== roleSuffix) {
      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    // Cek apakah akun sedang terkunci (setelah 5 kali gagal)
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000)
      )
      return res.status(423).json({
        error: `Akun terkunci selama 15 menit karena 5 kali percobaan login gagal. Coba lagi dalam ${remainingMinutes} menit.`,
        locked: true,
      })
    }

    // Validasi Password
    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      const newFailedCount = user.failedLogin + 1
      const isNowLocked = newFailedCount >= 5

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogin: newFailedCount,
          lockedUntil: isNowLocked
            ? new Date(Date.now() + 15 * 60 * 1000)
            : user.lockedUntil,
        },
      })

      await logActivity({
        userId: user.id,
        adminName: user.name,
        action: 'STAFF_LOGIN_FAILED',
        target: user.username,
        details: `Login gagal ke-${newFailedCount}${isNowLocked ? ' (akun dikunci 15 menit)' : ''}`,
        ipAddress: getClientIp(req),
        status: 'failed',
      })

      if (isNowLocked) {
        return res.status(423).json({
          error: 'Akun terkunci selama 15 menit karena 5 kali percobaan login gagal.',
          locked: true,
        })
      }

      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    // Password benar, cek staffStatus: harus approved
    if (user.staffStatus !== 'approved') {
      await logActivity({
        userId: user.id,
        adminName: user.name,
        action: 'STAFF_LOGIN_REJECTED',
        target: user.username,
        details: `Login ditolak karena status akun: ${user.staffStatus}`,
        ipAddress: getClientIp(req),
        status: 'blocked',
      })

      return res.status(403).json({
        error: `Akun Anda belum dapat digunakan karena berstatus: ${user.staffStatus}`,
        staffStatus: user.staffStatus,
      })
    }

    // Reset failedLogin dan lockedUntil setelah login berhasil
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogin: 0,
        lockedUntil: null,
      },
    })

    const permissions = getPermissionsForRole(user.role)

    // Buat JWT berisi id, role, permissions, aud: 'staff'
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions,
        aud: 'staff',
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    await logActivity({
      userId: user.id,
      adminName: user.name,
      action: 'STAFF_LOGIN',
      target: user.username,
      details: `Staf ${user.username} berhasil login`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        staffStatus: user.staffStatus,
        mustChangePassword: user.mustChangePassword,
        permissions,
      },
      permissions,
    })
  } catch (error) {
    console.error('Error in staff login:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan pada server saat login',
      details: error.message,
    })
  }
}

/**
 * GET /api/staff/me
 * Kembalikan profil + permissions + role
 */
async function getProfile(req, res) {
  try {
    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        staffStatus: req.user.staffStatus,
        mustChangePassword: req.user.mustChangePassword,
      },
      role: req.user.role,
      permissions: req.user.permissions,
    })
  } catch (error) {
    console.error('Error in staff getProfile:', error)
    return res.status(500).json({ error: 'Gagal mengambil data profil' })
  }
}

/**
 * POST /api/staff/change-password
 * Ubah password (khususnya untuk akun yang mustChangePassword = true saat login pertama)
 */
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'Password baru minimal 6 karakter',
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    })

    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' })
    }

    if (oldPassword) {
      const isMatch = await bcrypt.compare(oldPassword, user.password)
      if (!isMatch) {
        return res.status(400).json({ error: 'Password lama salah' })
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    })

    await logActivity({
      userId: user.id,
      adminName: user.name,
      action: 'STAFF_CHANGE_PASSWORD',
      target: user.username,
      details: 'Pengguna berhasil mengganti password',
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Password berhasil diperbarui',
    })
  } catch (error) {
    console.error('Error in changePassword:', error)
    return res.status(500).json({ error: 'Gagal mengubah password' })
  }
}

module.exports = {
  register,
  login,
  getProfile,
  changePassword,
}
