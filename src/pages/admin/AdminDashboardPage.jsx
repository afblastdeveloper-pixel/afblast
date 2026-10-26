import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users, Smartphone, ListFilter, CreditCard,
  DollarSign, ArrowUpRight, FolderGit2, CheckCircle2,
  RefreshCw, TrendingUp, AlertTriangle, ArrowRight, ShieldCheck
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import { CardSkeleton, ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch } from '../../utils/client'
import { useAuth } from '../../context/AuthContext'

/**
 * AdminDashboardPage – Dasbor Utama Super Admin AF Blast (/superadmin)
 * - PageHeader dengan badge "Ringkasan" + "Sistem Normal" dan tombol segarkan
 * - 4 StatCard Utama:
 *   1. Total Member (+ "N online")
 *   2. Perangkat Aktif (x / total + progress)
 *   3. Total Antrean Aktif (dari total target)
 *   4. Penarikan Menunggu (jumlah + nominal, tautan ke persetujuan)
 * - Kartu Realtime Keuangan Member:
 *   - "Total Pendapatan Member" (realtime, rata-rata per member)
 *   - "Total Penarikan Member" (realtime) dengan batang proporsi Saldo Aktif vs Penarikan
 * - Bagian "Informasi Target":
 *   - Total Upload (naik otomatis saat kontak ditambah)
 *   - Antre, Aktif, Sukses (+%), Gagal (+%)
 *   - Progress bar segmen
 * - Tabel "Ringkasan Kategori Target" (kategori, jumlah target, kampanye aktif) dengan tautan "Lihat Kampanye"
 */
