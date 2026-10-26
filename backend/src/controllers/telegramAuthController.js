/**
 * Controller Otentikasi Pemulihan Password via Kode Verifikasi 6 Digit Telegram
 * Public endpoints dengan rate limiting ketat dan proteksi enumerasi.
 */

const crypto = require('crypto')
const bcrypt = require('bcrypt')
const { z } = require('zod')
const prisma = require('../config/db')
const {
  hashToken,
  computeCodeHmac,
  safeCompareHash,
  sendTelegramNotification,
  TELEGRAM_BOT_USERNAME,
} = require('../telegram/bot')
const { getClientIp, logActivity } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')

// ============================================================
// RATE LIMITER: 5 req/IP/jam dan 3 req/username/jam
// ============================================================
const ipRequestWindow = new Map() // ip -> [timestamps]
const accountRequestWindow = new Map() // username -> [timestamps]

function checkRateLimit(key, map, maxRequests, windowMs = 3600000) {
  const now = Date.now()
  const timestamps = map.get(key) || []
  const validTimestamps = timestamps.filter((t) => now - t < windowMs)

  if (validTimestamps.length >= maxRequests) {
    return false
  }

  validTimestamps.push(now)
  map.set(key, validTimestamps)
  return true
}

// ------------------------------------------------------------
// 1. POST /api/auth/forgot/start { username }
// ------------------------------------------------------------
const startSchema = z.object({
  username: z.string().min(1, 'Username atau email wajib diisi'),
})

async function forgotStart(req, res) {
  try {
    const parseResult = startSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { username } = parseResult.data
    const ip = getClientIp(req)
    const cleanIdentifier = username.trim().toLowerCase()

    // 1. Rate Limit IP: Maksimal 5 permintaan per IP per jam
    const ipAllowed = checkRateLimit(ip || 'unknown', ipRequestWindow, 5, 3600000)
    if (!ipAllowed) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan reset dari perangkat/jaringan ini. Silakan coba lagi dalam 1 jam.',
      })
    }

    // 2. Rate Limit Akun: Maksimal 3 permintaan per akun per jam
    const accountAllowed = checkRateLimit(cleanIdentifier, accountRequestWindow, 3, 3600000)
    if (!accountAllowed) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan reset untuk akun ini. Silakan coba lagi dalam 1 jam.',
      })
    }

    // Cari user berdasarkan username atau email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: cleanIdentifier }, { email: cleanIdentifier }],
      },
    })

    // Aturan 30 detik: Tolak jika permintaan aktif untuk akun yang sama dibuat kurang dari 30 detik lalu
    if (user && user.role === 'user') {
      const recentRequest = await prisma.passwordResetRequest.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 30 * 1000) },
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      })
      if (recentRequest) {
        return res.status(429).json({
          error: 'Permintaan reset aktif baru saja dibuat. Harap tunggu 30 detik sebelum membuat permintaan baru.',
        })
      }
    }

    // Tentukan userId yang disimpan:
    // HANYA akun member (role: user) yang diberi target userId.
    // Akun non-existent ATAU akun staf (superadmin, adminfinance, developer) disimpan dengan userId = null.
    const targetUserId = user && user.role === 'user' ? user.id : null

    // Jika akun staf terdeteksi, catat audit log secara internal tanpa membocorkan ke pengguna
    if (user && user.role !== 'user') {
      await prisma.resetAudit.create({
        data: {
          userId: user.id,
          event: 'staff_forgot_code_attempt_hidden',
          ip,
        },
      })
    }

    // Buat startToken acak 24 byte base64url (panjang 32 karakter, url-safe)
    const rawStartToken = crypto.randomBytes(24).toString('base64url')
    const startTokenHash = hashToken(rawStartToken)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // Berlaku 10 menit

    const newRequest = await prisma.passwordResetRequest.create({
      data: {
        userId: targetUserId,
        startTokenHash,
        expiresAt,
        requestIp: ip,
      },
    })

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || TELEGRAM_BOT_USERNAME || 'AFBlastRecoveryBot'
    const deepLink = `https://t.me/${botUsername}?start=${rawStartToken}`

    // SELALU kembalikan bentuk respons yang SAMA (anti-enumeration)
    return res.status(200).json({
      requestId: newRequest.id,
      startToken: rawStartToken,
      botUsername,
      deepLink,
      expiresAt: newRequest.expiresAt,
    })
  } catch (err) {
    console.error('[forgotStart Error]:', err.message)
    return res.status(500).json({ error: 'Terjadi kesalahan sistem saat memproses permintaan reset.' })
  }
}

