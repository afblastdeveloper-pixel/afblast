import { useTranslation } from 'react-i18next'
import {
  Send, CheckCircle2, XCircle, Activity,
  Smartphone, Wifi, WifiOff, ArrowRight, TrendingUp
} from 'lucide-react'
import { DUMMY_CAMPAIGNS } from '../../utils/constants'

// Kartu statistik
function StatCard({ icon: Icon, iconBg, value, label, trend }) {
  return (
    <div className="stat-card bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
          {trend && (
            <p className="mt-1 text-xs text-green-600 flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

// Badge status kampanye
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const styles = {
    active:    'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    paused:    'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {t(`dashboard.status.${status}`)}
    </span>
  )
}

// Progress bar
function ProgressBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full progress-bar"
          style={{ '--progress-width': `${value}%`, width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-end">{value}%</span>
    </div>
  )
}

/**
 * DashboardPage – halaman utama dengan statistik, tabel campaign, dan status device.
 */
export default function DashboardPage() {
  const { t, i18n } = useTranslation()

  // Format angka sesuai locale
  const fmt = (n) => new Intl.NumberFormat(i18n.language).format(n)

  const stats = [
    {
      icon: Send,
      iconBg: 'bg-blue-50 text-blue-600',
      value: fmt(148_320),
      label: t('dashboard.stats.totalSent'),
      trend: `+12.5% ${t('dashboard.stats.fromYesterday')}`,
    },
    {
      icon: CheckCircle2,
      iconBg: 'bg-green-50 text-green-600',
      value: fmt(142_891),
      label: t('dashboard.stats.success'),
      trend: `96.3% ${t('dashboard.stats.deliveryRate')}`,
    },
    {
      icon: XCircle,
      iconBg: 'bg-red-50 text-red-500',
      value: fmt(5_429),
      label: t('dashboard.stats.failed'),
      trend: null,
    },
    {
      icon: Activity,
      iconBg: 'bg-purple-50 text-purple-600',
      value: fmt(8),
      label: t('dashboard.stats.activeCampaigns'),
      trend: `+2 ${t('dashboard.stats.newToday')}`,
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header sambutan */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dashboard.welcome')}, Admin! 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t('dashboard.subtitle')}</p>
      </div>

      {/* Kartu statistik – 1 kolom → 2 → 4 */}
      <section aria-label={t('dashboard.stats.totalSent')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>
      </section>

      {/* Grid bawah: tabel campaign + status device */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Kartu Campaign Terbaru */}
        <section
          className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          aria-label={t('dashboard.recentCampaigns')}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-base">{t('dashboard.recentCampaigns')}</h2>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700
                         font-medium transition-colors"
            >
              {t('dashboard.viewAll')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tabel dibungkus overflow-x-auto agar tidak horizontal scroll pada page */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 text-start font-medium">{t('dashboard.campaignName')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('dashboard.statusHeader')}</th>
                  <th className="px-5 py-3 text-start font-medium min-w-[140px]">{t('dashboard.progress')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {DUMMY_CAMPAIGNS.map(campaign => (
                  <tr key={campaign.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-nowrap">
                      {t(campaign.nameKey)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <ProgressBar value={campaign.progress} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Kartu Status Device WhatsApp */}
        <section
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
          aria-label={t('dashboard.deviceStatus')}
        >
          <h2 className="font-semibold text-gray-900 text-base mb-4">{t('dashboard.deviceStatus')}</h2>

          {/* Device dummy – terhubung */}
          <div className="space-y-3">
            {[
              { id: 'WA-001', phone: '+62 812-3456-7890', connected: true },
              { id: 'WA-002', phone: '+62 858-9876-5432', connected: true },
              { id: 'WA-003', phone: '+62 821-1111-2222', connected: false },
            ].map(device => (
              <div
                key={device.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                  ${device.connected ? 'bg-green-100' : 'bg-red-50'}`}>
                  <Smartphone className={`w-5 h-5 ${device.connected ? 'text-green-600' : 'text-red-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700">{device.id}</p>
                  <p className="text-xs text-gray-400 truncate">{device.phone}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {device.connected ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">{t('dashboard.connected')}</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-xs text-red-400 font-medium">{t('dashboard.disconnected')}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Ringkasan */}
          <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-green-700 font-medium">2/3 {t('dashboard.connected')}</span>
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="w-2 h-2 rounded-full bg-red-300" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
