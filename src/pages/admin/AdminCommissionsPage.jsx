import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'
import {
  ADMIN_COMMISSION_CONFIG,
  ADMIN_REFERRAL_EARNINGS
} from '../../data/admin/commissions'

export default function AdminCommissionsPage() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState(ADMIN_COMMISSION_CONFIG)
  const [earnings] = useState(ADMIN_REFERRAL_EARNINGS)
  const [toastMsg, setToastMsg] = useState(null)

  const formatRupiah = (val) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val)

  const handleSaveConfig = (e) => {
    e.preventDefault()
    setToastMsg('Pengaturan komisi & referral berhasil disimpan!')
  }

  // Kolom Tabel Transaksi Referral
  const columns = [
    {
      key: 'id',
      label: 'ID & Tanggal',
      sortable: true,
      render: (_, row) => (
        <div>
          <span className="font-bold text-xs font-mono text-text">{row.id}</span>
          <p className="text-[11px] text-muted font-mono mt-0.5">{row.date}</p>
        </div>
      ),
    },
    {
      key: 'affiliateName',
      label: 'Affiliate & Kode',
      sortable: true,
      render: (_, row) => (
        <div>
          <p className="font-semibold text-text">{row.affiliateName}</p>
          <Badge variant="info" size="sm" className="mt-0.5">
            {row.referralCode}
          </Badge>
        </div>
      ),
    },
    {
      key: 'buyerName',
      label: 'Pembeli & Paket',
      sortable: true,
      render: (_, row) => (
        <div>
          <p className="font-medium text-text">{row.buyerName}</p>
          <p className="text-xs text-muted">
            {row.packageName} • {formatRupiah(row.packagePrice)}
          </p>
        </div>
      ),
    },
    {
      key: 'commissionAmount',
      label: 'Komisi Didapat',
      sortable: true,
      render: (amt, row) => (
        <div>
          <span className="font-bold text-success tabular-nums">
            {formatRupiah(amt)}
          </span>
          <span className="text-[10px] text-muted block font-mono">
            Rate: {row.ratePercent}%
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (status) => (
        <Badge
          variant={status === 'paid' ? 'success' : 'warning'}
          dot={true}
          size="sm"
        >
          {status === 'paid' ? 'Dibayarkan' : 'Pending'}
        </Badge>
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
        title={t('adminCommissions.title')}
        subtitle={t('adminCommissions.subtitle')}
        badge="Komisi"
      />

      {/* Form Konfigurasi Komisi Global */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text">
              {t('adminCommissions.configTitle')}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Aturan komisi standar bagi affiliate yang membagikan tautan referral
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{t('adminCommissions.saveConfig')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              {t('adminCommissions.defaultRate')}
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                value={config.defaultCommissionRate}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    defaultCommissionRate: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted font-bold">
                %
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              {t('adminCommissions.minWithdrawal')}
            </label>
            <input
              type="number"
              step="10000"
              value={config.minWithdrawalAmount}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minWithdrawalAmount: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              {t('adminCommissions.cookieDuration')}
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={config.cookieDurationDays}
              onChange={(e) =>
                setConfig({
                  ...config,
                  cookieDurationDays: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>
        </div>
      </form>

      {/* Tabel Riwayat Transaksi Referral */}
      <div>
        <h2 className="text-base font-bold text-text mb-3">
          {t('adminCommissions.earningsHistory')}
        </h2>
        <DataTable
          columns={columns}
          data={earnings}
          searchPlaceholder="Cari affiliate, kode referral, atau nama pembeli..."
          pageSize={6}
        />
      </div>
    </div>
  )
}
