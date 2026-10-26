import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Gift,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../utils/client'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { BRAND } from '../../config/brand'
import logoAf from '../../assets/brand/Logo-AF.jpeg'

const DEFAULT_BOT_NAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'AFBlastRecoveryBot'

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register, loading, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialRef = searchParams.get('ref') || searchParams.get('referral') || ''

  // Form states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [referralCode, setReferralCode] = useState(initialRef.toUpperCase())
  const [error, setError] = useState('')

  // Steps: 'form' | 'telegram'
  const [step, setStep] = useState('form')
  const [justRegistered, setJustRegistered] = useState(false)

  // Telegram link data & status
  const [linkData, setLinkData] = useState(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [isLinked, setIsLinked] = useState(false)
  const pollingRef = useRef(null)

  // Jika user sudah terautentikasi sebelumnya (bukan baru daftar), arahkan ke dashboard
  useEffect(() => {
    if (isAuthenticated && !justRegistered && step === 'form') {
      navigate('/app', { replace: true })
    }
  }, [isAuthenticated, justRegistered, step, navigate])

  // Polling status telegram setiap 3 detik ketika berada di step 'telegram' dan belum tertaut
  useEffect(() => {
    if (step !== 'telegram' || isLinked) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }

    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/member/telegram/status')
        if (res.ok) {
          const data = await res.json()
          if (data.linked) {
            setIsLinked(true)
            if (pollingRef.current) clearInterval(pollingRef.current)
          }
        }
      } catch (err) {
        // Abaikan kegagalan sesaat pada polling
      }
    }

    // Jalankan segera sekali
    checkStatus()
    pollingRef.current = setInterval(checkStatus, 3000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [step, isLinked])

  const fetchLinkToken = async () => {
    setLinkLoading(true)
    try {
      const res = await apiFetch('/api/member/telegram/link-token', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLinkData(data)
      }
    } catch (err) {
      console.warn('Gagal memuat link token telegram:', err)
    } finally {
      setLinkLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError(t('auth.invalidCredentials', 'Email dan password wajib diisi.'))
      return
    }

    if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('telegram.passwordReqDetail', 'Password minimal 10 karakter dan wajib memadukan huruf serta angka.'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch', 'Konfirmasi password tidak cocok.'))
      return
    }

    try {
      const result = await register({
        name,
        email,
        password,
        referralCode: referralCode.trim() ? referralCode.trim().toUpperCase() : undefined,
      })
      if (result.success) {
        setJustRegistered(true)
        setStep('telegram')
        await fetchLinkToken()
      }
    } catch (err) {
      setError(err.message || t('auth.invalidCredentials', 'Pendaftaran gagal.'))
    }
  }

  const botName = linkData?.botUsername || DEFAULT_BOT_NAME
  const deepLink = linkData?.deepLink || `https://t.me/${botName}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      {/* Tombol switch bahasa di pojok atas */}
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-gray-200/80 shadow-xs">
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Logo Brand */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img
            src={logoAf}
            alt={BRAND.name}
            className="w-12 h-12 rounded-2xl object-contain shadow-lg shadow-blue-500/20 border border-slate-200/80"
          />
          <span className="text-2xl font-black text-gray-900 tracking-tight">
            {BRAND.name}
          </span>
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-gray-900">
          {step === 'form' ? t('auth.registerTitle', 'Daftar Akun Member') : t('telegram.connectTitle', 'Hubungkan Telegram')}
        </h1>
        <p className="mt-2 text-center text-xs sm:text-sm text-gray-500">
          {step === 'form'
            ? t('auth.registerSubtitle', 'Bergabunglah bersama ribuan member aktif AF Blast')
            : t('telegram.connectSubtitle', 'Tautkan Telegram untuk memulihkan kata sandi secara mandiri kapan saja.')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-5 sm:px-10 shadow-xl shadow-gray-200/50 rounded-3xl border border-gray-100">
          {error && step === 'form' && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
              {error}
            </div>
          )}

          {step === 'form' ? (
            /* Formulir Pendaftaran */
            <form className="space-y-4" onSubmit={handleRegister}>
              <div>
                <label htmlFor="reg-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.fullName', 'Nama Lengkap')}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder', 'Nama lengkap Anda')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.email', 'Email')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder', 'nama@domain.com')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.password', 'Kata Sandi')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('telegram.newPasswordPlaceholder', 'Minimal 10 karakter (huruf + angka)')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-confirm-password" className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.confirmPassword', 'Konfirmasi Kata Sandi')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder', 'Ketik ulang kata sandi')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="reg-referral" className="block text-xs font-semibold text-gray-700">
                    {t('auth.referralCode', 'Kode Referral Tim')}
                  </label>
                  <span className="text-[11px] text-gray-400 font-medium">({t('common.optional', 'Opsional')})</span>
                </div>
                <div className="relative">
                  <Gift className="w-4 h-4 text-emerald-500 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-referral"
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: AF8K29"
                    maxLength={16}
                    className="w-full ps-10 pe-4 py-2.5 text-sm uppercase tracking-wider font-semibold bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
                {Boolean(initialRef) && (
                  <p className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-500" />
                    <span>{t('auth.referralApplied', 'Kode referral tim teman terpasang otomatis.')}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-50"
              >
                <span>{loading ? t('auth.registering', 'Mendaftarkan...') : t('auth.register', 'Daftar Akun')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            /* Langkah 2: Hubungkan Telegram */
            <div className="space-y-5 animate-in fade-in">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-[#229ED9] flex items-center justify-center border border-blue-100 shadow-inner">
                  {isLinked ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <ShieldCheck className="w-8 h-8" />
                  )}
                </div>
                <h3 className="mt-3 text-base font-bold text-gray-900">
                  {isLinked
                    ? t('telegram.linkedSuccessTitle', 'Telegram Berhasil Ditautkan!')
                    : t('telegram.stepConnectBot', 'Tautkan Akun ke Bot Telegram')}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {isLinked
                    ? t('telegram.linkedSuccessDesc', 'Akun Anda kini terlindungi. Anda dapat mereset kata sandi lewat bot Telegram kapan saja.')
                    : t('telegram.stepConnectBotDesc', 'Klik tombol di bawah untuk membuka bot Telegram resmi dan menautkan akun secara instan.')}
                </p>
              </div>

              {/* Status Polling Indicator */}
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center gap-3 ${
                isLinked
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-blue-50/60 border-blue-200/60 text-blue-900'
              }`}>
                {isLinked ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-semibold">
                    {isLinked
                      ? t('telegram.statusLinkedReady', 'Status: Tertaut Aktif')
                      : t('telegram.waitingConfirmation', 'Menunggu konfirmasi di bot Telegram...')}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {isLinked
                      ? t('telegram.readyToProceed', 'Anda siap melanjutkan ke dashboard.')
                      : t('telegram.autoChecking', 'Sistem otomatis mendeteksi setiap 3 detik.')}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                {!isLinked ? (
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#229ED9] hover:bg-[#1E88E5] shadow-md shadow-blue-400/20 transition-all"
                  >
                    <span>{t('telegram.openTelegramBot', 'Buka Bot Telegram')}</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/app', { replace: true })}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <span>{t('telegram.goToDashboard', 'Lanjut ke Dashboard')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {!isLinked && (
                  <button
                    type="button"
                    onClick={() => navigate('/app', { replace: true })}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    {t('telegram.skipForNow', 'Lewati, saya lakukan nanti')}
                  </button>
                )}
              </div>

              {/* Warning Box Wajib */}
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="leading-relaxed">
                  <strong>{t('telegram.noteWarningTitle', 'Penting:')}</strong>{' '}
                  {t(
                    'telegram.noteWarningDesc',
                    'Tanpa Telegram tertaut, Anda tidak bisa mereset password sendiri.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Tautan ke Login */}
          {step === 'form' && (
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                {t('auth.haveAccount', 'Sudah punya akun?')}{' '}
                <Link to="/login" className="font-semibold text-primary hover:text-primary-hover transition-colors">
                  {t('auth.signIn', 'Masuk')}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
