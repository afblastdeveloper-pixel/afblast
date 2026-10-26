const express = require('express')
const cors = require('cors')
const path = require('path')
const dotenv = require('dotenv')
const QRCode = require('qrcode')

// Muat environment variable dari .env lokal simulator jika ada, atau dari backend
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend', '.env') })

// Tolak start bila NODE_ENV=production
if (process.env.NODE_ENV === 'production') {
  console.error('[CRITICAL] WA Gateway Simulator DITOLAK: Tidak boleh dijalankan pada lingkungan production!')
  process.exit(1)
}

const store = require('./store')
const { sendWebhook } = require('./webhook')

const app = express()
const PORT = parseInt(process.env.SIM_PORT || '4100', 10)
const SIM_API_KEY = process.env.SIM_API_KEY || 'afblast_sim_secret_key_2026'
const SIM_WEBHOOK_SECRET = process.env.SIM_WEBHOOK_SECRET || process.env.WATSAP_WEBHOOK_SECRET || 'afblast_watsap_webhook_secret_key_2026'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000'

app.use(cors())
app.use(express.json())

// Sajikan halaman kontrol statis di http://localhost:4100/
app.use(express.static(path.join(__dirname, '..', 'public')))

// Middleware Otentikasi API Key untuk endpoint gateway /devices*
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey
  if (!apiKey || apiKey !== SIM_API_KEY) {
    return res.status(401).json({ error: 'Akses ditolak: Header x-api-key tidak valid atau tidak disertakan.' })
  }
  next()
}

// ============================================================
// 1. ENDPOINT GATEWAY (Sesuai spesifikasi umum gateway WA)
// ============================================================

// POST /devices -> { deviceId }
app.post('/devices', authMiddleware, (req, res) => {
  const requestedId = req.body.deviceId || req.body.id
  const device = store.createDevice(requestedId)
  return res.status(201).json({ deviceId: device.id })
})

