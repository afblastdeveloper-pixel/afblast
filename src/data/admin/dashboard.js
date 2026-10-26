/**
 * dashboard.js – Data dummy untuk Admin Dashboard
 */

export const ADMIN_DASHBOARD_STATS = {
  totalUsers: 1420,
  usersGrowth: '+12.5%',
  activeUsers: 985,
  activeUsersGrowth: '+8.2%',
  todayMessages: 48250,
  todayMessagesGrowth: '+23.4%',
  totalRevenue: 84650000,
  revenueGrowth: '+18.0%',
  pendingWithdrawals: 4,
  pendingWithdrawalsAmount: 1420000,
}

// Data grafik pesan 7 hari & 30 hari
export const MESSAGE_CHART_7_DAYS = [
  { label: 'Sen', date: '2026-10-12', sent: 32400, delivered: 31200, failed: 1200 },
  { label: 'Sel', date: '2026-10-13', sent: 38900, delivered: 37800, failed: 1100 },
  { label: 'Rab', date: '2026-10-14', sent: 41200, delivered: 40100, failed: 1100 },
  { label: 'Kam', date: '2026-10-15', sent: 39800, delivered: 38900, failed: 900 },
  { label: 'Jum', date: '2026-10-16', sent: 46500, delivered: 45200, failed: 1300 },
  { label: 'Sab', date: '2026-10-17', sent: 52100, delivered: 50900, failed: 1200 },
  { label: 'Min', date: '2026-10-18', sent: 48250, delivered: 47100, failed: 1150 },
]

export const MESSAGE_CHART_30_DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  const sent = Math.floor(25000 + Math.random() * 28000 + i * 400)
  const delivered = Math.floor(sent * 0.97)
  const failed = sent - delivered
  return {
    label: `${d.getDate()}/${d.getMonth() + 1}`,
    date: d.toISOString().slice(0, 10),
    sent,
    delivered,
    failed,
  }
})

// Data grafik pendaftaran pengguna 30 hari
export const REGISTRATION_CHART_30_DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  const count = Math.floor(8 + Math.random() * 25 + (i > 20 ? 10 : 0))
  return {
    label: `${d.getDate()}/${d.getMonth() + 1}`,
    date: d.toISOString().slice(0, 10),
    users: count,
  }
})

// Status Integrasi API watsap.id
export const API_INTEGRATION_STATUS = {
  provider: 'watsap.id Gateway',
  status: 'connected', // 'connected' | 'degraded' | 'disconnected'
  latencyMs: 142,
  uptime: '99.98%',
  totalNodes: 8,
  activeNodes: 8,
  version: 'v2.4.1-stable',
  lastPing: '2026-10-18 18:45:00',
  rateLimitUsage: '48%',
}