export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const { role } = useAuth()
  const basePath = role === 'adminfinance' ? '/finance' : role === 'developer' ? '/developer' : '/superadmin'

  // Fetch Dashboard Stats via React Query
  const {
    data: dashboardData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/dashboard')
      if (!res.ok) {
        throw new Error(`Gagal memuat dasbor admin: ${res.status}`)
      }
      return res.json()
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  // Format currency IDR
  const formatRupiah = (val) =>
    new Intl.NumberFormat(i18n.language || 'id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Number(val) || 0)

  // Format comma separated number
  const formatNum = (val) =>
    new Intl.NumberFormat(i18n.language || 'id-ID').format(Number(val) || 0)

  const stats = useMemo(() => {
    if (dashboardData?.stats) return dashboardData.stats
    if (!dashboardData) return {}
    return {
      totalMembers: dashboardData.totalMembers || 0,
      onlineMembers: dashboardData.onlineMembers || 0,
      totalDevices: dashboardData.devices?.total || 0,
      activeDevices: dashboardData.devices?.connected || 0,
      activeQueue: dashboardData.activeQueue || 0,
      totalTargets: dashboardData.target?.totalUpload || 0,
      pendingWithdrawals: dashboardData.pendingWithdrawals || { count: 0, sum: 0 },
      memberIncome: {
        activeBalance: dashboardData.activeBalance || 0,
        withdrawnTotal: dashboardData.withdrawnTotal || 0,
        totalIncome: dashboardData.memberIncomeTotal || 0,
        averagePerMember:
          dashboardData.totalMembers > 0
            ? Math.round((dashboardData.memberIncomeTotal || 0) / dashboardData.totalMembers)
            : 0,
      },
    }
  }, [dashboardData])

  const targetInfo = dashboardData?.targetInfo || dashboardData?.target || {}
  const categories = dashboardData?.categoriesSummary || dashboardData?.categories || []

  // Hitung persentase perangkat aktif
  const totalDevices = Number(stats.totalDevices || 0)
  const activeDevices = Number(stats.activeDevices || 0)
  const deviceProgressPct = totalDevices > 0 ? Math.min(100, Math.round((activeDevices / totalDevices) * 100)) : 0

  // Hitung proporsi keuangan: Saldo Aktif vs Penarikan
  const activeBalance = Number(stats.memberIncome?.activeBalance || 0)
  const withdrawnTotal = Number(stats.memberIncome?.withdrawnTotal || 0)
  const financeTotal = activeBalance + withdrawnTotal
  const activeBalancePct = financeTotal > 0 ? Math.round((activeBalance / financeTotal) * 100) : 50
  const withdrawnPct = financeTotal > 0 ? 100 - activeBalancePct : 50

  // Hitung segmen progress bar target
  const targetTotal = Number(targetInfo.totalUpload || 0)
  const targetQueued = Number(targetInfo.queued || 0)
  const targetActive = Number(targetInfo.active || 0)
  const targetSuccess = Number(targetInfo.success || 0)
  const targetFailed = Number(targetInfo.failed || 0)

  const queuedPct = targetTotal > 0 ? ((targetQueued / targetTotal) * 100).toFixed(1) : 0
  const activePct = targetTotal > 0 ? ((targetActive / targetTotal) * 100).toFixed(1) : 0
  const successPct = targetTotal > 0 ? ((targetSuccess / targetTotal) * 100).toFixed(1) : 0
  const failedPct = targetTotal > 0 ? ((targetFailed / targetTotal) * 100).toFixed(1) : 0

  return (
    <div className="space-y-6">
      {/* 1. Page Header dengan Badge & Tombol Segarkan */}
      <PageHeader
        title={t('adminDashboard.title', 'Dasbor Super Admin')}
        subtitle={t('adminDashboard.subtitle', 'Pusat kendali dan telemetri blast WhatsApp, antrean target, serta keuangan member.')}
        badge={(
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {t('adminDashboard.badgeSummary', 'Ringkasan')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('adminDashboard.badgeNormal', 'Sistem Normal')}
            </span>
          </div>
        )}
        actions={(
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 transition-all text-xs font-semibold shadow-xs disabled:opacity-50"
            title="Segarkan data statistik"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted ${isFetching ? 'animate-spin text-primary' : ''}`} />
            <span>{t('adminDashboard.refresh', 'Segarkan')}</span>
          </button>
        )}
      />

      {/* Tampilan Error dengan Tombol Coba Lagi */}
      {isError && (
        <ErrorState
          title={t('adminDashboard.errorTitle', 'Gagal memuat statistik dasbor')}
          message={error?.message || t('adminDashboard.errorDesc', 'Terjadi gangguan saat mengambil ringkasan data dari server.')}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      )}

      {/* Tampilan Skeleton saat loading awal */}
      {isLoading && !dashboardData && (
        <div className="space-y-6">
          <CardSkeleton count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface rounded-2xl p-6 border border-border h-48 animate-pulse" />
            <div className="bg-surface rounded-2xl p-6 border border-border h-48 animate-pulse" />
          </div>
        </div>
      )}

      {/* Konten Utama Dasbor */}
      {dashboardData && (
        <>
          {/* 2. 4 StatCard Utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Member */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                    {t('adminDashboard.totalMembers', 'Total Member')}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-text mt-1.5 tabular-nums tracking-tight">
                    <AnimatedNumber value={stats.totalMembers || 0} formatter={formatNum} />
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <AnimatedNumber value={stats.onlineMembers || 0} formatter={formatNum} />
                  <span className="text-muted font-normal ms-1">online</span>
                </span>
                <Link
                  to={`${basePath}/users`}
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                >
                  Kelola <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* 2. Perangkat Aktif */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                    {t('adminDashboard.activeDevices', 'Perangkat Aktif')}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-text mt-1.5 tabular-nums tracking-tight">
                    <AnimatedNumber value={stats.activeDevices || 0} formatter={formatNum} />
                    <span className="text-sm font-normal text-muted ms-1.5">
                      / {formatNum(stats.totalDevices || 0)}
                    </span>
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>Kesiapan Mesin Blast</span>
                  <span className="font-semibold text-text tabular-nums">{deviceProgressPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${deviceProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 3. Total Antrean Aktif */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                    {t('adminDashboard.activeQueue', 'Total Antrean Aktif')}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-text mt-1.5 tabular-nums tracking-tight">
                    <AnimatedNumber value={stats.activeQueue || 0} formatter={formatNum} />
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <ListFilter className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted text-[11px] truncate">
                  Dari total <strong className="text-text font-semibold">{formatNum(stats.totalTargets || 0)}</strong> target
                </span>
                <Link
                  to={`${basePath}/targets`}
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                >
                  Antrean <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* 4. Penarikan Menunggu */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                    {t('adminDashboard.pendingWithdrawals', 'Penarikan Menunggu')}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-text mt-1.5 tabular-nums tracking-tight">
                    <AnimatedNumber value={stats.pendingWithdrawalsCount || 0} formatter={formatNum} />
                    <span className="text-xs font-normal text-muted ms-1.5">tiket</span>
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px] truncate">
                  <AnimatedNumber value={stats.pendingWithdrawalsAmount || 0} formatter={formatRupiah} />
                </span>
                <Link
                  to={`${basePath}/withdrawals`}
                  className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Persetujuan <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* 3. Kartu Realtime Keuangan Member */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Total Pendapatan Member */}
            <div className="bg-surface rounded-2xl p-6 border border-border shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-text">Total Pendapatan Member</h2>
                      <p className="text-[11px] text-muted">Akumulasi imbalan blast WhatsApp berhasil</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Realtime
                  </span>
                </div>

                <div className="mt-5">
                  <div className="text-3xl sm:text-4xl font-extrabold text-text tracking-tight tabular-nums">
                    <AnimatedNumber value={stats.memberIncome?.total || 0} formatter={formatRupiah} />
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <div>
                      Rata-rata per member:{' '}
                      <strong className="text-text font-semibold tabular-nums">
                        <AnimatedNumber value={stats.memberIncome?.avgPerMember || 0} formatter={formatRupiah} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted">
                <span>Dihitung otomatis per pesan terkirim & terkonfirmasi</span>
                <Link to={`${basePath}/commissions`} className="text-primary hover:underline font-medium">
                  Laporan Komisi →
                </Link>
              </div>
            </div>

            {/* Total Penarikan Member dengan Batang Proporsi */}
            <div className="bg-surface rounded-2xl p-6 border border-border shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-text">Total Penarikan Member</h2>
                      <p className="text-[11px] text-muted">Dana yang telah dicairkan oleh member</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                    Realtime
                  </span>
                </div>

                <div className="mt-5">
                  <div className="text-3xl sm:text-4xl font-extrabold text-text tracking-tight tabular-nums">
                    <AnimatedNumber value={withdrawnTotal} formatter={formatRupiah} />
                  </div>

                  {/* Batang Proporsi Saldo Aktif vs Penarikan */}
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                        Saldo Aktif Member:{' '}
                        <strong className="text-text font-semibold tabular-nums">
                          <AnimatedNumber value={activeBalance} formatter={formatRupiah} />
                        </strong>
                      </span>
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
                        Tercairkan:{' '}
                        <strong className="text-text font-semibold tabular-nums">
                          {withdrawnPct}%
                        </strong>
                      </span>
                    </div>

                    {/* Progress Bar Dual Segment */}
                    <div className="w-full h-2.5 bg-surface-2 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${activeBalancePct}%` }}
                        title={`Saldo Aktif: ${activeBalancePct}%`}
                      />
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${withdrawnPct}%` }}
                        title={`Telah Ditarik: ${withdrawnPct}%`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted">
                <span>Total Dana Beredar: {formatRupiah(financeTotal)}</span>
                <Link to={`${basePath}/withdrawals`} className="text-primary hover:underline font-medium">
                  Riwayat Pencairan →
                </Link>
              </div>
            </div>
          </div>

          {/* 4. Bagian "Informasi Target" */}
          <div className="bg-surface rounded-2xl p-6 border border-border shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-text">Informasi Target</h2>
                <p className="text-xs text-muted">Status antrean kontak dan performa pengiriman blast secara agregat.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`${basePath}/targets`}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-2 transition-colors inline-flex items-center gap-1.5"
                >
                  <ListFilter className="w-3.5 h-3.5 text-muted" />
                  Buka Daftar Target
                </Link>
              </div>
            </div>

            {/* Statistik Segmen Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Total Upload */}
              <div className="p-3.5 rounded-xl bg-surface-2/60 border border-border">
                <span className="text-[11px] font-medium text-muted block">Total Upload</span>
                <span className="text-xl sm:text-2xl font-bold text-text mt-1 block tabular-nums">
                  <AnimatedNumber value={targetTotal} formatter={formatNum} />
                </span>
                <span className="text-[10px] text-muted block mt-0.5">Kontak tersimpan</span>
              </div>

              {/* Antre */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 block">Antre</span>
                <span className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block tabular-nums">
                  <AnimatedNumber value={targetQueued} formatter={formatNum} />
                </span>
                <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">{queuedPct}% dari total</span>
              </div>

              {/* Aktif */}
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 block">Aktif</span>
                <span className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1 block tabular-nums">
                  <AnimatedNumber value={targetActive} formatter={formatNum} />
                </span>
                <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80 block mt-0.5">{activePct}% sedang diproses</span>
              </div>

              {/* Sukses */}
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">Sukses</span>
                <span className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 block tabular-nums">
                  <AnimatedNumber value={targetSuccess} formatter={formatNum} />
                </span>
                <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5 font-semibold">+{successPct}% sukses</span>
              </div>

              {/* Gagal */}
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 block">Gagal</span>
                <span className="text-xl sm:text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1 block tabular-nums">
                  <AnimatedNumber value={targetFailed} formatter={formatNum} />
                </span>
                <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 block mt-0.5 font-semibold">+{failedPct}% gagal</span>
              </div>
            </div>

            {/* Progress Bar Segmen */}
            <div className="space-y-1.5">
              <div className="w-full h-3 bg-surface-2 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${successPct}%` }}
                  title={`Sukses: ${successPct}%`}
                />
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${activePct}%` }}
                  title={`Aktif: ${activePct}%`}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${queuedPct}%` }}
                  title={`Antre: ${queuedPct}%`}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${failedPct}%` }}
                  title={`Gagal: ${failedPct}%`}
                />
              </div>

              {/* Legenda Segmen */}
              <div className="flex items-center gap-4 text-[11px] text-muted flex-wrap pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Sukses ({successPct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Aktif ({activePct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Antre ({queuedPct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Gagal ({failedPct}%)
                </span>
              </div>
            </div>
          </div>

          {/* 5. Tabel "Ringkasan Kategori Target" */}
          <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-text">Ringkasan Kategori Target</h2>
                <p className="text-xs text-muted">Distribusi jumlah target kontak dan kampanye aktif per kategori.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`${basePath}/categories`}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-2 transition-colors"
                >
                  Kelola Kategori
                </Link>
                <Link
                  to={`${basePath}/campaigns`}
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-xs transition-colors"
                >
                  Lihat Semua Kampanye
                </Link>
              </div>
            </div>

            {categories.length === 0 ? (
              <EmptyState
                icon={FolderGit2}
                title="Belum Ada Kategori Target"
                message="Kategori target digunakan untuk mengelompokkan kontak dan menentukan tarif reward member."
                action={(
                  <Link
                    to={`${basePath}/categories`}
                    className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover transition-colors"
                  >
                    Tambah Kategori Pertama
                  </Link>
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-muted border-collapse">
                  <thead className="bg-surface-2/60 text-text font-semibold uppercase text-[11px] border-b border-border">
                    <tr>
                      <th className="px-5 py-3.5">Kategori</th>
                      <th className="px-5 py-3.5">Kode Negara</th>
                      <th className="px-5 py-3.5">Tarif Reward</th>
                      <th className="px-5 py-3.5">Jumlah Target</th>
                      <th className="px-5 py-3.5">Kampanye Aktif</th>
                      <th className="px-5 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="px-5 py-4 font-semibold text-text">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary" />
                            <span>{cat.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono">
                          {cat.countryCode ? `+${cat.countryCode}` : <span className="text-muted italic">Global</span>}
                        </td>
                        <td className="px-5 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatRupiah(cat.ratePerMessage || 0)} / pesan
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-text border border-border tabular-nums">
                            {formatNum(cat.totalContacts || 0)} kontak
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {cat.activeCampaignsCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              {cat.activeCampaignsCount} kampanye aktif
                            </span>
                          ) : (
                            <span className="text-muted text-[11px] italic">Tidak ada</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={`${basePath}/campaigns?category=${cat.id}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                          >
                            <span>Lihat Kampanye</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
