/**
 * Konfigurasi Aplikasi Terpadu Single Domain (AF Blast)
 * - APP_ORIGIN: Origin frontend resmi
 * - allowedOrigins: Origin yang diizinkan CORS (APP_ORIGIN + http://localhost:5173 jika non-production)
 * - APP_URL: URL basis publik untuk seluruh tautan buatan server (Telegram, notifikasi, referral, reset)
 */

const APP_ORIGIN = (process.env.APP_ORIGIN || '').trim()

const allowedOrigins = []
if (APP_ORIGIN) {
  allowedOrigins.push(APP_ORIGIN)
}

if (process.env.NODE_ENV !== 'production') {
  if (!allowedOrigins.includes('http://localhost:5173')) {
    allowedOrigins.push('http://localhost:5173')
  }
}

if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173')
}

const APP_URL = (process.env.APP_URL || process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '')

module.exports = {
  APP_ORIGIN,
  allowedOrigins,
  APP_URL,
}
