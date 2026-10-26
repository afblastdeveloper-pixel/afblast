const { redis } = require('../config/redis')
const prisma = require('../config/db')

const STATUS_KEYS = ['none', 'queued', 'active', 'success', 'failed']
const KEY_PREFIX = 'afblast:counters:target'
const KEY_TOTAL = `${KEY_PREFIX}:total`
const KEY_CATEGORY_PREFIX = 'afblast:counters:category'

/**
 * Pastikan counter di Redis terinisialisasi.
 * Jika belum ada, baca sekali dari DB lalu set ke Redis.
 */
async function ensureInitialized() {
  try {
    const exists = await redis.exists(KEY_TOTAL)
    if (!exists) {
      await reconcileDaily()
    }
  } catch (error) {
    console.warn('ensureInitialized warning:', error.message)
  }
}

/**
 * Ambil ringkasan counter target dari Redis tanpa melakukan COUNT(*) pada jutaan baris DB
 */
async function getTargetCounters() {
  try {
    await ensureInitialized()
    const pipeline = redis.pipeline()
    pipeline.get(KEY_TOTAL)
    for (const status of STATUS_KEYS) {
      pipeline.get(`${KEY_PREFIX}:${status}`)
    }
    const results = await pipeline.exec()

    const totalUpload = parseInt(results[0][1] || '0', 10)
    const none = parseInt(results[1][1] || '0', 10)
    const queued = parseInt(results[2][1] || '0', 10)
    const active = parseInt(results[3][1] || '0', 10)
    const success = parseInt(results[4][1] || '0', 10)
    const failed = parseInt(results[5][1] || '0', 10)

    const finished = success + failed
    const successRate = finished > 0 ? parseFloat(((success / finished) * 100).toFixed(2)) : 0

    return {
      totalUpload,
      none,
      queue: queued,
      active,
      success,
      failed,
      successRate,
    }
  } catch (error) {
    console.error('Error getTargetCounters:', error.message)
    return {
      totalUpload: 0,
      none: 0,
      queue: 0,
      active: 0,
      success: 0,
      failed: 0,
      successRate: 0,
    }
  }
}

/**
 * Increment / decrement counter saat tambah atau hapus target
 */
async function incrementCounters({ categoryId, queueStatus = 'none', delta = 1 }) {
  if (delta === 0) return
  try {
    const pipeline = redis.pipeline()
    pipeline.incrby(KEY_TOTAL, delta)
    pipeline.incrby(`${KEY_PREFIX}:${queueStatus}`, delta)
    if (categoryId) {
      pipeline.incrby(`${KEY_CATEGORY_PREFIX}:${categoryId}`, delta)
    }
    await pipeline.exec()

    // Perbarui counter di tabel ContactCategory
    if (categoryId) {
      await prisma.contactCategory.update({
        where: { id: categoryId },
        data: {
          totalContacts: {
            increment: delta,
          },
        },
      }).catch((e) => console.warn('Failed to update category totalContacts:', e.message))
    }
  } catch (error) {
    console.warn('incrementCounters error:', error.message)
  }
}

/**
 * Transisi status target (misal dari queued -> active, atau active -> success)
 */
async function transitionStatus({ fromStatus, toStatus, count = 1 }) {
  if (fromStatus === toStatus || count <= 0) return
  try {
    const pipeline = redis.pipeline()
    pipeline.decrby(`${KEY_PREFIX}:${fromStatus}`, count)
    pipeline.incrby(`${KEY_PREFIX}:${toStatus}`, count)
    await pipeline.exec()
  } catch (error) {
    console.warn('transitionStatus error:', error.message)
  }
}

/**
 * Bulk adjustment untuk import CSV atau bulk delete
 */
async function bulkAdjust({ categoryId, addedCount = 0, addedStatus = 'none', removedCount = 0, removedStatus = 'none' }) {
  try {
    const pipeline = redis.pipeline()
    if (addedCount > 0) {
      pipeline.incrby(KEY_TOTAL, addedCount)
      pipeline.incrby(`${KEY_PREFIX}:${addedStatus}`, addedCount)
      if (categoryId) {
        pipeline.incrby(`${KEY_CATEGORY_PREFIX}:${categoryId}`, addedCount)
      }
    }
    if (removedCount > 0) {
      pipeline.decrby(KEY_TOTAL, removedCount)
      pipeline.decrby(`${KEY_PREFIX}:${removedStatus}`, removedCount)
      if (categoryId) {
        pipeline.decrby(`${KEY_CATEGORY_PREFIX}:${categoryId}`, removedCount)
      }
    }
    await pipeline.exec()

    if (categoryId && (addedCount > 0 || removedCount > 0)) {
      const net = addedCount - removedCount
      await prisma.contactCategory.update({
        where: { id: categoryId },
        data: {
          totalContacts: {
            increment: net,
          },
        },
      }).catch((e) => console.warn('bulkAdjust category update error:', e.message))
    }
  } catch (error) {
    console.warn('bulkAdjust error:', error.message)
  }
}

/**
 * Rekonsiliasi harian untuk menjamin integritas data (Daily Reconciliation Job).
 * Menghitung via group by berindeks (categoryId, queueStatus) dan menyinkronkan counter Redis & tabel.
 */
async function reconcileDaily() {
  try {
    console.log('[CounterManager] Memulai rekonsiliasi harian counter...')
    const counts = await prisma.target.groupBy({
      by: ['queueStatus'],
      _count: {
        id: true,
      },
    })

    const statusCounts = {
      none: 0,
      queued: 0,
      active: 0,
      success: 0,
      failed: 0,
    }
    let total = 0

    for (const row of counts) {
      const st = row.queueStatus
      const c = row._count.id
      if (statusCounts[st] !== undefined) {
        statusCounts[st] = c
      }
      total += c
    }

    const pipeline = redis.pipeline()
    pipeline.set(KEY_TOTAL, total)
    for (const [st, val] of Object.entries(statusCounts)) {
      pipeline.set(`${KEY_PREFIX}:${st}`, val)
    }

    // Rekonsiliasi per kategori
    const catCounts = await prisma.target.groupBy({
      by: ['categoryId'],
      _count: {
        id: true,
      },
    })

    const catMap = new Map()
    for (const row of catCounts) {
      catMap.set(row.categoryId, row._count.id)
      pipeline.set(`${KEY_CATEGORY_PREFIX}:${row.categoryId}`, row._count.id)
    }

    await pipeline.exec()

    // Sinkronkan ke tabel ContactCategory
    const allCategories = await prisma.contactCategory.findMany({ select: { id: true } })
    for (const cat of allCategories) {
      const realTotal = catMap.get(cat.id) || 0
      await prisma.contactCategory.update({
        where: { id: cat.id },
        data: { totalContacts: realTotal },
      })
    }

    console.log(`[CounterManager] Rekonsiliasi selesai. Total target: ${total}`)
    return { total, statusCounts }
  } catch (error) {
    console.error('[CounterManager] Rekonsiliasi gagal:', error.message)
    throw error
  }
}

module.exports = {
  ensureInitialized,
  getTargetCounters,
  incrementCounters,
  transitionStatus,
  bulkAdjust,
  reconcileDaily,
}
