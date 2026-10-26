const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const BASE_URL = 'http://127.0.0.1:4000'

async function runTests() {
  console.log('=== MEMULAI TEST FITUR DASHBOARD MEMBER & MANAJEMEN STAF ===\n')
  let passed = 0
  let total = 0

  function assert(condition, testName, detail = '') {
    total++
    if (condition) {
      console.log(`[PASS] ${testName}`)
      passed++
    } else {
      console.error(`[FAIL] ${testName} ${detail ? '(' + detail + ')' : ''}`)
    }
  }

  // --- 0. Login Akun Staf (Superadmin, Finance, Developer) ---
  console.log('--- 0. Persiapan Token Staf ---')
  const saRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'budi@superadmin', password: 'SuperPassword123!' }),
  })
  const saData = await saRes.json()
  const saToken = saData.token
  assert(saRes.ok && saToken, 'Superadmin budi@superadmin login berhasil')

  const finRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sartika@adminfinance', password: 'SartikaFinance123!' }),
  })
  const finData = await finRes.json()
  const finToken = finData.token
  assert(finRes.ok && finToken, 'Admin Finance sartika@adminfinance login berhasil')

  const devRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alex@developer', password: 'Developer123!' }),
  })
  const devData = await devRes.json()
  const devToken = devData.token
  assert(devRes.ok && devToken, 'Developer alex@developer login berhasil')

  // --- 1. Verifikasi Matriks Permission Baru ---
  console.log('\n--- 1. Uji Matriks Permission Baru ---')
  // a. withdrawPreset.manage: Superadmin & Finance BOLEH, Developer TIDAK BOLEH
  const saPresets = await fetch(`${BASE_URL}/api/admin/withdraw-presets`, {
    headers: { Authorization: `Bearer ${saToken}` },
  })
  assert(saPresets.status === 200, 'Superadmin memiliki izin withdrawPreset.manage (200)')

  const finPresets = await fetch(`${BASE_URL}/api/admin/withdraw-presets`, {
    headers: { Authorization: `Bearer ${finToken}` },
  })
  assert(finPresets.status === 200, 'Admin Finance memiliki izin withdrawPreset.manage (200)')

  const devPresets = await fetch(`${BASE_URL}/api/admin/withdraw-presets`, {
    headers: { Authorization: `Bearer ${devToken}` },
  })
  assert(devPresets.status === 403, 'Developer DITOLAK mengakses withdraw-presets (403)')

  // b. contactPool.manage: Superadmin & Developer BOLEH, Finance TIDAK BOLEH
  const saBatches = await fetch(`${BASE_URL}/api/admin/contact-batches`, {
    headers: { Authorization: `Bearer ${saToken}` },
  })
  assert(saBatches.status === 200, 'Superadmin memiliki izin contactPool.manage (200)')

  const devBatches = await fetch(`${BASE_URL}/api/admin/contact-batches`, {
    headers: { Authorization: `Bearer ${devToken}` },
  })
  assert(devBatches.status === 200, 'Developer memiliki izin contactPool.manage (200)')

  const finBatches = await fetch(`${BASE_URL}/api/admin/contact-batches`, {
    headers: { Authorization: `Bearer ${finToken}` },
  })
  assert(finBatches.status === 403, 'Admin Finance DITOLAK mengakses contact-batches (403)')

  // c. team.manage: Superadmin & Developer BOLEH, Finance TIDAK BOLEH
  const devTeam = await fetch(`${BASE_URL}/api/admin/team`, {
    headers: { Authorization: `Bearer ${devToken}` },
  })
  assert(devTeam.status === 200, 'Developer memiliki izin team.manage (200)')

  const finTeam = await fetch(`${BASE_URL}/api/admin/team`, {
    headers: { Authorization: `Bearer ${finToken}` },
  })
  assert(finTeam.status === 403, 'Admin Finance DITOLAK mengakses team (403)')

  // --- 2. Uji CRUD Presets & Settings Penarikan ---
  console.log('\n--- 2. Uji CRUD Presets & Settings Penarikan ---')
  // Tolak nominal bukan kelipatan 1000
  const invalidPreset = await fetch(`${BASE_URL}/api/admin/withdraw-presets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${finToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 25500, sortOrder: 9 }),
  })
  assert(invalidPreset.status === 400, 'Tolak preset bukan kelipatan 1000 (400)')

  // Buat preset valid
  const testPresetAmount = 300000 + (Math.floor(Math.random() * 100) + 1) * 1000
  const validPresetRes = await fetch(`${BASE_URL}/api/admin/withdraw-presets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${finToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: testPresetAmount, sortOrder: 7, isActive: true }),
  })
  assert(validPresetRes.status === 201, `Admin Finance berhasil membuat preset Rp${testPresetAmount} (201)`)

  // Update Settings: Tolak min > max
  const invalidSetting = await fetch(`${BASE_URL}/api/admin/withdraw-settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${finToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ min: 500000, max: 20000, allowCustom: false }),
  })
  assert(invalidSetting.status === 400, 'Tolak pengaturan penarikan dengan min > max (400)')

  // Update Settings valid: allowCustom = false untuk pengujian pembatasan preset
  const validSetting = await fetch(`${BASE_URL}/api/admin/withdraw-settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${finToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ min: 20000, max: 1000000, allowCustom: false }),
  })
  assert(validSetting.status === 200, 'Pengaturan penarikan valid berhasil disimpan (allowCustom=false)')

  // --- 3. Uji Batch Kontak & Impor CSV ---
  console.log('\n--- 3. Uji Batch Kontak & Impor CSV ---')
  const createBatchRes = await fetch(`${BASE_URL}/api/admin/contact-batches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Batch Promosi UMKM 2026',
      description: 'Daftar nomor kontak prospek UMKM',
      status: 'active',
    }),
  })
  const batchData = await createBatchRes.json()
  assert(createBatchRes.status === 201, 'Developer berhasil membuat batch kontak baru')
  const testBatchId = batchData.batch.id

  // Impor CSV dengan nomor 08xx, +628xx, dan duplikasi
  const csvContent = `name,phone
Budi Utomo,081234567890
Siti Aminah,+6281299887766
Duplikat Budi,081234567890
Joko Susilo,081355443322
Nomor Asing,12345`

  const importRes = await fetch(`${BASE_URL}/api/admin/contact-batches/${testBatchId}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvData: csvContent }),
  })
  const importData = await importRes.json()
  assert(importRes.status === 200, 'Impor CSV kontak berhasil')
  assert(importData.importedCount === 3, 'Kontak dinormalisasi dan duplikat/invalid disaring (3 kontak valid)')

  // --- 4. Registrasi & Login Dua Member (Member A & Member B) ---
  console.log('\n--- 4. Uji Member Endpoints & Keamanan Data Antar-Member ---')
  const emailMemberA = `member_a_${Date.now()}@afblast.id`
  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Member A', email: emailMemberA, password: 'password123' }),
  })
  const memberA = await regARes.json()
  const tokenA = memberA.token

  const emailMemberB = `member_b_${Date.now()}@afblast.id`
  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Member B', email: emailMemberB, password: 'password123' }),
  })
  const memberB = await regBRes.json()
  const tokenB = memberB.token
  assert(tokenA && tokenB, 'Registrasi Member A dan Member B berhasil')

  // Top up saldo Member A untuk uji penarikan (Rp200.000)
  await prisma.user.update({
    where: { id: memberA.user.id },
    data: { balance: 200000 },
  })

  // GET /api/member/dashboard
  const dashRes = await fetch(`${BASE_URL}/api/member/dashboard`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const dashData = await dashRes.json()
  assert(dashRes.status === 200 && dashData.balance === 200000, 'Dashboard member menampilkan saldo Rp200.000')

  // GET /api/member/pool/batches: Periksa nomor kontak disamarkan
  const poolBatchesRes = await fetch(`${BASE_URL}/api/member/pool/batches`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const poolBatchesData = await poolBatchesRes.json()
  assert(poolBatchesRes.status === 200, 'Daftar pool batches berhasil dimuat')
  const sampleBatch = poolBatchesData.batches.find((b) => b.id === testBatchId)
  assert(
    sampleBatch && sampleBatch.previewContacts[0]?.maskedPhone.includes('****'),
    'Nomor kontak dalam batch berhasil disamarkan (mis. 62812****7890)'
  )

  // Klaim Batch pertama kali oleh Member A
  const claim1 = await fetch(`${BASE_URL}/api/member/pool/batches/${testBatchId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const claim1Data = await claim1.json()
  assert(claim1.status === 201, 'Member A berhasil mengklaim batch kontak')
  const slotAId = claim1Data.slot.id

  // Klaim Batch kedua kali oleh Member A -> HARUS DITOLAK (400)
  const claim2 = await fetch(`${BASE_URL}/api/member/pool/batches/${testBatchId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  assert(claim2.status === 400, 'Klaim batch dua kali oleh member yang sama DITOLAK (400)')

  // Member B mencoba melepaskan slot milik Member A -> HARUS 403
  const hackRelease = await fetch(`${BASE_URL}/api/member/pool/slots/${slotAId}/release`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert(hackRelease.status === 403, 'Member B DITOLAK saat mencoba melepaskan slot milik Member A (403)')

  // Member A melepaskan slot miliknya sendiri -> HARUS 200
  const validRelease = await fetch(`${BASE_URL}/api/member/pool/slots/${slotAId}/release`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  assert(validRelease.status === 200, 'Member A sukses melepaskan slot miliknya (200)')

  // --- 5. Penautan Perangkat (Watsap Provider Adapter) ---
  console.log('\n--- 5. Uji Perangkat & Adapter Watsap ---')
  const testPhone = `62812${Date.now().toString().slice(-8)}`
  const linkRes = await fetch(`${BASE_URL}/api/member/devices/link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone }),
  })
  const linkData = await linkRes.json()
  assert(linkRes.status === 201, 'Mulai penautan perangkat berhasil, kembalikan QR code dan pairing code')
  const testDevId = linkData.device.id

  // Polling status perangkat
  const statusRes = await fetch(`${BASE_URL}/api/member/devices/${testDevId}/status`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const statusData = await statusRes.json()
  assert(statusRes.status === 200 && (statusData.status === 'pending' || statusData.status === 'connected'), 'Polling status perangkat berhasil')

  // Disconnect perangkat
  const discRes = await fetch(`${BASE_URL}/api/member/devices/${testDevId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  assert(discRes.status === 200, 'Putuskan koneksi perangkat berhasil')

  // --- 6. Uji Penarikan Dana & Validasi Transaksi ACID ---
  console.log('\n--- 6. Uji Penarikan Dana & Validasi Transaksi ACID ---')
  // a. Di bawah min (min = 20.000)
  const wdBelowMin = await fetch(`${BASE_URL}/api/member/withdrawals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 10000, bank: 'BCA' }),
  })
  assert(wdBelowMin.status === 400, 'Tolak penarikan di bawah batas minimum Rp20.000 (400)')

  // b. Di atas saldo (saldo = 200.000, coba tarik 300.000)
  const wdOverBalance = await fetch(`${BASE_URL}/api/member/withdrawals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 300000, bank: 'BCA' }),
  })
  assert(wdOverBalance.status === 400, 'Tolak penarikan melebihi saldo tersedia (400)')

  // c. Nominal non-preset saat allowCustom=false (coba tarik 75.000 yang bukan preset)
  const wdNonPreset = await fetch(`${BASE_URL}/api/member/withdrawals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 75000, bank: 'BCA' }),
  })
  assert(wdNonPreset.status === 400, 'Tolak nominal kustom saat allowCustom=false (400)')

  // d. Penarikan valid dengan nominal preset (Rp50.000)
  const wdValidRes = await fetch(`${BASE_URL}/api/member/withdrawals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 50000,
      bank: 'BCA',
      accountNumber: '1234567890',
      accountName: 'Member A',
    }),
  })
  const wdValidData = await wdValidRes.json()
  assert(wdValidRes.status === 201, 'Penarikan valid Rp50.000 berhasil dibuat (201)')
  assert(wdValidData.remainingBalance === 150000, 'Saldo otomatis terpotong menjadi Rp150.000 dalam transaksi ACID')
  const wdId = wdValidData.withdrawal.id

  // e. Admin Finance menyetujui penarikan
  const approveRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${wdId}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${finToken}` },
  })
  assert(approveRes.status === 200, 'Admin Finance berhasil menyetujui penarikan (status approved)')

  // f. Member cek riwayat penarikan
  const histRes = await fetch(`${BASE_URL}/api/member/withdrawals`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const histData = await histRes.json()
  assert(histRes.status === 200 && histData.withdrawals.length > 0, 'Riwayat penarikan member berhasil ditampilkan')

  // g. GET /api/member/team
  const teamRes = await fetch(`${BASE_URL}/api/member/team`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const teamData = await teamRes.json()
  assert(teamRes.status === 200 && Array.isArray(teamData.team), 'Daftar anggota tim aktif berhasil dimuat')

  console.log(`\n=== HASIL: ${passed}/${total} PENGUJIAN LULUS ===`)
  if (passed === total) {
    console.log('SELURUH PENGUJIAN FITUR MEMBER & MANAJEMEN STAF LULUS SEMPURNA!')
  } else {
    process.exit(1)
  }
}

runTests()
  .catch((e) => {
    console.error('Fatal error in tests:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
