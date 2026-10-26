/**
 * Adapter Integrasi WhatsApp Gateway (watsap.id / panel.watsap.id)
 * Dikendalikan oleh environment variable WATSAP_MODE=mock|sim|live (default: mock).
 * API key dan konfigurasi rahasia hanya dikelola di sisi backend (tidak pernah diekspos ke frontend).
 */

const QRCode = require('qrcode')
const waha = require('./waha')

const WATSAP_MODE = (process.env.WATSAP_MODE || 'mock').toLowerCase().trim()
const WA_PROVIDER = (process.env.WA_PROVIDER || '').toLowerCase().trim()
const WATSAP_API_KEY = process.env.WATSAP_API_KEY || 'mock_watsap_secret_key'
const WATSAP_BASE_URL = process.env.WATSAP_BASE_URL || 'https://panel.watsap.id/api/v1'

const SIM_BASE_URL = process.env.SIM_BASE_URL || 'http://localhost:4100'
const SIM_API_KEY = process.env.SIM_API_KEY || 'afblast_sim_secret_key_2026'

function isWahaMode() {
  const mode = (process.env.WATSAP_MODE || '').toLowerCase().trim()
  const provider = (process.env.WA_PROVIDER || '').toLowerCase().trim()
  return mode === 'waha' || provider === 'waha'
}

// Validasi Keamanan: Backend MENOLAK WATSAP_MODE=sim atau mock saat NODE_ENV=production
function assertAllowedEnvironment() {
  if (
    process.env.NODE_ENV === 'production' &&
    (WATSAP_MODE === 'sim' || WATSAP_MODE === 'mock') &&
    !isWahaMode()
  ) {
    throw new Error(
      `[SECURITY ERROR] WATSAP_MODE=${WATSAP_MODE} TIDAK DIIZINKAN pada NODE_ENV=production! Gunakan mode waha atau live.`
    )
  }
}

// In-memory store untuk pelacakan status penautan mock fallback
const mockDeviceSessions = new Map()

function getOrCreateMockSession(deviceId, initialData = {}) {
  const key = String(deviceId)
  if (!mockDeviceSessions.has(key)) {
    mockDeviceSessions.set(key, {
      deviceId: key,
      status: 'pending',
      requestedAt: Date.now(),
      ...initialData,
    })
  }
  const session = mockDeviceSessions.get(key)
  Object.assign(session, initialData)
  return session
}

/**
 * Helper HTTP client untuk memanggil WA Simulator dengan timeout, retry terbatas, dan penanganan 429
 */
async function callSimulator(path, options = {}, retries = 2) {
  assertAllowedEnvironment()

  const url = `${SIM_BASE_URL.replace(/\/$/, '')}${path}`
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': SIM_API_KEY,
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
        signal: AbortSignal.timeout(5000), // Timeout 5 detik
      })

      const data = await response.json().catch(() => ({}))

      // Penanganan khusus 429 Rate Limit (retry_after)
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After')
        const retryAfterSec = parseInt(retryAfterHeader || data.retry_after || '60', 10)
        const rateLimitErr = new Error(
          data.error || `Batas rate limit gateway tercapai (429). Coba lagi setelah ${retryAfterSec} detik.`
        )
        rateLimitErr.status = 429
        rateLimitErr.retryAfter = retryAfterSec
        throw rateLimitErr
      }

      if (!response.ok) {
        const err = new Error(data.error || `Simulator mengembalikan status error ${response.status}`)
        err.status = response.status
        throw err
      }

      return data
    } catch (err) {
      lastError = err

      // Jika 429 atau 4xx (client error), jangan retry jaringan
      if (err.status && err.status < 500) {
        throw err
      }

      if (attempt <= retries) {
        // Jeda backoff sebelum retry
        await new Promise((r) => setTimeout(r, attempt * 300))
      }
    }
  }

  throw lastError
}

