const express = require('express')
const cors = require('cors')
require('dotenv').config()

const prisma = require('./config/db')

// Route imports
const authRoutes = require('./routes/authRoutes')
const memberRoutes = require('./routes/memberRoutes')
const staffAuthRoutes = require('./routes/staffAuthRoutes')
const staffAdminRoutes = require('./routes/staffAdminRoutes')
const devRoutes = require('./routes/devRoutes')
const configRoutes = require('./routes/configRoutes')
const adminResourceRoutes = require('./routes/adminResourceRoutes')

const path = require('path')

const app = express()
const PORT = process.env.PORT || 4000

// Static media serving untuk gambar kampanye & profil
app.use('/media/campaign', express.static(path.join(__dirname, '../uploads/campaign')))

// Strict CORS: Satu origin dari env APP_ORIGIN (ditambah http://localhost:5173 jika NODE_ENV!=production)
const { allowedOrigins, APP_URL } = require('./config/appConfig')

app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti tools pengujian curl, node, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Origin tidak diizinkan oleh CORS'))
    },
    credentials: true,
  })
)

app.use(express.json())

// Endpoint Health Check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.status(200).json({
      status: 'ok',
      db: 'connected',
    })
  } catch (error) {
    console.error('Database health check failed:', error)
    return res.status(500).json({
      status: 'error',
      db: 'disconnected',
      message: error.message,
    })
  }
})

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'AF Blast WA Blast Backend API is running' })
})

// Public Config Endpoint
app.use('/api/config', configRoutes)

// Member Auth Endpoints (/api/auth/register, /api/auth/login, /api/auth/me) -> HANYA role user, aud: member
app.use('/api/auth', authRoutes)

// Member Feature Endpoints (/api/member/*) -> HANYA role user, aud: member
app.use('/api/member', memberRoutes)

// Staff Auth Endpoints (/api/staff/register, /api/staff/login, /api/staff/me, /api/staff/change-password) -> HANYA role staf, aud: staff
app.use('/api/staff', staffAuthRoutes)

// Staff Admin Approval Endpoints (/api/admin/staff...) -> aud: staff
app.use('/api/admin/staff', staffAdminRoutes)

// Admin Resources Endpoints (/api/admin/users, /api/admin/withdrawals, etc.) -> aud: staff
app.use('/api/admin', adminResourceRoutes)

// Developer Endpoints (/api/dev/flags, /api/dev/menu, /api/dev/theme, /api/dev/maintenance, /api/dev/version) -> aud: staff
app.use('/api/dev', devRoutes)

// Webhook WhatsApp Provider (Watsap.id & WAHA)
const { handleWatsapWebhook, handleWahaWebhook } = require('./controllers/webhookController')
app.post('/api/webhooks/watsap', handleWatsapWebhook)
app.post('/api/webhooks/waha', handleWahaWebhook)

// Telegram Bot Webhook endpoint untuk produksi
const { initTelegramBot, bot } = require('./telegram/bot')
const { webhookCallback } = require('grammy')

if (process.env.TELEGRAM_MODE === 'webhook' && bot) {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || ''
  app.post(
    '/api/telegram/webhook',
    (req, res, next) => {
      const headerSecret = req.headers['x-telegram-bot-api-secret-token']
      if (secretToken && headerSecret !== secretToken) {
        return res.status(403).json({ error: 'Secret token tidak valid' })
      }
      next()
    },
    webhookCallback(bot, 'express')
  )
}

// Error Handler Middleware (termasuk penolakan CORS)
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message })
  }
  return res.status(500).json({ error: err.message || 'Internal server error' })
})

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Start Express Server
const { startWorker } = require('./worker')

const server = app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`)
  try {
    startWorker()
  } catch (err) {
    console.warn('Worker initialization deferred:', err.message)
  }
  try {
    initTelegramBot()
  } catch (err) {
    console.warn('Telegram bot initialization deferred:', err.message)
  }
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  server.close(() => {
    process.exit(0)
  })
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  server.close(() => {
    process.exit(0)
  })
})

module.exports = app
