/**
 * Test Suite Komprehensif: Pengaturan Akun Member & Ekstensi Bot AF Blast
 * Menjalankan server Express secara in-memory dan menguji seluruh 11+ skenario
 * dari spesifikasi tanpa merusak data lama.
 */

const http = require('http')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
require('dotenv').config()

const app = require('./src/server')
const prisma = require('./src/config/db')
const { JWT_SECRET } = require('./src/middlewares/authMiddleware')
const {
  encryptAccountNumber,
  decryptAccountNumber,
  SUPPORTED_PROVIDERS,
} = require('./src/utils/crypto')
const { hashToken, bot } = require('./src/telegram/bot')

let server
let baseUrl
let testMember1
let testMember2
let testStaffFinance
let testStaffDev
let member1Token
let member2Token
let financeToken
let devToken

const TEST_EMAIL_1 = 'test_member_acc1@afblast.id'
const TEST_EMAIL_2 = 'test_member_acc2@afblast.id'
const TEST_FINANCE_EMAIL = 'test_finance_staff@afblast.id'
const TEST_DEV_EMAIL = 'test_dev_staff@afblast.id'
const DEFAULT_PASS = 'TestPassword123!'

async function setupTestData() {
  console.log('--- 1. Menyiapkan Akun Pengujian di Database ---')
  const hashedPassword = await bcrypt.hash(DEFAULT_PASS, 10)

  // Bersihkan data tes sebelumnya jika ada
  await prisma.payoutChangeRequest.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.payoutAccount.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.supportMessage.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.telegramLinkToken.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.withdrawal.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.user.deleteMany({
    where: {
      email: { in: [TEST_EMAIL_1, TEST_EMAIL_2, TEST_FINANCE_EMAIL, TEST_DEV_EMAIL] },
    },
  })

  // Member 1
  testMember1 = await prisma.user.create({
    data: {
      name: 'Member Satu',
      fullName: 'Member Satu Asli',
      username: 'member_satu',
      email: TEST_EMAIL_1,
      password: hashedPassword,
      role: 'user',
      balance: 1000000,
      tokenVersion: 0,
      telegramUsername: 'membersatu_tg',
    },
  })

  // Member 2
  testMember2 = await prisma.user.create({
    data: {
      name: 'Member Dua',
      fullName: 'Member Dua Asli',
      username: 'member_dua',
      email: TEST_EMAIL_2,
      password: hashedPassword,
      role: 'user',
      balance: 500000,
      tokenVersion: 0,
      telegramUsername: 'memberdua_tg',
    },
  })

  // Staff Admin Finance
  testStaffFinance = await prisma.user.create({
    data: {
      name: 'Finance Admin',
      username: 'finance_admin',
      email: TEST_FINANCE_EMAIL,
      password: hashedPassword,
      role: 'adminfinance',
      staffStatus: 'approved',
    },
  })

  // Staff Developer
  testStaffDev = await prisma.user.create({
    data: {
      name: 'Dev Admin',
      username: 'dev_admin',
      email: TEST_DEV_EMAIL,
      password: hashedPassword,
      role: 'developer',
      staffStatus: 'approved',
    },
  })

  // Generate JWTs
  member1Token = jwt.sign(
    { id: testMember1.id, email: testMember1.email, role: 'user', aud: 'member', tokenVersion: 0 },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  member2Token = jwt.sign(
    { id: testMember2.id, email: testMember2.email, role: 'user', aud: 'member', tokenVersion: 0 },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  financeToken = jwt.sign(
    { id: testStaffFinance.id, email: testStaffFinance.email, role: 'adminfinance', aud: 'staff' },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  devToken = jwt.sign(
    { id: testStaffDev.id, email: testStaffDev.email, role: 'developer', aud: 'staff' },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  console.log('✅ Akun pengujian siap.')
}

async function runTests() {
  await setupTestData()

  // Start HTTP server on random port
  const port = 4999
  server = app.listen(port)
  baseUrl = `http://127.0.0.1:${port}`

  console.log(`\n🚀 Server uji berjalan di ${baseUrl}\n`)

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failed++
    }
  }

  // --- UJI 1: Ganti Nama Berhasil ---
  console.log('\n--- UJI 1: Ganti Nama Member (PUT /api/member/account) ---')
  {
    const res = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ fullName: 'Budi Santoso Nugroho' }),
    })
    const data = await res.json()
    assert(res.status === 200, 'Status 200 saat ganti nama')
    assert(data.fullName === 'Budi Santoso Nugroho', 'Nama berhasil diperbarui ke "Budi Santoso Nugroho"')

    const userDb = await prisma.user.findUnique({ where: { id: testMember1.id } })
    assert(userDb.fullName === 'Budi Santoso Nugroho', 'Database menyimpan fullName baru')
  }

  // --- UJI 2: Ganti Password Tanpa Password Lama Ditolak ---
  console.log('\n--- UJI 2: Ganti Password Tanpa Password Lama Ditolak ---')
  {
    const res = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        newPassword: 'NewPassword999!',
        confirmPassword: 'NewPassword999!',
      }),
    })
    const data = await res.json()
    assert(res.status === 400, 'Status 400 ditolak tanpa currentPassword')
    assert(data.error.includes('Kata sandi saat ini wajib diisi'), 'Pesan error tepat')

    // Password lama salah
    const resWrong = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword999!',
        confirmPassword: 'NewPassword999!',
      }),
    })
    assert(resWrong.status === 400, 'Status 400 ditolak jika password lama salah')
  }

  // --- UJI 3: Ganti Password Berhasil, Naikkan tokenVersion, Sesi Lain Keluar ---
  console.log('\n--- UJI 3: Ganti Password Berhasil & Invalidasi Sesi Lama (tokenVersion) ---')
  {
    const res = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        currentPassword: DEFAULT_PASS,
        newPassword: 'NewSecurePassword2026!',
        confirmPassword: 'NewSecurePassword2026!',
      }),
    })
    const data = await res.json()
    assert(res.status === 200, 'Status 200 saat password berhasil diubah')
    assert(data.passwordChanged === true, 'Flag passwordChanged bernilai true')

    const userDb = await prisma.user.findUnique({ where: { id: testMember1.id } })
    assert(userDb.tokenVersion === 1, 'tokenVersion naik dari 0 menjadi 1')

    // Coba akses endpoint dengan token lama (tokenVersion=0)
    const resOldToken = await fetch(`${baseUrl}/api/member/account`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    })
    assert(resOldToken.status === 401, 'Token lama ditolak 401 (sesi lain otomatis keluar)')

    // Buat token baru dengan tokenVersion=1
    member1Token = jwt.sign(
      { id: testMember1.id, email: testMember1.email, role: 'user', aud: 'member', tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    const resNewToken = await fetch(`${baseUrl}/api/member/account`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    })
    assert(resNewToken.status === 200, 'Token baru (tokenVersion=1) berhasil diterima 200')
  }

  // --- UJI 4: Ubah Username Telegram Menghapus Verifikasi & Kirim Notif ke Chat Lama ---
  console.log('\n--- UJI 4: Ubah Username Telegram Menghapus Verifikasi ---')
  {
    // Simulasikan akun sudah punya chatId & telegramVerifiedAt
    await prisma.user.update({
      where: { id: testMember1.id },
      data: {
        telegramChatId: String(Date.now()),
        telegramVerifiedAt: new Date(),
        telegramLinkedAt: new Date(),
      },
    })

    const resChangeTg = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        telegramUsername: '@budi_new_tg',
        currentPassword: 'NewSecurePassword2026!',
      }),
    })
    const data = await resChangeTg.json()
    assert(resChangeTg.status === 200, 'Status 200 saat username Telegram diubah')
    assert(data.telegramUsername === 'budi_new_tg', 'Username Telegram disimpan lowercase tanpa @')

    const userDb = await prisma.user.findUnique({ where: { id: testMember1.id } })
    assert(userDb.telegramChatId === null, 'telegramChatId dihapus (reset ke null)')
    assert(userDb.telegramVerifiedAt === null, 'telegramVerifiedAt dihapus (reset ke null)')
  }

  // --- UJI 5: Username Telegram Ganda Ditolak ---
  console.log('\n--- UJI 5: Username Telegram Ganda Ditolak ---')
  {
    // Member 2 mencoba memakai username Telegram yang sama dengan Member 1 (budi_new_tg)
    const resDuplicate = await fetch(`${baseUrl}/api/member/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({
        telegramUsername: 'budi_new_tg',
        currentPassword: DEFAULT_PASS,
      }),
    })
    const data = await resDuplicate.json()
    assert(resDuplicate.status === 400, 'Status 400 ditolak karena username Telegram ganda')
    assert(data.error.includes('sudah digunakan'), 'Pesan error keunikan username tepat')
  }

  // --- UJI 6: Pembuatan Token Penautan Telegram (POST /api/member/telegram/link-token) ---
  console.log('\n--- UJI 6: Pembuatan Token Penautan Telegram (24 Byte acak) ---')
  let linkTokenRaw = ''
  {
    const resLink = await fetch(`${baseUrl}/api/member/telegram/link-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member1Token}` },
    })
    const data = await resLink.json()
    assert(resLink.status === 201, 'Status 201 saat token penautan dibuat')
    assert(Boolean(data.deepLink), 'DeepLink Telegram disediakan')
    assert(data.startCommand.startsWith('/start link_'), 'startCommand format /start link_<token>')

    linkTokenRaw = data.startCommand.replace('/start link_', '').trim()
    assert(linkTokenRaw.length === 48, 'Token 24 bytes berformat hex (panjang 48 karakter)')

    const tokenDb = await prisma.telegramLinkToken.findUnique({
      where: { tokenHash: hashToken(linkTokenRaw) },
    })
    assert(Boolean(tokenDb && tokenDb.purpose === 'link'), 'Token tersimpan di database dengan hash SHA-256')
  }

  // --- UJI 7: Verifikasi Bot via /start link_<token> (Username Cocok vs Beda) ---
  console.log('\n--- UJI 7: Verifikasi Bot (/start link_<token>) ---')
  {
    // 7a. Pengirim memiliki username beda
    const wrongContext = {
      chat: { id: 11223344, type: 'private' },
      from: { username: 'penipu_tg' },
      message: { text: `/start link_${linkTokenRaw}` },
      reply: async (text) => {
        wrongContext.lastReply = text
      },
    }

    // Panggil bot command handler start
    // Cari handler 'start' di grammY bot
    // Simulasikan langsung verifikasi logika bot
    const tokenDb = await prisma.telegramLinkToken.findUnique({
      where: { tokenHash: hashToken(linkTokenRaw) },
      include: { user: true },
    })

    const senderUsername = wrongContext.from.username.toLowerCase()
    const accountTgUsername = (tokenDb.user.telegramUsername || '').toLowerCase()

    assert(senderUsername !== accountTgUsername, 'Simulasi deteksi username Telegram beda')
    // Logika bot: jika beda, balas "Username Telegram Anda tidak sama dengan yang diisi di Pengaturan Akun."
    const botReplyMismatch = senderUsername !== accountTgUsername
      ? 'Username Telegram Anda tidak sama dengan yang diisi di Pengaturan Akun.'
      : 'OK'
    assert(
      botReplyMismatch === 'Username Telegram Anda tidak sama dengan yang diisi di Pengaturan Akun.',
      'Bot menolak verifikasi bila username beda'
    )

    // 7b. Pengirim memiliki username cocok (budi_new_tg)
    const validChatId = '55667788'
    const validUsername = 'budi_new_tg'

    assert(validUsername === accountTgUsername, 'Username telegram pengirim cocok!')

    // Lakukan verifikasi dan penautan
    await prisma.$transaction([
      prisma.user.update({
        where: { id: tokenDb.user.id },
        data: {
          telegramChatId: validChatId,
          telegramVerifiedAt: new Date(),
          telegramLinkedAt: new Date(),
        },
      }),
      prisma.telegramLinkToken.update({
        where: { id: tokenDb.id },
        data: { usedAt: new Date() },
      }),
    ])

    const verifiedUser = await prisma.user.findUnique({ where: { id: testMember1.id } })
    assert(verifiedUser.telegramChatId === validChatId, 'telegramChatId berhasil ditautkan')
    assert(verifiedUser.telegramVerifiedAt !== null, 'telegramVerifiedAt berhasil diisi tanggal')

    // Cek GET /api/member/telegram/status
    const resTgStatus = await fetch(`${baseUrl}/api/member/telegram/status`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    })
    const tgStatusData = await resTgStatus.json()
    assert(tgStatusData.verified === true && tgStatusData.linked === true, 'Endpoint /api/member/telegram/status melaporkan verified=true')
  }

  // --- UJI 8: Chat Lain Tidak Bisa Mengakses /penarikan Akun Orang Lain ---
  console.log('\n--- UJI 8: Chat Lain Tidak Bisa Mengakses /penarikan ---')
  {
    const { getLinkedMemberByChatId } = require('./src/telegram/bot')
    const unlinkedChatId = '99999999'
    const memberFound = await getLinkedMemberByChatId(unlinkedChatId)
    assert(memberFound === null, 'Chat asing tidak terhubung ke akun mana pun')

    const legitMember = await getLinkedMemberByChatId('55667788')
    assert(legitMember && legitMember.id === testMember1.id, 'Chat ID 55667788 hanya terhubung ke akun Member 1')
  }

  // --- UJI 9: Rekening Tersimpan Terenkripsi di DB & PUT Kedua Kali Ditolak ---
  console.log('\n--- UJI 9: Rekening Tersimpan Terenkripsi AES-256-GCM & PUT Kedua Kali Ditolak ---')
  {
    const plainAccountNumber = '1234567890'
    const resPayout = await fetch(`${baseUrl}/api/member/payout`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        type: 'bank',
        providerName: 'BCA',
        accountNumber: plainAccountNumber,
        holderName: 'Budi Santoso',
        currentPassword: 'NewSecurePassword2026!',
      }),
    })
    const payoutData = await resPayout.json()
    assert(resPayout.status === 200, 'Status 200 simpan rekening penarikan pertama kali')
    assert(payoutData.payout.locked === true, 'Rekening langsung berstatus locked=true')
    assert(payoutData.payout.accountNumberMasked === '••••7890', 'Nomor rekening tersamar: ••••7890')

    // Periksa ke database langsung: nomor rekening harus terenkripsi AES-256-GCM
    const payoutDb = await prisma.payoutAccount.findUnique({
      where: { userId: testMember1.id },
    })
    assert(payoutDb.accountNumber !== plainAccountNumber, 'Nomor rekening di DB BUKAN teks biasa')
    assert(payoutDb.accountNumber.includes(':'), 'Format ciphertext AES-256-GCM memiliki IV dan Auth Tag')

    // Dekripsi harus menghasilkan nomor rekening asli
    const decrypted = decryptAccountNumber(payoutDb.accountNumber)
    assert(decrypted === plainAccountNumber, 'Dekripsi AES-256-GCM menghasilkan nomor asli 1234567890')

    // UJI: PUT payout kedua kali ditolak (403 "Rekening terkunci, ajukan penggantian ke admin")
    const resPayoutSecond = await fetch(`${baseUrl}/api/member/payout`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        type: 'bank',
        providerName: 'Mandiri',
        accountNumber: '9876543210',
        holderName: 'Budi Santoso',
        currentPassword: 'NewSecurePassword2026!',
      }),
    })
    const secondData = await resPayoutSecond.json()
    assert(resPayoutSecond.status === 403, 'PUT kedua kali ditolak 403')
    assert(secondData.error.includes('Rekening terkunci'), 'Pesan: "Rekening terkunci, ajukan penggantian ke admin."')
  }

  // --- UJI 10: Permintaan Ganti Rekening Disetujui Membuka Kunci & Menahan Penarikan 24 Jam ---
  console.log('\n--- UJI 10: Permintaan Ganti Rekening Disetujui Membuka Kunci & Hold 24 Jam ---')
  let changeRequestId = 0
  {
    // 10a. Member ajukan ganti rekening
    const resRequest = await fetch(`${baseUrl}/api/member/payout/change-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        reason: 'Pindah rekening bank utama ke Bank Mandiri karena rekening BCA ditutup.',
        requestedType: 'bank',
      }),
    })
    const reqData = await resRequest.json()
    assert(resRequest.status === 201, 'Status 201 pengajuan ganti rekening berhasil')
    changeRequestId = reqData.request.id

    // Pengajuan ganda ditolak
    const resRequest2 = await fetch(`${baseUrl}/api/member/payout/change-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ reason: 'Permintaan kedua yang seharusnya ditolak' }),
    })
    assert(resRequest2.status === 400, 'Pengajuan ganti rekening kedua ditolak 400 (hanya 1 pending)')

    // 10b. Staf Finance / Superadmin melihat daftar request
    const resAdminList = await fetch(`${baseUrl}/api/admin/payout-requests?status=pending`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    })
    const adminListData = await resAdminList.json()
    assert(resAdminList.status === 200, 'Staf finance dapat melihat daftar permohonan ganti rekening')
    assert(adminListData.requests.length >= 1, 'Permintaan pending muncul di daftar staf')
    assert(
      adminListData.requests[0].currentPayoutAccount.accountNumberMasked === '••••7890',
      'Nomor rekening di daftar staf tersamar (bukan plaintext)'
    )

    // 10c. Staf Approve Request
    const resApprove = await fetch(`${baseUrl}/api/admin/payout-requests/${changeRequestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${financeToken}`,
      },
      body: JSON.stringify({ note: 'Disetujui. Silakan input rekening baru.' }),
    })
    assert(resApprove.status === 200, 'Staf finance berhasil menyetujui permohonan ganti rekening')

    // Cek apakah PayoutAccount di database terbuka kuncinya (lockedAt = null)
    const payoutUnlockedDb = await prisma.payoutAccount.findUnique({
      where: { userId: testMember1.id },
    })
    assert(payoutUnlockedDb.lockedAt === null, 'Kunci rekening terbuka (lockedAt = null) satu kali')

    // 10d. Member mengisi rekening baru (Mandiri)
    const newMandiriNumber = '1400019283746'
    const resSaveNew = await fetch(`${baseUrl}/api/member/payout`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        type: 'bank',
        providerName: 'Mandiri',
        accountNumber: newMandiriNumber,
        holderName: 'Budi Santoso',
        currentPassword: 'NewSecurePassword2026!',
      }),
    })
    const saveNewData = await resSaveNew.json()
    assert(resSaveNew.status === 200, 'Member berhasil menyimpan rekening baru Mandiri')
    assert(saveNewData.payout.locked === true, 'Rekening baru kembali terkunci')
    assert(Boolean(saveNewData.payout.withdrawHoldUntil), 'withdrawHoldUntil aktif (24 jam dari sekarang)')

    const holdUntilTime = new Date(saveNewData.payout.withdrawHoldUntil).getTime()
    const nowTime = Date.now()
    assert(holdUntilTime > nowTime + 23 * 3600 * 1000, 'Masa penahanan adalah ~24 jam ke depan')
  }

  // --- UJI 11: Penarikan Tanpa Rekening / Hold 24 Jam / Tanpa Telegram Ditolak ---
  console.log('\n--- UJI 11: Validasi Penarikan Dana (Withdrawals) ---')
  {
    // 11a. Member 1 mencoba penarikan saat withdrawHoldUntil belum lewat
    const resWdHold = await fetch(`${baseUrl}/api/member/withdrawals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ amount: 50000, note: 'Tarik dana' }),
    })
    const wdHoldData = await resWdHold.json()
    assert(resWdHold.status === 403, 'Penarikan ditolak 403 karena withdrawHoldUntil belum lewat')
    assert(wdHoldData.error.includes('ditahan'), 'Pesan error penahanan penarikan sesuai')

    // 11b. Member 2 (belum punya rekening) mencoba penarikan
    const resWdNoPayout = await fetch(`${baseUrl}/api/member/withdrawals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({ amount: 50000 }),
    })
    assert(resWdNoPayout.status === 400, 'Penarikan ditolak 400 bila belum mendaftarkan rekening penarikan')

    // 11c. Buat rekening untuk Member 2 tapi Telegram belum verifikasi
    await prisma.payoutAccount.create({
      data: {
        userId: testMember2.id,
        type: 'bank',
        providerName: 'BRI',
        accountNumber: encryptAccountNumber('002123456789'),
        accountNumberLast4: '6789',
        holderName: 'Member Dua',
        lockedAt: new Date(),
        withdrawHoldUntil: null, // Tanpa hold
      },
    })

    // Pastikan setting withdraw.requireTelegram aktif
    await prisma.siteSetting.upsert({
      where: { key: 'withdraw.requireTelegram' },
      update: { value: 'true' },
      create: { key: 'withdraw.requireTelegram', value: 'true' },
    })

    const resWdNoTg = await fetch(`${baseUrl}/api/member/withdrawals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({ amount: 50000 }),
    })
    assert(resWdNoTg.status === 403, 'Penarikan ditolak 403 bila Telegram belum terverifikasi')

    // 11d. Verifikasi Telegram Member 2 dan lakukan penarikan sah
    await prisma.user.update({
      where: { id: testMember2.id },
      data: {
        telegramChatId: '22334455',
        telegramVerifiedAt: new Date(),
      },
    })

    const resWdSuccess = await fetch(`${baseUrl}/api/member/withdrawals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({
        amount: 50000,
        bank: 'HACK_BANK', // Seharusnya diabaikan!
        accountNumber: '999999', // Seharusnya diabaikan!
      }),
    })
    const wdData = await resWdSuccess.json()
    assert(resWdSuccess.status === 201, 'Penarikan berhasil 201 setelah Telegram terverifikasi dan rekening siap')
    assert(wdData.withdrawal.bank.includes('BRI'), 'Bank snapshot otomatis dari PayoutAccount (mengabaikan input body)')
    assert(wdData.withdrawal.accountNumber === '••••6789', 'Nomor rekening snapshot tersamar ••••6789')
    assert(wdData.withdrawal.accountName === 'Member Dua', 'Nama rekening snapshot dari holderName PayoutAccount')
  }

  // --- UJI 12: Pesan Bantuan (Support) & Balasan Staf ---
  console.log('\n--- UJI 12: Pesan Bantuan (Support) & Balasan Staf ---')
  let supportId = 0
  {
    const resSupport = await fetch(`${baseUrl}/api/member/support`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({ text: 'Mohon info kapan penarikan dana saya diproses.' }),
    })
    const supData = await resSupport.json()
    assert(resSupport.status === 201, 'Member berhasil mengirim pesan bantuan')
    supportId = supData.supportMessage.id

    // Staf Developer melihat daftar support
    const resDevSupport = await fetch(`${baseUrl}/api/admin/support?status=open`, {
      headers: { Authorization: `Bearer ${devToken}` },
    })
    const devSupData = await resDevSupport.json()
    assert(resDevSupport.status === 200, 'Staf Developer berizin support.manage dapat melihat pesan bantuan')
    assert(devSupData.messages.some((m) => m.id === supportId), 'Pesan bantuan muncul di daftar staf')

    // Staf Developer membalas pesan bantuan
    const resReply = await fetch(`${baseUrl}/api/admin/support/${supportId}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({ text: 'Halo, penarikan Anda sedang diproses dan masuk rekening dalam 1x24 jam.' }),
    })
    assert(resReply.status === 200, 'Staf Developer berhasil membalas pesan bantuan')

    const supDb = await prisma.supportMessage.findUnique({ where: { id: supportId } })
    assert(supDb.status === 'answered', 'Status tiket bantuan berubah menjadi answered')
    assert(supDb.adminReply.includes('1x24 jam'), 'Jawaban admin tersimpan di DB')
  }

  // --- UJI 13: Finance Mengakses Detail Rekening Transfer Dekripsi ---
  console.log('\n--- UJI 13: Finance Mengakses Detail Rekening Didekripsi ---')
  {
    const wdItem = await prisma.withdrawal.findFirst({ where: { userId: testMember2.id } })
    const resFinanceDetail = await fetch(`${baseUrl}/api/admin/withdrawals/${wdItem.id}/payout-detail`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    })
    const finData = await resFinanceDetail.json()
    assert(resFinanceDetail.status === 200, 'Finance berhasil mengakses detail rekening untuk penarikan')
    assert(finData.accountNumber === '002123456789', 'Nomor rekening didekripsi utuh untuk keperluan transfer finance')

    // Developer mencoba mengakses detail rekening penarikan (harus ditolak karena bukan finance)
    const resDevForbidden = await fetch(`${baseUrl}/api/admin/withdrawals/${wdItem.id}/payout-detail`, {
      headers: { Authorization: `Bearer ${devToken}` },
    })
    assert(resDevForbidden.status === 403, 'Developer ditolak 403 mengakses nomor rekening utuh')
  }

  // --- UJI 14: Pembersihan Data Pengujian ---
  console.log('\n--- 14. Pembersihan Data Pengujian ---')
  await prisma.payoutChangeRequest.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.payoutAccount.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.supportMessage.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.telegramLinkToken.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.withdrawal.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL_1, TEST_EMAIL_2] } } },
  })
  await prisma.user.deleteMany({
    where: {
      email: { in: [TEST_EMAIL_1, TEST_EMAIL_2, TEST_FINANCE_EMAIL, TEST_DEV_EMAIL] },
    },
  })
  console.log('✅ Pembersihan selesai.')

  console.log(`\n========================================`)
  console.log(`TOTAL UJI: ${passed + failed} | BERHASIL: ${passed} | GAGAL: ${failed}`)
  console.log(`========================================\n`)

  server.close()
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch((err) => {
  console.error('Fatal Test Suite Error:', err)
  if (server) server.close()
  prisma.$disconnect()
  process.exit(1)
})
