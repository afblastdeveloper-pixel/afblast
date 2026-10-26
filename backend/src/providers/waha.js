/**
 * Adapter Integrasi WhatsApp Gateway via WAHA (WhatsApp HTTP API)
 * File: backend/src/providers/waha.js
 *
 * Dokumentasi WAHA: https://waha.devlikeapro.net/
 * Mendukung:
 * - WAHA Core (Single session / 1 nomor aktif) dengan WAHA_SINGLE_SESSION=true
 * - WAHA Plus (Multi-session / Unlimited slot nomor member) dengan session `device_<id>`
 * - Engine NOWEB (Baileys) atau WEBJS (Chromium)
 * - QR Code & 8-Digit Pairing Code
 * - Webhook Realtime untuk status perangkat (WORKING, STOPPED, FAILED) & delivery ACK
 */

const QRCode = require('qrcode')

const WAHA_BASE_URL = (process.env.WAHA_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'afblast_waha_secret_key_2026'
const WAHA_SINGLE_SESSION = process.env.WAHA_SINGLE_SESSION === 'true'
const WAHA_DEFAULT_SESSION = process.env.WAHA_DEFAULT_SESSION || 'default'
const WAHA_TIMEOUT_MS = parseInt(process.env.WAHA_TIMEOUT_MS || '10000', 10)
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '')

/**
 * Mendapatkan nama session WAHA untuk device tertentu.
 * Jika WAHA_SINGLE_SESSION=true (WAHA Core), semua device memetakan ke session default.
 * Jika multi-session (WAHA Plus), menggunakan device_<id>.
 */
function getSessionName(deviceId) {
  if (WAHA_SINGLE_SESSION) {
    return WAHA_DEFAULT_SESSION
  }
  return `device_${deviceId}`
}

/**
 * Normalisasi nomor telepon ke format JID WhatsApp (misal: 628123456789@c.us)
 */
function formatChatId(phone) {
  let clean = String(phone || '').replace(/[^0-9]/g, '')
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1)
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.slice(1)
  }
  return `${clean}@c.us`
}

/**
 * Normalisasi nomor HP bersih tanpa prefix @c.us
 */
function cleanPhoneNumber(phone) {
  let clean = String(phone || '').replace(/[^0-9]/g, '')
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1)
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.slice(1)
  }
  return clean
}

/**
 * Helper HTTP Client untuk memanggil REST API WAHA
 */
async function callWaha(path, options = {}, retries = 1) {
  const url = `${WAHA_BASE_URL}${path}`
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, image/png, */*',
    ...(WAHA_API_KEY ? { 'X-Api-Key': WAHA_API_KEY } : {}),
    ...(options.headers || {}),
  }

  let attempt = 0
  let lastError = null

  while (attempt <= retries) {
    attempt++
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(WAHA_TIMEOUT_MS),
      })

      const contentType = response.headers.get('content-type') || ''

      // Jika response gambar biner (misal QR image/png)
      if (contentType.includes('image/')) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          isBuffer: true,
          buffer: Buffer.from(arrayBuffer),
          contentType,
          status: response.status,
        }
      }

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorMsg =
          data.message || data.error || `WAHA API mengembalikan status error ${response.status}`
        const err = new Error(errorMsg)
        err.status = response.status
        err.data = data
        throw err
      }

      return data
    } catch (err) {
      lastError = err
      // Jangan retry jika 4xx (client error seperti session not found atau validasi gagal)
      if (err.status && err.status < 500) {
        throw err
      }
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
  }

  throw lastError
}

/**
 * 1. Membuat atau Memastikan Sesi Perangkat Siap di WAHA
 * @param {Object} params - { userId, phone, deviceId }
 * @returns {Promise<{ externalDeviceId: string, status: string }>}
 */
async function createDevice({ userId, phone, deviceId } = {}) {
  const sessionName = getSessionName(deviceId)
  const webhookUrl = `${BACKEND_URL}/api/webhooks/waha`

  try {
    // Cek apakah session sudah ada
    const sessionInfo = await callWaha(`/api/sessions/${sessionName}`, { method: 'GET' }, 0).catch(
      () => null
    )

    if (!sessionInfo || sessionInfo.status === 'STOPPED' || sessionInfo.status === 'FAILED') {
      // Mulai atau buat session baru
      await callWaha('/api/sessions/start', {
        method: 'POST',
        body: JSON.stringify({
          name: sessionName,
          config: {
            noweb: {
              store: { enabled: true },
            },
            webhooks: [
              {
                url: webhookUrl,
                events: ['session.status', 'message.ack', 'message'],
              },
            ],
          },
        }),
      }).catch(async (startErr) => {
        // Fallback coba POST /api/sessions jika /start tidak didukung
        await callWaha('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            name: sessionName,
            config: {
              webhooks: [
                {
                  url: webhookUrl,
                  events: ['session.status', 'message.ack', 'message'],
                },
              ],
            },
          }),
        }).catch(() => {})
      })
    }

    return {
      externalDeviceId: sessionName,
      status: 'pending',
    }
  } catch (err) {
    console.error(`[WAHA] Gagal create/start session ${sessionName}:`, err.message)
    return {
      externalDeviceId: sessionName,
      status: 'pending',
    }
  }
}

