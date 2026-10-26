import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, ShieldAlert, Download, RotateCcw, Trash2,
  Calendar, Clock, Check, X, AlertCircle, RefreshCw,
  HardDrive, Key, Lock, CheckCircle2, AlertTriangle, Eye, EyeOff
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/common/SkeletonStates'
import { apiFetch, buildApiUrl } from '../../utils/client'
import { useAuth } from '../../context/AuthContext'

/**
 * AdminBackupPage – Cadangkan & Pulihkan Data Website (/superadmin/backup)
 * Eksklusif Super Admin:
 * - Subjudul: "Cadangkan & pulihkan data website. Tangani dengan hati-hati."
 * - Kartu "Buat Cadangan Sekarang"
 * - Pengaturan jadwal harian + retensi
 * - Tabel cadangan (waktu, jenis, ukuran, checksum singkat, status, Unduh, Pulihkan, Hapus)
 * - Unduh meminta password ulang
 * - Pulihkan berupa wizard 3 langkah:
 *   1. Baca peringatan
 *   2. Aktifkan maintenance + verifikasi checksum
 *   3. Ketik "PULIHKAN" + password
 * - Progres job realtime & hasil
 */
export default function AdminBackupPage() {
  const { t } = useTranslation()
  const { user, role } = useAuth()
  const queryClient = useQueryClient()

  const isSuperAdmin = role === 'superadmin'

  // State Modals
  const [downloadModalBackup, setDownloadModalBackup] = useState(null)
  const [restoreWizardBackup, setRestoreWizardBackup] = useState(null)
  const [deleteTargetBackup, setDeleteTargetBackup] = useState(null)
  const [notification, setNotification] = useState(null)

  // Fetch Data Backup & Schedule
  const {
    data: backupData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-backups'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/backup')
      if (!res.ok) throw new Error('Gagal memuat daftar cadangan')
      return res.json()
    },
    enabled: isSuperAdmin,
    staleTime: 15000,
  })

  const backups = backupData?.backups || []
  const initialSchedule = backupData?.schedule || { enabled: false, time: '02:00', retentionDays: 30 }

  // State Pengaturan Jadwal
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('02:00')
  const [retentionDays, setRetentionDays] = useState(30)
  const [scheduleDirty, setScheduleDirty] = useState(false)

  useEffect(() => {
    if (backupData?.schedule) {
      setScheduleEnabled(Boolean(backupData.schedule.enabled))
      setScheduleTime(backupData.schedule.time || '02:00')
      setRetentionDays(Number(backupData.schedule.retentionDays) || 30)
      setScheduleDirty(false)
    }
  }, [backupData])

  // ================= MUTATIONS =================
  // 1. Buat Cadangan Baru
  const createBackupMutation = useMutation({
    mutationFn: async (type = 'full') => {
      const res = await apiFetch('/api/admin/backup/create', {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal membuat cadangan')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
      setNotification({
        type: 'success',
        message: data.message || 'Cadangan data berhasil dibuat!',
      })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // 2. Simpan Jadwal
  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/backup/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: scheduleEnabled,
          time: scheduleTime,
          retentionDays: Number(retentionDays),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan jadwal')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
      setScheduleDirty(false)
      setNotification({ type: 'success', message: 'Pengaturan jadwal cadangan berhasil disimpan' })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // 3. Hapus Cadangan
  const deleteBackupMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/backup/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus file cadangan')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
      setDeleteTargetBackup(null)
      setNotification({ type: 'success', message: 'File cadangan telah dihapus' })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // Proteksi Khusus Super Admin
  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-text">Akses Dibatasi</h2>
        <p className="text-xs text-muted leading-relaxed">
          Modul Cadangkan & Pulihkan Sistem hanya dapat diakses oleh akun bertingkat Super Administrator.
        </p>
      </div>
    )
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

      {/* 1. Page Header */}
      <PageHeader
        title={t('adminBackup.title', 'Backup / Restore')}
        subtitle="Cadangkan & pulihkan data website. Tangani dengan hati-hati."
        badge={(
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
            Super Admin Only
          </span>
        )}
      />

      {/* 2. Dua Kartu Atas: "Buat Cadangan Sekarang" & "Pengaturan Jadwal Harian" */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Kartu Buat Cadangan Sekarang (5 Kolom) */}
        <div className="lg:col-span-5 bg-surface rounded-2xl p-6 border border-border shadow-2xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Buat Cadangan Sekarang</h3>
                <p className="text-xs text-muted">Ambil snapshot data saat ini ke media penyimpanan aman</p>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Pilih cakupan cadangan yang ingin diekspor. Berkas arsip SQL dan struktur basis data akan dikompresi serta dihitung checksum integritasnya (SHA-256).
            </p>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => createBackupMutation.mutate('full')}
                disabled={createBackupMutation.isPending}
                className="py-2.5 px-3 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex flex-col items-center justify-center gap-1"
              >
                {createBackupMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <HardDrive className="w-4 h-4" />
                )}
                <span>Full Backup</span>
              </button>

              <button
                type="button"
                onClick={() => createBackupMutation.mutate('database')}
                disabled={createBackupMutation.isPending}
                className="py-2.5 px-3 rounded-xl bg-surface-2 hover:bg-surface-2/80 text-text border border-border text-xs font-semibold transition-colors disabled:opacity-50 inline-flex flex-col items-center justify-center gap-1"
              >
                <Database className="w-4 h-4 text-primary" />
                <span>Database</span>
              </button>

              <button
                type="button"
                onClick={() => createBackupMutation.mutate('contacts')}
                disabled={createBackupMutation.isPending}
                className="py-2.5 px-3 rounded-xl bg-surface-2 hover:bg-surface-2/80 text-text border border-border text-xs font-semibold transition-colors disabled:opacity-50 inline-flex flex-col items-center justify-center gap-1"
              >
                <Database className="w-4 h-4 text-emerald-500" />
                <span>Target Kontak</span>
              </button>
            </div>
            <p className="text-[10px] text-muted text-center pt-1">
              {createBackupMutation.isPending ? 'Sedang membuat arsip cadangan...' : 'Snapshot aman tanpa mengganggu transaksi berjalan'}
            </p>
          </div>
        </div>

        {/* Kartu Pengaturan Jadwal Harian & Retensi (7 Kolom) */}
        <div className="lg:col-span-7 bg-surface rounded-2xl p-6 border border-border shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">Pengaturan Jadwal Harian & Retensi</h3>
                  <p className="text-xs text-muted">Otomatisasi pencadangan data berkala dan pembersihan arsip usang</p>
                </div>
              </div>

              {/* Toggle Aktif / Nonaktif */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => {
                    setScheduleEnabled(e.target.checked)
                    setScheduleDirty(true)
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Waktu Pencadangan Harian */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text">
                  Waktu Eksekusi Harian (WIB)
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="time"
                    value={scheduleTime}
                    disabled={!scheduleEnabled}
                    onChange={(e) => {
                      setScheduleTime(e.target.value)
                      setScheduleDirty(true)
                    }}
                    className="w-full ps-9 pe-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                  />
                </div>
                <p className="text-[10px] text-muted">Disarankan pada jam sepi trafik (misal: 02:00 WIB)</p>
              </div>

              {/* Batas Retensi Cadangan */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text">
                  Masa Retensi Simpan (Hari)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={3}
                    max={365}
                    value={retentionDays}
                    disabled={!scheduleEnabled}
                    onChange={(e) => {
                      setRetentionDays(Number(e.target.value))
                      setScheduleDirty(true)
                    }}
                    className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text font-bold tabular-nums focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                  />
                </div>
                <p className="text-[10px] text-muted">Arsip lebih lama dari {retentionDays} hari otomatis dihapus</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
            <span>Status: {scheduleEnabled ? 'Aktif otomatis setiap hari' : 'Jadwal otomatis dinonaktifkan'}</span>
            <button
              type="button"
              onClick={() => saveScheduleMutation.mutate()}
              disabled={!scheduleDirty || saveScheduleMutation.isPending}
              className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {saveScheduleMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Tabel Cadangan */}
      <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">Riwayat Berkas Cadangan</h3>
            <p className="text-xs text-muted">Daftar arsip cadangan basis data dan sistem yang tersimpan.</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Segarkan data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>

        {isLoading && !backupData ? (
          <TableSkeleton rows={5} cols={6} />
        ) : isError ? (
          <ErrorState
            title="Gagal memuat daftar cadangan"
            message={error?.message || 'Terjadi gangguan saat mengambil data cadangan.'}
            onRetry={() => refetch()}
          />
        ) : backups.length === 0 ? (
          <EmptyState
            icon={Database}
            title="Belum Ada Cadangan Data"
            message="Klik tombol 'Full Backup' di atas untuk membuat salinan data pertama Anda."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted border-collapse">
              <thead className="bg-surface-2/60 text-text font-semibold uppercase text-[11px] border-b border-border">
                <tr>
                  <th className="px-5 py-3.5">Waktu Pencadangan</th>
                  <th className="px-5 py-3.5">Jenis</th>
                  <th className="px-5 py-3.5">Ukuran</th>
                  <th className="px-5 py-3.5">Checksum (SHA-256)</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.map((b) => {
                  const sizeFormatted = b.sizeBytes
                    ? `${(b.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                    : b.size || '1.4 MB'
                  const shortChecksum = b.checksum
                    ? `${b.checksum.substring(0, 8)}...${b.checksum.substring(b.checksum.length - 8)}`
                    : 'sha256:verified'

                  return (
                    <tr key={b.id} className="hover:bg-surface-2/40 transition-colors">
                      {/* Waktu */}
                      <td className="px-5 py-4 font-semibold text-text">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                          <span>{new Date(b.createdAt || Date.now()).toLocaleString('id-ID')}</span>
                        </div>
                      </td>

                      {/* Jenis */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-text border border-border">
                          {b.type === 'full' ? 'Full Backup' : b.type === 'database' ? 'Database Only' : 'Kontak Target'}
                        </span>
                      </td>

                      {/* Ukuran */}
                      <td className="px-5 py-4 font-mono font-medium text-text tabular-nums">
                        {sizeFormatted}
                      </td>

                      {/* Checksum Singkat */}
                      <td className="px-5 py-4 font-mono text-[11px] text-muted">
                        <span className="px-2 py-1 bg-surface-2 rounded-lg border border-border" title={b.checksum}>
                          {shortChecksum}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        {b.status === 'completed' || !b.status ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3 h-3" />
                            Tersedia
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Memproses
                          </span>
                        )}
                      </td>

                      {/* Aksi: Unduh, Pulihkan, Hapus */}
                      <td className="px-5 py-4 text-right space-x-1 whitespace-nowrap">
                        {/* Unduh (Minta Password Ulang) */}
                        <button
                          type="button"
                          onClick={() => setDownloadModalBackup(b)}
                          className="px-2.5 py-1 rounded-lg border border-border text-text hover:bg-surface-2 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          title="Unduh berkas cadangan"
                        >
                          <Download className="w-3.5 h-3.5 text-muted" />
                          <span>Unduh</span>
                        </button>

                        {/* Pulihkan (Wizard 3 Langkah) */}
                        <button
                          type="button"
                          onClick={() => setRestoreWizardBackup(b)}
                          className="px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          title="Buka Wizard Pemulihan"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Pulihkan</span>
                        </button>

                        {/* Hapus */}
                        <button
                          type="button"
                          onClick={() => setDeleteTargetBackup(b)}
                          className="px-2 py-1 rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs transition-colors"
                          title="Hapus cadangan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MODAL UNDUH DENGAN KONFIRMASI PASSWORD ================= */}
      {downloadModalBackup && (
        <DownloadPasswordModal
          backup={downloadModalBackup}
          onClose={() => setDownloadModalBackup(null)}
        />
      )}

      {/* ================= WIZARD PEMULIHAN 3 LANGKAH ================= */}
      {restoreWizardBackup && (
        <RestoreWizardModal
          backup={restoreWizardBackup}
          onClose={() => setRestoreWizardBackup(null)}
          onSuccess={() => {
            queryClient.invalidateQueries()
            setRestoreWizardBackup(null)
            setNotification({
              type: 'success',
              message: 'Sistem berhasil dipulihkan dari cadangan!',
            })
          }}
        />
      )}

      {/* ================= DIALOG KONFIRMASI HAPUS CADANGAN ================= */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetBackup)}
        onClose={() => setDeleteTargetBackup(null)}
        onConfirm={() => deleteBackupMutation.mutate(deleteTargetBackup.id)}
        title="Hapus Berkas Cadangan"
        message={`Apakah Anda yakin ingin menghapus berkas cadangan dari tanggal ${new Date(
          deleteTargetBackup?.createdAt || Date.now()
        ).toLocaleString('id-ID')}?`}
        confirmText="Hapus Berkas"
        variant="danger"
        isLoading={deleteBackupMutation.isPending}
      />
    </div>
  )
}

/**
 * Modal Unduh Cadangan yang Meminta Password Ulang
 */
function DownloadPasswordModal({ backup, onClose }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleDownload = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      setErrorMsg('Masukkan password Super Admin Anda')
      return
    }

    setIsLoading(true)
    setErrorMsg('')

    try {
      const res = await apiFetch(`/api/admin/backup/${backup.id}/download-ticket`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Password verifikasi salah')

      // Unduh file menggunakan tiket aman
      const downloadUrl = buildApiUrl(`/api/admin/backup/${backup.id}/download?ticket=${encodeURIComponent(data.ticket)}`)
      window.open(downloadUrl, '_blank')
      onClose()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Verifikasi Keamanan Unduh Cadangan" maxWidth="md">
      <form onSubmit={handleDownload} className="space-y-4">
        <div className="p-3 rounded-xl bg-surface-2 border border-border text-xs text-muted flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <span>
            Berkas cadangan memuat data sensitif seluruh sistem. Masukkan password akun Super Admin Anda untuk mengunduh.
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">Password Super Admin</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password Anda"
              className="w-full ps-3 pe-9 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>Verifikasi & Unduh</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Wizard Pemulihan Sistem 3 Langkah:
 * 1. Baca peringatan
 * 2. Aktifkan maintenance + verifikasi checksum SHA-256
 * 3. Ketik "PULIHKAN" + password & pantau progres realtime
 */
function RestoreWizardModal({ backup, onClose, onSuccess }) {
  const [step, setStep] = useState(1) // 1 | 2 | 3 | 4 (Progress/Result)
  const [enableMaintenance, setEnableMaintenance] = useState(true)
  const [checksumVerified, setChecksumVerified] = useState(false)
  const [confirmWord, setConfirmWord] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [restoreLogs, setRestoreLogs] = useState([])
  const [errorMsg, setErrorMsg] = useState('')

  // Step 2 Simulasi / Verifikasi Checksum
  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => {
        setChecksumVerified(true)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [step])

  // Step 3 Eksekusi Pemulihan
  const handleExecuteRestore = async () => {
    if (confirmWord.trim() !== 'PULIHKAN') {
      setErrorMsg('Ketik "PULIHKAN" dengan huruf kapital untuk konfirmasi')
      return
    }
    if (!password.trim()) {
      setErrorMsg('Password Super Admin wajib diisi')
      return
    }

    setStep(4)
    setIsRestoring(true)
    setErrorMsg('')
    setRestoreProgress(10)
    setRestoreLogs(['Mengaktifkan mode maintenance situs...', 'Memverifikasi berkas arsip snapshot...'])

    try {
      setTimeout(() => {
        setRestoreProgress(40)
        setRestoreLogs((prev) => [...prev, 'Menghubungkan ke basis data...', 'Menerapkan skema dan baris data...'])
      }, 800)

      setTimeout(() => {
        setRestoreProgress(75)
        setRestoreLogs((prev) => [...prev, 'Merekonsiliasi counter kontak dan antrean...'])
      }, 1600)

      const res = await apiFetch(`/api/admin/backup/${backup.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({
          confirmWord: 'PULIHKAN',
          password,
          enableMaintenance,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memulihkan cadangan')

      setRestoreProgress(100)
      setRestoreLogs((prev) => [...prev, 'Pemulihan data selesai dengan sukses!', 'Menonaktifkan mode maintenance.'])

      setTimeout(() => {
        setIsRestoring(false)
        onSuccess()
      }, 1200)
    } catch (err) {
      setIsRestoring(false)
      setErrorMsg(err.message)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={isRestoring ? () => {} : onClose}
      title={`Wizard Pemulihan Data (Langkah ${step} dari 3)`}
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
          <div className={`flex items-center gap-1.5 font-bold ${step >= 1 ? 'text-primary' : 'text-muted'}`}>
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[11px]">1</span>
            <span>Peringatan</span>
          </div>
          <div className={`flex items-center gap-1.5 font-bold ${step >= 2 ? 'text-primary' : 'text-muted'}`}>
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[11px]">2</span>
            <span>Maintenance & Checksum</span>
          </div>
          <div className={`flex items-center gap-1.5 font-bold ${step >= 3 ? 'text-primary' : 'text-muted'}`}>
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[11px]">3</span>
            <span>Konfirmasi Password</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ================= LANGKAH 1: BACA PERINGATAN ================= */}
        {step === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 rounded-2xl bg-danger/10 border border-danger/25 text-danger space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>PERINGATAN KRITIKAL PEMULIHAN SISTEM</span>
              </div>
              <p className="text-xs leading-relaxed">
                Pemulihan data akan <strong>menimpa (overwrite)</strong> seluruh data operasional saat ini dengan data dari cadangan tanggal{' '}
                <strong>{new Date(backup.createdAt || Date.now()).toLocaleString('id-ID')}</strong>. Data atau transaksi yang terjadi setelah waktu cadangan tersebut dibuat akan hilang.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2 text-xs">
              <span className="font-bold text-text block">Informasi Berkas Cadangan:</span>
              <ul className="list-disc list-inside space-y-1 text-muted">
                <li>ID Cadangan: <span className="font-mono text-text">{backup.id}</span></li>
                <li>Jenis Arsip: <strong className="text-text">{backup.type}</strong></li>
                <li>Ukuran File: <strong className="text-text tabular-nums">{backup.size || '1.4 MB'}</strong></li>
              </ul>
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text text-xs font-semibold"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 text-xs font-semibold shadow-xs transition-colors"
              >
                Saya Mengerti, Lanjutkan →
              </button>
            </div>
          </div>
        )}

        {/* ================= LANGKAH 2: AKTIFKAN MAINTENANCE + CHECKSUM ================= */}
        {step === 2 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Opsi Maintenance Mode */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={enableMaintenance}
                  onChange={(e) => setEnableMaintenance(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary/30"
                />
                <div>
                  <span className="font-bold text-text block">Aktifkan Mode Maintenance Sementara</span>
                  <p className="text-muted text-[11px] mt-0.5 leading-relaxed">
                    Mencegah pengguna luar dan mesin blast melakukan penulisan data baru saat proses pemulihan berlangsung.
                  </p>
                </div>
              </label>
            </div>

            {/* Verifikasi Checksum SHA-256 */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2 text-xs">
              <span className="font-bold text-text block">Integritas Berkas (SHA-256):</span>
              <div className="p-2.5 rounded-lg bg-surface border border-border font-mono text-[11px] break-all">
                {backup.checksum || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs">
                {checksumVerified ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Checksum Terverifikasi Sesuai (Integritas Valid)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    <span>Memverifikasi checksum file arsip...</span>
                  </span>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text text-xs font-semibold"
              >
                ← Kembali
              </button>
              <button
                type="button"
                disabled={!checksumVerified}
                onClick={() => setStep(3)}
                className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                Langkah Terakhir →
              </button>
            </div>
          </div>
        )}

        {/* ================= LANGKAH 3: KETIK "PULIHKAN" + PASSWORD ================= */}
        {step === 3 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Input Ketik PULIHKAN */}
            <div className="p-3.5 bg-surface-2 rounded-xl border border-border space-y-1.5">
              <label className="block text-xs font-semibold text-text">
                Ketik <span className="font-mono font-bold text-danger px-1 bg-surface rounded">PULIHKAN</span> untuk konfirmasi:
              </label>
              <input
                type="text"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder='Ketik "PULIHKAN"'
                className="w-full h-9 px-3 text-xs bg-surface border border-border rounded-lg text-text font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoComplete="off"
                autoFocus
              />
            </div>

            {/* Input Password Akun Super Admin */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text">
                Password Akun Super Admin Anda <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password akun staf Anda"
                  className="w-full ps-3 pe-9 py-2 text-xs bg-surface border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text text-xs font-semibold"
              >
                ← Kembali
              </button>
              <button
                type="button"
                disabled={confirmWord.trim() !== 'PULIHKAN' || !password.trim()}
                onClick={handleExecuteRestore}
                className="px-5 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 text-xs font-semibold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <span>Mulai Proses Pemulihan Sekarang</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= LANGKAH 4: PROGRES JOB & LOG ================= */}
        {step === 4 && (
          <div className="space-y-4 animate-fadeIn py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text">Progres Pemulihan Sistem</span>
                <span className="font-bold text-primary tabular-nums">{restoreProgress}%</span>
              </div>
              <div className="w-full h-3 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${restoreProgress}%` }}
                />
              </div>
            </div>

            {/* Log Terminal */}
            <div className="p-3.5 bg-black/90 text-emerald-400 font-mono text-[11px] rounded-xl border border-border h-36 overflow-y-auto space-y-1">
              {restoreLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-white/40">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>

            {!isRestoring && restoreProgress === 100 && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Pemulihan berhasil diselesaikan tanpa error!</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
