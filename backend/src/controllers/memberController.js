const { z } = require('zod')
const prisma = require('../config/db')
const watsap = require('../providers/watsap')
const { logActivity, getClientIp } = require('../utils/logger')
const { getZodErrorMessage } = require('../utils/validators')
const { queueTelegramNotification } = require('../worker')
const { escapeHtml } = require('../utils/crypto')

/**
 * Masking nomor telepon (contoh: 6281234567890 -> 62812****7890)
 */
function maskPhoneNumber(phone) {
  if (!phone) return ''
  const clean = phone.replace(/[^0-9]/g, '')
  if (clean.length < 8) return clean.replace(/(\d{2})\d+(\d{2})/, '$1****$2')
  const start = clean.slice(0, 5)
  const end = clean.slice(-4)
  return `${start}****${end}`
}

/**
 * GET /api/member/dashboard
 * Ringkasan singkat: saldo, slot aktif, sukses, gagal, nomor tertaut.
 */
async function getDashboard(req, res) {
  try {
    const userId = req.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    })

    const [activeSlots, sentSuccess, sentFailed, linkedDevices] = await Promise.all([
      prisma.contactSlot.count({
        where: { userId, status: 'active' },
      }),
      prisma.blastLog.count({
        where: { userId, status: 'sent' },
      }),
      prisma.blastLog.count({
        where: { userId, status: 'failed' },
      }),
      prisma.device.count({
        where: { userId, status: 'connected' },
      }),
    ])

    return res.status(200).json({
      balance: user?.balance || 0,
      activeSlots,
      sentSuccess,
      sentFailed,
      linkedDevices,
    })
  } catch (error) {
    console.error('Error in getDashboard:', error)
    return res.status(500).json({ error: 'Gagal memuat ringkasan dashboard member' })
  }
}

/**
 * GET /api/member/pool/batches
 * Daftar batch kontak aktif dengan nomor kontak yang disamarkan
 */
