const jwt = require('jsonwebtoken')
const prisma = require('../config/db')
const { getPermissionsByRole, hasPermission } = require('../config/permissions')

const JWT_SECRET = process.env.JWT_SECRET || 'afblast_jwt_secret_staff_roles_2026_super_secure_key'

/**
 * Middleware untuk memverifikasi autentikasi dan izin staf (requirePermission)
 * Wajib memiliki klaim aud: 'staff'. Menolak token member (aud: 'member').
 * Role dan permission selalu dibaca dari database / konfigurasi server.
 * @param {string|null} permission - Nama permission yang diperlukan (misal: 'withdrawal.approve')
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Autentikasi gagal: Token tidak disediakan',
        })
      }

      const token = authHeader.split(' ')[1]
      let decoded
      try {
        decoded = jwt.verify(token, JWT_SECRET)
      } catch (err) {
        return res.status(401).json({
          error: 'Autentikasi gagal: Token tidak valid atau kedaluwarsa',
        })
      }

      // Validasi aud: WAJIB 'staff'
      if (decoded.aud !== 'staff') {
        return res.status(403).json({
          error: 'Akses ditolak: Token tidak valid untuk portal staf',
          aud: decoded.aud,
        })
      }

      // Ambil user terbaru dari database
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      })

      if (!user) {
        return res.status(401).json({
          error: 'Autentikasi gagal: Pengguna tidak ditemukan',
        })
      }

      // Tolak jika role user biasa
      if (user.role === 'user') {
        return res.status(403).json({
          error: 'Akses ditolak: Akun member tidak diizinkan mengakses panel staf',
        })
      }

      // Pastikan akun staf disetujui
      if (user.staffStatus !== 'approved') {
        return res.status(403).json({
          error: `Akses ditolak: Status staf adalah '${user.staffStatus}'`,
          staffStatus: user.staffStatus,
        })
      }

      // Cek apakah akun sedang terkunci
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        return res.status(423).json({
          error: 'Akun sedang terkunci karena upaya login gagal berulang kali',
          lockedUntil: user.lockedUntil,
        })
      }

      // Validasi permissions jika permission spesifik diminta
      const userPermissions = getPermissionsByRole(user.role)

      if (permission && !hasPermission(user.role, permission)) {
        return res.status(403).json({
          error: `Akses ditolak: Anda tidak memiliki izin '${permission}'`,
          requiredPermission: permission,
          userRole: user.role,
        })
      }

      req.user = user
      req.userPermissions = userPermissions
      next()
    } catch (error) {
      console.error('Error pada requirePermission middleware:', error)
      return res.status(500).json({
        error: 'Terjadi kesalahan pada verifikasi otorisasi',
        details: error.message,
      })
    }
  }
}

/**
 * Middleware autentikasi umum staf (memastikan staf terautentikasi dan status approved)
 */
const requireAuth = requirePermission(null)

/**
 * Middleware untuk memverifikasi autentikasi Member (/api/auth/*)
 * Wajib memiliki klaim aud: 'member'. Menolak token staf (aud: 'staff').
 */
async function requireMemberAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Autentikasi gagal: Token tidak disediakan',
      })
    }

    const token = authHeader.split(' ')[1]
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      return res.status(401).json({
        error: 'Autentikasi gagal: Token tidak valid atau kedaluwarsa',
      })
    }

    // Validasi aud: WAJIB 'member'
    if (decoded.aud !== 'member') {
      return res.status(403).json({
        error: 'Akses ditolak: Token bukan token portal member',
        aud: decoded.aud,
      })
    }

    // Ambil user dari database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    })

    if (!user) {
      return res.status(401).json({
        error: 'Autentikasi gagal: Pengguna tidak ditemukan',
      })
    }

    // Pastikan role memang 'user'
    if (user.role !== 'user') {
      return res.status(403).json({
        error: 'Akses ditolak: Token tidak valid untuk akun member',
      })
    }

    // Cek penguncian akun
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(423).json({
        error: 'Akun sedang terkunci karena upaya login gagal berulang kali',
        lockedUntil: user.lockedUntil,
      })
    }

    // Validasi tokenVersion: Batalkan JWT lama jika password baru saja diubah
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        error: 'Sesi telah kedaluwarsa atau kata sandi baru saja diubah. Silakan masuk kembali.',
      })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Error pada requireMemberAuth middleware:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan pada verifikasi autentikasi member',
      details: error.message,
    })
  }
}

module.exports = {
  requirePermission,
  requireAuth,
  requireMemberAuth,
  JWT_SECRET,
}
