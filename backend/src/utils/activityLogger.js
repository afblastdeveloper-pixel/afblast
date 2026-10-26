const prisma = require('../config/db')

/**
 * Mencatat aktivitas staf ke tabel activity_logs
 * @param {Object} params
 * @param {number|null} [params.userId]
 * @param {string|null} [params.adminName]
 * @param {string} params.action
 * @param {string|null} [params.target]
 * @param {string|null} [params.ipAddress]
 * @param {string} [params.status='success']
 * @param {string|null} [params.details]
 */
async function logActivity({
  userId = null,
  adminName = null,
  action,
  target = null,
  ipAddress = null,
  status = 'success',
  details = null,
}) {
  try {
    return await prisma.activityLog.create({
      data: {
        userId,
        adminName,
        action,
        target,
        ipAddress,
        status,
        details: typeof details === 'object' ? JSON.stringify(details) : details,
      },
    })
  } catch (error) {
    console.error('Gagal mencatat ActivityLog:', error.message)
    return null
  }
}

module.exports = {
  logActivity,
}