// ------------------------------------------------------------
// 2. POST /api/auth/forgot/resend { requestId }
// ------------------------------------------------------------
const resendSchema = z.object({
  requestId: z.union([z.number(), z.string()]).transform((v) => parseInt(v, 10)),
})

async function forgotResend(req, res) {
  try {
    const parseResult = resendSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { requestId } = parseResult.data

    const resetReq = await prisma.passwordResetRequest.findUnique({
      where: { id: requestId },
    })

    if (!resetReq || resetReq.usedAt !== null || new Date(resetReq.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Permintaan reset tidak valid atau telah kedaluwarsa.' })
    }

    // Batas maksimal kirim ulang 3 kali
    if (resetReq.resendCount >= 3) {
      return res.status(400).json({ error: 'Batas maksimal kirim ulang kode (3 kali) telah tercapai.' })
    }

    // Jeda minimal 60 detik
    const lastSentTime = resetReq.codeSentAt ? new Date(resetReq.codeSentAt).getTime() : 0
    const timeSinceLastSent = Date.now() - lastSentTime

    if (resetReq.codeSentAt && timeSinceLastSent < 60000) {
      const waitSeconds = Math.ceil((60000 - timeSinceLastSent) / 1000)
      return res.status(429).json({
        error: `Harap tunggu ${waitSeconds} detik sebelum meminta kirim ulang kode.`,
      })
    }

    // Respons netral: menginstruksikan pengguna menekan START atau mengirim ulang perintah di bot
    return res.status(200).json({
      message: 'Permintaan kirim ulang diproses. Silakan tekan START di bot Telegram Anda untuk menerima kode baru.',
      resendCount: resetReq.resendCount,
    })
  } catch (err) {
    console.error('[forgotResend Error]:', err.message)
    return res.status(500).json({ error: 'Terjadi kesalahan sistem saat memproses kirim ulang kode.' })
  }
}

// ------------------------------------------------------------
// 3. POST /api/auth/forgot/verify { requestId, code }
// ------------------------------------------------------------
const verifySchema = z.object({
  requestId: z.union([z.number(), z.string()]).transform((v) => parseInt(v, 10)),
  code: z.string().regex(/^\d{6}$/, 'Kode verifikasi harus berupa 6 digit angka'),
})

async function forgotVerify(req, res) {
  try {
    const parseResult = verifySchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { requestId, code } = parseResult.data

    const resetReq = await prisma.passwordResetRequest.findUnique({
      where: { id: requestId },
    })

    if (!resetReq || resetReq.usedAt !== null || new Date(resetReq.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Permintaan reset tidak valid atau telah kedaluwarsa.' })
    }

    // Cek apakah permintaan sudah mencapai batas 5 percobaan salah sebelumnya
    if (resetReq.codeAttempts >= 5) {
      await prisma.passwordResetRequest.update({
        where: { id: resetReq.id },
        data: { usedAt: new Date() },
      })
      return res.status(400).json({
        error: 'Permintaan reset telah hangus karena melebihi batas 5 kali percobaan salah. Silakan mulai ulang.',
        burned: true,
        remainingAttempts: 0,
      })
    }

    // Cek apakah kode sudah pernah dikirim dan belum kedaluwarsa
    if (!resetReq.codeHash || !resetReq.codeExpiresAt || new Date(resetReq.codeExpiresAt) < new Date()) {
      return res.status(400).json({
        error: 'Kode verifikasi salah atau telah kedaluwarsa. Silakan buka bot Telegram Anda atau klik Kirim Ulang.',
        remainingAttempts: Math.max(0, 5 - resetReq.codeAttempts),
      })
    }

    // Bandingkan HMAC kode masukan dengan codeHash tersimpan
    const inputHmac = computeCodeHmac(code.trim())
    const isCodeValid = safeCompareHash(resetReq.codeHash, inputHmac)

    if (!isCodeValid) {
      const newAttempts = resetReq.codeAttempts + 1
      const remaining = Math.max(0, 5 - newAttempts)

      if (remaining <= 0) {
        // Hanguskan permintaan
        await prisma.passwordResetRequest.update({
          where: { id: resetReq.id },
          data: {
            codeAttempts: newAttempts,
            usedAt: new Date(),
          },
        })
        return res.status(400).json({
          error: 'Kode salah. Permintaan reset telah hangus karena mencapai 5 kali percobaan salah. Silakan mulai ulang.',
          burned: true,
          remainingAttempts: 0,
        })
      }

      await prisma.passwordResetRequest.update({
        where: { id: resetReq.id },
        data: { codeAttempts: newAttempts },
      })

      return res.status(400).json({
        error: 'Kode salah atau kedaluwarsa',
        remainingAttempts: remaining,
      })
    }

    // Kode benar! Buat resetToken acak 32 byte base64url
    const rawResetToken = crypto.randomBytes(32).toString('base64url')
    const resetTokenHash = hashToken(rawResetToken)
    const resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000) // Berlaku 10 menit

    await prisma.passwordResetRequest.update({
      where: { id: resetReq.id },
      data: {
        verifiedAt: new Date(),
        resetTokenHash,
        resetTokenExpiresAt,
      },
    })

    return res.status(200).json({
      resetToken: rawResetToken,
    })
  } catch (err) {
    console.error('[forgotVerify Error]:', err.message)
    return res.status(500).json({ error: 'Terjadi kesalahan sistem saat memverifikasi kode.' })
  }
}

// ------------------------------------------------------------
// 4. POST /api/auth/forgot/reset { resetToken, newPassword }
// ------------------------------------------------------------
const resetSchema = z.object({
  resetToken: z.string().min(1, 'Token reset wajib disertakan'),
  newPassword: z
    .string()
    .min(10, 'Password minimal 10 karakter')
    .regex(/^(?=.*[a-zA-Z])(?=.*[0-9])/, 'Password wajib memadukan huruf dan angka'),
})

async function forgotReset(req, res) {
  try {
    const parseResult = resetSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { resetToken, newPassword } = parseResult.data
    const tokenHash = hashToken(resetToken)
    const ip = getClientIp(req)

    const resetReq = await prisma.passwordResetRequest.findUnique({
      where: { resetTokenHash: tokenHash },
      include: { user: true },
    })

    // Validasi token reset
    if (
      !resetReq ||
      resetReq.verifiedAt === null ||
      resetReq.usedAt !== null ||
      !resetReq.resetTokenExpiresAt ||
      new Date(resetReq.resetTokenExpiresAt) < new Date() ||
      !safeCompareHash(resetReq.resetTokenHash, tokenHash)
    ) {
      return res.status(400).json({ error: 'Token reset tidak valid atau sudah kedaluwarsa.' })
    }

    // Jika dummy request (userId null)
    if (!resetReq.userId || !resetReq.user) {
      await prisma.passwordResetRequest.update({
        where: { id: resetReq.id },
        data: { usedAt: new Date() },
      })
      return res.status(400).json({ error: 'Token reset tidak valid.' })
    }

    const { user } = resetReq

    // ATURAN KEAMANAN: Hanya akun member (role: user) yang dapat mereset
    if (user.role !== 'user') {
      return res.status(403).json({
        error: 'Akun staf tidak dapat mereset kata sandi melalui Telegram. Hubungi Super Admin.',
      })
    }

    // Hash kata sandi baru dengan bcrypt cost 12
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update user:
    // 1. Password baru
    // 2. Naikkan tokenVersion (INVALIDASI SEMUA SESI JWT LAMA!)
    // 3. Reset failedLogin & lockedUntil
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: (user.tokenVersion || 0) + 1,
        failedLogin: 0,
        lockedUntil: null,
      },
    })

    // Tandai permintaan reset ini sebagai terpakai
    await prisma.passwordResetRequest.update({
      where: { id: resetReq.id },
      data: { usedAt: new Date() },
    })

    // Batalkan seluruh permintaan reset aktif lainnya milik akun ini
    await prisma.passwordResetRequest.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        id: { not: resetReq.id },
      },
      data: { usedAt: new Date() },
    })

    // Kirim notifikasi keamanan ke Telegram pengguna
    if (user.telegramChatId) {
      sendTelegramNotification(user.telegramChatId, user.username || user.name)
    }

    // Catat ke audit log
    await prisma.resetAudit.create({
      data: {
        userId: user.id,
        event: 'password_reset_code_success',
        ip,
      },
    })

    await logActivity({
      userId: user.id,
      adminName: user.name,
      action: 'PASSWORD_RESET_SUCCESS',
      target: user.email,
      details: 'Kata sandi berhasil direset via alur kode verifikasi 6 digit Telegram',
      ipAddress: ip,
      status: 'success',
    })

    return res.status(200).json({
      message: 'Kata sandi akun Anda berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.',
    })
  } catch (err) {
    console.error('[forgotReset Error]:', err.message)
    return res.status(500).json({ error: 'Terjadi kesalahan sistem saat menyimpan kata sandi baru.' })
  }
}

module.exports = {
  forgotStart,
  forgotResend,
  forgotVerify,
  forgotReset,
}
