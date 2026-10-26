/**
 * Controller Pengaturan Akun Member (/api/member/account, /api/member/payout, /api/member/support)
 * AF Blast Backend - Express + Prisma + BullMQ
 *
 * PRINSIP KEAMANAN:
 * - Hanya melayani aud: member & role: user
 * - Nomor rekening disimpan terenkripsi AES-256-GCM
 * - Rekening terkunci permanen setelah disimpan, penggantian wajib izin admin
 * - Sanitasi input dan proteksi terhadap modifikasi hak akses (role/balance/status)
 */

const bcrypt = require('bcrypt')
const { z } = require('zod')
const prisma = require('../config/db')
const {
  encryptAccountNumber,
  SUPPORTED_PROVIDERS,
  escapeHtml,
} = require('../utils/crypto')
const { queueTelegramNotification } = require('../worker')
const { getClientIp, logActivity } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')

/**
 * Normalisasi nomor rekening / HP e-wallet
 * Mengubah format 08xx atau +628xx menjadi 628xx
 */
function normalizeEwalletNumber(raw) {
  let cleaned = String(raw).trim().replace(/[\s-]/g, '')
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2)
  }
  return cleaned
}

/**
 * GET /api/member/account
 * Mengambil informasi akun member, status Telegram, data rekening penarikan (tersamar),
 * serta daftar bank & e-wallet resmi.
 */
async function getAccount(req, res) {
  try {
    const userId = req.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        payoutAccount: true,
        payoutChangeRequests: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    const payout = user.payoutAccount
    const pendingChange = user.payoutChangeRequests?.[0] || null

    let payoutData = null
    if (payout) {
      payoutData = {
        type: payout.type,
        providerName: payout.providerName,
        accountNumberMasked: `••••${payout.accountNumberLast4}`,
        holderName: payout.holderName,
        locked: Boolean(payout.lockedAt),
        lockedAt: payout.lockedAt,
        withdrawHoldUntil: payout.withdrawHoldUntil,
        pendingChangeRequest: pendingChange
          ? {
              id: pendingChange.id,
              reason: pendingChange.reason,
              requestedType: pendingChange.requestedType,
              createdAt: pendingChange.createdAt,
            }
          : null,
      }
    }

    return res.status(200).json({
      fullName: user.fullName || user.name,
      name: user.name,
      username: user.username, // read-only
      email: user.email,
      telegram: {
        username: user.telegramUsername || null,
        verified: Boolean(user.telegramVerifiedAt && user.telegramChatId),
        linkedAt: user.telegramVerifiedAt || user.telegramLinkedAt,
      },
      payout: payoutData,
      providers: SUPPORTED_PROVIDERS,
      hideFromPaymentChannel: Boolean(user.hideFromPaymentChannel),
    })
  } catch (error) {
    console.error('Error in getAccount:', error)
    return res.status(500).json({ error: 'Gagal memuat pengaturan akun' })
  }
}

const updateAccountSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(60, 'Nama lengkap maksimal 60 karakter')
    .refine((val) => !/[\x00-\x1F\x7F]/.test(val), {
      message: 'Nama lengkap tidak boleh mengandung karakter kontrol',
    })
    .optional(),
  username: z
    .string()
    .trim()
    .optional()
    .nullable(),
  telegramUsername: z
    .string()
    .trim()
    .optional()
    .nullable(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
})

/**
 * PUT /api/member/account
 * Memperbarui nama lengkap, username, username Telegram, dan/atau kata sandi akun
 */
