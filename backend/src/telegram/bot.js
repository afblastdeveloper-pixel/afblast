/**
 * Bot Telegram Pemulihan & Notifikasi AF Blast (@AFBlastRecoveryBot)
 * Menggunakan library grammY.
 *
 * PRINSIP KEAMANAN UTAMA:
 * - Pengiriman pesan bot HANYA berdasarkan telegramChatId yang sudah terverifikasi lewat START di bot,
 *   TIDAK PERNAH berdasarkan username. Username hanya data tampilan dan pembanding saat verifikasi.
 * - Tidak pernah mengirim atau menyimpan password asli.
 * - Akun staf ditolak dari pemakaian bot member.
 */

const { Bot, webhookCallback } = require('grammy')
const crypto = require('crypto')
const prisma = require('../config/db')
const { logActivity } = require('../utils/logger')
const { escapeHtml } = require('../utils/crypto')

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'AFBlastRecoveryBot'
const TELEGRAM_MODE = process.env.TELEGRAM_MODE || 'polling'
const RESET_CODE_SECRET = process.env.RESET_CODE_SECRET || 'afblast_reset_code_secret_default_key_2026'

/**
 * Hash SHA-256 dari string mentah
 * @param {string} rawString
 * @returns {string} hex hash
 */
function hashToken(rawString) {
  if (!rawString || typeof rawString !== 'string') return ''
  return crypto.createHash('sha256').update(rawString).digest('hex')
}

/**
 * Hash HMAC-SHA256 dari kode verifikasi 6 digit
 * @param {string} code
 * @returns {string} hex hmac
 */
function computeCodeHmac(code) {
  if (!code || typeof code !== 'string') return ''
  return crypto.createHmac('sha256', RESET_CODE_SECRET).update(code.trim()).digest('hex')
}

/**
 * Verifikasi hash dengan perbandingan waktu-konstan (timingSafeEqual)
 * @param {string} hashA
 * @param {string} hashB
 * @returns {boolean}
 */
