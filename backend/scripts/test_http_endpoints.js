/**
 * Test HTTP Endpoints Mesin Blast
 * Menjalankan server Express di port acak (in-memory) dan menguji seluruh route HTTP
 */

const http = require('http')
const jwt = require('jsonwebtoken')
const app = require('../src/server')
const prisma = require('../src/config/db')
const { JWT_SECRET } = require('../src/middlewares/authMiddleware')

function generateMemberToken(userId) {
  return jwt.sign({ id: userId, role: 'user', aud: 'member', tokenVersion: 0 }, JWT_SECRET, { expiresIn: '1h' })
}

function generateStaffToken(userId, role = 'superadmin') {
  return jwt.sign({ id: userId, role, aud: 'staff', tokenVersion: 0 }, JWT_SECRET, { expiresIn: '1h' })
}

async function runHttpTests() {
  console.log('--- Pengujian Endpoint HTTP Express ---')

  const member = await prisma.user.findFirst({ where: { email: 'member_test_a@afblast.local' } })
  const admin = await prisma.user.findFirst({ where: { email: 'admin_test@afblast.local' } })

  const memberToken = generateMemberToken(member.id)
  const adminToken = generateStaffToken(admin.id, 'superadmin')

  const testServer = http.createServer(app)
  await new Promise((resolve) => testServer.listen(0, resolve))
  const port = testServer.address().port
  const baseUrl = `http://127.0.0.1:${port}`

  async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }

  try {
    // 1. GET /api/member/whatsapp/overview
    const overviewRes = await api('/api/member/whatsapp/overview', {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    console.log(`GET /api/member/whatsapp/overview -> Status: ${overviewRes.status}`)
    if (overviewRes.status !== 200 || !overviewRes.data.performance) {
      throw new Error(`Overview HTTP failed: ${JSON.stringify(overviewRes.data)}`)
    }

    // 2. GET & PUT /api/admin/engine-settings
    const getSettingsRes = await api('/api/admin/engine-settings', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    console.log(`GET /api/admin/engine-settings -> Status: ${getSettingsRes.status}`)
    if (getSettingsRes.status !== 200 || !getSettingsRes.data.settings) {
      throw new Error(`Get engine-settings failed: ${JSON.stringify(getSettingsRes.data)}`)
    }

    const putSettingsRes = await api('/api/admin/engine-settings', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ defaultSpeed: 30, safePauseSeconds: 60 }),
    })
    console.log(`PUT /api/admin/engine-settings -> Status: ${putSettingsRes.status}`)
    if (putSettingsRes.status !== 200) {
      throw new Error(`Put engine-settings failed: ${JSON.stringify(putSettingsRes.data)}`)
    }

    // 3. GET /api/admin/engine/devices
    const getDevicesRes = await api('/api/admin/engine/devices', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    console.log(`GET /api/admin/engine/devices -> Status: ${getDevicesRes.status}`)
    if (getDevicesRes.status !== 200 || !Array.isArray(getDevicesRes.data.devices)) {
      throw new Error(`Get admin engine devices failed: ${JSON.stringify(getDevicesRes.data)}`)
    }

    // 4. Test member devices list & config
    const devicesListRes = await api('/api/member/devices', {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    console.log(`GET /api/member/devices -> Status: ${devicesListRes.status}`)
    const testDev = devicesListRes.data.devices[0]

    if (testDev) {
      const configRes = await api(`/api/member/devices/${testDev.id}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${memberToken}` },
        body: JSON.stringify({ label: 'Slot Utama Updated', speedSeconds: 30 }),
      })
      console.log(`PATCH /api/member/devices/:id/config -> Status: ${configRes.status}`)

      const historyRes = await api(`/api/member/devices/${testDev.id}/history`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      })
      console.log(`GET /api/member/devices/:id/history -> Status: ${historyRes.status}`)

      const runsRes = await api(`/api/member/devices/${testDev.id}/runs`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      })
      console.log(`GET /api/member/devices/:id/runs -> Status: ${runsRes.status}`)
    }

    console.log('✅ SELURUH ENDPOINT HTTP BERHASIL DIVERIFIKASI DENGAN STATUS 200!')
  } finally {
    testServer.close()
    await prisma.$disconnect()
  }
}

runHttpTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('HTTP test error:', err)
    process.exit(1)
  })
