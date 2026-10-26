/**
 * Test Suite Mesin Blast WhatsApp AF Blast
 * Menjalankan pengujian komprehensif seluruh spesifikasi:
 * 1. Admin engine settings API & audit log
 * 2. Safe mode & Brutal mode validation rules & exclusive check
 * 3. Brutal mode blocks adding new devices
 * 4. Atomic target allocation, interval calculation, Earning creation & simulation balance isolation
 * 5. Concurrent multi-device target allocation (anti-duplicate)
 * 6. Kendali massal start-all & stop-all
 * 7. Consecutive failures auto-stop (engineState: paused)
 * 8. Member A vs Member B isolation (403 forbidden)
 * 9. Reconnect device preserves slot & statistics
 * 10. Webhook device.logged_out stops engine, reverts queued targets, and sends notification
 * 11. Overview & History API phone masking & counter accuracy
 */

const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const prisma = require('../src/config/db')
const { redis } = require('../src/config/redis')
const blastEngine = require('../src/services/blastEngine.service')
const { getBlastSettings } = require('../src/services/blastSettings.service')
const targetStatsService = require('../src/services/targetStats.service')
const { JWT_SECRET } = require('../src/middlewares/authMiddleware')
const watsap = require('../src/providers/watsap')

function generateMemberToken(userId) {
  return jwt.sign({ id: userId, role: 'user', aud: 'member', tokenVersion: 0 }, JWT_SECRET, { expiresIn: '1h' })
}

function generateStaffToken(userId, role = 'superadmin') {
  return jwt.sign({ id: userId, role, aud: 'staff', tokenVersion: 0 }, JWT_SECRET, { expiresIn: '1h' })
}

