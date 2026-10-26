/**
 * Test Suite Integrasi WAHA (WhatsApp HTTP API)
 * File: backend/scripts/test_waha_integration.js
 */

const assert = require('assert')
const http = require('http')
const prisma = require('../src/config/db')
const waha = require('../src/providers/waha')
const watsap = require('../src/providers/watsap')

let passed = 0
let failed = 0

function it(name, fn) {
  try {
    const res = fn()
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          console.log(`  ✓ ${name}`)
          passed++
        })
        .catch((err) => {
          console.error(`  ✗ ${name}:`, err.message)
          failed++
        })
    }
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message)
    failed++
  }
}

async function run() {
  console.log('=== TEST SUITE INTEGRASI WAHA ===\n')

  // 1. Helper formatting test
  await it('waha.formatChatId normalizes indonesian numbers to @c.us', () => {
    assert.strictEqual(waha.formatChatId('081234567890'), '6281234567890@c.us')
    assert.strictEqual(waha.formatChatId('6281234567890'), '6281234567890@c.us')
    assert.strictEqual(waha.formatChatId('+62 812-3456-7890'), '6281234567890@c.us')
    assert.strictEqual(waha.formatChatId('81234567890'), '6281234567890@c.us')
  })

  await it('waha.cleanPhoneNumber normalizes to clean international digits', () => {
    assert.strictEqual(waha.cleanPhoneNumber('081234567890'), '6281234567890')
    assert.strictEqual(waha.cleanPhoneNumber('+62 812-3456-7890'), '6281234567890')
  })

  await it('waha.getSessionName formats device session properly', () => {
    assert.strictEqual(waha.getSessionName(42), 'device_42')
  })

  // 2. Provider delegation test
  await it('watsap provider detects isWahaMode when WA_PROVIDER=waha or WATSAP_MODE=waha', () => {
    const prevMode = process.env.WATSAP_MODE
    process.env.WATSAP_MODE = 'waha'
    assert.strictEqual(watsap.isWahaMode(), true)
    process.env.WATSAP_MODE = prevMode
  })

  // 3. Webhook endpoint test
  await it('POST /api/webhooks/waha accepts valid session.status event', async () => {
    // Ambil atau buat test device
    let testDevice = await prisma.device.findFirst({
      where: { deletedAt: null },
    })

    if (!testDevice) {
      const user = await prisma.user.findFirst()
      testDevice = await prisma.device.create({
        data: {
          userId: user.id,
          slotNumber: 999,
          phone: '628999999999',
          status: 'pending',
          engineState: 'idle',
        },
      })
    }

    const payload = JSON.stringify({
      event: 'session.status',
      session: `device_${testDevice.id}`,
      payload: {
        status: 'WORKING',
        me: { id: `${testDevice.phone || '62811223344'}@c.us` },
      },
    })

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 4000,
          path: '/api/webhooks/waha',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (r) => {
          let body = ''
          r.on('data', (c) => (body += c))
          r.on('end', () => resolve({ status: r.statusCode, body }))
        }
      )
      req.on('error', reject)
      req.write(payload)
      req.end()
    })

    assert.strictEqual(res.status, 200)
    const json = JSON.parse(res.body)
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.action, 'device_connected')

    // Verify DB updated
    const updated = await prisma.device.findUnique({ where: { id: testDevice.id } })
    assert.strictEqual(updated.status, 'connected')
  })

  await it('POST /api/webhooks/waha handles STOPPED / disconnected event', async () => {
    const testDevice = await prisma.device.findFirst({ where: { deletedAt: null } })
    const payload = JSON.stringify({
      event: 'session.status',
      session: `device_${testDevice.id}`,
      payload: {
        status: 'STOPPED',
      },
    })

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 4000,
          path: '/api/webhooks/waha',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (r) => {
          let body = ''
          r.on('data', (c) => (body += c))
          r.on('end', () => resolve({ status: r.statusCode, body }))
        }
      )
      req.on('error', reject)
      req.write(payload)
      req.end()
    })

    assert.strictEqual(res.status, 200)
    const json = JSON.parse(res.body)
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.action, 'device_disconnected')

    const updated = await prisma.device.findUnique({ where: { id: testDevice.id } })
    assert.strictEqual(updated.status, 'disconnected')
  })

  await it('POST /api/webhooks/waha handles FAILED / logged_out event', async () => {
    const testDevice = await prisma.device.findFirst({ where: { deletedAt: null } })
    const payload = JSON.stringify({
      event: 'session.status',
      session: `device_${testDevice.id}`,
      payload: {
        status: 'FAILED',
      },
    })

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 4000,
          path: '/api/webhooks/waha',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (r) => {
          let body = ''
          r.on('data', (c) => (body += c))
          r.on('end', () => resolve({ status: r.statusCode, body }))
        }
      )
      req.on('error', reject)
      req.write(payload)
      req.end()
    })

    assert.strictEqual(res.status, 200)
    const json = JSON.parse(res.body)
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.action, 'device_logged_out')

    const updated = await prisma.device.findUnique({ where: { id: testDevice.id } })
    assert.strictEqual(updated.status, 'logged_out')
    assert.strictEqual(updated.disconnectedReason, 'logout')
  })

  console.log(`\n=== HASIL: ${passed} Passed, ${failed} Failed ===`)
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
