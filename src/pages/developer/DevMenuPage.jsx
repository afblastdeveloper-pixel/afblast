import { useState, useEffect } from 'react'
import { Menu, Save, AlertCircle, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import Tabs from '../../components/ui/Tabs'
import Toast from '../../components/ui/Toast'

export default function DevMenuPage() {
  const { token } = useAuth()
  const { refetchConfig } = useConfig()

  const [selectedRole, setSelectedRole] = useState('user')
  const [jsonText, setJsonText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  const roles = [
    { key: 'user', label: 'Pengguna (User)' },
    { key: 'adminfinance', label: 'Admin Finance' },
    { key: 'developer', label: 'Developer' },
    { key: 'superadmin', label: 'Super Admin' },
  ]

  const fetchMenu = async (role) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dev/menu/${role}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Gagal memuat konfigurasi menu')
      const data = await res.json()
      setJsonText(JSON.stringify(data.items || [], null, 2))
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMenu(selectedRole)
  }, [selectedRole])

  const handleSave = async () => {
    setError(null)
    let parsedItems
    try {
      parsedItems = JSON.parse(jsonText)
      if (!Array.isArray(parsedItems)) {
        throw new Error('Menu harus berupa array of items: [{ title, path, icon }, ...]')
      }
    } catch (err) {
      setError(`Format JSON tidak valid: ${err.message}`)
      return
    }

    setSaveLoading(true)
    try {
      const res = await fetch(`/api/dev/menu/${selectedRole}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: parsedItems }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan menu')

      setToastMsg({ type: 'success', text: `Menu role "${selectedRole}" berhasil diperbarui!` })
      refetchConfig()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan menu')
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
            <Menu className="w-6 h-6 text-emerald-600" />
            <span>Editor Menu Navigasi Per Role</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Konfigurasikan item menu dan navigasi sidebar untuk setiap role staf dan pengguna.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveLoading || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs disabled:opacity-50"
          >
            {saveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Simpan Menu</span>
          </button>
          <button
            type="button"
            onClick={() => fetchMenu(selectedRole)}
            disabled={loading || saveLoading}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Segarkan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Role Tabs */}
      <Tabs tabs={roles} activeTab={selectedRole} onChange={setSelectedRole} />

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

      {/* Editor Box */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Struktur JSON Menu ({selectedRole})
          </span>
          <span className="text-[11px] text-slate-400">
            Format: Array of objects [{'{'} title, path, icon {'}'}]
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <p className="text-sm">Memuat menu...</p>
          </div>
        ) : (
          <textarea
            rows={16}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            disabled={saveLoading}
            className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-950 text-emerald-400 font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
            placeholder="[]"
          />
        )}
      </div>
    </div>
  )
}
