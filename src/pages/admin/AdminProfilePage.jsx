import { useState } from 'react'
import { Save } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'

export default function AdminProfilePage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name || 'Administrator AF Blast')
  const [email, setEmail] = useState(user?.email || 'admin@afblast.id')
  const [toastMsg, setToastMsg] = useState(null)

  const handleSave = (e) => {
    e.preventDefault()
    setToastMsg('Profil administrator berhasil diperbarui!')
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}

      {/* Header Panel with PageHeader */}
      <PageHeader
        title="Profil Administrator"
        subtitle="Kelola informasi identitas akun admin dan kredensial keamanan akses"
        badge="Profil"
      />

      <div className="max-w-2xl bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="w-16 h-16 rounded-2xl bg-primary-soft text-primary-text border border-primary/20 flex items-center justify-center text-2xl font-bold shadow-xs">
            {name.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold text-text">{name}</h2>
            <p className="text-xs text-muted">{email}</p>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-soft text-primary-text uppercase tracking-wider mt-1">
              Super Administrator
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Nama Lengkap
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Alamat Email Login
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-2 text-text border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
