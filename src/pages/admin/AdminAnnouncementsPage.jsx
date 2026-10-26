import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Edit2, Trash2, CheckCircle2,
  AlertTriangle, Info
} from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'
import { ADMIN_ANNOUNCEMENTS } from '../../data/admin/announcements'

const DEFAULT_START_DATE = '2026-10-18'
const DEFAULT_END_DATE = '2026-11-01'

export default function AdminAnnouncementsPage() {
  const { t } = useTranslation()
  const [announcements, setAnnouncements] = useState(ADMIN_ANNOUNCEMENTS)

  // Form Modal (Create or Edit)
  const [formModal, setFormModal] = useState({
    isOpen: false,
    isEdit: false,
    data: {
      id: '',
      title: '',
      content: '',
      type: 'info',
      startDate: DEFAULT_START_DATE,
      endDate: DEFAULT_END_DATE,
      isActive: true,
      targetRole: 'all',
    },
  })

  // Delete Confirm Dialog
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    item: null,
  })

  // Toast State
  const [toastMsg, setToastMsg] = useState(null)

  // Current active announcements for ticker preview
  const activeForPreview = announcements.filter((a) => a.isActive)

  // Trigger Create
  const handleOpenCreate = () => {
    setFormModal({
      isOpen: true,
      isEdit: false,
      data: {
        id: `ANN-${String(announcements.length + 1).padStart(3, '0')}`,
        title: '',
        content: '',
        type: 'info',
        startDate: DEFAULT_START_DATE,
        endDate: DEFAULT_END_DATE,
        isActive: true,
        targetRole: 'all',
      },
    })
  }

  // Trigger Edit
  const handleOpenEdit = (item) => {
    setFormModal({
      isOpen: true,
      isEdit: true,
      data: { ...item },
    })
  }

  // Toggle Active/Inactive
  const handleToggleActive = (id) => {
    setAnnouncements((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, isActive: !a.isActive } : a
      )
    )
    setToastMsg('Status tayang pengumuman berhasil diubah.')
  }

  // Save Form
  const handleSaveForm = (e) => {
    e.preventDefault()
    const { isEdit, data } = formModal

    if (!data.title.trim() || !data.content.trim()) {
      return
    }

    if (isEdit) {
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === data.id ? data : a))
      )
      setToastMsg('Pengumuman berhasil diperbarui!')
    } else {
      setAnnouncements((prev) => [data, ...prev])
      setToastMsg('Pengumuman baru berhasil ditambahkan!')
    }

    setFormModal({ isOpen: false, isEdit: false, data: {} })
  }

  // Execute Delete
  const handleConfirmDelete = () => {
    if (!deleteDialog.item) return
    setAnnouncements((prev) =>
      prev.filter((a) => a.id !== deleteDialog.item.id)
    )
    setDeleteDialog({ isOpen: false, item: null })
    setToastMsg('Pengumuman berhasil dihapus dari sistem.')
  }

  // Kolom Tabel
  const columns = [
    {
      key: 'title',
      label: 'Judul & Teks Pengumuman',
      sortable: true,
      render: (_, row) => (
        <div className="max-w-md">
          <div className="flex items-center gap-2">
            <span className="font-bold text-text text-xs font-mono">{row.id}</span>
            <span className="font-semibold text-text text-sm">{row.title}</span>
          </div>
          <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
            {row.content}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Tipe',
      sortable: true,
      render: (type) => {
        const typeMap = {
          info: { variant: 'info', label: 'Info' },
          warning: { variant: 'warning', label: 'Peringatan' },
          success: { variant: 'success', label: 'Sukses' },
        }[type] || { variant: 'neutral', label: type }

        return (
          <Badge variant={typeMap.variant} dot={true} size="sm">
            {typeMap.label}
          </Badge>
        )
      },
    },
    {
      key: 'startDate',
      label: 'Jadwal Tayang',
      sortable: true,
      render: (_, row) => (
        <div className="text-xs text-text font-mono">
          <p>{row.startDate}</p>
          <p className="text-muted text-[11px]">s/d {row.endDate}</p>
        </div>
      ),
    },
    {
      key: 'isActive',
      label: 'Status Tayang',
      sortable: true,
      render: (isActive, row) => (
        <button
          type="button"
          onClick={() => handleToggleActive(row.id)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            isActive
              ? 'bg-success/15 text-success hover:bg-success/25'
              : 'bg-surface-2 text-muted hover:bg-surface-2/80'
          }`}
          title="Klik untuk ubah status"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isActive ? 'bg-success' : 'bg-muted'
            }`}
          />
          <span>{isActive ? 'Aktif' : 'Nonaktif'}</span>
        </button>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      align: 'end',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenEdit(row)}
            className="p-1.5 text-muted hover:text-primary-text hover:bg-surface-2 rounded-lg transition-colors"
            title="Edit Pengumuman"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteDialog({ isOpen: true, item: row })}
            className="p-1.5 text-muted hover:text-danger hover:bg-surface-2 rounded-lg transition-colors"
            title="Hapus Pengumuman"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <Toast
          message={toastMsg}
          type="success"
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* Header Panel with PageHeader */}
      <PageHeader
        title={t('adminAnnouncements.title')}
        subtitle={t('adminAnnouncements.subtitle')}
        badge="Ticker"
        actions={
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{t('adminAnnouncements.createBtn')}</span>
          </button>
        }
      />

      {/* LIVE RUNNING TICKER PREVIEW CARD */}
      <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs text-text">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-accent">
              {t('adminAnnouncements.tickerPreview')}
            </span>
          </div>
          <span className="text-[11px] text-muted font-mono">
            {activeForPreview.length} pengumuman aktif saat ini
          </span>
        </div>

        {/* Live marquee simulation */}
        <div className="bg-surface-2 rounded-xl p-3 border border-border flex items-center gap-3 overflow-hidden">
          <div className="px-2 py-0.5 rounded-md bg-primary-soft text-primary-text text-[10px] font-bold uppercase flex-shrink-0">
            Live Ticker
          </div>

          <div className="flex-1 overflow-hidden">
            {activeForPreview.length === 0 ? (
              <span className="text-xs text-muted italic">
                Tidak ada pengumuman aktif untuk ditampilkan di ticker.
              </span>
            ) : (
              <div className="flex items-center gap-8 whitespace-nowrap animate-[marquee_25s_linear_infinite]">
                {activeForPreview.map((ann, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {ann.type === 'warning' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                    ) : ann.type === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-info flex-shrink-0" />
                    )}
                    <span className="font-semibold text-text">{ann.title}:</span>
                    <span className="text-muted">{ann.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabel Data Reusable */}
      <DataTable
        columns={columns}
        data={announcements}
        searchPlaceholder="Cari judul atau isi pengumuman..."
        pageSize={6}
      />

      {/* Modal Form Tambah / Edit Pengumuman */}
      {formModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setFormModal({ isOpen: false, isEdit: false, data: {} })}
          title={
            formModal.isEdit
              ? t('adminAnnouncements.editBtn')
              : t('adminAnnouncements.createBtn')
          }
          subtitle="Pengumuman akan otomatis muncul di running ticker pengguna yang sesuai."
          maxWidth="lg"
        >
          <form onSubmit={handleSaveForm} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                {t('adminAnnouncements.formTitle')}
              </label>
              <input
                type="text"
                value={formModal.data.title}
                onChange={(e) =>
                  setFormModal({
                    ...formModal,
                    data: { ...formModal.data, title: e.target.value },
                  })
                }
                placeholder="Contoh: Pemeliharaan Sistem Berkala"
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary placeholder-muted"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                {t('adminAnnouncements.formContent')}
              </label>
              <textarea
                rows={3}
                value={formModal.data.content}
                onChange={(e) =>
                  setFormModal({
                    ...formModal,
                    data: { ...formModal.data, content: e.target.value },
                  })
                }
                placeholder="Tulis pesan lengkap yang akan berjalan di marquee..."
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary placeholder-muted"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  {t('adminAnnouncements.formType')}
                </label>
                <select
                  value={formModal.data.type}
                  onChange={(e) =>
                    setFormModal({
                      ...formModal,
                      data: { ...formModal.data, type: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="info">{t('adminAnnouncements.typeInfo')}</option>
                  <option value="warning">{t('adminAnnouncements.typeWarning')}</option>
                  <option value="success">{t('adminAnnouncements.typeSuccess')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  {t('adminAnnouncements.formStart')}
                </label>
                <input
                  type="date"
                  value={formModal.data.startDate}
                  onChange={(e) =>
                    setFormModal({
                      ...formModal,
                      data: { ...formModal.data, startDate: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  {t('adminAnnouncements.formEnd')}
                </label>
                <input
                  type="date"
                  value={formModal.data.endDate}
                  onChange={(e) =>
                    setFormModal({
                      ...formModal,
                      data: { ...formModal.data, endDate: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="ann-active"
                checked={formModal.data.isActive}
                onChange={(e) =>
                  setFormModal({
                    ...formModal,
                    data: { ...formModal.data, isActive: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary"
              />
              <label htmlFor="ann-active" className="text-xs font-semibold text-text cursor-pointer">
                Aktifkan langsung dan tampilkan di running ticker
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() =>
                  setFormModal({ isOpen: false, isEdit: false, data: {} })
                }
                className="px-4 py-2 border border-border text-muted rounded-xl text-sm font-semibold hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
              >
                Simpan Pengumuman
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog Hapus */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, item: null })}
        onConfirm={handleConfirmDelete}
        variant="danger"
        title={t('adminAnnouncements.deleteConfirmTitle')}
        message={t('adminAnnouncements.deleteConfirmMsg')}
        confirmText="Hapus Pengumuman"
        cancelText="Batal"
      />
    </div>
  )
}
