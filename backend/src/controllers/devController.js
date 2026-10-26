const prisma = require('../config/db')
const jwt = require('jsonwebtoken')
const { logActivity, getClientIp } = require('../utils/logger')
const { JWT_SECRET } = require('../middleware/auth')

// --- FEATURE FLAGS ---

async function getFlags(req, res) {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    })
    return res.status(200).json({ flags })
  } catch (error) {
    console.error('Error in getFlags:', error)
    return res.status(500).json({ error: 'Gagal mengambil feature flags' })
  }
}

async function createFlag(req, res) {
  try {
    const { key, enabled = true } = req.body

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Key feature flag wajib diisi' })
    }

    const cleanKey = key.trim().toLowerCase()

    const flag = await prisma.featureFlag.create({
      data: {
        key: cleanKey,
        enabled: Boolean(enabled),
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_FLAG_CREATE',
      target: cleanKey,
      details: `Menambahkan feature flag ${cleanKey} (enabled: ${flag.enabled})`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({ message: 'Feature flag berhasil dibuat', flag })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Key feature flag sudah ada' })
    }
    console.error('Error in createFlag:', error)
    return res.status(500).json({ error: 'Gagal membuat feature flag' })
  }
}

async function updateFlag(req, res) {
  try {
    const { key } = req.params
    const { enabled } = req.body

    if (enabled === undefined) {
      return res.status(400).json({ error: 'Nilai enabled wajib diisi' })
    }

    const flag = await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled: Boolean(enabled) },
      create: { key, enabled: Boolean(enabled) },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_FLAG_UPDATE',
      target: key,
      details: `Mengubah feature flag ${key} menjadi ${flag.enabled}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: 'Feature flag berhasil diperbarui', flag })
  } catch (error) {
    console.error('Error in updateFlag:', error)
    return res.status(500).json({ error: 'Gagal memperbarui feature flag' })
  }
}

async function deleteFlag(req, res) {
  try {
    const { key } = req.params

    await prisma.featureFlag.delete({
      where: { key },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_FLAG_DELETE',
      target: key,
      details: `Menghapus feature flag ${key}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({ message: `Feature flag ${key} berhasil dihapus` })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Feature flag tidak ditemukan' })
    }
    console.error('Error in deleteFlag:', error)
    return res.status(500).json({ error: 'Gagal menghapus feature flag' })
  }
}

// --- MENU CONFIG ---

async function getMenuByRole(req, res) {
  try {
    const { role } = req.params

    const validRoles = ['user', 'superadmin', 'adminfinance', 'developer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' })
    }

    const menu = await prisma.menuConfig.findUnique({
      where: { role },
    })

    return res.status(200).json({
      role,
      items: menu ? menu.items : [],
    })
  } catch (error) {
    console.error('Error in getMenuByRole:', error)
    return res.status(500).json({ error: 'Gagal mengambil konfigurasi menu' })
  }
}

async function updateMenuByRole(req, res) {
  try {
    const { role } = req.params
    const { items } = req.body

    const validRoles = ['user', 'superadmin', 'adminfinance', 'developer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' })
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items menu harus berupa array' })
    }

    const menu = await prisma.menuConfig.upsert({
      where: { role },
      update: { items },
      create: { role, items },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_MENU_UPDATE',
      target: role,
      details: `Memperbarui menu config untuk role ${role}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: `Menu untuk role ${role} berhasil diperbarui`,
      menu,
    })
  } catch (error) {
    console.error('Error in updateMenuByRole:', error)
    return res.status(500).json({ error: 'Gagal memperbarui menu' })
  }
}

// --- THEME ---

async function updateTheme(req, res) {
  try {
    const { theme, value } = req.body
    const themeValue = theme || value

    if (!themeValue || typeof themeValue !== 'string') {
      return res.status(400).json({ error: 'Tema wajib diisi (string)' })
    }

    const setting = await prisma.siteSetting.upsert({
      where: { key: 'theme' },
      update: { value: themeValue },
      create: { key: 'theme', value: themeValue },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_THEME_UPDATE',
      target: 'theme',
      details: `Tema sistem diubah menjadi: ${themeValue}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Tema berhasil diperbarui',
      theme: setting.value,
    })
  } catch (error) {
    console.error('Error in updateTheme:', error)
    return res.status(500).json({ error: 'Gagal memperbarui tema' })
  }
}

// --- MAINTENANCE ---

