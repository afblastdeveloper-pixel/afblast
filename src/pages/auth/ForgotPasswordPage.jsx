import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  User,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Send,
  ShieldCheck,
  Clock,
  Loader2,
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import CaptchaSlot from '../../components/common/CaptchaSlot'
import { BRAND } from '../../config/brand'
import logoAf from '../../assets/brand/Logo-AF.jpeg'

const DEFAULT_BOT_NAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'AFBlastRecoveryBot'

export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'

  // Step state: 1 (Username) | 2 (Verify Code) | 3 (New Password)
  const [step, setStep] = useState(1)

  // Step 1: Input username
  const [username, setUsername] = useState('')
  const [loadingStep1, setLoadingStep1] = useState(false)
  const [errorStep1, setErrorStep1] = useState('')

  // Step 2: Data dari API (HANYA di memori, tidak di localStorage)
  const [requestId, setRequestId] = useState(null)
  const [startToken, setStartToken] = useState('')
  const [botUsername, setBotUsername] = useState(DEFAULT_BOT_NAME)
  const [deepLink, setDeepLink] = useState('')
  const [expiresAt, setExpiresAt] = useState(null)

  // 6-Digit Code Inputs
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef([])
  const [loadingStep2, setLoadingStep2] = useState(false)
  const [errorStep2, setErrorStep2] = useState('')
  const [remainingAttempts, setRemainingAttempts] = useState(null)
  const [isBurned, setIsBurned] = useState(false)

  // Countdown timers
  const [expirySeconds, setExpirySeconds] = useState(600) // 10 menit
  const [resendCooldown, setResendCooldown] = useState(60) // 60 detik
  const [resendLoading, setResendLoading] = useState(false)
  const [copyToast, setCopyToast] = useState(false)

  // Step 3: Password Baru (HANYA di memori)
  const [resetToken, setResetToken] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loadingStep3, setLoadingStep3] = useState(false)
  const [errorStep3, setErrorStep3] = useState('')
  const [successReset, setSuccessReset] = useState(false)

  // Bersihkan token dari memori saat unmount
  useEffect(() => {
    return () => {
      setRequestId(null)
      setStartToken('')
      setResetToken(null)
    }
  }, [])

  // Timer hitung mundur kedaluwarsa kode (10 menit)
  useEffect(() => {
    if (step !== 2 || isBurned) return

    const timer = setInterval(() => {
      setExpirySeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [step, isBurned])

  // Timer cooldown kirim ulang (60 detik)
  useEffect(() => {
    if (step !== 2 || resendCooldown <= 0) return

    const cooldownTimer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(cooldownTimer)
  }, [step, resendCooldown])

  // Format mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // ============================================================
  // HANDLER LANGKAH 1: Permintaan Awal (POST /api/auth/forgot/start)
  // ============================================================
  const handleStartSubmit = async (e) => {
    e?.preventDefault()
    setErrorStep1('')

    if (!username.trim()) {
      setErrorStep1(t('telegram.usernameRequired', 'Silakan masukkan username atau email akun Anda.'))
      return
    }

    setLoadingStep1(true)
    try {
      const res = await apiFetch('/api/auth/forgot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses permintaan reset password.')
      }

      // Simpan hanya di state memori
      setRequestId(data.requestId)
      setStartToken(data.startToken)
      setBotUsername(data.botUsername || DEFAULT_BOT_NAME)
      setDeepLink(data.deepLink)
      setExpiresAt(data.expiresAt)

      setExpirySeconds(600)
      setResendCooldown(60)
      setCodeDigits(['', '', '', '', '', ''])
      setErrorStep2('')
      setRemainingAttempts(null)
      setIsBurned(false)

      setStep(2)
    } catch (err) {
      setErrorStep1(err.message || 'Terjadi kesalahan sistem saat meminta reset password.')
    } finally {
      setLoadingStep1(false)
    }
  }

  // ============================================================
  // HANDLER LANGKAH 2: 6-Digit Code & Verifikasi
  // ============================================================
  const handleDigitChange = (index, value) => {
    // Hanya izinkan angka
    const numericValue = value.replace(/\D/g, '')

    // Handle jika user paste teks panjang ke dalam salah satu kotak
    if (numericValue.length > 1) {
      const pastedDigits = numericValue.slice(0, 6).split('')
      const newDigits = [...codeDigits]
      pastedDigits.forEach((digit, i) => {
        if (i < 6) newDigits[i] = digit
      })
      setCodeDigits(newDigits)
      const nextIndex = Math.min(pastedDigits.length, 5)
      inputRefs.current[nextIndex]?.focus()
      return
    }

    const newDigits = [...codeDigits]
    newDigits[index] = numericValue ? numericValue.slice(-1) : ''
    setCodeDigits(newDigits)

    // Otomatis pindah fokus ke kotak berikutnya jika angka diisi
    if (numericValue && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleDigitKeyDown = (index, e) => {
    // Backspace: jika kotak saat ini kosong, pindah fokus ke kotak sebelumnya
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleDigitPaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pastedData) return

    const pastedDigits = pastedData.slice(0, 6).split('')
    const newDigits = [...codeDigits]
    pastedDigits.forEach((digit, i) => {
      if (i < 6) newDigits[i] = digit
    })
    setCodeDigits(newDigits)
    const nextIndex = Math.min(pastedDigits.length, 5)
    inputRefs.current[nextIndex]?.focus()
  }

  // Salin perintah Telegram Desktop
  const handleCopyCommand = async () => {
    const commandText = `/start ${startToken}`
    try {
      await navigator.clipboard.writeText(commandText)
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 2500)
    } catch {
      // Fallback
    }
  }

  // Kirim ulang kode
  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return
    setErrorStep2('')
    setResendLoading(true)

    try {
      const res = await apiFetch('/api/auth/forgot/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal meminta kirim ulang kode.')
      }

      setResendCooldown(60)
      setExpirySeconds(600)
      setCodeDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } catch (err) {
      setErrorStep2(err.message || 'Gagal memproses kirim ulang kode.')
    } finally {
      setResendLoading(false)
    }
  }

  // Verifikasi kode 6 digit
  const handleVerifySubmit = async (e) => {
    e?.preventDefault()
    setErrorStep2('')

    const fullCode = codeDigits.join('')
    if (fullCode.length !== 6) {
      setErrorStep2(t('telegram.enterCompleteCode', 'Harap masukkan 6 digit kode verifikasi dengan lengkap.'))
      return
    }

    setLoadingStep2(true)
    try {
      const res = await apiFetch('/api/auth/forgot/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, code: fullCode }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.burned) {
          setIsBurned(true)
        }
        if (typeof data.remainingAttempts === 'number') {
          setRemainingAttempts(data.remainingAttempts)
        }
        throw new Error(data.error || 'Kode salah atau telah kedaluwarsa.')
      }

      // Berhasil: simpan resetToken di memori dan pindah ke langkah 3
      setResetToken(data.resetToken)
      setErrorStep3('')
      setStep(3)
    } catch (err) {
      setErrorStep2(err.message || 'Kode salah atau tidak valid.')
    } finally {
      setLoadingStep2(false)
    }
  }

  // ============================================================
  // HANDLER LANGKAH 3: Simpan Password Baru (POST /api/auth/forgot/reset)
  // ============================================================
  const hasMinLength = newPassword.length >= 10
  const hasLetter = /[a-zA-Z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const isMatch = newPassword && confirmPassword && newPassword === confirmPassword
  const isPasswordValid = hasMinLength && hasLetter && hasNumber

  const getStrengthPercent = () => {
    let score = 0
    if (newPassword.length >= 10) score += 40
    if (hasLetter) score += 30
    if (hasNumber) score += 30
    return score
  }

  const handleResetSubmit = async (e) => {
    e?.preventDefault()
    setErrorStep3('')

    if (!resetToken) {
      setErrorStep3(t('telegram.tokenMissing', 'Sesi reset kedaluwarsa. Silakan mulai ulang.'))
      return
    }

    if (!isPasswordValid) {
      setErrorStep3(t('telegram.passwordReqDetail', 'Password minimal 10 karakter dan wajib memadukan huruf serta angka.'))
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorStep3(t('telegram.passwordMismatch', 'Konfirmasi password tidak cocok dengan password baru.'))
      return
    }

    setLoadingStep3(true)
    try {
      const res = await apiFetch('/api/auth/forgot/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan kata sandi baru.')
      }

      setSuccessReset(true)
      // Bersihkan memori
      setRequestId(null)
      setResetToken(null)

      // Redirect otomatis ke login setelah 3 detik
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    } catch (err) {
      setErrorStep3(err.message || 'Terjadi kesalahan sistem saat memperbarui kata sandi.')
    } finally {
      setLoadingStep3(false)
    }
  }

  // Mulai ulang seluruh alur
  const handleRestart = () => {
    setStep(1)
    setRequestId(null)
    setStartToken('')
    setResetToken(null)
    setCodeDigits(['', '', '', '', '', ''])
    setErrorStep1('')
    setErrorStep2('')
    setErrorStep3('')
    setIsBurned(false)
  }

  const isCodeComplete = codeDigits.every((d) => d !== '')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-gray-100 flex flex-col justify-center py-10 sm:px-6 lg:px-8 relative">
      {/* Tombol Kembali ke Login di Kiri Atas */}
      <div className="absolute top-4 start-4 sm:top-6 sm:start-6 z-10">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white text-gray-700 hover:text-gray-900 rounded-2xl border border-gray-200/80 shadow-xs text-xs font-semibold backdrop-blur-md transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('auth.backToLogin', 'Kembali ke Login')}</span>
        </Link>
      </div>

      {/* Switcher Bahasa di Kanan Atas */}
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-gray-200/80 shadow-xs">
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Logo Brand AF Blast */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <img
            src={logoAf}
            alt={BRAND.name}
            className="w-12 h-12 rounded-2xl object-contain shadow-lg shadow-blue-500/20 border border-slate-200/80"
          />
          <span className="text-2xl font-black text-gray-900 tracking-tight">
            {BRAND.name}
          </span>
        </div>

        <h1 className="text-center text-2xl font-extrabold tracking-tight text-gray-900">
          {t('telegram.forgotTitle', 'Lupa Kata Sandi')}
        </h1>
        <p className="mt-1.5 text-center text-xs sm:text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
          {t(
            'telegram.forgotSubtitle3Step',
            'Verifikasi lewat Telegram untuk memasang kata sandi baru'
          )}
        </p>

        {/* Indikator 3 Langkah (Progress Bar Kecil) */}
        <div className="mt-5 max-w-xs mx-auto">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((stepNumber) => (
              <div key={stepNumber} className="space-y-1">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step >= stepNumber ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
                <p
                  className={`text-[10px] text-center font-semibold transition-colors ${
                    step === stepNumber
                      ? 'text-primary font-bold'
                      : step > stepNumber
                      ? 'text-gray-700'
                      : 'text-gray-400'
                  }`}
                >
                  {stepNumber === 1
                    ? t('telegram.step1Label', '1. Akun')
                    : stepNumber === 2
                    ? t('telegram.step2Label', '2. Verifikasi')
                    : t('telegram.step3Label', '3. Sandi Baru')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kartu Tengah Utama */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-5 sm:px-9 shadow-xl shadow-gray-200/50 rounded-3xl border border-gray-100 relative">
          {/* ======================================================= */}
          {/* LANGKAH 1: Input Nama Pengguna */}
          {/* ======================================================= */}
          {step === 1 && (
            <form onSubmit={handleStartSubmit} className="space-y-4 animate-in fade-in">
              {errorStep1 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{errorStep1}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="forgot-username"
                  className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1"
                >
                  {t('telegram.usernameUppercase', 'NAMA PENGGUNA')}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="forgot-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('telegram.usernamePlaceholder', 'Masukkan username atau email Anda')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
                  {t(
                    'telegram.step1Help',
                    'Kode verifikasi dikirim lewat bot Telegram ke akun yang terdaftar di profilmu.'
                  )}
                </p>
              </div>

              {/* Slot CAPTCHA kosong (aktif hanya jika flag env disetel) */}
              <CaptchaSlot />

              <button
                type="submit"
                disabled={loadingStep1 || !username.trim()}
                className="w-full mt-3 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingStep1 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('telegram.processing', 'Memproses...')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('telegram.continue', 'Lanjutkan')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ======================================================= */}
          {/* LANGKAH 2: Buka Bot Telegram & Input Kode 6 Digit */}
          {/* ======================================================= */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in">
              {/* Pesan Error / Hangus */}
              {errorStep2 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span>{errorStep2}</span>
                    {remainingAttempts !== null && remainingAttempts > 0 && (
                      <p className="mt-1 font-bold text-rose-700">
                        {t('telegram.remainingAttempts', 'Sisa percobaan: {{count}} kali', {
                          count: remainingAttempts,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Kotak Instruksi Telegram */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 text-xs text-blue-950 space-y-3">
                <div>
                  <h2 className="font-bold text-sm text-blue-900">
                    {t('telegram.step2BoxTitle', 'Buka Telegram, lalu tekan START')}
                  </h2>
                  <p className="text-[11px] text-blue-800/80 mt-0.5 leading-relaxed">
                    {t(
                      'telegram.step2BoxDesc',
                      'Setelah menekan START, bot akan mengirim kode 6 digit kepadamu'
                    )}
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#229ED9] hover:bg-[#1E88E5] shadow-xs shadow-blue-400/20 transition-all"
                  >
                    <span>{t('telegram.openTelegramBot', 'Buka Bot Telegram')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleCopyCommand}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#229ED9] hover:underline"
                    >
                      {copyToast ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">
                            {t('telegram.copiedFeedback', 'Tersalin, tempel di chat bot')}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>
                            {t('telegram.copyCommandDesktop', 'Salin perintah untuk Telegram Desktop')}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Form Input 6 Digit */}
              {!isBurned && expirySeconds > 0 ? (
                <form onSubmit={handleVerifySubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        {t('telegram.verificationCodeLabel', 'KODE VERIFIKASI')}
                      </label>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>
                          {t('telegram.validTime', 'Berlaku')} {formatTime(expirySeconds)}
                        </span>
                      </div>
                    </div>

                    {/* 6 Digit Input Boxes */}
                    <div
                      className="grid grid-cols-6 gap-2 sm:gap-2.5 my-2"
                      dir="ltr"
                      onPaste={handleDigitPaste}
                    >
                      {codeDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => (inputRefs.current[idx] = el)}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                          className={`w-full h-12 text-center text-lg font-bold rounded-xl border transition-all ${
                            digit
                              ? 'bg-blue-50/50 border-primary text-gray-900 ring-2 ring-blue-100'
                              : 'bg-gray-50/50 border-gray-200 text-gray-800 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Tautan Kirim Ulang dengan Cooldown */}
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-gray-400">
                        {t('telegram.didNotReceiveQuestion', 'Belum menerima kode?')}
                      </span>
                      {resendCooldown > 0 ? (
                        <span className="text-gray-400 font-medium cursor-not-allowed">
                          {t('telegram.resendWait', 'Kirim ulang ({{seconds}}s)', {
                            seconds: resendCooldown,
                          })}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={resendLoading}
                          className="font-bold text-primary hover:text-primary-hover hover:underline transition-colors"
                        >
                          {resendLoading
                            ? t('telegram.resending', 'Mengirim...')
                            : t('telegram.resendAction', 'Kirim ulang')}
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loadingStep2 || !isCodeComplete}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingStep2 ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('telegram.verifying', 'Memverifikasi...')}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('telegram.verifyCodeBtn', 'Verifikasi Kode')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Jika Permintaan Hangus / Kedaluwarsa */
                <div className="text-center py-3 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-gray-600 max-w-xs mx-auto">
                    {isBurned
                      ? t(
                          'telegram.burnedNotice',
                          'Permintaan reset telah hangus demi keamanan. Silakan mulai ulang.'
                        )
                      : t(
                          'telegram.expiredNotice',
                          'Waktu verifikasi telah habis (kedaluwarsa). Silakan mulai ulang.'
                        )}
                  </p>
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-hover transition-all shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('telegram.restartFlow', 'Mulai Ulang')}</span>
                  </button>
                </div>
              )}

              {/* Teks Bantuan Bawah */}
              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-[11px] text-gray-500 text-center leading-relaxed">
                {t(
                  'telegram.step2FooterHelp',
                  'Belum menerima kode? Pastikan kamu sudah menekan START di bot, atau hubungi admin.'
                )}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* LANGKAH 3: Kata Sandi Baru & Konfirmasi */}
          {/* ======================================================= */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in">
              {successReset ? (
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">
                    {t('telegram.resetSuccessTitle', 'Kata Sandi Berhasil Diperbarui')}
                  </h2>
                  <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                    {t(
                      'telegram.resetSuccessDesc',
                      'Kata sandi Anda telah berhasil diubah. Sesi lama telah dinonaktifkan demi keamanan. Anda akan diarahkan ke halaman login dalam 3 detik...'
                    )}
                  </p>
                  <div className="pt-2">
                    <Link
                      to="/login"
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover transition-all"
                    >
                      <span>{t('telegram.goToLogin', 'Masuk Sekarang')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  {errorStep3 && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{errorStep3}</span>
                    </div>
                  )}

                  {/* Password Baru */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('telegram.newPasswordLabel', 'Kata Sandi Baru')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('telegram.newPasswordPlaceholder', 'Minimal 10 karakter (huruf + angka)')}
                        className="w-full ps-10 pe-10 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Meter Kekuatan Password */}
                    {newPassword && (
                      <div className="mt-2 space-y-1.5">
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              getStrengthPercent() === 100
                                ? 'bg-emerald-500'
                                : getStrengthPercent() >= 70
                                ? 'bg-blue-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${getStrengthPercent()}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span>{t('telegram.passwordStrength', 'Kekuatan Kata Sandi')}</span>
                          <span className="font-semibold">
                            {getStrengthPercent() === 100
                              ? t('telegram.strong', 'Kuat')
                              : getStrengthPercent() >= 70
                              ? t('telegram.medium', 'Sedang')
                              : t('telegram.weak', 'Lemah')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Konfirmasi Password Baru */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('telegram.confirmPasswordLabel', 'Konfirmasi Kata Sandi Baru')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('telegram.confirmPasswordPlaceholder', 'Ketik ulang kata sandi baru')}
                        className="w-full ps-10 pe-10 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Checklist Syarat Password */}
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] space-y-1 text-gray-600">
                    <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-semibold' : ''}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>{t('telegram.ruleMinLength', 'Minimal 10 karakter')}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasLetter && hasNumber ? 'text-emerald-600 font-semibold' : ''}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>{t('telegram.ruleAlphaNum', 'Wajib memadukan huruf dan angka')}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${isMatch ? 'text-emerald-600 font-semibold' : ''}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>{t('telegram.ruleMatch', 'Kedua kata sandi cocok')}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loadingStep3 || !isPasswordValid || !isMatch}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingStep3 ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('telegram.saving', 'Menyimpan...')}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('telegram.savePassword', 'Simpan Kata Sandi')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Tautan Kembali ke Login di Bawah Kartu */}
          <div className="mt-6 text-center pt-3 border-t border-gray-100">
            <Link
              to="/login"
              className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              ← {t('auth.backToLogin', 'Kembali ke Login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
