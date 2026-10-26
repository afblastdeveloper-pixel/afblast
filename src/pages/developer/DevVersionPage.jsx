import { useState, useEffect } from 'react'
import { GitBranch, Send, AlertCircle, Loader2, CheckCircle2, History, Tag } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import Toast from '../../components/ui/Toast'

export default function DevVersionPage() {
  const { token } = useAuth()
  const { version: currentConfigVersion, refetchConfig } = useConfig()

  const [version, setVersion] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  const activeVerString =
    typeof currentConfigVersion === 'object'
      ? currentConfigVersion?.version
      : currentConfigVersion || '1.0.0'

  const handlePublish = async (e) => {
    e.preventDefault()
    const cleanVersion = version.trim()

    if (!cleanVersion) {
      setError('Nomor versi aplikasi wajib diisi (contoh: 1.2.0)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dev/version', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          version: cleanVersion,
          note: note.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mempublikasikan versi baru')

      setToastMsg({
        type: 'success',
        text: `Versi ${cleanVersion} berhasil dipublikasikan! Seluruh klien akan mendeteksi pembaruan ini.`,
      })
      setVersion('')
      setNote('')
      refetchConfig()
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
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
            <GitBranch className="w-6 h-6 text-emerald-600" />
            <span>Versi & Changelog Aplikasi</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Rilis versi aplikasi baru untuk memicu banner pembaruan real-time ke semua dashboard pengguna.
          </p>
        </div>

        {/* Current Version Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <Tag className="w-3.5 h-3.5" />
          <span>Versi Aktif: v{activeVerString}</span>
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

      {/* Form Publikasi Versi */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
          Publikasikan Rilis Baru
        </h2>

        <form onSubmit={handlePublish} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Nomor Versi Baru (SemVer) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Contoh: 1.2.0"
              className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Gunakan penomoran versi standar (Major.Minor.Patch)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Catatan Rilis / Changelog
            </label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan perubahan, fitur baru, dan perbaikan bug pada rilis ini..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mempublikasikan...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Publikasikan Pembaruan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
