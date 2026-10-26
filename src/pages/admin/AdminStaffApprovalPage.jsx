import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  UserCheck, Check, X, ShieldAlert, UserCog, AlertCircle, Loader2, RefreshCw
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Tabs from '../../components/ui/Tabs'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'

export default function AdminStaffApprovalPage() {
  const { t } = useTranslation()
  const { token, user: currentUser } = useAuth()

  const [staffList, setStaffList] = useState([])
  const [activeTab, setActiveTab] = useState('all') // all | pending | approved | rejected | suspended
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null, // 'approve' | 'suspend'
    item: null,
  })

  // Modal Tolak State
  const [rejectModal, setRejectModal] = useState({
    isOpen: false,
    item: null,
    reason: '',
    error: '',
  })

  // Modal Ubah Role State
  const [roleModal, setRoleModal] = useState({
    isOpen: false,
    item: null,
    newRole: 'adminfinance',
    error: '',
  })

  // Fetch daftar staf dari API
  const fetchStaff = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/staff', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        throw new Error('Gagal memuat data staf dari server')
      }
      const data = await res.json()
      setStaffList(data.staff || [])
    } catch (err) {
      console.error('Fetch staff error:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  // Hitung jumlah per tab
  const counts = useMemo(() => {
    return {
      all: staffList.length,
      pending: staffList.filter((s) => s.staffStatus === 'pending').length,
      approved: staffList.filter((s) => s.staffStatus === 'approved').length,
      rejected: staffList.filter((s) => s.staffStatus === 'rejected').length,
      suspended: staffList.filter((s) => s.staffStatus === 'suspended').length,
    }
  }, [staffList])

  const tabs = [
    { key: 'all', label: 'Semua Status', count: counts.all },
    { key: 'pending', label: 'Menunggu (Pending)', count: counts.pending },
    { key: 'approved', label: 'Disetujui', count: counts.approved },
    { key: 'rejected', label: 'Ditolak', count: counts.rejected },
    { key: 'suspended', label: 'Dinonaktifkan', count: counts.suspended },
  ]

  // Filter daftar staf berdasarkan tab
  const filteredStaff = useMemo(() => {
    if (activeTab === 'all') return staffList
    return staffList.filter((s) => s.staffStatus === activeTab)
  }, [staffList, activeTab])

  // --- AKSI: APPROVE (ACC) ---
  const handleApprove = async () => {
    const item = confirmDialog.item
    if (!item) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/admin/staff/${item.id}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyetujui akun')

      setToastMsg({ type: 'success', text: `Akun ${item.username} berhasil disetujui!` })
      setConfirmDialog({ isOpen: false, type: null, item: null })
      fetchStaff()
    } catch (err) {
      setToastMsg({ type: 'error', text: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  // --- AKSI: TOLAK (REJECT DENGAN ALASAN) ---
  const handleReject = async () => {
    const item = rejectModal.item
    const reason = rejectModal.reason.trim()
    if (!reason) {
      setRejectModal((prev) => ({ ...prev, error: 'Alasan penolakan wajib diisi' }))
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/staff/${item.id}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menolak akun')

      setToastMsg({ type: 'success', text: `Akun ${item.username} telah ditolak.` })
      setRejectModal({ isOpen: false, item: null, reason: '', error: '' })
      fetchStaff()
    } catch (err) {
      setRejectModal((prev) => ({ ...prev, error: err.message }))
    } finally {
      setActionLoading(false)
    }
  }

  // --- AKSI: SUSPEND ---
  const handleSuspend = async () => {
    const item = confirmDialog.item
    if (!item) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/admin/staff/${item.id}/suspend`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menonaktifkan akun')

      setToastMsg({ type: 'success', text: `Akun ${item.username} berhasil dinonaktifkan!` })
      setConfirmDialog({ isOpen: false, type: null, item: null })
      fetchStaff()
    } catch (err) {
      setToastMsg({ type: 'error', text: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  // --- AKSI: UBAH ROLE ---
  const handleChangeRole = async () => {
    const item = roleModal.item
    const newRole = roleModal.newRole
    setActionLoading(true)

    try {
      const res = await fetch(`/api/admin/staff/${item.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah role')

      setToastMsg({ type: 'success', text: `Role ${item.username} diubah menjadi ${newRole}!` })
      setRoleModal({ isOpen: false, item: null, newRole: 'adminfinance', error: '' })
      fetchStaff()
    } catch (err) {
      setRoleModal((prev) => ({ ...prev, error: err.message }))
    } finally {
      setActionLoading(false)
    }
  }

  // Kolom Tabel
  const columns = [
    {
      key: 'name',
      label: 'Nama & Username',
      render: (_, row) => (
        <div>
          <div className="font-semibold text-text flex items-center gap-1.5">
            <span>{row.name}</span>
            {row.id === currentUser?.id && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-text font-medium border border-primary/20">
                (Anda)
              </span>
            )}
          </div>
          <div className="text-xs font-mono text-primary-text">
            {row.username || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Peran (Role)',
      render: (role) => {
        let variant = 'default'
        if (role === 'superadmin') variant = 'primary'
        if (role === 'adminfinance') variant = 'info'
        if (role === 'developer') variant = 'warning'
        return <Badge variant={variant}>{role}</Badge>
      },
    },
    {
      key: 'staffStatus',
      label: 'Status Akun',
      render: (status, row) => {
        let variant = 'default'
        let text = status
        if (status === 'pending') {
          variant = 'warning'
          text = 'Menunggu Persetujuan'
        } else if (status === 'approved') {
          variant = 'success'
          text = 'Disetujui'
        } else if (status === 'rejected') {
          variant = 'danger'
          text = 'Ditolak'
        } else if (status === 'suspended') {
          variant = 'secondary'
          text = 'Dinonaktifkan'
        }
        return (
          <div>
            <Badge variant={variant}>{text}</Badge>
            {row.rejectionReason && (
              <p className="text-[11px] text-danger mt-1 italic">
                Alasan: {row.rejectionReason}
              </p>
            )}
          </div>
        )
      },
    },
    {
      key: 'approval',
      label: 'Penyetujui',
      render: (_, row) => {
        const approver = row.approver || row.approvedBy
        if (!approver && !row.approvedAt) return <span className="text-muted text-xs">-</span>
        return (
          <div className="text-xs text-muted">
            {approver ? <div>Oleh: {approver.name || approver.username}</div> : null}
            {row.approvedAt ? <div>{new Date(row.approvedAt).toLocaleDateString()}</div> : null}
          </div>
        )
      },
    },
    {
      key: 'actions',
      label: 'Tindakan',
      render: (_, row) => {
        const isSelf = row.id === currentUser?.id
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Tombol ACC (Setujui) hanya jika pending */}
            {row.staffStatus === 'pending' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setConfirmDialog({
                    isOpen: true,
                    type: 'approve',
                    item: row,
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
                title="Setujui Akun (ACC)"
              >
                <Check className="w-3.5 h-3.5" />
                <span>ACC</span>
              </button>
            )}

            {/* Tombol Tolak jika pending */}
            {row.staffStatus === 'pending' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setRejectModal({
                    isOpen: true,
                    item: row,
                    reason: '',
                    error: '',
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 transition-colors disabled:opacity-50"
                title="Tolak Akun"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tolak</span>
              </button>
            )}

            {/* Tombol Suspend (hanya untuk approved, bukan akun sendiri) */}
            {row.staffStatus === 'approved' && !isSelf && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setConfirmDialog({
                    isOpen: true,
                    type: 'suspend',
                    item: row,
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-warning/10 hover:bg-warning/20 text-warning border border-warning/20 transition-colors disabled:opacity-50"
                title="Nonaktifkan Akun"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Suspend</span>
              </button>
            )}

            {/* Tombol Ubah Role (bukan akun sendiri) */}
            {!isSelf && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setRoleModal({
                    isOpen: true,
                    item: row,
                    newRole: row.role || 'adminfinance',
                    error: '',
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 hover:bg-border text-text border border-border transition-colors disabled:opacity-50"
                title="Ubah Role"
              >
                <UserCog className="w-3.5 h-3.5" />
                <span>Ubah Role</span>
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Toast Notifikasi */}
      {toastMsg && (
        <Toast
          type={toastMsg.type}
          message={toastMsg.text}
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* Header Halaman */}
      <PageHeader
        title="Persetujuan & Manajemen Akun Staf"
        subtitle="Kelola persetujuan pendaftaran staf baru (ACC), penolakan, penonaktifan, serta pengaturan peran akun."
        actions={
          <button
            type="button"
            onClick={fetchStaff}
            disabled={loading || actionLoading}
            className="inline-flex items-center gap-2 h-10 px-4 text-xs font-semibold rounded-xl bg-surface border border-border text-text hover:bg-surface-2 transition-colors shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan Data</span>
          </button>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchStaff}
            className="text-xs font-semibold underline hover:no-underline text-danger"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Tabs Filter Status */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Konten Tabel */}
      <div className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-sm">Memuat daftar staf...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <EmptyState
            title="Tidak Ada Data Staf"
            description={`Tidak ada staf dengan status '${activeTab}' yang ditemukan.`}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredStaff}
            searchPlaceholder="Cari nama atau username staf..."
          />
        )}
      </div>

      {/* Dialog Konfirmasi (Approve / Suspend) */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.type === 'approve'
            ? 'Setujui Akun Staf'
            : 'Nonaktifkan Akun Staf'
        }
        message={
          confirmDialog.type === 'approve'
            ? `Apakah Anda yakin ingin menyetujui akun staf "${confirmDialog.item?.username}"? Staf akan langsung dapat login ke sistem.`
            : `Apakah Anda yakin ingin menonaktifkan akun "${confirmDialog.item?.username}"? Staf tidak akan dapat login kembali.`
        }
        confirmText={confirmDialog.type === 'approve' ? 'Ya, Setujui (ACC)' : 'Ya, Nonaktifkan'}
        cancelText="Batal"
        variant={confirmDialog.type === 'approve' ? 'success' : 'danger'}
        isLoading={actionLoading}
        onConfirm={confirmDialog.type === 'approve' ? handleApprove : handleSuspend}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, item: null })}
      />

      {/* Modal Tolak dengan Alasan Wajib */}
      <Modal
        isOpen={rejectModal.isOpen}
        title="Tolak Pendaftaran Staf"
        onClose={() => !actionLoading && setRejectModal({ isOpen: false, item: null, reason: '', error: '' })}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Berikan alasan penolakan untuk akun <strong className="font-mono text-text">{rejectModal.item?.username}</strong>. Alasan ini wajib diisi dan akan dicatat di sistem.
          </p>

          {rejectModal.error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{rejectModal.error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Alasan Penolakan <span className="text-danger">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value, error: '' }))}
              placeholder="Contoh: Informasi tidak lengkap atau posisi sudah terisi"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setRejectModal({ isOpen: false, item: null, reason: '', error: '' })}
              className="h-10 px-4 text-xs font-semibold text-muted hover:text-text hover:bg-surface-2 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleReject}
              className="h-10 px-4 text-xs font-semibold bg-danger hover:bg-danger/90 text-white rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Tolak Akun</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Ubah Role */}
      <Modal
        isOpen={roleModal.isOpen}
        title="Ubah Peran (Role) Staf"
        onClose={() => !actionLoading && setRoleModal({ isOpen: false, item: null, newRole: 'adminfinance', error: '' })}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Pilih peran baru untuk akun <strong className="font-mono text-text">{roleModal.item?.username}</strong>:
          </p>

          {roleModal.error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{roleModal.error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Peran Baru
            </label>
            <select
              value={roleModal.newRole}
              onChange={(e) => setRoleModal((prev) => ({ ...prev, newRole: e.target.value, error: '' }))}
              className="w-full h-10 px-3.5 rounded-xl border border-border bg-surface-2 text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="adminfinance">Admin Finance</option>
              <option value="developer">Developer</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setRoleModal({ isOpen: false, item: null, newRole: 'adminfinance', error: '' })}
              className="h-10 px-4 text-xs font-semibold text-muted hover:text-text hover:bg-surface-2 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleChangeRole}
              className="h-10 px-4 text-xs font-semibold bg-primary hover:bg-primary-hover text-white rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
