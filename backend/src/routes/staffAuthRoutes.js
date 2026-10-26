const express = require('express')
const router = express.Router()
const staffAuthController = require('../controllers/staffAuthController')
const { requireAuth } = require('../middlewares/authMiddleware')

// Registrasi staf (publik, role: adminfinance atau developer)
router.post('/register', staffAuthController.register)

// Login staf (input: username nama@role + password)
router.post('/login', staffAuthController.login)

// Profil staf yang sedang login
router.get('/me', requireAuth, staffAuthController.getProfile)

// Ganti password (termasuk superadmin saat login pertama)
router.post('/change-password', requireAuth, staffAuthController.changePassword)

module.exports = router