// GET /devices/:id/qr -> { qr, expiresAt } (data URL PNG dari paket qrcode, token berganti tiap diminta)
app.get('/devices/:id/qr', authMiddleware, async (req, res) => {
  const { id } = req.params
  let device = store.getDevice(id)
  if (!device) {
    // Jika belum ada, otomatis buatkan untuk kemudahan integrasi
    device = store.createDevice(id)
  }

  // Token acak baru tiap kali diminta
  const token = `2@afblast_sim_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000) // 3 menit

  try {
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0B1220',
        light: '#FFFFFF',
      },
    })

    store.setDevice(id, {
      linkMethod: 'qr',
      qrToken: token,
      qrExpiresAt: expiresAt.toISOString(),
    })

    // Selesai otomatis 12 detik setelah QR diminta bila autoPairing aktif
    const settings = store.getSettings()
    if (settings.autoPairing) {
      setTimeout(async () => {
        const current = store.getDevice(id)
        if (current && current.status === 'pending') {
          const assignedPhone = current.phone || `628${Math.floor(1000000000 + Math.random() * 9000000000)}`
          store.setDevice(id, {
            status: 'connected',
            phone: assignedPhone,
          })
          console.log(`[Auto-Pair] Perangkat ${id} otomatis terhubung ke ${assignedPhone}`)
          await sendWebhook('device.connected', { deviceId: id, phone: assignedPhone }, SIM_WEBHOOK_SECRET, BACKEND_URL)
        }
      }, 12000)
    }

    return res.status(200).json({
      qr: qrDataUrl,
      expiresAt: expiresAt.toISOString(),
      status: device.status,
    })
  } catch (err) {
    console.error('Error generating QR:', err)
    return res.status(500).json({ error: 'Gagal membuat QR code simulasi' })
  }
})

// POST /devices/:id/pair { phone } -> { code, expiresAt }
app.post('/devices/:id/pair', authMiddleware, (req, res) => {
  const { id } = req.params
  const { phone } = req.body

  if (!phone) {
    return res.status(400).json({ error: 'Nomor telepon (phone) wajib disertakan' })
  }

  const cleanPhone = String(phone).replace(/\D/g, '')

  // Tolak bila nomor sudah dipakai device lain yang aktif
  const allDevices = store.getDevices()
  const duplicate = Object.values(allDevices).find(
    (d) => d.id !== String(id) && d.phone === cleanPhone && d.status !== 'disconnected' && d.status !== 'logged_out'
  )
  if (duplicate) {
    return res.status(409).json({ error: `Nomor ${cleanPhone} sudah dipakai oleh device lain (${duplicate.id})` })
  }

  let device = store.getDevice(id)
  if (!device) {
    device = store.createDevice(id)
  }

  // 8 karakter huruf / angka acak (format ABCD1234)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000)

  store.setDevice(id, {
    linkMethod: 'code',
    phone: cleanPhone,
    pairCode: code,
    pairExpiresAt: expiresAt.toISOString(),
  })

  // Selesai otomatis 12 detik setelah pairing code diminta bila autoPairing aktif
  const settings = store.getSettings()
  if (settings.autoPairing) {
    setTimeout(async () => {
      const current = store.getDevice(id)
      if (current && current.status === 'pending') {
        store.setDevice(id, {
          status: 'connected',
          phone: cleanPhone,
        })
        console.log(`[Auto-Pair] Perangkat ${id} otomatis terhubung ke ${cleanPhone} via pairing code`)
        await sendWebhook('device.connected', { deviceId: id, phone: cleanPhone }, SIM_WEBHOOK_SECRET, BACKEND_URL)
      }
    }, 12000)
  }

  return res.status(200).json({
    code,
    expiresAt: expiresAt.toISOString(),
  })
})

// GET /devices/:id/status -> { status, phone? }
app.get('/devices/:id/status', authMiddleware, (req, res) => {
  const { id } = req.params
  const device = store.getDevice(id)
  if (!device) {
    return res.status(404).json({ error: 'Perangkat tidak ditemukan di simulator' })
  }

  return res.status(200).json({
    status: device.status,
    phone: device.phone || undefined,
  })
})

// POST /devices/:id/send { to, text, imageUrl? } -> { messageId, status: "accepted" }
app.post('/devices/:id/send', authMiddleware, async (req, res) => {
  const { id } = req.params
  const { to, text, imageUrl, caption, phone, campaignId } = req.body

  const recipient = to || phone
  const content = text || caption || ''

  if (!recipient) {
    return res.status(400).json({ error: 'Tujuan (to / phone) wajib disertakan' })
  }

  let device = store.getDevice(id)
  if (!device) {
    // Buat otomatis jika belum ada dalam mode simulasi fleksibel
    device = store.createDevice(id)
    device.status = 'connected'
    device.phone = '6281234567890'
    store.setDevice(id, device)
  }

  // Terapkan batas rate limit pesan / menit per device
  const settings = store.getSettings()
  const limit = settings.rateLimitPerMinute || 30
  const now = Date.now()

  // Filter timestamps 60 detik terakhir
  const validTimestamps = (device.sendTimestamps || []).filter((ts) => now - ts < 60000)

  if (validTimestamps.length >= limit) {
    const oldest = validTimestamps[0]
    const retryAfter = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000))
    res.setHeader('Retry-After', retryAfter)
    return res.status(429).json({
      error: `Rate limit tercapai: batas ${limit} pesan/menit per device`,
      retry_after: retryAfter,
    })
  }

  // Catat timestamp pengiriman baru
  validTimestamps.push(now)
  const newSentCount = (device.sentCount || 0) + 1
  store.setDevice(id, {
    sendTimestamps: validTimestamps,
    sentCount: newSentCount,
  })

  // Latensi simulasi jaringan
  if (settings.latencyMs > 0) {
    await new Promise((r) => setTimeout(r, settings.latencyMs))
  }

  // Otomatis logout setiap N pesan jika dikonfigurasi
  if (settings.autoLogoutEvery > 0 && newSentCount % settings.autoLogoutEvery === 0) {
    store.setDevice(id, { status: 'logged_out' })
    sendWebhook('device.logged_out', { deviceId: id, phone: device.phone }, SIM_WEBHOOK_SECRET, BACKEND_URL)
  }

  const messageId = `sim_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  // Catat pesan di store
  store.addMessage({
    id: messageId,
    deviceId: id,
    to: recipient,
    text: content,
    imageUrl: imageUrl || null,
    status: 'accepted',
  })

  // Balas respons accepted segera
  res.status(200).json({
    messageId,
    status: 'accepted',
  })

  // Simulasi siklus hidup pengiriman asinkron ke backend melalui webhook
  setTimeout(async () => {
    // 1. Event message.sent
    await sendWebhook('message.sent', {
      providerMsgId: messageId,
      phone: recipient,
      status: 'sent',
      campaignId,
    }, SIM_WEBHOOK_SECRET, BACKEND_URL)

    store.updateMessageStatus(messageId, 'sent')

    // Evaluasi Keberhasilan vs Kegagalan
    const isSuccess = Math.random() * 100 < (settings.successRate ?? 95)

    if (!isSuccess) {
      const failureReasons = [
        'nomor tidak terdaftar di WhatsApp',
        'rate limited oleh sistem WhatsApp',
        'koneksi peer timeout',
        'format nomor tidak valid',
      ]
      const randomReason = failureReasons[Math.floor(Math.random() * failureReasons.length)]

      setTimeout(async () => {
        await sendWebhook('message.failed', {
          providerMsgId: messageId,
          phone: recipient,
          status: 'failed',
          error: randomReason,
          campaignId,
        }, SIM_WEBHOOK_SECRET, BACKEND_URL)
        store.updateMessageStatus(messageId, 'failed', randomReason)
      }, 500)
      return
    }

    // Jika sukses, simulasi status delivered (90%)
    const isDelivered = Math.random() * 100 < (settings.deliveredRate ?? 90)
    if (isDelivered) {
      setTimeout(async () => {
        await sendWebhook('message.delivered', {
          providerMsgId: messageId,
          phone: recipient,
          status: 'delivered',
          campaignId,
        }, SIM_WEBHOOK_SECRET, BACKEND_URL)
        store.updateMessageStatus(messageId, 'delivered')

        // Jika delivered, simulasi status read (40%)
        const isRead = Math.random() * 100 < (settings.readRate ?? 40)
        if (isRead) {
          setTimeout(async () => {
            await sendWebhook('message.read', {
              providerMsgId: messageId,
              phone: recipient,
              status: 'read',
              campaignId,
            }, SIM_WEBHOOK_SECRET, BACKEND_URL)
            store.updateMessageStatus(messageId, 'read')
          }, 1000 + Math.random() * 1500)
        }
      }, 500 + Math.random() * 1000)
    }
  }, 100)
})

