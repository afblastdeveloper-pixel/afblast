const prisma = require('../config/db')
const targetStatsService = require('../services/targetStats.service')

/**
 * GET /api/admin/dashboard
 * Mengembalikan ringkasan statistik dashboard Super Admin dengan CategoryStats resmi
 */
async function getDashboardStats(req, res) {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

    // 1. Data Member & Online (aktif <= 15 menit)
    const [totalMembers, onlineDevicesCount] = await Promise.all([
      prisma.user.count({ where: { role: 'user' } }),
      prisma.device.count({
        where: {
          deletedAt: null,
          lastSeenAt: { gte: fifteenMinutesAgo },
        },
      }),
    ])

    // 2. Data Perangkat WhatsApp
    const [connectedDevices, totalDevices] = await Promise.all([
      prisma.device.count({
        where: { deletedAt: null, status: 'connected' },
      }),
      prisma.device.count({
        where: { deletedAt: null },
      }),
    ])

    // 3. Penarikan Tertunda (Pending Withdrawals)
    const pendingWithdrawalsAgg = await prisma.withdrawal.aggregate({
      where: { status: 'pending' },
      _count: { id: true },
      _sum: { amount: true },
    })

    // 4. Total Ditarik (Success Withdrawals) & Saldo Aktif Member
    const [successWithdrawalsAgg, memberBalanceAgg] = await Promise.all([
      prisma.withdrawal.aggregate({
        where: { status: 'success' },
        _sum: { amount: true },
      }),
      prisma.user.aggregate({
        where: { role: 'user' },
        _sum: { balance: true },
      }),
    ])

    const withdrawnTotal = successWithdrawalsAgg._sum.amount || 0
    const activeBalance = memberBalanceAgg._sum.balance || 0
    const memberIncomeTotal = withdrawnTotal + activeBalance
    const withdrawnPercentage =
      memberIncomeTotal > 0
        ? parseFloat(((withdrawnTotal / memberIncomeTotal) * 100).toFixed(2))
        : 0

    // 5. Statistik Target resmi dari Service Tunggal (CategoryStats)
    const targetCounters = await targetStatsService.getGlobalStats()
    const activeQueue = targetCounters.queued + targetCounters.active

    // 6. Ringkasan per Kategori Kontak beserta jumlah kampanye aktif
    const categories = await prisma.contactCategory.findMany({
      include: {
        stats: true,
        _count: {
          select: {
            blastCampaigns: {
              where: {
                status: { in: ['running', 'active', 'paused'] },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const categoriesSummary = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      countryCode: cat.countryCode,
      ratePerMessage: cat.ratePerMessage,
      totalContacts: cat.stats?.total || 0,
      isActive: cat.isActive,
      activeCampaignsCount: cat._count?.blastCampaigns || 0,
    }))

    const stats = {
      totalMembers,
      onlineMembers: onlineDevicesCount,
      totalDevices,
      activeDevices: connectedDevices,
      activeQueue,
      totalTargets: targetCounters.total,
      remaining: targetCounters.remaining,
      pendingWithdrawals: {
        count: pendingWithdrawalsAgg._count.id || 0,
        sum: pendingWithdrawalsAgg._sum.amount || 0,
      },
      memberIncome: {
        activeBalance,
        withdrawnTotal,
        totalIncome: memberIncomeTotal,
        averagePerMember: totalMembers > 0 ? Math.round(memberIncomeTotal / totalMembers) : 0,
      },
    }

    const targetInfo = {
      totalUpload: targetCounters.total,
      total: targetCounters.total,
      queued: targetCounters.queued,
      active: targetCounters.active,
      success: targetCounters.success,
      failed: targetCounters.failed,
      remaining: targetCounters.remaining,
      optOut: targetCounters.optOut,
    }

    return res.status(200).json({
      stats,
      targetInfo,
      categoriesSummary,
      // Backward compatibility top-level fields
      totalMembers,
      onlineMembers: onlineDevicesCount,
      devices: {
        connected: connectedDevices,
        total: totalDevices,
      },
      activeQueue,
      pendingWithdrawals: {
        count: pendingWithdrawalsAgg._count.id || 0,
        sum: pendingWithdrawalsAgg._sum.amount || 0,
      },
      memberIncomeTotal,
      withdrawnTotal,
      withdrawnPercentage,
      activeBalance,
      target: targetCounters,
      categories: categoriesSummary,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error in getDashboardStats:', error)
    return res.status(500).json({
      error: 'Gagal mengambil data statistik dashboard',
      details: error.message,
    })
  }
}

module.exports = {
  getDashboardStats,
}
