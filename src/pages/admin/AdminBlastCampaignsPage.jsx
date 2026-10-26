import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send, Plus, Edit3, Trash2, Play, Pause, Square, AlertCircle,
  RefreshCw, Check, X, Image as ImageIcon, Link as LinkIcon,
  Users, Calendar, Clock, CheckCheck, UploadCloud
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import PageHeader from '../../components/ui/PageHeader'
import Can from '../../components/common/Can'

function formatDate(dateStr, locale = 'id') {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatNumber(val, locale = 'id') {
  return new Intl.NumberFormat(locale).format(val || 0)
}

export default function AdminBlastCampaignsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  // 1. Modal Form State (Create / Edit)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)

  // Form Fields
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [batchId, setBatchId] = useState('')
  const [status, setStatus] = useState('draft')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  // Image Upload State
  const [selectedFile, setSelectedFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageDragOver, setImageDragOver] = useState(false)
  const [formError, setFormError] = useState('')

  // Confirmation Dialogs
  const [statusConfirm, setStatusConfirm] = useState({
    open: false,
    campaignId: null,
    newStatus: '',
    title: '',
  })
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    campaignId: null,
    title: '',
  })

  // ─── QUERIES ───────────────────────────────────────────────────────────────

  // Fetch Campaigns
  const {
    data: campaignsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['adminBlastCampaigns'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/blast-campaigns')
      if (!res.ok) throw new Error('Gagal memuat daftar pesan campaign')
      return res.json()
    },
    staleTime: 15000,
  })

  // Fetch Batches for Dropdown
  const { data: batchesData } = useQuery({
    queryKey: ['adminContactBatchesOptions'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/contact-batches')
      if (!res.ok) return { batches: [] }
      return res.json()
    },
    staleTime: 60000,
  })

  const campaigns = campaignsData?.campaigns || []
  const batches = batchesData?.batches || []

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  // Save Campaign Mutation (Create or Update)
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validasi form
      if (!title.trim()) throw new Error('Judul campaign wajib diisi.')
      if (!caption.trim()) throw new Error('Caption pesan wajib diisi.')
      if (!batchId) throw new Error('Batch kontak wajib dipilih.')
      if (buttonUrl.trim() && !buttonUrl.trim().startsWith('https://')) {
        throw new Error('URL tombol WhatsApp wajib diawali dengan https://')
      }

      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('caption', caption.trim())
      if (buttonLabel.trim()) formData.append('buttonLabel', buttonLabel.trim())
      if (buttonUrl.trim()) formData.append('buttonUrl', buttonUrl.trim())
      formData.append('batchId', batchId)
      formData.append('status', status)
      if (startAt) formData.append('startAt', new Date(startAt).toISOString())
      if (endAt) formData.append('endAt', new Date(endAt).toISOString())

      if (selectedFile) {
        formData.append('image', selectedFile)
      } else if (imagePreview && !imagePreview.startsWith('blob:')) {
        formData.append('imageUrl', imagePreview)
      }

      const url = editingCampaign
        ? `/api/admin/blast-campaigns/${editingCampaign.id}`
        : '/api/admin/blast-campaigns'
      const method = editingCampaign ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan campaign blast.')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBlastCampaigns'] })
      closeFormModal()
    },
    onError: (err) => {
      setFormError(err.message)
    },
  })

  // Update Status (Aktifkan / Jeda / Akhiri)
  const statusMutation = useMutation({
    mutationFn: async ({ campaignId, newStatus }) => {
      const res = await apiFetch(`/api/admin/blast-campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengubah status campaign')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBlastCampaigns'] })
      setStatusConfirm({ open: false, campaignId: null, newStatus: '', title: '' })
    },
  })

  // Delete Campaign
  const deleteMutation = useMutation({
    mutationFn: async (campaignId) => {
      const res = await apiFetch(`/api/admin/blast-campaigns/${campaignId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menghapus campaign')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBlastCampaigns'] })
      setDeleteConfirm({ open: false, campaignId: null, title: '' })
    },
  })

  // ─── FORM HANDLERS ─────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingCampaign(null)
    setTitle('')
    setCaption('Halo {{name}},\n\nTerima kasih telah bergabung bersama AF Blast. Dapatkan kemudahan broadcast WhatsApp secara cepat dan andal!')
    setButtonLabel('Buka Website')
    setButtonUrl('https://afblast.id')
    setBatchId(batches[0]?.id ? String(batches[0].id) : '')
    setStatus('draft')
    setStartAt('')
    setEndAt('')
    setSelectedFile(null)
    setImagePreview('/media/campaign/default_profile.png')
    setFormError('')
    setFormModalOpen(true)
  }

  const openEditModal = (camp) => {
    setEditingCampaign(camp)
    setTitle(camp.title || '')
    setCaption(camp.caption || '')
    setButtonLabel(camp.buttonLabel || '')
    setButtonUrl(camp.buttonUrl || '')
    setBatchId(camp.batchId ? String(camp.batchId) : '')
    setStatus(camp.status || 'draft')
    setStartAt(camp.startAt ? new Date(camp.startAt).toISOString().slice(0, 16) : '')
    setEndAt(camp.endAt ? new Date(camp.endAt).toISOString().slice(0, 16) : '')
    setSelectedFile(null)
    setImagePreview(camp.imageUrl || '/media/campaign/default_profile.png')
    setFormError('')
    setFormModalOpen(true)
  }

  const closeFormModal = () => {
    setFormModalOpen(false)
    setEditingCampaign(null)
    setSelectedFile(null)
    setImagePreview('')
    setFormError('')
  }

  // Handle Drag & Drop / File Input
  const handleFileChange = (file) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setFormError('Format file tidak didukung. Hanya JPEG, PNG, dan WEBP yang diizinkan.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('Ukuran file maksimal 2 MB.')
      return
    }
    setFormError('')
    setSelectedFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Sisipkan variabel {{name}} pada caption
  const insertVariable = () => {
    if (caption.length + 8 > 1024) return
    setCaption((prev) => `${prev} {{name}}`)
  }

  const statusVariantMap = {
    draft: 'default',
    active: 'success',
    paused: 'warning',
    ended: 'danger',
  }

  const statusLabelMap = {
    draft: 'Draf',
    active: 'Aktif',
    paused: 'Dijeda',
    ended: 'Berakhir',
  }

  return (
    <Can permission="blastCampaign.manage">
      <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
        {/* Header Halaman */}
        <PageHeader
          title="Kampanye Target (Blast Campaigns)"
          subtitle="Buat pesan broadcast WhatsApp interaktif dengan gambar, caption dinamis, tombol URL, dan pratinjau live."
          actions={
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => refetch()}
                className="h-10 px-3 rounded-xl border border-border bg-surface text-muted hover:text-text hover:bg-surface-2 transition-colors shadow-xs"
                title="Segarkan data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover active:bg-blue-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Pesan Campaign</span>
              </button>
            </div>
          }
        />

        {/* Tabel / Daftar Campaign */}
        <div className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 bg-surface-2 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-danger">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-danger" />
              <p className="font-semibold">{error?.message || 'Gagal memuat campaign.'}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 text-xs font-bold text-primary underline"
              >
                Coba Lagi
              </button>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary-text flex items-center justify-center mx-auto mb-3">
                <Send className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-text">Belum Ada Pesan Campaign</h3>
              <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                Mulai buat campaign broadcast pertama Anda untuk didistribusikan ke member pengirim.
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 h-10 px-4 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                Buat Campaign Baru
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead className="bg-surface-2 border-b border-border text-muted font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-5 text-start">Campaign</th>
                    <th className="py-3 px-5 text-start">Batch Kontak</th>
                    <th className="py-3 px-5 text-center">Progres Tugas</th>
                    <th className="py-3 px-5 text-center">Member</th>
                    <th className="py-3 px-5 text-center">Status</th>
                    <th className="py-3 px-5 text-end">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map((camp) => {
                    const stats = camp.taskStats || { sent: 0, pending: 0, failed: 0 }
                    const totalTasks = stats.sent + stats.pending + stats.failed + (stats.processing || 0)

                    return (
                      <tr key={camp.id} className="hover:bg-surface-2/60 transition-colors">
                        {/* Campaign Info */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <img
                              src={camp.imageUrl || '/media/campaign/default_profile.png'}
                              alt={camp.title}
                              className="w-12 h-12 rounded-xl object-cover border border-border bg-surface-2 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = 'https://ui-avatars.com/api/?name=AF&background=0B1220&color=fff'
                              }}
                            />
                            <div className="min-w-0 max-w-xs">
                              <p className="font-bold text-text truncate text-sm">
                                {camp.title}
                              </p>
                              <p className="text-[11px] text-muted truncate mt-0.5 line-clamp-1">
                                {camp.caption}
                              </p>
                              {camp.buttonLabel && (
                                <span className="inline-block mt-1 text-[10px] font-mono text-primary-text bg-primary-soft border border-primary/20 px-2 py-0.5 rounded-md">
                                  🔗 {camp.buttonLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Batch Info */}
                        <td className="py-4 px-5">
                          <p className="font-semibold text-text text-xs">
                            {camp.batch?.title || `Batch #${camp.batchId}`}
                          </p>
                          <span className="text-[11px] text-muted">
                            {formatNumber(camp.batch?.totalContacts || 0, i18n.language)} kontak
                          </span>
                        </td>

                        {/* Progres Tugas */}
                        <td className="py-4 px-5 text-center">
                          <div className="space-y-1 max-w-[130px] mx-auto">
                            <div className="flex items-center justify-between text-[11px] tabular-nums font-semibold">
                              <span className="text-success">{stats.sent} Sukses</span>
                              <span className="text-muted">/ {totalTasks}</span>
                            </div>
                            <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden border border-border/40">
                              <div
                                className="h-full bg-success rounded-full"
                                style={{
                                  width: totalTasks > 0 ? `${(stats.sent / totalTasks) * 100}%` : '0%',
                                }}
                              />
                            </div>
                            {stats.failed > 0 && (
                              <span className="text-[10px] text-danger block">
                                {stats.failed} gagal
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Partisipasi Member */}
                        <td className="py-4 px-5 text-center">
                          <span className="font-bold text-text text-xs tabular-nums">
                            {camp._count?.participations || 0}
                          </span>
                          <span className="text-[10px] text-muted block">member</span>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5 text-center">
                          <Badge variant={statusVariantMap[camp.status] || 'default'} size="sm">
                            {statusLabelMap[camp.status] || camp.status}
                          </Badge>
                        </td>

                        {/* Aksi */}
                        <td className="py-4 px-5 text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Tombol Status: Aktifkan / Jeda / Akhiri */}
                            {camp.status === 'draft' || camp.status === 'paused' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusConfirm({
                                    open: true,
                                    campaignId: camp.id,
                                    newStatus: 'active',
                                    title: camp.title,
                                  })
                                }
                                className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors"
                                title="Aktifkan Campaign"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            ) : camp.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusConfirm({
                                    open: true,
                                    campaignId: camp.id,
                                    newStatus: 'paused',
                                    title: camp.title,
                                  })
                                }
                                className="p-1.5 rounded-lg text-warning hover:bg-warning/10 transition-colors"
                                title="Jeda Campaign"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            ) : null}

                            {camp.status !== 'ended' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusConfirm({
                                    open: true,
                                    campaignId: camp.id,
                                    newStatus: 'ended',
                                    title: camp.title,
                                  })
                                }
                                className="p-1.5 rounded-lg text-muted hover:bg-surface-2 hover:text-text transition-colors"
                                title="Akhiri Campaign"
                              >
                                <Square className="w-4 h-4" />
                              </button>
                            )}

                            {/* Tombol Edit */}
                            <button
                              type="button"
                              onClick={() => openEditModal(camp)}
                              className="p-1.5 rounded-lg text-muted hover:bg-surface-2 hover:text-primary transition-colors"
                              title="Ubah Campaign"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* Tombol Hapus */}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirm({
                                  open: true,
                                  campaignId: camp.id,
                                  title: camp.title,
                                })
                              }
                              className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors"
                              title="Hapus Campaign"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MODAL FORM BUAT / UBAH CAMPAIGN DENGAN PRATINJAU LIVE WHATSAPP */}
        {/* ========================================================================= */}
        <Modal
          isOpen={formModalOpen}
          onClose={closeFormModal}
          title={editingCampaign ? 'Ubah Pesan Campaign' : 'Buat Pesan Campaign Baru'}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4">
            {formError && (
              <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* SISI KIRI: FORM PENGISIAN (col-span-7) */}
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Judul Campaign */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-text block">
                    Judul Campaign <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Promo Spesial AF Blast Akhir Bulan"
                    className="w-full h-10 px-4 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                </div>

                {/* 2. Upload Gambar (Drag & Drop, Max 2MB, JPG/PNG/WEBP) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text block">
                    Gambar Header Pesan (Maks. 2 MB)
                  </label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setImageDragOver(true)
                    }}
                    onDragLeave={() => setImageDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setImageDragOver(false)
                      if (e.dataTransfer.files?.[0]) {
                        handleFileChange(e.dataTransfer.files[0])
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      'border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all',
                      imageDragOver
                        ? 'border-primary bg-primary-soft'
                        : 'border-border hover:border-primary/50 bg-surface-2',
                    ].join(' ')}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileChange(e.target.files[0])
                      }}
                    />
                    <UploadCloud className="w-8 h-8 text-muted mx-auto mb-1.5" />
                    <p className="text-xs font-semibold text-text">
                      Klik atau seret gambar ke sini
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      JPEG, PNG, atau WEBP hingga 2 MB
                    </p>
                  </div>
                </div>

                {/* 3. Caption dengan Counter Karakter & Sisipkan Variabel {{name}} */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text">
                      Caption Pesan <span className="text-danger">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={insertVariable}
                        className="text-[11px] font-bold text-primary-text hover:underline bg-primary-soft px-2 py-0.5 rounded-md transition-colors"
                      >
                        + Sisipkan {'{{name}}'}
                      </button>
                      <span className="text-[11px] text-muted font-mono">
                        {caption.length}/1024
                      </span>
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    maxLength={1024}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Ketik isi pesan WhatsApp di sini..."
                    className="w-full p-3 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden leading-relaxed"
                  />
                </div>

                {/* 4. Tombol WhatsApp (Label & URL Wajib https) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      Label Tombol (Opsional)
                    </label>
                    <input
                      type="text"
                      value={buttonLabel}
                      onChange={(e) => setButtonLabel(e.target.value)}
                      placeholder="Contoh: Kunjungi Situs"
                      className="w-full h-10 px-4 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      URL Tombol (Wajib https://)
                    </label>
                    <input
                      type="url"
                      value={buttonUrl}
                      onChange={(e) => setButtonUrl(e.target.value)}
                      placeholder="https://afblast.id"
                      className="w-full h-10 px-4 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden font-mono"
                    />
                  </div>
                </div>

                {/* 5. Pilih Batch Kontak & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      Pilih Batch Kontak <span className="text-danger">*</span>
                    </label>
                    <select
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-surface-2 text-text text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                    >
                      <option value="">-- Pilih Batch Kontak --</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title} ({formatNumber(b.totalContacts)} kontak)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      Status Campaign
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-surface-2 text-text text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                    >
                      <option value="draft">Draf</option>
                      <option value="active">Aktif</option>
                      <option value="paused">Dijeda</option>
                      <option value="ended">Berakhir</option>
                    </select>
                  </div>
                </div>

                {/* 6. Jadwal (startAt & endAt) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      Jadwal Mulai (Opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-surface-2 text-text text-xs focus:border-primary outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text block">
                      Jadwal Berakhir (Opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-surface-2 text-text text-xs focus:border-primary outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* SISI KANAN: PRATINJAU LANGSUNG GELEMBUNG CHAT WHATSAPP (col-span-5) */}
              <div className="lg:col-span-5 space-y-2">
                <span className="text-xs font-bold text-muted uppercase tracking-wider block">
                  Pratinjau Live Pesan WhatsApp:
                </span>

                {/* WhatsApp Chat Container */}
                <div className="rounded-2xl p-4 bg-[#E5DDD5] dark:bg-[#0f172a] border border-border shadow-inner relative overflow-hidden min-h-[380px] flex flex-col justify-end">
                  {/* Watermark Wallpaper Pattern */}
                  <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:16px_16px]" />

                  {/* Gelembung Pesan WhatsApp */}
                  <div className="relative z-10 bg-surface rounded-2xl rounded-tr-xs shadow-md border border-border overflow-hidden text-text text-xs space-y-2 max-w-full">
                    {/* Gambar di Atas */}
                    {imagePreview ? (
                      <div className="w-full max-h-48 overflow-hidden bg-surface-2 border-b border-border">
                        <img
                          src={imagePreview}
                          alt="Header Campaign"
                          className="w-full h-auto object-cover max-h-48"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-32 bg-surface-2 flex items-center justify-center text-muted">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}

                    {/* Teks Pesan Caption */}
                    <div className="px-3.5 pt-1 pb-1">
                      <p className="whitespace-pre-line text-xs leading-relaxed break-words text-text">
                        {caption
                          ? caption.replace(/\{\{name\}\}/g, 'Budi Santoso')
                          : 'Isi caption pesan WhatsApp akan tampil di sini...'}
                      </p>

                      {/* Timestamp & Double Checkmark WhatsApp */}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-muted mt-1">
                        <span>10:30</span>
                        <CheckCheck className="w-3.5 h-3.5 text-primary" />
                      </div>
                    </div>

                    {/* Baris Tautan Tombol di Bawah */}
                    {buttonUrl ? (
                      <div className="border-t border-border">
                        <a
                          href={buttonUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.preventDefault()}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 text-primary font-bold text-xs hover:bg-surface-2 transition-colors"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          <span>{buttonLabel || 'Buka Tautan'}</span>
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="text-[11px] text-muted text-center italic">
                  *Variabel {'{{name}}'} akan otomatis digantikan oleh nama asli kontak saat pesan terkirim.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-8 pt-4 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeFormModal}
                className="h-10 px-5 rounded-xl text-xs font-semibold text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="h-10 px-6 rounded-xl bg-primary hover:bg-primary-hover active:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-all disabled:opacity-50"
              >
                {saveMutation.isPending
                  ? 'Menyimpan...'
                  : editingCampaign
                  ? 'Simpan Perubahan'
                  : 'Buat Pesan Campaign'}
              </button>
            </div>
          </div>
        </Modal>

        {/* DIALOG KONFIRMASI STATUS CAMPAIGN */}
        <ConfirmDialog
          isOpen={statusConfirm.open}
          onClose={() => setStatusConfirm({ open: false, campaignId: null, newStatus: '', title: '' })}
          onConfirm={() =>
            statusMutation.mutate({
              campaignId: statusConfirm.campaignId,
              newStatus: statusConfirm.newStatus,
            })
          }
          title={
            statusConfirm.newStatus === 'active'
              ? 'Aktifkan Campaign'
              : statusConfirm.newStatus === 'paused'
              ? 'Jeda Campaign'
              : 'Akhiri Campaign'
          }
          message={`Yakin ingin mengubah status campaign "${statusConfirm.title}" menjadi ${statusLabelMap[statusConfirm.newStatus]}?`}
          confirmText="Ya, Ubah Status"
          cancelText="Batal"
          variant={statusConfirm.newStatus === 'active' ? 'primary' : 'warning'}
          isLoading={statusMutation.isPending}
        />

        {/* DIALOG KONFIRMASI HAPUS CAMPAIGN */}
        <ConfirmDialog
          isOpen={deleteConfirm.open}
          onClose={() => setDeleteConfirm({ open: false, campaignId: null, title: '' })}
          onConfirm={() => deleteMutation.mutate(deleteConfirm.campaignId)}
          title="Hapus Pesan Campaign"
          message={`Yakin ingin menghapus campaign "${deleteConfirm.title}"? Seluruh data tugas dan partisipasi terkait akan dihapus.`}
          confirmText="Hapus Permanen"
          cancelText="Batal"
          variant="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Can>
  )
}