/**
 * 2. Mengambil QR Code dari WAHA untuk dipindai oleh pengguna
 * @param {string|number} deviceId
 * @returns {Promise<{ qr: string, expiresAt: Date, status: string }>}
 */
async function getQr(deviceId) {
  const sessionName = getSessionName(deviceId)

  // Pastikan session sudah ter-inisialisasi
  await createDevice({ deviceId })

  try {
    const res = await callWaha(`/api/${sessionName}/auth/qr`, {
      method: 'GET',
    })

    let qrDataUrl = ''

    if (res && res.isBuffer) {
      // Jika WAHA mengembalikan biner PNG
      const base64 = res.buffer.toString('base64')
      qrDataUrl = `data:${res.contentType || 'image/png'};base64,${base64}`
    } else if (res && typeof res === 'object') {
      const rawCode = res.raw || res.qr || res.code || res.value
      if (rawCode) {
        if (rawCode.startsWith('data:image')) {
          qrDataUrl = rawCode
        } else {
          // Render raw string ke Data URL PNG via paket qrcode
          qrDataUrl = await QRCode.toDataURL(rawCode, {
            width: 280,
            margin: 2,
            color: { dark: '#0B1220', light: '#FFFFFF' },
          })
        }
      }
    } else if (typeof res === 'string') {
      if (res.startsWith('data:image')) {
        qrDataUrl = res
      } else {
        qrDataUrl = await QRCode.toDataURL(res, {
          width: 280,
          margin: 2,
          color: { dark: '#0B1220', light: '#FFFFFF' },
        })
      }
    }

    // Jika gagal membaca QR, fallback buat QR placeholder informatif
    if (!qrDataUrl) {
      const fallbackStr = `2@WAHA_${sessionName}_${Date.now()}`
      qrDataUrl = await QRCode.toDataURL(fallbackStr, {
        width: 280,
        margin: 2,
        color: { dark: '#0B1220', light: '#FFFFFF' },
      })
    }

    const expiresAt = new Date(Date.now() + 45 * 1000)

    return {
      qr: qrDataUrl,
      expiresAt,
      status: 'pending',
    }
  } catch (err) {
    console.error(`[WAHA] Error getQr untuk device ${deviceId}:`, err.message)
    // Fallback QR jika WAHA belum ready
    const fallbackStr = `2@WAHA_WAITING_${sessionName}_${Date.now()}`
    const qrDataUrl = await QRCode.toDataURL(fallbackStr, {
      width: 280,
      margin: 2,
      color: { dark: '#0B1220', light: '#FFFFFF' },
    })

    return {
      qr: qrDataUrl,
      expiresAt: new Date(Date.now() + 30 * 1000),
      status: 'pending',
    }
  }
}

/**
 * 3. Meminta Pairing Code 8 Karakter (Tautkan dengan Nomor) dari WAHA
 * @param {string|number} deviceId
 * @param {string} phone
 * @returns {Promise<{ code: string, expiresAt: Date }>}
 */
async function requestPairingCode(deviceId, phone) {
  const sessionName = getSessionName(deviceId)
  const cleanPhone = cleanPhoneNumber(phone)

  // Pastikan session sudah start
  await createDevice({ deviceId, phone: cleanPhone })

  try {
    const res = await callWaha(`/api/${sessionName}/auth/request-code`, {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber: cleanPhone,
      }),
    })

    const code = res.code || res.pairingCode || res.requestCode || ''

    return {
      code,
      expiresAt: new Date(Date.now() + 180 * 1000),
    }
  } catch (err) {
    console.error(`[WAHA] Error requestPairingCode untuk device ${deviceId}:`, err.message)
    throw new Error(
      err.data?.message || err.message || 'Gagal meminta kode pairing dari gateway WAHA'
    )
  }
}

/**
 * 4. Memeriksa Status Konektivitas Perangkat di WAHA
 * @param {string|number} deviceId
 * @returns {Promise<{ status: 'pending'|'connected'|'disconnected'|'logged_out', phone?: string }>}
 */
