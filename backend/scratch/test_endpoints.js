process.env.PORT = '4099'
const prisma = require('../src/config/db')
const server = require('../src/server')

async function testEndpoints() {
  console.log('Testing Express endpoints...')
  await new Promise((resolve) => setTimeout(resolve, 1000))

  try {
    // 1. Dapatkan token member dan token admin
    const member = await prisma.user.findFirst({ where: { role: 'user' } })
    const admin = await prisma.user.findFirst({ where: { role: 'superadmin' } })

    const jwt = require('jsonwebtoken')
    const JWT_SECRET = process.env.JWT_SECRET || 'secret'

    const memberToken = jwt.sign(
      { id: member.id, email: member.email, role: 'user', aud: 'member' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    const adminToken = jwt.sign(
      { id: admin.id, email: admin.email, role: 'superadmin', aud: 'staff' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    // Test GET /api/member/pool/summary
    const resPool = await fetch('http://localhost:4099/api/member/pool/summary', {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    const poolData = await resPool.json()
    console.log('GET /api/member/pool/summary status:', resPool.status, poolData)

    if (resPool.status !== 200 || typeof poolData.remaining !== 'number') {
      throw new Error('GET /api/member/pool/summary failed')
    }

    // Test POST /api/member/stream/ticket
    const resTicket = await fetch('http://localhost:4099/api/member/stream/ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    const ticketData = await resTicket.json()
    console.log('POST /api/member/stream/ticket status:', resTicket.status, ticketData)

    if (resTicket.status !== 200 || !ticketData.ticket) {
      throw new Error('POST /api/member/stream/ticket failed')
    }

    // Test GET /api/member/whatsapp/summary
    const resWa = await fetch('http://localhost:4099/api/member/whatsapp/summary', {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    const waData = await resWa.json()
    console.log('GET /api/member/whatsapp/summary status:', resWa.status, {
      remainingData: waData.remainingData,
      participationCampaigns: waData.performance?.participationCampaigns,
      participationProcessed: waData.performance?.participationProcessed,
    })

    if (
      resWa.status !== 200 ||
      typeof waData.remainingData !== 'number' ||
      typeof waData.performance?.participationCampaigns !== 'number' ||
      typeof waData.performance?.participationProcessed !== 'number'
    ) {
      throw new Error('GET /api/member/whatsapp/summary failed performance shape')
    }

    // Test POST /api/admin/targets/stats/recalculate
    const resRecalc = await fetch('http://localhost:4099/api/admin/targets/stats/recalculate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const recalcData = await resRecalc.json()
    console.log('POST /api/admin/targets/stats/recalculate status:', resRecalc.status, recalcData)

    if (resRecalc.status !== 200 || !recalcData.success) {
      throw new Error('POST /api/admin/targets/stats/recalculate failed')
    }

    console.log('\nSEMUA ENDPOINT HTTP BERJALAN SEMPURNA!')
  } finally {
    if (server && typeof server.close === 'function') {
      server.close()
    }
  }
}

testEndpoints()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('HTTP test error:', err)
    process.exit(1)
  })