async function updateAccount(req, res) {
  try {
    const parseResult = updateAccountSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { fullName, currentPassword, newPassword, confirmPassword } = parseResult.data
    let { username, telegramUsername } = parseResult.data

    const userId = req.user.id
    const ip = getClientIp(req)

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    const updateData = {}
    let passwordChanged = false
    let telegramChanged = false
    let usernameChanged = false
    let oldTelegramChatId = user.telegramChatId

    // 1. Validasi & Update Full Name
    if (fullName !== undefined && fullName !== null) {
      updateData.fullName = fullName.trim()
      updateData.name = fullName.trim() // sinkronkan dengan field display name
    }

    // 1b. Validasi & Update Username Member
    if (username !== undefined && username !== null) {
      let cleanUsername = username.replace(/^@/, '').toLowerCase().trim()

      if (cleanUsername.length > 0) {
        if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
          return res.status(400).json({
            error:
              'Username harus terdiri dari 3-30 karakter (hanya huruf kecil, angka, dan underscore).',
          })
        }

        const staffRoles = ['superadmin', 'adminfinance', 'developer', 'admin', 'afblast', 'support']
        if (staffRoles.includes(cleanUsername) || cleanUsername.includes('@')) {
          return res.status(400).json({
            error: 'Username tidak diizinkan. Silakan pilih username lain.',
          })
        }

        // Cek keunikan di seluruh pengguna
        const existingUsername = await prisma.user.findFirst({
          where: {
            username: cleanUsername,
            id: { not: userId },
          },
        })

        if (existingUsername) {
          return res.status(400).json({
            error: 'Username ini sudah digunakan oleh akun lain. Silakan pilih username lain.',
          })
        }

        const existingEmail = await prisma.user.findFirst({
          where: {
            email: cleanUsername,
            id: { not: userId },
          },
        })

        if (existingEmail) {
          return res.status(400).json({
            error: 'Username ini tidak dapat digunakan.',
          })
        }
      } else {
        cleanUsername = null
      }

      // Jika ada perubahan username (membuat baru atau mengganti)
      if (cleanUsername !== (user.username || null)) {
        if (!currentPassword) {
          return res.status(400).json({
            error: 'Kata sandi saat ini wajib diisi untuk mengatur atau mengubah username.',
          })
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password)
        if (!isMatch) {
          return res.status(400).json({
            error: 'Kata sandi saat ini salah.',
          })
        }

        updateData.username = cleanUsername
        usernameChanged = true
      }
    }

    // 2. Validasi & Update Telegram Username
    if (telegramUsername !== undefined && telegramUsername !== null) {
      // Hilangkan awalan @ jika ada, lalu jadikan huruf kecil
      telegramUsername = telegramUsername.replace(/^@/, '').toLowerCase().trim()

      if (telegramUsername.length > 0) {
        if (!/^[a-z0-9_]{5,32}$/.test(telegramUsername)) {
          return res.status(400).json({
            error:
              'Username Telegram harus terdiri dari 5-32 karakter (hanya huruf, angka, dan underscore).',
          })
        }

        // Cek keunikan di seluruh akun
        const existingTgUser = await prisma.user.findFirst({
          where: {
            telegramUsername,
            id: { not: userId },
          },
        })

        if (existingTgUser) {
          return res.status(400).json({
            error: 'Username Telegram ini sudah digunakan oleh akun lain.',
          })
        }
      } else {
        telegramUsername = null
      }

      // Jika ada perubahan username telegram
      if (telegramUsername !== (user.telegramUsername || null)) {
        if (!currentPassword) {
          return res.status(400).json({
            error: 'Kata sandi saat ini wajib diisi untuk mengubah username Telegram.',
          })
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password)
        if (!isMatch) {
          return res.status(400).json({
            error: 'Kata sandi saat ini salah.',
          })
        }

        updateData.telegramUsername = telegramUsername
        // Kosongkan verifikasi karena username berubah (wajib verifikasi ulang di bot)
        updateData.telegramChatId = null
        updateData.telegramVerifiedAt = null
        updateData.telegramLinkedAt = null
        telegramChanged = true
      }
    }

    // 3. Validasi & Update Password
    if (newPassword && newPassword.trim().length > 0) {
      if (!currentPassword) {
        return res.status(400).json({
          error: 'Kata sandi saat ini wajib diisi untuk mengganti kata sandi.',
        })
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password)
      if (!isMatch) {
        return res.status(400).json({
          error: 'Kata sandi saat ini salah.',
        })
      }

      // Minimal 10 karakter dengan huruf dan angka
      if (newPassword.length < 10 || !/^(?=.*[a-zA-Z])(?=.*[0-9]).{10,}$/.test(newPassword)) {
        return res.status(400).json({
          error: 'Kata sandi baru minimal 10 karakter dan wajib mengandung kombinasi huruf serta angka.',
        })
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          error: 'Konfirmasi kata sandi baru tidak cocok.',
        })
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12)
      updateData.password = hashedPassword
      updateData.tokenVersion = (user.tokenVersion || 0) + 1
      passwordChanged = true
    }

    // Jika tidak ada data yang diubah
    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        message: 'Tidak ada perubahan pada akun',
      })
    }

    // Eksekusi update
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    })

    // Log Activity
    await logActivity({
      userId,
      adminName: updatedUser.name,
      action: 'MEMBER_ACCOUNT_UPDATE',
      target: updatedUser.email,
      details: `Pembaruan akun: ${[
        updateData.fullName ? 'nama' : null,
        usernameChanged ? `username (@${updatedUser.username})` : null,
        telegramChanged ? 'telegram' : null,
        passwordChanged ? 'password' : null,
      ]
        .filter(Boolean)
        .join(', ')}`,
      ipAddress: ip,
      status: 'success',
    })

    // Notifikasi Bot jika username Telegram diubah dan sebelumnya punya chatId
    if (telegramChanged && oldTelegramChatId) {
      await queueTelegramNotification(
        oldTelegramChatId,
        '⚠️ <b>Pemberitahuan Keamanan AF Blast</b>\n\nUsername Telegram akun Anda telah diubah di Pengaturan Akun. Tautan ke bot ini telah dinonaktifkan. Jika bukan Anda, segera hubungi admin.'
      )
    }

    // Notifikasi Bot jika password diubah dan member memiliki telegram verified
    if (passwordChanged && user.telegramChatId && user.telegramVerifiedAt) {
      await queueTelegramNotification(
        user.telegramChatId,
        '⚠️ <b>Pemberitahuan Keamanan AF Blast</b>\n\nKata sandi akun Anda baru saja berhasil diubah. Jika bukan Anda yang melakukannya, segera hubungi admin.'
      )
    }

    return res.status(200).json({
      message: 'Pengaturan akun berhasil disimpan',
      fullName: updatedUser.fullName || updatedUser.name,
      username: updatedUser.username,
      telegramUsername: updatedUser.telegramUsername,
      tokenVersion: updatedUser.tokenVersion,
      passwordChanged,
      telegramChanged,
      usernameChanged,
    })
  } catch (error) {
    console.error('Error in updateAccount:', error)
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan akun' })
  }
}

