const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const STORE_FILE = path.join(DATA_DIR, 'store.json')

// Pastikan direktori data ada
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const defaultSettings = {
  successRate: 95,          // 95%
  deliveredRate: 90,        // 90%
  readRate: 40,             // 40%
  latencyMs: 100,           // 100ms
  autoLogoutEvery: 0,       // 0 = nonaktif
  rateLimitPerMinute: 30,   // 30 pesan / menit per device
  autoPairing: true,        // selesai otomatis dalam 12 detik
}

let state = {
  devices: {},
  messages: [],
  settings: { ...defaultSettings },
}

// Muat state dari file jika ada
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      state.devices = parsed.devices || {}
      state.messages = parsed.messages || []
      state.settings = { ...defaultSettings, ...(parsed.settings || {}) }
      console.log('[Store] Berhasil memuat data simulator dari file lokal.')
    }
  } catch (err) {
    console.warn('[Store] Gagal membaca file store.json, menggunakan state baru:', err.message)
  }
}

// Simpan state ke file lokal
let saveTimeout = null
function saveStore() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8')
    } catch (err) {
      console.error('[Store] Gagal menyimpan data simulator ke file:', err.message)
    }
  }, 200)
}

// Inisialisasi awal
loadStore()

module.exports = {
  getDevices: () => state.devices,
  getDevice: (id) => state.devices[String(id)],
  setDevice: (id, data) => {
    state.devices[String(id)] = {
      ...state.devices[String(id)],
      ...data,
      updatedAt: new Date().toISOString(),
    }
    saveStore()
    return state.devices[String(id)]
  },
  createDevice: (customId = null) => {
    const id = customId || `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const newDevice = {
      id: String(id),
      phone: null,
      status: 'pending', // pending, connected, disconnected, logged_out
      linkMethod: null,
      qrToken: null,
      qrExpiresAt: null,
      pairCode: null,
      pairExpiresAt: null,
      sentCount: 0,
      sendTimestamps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.devices[String(id)] = newDevice
    saveStore()
    return newDevice
  },
  deleteDevice: (id) => {
    const key = String(id)
    if (state.devices[key]) {
      delete state.devices[key]
      saveStore()
      return true
    }
    return false
  },
  getSettings: () => state.settings,
  updateSettings: (newSettings) => {
    state.settings = {
      ...state.settings,
      ...newSettings,
    }
    saveStore()
    return state.settings
  },
  getMessages: () => state.messages,
  addMessage: (msg) => {
    const entry = {
      id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: String(msg.deviceId),
      to: msg.to,
      text: msg.text,
      imageUrl: msg.imageUrl || null,
      status: msg.status || 'accepted',
      error: msg.error || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.messages.unshift(entry)
    if (state.messages.length > 300) {
      state.messages = state.messages.slice(0, 300)
    }
    saveStore()
    return entry
  },
  updateMessageStatus: (id, status, error = null) => {
    const found = state.messages.find((m) => m.id === id)
    if (found) {
      found.status = status
      if (error) found.error = error
      found.updatedAt = new Date().toISOString()
      saveStore()
    }
    return found
  },
  clearMessages: () => {
    state.messages = []
    saveStore()
  },
}
