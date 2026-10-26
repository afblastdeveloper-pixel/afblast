const crypto = require('crypto')
const { redis, createRedisClient } = require('../config/redis')
const { hasPermission } = require('../config/permissions')

const REDIS_CHANNEL = 'afblast:channel:sse'
const TICKET_PREFIX = 'afblast:sse:ticket:'
const TICKET_TTL_SECONDS = 30

// Client storage: Map<clientId, { res, user, permissions }>
const clients = new Map()

// Throttle storage: eventType -> { timeoutId, lastTime, pendingData }
const throttleMap = new Map()

// Setup Redis subscriber
let subClient = null
try {
  subClient = createRedisClient()
  subClient.subscribe(REDIS_CHANNEL, (err) => {
    if (err) {
      console.warn('[SSE] Gagal subscribe ke Redis channel:', err.message)
    } else {
      console.log(`[SSE] Berlangganan Redis channel: ${REDIS_CHANNEL}`)
    }
  })

  subClient.on('message', (channel, message) => {
    if (channel === REDIS_CHANNEL) {
      try {
        const { eventType, payload } = JSON.parse(message)
        dispatchToClients(eventType, payload)
      } catch (e) {
        console.warn('[SSE] Parse message error:', e.message)
      }
    }
  })
} catch (err) {
  console.warn('[SSE] Subscriber init deferred:', err.message)
}

/**
 * Buat tiket sekali pakai (30 detik)
 * @param {Object} user
 * @param {string[]} permissions
 * @param {string} audience - 'admin' | 'member'
 * @returns {Promise<string>} ticketId
 */
async function createTicket(user, permissions = [], audience = 'admin') {
  const ticket = crypto.randomBytes(24).toString('hex')
  const data = JSON.stringify({
    userId: user.id,
    role: user.role,
    name: user.name,
    audience,
    permissions,
  })

  await redis.setex(`${TICKET_PREFIX}${ticket}`, TICKET_TTL_SECONDS, data)
  return ticket
}

/**
 * Validasi dan konsumsi tiket sekali pakai (Atomic via Lua Script kompatibel Redis 5+)
 * @param {string} ticket
 * @returns {Promise<Object|null>}
 */
async function consumeTicket(ticket) {
  if (!ticket) return null
  const key = `${TICKET_PREFIX}${ticket}`
  const luaScript = `
    local val = redis.call('get', KEYS[1])
    if val then
      redis.call('del', KEYS[1])
    end
    return val
  `
  try {
    const raw = await redis.eval(luaScript, 1, key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[SSE] Error consumeTicket:', err.message)
    return null
  }
}

/**
 * Registrasi koneksi SSE klien
 * @param {Object} req
 * @param {Object} res
 * @param {Object} clientData
 * @param {number|null} customHeartbeatMs - Opsional interval heartbeat (default 20s untuk member, 25s untuk admin)
 */
function handleStreamConnection(req, res, clientData, customHeartbeatMs = null) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })

  const clientId = `${clientData.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const clientInfo = {
    id: clientId,
    res,
    user: clientData,
    role: clientData.role,
    audience: clientData.audience || (clientData.role === 'user' ? 'member' : 'admin'),
    permissions: clientData.permissions || [],
  }

  clients.set(clientId, clientInfo)
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, role: clientData.role })}\n\n`)

  // Jika klien adalah member, kirim state pool.stats awal segera
  if (clientInfo.audience === 'member' || clientData.role === 'user') {
    const targetStatsService = require('../services/targetStats.service')
    targetStatsService
      .getMemberPoolSummary()
      .then((summary) => {
        try {
          res.write(`event: pool.stats\ndata: ${JSON.stringify(summary)}\n\n`)
        } catch (e) {}
      })
      .catch(() => {})
  }

  // Heartbeat ping: 20 detik untuk member, 25 detik untuk admin
  const heartbeatMs =
    customHeartbeatMs || (clientInfo.audience === 'member' || clientData.role === 'user' ? 20000 : 25000)

  const keepAliveTimer = setInterval(() => {
    res.write(': ping\n\n')
  }, heartbeatMs)

  req.on('close', () => {
    clearInterval(keepAliveTimer)
    clients.delete(clientId)
  })
}

/**
 * Cek apakah klien berhak menerima event tertentu
 * - Member: pool.stats, device.status, device.progress, engine.stopped (hanya milik user sendiri)
 * - Admin Finance: HANYA event keuangan (withdrawal.changed, dan dashboard.stats varian finance)
 */
