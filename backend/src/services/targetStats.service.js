const prisma = require('../config/db')
const { redis } = require('../config/redis')

const CACHE_KEY_GLOBAL = 'afblast:cache:target_stats:global'
const CACHE_KEY_CATEGORIES = 'afblast:cache:target_stats:categories'
const CACHE_TTL_SECONDS = 5
const REDIS_CHANNEL = 'afblast:channel:sse'

let throttleTimer = null
let pendingBroadcast = false

/**
 * Service Tunggal TargetStats (src/services/targetStats.service.js)
 * SATU-SATUNYA sumber angka "Data Tersisa" di dashboard member dan semua statistik di dashboard admin.
 * Membaca data dari model CategoryStats (yang diperbarui secara atomik di dalam transaksi Prisma).
 */

/**
 * Invalidate Redis Cache saat ada penulisan / perubahan counter
 * Memicu broadcast pub/sub event 'pool.stats' ke SSE dengan throttle 2 detik
 */
async function invalidateStatsCache() {
  try {
    const pipeline = redis.pipeline()
    pipeline.del(CACHE_KEY_GLOBAL)
    pipeline.del(CACHE_KEY_CATEGORIES)
    await pipeline.exec()
  } catch (err) {
    console.warn('[TargetStatsService] Invalidate cache warning:', err.message)
  }

  // Throttle broadcast SSE pool.stats (2 detik)
  triggerThrottledPoolStatsBroadcast()
}

/**
 * Memicu broadcast event pool.stats ke channel Redis SSE dengan throttle 2 detik
 */
function triggerThrottledPoolStatsBroadcast() {
  if (throttleTimer) {
    pendingBroadcast = true
    return
  }

  // Kirim broadcast pertama
  broadcastPoolStats()

  throttleTimer = setTimeout(() => {
    throttleTimer = null
    if (pendingBroadcast) {
      pendingBroadcast = false
      broadcastPoolStats()
    }
  }, 2000)
}

/**
 * Broadcast event pool.stats ke Redis channel
 */
async function broadcastPoolStats() {
  try {
    const summary = await getMemberPoolSummary()
    const message = JSON.stringify({
      eventType: 'pool.stats',
      payload: summary,
    })
    await redis.publish(REDIS_CHANNEL, message)
  } catch (err) {
    // Abaikan error background pub/sub
  }
}

/**
 * Mengambil ringkasan statistik global dari seluruh kategori aktif (isActive = true)
 * Cache Redis 5 detik
 * @returns {Promise<Object>}
 */
async function getGlobalStats() {
  try {
    const cached = await redis.get(CACHE_KEY_GLOBAL)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (err) {
    // Fallback baca DB jika Redis error
  }

  // Baca seluruh CategoryStats yang kategorinya berstatus isActive = true
  const activeCategories = await prisma.contactCategory.findMany({
    where: { isActive: true },
    select: {
      id: true,
      stats: true,
    },
  })

  let total = 0
  let none = 0
  let queued = 0
  let active = 0
  let success = 0
  let failed = 0
  let draft = 0
  let optOut = 0

  for (const cat of activeCategories) {
    const s = cat.stats
    if (s) {
      total += s.total || 0
      none += s.none || 0
      queued += s.queued || 0
      active += s.active || 0
      success += s.success || 0
      failed += s.failed || 0
      draft += s.draft || 0
      optOut += s.optOut || 0
    }
  }

  // Definisi: "Tersisa" = queueStatus in (none, queued, active), bukan optOut
  // Dalam model CategoryStats: none + queued + active mewakili target yang belum selesai/gagal
  const remaining = Math.max(0, none + queued + active)
  const finished = success + failed
  const successRate = finished > 0 ? parseFloat(((success / finished) * 100).toFixed(2)) : 0

  const result = {
    total,
    none,
    queued,
    active,
    success,
    failed,
    draft,
    optOut,
    remaining,
    // Alias untuk kompatibilitas mundur frontend
    totalUpload: total,
    queue: queued,
    successRate,
    updatedAt: new Date().toISOString(),
  }

  try {
    await redis.setex(CACHE_KEY_GLOBAL, CACHE_TTL_SECONDS, JSON.stringify(result))
  } catch (err) {}

  return result
}

/**
 * Mengambil data statistik per kategori aktif
 * Cache Redis 5 detik
 * @param {number|null} categoryId
 * @returns {Promise<Array|Object>}
 */
async function getCategoryStats(categoryId = null) {
  if (categoryId) {
    const cat = await prisma.contactCategory.findUnique({
      where: { id: parseInt(categoryId, 10) },
      include: { stats: true },
    })
    if (!cat) return null
    const s = cat.stats || {}
    const remaining = cat.isActive ? Math.max(0, (s.none || 0) + (s.queued || 0) + (s.active || 0)) : 0
    return {
      categoryId: cat.id,
      name: cat.name,
      isActive: cat.isActive,
      total: s.total || 0,
      none: s.none || 0,
      queued: s.queued || 0,
      active: s.active || 0,
      success: s.success || 0,
      failed: s.failed || 0,
      draft: s.draft || 0,
      optOut: s.optOut || 0,
      remaining,
      ratePerMessage: cat.ratePerMessage,
      updatedAt: s.updatedAt || cat.updatedAt,
    }
  }

  try {
    const cached = await redis.get(CACHE_KEY_CATEGORIES)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (err) {}

  const categories = await prisma.contactCategory.findMany({
    where: { isActive: true },
    include: { stats: true },
    orderBy: { name: 'asc' },
  })

  const results = categories.map((cat) => {
    const s = cat.stats || {}
    const remaining = Math.max(0, (s.none || 0) + (s.queued || 0) + (s.active || 0))
    return {
      id: cat.id,
      name: cat.name,
      countryCode: cat.countryCode,
      ratePerMessage: cat.ratePerMessage,
      total: s.total || 0,
      none: s.none || 0,
      queued: s.queued || 0,
      active: s.active || 0,
      success: s.success || 0,
      failed: s.failed || 0,
      draft: s.draft || 0,
      optOut: s.optOut || 0,
      remaining,
      updatedAt: s.updatedAt || cat.updatedAt,
    }
  })

  try {
    await redis.setex(CACHE_KEY_CATEGORIES, CACHE_TTL_SECONDS, JSON.stringify(results))
  } catch (err) {}

  return results
}

/**
 * Ringkasan pool untuk member (GET /api/member/pool/summary)
 * Hanya memuat angka agregat, JANGAN pernah mengirim nomor telepon atau data kontak!
 * @returns {Promise<Object>}
 */
async function getMemberPoolSummary() {
  const global = await getGlobalStats()
  const categories = await getCategoryStats()

  return {
    remaining: global.remaining,
    total: global.total,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      remaining: c.remaining,
      ratePerMessage: c.ratePerMessage,
    })),
    updatedAt: global.updatedAt,
  }
}

