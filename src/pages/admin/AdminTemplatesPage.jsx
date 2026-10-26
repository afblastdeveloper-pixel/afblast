import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, Edit2, Trash2, Send,
  Bold, Italic, Strikethrough, Code, Image as ImageIcon,
  ExternalLink, CheckCheck, Check, X, AlertCircle, RefreshCw,
  AlertTriangle
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch, buildApiUrl } from '../../utils/client'

/**
 * AdminTemplatesPage – Template Pesan Blast (/superadmin/templates)
 * Daftar kartu template pesan reusable dengan modal form kampanye lengkap,
 * toolbar WhatsApp styling, pratinjau chat bubble, dan pengecekan konten.
 */
export default function AdminTemplatesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [notification, setNotification] = useState(null)

  // Fetch Templates
  const {
    data: templatesData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-templates-list'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/templates')
      if (!res.ok) throw new Error('Gagal memuat template pesan')
      return res.json()
    },
    staleTime: 30000,
  })

  const templates = templatesData?.templates || []

  // Filter Search
  const filteredTemplates = templates.filter((tpl) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (tpl.name && tpl.name.toLowerCase().includes(q)) ||
      (tpl.body && tpl.body.toLowerCase().includes(q))
    )
  })

  // Mutations
  const templateMutation = useMutation({
    mutationFn: async (formData) => {
      const url = editingTemplate
        ? `/api/admin/templates/${editingTemplate.id}`
        : '/api/admin/templates'
      const method = editingTemplate ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.policyViolated && data.matches) {
          throw new Error(`Pesan melanggar kebijakan konten terlarang: "${data.matches.join(', ')}"`)
        }
        throw new Error(data.error || 'Gagal menyimpan template')
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates-list'] })
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setIsModalOpen(false)
      setEditingTemplate(null)
      setNotification({
        type: 'success',
        message: editingTemplate ? 'Template berhasil diperbarui' : 'Template baru berhasil dibuat',
      })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus template')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates-list'] })
      setDeleteTarget(null)
      setNotification({ type: 'success', message: 'Template telah dihapus' })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  return (
    <div className="space-y-6">
      {/* Alert Notifikasi */}
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

      {/* Page Header */}
      <PageHeader
        title={t('adminTemplates.title', 'Template Pesan')}
        subtitle={t('adminTemplates.subtitle', 'Simpan draf teks pesan dan format media standar untuk digunakan berulang kali pada kampanye blast.')}
        actions={(
          <button
            type="button"
            onClick={() => {
              setEditingTemplate(null)
              setIsModalOpen(true)
            }}
            className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buat Template Baru</span>
          </button>
        )}
      />

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama template atau cuplikan pesan..."
          className="w-full ps-9 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text placeholder:text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Daftar Kartu Template */}
      {isLoading && !templatesData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl p-5 border border-border h-64 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Gagal memuat template pesan"
          message={error?.message || 'Terjadi gangguan saat mengambil data template.'}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Tidak Ada Template Ditemukan"
          message="Buat template pesan pertama untuk memudahkan pembuatan kampanye blast."
          action={(
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(null)
                setIsModalOpen(true)
              }}
              className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
            >
              Buat Template Sekarang
            </button>
          )}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-surface rounded-2xl p-5 border border-border shadow-2xs hover:border-primary/30 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header Kartu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-text truncate max-w-[200px]" title={tpl.name}>
                      {tpl.name}
                    </h3>
                  </div>
                </div>

                {/* Media Thumbnail & Cuplikan Pesan */}
                <div className="mt-4 flex items-start gap-3">
                  {(tpl.imageUrl || tpl.mediaUrl) ? (
                    <img
                      src={buildApiUrl(tpl.imageUrl || tpl.mediaUrl)}
                      alt="Thumbnail template"
                      className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0 bg-surface-2"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted flex-shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <p className="text-xs text-muted line-clamp-3 leading-relaxed flex-1 font-sans">
                    {tpl.body || tpl.message || <span className="italic">Tanpa isi pesan</span>}
                  </p>
                </div>

                {/* Tombol Tautan Call-to-Action Info */}
                {(tpl.buttonText || tpl.buttonLabel) && (
                  <div className="mt-3 p-2 bg-surface-2 rounded-xl border border-border text-[11px] text-muted flex items-center justify-between">
                    <span className="font-semibold text-text truncate">Tombol: {tpl.buttonText || tpl.buttonLabel}</span>
                    <ExternalLink className="w-3 h-3 text-primary flex-shrink-0" />
                  </div>
                )}
              </div>

              {/* Footer Tombol Aksi */}
              <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/superadmin/campaigns?template=${tpl.id}`)}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gunakan</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate(tpl)
                      setIsModalOpen(true)
                    }}
                    className="p-1.5 rounded-lg border border-border text-text hover:bg-surface-2 text-xs transition-colors"
                    title="Ubah Template"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-muted" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(tpl)}
                    className="p-1.5 rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs transition-colors"
                    title="Hapus Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= MODAL BUAT / EDIT TEMPLATE ================= */}
      <TemplateFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingTemplate(null)
        }}
        initialData={editingTemplate}
        onSubmit={(data) => templateMutation.mutate(data)}
        isLoading={templateMutation.isPending}
      />

      {/* ================= DIALOG KONFIRMASI HAPUS ================= */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Template Pesan"
        message={`Apakah Anda yakin ingin menghapus template "${deleteTarget?.name}"? Kampanye yang telah dibuat sebelumnya tidak akan terpengaruh.`}
        confirmText="Hapus Template"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

/**
 * Modal Buat / Ubah Template Pesan
 */
function TemplateFormModal({ isOpen, onClose, initialData, onSubmit, isLoading }) {
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [buttonText, setButtonText] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const textareaRef = useRef(null)
  const mediaInputRef = useRef(null)

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || initialData.title || '')
      setBody(initialData.body || initialData.message || '')
      setButtonText(initialData.buttonText || initialData.buttonLabel || '')
      setButtonUrl(initialData.buttonUrl || '')
      const img = initialData.imageUrl || initialData.mediaUrl
      setMediaPreview(img ? buildApiUrl(img) : null)
    } else {
      setName('')
      setBody('')
      setButtonText('')
      setButtonUrl('')
      setMediaFile(null)
      setMediaPreview(null)
    }
    setErrorMsg('')
  }, [initialData, isOpen])

  const insertFormatting = (prefix, suffix = prefix) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.substring(start, end)
    const replacement = `${prefix}${selected || 'teks'}${suffix}`
    const newBody = body.substring(0, start) + replacement + body.substring(end)
    setBody(newBody)
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
    const newBody = body.substring(0, start) + variable + body.substring(end)
    setBody(newBody)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 50)
  }

  const handleMediaChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Ukuran file maksimal 5 MB')
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Format media harus JPG, PNG, atau WEBP')
      return
    }

    setMediaFile(file)
    setErrorMsg('')
    const reader = new FileReader()
    reader.onload = (ev) => setMediaPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Nama template wajib diisi')
      return
    }
    if (!body.trim()) {
      setErrorMsg('Isi pesan template tidak boleh kosong')
      return
    }
    if (buttonUrl.trim() && !buttonUrl.startsWith('https://')) {
      setErrorMsg('Tautan tombol wajib menggunakan protokol https://')
      return
    }

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('title', name.trim())
    formData.append('body', body.trim())
    formData.append('message', body.trim())
    if (buttonText.trim()) {
      formData.append('buttonText', buttonText.trim())
      formData.append('buttonLabel', buttonText.trim())
    }
    if (buttonUrl.trim()) formData.append('buttonUrl', buttonUrl.trim())
    if (mediaFile) {
      formData.append('media', mediaFile)
      formData.append('image', mediaFile)
    }

    onSubmit(formData)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Ubah Template Pesan' : 'Buat Template Pesan Baru'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Form Fields */}
          <div className="lg:col-span-7 space-y-4">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Nama Template */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Nama Template <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pemberitahuan Promo Akhir Pekan"
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>

            {/* Media Dropzone */}
            <div className="space-y-1">
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
                  Isi Pesan Template <span className="text-danger">*</span>
                </label>
                <span className="text-[10px] text-muted">{body.length} karakter</span>
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
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Halo {{nama}}, ini adalah contoh template pesan blast resmi..."
                className="w-full p-3 text-xs bg-surface border border-border rounded-b-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary font-sans leading-relaxed"
                required
              />
            </div>

            {/* Tombol Tautan Opsional */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text">
                  Teks Tombol <span className="text-muted font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="Contoh: Buka Katalog"
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
                  placeholder="https://afblast.id/katalog"
                  className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Kolom Kanan: Pratinjau WhatsApp */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <span className="text-xs font-bold text-muted uppercase tracking-wider mb-2 self-start">
              Pratinjau Tampilan Pesan
            </span>

            <div className="w-full max-w-[340px] rounded-3xl border-4 border-slate-700/60 dark:border-slate-800 bg-[#e5ddd5] dark:bg-[#0b141a] overflow-hidden shadow-xl flex flex-col min-h-[360px]">
              <div className="bg-[#075e54] dark:bg-[#202c33] text-white p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-400/30 flex items-center justify-center font-bold text-xs">
                  AF
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">AF Blast Official</p>
                  <p className="text-[10px] text-white/80">Online</p>
                </div>
              </div>

              <div className="p-3 flex-1 flex flex-col justify-end space-y-2">
                <div className="self-end max-w-[90%] bg-[#dcf8c6] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-2xl rounded-tr-none p-2.5 shadow-sm space-y-2 text-xs">
                  {mediaPreview && (
                    <img
                      src={mediaPreview}
                      alt="Preview media"
                      className="w-full h-32 rounded-xl object-cover"
                    />
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed break-words font-sans">
                    {body
                      ? body.replace(/\{\{nama\}\}/g, 'Budi Santoso')
                      : 'Halo Budi Santoso, pratinjau pesan akan tampil di sini...'}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-muted">
                    <span>11:20</span>
                    <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  {buttonText && (
                    <div className="pt-2 border-t border-black/10 dark:border-white/10">
                      <div className="w-full py-1.5 bg-surface text-primary rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{buttonText}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Modal */}
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
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isLoading ? 'Menyimpan...' : 'Simpan Template'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
