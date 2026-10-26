import { useState, useEffect } from 'react'
import { Flag, Plus, Trash2, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'

export default function DevFlagsPage() {
  const { token } = useAuth()
  const { refetchConfig } = useConfig()

  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  // Add Flag Modal State
  const [addModal, setAddModal] = useState({
    isOpen: false,
    key: '',
    enabled: true,
    error: '',
  })

  // Delete Confirm Dialog State
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    key: null,
  })

  const fetchFlags = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dev/flags', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Gagal memuat feature flags')
      const data = await res.json()
      setFlags(data.flags || [])
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFlags()
  }, [])

  // Toggle Flag on/off
  const handleToggle = async (key, currentStatus) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/dev/flags/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !currentStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah feature flag')

      setFlags((prev) =>
        prev.map((f) => (f.key === key ? { ...f, enabled: !currentStatus } : f))
      )
      setToastMsg({ type: 'success', text: `Feature flag "${key}" berhasil diubah!` })
      refetchConfig()
    } catch (err) {
      setToastMsg({ type: 'error', text: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  // Create Flag
  const handleCreateFlag = async (e) => {
    e.preventDefault()
    const cleanKey = addModal.key.trim().toLowerCase()
    if (!cleanKey) {
      setAddModal((prev) => ({ ...prev, error: 'Key feature flag wajib diisi' }))
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch('/api/dev/flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: cleanKey, enabled: addModal.enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal membuat feature flag')

      setToastMsg({ type: 'success', text: `Feature flag "${cleanKey}" berhasil dibuat!` })
      setAddModal({ isOpen: false, key: '', enabled: true, error: '' })
      fetchFlags()
      refetchConfig()
    } catch (err) {
      setAddModal((prev) => ({ ...prev, error: err.message }))
    } finally {
      setActionLoading(false)
    }
  }

  // Delete Flag
  const handleDelete = async () => {
    const key = deleteDialog.key
    if (!key) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/dev/flags/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus feature flag')

      setToastMsg({ type: 'success', text: `Feature flag "${key}" berhasil dihapus!` })
      setDeleteDialog({ isOpen: false, key: null })
      setFlags((prev) => prev.filter((f) => f.key !== key))
      refetchConfig()
    } catch (err) {
      setToastMsg({ type: 'error', text: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {toastMsg && (
        <Toast
          type={toastMsg.type}
          message={toastMsg.text}
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Flag className="w-6 h-6 text-emerald-600" />
            <span>Manajemen Feature Flags</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Aktifkan atau nonaktifkan modul dan fitur sistem secara real-time tanpa perlu deployment ulang.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddModal({ isOpen: true, key: '', enabled: true, error: '' })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Flag</span>
          </button>
          <button
            type="button"
            onClick={fetchFlags}
            disabled={loading || actionLoading}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Segarkan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchFlags}
            className="text-xs font-semibold underline hover:no-underline text-red-700"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Flag List Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden p-5">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <p className="text-sm">Memuat feature flags...</p>
          </div>
        ) : flags.length === 0 ? (
          <EmptyState
            title="Belum Ada Feature Flag"
            description="Tambahkan feature flag baru untuk mengontrol fitur aplikasi."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {flags.map((flag) => (
              <div
                key={flag.key}
                className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {flag.key}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        flag.enabled
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                    >
                      {flag.enabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ID #{flag.id} • Dibuat: {new Date(flag.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(flag.enabled)}
                      disabled={actionLoading}
                      onChange={() => handleToggle(flag.key, flag.enabled)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600" />
                  </label>

                  {/* Tombol Hapus */}
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setDeleteDialog({ isOpen: true, key: flag.key })}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Hapus Flag"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Tambah Flag */}
      <Modal
        isOpen={addModal.isOpen}
        title="Tambah Feature Flag Baru"
        onClose={() => !actionLoading && setAddModal({ isOpen: false, key: '', enabled: true, error: '' })}
      >
        <form onSubmit={handleCreateFlag} className="space-y-4">
          {addModal.error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{addModal.error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Key Flag (huruf kecil, underscore/dash) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={addModal.key}
              onChange={(e) => setAddModal((prev) => ({ ...prev, key: e.target.value, error: '' }))}
              placeholder="contoh: new_billing_system"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="flag-enabled"
              checked={addModal.enabled}
              onChange={(e) => setAddModal((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="flag-enabled" className="text-xs text-slate-700 dark:text-slate-200 font-medium">
              Aktifkan langsung saat dibuat (Enabled)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setAddModal({ isOpen: false, key: '', enabled: true, error: '' })}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Simpan Flag</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Dialog Konfirmasi Hapus */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Hapus Feature Flag"
        message={`Apakah Anda yakin ingin menghapus flag "${deleteDialog.key}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmText="Hapus Flag"
        cancelText="Batal"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteDialog({ isOpen: false, key: null })}
      />
    </div>
  )
}