/**
 * Update atomik CategoryStats di dalam transaksi Prisma (tx)
 * @param {Object} tx - Prisma transaction client
 * @param {number} categoryId
 * @param {Object} deltas - { total, none, queued, active, success, failed, draft, optOut }
 */
async function updateCategoryStatsAtomic(tx, categoryId, deltas = {}) {
  if (!categoryId || isNaN(categoryId)) return

  const catId = parseInt(categoryId, 10)

  // Pastikan categoryStats ada terlebih dahulu (upsert)
  const existing = await tx.categoryStats.findUnique({
    where: { categoryId: catId },
  })

  if (!existing) {
    await tx.categoryStats.create({
      data: {
        categoryId: catId,
        total: Math.max(0, deltas.total || 0),
        none: Math.max(0, deltas.none || 0),
        queued: Math.max(0, deltas.queued || 0),
        active: Math.max(0, deltas.active || 0),
        success: Math.max(0, deltas.success || 0),
        failed: Math.max(0, deltas.failed || 0),
        draft: Math.max(0, deltas.draft || 0),
        optOut: Math.max(0, deltas.optOut || 0),
      },
    })
  } else {
    const updateData = {}
    if (deltas.total) updateData.total = { increment: deltas.total }
    if (deltas.none) updateData.none = { increment: deltas.none }
    if (deltas.queued) updateData.queued = { increment: deltas.queued }
    if (deltas.active) updateData.active = { increment: deltas.active }
    if (deltas.success) updateData.success = { increment: deltas.success }
    if (deltas.failed) updateData.failed = { increment: deltas.failed }
    if (deltas.draft) updateData.draft = { increment: deltas.draft }
    if (deltas.optOut) updateData.optOut = { increment: deltas.optOut }

    if (Object.keys(updateData).length > 0) {
      await tx.categoryStats.update({
        where: { categoryId: catId },
        data: updateData,
      })
    }
  }

  // Sinkronkan juga totalContacts di tabel ContactCategory
  if (deltas.total) {
    await tx.contactCategory.update({
      where: { id: catId },
      data: {
        totalContacts: { increment: deltas.total },
      },
    }).catch(() => {})
  }
}

/**
 * Rekonsiliasi harian dan manual (query terindeks dari tabel Target)
 * Memperbaiki selisih antara CategoryStats dan data riil tabel Target
 * @returns {Promise<Object>} laporan rekonsiliasi
 */
