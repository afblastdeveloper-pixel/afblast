import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'

export default function AdminDevicesPage() {
  const dummyDevices = [
    {
      id: 'DEV-01',
      user: 'Budi Pratama (USR-001)',
      number: '+62 812-3456-7890',
      deviceType: 'WhatsApp Business (Android)',
      status: 'connected',
      battery: '88%',
      lastSync: '1 menit yang lalu',
    },
    {
      id: 'DEV-02',
      user: 'Andi Wijaya (USR-003)',
      number: '+62 821-4455-6677',
      deviceType: 'WhatsApp Multi-Device (iOS)',
      status: 'connected',
      battery: '94%',
      lastSync: '3 menit yang lalu',
    },
    {
      id: 'DEV-03',
      user: 'Siti Rahma (USR-002)',
      number: '+62 813-8899-7711',
      deviceType: 'WhatsApp Web Multi-Device',
      status: 'disconnected',
      battery: 'N/A',
      lastSync: '2 jam yang lalu',
    },
    {
      id: 'DEV-04',
      user: 'Ahmad Fauzi (USR-005)',
      number: '+62 878-9900-1122',
      deviceType: 'WhatsApp Business (Android)',
      status: 'connected',
      battery: '62%',
      lastSync: 'Baru saja',
    },
  ]

  const columns = [
    {
      key: 'number',
      label: 'Nomor & Device',
      sortable: true,
      render: (_, row) => (
        <div>
          <span className="font-bold text-text text-sm font-mono">{row.number}</span>
          <p className="text-xs text-muted mt-0.5">{row.deviceType}</p>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'Pemilik Akun',
      sortable: true,
      render: (u) => <span className="font-semibold text-text text-xs">{u}</span>,
    },
    {
      key: 'battery',
      label: 'Baterai',
      render: (b) => <span className="font-mono text-xs text-muted">{b}</span>,
    },
    {
      key: 'status',
      label: 'Status Sesi',
      sortable: true,
      render: (status) => (
        <Badge
          variant={status === 'connected' ? 'success' : 'danger'}
          dot={true}
          size="sm"
        >
          {status === 'connected' ? 'Terhubung' : 'Terputus'}
        </Badge>
      ),
    },
    {
      key: 'lastSync',
      label: 'Sinkronisasi',
      render: (ls) => <span className="text-xs text-muted">{ls}</span>,
    },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Mesin Member"
        subtitle="Status sesi multi-device WhatsApp yang terhubung ke gateway sistem."
      />

      <DataTable
        columns={columns}
        data={dummyDevices}
        searchPlaceholder="Cari nomor atau pemilik akun..."
        pageSize={6}
      />
    </div>
  )
}
