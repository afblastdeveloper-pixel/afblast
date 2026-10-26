import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FolderGit2, Plus, Search, Edit2, Trash2, Globe,
  DollarSign, Users, AlertCircle, Check, X, RefreshCw,
  ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch } from '../../utils/client'

/**
 * AdminCategoriesPage – Manajemen Kategori Target (/superadmin/categories)
 * Tabel kategori kontak dengan kode negara, tarif reward pesan, total kontak,
 * dan modal hapus yang mendukung opsi migrasi kontak ke kategori lain.
 */
export default function AdminCategoriesPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10) // 10 | 25 | 50

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [deleteCategory, setDeleteCategory] = useState(null)
  const [moveToCategoryId, setMoveToCategoryId] = useState('')

  const [notification, setNotification] = useState(null)

  // Fetch Categories
  const {
    data: categoriesData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-categories', page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('q', search.trim())
      const res = await apiFetch(`/api/admin/categories?${params.toString()}`)
      if (!res.ok) throw new Error(`Gagal memuat kategori: ${res.status}`)
      return res.json()
    },
    staleTime: 15000,
  })

  const categories = categoriesData?.categories || []
  const totalCount = categoriesData?.totalCount || 0
  const totalPages = categoriesData?.totalPages || 1

  // Format Helper Rupiah
  const formatRupiah = (val) =>
    new Intl.NumberFormat(i18n.language || 'id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Number(val) || 0)

  // ================= MUTATIONS =================
  // Simpan / Ubah Kategori
  const categoryMutation = useMutation({
    mutationFn: async (formData) => {
      const url = editingCategory
        ? `/api/admin/categories/${editingCategory.id}`
        : '/api/admin/categories'
      const method = editingCategory ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kategori')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['admin-categories-list'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setIsModalOpen(false)
      setEditingCategory(null)
      setNotification({
        type: 'success',
        message: editingCategory ? 'Kategori berhasil diperbarui' : 'Kategori baru berhasil ditambahkan',
      })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // Hapus Kategori dengan Opsi Pindah Kontak
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/admin/categories/${deleteCategory.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          moveToCategoryId: moveToCategoryId ? Number(moveToCategoryId) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus kategori')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['admin-categories-list'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setDeleteCategory(null)
      setMoveToCategoryId('')
      setNotification({
        type: 'success',
        message: data.message || 'Kategori berhasil dihapus',
      })
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
        title={t('adminCategories.title', 'Kategori Target')}
        subtitle={t('adminCategories.subtitle', 'Atur pengelompokan kontak berdasarkan negara/wilayah dan tentukan tarif reward per pesan blast.')}
        actions={(
          <button
            type="button"
            onClick={() => {
              setEditingCategory(null)
              setIsModalOpen(true)
            }}
            className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Kategori</span>
          </button>
        )}
      />

      {/* Baris Pencarian & Kontrol Jumlah per Halaman */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Cari nama kategori atau kode negara..."
            className="w-full ps-9 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text placeholder:text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted self-end sm:self-auto">
          <span>Tampilkan:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
            className="py-1.5 px-3 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>data / halaman</span>
        </div>
      </div>

      {/* Tabel Kategori */}
      <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
        {isLoading && !categoriesData ? (
          <TableSkeleton rows={6} cols={5} />
        ) : isError ? (
          <ErrorState
            title="Gagal memuat kategori"
            message={error?.message || 'Terjadi gangguan saat mengambil data kategori.'}
            onRetry={() => refetch()}
            isRetrying={isFetching}
          />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="Tidak Ada Kategori Ditemukan"
            message="Tambahkan kategori target pertama untuk mulai mengelompokkan kontak."
            action={(
              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null)
                  setIsModalOpen(true)
                }}
                className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
              >
                Tambah Kategori Sekarang
              </button>
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted border-collapse">
              <thead className="bg-surface-2/60 text-text font-semibold uppercase text-[11px] border-b border-border">
                <tr>
                  <th className="px-5 py-3.5">Nama Kategori</th>
                  <th className="px-5 py-3.5">Kode Negara</th>
                  <th className="px-5 py-3.5">Tarif Kirim (IDR)</th>
                  <th className="px-5 py-3.5">Total Kontak</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-surface-2/40 transition-colors">
                    {/* Nama Kategori */}
                    <td className="px-5 py-4 font-bold text-text">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>{cat.name}</span>
                      </div>
                    </td>

                    {/* Kode Negara */}
                    <td className="px-5 py-4 font-mono">
                      {cat.countryCode ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-text border border-border">
                          <Globe className="w-3 h-3 text-muted" />
                          +{cat.countryCode}
                        </span>
                      ) : (
                        <span className="text-muted italic text-[11px]">Global / Bebas</span>
                      )}
                    </td>

                    {/* Tarif Kirim */}
                    <td className="px-5 py-4 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatRupiah(cat.ratePerMessage || 0)}
                      <span className="text-muted text-[10px] font-normal ms-1">/ pesan</span>
                    </td>

                    {/* Total Kontak Badge */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-text border border-border tabular-nums">
                        <Users className="w-3 h-3 text-muted" />
                        <AnimatedNumber value={cat.totalContacts || 0} /> kontak
                      </span>
                    </td>

                    {/* Aksi */}
                    <td className="px-5 py-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat)
                          setIsModalOpen(true)
                        }}
                        className="px-3 py-1.5 rounded-lg border border-border text-text hover:bg-surface-2 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3 text-muted" />
                        <span>Ubah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteCategory(cat)
                          setMoveToCategoryId('')
                        }}
                        className="px-3 py-1.5 rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Paginasi */}
        <div className="p-4 border-t border-border flex items-center justify-between gap-3 text-xs text-muted">
          <span>
            Halaman <strong className="text-text font-semibold">{page}</strong> dari{' '}
            <strong className="text-text font-semibold">{totalPages}</strong> ({totalCount} kategori)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="p-1.5 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="p-1.5 rounded-xl border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODAL TAMBAH / UBAH KATEGORI ================= */}
      <CategoryFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCategory(null)
        }}
        initialData={editingCategory}
        onSubmit={(data) => categoryMutation.mutate(data)}
        isLoading={categoryMutation.isPending}
      />

      {/* ================= MODAL HAPUS DENGAN OPSI PINDAH KONTAK ================= */}
      {deleteCategory && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteCategory(null)}
          title="Hapus Kategori Target"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Konfirmasi Penghapusan Kategori</p>
                <p className="mt-0.5 leading-relaxed">
                  Apakah Anda yakin ingin menghapus kategori <strong>"{deleteCategory.name}"</strong>?
                </p>
              </div>
            </div>

            {/* Jika kategori memiliki kontak, berikan opsi migrasi */}
            {deleteCategory.totalContacts > 0 && (
              <div className="space-y-2 p-3 bg-surface-2 rounded-xl border border-border">
                <label className="block text-xs font-semibold text-text">
                  Kategori ini memiliki{' '}
                  <strong className="text-primary tabular-nums">
                    {deleteCategory.totalContacts.toLocaleString('id-ID')}
                  </strong>{' '}
                  kontak target. Pindahkan kontak ke:
                </label>
                <select
                  value={moveToCategoryId}
                  onChange={(e) => setMoveToCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">-- Hapus Kontak Sekaligus --</option>
                  {categories
                    .filter((c) => c.id !== deleteCategory.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.countryCode ? `(+${c.countryCode})` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-muted">
                  Bila tidak memilih kategori tujuan, kontak yang terdaftar pada kategori ini akan dilepaskan kategorinya.
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteCategory(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5"
              >
                {deleteMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Hapus Kategori</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/**
 * Modal Tambah / Edit Kategori Target
 */
function CategoryFormModal({ isOpen, onClose, initialData, onSubmit, isLoading }) {
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [ratePerMessage, setRatePerMessage] = useState(50)
  const [errorMsg, setErrorMsg] = useState('')

  useState(() => {
    if (initialData) {
      setName(initialData.name || '')
      setCountryCode(initialData.countryCode || '')
      setRatePerMessage(initialData.ratePerMessage || 50)
    } else {
      setName('')
      setCountryCode('62')
      setRatePerMessage(50)
    }
    setErrorMsg('')
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Nama kategori wajib diisi')
      return
    }
    const cleanCountry = countryCode.replace(/[^0-9]/g, '')

    onSubmit({
      name: name.trim(),
      countryCode: cleanCountry || null,
      ratePerMessage: Number(ratePerMessage) || 0,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Ubah Kategori Target' : 'Tambah Kategori Baru'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Nama Kategori */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Nama Kategori <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Indonesia VIP, Malaysia Retail, UMKM"
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
        </div>

        {/* Kode Negara Opsional */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Kode Negara <span className="text-muted font-normal">(Opsional)</span>
          </label>
          <div className="relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted font-mono text-xs">+</span>
            <input
              type="text"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="62"
              className="w-full ps-7 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            Digunakan untuk pemetaan otomatis saat import CSV massal. Contoh: angka 62 akan otomatis dikelompokkan ke kategori ini. Kosongkan jika kategori bersifat umum/global.
          </p>
        </div>

        {/* Tarif Reward per Pesan */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Tarif Reward per Pesan (Rupiah) <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted font-mono text-xs">Rp</span>
            <input
              type="number"
              min={0}
              step={5}
              value={ratePerMessage}
              onChange={(e) => setRatePerMessage(e.target.value)}
              placeholder="50"
              className="w-full ps-9 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-bold tabular-nums focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>
          <p className="text-[10px] text-muted">
            Nominal imbalan yang didapatkan member untuk setiap pesan WhatsApp yang berhasil terkirim pada kategori ini.
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
            <span>{isLoading ? 'Menyimpan...' : 'Simpan Kategori'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