async function updateMaintenance(req, res) {
  try {
    const { enabled, message } = req.body

    const maintenanceData = {
      enabled: Boolean(enabled),
      message: message || (enabled ? 'Sistem sedang dalam pemeliharaan berkala.' : ''),
      updatedAt: new Date().toISOString(),
    }

    const setting = await prisma.siteSetting.upsert({
      where: { key: 'maintenance' },
      update: { value: JSON.stringify(maintenanceData) },
      create: { key: 'maintenance', value: JSON.stringify(maintenanceData) },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_MAINTENANCE_UPDATE',
      target: 'maintenance',
      details: `Status maintenance diubah menjadi: ${maintenanceData.enabled}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Status pemeliharaan (maintenance) berhasil diperbarui',
      maintenance: maintenanceData,
    })
  } catch (error) {
    console.error('Error in updateMaintenance:', error)
    return res.status(500).json({ error: 'Gagal memperbarui mode maintenance' })
  }
}

// --- VERSION ---

async function createVersion(req, res) {
  try {
    const { version, note } = req.body

    if (!version || typeof version !== 'string') {
      return res.status(400).json({ error: 'Versi aplikasi wajib diisi (string)' })
    }

    const newVersion = await prisma.appVersion.create({
      data: {
        version: version.trim(),
        note: note ? note.trim() : null,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DEV_VERSION_CREATE',
      target: newVersion.version,
      details: `Merilis versi aplikasi baru: ${newVersion.version}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({
      message: 'Versi aplikasi berhasil dicatat',
      version: newVersion,
    })
  } catch (error) {
    console.error('Error in createVersion:', error)
    return res.status(500).json({ error: 'Gagal mencatat versi aplikasi' })
  }
}

// --- PUBLIC CONFIG ENDPOINT ---
// GET /api/config
// Mengembalikan flag, tema, menu sesuai role (jika login) atau default, versi, status maintenance

async function getPublicConfig(req, res) {
  try {
    // Cek apakah ada token opsional untuk menyesuaikan menu dengan role
    let userRole = null
    const authHeader = req.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      try {
        const decoded = jwt.verify(token, JWT_SECRET)
        userRole = decoded.role
      } catch {
        // Abaikan token tidak valid di public config
      }
    }

    // 1. Feature flags
    const rawFlags = await prisma.featureFlag.findMany()
    const flags = {}
    rawFlags.forEach((f) => {
      flags[f.key] = f.enabled
    })

    // 2. Theme
    const themeSetting = await prisma.siteSetting.findUnique({
      where: { key: 'theme' },
    })
    const theme = themeSetting ? themeSetting.value : 'light'

    // 3. Maintenance
    const maintenanceSetting = await prisma.siteSetting.findUnique({
      where: { key: 'maintenance' },
    })
    let maintenance = { enabled: false, message: '' }
    if (maintenanceSetting) {
      try {
        maintenance = JSON.parse(maintenanceSetting.value)
      } catch {
        maintenance = { enabled: maintenanceSetting.value === 'true', message: '' }
      }
    }

    // 4. Version
    const latestVersion = await prisma.appVersion.findFirst({
      orderBy: { createdAt: 'desc' },
    })
    const version = latestVersion
      ? { version: latestVersion.version, note: latestVersion.note, createdAt: latestVersion.createdAt }
      : { version: '1.0.0', note: 'Initial Release' }

    // 5. Menu sesuai role jika ada, atau list default
    let menu = []
    if (userRole) {
      const menuConfig = await prisma.menuConfig.findUnique({
        where: { role: userRole },
      })
      menu = menuConfig ? menuConfig.items : []
    }

    return res.status(200).json({
      flags,
      theme,
      maintenance,
      version,
      role: userRole,
      menu,
    })
  } catch (error) {
    console.error('Error in getPublicConfig:', error)
    return res.status(500).json({ error: 'Gagal mengambil konfigurasi aplikasi' })
  }
}

async function getFlag(req, res) {
  try {
    const { key } = req.params
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
    })
    if (!flag) {
      return res.status(404).json({ error: 'Feature flag tidak ditemukan' })
    }
    return res.status(200).json({ flag })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil feature flag' })
  }
}

module.exports = {
  getFlags,
  listFlags: getFlags,
  getFlag,
  createFlag,
  updateFlag,
  deleteFlag,
  getMenuByRole,
  getMenuConfig: getMenuByRole,
  updateMenuByRole,
  updateMenuConfig: updateMenuByRole,
  updateTheme,
  updateMaintenance,
  createVersion,
  getPublicConfig,
}
