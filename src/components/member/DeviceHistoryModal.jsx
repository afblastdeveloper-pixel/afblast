import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, CheckCircle2, XCircle, Send, Layers, RefreshCw,
  X, Filter, ChevronRight, Activity, Smartphone
} from 'lucide-react'
import Modal from '../ui/Modal'
import { apiFetch } from '../../utils/client'

function formatDate(dateStr, locale) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat(locale || 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatNumber(num, locale) {
  return new Intl.NumberFormat(locale || 'id-ID').format(num || 0)
}

export default function DeviceHistoryModal({
  isOpen,
  onClose,
  device,
}) {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('messages') // 'messages' | 'runs'
  const [statusFilter, setStatusFilter] = useState('') // '' | 'sent' | 'success' | 'failed'
  const [logs, setLogs] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const deviceId = device?.id

  // Fetch Message History
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['memberDeviceHistory', deviceId, statusFilter],
    queryFn: async () => {
      if (!deviceId) return { logs: [], nextCursor: null }
      const url = `/api/member/devices/${deviceId}/history?limit=25${statusFilter ? `&status=${statusFilter}` : ''}`
      const res = await apiFetch(url)
      if (!res.ok) throw new Error('Gagal memuat riwayat pengiriman')
      const data = await res.json()
      setLogs(data.logs || [])
      setNextCursor(data.nextCursor || null)
      return data
    },
    enabled: isOpen && Boolean(deviceId) && activeTab === 'messages',
    staleTime: 10000,
  })

  // Fetch Engine Runs
  const {
    data: runsData,
    isLoading: isRunsLoading,
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ['memberDeviceRuns', deviceId],
    queryFn: async () => {
      if (!deviceId) return { runs: [] }
      const res = await apiFetch(`/api/member/devices/${deviceId}/runs`)
      if (!res.ok) throw new Error('Gagal memuat riwayat sesi mesin')
      return res.json()
    },
    enabled: isOpen && Boolean(deviceId) && activeTab === 'runs',
    staleTime: 15000,
  })

  // Load More Logs using cursor
  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore || !deviceId) return
    setIsLoadingMore(true)
    try {
      const url = `/api/member/devices/${deviceId}/history?limit=25&cursor=${nextCursor}${statusFilter ? `&status=${statusFilter}` : ''}`
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        setLogs((prev) => [...prev, ...(data.logs || [])])
        setNextCursor(data.nextCursor || null)
      }
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6 space-y-5 text-start">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-primary dark:text-blue-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{device?.label || `Perangkat #${device?.id}`}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  SLOT #{device?.slotNumber || 1}
                </span>
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {device?.phone ? `Nomor: ${device.phone}` : 'Perangkat belum terhubung'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('messages')}
              className={[
                'px-4 py-2 rounded-lg text-xs font-bold transition-all',
                activeTab === 'messages'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
              ].join(' ')}
            >
              {t('memberWhatsapp.tabMessages', 'Pesan Terkirim')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('runs')}
              className={[
                'px-4 py-2 rounded-lg text-xs font-bold transition-all',
                activeTab === 'runs'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
              ].join(' ')}
            >
              {t('memberWhatsapp.tabRuns', 'Sesi Mesin (Runs)')}
            </button>
          </div>

          {/* Filter Status (Only on Messages Tab) */}
          {activeTab === 'messages' && (
            <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
              {[
                { label: t('memberWhatsapp.filterAll', 'Semua'), val: '' },
                { label: t('memberWhatsapp.filterSent', 'Terkirim'), val: 'sent' },
                { label: t('memberWhatsapp.filterSuccess', 'Sukses'), val: 'success' },
                { label: t('memberWhatsapp.filterFailed', 'Gagal'), val: 'failed' },
              ].map((f) => (
                <button
                  key={f.val}
                  type="button"
                  onClick={() => setStatusFilter(f.val)}
                  className={[
                    'px-3 py-1.5 rounded-lg font-semibold transition-colors',
                    statusFilter === f.val
                      ? 'bg-primary text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: MESSAGES LIST */}
        {activeTab === 'messages' && (
          <div className="space-y-3">
            {isHistoryLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Memuat riwayat pesan...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                {t('memberWhatsapp.noHistory', 'Belum ada riwayat pengiriman untuk perangkat ini.')}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5 text-start">{t('memberWhatsapp.colTime', 'Waktu')}</th>
                      <th className="py-3 px-3.5 text-start">{t('memberWhatsapp.colPhone', 'Nomor Kontak')}</th>
                      <th className="py-3 px-3.5 text-start">{t('memberWhatsapp.colCategory', 'Kategori')}</th>
                      <th className="py-3 px-3.5 text-start">{t('memberWhatsapp.colStatus', 'Status')}</th>
                      <th className="py-3 px-3.5 text-start">{t('memberWhatsapp.colReason', 'Alasan / Error')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formatDate(log.createdAt, i18n.language)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-medium text-slate-800 dark:text-slate-200">
                          {log.phone}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                          {log.categoryName || log.campaignTitle || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {log.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Sukses
                            </span>
                          ) : log.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <XCircle className="w-3 h-3" />
                              Gagal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                              <Send className="w-3 h-3" />
                              Terkirim
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 max-w-xs truncate text-[11px]">
                          {log.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Load More Button */}
            {nextCursor && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {isLoadingMore ? 'Memuat...' : t('memberWhatsapp.loadMore', 'Muat Lebih Banyak')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RUNS SESSIONS */}
        {activeTab === 'runs' && (
          <div className="space-y-3">
            {isRunsLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Memuat riwayat sesi mesin...</span>
              </div>
            ) : !runsData?.runs || runsData.runs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                Belum ada sesi run yang tercatat untuk perangkat ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5 text-start">Sesi Mulai</th>
                      <th className="py-3 px-3.5 text-start">Kategori</th>
                      <th className="py-3 px-3.5 text-start">Mode</th>
                      <th className="py-3 px-3.5 text-start">Speed</th>
                      <th className="py-3 px-3.5 text-start">Kirim / Sukses / Gagal</th>
                      <th className="py-3 px-3.5 text-start">Pendapatan</th>
                      <th className="py-3 px-3.5 text-start">Alasan Berhenti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {runsData.runs.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formatDate(r.startedAt, i18n.language)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                          {r.categoryName || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={[
                              'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase',
                              r.mode === 'brutal'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : r.mode === 'safe'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
                            ].join(' ')}
                          >
                            {r.mode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                          {r.speedSeconds}s
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{r.sent}</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-emerald-600 font-bold">{r.success}</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-rose-600 font-bold">{r.failed}</span>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                          Rp {formatNumber(r.earned, i18n.language)}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                          {r.stopReason || (r.endedAt ? 'selesai' : 'berjalan')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