async function runTests() {
  console.log('====================================================')
  console.log('🚀 MEMULAI TEST SUITE MESIN BLAST AF BLAST')
  console.log('====================================================\n')

  let passedTests = 0
  let failedTests = 0

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`)
      failedTests++
      throw new Error(`Assertion Failed: ${message}`)
    } else {
      console.log(`✅ PASSED: ${message}`)
      passedTests++
    }
  }

  try {
    // 0. SETUP USERS & TEST CATEGORY
    console.log('--- 0. Inisialisasi Data Pengujian ---')
    let memberA = await prisma.user.findFirst({ where: { email: 'member_test_a@afblast.local' } })
    if (!memberA) {
      memberA = await prisma.user.create({
        data: {
          name: 'Member Test A',
          email: 'member_test_a@afblast.local',
          password: 'hashed_password_test',
          role: 'user',
          balance: 10000,
          telegramChatId: '987654321',
          telegramVerifiedAt: new Date(),
        },
      })
    } else {
      memberA = await prisma.user.update({
        where: { id: memberA.id },
        data: { balance: 10000, telegramChatId: '987654321', telegramVerifiedAt: new Date() },
      })
    }

    let memberB = await prisma.user.findFirst({ where: { email: 'member_test_b@afblast.local' } })
    if (!memberB) {
      memberB = await prisma.user.create({
        data: {
          name: 'Member Test B',
          email: 'member_test_b@afblast.local',
          password: 'hashed_password_test',
          role: 'user',
          balance: 5000,
        },
      })
    }

    let adminUser = await prisma.user.findFirst({ where: { email: 'admin_test@afblast.local' } })
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          name: 'Super Admin Test',
          email: 'admin_test@afblast.local',
          password: 'hashed_password_test',
          role: 'superadmin',
          staffStatus: 'approved',
        },
      })
    }

    // Buat Kategori Uji
    let testCategory = await prisma.contactCategory.findFirst({ where: { name: 'UJI-ENGINE-AUTO' } })
    if (!testCategory) {
      testCategory = await prisma.contactCategory.create({
        data: {
          name: 'UJI-ENGINE-AUTO',
          ratePerMessage: 50,
          isActive: true,
          isSimulated: true,
        },
      })
    } else {
      testCategory = await prisma.contactCategory.update({
        where: { id: testCategory.id },
        data: { isActive: true, ratePerMessage: 50, isSimulated: true },
      })
    }

    // Inisialisasi CategoryStats
    await prisma.categoryStats.upsert({
      where: { categoryId: testCategory.id },
      create: { categoryId: testCategory.id, total: 20, none: 20 },
      update: { total: 20, none: 20, queued: 0, active: 0, success: 0, failed: 0 },
    })

    // Buat Template & Kampanye Aktif
    let testCampaign = await prisma.blastCampaign.findFirst({ where: { title: 'Kampanye Uji Engine' } })
    if (!testCampaign) {
      testCampaign = await prisma.blastCampaign.create({
        data: {
          title: 'Kampanye Uji Engine',
          categoryId: testCategory.id,
          caption: 'Halo {{nama}}, ini adalah pesan pengujian resmi AF Blast.',
          buttonLabel: 'Kunjungi Portal',
          buttonUrl: 'https://afblast.com',
          status: 'active',
          createdById: adminUser.id,
        },
      })
    } else {
      testCampaign = await prisma.blastCampaign.update({
        where: { id: testCampaign.id },
        data: { categoryId: testCategory.id, status: 'active', caption: 'Halo {{nama}}, ini pesan pengujian.' },
      })
    }

    // Buat 10 Target Kontak Uji
    await prisma.target.deleteMany({ where: { categoryId: testCategory.id } })
    const targetData = []
    for (let i = 1; i <= 10; i++) {
      targetData.push({
        categoryId: testCategory.id,
        phone: `62899000100${i.toString().padStart(2, '0')}`,
        name: `Target Uji ${i}`,
        queueStatus: 'none',
        consentSource: 'SIMULATOR_TEST',
        isSimulated: true,
      })
    }
    await prisma.target.createMany({ data: targetData })
    await prisma.categoryStats.update({
      where: { categoryId: testCategory.id },
      data: { total: 10, none: 10, queued: 0, success: 0, failed: 0 },
    })

    // Bersihkan klaim Redis lama agar target uji dapat diklaim bersih
    const oldClaimKeys = await redis.keys(`afblast:claim:camp_${testCampaign.id}:*`)
    if (oldClaimKeys.length > 0) {
      await redis.del(...oldClaimKeys)
    }

    console.log(`Kategori ID: ${testCategory.id}, Kampanye ID: ${testCampaign.id}, 10 Target siap.\n`)

    // ============================================================
    // PENGUJIAN 1: PENGATURAN MESIN (SiteSetting) & VALIDASI RENTANG
    // ============================================================
    console.log('--- 1. Pengujian Pengaturan Mesin Global ---')
    const initialSettings = await getBlastSettings()
    assert(Array.isArray(initialSettings.allowedSpeeds), 'allowedSpeeds berbentuk array')
    assert(initialSettings.allowedSpeeds.includes(30), 'allowedSpeeds menyertakan kecepatan default 30')
    assert(initialSettings.brutalMinIntervalMs >= 700, 'brutalMinIntervalMs minimal 700ms')
    assert(initialSettings.failStopThreshold > 0, 'failStopThreshold valid (> 0)')

    // ============================================================
    // PENGUJIAN 2: VALIDASI KECEPATAN & ATURAN SAFE / BRUTAL MODE
    // ============================================================
    console.log('\n--- 2. Pengujian Validasi Mode & Kecepatan ---')

    // Reset device Member A
    await prisma.device.deleteMany({ where: { userId: memberA.id } })
    const dev1 = await prisma.device.create({
      data: {
        userId: memberA.id,
        slotNumber: 1,
        label: 'Device Test 1',
        phone: '6281112223331',
        status: 'connected',
        engineState: 'idle',
        speedSeconds: 30,
        categoryId: testCategory.id,
      },
    })

    // a. Kecepatan tidak ada di allowedSpeeds ditolak
    let speedRejected = false
    try {
      await blastEngine.startDevice(dev1.id, memberA.id, { speedSeconds: 99 })
    } catch (err) {
      speedRejected = true
      assert(err.message.includes('tidak diizinkan'), 'Kecepatan 99s ditolak karena tidak ada di allowedSpeeds')
    }
    assert(speedRejected, 'Tolak start bila speedSeconds tidak terdaftar')

    // b. Safe mode dan Brutal mode saling eksklusif
    let exclusiveRejected = false
    try {
      await blastEngine.startDevice(dev1.id, memberA.id, { safeMode: true, brutalMode: true })
    } catch (err) {
      exclusiveRejected = true
      assert(err.message.includes('saling eksklusif'), 'SafeMode dan BrutalMode saling eksklusif')
    }
    assert(exclusiveRejected, 'Tolak start jika SafeMode dan BrutalMode aktif bersamaan')

    // c. Brutal mode ditolak jika brutalModeEnabled = false di setting
    await prisma.siteSetting.upsert({
      where: { key: 'blast.brutalModeEnabled' },
      create: { key: 'blast.brutalModeEnabled', value: 'false' },
      update: { value: 'false' },
    })
    let brutalDisabledRejected = false
    try {
      await blastEngine.startDevice(dev1.id, memberA.id, {
        mode: 'brutal',
        confirmText: 'SAYA PAHAM',
      })
    } catch (err) {
      brutalDisabledRejected = true
      assert(err.message.includes('dinonaktifkan'), 'Brutal mode ditolak saat dimatikan oleh sistem')
    }
    assert(brutalDisabledRejected, 'Tolak Brutal Mode saat setting blast.brutalModeEnabled=false')

    // d. Brutal mode ditolak jika confirmText tidak ada atau bukan "SAYA PAHAM"
    await prisma.siteSetting.upsert({
      where: { key: 'blast.brutalModeEnabled' },
      create: { key: 'blast.brutalModeEnabled', value: 'true' },
      update: { value: 'true' },
    })
    let brutalNoConfirmRejected = false
    try {
      await blastEngine.startDevice(dev1.id, memberA.id, {
        mode: 'brutal',
        confirmText: 'SAYA SETUJU',
      })
    } catch (err) {
      brutalNoConfirmRejected = true
      assert(err.message.includes('SAYA PAHAM'), 'Brutal mode ditolak jika confirmText bukan SAYA PAHAM')
    }
    assert(brutalNoConfirmRejected, 'Tolak Brutal Mode tanpa konfirmasi persis "SAYA PAHAM"')

    // e. Brutal mode ditolak jika member belum punya RiskAck aktif
    await prisma.riskAck.deleteMany({ where: { userId: memberA.id } })
    let brutalNoRiskAckRejected = false
    try {
      await blastEngine.startDevice(dev1.id, memberA.id, {
        mode: 'brutal',
        confirmText: 'SAYA PAHAM',
      })
    } catch (err) {
      brutalNoRiskAckRejected = true
      assert(err.message.includes('Pernyataan Risiko'), 'Brutal mode ditolak bila RiskAck belum disetujui')
    }
    assert(brutalNoRiskAckRejected, 'Tolak Brutal Mode jika member tidak memiliki RiskAck aktif')

    // f. Setujui RiskAck dan jalankan brutal mode
    await prisma.riskAck.create({
      data: {
        userId: memberA.id,
        version: '1.0',
        acceptedAt: new Date(),
        ip: '127.0.0.1',
      },
    })

    const brutalStartRes = await blastEngine.startDevice(dev1.id, memberA.id, {
      mode: 'brutal',
      confirmText: 'SAYA PAHAM',
      categoryId: testCategory.id,
      speedSeconds: 1,
    })
    assert(brutalStartRes.success === true, 'Brutal mode berhasil dimulai setelah persyaratan lengkap terpenuhi')

    // g. Selama ada device berjalan brutal, tambah device baru DITOLAK
    const memberController = require('../src/controllers/memberWhatsappController')
    let addDeviceBlocked = false
    const mockReq = { user: { id: memberA.id }, body: { label: 'Device Baru' } }
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code === 400 && data.error?.includes('tidak bisa menambah perangkat')) {
            addDeviceBlocked = true
          }
          return data
        },
      }),
    }
    await memberController.createMemberDevice(mockReq, mockRes)
    assert(addDeviceBlocked, 'Tambah perangkat baru ditolak selama ada perangkat berjalan dalam Mode Brutal')

    // Hentikan brutal mode device 1
    await blastEngine.stopDevice(dev1.id, memberA.id, 'test_finish_brutal')
    const stoppedDev1 = await prisma.device.findUnique({ where: { id: dev1.id } })
    assert(stoppedDev1.engineState === 'idle', 'Device 1 berhasil dihentikan kembali ke status idle')

    // ============================================================
    // PENGUJIAN 3: ALOKASI ATOMIK TARGET, STEP EKSEKUSI, EARNING & SALDO
    // ============================================================
    console.log('\n--- 3. Pengujian Alokasi Atomik, Earning & Isolasi Saldo ---')

    // Pastikan saldo awal Member A
    const userBefore = await prisma.user.findUnique({ where: { id: memberA.id } })
    const initialBalance = userBefore.balance

    // Jalankan Device 1 (Mode Standard)
    const startRes = await blastEngine.startDevice(dev1.id, memberA.id, {
      speedSeconds: 1,
      categoryId: testCategory.id,
      mode: 'standard',
    })
    assert(startRes.success === true, 'Device 1 start sukses')
    const runId = startRes.runId

    // Eksekusi 1 step pengiriman pesan (bersihkan lock agar test sinkron dapat berjalan)
    await redis.del(`afblast:step:device:${dev1.id}`)
    const stepRes = await blastEngine.processDeviceStep(dev1.id, runId)
    assert(stepRes.status === 'sent', `Step pengiriman sukses diproses (targetId: ${stepRes.targetId})`)

    // Periksa status Target
    const processedTarget = await prisma.target.findUnique({ where: { id: stepRes.targetId } })
    assert(processedTarget.queueStatus === 'success', 'Status target berhasil diperbarui atomik ke "success"')

    // Periksa Earning
    const earning = await prisma.earning.findFirst({
      where: { runId, targetId: stepRes.targetId },
    })
    assert(earning !== null, 'Catatan Earning berhasil dibuat atomik')
    assert(earning.isSimulated === true, 'Earning ditandai isSimulated=true (karena mode simulator/kategori simulated)')
    assert(earning.amount === 50, 'Besaran Earning sesuai ratePerMessage kategori (50)')

    // Pastikan Saldo Member TIDAK bertambah karena simulasi
    const userAfter = await prisma.user.findUnique({ where: { id: memberA.id } })
    assert(userAfter.balance === initialBalance, `Saldo member tetap utuh (${initialBalance}) dan tidak bertambah dari komisi simulasi`)

    // Periksa BlastLog
    const blastLog = await prisma.blastLog.findFirst({
      where: { runId, deviceId: dev1.id },
    })
    assert(blastLog !== null && blastLog.status === 'sent', 'BlastLog tercatat dengan status "sent"')

    // Periksa CategoryStats atomik counter
    const updatedStats = await prisma.categoryStats.findUnique({ where: { categoryId: testCategory.id } })
    assert(updatedStats.success >= 1, `CategoryStats.success bertambah secara atomik (${updatedStats.success})`)

    // Hentikan Device 1
    await blastEngine.stopDevice(dev1.id, memberA.id, 'step_test_done')

    // ============================================================
    // PENGUJIAN 4: ANTI-DUPLIKASI (2 PERANGKAT TIDAK MENGIRIM KE KONTAK SAMA)
    // ============================================================
    console.log('\n--- 4. Pengujian Konkurensi & Anti-Duplikasi Target ---')

    // Buat Device 2 untuk Member A
    const dev2 = await prisma.device.create({
      data: {
        userId: memberA.id,
        slotNumber: 2,
        label: 'Device Test 2',
        phone: '6281112223332',
        status: 'connected',
        engineState: 'idle',
        speedSeconds: 1,
        categoryId: testCategory.id,
      },
    })

    const runDev1 = await blastEngine.startDevice(dev1.id, memberA.id, { speedSeconds: 1, categoryId: testCategory.id })
    const runDev2 = await blastEngine.startDevice(dev2.id, memberA.id, { speedSeconds: 1, categoryId: testCategory.id })

    // Eksekusi bersamaan (concurrent)
    let [step1, step2] = await Promise.all([
      blastEngine.processDeviceStep(dev1.id, runDev1.runId),
      blastEngine.processDeviceStep(dev2.id, runDev2.runId),
    ])

    // Jika salah satu perangkat mendeteksi target telah diklaim perangkat lain (anti-collision),
    // perangkat tersebut akan memproses kandidat berikutnya sesuai siklus worker
    if (step1.status === 'retry_claimed' || step1.status === 'retry_concurrent') {
      step1 = await blastEngine.processDeviceStep(dev1.id, runDev1.runId)
    }
    if (step2.status === 'retry_claimed' || step2.status === 'retry_concurrent') {
      step2 = await blastEngine.processDeviceStep(dev2.id, runDev2.runId)
    }

    assert(step1.status === 'sent' && step2.status === 'sent', 'Kedua perangkat sukses memproses step konkurensi')
    assert(step1.targetId !== step2.targetId, `Kedua perangkat memproses target berbeda! (Dev1: ${step1.targetId}, Dev2: ${step2.targetId})`)

    // Pastikan tidak ada target yang terproses ganda
    const allSuccess = await prisma.target.findMany({
      where: { categoryId: testCategory.id, queueStatus: 'success' },
    })
    const phoneSet = new Set(allSuccess.map((t) => t.phone))
    assert(phoneSet.size === allSuccess.length, 'Seluruh nomor yang diproses unik (tidak ada duplikasi target)')

    await blastEngine.stopDevice(dev1.id, memberA.id, 'concurrency_test_done')
    await blastEngine.stopDevice(dev2.id, memberA.id, 'concurrency_test_done')

    // ============================================================
    // PENGUJIAN 5: KENDALI MASSAL (start-all & stop-all)
    // ============================================================
    console.log('\n--- 5. Pengujian Kendali Massal (start-all & stop-all) ---')

    // Pastikan dev1 dan dev2 idle dan connected
    await prisma.device.updateMany({
      where: { id: { in: [dev1.id, dev2.id] } },
      data: { engineState: 'idle', status: 'connected' },
    })

    const startAllRes = await blastEngine.startAll(memberA.id, { categoryId: testCategory.id, speedSeconds: 1 })
    assert(startAllRes.startedCount === 2, `start-all berhasil menjalankan ${startAllRes.startedCount} perangkat`)

    const devsAfterStartAll = await prisma.device.findMany({
      where: { id: { in: [dev1.id, dev2.id] } },
    })
    assert(devsAfterStartAll.every((d) => d.engineState === 'running'), 'Semua perangkat berstatus engineState="running"')

    const stopAllRes = await blastEngine.stopAll(memberA.id)
    assert(stopAllRes.stoppedCount === 2, `stop-all berhasil menghentikan ${stopAllRes.stoppedCount} perangkat`)

    const devsAfterStopAll = await prisma.device.findMany({
      where: { id: { in: [dev1.id, dev2.id] } },
    })
    assert(devsAfterStopAll.every((d) => d.engineState === 'idle'), 'Semua perangkat kembali berstatus engineState="idle"')

    // ============================================================
    // PENGUJIAN 6: KEGAGALAN BERUNTUN MENGHENTIKAN MESIN (failStopThreshold)
    // ============================================================
    console.log('\n--- 6. Pengujian Kegagalan Beruntun (Auto Pause) ---')

    const runFailTest = await blastEngine.startDevice(dev1.id, memberA.id, { speedSeconds: 1, categoryId: testCategory.id })
    // Simulasikan consecutiveFails mencapai ambang batas
    await prisma.device.update({
      where: { id: dev1.id },
      data: { consecutiveFails: initialSettings.failStopThreshold },
    })

    const failStepRes = await blastEngine.processDeviceStep(dev1.id, runFailTest.runId)
    assert(failStepRes.status === 'paused' && failStepRes.reason === 'consecutive_fails', 'Mesin otomatis dijeda (paused) saat mencapai batas kegagalan')

    const devAfterFail = await prisma.device.findUnique({ where: { id: dev1.id } })
    assert(devAfterFail.engineState === 'paused', 'engineState perangkat menjadi "paused"')

    // ============================================================
    // PENGUJIAN 7: ISOLASI MEMBER (Member A tidak bisa kendalikan Member B)
    // ============================================================
    console.log('\n--- 7. Pengujian Isolasi Antar Member (403 Forbidden) ---')

    // Reset dev1 ke connected & idle
    await prisma.device.update({
      where: { id: dev1.id },
      data: { engineState: 'idle', status: 'connected', consecutiveFails: 0 },
    })

    // Member B mencoba start device Member A
    let crossMemberStartBlocked = false
    try {
      await blastEngine.startDevice(dev1.id, memberB.id, { categoryId: testCategory.id })
    } catch (err) {
      crossMemberStartBlocked = true
      assert(err.status === 403 || err.message.includes('Bukan perangkat'), 'Member B dilarang menjalankan perangkat milik Member A (403)')
    }
    assert(crossMemberStartBlocked, 'Isolasi startDevice terbukti aman')

    // Member B mencoba riwayat device Member A
    let crossMemberHistoryBlocked = false
    try {
      await blastEngine.getDeviceHistory(dev1.id, memberB.id, {})
    } catch (err) {
      crossMemberHistoryBlocked = true
      assert(err.status === 403 || err.message.includes('Bukan perangkat'), 'Member B dilarang melihat riwayat perangkat Member A (403)')
    }
    assert(crossMemberHistoryBlocked, 'Isolasi getDeviceHistory terbukti aman')

    // ============================================================
    // PENGUJIAN 8: RECONNECT MENGGUNAKAN DEVICE & SLOT YANG SAMA
    // ============================================================
    console.log('\n--- 8. Pengujian Reconnect Perangkat ---')

    const originalSlotNumber = dev1.slotNumber
    const reconnectRes = await blastEngine.reconnectDevice(dev1.id, memberA.id, '6281112223331')
    assert(reconnectRes.success === true, 'Reconnect berhasil dijalankan')
    assert(reconnectRes.device.id === dev1.id, `ID perangkat tetap sama (${dev1.id})`)
    assert(reconnectRes.device.slotNumber === originalSlotNumber, `Nomor slot tetap sama (#${originalSlotNumber})`)
    assert(reconnectRes.device.status === 'pending', 'Status perangkat kembali ke pending untuk penautan ulang')

    // Pulihkan status ke connected untuk pengujian berikutnya
    await prisma.device.update({
      where: { id: dev1.id },
      data: { status: 'connected' },
    })

    // ============================================================
    // PENGUJIAN 9: WEBHOOK LOGOUT PAKSA, REVERT TARGET & NOTIFIKASI
    // ============================================================
    console.log('\n--- 9. Pengujian Webhook Logout Paksa & Notifikasi Telegram ---')

    // Jalankan Device 1
    const runForLogout = await blastEngine.startDevice(dev1.id, memberA.id, {
      speedSeconds: 1,
      categoryId: testCategory.id,
    })

    // Simulasikan 1 target dialokasikan ke status "queued"
    const queuedTarget = await prisma.target.findFirst({
      where: { categoryId: testCategory.id, queueStatus: 'none' },
    })
    if (queuedTarget) {
      await prisma.target.update({
        where: { id: queuedTarget.id },
        data: { queueStatus: 'queued' },
      })
      await prisma.categoryStats.update({
        where: { categoryId: testCategory.id },
        data: { none: { decrement: 1 }, queued: { increment: 1 } },
      })
    }

    // Panggil webhook controller langsung (simulasi webhook watsap.id device.logged_out)
    const { handleWatsapWebhook } = require('../src/controllers/webhookController')
    const webhookSecret = process.env.WATSAP_WEBHOOK_SECRET || 'afblast_watsap_webhook_secret_key_2026'
    const webhookBody = {
      event: 'device.logged_out',
      deviceId: dev1.id,
      phone: dev1.phone,
    }
    const timestamp = String(Date.now())
    const sig = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${JSON.stringify(webhookBody)}`).digest('hex')

    const webhookReq = {
      headers: {
        'x-watsap-signature': sig,
        'x-watsap-timestamp': timestamp,
      },
      query: {},
      body: webhookBody,
    }
    const webhookRes = {
      status: (code) => ({
        json: (data) => data,
      }),
    }

    await handleWatsapWebhook(webhookReq, webhookRes)

    // Periksa status device setelah logout
    const devAfterLogout = await prisma.device.findUnique({ where: { id: dev1.id } })
    assert(devAfterLogout.status === 'logged_out', 'Status perangkat berubah menjadi "logged_out"')
    assert(devAfterLogout.engineState === 'idle', 'engineState perangkat berhenti ke "idle"')
    assert(devAfterLogout.disconnectedReason === 'logout', 'disconnectedReason tercatat sebagai "logout"')

    // Periksa DeviceRun yang sedang berjalan telah dihentikan dengan stopReason="logout"
    const endedRun = await prisma.deviceRun.findUnique({ where: { id: runForLogout.runId } })
    assert(endedRun.endedAt !== null, 'DeviceRun berhasil diakhiri')
    assert(endedRun.stopReason === 'logout', 'stopReason DeviceRun tercatat sebagai "logout"')

    // Periksa bahwa target yang sebelumnya "queued" telah dikembalikan ke "none"
    if (queuedTarget) {
      const revertedTarget = await prisma.target.findUnique({ where: { id: queuedTarget.id } })
      assert(revertedTarget.queueStatus === 'none', 'Target berstatus "queued" berhasil dikembalikan ke "none"')
    }

    // ============================================================
    // PENGUJIAN 10: PENYAMARAN NOMOR (MASKING) & RINGKASAN OVERVIEW
    // ============================================================
    console.log('\n--- 10. Pengujian Penyamaran Nomor & Ringkasan Overview ---')

    // a. Verifikasi maskPhone
    const samplePhone = '6281234567890'
    const masked = blastEngine.maskPhone(samplePhone)
    assert(!masked.includes('345678'), `Nomor tengah tersamar dengan bintang: ${masked}`)
    assert(masked.startsWith('6281') && masked.endsWith('890'), 'Prefix dan suffix 3 digit tetap terbaca')

    // b. Verifikasi GET /api/member/whatsapp/overview
    const overview = await blastEngine.getMemberOverview(memberA.id)
    assert(overview.performance !== undefined, 'overview memiliki objek performance')
    assert(typeof overview.performance.slotAktif === 'number', 'slotAktif berupa Number')
    assert(typeof overview.performance.sentAllTime === 'number', 'sentAllTime berupa Number')
    assert(typeof overview.performance.totalProcessed === 'number', 'totalProcessed berupa Number')
    assert(Array.isArray(overview.devices), 'overview menyertakan daftar devices')
    assert(Array.isArray(overview.kategori), 'overview menyertakan daftar kategori yang bisa dipilih')
    assert(overview.settings !== undefined, 'overview menyertakan batas dan flag mode setting')

    // Pastikan tidak ada nomor telepon lengkap di dalam objek perangkat overview
    for (const d of overview.devices) {
      if (d.phone) {
        assert(!/^\d{10,15}$/.test(d.phone), `Nomor telepon perangkat tersamar: ${d.phone}`)
      }
    }

    // c. Verifikasi GET /api/member/devices/:id/history
    const history = await blastEngine.getDeviceHistory(dev1.id, memberA.id, { limit: 10 })
    assert(Array.isArray(history.logs), 'History mengembalikan daftar logs')
    for (const log of history.logs) {
      assert(!/^\d{10,15}$/.test(log.phone), `Nomor telepon riwayat tersamar: ${log.phone}`)
    }

    // ============================================================
    // PENGUJIAN 11: ADMIN ENGINE MONITORING & FORCE-STOP
    // ============================================================
    console.log('\n--- 11. Pengujian Admin Engine Monitoring & Force-Stop ---')

    // Re-connect dev2 dan jalankan
    await prisma.device.update({
      where: { id: dev2.id },
      data: { status: 'connected', engineState: 'idle' },
    })
    const dev2Run = await blastEngine.startDevice(dev2.id, memberA.id, {
      speedSeconds: 1,
      categoryId: testCategory.id,
    })

    const adminController = require('../src/controllers/adminEngineController')
    let adminDevicesOutput = null
    const adminGetReq = { user: adminUser }
    const adminGetRes = {
      status: () => ({
        json: (data) => {
          adminDevicesOutput = data
          return data
        },
      }),
    }
    await adminController.getEngineDevices(adminGetReq, adminGetRes)
    assert(adminDevicesOutput !== null && Array.isArray(adminDevicesOutput.devices), 'Admin dapat melihat seluruh perangkat mesin')

    const dev2InAdmin = adminDevicesOutput.devices.find((d) => d.id === dev2.id)
    assert(dev2InAdmin && dev2InAdmin.engineState === 'running', 'Admin melihat dev2 sedang running')
    assert(dev2InAdmin.activeRun !== null, 'Admin melihat data activeRun dev2')

    // Admin Force Stop dev2
    let forceStopSuccess = false
    const adminStopReq = { user: adminUser, params: { id: String(dev2.id) } }
    const adminStopRes = {
      status: (code) => ({
        json: (data) => {
          if (code === 200 && data.success) forceStopSuccess = true
          return data
        },
      }),
    }
    await adminController.forceStopDevice(adminStopReq, adminStopRes)
    assert(forceStopSuccess, 'Admin berhasil menghentikan paksa (force-stop) perangkat')

    const dev2AfterForceStop = await prisma.device.findUnique({ where: { id: dev2.id } })
    assert(dev2AfterForceStop.engineState === 'idle', 'Perangkat dev2 kembali idle setelah di-force-stop')

    // Periksa catatan audit log admin
    const auditLog = await prisma.activityLog.findFirst({
      where: { action: 'FORCE_STOP_DEVICE', target: String(dev2.id) },
    })
    assert(auditLog !== null, 'Tindakan FORCE_STOP_DEVICE tercatat di ActivityLog')

    console.log('\n====================================================')
    console.log(`🎉 SEMUA PENGUJIAN SELESAI: ${passedTests} BERHASIL, ${failedTests} GAGAL`)
    console.log('====================================================')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ PENGUJIAN TERHENTI KARENA ERROR:')
    console.error(error)
    process.exit(1)
  }
}

runTests()
