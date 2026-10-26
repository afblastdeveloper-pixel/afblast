import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eye, EyeOff, CheckCircle2, RefreshCw, Save, Zap
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Toast from '../../components/ui/Toast'
import { ADMIN_API_CONFIG } from '../../data/admin/integration'

export default function AdminIntegrationPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState(ADMIN_API_CONFIG)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  const handleTestConnection = () => {
    setTesting(true)
    setTestResult(null)

    setTimeout(() => {
      setTesting(false)
      setTestResult({
        success: true,
        latency: 142,
        message: 'Koneksi Berhasil! Endpoint watsap.id merespons kode 200 OK.',
      })
      setToastMsg('Tes koneksi gateway watsap.id berhasil!')
    }, 1200)
  }

  const handleSave = (e) => {
    e.preventDefault()
    setToastMsg('Konfigurasi integrasi API watsap.id berhasil disimpan!')
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

      {/* Header */}
      <PageHeader
        title={t('adminIntegration.title') || 'Integrasi API & Gateway'}
        subtitle={t('adminIntegration.subtitle') || 'Konfigurasi kredensial koneksi official gateway WhatsApp (watsap.id) dan endpoint webhook sistem.'}
      />

      {/* Status Card Gateway */}
      <div className="bg-surface rounded-2xl border border-border p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary-text flex-shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">
                Official Gateway watsap.id
              </h2>
              <Badge variant="success" dot={true} size="sm">
                Terhubung
              </Badge>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Multi-Device Cluster • Ping terakhir: {config.lastPingTime}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          <span>{testing ? t('adminIntegration.testing') : t('adminIntegration.testConnection')}</span>
        </button>
      </div>

      {/* Hasil Uji Koneksi */}
      {testResult && (
        <div className="p-4 bg-success/10 rounded-2xl border border-success/20 animate-[fadeIn_0.15s_ease-out] flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
          <div className="text-xs text-text">
            <p className="font-bold">{testResult.message}</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Round-trip Latency: {testResult.latency}ms • HTTP Status 200 • Gateway Health 100%
            </p>
          </div>
        </div>
      )}

      {/* Form Konfigurasi API */}
      <form onSubmit={handleSave} className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-5">
        <div>
          <label className="block text-xs font-semibold text-text mb-1">
            {t('adminIntegration.baseUrl')}
          </label>
          <input
            type="url"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            className="w-full h-10 px-3.5 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1">
            {t('adminIntegration.apiKey')}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              className="w-full h-10 ps-3.5 pe-10 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1"
              title={showKey ? t('adminIntegration.hideKey') : t('adminIntegration.showKey')}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1">
            {t('adminIntegration.webhookUrl')}
          </label>
          <input
            type="url"
            value={config.webhookUrl}
            onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
            className="w-full h-10 px-3.5 text-sm bg-surface-2 border border-border rounded-xl font-mono text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        {/* Node Status */}
        <div className="pt-2">
          <p className="text-xs font-semibold text-text mb-2">
            Status Kluster Gateway Nodes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {config.nodesAvailable.map((node, i) => (
              <div key={i} className="p-3 bg-surface-2 rounded-xl border border-border text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-text truncate">
                    {node.name}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-success" />
                </div>
                <p className="text-[11px] text-muted font-mono">
                  Latency: {node.latency}ms
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <button
            type="submit"
            className="inline-flex items-center gap-2 h-10 px-6 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{t('adminIntegration.saveConfig') || 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
