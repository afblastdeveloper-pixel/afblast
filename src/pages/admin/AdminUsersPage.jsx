import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  UserPlus, Eye, Edit2, ShieldAlert, KeyRound
} from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'
import { ADMIN_USERS } from '../../data/admin/users'

export default function AdminUsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState(ADMIN_USERS)
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // State Modal Detail
  const [selectedUser, setSelectedUser] = useState(null)
  const [editUser, setEditUser] = useState(null)

  // State Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: 'suspend', // 'suspend' | 'activate' | 'resetPassword' | 'changeRole'
    user: null,
  })

  // State Toast
  const [toastMsg, setToastMsg] = useState(null)

  // Filtered Data
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = !filterRole || u.role === filterRole
      const matchStatus = !filterStatus || u.status === filterStatus
      return matchRole && matchStatus
    })
  }, [users, filterRole, filterStatus])

  // Aksi Toggle Suspend / Aktifkan
  const handleToggleStatus = (u) => {
    setConfirmDialog({
      isOpen: true,
      type: u.status === 'active' ? 'suspend' : 'activate',
      user: u,
    })
  }

  // Aksi Reset Password
  const handleResetPassword = (u) => {
    setConfirmDialog({
      isOpen: true,
      type: 'resetPassword',
      user: u,
    })
  }

  // Aksi Ganti Role
  const handleChangeRole = (u) => {
    setConfirmDialog({
      isOpen: true,
      type: 'changeRole',
      user: u,
    })
  }

  // Eksekusi Konfirmasi
  const executeConfirmAction = () => {
    const { type, user } = confirmDialog
    if (!user) return

    if (type === 'suspend' || type === 'activate') {
      const newStatus = type === 'suspend' ? 'suspended' : 'active'
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, status: newStatus } : item
        )
      )
      setToastMsg(
        type === 'suspend'
          ? `Akun ${user.name} berhasil ditangguhkan.`
          : `Akun ${user.name} telah diaktifkan kembali.`
      )
    } else if (type === 'resetPassword') {
      setToastMsg(`Tautan reset password berhasil dikirim ke ${user.email}.`)
    } else if (type === 'changeRole') {
      const newRole = user.role === 'admin' ? 'user' : 'admin'
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, role: newRole } : item
        )
      )
      setToastMsg(`Peran ${user.name} berhasil diubah menjadi ${newRole}.`)
    }

    setConfirmDialog({ isOpen: false, type: 'suspend', user: null })
  }

  // Simpan Edit Pengguna
  const handleSaveEdit = (e) => {
    e.preventDefault()
    setUsers((prev) =>
      prev.map((u) => (u.id === editUser.id ? editUser : u))
    )
    setEditUser(null)
    setToastMsg(t('adminUsers.userSaved'))
  }

  // Kolom DataTable
  const columns = [
    {
      key: 'name',
      label: 'Nama & Pengguna',
      sortable: true,
      render: (_, row) => (
        <div>
          <p className="font-semibold text-text">{row.name}</p>
          <p className="text-xs text-muted">{row.email}</p>
          <p className="text-[11px] text-muted font-mono mt-0.5">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Peran',
      sortable: true,
      render: (role) => (
        <Badge
          variant={role === 'admin' ? 'primary' : 'neutral'}
          size="sm"
        >
          {role === 'admin' ? 'Administrator' : 'User'}
        </Badge>
      ),
    },
    {
      key: 'package',
      label: 'Paket & Kuota',
      sortable: true,
      render: (_, row) => (
        <div>
          <span className="font-semibold text-text text-xs">{row.package}</span>
          <div className="w-24 bg-surface-2 border border-border rounded-full h-1.5 mt-1 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((row.usedQuota / row.messageQuota) * 100)
                )}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-muted mt-0.5 tabular-nums">
            {new Intl.NumberFormat().format(row.usedQuota)} /{' '}
            {new Intl.NumberFormat().format(row.messageQuota)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (status) => (
        <Badge
          variant={status === 'active' ? 'success' : 'danger'}
          dot={true}
          size="sm"
        >
          {status === 'active' ? 'Aktif' : 'Ditangguhkan'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      label: 'Bergabung',
      sortable: true,
      render: (date) => (
        <span className="text-xs text-muted font-mono">{date}</span>
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
            onClick={() => setSelectedUser(row)}
            className="p-1.5 text-muted hover:text-primary hover:bg-surface-2 rounded-lg transition-colors"
            title="Lihat Detail"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditUser({ ...row })}
            className="p-1.5 text-muted hover:text-success hover:bg-surface-2 rounded-lg transition-colors"
            title="Edit Pengguna"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleToggleStatus(row)}
            className={`p-1.5 rounded-lg transition-colors ${
              row.status === 'active'
                ? 'text-muted hover:text-danger hover:bg-surface-2'
                : 'text-muted hover:text-success hover:bg-surface-2'
            }`}
            title={row.status === 'active' ? 'Tangguhkan Akun' : 'Aktifkan Akun'}
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleResetPassword(row)}
            className="p-1.5 text-muted hover:text-warning hover:bg-surface-2 rounded-lg transition-colors"
            title="Reset Password"
          >
            <KeyRound className="w-4 h-4" />
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

      {/* Header Panel with PageHeader Component */}
      <PageHeader
        title={t('adminUsers.title')}
        subtitle={t('adminUsers.subtitle')}
        badge="Pengguna"
        actions={
          <button
            type="button"
            onClick={() =>
              setToastMsg('Fitur penambahan pengguna via admin dibuka di modal')
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('adminUsers.addUser')}</span>
          </button>
        }
      />

      {/* Tabel Pengguna Reusable */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        searchPlaceholder="Cari nama, email, atau nomor telepon..."
        pageSize={8}
        onRowClick={(row) => setSelectedUser(row)}
        filters={(
          <>
            {/* Filter Role */}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="py-2 px-3 text-xs sm:text-sm bg-surface-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text"
            >
              <option value="">Semua Peran</option>
              <option value="user">Pengguna Biasa</option>
              <option value="admin">Administrator</option>
            </select>

            {/* Filter Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-2 px-3 text-xs sm:text-sm bg-surface-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text"
            >
              <option value="">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="suspended">Ditangguhkan</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </>
        )}
      />

      {/* Modal Detail Pengguna */}
      {selectedUser && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          title={t('adminUsers.userDetailTitle')}
          subtitle={`ID: ${selectedUser.id}`}
          maxWidth="lg"
          footer={(
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => {
                  handleChangeRole(selectedUser)
                  setSelectedUser(null)
                }}
                className="px-3.5 py-2 text-xs font-semibold text-text border border-border hover:bg-surface-2 rounded-xl transition-colors"
              >
                Ubah ke {selectedUser.role === 'admin' ? 'User' : 'Admin'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-surface-2 rounded-2xl border border-border">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-lg">
                {selectedUser.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-text">{selectedUser.name}</h3>
                <p className="text-xs text-muted">{selectedUser.email}</p>
                <p className="text-xs text-muted font-mono mt-0.5">
                  {selectedUser.phone}
                </p>
              </div>
              <Badge
                variant={selectedUser.status === 'active' ? 'success' : 'danger'}
                dot={true}
              >
                {selectedUser.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-surface-2 rounded-xl border border-border">
                <span className="text-muted block mb-0.5">Paket Langganan</span>
                <span className="font-bold text-text text-sm">
                  {selectedUser.package}
                </span>
              </div>
              <div className="p-3 bg-surface-2 rounded-xl border border-border">
                <span className="text-muted block mb-0.5">Total Campaign</span>
                <span className="font-bold text-text text-sm">
                  {selectedUser.totalCampaigns} dibuat
                </span>
              </div>
              <div className="p-3 bg-surface-2 rounded-xl border border-border">
                <span className="text-muted block mb-0.5">Sisa Kuota Pesan</span>
                <span className="font-bold text-text text-sm tabular-nums">
                  {new Intl.NumberFormat().format(
                    selectedUser.messageQuota - selectedUser.usedQuota
                  )}{' '}
                  pesan
                </span>
              </div>
              <div className="p-3 bg-surface-2 rounded-xl border border-border">
                <span className="text-muted block mb-0.5">Login Terakhir</span>
                <span className="font-semibold text-text">
                  {selectedUser.lastLogin}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Edit Pengguna */}
      {editUser && (
        <Modal
          isOpen={true}
          onClose={() => setEditUser(null)}
          title="Edit Data Pengguna"
          subtitle={`ID: ${editUser.id}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={editUser.name}
                onChange={(e) =>
                  setEditUser({ ...editUser, name: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-text"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">
                Email
              </label>
              <input
                type="email"
                value={editUser.email}
                onChange={(e) =>
                  setEditUser({ ...editUser, email: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-text"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">
                Nomor WhatsApp
              </label>
              <input
                type="text"
                value={editUser.phone}
                onChange={(e) =>
                  setEditUser({ ...editUser, phone: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-text"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Paket
                </label>
                <select
                  value={editUser.package}
                  onChange={(e) =>
                    setEditUser({ ...editUser, package: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl text-text"
                >
                  <option value="Starter">Starter</option>
                  <option value="Pro">Pro</option>
                  <option value="Business">Business</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Status
                </label>
                <select
                  value={editUser.status}
                  onChange={(e) =>
                    setEditUser({ ...editUser, status: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl text-text"
                >
                  <option value="active">Aktif</option>
                  <option value="suspended">Ditangguhkan</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="px-4 py-2 border border-border text-muted hover:text-text rounded-xl text-sm font-semibold hover:bg-surface-2"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog Reusable */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() =>
          setConfirmDialog({ isOpen: false, type: 'suspend', user: null })
        }
        onConfirm={executeConfirmAction}
        variant={
          confirmDialog.type === 'suspend'
            ? 'danger'
            : confirmDialog.type === 'resetPassword'
            ? 'warning'
            : 'success'
        }
        title={
          confirmDialog.type === 'suspend'
            ? 'Tangguhkan Pengguna'
            : confirmDialog.type === 'activate'
            ? 'Aktifkan Kembali Pengguna'
            : confirmDialog.type === 'resetPassword'
            ? 'Reset Kata Sandi Pengguna'
            : 'Ubah Peran Pengguna'
        }
        message={
          confirmDialog.user
            ? confirmDialog.type === 'suspend'
              ? `Apakah Anda yakin ingin menangguhkan akun ${confirmDialog.user.name}? Pengguna ini tidak akan bisa login ke platform.`
              : confirmDialog.type === 'activate'
              ? `Aktifkan kembali akun ${confirmDialog.user.name}?`
              : confirmDialog.type === 'resetPassword'
              ? `Kirim tautan reset kata sandi ke ${confirmDialog.user.email}?`
              : `Ubah peran ${confirmDialog.user.name} menjadi ${
                  confirmDialog.user.role === 'admin' ? 'User' : 'Admin'
                }?`
            : ''
        }
        confirmText="Lanjutkan"
        cancelText="Batal"
      />
    </div>
  )
}
