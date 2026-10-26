const express = require('express')
const router = express.Router()
const staffAuthController = require('../controllers/staffAuthController')
const { authenticateToken } = require('../middleware/auth')

// Public Staff Auth Routes
router.post('/register', staffAuthController.register)
router.post('/login', staffAuthController.login)

// Protected Staff Routes
router.get('/me', authenticateToken, staffAuthController.getProfile)
router.post('/change-password', authenticateToken, staffAuthController.changePassword)

module.exports = router