function isClientAuthorizedForEvent(client, eventType, payload = {}) {
  const { role, permissions, audience, user } = client

  // Event pool.stats dibuka untuk seluruh member dan admin
  if (eventType === 'pool.stats') {
    return true
  }

  // Event realtime per member
  const memberAllowedEvents = ['device.status', 'device.progress', 'engine.stopped']
  if (memberAllowedEvents.includes(eventType)) {
    if (audience === 'member' || role === 'user') {
      if (payload && payload.userId && payload.userId !== user.userId) {
        return false
      }
      return true
    }
    // Superadmin dan Developer juga boleh melihat status engine perangkat
    return role === 'superadmin' || role === 'developer' || hasPermission(permissions, 'device.view')
  }

  // Jika koneksi khusus audiens member, tolak event selain yang diizinkan di atas
  if (audience === 'member' || role === 'user') {
    return false
  }

  // Admin finance: eksklusif keuangan
  if (role === 'adminfinance') {
    if (eventType === 'withdrawal.changed') return true
    if (eventType === 'dashboard.stats') return true
    return false
  }

  // Event permissions check
  switch (eventType) {
    case 'withdrawal.changed':
      return hasPermission(permissions, 'withdrawal.view') || role === 'superadmin'
    case 'device.changed':
      return hasPermission(permissions, 'device.view') || role === 'superadmin' || role === 'developer'
    case 'campaign.progress':
      return hasPermission(permissions, 'campaign.view') || role === 'superadmin' || role === 'developer'
    case 'import.progress':
      return (
        hasPermission(permissions, 'target.view') ||
        hasPermission(permissions, 'target.manage') ||
        role === 'superadmin' ||
        role === 'developer'
      )
    case 'dashboard.stats':
      return hasPermission(permissions, 'dashboard.view') || role === 'superadmin' || role === 'developer'
    default:
      return role === 'superadmin'
  }
}

/**
 * Filter payload event khusus jika klien adalah Admin Finance
 */
function sanitizePayloadForClient(client, eventType, payload) {
  if (client.role === 'adminfinance' && eventType === 'dashboard.stats') {
    return {
      pendingWithdrawals: payload.pendingWithdrawals,
      memberIncomeTotal: payload.memberIncomeTotal,
      withdrawnTotal: payload.withdrawnTotal,
      activeBalance: payload.activeBalance,
      withdrawnPercentage: payload.withdrawnPercentage,
      timestamp: payload.timestamp,
    }
  }
  return payload
}

/**
 * Kirim event ke seluruh klien lokal yang terhubung dan memiliki izin
 */
function dispatchToClients(eventType, payload) {
  for (const client of clients.values()) {
    if (isClientAuthorizedForEvent(client, eventType, payload)) {
      const dataToSend = sanitizePayloadForClient(client, eventType, payload)
      try {
        client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(dataToSend)}\n\n`)
      } catch (err) {
        clients.delete(client.id)
      }
    }
  }
}

/**
 * Publikasikan event melalui Redis Pub/Sub dengan throttle 1 detik per jenis event
 * @param {string} eventType
 * @param {Object} payload
 */
function publishAdminEvent(eventType, payload) {
  const now = Date.now()
  const current = throttleMap.get(eventType) || { timeoutId: null, lastTime: 0, pendingData: null }

  current.pendingData = payload

  // Jika sudah lebih dari 1 detik sejak publikasi terakhir dan tidak ada pending timer
  if (now - current.lastTime >= 1000 && !current.timeoutId) {
    current.lastTime = now
    sendOverRedis(eventType, payload)
    throttleMap.set(eventType, current)
  } else if (!current.timeoutId) {
    // Jadwalkan pengiriman pada batas jendela 1 detik
    const waitTime = Math.max(50, 1000 - (now - current.lastTime))
    current.timeoutId = setTimeout(() => {
      current.timeoutId = null
      current.lastTime = Date.now()
      if (current.pendingData) {
        sendOverRedis(eventType, current.pendingData)
      }
    }, waitTime)
    throttleMap.set(eventType, current)
  }
}

/**
 * Publikasikan event untuk member tertentu (throttled 1 detik per userId + eventType)
 * Memastikan tidak ada nomor telepon lengkap dalam payload
 */
function publishMemberEvent(userId, eventType, payload) {
  const cleanPayload = { ...payload, userId }
  if (cleanPayload.phone) {
    // Masking jika ada nomor telepon
    const p = String(cleanPayload.phone)
    cleanPayload.phone = p.length > 7 ? `${p.slice(0, 4)}****${p.slice(-3)}` : '****'
  }

  const throttleKey = `${eventType}:${userId}`
  const now = Date.now()
  const current = throttleMap.get(throttleKey) || { timeoutId: null, lastTime: 0, pendingData: null }

  current.pendingData = cleanPayload

  if (now - current.lastTime >= 1000 && !current.timeoutId) {
    current.lastTime = now
    sendOverRedis(eventType, cleanPayload)
    throttleMap.set(throttleKey, current)
  } else if (!current.timeoutId) {
    const waitTime = Math.max(50, 1000 - (now - current.lastTime))
    current.timeoutId = setTimeout(() => {
      current.timeoutId = null
      current.lastTime = Date.now()
      if (current.pendingData) {
        sendOverRedis(eventType, current.pendingData)
      }
    }, waitTime)
    throttleMap.set(throttleKey, current)
  }
}

function sendOverRedis(eventType, payload) {
  try {
    const message = JSON.stringify({
      eventType,
      payload,
      timestamp: Date.now(),
    })
    redis.publish(REDIS_CHANNEL, message).catch((e) => {
      console.warn('[SSE] Redis publish error:', e.message)
    })
  } catch (err) {
    console.warn('[SSE] Serialize error:', err.message)
  }
}

module.exports = {
  createTicket,
  consumeTicket,
  handleStreamConnection,
  publishAdminEvent,
  publishMemberEvent,
  isClientAuthorizedForEvent,
}

