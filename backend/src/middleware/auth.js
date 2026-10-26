const jwt = require('jsonwebtoken')
const prisma = require('../config/db')
const { getPermissionsForRole, hasPermission } = require('../config/permissions')

const JWT_SECRET = process.env.JWT_SECRET || 'afblast_jwt_secret_staff_roles_2026_super_secure_key'

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      error: 'Token autentikasi tidak ditemukan',
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)

    if (decoded.aud !== 'staff') {
      return res.status(403).json({
        error: 'Akses ditolak: Token tidak valid untuk portal staf',
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        staffStatus: true,
        mustChangePassword: true,
        lockedUntil: true,
      },
    })

    if (!user || user.role === 'user') {
      return res.status(401).json({ error: 'Pengguna staf tidak ditemukan' })
    }

    if (user.staffStatus !== 'approved') {
      return res.status(403).json({
        error: `Akses ditolak: status akun Anda adalah ${user.staffStatus}`,
        staffStatus: user.staffStatus,
      })
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(423).json({
        error: 'Akun sedang terkunci sementara',
      })
    }

    const permissions = getPermissionsForRole(user.role)

    req.user = {
      ...user,
      permissions,
    }

    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token telah kadaluarsa' })
    }
    return res.status(401).json({ error: 'Token autentikasi tidak valid' })
  }
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autentikasi diperlukan' })
    }

    if (!hasPermission(req.user.permissions, perm)) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
        requiredPermission: perm,
        role: req.user.role,
      })
    }

    next()
  }
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  requirePermission,
}
