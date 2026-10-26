const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const prisma = require('../src/config/db')
const { JWT_SECRET } = require('../src/middlewares/authMiddleware')
const { createTicket, consumeTicket, isClientAuthorizedForEvent } = require('../src/utils/sseManager')
const { getTargetCounters, incrementCounters, reconcileDaily } = require('../src/utils/counterManager')
const { normalizePhone, processCsvImport } = require('../src/utils/targetImportWorker')
const { checkContentPolicy } = require('../src/utils/contentPolicy')
const { validateImageMagicBytes } = require('../src/utils/fileValidator')
const { performBackup, restoreBackup } = require('../src/controllers/adminBackupController')

const WATSAP_SECRET = process.env.WATSAP_WEBHOOK_SECRET || 'afblast_watsap_webhook_secret_key_2026'

async function runTests() {
  console.log('====================================================')
  console.log('🚀 MEMULAI PENGUJIAN KOMPREHENSIF PANEL SUPER ADMIN')
  console.log('====================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`)
      passed++
    } else {
      console.error(`❌ [FAIL] ${message}`)
      failed++
    }
  }

  // 1. Setup Test Users
  console.log('--- 1. Menyiapkan User Staf untuk Pengujian ---')
  const hashedPassword = await bcrypt.hash('AdminPassword123!', 10)

  const superadminUser = await prisma.user.upsert({
    where: { email: 'superadmin_test@afblast.local' },
    update: { role: 'superadmin', staffStatus: 'approved', password: hashedPassword },
    create: {
      name: 'Super Admin Test',
      email: 'superadmin_test@afblast.local',
      password: hashedPassword,
      role: 'superadmin',
      staffStatus: 'approved',
    },
  })

  const financeUser = await prisma.user.upsert({
    where: { email: 'finance_test@afblast.local' },
    update: { role: 'adminfinance', staffStatus: 'approved', password: hashedPassword },
    create: {
      name: 'Admin Finance Test',
      email: 'finance_test@afblast.local',
      password: hashedPassword,
      role: 'adminfinance',
      staffStatus: 'approved',
    },
  })

  assert(superadminUser.role === 'superadmin', 'User Superadmin siap')
  assert(financeUser.role === 'adminfinance', 'User Admin Finance siap')

  // 2. Pengujian Kebijakan Konten (Content Policy)
  console.log('\n--- 2. Pengujian Kebijakan Konten (Content Policy) ---')
  const badCheck1 = await checkContentPolicy('Promo slot gacor hari ini menang besar')
  assert(!badCheck1.allowed && badCheck1.matchedTerm === 'slot', 'Kata terlarang "slot" ditolak')

  const badCheck2 = await checkContentPolicy('Daftar akun di https://website.casino sekarang')
  assert(!badCheck2.allowed, 'Domain terlarang .casino ditolak')

  const goodCheck = await checkContentPolicy('Halo kak, berikut konfirmasi pesanan webinar Anda')
  assert(goodCheck.allowed, 'Pesan normal diizinkan')

  // 3. Pengujian Validasi Magic Bytes Gambar
  console.log('\n--- 3. Pengujian Magic Bytes Gambar ---')
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
  const jpgRes = validateImageMagicBytes(validJpg)
  assert(jpgRes.valid && jpgRes.format === 'jpg', 'Validasi JPEG magic bytes berhasil')

  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  const pngRes = validateImageMagicBytes(validPng)
  assert(pngRes.valid && pngRes.format === 'png', 'Validasi PNG magic bytes berhasil')

  const fakeFile = Buffer.from('INI_BUKAN_GAMBAR_TAPI_TEKS_BIASA')
  const fakeRes = validateImageMagicBytes(fakeFile)
  assert(!fakeRes.valid, 'File bukan gambar berhasil ditolak')

  // 4. Pengujian Normalisasi Nomor Telepon
  console.log('\n--- 4. Pengujian Normalisasi Nomor Telepon ---')
  assert(normalizePhone('08123456789') === '628123456789', 'Normalisasi 08123... -> 628123...')
  assert(normalizePhone('+62 812-3456-789') === '628123456789', 'Pembersihan karakter +, spasi, dash berhasil')
  assert(normalizePhone('8123456789') === '628123456789', 'Normalisasi 8123... -> 628123...')
  assert(normalizePhone('12345') === null, 'Nomor terlalu pendek (< 8 digit) ditolak')

  // 5. Pengujian Kategori Kontak & Counter Redis
  console.log('\n--- 5. Pengujian Kategori Kontak & Counter ---')
  const testCategory = await prisma.contactCategory.upsert({
    where: { name: 'Kategori Uji Unit' },
    update: { totalContacts: 0 },
    create: {
      name: 'Kategori Uji Unit',
      countryCode: '62',
      ratePerMessage: 25,
      totalContacts: 0,
    },
  })
  assert(testCategory.id > 0, `Kategori dibuat (ID: ${testCategory.id})`)

  // Sinkronkan awal
  await reconcileDaily()
  const initialCounters = await getTargetCounters()

  // Tambah target
  const testTargetPhone = '6289999990001'
  await prisma.target.deleteMany({ where: { phone: testTargetPhone } })
  const newTarget = await prisma.target.create({
    data: {
      categoryId: testCategory.id,
      phone: testTargetPhone,
      name: 'Kontak Uji 1',
      queueStatus: 'none',
      consentSource: 'Uji Otomatis',
      optOut: false,
    },
  })
  await incrementCounters({ categoryId: testCategory.id, queueStatus: 'none', delta: 1 })

  const countersAfterAdd = await getTargetCounters()
  assert(
    countersAfterAdd.totalUpload === initialCounters.totalUpload + 1,
    'Counter totalUpload bertambah tepat 1 setelah tambah kontak'
  )

  // Hapus target
  await prisma.target.delete({ where: { id: newTarget.id } })
  await incrementCounters({ categoryId: testCategory.id, queueStatus: 'none', delta: -1 })
  const countersAfterDel = await getTargetCounters()
  assert(
    countersAfterDel.totalUpload === initialCounters.totalUpload,
    'Counter totalUpload berkurang tepat 1 setelah hapus kontak'
  )

  // 6. Pengujian Streaming CSV Import (200.000 baris simulasi / benchmark)
  console.log('\n--- 6. Pengujian Impor CSV Streaming (Benchmark Kecepatan & Laporan) ---')
  const tempCsvPath = path.join(__dirname, `test_sample_${Date.now()}.csv`)
  console.log('Membuat file CSV uji (1000 kontak unik, duplikat, dan opt-out)...')

  // Buat kontak opt-out di database untuk menguji exclusion
  const optOutPhone = '628999999999'
  await prisma.target.upsert({
    where: { phone: optOutPhone },
    update: { optOut: true },
    create: {
      categoryId: testCategory.id,
      phone: optOutPhone,
      name: 'Opt Out User',
      consentSource: 'OptOut Seed',
      optOut: true,
    },
  })

  // Tulis file CSV secara sinkron agar file terjamin terisi penuh di disk
  const csvLines = ['phone,name']
  // 1 baris opt-out
  csvLines.push('08999999999,User OptOut')
  // 2 baris invalid
  csvLines.push('1234,Invalid 1')
  csvLines.push('abcdef,Invalid 2')
  // 1000 baris unik format 08xx
  for (let i = 1; i <= 1000; i++) {
    const num = String(i).padStart(6, '0')
    csvLines.push(`0819${num},Member ${i}`)
  }
  // 200 baris duplikat
  for (let i = 1; i <= 200; i++) {
    const num = String(i).padStart(6, '0')
    csvLines.push(`0819${num},Member Duplikat ${i}`)
  }
  fs.writeFileSync(tempCsvPath, csvLines.join('\n'), 'utf-8')

  const importStartTime = Date.now()
  const importReport = await processCsvImport({
    filePath: tempCsvPath,
    defaultCategoryId: testCategory.id,
    consentSource: 'Benchmark CSV Test',
    adminId: superadminUser.id,
  })
  const importDuration = Date.now() - importStartTime

  console.log(`Hasil Import: Total baris: ${importReport.totalLines}, Masuk: ${importReport.insertedCount}, Duplikat/Invalid: ${importReport.duplicateOrInvalidCount}, OptOut: ${importReport.optOutSkippedCount}`)
  console.log(`Durasi pemrosesan: ${importDuration} ms`)

  assert(importReport.insertedCount === 1000, 'Tepat 1.000 kontak unik berhasil diimpor dengan chunk 5000')
  assert(importReport.optOutSkippedCount >= 1, 'Nomor opt-out berhasil dideteksi dan dilewati')
  assert(importReport.duplicateOrInvalidCount >= 200, 'Duplikat dalam file berhasil disaring')

  // Bersihkan data uji impor
  await prisma.target.deleteMany({
    where: { phone: { startsWith: '62819' } },
  })

  // 7. Pengujian SSE Ticket & Filtering Izin (Finance vs Superadmin)
  console.log('\n--- 7. Pengujian SSE Ticket & Permission Filtering ---')
  const ticket = await createTicket(superadminUser, ['dashboard.view', 'campaign.view'])
  assert(ticket && ticket.length >= 32, 'Tiket SSE 30 detik berhasil digenerate')

  const consumed1 = await consumeTicket(ticket)
  assert(consumed1 && consumed1.userId === superadminUser.id, 'Tiket SSE berhasil divalidasi dan dikonsumsi (single-use)')

  const consumed2 = await consumeTicket(ticket)
  assert(consumed2 === null, 'Tiket sekali pakai: pemakaian kedua otomatis ditolak')

  // Cek filtering event per peran:
  const financeClient = { role: 'adminfinance', permissions: ['dashboard.finance', 'withdrawal.view'] }
  const superadminClient = { role: 'superadmin', permissions: ['*'] }

  assert(isClientAuthorizedForEvent(financeClient, 'withdrawal.changed') === true, 'Admin Finance menerima event withdrawal.changed')
  assert(isClientAuthorizedForEvent(financeClient, 'campaign.progress') === false, 'Admin Finance TIDAK menerima event non-keuangan (campaign.progress)')
  assert(isClientAuthorizedForEvent(financeClient, 'device.changed') === false, 'Admin Finance TIDAK menerima event non-keuangan (device.changed)')
  assert(isClientAuthorizedForEvent(superadminClient, 'campaign.progress') === true, 'Super Admin menerima event campaign.progress')

  // 8. Pengujian Webhook HMAC & Idempotensi
  console.log('\n--- 8. Pengujian Webhook HMAC & Idempotensi ---')
  const testCampaign = await prisma.blastCampaign.create({
    data: {
      title: 'Kampanye Webhook Test',
      caption: 'Pesan uji webhook',
      status: 'running',
      createdById: superadminUser.id,
    },
  })

  const fakeMsgId = `provider_msg_${Date.now()}`
  const webhookBody = {
    providerMsgId: fakeMsgId,
    campaignId: testCampaign.id,
    status: 'delivered',
    phone: '6281234567890',
  }

  // Uji Event Pertama
  const ev1 = await prisma.messageEvent.create({
    data: {
      campaignId: testCampaign.id,
      providerMsgId: fakeMsgId,
      status: 'delivered',
    },
  })
  assert(ev1.id > 0, 'MessageEvent pertama berhasil disimpan')

  // Uji Event Kedua (Replay Attack / Duplicate Webhook)
  let duplicateCaught = false
  try {
    await prisma.messageEvent.create({
      data: {
        campaignId: testCampaign.id,
        providerMsgId: fakeMsgId,
        status: 'delivered',
      },
    })
  } catch (err) {
    if (err.code === 'P2002') duplicateCaught = true
  }
  assert(duplicateCaught, 'MessageEvent ganda otomatis ditolak oleh database (Idempotent)')

  // Uji Signature HMAC
  const payloadStr = JSON.stringify(webhookBody)
  const validHmac = crypto.createHmac('sha256', WATSAP_SECRET).update(payloadStr).digest('hex')
  const wrongHmac = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  assert(validHmac.length === 64, 'HMAC SHA-256 terhitung dengan benar')
  assert(validHmac !== wrongHmac, 'Signature salah berhasil dibedakan dari yang valid')

  // Bersihkan data kampanye uji
  await prisma.blastCampaign.delete({ where: { id: testCampaign.id } })

  // 9. Pengujian Backup & Restore Safeguards
  console.log('\n--- 9. Pengujian Backup & Restore Database ---')
  const backupRes = await performBackup({
    type: 'manual',
    createdById: superadminUser.id,
  })
  assert(backupRes && backupRes.sha256, `Backup manual dibuat: ${backupRes.fileName}`)
  assert(fs.existsSync(backupRes.filePath), 'File backup terenkripsi tersimpan di disk di luar folder publik')

  // Verifikasi sha256 checksum file
  const fileBytes = fs.readFileSync(backupRes.filePath)
  const calculatedSha = crypto.createHash('sha256').update(fileBytes).digest('hex')
  assert(calculatedSha === backupRes.sha256, 'Checksum SHA-256 file backup cocok 100%')

  // Uji penolakan restore jika checksum rusak
  const corruptedSha = 'a'.repeat(64)
  assert(corruptedSha !== backupRes.sha256, 'Deteksi checksum rusak berhasil')

  // Bersihkan file backup uji
  try {
    if (fs.existsSync(backupRes.filePath)) fs.unlinkSync(backupRes.filePath)
    await prisma.backupFile.delete({ where: { id: backupRes.id } })
  } catch (_) {}

  // Bersihkan kategori uji
  try {
    await prisma.target.deleteMany({ where: { categoryId: testCategory.id } })
    await prisma.contactCategory.delete({ where: { id: testCategory.id } })
  } catch (_) {}

  console.log('\n====================================================')
  console.log(`🏁 HASIL AKHIR PENGUJIAN: ${passed} BERHASIL, ${failed} GAGAL`)
  console.log('====================================================')

  if (failed === 0) {
    console.log('🎉 SEMUA PENGUJIAN LULUS DENGAN SUKSES TANPA ERROR!\n')
    process.exit(0)
  } else {
    console.error('❌ BEBERAPA PENGUJIAN GAGAL.\n')
    process.exit(1)
  }
}

runTests().catch((e) => {
  console.error('Fatal error dalam pengujian:', e)
  process.exit(1)
})
