import { useState, useEffect } from 'react'
import { Wrench, Save, AlertCircle, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import Toast from '../../components/ui/Toast'

export default function DevMaintenancePage() {
  const { token } = useAuth()
  const { maintenance, refetchConfig } = useConfig()

  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  useEffect(() => {
    if (maintenance) {
      setEnabled(Boolean(maintenance.enabled))
      setMessage(maintenance.message || '')
    }
  }, [maintenance])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dev/maintenance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah status pemeliharaan')

      setToastMsg({
        type: 'success',
        text: `Mode pemeliharaan berhasil ${enabled ? 'diaktifkan' : 'dinonaktifkan'}!`,
      })
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
            <Wrench className="w-6 h-6 text-emerald-600" />
            <span>Mode Pemeliharaan (Maintenance Mode)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kunci akses publik untuk pengguna biasa saat perbaikan atau pembaruan infrastruktur sedang berlangsung.
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

      {/* Status Warning Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-colors ${
          enabled
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
        }`}
      >
        {enabled ? (
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="text-xs sm:text-sm leading-relaxed">
          <p className="font-bold">
            {enabled
              ? 'Mode Pemeliharaan Sedang AKTIF'
              : 'Sistem Berjalan Normal (Aktif Sepenuhnya)'}
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            {enabled
              ? 'Hanya Super Admin dan Developer yang dapat mengakses dashboard. Pengguna lain dan tamu akan melihat layar pemeliharaan sistem.'
              : 'Semua pengguna dan staf dapat mengakses fitur aplikasi secara normal.'}
          </p>
        </div>
      </div>

      {/* Form Pengaturan */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6"
      >
        {/* Toggle Maintenance */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
          <div>
            <span className="text-sm font-bold text-slate-900 dark:text-white block">
              Aktifkan Layar Pemeliharaan
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block">
              Alihkan seluruh pengguna ke layar "Under Maintenance"
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saveLoading}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500" />
          </label>
        </div>

        {/* Pesan Pemeliharaan */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Pesan untuk Pengguna
          </label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={saveLoading}
            placeholder="Contoh: Kami sedang melakukan pemeliharaan server berkala. Layanan akan normal kembali dalam 30 menit."
            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
          />
        </div>

        {/* Tombol Simpan */}
        <button
          type="submit"
          disabled={saveLoading}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
        >
          {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Simpan Status Maintenance</span>
        </button>
      </form>
    </div>
  )
}
