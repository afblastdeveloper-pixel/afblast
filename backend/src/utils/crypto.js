/**
 * Utility Enkripsi Kriptografis & Sanitasi Keamanan AF Blast
 * - Enkripsi AES-256-GCM untuk Nomor Rekening Bank & E-Wallet
 * - Sanitasi HTML Escape untuk Notifikasi Telegram Bot
 */

const crypto = require('crypto')

const RAW_KEY = process.env.ENCRYPTION_KEY || 'afblast_secure_payout_encryption_key_32bytes_prod_2026'
// Pastikan panjang kunci tepat 32 byte dengan SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(RAW_KEY).digest()

/**
 * Enkripsi teks nomor rekening menggunakan AES-256-GCM
 * @param {string} plaintext
 * @returns {string} iv:authTag:ciphertext (dalam format hex)
 */
function encryptAccountNumber(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return ''
  const iv = crypto.randomBytes(12) // Standar 96-bit IV untuk GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)

  let encrypted = cipher.update(plaintext.trim(), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Dekripsi teks nomor rekening terenkripsi AES-256-GCM
 * @param {string} encryptedString
 * @returns {string} plaintext
 */
function decryptAccountNumber(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') return ''
  const parts = encryptedString.split(':')
  if (parts.length !== 3) return ''

  const [ivHex, authTagHex, encrypted] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Escape karakter berbahaya untuk HTML Telegram
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Daftar resmi bank dan e-wallet yang didukung sistem
 */
const SUPPORTED_PROVIDERS = {
  bank: [
    'BCA',
    'Mandiri',
    'BNI',
    'BRI',
    'BSI (Bank Syariah Indonesia)',
    'CIMB Niaga',
    'Bank Permata',
    'Bank Danamon',
    'Bank Tabungan Pensiunan Nasional (BTPN / Jenius)',
    'Bank Jago',
  ],
  ewallet: ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'],
}

module.exports = {
  encryptAccountNumber,
  decryptAccountNumber,
  escapeHtml,
  SUPPORTED_PROVIDERS,
}
