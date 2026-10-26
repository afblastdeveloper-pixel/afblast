/**
 * Telegram Payment Group Service (src/telegram/paymentBot.js)
 * AF Blast Backend - Express + Prisma + BullMQ
 *
 * Mengelola pengiriman notifikasi penarikan dana ke Grup Telegram (@AFBlastPaymentBot)
 * - Menggunakan bot token: TELEGRAM_PAYMENT_BOT_TOKEN
 * - Chat ID grup: TELEGRAM_PAYMENT_CHAT_ID
 * - Chat ID uji: TELEGRAM_PAYMENT_TEST_CHAT_ID
 * - HANYA menggunakan method sendMessage (tidak ada pin, delete, atau edit grup)
 * - Proteksi keamanan: Token tidak pernah dibocorkan ke log, respons, atau error
 */

const prisma = require('../config/db')

/**
 * Mengirim pesan ke Grup Telegram dengan batas waktu (timeout) 10 detik
 * @param {Object} params
 * @param {string} params.text - Pesan HTML yang sudah diformat & di-escape
 * @param {string} [params.chatId] - ID grup tujuan (default: TELEGRAM_PAYMENT_CHAT_ID)
 * @param {number} [params.timeoutMs=10000] - Batas waktu request HTTP
 * @returns {Promise<{ ok: boolean, messageId?: string, isFatal?: boolean, isRateLimit?: boolean, retryAfter?: number, error?: string }>}
 */
async function sendTelegramPaymentMessage({ text, chatId, timeoutMs = 10000 }) {
  const token = process.env.TELEGRAM_PAYMENT_BOT_TOKEN
  if (!token || token.trim().length === 0) {
    return {
      ok: false,
      isFatal: true,
      error: 'TELEGRAM_PAYMENT_BOT_TOKEN belum dikonfigurasi di file .env',
    }
  }

  const targetChatId = chatId || process.env.TELEGRAM_PAYMENT_CHAT_ID
  if (!targetChatId || String(targetChatId).trim().length === 0) {
    return {
      ok: false,
      isFatal: true,
      error: 'TELEGRAM_PAYMENT_CHAT_ID belum dikonfigurasi di file .env',
    }
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: String(targetChatId).trim(),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const result = await res.json().catch(() => ({}))

    if (res.ok && result.ok) {
      const msgId = result.result?.message_id
      return {
        ok: true,
        messageId: msgId ? String(msgId) : null,
      }
    }

    // Tangani Status 429: Too Many Requests (Rate limit Telegram)
    if (res.status === 429) {
      const retryAfter = result.parameters?.retry_after || 5
      return {
        ok: false,
        isRateLimit: true,
        retryAfter,
        error: `Terlalu banyak permintaan ke Telegram (429). Coba lagi dalam ${retryAfter} detik.`,
      }
    }

    // Tangani Status 400 / 403: Bot bukan anggota / tidak punya hak / chat tidak ditemukan
    if (res.status === 400 || res.status === 403) {
      // Cek apakah ada migrasi grup ke supergroup (migrate_to_chat_id)
      if (result.parameters?.migrate_to_chat_id) {
        const newChatId = result.parameters.migrate_to_chat_id
        console.warn(`[Payment Group] ID grup berubah, perbarui TELEGRAM_PAYMENT_CHAT_ID menjadi ${newChatId}`)
        return {
          ok: false,
          isFatal: true,
          error: `ID grup berubah, perbarui TELEGRAM_PAYMENT_CHAT_ID menjadi ${newChatId}`,
        }
      }

      let safeMsg = 'Bot bukan anggota grup atau tidak memiliki izin kirim pesan di grup tersebut.'
      if (res.status === 400 && result.description) {
        if (result.description.includes('chat not found')) {
          safeMsg = 'Grup Telegram tidak ditemukan. Pastikan TELEGRAM_PAYMENT_CHAT_ID valid.'
        } else {
          safeMsg = `Permintaan tidak valid: ${result.description}`
        }
      }

      return {
        ok: false,
        isFatal: true,
        error: safeMsg,
      }
    }

    // 5xx atau error lainnya dari Telegram
    return {
      ok: false,
      isTransient: true,
      error: `Server Telegram merespons error (HTTP ${res.status}): ${result.description || 'Unknown error'}`,
    }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      return {
        ok: false,
        isTransient: true,
        error: `Koneksi ke server Telegram timeout (${timeoutMs / 1000} detik).`,
      }
    }

    return {
      ok: false,
      isTransient: true,
      error: `Gagal terhubung ke Telegram: ${err.message}`,
    }
  }
}

/**
 * Cache memori untuk rate-limit pesan uji staf: Maksimal 3 kali per jam
 */
const testMessageTimestamps = []

/**
 * Mengirim pesan tes berlabel [TES] ke TELEGRAM_PAYMENT_TEST_CHAT_ID
 * Maksimal 3 kali per jam
 */
