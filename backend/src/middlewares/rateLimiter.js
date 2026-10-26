/**
 * Lightweight In-Memory Rate Limiter Middleware
 * Membatasi frekuensi request berdasarkan IP atau userId
 */
function createRateLimiter({ windowMs = 60000, max = 5, message = 'Terlalu banyak permintaan. Silakan coba lagi nanti.' } = {}) {
  const requests = new Map()

  return (req, res, next) => {
    const key = (req.user && req.user.id) ? `user_${req.user.id}` : (req.ip || 'ip_unknown')
    const now = Date.now()

    const record = requests.get(key) || { count: 0, resetTime: now + windowMs }

    if (now > record.resetTime) {
      record.count = 1
      record.resetTime = now + windowMs
    } else {
      record.count += 1
    }

    requests.set(key, record)

    if (record.count > max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000)
      res.setHeader('Retry-After', retryAfterSec)
      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSec,
      })
    }

    next()
  }
}

module.exports = {
  createRateLimiter,
}