const payoutSchema = z.object({
  type: z.enum(['bank', 'ewallet'], {
    errorMap: () => ({ message: 'Tipe rekening harus "bank" atau "ewallet"' }),
  }),
  providerName: z.string().min(1, 'Nama bank atau e-wallet wajib diisi'),
  accountNumber: z.string().min(5, 'Nomor rekening minimal 5 karakter').max(30, 'Nomor rekening terlalu panjang'),
  holderName: z
    .string()
    .trim()
    .min(2, 'Nama pemilik rekening minimal 2 karakter')
    .max(60, 'Nama pemilik rekening maksimal 60 karakter')
    .regex(/^[a-zA-Z\s.]{2,60}$/, 'Nama pemilik rekening hanya boleh berisi huruf, spasi, dan titik'),
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi untuk verifikasi keamanan'),
})

/**
 * PUT /api/member/payout
 * Menyimpan rekening penarikan dana member pertama kali (atau setelah dibuka kuncinya oleh admin)
 * Wajib verifikasi kata sandi akun, data rekening disimpan terenkripsi AES-256-GCM.
 */
async function setPayoutAccount(req, res) {
  try {
    const parseResult = payoutSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { type, providerName, holderName, currentPassword } = parseResult.data
    let { accountNumber } = parseResult.data
    const userId = req.user.id
    const ip = getClientIp(req)

    // Validasi penyedia (provider) resmi
    const validProviders = SUPPORTED_PROVIDERS[type] || []
    if (!validProviders.includes(providerName)) {
      return res.status(400).json({
        error: `Penyedia ${type === 'bank' ? 'bank' : 'e-wallet'} "${providerName}" tidak terdaftar di sistem.`,
        validProviders,
      })
    }

    // Validasi nomor rekening / e-wallet
    if (type === 'bank') {
      const cleanAcc = accountNumber.trim()
      if (!/^\d{5,20}$/.test(cleanAcc)) {
        return res.status(400).json({
          error: 'Nomor rekening bank harus berupa digit angka 5 sampai 20 digit.',
        })
      }
      accountNumber = cleanAcc
    } else {
      // E-Wallet
      const normalizedPhone = normalizeEwalletNumber(accountNumber)
      if (!/^\d{10,15}$/.test(normalizedPhone)) {
        return res.status(400).json({
          error: 'Nomor akun e-wallet harus berupa nomor ponsel valid (format 08xx atau 628xx, 10-15 digit).',
        })
      }
      accountNumber = normalizedPhone
    }

    // Cek pengguna & kata sandi
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        payoutAccount: true,
        payoutChangeRequests: {
          where: { status: 'approved' },
          orderBy: { reviewedAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return res.status(400).json({ error: 'Kata sandi saat ini salah.' })
    }

    const existingPayout = user.payoutAccount

    // Jika rekening sudah ada dan TERKUNCI, tolak pengubahan langsung
    if (existingPayout && existingPayout.lockedAt !== null) {
      return res.status(403).json({
        error: 'Rekening terkunci, ajukan penggantian ke admin.',
      })
    }

    // Jika ini adalah penggantian rekening yang sebelumnya disetujui admin,
    // pasang penahanan penarikan (withdrawHoldUntil) 24 jam dari sekarang
    let withdrawHoldUntil = null
    if (user.payoutChangeRequests.length > 0 || existingPayout) {
      withdrawHoldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000) // sekarang + 24 jam
    }

    // Enkripsi nomor rekening AES-256-GCM
    const encryptedAccountNumber = encryptAccountNumber(accountNumber)
    const accountNumberLast4 = accountNumber.slice(-4)

    let savedAccount
    if (existingPayout) {
      savedAccount = await prisma.payoutAccount.update({
        where: { id: existingPayout.id },
        data: {
          type,
          providerName,
          accountNumber: encryptedAccountNumber,
          accountNumberLast4,
          holderName: holderName.trim(),
          lockedAt: new Date(), // Kunci rekening
          withdrawHoldUntil,
        },
      })
    } else {
      savedAccount = await prisma.payoutAccount.create({
        data: {
          userId,
          type,
          providerName,
          accountNumber: encryptedAccountNumber,
          accountNumberLast4,
          holderName: holderName.trim(),
          lockedAt: new Date(), // Kunci rekening
          withdrawHoldUntil,
        },
      })
    }

    await logActivity({
      userId,
      adminName: user.name,
      action: 'PAYOUT_ACCOUNT_LOCKED',
      target: `${providerName} (••••${accountNumberLast4})`,
      details: `Rekening penarikan ${type} berhasil dikunci${
        withdrawHoldUntil ? ' (hold penarikan 24 jam)' : ''
      }`,
      ipAddress: ip,
      status: 'success',
    })

    // Notifikasi Telegram jika terverifikasi
    if (user.telegramChatId && user.telegramVerifiedAt) {
      await queueTelegramNotification(
        user.telegramChatId,
        `🔒 <b>Rekening Penarikan Terkunci</b>\n\nRekening <b>${escapeHtml(providerName)}</b> (••••${accountNumberLast4}) atas nama <b>${escapeHtml(
          holderName
        )}</b> telah berhasil disimpan dan dikunci secara aman.\n\n` +
          (withdrawHoldUntil
            ? `⚠️ <i>Demi keamanan, penarikan dana ditahan selama 24 jam ke depan.</i>\n\n`
            : '') +
          `<i>Jika bukan Anda, segera hubungi admin.</i>`
      )
    }

    return res.status(200).json({
      message: 'Rekening penarikan berhasil disimpan dan terkunci secara aman',
      payout: {
        type: savedAccount.type,
        providerName: savedAccount.providerName,
        accountNumberMasked: `••••${savedAccount.accountNumberLast4}`,
        holderName: savedAccount.holderName,
        locked: true,
        lockedAt: savedAccount.lockedAt,
        withdrawHoldUntil: savedAccount.withdrawHoldUntil,
      },
    })
  } catch (error) {
    console.error('Error in setPayoutAccount:', error)
    return res.status(500).json({ error: 'Gagal menyimpan rekening penarikan' })
  }
}

const changeRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Alasan penggantian rekening minimal 10 karakter')
    .max(500, 'Alasan penggantian rekening maksimal 500 karakter'),
  requestedType: z.string().optional().nullable(),
})

/**
 * POST /api/member/payout/change-request
 * Mengajukan permohonan penggantian nomor rekening penarikan ke panel staf
 * Maksimal 1 permintaan pending per member.
 */
async function requestPayoutChange(req, res) {
  try {
    const parseResult = changeRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { reason, requestedType } = parseResult.data
    const userId = req.user.id
    const ip = getClientIp(req)

    // Cek apakah member sudah memiliki rekening
    const payout = await prisma.payoutAccount.findUnique({
      where: { userId },
    })

    if (!payout) {
      return res.status(400).json({
        error: 'Anda belum mendaftarkan rekening penarikan. Silakan daftarkan langsung.',
      })
    }

    // Cek apakah sudah ada permohonan pending
    const existingPending = await prisma.payoutChangeRequest.findFirst({
      where: {
        userId,
        status: 'pending',
      },
    })

    if (existingPending) {
      return res.status(400).json({
        error: 'Anda masih memiliki permohonan penggantian rekening yang sedang diproses admin.',
      })
    }

    const newRequest = await prisma.payoutChangeRequest.create({
      data: {
        userId,
        reason,
        requestedType: requestedType || null,
        status: 'pending',
      },
    })

    await logActivity({
      userId,
      adminName: req.user.name,
      action: 'PAYOUT_CHANGE_REQUEST_CREATED',
      target: `Permintaan #${newRequest.id}`,
      details: `Member mengajukan ganti rekening: ${reason.slice(0, 50)}...`,
      ipAddress: ip,
      status: 'warning',
    })

    return res.status(201).json({
      message: 'Permohonan penggantian rekening berhasil diajukan dan sedang ditinjau staf.',
      request: newRequest,
    })
  } catch (error) {
    console.error('Error in requestPayoutChange:', error)
    return res.status(500).json({ error: 'Gagal mengajukan permohonan ganti rekening' })
  }
}

const supportSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, 'Pesan bantuan minimal 10 karakter')
    .max(1000, 'Pesan bantuan maksimal 1000 karakter'),
})

/**
 * POST /api/member/support
 * Mengirim pesan bantuan member (dibatasi rate limit 3 per jam)
 */
async function createSupportMessage(req, res) {
  try {
    const parseResult = supportSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ error: getZodErrorMessage(parseResult.error) })
    }

    const { text } = parseResult.data
    const userId = req.user.id
    const ip = getClientIp(req)

    const newMsg = await prisma.supportMessage.create({
      data: {
        userId,
        text,
        status: 'open',
      },
    })

    await logActivity({
      userId,
      adminName: req.user.name,
      action: 'MEMBER_SUPPORT_MESSAGE_CREATED',
      target: `Support #${newMsg.id}`,
      details: `Member mengirim tiket bantuan: ${text.slice(0, 50)}...`,
      ipAddress: ip,
      status: 'info',
    })

    return res.status(201).json({
      message: 'Pesan bantuan berhasil dikirim ke tim admin.',
      supportMessage: newMsg,
    })
  } catch (error) {
    console.error('Error in createSupportMessage:', error)
    return res.status(500).json({ error: 'Gagal mengirim pesan bantuan' })
  }
}

/**
 * GET /api/member/privacy
 * Mengambil status privasi penarikan member
 */
async function getPrivacy(req, res) {
  try {
    const userId = req.user.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hideFromPaymentChannel: true },
    })

    return res.status(200).json({
      hideFromPaymentChannel: Boolean(user?.hideFromPaymentChannel),
    })
  } catch (error) {
    console.error('Error in getPrivacy:', error)
    return res.status(500).json({ error: 'Gagal memuat pengaturan privasi' })
  }
}

/**
 * PUT /api/member/privacy
 * Memperbarui pengaturan privasi penarikan member
 */
async function updatePrivacy(req, res) {
  try {
    const userId = req.user.id
    const { hideFromPaymentChannel } = req.body

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        hideFromPaymentChannel: Boolean(hideFromPaymentChannel),
      },
      select: { hideFromPaymentChannel: true },
    })

    return res.status(200).json({
      message: 'Pengaturan privasi penarikan berhasil disimpan',
      hideFromPaymentChannel: updated.hideFromPaymentChannel,
    })
  } catch (error) {
    console.error('Error in updatePrivacy:', error)
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan privasi' })
  }
}

module.exports = {
  getAccount,
  updateAccount,
  setPayoutAccount,
  requestPayoutChange,
  createSupportMessage,
  getPrivacy,
  updatePrivacy,
}