// POST /devices/:id/logout -> { success: true, status: "logged_out" }
app.post('/devices/:id/logout', authMiddleware, async (req, res) => {
  const { id } = req.params
  const device = store.getDevice(id)
  store.setDevice(id, { status: 'logged_out' })

  // Kirim webhook ke backend
  await sendWebhook('device.logged_out', {
    deviceId: id,
    phone: device?.phone,
  }, SIM_WEBHOOK_SECRET, BACKEND_URL)

  return res.status(200).json({ success: true, status: 'logged_out' })
})

// DELETE /devices/:id -> { success: true }
app.delete('/devices/:id', authMiddleware, async (req, res) => {
  const { id } = req.params
  const device = store.getDevice(id)

  await sendWebhook('device.disconnected', {
    deviceId: id,
    phone: device?.phone,
  }, SIM_WEBHOOK_SECRET, BACKEND_URL)

  store.deleteDevice(id)
  return res.status(200).json({ success: true, message: 'Perangkat berhasil dihapus' })
})

// ============================================================
// 2. ENDPOINT KONTROL & PENGATURAN DASHBOARD WEB
// ============================================================

app.get('/api/control/config', (req, res) => {
  return res.status(200).json({
    backendUrl: BACKEND_URL,
    apiKey: SIM_API_KEY,
    settings: store.getSettings(),
  })
})

app.post('/api/control/settings', authMiddleware, (req, res) => {
  const updated = store.updateSettings(req.body)
  return res.status(200).json({ success: true, settings: updated })
})

app.get('/api/control/devices', authMiddleware, (req, res) => {
  const list = Object.values(store.getDevices())
  return res.status(200).json(list)
})

app.post('/api/control/devices', authMiddleware, (req, res) => {
  const device = store.createDevice(req.body.deviceId)
  return res.status(201).json({ deviceId: device.id, device })
})

app.post('/api/control/devices/:id/complete-pair', authMiddleware, async (req, res) => {
  const { id } = req.params
  const { phone } = req.body
  const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '6281234567890'

  const updated = store.setDevice(id, {
    status: 'connected',
    phone: cleanPhone,
  })

  await sendWebhook('device.connected', {
    deviceId: id,
    phone: cleanPhone,
  }, SIM_WEBHOOK_SECRET, BACKEND_URL)

  return res.status(200).json({ success: true, device: updated })
})

app.post('/api/control/devices/:id/disconnect', authMiddleware, async (req, res) => {
  const { id } = req.params
  const device = store.getDevice(id)
  const updated = store.setDevice(id, { status: 'disconnected' })

  await sendWebhook('device.disconnected', {
    deviceId: id,
    phone: device?.phone,
  }, SIM_WEBHOOK_SECRET, BACKEND_URL)

  return res.status(200).json({ success: true, device: updated })
})

app.post('/api/control/devices/:id/reset-limit', authMiddleware, (req, res) => {
  const { id } = req.params
  const updated = store.setDevice(id, { sendTimestamps: [] })
  return res.status(200).json({ success: true, message: 'Rate limit timestamps berhasil direset', device: updated })
})

app.get('/api/control/logs', authMiddleware, (req, res) => {
  return res.status(200).json(store.getMessages())
})

app.post('/api/control/logs/clear', authMiddleware, (req, res) => {
  store.clearMessages()
  return res.status(200).json({ success: true })
})

// Jalankan Server
app.listen(PORT, () => {
  console.log(`====================================================`)
  console.log(`🚀 WA Gateway Simulator aktif di http://localhost:${PORT}`)
  console.log(`🛡️  MODE PENGUJIAN: TIDAK MENGIRIM PESAN WHATSAPP NYATA`)
  console.log(`📡 Backend Terhubung: ${BACKEND_URL}`)
  console.log(`🔑 Auth: Header x-api-key = ${SIM_API_KEY}`)
  console.log(`====================================================`)
})