async function recalculateStats() {
  console.log('[TargetStatsService] Memulai rekonsiliasi data Target...')

  // 1. Ambil hitungan terindeks per categoryId dan queueStatus untuk target non-optOut
  const targetCounts = await prisma.target.groupBy({
    by: ['categoryId', 'queueStatus'],
    where: { optOut: false },
    _count: { id: true },
  })

  // 2. Ambil hitungan optOut per categoryId
  const optOutCounts = await prisma.target.groupBy({
    by: ['categoryId'],
    where: { optOut: true },
    _count: { id: true },
  })
  const optOutMap = new Map()
  for (const r of optOutCounts) {
    optOutMap.set(r.categoryId, r._count.id)
  }

  // 3. Ambil total seluruh target per categoryId
  const totalCounts = await prisma.target.groupBy({
    by: ['categoryId'],
    _count: { id: true },
  })
  const totalMap = new Map()
  for (const r of totalCounts) {
    totalMap.set(r.categoryId, r._count.id)
  }

  // Susun map data aktual per categoryId
  const actualStatsMap = new Map()
  for (const row of targetCounts) {
    const catId = row.categoryId
    if (!actualStatsMap.has(catId)) {
      actualStatsMap.set(catId, {
        total: 0,
        none: 0,
        queued: 0,
        active: 0,
        success: 0,
        failed: 0,
        draft: 0,
        optOut: 0,
      })
    }
    const current = actualStatsMap.get(catId)
    const st = row.queueStatus
    const count = row._count.id

    if (current[st] !== undefined) {
      current[st] = count
    }
  }

  // Set total dan optOut aktual
  for (const [catId, totalCount] of totalMap.entries()) {
    if (!actualStatsMap.has(catId)) {
      actualStatsMap.set(catId, {
        total: 0,
        none: 0,
        queued: 0,
        active: 0,
        success: 0,
        failed: 0,
        draft: 0,
        optOut: 0,
      })
    }
    actualStatsMap.get(catId).total = totalCount
  }

  for (const [catId, stats] of actualStatsMap.entries()) {
    stats.optOut = optOutMap.get(catId) || 0
  }

  // 3. Ambil seluruh ContactCategory yang ada
  const allCategories = await prisma.contactCategory.findMany({
    include: { stats: true },
  })

  const differences = []
  let totalReconciled = 0

  for (const cat of allCategories) {
    const actual = actualStatsMap.get(cat.id) || {
      total: 0,
      none: 0,
      queued: 0,
      active: 0,
      success: 0,
      failed: 0,
      draft: 0,
      optOut: 0,
    }

    const recorded = cat.stats || {
      total: 0,
      none: 0,
      queued: 0,
      active: 0,
      success: 0,
      failed: 0,
      draft: 0,
      optOut: 0,
    }

    // Periksa apakah ada perbedaan
    const diff = {
      categoryId: cat.id,
      categoryName: cat.name,
      diffTotal: actual.total - (recorded.total || 0),
      diffNone: actual.none - (recorded.none || 0),
      diffQueued: actual.queued - (recorded.queued || 0),
      diffActive: actual.active - (recorded.active || 0),
      diffSuccess: actual.success - (recorded.success || 0),
      diffFailed: actual.failed - (recorded.failed || 0),
      diffDraft: actual.draft - (recorded.draft || 0),
      diffOptOut: actual.optOut - (recorded.optOut || 0),
    }

    const hasDiff =
      diff.diffTotal !== 0 ||
      diff.diffNone !== 0 ||
      diff.diffQueued !== 0 ||
      diff.diffActive !== 0 ||
      diff.diffSuccess !== 0 ||
      diff.diffFailed !== 0 ||
      diff.diffDraft !== 0 ||
      diff.diffOptOut !== 0

    if (hasDiff) {
      differences.push(diff)
    }

    // Perbaiki data CategoryStats dan totalContacts di ContactCategory
    await prisma.categoryStats.upsert({
      where: { categoryId: cat.id },
      create: {
        categoryId: cat.id,
        total: actual.total,
        none: actual.none,
        queued: actual.queued,
        active: actual.active,
        success: actual.success,
        failed: actual.failed,
        draft: actual.draft,
        optOut: actual.optOut,
      },
      update: {
        total: actual.total,
        none: actual.none,
        queued: actual.queued,
        active: actual.active,
        success: actual.success,
        failed: actual.failed,
        draft: actual.draft,
        optOut: actual.optOut,
      },
    })

    await prisma.contactCategory.update({
      where: { id: cat.id },
      data: { totalContacts: actual.total },
    })

    totalReconciled += actual.total
  }

  // Invalidate cache dan kirim update realtime
  await invalidateStatsCache()

  console.log(
    `[TargetStatsService] Rekonsiliasi selesai. Kategori diperbaiki: ${differences.length}, Total target: ${totalReconciled}`
  )

  return {
    totalReconciled,
    differencesCount: differences.length,
    differences,
    stats: await getGlobalStats(),
  }
}

/**
 * Backfill awal: mengisi tabel CategoryStats dari data yang sudah ada di Target
 */
async function backfillCategoryStats() {
  console.log('[TargetStatsService] Menjalankan backfill CategoryStats awal...')
  return await recalculateStats()
}

module.exports = {
  getGlobalStats,
  getCategoryStats,
  getMemberPoolSummary,
  updateCategoryStatsAtomic,
  invalidateStatsCache,
  recalculateStats,
  reconcileDaily: recalculateStats,
  backfillCategoryStats,
  broadcastPoolStats,
}
