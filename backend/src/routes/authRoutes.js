const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { requireMemberAuth } = require('../middlewares/authMiddleware')
const telegramAuth = require('../controllers/telegramAuthController')

// Registrasi member baru (role dipaksa 'user', aud 'member')
router.post('/register', authController.register)

// Login member (hanya role 'user', aud 'member')
router.post('/login', authController.login)

// Profil member terautentikasi (wajib token aud 'member')
router.get('/me', requireMemberAuth, authController.getProfile)

// Pemulihan Kata Sandi via Kode Verifikasi 6 Digit Bot Telegram (Alur 3 Langkah)
router.post('/forgot/start', telegramAuth.forgotStart)
router.post('/forgot/resend', telegramAuth.forgotResend)
router.post('/forgot/verify', telegramAuth.forgotVerify)
router.post('/forgot/reset', telegramAuth.forgotReset)

module.exports = router
