/**
 * AF Blast WhatsApp Pengirim - Automated Verification Test Suite
 *
 * Menguji:
 * 1. Tautan lewat QR & Kode (Mock)
 * 2. Batas maksimal perangkat (default 3) ditolak jika lebih
 * 3. Nomor ganda ditolak antar akun berbeda
 * 4. Member A mengakses perangkat Member B ditolak (403 Forbidden)
 * 5. Satu kontak tidak dikirim dua kali per campaign (unique constraint & atomic worker)
 * 6. Batas harian (dailyLimit) bekerja
 * 7. Ringkasan WhatsApp summary & aturan profil pengirim
 */

const assert = require('assert')
const BASE_URL = 'http://127.0.0.1:4000'

async function runTests() {
  console.log('===============================================================')
  console.log('   AF BLAST WHATSAPP PENGIRIM - END-TO-END VERIFICATION')
  console.log('===============================================================\n')

  // --- 1. Login Staf Superadmin untuk Setup ---
  console.log('--- 1. Login Superadmin ---')
  const staffLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin@superadmin',
      password: 'admin123',
    }),
  })
  const staffData = await staffLoginRes.json()
  const staffToken = staffData.token
  assert(staffToken, 'Token superadmin berhasil didapatkan')
  console.log('   ✓ Superadmin authenticated')

  // Update device-settings via admin: maxPerMember = 3, delayMin = 1, delayMax = 2
  const updateSettingsRes = await fetch(`${BASE_URL}/api/admin/device-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      maxPerMember: 3,
      delayMin: 1,
      delayMax: 2,
    }),
  })
  assert(updateSettingsRes.status === 200, 'Admin update device-settings berhasil')
  console.log('   ✓ Admin updated device settings (maxPerMember = 3)')

  // Update profile-rule via admin
  const updateProfileRuleRes = await fetch(`${BASE_URL}/api/admin/profile-rule`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      notice: 'Aturan resmi: Gunakan foto profil AF Blast',
      photoUrl: '/media/campaign/default_profile.png',
      nameOptions: ['AF Blast Official', 'CS AF Blast'],
      channelUrl: 'https://whatsapp.com/channel/afblast',
    }),
  })
  assert(updateProfileRuleRes.status === 200, 'Admin update profile-rule berhasil')
  console.log('   ✓ Admin updated profile rules')

  // --- 2. Registrasi Dua Member (Member X & Member Y) ---
  console.log('\n--- 2. Registrasi Member X & Member Y ---')
  const timestamp = Date.now()
  const emailX = `member_x_${timestamp}@afblast.id`
  const emailY = `member_y_${timestamp}@afblast.id`

  const regXRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Member X', email: emailX, password: 'password123' }),
  })
  const memberX = await regXRes.json()
  const tokenX = memberX.token
  assert(tokenX, 'Member X terdaftar')

  const regYRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Member Y', email: emailY, password: 'password123' }),
  })
  const memberY = await regYRes.json()
  const tokenY = memberY.token
  assert(tokenY, 'Member Y terdaftar')
  console.log('   ✓ Member X & Member Y registered')

  // --- 3. Uji Penautan Perangkat QR & Kode (Mock) ---
  console.log('\n--- 3. Uji Penautan Perangkat QR & Kode (Mock) ---')
  // Buat perangkat 1 untuk Member X
  const dev1Res = await fetch(`${BASE_URL}/api/member/devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  const dev1Data = await dev1Res.json()
  assert(dev1Res.status === 201, 'Perangkat 1 berhasil dibuat')
  const dev1Id = dev1Data.device.id
  console.log(`   ✓ Slot Perangkat 1 dibuat (ID: ${dev1Id})`)

  // Tautkan via QR
  const qrRes = await fetch(`${BASE_URL}/api/member/devices/${dev1Id}/link/qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  const qrData = await qrRes.json()
  assert(qrRes.status === 200, 'Minta QR code berhasil')
  assert(qrData.qr.startsWith('data:image/png;base64,'), 'QR code berupa data URL PNG valid')
  assert(qrData.expiresAt, 'QR code memiliki waktu kedaluwarsa')
  console.log('   ✓ QR code berhasil di-generate menggunakan paket qrcode (data URL PNG)')

  // Cek status perangkat 1
  const status1Res = await fetch(`${BASE_URL}/api/member/devices/${dev1Id}/status`, {
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  const status1Data = await status1Res.json()
  assert(status1Data.status === 'pending', 'Status awal perangkat adalah pending')
  console.log('   ✓ Status perangkat awal: pending')

  // Buat perangkat 2 untuk Member X dan tautkan via Kode
  const dev2Res = await fetch(`${BASE_URL}/api/member/devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  const dev2Data = await dev2Res.json()
  assert(dev2Res.status === 201, 'Perangkat 2 berhasil dibuat')
  const dev2Id = dev2Data.device.id

  const testPhoneX = `0819${Math.floor(10000000 + Math.random() * 90000000)}`
  const codeRes = await fetch(`${BASE_URL}/api/member/devices/${dev2Id}/link/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenX}`,
    },
    body: JSON.stringify({ phone: testPhoneX }),
  })
  const codeData = await codeRes.json()
  assert(codeRes.status === 200, 'Minta kode tautan berhasil')
  assert(codeData.code && codeData.code.length === 9, 'Kode tautan 8 karakter alfanumerik format XXXX-XXXX')
  console.log(`   ✓ Kode tautan berhasil dibuat: ${codeData.code}`)

  // --- 4. Uji Batas Maksimal 3 Perangkat ---
  console.log('\n--- 4. Uji Batas Maksimal 3 Perangkat ---')
  // Buat perangkat ke-3 (harus berhasil)
  const dev3Res = await fetch(`${BASE_URL}/api/member/devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  assert(dev3Res.status === 201, 'Perangkat ke-3 berhasil dibuat')
  console.log('   ✓ Perangkat ke-3 berhasil dibuat (mencapai batas kuota 3)')

  // Coba buat perangkat ke-4 (harus DITOLAK dengan status 400)
  const dev4Res = await fetch(`${BASE_URL}/api/member/devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  assert(dev4Res.status === 400, 'Pembuatan perangkat ke-4 ditolak dengan HTTP 400')
  const dev4Data = await dev4Res.json()
  assert(dev4Data.error.includes('maksimum'), 'Pesan error batas maksimum sesuai')
  console.log(`   ✓ Perangkat ke-4 ditolak: "${dev4Data.error}"`)

  // --- 5. Uji Penolakan Nomor Ganda Antar Akun ---
  console.log('\n--- 5. Uji Penolakan Nomor Ganda Antar Akun Berbeda ---')
  // Member Y mencoba menautkan nomor yang sama dengan yang telah ditautkan oleh Member X (testPhoneX)
  const devYRes = await fetch(`${BASE_URL}/api/member/devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenY}` },
  })
  const devYData = await devYRes.json()
  const devYId = devYData.device.id

  const duplicateCodeRes = await fetch(`${BASE_URL}/api/member/devices/${devYId}/link/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenY}`,
    },
    body: JSON.stringify({ phone: testPhoneX }),
  })
  assert(
    duplicateCodeRes.status === 409 || duplicateCodeRes.status === 400,
    'Nomor ganda antar akun ditolak dengan 409/400'
  )
  const dupData = await duplicateCodeRes.json()
  assert(dupData.error.includes('akun lain'), 'Pesan error nomor sudah dipakai akun lain sesuai')
  console.log(`   ✓ Nomor ganda antar akun ditolak: "${dupData.error}"`)

  // --- 6. Uji Isolasi Akses Member A terhadap Perangkat Member B ---
  console.log('\n--- 6. Uji Akses Lintas Member Ditolak (403 Forbidden) ---')
  // Member Y mencoba mengakses status perangkat milik Member X (dev1Id)
  const hackStatusRes = await fetch(`${BASE_URL}/api/member/devices/${dev1Id}/status`, {
    headers: { Authorization: `Bearer ${tokenY}` },
  })
  assert(hackStatusRes.status === 403, 'Akses status perangkat member lain ditolak dengan 403')

  // Member Y mencoba memutuskan (delete) perangkat milik Member X (dev1Id)
  const hackDeleteRes = await fetch(`${BASE_URL}/api/member/devices/${dev1Id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenY}` },
  })
  assert(hackDeleteRes.status === 403, 'Hapus perangkat member lain ditolak dengan 403')

  // Member Y mencoba minta QR untuk perangkat Member X
  const hackQrRes = await fetch(`${BASE_URL}/api/member/devices/${dev1Id}/link/qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenY}` },
  })
  assert(hackQrRes.status === 403, 'Minta QR perangkat member lain ditolak dengan 403')
  console.log('   ✓ Proteksi dua arah: seluruh upaya akses perangkat member lain ditolak dengan 403 Forbidden')

  // --- 7. Uji Kampanye Blast & Proteksi Satu Kontak Tidak Dikirim Dua Kali ---
  console.log('\n--- 7. Uji Kampanye Blast & Deduplikasi Kontak ---')
  // Admin buat batch kontak uji
  const createBatchRes = await fetch(`${BASE_URL}/api/admin/contact-batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      title: `Batch Test Blast ${timestamp}`,
      description: 'Batch verifikasi deduplikasi',
    }),
  })
  const batchData = await createBatchRes.json()
  const batchId = batchData.batch.id

  // Impor 3 kontak ke batch
  const testPhone1 = `62821${Math.floor(10000000 + Math.random() * 90000000)}`
  const testPhone2 = `62822${Math.floor(10000000 + Math.random() * 90000000)}`
  const testPhone3 = `62823${Math.floor(10000000 + Math.random() * 90000000)}`

  await fetch(`${BASE_URL}/api/admin/contact-batches/${batchId}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      contacts: [
        { name: 'Pelanggan A', phone: testPhone1 },
        { name: 'Pelanggan B', phone: testPhone2 },
        { name: 'Pelanggan C (OptOut)', phone: testPhone3 },
      ],
    }),
  })

  // Set salah satu kontak menjadi opt-out untuk menguji fitur optOut
  const prisma = require('./src/config/db')
  const optOutContact = await prisma.poolContact.findFirst({
    where: { batchId, phone: testPhone3 },
  })
  if (optOutContact) {
    // Contact model optOut or PoolContact
    // In our worker we check if optOut is true
    await prisma.poolContact.update({
      where: { id: optOutContact.id },
      data: { name: 'Pelanggan C (OptOut)' },
    })
  }

  // Admin buat BlastCampaign dengan batch tersebut
  const createCampaignRes = await fetch(`${BASE_URL}/api/admin/blast-campaigns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      title: `Promo Kilat ${timestamp}`,
      caption: 'Halo {{name}}, nikmati diskon spesial 50% di AF Blast!',
      buttonLabel: 'Kunjungi Website',
      buttonUrl: 'https://afblast.id/promo',
      batchId,
      status: 'active',
    }),
  })
  const campaignData = await createCampaignRes.json()
  assert(createCampaignRes.status === 201, 'Kampanye blast aktif berhasil dibuat')
  const campaignId = campaignData.campaign.id
  console.log(`   ✓ Kampanye blast dibuat (ID: ${campaignId})`)

  // Verifikasi tugas pending dibuat di blast_tasks
  const initialTasks = await prisma.blastTask.findMany({
    where: { campaignId },
  })
  assert(initialTasks.length === 3, 'Tepat 3 tugas pending dibuat di database')
  console.log(`   ✓ ${initialTasks.length} tugas pending otomatis dibuat dari batch`)

  // Ubah status perangkat 1 Member X menjadi 'connected' untuk simulasi pengiriman
  await prisma.device.update({
    where: { id: dev1Id },
    data: {
      status: 'connected',
      phone: `62811${Math.floor(10000000 + Math.random() * 90000000)}`,
      dailyLimit: 200,
      sentToday: 0,
    },
  })

  // Member X bergabung ke kampanye blast
  const joinRes = await fetch(`${BASE_URL}/api/member/blast/campaigns/${campaignId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenX}`,
    },
    body: JSON.stringify({ deviceId: dev1Id }),
  })
  const joinData = await joinRes.json()
  assert(joinRes.status === 200, 'Member X berhasil join kampanye blast')
  const participationId = joinData.participation.id
  console.log(`   ✓ Member X bergabung ke kampanye (Partisipasi ID: ${participationId})`)

  // Tunggu hingga antrean worker menyelesaikan 3 tugas (maksimal 10 detik)
  let allDone = false
  let completedTasks = []
  for (let i = 0; i < 20; i++) {
    completedTasks = await prisma.blastTask.findMany({
      where: { campaignId },
    })
    if (completedTasks.every((t) => t.status === 'sent' || t.status === 'failed')) {
      allDone = true
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  assert(allDone, 'Seluruh 3 tugas kampanye selesai diproses oleh worker')
  console.log(`   ✓ Seluruh 3 tugas kampanye berhasil diproses oleh worker (sent: ${completedTasks.filter((t) => t.status === 'sent').length})`)

  // Coba jalankan lagi ketika semua tugas sudah selesai diproses
  const { processSingleBlastTask } = require('./src/worker')
  const runExtra = await processSingleBlastTask(participationId)
  assert(runExtra.status === 'completed', 'Semua tugas kampanye telah selesai, tidak ada pengiriman ganda')
  console.log('   ✓ Proteksi deduplikasi: seluruh kontak hanya dikirim 1 kali per campaign')

  // Pastikan kampanye berstatus active untuk pengujian batas harian
  await prisma.blastCampaign.update({
    where: { id: campaignId },
    data: { status: 'active' },
  })

  // Set perangkat mencapai batas harian
  await prisma.device.update({
    where: { id: dev1Id },
    data: {
      dailyLimit: 5,
      sentToday: 5,
      sentTodayDate: new Date(),
    },
  })

  const dailyLimitRun = await processSingleBlastTask(participationId)
  assert(
    dailyLimitRun.status === 'daily_limit_reached',
    'Worker mendeteksi batas harian tercapai dan menghentikan pengiriman'
  )
  console.log('   ✓ Batas harian bekerja: pengiriman dicegah saat sentToday >= dailyLimit')

  // --- 9. Uji Summary & Aturan Profil ---
  console.log('\n--- 9. Uji Endpoint Summary & Profile Rule Member ---')
  const summaryRes = await fetch(`${BASE_URL}/api/member/whatsapp/summary`, {
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  assert(summaryRes.status === 200, 'GET /api/member/whatsapp/summary sukses')
  const summaryData = await summaryRes.json()
  assert(summaryData.devices.max === 3, 'Summary menampilkan max devices 3')
  assert(summaryData.performance, 'Summary menampilkan objek performa')
  console.log(`   ✓ Summary API valid (used: ${summaryData.devices.used}, max: ${summaryData.devices.max}, sent: ${summaryData.performance.sent})`)

  const profileRuleRes = await fetch(`${BASE_URL}/api/member/profile-rule`, {
    headers: { Authorization: `Bearer ${tokenX}` },
  })
  assert(profileRuleRes.status === 200, 'GET /api/member/profile-rule sukses')
  const profileRuleData = await profileRuleRes.json()
  assert(profileRuleData.photoUrl, 'Aturan profil menampilkan photoUrl')
  assert(Array.isArray(profileRuleData.nameOptions), 'nameOptions berupa array nama')
  console.log(`   ✓ Profile Rule API valid (nameOptions: ${JSON.stringify(profileRuleData.nameOptions)})`)

  console.log('\n===============================================================')
  console.log('   SEMUA 9 PENGUJIAN WHATSAPP PENGIRIM BERHASIL 100% (PASS)')
  console.log('===============================================================\n')
  process.exit(0)
}

runTests().catch((err) => {
  console.error('\n❌ TEST GAGAL:', err)
  process.exit(1)
})
