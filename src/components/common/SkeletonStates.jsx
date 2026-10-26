import { AlertCircle, RefreshCw, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Skeleton Loader untuk Kartu Metrik / StatCard
 */
export function CardSkeleton({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-2xl p-5 border border-border shadow-xs animate-pulse flex flex-col justify-between h-[130px]"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 bg-surface-2 rounded" />
              <div className="h-7 w-32 bg-surface-2 rounded-lg" />
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-2" />
          </div>
          <div className="h-3 w-40 bg-surface-2 rounded" />
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton Loader untuk Tabel Data
 */
export function TableSkeleton({ rows = 6, cols = 5, className = '' }) {
  return (
    <div className={`bg-surface rounded-2xl border border-border overflow-hidden shadow-xs ${className}`}>
      <div className="p-4 border-b border-border bg-surface-2/40 animate-pulse flex items-center justify-between">
        <div className="h-4 w-32 bg-surface-2 rounded" />
        <div className="h-8 w-48 bg-surface-2 rounded-lg" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex items-center gap-4 animate-pulse">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="h-4 bg-surface-2 rounded"
                style={{ width: `${Math.max(15, (c + 1) * 18)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Komponen Error State dengan Tombol Coba Lagi
 */
export function ErrorState({
  title,
  message,
  onRetry,
  isRetrying = false,
  className = '',
}) {
  const { t } = useTranslation()

  return (
    <div
      className={`bg-surface rounded-2xl p-8 border border-danger/20 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-sm my-6 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-text mb-1">
        {title || t('common.errorOccurred', 'Terjadi Kesalahan')}
      </h3>
      <p className="text-xs text-muted leading-relaxed mb-5 max-w-sm">
        {message || t('common.errorDescription', 'Gagal memuat data dari server. Periksa koneksi Anda dan coba lagi.')}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{t('common.retry', 'Coba Lagi')}</span>
        </button>
      )}
    </div>
  )
}

/**
 * Komponen Empty State saat data kosong
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  className = '',
}) {
  const { t } = useTranslation()

  return (
    <div
      className={`bg-surface rounded-2xl p-10 border border-border text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 shadow-2xs ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-surface-2 text-muted flex items-center justify-center mb-4">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-sm font-bold text-text mb-1.5">
        {title || t('common.noData', 'Belum Ada Data')}
      </h3>
      <p className="text-xs text-muted leading-relaxed mb-4 max-w-xs">
        {message || t('common.noDataDescription', 'Belum ada data yang tersimpan untuk filter atau halaman ini.')}
      </p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
