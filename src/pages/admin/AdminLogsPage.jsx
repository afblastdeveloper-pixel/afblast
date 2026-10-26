import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import { ADMIN_ACTIVITY_LOGS } from '../../data/admin/logs'

export default function AdminLogsPage() {
  const { t } = useTranslation()
  const [logs] = useState(ADMIN_ACTIVITY_LOGS)
  const [filterAction, setFilterAction] = useState('')

  const filteredLogs = useMemo(() => {
    if (!filterAction) return logs
    return logs.filter((l) => l.action === filterAction)
  }, [logs, filterAction])

  const actionTypes = [
    { value: '', label: 'Semua Tindakan' },
    { value: 'APPROVAL_WITHDRAWAL', label: 'Persetujuan Penarikan' },
    { value: 'REJECT_WITHDRAWAL', label: 'Penolakan Penarikan' },
    { value: 'UPDATE_SETTINGS', label: 'Perubahan Pengaturan' },
    { value: 'TEST_API_CONNECTION', label: 'Uji Koneksi Gateway' },
    { value: 'CREATE_ANNOUNCEMENT', label: 'Buat Pengumuman' },
    { value: 'SUSPEND_USER', label: 'Tangguhkan Pengguna' },
    { value: 'LOGIN', label: 'Login Administrator' },
  ]

  const columns = [
    {
      key: 'timestamp',
      label: 'Waktu',
      sortable: true,
      render: (ts) => (
        <span className="font-mono text-xs text-muted whitespace-nowrap">
          {ts}
        </span>
      ),
    },
    {
      key: 'adminName',
      label: 'Administrator',
      sortable: true,
      render: (name) => (
        <span className="font-semibold text-text text-xs">{name}</span>
      ),
    },
    {
      key: 'action',
      label: 'Tindakan',
      sortable: true,
      render: (act) => (
        <Badge variant="info" size="sm">
          {act}
        </Badge>
      ),
    },
    {
      key: 'target',
      label: 'Target',
      sortable: true,
      render: (target) => (
        <span className="font-medium text-xs text-text">{target}</span>
      ),
    },
    {
      key: 'details',
      label: 'Rincian Aktivitas',
      render: (det) => (
        <p className="text-xs text-muted line-clamp-2 max-w-md">{det}</p>
      ),
    },
    {
      key: 'ipAddress',
      label: 'Alamat IP',
      sortable: true,
      render: (ip) => (
        <span className="font-mono text-xs text-muted">{ip}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (status) => (
        <Badge
          variant={status === 'success' ? 'success' : 'warning'}
          dot={true}
          size="sm"
        >
          {status === 'success' ? 'Berhasil' : 'Peringatan'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title={t('adminLogs.title') || 'Log Aktivitas & Monitor'}
        subtitle={t('adminLogs.subtitle') || 'Audit menyeluruh rekaman aksi dan operasi sistem oleh administrator platform.'}
      />

      <DataTable
        columns={columns}
        data={filteredLogs}
        searchPlaceholder="Cari tindakan, nama admin, target, atau IP..."
        pageSize={8}
        filters={(
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="h-10 px-3.5 text-xs sm:text-sm bg-surface-2 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text"
          >
            {actionTypes.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      />
    </div>
  )
}
