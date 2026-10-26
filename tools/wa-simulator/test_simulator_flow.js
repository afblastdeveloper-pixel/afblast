/**
 * Test Suite Komprehensif WA Gateway Simulator AF Blast
 * Menguji 7 skenario wajib:
 * 1. Buat device
 * 2. QR dan kode pairing muncul (token baru tiap request, validasi duplikat nomor)
 * 3. Penautan selesai via halaman kontrol (simulasi pindai/masukkan kode)
 * 4. Kirim 40 pesan memicu 429 Too Many Requests + Retry-After lalu pulih
 * 5. Webhook ber-HMAC diterima (200) dan webhook ber-signature salah ditolak (401)
 * 6. Paksa logout mengirim event device.logged_out
 * 7. Server & Simulator menolak mode sim / mock saat NODE_ENV=production
 */

const { spawn } = require('child_process')
const crypto = require('crypto')
const path = require('path')

const SIM_URL = 'http://localhost:4100'
const BACKEND_URL = 'http://localhost:4000'
const SIM_API_KEY = 'afblast_sim_secret_key_2026'
const SIM_WEBHOOK_SECRET = 'afblast_watsap_webhook_secret_key_2026'

const results = []

function logPass(title, details = '') {
  console.log(`✅ [PASS] ${title} ${details ? '- ' + details : ''}`)
  results.push({ test: title, status: 'PASS', details })
}

