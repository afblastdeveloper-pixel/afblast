import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, Mail, ArrowRight, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import ThemeToggle from '../../components/ui/ThemeToggle'
import { BRAND } from '../../config/brand'
import logoAf from '../../assets/brand/Logo-AF.jpeg'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e?.preventDefault()
    setError('')

    if (!identifier.trim() || !password.trim()) {
      setError(t('auth.invalidCredentials'))
      return
    }

    try {
      const result = await login(identifier.trim(), password)
      if (result.success) {
        const destination = location.state?.from?.pathname || '/app'
        navigate(destination.startsWith('/app') ? destination : '/app', { replace: true })
      }
    } catch (err) {
      setError(err.message || t('auth.invalidCredentials'))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors duration-200">
      {/* Tombol switch tema dan bahasa di pojok atas */}
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-10 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <ThemeToggle />
        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700" />
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Logo Brand */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img
            src={logoAf}
            alt={BRAND.name}
            className="w-12 h-12 rounded-2xl object-contain shadow-lg shadow-blue-500/20 border border-slate-200/80 dark:border-slate-800"
          />
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {BRAND.name}
          </span>
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('auth.loginTitle')}
        </h1>
        <p className="mt-2 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {t('auth.loginSubtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 py-8 px-5 sm:px-10 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 rounded-3xl border border-slate-200/80 dark:border-slate-800">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('auth.emailOrUsername', 'Email atau Username')}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t('auth.emailOrUsernamePlaceholder', 'nama@email.com atau username')}
                  className="w-full ps-10 pe-4 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('auth.password')}
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors"
                >
                  {t('telegram.forgotPasswordLink', 'Lupa kata sandi?')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full ps-10 pe-4 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-50"
            >
              <span>{loading ? t('auth.signingIn') : t('auth.signIn')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Tautan ke Register */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="font-semibold text-primary hover:text-primary-hover transition-colors">
                {t('auth.registerNow')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
