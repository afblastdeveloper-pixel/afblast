import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Edit2, Send, Smartphone, Percent, Check
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'
import Can from '../../components/common/Can'
import { ADMIN_PACKAGES } from '../../data/admin/packages'

export default function AdminPackagesPage() {
  const { t, i18n } = useTranslation()
  const [packages, setPackages] = useState(ADMIN_PACKAGES)
  const [editModal, setEditModal] = useState({
    isOpen: false,
    item: null,
  })
  const [toastMsg, setToastMsg] = useState(null)

  const formatRupiah = (val) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val)

  const formatNumber = (val) =>
    new Intl.NumberFormat(i18n.language).format(val)

  const handleOpenEdit = (pkg) => {
    setEditModal({
      isOpen: true,
      item: { ...pkg },
    })
  }

  const handleSavePackage = (e) => {
    e.preventDefault()
    setPackages((prev) =>
      prev.map((p) => (p.id === editModal.item.id ? editModal.item : p))
    )
    setToastMsg(`Paket ${editModal.item.name} berhasil diperbarui!`)
    setEditModal({ isOpen: false, item: null })
  }

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
        title={t('adminPackages.title')}
        subtitle={t('adminPackages.subtitle')}
        badge="Paket Layanan"
      />

      {/* Grid Kartu Paket Editable */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="bg-surface rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between overflow-hidden group"
          >
            <div>
              {/* Card Header */}
              <div className="p-6 border-b border-border bg-surface-2/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-lg text-text">{pkg.name}</span>
                  <Badge variant="success" size="sm">
                    {pkg.commissionPercent}% Referral
                  </Badge>
                </div>
                <p className="text-xs text-muted font-medium">{pkg.badge}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-text tracking-tight">
                    {formatRupiah(pkg.price)}
                  </span>
                  <span className="text-xs text-muted">/{pkg.period}</span>
                </div>
              </div>

              {/* Metrics Highlights */}
              <div className="p-5 space-y-3 bg-surface-2 border-b border-border text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-primary-text" />
                    <span>Kuota Pesan:</span>
                  </span>
                  <span className="font-bold text-text">
                    {formatNumber(pkg.messageQuota)} /bln
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-accent" />
                    <span>Maksimal Device:</span>
                  </span>
                  <span className="font-bold text-text">
                    {pkg.maxDevices} WhatsApp Device
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-warning" />
                    <span>Komisi Affiliate:</span>
                  </span>
                  <span className="font-bold text-success">
                    {pkg.commissionPercent}%
                  </span>
                </div>
              </div>

              {/* Features List */}
              <div className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
                  Fitur Unggulan
                </p>
                <ul className="space-y-2 text-xs text-text" role="list">
                  {pkg.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer Button Edit - Hanya untuk role dengan izin plan.manage (Superadmin & Dev) */}
            <Can permission="plan.manage">
              <div className="p-4 bg-surface-2/40 border-t border-border">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(pkg)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-surface hover:bg-surface-2 text-text border border-border rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted" />
                  <span>{t('adminPackages.editPackage')}</span>
                </button>
              </div>
            </Can>
          </div>
        ))}
      </div>

      {/* Modal Edit Paket */}
      {editModal.isOpen && editModal.item && (
        <Modal
          isOpen={true}
          onClose={() => setEditModal({ isOpen: false, item: null })}
          title={`Edit Paket ${editModal.item.name}`}
          subtitle="Perubahan harga dan kuota akan otomatis diterapkan pada pelanggan baru."
          maxWidth="md"
        >
          <form onSubmit={handleSavePackage} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Nama Paket
              </label>
              <input
                type="text"
                value={editModal.item.name}
                onChange={(e) =>
                  setEditModal({
                    ...editModal,
                    item: { ...editModal.item, name: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Harga Langganan (Rp)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={editModal.item.price}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      item: { ...editModal.item, price: Number(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Kuota Pesan Bulanan
                </label>
                <input
                  type="number"
                  step="1000"
                  value={editModal.item.messageQuota}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      item: {
                        ...editModal.item,
                        messageQuota: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Persen Komisi Referral (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editModal.item.commissionPercent}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      item: {
                        ...editModal.item,
                        commissionPercent: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Maksimal Device WhatsApp
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editModal.item.maxDevices}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      item: {
                        ...editModal.item,
                        maxDevices: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditModal({ isOpen: false, item: null })}
                className="px-4 py-2 border border-border text-muted rounded-xl text-sm font-semibold hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
              >
                {t('adminPackages.savePackage')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