async function getStatus(deviceId) {
  const sessionName = getSessionName(deviceId)

  try {
    const sessionInfo = await callWaha(`/api/sessions/${sessionName}`, {
      method: 'GET',
    })

    const rawStatus = (sessionInfo.status || '').toUpperCase()
    let status = 'pending'

    if (rawStatus === 'WORKING' || rawStatus === 'CONNECTED') {
      status = 'connected'
    } else if (rawStatus === 'STOPPED' || rawStatus === 'PAUSED') {
      status = 'disconnected'
    } else if (rawStatus === 'FAILED' || rawStatus === 'LOGGED_OUT') {
      status = 'logged_out'
    } else {
      status = 'pending'
    }

    // Ambil nomor telepon dari profil WAHA jika tersedia
    let phone = null
    const meId = sessionInfo.me?.id || sessionInfo.me?.user || ''
    if (meId) {
      phone = cleanPhoneNumber(meId.split('@')[0])
    }

    return {
      status,
      phone,
    }
  } catch (err) {
    // Jika 404 (session belum dibuat di WAHA)
    if (err.status === 404) {
      return { status: 'disconnected' }
    }
    console.warn(`[WAHA] Warning getStatus ${sessionName}:`, err.message)
    return { status: 'disconnected' }
  }
}

/**
 * 5. Mengirim Pesan Teks via WAHA
 * @param {Object} params - { deviceId, phone, text, campaignId }
 * @returns {Promise<{ success: boolean, providerMsgId: string }>}
 */
async function sendText({ deviceId, phone, text, campaignId } = {}) {
  const sessionName = getSessionName(deviceId)
  const chatId = formatChatId(phone)

  try {
    const res = await callWaha('/api/sendText', {
      method: 'POST',
      body: JSON.stringify({
        session: sessionName,
        chatId,
        text,
      }),
    })

    const providerMsgId = res.id || res.messageId || `waha_txt_${Date.now()}`

    return {
      success: true,
      providerMsgId,
    }
  } catch (err) {
    console.error(`[WAHA] Gagal kirim teks ke ${phone} via ${sessionName}:`, err.message)
    throw new Error(err.data?.message || err.message || 'Pesan teks gagal terkirim via WAHA')
  }
}

/**
 * 6. Mengirim Gambar / Media via WAHA
 * @param {Object} params - { deviceId, phone, imageUrl, caption, campaignId }
 * @returns {Promise<{ success: boolean, providerMsgId: string }>}
 */
async function sendImage({ deviceId, phone, imageUrl, caption, campaignId } = {}) {
  const sessionName = getSessionName(deviceId)
  const chatId = formatChatId(phone)

  try {
    // WAHA endpoint untuk kirim file / media
    const res = await callWaha('/api/sendFile', {
      method: 'POST',
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: {
          url: imageUrl,
          filename: 'image.jpg',
        },
        caption: caption || '',
      }),
    }).catch(async (fileErr) => {
      // Fallback ke /api/sendImage jika endpoint /api/sendFile berbeda versi
      return await callWaha('/api/sendImage', {
        method: 'POST',
        body: JSON.stringify({
          session: sessionName,
          chatId,
          file: { url: imageUrl },
          caption: caption || '',
        }),
      })
    })

    const providerMsgId = res.id || res.messageId || `waha_img_${Date.now()}`

    return {
      success: true,
      providerMsgId,
    }
  } catch (err) {
    console.error(`[WAHA] Gagal kirim media ke ${phone} via ${sessionName}:`, err.message)
    throw new Error(err.data?.message || err.message || 'Pesan gambar gagal terkirim via WAHA')
  }
}

/**
 * 7. Mengirim Pesan Umum (Teks atau Gambar)
 */
async function sendMessage({ deviceId, to, text, imageUrl, caption, phone, campaignId } = {}) {
  const targetPhone = to || phone
  const targetCaption = caption || text
  if (imageUrl) {
    return await sendImage({ deviceId, phone: targetPhone, imageUrl, caption: targetCaption, campaignId })
  }
  return await sendText({ deviceId, phone: targetPhone, text: targetCaption, campaignId })
}

/**
 * 8. Memutus Sesi Perangkat (Stop Session)
 */
async function disconnect(deviceId) {
  const sessionName = getSessionName(deviceId)
  try {
    await callWaha('/api/sessions/stop', {
      method: 'POST',
      body: JSON.stringify({ name: sessionName }),
    }).catch(() => {})
    return { success: true }
  } catch (err) {
    console.warn(`[WAHA] Disconnect session ${sessionName}:`, err.message)
    return { success: false }
  }
}

/**
 * 9. Logout Akun WhatsApp dari Sesi WAHA
 */
async function logout(deviceId) {
  const sessionName = getSessionName(deviceId)
  try {
    await callWaha('/api/sessions/logout', {
      method: 'POST',
      body: JSON.stringify({ name: sessionName }),
    }).catch(() => {})
    return { success: true }
  } catch (err) {
    console.warn(`[WAHA] Logout session ${sessionName}:`, err.message)
    return { success: false }
  }
}

module.exports = {
  createDevice,
  getQr,
  requestPairingCode,
  getStatus,
  sendText,
  sendImage,
  sendMessage,
  disconnect,
  logout,
  getSessionName,
  formatChatId,
  cleanPhoneNumber,
}
