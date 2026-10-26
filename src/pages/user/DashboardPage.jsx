import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Wallet, Layers, CheckCircle2, XCircle, Smartphone,
  ArrowRight, Clock, AlertCircle, RefreshCw, ChevronRight
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/ui/Badge'
import TelegramStatusCard from '../../components/member/TelegramStatusCard'
import { BRAND } from '../../config/brand'
import logoAf2 from '../../assets/brand/Logo-AF-2.jpeg'

function formatRupiah(value, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(dateStr, locale) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()

  // 1. Fetch Dashboard Stats
  const {
    data: dashData,
    isLoading: isDashLoading,
    isError: isDashError,
    error: dashError,
    refetch: refetchDash,
  } = useQuery({
    queryKey: ['memberDashboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/dashboard')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal memuat data dashboard')
      }
      return res.json()
    },
    staleTime: 15000,
  })

  // 2. Fetch Recent Withdrawals (limit 5)
  const {
    data: withData,
    isLoading: isWithLoading,
    isError: isWithError,
    refetch: refetchWith,
  } = useQuery({
    queryKey: ['memberRecentWithdrawals'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/withdrawals?limit=5')
      if (!res.ok) {
        throw new Error('Gagal memuat ringkasan penarikan')
      }
      return res.json()
    },
    staleTime: 15000,
  })

  const stats = {
    balance: dashData?.balance ?? 0,
    activeSlots: dashData?.activeSlots ?? 0,
    messagesSent: dashData?.sentSuccess ?? 0,
    messagesFailed: dashData?.sentFailed ?? 0,
    linkedDevices: dashData?.linkedDevices ?? 0,
  }

  const recentWithdrawals = withData?.withdrawals || []

  const statCards = [
    {
      key: 'balance',
      label: t('memberDashboard.balance', 'Saldo Tersedia'),
      value: formatRupiah(stats.balance, i18n.language),
      icon: Wallet,
      colorClass: 'bg-blue-50 text-primary border-blue-100',
      iconBg: 'bg-primary text-white',
    },
    {
      key: 'activeSlots',
      label: t('memberDashboard.activeSlots', 'Slot Aktif'),
      value: new Intl.NumberFormat(i18n.language).format(stats.activeSlots),
      icon: Layers,
      colorClass: 'bg-blue-50 text-blue-600 border-blue-100',
      iconBg: 'bg-blue-500 text-white',
    },
    {
      key: 'messagesSent',
      label: t('memberDashboard.messagesSent', 'Pesan Sukses'),
      value: new Intl.NumberFormat(i18n.language).format(stats.messagesSent),
      icon: CheckCircle2,
      colorClass: 'bg-teal-50 text-teal-600 border-teal-100',
      iconBg: 'bg-teal-500 text-white',
    },
    {
      key: 'messagesFailed',
      label: t('memberDashboard.messagesFailed', 'Pesan Gagal'),
      value: new Intl.NumberFormat(i18n.language).format(stats.messagesFailed),
      icon: XCircle,
      colorClass: 'bg-rose-50 text-rose-600 border-rose-100',
      iconBg: 'bg-rose-500 text-white',
    },
    {
      key: 'linkedDevices',
      label: t('memberDashboard.linkedDevices', 'Nomor Tertaut'),
      value: new Intl.NumberFormat(i18n.language).format(stats.linkedDevices),
      icon: Smartphone,
      colorClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      iconBg: 'bg-indigo-500 text-white',
    },
  ]

  const statusVariantMap = {
    pending: 'warning',
    processing: 'info',
    success: 'success',
    rejected: 'danger',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Sambutan Header - Kartu Navy dengan Logo-AF-2.jpeg */}
      <div className="bg-[#0B1220] rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-block">
              <img
                src={logoAf2}
                alt={`${BRAND.name} - ${BRAND.slogan}`}
                className="h-12 sm:h-14 w-auto object-contain rounded-xl"
              />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {t('memberDashboard.welcome', 'Selamat datang')}, {user?.name || 'Member'}! 👋
              </h1>
              <p className="mt-1 text-slate-300 text-sm sm:text-base max-w-xl">
                {t('memberDashboard.subtitle', 'Pantau aktivitas blast WhatsApp, slot kontak bersama, dan saldo komisi Anda secara real-time.')}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center">
            <Link
              to="/app/whatsapp"
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary-light text-white font-semibold text-sm shadow-lg shadow-blue-500/25 hover:opacity-95 active:scale-[0.98] transition-all"
            >
              <Smartphone className="w-4 h-4" />
              <span>{t('memberDashboard.linkDevice', 'Tautkan WhatsApp')}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Kartu Status Pemulihan Telegram */}
      <TelegramStatusCard />

      {/* Error State */}
      {isDashError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <p className="text-sm font-medium">{dashError?.message || 'Terjadi kesalahan saat memuat data dashboard'}</p>
          </div>
          <button
            type="button"
            onClick={() => refetchDash()}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('memberDashboard.retry', 'Coba Lagi')}
          </button>
        </div>
      )}

      {/* 5 Kartu Ringkas (Saldo, Slot Aktif, Pesan Sukses, Pesan Gagal, Nomor Tertaut) */}
      <section aria-label="Statistik Member">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold text-gray-500 truncate">{card.label}</span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs ${card.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                {isDashLoading ? (
                  <div className="h-8 w-24 bg-gray-100 animate-pulse rounded-lg" />
                ) : (
                  <div className="text-2xl font-bold text-gray-900 tracking-tight tabular-nums truncate">
                    {card.value}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Ringkasan Penarikan Terakhir */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="p-5 sm:px-6 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {t('memberDashboard.recentWithdrawals', 'Ringkasan Penarikan Terakhir')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              5 transaksi pengajuan penarikan dana terbaru Anda.
            </p>
          </div>
          <Link
            to="/app/earnings"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            <span>{t('memberDashboard.viewAllWithdrawals', 'Lihat di Penghasilan')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isWithLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : isWithError ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p>Gagal memuat riwayat penarikan terakhir.</p>
            <button
              onClick={() => refetchWith()}
              className="mt-2 text-xs font-semibold text-primary hover:underline"
            >
              Muat Ulang
            </button>
          </div>
        ) : recentWithdrawals.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {t('memberDashboard.noRecentWithdrawals', 'Belum ada transaksi penarikan')}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Anda dapat mengajukan penarikan saldo komisi kapan saja melalui menu Penghasilan.
            </p>
            <Link
              to="/app/earnings"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <Wallet className="w-4 h-4" />
              <span>Tarik Saldo Sekarang</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead className="bg-gray-50/70 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5 text-start">ID & Tanggal</th>
                  <th className="py-3 px-5 text-start">Metode & Tujuan</th>
                  <th className="py-3 px-5 text-end">Jumlah</th>
                  <th className="py-3 px-5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentWithdrawals.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-gray-900 font-mono text-xs">
                        #{item.id}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {formatDate(item.createdAt, i18n.language)}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-gray-800 uppercase tracking-tight text-xs">
                        {item.method}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {item.accountNumber} ({item.accountName})
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-end font-bold text-gray-900 tabular-nums">
                      {formatRupiah(item.amount, i18n.language)}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <Badge variant={statusVariantMap[item.status] || 'default'} size="sm">
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
