import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { WITHDRAWALS } from '../../data/withdrawals'

// ─── Helper ──────────────────────────────────────────────────────────────────
function formatRupiah(value, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(dateStr, locale) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(dateStr)
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const styles = {
    pending:    'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    success:    'bg-green-100 text-green-700',
    rejected:   'bg-red-100 text-red-600',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
        styles[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {t(`withdrawals.statusLabels.${status}`)}
    </span>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ row, onClose }) {
  const { t, i18n } = useTranslation()

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('withdrawals.detail')}
      onClick={handleBackdrop}
      onKeyDown={handleKey}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-[fadeIn_0.15s_ease]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{t('withdrawals.detail')}</h2>
          <button
            onClick={onClose}
            aria-label={t('withdrawals.close')}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {[
            ['withdrawals.id', row.id],
            ['withdrawals.date', formatDate(row.date, i18n.language)],
            ['withdrawals.amount', formatRupiah(row.amount, i18n.language)],
            ['withdrawals.method', row.method],
            ['withdrawals.destination', row.destination],
          ].map(([labelKey, value]) => (
            <div key={labelKey} className="flex items-start justify-between gap-4">
              <span className="text-sm text-gray-500 flex-shrink-0">{t(labelKey)}</span>
              <span className="text-sm font-medium text-gray-900 text-end">{value}</span>
            </div>
          ))}

          {/* Status */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-500">{t('withdrawals.status')}</span>
            <StatusBadge status={row.status} />
          </div>

          {/* Catatan / Review */}
          {(row.rejectionReason || row.note) && (
            <div
              className={`rounded-xl p-3 border ${
                row.status === 'rejected'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-gray-50 border-gray-100 text-gray-700'
              }`}
            >
              <p
                className={`text-xs font-semibold mb-1 ${
                  row.status === 'rejected' ? 'text-red-700' : 'text-gray-500'
                }`}
              >
                {row.status === 'rejected' ? 'Alasan Penolakan / Review Admin:' : t('withdrawals.note')}
              </p>
              <p className="text-sm font-medium">{row.rejectionReason || row.note}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
          >
            {t('withdrawals.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 8
const ALL_STATUSES = ['pending', 'processing', 'success', 'rejected']

// ─── WithdrawalsPage ──────────────────────────────────────────────────────────
export default function WithdrawalsPage() {
  const { t, i18n } = useTranslation()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRow, setSelectedRow] = useState(null)

  // Filter logic
  const filtered = useMemo(() => {
    let data = [...WITHDRAWALS]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(
        r =>
          r.id.toLowerCase().includes(q) ||
          r.method.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q)
      )
    }
    if (filterStatus) {
      data = data.filter(r => r.status === filterStatus)
    }
    if (dateFrom) {
      data = data.filter(r => r.date >= dateFrom)
    }
    if (dateTo) {
      data = data.filter(r => r.date <= dateTo)
    }

    return data
  }, [search, filterStatus, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const resetFilters = useCallback(() => {
    setSearch('')
    setFilterStatus('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }, [])

  const hasFilters = search || filterStatus || dateFrom || dateTo

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('withdrawals.pageTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('withdrawals.subtitle')}</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Pencarian */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              id="wd-search"
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('withdrawals.search')}
              className="w-full border border-gray-200 rounded-xl ps-9 pe-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition-shadow"
            />
          </div>

          {/* Filter Status */}
          <select
            id="wd-filter-status"
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition-shadow min-w-[140px]"
          >
            <option value="">{t('withdrawals.filterStatus')}</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{t(`withdrawals.statusLabels.${s}`)}</option>
            ))}
          </select>

          {/* Dari tanggal */}
          <input
            id="wd-date-from"
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            aria-label={t('withdrawals.dateFrom')}
            title={t('withdrawals.dateFrom')}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition-shadow"
          />

          {/* Sampai tanggal */}
          <input
            id="wd-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            aria-label={t('withdrawals.dateTo')}
            title={t('withdrawals.dateTo')}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition-shadow"
          />

          {/* Reset */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* overflow-x-auto untuk mobile */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]" role="table">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 text-start font-medium">{t('withdrawals.id')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('withdrawals.date')}</th>
                <th className="px-5 py-3 text-end font-medium">{t('withdrawals.amount')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('withdrawals.method')}</th>
                <th className="px-5 py-3 text-start font-medium hidden sm:table-cell">{t('withdrawals.destination')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('withdrawals.status')}</th>
                <th className="px-5 py-3 text-start font-medium hidden md:table-cell">{t('withdrawals.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                    {t('withdrawals.noData')}
                  </td>
                </tr>
              ) : (
                pageData.map(row => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                    onClick={() => setSelectedRow(row)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${row.id} – ${t(`withdrawals.statusLabels.${row.status}`)}`}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedRow(row)}
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {row.id}
                        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap tabular-nums">
                      {formatDate(row.date, i18n.language)}
                    </td>
                    <td className="px-5 py-3.5 text-end font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(row.amount, i18n.language)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">{row.method}</td>
                    <td className="px-5 py-3.5 text-gray-500 font-mono text-xs whitespace-nowrap hidden sm:table-cell">
                      {row.destination}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs max-w-[180px] truncate hidden md:table-cell">
                      {row.note || t('withdrawals.noNote')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginasi */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-gray-100 flex-wrap">
            <p className="text-xs text-gray-400">
              {t('withdrawals.page')} {safePage} {t('withdrawals.of')} {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('withdrawals.prev')}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('withdrawals.next')}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  )
}
