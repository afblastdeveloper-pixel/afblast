/**
 * Controller Telegram untuk Member (/api/member/telegram/*)
 * Memerlukan otentikasi aud=member (requireMemberAuth)
 */

const crypto = require('crypto')
const bcrypt = require('bcrypt')
const { z } = require('zod')
const prisma = require('../config/db')
const { hashToken, TELEGRAM_BOT_USERNAME } = require('../telegram/bot')
const { getClientIp, logActivity } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')

/**
 * POST /api/member/telegram/link-token
 * Membuat token penautan Telegram berlaku 10 menit (acak 24 byte, hash disimpan)
 * HANYA jika telegramUsername sudah diisi di akun pengguna.
 */
async function createLinkToken(req, res) {
  try {
    const userId = req.user.id
    const ip = getClientIp(req)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramUsername: true, role: true },
    })

    if (!user || user.role !== 'user') {
      return res.status(403).json({ error: 'Hanya akun member yang dapat menautkan Telegram' })
    }

    if (!user.telegramUsername || user.telegramUsername.trim().length === 0) {
      return res.status(400).json({
        error: 'Username Telegram belum diisi. Silakan isi username Telegram di Pengaturan Akun terlebih dahulu.',
      })
    }

    // Buat token 24 byte acak
    const rawToken = crypto.randomBytes(24).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 menit

    // Simpan ke database dengan purpose 'link'
    await prisma.telegramLinkToken.create({
      data: {
        userId,
        tokenHash,
        purpose: 'link',
        expiresAt,
        requestIp: ip,
      },
    })

    await prisma.resetAudit.create({
      data: {
        userId,
        event: 'link_token_created',
        ip,
      },
    })

    const startCommand = `/start link_${rawToken}`
    const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=link_${rawToken}`

    return res.status(201).json({
      success: true,
      deepLink,
      startCommand,
      botUsername: TELEGRAM_BOT_USERNAME,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error in createLinkToken:', error)
    return res.status(500).json({ error: 'Gagal membuat tautan bot Telegram' })
  }
}

/**
 * GET /api/member/telegram/status
 * Mengecek apakah akun member saat ini sudah tertaut dan terverifikasi di Telegram
 */
async function getTelegramStatus(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        telegramUsername: true,
        telegramChatId: true,
        telegramVerifiedAt: true,
        telegramLinkedAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    const isVerified = Boolean(user.telegramChatId && user.telegramVerifiedAt)

    return res.status(200).json({
      linked: isVerified,
      verified: isVerified,
      linkedAt: user.telegramVerifiedAt || user.telegramLinkedAt,
      username: user.username,
      telegramUsername: user.telegramUsername,
      botUsername: TELEGRAM_BOT_USERNAME,
    })
  } catch (error) {
    console.error('Error in getTelegramStatus:', error)
    return res.status(500).json({ error: 'Gagal mengambil status Telegram' })
  }
}

const unlinkSchema = z.object({
  currentPassword: z.string().optional(),
  password: z.string().optional(),
}).refine((data) => data.currentPassword || data.password, {
  message: 'Kata sandi saat ini wajib diisi untuk memutuskan tautan Telegram',
})

/**
 * DELETE /api/member/telegram
 * Memutuskan tautan Telegram, wajib verifikasi kata sandi akun
 */
async function unlinkTelegram(req, res) {
  try {
    const parseResult = unlinkSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const passwordInput = parseResult.data.currentPassword || parseResult.data.password
    const ip = getClientIp(req)

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    })

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    if (!user.telegramChatId && !user.telegramVerifiedAt) {
      return res.status(400).json({ error: 'Akun ini belum menautkan Telegram.' })
    }

    // Verifikasi kata sandi akun
    const isMatch = await bcrypt.compare(passwordInput, user.password)
    if (!isMatch) {
      return res.status(400).json({ error: 'Kata sandi tidak sesuai. Gagal memutuskan tautan.' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: null,
        telegramVerifiedAt: null,
        telegramLinkedAt: null,
      },
    })

    await prisma.resetAudit.create({
      data: {
        userId: user.id,
        event: 'telegram_unlinked',
        ip,
      },
    })

    await logActivity({
      userId: user.id,
      adminName: user.name,
      action: 'TELEGRAM_UNLINK_SUCCESS',
      target: user.email,
      details: 'Member memutuskan tautan akun Telegram',
      ipAddress: ip,
      status: 'success',
    })

    return res.status(200).json({
      success: true,
      message: 'Tautan Telegram berhasil diputuskan dari akun Anda.',
    })
  } catch (error) {
    console.error('Error in unlinkTelegram:', error)
    return res.status(500).json({ error: 'Gagal memutuskan tautan Telegram' })
  }
}

module.exports = {
  createLinkToken,
  getTelegramStatus,
  unlinkTelegram,
}