/**
 * 1. Membuat sesi perangkat baru untuk penautan WhatsApp
 * @param {Object} params - { userId, phone, deviceId }
 * @returns {Promise<{ externalDeviceId: string, status: string }>}
 */
async function createDevice({ userId, phone, deviceId } = {}) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.createDevice({ userId, phone, deviceId })
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator('/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceId, userId, phone }),
    })
    return {
      externalDeviceId: res.deviceId || String(deviceId),
      status: 'pending',
    }
  }

  // Mode mock fallback
  const externalDeviceId = `watsap_${Date.now()}_u${userId || '0'}`
  getOrCreateMockSession(externalDeviceId, { phone, status: 'pending' })

  return {
    externalDeviceId,
    status: 'pending',
  }
}

/**
 * 2. Mengambil QR code terbaru untuk perangkat (menggunakan paket qrcode, data URL)
 * @param {string|number} deviceId
 * @returns {Promise<{ qr: string, expiresAt: Date, status: string }>}
 */
async function getQr(deviceId) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.getQr(deviceId)
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/qr`, { method: 'GET' })
    return {
      qr: res.qr,
      expiresAt: new Date(res.expiresAt),
      status: res.status || 'pending',
    }
  }

  // Mode mock fallback
  const session = getOrCreateMockSession(deviceId, {
    method: 'qr',
    requestedAt: Date.now(),
    status: 'pending',
  })

  const qrRawString = `2@AFBLAST_${deviceId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  const qrDataUrl = await QRCode.toDataURL(qrRawString, {
    width: 280,
    margin: 2,
    color: {
      dark: '#0B1220',
      light: '#FFFFFF',
    },
  })

  const expiresAt = new Date(Date.now() + 60 * 1000)

  return {
    qr: qrDataUrl,
    expiresAt,
    status: session.status,
  }
}

/**
 * 3. Meminta pairing code 8 karakter acak untuk nomor WhatsApp
 * @param {string|number} deviceId
 * @param {string} phone
 * @returns {Promise<{ code: string, expiresAt: Date }>}
 */
async function requestPairingCode(deviceId, phone) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.requestPairingCode(deviceId, phone)
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/pair`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
    return {
      code: res.code,
      expiresAt: new Date(res.expiresAt),
    }
  }

  // Mode mock fallback
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let part1 = ''
  let part2 = ''
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length))
    part2 += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const code = `${part1}-${part2}`

  getOrCreateMockSession(deviceId, {
    method: 'code',
    phone,
    pairingCode: code,
    requestedAt: Date.now(),
    status: 'pending',
  })

  const expiresAt = new Date(Date.now() + 180 * 1000)

  return {
    code,
    expiresAt,
  }
}

/**
 * 4. Memeriksa status konektivitas perangkat WhatsApp
 * @param {string|number} deviceId
 * @returns {Promise<{ status: 'pending'|'connected'|'disconnected'|'logged_out', phone?: string }>}
 */
async function getStatus(deviceId) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.getStatus(deviceId)
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/status`, { method: 'GET' })
    return {
      status: res.status,
      phone: res.phone || undefined,
    }
  }

  // Mode mock fallback
  const session = getOrCreateMockSession(deviceId)
  if (session.status === 'disconnected') {
    return { status: 'disconnected', phone: session.phone }
  }

  const elapsed = Date.now() - (session.requestedAt || 0)
  if (elapsed >= 15000) {
    session.status = 'connected'
  }

  return {
    status: session.status,
    phone: session.phone || '6281234567890',
  }
}

/**
 * 5. Memutuskan koneksi perangkat WhatsApp
 * @param {string|number} deviceId
 * @returns {Promise<{ success: boolean, status: string }>}
 */
async function disconnect(deviceId) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.disconnect(deviceId)
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    await callSimulator(`/devices/${deviceId}`, { method: 'DELETE' })
    return {
      success: true,
      status: 'disconnected',
    }
  }

  // Mode mock fallback
  const session = getOrCreateMockSession(deviceId)
  session.status = 'disconnected'

  return {
    success: true,
    status: 'disconnected',
  }
}

