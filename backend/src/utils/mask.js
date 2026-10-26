/**
 * Utility Penyamaran Data (Data Masking) & Pemformatan Pesan Telegram Grup Pembayaran
 * AF Blast Backend - Express + Prisma + BullMQ
 *
 * ATURAN KEAMANAN:
 * - Nama maksimal 3 kata, tiap kata huruf pertama + titik-titik (•) sebanyak sisa huruf (maks 8 per kata)
 * - Rekening hanya 4 digit terakhir dengan awalan ••••
 * - Varian Ditolak: TANPA nama pemilik dan TANPA alasan
 * - DILARANG memuat username, email, nomor telepon, ID pengguna, nomor rekening utuh, atau ID internal
 * - parse_mode HTML: seluruh nilai dinamis wajib di-escape
 */

/**
 * Escape karakter spesial HTML untuk Telegram HTML parse_mode
 * @param {string|number} raw
 * @returns {string}
 */
function escapeHtml(raw) {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Menyamarkan nama pemilik rekening/e-wallet
 * - Maksimal 3 kata
 * - Tiap kata: huruf pertama + titik-titik (•) sebanyak sisa huruf (maks 8 titik per kata)
 * Contoh: "Tono" -> "T•••"
 *         "Tono Pratama" -> "T••• P••••••"
 *         "Alexander The Great Emperor" -> "A•••••••• T•• G••••" (maks 3 kata)
 * @param {string} name
 * @returns {string}
 */
function maskName(name) {
  if (!name || typeof name !== 'string') return '-'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '-'

  const limitedWords = words.slice(0, 3)

  const maskedWords = limitedWords.map((word) => {
    // Ambil karakter pertama (mempertahankan case asli)
    const firstChar = word.charAt(0)
    const remainingCount = word.length - 1

    if (remainingCount <= 0) {
      return firstChar
    }

    const dotCount = Math.min(8, remainingCount)
    return firstChar + '•'.repeat(dotCount)
  })

  return maskedWords.join(' ')
}

/**
 * Menyamarkan nomor rekening / nomor HP e-wallet
 * - Hanya 4 digit terakhir dengan awalan ••••
 * Contoh: "1234567890" -> "••••7890"
 *         "0812345678" -> "••••5678"
 * @param {string|number} accountNumber
 * @returns {string}
 */
function maskAccountNumber(accountNumber) {
  if (!accountNumber) return '••••0000'
  const cleaned = String(accountNumber).trim().replace(/[\s-]/g, '')
  if (cleaned.length === 0) return '••••0000'

  if (cleaned.length <= 4) {
    return '••••' + cleaned
  }

  const last4 = cleaned.slice(-4)
  return '••••' + last4
}

/**
 * Format nominal Rupiah
 * Contoh: 75000 -> "Rp 75.000"
 * @param {number|string} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  const num = Number(amount) || 0
  return 'Rp ' + num.toLocaleString('id-ID')
}

/**
 * Format pesan HTML siap kirim ke Grup Telegram
 * Varian:
 * 1. success: 🎉 Withdrawal Berhasil! (dengan Bank a/n MaskedName)
 * 2. processing: ⏳ Withdrawal Diproses (dengan Bank a/n MaskedName)
 * 3. rejected: ❌ Withdrawal Ditolak (TANPA nama pemilik dan TANPA alasan)
 *
 * @param {Object} params
 * @param {'success'|'processing'|'rejected'} params.event
 * @param {number} params.amount
 * @param {string} params.bank
 * @param {string} [params.accountName]
 * @param {string} params.accountNumber
 * @returns {{ text: string, maskedName: string, maskedAccount: string, formattedAmount: string }}
 */
function formatPaymentNotificationMessage({
  event,
  amount,
  bank = 'Bank',
  accountName,
  accountNumber,
}) {
  const formattedAmount = formatRupiah(amount)
  const escapedBank = escapeHtml(bank || 'Bank')
  const maskedName = maskName(accountName)
  const escapedMaskedName = escapeHtml(maskedName)
  const maskedAccount = maskAccountNumber(accountNumber)

  let text = ''

  if (event === 'success') {
    text =
      `🎉 <b>WITHDRAWAL BERHASIL!</b>\n\n` +
      `Halo, Member AF Blast! 👋\n\n` +
      `Penarikan saldo kamu telah berhasil diproses dan ditransfer. Terima kasih telah menggunakan layanan AF Blast! 💙\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💸 <b>Nominal:</b> ${formattedAmount}\n` +
      `🏦 <b>Bank:</b> ${escapedBank}\n` +
      `👤 <b>Penerima:</b> ${escapedMaskedName}\n` +
      `💳 <b>Rekening:</b> ${maskedAccount}\n` +
      `✅ <b>Status:</b> Berhasil Ditransfer\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `🚀 Terima kasih atas kepercayaan kamu kepada <b>AF Blast</b>.\n\n` +
      `✨ <i>Transaksi aman, proses nyaman!</i>\n` +
      `💙 <b>AF BLAST — Fast, Secure, Reliable.</b>`
  } else if (event === 'processing') {
    text =
      `⏳ <b>Withdrawal Diproses</b>\n\n` +
      `💵 <b>Nominal:</b> ${formattedAmount}\n` +
      `🏦 <b>Bank:</b> ${escapedBank} a/n ${escapedMaskedName}\n` +
      `🔢 <b>Rekening:</b> ${maskedAccount}\n` +
      `✅ <b>Status:</b> Sedang diproses`
  } else if (event === 'rejected') {
    // Varian Tolak: TANPA nama pemilik dan TANPA alasan demi privasi member
    text =
      `❌ <b>Withdrawal Ditolak</b>\n\n` +
      `💵 <b>Nominal:</b> ${formattedAmount}\n` +
      `🏦 <b>Bank:</b> ${escapedBank}\n` +
      `🔢 <b>Rekening:</b> ${maskedAccount}\n` +
      `✅ <b>Status:</b> Pengajuan ditolak`
  } else {
    // Fallback default
    text =
      `ℹ️ <b>Pembaruan Status Withdrawal</b>\n\n` +
      `💵 <b>Nominal:</b> ${formattedAmount}\n` +
      `🏦 <b>Bank:</b> ${escapedBank}\n` +
      `🔢 <b>Rekening:</b> ${maskedAccount}`
  }

  return {
    text,
    maskedName: event === 'rejected' ? null : maskedName,
    maskedAccount,
    formattedAmount,
  }
}

module.exports = {
  escapeHtml,
  maskName,
  maskAccountNumber,
  formatRupiah,
  formatPaymentNotificationMessage,
}