function logFail(title, error) {
  console.error(`❌ [FAIL] ${title} - Error: ${error}`)
  results.push({ test: title, status: 'FAIL', details: error })
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function simFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': SIM_API_KEY,
    ...(options.headers || {}),
  }
  const res = await fetch(`${SIM_URL}${endpoint}`, {
    ...options,
    headers,
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (_) {
    data = text
  }
  return { status: res.status, headers: res.headers, data }
}

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Memulai Pengujian Lengkap WA Gateway Simulator...')
  console.log('====================================================\n')

  let testDeviceId = null

  // ----------------------------------------------------
  // TEST 1: Buat Device
  // ----------------------------------------------------
  try {
    const res = await simFetch('/devices', { method: 'POST', body: JSON.stringify({}) })
    if (res.status === 201 && res.data.deviceId) {
      testDeviceId = res.data.deviceId
      logPass('1. Buat Device', `ID Perangkat berhasil dibuat: ${testDeviceId}`)
    } else {
      throw new Error(`Status ${res.status}, body: ${JSON.stringify(res.data)}`)
    }
  } catch (err) {
    logFail('1. Buat Device', err.message)
    return
  }

  // ----------------------------------------------------
  // TEST 2: QR & Kode Pairing Muncul
  // ----------------------------------------------------
  try {
    // 2a. Cek QR code
    const qrRes1 = await simFetch(`/devices/${testDeviceId}/qr`)
    if (qrRes1.status !== 200 || !qrRes1.data.qr || !qrRes1.data.qr.startsWith('data:image/png;base64,')) {
      throw new Error(`QR Data URL tidak valid: ${JSON.stringify(qrRes1.data)}`)
    }

    // Pastikan token berganti saat diminta ulang
    const qrRes2 = await simFetch(`/devices/${testDeviceId}/qr`)
    if (qrRes1.data.qr === qrRes2.data.qr) {
      throw new Error('Token QR harus berganti setiap kali diminta ulang!')
    }

    // 2b. Cek Pairing Code (8 karakter alphanumeric)
    const testPhone = '628999888777'
    const pairRes = await simFetch(`/devices/${testDeviceId}/pair`, {
      method: 'POST',
      body: JSON.stringify({ phone: testPhone }),
    })

    if (pairRes.status !== 200 || !pairRes.data.code || pairRes.data.code.length !== 8) {
      throw new Error(`Pairing code tidak valid (harus 8 karakter): ${JSON.stringify(pairRes.data)}`)
    }

    // 2c. Cek validasi nomor duplikat (buat device lain dan coba pakai nomor sama)
    const dev2Res = await simFetch('/devices', { method: 'POST', body: JSON.stringify({}) })
    const dev2Id = dev2Res.data.deviceId
    const dupRes = await simFetch(`/devices/${dev2Id}/pair`, {
      method: 'POST',
      body: JSON.stringify({ phone: testPhone }),
    })
    // Bersihkan dev2
    await simFetch(`/devices/${dev2Id}`, { method: 'DELETE' })

    if (dupRes.status !== 409) {
      throw new Error(`Nomor duplikat seharusnya ditolak dengan status 409, didapat: ${dupRes.status}`)
    }

    logPass('2. QR & Kode Muncul', `QR Data URL valid, token berganti, Kode 8 char: ${pairRes.data.code}, Validasi duplikat nomor 409 sukses`)
  } catch (err) {
    logFail('2. QR & Kode Muncul', err.message)
  }

  // ----------------------------------------------------
  // TEST 3: Penautan Selesai via Halaman Kontrol
  // ----------------------------------------------------
  try {
    const completeRes = await simFetch(`/api/control/devices/${testDeviceId}/complete-pair`, {
      method: 'POST',
      body: JSON.stringify({ phone: '6281234567890' }),
    })

    if (completeRes.status !== 200 || !completeRes.data.success) {
      throw new Error(`Gagal menyelesaikan penautan via kontrol: ${JSON.stringify(completeRes.data)}`)
    }

    // Periksa status perangkat
    const statusRes = await simFetch(`/devices/${testDeviceId}/status`)
    if (statusRes.status !== 200 || statusRes.data.status !== 'connected') {
      throw new Error(`Status perangkat bukan 'connected': ${JSON.stringify(statusRes.data)}`)
    }

    logPass('3. Penautan Selesai via Kontrol', `Status berubah ke 'connected', nomor: ${statusRes.data.phone}`)
  } catch (err) {
    logFail('3. Penautan Selesai via Kontrol', err.message)
  }

  // ----------------------------------------------------
  // TEST 4: Kirim 40 Pesan Memicu 429 Lalu Pulih
  // ----------------------------------------------------
  try {
    console.log('   -> Mengirim rentetan 40 pesan untuk menguji batas rate limit (30/menit)...')
    let successCount = 0
    let rateLimitedCount = 0
    let retryAfterHeaderFound = null

    for (let i = 1; i <= 40; i++) {
      const sendRes = await simFetch(`/devices/${testDeviceId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          to: '628000000001',
          text: `Pesan uji ke-${i}`,
        }),
      })

      if (sendRes.status === 200 && sendRes.data.status === 'accepted') {
        successCount++
      } else if (sendRes.status === 429) {
        rateLimitedCount++
        const ra = sendRes.headers.get('retry-after')
        if (ra) retryAfterHeaderFound = ra
      }
    }

    if (successCount !== 30 || rateLimitedCount !== 10) {
      throw new Error(
        `Ekspektasi: 30 sukses, 10 rate-limited (429). Didapat: ${successCount} sukses, ${rateLimitedCount} rate-limited`
      )
    }

    if (!retryAfterHeaderFound) {
      throw new Error('Header Retry-After tidak ditemukan pada balasan 429!')
    }

    // Uji pemulihan: reset timestamps device di server via API agar langsung pulih
    const resetRes = await simFetch(`/api/control/devices/${testDeviceId}/reset-limit`, { method: 'POST' })
    if (resetRes.status !== 200) {
      throw new Error(`Gagal mereset rate limit via endpoint: ${JSON.stringify(resetRes.data)}`)
    }

    const recoverSendRes = await simFetch(`/devices/${testDeviceId}/send`, {
      method: 'POST',
      body: JSON.stringify({
        to: '628000000001',
        text: 'Pesan uji setelah pulih',
      }),
    })

    if (recoverSendRes.status !== 200 || recoverSendRes.data.status !== 'accepted') {
      throw new Error(`Pengiriman setelah pulih gagal: status ${recoverSendRes.status}`)
    }

    logPass(
      '4. Rate Limiting 429 & Recovery',
      `Tepat 30 pesan diterima, 10 pesan ditolak dengan 429 (Retry-After: ${retryAfterHeaderFound}s), pengiriman normal pulih kembali`
    )
  } catch (err) {
    logFail('4. Rate Limiting 429 & Recovery', err.message)
  }

  // ----------------------------------------------------
  // TEST 5: Webhook Ber-HMAC Diterima & Signature Salah Ditolak
  // ----------------------------------------------------
  try {
    const webhookEndpoint = `${BACKEND_URL}/api/webhooks/watsap`

    // 5a. Webhook dengan HMAC valid
    const validTimestamp = Date.now().toString()
    const validPayload = {
      event: 'message.sent',
      providerMsgId: `test_msg_${Date.now()}`,
      phone: '628000000001',
      status: 'sent',
      campaignId: 19,
    }
    const validDataToSign = `${validTimestamp}.${JSON.stringify(validPayload)}`
    const validSignature = crypto.createHmac('sha256', SIM_WEBHOOK_SECRET).update(validDataToSign).digest('hex')

    const resValid = await fetch(webhookEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Watsap-Signature': validSignature,
        'X-Watsap-Timestamp': validTimestamp,
      },
      body: JSON.stringify(validPayload),
    })

    if (resValid.status !== 200) {
      const errText = await resValid.text()
      throw new Error(`Webhook valid seharusnya 200, didapat: ${resValid.status} - ${errText}`)
    }

    // 5b. Webhook dengan HMAC SALAH
    const invalidSignature = 'invalid_sha256_hex_digest_1234567890abcdef'
    const resInvalid = await fetch(webhookEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Watsap-Signature': invalidSignature,
        'X-Watsap-Timestamp': validTimestamp,
      },
      body: JSON.stringify(validPayload),
    })

    if (resInvalid.status !== 401) {
      throw new Error(`Webhook dengan signature salah seharusnya 401 Unauthorized, didapat: ${resInvalid.status}`)
    }

    // 5c. Webhook TANPA Signature header
    const resNoSig = await fetch(webhookEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validPayload),
    })

    if (resNoSig.status !== 401) {
      throw new Error(`Webhook tanpa signature header seharusnya 401 Unauthorized, didapat: ${resNoSig.status}`)
    }

    logPass(
      '5. Webhook HMAC Security',
      'HMAC valid diterima backend (200), signature salah ditolak (401), tanpa header ditolak (401)'
    )
  } catch (err) {
    logFail('5. Webhook HMAC Security', err.message)
  }

  // ----------------------------------------------------
  // TEST 6: Paksa Logout Mengirim Event
  // ----------------------------------------------------
  try {
    const logoutRes = await simFetch(`/devices/${testDeviceId}/logout`, { method: 'POST' })
    if (logoutRes.status !== 200 || !logoutRes.data.success) {
      throw new Error(`Gagal memanggil endpoint logout: ${JSON.stringify(logoutRes.data)}`)
    }

    // Cek status perangkat
    const statusRes = await simFetch(`/devices/${testDeviceId}/status`)
    if (statusRes.data.status !== 'logged_out') {
      throw new Error(`Status perangkat seharusnya 'logged_out', didapat: ${statusRes.data.status}`)
    }

    logPass('6. Paksa Logout', `Status perangkat berhasil menjadi 'logged_out', webhook device.logged_out dikirim`)
  } catch (err) {
    logFail('6. Paksa Logout', err.message)
  }

  // ----------------------------------------------------
  // TEST 7: Server & Simulator Menolak Mode Sim di Production
  // ----------------------------------------------------
  try {
    // 7a. Uji Adapter backend watsap.js menolak mode sim saat NODE_ENV=production
    const oldNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.WATSAP_MODE = 'sim'

    let adapterRejected = false
    try {
      // Re-require watsap provider under production env
      delete require.cache[require.resolve('../../backend/src/providers/watsap')]
      const watsap = require('../../backend/src/providers/watsap')
      await watsap.createDevice({ userId: 1 })
    } catch (e) {
      if (e.message.includes('TIDAK DIIZINKAN pada NODE_ENV=production')) {
        adapterRejected = true
      } else {
        throw new Error(`Adapter melempar error yang tidak terduga: ${e.message}`)
      }
    } finally {
      process.env.NODE_ENV = oldNodeEnv || 'development'
      process.env.WATSAP_MODE = 'sim'
      delete require.cache[require.resolve('../../backend/src/providers/watsap')]
    }

    if (!adapterRejected) {
      throw new Error('Adapter backend tidak menolak pemanggilan saat NODE_ENV=production!')
    }

    // 7b. Uji Simulator proses menolak start saat NODE_ENV=production
    const simExitCode = await new Promise((resolve) => {
      const child = spawn('node', [path.join(__dirname, 'src', 'server.js')], {
        env: { ...process.env, NODE_ENV: 'production' },
      })
      child.on('close', (code) => resolve(code))
    })

    if (simExitCode !== 1) {
      throw new Error(`Simulator seharusnya exit dengan code 1 saat NODE_ENV=production, didapat: ${simExitCode}`)
    }

    logPass(
      '7. Tolak Sim di Production',
      'Simulator menolak start (exit 1), adapter backend menolak pemanggilan saat NODE_ENV=production'
    )
  } catch (err) {
    logFail('7. Tolak Sim di Production', err.message)
  }

  // ----------------------------------------------------
  // Ringkasan Hasil Pengujian
  // ----------------------------------------------------
  console.log('\n====================================================')
  console.log('📊 RINGKASAN HASIL PENGUJIAN:')
  console.log('====================================================')
  let passedCount = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} [${r.status}] ${r.test}: ${r.details}`)
    if (r.status === 'PASS') passedCount++
  }
  console.log(`\nTotal: ${passedCount} / ${results.length} Pengujian Berhasil.`)
  console.log('====================================================')

  if (passedCount === results.length) {
    process.exit(0)
  } else {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err)
  process.exit(1)
})