/**
 * 6. Logout perangkat WhatsApp
 * @param {string|number} deviceId
 * @returns {Promise<{ success: boolean, status: string }>}
 */
async function logout(deviceId) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.logout(deviceId)
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/logout`, { method: 'POST' })
    return {
      success: true,
      status: res.status || 'logged_out',
    }
  }

  const session = getOrCreateMockSession(deviceId)
  session.status = 'disconnected'

  return {
    success: true,
    status: 'logged_out',
  }
}

/**
 * 7. Mengirim gambar + caption ke nomor target WhatsApp
 * @param {Object} params - { deviceId, phone, imageUrl, caption, campaignId }
 * @returns {Promise<{ success: boolean, providerMsgId: string }>}
 */
async function sendImage({ deviceId, phone, imageUrl, caption, campaignId } = {}) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.sendImage({ deviceId, phone, imageUrl, caption, campaignId })
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/send`, {
      method: 'POST',
      body: JSON.stringify({
        to: phone,
        text: caption,
        imageUrl,
        campaignId,
      }),
    })
    return {
      success: true,
      providerMsgId: res.messageId,
    }
  }

  // Mode mock fallback
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200))
  const isSuccess = Math.random() < 0.95
  if (!isSuccess) {
    throw new Error('Simulasi kegagalan pengiriman gateway watsap.id (Rate limit / nomor tidak valid / timeout)')
  }

  const providerMsgId = `watsap_img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  return {
    success: true,
    providerMsgId,
  }
}

/**
 * 8. Mengirim pesan teks ke nomor target WhatsApp
 * @param {Object} params - { deviceId, phone, text, campaignId }
 * @returns {Promise<{ success: boolean, providerMsgId: string }>}
 */
async function sendText({ deviceId, phone, text, campaignId } = {}) {
  assertAllowedEnvironment()

  if (isWahaMode()) {
    return await waha.sendText({ deviceId, phone, text, campaignId })
  }

  if (WATSAP_MODE === 'live') {
    throw new Error('Mode live watsap.id belum dikonfigurasi. Silakan gunakan WATSAP_MODE=waha atau sim.')
  }

  if (WATSAP_MODE === 'sim') {
    const res = await callSimulator(`/devices/${deviceId}/send`, {
      method: 'POST',
      body: JSON.stringify({
        to: phone,
        text,
        campaignId,
      }),
    })
    return {
      success: true,
      providerMsgId: res.messageId,
    }
  }

  // Mode mock fallback
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 150))
  const isSuccess = Math.random() < 0.95
  if (!isSuccess) {
    throw new Error('Simulasi kegagalan pengiriman gateway watsap.id (Pesan teks gagal terkirim)')
  }

  const providerMsgId = `watsap_txt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  return {
    success: true,
    providerMsgId,
  }
}

/**
 * 9. Mengirim pesan umum (teks atau gambar)
 */
async function sendMessage({ deviceId, to, text, imageUrl, caption, phone, campaignId } = {}) {
  if (isWahaMode()) {
    return await waha.sendMessage({ deviceId, to, text, imageUrl, caption, phone, campaignId })
  }
  const targetPhone = to || phone
  const targetCaption = caption || text
  if (imageUrl) {
    return await sendImage({ deviceId, phone: targetPhone, imageUrl, caption: targetCaption, campaignId })
  }
  return await sendText({ deviceId, phone: targetPhone, text: targetCaption, campaignId })
}

module.exports = {
  WATSAP_MODE,
  isWahaMode,
  assertAllowedEnvironment,
  createDevice,
  getQr,
  requestPairingCode,
  getStatus,
  disconnect,
  logout,
  sendImage,
  sendText,
  sendMessage,
}