async function getPoolBatches(req, res) {
  try {
    const userId = req.user.id

    const batches = await prisma.contactBatch.findMany({
      where: { status: 'active' },
      include: {
        contacts: {
          take: 5, // Cuplikan 5 kontak pertama untuk pratinjau
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: {
            contacts: true,
            slots: { where: { status: 'active' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Cek slot yang sudah diklaim oleh user saat ini
    const mySlots = await prisma.contactSlot.findMany({
      where: { userId, status: 'active' },
      select: { id: true, batchId: true, claimedAt: true },
    })

    const myClaimedMap = new Map(mySlots.map((s) => [s.batchId, s.id]))

    const formattedBatches = batches.map((b) => {
      const activeClaimCount = b._count.slots
      const remainingSlots = Math.max(0, 100 - activeClaimCount) // Kuota slot per batch misal 100

      return {
        id: b.id,
        title: b.title,
        description: b.description,
        totalContacts: b.totalContacts || b._count.contacts,
        activeClaims: activeClaimCount,
        remainingSlots,
        isClaimed: myClaimedMap.has(b.id),
        mySlotId: myClaimedMap.get(b.id) || null,
        previewContacts: b.contacts.map((c) => ({
          id: c.id,
          name: c.name || 'Kontak',
          maskedPhone: maskPhoneNumber(c.phone),
        })),
        createdAt: b.createdAt,
      }
    })

    return res.status(200).json({ batches: formattedBatches })
  } catch (error) {
    console.error('Error in getPoolBatches:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar pool batch kontak' })
  }
}

/**
 * POST /api/member/pool/batches/:id/claim
 * Mengklaim batch kontak untuk member
 */
async function claimBatch(req, res) {
  try {
    const userId = req.user.id
    const batchId = parseInt(req.params.id, 10)

    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'ID batch tidak valid' })
    }

    const batch = await prisma.contactBatch.findUnique({
      where: { id: batchId },
    })

    if (!batch || batch.status !== 'active') {
      return res.status(404).json({ error: 'Batch kontak tidak ditemukan atau tidak aktif' })
    }

    // Cek apakah batch ini sudah diklaim aktif oleh user
    const existingSlot = await prisma.contactSlot.findFirst({
      where: { userId, batchId, status: 'active' },
    })

    if (existingSlot) {
      return res.status(400).json({ error: 'Batch kontak ini sudah aktif Anda klaim' })
    }

    // Cek batas maksimum slot aktif member (default batas 5 slot aktif)
    const activeSlotCount = await prisma.contactSlot.count({
      where: { userId, status: 'active' },
    })

    const MAX_ACTIVE_SLOTS = 5
    if (activeSlotCount >= MAX_ACTIVE_SLOTS) {
      return res.status(400).json({
        error: `Batas maksimum slot kontak aktif telah tercapai (${MAX_ACTIVE_SLOTS} slot)`,
      })
    }

    // Buat atau aktifkan kembali ContactSlot
    const slot = await prisma.contactSlot.upsert({
      where: {
        userId_batchId: { userId, batchId },
      },
      update: {
        status: 'active',
        claimedAt: new Date(),
        endedAt: null,
      },
      create: {
        userId,
        batchId,
        status: 'active',
        claimedAt: new Date(),
      },
    })

    await logActivity({
      userId,
      adminName: req.user.name,
      action: 'CLAIM_CONTACT_SLOT',
      target: `Batch #${batchId}`,
      details: `Member mengklaim batch kontak: ${batch.title}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(201).json({
      message: 'Batch kontak berhasil diklaim',
      slot,
    })
  } catch (error) {
    console.error('Error in claimBatch:', error)
    return res.status(500).json({ error: 'Gagal mengklaim batch kontak' })
  }
}

/**
 * POST /api/member/pool/slots/:id/release
 * Melepaskan slot kontak yang diklaim member
 */
async function releaseSlot(req, res) {
  try {
    const userId = req.user.id
    const slotId = parseInt(req.params.id, 10)

    if (isNaN(slotId)) {
      return res.status(400).json({ error: 'ID slot tidak valid' })
    }

    const slot = await prisma.contactSlot.findUnique({
      where: { id: slotId },
    })

    if (!slot) {
      return res.status(404).json({ error: 'Slot kontak tidak ditemukan' })
    }

    // KEAMANAN KETAT: Member hanya bisa merilis slot miliknya sendiri!
    if (slot.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke slot ini' })
    }

    if (slot.status === 'ended') {
      return res.status(400).json({ error: 'Slot kontak sudah tidak aktif' })
    }

    const updated = await prisma.contactSlot.update({
      where: { id: slotId },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    })

    await logActivity({
      userId,
      adminName: req.user.name,
      action: 'RELEASE_CONTACT_SLOT',
      target: `Slot #${slotId}`,
      details: `Member melepaskan slot batch #${slot.batchId}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    return res.status(200).json({
      message: 'Slot kontak berhasil dilepaskan',
      slot: updated,
    })
  } catch (error) {
    console.error('Error in releaseSlot:', error)
    return res.status(500).json({ error: 'Gagal melepaskan slot kontak' })
  }
}

/**
 * GET /api/member/devices
 * Daftar perangkat WhatsApp yang tertaut milik member
 */
async function getDevices(req, res) {
  try {
    const userId = req.user.id

    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        externalDeviceId: true,
        status: true,
        linkedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
    })

    return res.status(200).json({ devices })
  } catch (error) {
    console.error('Error in getDevices:', error)
    return res.status(500).json({ error: 'Gagal memuat data perangkat' })
  }
}

/**
 * POST /api/member/devices/link
 * Memulai proses penautan perangkat baru via adapter watsap
 */
async function linkDevice(req, res) {
  try {
    const userId = req.user.id
    const { phone } = req.body || {}
    let targetPhone = phone ? String(phone).trim() : null
    if (targetPhone) {
      const existing = await prisma.device.findFirst({
        where: { phone: targetPhone, deletedAt: null },
      })
      if (existing) {
        return res.status(409).json({ error: 'Nomor WhatsApp sudah tertaut pada perangkat lain' })
      }
    }

    // Panggil adapter watsap
    const sessionData = await watsap.createDevice({ userId, phone: targetPhone })

    // Buat entitas perangkat di database
    const device = await prisma.device.create({
      data: {
        userId,
        phone: targetPhone,
        externalDeviceId: sessionData.externalDeviceId,
        status: 'pending',
      },
    })

    return res.status(201).json({
      message: 'Sesi penautan perangkat berhasil dimulai',
      device: {
        id: device.id,
        externalDeviceId: device.externalDeviceId,
        qrCode: sessionData.qrCode,
        pairingCode: sessionData.pairingCode,
        status: device.status,
      },
    })
  } catch (error) {
    console.error('Error in linkDevice:', error)
    return res.status(500).json({ error: error.message || 'Gagal memulai penautan perangkat' })
  }
}

/**
 * GET /api/member/devices/:id/status
 * Polling status koneksi perangkat
 */
async function getDeviceStatus(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)

    if (isNaN(deviceId)) {
      return res.status(400).json({ error: 'ID perangkat tidak valid' })
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    }

    // Keamanan: wajib milik member sendiri
    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    // Cek status ke provider
    const statusData = await watsap.getStatus(device.externalDeviceId)

    let updatedDevice = device
    if (statusData.status !== device.status || (statusData.phone && !device.phone)) {
      updatedDevice = await prisma.device.update({
        where: { id: deviceId },
        data: {
          status: statusData.status,
          ...(statusData.phone ? { phone: statusData.phone } : {}),
          ...(statusData.status === 'connected' ? { linkedAt: device.linkedAt || new Date(), lastSeenAt: new Date() } : {}),
        },
      })
    }

    return res.status(200).json({
      id: updatedDevice.id,
      status: updatedDevice.status,
      phone: updatedDevice.phone,
      linkedAt: updatedDevice.linkedAt,
      lastSeenAt: updatedDevice.lastSeenAt,
    })
  } catch (error) {
    console.error('Error in getDeviceStatus:', error)
    return res.status(500).json({ error: 'Gagal memeriksa status perangkat' })
  }
}

/**
 * DELETE /api/member/devices/:id
 * Memutuskan koneksi perangkat
 */
async function disconnectDevice(req, res) {
  try {
    const userId = req.user.id
    const deviceId = parseInt(req.params.id, 10)

    if (isNaN(deviceId)) {
      return res.status(400).json({ error: 'ID perangkat tidak valid' })
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    if (!device) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' })
    }

    if (device.userId !== userId) {
      return res.status(403).json({ error: 'Akses ditolak: Bukan perangkat Anda' })
    }

    await watsap.disconnect(device.externalDeviceId)

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'disconnected',
        lastSeenAt: new Date(),
      },
    })

    return res.status(200).json({
      message: 'Perangkat berhasil diputuskan',
      device: updated,
    })
  } catch (error) {
    console.error('Error in disconnectDevice:', error)
    return res.status(500).json({ error: 'Gagal memutuskan perangkat' })
  }
}

/**
 * GET /api/member/performance
 * slotAktif, totalSent (all time), totalFailed (all time), linkedNumbers, avgPerDay, serta data 7 hari terakhir
 */
async function getPerformance(req, res) {
  try {
    const userId = req.user.id

    const [slotAktif, totalSent, totalFailed, linkedNumbers, firstLog] = await Promise.all([
      prisma.contactSlot.count({ where: { userId, status: 'active' } }),
      prisma.blastLog.count({ where: { userId, status: 'sent' } }),
      prisma.blastLog.count({ where: { userId, status: 'failed' } }),
      prisma.device.count({ where: { userId, status: 'connected' } }),
      prisma.blastLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ])

    // Hitung rata-rata per hari sejak log pertama (minimal 1 hari)
    const daysSinceFirst = firstLog
      ? Math.max(1, Math.ceil((Date.now() - new Date(firstLog.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
      : 1
    const avgPerDay = Math.round(totalSent / daysSinceFirst)

    // Data 7 hari terakhir untuk grafik mini
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const recentLogs = await prisma.blastLog.findMany({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { status: true, createdAt: true },
    })

    const daysMap = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      daysMap[key] = { date: key, sent: 0, failed: 0 }
    }

    recentLogs.forEach((l) => {
      const key = l.createdAt.toISOString().split('T')[0]
      if (daysMap[key]) {
        if (l.status === 'sent') daysMap[key].sent++
        else if (l.status === 'failed') daysMap[key].failed++
      }
    })

    return res.status(200).json({
      slotAktif,
      totalSent,
      totalFailed,
      linkedNumbers,
      avgPerDay,
      last7Days: Object.values(daysMap),
    })
  } catch (error) {
    console.error('Error in getPerformance:', error)
    return res.status(500).json({ error: 'Gagal memuat data performa' })
  }
}

/**
 * GET /api/member/earnings
 * saldo tersedia, total komisi, sedang diproses, total ditarik
 */
async function getEarnings(req, res) {
  try {
    const userId = req.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    })

    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId },
      select: { amount: true, status: true },
    })

    let sedangDiproses = 0
    let totalDitarik = 0

    withdrawals.forEach((w) => {
      if (w.status === 'pending') {
        sedangDiproses += w.amount
      } else if (w.status === 'approved' || w.status === 'success') {
        totalDitarik += w.amount
      }
    })

    const saldoTersedia = user?.balance || 0
    const totalKomisi = saldoTersedia + sedangDiproses + totalDitarik

    return res.status(200).json({
      availableBalance: saldoTersedia,
      totalCommission: totalKomisi,
      pendingWithdrawal: sedangDiproses,
      totalWithdrawn: totalDitarik,
    })
  } catch (error) {
    console.error('Error in getEarnings:', error)
    return res.status(500).json({ error: 'Gagal memuat ringkasan penghasilan' })
  }
}

/**
 * GET /api/member/withdraw/options
 * Preset aktif (urut sortOrder), min, max, allowCustom
 */
async function getWithdrawOptions(req, res) {
  try {
    const [presets, minSetting, maxSetting, customSetting] = await Promise.all([
      prisma.withdrawalPreset.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, amount: true, sortOrder: true },
      }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.min' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.max' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.allowCustom' } }),
    ])

    return res.status(200).json({
      presets,
      min: minSetting ? parseInt(minSetting.value, 10) : 20000,
      max: maxSetting ? parseInt(maxSetting.value, 10) : 5000000,
      allowCustom: customSetting ? customSetting.value === 'true' : true,
    })
  } catch (error) {
    console.error('Error in getWithdrawOptions:', error)
    return res.status(500).json({ error: 'Gagal memuat opsi penarikan' })
  }
}

// Zod Schema untuk pengajuan penarikan
const withdrawalSchema = z.object({
  amount: z.number({ invalid_type_error: 'Nominal wajib berupa angka' }).int('Nominal harus bilangan bulat').positive('Nominal harus lebih dari 0'),
  note: z.string().optional(),
})

/**
 * POST /api/member/withdrawals
 * Pengajuan penarikan dana dengan validasi server ketat & transaksi ACID
 * PRINSIP:
 * - Wajib menggunakan PayoutAccount milik member (mengabaikan input rekening dari body)
 * - Tolak bila belum ada rekening
 * - Tolak bila withdrawHoldUntil belum lewat
 * - Tolak bila Telegram belum terverifikasi (default: true via SiteSetting withdraw.requireTelegram)
 * - Snapshot jenis/bank/nama/4 digit akhir ke Withdrawal
 */
async function createWithdrawal(req, res) {
  try {
    const userId = req.user.id

    // Validasi Zod (hanya amount dan note, rekening diambil dari database)
    const parseResult = withdrawalSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: getZodErrorMessage(parseResult.error, 'Input penarikan tidak valid'),
      })
    }

    const { amount, note } = parseResult.data

    // Ambil data user beserta PayoutAccount dan pengaturan sistem
    const [user, minSetting, maxSetting, customSetting, activePresets, tgSetting] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { payoutAccount: true },
      }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.min' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.max' } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.allowCustom' } }),
      prisma.withdrawalPreset.findMany({ where: { isActive: true }, select: { amount: true } }),
      prisma.siteSetting.findUnique({ where: { key: 'withdraw.requireTelegram' } }),
    ])

    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' })
    }

    // 1. Validasi Keberadaan PayoutAccount yang terkunci
    const payout = user.payoutAccount
    if (!payout || !payout.lockedAt) {
      return res.status(400).json({
        error: 'Anda belum mendaftarkan rekening penarikan yang sah. Silakan simpan rekening di Pengaturan Akun terlebih dahulu.',
      })
    }

    // 2. Validasi withdrawHoldUntil (penahanan 24 jam setelah ganti rekening)
    if (payout.withdrawHoldUntil && new Date(payout.withdrawHoldUntil) > new Date()) {
      const holdDateStr = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(payout.withdrawHoldUntil))
      return res.status(403).json({
        error: `Penarikan dana ditahan hingga ${holdDateStr} demi keamanan setelah perubahan rekening.`,
        withdrawHoldUntil: payout.withdrawHoldUntil,
      })
    }

    // 3. Validasi Telegram Terverifikasi (default: true jika setting belum ada)
    const requireTelegram = tgSetting ? tgSetting.value === 'true' : true
    if (requireTelegram) {
      const isTgVerified = Boolean(user.telegramChatId && user.telegramVerifiedAt)
      if (!isTgVerified) {
        return res.status(403).json({
          error: 'Penarikan dana mewajibkan akun Telegram terverifikasi. Silakan hubungkan Telegram di menu Pengaturan Akun.',
        })
      }
    }

    const minAmount = minSetting ? parseInt(minSetting.value, 10) : 20000
    const maxAmount = maxSetting ? parseInt(maxSetting.value, 10) : 5000000
    const allowCustom = customSetting ? customSetting.value === 'true' : true

    // Validasi range min - max
    if (amount < minAmount) {
      return res.status(400).json({
        error: `Nominal penarikan minimal adalah Rp${minAmount.toLocaleString('id-ID')}`,
      })
    }

    if (amount > maxAmount) {
      return res.status(400).json({
        error: `Nominal penarikan maksimal adalah Rp${maxAmount.toLocaleString('id-ID')}`,
      })
    }

    // Jika allowCustom=false, nominal wajib cocok dengan salah satu preset aktif
    if (!allowCustom) {
      const allowedAmounts = activePresets.map((p) => p.amount)
      if (!allowedAmounts.includes(amount)) {
        return res.status(400).json({
          error: 'Penarikan kustom dinonaktifkan. Silakan pilih salah satu nominal preset yang tersedia.',
          allowedPresets: allowedAmounts,
        })
      }
    }

    // Snapshot rekening dari PayoutAccount (jenis/bank/nama/4 digit akhir)
    const bankSnapshot = `${payout.providerName} (${payout.type === 'ewallet' ? 'E-Wallet' : 'Bank'})`
    const maskedAccountNumber = `••••${payout.accountNumberLast4}`
    const accountNameSnapshot = payout.holderName

    // Eksekusi potong saldo & buat record withdrawal dalam SATU prisma.$transaction
    const result = await prisma.$transaction(async (tx) => {
      // Baca saldo terkini pengguna
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, balance: true, name: true, email: true },
      })

      if (!currentUser || currentUser.balance < amount) {
        throw new Error('Saldo tidak mencukupi untuk melakukan penarikan dana ini')
      }

      // Potong saldo pengguna
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: amount },
        },
      })

      // Buat rekaman Withdrawal dengan data snapshot
      const newWithdrawal = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          bank: bankSnapshot,
          accountNumber: maskedAccountNumber,
          accountName: accountNameSnapshot,
          note: note || null,
          status: 'pending',
        },
      })

      return { newWithdrawal, remainingBalance: updatedUser.balance }
    })

    await logActivity({
      userId,
      adminName: req.user.name,
      action: 'MEMBER_WITHDRAWAL_REQUEST',
      target: `Withdrawal #${result.newWithdrawal.id}`,
      details: `Pengajuan penarikan Rp${amount.toLocaleString('id-ID')} via ${bankSnapshot}`,
      ipAddress: getClientIp(req),
      status: 'success',
    })

    // Kirim notifikasi bot jika user memiliki Telegram terverifikasi
    if (user.telegramChatId && user.telegramVerifiedAt) {
      const amountStr = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(amount)

      await queueTelegramNotification(
        user.telegramChatId,
        `💳 <b>Pengajuan Penarikan Dana Diterima</b>\n\n` +
          `• ID Penarikan: <b>#${result.newWithdrawal.id}</b>\n` +
          `• Nominal: <b>${amountStr}</b>\n` +
          `• Rekening Tujuan: <b>${escapeHtml(bankSnapshot)}</b> (${maskedAccountNumber})\n` +
          `• Atas Nama: <b>${escapeHtml(accountNameSnapshot)}</b>\n\n` +
          `<i>Permintaan Anda sedang dalam antrean verifikasi tim admin finance.</i>`
      )
    }

    return res.status(201).json({
      message: 'Pengajuan penarikan dana berhasil dibuat',
      withdrawal: result.newWithdrawal,
      remainingBalance: result.remainingBalance,
    })
  } catch (error) {
    console.error('Error in createWithdrawal:', error)
    if (error.message.includes('Saldo tidak mencukupi')) {
      return res.status(400).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Terjadi kesalahan saat memproses penarikan dana' })
  }
}

/**
 * GET /api/member/withdrawals
 * Riwayat penarikan dengan filter status, rentang tanggal, paginasi
 */
async function getWithdrawals(req, res) {
  try {
    const userId = req.user.id
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 10))
    const skip = (pageNum - 1) * limitNum

    const where = { userId }

    if (status && ['pending', 'approved', 'rejected', 'success'].includes(status.toLowerCase())) {
      where.status = status.toLowerCase()
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    const [total, withdrawals] = await Promise.all([
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ])

    return res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      withdrawals: withdrawals.map((w) => ({
        ...w,
        adminNote: w.rejectionReason || w.note || null,
        method: w.bank || 'Bank Transfer',
        destination: w.accountNumber,
        destinationName: w.accountName,
      })),
    })
  } catch (error) {
    console.error('Error in getWithdrawals:', error)
    return res.status(500).json({ error: 'Gagal memuat riwayat penarikan' })
  }
}

/**
 * GET /api/member/team
 * Mengambil jaringan tim afiliasi / pertemanan yang mendaftar menggunakan kode referral pengguna
 */
async function getTeam(req, res) {
  try {
    const userId = req.user.id

    // Pastikan user memiliki referralCode, jika belum maka buatkan
    let currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        referralCode: true,
        referredById: true,
        referrer: {
          select: {
            id: true,
            name: true,
            username: true,
            createdAt: true,
          },
        },
      },
    })

    if (!currentUser.referralCode) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = 'AF'
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      while (await prisma.user.findUnique({ where: { referralCode: code } })) {
        code = 'AF'
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }
      }

      currentUser = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: {
          id: true,
          name: true,
          referralCode: true,
          referredById: true,
          referrer: {
            select: {
              id: true,
              name: true,
              username: true,
              createdAt: true,
            },
          },
        },
      })
    }

    // Ambil daftar teman yang mendaftar via kode referral user ini
    const friends = await prisma.user.findMany({
      where: { referredById: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        createdAt: true,
        devices: {
          select: { id: true, status: true, phone: true, label: true },
        },
        blastLogs: {
          select: { id: true, status: true },
        },
        contactSlots: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    let totalTeamDevices = 0
    let totalTeamMessages = 0

    const teamList = friends.map((f) => {
      const connectedDevices = f.devices.filter((d) => d.status === 'connected').length
      const successfulBlasts = f.blastLogs.filter((b) => b.status === 'sent').length
      const activeSlots = f.contactSlots.filter((s) => s.status === 'active').length

      totalTeamDevices += connectedDevices
      totalTeamMessages += successfulBlasts

      // Masking email untuk privasi: ab***@domain.com
      const emailParts = (f.email || '').split('@')
      let maskedEmail = f.email
      if (emailParts.length === 2) {
        const usernamePart = emailParts[0]
        const domainPart = emailParts[1]
        const visibleLen = Math.min(2, usernamePart.length)
        maskedEmail = `${usernamePart.slice(0, visibleLen)}***@${domainPart}`
      }

      const isActive = connectedDevices > 0 || activeSlots > 0

      return {
        id: f.id,
        name: f.name,
        username: f.username || null,
        maskedEmail,
        joinedAt: f.createdAt,
        activeDevices: connectedDevices,
        totalDevices: f.devices.length,
        totalBlasts: f.blastLogs.length,
        sentMessages: successfulBlasts,
        activeSlots,
        status: isActive ? 'active' : 'idle',
      }
    })

    // Tentukan origin host untuk tautan referral (utamakan APP_URL)
    const { APP_URL } = require('../config/appConfig')
    let baseUrl = APP_URL
    if (!baseUrl) {
      const origin = req.get('origin') || req.get('referer') || ''
      baseUrl = origin.replace(/\/+$/, '')
      if (!baseUrl) {
        const host = req.get('host') || 'localhost:5173'
        const protocol = req.protocol === 'https' ? 'https' : 'http'
        baseUrl = `${protocol}://${host}`
      }
      if (baseUrl.includes(':4000')) {
        baseUrl = baseUrl.replace(':4000', ':5173')
      } else if (baseUrl.includes(':4001')) {
        baseUrl = baseUrl.replace(':4001', ':5174')
      }
    }

    const referralLink = `${baseUrl}/register?ref=${currentUser.referralCode}`

    const stats = {
      totalFriends: friends.length,
      activeFriends: teamList.filter((f) => f.status === 'active').length,
      totalTeamDevices,
      totalTeamMessages,
    }

    return res.status(200).json({
      myReferralCode: currentUser.referralCode,
      referralLink,
      referrer: currentUser.referrer
        ? {
            name: currentUser.referrer.name,
            username: currentUser.referrer.username,
            joinedAt: currentUser.referrer.createdAt,
          }
        : null,
      stats,
      team: teamList,
    })
  } catch (error) {
    console.error('Error in getTeam:', error)
    return res.status(500).json({ error: 'Gagal memuat data tim afiliasi pertemanan' })
  }
}

module.exports = {
  getDashboard,
  getPoolBatches,
  claimBatch,
  releaseSlot,
  getDevices,
  linkDevice,
  getDeviceStatus,
  disconnectDevice,
  getPerformance,
  getEarnings,
  getWithdrawOptions,
  createWithdrawal,
  getWithdrawals,
  getTeam,
}
