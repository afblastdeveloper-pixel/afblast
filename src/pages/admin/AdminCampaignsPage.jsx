import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send, Plus, Download, FileSpreadsheet, FileText,
  Play, Pause, FileEdit, Trash2, RotateCcw, Copy,
  BarChart2, MoreVertical, AlertCircle, Check, X,
  Bold, Italic, Strikethrough, Code, Image as ImageIcon,
  ExternalLink, Clock, CheckCheck, RefreshCw, AlertTriangle
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import { ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch, buildApiUrl } from '../../utils/client'

/**
 * AdminCampaignsPage – Halaman Kampanye Blast Super Admin (/superadmin/campaigns)
 * Dilengkapi grid kartu metrik realtime, editor pesan interaktif dengan pratinjau WhatsApp,
 * validasi kebijakan konten kata terlarang, panel laporan analitik, dan export Excel/PDF.
 */
export default function AdminCampaignsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // State Tab & Filter
  const [activeTab, setActiveTab] = useState('active') // active | draft | trash
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState(null)

  // State Modal Form & Laporan
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [reportingCampaignId, setReportingCampaignId] = useState(null)
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState(null)

  const [notification, setNotification] = useState(null)
  const exportMenuRef = useRef(null)

  // Tutup dropdown menu saat klik di luar
  useEffect(() => {
    function handleClickOutside(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false)
      }
      if (!e.target.closest('.campaign-dropdown-menu')) {
        setActiveMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 1. Fetch Kampanye
  const {
    data: campaignsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-campaigns', activeTab],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/campaigns?tab=${activeTab}`)
      if (!res.ok) throw new Error(`Gagal memuat kampanye: ${res.status}`)
      return res.json()
    },
    staleTime: 10000,
  })

  const campaigns = campaignsData?.campaigns || []
  const draftCount = campaignsData?.draftCount ?? 0
  const trashCount = campaignsData?.trashCount ?? 0

  // 2. Fetch Kategori & Template untuk Form Kampanye
  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories-list'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/categories?limit=100')
      return res.ok ? res.json() : { categories: [] }
    },
    staleTime: 60000,
  })
  const categories = categoriesData?.categories || []

  const { data: templatesData } = useQuery({
    queryKey: ['admin-templates-list'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/templates')
      return res.ok ? res.json() : { templates: [] }
    },
    staleTime: 60000,
  })
  const templates = templatesData?.templates || []

  // ================= MUTATIONS =================
  // 1. Aksi Status Kampanye (pause, resume, draft, trash, restore)
  const campaignActionMutation = useMutation({
    mutationFn: async ({ id, action }) => {
      const res = await apiFetch(`/api/admin/campaigns/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah status kampanye')
      return data
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      const actionLabels = {
        pause: 'Kampanye berhasil dijeda',
        resume: 'Kampanye dilanjutkan',
        draft: 'Kampanye dipindahkan ke Draft',
        trash: 'Kampanye dipindahkan ke Sampah',
        restore: 'Kampanye berhasil dipulihkan',
      }
      setNotification({ type: 'success', message: actionLabels[vars.action] || 'Aksi berhasil' })
      setActiveMenuId(null)
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // 2. Duplikasi Kampanye
  const duplicateMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menduplikasi kampanye')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] })
      setNotification({ type: 'success', message: 'Kampanye berhasil diduplikasi sebagai Draft baru' })
      setActiveMenuId(null)
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // 3. Hapus Permanen Kampanye dari Sampah
  const deletePermanentMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/campaigns/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus permanen kampanye')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] })
      setConfirmDeleteCampaign(null)
      setNotification({ type: 'success', message: 'Kampanye telah dihapus permanen' })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // Handler Export Laporan Blast (Excel / PDF)
  const handleExport = (format) => {
    const token = localStorage.getItem('afblast.staff.token')
    const exportUrl = buildApiUrl(`/api/admin/campaigns/export?format=${format}&token=${encodeURIComponent(token || '')}`)
    window.open(exportUrl, '_blank')
    setExportMenuOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* Notifikasi Alert */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{notification.message}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="p-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Page Header & Tombol Aksi */}
      <PageHeader
        title={t('adminCampaigns.title', 'Kampanye Blast')}
        subtitle={t('adminCampaigns.subtitle', 'Buat dan pantau jalannya pengiriman pesan blast WhatsApp ke kontak target secara massal.')}
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dropdown Export Laporan Blast */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((v) => !v)}
                className="px-3.5 py-2 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-muted" />
                <span>Export Laporan Blast</span>
              </button>

              {exportMenuOpen && (
                <div className="absolute end-0 mt-2 w-52 bg-surface rounded-2xl shadow-xl border border-border py-1.5 z-40 animate-fadeIn">
                  <button
                    type="button"
                    onClick={() => handleExport('xlsx')}
                    className="w-full px-3.5 py-2 text-left text-xs text-text hover:bg-surface-2 flex items-center gap-2 font-medium"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    <span>Unduh Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="w-full px-3.5 py-2 text-left text-xs text-text hover:bg-surface-2 flex items-center gap-2 font-medium"
                  >
                    <FileText className="w-4 h-4 text-rose-500" />
                    <span>Unduh PDF (.pdf)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tombol Buat Kampanye Baru */}
            <button
              type="button"
              onClick={() => {
                setEditingCampaign(null)
                setIsFormModalOpen(true)
              }}
              className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Kampanye Baru</span>
            </button>
          </div>
        )}
      />

      {/* 2. Tab: Kampanye Aktif, Draft (n), Sampah (n) */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'active'
              ? 'bg-primary text-white shadow-xs'
              : 'text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          Kampanye Aktif
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('draft')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'draft'
              ? 'bg-primary text-white shadow-xs'
              : 'text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <span>Draft</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 text-text font-bold">
            {draftCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trash')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'trash'
              ? 'bg-primary text-white shadow-xs'
              : 'text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <span>Sampah</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 text-text font-bold">
            {trashCount}
          </span>
        </button>
      </div>

      {/* 3. Grid Kartu Kampanye */}
      {isLoading && !campaignsData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl p-5 border border-border h-72 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Gagal memuat kampanye blast"
          message={error?.message || 'Terjadi gangguan saat mengambil data kampanye.'}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title={
            activeTab === 'active'
              ? 'Belum Ada Kampanye Aktif'
              : activeTab === 'draft'
              ? 'Tidak Ada Draft Kampanye'
              : 'Kotak Sampah Kosong'
          }
          message={
            activeTab === 'active'
              ? 'Mulai buat kampanye blast baru untuk menjangkau target audiens WhatsApp Anda.'
              : 'Semua draft kampanye tersimpan akan tampil di sini.'
          }
          action={
            activeTab === 'active' && (
              <button
                type="button"
                onClick={() => {
                  setEditingCampaign(null)
                  setIsFormModalOpen(true)
                }}
                className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
              >
                Buat Kampanye Pertama
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((camp) => {
            const totalRecipients = Number(camp.totalRecipients || camp.targetCount || 0)
            const sent = Number(camp.sentCount || camp.sent || 0)
            const delivered = Number(camp.deliveredCount || camp.delivered || 0)
            const read = Number(camp.readCount || camp.read || 0)
            const failed = Number(camp.failedCount || camp.failed || 0)

            const progressPct = totalRecipients > 0 ? Math.min(100, Math.round((sent / totalRecipients) * 100)) : 0
            const deliveredPct = sent > 0 ? Math.round((delivered / sent) * 100) : 0
            const readPct = delivered > 0 ? Math.round((read / delivered) * 100) : 0

            return (
              <div
                key={camp.id}
                className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between relative"
              >
                {/* Header Kartu: Status Badge, Nama, Menu Titik Tiga */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status Badge */}
                      {(camp.status === 'active' || camp.status === 'running') && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Berjalan
                        </span>
                      )}
                      {camp.status === 'paused' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Pause className="w-3 h-3" />
                          Dijeda
                        </span>
                      )}
                      {camp.status === 'completed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          <Check className="w-3 h-3" />
                          Selesai
                        </span>
                      )}
                      {camp.status === 'draft' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 text-muted border border-border">
                          Draft
                        </span>
                      )}
                      {camp.status === 'trash' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          Sampah
                        </span>
                      )}

                      {/* Kategori Badge */}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-2 text-text border border-border">
                        {camp.category?.name || 'Semua Target'}
                      </span>
                    </div>

                    {/* Menu Titik Tiga */}
                    <div className="relative campaign-dropdown-menu">
                      <button
                        type="button"
                        onClick={() => setActiveMenuId(activeMenuId === camp.id ? null : camp.id)}
                        className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuId === camp.id && (
                        <div className="absolute end-0 mt-1 w-44 bg-surface rounded-xl shadow-xl border border-border py-1.5 z-30 animate-fadeIn">
                          {/* Duplikat */}
                          <button
                            type="button"
                            onClick={() => duplicateMutation.mutate(camp.id)}
                            className="w-full px-3 py-1.5 text-left text-xs text-text hover:bg-surface-2 flex items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5 text-muted" />
                            <span>Duplikat</span>
                          </button>

                          {/* Pindah ke Sampah / Pulihkan */}
                          {camp.status !== 'trash' ? (
                            <button
                              type="button"
                              onClick={() => campaignActionMutation.mutate({ id: camp.id, action: 'trash' })}
                              className="w-full px-3 py-1.5 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-surface-2 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Pindah ke Sampah</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => campaignActionMutation.mutate({ id: camp.id, action: 'restore' })}
                                className="w-full px-3 py-1.5 text-left text-xs text-emerald-600 dark:text-emerald-400 hover:bg-surface-2 flex items-center gap-2"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Pulihkan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteCampaign(camp)
                                  setActiveMenuId(null)
                                }}
                                className="w-full px-3 py-1.5 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 font-semibold"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus Permanen</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Judul Kampanye */}
                  <h3 className="text-sm font-bold text-text mt-2.5 truncate" title={camp.name || camp.title}>
                    {camp.name || camp.title}
                  </h3>

                  {/* Media Thumbnail & Cuplikan Pesan */}
                  <div className="mt-3 flex items-start gap-3">
                    {(camp.mediaUrl || camp.imageUrl) ? (
                      <img
                        src={buildApiUrl(camp.mediaUrl || camp.imageUrl)}
                        alt="Media blast"
                        className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0 bg-surface-2"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted flex-shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}
                    <p className="text-xs text-muted line-clamp-3 leading-relaxed flex-1 font-sans">
                      {camp.message || camp.caption || <span className="italic">Tanpa isi pesan</span>}
                    </p>
                  </div>

                  {/* Progres Pengiriman Bar */}
                  <div className="mt-4 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>Progres Pengiriman</span>
                      <span className="font-semibold text-text tabular-nums">{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* 4 Metrik Realtime: Terkirim, Delivered %, Dibaca %, Gagal */}
                  <div className="mt-4 grid grid-cols-4 gap-2 p-2.5 bg-surface-2/60 rounded-xl border border-border text-center">
                    <div>
                      <span className="text-[10px] text-muted block">Terkirim</span>
                      <span className="text-xs font-bold text-text mt-0.5 block tabular-nums">
                        <AnimatedNumber value={sent} />
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">Delivered</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block tabular-nums">
                        {deliveredPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">Dibaca</span>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 block tabular-nums">
                        {readPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">Gagal</span>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5 block tabular-nums">
                        <AnimatedNumber value={failed} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Tombol Aksi Cepat */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Tombol Jeda / Lanjutkan */}
                    {(camp.status === 'active' || camp.status === 'running') && (
                      <button
                        type="button"
                        onClick={() => campaignActionMutation.mutate({ id: camp.id, action: 'pause' })}
                        className="p-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold"
                        title="Jeda Pengiriman"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {camp.status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => campaignActionMutation.mutate({ id: camp.id, action: 'resume' })}
                        className="p-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold"
                        title="Lanjutkan Pengiriman"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Jadikan Draft */}
                    {camp.status !== 'draft' && camp.status !== 'trash' && (
                      <button
                        type="button"
                        onClick={() => campaignActionMutation.mutate({ id: camp.id, action: 'draft' })}
                        className="px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 text-[11px] font-medium"
                      >
                        Jadikan Draft
                      </button>
                    )}
                  </div>

                  {/* Tombol Laporan Analitik */}
                  <button
                    type="button"
                    onClick={() => setReportingCampaignId(camp.id)}
                    className="px-3 py-1.5 rounded-lg bg-surface-2 text-text hover:bg-surface-2/80 border border-border text-xs font-semibold inline-flex items-center gap-1.5"
                    title="Buka Panel Laporan Detail"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-primary" />
                    <span>Laporan</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ================= MODAL BUAT / EDIT KAMPANYE ================= */}
      <CampaignFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setEditingCampaign(null)
        }}
        initialData={editingCampaign}
        categories={categories}
        templates={templates}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] })
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
          setIsFormModalOpen(false)
          setEditingCampaign(null)
          setNotification({ type: 'success', message: 'Kampanye berhasil disimpan!' })
        }}
      />

      {/* ================= MODAL PANEL LAPORAN KAMPANYE ================= */}
      {reportingCampaignId && (
        <CampaignReportModal
          campaignId={reportingCampaignId}
          onClose={() => setReportingCampaignId(null)}
        />
      )}

      {/* ================= DIALOG KONFIRMASI HAPUS PERMANEN ================= */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeleteCampaign)}
        onClose={() => setConfirmDeleteCampaign(null)}
        onConfirm={() => deletePermanentMutation.mutate(confirmDeleteCampaign.id)}
        title="Hapus Permanen Kampanye"
        message={`Apakah Anda yakin ingin menghapus permanen kampanye "${confirmDeleteCampaign?.name}"? Seluruh data riwayat tugas kampanye ini akan dibersihkan.`}
        confirmText="Hapus Permanen"
        variant="danger"
        isLoading={deletePermanentMutation.isPending}
      />
    </div>
  )
}

/**
 * Modal Buat & Edit Kampanye Baru
 * Dengan dropzone media 5MB, editor teks WhatsApp toolbar, WhatsApp chat bubble preview,
 * dan pengecekan pelanggaran kebijakan konten.
 */
function CampaignFormModal({ isOpen, onClose, initialData, categories, templates, onSuccess }) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [message, setMessage] = useState('')
  const [buttonText, setButtonText] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)

  const [policyError, setPolicyError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const textareaRef = useRef(null)
  const mediaInputRef = useRef(null)

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setCategoryId(String(initialData.categoryId || ''))
      setMessage(initialData.message || '')
      setButtonText(initialData.buttonText || '')
      setButtonUrl(initialData.buttonUrl || '')
      setMediaPreview(initialData.mediaUrl ? buildApiUrl(initialData.mediaUrl) : null)
    } else {
      setName('')
      setCategoryId(categories[0]?.id ? String(categories[0].id) : '')
      setMessage('')
      setButtonText('')
      setButtonUrl('')
      setMediaFile(null)
      setMediaPreview(null)
    }
    setSelectedTemplateId('')
    setPolicyError(null)
  }, [initialData, categories, isOpen])

  // Saat template dipilih, isi otomatis form
  const handleTemplateSelect = (tmplId) => {
    setSelectedTemplateId(tmplId)
    if (!tmplId) return
    const tmpl = templates.find((t) => String(t.id) === String(tmplId))
    if (tmpl) {
      if (tmpl.body) setMessage(tmpl.body)
      if (tmpl.buttonText) setButtonText(tmpl.buttonText)
      if (tmpl.buttonUrl) setButtonUrl(tmpl.buttonUrl)
      if (tmpl.imageUrl) setMediaPreview(buildApiUrl(tmpl.imageUrl))
    }
  }

  // Formatting Toolbar WhatsApp (*tebal*, _miring_, ~coret~, ```kode```)
  const insertFormatting = (prefix, suffix = prefix) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = message.substring(start, end)
    const replacement = `${prefix}${selectedText || 'teks'}${suffix}`
    const newMessage = message.substring(0, start) + replacement + message.substring(end)
    setMessage(newMessage)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, end + prefix.length)
    }, 50)
  }

  const insertVariable = (variable) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newMessage = message.substring(0, start) + variable + message.substring(end)
    setMessage(newMessage)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 50)
  }

  // Handle Media Dropzone (Max 5MB)
  const handleMediaChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setPolicyError('Ukuran file maksimal 5 MB')
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setPolicyError('Format media harus JPG, PNG, atau WEBP')
      return
    }

    setMediaFile(file)
    setPolicyError(null)
    const reader = new FileReader()
    reader.onload = (ev) => setMediaPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleSave = async (targetStatus) => {
    if (!name.trim()) {
      setPolicyError('Nama kampanye wajib diisi')
      return
    }
    if (!message.trim()) {
      setPolicyError('Isi pesan tidak boleh kosong')
      return
    }
    if (buttonUrl.trim() && !buttonUrl.startsWith('https://')) {
      setPolicyError('Tautan tombol wajib menggunakan protokol https://')
      return
    }

    setIsLoading(true)
    setPolicyError(null)

    try {
      const formData = new FormData()
      formData.append('title', name.trim())
      formData.append('name', name.trim())
      formData.append('categoryId', categoryId || '')
      formData.append('caption', message)
      formData.append('message', message)
      formData.append('status', targetStatus)
      if (selectedTemplateId) formData.append('templateId', selectedTemplateId)
      if (buttonText.trim()) {
        formData.append('buttonText', buttonText.trim())
        formData.append('buttonLabel', buttonText.trim())
      }
      if (buttonUrl.trim()) formData.append('buttonUrl', buttonUrl.trim())
      if (mediaFile) {
        formData.append('image', mediaFile)
      }

      const url = initialData ? `/api/admin/campaigns/${initialData.id}` : '/api/admin/campaigns'
      const method = initialData ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.policyViolated && data.matches) {
          throw new Error(
            `Pesan mengandung kata terlarang kebijakan konten: "${data.matches.join(', ')}". Harap revisi pesan Anda.`
          )
        }
        throw new Error(data.error || 'Gagal menyimpan kampanye')
      }

      onSuccess()
    } catch (err) {
      setPolicyError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Kampanye Blast' : 'Buat Kampanye Blast Baru'}
      maxWidth="4xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: Form Input (7 Kolom di Desktop) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Peringatan Kebijakan Konten / Validasi */}
          {policyError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">Pelanggaran / Kesalahan Form:</span>
                <p className="leading-relaxed">{policyError}</p>
              </div>
            </div>
          )}

          {/* Nama Kampanye */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text">
              Nama Kampanye <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Flash Sale 11.11 VIP Customer"
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>

          {/* Target Kategori Kontak & Template Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Target Kategori Kontak <span className="text-danger">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.countryCode ? `(+${c.countryCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Pilih Template <span className="text-muted font-normal">(Opsional)</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">-- Tulis Pesan Sendiri --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Media Dropzone (Maks 5MB) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text">
              Gambar Lampiran <span className="text-muted font-normal">(Maks 5 MB - JPG/PNG/WEBP)</span>
            </label>
            <div
              onClick={() => mediaInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 bg-surface-2/40 transition-all flex items-center justify-between gap-3"
            >
              <input
                type="file"
                ref={mediaInputRef}
                onChange={handleMediaChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <div className="flex items-center gap-2.5 min-w-0">
                <ImageIcon className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-xs text-muted truncate">
                  {mediaFile ? mediaFile.name : 'Pilih atau ganti file gambar lampiran...'}
                </span>
              </div>
              {mediaPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMediaFile(null)
                    setMediaPreview(null)
                  }}
                  className="p-1 rounded-md text-muted hover:text-danger"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Isi Pesan dengan Formatting Toolbar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-text">
                Isi Pesan WhatsApp <span className="text-danger">*</span>
              </label>
              <span className="text-[10px] text-muted">{message.length} karakter</span>
            </div>

            {/* Toolbar Tombol B/I/S/Kode & Sisipan {{nama}} */}
            <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-t-xl border border-b-0 border-border">
              <button
                type="button"
                onClick={() => insertFormatting('*')}
                className="p-1.5 rounded hover:bg-surface text-text text-xs"
                title="Tebal (*teks*)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('_')}
                className="p-1.5 rounded hover:bg-surface text-text text-xs"
                title="Miring (_teks_)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('~')}
                className="p-1.5 rounded hover:bg-surface text-text text-xs"
                title="Coret (~teks~)"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('```')}
                className="p-1.5 rounded hover:bg-surface text-text text-xs"
                title="Kode Monospace (```teks```)"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                type="button"
                onClick={() => insertVariable('{{nama}}')}
                className="px-2 py-1 rounded bg-surface hover:bg-surface-2 text-[11px] font-mono font-bold text-primary"
                title="Sisipkan Nama Penerima Otomatis"
              >
                + &#123;&#123;nama&#125;&#125;
              </button>
            </div>

            <textarea
              ref={textareaRef}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Halo {{nama}}, kami memiliki penawaran spesial untuk Anda..."
              className="w-full p-3 text-xs bg-surface border border-border rounded-b-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary font-sans leading-relaxed"
              required
            />
          </div>

          {/* Tombol Tautan Opsional (Button Text + Button URL https) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Teks Tombol <span className="text-muted font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Contoh: Kunjungi Website"
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Tautan Tombol <span className="text-muted font-normal">(https://)</span>
              </label>
              <input
                type="url"
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://afblast.id/promo"
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Pratinjau Gelembung Chat WhatsApp (5 Kolom di Desktop) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <span className="text-xs font-bold text-muted uppercase tracking-wider mb-2 self-start">
            Pratinjau WhatsApp Chat
          </span>

          {/* Mockup Chat Phone Screen */}
          <div className="w-full max-w-[340px] rounded-3xl border-4 border-slate-700/60 dark:border-slate-800 bg-[#e5ddd5] dark:bg-[#0b141a] overflow-hidden shadow-xl flex flex-col min-h-[380px]">
            {/* Topbar WhatsApp */}
            <div className="bg-[#075e54] dark:bg-[#202c33] text-white p-3 flex items-center gap-2.5 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-emerald-400/30 flex items-center justify-center font-bold text-xs">
                AF
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">AF Blast Official</p>
                <p className="text-[10px] text-white/80">Online</p>
              </div>
            </div>

            {/* Area Pesan Chat Bubble */}
            <div className="p-3 flex-1 flex flex-col justify-end space-y-2">
              <div className="self-end max-w-[90%] bg-[#dcf8c6] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-2xl rounded-tr-none p-2.5 shadow-sm space-y-2 text-xs">
                {/* Gambar Lampiran Pratinjau */}
                {mediaPreview && (
                  <img
                    src={mediaPreview}
                    alt="Preview lampiran"
                    className="w-full h-36 rounded-xl object-cover"
                  />
                )}

                {/* Pesan Teks Terformat */}
                <p className="whitespace-pre-wrap leading-relaxed break-words font-sans">
                  {message
                    ? message.replace(/\{\{nama\}\}/g, 'Budi Santoso')
                    : 'Halo Budi Santoso, pratinjau pesan blast Anda akan muncul di sini...'}
                </p>

                {/* Timestamp & Read Receipt */}
                <div className="flex items-center justify-end gap-1 text-[10px] text-muted">
                  <span>10:42</span>
                  <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                </div>

                {/* Tombol Tautan Call-to-Action */}
                {buttonText && (
                  <div className="pt-2 border-t border-black/10 dark:border-white/10">
                    <a
                      href={buttonUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-1.5 bg-surface text-primary rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1 shadow-2xs hover:bg-surface-2 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{buttonText}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Modal: Tombol Simpan Draft & Simpan & Mulai */}
      <div className="pt-4 mt-6 border-t border-border flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => handleSave('draft')}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl border border-border bg-surface-2 text-text hover:bg-surface-2/80 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          Simpan Draft
        </button>
        <button
          type="button"
          onClick={() => handleSave('active')}
          disabled={isLoading}
          className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>Simpan & Mulai</span>
        </button>
      </div>
    </Modal>
  )
}

/**
 * Modal Panel Laporan Analitik Kampanye
 * Kartu Terkirim, Delivered, Dibaca, Gagal, Delivery Rate, Read Rate,
 * grafik per jam, tabel kegagalan teratas.
 */
function CampaignReportModal({ campaignId, onClose }) {
  const { data: reportData, isLoading, isError, error } = useQuery({
    queryKey: ['admin-campaign-report', campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/campaigns/${campaignId}/report`)
      if (!res.ok) throw new Error('Gagal memuat laporan kampanye')
      return res.json()
    },
  })

  const report = reportData || {}
  const campaign = report.campaign || {}
  const hourly = report.hourlyBreakdown || []
  const topFailures = report.topFailures || []

  return (
    <Modal isOpen={true} onClose={onClose} title={`Laporan Blast: ${campaign.name || 'Kampanye'}`} maxWidth="3xl">
      {isLoading ? (
        <div className="p-8 text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted">Memuat telemetri kampanye...</p>
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-rose-500 text-xs">{error?.message}</div>
      ) : (
        <div className="space-y-5">
          {/* 6 Kartu Metrik Analitik */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 bg-surface-2/60 rounded-xl border border-border text-center">
              <span className="text-[10px] text-muted block">Terkirim</span>
              <span className="text-lg font-bold text-text mt-0.5 block tabular-nums">
                {report.sent || 0}
              </span>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">Delivered</span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 block tabular-nums">
                {report.delivered || 0}
              </span>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-center">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 block">Dibaca</span>
              <span className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-0.5 block tabular-nums">
                {report.read || 0}
              </span>
            </div>
            <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block">Gagal</span>
              <span className="text-lg font-bold text-rose-700 dark:text-rose-300 mt-0.5 block tabular-nums">
                {report.failed || 0}
              </span>
            </div>
            <div className="p-3 bg-surface-2 rounded-xl border border-border text-center">
              <span className="text-[10px] text-muted block">Delivery Rate</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block tabular-nums">
                {report.deliveryRate !== null && report.deliveryRate !== undefined
                  ? `${report.deliveryRate}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-surface-2 rounded-xl border border-border text-center">
              <span className="text-[10px] text-muted block">Read Rate</span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 block tabular-nums">
                {report.readRate !== null && report.readRate !== undefined
                  ? `${report.readRate}%`
                  : <span className="text-[10px] font-normal text-muted">Tidak tersedia dari penyedia</span>}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-muted italic">
            * Catatan: Read rate hanya mencakup penerima yang mengaktifkan tanda baca (centang biru) pada aplikasi WhatsApp mereka.
          </p>

          {/* Grafik Batang Per Jam Realtime */}
          <div className="bg-surface-2/40 p-4 rounded-2xl border border-border space-y-3">
            <h4 className="text-xs font-bold text-text">Trafik Pengiriman Per Jam</h4>
            {hourly.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">Belum ada data pengiriman per jam.</p>
            ) : (
              <div className="h-32 flex items-end gap-2 pt-4">
                {hourly.map((h, idx) => {
                  const maxVal = Math.max(...hourly.map((x) => x.count), 1)
                  const heightPct = Math.max(8, Math.round((h.count / maxVal) * 100))

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary hover:bg-primary-hover rounded-t transition-all"
                        style={{ height: `${heightPct}%` }}
                        title={`${h.hour}: ${h.count} pesan`}
                      />
                      <span className="text-[9px] text-muted truncate w-full text-center">
                        {h.hour}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabel Kegagalan Teratas */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-text">Daftar Kegagalan Teratas</h4>
            {topFailures.length === 0 ? (
              <p className="text-xs text-muted p-3 bg-surface-2 rounded-xl">
                Tidak ada kegagalan pengiriman yang tercatat.
              </p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-surface">
                {topFailures.map((f, i) => (
                  <div key={i} className="p-3 text-xs flex items-center justify-between">
                    <span className="text-text font-medium">{f.reason || 'Nomor tidak terdaftar'}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 tabular-nums">
                      {f.count} kali
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-2 text-text text-xs font-semibold rounded-xl hover:bg-surface-2/80 transition-colors"
            >
              Tutup Laporan
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
