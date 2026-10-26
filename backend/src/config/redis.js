const Redis = require('ioredis')

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000)
    return delay
  },
}

const redis = new Redis(redisOptions)

redis.on('error', (err) => {
  console.warn('Redis client error:', err.message)
})

function createRedisClient() {
  const client = new Redis(redisOptions)
  client.on('error', (err) => {
    console.warn('Redis client sub/pub error:', err.message)
  })
  return client
}

module.exports = {
  redis,
  redisOptions,
  createRedisClient,
}
