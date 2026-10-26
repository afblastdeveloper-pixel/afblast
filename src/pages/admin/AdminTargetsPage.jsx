import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListFilter, Upload, Plus, Trash2, RotateCcw, Download,
  Search, CheckSquare, Square, AlertCircle, FileText,
  Phone, User, Check, X, RefreshCw, ChevronLeft, ChevronRight,
  ShieldAlert, ArrowUpDown, FileSpreadsheet, AlertTriangle
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch, buildApiUrl } from '../../utils/client'

/**
 * AdminTargetsPage – Halaman Daftar Target Super Admin (/superadmin/targets)
 * Menampilkan dan mengelola jutaan target kontak WhatsApp dengan paginasi cursor,
 * import CSV berkapasitas besar, reset antrean aman, dan penghapusan massal terotentikasi.
 */
export default function AdminTargetsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // State Filter & Paginasi
  const [activeTab, setActiveTab] = useState('all') // all | queued | none | success | failed
  const [searchPhone, setSearchPhone] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [cursor, setCursor] = useState(null)
  const [cursorStack, setCursorStack] = useState([]) // Stack cursor sebelumnya untuk tombol "Sebelumnya"

  // State Seleksi Baris
  const [selectedIds, setSelectedIds] = useState([])
  const [selectAllFiltered, setSelectAllFiltered] = useState(false)

  // State Modal-modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState(null)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvUploadReport, setCsvUploadReport] = useState(null)

  // State Dialog Konfirmasi
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [isBulkActionModalOpen, setIsBulkActionModalOpen] = useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)

  // Fetch Kategori Kontak untuk Dropdown Filter & Form
  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories-list'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/categories?limit=100')
      if (!res.ok) return { categories: [] }
      return res.json()
    },
    staleTime: 60000,
  })
  const categories = categoriesData?.categories || []

  // Fetch Data Target dengan Paginasi Cursor
  const {
    data: targetsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-targets', activeTab, selectedCategory, searchPhone, pageSize, cursor],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      if (cursor) params.set('cursor', String(cursor))
      if (activeTab !== 'all') params.set('status', activeTab)
      if (selectedCategory) params.set('categoryId', selectedCategory)
      if (searchPhone.trim()) params.set('q', searchPhone.trim())

      const res = await apiFetch(`/api/admin/targets?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Gagal mengambil data target: ${res.status}`)
      }
      return res.json()
    },
    staleTime: 10000,
    keepPreviousData: true,
  })

  const targets = targetsData?.targets || []
  const nextCursor = targetsData?.nextCursor || null
  const stats = targetsData?.stats || {}
  const totalCount = targetsData?.totalCount || 0

  // Format Helper
  const formatNum = (val) =>
    new Intl.NumberFormat(i18n.language || 'id-ID').format(Number(val) || 0)

  // Handler Pindah Halaman Cursor
  const handleNextPage = () => {
    if (nextCursor) {
      setCursorStack((prev) => [...prev, cursor])
      setCursor(nextCursor)
      setSelectedIds([])
      setSelectAllFiltered(false)
    }
  }

  const handlePrevPage = () => {
    if (cursorStack.length > 0) {
      const prev = [...cursorStack]
      const lastCursor = prev.pop()
      setCursorStack(prev)
      setCursor(lastCursor || null)
      setSelectedIds([])
      setSelectAllFiltered(false)
    }
  }

  // Reset Cursor saat filter berubah
  const handleFilterChange = (setter, value) => {
    setter(value)
    setCursor(null)
    setCursorStack([])
    setSelectedIds([])
    setSelectAllFiltered(false)
  }

  // Handler Seleksi Checkbox
  const handleToggleRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
    setSelectAllFiltered(false)
  }

  const handleToggleSelectAllPage = () => {
    if (selectedIds.length === targets.length && targets.length > 0) {
      setSelectedIds([])
      setSelectAllFiltered(false)
    } else {
      setSelectedIds(targets.map((t) => t.id))
      setSelectAllFiltered(false)
    }
  }

  const handleSelectAllFilteredResults = () => {
    setSelectAllFiltered(true)
  }

  // ================= MUTATIONS =================
  // 1. Tambah / Ubah Target
  const targetMutation = useMutation({
    mutationFn: async (formData) => {
      const url = editingTarget
        ? `/api/admin/targets/${editingTarget.id}`
        : '/api/admin/targets'
      const method = editingTarget ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan target')
      }
      return data
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-targets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setIsAddModalOpen(false)
      setEditingTarget(null)
      setActionSuccess(editingTarget ? 'Target berhasil diperbarui' : 'Kontak target berhasil ditambahkan')
    },
    onError: (err) => {
      setActionError(err.message)
    },
  })

  // 2. Hapus Satu Target
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/targets/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus target')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-targets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setSingleDeleteTarget(null)
      setActionSuccess('Target berhasil dihapus')
    },
    onError: (err) => {
      setActionError(err.message)
    },
  })

  // 3. Reset Antrean
  const resetQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/targets/reset-queue', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: selectedCategory ? Number(selectedCategory) : undefined,
          confirmWord: 'RESET',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mereset antrean')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-targets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setConfirmResetOpen(false)
      setActionSuccess(`Berhasil mereset antrean (${data.resetCount || 0} kontak terdampak).`)
    },
    onError: (err) => {
      setActionError(err.message)
    },
  })

  // 4. Hapus Massal / Pindahkan ke Draft / Aktifkan
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action = 'delete', scope = 'filter', password, confirmWord = 'HAPUS', ids }) => {
      const body = {
        action,
        scope,
        confirmWord,
        password,
      }
      if (scope === 'selected') {
        body.ids = ids || selectedIds
      } else if (scope === 'all') {
        body.categoryId = selectedCategory ? Number(selectedCategory) : undefined
      } else {
        body.filter = {
          status: activeTab !== 'all' ? activeTab : undefined,
          categoryId: selectedCategory ? Number(selectedCategory) : undefined,
          q: searchPhone.trim() || undefined,
        }
      }

      const res = await apiFetch('/api/admin/targets/bulk-delete', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses aksi massal target')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-targets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setIsBulkActionModalOpen(false)
      setSelectedIds([])
      setSelectAllFiltered(false)
      setActionSuccess(data.message || 'Aksi target berhasil diselesaikan.')
    },
    onError: (err) => {
      setActionError(err.message)
    },
  })

  // Handler Export Gzip CSV Backup
  const handleExportBackup = () => {
    const token = localStorage.getItem('afblast.staff.token')
    const exportUrl = buildApiUrl(`/api/admin/targets/export?token=${encodeURIComponent(token || '')}`)
    window.open(exportUrl, '_blank')
  }

  // Hitung segmen persentase statistik
  const totalUpload = Number(stats.totalUpload || totalCount || 0)
  const queuedCount = Number(stats.queued || 0)
  const activeCount = Number(stats.active || 0)
  const successCount = Number(stats.success || 0)
  const failedCount = Number(stats.failed || 0)

  const succPct = totalUpload > 0 ? ((successCount / totalUpload) * 100).toFixed(1) : 0
  const failPct = totalUpload > 0 ? ((failedCount / totalUpload) * 100).toFixed(1) : 0
  const quePct = totalUpload > 0 ? ((queuedCount / totalUpload) * 100).toFixed(1) : 0
  const actPct = totalUpload > 0 ? ((activeCount / totalUpload) * 100).toFixed(1) : 0

  return (
    <div className="space-y-6">
      {/* Notifikasi Alert Sukses / Gagal */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="p-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="p-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Page Header & Tombol Utama */}
      <PageHeader
        title={t('adminTargets.title', 'Daftar Target Kontak')}
        subtitle={t('adminTargets.subtitle', 'Kelola kolam nomor kontak target untuk blast WhatsApp, monitoring status antrean, dan import massal.')}
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tombol Reset Antrean */}
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              title="Reset antrean kontak yang sedang tersangkut kembali ke siap kirim"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Antrean</span>
            </button>

            {/* Tombol Aksi Massal (Hapus Semua / Draft) */}
            <button
              type="button"
              onClick={() => setIsBulkActionModalOpen(true)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs ${
                selectedIds.length > 0
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                  : 'border-border bg-surface text-text hover:bg-surface-2'
              }`}
              title="Aksi massal: Hapus semua permanen atau jadikan draft"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>
                Aksi Target (Hapus / Draft)
                {selectedIds.length > 0 ? ` (${selectedIds.length} dipilih)` : ''}
              </span>
            </button>

            {/* Tombol Backup (Gzip CSV) */}
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-3 py-2 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="Unduh backup seluruh kontak dalam arsip .csv.gz"
            >
              <Download className="w-3.5 h-3.5 text-muted" />
              <span>Backup</span>
            </button>

            {/* Tombol Unggah CSV / TXT */}
            <button
              type="button"
              onClick={() => {
                setCsvUploadReport(null)
                setIsCsvModalOpen(true)
              }}
              className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-2/80 text-text border border-border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="Unggah nomor target massal melalui file CSV atau TXT"
            >
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span>Unggah CSV / TXT</span>
            </button>

            {/* Tombol Tambah Kontak */}
            <button
              type="button"
              onClick={() => {
                setEditingTarget(null)
                setIsAddModalOpen(true)
              }}
              className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kontak</span>
            </button>
          </div>
        )}
      />

      {/* 2. Kartu Statistik & Segmented Progress Bar */}
      <div className="bg-surface rounded-2xl p-5 border border-border shadow-2xs space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 bg-surface-2/70 rounded-xl border border-border">
            <span className="text-[11px] font-medium text-muted block">Total Upload</span>
            <span className="text-xl sm:text-2xl font-bold text-text mt-1 block tabular-nums">
              <AnimatedNumber value={totalUpload} formatter={formatNum} />
            </span>
            <span className="text-[10px] text-muted">Naik otomatis saat kontak masuk</span>
          </div>

          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 block">Antre</span>
            <span className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block tabular-nums">
              <AnimatedNumber value={queuedCount} formatter={formatNum} />
            </span>
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">{quePct}% menunggu giliran</span>
          </div>

          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 block">Aktif</span>
            <span className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1 block tabular-nums">
              <AnimatedNumber value={activeCount} formatter={formatNum} />
            </span>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">{actPct}% sedang dikirim</span>
          </div>

          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">Sukses</span>
            <span className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 block tabular-nums">
              <AnimatedNumber value={successCount} formatter={formatNum} />
            </span>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-semibold">+{succPct}% berhasil</span>
          </div>

          <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 block">Gagal</span>
            <span className="text-xl sm:text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1 block tabular-nums">
              <AnimatedNumber value={failedCount} formatter={formatNum} />
            </span>
            <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-semibold">+{failPct}% tidak terkirim</span>
          </div>
        </div>

        {/* Progress bar multi segmen */}
        <div className="w-full h-2.5 bg-surface-2 rounded-full overflow-hidden flex shadow-inner">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${succPct}%` }} title={`Sukses: ${succPct}%`} />
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${actPct}%` }} title={`Aktif: ${actPct}%`} />
          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${quePct}%` }} title={`Antre: ${quePct}%`} />
          <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${failPct}%` }} title={`Gagal: ${failPct}%`} />
        </div>
      </div>

      {/* 3. Tab Filter & Search Bar */}
      <div className="space-y-3">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border text-xs scrollbar-none">
          {[
            { key: 'all', label: 'Semua Kontak' },
            { key: 'queued', label: 'Dalam Antrean' },
            { key: 'none', label: 'Belum Masuk Antrean' },
            { key: 'draft', label: `Draft (${formatNum(stats.draft || 0)})` },
            { key: 'success', label: 'Target Sukses' },
            { key: 'failed', label: 'Target Gagal' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleFilterChange(setActiveTab, tab.key)}
              className={`px-3.5 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Baris Pencarian & Dropdown Kategori */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            {/* Input Cari Nomor */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchPhone}
                onChange={(e) => handleFilterChange(setSearchPhone, e.target.value)}
                placeholder="Cari awalan nomor WhatsApp (contoh: 62812)..."
                className="w-full ps-9 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text placeholder:text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {searchPhone && (
                <button
                  type="button"
                  onClick={() => handleFilterChange(setSearchPhone, '')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Kategori */}
            <select
              value={selectedCategory}
              onChange={(e) => handleFilterChange(setSelectedCategory, e.target.value)}
              className="py-2 px-3 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.countryCode ? `(+${c.countryCode})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Indikator Total Kontak */}
          <div className="text-xs text-muted flex items-center justify-between sm:justify-end gap-2">
            <span>
              Total Semua Target:{' '}
              <strong className="text-text font-bold tabular-nums">
                <AnimatedNumber value={totalCount} formatter={formatNum} />
              </strong>{' '}
              kontak
            </span>

            {/* Selector Jumlah per Halaman */}
            <div className="flex items-center gap-1.5 ms-2">
              <span className="text-[11px] text-muted">Per hal:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCursor(null)
                  setCursorStack([])
                }}
                className="py-1 px-2 text-xs bg-surface border border-border rounded-lg text-text"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Banner Seleksi Massal Lintas Halaman */}
      {selectedIds.length === targets.length && targets.length > 0 && totalCount > targets.length && (
        <div className="p-3 bg-primary/10 border border-primary/25 rounded-xl text-xs text-text flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span>
              {selectAllFiltered ? (
                <span>
                  Semua <strong className="font-bold tabular-nums">{formatNum(totalCount)}</strong> kontak hasil filter telah dipilih.
                </span>
              ) : (
                <span>
                  Semua <strong className="font-bold tabular-nums">{targets.length}</strong> kontak di halaman ini dipilih.
                </span>
              )}
            </span>
          </div>

          {!selectAllFiltered ? (
            <button
              type="button"
              onClick={handleSelectAllFilteredResults}
              className="text-xs font-bold text-primary hover:underline text-left sm:text-right"
            >
              Pilih semua {formatNum(totalCount)} hasil filter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedIds([])
                setSelectAllFiltered(false)
              }}
              className="text-xs font-semibold text-muted hover:text-text text-left sm:text-right"
            >
              Batalkan pilihan
            </button>
          )}
        </div>
      )}

      {/* 4. Tabel Kontak dengan Paginasi Cursor */}
      <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
        {isLoading && !targetsData ? (
          <TableSkeleton rows={8} cols={5} />
        ) : isError ? (
          <ErrorState
            title="Gagal memuat daftar target"
            message={error?.message || 'Terjadi gangguan saat mengambil data kontak.'}
            onRetry={() => refetch()}
            isRetrying={isFetching}
          />
        ) : targets.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title="Tidak Ada Kontak Ditemukan"
            message={
              searchPhone || selectedCategory || activeTab !== 'all'
                ? 'Tidak ada target yang sesuai dengan kriteria filter saat ini.'
                : 'Belum ada kontak target yang diunggah ke dalam sistem.'
            }
            action={(
              <button
                type="button"
                onClick={() => {
                  setCsvUploadReport(null)
                  setIsCsvModalOpen(true)
                }}
                className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
              >
                Unggah Kontak (CSV / TXT)
              </button>
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted border-collapse">
              <thead className="bg-surface-2/60 text-text font-semibold uppercase text-[11px] border-b border-border">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllPage}
                      className="p-1 rounded hover:bg-surface-2 text-text"
                      title="Pilih semua di halaman ini"
                    >
                      {selectedIds.length === targets.length && targets.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5">Nomor WA</th>
                  <th className="px-4 py-3.5">Nama Kontak</th>
                  <th className="px-4 py-3.5">Kategori Target</th>
                  <th className="px-4 py-3.5">Status Antrean</th>
                  <th className="px-4 py-3.5">Sumber Persetujuan</th>
                  <th className="px-4 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {targets.map((target) => {
                  const isChecked = selectedIds.includes(target.id) || selectAllFiltered

                  return (
                    <tr
                      key={target.id}
                      className={`hover:bg-surface-2/40 transition-colors ${isChecked ? 'bg-primary/5' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleRow(target.id)}
                          className="p-1 rounded hover:bg-surface-2 text-text"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted" />
                          )}
                        </button>
                      </td>

                      {/* Nomor WA */}
                      <td className="px-4 py-3.5 font-mono font-semibold text-text">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                          <span>+{target.phone}</span>
                        </div>
                      </td>

                      {/* Nama Kontak */}
                      <td className="px-4 py-3.5 text-text">
                        {target.name ? (
                          <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                            <User className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                            <span>{target.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* Kategori Target Badge */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-2 text-text border border-border">
                          {target.category?.name || 'Umum'}
                        </span>
                      </td>

                      {/* Status Antrean Badge */}
                      <td className="px-4 py-3.5">
                        {target.queueStatus === 'queued' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Antre
                          </span>
                        )}
                        {target.queueStatus === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Aktif
                          </span>
                        )}
                        {target.queueStatus === 'success' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3 h-3" />
                            Sukses
                          </span>
                        )}
                        {target.queueStatus === 'failed' && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-help"
                            title={target.lastError || 'Pengiriman gagal'}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Gagal
                          </span>
                        )}
                        {target.queueStatus === 'draft' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                            Draft (Nonaktif)
                          </span>
                        )}
                        {(!target.queueStatus || target.queueStatus === 'none') && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-muted border border-border">
                            Belum Antre
                          </span>
                        )}
                      </td>

                      {/* Sumber Persetujuan */}
                      <td className="px-4 py-3.5 text-muted truncate max-w-[180px]" title={target.consentSource}>
                        {target.consentSource || '-'}
                      </td>

                      {/* Aksi */}
                      <td className="px-4 py-3.5 text-right space-x-1 whitespace-nowrap">
                        {target.queueStatus === 'draft' ? (
                          <button
                            type="button"
                            onClick={() =>
                              bulkActionMutation.mutate({
                                action: 'activate',
                                scope: 'selected',
                                ids: [target.id],
                              })
                            }
                            className="px-2 py-1 rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 text-[11px] font-semibold transition-colors"
                            title="Aktifkan kembali ke antrean siap kirim"
                          >
                            Aktifkan
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              bulkActionMutation.mutate({
                                action: 'draft',
                                scope: 'selected',
                                ids: [target.id],
                              })
                            }
                            className="px-2 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 text-[11px] font-semibold transition-colors"
                            title="Pindahkan ke Draft (nonaktifkan dari dashboard member)"
                          >
                            Draft
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTarget(target)
                            setIsAddModalOpen(true)
                          }}
                          className="px-2.5 py-1 rounded-lg border border-border text-text hover:bg-surface-2 text-[11px] font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleDeleteTarget(target)}
                          className="px-2 py-1 rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-semibold transition-colors"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Baris Paginasi Cursor */}
        <div className="p-4 border-t border-border flex items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span>
              Menampilkan <strong className="text-text font-semibold">{targets.length}</strong> kontak
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0 || isFetching}
              className="px-3 py-1.5 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!nextCursor || isFetching}
              className="px-3 py-1.5 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODAL TAMBAH / EDIT KONTAK ================= */}
      <TargetFormModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditingTarget(null)
        }}
        initialData={editingTarget}
        categories={categories}
        onSubmit={(data) => targetMutation.mutate(data)}
        isLoading={targetMutation.isPending}
      />

      {/* ================= MODAL UNGGAH CSV ================= */}
      <CsvUploadModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        categories={categories}
        onSuccessReport={(report) => {
          queryClient.invalidateQueries({ queryKey: ['admin-targets'] })
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
          setCsvUploadReport(report)
        }}
        report={csvUploadReport}
      />

      {/* ================= DIALOG KONFIRMASI RESET ANTREAN ================= */}
      <ConfirmDialog
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => resetQueueMutation.mutate()}
        title="Reset Antrean Kontak Blast"
        message="Tindakan ini akan mengembalikan semua kontak yang sedang berstatus Antre atau Aktif ke antrean awal. Gunakan jika ada kampanye yang macet atau butuh penjadwalan ulang."
        confirmWord="RESET"
        affectedCount={queuedCount + activeCount}
        confirmText="Reset Antrean Sekarang"
        variant="warning"
        isLoading={resetQueueMutation.isPending}
      />

      {/* ================= MODAL AKSI MASSAL (HAPUS PERMANEN / DRAFT) ================= */}
      <BulkActionModal
        isOpen={isBulkActionModalOpen}
        onClose={() => setIsBulkActionModalOpen(false)}
        totalCount={totalCount}
        selectedCount={selectedIds.length}
        selectAllFiltered={selectAllFiltered}
        onConfirm={(payload) => bulkActionMutation.mutate(payload)}
        isLoading={bulkActionMutation.isPending}
        formatNum={formatNum}
      />

      {/* ================= DIALOG KONFIRMASI HAPUS SATU TARGET ================= */}
      <ConfirmDialog
        isOpen={Boolean(singleDeleteTarget)}
        onClose={() => setSingleDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(singleDeleteTarget.id)}
        title="Hapus Nomor Target"
        message={`Apakah Anda yakin ingin menghapus nomor +${singleDeleteTarget?.phone} dari database target?`}
        confirmText="Hapus Nomor"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

/**
 * Modal Tambah & Edit Kontak Target Tunggal
 */
function TargetFormModal({ isOpen, onClose, initialData, categories, onSubmit, isLoading }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [consentSource, setConsentSource] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (initialData) {
      setPhone(initialData.phone || '')
      setName(initialData.name || '')
      setCategoryId(String(initialData.categoryId || ''))
      setConsentSource(initialData.consentSource || '')
    } else {
      setPhone('')
      setName('')
      setCategoryId(categories[0]?.id ? String(categories[0].id) : '')
      setConsentSource('Pendaftaran Web / Formulir Opt-In')
    }
    setErrorMsg('')
  }, [initialData, categories, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    // Bersihkan nomor dari tanda +, strip, spasi
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 8) {
      setErrorMsg('Nomor WhatsApp minimal 8 digit angka')
      return
    }
    if (!consentSource.trim()) {
      setErrorMsg('Sumber persetujuan wajib diisi untuk kepatuhan regulasi')
      return
    }

    onSubmit({
      phone: cleanPhone,
      name: name.trim() || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      consentSource: consentSource.trim(),
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Target Kontak' : 'Tambah Kontak Baru'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Input Nomor WA */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Nomor WhatsApp <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted font-mono text-xs">+</span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="628123456789 (tanpa tanda + atau spasi)"
              className="w-full ps-7 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>
          <p className="text-[10px] text-muted">Gunakan format internasional tanpa awalan nol (contoh: 62812...)</p>
        </div>

        {/* Input Nama Kontak */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Nama Kontak <span className="text-muted font-normal">(Opsional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama penerima pesan"
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Pilihan Kategori */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Kategori Target <span className="text-danger">*</span>
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.countryCode ? `(+${c.countryCode})` : ''} - Rp{c.ratePerMessage}/pesan
              </option>
            ))}
          </select>
        </div>

        {/* Sumber Persetujuan Wajib */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Sumber Persetujuan (Consent Source) <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={consentSource}
            onChange={(e) => setConsentSource(e.target.value)}
            placeholder="Contoh: Formulir Pendaftaran Web / Checkout Toko / Member Club"
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
          <p className="text-[10px] text-muted">
            Wajib dicatat untuk mematuhi regulasi privasi dan kebijakan anti-spam WhatsApp.
          </p>
        </div>

        {/* Footer Tombol */}
        <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isLoading ? 'Menyimpan...' : 'Simpan Kontak'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Modal Unggah CSV & TXT dengan Dropzone, Contoh Format, Validasi Consent, Progress, dan Laporan Akhir
 */
function CsvUploadModal({ isOpen, onClose, categories, onSuccessReport, report }) {
  const [file, setFile] = useState(null)
  const [categoryId, setCategoryId] = useState('auto')
  const [consentAgreed, setConsentAgreed] = useState(false)
  const [consentSource, setConsentSource] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setFile(null)
      setCategoryId('auto')
      setConsentAgreed(false)
      setConsentSource('')
      setUploadError('')
      setIsUploading(false)
    }
  }, [isOpen])

  const isValidFileType = (fileName, mimeType) => {
    const lower = (fileName || '').toLowerCase()
    return (
      lower.endsWith('.csv') ||
      lower.endsWith('.txt') ||
      mimeType === 'text/csv' ||
      mimeType === 'text/plain'
    )
  }

  const handleFileDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && isValidFileType(droppedFile.name, droppedFile.type)) {
      setFile(droppedFile)
      setUploadError('')
    } else {
      setUploadError('Harap unggah file berformat .csv atau .txt')
    }
  }

  const handleFileSelect = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      if (isValidFileType(selected.name, selected.type)) {
        setFile(selected)
        setUploadError('')
      } else {
        setUploadError('Harap pilih file berformat .csv atau .txt')
      }
    }
  }

  // Unduh contoh template berkas .TXT
  const handleDownloadTxtSample = () => {
    const content = `# CONTOH DAFTAR NOMOR TARGET WHATSAPP (.TXT)
# Format 1: Hanya nomor telepon (1 nomor per baris)
# Format 2: Nomor diikuti nama dipisahkan koma atau tab (nomor, nama)
# Sistem otomatis menormalisasi nomor (08xxx -> 628xxx, 8xxx -> 628xxx)

6281234567890
081987654321
+6285712345678
082199887766, Budi Santoso
6285211223344, Rina Finance
087812341234, Pelanggan Setia
`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'contoh_nomor_target.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Unduh contoh template berkas .CSV
  const handleDownloadCsvSample = () => {
    const content = `phone,name
6281234567890,Budi Santoso
081987654321,Rina Finance
+6285712345678,Dimas Developer
082199887766,Pelanggan Prioritas
`
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'contoh_target_kontak.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setUploadError('Pilih file CSV atau TXT terlebih dahulu')
      return
    }
    if (!consentAgreed) {
      setUploadError('Anda wajib mencentang pernyataan persetujuan kontak')
      return
    }
    if (!consentSource.trim()) {
      setUploadError('Sumber persetujuan wajib diisi')
      return
    }

    setIsUploading(true)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('categoryId', categoryId)
      formData.append('consentSource', consentSource.trim())
      formData.append('consentAgreed', 'true')
      formData.append('consentConfirmed', 'true')

      const res = await apiFetch('/api/admin/targets/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses file target')
      }

      onSuccessReport(data)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Unduh kontak yang ditolak dalam bentuk file CSV
  const handleDownloadRejectedCsv = () => {
    if (!report?.rejectedData || report.rejectedData.length === 0) return

    const header = 'Baris,Nomor WA,Alasan Penolakan\n'
    const rows = report.rejectedData
      .map((item) => `${item.line || ''},"${item.phone || ''}","${(item.reason || '').replace(/"/g, '""')}"`)
      .join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `kontak_ditolak_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const isTxtFile = file?.name?.toLowerCase()?.endsWith('.txt')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Unggah Kontak Massal (CSV / TXT)"
      maxWidth="lg"
    >
      {/* Jika sudah ada laporan akhir */}
      {report ? (
        <div className="space-y-5 animate-fadeIn">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                Pemrosesan Berkas Selesai!
              </h4>
              <p className="text-xs text-emerald-600/90 dark:text-emerald-400/90">
                {report.message || 'Kontak berhasil divalidasi dan disimpan ke kolam target.'}
              </p>
            </div>
          </div>

          {/* Kartu Ringkasan Hasil */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border text-center">
              <span className="text-[11px] text-muted block">Berhasil Masuk</span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block tabular-nums">
                {report.accepted || 0}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border text-center">
              <span className="text-[11px] text-muted block">Duplikat Terdeteksi</span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 block tabular-nums">
                {report.duplicates || 0}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border text-center">
              <span className="text-[11px] text-muted block">Format Tidak Valid</span>
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 block tabular-nums">
                {report.invalid || 0}
              </span>
            </div>
          </div>

          {/* Opsi Unduh Kontak Ditolak */}
          {report.rejectedData && report.rejectedData.length > 0 && (
            <div className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">
                  Terdapat <strong>{report.rejectedData.length}</strong> baris yang tidak dapat dimasukkan:
                </span>
                <button
                  type="button"
                  onClick={handleDownloadRejectedCsv}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Data yang Ditolak</span>
                </button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
            >
              Selesai & Tutup
            </button>
          </div>
        </div>
      ) : (
        /* Form Upload */
        <form onSubmit={handleUploadSubmit} className="space-y-5">
          {uploadError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Format Helper & Download Sample Template */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-text flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary" />
                Format yang Didukung: <span className="font-mono text-primary">.CSV</span> & <span className="font-mono text-primary">.TXT</span>
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                File .TXT (1 nomor per baris) atau file .CSV (kolom nomor & nama).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleDownloadTxtSample}
                className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-2 border border-border text-[11px] font-semibold text-text inline-flex items-center gap-1 transition-colors shadow-2xs"
                title="Unduh contoh file nomor .txt"
              >
                <Download className="w-3 h-3 text-primary" />
                <span>Contoh .TXT</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCsvSample}
                className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-2 border border-border text-[11px] font-semibold text-text inline-flex items-center gap-1 transition-colors shadow-2xs"
                title="Unduh contoh file tabel .csv"
              >
                <Download className="w-3 h-3 text-emerald-600" />
                <span>Contoh .CSV</span>
              </button>
            </div>
          </div>

          {/* Dropzone Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40 bg-surface-2/40'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-surface-2 text-primary flex items-center justify-center mx-auto mb-3">
              {isTxtFile ? (
                <FileText className="w-6 h-6 text-primary" />
              ) : (
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              )}
            </div>
            {file ? (
              <div>
                <p className="text-xs font-bold text-text">{file.name}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  Ukuran: {(file.size / 1024).toFixed(1)} KB — Klik untuk mengganti berkas
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-text">Tarik & lepas file CSV atau TXT di sini, atau klik untuk memilih</p>
                <p className="text-[11px] text-muted mt-1">
                  Mendukung berkas teks <span className="font-mono text-text">.txt</span> (1 nomor per baris) atau <span className="font-mono text-text">.csv</span> (kolom phone, name)
                </p>
              </div>
            )}
          </div>

          {/* Pilihan Kategori Target */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text">
              Target Kategori Kontak
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="auto">
                ⚡ Auto-map berdasarkan kode negara (contoh: 62 -&gt; Indonesia, 60 -&gt; Malaysia)
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.countryCode ? `(+${c.countryCode})` : ''} - Rp{c.ratePerMessage}/pesan
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted">
              Bila memilih auto-map, sistem akan mencocokkan kode negara target dengan kategori yang tersedia secara otomatis.
            </p>
          </div>

          {/* Isian Sumber Persetujuan Wajib */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text">
              Sumber Persetujuan (Consent Source) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={consentSource}
              onChange={(e) => setConsentSource(e.target.value)}
              placeholder="Contoh: Database Pelanggan Toko 2026 / Form Lead Web / Member Club"
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>

          {/* Kotak Centang Pernyataan Persetujuan Wajib */}
          <div className="p-3.5 bg-surface-2 rounded-xl border border-border">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-text leading-relaxed">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary/30"
                required
              />
              <span>
                <strong>Pernyataan Kepatuhan:</strong> Saya menyatakan bahwa seluruh nomor kontak dalam berkas ini diperoleh secara sah melalui persetujuan (opt-in) penerima, serta tidak melanggar ketentuan anti-spam WhatsApp.
              </span>
            </label>
          </div>

          {/* Progress Bar saat upload */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Memproses dan memvalidasi kontak...</span>
                <span className="animate-pulse font-semibold text-primary">Sedang memproses</span>
              </div>
              <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-full" />
              </div>
            </div>
          )}

          {/* Footer Tombol */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isUploading || !file || !consentAgreed || !consentSource.trim()}
              className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses Berkas...</span>
                </>
              ) : (
                <span>Mulai Unggah Kontak</span>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/**
 * Modal Aksi Massal Target Kontak (Hapus Semua Permanen / Pindahkan ke Draft / Aktifkan)
 */
function BulkActionModal({
  isOpen,
  onClose,
  totalCount,
  selectedCount,
  selectAllFiltered,
  onConfirm,
  isLoading,
  formatNum,
}) {
  const [action, setAction] = useState('delete') // 'delete' | 'draft' | 'activate'
  const [scope, setScope] = useState(selectedCount > 0 ? 'selected' : 'all')
  const [confirmWord, setConfirmWord] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setAction('delete')
      setScope(selectedCount > 0 ? 'selected' : 'all')
      setConfirmWord('')
      setPassword('')
      setErrorMsg('')
    }
  }, [isOpen, selectedCount])

  const targetCount = scope === 'selected' ? selectedCount : totalCount

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (action === 'delete') {
      if (confirmWord !== 'HAPUS') {
        setErrorMsg('Ketik kata konfirmasi "HAPUS" untuk melanjutkan penghapusan permanen')
        return
      }
      if (!password) {
        setErrorMsg('Kata sandi admin diperlukan untuk memverifikasi penghapusan permanen')
        return
      }
    }

    onConfirm({
      action,
      scope,
      confirmWord,
      password,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Aksi Target Kontak Massal"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Pilih Jenis Tindakan */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-text">
            Pilih Jenis Tindakan:
          </label>
          <div className="grid grid-cols-1 gap-2.5">
            {/* Opsi Hapus Permanen */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                action === 'delete'
                  ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-500/15 ring-1 ring-rose-500'
                  : 'border-border bg-surface-2/40 hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="bulkAction"
                value="delete"
                checked={action === 'delete'}
                onChange={() => setAction('delete')}
                className="mt-1 text-rose-600 focus:ring-rose-500"
              />
              <div className="flex-1">
                <span className="block text-xs font-bold text-rose-600 dark:text-rose-400">
                  🔴 Hapus Semua Permanen
                </span>
                <span className="block text-[11px] text-muted mt-0.5 leading-relaxed">
                  Menghapus kontak target dari database secara permanen. <strong>Data kontak yang dihapus otomatis langsung terhapus / hilang dari dashboard member.</strong>
                </span>
              </div>
            </label>

            {/* Opsi Pindahkan ke Draft */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                action === 'draft'
                  ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-1 ring-amber-500'
                  : 'border-border bg-surface-2/40 hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="bulkAction"
                value="draft"
                checked={action === 'draft'}
                onChange={() => setAction('draft')}
                className="mt-1 text-amber-600 focus:ring-amber-500"
              />
              <div className="flex-1">
                <span className="block text-xs font-bold text-amber-600 dark:text-amber-400">
                  🟡 Pindahkan ke Draft (Nonaktifkan)
                </span>
                <span className="block text-[11px] text-muted mt-0.5 leading-relaxed">
                  Menonaktifkan kontak dan mengubah statusnya menjadi Draft. Kontak tidak dihapus dari database, tetapi ditarik dari antrean blast dan <strong>otomatis terhapus / hilang dari angka data tersisa di dashboard member</strong> (dapat diaktifkan kembali).
                </span>
              </div>
            </label>

            {/* Opsi Aktifkan ke Antrean */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                action === 'activate'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-border bg-surface-2/40 hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="bulkAction"
                value="activate"
                checked={action === 'activate'}
                onChange={() => setAction('activate')}
                className="mt-1 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="block text-xs font-bold text-primary">
                  🟢 Aktifkan ke Antrean (Siap Kirim)
                </span>
                <span className="block text-[11px] text-muted mt-0.5 leading-relaxed">
                  Mengembalikan kontak berstatus Draft ke antrean siap kirim sehingga kembali aktif dan muncul di alokasi dashboard member.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* 2. Pilih Cakupan Target */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className="block text-xs font-semibold text-text">
            Cakupan Kontak:
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
            {selectedCount > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="selected"
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                  className="text-primary focus:ring-primary"
                />
                <span>Hanya Kontak yang Dipilih (<strong>{formatNum(selectedCount)}</strong> kontak)</span>
              </label>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="text-primary focus:ring-primary"
              />
              <span>Semua Kontak Target (<strong>{formatNum(totalCount)}</strong> kontak)</span>
            </label>
          </div>
        </div>

        {/* 3. Pengamanan Khusus Hapus Permanen */}
        {action === 'delete' && (
          <div className="space-y-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs animate-fadeIn">
            <p className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Konfirmasi Keamanan Penghapusan Permanen:
            </p>
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-medium text-text mb-1">
                  Ketik kata <strong className="text-rose-600 font-bold">HAPUS</strong>:
                </label>
                <input
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder="Ketik HAPUS"
                  className="w-full px-3 py-2 text-xs bg-surface border border-rose-500/30 rounded-lg text-text focus:ring-2 focus:ring-rose-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text mb-1">
                  Kata Sandi Admin:
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi admin Anda"
                  className="w-full px-3 py-2 text-xs bg-surface border border-rose-500/30 rounded-lg text-text focus:ring-2 focus:ring-rose-500/20"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Tombol */}
        <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isLoading || (action === 'delete' && (confirmWord !== 'HAPUS' || !password))}
            className={`px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 ${
              action === 'delete'
                ? 'bg-rose-600 hover:bg-rose-700'
                : action === 'draft'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : action === 'delete' ? (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Permanen ({formatNum(targetCount)} Kontak)</span>
              </>
            ) : action === 'draft' ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>Pindahkan ke Draft ({formatNum(targetCount)} Kontak)</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Aktifkan ({formatNum(targetCount)} Kontak)</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

