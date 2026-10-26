import { useState, useEffect } from 'react'
import { Palette, Save, AlertCircle, Loader2, CheckCircle2, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import Toast from '../../components/ui/Toast'

const PRESET_COLORS = [
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Amber', hex: '#F59E0B' },
]

export default function DevThemePage() {
  const { token } = useAuth()
  const { theme, refetchConfig } = useConfig()

  const [mode, setMode] = useState('light')
  const [primaryColor, setPrimaryColor] = useState('#2563EB')
  const [logoText, setLogoText] = useState('AF Blast')
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  useEffect(() => {
    if (theme) {
      if (typeof theme === 'object') {
        if (theme.mode) setMode(theme.mode)
        if (theme.primaryColor) setPrimaryColor(theme.primaryColor)
        if (theme.logoText) setLogoText(theme.logoText)
      } else if (typeof theme === 'string') {
        if (theme === 'dark' || theme === 'light') setMode(theme)
      }
    }
  }, [theme])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveLoading(true)
    setError(null)

    const payload = {
      mode,
      primaryColor,
      logoText,
    }

    try {
      const res = await fetch('/api/dev/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value: JSON.stringify(payload) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tema')

      setToastMsg({ type: 'success', text: 'Tema berhasil diperbarui dan diterapkan!' })
      refetchConfig()
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {toastMsg && (
        <Toast
          type={toastMsg.type}
          message={toastMsg.text}
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Palette className="w-6 h-6 text-emerald-600" />
            <span>Pengaturan Tema & Tampilan Sistem</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Ubah skema warna aksen utama, mode gelap/terang, dan identitas visual aplikasi.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-semibold underline text-red-700"
          >
            Tutup
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Pengaturan */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
          {/* Mode Gelap/Terang */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Mode Tampilan
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('light')}
                className={`p-4 rounded-xl border text-center transition-all ${
                  mode === 'light'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="text-sm">Mode Terang (Light)</div>
                <div className="text-xs text-slate-400 mt-1 font-normal">Latar belakang terang bersih</div>
              </button>

              <button
                type="button"
                onClick={() => setMode('dark')}
                className={`p-4 rounded-xl border text-center transition-all ${
                  mode === 'dark'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="text-sm">Mode Gelap (Dark)</div>
                <div className="text-xs text-slate-400 mt-1 font-normal">Kontras tinggi untuk malam</div>
              </button>
            </div>
          </div>

          {/* Warna Aksen Utama */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Warna Utama (Primary Color)
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setPrimaryColor(c.hex)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                    primaryColor === c.hex ? 'scale-110 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {primaryColor === c.hex && <CheckCircle2 className="w-5 h-5 text-white" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border border-slate-300"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-32 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-mono text-sm uppercase"
              />
            </div>
          </div>

          {/* Teks Logo / Brand */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Teks Logo Header
            </label>
            <input
              type="text"
              value={logoText}
              onChange={(e) => setLogoText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="AF Blast"
            />
          </div>

          {/* Tombol Simpan */}
          <button
            type="submit"
            disabled={saveLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
          >
            {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Terapkan & Simpan Tema</span>
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Preview Komponen Langsung
            </h3>
            <div className="space-y-4">
              {/* Header Preview */}
              <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    W
                  </div>
                  <span className="font-bold text-sm tracking-tight">{logoText}</span>
                </div>
                <span className="text-[10px] text-slate-400">Admin Preview</span>
              </div>

              {/* Button Preview */}
              <div>
                <button
                  type="button"
                  style={{ backgroundColor: primaryColor }}
                  className="w-full py-2.5 px-4 rounded-xl text-white font-semibold text-xs shadow-xs"
                >
                  Tombol Aksi Utama
                </button>
              </div>

              {/* Badge Preview */}
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-full text-white text-[11px] font-semibold"
                  style={{ backgroundColor: primaryColor }}
                >
                  Badge Status
                </span>
                <span className="text-xs text-slate-500">Aksen UI Terpilih</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
