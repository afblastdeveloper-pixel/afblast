import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Edit2, Trash2, Check, X, AlertCircle,
  RefreshCw, Mail, MessageCircle, ShieldCheck
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import PageHeader from '../../components/ui/PageHeader'
import Can from '../../components/common/Can'

export default function AdminTeamPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [contact, setContact] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [modalError, setModalError] = useState('')

  // Delete State
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: '' })

  // 1. Fetch Team Members
  const {
    data: teamData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['adminTeam'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/team')
      if (!res.ok) throw new Error('Gagal memuat daftar anggota tim')
      return res.json()
    },
    staleTime: 15000,
  })

  const team = teamData?.team || []

  // 2. Save Mutation (Create or Update)
  const saveMemberMutation = useMutation({
    mutationFn: async (payload) => {
      const isEdit = Boolean(editingMember?.id)
      const endpoint = isEdit ? `/api/admin/team/${editingMember.id}` : '/api/admin/team'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan anggota tim')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeam'] })
      queryClient.invalidateQueries({ queryKey: ['memberTeam'] })
      setModalOpen(false)
      setEditingMember(null)
      setModalError('')
    },
    onError: (err) => {
      setModalError(err.message)
    },
  })

  // 3. Toggle Status Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive, name, roleTitle }) => {
      const res = await apiFetch(`/api/admin/team/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive, name, roleTitle }),
      })
      if (!res.ok) throw new Error('Gagal mengubah status aktif')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeam'] })
      queryClient.invalidateQueries({ queryKey: ['memberTeam'] })
    },
  })

  // 4. Delete Mutation
  const deleteMemberMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/team/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menghapus anggota tim')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeam'] })
      queryClient.invalidateQueries({ queryKey: ['memberTeam'] })
      setDeleteConfirm({ open: false, id: null, name: '' })
    },
  })

  // Handlers
  const handleOpenAddModal = () => {
    setEditingMember(null)
    setName('')
    setRoleTitle('')
    setPhotoUrl('')
    setContact('')
    setSortOrder(String(team.length + 1))
    setIsActive(true)
    setModalError('')
    setModalOpen(true)
  }

  const handleOpenEditModal = (member) => {
    setEditingMember(member)
    setName(member.name || '')
    setRoleTitle(member.roleTitle || '')
    setPhotoUrl(member.photoUrl || '')
    setContact(member.contact || '')
    setSortOrder(String(member.sortOrder || 0))
    setIsActive(member.isActive ?? true)
    setModalError('')
    setModalOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setModalError('')

    if (!name.trim()) {
      setModalError('Nama anggota tim wajib diisi')
      return
    }
    if (!roleTitle.trim()) {
      setModalError('Jabatan/peran wajib diisi')
      return
    }

    saveMemberMutation.mutate({
      name: name.trim(),
      roleTitle: roleTitle.trim(),
      photoUrl: photoUrl.trim() || undefined,
      contact: contact.trim() || undefined,
      sortOrder: parseInt(sortOrder, 10) || 0,
      isActive,
    })
  }

  return (
    <Can permission="team.manage" fallback={
      <div className="p-8 text-center text-muted">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-2" />
        <p className="font-bold text-text">Akses Dibatasi</p>
        <p className="text-xs text-muted">Halaman ini hanya dapat diakses oleh Superadmin dan Developer.</p>
      </div>
    }>
      <div className="space-y-6 max-w-screen-2xl mx-auto">
        {/* Header Panel with PageHeader */}
        <PageHeader
          title="Manajemen Tim AF Blast"
          subtitle="Kelola daftar profil dan kontak resmi tim yang tampil di dashboard member."
          badge="Super Admin"
          actions={
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Anggota Tim</span>
            </button>
          }
        />

        {/* Tabel Tim */}
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <h2 className="text-base font-bold text-text">Daftar Anggota Tim</h2>
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
                <div key={n} className="h-14 bg-surface-2 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-danger text-xs">
              <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
              <p>{error?.message || 'Gagal memuat profil anggota tim'}</p>
              <button onClick={() => refetch()} className="mt-2 font-semibold underline text-primary-text">
                Coba Lagi
              </button>
            </div>
          ) : team.length === 0 ? (
            <div className="p-10 text-center text-muted text-xs bg-surface-2/40 rounded-xl">
              Belum ada anggota tim yang ditambahkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 text-start font-semibold">Nama & Jabatan</th>
                    <th className="py-3 px-4 text-start font-semibold">Kontak Resmi</th>
                    <th className="py-3 px-4 text-center font-semibold">Urutan</th>
                    <th className="py-3 px-4 text-center font-semibold">Status</th>
                    <th className="py-3 px-4 text-end font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {team.map((member) => {
                    const initial = member.name ? member.name.charAt(0).toUpperCase() : 'W'
                    return (
                      <tr key={member.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {member.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-border"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-primary-soft text-primary-text border border-primary/20 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {initial}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-text text-sm truncate">{member.name}</p>
                              <p className="text-primary-text text-xs truncate">{member.roleTitle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-muted font-mono">
                          {member.contact || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center text-muted font-mono">
                          {member.sortOrder}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              toggleActiveMutation.mutate({
                                id: member.id,
                                isActive: !member.isActive,
                                name: member.name,
                                roleTitle: member.roleTitle,
                              })
                            }
                            disabled={toggleActiveMutation.isPending}
                            className="inline-flex items-center gap-1.5 focus:outline-none"
                            title="Klik untuk mengubah status aktif"
                          >
                            <Badge variant={member.isActive ? 'success' : 'neutral'} size="sm">
                              {member.isActive ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-end">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(member)}
                              className="p-1.5 rounded-lg text-muted hover:text-primary-text hover:bg-surface-2 transition-colors"
                              title="Ubah Anggota Tim"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirm({
                                  open: true,
                                  id: member.id,
                                  name: member.name,
                                })
                              }
                              className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                              title="Hapus Anggota Tim"
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
        </section>

        {/* MODAL TAMBAH / UBAH ANGGOTA TIM */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingMember ? 'Ubah Profil Anggota Tim' : 'Tambah Anggota Tim Baru'}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                required
                className="w-full px-3 py-2 border border-border bg-surface-2 text-text placeholder-muted rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Jabatan / Peran
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Contoh: Operations & Blast Specialist"
                required
                className="w-full px-3 py-2 border border-border bg-surface-2 text-text placeholder-muted rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                URL Foto Profil (Opsional)
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/foto.jpg"
                className="w-full px-3 py-2 border border-border bg-surface-2 text-text placeholder-muted rounded-xl text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Kontak Resmi (Email atau WhatsApp)
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="support@afblast.id atau 081234567890"
                className="w-full px-3 py-2 border border-border bg-surface-2 text-text placeholder-muted rounded-xl text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Urutan Tampil (Sort Order)
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 border border-border bg-surface-2 text-text placeholder-muted rounded-xl text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
              <span className="text-xs font-semibold text-text">Tampilkan ke Member:</span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-primary"
                />
                <span className="text-xs font-semibold text-text">
                  {isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </label>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-muted hover:bg-surface-2 text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saveMemberMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
              >
                {saveMemberMutation.isPending ? 'Menyimpan...' : 'Simpan Profil'}
              </button>
            </div>
          </form>
        </Modal>

        {/* DIALOG KONFIRMASI HAPUS */}
        <ConfirmDialog
          isOpen={deleteConfirm.open}
          onClose={() => setDeleteConfirm({ open: false, id: null, name: '' })}
          onConfirm={() => deleteMemberMutation.mutate(deleteConfirm.id)}
          title="Hapus Anggota Tim"
          message={`Yakin ingin menghapus profil "${deleteConfirm.name}" dari Tim AF Blast?`}
          confirmText="Hapus"
          cancelText="Batal"
          type="danger"
          isLoading={deleteMemberMutation.isPending}
        />
      </div>
    </Can>
  )
}