function safeCompareHash(hashA, hashB) {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') return false
  const bufA = Buffer.from(hashA, 'hex')
  const bufB = Buffer.from(hashB, 'hex')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Mengambil member terhubung berdasarkan chatId Telegram
 * @param {string} chatId
 */
async function getLinkedMemberByChatId(chatId) {
  if (!chatId) return null
  return await prisma.user.findFirst({
    where: {
      telegramChatId: String(chatId),
      role: 'user',
    },
    include: {
      payoutAccount: true,
      payoutChangeRequests: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
}

let bot = null

// Inisialisasi Bot grammY hanya jika TELEGRAM_BOT_TOKEN tersedia
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.trim().length > 10) {
  try {
    bot = new Bot(TELEGRAM_BOT_TOKEN.trim())

    // Middleware 1: Hanya tangani chat privat, abaikan obrolan grup/saluran
    bot.use(async (ctx, next) => {
      if (ctx.chat?.type !== 'private') {
        return // Abaikan grup
      }
      return next()
    })

    // Handler /start
    bot.command('start', async (ctx) => {
      const text = ctx.message?.text || ''
      const parts = text.split(' ')
      const param = parts[1]?.trim() || ''

      const chatId = String(ctx.chat.id)

      // 1. /start tanpa parameter
      if (!param) {
        return ctx
          .reply(
            `👋 <b>Halo! Bot Pemulihan & Notifikasi Resmi AF Blast (@${TELEGRAM_BOT_USERNAME})</b>\n\n` +
              `Bot resmi ini digunakan untuk menerima kode verifikasi reset password, notifikasi penarikan dana, dan layanan bantuan.\n\n` +
              `📋 <b>Daftar Perintah:</b>\n` +
              `• /status - Ringkasan status akun Anda\n` +
              `• /penarikan - 5 riwayat penarikan terakhir\n` +
              `• /bantuan - FAQ & panduan penggunaan\n` +
              `• /putuskan - Putuskan tautan Telegram dari akun saat ini\n` +
              `• /hubungiadmin &lt;pesan&gt; - Kirim pesan bantuan ke admin\n\n` +
              `⚠️ <i>Admin AF Blast tidak pernah meminta kode verifikasi atau kata sandi Anda.</i>`,
            { parse_mode: 'HTML' }
          )
          .catch(() => {})
      }

      // 2. /start link_<token> (Penautan Telegram dengan Verifikasi from.username)
      if (param.startsWith('link_')) {
        const rawToken = param.slice(5)
        const computedHash = hashToken(rawToken)

        try {
          const linkToken = await prisma.telegramLinkToken.findUnique({
            where: { tokenHash: computedHash },
            include: { user: true },
          })

          // Validasi keberadaan token
          if (
            !linkToken ||
            linkToken.purpose !== 'link' ||
            linkToken.usedAt !== null ||
            new Date(linkToken.expiresAt) < new Date() ||
            !safeCompareHash(linkToken.tokenHash, computedHash)
          ) {
            return ctx
              .reply('❌ <b>Tautan penautan tidak valid atau telah kedaluwarsa.</b>\n\nSilakan buat tautan baru di Pengaturan Akun.', {
                parse_mode: 'HTML',
              })
              .catch(() => {})
          }

          // Tolak akun staf
          if (linkToken.user.role !== 'user') {
            return ctx
              .reply('🚫 <b>Akses Ditolak</b>\n\nFitur ini hanya untuk member. Akun staf silakan Hubungi Super Admin.', {
                parse_mode: 'HTML',
              })
              .catch(() => {})
          }

          // Verifikasi Username: Bandingkan from.username (huruf kecil) dengan telegramUsername akun
          const senderUsername = (ctx.from?.username || '').toLowerCase().trim()
          const accountTgUsername = (linkToken.user.telegramUsername || '').toLowerCase().trim()

          if (!senderUsername || !accountTgUsername || senderUsername !== accountTgUsername) {
            return ctx
              .reply('Username Telegram Anda tidak sama dengan yang diisi di Pengaturan Akun.', {
                parse_mode: 'HTML',
              })
              .catch(() => {})
          }

          // Tolak jika chat_id ini sudah ditautkan ke akun member lain
          const existingUserWithChatId = await prisma.user.findFirst({
            where: {
              telegramChatId: chatId,
              id: { not: linkToken.user.id },
            },
          })

          if (existingUserWithChatId) {
            const maskedOldEmail = existingUserWithChatId.email
              ? existingUserWithChatId.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
              : 'lain'
            return ctx
              .reply(
                `⚠️ <b>Akun Telegram ini sudah tertaut dengan akun AF Blast lain (${escapeHtml(maskedOldEmail)}).</b>\n\n` +
                  `<b>Cara Mengatasinya:</b>\n` +
                  `1. Ketik perintah <code>/unlink</code> atau <code>/putuskan</code> di bot ini untuk langsung melepaskan tautan dari akun lama.\n` +
                  `2. Setelah terlepas, kembali ke menu <b>Pengaturan Akun</b> di website dan klik <b>Verifikasi lewat Bot</b>.\n\n` +
                  `<i>Atau putuskan tautan secara manual melalui Pengaturan Akun di akun lama Anda.</i>`,
                {
                  parse_mode: 'HTML',
                }
              )
              .catch(() => {})
          }

          // Sukses: simpan chatId dan set telegramVerifiedAt
          await prisma.$transaction([
            prisma.user.update({
              where: { id: linkToken.user.id },
              data: {
                telegramChatId: chatId,
                telegramVerifiedAt: new Date(),
                telegramLinkedAt: new Date(),
              },
            }),
            prisma.telegramLinkToken.update({
              where: { id: linkToken.id },
              data: { usedAt: new Date() },
            }),
            prisma.resetAudit.create({
              data: {
                userId: linkToken.user.id,
                event: 'telegram_verified_and_linked',
                ip: linkToken.requestIp,
              },
            }),
          ])

          await logActivity({
            userId: linkToken.user.id,
            adminName: linkToken.user.name,
            action: 'TELEGRAM_VERIFIED_SUCCESS',
            target: linkToken.user.email,
            details: `Telegram @${senderUsername} (Chat ID: ${chatId}) berhasil diverifikasi dan ditautkan`,
            ipAddress: linkToken.requestIp,
            status: 'success',
          })

          const displayUser = escapeHtml(linkToken.user.username || linkToken.user.name)
          return ctx
            .reply(`✅ <b>Telegram tertaut ke akun @${displayUser}</b>\n\nAkun Anda kini terverifikasi penuh dan siap menerima notifikasi serta kode pemulihan.`, {
              parse_mode: 'HTML',
            })
            .catch(() => {})
        } catch (err) {
          console.error('[Telegram Bot] Error on link token handling:', err.message)
          return ctx
            .reply('❌ <b>Terjadi kesalahan saat menautkan akun.</b>', { parse_mode: 'HTML' })
            .catch(() => {})
        }
      }

      // 3. /start <startToken> (Alur Reset Password 3 Langkah dengan Kode 6 Digit)
      const rawStartToken = param.trim()
      const startTokenHash = hashToken(rawStartToken)

      try {
        // SELALU balas respons netral terlebih dahulu
        await ctx
          .reply('Permintaan diterima. Kalau data akun cocok, kode verifikasi akan dikirim di pesan berikutnya.')
          .catch(() => {})

        const resetReq = await prisma.passwordResetRequest.findUnique({
          where: { startTokenHash },
          include: { user: true },
        })

        const isEligible =
          resetReq &&
          resetReq.usedAt === null &&
          new Date(resetReq.expiresAt) > new Date() &&
          resetReq.userId !== null &&
          resetReq.user !== null &&
          resetReq.user.role === 'user' &&
          resetReq.user.telegramChatId === chatId &&
          resetReq.resendCount < 3

        if (isEligible) {
          const code = crypto.randomInt(100000, 1000000).toString()
          const codeHash = computeCodeHmac(code)
          const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

          await prisma.passwordResetRequest.update({
            where: { id: resetReq.id },
            data: {
              codeHash,
              codeSentAt: new Date(),
              codeExpiresAt,
              resendCount: resetReq.resendCount + 1,
            },
          })

          const codeMsg =
            `🔑 <b>Kode Reset Password AF Blast</b>\n\n` +
            `Kode kamu: <code>${code}</code>\n\n` +
            `Berlaku 10 menit. Masukkan di halaman Lupa Kata Sandi.\n\n` +
            `<i>Jangan berikan kode ini ke siapa pun, termasuk yang mengaku admin.</i>`

          await ctx.reply(codeMsg, { parse_mode: 'HTML' }).catch((err) => {
            console.warn('[Telegram Bot] Gagal mengirim pesan kode:', err.message)
          })
        }
      } catch (err) {
        console.error('[Telegram Bot] Error on reset token handling:', err.message)
      }
    })

    // Handler /penarikan
    bot.command('penarikan', async (ctx) => {
      const chatId = String(ctx.chat.id)
      const member = await getLinkedMemberByChatId(chatId)
      if (!member) {
        return ctx.reply('Akun belum terhubung. Tautkan lewat Pengaturan Akun di website.', { parse_mode: 'HTML' }).catch(() => {})
      }

      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId: member.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      if (!withdrawals || withdrawals.length === 0) {
        return ctx.reply('💳 <b>Riwayat Penarikan Dana</b>\n\nBelum ada riwayat penarikan dana pada akun Anda.', { parse_mode: 'HTML' }).catch(() => {})
      }

      let text = '💳 <b>5 Penarikan Terakhir Anda</b>\n\n'
      withdrawals.forEach((w) => {
        const dateStr = new Intl.DateTimeFormat('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(w.createdAt))
        const amountStr = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0,
        }).format(w.amount)
        const maskedAcc = w.accountNumber ? `••••${w.accountNumber.slice(-4)}` : '••••'

        text += `• <b>#${w.id}</b> • ${dateStr}\n`
        text += `  Nominal: <b>${amountStr}</b>\n`
        text += `  Status: <code>${escapeHtml(w.status.toUpperCase())}</code>\n`
        text += `  Rekening: ${escapeHtml(w.bank || 'Transfer')} (${maskedAcc})\n`
        if (w.rejectionReason) {
          text += `  Alasan Ditolak: <i>${escapeHtml(w.rejectionReason)}</i>\n`
        }
        text += '\n'
      })

      return ctx.reply(text, { parse_mode: 'HTML' }).catch(() => {})
    })

    // Handler /status
    bot.command('status', async (ctx) => {
      const chatId = String(ctx.chat.id)
      const member = await getLinkedMemberByChatId(chatId)
      if (!member) {
        return ctx.reply('Akun belum terhubung. Tautkan lewat Pengaturan Akun di website.', { parse_mode: 'HTML' }).catch(() => {})
      }

      const name = escapeHtml(member.fullName || member.name)
      const username = escapeHtml(member.username || '-')
      const tgUser = escapeHtml(member.telegramUsername || '-')
      const payout = member.payoutAccount
      const pendingChange = member.payoutChangeRequests?.[0]

      let text = `👤 <b>Ringkasan Status Akun AF Blast</b>\n\n`
      text += `• Nama: <b>${name}</b>\n`
      text += `• Username: <b>@${username}</b>\n`
      text += `• Status Telegram: <b>✅ Terverifikasi</b> (@${tgUser})\n`

      if (payout) {
        text += `• Rekening: <b>${escapeHtml(payout.providerName)}</b> (••••${payout.accountNumberLast4})\n`
        text += `• Nama Pemilik: ${escapeHtml(payout.holderName)}\n`
        text += `• Status Rekening: 🔒 <b>Terkunci</b>\n`
        if (payout.withdrawHoldUntil && new Date(payout.withdrawHoldUntil) > new Date()) {
          const holdDate = new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(payout.withdrawHoldUntil))
          text += `• ⚠️ <i>Penarikan dana ditahan hingga ${holdDate}</i>\n`
        }
      } else {
        text += `• Rekening: <i>Belum ada rekening penarikan terdaftar</i>\n`
      }

      if (pendingChange) {
        text += `• Permintaan Ganti Rekening: 🟡 <b>Sedang ditinjau admin</b>\n`
      }

      return ctx.reply(text, { parse_mode: 'HTML' }).catch(() => {})
    })

    // Handler /bantuan
    bot.command('bantuan', async (ctx) => {
      const chatId = String(ctx.chat.id)
      const member = await getLinkedMemberByChatId(chatId)
      if (!member) {
        return ctx.reply('Akun belum terhubung. Tautkan lewat Pengaturan Akun di website.', { parse_mode: 'HTML' }).catch(() => {})
      }

      let text = `ℹ️ <b>FAQ & Bantuan AF Blast (@${TELEGRAM_BOT_USERNAME})</b>\n\n`
      text += `1. <b>Lupa Kata Sandi?</b>\n`
      text += `Gunakan menu Lupa Kata Sandi di halaman login website AF Blast. Bot akan mengirimkan kode 6 digit ke sini.\n\n`
      text += `2. <b>Penarikan Dana Tertunda / Ditolak?</b>\n`
      text += `Penarikan diproses oleh admin finance. Pastikan nama pemilik rekening sama dengan nama akun Anda.\n\n`
      text += `3. <b>Ganti Rekening Bank / E-Wallet?</b>\n`
      text += `Rekening terkunci setelah disimpan pertama kali. Ajukan penggantian rekening melalui menu Pengaturan Akun di website.\n\n`
      text += `4. <b>Aturan Nama Pemilik Rekening:</b>\n`
      text += `Nama pemilik rekening harus sesuai identitas member untuk mencegah penyalahgunaan dana.\n\n`
      text += `💬 Kirim pesan langsung ke admin dengan format:\n<code>/hubungiadmin pesan Anda</code>`

      return ctx.reply(text, { parse_mode: 'HTML' }).catch(() => {})
    })

    // Handler /hubungiadmin <pesan>
    bot.command('hubungiadmin', async (ctx) => {
      const chatId = String(ctx.chat.id)
      const member = await getLinkedMemberByChatId(chatId)
      if (!member) {
        return ctx.reply('Akun belum terhubung. Tautkan lewat Pengaturan Akun di website.', { parse_mode: 'HTML' }).catch(() => {})
      }

      const text = ctx.message?.text || ''
      const parts = text.split(' ')
      const messageBody = parts.slice(1).join(' ').trim()

      if (!messageBody) {
        return ctx
          .reply(
            'Format penggunaan:\n<code>/hubungiadmin &lt;pesan Anda&gt;</code>\n\nContoh:\n<code>/hubungiadmin Mohon cek penarikan #123</code>',
            { parse_mode: 'HTML' }
          )
          .catch(() => {})
      }

      await prisma.supportMessage.create({
        data: {
          userId: member.id,
          text: messageBody,
          status: 'open',
        },
      })

      return ctx.reply('Pesan diterima, admin akan membalas di sini.', { parse_mode: 'HTML' }).catch(() => {})
    })

    // Handler /unlink atau /putuskan (Memutuskan tautan Telegram langsung dari bot)
    bot.command(['unlink', 'putuskan'], async (ctx) => {
      const chatId = String(ctx.chat.id)
      const member = await getLinkedMemberByChatId(chatId)
      if (!member) {
        return ctx
          .reply('ℹ️ Akun Telegram Anda saat ini belum tertaut ke akun AF Blast manapun.', {
            parse_mode: 'HTML',
          })
          .catch(() => {})
      }

      const maskedEmail = member.email ? member.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'akun Anda'

      await prisma.user.update({
        where: { id: member.id },
        data: {
          telegramChatId: null,
          telegramVerifiedAt: null,
          telegramLinkedAt: null,
        },
      })

      await prisma.resetAudit.create({
        data: {
          userId: member.id,
          event: 'telegram_unlinked_via_bot',
          ip: 'telegram-bot',
        },
      })

      await logActivity({
        userId: member.id,
        adminName: member.name,
        action: 'TELEGRAM_UNLINK_BOT_SUCCESS',
        target: member.email,
        details: `Member memutuskan tautan Telegram melalui perintah /unlink di bot (Chat ID: ${chatId})`,
        ipAddress: 'telegram-bot',
        status: 'success',
      })

      return ctx
        .reply(
          `✅ <b>Tautan Telegram Berhasil Diputuskan!</b>\n\n` +
            `Akun Telegram Anda telah berhasil dilepaskan dari akun AF Blast (<b>${escapeHtml(maskedEmail)}</b>).\n\n` +
            `Sekarang Anda dapat menautkan akun Telegram ini ke akun AF Blast baru Anda melalui menu <b>Pengaturan Akun</b> di website.`,
          { parse_mode: 'HTML' }
        )
        .catch(() => {})
    })

    bot.catch((err) => {
      console.warn('[Telegram Bot Error Handler]:', err.message)
    })
  } catch (err) {
    console.warn('[Telegram Bot] Gagal inisialisasi grammY:', err.message)
  }
}

/**
 * Inisialisasi mode bot (polling untuk lokal)
 */
function initTelegramBot() {
  if (!bot) {
    console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN belum disetel. Bot berjalan dalam mode simulasi/stub.')
    return
  }

  if (TELEGRAM_MODE === 'polling') {
    bot
      .start({
        onStart: (botInfo) => {
          console.log(`[Telegram Bot] Berjalan dalam mode POLLING sebagai @${botInfo.username}`)
        },
        drop_pending_updates: true,
      })
      .catch((err) => {
        console.warn('[Telegram Bot] Polling start notice:', err.message)
      })
  } else {
    console.log('[Telegram Bot] Berjalan dalam mode WEBHOOK (/api/telegram/webhook)')
  }
}

/**
 * Mengirim pesan langsung ke chat ID terverifikasi (tanpa crash jika diblokir)
 * @param {string} chatId
 * @param {string} htmlMessage
 */
async function sendDirectBotMessage(chatId, htmlMessage) {
  if (!bot || !chatId || !htmlMessage) return
  try {
    await bot.api.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML' })
  } catch (err) {
    console.warn(`[Telegram Bot] Pengiriman pesan ke ${chatId} gagal (diblokir/error 403):`, err.message)
  }
}

/**
 * Helper notifikasi keamanan ganti password
 * @param {string} chatId
 * @param {string} displayName
 */
async function sendTelegramNotification(chatId, displayName) {
  const text =
    `⚠️ <b>Pemberitahuan Keamanan AF Blast</b>\n\n` +
    `Password akun Anda baru saja diubah. Jika bukan Anda, segera hubungi admin.`
  await sendDirectBotMessage(chatId, text)
}

module.exports = {
  bot,
  initTelegramBot,
  sendDirectBotMessage,
  sendTelegramNotification,
  hashToken,
  computeCodeHmac,
  safeCompareHash,
  TELEGRAM_BOT_USERNAME,
  getLinkedMemberByChatId,
}
