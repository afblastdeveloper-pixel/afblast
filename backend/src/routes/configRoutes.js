const express = require('express')
const router = express.Router()
const configController = require('../controllers/configController')

// Endpoint publik GET /api/config (flag, tema, menu sesuai role, versi, status maintenance)
router.get('/', configController.getPublicConfig)

module.exports = router