async function sendTestPaymentMessage(adminName = 'Admin') {
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000

  // Bersihkan riwayat lebih dari 1 jam
  while (testMessageTimestamps.length > 0 && testMessageTimestamps[0] < oneHourAgo) {
    testMessageTimestamps.shift()
  }

  if (testMessageTimestamps.length >= 3) {
    const oldest = testMessageTimestamps[0]
    const waitMinutes = Math.ceil((oldest + 60 * 60 * 1000 - now) / 60000)
    return {
      ok: false,
      isRateLimit: true,
      error: `Batas pengiriman pesan tes tercapai (maksimal 3 kali per jam). Harap tunggu ${waitMinutes} menit.`,
    }
  }

  const testChatId = process.env.TELEGRAM_PAYMENT_TEST_CHAT_ID
  if (!testChatId || String(testChatId).trim().length === 0) {
    return {
      ok: false,
      isFatal: true,
      error: 'TELEGRAM_PAYMENT_TEST_CHAT_ID belum dikonfigurasi di file .env',
    }
  }

  const dateStr = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'medium',
  })

  const testText =
    `🧪 <b>[TES] Notifikasi Grup Pembayaran AF Blast</b>\n\n` +
    `Pesan ini dikirim sebagai pengujian integrasi bot @AFBlastPaymentBot ke grup Telegram pengujian.\n\n` +
    `⚙️ <b>Status:</b> Bot terhubung & Siap mengirim riwayat penarikan\n` +
    `👤 <b>Pengirim:</b> ${adminName}\n` +
    `⏰ <b>Waktu:</b> ${dateStr} WIB`

  const result = await sendTelegramPaymentMessage({
    text: testText,
    chatId: testChatId,
    timeoutMs: 10000,
  })

  if (result.ok) {
    testMessageTimestamps.push(now)
  }

  return result
}

/**
 * Membaca pengaturan grup pembayaran dari SiteSetting
 */
async function getPaymentGroupSettings() {
  const settings = await prisma.siteSetting.findMany({
    where: {
      key: {
        in: [
          'paymentGroup.enabled',
          'paymentGroup.notifySuccess',
          'paymentGroup.notifyProcessing',
          'paymentGroup.notifyRejected',
          'paymentGroup.minAmount',
        ],
      },
    },
  })

  const map = {}
  for (const s of settings) {
    map[s.key] = s.value
  }

  return {
    enabled: map['paymentGroup.enabled'] === 'true',
    notifySuccess: map['paymentGroup.notifySuccess'] !== 'false', // default true
    notifyProcessing: map['paymentGroup.notifyProcessing'] === 'true', // default false
    notifyRejected: map['paymentGroup.notifyRejected'] === 'true', // default false
    minAmount: parseInt(map['paymentGroup.minAmount'] || '0', 10),
    chatIdConfigured: Boolean(process.env.TELEGRAM_PAYMENT_CHAT_ID),
    testChatIdConfigured: Boolean(process.env.TELEGRAM_PAYMENT_TEST_CHAT_ID),
    botTokenConfigured: Boolean(process.env.TELEGRAM_PAYMENT_BOT_TOKEN),
  }
}

/**
 * Menyimpan pengaturan grup pembayaran ke SiteSetting
 */
async function updatePaymentGroupSettings({
  enabled,
  notifySuccess,
  notifyProcessing,
  notifyRejected,
  minAmount,
}) {
  const updates = []

  if (enabled !== undefined) {
    updates.push(
      prisma.siteSetting.upsert({
        where: { key: 'paymentGroup.enabled' },
        create: { key: 'paymentGroup.enabled', value: String(Boolean(enabled)) },
        update: { value: String(Boolean(enabled)) },
      })
    )
  }

  if (notifySuccess !== undefined) {
    updates.push(
      prisma.siteSetting.upsert({
        where: { key: 'paymentGroup.notifySuccess' },
        create: { key: 'paymentGroup.notifySuccess', value: String(Boolean(notifySuccess)) },
        update: { value: String(Boolean(notifySuccess)) },
      })
    )
  }

  if (notifyProcessing !== undefined) {
    updates.push(
      prisma.siteSetting.upsert({
        where: { key: 'paymentGroup.notifyProcessing' },
        create: { key: 'paymentGroup.notifyProcessing', value: String(Boolean(notifyProcessing)) },
        update: { value: String(Boolean(notifyProcessing)) },
      })
    )
  }

  if (notifyRejected !== undefined) {
    updates.push(
      prisma.siteSetting.upsert({
        where: { key: 'paymentGroup.notifyRejected' },
        create: { key: 'paymentGroup.notifyRejected', value: String(Boolean(notifyRejected)) },
        update: { value: String(Boolean(notifyRejected)) },
      })
    )
  }

  if (minAmount !== undefined) {
    const minVal = Math.max(0, parseInt(minAmount, 10) || 0)
    updates.push(
      prisma.siteSetting.upsert({
        where: { key: 'paymentGroup.minAmount' },
        create: { key: 'paymentGroup.minAmount', value: String(minVal) },
        update: { value: String(minVal) },
      })
    )
  }

  await prisma.$transaction(updates)
  return await getPaymentGroupSettings()
}

module.exports = {
  sendTelegramPaymentMessage,
  sendTestPaymentMessage,
  getPaymentGroupSettings,
  updatePaymentGroupSettings,
}
