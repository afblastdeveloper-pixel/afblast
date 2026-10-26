const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../config/db')
const { JWT_SECRET } = require('../middlewares/authMiddleware')
const { logActivity, getClientIp } = require('../utils/logger')

const UNIFORM_ERROR = 'Username atau password salah'

/**
 * Generate unique 8-character referral code (AF + 6 alphanumeric)
 */
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'AF'
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  let exists = await prisma.user.findUnique({ where: { referralCode: code } })
  while (exists) {
    code = 'AF'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    exists = await prisma.user.findUnique({ where: { referralCode: code } })
  }
  return code
}

/**
 * POST /api/auth/register
 * Registrasi pengguna member biasa.
 * HANYA untuk role 'user'. Jangan pernah menerima field role dari client.
 * Tolak jika username / email berformat nama@role staf.
 */
async function register(req, res) {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Nama, email, dan password wajib diisi',
      })
    }

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    // Validasi format email dasar
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        error: 'Format email tidak valid',
      })
    }

    // Tolak format nama@role atau domain staf
    const staffRoleSuffixes = ['superadmin', 'adminfinance', 'developer', 'admin']
    const emailParts = trimmedEmail.split('@')
    if (staffRoleSuffixes.includes(emailParts[1])) {
      return res.status(400).json({
        error: 'Pendaftaran akun staf tidak diizinkan melalui portal member',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password minimal 6 karakter',
      })
    }

    // Validasi opsional username
    let cleanUsername = null
    if (req.body.username && req.body.username.trim().length > 0) {
      cleanUsername = req.body.username.replace(/^@/, '').toLowerCase().trim()
      if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Username harus 3-30 karakter (hanya huruf kecil, angka, dan underscore)',
        })
      }
      const existingUserByUsername = await prisma.user.findFirst({
        where: { username: cleanUsername },
      })
      if (existingUserByUsername) {
        return res.status(409).json({
          error: 'Username sudah digunakan. Silakan gunakan username lain.',
        })
      }
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    })

    if (existingUser) {
      return res.status(409).json({
        error: 'Email sudah terdaftar. Silakan gunakan email lain atau masuk.',
      })
    }

    // Validasi kode referral jika diberikan
    let referredById = null
    let referrerUser = null
    if (req.body.referralCode && req.body.referralCode.trim().length > 0) {
      const cleanRefCode = req.body.referralCode.trim().toUpperCase()
      referrerUser = await prisma.user.findUnique({
        where: { referralCode: cleanRefCode },
      })
      if (!referrerUser) {
        return res.status(400).json({
          error: 'Kode referral tidak ditemukan atau tidak valid',
        })
      }
      referredById = referrerUser.id
    }

    // Generate kode referral unik untuk member baru
    const newReferralCode = await generateUniqueReferralCode()

    const hashedPassword = await bcrypt.hash(password, 10)

    // Role DIPAKSA 'user', staffStatus null
    const newUser = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        username: cleanUsername,
        password: hashedPassword,
        role: 'user',
        staffStatus: null,
        failedLogin: 0,
        referralCode: newReferralCode,
        referredById: referredById,
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        referralCode: true,
        createdAt: true,
      },
    })

    // Buat JWT token dengan klaim aud: 'member'
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: 'user',
        aud: 'member',
        tokenVersion: 0,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    await logActivity({
      userId: newUser.id,
      adminName: newUser.name,
      action: 'MEMBER_REGISTER',
      target: newUser.email,
      details: referredById
        ? `Pendaftaran member baru berhasil via referral ${referrerUser?.referralCode} (${referrerUser?.name})`
        : 'Pendaftaran member baru berhasil',
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: newUser,
    })
  } catch (error) {
    console.error('Error in member register:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan pada server saat registrasi',
      details: error.message,
    })
  }
}

/**
 * POST /api/auth/login
 * Login pengguna member biasa.
 * HANYA untuk role 'user'. Tolak jika username berformat nama@role atau akun berrole staf.
 * Error seragam: "Username atau password salah" untuk mencegah user enumeration.
 * Rate limit & penguncian akun (5 kali gagal = kunci 15 menit).
 */
async function login(req, res) {
  try {
    const { email, username, password } = req.body
    const identifier = (email || username || '').trim().toLowerCase()

    if (!identifier || !password) {
      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    // Tolak jika identifier berformat nama@role staf
    const parts = identifier.split('@')
    const staffRoles = ['superadmin', 'adminfinance', 'developer', 'admin']
    if (parts.length === 2 && staffRoles.includes(parts[1])) {
      return res.status(401).json({ error: UNIFORM_ERROR })
    }

    // Cari user berdasarkan email atau username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    })

    // Jika user tidak ditemukan ATAU rolenya bukan 'user' (adalah staf), tolak dengan UNIFORM_ERROR
    if (!user || user.role !== 'user') {
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

    // Bandingkan password
    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      const newFailedCount = (user.failedLogin || 0) + 1
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
        action: 'MEMBER_LOGIN_FAILED',
        target: user.email,
        details: `Login member gagal ke-${newFailedCount}${isNowLocked ? ' (akun dikunci 15 menit)' : ''}`,
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

    // Reset failedLogin dan lockedUntil setelah login berhasil
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogin: 0,
        lockedUntil: null,
      },
    })

    // Buat JWT token dengan klaim aud: 'member'
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'user',
        aud: 'member',
        tokenVersion: user.tokenVersion || 0,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    await logActivity({
      userId: user.id,
      adminName: user.name,
      action: 'MEMBER_LOGIN',
      target: user.email,
      details: `Member ${user.email} berhasil login`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        referralCode: user.referralCode,
      },
    })
  } catch (error) {
    console.error('Error in member login:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan pada server saat login',
      details: error.message,
    })
  }
}

/**
 * GET /api/auth/me
 * Mengambil profil member yang sedang login
 */
async function getProfile(req, res) {
  try {
    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        referralCode: req.user.referralCode,
        createdAt: req.user.createdAt,
      },
    })
  } catch (error) {
    console.error('Error in member getProfile:', error)
    return res.status(500).json({ error: 'Gagal mengambil data profil member' })
  }
}

module.exports = {
  register,
  login,
  getProfile,
}
