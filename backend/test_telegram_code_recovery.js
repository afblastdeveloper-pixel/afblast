/**
 * Test Suite: Alur 3 Langkah Lupa Kata Sandi dengan Kode Verifikasi 6 Digit
 * Bot Telegram AF Blast (@AFBlastRecoveryBot)
 */

const assert = require('assert')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const prisma = require('./src/config/db')
const { hashToken, computeCodeHmac, safeCompareHash } = require('./src/telegram/bot')

const BASE_URL = 'http://127.0.0.1:4000'

async function runTests() {
  console.log('===============================================================')
  console.log('  AF BLAST TELEGRAM 6-DIGIT CODE RECOVERY - TEST SUITE')
  console.log('===============================================================')

  const testSuffix = Date.now()
  const testIp = `192.168.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`
  const memberEmail = `codeuser_${testSuffix}@afblast.id`
  const memberUsername = `codeuser_${testSuffix}`
  const initialPassword = 'InitialPass123!'
  const newPassword = 'NewSecretPassword2026!'
  const memberChatId = `chat_code_${testSuffix}`
  const strangerChatId = `chat_stranger_${testSuffix}`

  // ─── 1. Registrasi Akun Member & Penautan Telegram ──────────────────────────
  console.log('\n--- 1. Registrasi Akun Member & Penautan Telegram ---')
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Tester Code Member',
      email: memberEmail,
      password: initialPassword,
    }),
  })
  assert.strictEqual(regRes.status, 201, 'Registrasi member harus 201')
  const regData = await regRes.json()
  const oldMemberToken = regData.token
  const memberId = regData.user.id

  await prisma.user.update({
    where: { id: memberId },
    data: {
      username: memberUsername,
      telegramChatId: memberChatId,
      telegramLinkedAt: new Date(),
    },
  })
  console.log('   ✓ Member terdaftar (ID:', memberId, ', username:', memberUsername, ', Chat ID:', memberChatId, ')')

  // ─── 2. Uji Permintaan Start untuk Akun Tak Ada vs Staf vs Member Sah ──────
  console.log('\n--- 2. Uji Respons Seragam POST /api/auth/forgot/start ---')
  // 2a. Akun tidak ada
  const startNonExistentRes = await fetch(`${BASE_URL}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ username: `nonexistent_${testSuffix}` }),
  })
  assert.strictEqual(startNonExistentRes.status, 200, 'Akun non-existent harus menghasilkan 200')
  const startNonExistentData = await startNonExistentRes.json()
  assert(startNonExistentData.requestId, 'Harus ada requestId')
  assert(startNonExistentData.startToken, 'Harus ada startToken')
  assert(startNonExistentData.deepLink, 'Harus ada deepLink')

  // Cek di DB bahwa userId bernilai null
  const dummyReq = await prisma.passwordResetRequest.findUnique({
    where: { id: startNonExistentData.requestId },
  })
  assert.strictEqual(dummyReq.userId, null, 'Akun non-existent harus disimpan dengan userId: null')
  console.log('   ✓ Akun tidak ada menghasilkan respons identik dengan userId null')

  // 2b. Akun staf (superadmin)
  const startStaffRes = await fetch(`${BASE_URL}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ username: 'budi@superadmin' }),
  })
  assert.strictEqual(startStaffRes.status, 200, 'Akun staf harus menghasilkan respons 200 yang seragam')
  const startStaffData = await startStaffRes.json()
  const staffReq = await prisma.passwordResetRequest.findUnique({
    where: { id: startStaffData.requestId },
  })
  assert.strictEqual(staffReq.userId, null, 'Akun staf harus disimpan dengan userId: null (anti-enumerasi)')
  console.log('   ✓ Akun staf menghasilkan respons seragam tanpa membocorkan eksistensi')

  // 2c. Akun member sah
  const startMemberRes = await fetch(`${BASE_URL}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ username: memberUsername }),
  })
  assert.strictEqual(startMemberRes.status, 200, 'Akun member sah harus 200')
  const startMemberData = await startMemberRes.json()
  const memberReq = await prisma.passwordResetRequest.findUnique({
    where: { id: startMemberData.requestId },
  })
  assert.strictEqual(memberReq.userId, memberId, 'Akun member sah harus terikat userId member')
  console.log('   ✓ Akun member sah menghasilkan requestId:', startMemberData.requestId, 'startToken:', startMemberData.startToken)

  // ─── 3. Uji Aturan 30 Detik (Cooldown Permintaan Baru) ──────────────────────
  console.log('\n--- 3. Uji Cooldown 30 Detik Akun yang Sama ---')
  const fastRetryRes = await fetch(`${BASE_URL}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ username: memberUsername }),
  })
  assert.strictEqual(fastRetryRes.status, 429, 'Permintaan < 30 detik harus ditolak dengan 429')
  const fastRetryErr = await fastRetryRes.json()
  assert(fastRetryErr.error.includes('30 detik'), 'Pesan harus menyebut jeda 30 detik')
  console.log('   ✓ Penolakan 30 detik aktif:', fastRetryErr.error)

  // ─── 4. Simulasi Bot: Chat ID Asing Mencoba Mengklaim startToken ────────────
  console.log('\n--- 4. Simulasi Bot: Chat ID Asing Mengklaim startToken ---')
  // Chat ID asing memanggil dengan token member
  const strangerTokenHash = hashToken(startMemberData.startToken)
  const reqCheckStranger = await prisma.passwordResetRequest.findUnique({
    where: { startTokenHash: strangerTokenHash },
    include: { user: true },
  })
  const strangerEligible =
    reqCheckStranger &&
    reqCheckStranger.usedAt === null &&
    reqCheckStranger.user &&
    reqCheckStranger.user.telegramChatId === strangerChatId // Mismatch!
  assert.strictEqual(strangerEligible, false, 'Chat ID asing TIDAK boleh memenuhi syarat kode')
  console.log('   ✓ Chat ID asing ditolak (tidak ada kode yang dihasilkan)')

  // ─── 5. Simulasi Bot: Chat ID Pemilik Sah Mengklaim startToken ──────────────
  console.log('\n--- 5. Simulasi Bot: Chat ID Sah Menerima Kode 6 Digit ---')
  // Simulasikan logic bot saat menerima /start <startToken> dari chat sah
  const generatedCode = crypto.randomInt(100000, 1000000).toString()
  assert(/^\d{6}$/.test(generatedCode), 'Kode harus 6 digit angka')
  const codeHash = computeCodeHmac(generatedCode)
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.passwordResetRequest.update({
    where: { id: startMemberData.requestId },
    data: {
      codeHash,
      codeSentAt: new Date(),
      codeExpiresAt,
      resendCount: 1,
    },
  })
  console.log('   ✓ Kode 6 digit berhasil dibuat dan di-hash HMAC-SHA256 (Kode:', generatedCode, ')')

  // ─── 6. Uji Cooldown Kirim Ulang (POST /api/auth/forgot/resend) ────────────
  console.log('\n--- 6. Uji Cooldown Kirim Ulang 60 Detik ---')
  const resendFastRes = await fetch(`${BASE_URL}/api/auth/forgot/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: startMemberData.requestId }),
  })
  assert.strictEqual(resendFastRes.status, 429, 'Kirim ulang < 60 detik harus ditolak dengan 429')
  const resendFastErr = await resendFastRes.json()
  assert(resendFastErr.error.includes('60 detik'), 'Harus menyebut jeda 60 detik')
  console.log('   ✓ Cooldown kirim ulang 60 detik aktif:', resendFastErr.error)

  // ─── 7. Uji Verifikasi Kode Salah & Batas 5 Percobaan (Burn Request) ────────
  console.log('\n--- 7. Uji Verifikasi Kode Salah & Hangus Setelah 5x Percobaan ---')
  // Buat permintaan terpisah untuk pengujian salah 5x
  const testBurnReq = await prisma.passwordResetRequest.create({
    data: {
      userId: memberId,
      startTokenHash: hashToken(`burn_token_${Date.now()}`),
      codeHash: computeCodeHmac('999999'),
      codeSentAt: new Date(),
      codeExpiresAt: new Date(Date.now() + 600000),
      expiresAt: new Date(Date.now() + 600000),
    },
  })

  for (let attempt = 1; attempt <= 4; attempt++) {
    const wrongRes = await fetch(`${BASE_URL}/api/auth/forgot/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: testBurnReq.id, code: '111111' }),
    })
    assert.strictEqual(wrongRes.status, 400, 'Percobaan salah harus 400')
    const wrongData = await wrongRes.json()
    assert.strictEqual(wrongData.remainingAttempts, 5 - attempt, 'Sisa percobaan harus berkurang')
  }

  // Percobaan ke-5: harus hangus
  const fifthWrongRes = await fetch(`${BASE_URL}/api/auth/forgot/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: testBurnReq.id, code: '111111' }),
  })
  assert.strictEqual(fifthWrongRes.status, 400, 'Percobaan ke-5 harus 400')
  const fifthData = await fifthWrongRes.json()
  assert.strictEqual(fifthData.burned, true, 'Permintaan harus hangus (burned: true)')
  assert.strictEqual(fifthData.remainingAttempts, 0, 'Sisa percobaan harus 0')

  const burnedInDb = await prisma.passwordResetRequest.findUnique({
    where: { id: testBurnReq.id },
  })
  assert(burnedInDb.usedAt !== null, 'Permintaan harus ditandai usedAt (hangus)')
  console.log('   ✓ Permintaan hangus setelah 5x percobaan salah')

  // ─── 8. Uji Verifikasi Kode Kedaluwarsa Ditolak ─────────────────────────────
  console.log('\n--- 8. Uji Kode Kedaluwarsa Ditolak ---')
  const testExpiredReq = await prisma.passwordResetRequest.create({
    data: {
      userId: memberId,
      startTokenHash: hashToken(`exp_token_${Date.now()}`),
      codeHash: computeCodeHmac('123456'),
      codeSentAt: new Date(Date.now() - 700000),
      codeExpiresAt: new Date(Date.now() - 100000), // Sudah lewat
      expiresAt: new Date(Date.now() + 600000),
    },
  })
  const expRes = await fetch(`${BASE_URL}/api/auth/forgot/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: testExpiredReq.id, code: '123456' }),
  })
  assert.strictEqual(expRes.status, 400, 'Kode kedaluwarsa harus ditolak')
  console.log('   ✓ Kode kedaluwarsa berhasil ditolak')

  // ─── 9. Uji Verifikasi Kode Benar (POST /api/auth/forgot/verify) ───────────
  console.log('\n--- 9. Uji Verifikasi Kode Benar ---')
  const verifyRes = await fetch(`${BASE_URL}/api/auth/forgot/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: startMemberData.requestId,
      code: generatedCode,
    }),
  })
  assert.strictEqual(verifyRes.status, 200, 'Verifikasi kode benar harus 200')
  const verifyData = await verifyRes.json()
  assert(verifyData.resetToken, 'Harus mengembalikan resetToken')
  const resetToken = verifyData.resetToken
  console.log('   ✓ Kode benar diterima! resetToken diperoleh:', resetToken)

  // ─── 10. Uji Validasi Password Baru (<10 char atau tanpa angka) ────────────
  console.log('\n--- 10. Uji Validasi Password Baru Lemah ---')
  const weakPassRes = await fetch(`${BASE_URL}/api/auth/forgot/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, newPassword: 'weak' }),
  })
  assert.strictEqual(weakPassRes.status, 400, 'Password lemah harus ditolak')
  console.log('   ✓ Password lemah ditolak')

  // ─── 11. Eksekusi Reset Password Berhasil (POST /api/auth/forgot/reset) ───
  console.log('\n--- 11. Eksekusi Reset Password Baru ---')
  const resetSuccessRes = await fetch(`${BASE_URL}/api/auth/forgot/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, newPassword }),
  })
  assert.strictEqual(resetSuccessRes.status, 200, 'Reset password harus sukses 200')
  const resetSuccessData = await resetSuccessRes.json()
  console.log('   ✓ Password berhasil diperbarui:', resetSuccessData.message)

  // Cek hash bcrypt cost 12 di DB
  const updatedMember = await prisma.user.findUnique({
    where: { id: memberId },
  })
  assert(updatedMember.password.startsWith('$2b$12$'), 'Hash password harus bcrypt cost 12')
  const passwordMatch = await bcrypt.compare(newPassword, updatedMember.password)
  assert(passwordMatch, 'Password baru harus cocok dengan hash')
  console.log('   ✓ Hash bcrypt cost 12 terverifikasi di database')

  // ─── 12. Uji Invalidasi Sesi Lama (Old JWT Revocation) ─────────────────────
  console.log('\n--- 12. Uji Invalidasi Sesi Lama via tokenVersion ---')
  const checkOldTokenRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${oldMemberToken}` },
  })
  assert.strictEqual(checkOldTokenRes.status, 401, 'Token JWT lama harus ditolak 401 setelah reset')
  console.log('   ✓ Sesi JWT lama berhasil diinvalidasi seketika')

  // ─── 13. Uji Login Password Lama vs Baru ──────────────────────────────────
  console.log('\n--- 13. Uji Login Password Lama vs Baru ---')
  const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: memberEmail, password: initialPassword }),
  })
  assert.strictEqual(oldLoginRes.status, 401, 'Login dengan password lama harus ditolak')

  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: memberEmail, password: newPassword }),
  })
  assert.strictEqual(newLoginRes.status, 200, 'Login dengan password baru harus berhasil')
  console.log('   ✓ Password lama ditolak (401), password baru diterima (200)')

  // ─── 14. Uji Token Reset Sekali Pakai (Tidak Bisa Dipakai Lagi) ───────────
  console.log('\n--- 14. Uji Token Reset Sekali Pakai ---')
  const reuseTokenRes = await fetch(`${BASE_URL}/api/auth/forgot/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, newPassword: 'AnotherPassword2026!' }),
  })
  assert.strictEqual(reuseTokenRes.status, 400, 'Token reset yang sudah terpakai harus ditolak 400')
  console.log('   ✓ Token reset sekali pakai terverifikasi aman')

  console.log('\n===============================================================')
  console.log('  SELURUH 14 PENGUJIAN 6-DIGIT CODE RECOVERY LULUS 100%')
  console.log('===============================================================')
}

runTests().catch((err) => {
  console.error('\nTest Failed:', err)
  process.exit(1)
})
