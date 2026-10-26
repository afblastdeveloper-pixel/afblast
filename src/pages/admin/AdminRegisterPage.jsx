import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, User, Briefcase, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import ThemeToggle from '../../components/ui/ThemeToggle'
import { BRAND } from '../../config/brand'
import logoAf from '../../assets/brand/Logo-AF.jpeg'
import { staffPath } from '../../utils/portal'

export default function AdminRegisterPage() {
  const { t } = useTranslation()
  const { staffRegister } = useAuth()

  const [nama, setNama] = useState('')
  const [role, setRole] = useState('adminfinance')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [registeredSuccess, setRegisteredSuccess] = useState(false)

  // Live preview username (nama@role)
  const previewUsername = useMemo(() => {
    const cleanName = nama
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
    return cleanName ? `${cleanName}@${role}` : `nama@${role}`
  }, [nama, role])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!nama.trim() || !password) {
      setError(t('auth.fieldRequired') || 'Nama dan password wajib diisi')
      return
    }

    if (password.length < 6) {
      setError('Password minimal 6 karakter')
      return
    }

    setLoading(true)

    try {
      await staffRegister({ nama, password, role })
      setRegisteredSuccess(true)
    } catch (err) {
      console.error('Registrasi staf gagal:', err)
      setError(err.message || 'Gagal mendaftar. Silakan coba kembali.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1220] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Language Switcher & Theme Toggle di pojok atas */}
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-800 shadow-md">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Header Logo & Badge Portal Staf */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3">
            <img
              src={logoAf}
              alt={BRAND.name}
              className="w-14 h-14 rounded-2xl object-contain mx-auto shadow-xl shadow-blue-500/20 border border-primary/30"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-primary/15 text-primary-light border border-primary/30 mb-2">
            Portal Staf
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Pendaftaran Staf {BRAND.name}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">
            Daftarkan akun staf baru untuk mendapatkan akses peran
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {registeredSuccess ? (
            /* State Sukses: Menunggu Persetujuan Super Admin */
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">
                Pendaftaran Berhasil!
              </h2>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium mb-4">
                Menunggu persetujuan Super Admin
              </div>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Akun staf Anda dengan username <strong className="text-white font-mono">{previewUsername}</strong> telah didaftarkan dengan status <span className="text-amber-400 font-semibold">pending</span>. Silakan hubungi Superadmin untuk mengaktifkan akun Anda sebelum masuk.
              </p>
              <Link
                to={staffPath('/login')}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-colors border border-slate-700"
              >
                <span>Kembali ke Halaman Login</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-3 text-red-300 text-xs sm:text-sm">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Field Nama */}
                <div>
                  <label
                    htmlFor="nama"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                  >
                    Nama Lengkap / Panggilan
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      id="nama"
                      type="text"
                      required
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Contoh: Dewi"
                      className="w-full ps-10 pe-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                {/* Field Role (Hanya Admin Finance atau Developer) */}
                <div>
                  <label
                    htmlFor="role"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                  >
                    Pilihan Peran (Role)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <select
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full ps-10 pe-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    >
                      <option value="adminfinance">Admin Finance (Keuangan & Penarikan)</option>
                      <option value="developer">Developer (Sistem, Fitur & Konfigurasi)</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    *Pendaftaran role Superadmin hanya dapat dibuat secara internal oleh sistem.
                  </p>
                </div>

                {/* Preview Username */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                  <span className="text-slate-400 block mb-0.5">Preview Username Login:</span>
                  <span className="font-mono text-emerald-400 font-semibold text-sm">
                    {previewUsername}
                  </span>
                </div>

                {/* Field Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                  >
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full ps-10 pe-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-hover hover:from-blue-500 hover:to-primary text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mendaftarkan...</span>
                    </>
                  ) : (
                    <span>Ajukan Pendaftaran Staf</span>
                  )}
                </button>
              </form>

              {/* Link ke Login */}
              <div className="mt-6 pt-6 border-t border-slate-800 text-center">
                <p className="text-xs text-slate-400">
                  Sudah memiliki akun staf?{' '}
                  <Link
                    to={staffPath('/login')}
                    className="text-primary-light hover:text-white font-semibold hover:underline"
                  >
                    Masuk di sini
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
