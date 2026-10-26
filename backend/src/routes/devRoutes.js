const express = require('express')
const router = express.Router()
const devController = require('../controllers/devController')
const { requirePermission } = require('../middlewares/authMiddleware')

/**
 * 1. Feature Flags (CRUD /api/dev/flags) -> izin: dev.flags
 */
router.get('/flags', requirePermission('dev.flags'), devController.listFlags)
router.post('/flags', requirePermission('dev.flags'), devController.createFlag)
router.get('/flags/:key', requirePermission('dev.flags'), devController.getFlag)
router.put('/flags/:key', requirePermission('dev.flags'), devController.updateFlag)
router.delete('/flags/:key', requirePermission('dev.flags'), devController.deleteFlag)

/**
 * 2. Menu Config (GET/PUT /api/dev/menu/:role) -> izin: dev.menu
 */
router.get('/menu/:role', requirePermission('dev.menu'), devController.getMenuConfig)
router.put('/menu/:role', requirePermission('dev.menu'), devController.updateMenuConfig)

/**
 * 3. Theme (PUT /api/dev/theme) -> izin: dev.theme
 */
router.put('/theme', requirePermission('dev.theme'), devController.updateTheme)

/**
 * 4. Maintenance (PUT /api/dev/maintenance) -> izin: dev.maintenance
 */
router.put('/maintenance', requirePermission('dev.maintenance'), devController.updateMaintenance)

/**
 * 5. Version (POST /api/dev/version) -> izin: dev.version
 */
router.post('/version', requirePermission('dev.version'), devController.createVersion)

module.exports = router
