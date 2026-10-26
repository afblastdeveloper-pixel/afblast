import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Upload, Trash2, Check, X, AlertCircle,
  RefreshCw, FileText, ToggleLeft, ToggleRight, Layers,
  Calendar, Eye
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
  }).format(new Date(dateStr))
}

export default function AdminContactBatchesPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [csvContent, setCsvContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [modalError, setModalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete State
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, title: '' })

  // 1. Fetch Batches
  const {
    data: batchesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['adminContactBatches'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/contact-batches')
      if (!res.ok) throw new Error('Gagal memuat batch kontak bersama')
      return res.json()
    },
    staleTime: 15000,
  })

  const batches = batchesData?.batches || []

  // 2. Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const res = await apiFetch(`/api/admin/contact-batches/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengubah status batch')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminContactBatches'] })
      queryClient.invalidateQueries({ queryKey: ['memberPoolBatches'] })
    },
  })

  // 3. Delete Batch Mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/contact-batches/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menghapus batch kontak')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminContactBatches'] })
      queryClient.invalidateQueries({ queryKey: ['memberPoolBatches'] })
      setDeleteConfirm({ open: false, id: null, title: '' })
    },
  })

  // Handlers
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      setCsvContent(event.target.result || '')
    }
    reader.readAsText(file)
  }

  const handleOpenAddModal = () => {
    setTitle('')
    setDescription('')
    setCsvContent('')
    setFileName('')
    setModalError('')
    setModalOpen(true)
  }

  const handleCreateBatch = async (e) => {
    e.preventDefault()
    setModalError('')

    if (!title.trim()) {
      setModalError('Judul batch wajib diisi')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Create batch
      const res = await apiFetch('/api/admin/contact-batches', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          status: 'active',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal membuat batch kontak')
      }

      const created = await res.json()
      const batchId = created.batch?.id

      // 2. Import CSV contacts jika disediakan
      if (batchId && csvContent.trim()) {
        const importRes = await apiFetch(`/api/admin/contact-batches/${batchId}/import`, {
          method: 'POST',
          body: JSON.stringify({ csvData: csvContent }),
        })
        if (!importRes.ok) {
          const err = await importRes.json().catch(() => ({}))
          console.warn('Import CSV warning:', err)
        }
      }

      queryClient.invalidateQueries({ queryKey: ['adminContactBatches'] })
      queryClient.invalidateQueries({ queryKey: ['memberPoolBatches'] })
      setModalOpen(false)
    } catch (err) {
      setModalError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Can permission="contactPool.manage" fallback={
      <div className="p-8 text-center text-muted">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-2" />
        <p className="font-bold text-text">Akses Dibatasi</p>
        <p className="text-xs">Halaman ini hanya dapat diakses oleh Superadmin dan Developer.</p>
      </div>
    }>
      <div className="space-y-6 max-w-screen-2xl mx-auto">
        {/* Header Halaman */}
        <PageHeader
          title="Daftar Target (Kontak Bersama)"
          subtitle="Upload file CSV dan kelola batch kontak pool untuk alokasi pengiriman blast member."
          actions={
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 h-10 px-5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Batch Baru</span>
            </button>
          }
        />

        {/* Tabel / Grid Batch */}
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <h2 className="text-base font-bold text-text">Daftar Batch Kontak</h2>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-2 hover:text-text transition-colors"
              title="Segarkan"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 bg-surface-2 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-danger text-xs">
              <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
              <p>{error?.message || 'Gagal memuat batch kontak'}</p>
              <button onClick={() => refetch()} className="mt-2 font-semibold underline text-primary">
                Coba Lagi
              </button>
            </div>
          ) : batches.length === 0 ? (
            <div className="p-10 text-center text-muted text-xs bg-surface-2 rounded-xl">
              <Layers className="w-10 h-10 text-muted mx-auto mb-2" />
              <p className="font-semibold text-text">Belum ada batch kontak bersama.</p>
              <p className="mt-1">Klik "Upload Batch Baru" untuk menambahkan kontak massal via CSV.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 text-start font-semibold">Judul & Deskripsi</th>
                    <th className="py-3 px-4 text-center font-semibold">Total Kontak</th>
                    <th className="py-3 px-4 text-center font-semibold">Slot Terpakai</th>
                    <th className="py-3 px-4 text-center font-semibold">Status</th>
                    <th className="py-3 px-4 text-start font-semibold">Dibuat</th>
                    <th className="py-3 px-4 text-end font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((batch) => {
                    const isActive = batch.status === 'active'
                    const totalContacts = batch._count?.contacts ?? batch.totalContacts ?? 0
                    const claimedSlots = batch._count?.slots ?? 0

                    return (
                      <tr key={batch.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3.5 px-4 max-w-[260px]">
                          <p className="font-bold text-text text-sm truncate">{batch.title}</p>
                          {batch.description && (
                            <p className="text-muted text-[11px] truncate mt-0.5">{batch.description}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-success text-sm tabular-nums">
                          {totalContacts.toLocaleString(i18n.language)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-muted font-mono">
                          {claimedSlots} slot
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: batch.id,
                                status: isActive ? 'inactive' : 'active',
                              })
                            }
                            disabled={toggleStatusMutation.isPending}
                            className="inline-flex items-center gap-1.5 focus:outline-none"
                            title="Klik untuk mengubah status aktif/nonaktif"
                          >
                            <Badge variant={isActive ? 'success' : 'neutral'} size="sm">
                              {isActive ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                          {formatDate(batch.createdAt, i18n.language)}
                        </td>
                        <td className="py-3.5 px-4 text-end">
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                open: true,
                                id: batch.id,
                                title: batch.title,
                              })
                            }
                            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                            title="Hapus Batch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* MODAL UPLOAD BATCH BARU */}
        {/* ========================================================================= */}
        <Modal
          isOpen={modalOpen}
          onClose={() => !isSubmitting && setModalOpen(false)}
          title="Upload Batch Kontak Bersama"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateBatch} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Judul Batch
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Database UMKM Jabodetabek"
                required
                className="w-full h-10 px-3.5 border border-border bg-surface-2 rounded-xl text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Deskripsi (Opsional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Catatan mengenai sumber kontak atau target blast..."
                rows={2}
                className="w-full p-3 border border-border bg-surface-2 rounded-xl text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* File CSV Input */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                File CSV Kontak (Kolom: name, phone)
              </label>
              <div className="p-4 border-2 border-dashed border-border rounded-2xl text-center bg-surface-2 hover:bg-surface-2/80 transition-colors">
                <input
                  type="file"
                  accept=".csv,.txt"
                  id="csv-file-input"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="csv-file-input" className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-muted mx-auto mb-1.5" />
                  <span className="text-xs font-semibold text-primary block">
                    {fileName ? fileName : 'Klik untuk memilih file CSV'}
                  </span>
                  <span className="text-[10px] text-muted mt-0.5 block">
                    Mendukung format 08xx, 628xx, atau +628xx
                  </span>
                </label>
              </div>
            </div>

            {/* Atau Paste CSV Textarea */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Atau Tempel Teks CSV Langsung:
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="Budi,08123456789&#10;Siti,08581234567"
                rows={3}
                className="w-full p-3 border border-border bg-surface-2 rounded-xl text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengunggah...</span>
                  </>
                ) : (
                  <span>Simpan Batch</span>
                )}
              </button>
            </div>
          </form>
        </Modal>

        {/* DIALOG KONFIRMASI HAPUS BATCH */}
        <ConfirmDialog
          isOpen={deleteConfirm.open}
          onClose={() => setDeleteConfirm({ open: false, id: null, title: '' })}
          onConfirm={() => deleteBatchMutation.mutate(deleteConfirm.id)}
          title="Hapus Batch Kontak"
          message={`Yakin ingin menghapus batch "${deleteConfirm.title}"? Semua kontak di dalamnya akan dihapus permanen.`}
          confirmText="Hapus Batch"
          cancelText="Batal"
          variant="danger"
          isLoading={deleteBatchMutation.isPending}
        />
      </div>
    </Can>
  )
}
