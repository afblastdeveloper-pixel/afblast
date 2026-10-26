import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Globe, Shield, Sliders, Save, AlertCircle, Check,
  X, Plus, FileText, Ban, AlertTriangle, RefreshCw
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { apiFetch } from '../../utils/client'

/**
 * AdminWebsiteSettingsPage – Pengaturan Sistem AF Blast (/superadmin/settings)
 * Mencakup:
 * - Identitas & Branding Website
 * - Parameter Pengiriman Pesan (Anti-Banned)
 * - Mode Pemeliharaan
 * - Editor Daftar Kata Terlarang (Content Policy)
 * - Editor Teks Pernyataan Risiko Berversi (Risk Statement Versioning)
 */
export default function AdminWebsiteSettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [notification, setNotification] = useState(null)

  // Local Form State
  const [siteName, setSiteName] = useState('AF Blast')
  const [siteTagline, setSiteTagline] = useState('Platform Blast WhatsApp Cerdas & Berdaya Hasil')
  const [defaultLanguage, setDefaultLanguage] = useState('id')
  const [defaultTimezone, setDefaultTimezone] = useState('Asia/Jakarta')
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(60)
  const [minDelaySeconds, setMinDelaySeconds] = useState(5)
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(15)
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  // Kata Terlarang (Content Policy)
  const [blockedTerms, setBlockedTerms] = useState([])
  const [newTermInput, setNewTermInput] = useState('')

  // Pernyataan Risiko (Risk Statement)
  const [riskStatement, setRiskStatement] = useState('')
  const [riskStatementVersion, setRiskStatementVersion] = useState('1.0')

  // Fetch Settings dari Backend
  const {
    data: settingsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-website-settings'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/settings')
      if (!res.ok) throw new Error('Gagal memuat pengaturan sistem')
      return res.json()
    },
    staleTime: 30000,
  })

  // Sinkronkan data server ke form
  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings
      if (s.siteName) setSiteName(s.siteName)
      if (s.siteTagline) setSiteTagline(s.siteTagline)
      if (s.defaultLanguage) setDefaultLanguage(s.defaultLanguage)
      if (s.defaultTimezone) setDefaultTimezone(s.defaultTimezone)
      if (s.rateLimitPerMinute) setRateLimitPerMinute(Number(s.rateLimitPerMinute))
      if (s.minDelaySeconds) setMinDelaySeconds(Number(s.minDelaySeconds))
      if (s.maxDelaySeconds) setMaxDelaySeconds(Number(s.maxDelaySeconds))
      if (s.maintenanceMode !== undefined) setMaintenanceMode(Boolean(s.maintenanceMode))

      if (Array.isArray(s.blockedTerms)) {
        setBlockedTerms(s.blockedTerms)
      } else if (typeof s.blockedTerms === 'string') {
        try {
          setBlockedTerms(JSON.parse(s.blockedTerms))
        } catch {
          setBlockedTerms(s.blockedTerms.split(',').map((x) => x.trim()).filter(Boolean))
        }
      }

      if (s.riskStatement) setRiskStatement(s.riskStatement)
      if (s.riskStatementVersion) setRiskStatementVersion(s.riskStatementVersion)
    }
  }, [settingsData])

  // Mutation Simpan Pengaturan
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-website-settings'] })
      queryClient.invalidateQueries({ queryKey: ['siteSettings'] })
      setNotification({
        type: 'success',
        message: 'Pengaturan sistem dan kebijakan konten berhasil disimpan!',
      })
    },
    onError: (err) => {
      setNotification({ type: 'error', message: err.message })
    },
  })

  // Tambah Kata Terlarang
  const handleAddTerm = (e) => {
    e.preventDefault()
    const trimmed = newTermInput.trim().toLowerCase()
    if (!trimmed) return
    if (!blockedTerms.includes(trimmed)) {
      setBlockedTerms([...blockedTerms, trimmed])
    }
    setNewTermInput('')
  }

  // Hapus Kata Terlarang
  const handleRemoveTerm = (termToRemove) => {
    setBlockedTerms(blockedTerms.filter((t) => t !== termToRemove))
  }

  // Submit Handler
  const handleSubmit = (e) => {
    e.preventDefault()
    saveMutation.mutate({
      siteName,
      siteTagline,
      defaultLanguage,
      defaultTimezone,
      rateLimitPerMinute: Number(rateLimitPerMinute),
      minDelaySeconds: Number(minDelaySeconds),
      maxDelaySeconds: Number(maxDelaySeconds),
      maintenanceMode,
      blockedTerms,
      riskStatement,
      riskStatementVersion,
    })
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      {/* Alert Notifikasi */}
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

      {/* Header Panel */}
      <PageHeader
        title={t('adminSettings.title', 'Pengaturan Sistem')}
        subtitle={t('adminSettings.subtitle', 'Konfigurasi parameter operasional platform, kebijakan konten anti-spam, dan pernyataan risiko.')}
        badge="Pengaturan"
        actions={(
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl border border-border bg-surface text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Segarkan data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        )}
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* 1. Identitas Website */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-text">
              Identitas & Branding Website
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Nama Platform
              </label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Tagline Platform
              </label>
              <input
                type="text"
                value={siteTagline}
                onChange={(e) => setSiteTagline(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Bahasa Default
              </label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="id">Bahasa Indonesia (ID)</option>
                <option value="en">English (EN)</option>
                <option value="zh">中文 (ZH)</option>
                <option value="ar">العربية (AR)</option>
                <option value="th">ไทย (TH)</option>
                <option value="fil">Filipino (FIL)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Zona Waktu Default
              </label>
              <select
                value={defaultTimezone}
                onChange={(e) => setDefaultTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="Asia/Jakarta">WIB (Asia/Jakarta - UTC+7)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar - UTC+8)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura - UTC+9)</option>
                <option value="UTC">UTC (GMT+0)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Parameter Broadcast Pesan (Anti-Banned) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Sliders className="w-5 h-5 text-accent" />
            <h2 className="text-base font-bold text-text">
              Parameter Pengiriman Pesan (Anti-Banned)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Batas Pesan per Menit
              </label>
              <input
                type="number"
                min="10"
                max="300"
                value={rateLimitPerMinute}
                onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Jeda Minimum (Detik)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={minDelaySeconds}
                onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Jeda Maksimum (Detik)
              </label>
              <input
                type="number"
                min="2"
                max="120"
                value={maxDelaySeconds}
                onChange={(e) => setMaxDelaySeconds(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>
          </div>
        </div>

        {/* 3. Editor Kebijakan Konten (Daftar Kata Terlarang) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Ban className="w-5 h-5 text-rose-500" />
            <div>
              <h2 className="text-base font-bold text-text">
                Kebijakan Konten: Daftar Kata Terlarang
              </h2>
              <p className="text-xs text-muted">
                Pesan kampanye blast atau template yang memuat kata-kata ini akan otomatis ditolak oleh sistem sebelum dikirimkan.
              </p>
            </div>
          </div>

          {/* Form Tambah Kata Terlarang */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTermInput}
              onChange={(e) => setNewTermInput(e.target.value)}
              placeholder="Ketik kata terlarang (contoh: judi, slot, pinjol, crypto bodong)..."
              className="flex-1 px-3 py-2 text-xs bg-surface-2 border border-border rounded-xl text-text placeholder:text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTerm(e)
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddTerm}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/25 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kata</span>
            </button>
          </div>

          {/* Daftar Tag Kata Terlarang */}
          <div className="p-3.5 bg-surface-2/60 rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Total Kata Terdaftar: <strong className="text-text tabular-nums">{blockedTerms.length}</strong></span>
              <span className="text-[11px] italic">Pencocokan bersifat case-insensitive</span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {blockedTerms.map((term, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                >
                  <span>{term}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTerm(term)}
                    className="p-0.5 rounded hover:bg-rose-500/20 text-rose-500"
                    title={`Hapus "${term}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {blockedTerms.length === 0 && (
                <span className="text-xs text-muted italic">Belum ada kata terlarang yang ditambahkan.</span>
              )}
            </div>
          </div>
        </div>

        {/* 4. Editor Teks Pernyataan Risiko Berversi */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <FileText className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-text">
                Pernyataan Risiko Member (Berversi)
              </h2>
              <p className="text-xs text-muted">
                Pernyataan wajib yang harus disetujui oleh member sebelum pertama kali berpartisipasi dalam kampanye blast.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1 sm:col-span-1">
              <label className="block text-xs font-semibold text-text">
                Nomor Versi
              </label>
              <input
                type="text"
                value={riskStatementVersion}
                onChange={(e) => setRiskStatementVersion(e.target.value)}
                placeholder="1.0"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-surface-2 border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
              <p className="text-[10px] text-muted">
                Bila versi diubah (misal dari 1.0 ke 2.0), member wajib menyetujui ulang.
              </p>
            </div>

            <div className="space-y-1 sm:col-span-3">
              <label className="block text-xs font-semibold text-text">
                Isi Dokumen Pernyataan Risiko
              </label>
              <textarea
                rows={5}
                value={riskStatement}
                onChange={(e) => setRiskStatement(e.target.value)}
                placeholder="Tuliskan syarat, ketentuan kepatuhan WhatsApp, dan pernyataan risiko bagi member di sini..."
                className="w-full p-3 text-xs bg-surface-2 border border-border rounded-xl text-text focus:ring-2 focus:ring-primary/20 focus:border-primary leading-relaxed font-sans"
                required
              />
            </div>
          </div>
        </div>

        {/* 5. Mode Maintenance */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Shield className="w-5 h-5 text-warning" />
            <h2 className="text-base font-bold text-text">
              Mode Pemeliharaan & Akses Sistem
            </h2>
          </div>

          <div className="flex items-center justify-between p-4 bg-surface-2 rounded-2xl border border-border">
            <div>
              <p className="text-sm font-bold text-text">
                Mode Pemeliharaan (Maintenance Mode)
              </p>
              <p className="text-xs text-muted mt-0.5">
                Kunci seluruh aktivitas publik dan aplikasi member saat perbaikan server sedang berlangsung.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-warning" />
            </label>
          </div>
        </div>

        {/* Tombol Simpan Perubahan */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saveMutation.isPending ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
