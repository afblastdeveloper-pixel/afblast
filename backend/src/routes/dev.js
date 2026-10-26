const express = require('express')
const router = express.Router()
const devController = require('../controllers/devController')
const { authenticateToken, requirePermission } = require('../middleware/auth')

// Semua endpoint /api/dev/* memerlukan autentikasi dan permission yang sesuai
router.use(authenticateToken)

// Feature Flags (dev.flags)
router.get('/flags', requirePermission('dev.flags'), devController.getFlags)
router.post('/flags', requirePermission('dev.flags'), devController.createFlag)
router.put('/flags/:key', requirePermission('dev.flags'), devController.updateFlag)
router.delete('/flags/:key', requirePermission('dev.flags'), devController.deleteFlag)

// Menu Config (dev.menu)
router.get('/menu/:role', requirePermission('dev.menu'), devController.getMenuByRole)
router.put('/menu/:role', requirePermission('dev.menu'), devController.updateMenuByRole)

// Theme (dev.theme)
router.put('/theme', requirePermission('dev.theme'), devController.updateTheme)

// Maintenance (dev.maintenance)
router.put('/maintenance', requirePermission('dev.maintenance'), devController.updateMaintenance)

// Version (dev.version)
router.post('/version', requirePermission('dev.version'), devController.createVersion)

module.exports = router
