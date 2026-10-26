const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const prisma = require('../src/config/db')
const { JWT_SECRET } = require('../src/middlewares/authMiddleware')

const BASE_URL = 'http://127.0.0.1:4000'
const WATSAP_SECRET = process.env.WATSAP_WEBHOOK_SECRET || 'afblast_watsap_webhook_secret_key_2026'

async function runHttpTests() {
  console.log('====================================================')
  console.log('🌐 MEMULAI PENGUJIAN INTEGRASI HTTP API PANEL ADMIN')
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

  // 1. Dapatkan / Buat Staf Superadmin & Token JWT
  const hashedPassword = await bcrypt.hash('AdminPassword123!', 10)
  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin_api_test@afblast.local' },
    update: { role: 'superadmin', staffStatus: 'approved', password: hashedPassword },
    create: {
      name: 'Super Admin API',
      email: 'superadmin_api_test@afblast.local',
      password: hashedPassword,
      role: 'superadmin',
      staffStatus: 'approved',
    },
  })

  const superadminToken = jwt.sign(
    { id: superadmin.id, role: 'superadmin', aud: 'staff' },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  const memberUser = await prisma.user.upsert({
    where: { email: 'member_api_test@afblast.local' },
    update: { role: 'user', password: hashedPassword },
    create: {
      name: 'Member API Test',
      email: 'member_api_test@afblast.local',
      password: hashedPassword,
      role: 'user',
    },
  })

  const memberToken = jwt.sign(
    { id: memberUser.id, role: 'user', aud: 'member', tokenVersion: 0 },
    JWT_SECRET,
    { expiresIn: '1h' }
  )

  const headers = {
    Authorization: `Bearer ${superadminToken}`,
    'Content-Type': 'application/json',
  }

  // 1. GET /api/admin/dashboard
  console.log('--- 1. Testing GET /api/admin/dashboard ---')
  const dashRes = await fetch(`${BASE_URL}/api/admin/dashboard`, { headers })
  const dashData = await dashRes.json()
  assert(dashRes.status === 200, 'GET /api/admin/dashboard status 200')
  assert(typeof dashData.totalMembers === 'number', 'dashboard.totalMembers valid')
  assert(typeof dashData.onlineMembers === 'number', 'dashboard.onlineMembers (aktif <= 15 menit) valid')
  assert(dashData.devices && typeof dashData.devices.connected === 'number', 'dashboard.devices {connected, total} valid')
  assert(dashData.pendingWithdrawals && typeof dashData.pendingWithdrawals.count === 'number', 'dashboard.pendingWithdrawals valid')
  assert(dashData.target && typeof dashData.target.totalUpload === 'number', 'dashboard.target counters valid dari Redis')
  assert(Array.isArray(dashData.categories), 'dashboard.categories ringkasan kategori valid')

  // 2. POST /api/admin/stream/ticket
  console.log('\n--- 2. Testing POST /api/admin/stream/ticket ---')
  const ticketRes = await fetch(`${BASE_URL}/api/admin/stream/ticket`, {
    method: 'POST',
    headers,
  })
  const ticketData = await ticketRes.json()
  assert(ticketRes.status === 200 && ticketData.ticket, 'POST /api/admin/stream/ticket menghasilkan tiket 30s')
  assert(ticketData.expiresIn === 30, 'Masa berlaku tiket 30 detik')

  // 3. Category CRUD
  console.log('\n--- 3. Testing Category CRUD ---')
  const catCreateRes = await fetch(`${BASE_URL}/api/admin/categories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Kategori API ${Date.now()}`,
      countryCode: '62',
      ratePerMessage: 20,
    }),
  })
  const catCreateData = await catCreateRes.json()
  assert(catCreateRes.status === 201 && catCreateData.category, 'POST /api/admin/categories status 201')
  const createdCatId = catCreateData.category.id

  const catListRes = await fetch(`${BASE_URL}/api/admin/categories`, { headers })
  const catListData = await catListRes.json()
  assert(catListRes.status === 200 && Array.isArray(catListData.categories), 'GET /api/admin/categories list sukses')

  // 4. Target CRUD & Cursor Pagination
  console.log('\n--- 4. Testing Target CRUD & Cursor Pagination ---')
  const targetPhone = `62877${Date.now().toString().slice(-7)}`
  const targetCreateRes = await fetch(`${BASE_URL}/api/admin/targets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      categoryId: createdCatId,
      phone: targetPhone,
      name: 'Penerima API Test',
      consentSource: 'Pendaftaran Web',
      queueStatus: 'none',
    }),
  })
  const targetCreateData = await targetCreateRes.json()
  assert(targetCreateRes.status === 201 && targetCreateData.target, 'POST /api/admin/targets status 201 (consentSource wajib)')
  const createdTargetId = targetCreateData.target.id

  // Missing consentSource test
  const badTargetRes = await fetch(`${BASE_URL}/api/admin/targets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      categoryId: createdCatId,
      phone: '08123999999',
    }),
  })
  assert(badTargetRes.status === 400, 'POST target tanpa consentSource ditolak 400')

  // Cursor Pagination test
  const targetListRes = await fetch(`${BASE_URL}/api/admin/targets?limit=5`, { headers })
  const targetListData = await targetListRes.json()
  assert(targetListRes.status === 200 && Array.isArray(targetListData.targets), 'GET /api/admin/targets cursor pagination 200')
  assert(targetListData.counters !== undefined, 'targets response menyertakan counters dari Redis')

  // 5. Template CRUD & Content Policy
  console.log('\n--- 5. Testing Template CRUD & Content Policy ---')
  // Blocked template
  const badTplRes = await fetch(`${BASE_URL}/api/admin/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Template Judi',
      body: 'Dapatkan jackpot slot gacor hari ini',
    }),
  })
  const badTplData = await badTplRes.json()
  assert(badTplRes.status === 400 && badTplData.policyReason, 'Template berisi kata terlarang ("slot") ditolak 400')

  // Valid template
  const goodTplRes = await fetch(`${BASE_URL}/api/admin/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Template Resmi ${Date.now()}`,
      body: 'Halo kak {{name}}, berikut informasi event resmi.',
      buttonLabel: 'Daftar Sekarang',
      buttonUrl: 'https://afblast.com/join',
    }),
  })
  const goodTplData = await goodTplRes.json()
  assert(goodTplRes.status === 201 && goodTplData.template, 'POST /api/admin/templates status 201')
  const createdTplId = goodTplData.template.id

  // 6. Campaign CRUD, Actions & Report Export
  console.log('\n--- 6. Testing Campaign CRUD, Actions & Report ---')
  const campCreateRes = await fetch(`${BASE_URL}/api/admin/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `Kampanye Resmi ${Date.now()}`,
      templateId: createdTplId,
      categoryId: createdCatId,
      buttonUrl: 'https://afblast.com/promo',
    }),
  })
  const campCreateData = await campCreateRes.json()
  assert(campCreateRes.status === 201 && campCreateData.campaign, 'POST /api/admin/campaigns status 201')
  const createdCampId = campCreateData.campaign.id

  // Status transitions
  const startRes = await fetch(`${BASE_URL}/api/admin/campaigns/${createdCampId}/start`, { method: 'POST', headers })
  assert(startRes.status === 200, 'POST /campaigns/:id/start status running')

  const pauseRes = await fetch(`${BASE_URL}/api/admin/campaigns/${createdCampId}/pause`, { method: 'POST', headers })
  assert(pauseRes.status === 200, 'POST /campaigns/:id/pause status paused')

  // Report endpoint
  const reportRes = await fetch(`${BASE_URL}/api/admin/campaigns/${createdCampId}/report`, { headers })
  const reportData = await reportRes.json()
  assert(reportRes.status === 200 && reportData.metrics, 'GET /campaigns/:id/report status 200')
  assert(typeof reportData.metrics.deliveryRate === 'number', 'Laporan metrik deliveryRate terhitung')

  // Report Export XLSX & PDF
  const exportXlsxRes = await fetch(`${BASE_URL}/api/admin/campaigns/${createdCampId}/report/export?format=xlsx`, { headers })
  assert(exportXlsxRes.status === 200 && exportXlsxRes.headers.get('content-type').includes('spreadsheetml'), 'Ekspor laporan format XLSX streaming berhasil')

  const exportPdfRes = await fetch(`${BASE_URL}/api/admin/campaigns/${createdCampId}/report/export?format=pdf`, { headers })
  assert(exportPdfRes.status === 200 && exportPdfRes.headers.get('content-type').includes('pdf'), 'Ekspor laporan format PDF streaming berhasil')

  // 7. Webhook watsap.id
  console.log('\n--- 7. Testing Webhook POST /api/webhooks/watsap ---')
  const webhookMsgId = `hook_${Date.now()}`
  const webhookBody = {
    providerMsgId: webhookMsgId,
    campaignId: createdCampId,
    status: 'delivered',
    phone: targetPhone,
  }
  const payloadStr = JSON.stringify(webhookBody)
  const validSignature = crypto.createHmac('sha256', WATSAP_SECRET).update(payloadStr).digest('hex')

  // Valid webhook call
  const hookRes = await fetch(`${BASE_URL}/api/webhooks/watsap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Watsap-Signature': validSignature,
    },
    body: payloadStr,
  })
  const hookData = await hookRes.json()
  assert(hookRes.status === 200 && hookData.status === 'processed', 'Webhook valid diproses status 200')

  // Duplicate webhook call (Idempotency)
  const dupHookRes = await fetch(`${BASE_URL}/api/webhooks/watsap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Watsap-Signature': validSignature,
    },
    body: payloadStr,
  })
  const dupHookData = await dupHookRes.json()
  assert(dupHookRes.status === 200 && dupHookData.status === 'duplicate_event_ignored', 'Webhook ganda diabaikan tanpa menggandakan hitungan')

  // Invalid signature call
  const badHookRes = await fetch(`${BASE_URL}/api/webhooks/watsap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Watsap-Signature': 'invalid_signature_1234567890abcdef',
    },
    body: payloadStr,
  })
  assert(badHookRes.status === 401, 'Webhook signature salah ditolak status 401')

  // Mock simulation mode
  const mockHookRes = await fetch(`${BASE_URL}/api/webhooks/watsap?mock=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: createdCampId, sampleSize: 100 }),
  })
  const mockHookData = await mockHookRes.json()
  assert(
    mockHookRes.status === 200 &&
      mockHookData.simulation.delivered === 90 &&
      mockHookData.simulation.read === 40,
    'Mode mock mensimulasikan delivered 90% dan read 40%'
  )

  // Inbound "STOP" opt-out test
  const stopPayload = JSON.stringify({ phone: targetPhone, text: 'STOP' })
  const stopSig = crypto.createHmac('sha256', WATSAP_SECRET).update(stopPayload).digest('hex')
  await fetch(`${BASE_URL}/api/webhooks/watsap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Watsap-Signature': stopSig,
    },
    body: stopPayload,
  })
  const updatedTarget = await prisma.target.findUnique({ where: { phone: targetPhone } })
  assert(updatedTarget && updatedTarget.optOut === true, 'Balasan "STOP" otomatis menandai target opt-out')

  // 8. Bulk Delete Protection
  console.log('\n--- 8. Testing Bulk Delete Protection ---')
  const badBulk1 = await fetch(`${BASE_URL}/api/admin/targets/bulk-delete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmText: 'SALAH', password: 'AdminPassword123!' }),
  })
  assert(badBulk1.status === 400, 'Bulk delete tanpa confirmText="HAPUS" ditolak 400')

  const badBulk2 = await fetch(`${BASE_URL}/api/admin/targets/bulk-delete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmText: 'HAPUS', password: 'WrongPassword' }),
  })
  assert(badBulk2.status === 403, 'Bulk delete dengan password salah ditolak 403')

  // 9. Member RiskAck Requirement on Campaign Join
  console.log('\n--- 9. Testing Member RiskAck Requirement ---')
  // Buat perangkat aktif untuk member
  const memberDevice = await prisma.device.create({
    data: {
      userId: memberUser.id,
      phone: `62811${Date.now().toString().slice(-7)}`,
      status: 'connected',
    },
  })

  // Pastikan kampanye status active
  await prisma.blastCampaign.update({
    where: { id: createdCampId },
    data: { status: 'running' },
  })

  // Member join tanpa RiskAck -> wajib ditolak 403 RISK_ACK_REQUIRED
  await prisma.riskAck.deleteMany({ where: { userId: memberUser.id } })
  const joinWithoutAckRes = await fetch(`${BASE_URL}/api/member/blast/campaigns/${createdCampId}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${memberToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deviceId: memberDevice.id }),
  })
  const joinWithoutAckData = await joinWithoutAckRes.json()
  assert(
    joinWithoutAckRes.status === 403 && joinWithoutAckData.code === 'RISK_ACK_REQUIRED',
    'Member wajib menyetujui Pernyataan Risiko (RiskAck) sebelum ikut kampanye blast'
  )

  // Member menyetujui RiskAck
  const ackRes = await fetch(`${BASE_URL}/api/member/blast/risk-ack`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${memberToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version: '1.0' }),
  })
  assert(ackRes.status === 200, 'Member berhasil menyetujui Pernyataan Risiko (POST /blast/risk-ack)')

  // Member join setelah RiskAck disetujui -> berhasil
  const joinWithAckRes = await fetch(`${BASE_URL}/api/member/blast/campaigns/${createdCampId}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${memberToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deviceId: memberDevice.id }),
  })
  assert(joinWithAckRes.status === 200, 'Member berhasil join kampanye setelah RiskAck disetujui')

  // 10. Backup & Restore Endpoints
  console.log('\n--- 10. Testing Backup & Restore Endpoints ---')
  const backupApiRes = await fetch(`${BASE_URL}/api/admin/backups`, {
    method: 'POST',
    headers,
  })
  const backupApiData = await backupApiRes.json()
  assert(backupApiRes.status === 201 && backupApiData.backup, 'POST /api/admin/backups status 201 (superadmin)')
  const backupId = backupApiData.backup.id

  const backupListRes = await fetch(`${BASE_URL}/api/admin/backups`, { headers })
  const backupListData = await backupListRes.json()
  assert(backupListRes.status === 200 && Array.isArray(backupListData.backups), 'GET /api/admin/backups list 200')

  // Download tanpa password ditolak
  const downloadNoPassRes = await fetch(`${BASE_URL}/api/admin/backups/${backupId}/download`, { headers })
  assert(downloadNoPassRes.status === 401, 'Download backup tanpa password ulang ditolak 401')

  // Restore tanpa mode maintenance ditolak
  await prisma.featureFlag.upsert({
    where: { key: 'maintenance_mode' },
    update: { enabled: false },
    create: { key: 'maintenance_mode', enabled: false },
  })
  const restoreNoMaintRes = await fetch(`${BASE_URL}/api/admin/backups/${backupId}/restore`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      password: 'AdminPassword123!',
      confirmText: 'PULIHKAN',
    }),
  })
  assert(restoreNoMaintRes.status === 400, 'Restore tanpa mode maintenance aktif ditolak 400')

  // Clean up test data
  try {
    await prisma.campaignParticipation.deleteMany({ where: { campaignId: createdCampId } })
    await prisma.blastTask.deleteMany({ where: { campaignId: createdCampId } })
    await prisma.messageEvent.deleteMany({ where: { campaignId: createdCampId } })
    await prisma.blastCampaign.delete({ where: { id: createdCampId } })
    await prisma.messageTemplate.delete({ where: { id: createdTplId } })
    await prisma.target.deleteMany({ where: { categoryId: createdCatId } })
    await prisma.contactCategory.delete({ where: { id: createdCatId } })
    await prisma.device.delete({ where: { id: memberDevice.id } })
    await prisma.backupFile.delete({ where: { id: backupId } })
  } catch (_) {}

  console.log('\n====================================================')
  console.log(`🏁 HASIL AKHIR PENGUJIAN HTTP: ${passed} BERHASIL, ${failed} GAGAL`)
  console.log('====================================================')

  if (failed === 0) {
    console.log('🎉 SEMUA ENDPOINT HTTP PANEL ADMIN LOLOS VERIFIKASI DENGAN SEMPURNA!\n')
    process.exit(0)
  } else {
    console.error('❌ TERDAPAT PENGUJIAN HTTP YANG GAGAL.\n')
    process.exit(1)
  }
}

runHttpTests().catch((e) => {
  console.error('Fatal error dalam pengujian HTTP:', e)
  process.exit(1)
})
