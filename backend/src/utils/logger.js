const prisma = require('../config/db')

/**
 * Mencatat aktivitas staf ke tabel activity_logs
 * @param {Object} options
 * @param {number|null} [options.userId]
 * @param {string|null} [options.adminName]
 * @param {string} options.action
 * @param {string|null} [options.target]
 * @param {string|null} [options.details]
 * @param {string|null} [options.ipAddress]
 * @param {string} [options.status='success']
 */
async function logActivity({
  userId = null,
  adminName = null,
  action,
  target = null,
  details = null,
  ipAddress = null,
  status = 'success',
}) {
  try {
    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : details

    return await prisma.activityLog.create({
      data: {
        userId,
        adminName,
        action,
        target,
        details: detailsStr,
        ipAddress,
        status,
      },
    })
  } catch (error) {
    console.error('Failed to write activity log:', error.message)
    return null
  }
}

/**
 * Helper untuk mengekstrak IP client dari request Express
 */
function getClientIp(req) {
  if (!req) return null
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  )
}

module.exports = {
  logActivity,
  getClientIp,
}
