const prisma = require('../config/db')
const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../middlewares/authMiddleware')

/**
 * GET /api/config
 * Endpoint publik: (flag, tema, menu sesuai role, versi, status maintenance)
 */
async function getPublicConfig(req, res) {
  try {
    // Tentukan role dari token (jika ada) atau dari query parameter
    let targetRole = 'user'
    if (req.query.role) {
      targetRole = String(req.query.role).toLowerCase()
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET)
        if (decoded && decoded.role) {
          targetRole = decoded.role
        }
      } catch (e) {
        // Abaikan error parsing token pada endpoint publik
      }
    }

    // 1. Feature Flags
    const featureFlags = await prisma.featureFlag.findMany()
    const flags = {}
    featureFlags.forEach((f) => {
      flags[f.key] = f.enabled
    })

    // 2. Tema
    const themeSetting = await prisma.siteSetting.findUnique({
      where: { key: 'theme' },
    })
    let theme = 'light'
    if (themeSetting) {
      try {
        theme = JSON.parse(themeSetting.value)
      } catch (e) {
        theme = themeSetting.value
      }
    }

    // 3. Menu sesuai role
    let menuItems = []
    const menuConfig = await prisma.menuConfig.findUnique({
      where: { role: targetRole },
    })
    if (menuConfig && menuConfig.items) {
      menuItems = menuConfig.items
    }

    // 4. Versi aplikasi terbaru
    const latestVersion = await prisma.appVersion.findFirst({
      orderBy: { createdAt: 'desc' },
    })

    // 5. Status maintenance
    const maintenanceSetting = await prisma.siteSetting.findUnique({
      where: { key: 'maintenance' },
    })
    let maintenance = { enabled: false, message: '' }
    if (maintenanceSetting) {
      try {
        maintenance = JSON.parse(maintenanceSetting.value)
      } catch (e) {
        maintenance = { enabled: maintenanceSetting.value === 'true', message: '' }
      }
    }

    return res.status(200).json({
      role: targetRole,
      flags,
      theme,
      menu: menuItems,
      version: latestVersion ? latestVersion.version : '1.0.0',
      latestRelease: latestVersion || null,
      maintenance,
    })
  } catch (error) {
    console.error('Error saat mengambil config publik:', error)
    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil konfigurasi aplikasi',
      details: error.message,
    })
  }
}

module.exports = {
  getPublicConfig,
}
