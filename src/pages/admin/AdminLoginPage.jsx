import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Lock,
  User,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Server
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import ThemeToggle from '../../components/ui/ThemeToggle'
import { BRAND } from '../../config/brand'
import logoAf from '../../assets/brand/Logo-AF.jpeg'
import { staffPath } from '../../utils/portal'

export default function AdminLoginPage() {
  const { t } = useTranslation()
  const { staffLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!username.trim() || !password) {
      setError(t('auth.fieldRequired') || 'Username dan password wajib diisi')
      return
    }

    if (!username.includes('@')) {
      setError('Format username staf wajib nama@role (contoh: budi@superadmin, rina@adminfinance)')
      return
    }

    setLoading(true)

    try {
      const res = await staffLogin(username.trim(), password)
      const role = res.user?.role

      // Pengalihan ke rute staf sesuai kewenangan
      if (role === 'superadmin') {
        navigate(staffPath('/superadmin'), { replace: true })
      } else if (role === 'adminfinance') {
        navigate(staffPath('/finance'), { replace: true })
      } else if (role === 'developer') {
        navigate(staffPath('/developer'), { replace: true })
      } else {
        const from = location.state?.from?.pathname || staffPath('/superadmin')
        navigate(from, { replace: true })
      }
    } catch (err) {
      console.error('Login staf gagal:', err)
      setError(err.message || 'Gagal masuk. Periksa kembali username dan kata sandi Anda.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-10 sm:py-14 px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-primary selection:text-white">
      {/* Dynamic Background Light Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-primary/20 via-blue-600/15 to-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Decorative Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      />

      {/* Top Header Floating Capsule */}
      <header className="absolute top-4 start-4 end-4 sm:top-6 sm:start-8 sm:end-8 z-20 flex items-center justify-between pointer-events-auto">
        {/* Brand Micro Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-slate-300 tracking-wide">
            Sistem Staf Operasional
          </span>
        </div>

        {/* Theme Toggle & Language Switcher */}
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800/80 shadow-xs">
          <ThemeToggle />
          <div className="w-[1px] h-4 bg-slate-800" />
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Container */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg relative z-10 px-2 mt-8 sm:mt-4">
        {/* Header Logo & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex p-1.5 rounded-2xl bg-gradient-to-b from-primary/30 to-blue-600/10 border border-primary/40 shadow-xl shadow-blue-500/20 mb-3">
            <img
              src={logoAf}
              alt={BRAND.name}
              className="w-14 h-14 rounded-xl object-contain shadow-inner"
            />
          </div>

          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-primary/20 text-primary-light border border-primary/30 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Portal Akses Staf AF Blast
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Konsol Kendali Staf
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Superadmin, Admin Keuangan, & Developer Access Control
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          {/* Alert Error Message */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs sm:text-sm animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field Username */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="staff-username"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Username Staf
                </label>
                <span className="text-[10px] text-slate-500 font-mono">Format: nama@role</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="staff-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="budi@superadmin"
                  className="w-full ps-10 pe-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono"
                />
              </div>
            </div>

            {/* Field Kata Sandi with Toggle Visibility */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Kata Sandi
                </label>
                <span className="text-[10px] text-slate-500">Kredensial Aman</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="staff-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-10 pe-11 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 end-0 pe-3.5 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Tombol Submit Masuk */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-primary to-blue-700 hover:from-blue-500 hover:to-primary text-white font-semibold text-sm shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akses...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Dashboard Staf</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Link ke Registrasi Staf Baru */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
            <span>Belum memiliki akun staf resmi?</span>
            <Link
              to={staffPath('/register')}
              className="text-primary-light hover:text-white font-semibold hover:underline inline-flex items-center gap-1"
            >
              Daftar akun staf baru
            </Link>
          </div>
        </div>

        {/* Security & Audit Footnote */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
            Enkripsi TLS 256-Bit
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
            Sesi Terproteksi
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
            Audit Log Aktif
          </p>
        </div>
      </div>
    </div>
  )
}
