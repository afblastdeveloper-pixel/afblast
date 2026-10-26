import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Database, Check } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'

export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)

  const handleSave = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      {/* Header Panel with PageHeader */}
      <PageHeader
        title={t('adminSettings.title')}
        subtitle={t('adminSettings.subtitle')}
        badge="Sistem"
      />

      <form onSubmit={handleSave} className="bg-surface rounded-2xl border border-border shadow-xs p-6 space-y-6 max-w-4xl">
        <div className="border-b border-border pb-5">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-text" />
            <span>{t('adminSettings.security')}</span>
          </h2>
          <p className="text-xs text-muted mt-1">Kebijakan autentikasi dan sesi gateway.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Maksimal Sesi Login</label>
              <input
                type="number"
                defaultValue={3}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Durasi Token (Jam)</label>
              <input
                type="number"
                defaultValue={24}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="border-b border-border pb-5">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Database className="w-4 h-4 text-accent" />
            <span>Kapasitas & Kuota Pesan Global</span>
          </h2>
          <p className="text-xs text-muted mt-1">Batas throughput pesan blast per menit.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Rate Limit (Pesan / Menit / Node)</label>
              <input
                type="number"
                defaultValue={120}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Timeout Koneksi Node (Detik)</label>
              <input
                type="number"
                defaultValue={30}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-success font-semibold">
              <Check className="w-4 h-4" />
              {t('adminSettings.saved')}
            </span>
          ) : <div />}

          <button
            type="submit"
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
          >
            {t('adminSettings.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  )
}
