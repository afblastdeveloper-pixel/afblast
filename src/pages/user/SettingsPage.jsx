import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, CreditCard, ArrowLeft, Check, AlertCircle, AlertTriangle,
  Lock, RefreshCw, Send, Copy, Eye, EyeOff, Save, CheckCircle2,
  Landmark, Smartphone, ShieldCheck, ExternalLink, Clock, ShieldAlert,
  HelpCircle, ChevronRight
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Modal from '../../components/ui/Modal'
import Toast from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'

/**
 * Format tanggal ramah pengguna
 */
function formatDate(dateStr, locale = 'id-ID') {
  if (!dateStr) return '-'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

/**
 * Format tanggal & jam lengkap (untuk masa penahanan)
 */
function formatDateTime(dateStr, locale = 'id-ID') {
  if (!dateStr) return '-'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export default function UserSettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { updateUser } = useAuth()
  const isRTL = i18n.language === 'ar'

  // Toast State
  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'success') => setToast({ message, type })

  // --- QUERY: Ambil Data Akun Member ---
  const {
    data: accountData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['memberAccount'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/account')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Gagal memuat data akun')
      }
      return res.json()
    },
    staleTime: 1000 * 30, // 30 detik
  })

  // --- FORM STATE KARTU 1 (INFORMASI AKUN) ---
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  // Show / Hide Password Toggles
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)

  // Inisialisasi form saat accountData masuk
  useEffect(() => {
    if (accountData) {
      setFullName(accountData.fullName || accountData.name || '')
      setUsername(accountData.username || '')
      setTelegramUsername(accountData.telegram?.username || '')
    }
  }, [accountData])

  // Evaluasi perubahan Form Akun (Dirty Check)
  const RESERVED_USERNAMES = ['superadmin', 'adminfinance', 'developer', 'admin', 'afblast', 'support']
  const originalFullName = accountData?.fullName || accountData?.name || ''
  const originalUsername = accountData?.username || ''
  const originalTgUsername = accountData?.telegram?.username || ''
  const cleanUsername = username.replace(/^@/, '').toLowerCase().trim()
  const isReservedUsername = RESERVED_USERNAMES.includes(cleanUsername)
  const isNameChanged = fullName.trim() !== originalFullName.trim()
  const isUsernameChanged = cleanUsername !== originalUsername.toLowerCase().trim()
  const isTgChanged =
    telegramUsername.replace(/^@/, '').toLowerCase().trim() !==
    originalTgUsername.toLowerCase().trim()
  const isPasswordFilled = isChangingPassword && newPassword.length > 0
  const isAccountDirty = isNameChanged || isUsernameChanged || isTgChanged || isPasswordFilled

  // Password saat ini WAJIB muncul bila password baru diisi, username, atau telegram diubah
  const requireCurrentPassword = isPasswordFilled || isTgChanged || isUsernameChanged

  // Indikator Kekuatan Password Baru
  const passwordStrength = useMemo(() => {
    if (!newPassword) return null
    let score = 0
    if (newPassword.length >= 8) score++
    if (newPassword.length >= 10) score++
    if (/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword)) score++
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++

    if (score <= 1) return { label: t('settings.weak'), color: 'bg-red-500', width: 'w-1/3' }
    if (score <= 2) return { label: t('settings.medium'), color: 'bg-amber-500', width: 'w-2/3' }
    return { label: t('settings.strong'), color: 'bg-emerald-500', width: 'w-full' }
  }, [newPassword, t])

  // --- MUTATION: Simpan Akun Member ---
  const updateAccountMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/member/account', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan akun')
      }
      return data
    },
    onSuccess: (data) => {
      showToast(t('settings.accountSavedSuccess'), 'success')
      setIsChangingPassword(false)
      setNewPassword('')
      setConfirmPassword('')
      setCurrentPassword('')
      if (updateUser && data.username !== undefined) {
        updateUser({ username: data.username, name: data.fullName || fullName.trim() })
      }
      queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
    },
    onError: (err) => {
      showToast(err.message, 'error')
    },
  })

  const handleSaveAccount = (e) => {
    e.preventDefault()

    // Validasi Nama Lengkap
    if (fullName.trim().length < 2 || fullName.trim().length > 60) {
      return showToast('Nama lengkap harus terdiri dari 2 hingga 60 karakter', 'error')
    }

    // Validasi Username
    if (cleanUsername) {
      if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
        return showToast('Username harus 3-30 karakter (hanya huruf kecil, angka, dan underscore)', 'error')
      }
      if (RESERVED_USERNAMES.includes(cleanUsername)) {
        return showToast(`Username "${cleanUsername}" tidak diizinkan karena merupakan kata khusus sistem. Silakan gunakan username lain.`, 'error')
      }
    }

    // Validasi Password Baru (Hanya jika opsi ganti kata sandi diaktifkan)
    if (isChangingPassword) {
      if (!newPassword) {
        return showToast('Silakan masukkan kata sandi baru Anda', 'error')
      }
      if (newPassword.length < 10 || !/^(?=.*[a-zA-Z])(?=.*[0-9]).{10,}$/.test(newPassword)) {
        return showToast('Kata sandi baru minimal 10 karakter (kombinasi huruf dan angka)', 'error')
      }
      if (!confirmPassword) {
        return showToast('Harap masukkan konfirmasi kata sandi baru Anda', 'error')
      }
      if (newPassword !== confirmPassword) {
        return showToast('Konfirmasi kata sandi baru tidak cocok dengan kata sandi baru', 'error')
      }
    }

    // Validasi Password Saat Ini
    if (requireCurrentPassword && !currentPassword) {
      return showToast(t('settings.currentPasswordHelp'), 'error')
    }

    const payload = {
      fullName: fullName.trim(),
      username: cleanUsername || null,
      telegramUsername: telegramUsername.trim() || null,
      ...(isChangingPassword && newPassword ? { newPassword, confirmPassword } : {}),
      ...(requireCurrentPassword ? { currentPassword } : {}),
    }

    updateAccountMutation.mutate(payload)
  }

  // --- MODAL 1: VERIFIKASI TELEGRAM LEWAT BOT ---
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyState, setVerifyState] = useState('generating') // 'generating' | 'waiting' | 'success' | 'expired'
  const [linkTokenData, setLinkTokenData] = useState(null)
  const [countdownSeconds, setCountdownSeconds] = useState(600)
  const [copiedLink, setCopiedLink] = useState(false)
  const pollIntervalRef = useRef(null)

  // Membuka modal dan request token
  const handleOpenVerifyModal = async () => {
    if (!telegramUsername.trim()) {
      return showToast('Isi username Telegram Anda terlebih dahulu', 'error')
    }
    setShowVerifyModal(true)
    setVerifyState('generating')
    setLinkTokenData(null)
    setCountdownSeconds(600)

    try {
      const res = await apiFetch('/api/member/telegram/link-token', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat tautan bot Telegram')
      }
      setLinkTokenData(data)
      setVerifyState('waiting')
    } catch (err) {
      showToast(err.message, 'error')
      setShowVerifyModal(false)
    }
  }

  // Countdown timer 10 menit
  useEffect(() => {
    let timer = null
    if (showVerifyModal && verifyState === 'waiting' && countdownSeconds > 0) {
      timer = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            setVerifyState('expired')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [showVerifyModal, verifyState, countdownSeconds])

  // Polling status Telegram setiap 3 detik
  useEffect(() => {
    if (showVerifyModal && verifyState === 'waiting') {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await apiFetch('/api/member/telegram/status')
          if (res.ok) {
            const data = await res.json()
            if (data.verified) {
              setVerifyState('success')
              clearInterval(pollIntervalRef.current)
              queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
            }
          }
        } catch {
          // ignore network polling hiccups
        }
      }, 3000)
    }
    return () => clearInterval(pollIntervalRef.current)
  }, [showVerifyModal, verifyState, queryClient])

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleCopyCommand = () => {
    if (linkTokenData?.startCommand) {
      navigator.clipboard.writeText(linkTokenData.startCommand)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2500)
    }
  }

  // --- MODAL 2: PUTUSKAN TELEGRAM ---
  const [showUnlinkModal, setShowUnlinkModal] = useState(false)
  const [unlinkPassword, setUnlinkPassword] = useState('')
  const unlinkTelegramMutation = useMutation({
    mutationFn: async (password) => {
      const res = await apiFetch('/api/member/telegram', {
        method: 'DELETE',
        body: JSON.stringify({ currentPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memutuskan tautan')
      return data
    },
    onSuccess: () => {
      showToast(t('settings.unlinkSuccess'), 'success')
      setShowUnlinkModal(false)
      setUnlinkPassword('')
      queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
    },
    onError: (err) => showToast(err.message, 'error'),
  })

  // --- FORM STATE KARTU 2 (METODE PENCAIRAN SALDO) ---
  const payout = accountData?.payout
  const providers = accountData?.providers || { bank: [], ewallet: [] }
  const isPayoutLocked = Boolean(payout && payout.locked)

  // Form input jika belum terkunci
  const [payoutType, setPayoutType] = useState('bank') // 'bank' | 'ewallet'
  const [providerName, setProviderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const [payoutCurrentPassword, setPayoutCurrentPassword] = useState('')
  const [showPayoutPassword, setShowPayoutPassword] = useState(false)
  const [showConfirmLockModal, setShowConfirmLockModal] = useState(false)

  // Segmented tab switch: kosongkan data form saat berpindah tab
  const handleTabSwitch = (newType) => {
    if (newType === payoutType) return
    setPayoutType(newType)
    setProviderName('')
    setAccountNumber('')
    setHolderName('')
    setPayoutCurrentPassword('')
  }

  // --- MUTATION: Simpan Rekening Penarikan ---
  const savePayoutMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/member/payout', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan rekening')
      return data
    },
    onSuccess: () => {
      showToast(t('settings.payoutSavedSuccess'), 'success')
      setShowConfirmLockModal(false)
      setPayoutCurrentPassword('')
      queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
    },
    onError: (err) => {
      showToast(err.message, 'error')
    },
  })

  const handlePreSavePayout = (e) => {
    e.preventDefault()
    if (!providerName) {
      return showToast('Silakan pilih bank atau penyedia e-wallet terlebih dahulu', 'error')
    }
    if (!accountNumber || accountNumber.length < 5) {
      return showToast('Nomor rekening atau HP tidak valid (minimal 5 digit)', 'error')
    }
    if (!holderName.trim() || holderName.trim().length < 2) {
      return showToast('Nama pemilik rekening minimal 2 karakter', 'error')
    }
    if (!payoutCurrentPassword) {
      return showToast('Kata sandi saat ini wajib diisi untuk verifikasi keamanan', 'error')
    }
    setShowConfirmLockModal(true)
  }

  const handleConfirmLockPayout = () => {
    savePayoutMutation.mutate({
      type: payoutType,
      providerName,
      accountNumber: accountNumber.trim(),
      holderName: holderName.trim(),
      currentPassword: payoutCurrentPassword,
    })
  }

  // --- MODAL 3: PENGAJUAN GANTI REKENING ---
  const [showChangeReqModal, setShowChangeReqModal] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const changeRequestMutation = useMutation({
    mutationFn: async (reason) => {
      const res = await apiFetch('/api/member/payout/change-request', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengajukan permohonan')
      return data
    },
    onSuccess: () => {
      showToast(t('settings.changeRequestSuccess'), 'success')
      setShowChangeReqModal(false)
      setChangeReason('')
      queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
    },
    onError: (err) => showToast(err.message, 'error'),
  })

  // SKELETON LOADING STATE
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="space-y-2">
            <div className="h-7 w-48 bg-slate-200 rounded-lg" />
            <div className="h-4 w-72 bg-slate-200 rounded-lg" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 space-y-6">
          <div className="h-6 w-40 bg-slate-200 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-11 bg-slate-200 rounded-xl" />
            <div className="h-11 bg-slate-200 rounded-xl" />
          </div>
          <div className="h-11 bg-slate-200 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-11 bg-slate-200 rounded-xl" />
            <div className="h-11 bg-slate-200 rounded-xl" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 space-y-6">
          <div className="h-6 w-48 bg-slate-200 rounded-lg" />
          <div className="h-12 bg-slate-200 rounded-xl" />
          <div className="h-11 bg-slate-200 rounded-xl" />
        </div>
      </div>
    )
  }

  // ERROR STATE
  if (isError) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Gagal Memuat Pengaturan</h2>
        <p className="text-sm text-slate-500 mb-6">{error?.message || 'Terjadi kesalahan sistem'}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Coba Muat Ulang
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Toast Notification Popup */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* TOP HEADER DENGAN TOMBOL KEMBALI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/app')}
            aria-label={t('settings.back')}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-all duration-150 shadow-xs flex-shrink-0"
          >
            <ArrowLeft className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {t('settings.pageTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {t('settings.pageSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KARTU 1: INFORMASI AKUN (IKON ORANG)                                     */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50/70 to-transparent">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0 border border-blue-100/60 shadow-xs">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {t('settings.card1Title')}
            </h2>
            <p className="text-xs text-slate-500">
              {t('settings.card1Desc')}
            </p>
          </div>
        </div>

        {/* Card Body */}
        <form onSubmit={handleSaveAccount} autoComplete="off" className="p-6 sm:p-8 space-y-6">
          {/* Hidden inputs untuk mencegah browser autofill liar menimpa username/password */}
          <input type="text" name="fake_username_remember" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
          <input type="password" name="fake_password_remember" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

          {/* Grid 2 Kolom Desktop: Nama Lengkap & Username */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* 1. Nama Lengkap */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                {t('settings.fullName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('settings.fullNamePlaceholder')}
                autoComplete="off"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                maxLength={60}
                required
              />
            </div>

            {/* 2. Username (Dapat Dibuat / Diubah) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                {t('settings.username')}
              </label>
              <div className="relative">
                <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                  placeholder={t('settings.usernamePlaceholder', 'buat_username')}
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full ps-8 pe-4 py-2.5 bg-white border ${
                    isReservedUsername
                      ? 'border-red-300 focus:ring-red-200 focus:border-red-500'
                      : 'border-slate-200 focus:ring-primary/20 focus:border-primary'
                  } rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 transition-all duration-150`}
                  maxLength={30}
                />
              </div>
              {isReservedUsername ? (
                <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Username "@{cleanUsername}" tidak diizinkan karena kata khusus sistem.
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  {t('settings.usernameHelp', 'Dapat digunakan untuk login selain email (3-30 karakter).')}
                </p>
              )}
            </div>
          </div>

          {/* 3. Telegram Username (Lebar Penuh dengan Badge & Aksi Verifikasi) */}
          <div className="pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('settings.telegramUsername')}
              </label>
              {/* Badge Status Verifikasi Telegram */}
              {accountData?.telegram?.verified ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  {t('settings.telegramVerified')}
                  {accountData?.telegram?.linkedAt && (
                    <span className="text-[11px] text-emerald-600 font-normal">
                      ({t('settings.linkedAt', { date: formatDate(accountData.telegram.linkedAt, i18n.language) })})
                    </span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {t('settings.telegramNotVerified')}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Input Group dengan Prefiks @ */}
              <div className="relative flex-1 flex rounded-xl shadow-xs">
                <span className="inline-flex items-center px-3.5 rounded-s-xl border border-e-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-semibold select-none">
                  @
                </span>
                <input
                  type="text"
                  value={telegramUsername.replace(/^@/, '')}
                  onChange={(e) => setTelegramUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="username_telegram"
                  className="flex-1 min-w-0 block w-full px-4 py-2.5 rounded-none rounded-e-xl border border-slate-200 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                  maxLength={32}
                />
              </div>

              {/* Tombol Aksi Verifikasi / Putuskan */}
              {!accountData?.telegram?.verified ? (
                <button
                  type="button"
                  onClick={handleOpenVerifyModal}
                  disabled={!telegramUsername.trim()}
                  className="px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-xs flex-shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t('settings.verifyViaBot')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUnlinkModal(true)}
                  className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-xs flex-shrink-0"
                >
                  <span>{t('settings.unlinkTelegram')}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-2">
              {t('settings.telegramHelp')}
            </p>

            {/* Peringatan kecil bila username diubah */}
            {isTgChanged && (
              <p className="text-xs text-amber-600 font-medium mt-1.5 flex items-center gap-1.5 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t('settings.usernameChangeWarning')}</span>
              </p>
            )}
          </div>

          {/* 4. Section: Ganti Kata Sandi (Collapsible Toggle) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center flex-shrink-0 border border-blue-100/60 shadow-xs">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Ganti Kata Sandi
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aktifkan opsi ini jika Anda ingin memperbarui kata sandi akun
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChangingPassword}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setIsChangingPassword(checked)
                    if (!checked) {
                      setNewPassword('')
                      setConfirmPassword('')
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {isChangingPassword && (
              <div className="mt-4 p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                  {/* Password Baru */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      {t('settings.newPassword')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 10 karakter (huruf & angka)"
                        autoComplete="new-password"
                        className="w-full px-4 py-2.5 pe-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Ulangi Password */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      {t('settings.confirmPassword')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ketik ulang kata sandi baru"
                        autoComplete="new-password"
                        className="w-full px-4 py-2.5 pe-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Match indicator */}
                    {confirmPassword && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs">
                        {newPassword === confirmPassword ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Kata sandi cocok
                          </span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Konfirmasi belum cocok
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Indikator Kekuatan Password */}
                {passwordStrength && (
                  <div className="pt-1 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full ${passwordStrength.color} ${passwordStrength.width} transition-all duration-300`} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {t('settings.passwordStrength')}: <span className="font-bold">{passwordStrength.label}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Password Saat Ini (Muncul bila Password Baru diisi atau Username/Telegram diubah) */}
          {requireCurrentPassword && (
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100/80 animate-[fadeIn_0.2s_ease-out]">
              <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1.5">
                {t('settings.currentPassword')} <span className="text-red-500">*</span>
              </label>
              <div className="relative max-w-md">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun saat ini"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pe-10 bg-white border border-blue-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-blue-700/80 mt-1.5">
                {t('settings.currentPasswordHelp')}
              </p>
            </div>
          )}

          {/* Card Footer: Tombol Simpan Akun */}
          <div className="flex items-center justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={!isAccountDirty || updateAccountMutation.isPending}
              className="px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-all duration-150 shadow-md shadow-primary/20"
            >
              <Save className="w-4 h-4" />
              <span>
                {updateAccountMutation.isPending ? t('settings.saving') : t('settings.saveAccount')}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* KARTU 2: METODE PENCAIRAN SALDO (IKON KARTU)                              */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50/70 to-transparent">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0 border border-blue-100/60 shadow-xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {t('settings.card2Title')}
            </h2>
            <p className="text-xs text-slate-500">
              {t('settings.card2Desc')}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* KONDISI A: REKENING SUDAH TERKUNCI */}
          {isPayoutLocked ? (
            <div className="space-y-6">
              {/* Banner Amber Pemberitahuan Terkunci */}
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-950">
                      {t('settings.lockedBanner')}
                    </h3>
                    <p className="text-xs text-amber-800/90 mt-0.5">
                      Demi keamanan saldo dan komisi Anda, rekening tujuan penarikan dikunci secara permanen.
                    </p>
                  </div>
                </div>

                {/* Tombol atau Badge Permintaan Ganti Rekening */}
                <div className="flex-shrink-0">
                  {payout?.pendingChangeRequest ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t('settings.pendingAdminApproval')}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowChangeReqModal(true)}
                      className="px-4 py-2 bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{t('settings.requestChange')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Info Masa Penahanan Penarikan (Hold 24 Jam) jika belum lewat */}
              {payout?.withdrawHoldUntil && new Date(payout.withdrawHoldUntil) > new Date() && (
                <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-blue-700 flex-shrink-0" />
                  <p className="text-xs text-blue-900 font-medium">
                    {t('settings.holdNotice', { date: formatDateTime(payout.withdrawHoldUntil, i18n.language) })}
                  </p>
                </div>
              )}

              {/* Data Rekening Terkunci (Read-Only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 bg-slate-50/60 p-6 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {t('settings.payoutType')}
                  </label>
                  <input
                    type="text"
                    value={payout.type === 'ewallet' ? t('settings.eWallet') : t('settings.bankAccount')}
                    readOnly
                    disabled
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-not-allowed select-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {payout.type === 'ewallet' ? t('settings.selectEwallet') : t('settings.selectBank')}
                  </label>
                  <input
                    type="text"
                    value={payout.providerName}
                    readOnly
                    disabled
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-not-allowed select-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {payout.type === 'ewallet' ? t('settings.accountNumberEwallet') : t('settings.accountNumberBank')}
                  </label>
                  <input
                    type="text"
                    value={payout.accountNumberMasked || '••••'}
                    readOnly
                    disabled
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono tracking-widest font-bold text-slate-800 cursor-not-allowed select-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {payout.type === 'ewallet' ? t('settings.holderNameEwallet') : t('settings.holderNameBank')}
                  </label>
                  <input
                    type="text"
                    value={payout.holderName}
                    readOnly
                    disabled
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-not-allowed select-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* KONDISI B: REKENING BELUM ADA / UNLOCKED */
            <form onSubmit={handlePreSavePayout} className="space-y-6">
              {/* Segmented Tab: Rekening Bank | e-Wallet */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  {t('settings.payoutType')} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl max-w-md">
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('bank')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-150 ${
                      payoutType === 'bank'
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Landmark className="w-4 h-4" />
                    <span>{t('settings.bankAccount')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('ewallet')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-150 ${
                      payoutType === 'ewallet'
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>{t('settings.eWallet')}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {t('settings.tabSwitchWarning')}
                </p>
              </div>

              {/* Form Input Detail Rekening */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                {/* Provider Select (Bank / E-Wallet) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {payoutType === 'bank' ? t('settings.selectBank') : t('settings.selectEwallet')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                    required
                  >
                    <option value="">{t('settings.chooseProvider')}</option>
                    {(providers[payoutType] || []).map((prov) => (
                      <option key={prov} value={prov}>
                        {prov}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nomor Rekening / No HP */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {payoutType === 'bank' ? t('settings.accountNumberBank') : t('settings.accountNumberEwallet')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={payoutType === 'bank' ? 'Contoh: 1234567890' : 'Contoh: 081234567890'}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                    maxLength={20}
                    required
                  />
                </div>

                {/* Nama Pemilik Rekening / E-Wallet */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {payoutType === 'bank' ? t('settings.holderNameBank') : t('settings.holderNameEwallet')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value.replace(/[^a-zA-Z\s.]/g, ''))}
                    placeholder={t('settings.holderNamePlaceholder')}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                    maxLength={60}
                    required
                  />
                  <p className="text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{t('settings.nameMismatchWarning')}</span>
                  </p>
                </div>

                {/* Password Saat Ini (Wajib Konfirmasi) */}
                <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('settings.currentPasswordPayout')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative max-w-md">
                    <input
                      type={showPayoutPassword ? 'text' : 'password'}
                      value={payoutCurrentPassword}
                      onChange={(e) => setPayoutCurrentPassword(e.target.value)}
                      placeholder="Masukkan kata sandi akun Anda"
                      className="w-full px-4 py-2.5 pe-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPayoutPassword(!showPayoutPassword)}
                      className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPayoutPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Footer: Tombol Simpan Rekening */}
              <div className="flex items-center justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savePayoutMutation.isPending}
                  className="px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-all duration-150 shadow-md shadow-primary/20"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('settings.savePayout')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* FOOTER KECIL HALAMAN */}
      <div className="text-center pt-4">
        <p className="text-xs text-slate-400 font-medium">
          {t('settings.footerDesigned')}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: VERIFIKASI AKUN TELEGRAM VIA BOT                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showVerifyModal}
        onClose={() => {
          if (verifyState === 'success') {
            queryClient.invalidateQueries({ queryKey: ['memberAccount'] })
          }
          setShowVerifyModal(false)
        }}
        title={t('settings.modalVerifyTitle')}
        subtitle={t('settings.modalVerifySubtitle')}
        maxWidth="md"
      >
        <div className="space-y-6 text-center py-2">
          {/* STATE 1: GENERATING */}
          {verifyState === 'generating' && (
            <div className="py-8 space-y-3">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Menyiapkan tautan verifikasi...</p>
            </div>
          )}

          {/* STATE 2: WAITING / IN PROGRESS */}
          {verifyState === 'waiting' && linkTokenData && (
            <div className="space-y-5 text-start">
              {/* Box Countdown */}
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {t('settings.validUntil')}:
                </span>
                <span className="font-mono font-extrabold text-primary text-sm">
                  {formatCountdown(countdownSeconds)}
                </span>
              </div>

              {/* Tombol Utama: Buka Bot Telegram */}
              <a
                href={linkTokenData.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition-all duration-150"
              >
                <Send className="w-4 h-4" />
                <span>{t('settings.openTelegramBot')}</span>
                <ExternalLink className="w-3.5 h-3.5 ms-1" />
              </a>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="flex-shrink mx-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  atau
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Salin Perintah untuk Telegram Desktop */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('settings.copyCommandDesktop')}
                </label>
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-slate-800 break-all select-all font-semibold">
                    {linkTokenData.startCommand}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 flex items-center gap-1 text-xs font-bold flex-shrink-0 shadow-2xs transition-colors"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* Status Polling Pulse */}
              <div className="flex items-center gap-2.5 pt-2 text-xs text-slate-500 font-medium justify-center">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
                <span>{t('settings.waitingBotConfirmation')}</span>
              </div>
            </div>
          )}

          {/* STATE 3: SUCCESS */}
          {verifyState === 'success' && (
            <div className="py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto animate-[bounce_0.5s_ease-out]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('settings.verifySuccess')}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {t('settings.verifySuccessDesc')}
              </p>
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="mt-4 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
              >
                {t('settings.close')}
              </button>
            </div>
          )}

          {/* STATE 4: EXPIRED */}
          {verifyState === 'expired' && (
            <div className="py-6 space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('settings.verifyExpired')}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {t('settings.verifyExpiredDesc')}
              </p>
              <button
                type="button"
                onClick={handleOpenVerifyModal}
                className="mt-4 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
              >
                {t('settings.tryAgain')}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: KONFIRMASI PUTUSKAN TELEGRAM                                      */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showUnlinkModal}
        onClose={() => {
          setShowUnlinkModal(false)
          setUnlinkPassword('')
        }}
        title={t('settings.modalUnlinkTitle')}
        subtitle={t('settings.modalUnlinkSubtitle')}
        maxWidth="md"
        footer={(
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                setShowUnlinkModal(false)
                setUnlinkPassword('')
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={() => unlinkTelegramMutation.mutate(unlinkPassword)}
              disabled={!unlinkPassword || unlinkTelegramMutation.isPending}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl transition-colors shadow-xs"
            >
              {unlinkTelegramMutation.isPending ? 'Memproses...' : t('settings.unlinkTelegram')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-600">
            Masukkan kata sandi akun Anda untuk mengonfirmasi pemutusan tautan Telegram:
          </p>
          <input
            type="password"
            value={unlinkPassword}
            onChange={(e) => setUnlinkPassword(e.target.value)}
            placeholder="Kata sandi akun saat ini"
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            required
          />
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: PENGAJUAN GANTI REKENING KE ADMIN                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showChangeReqModal}
        onClose={() => {
          setShowChangeReqModal(false)
          setChangeReason('')
        }}
        title={t('settings.modalChangeReqTitle')}
        subtitle={t('settings.modalChangeReqSubtitle')}
        maxWidth="lg"
        footer={(
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                setShowChangeReqModal(false)
                setChangeReason('')
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={() => changeRequestMutation.mutate(changeReason.trim())}
              disabled={changeReason.trim().length < 10 || changeRequestMutation.isPending}
              className="px-5 py-2 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl transition-colors shadow-xs"
            >
              {changeRequestMutation.isPending ? t('settings.sending') : t('settings.sendRequest')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              {t('settings.reasonLabel')} <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder={t('settings.reasonPlaceholder')}
              maxLength={500}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150 resize-none"
            />
            <div className="flex items-center justify-between mt-1.5 text-xs text-slate-400">
              <span>Minimal 10 karakter</span>
              <span>{changeReason.length} / 500 {t('settings.characters')}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: DIALOG KONFIRMASI PENGUNCIAN REKENING PENARIKAN                  */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showConfirmLockModal}
        onClose={() => setShowConfirmLockModal(false)}
        title={t('settings.confirmPayoutTitle')}
        maxWidth="md"
        footer={(
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => setShowConfirmLockModal(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmLockPayout}
              disabled={savePayoutMutation.isPending}
              className="px-5 py-2 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl transition-colors shadow-xs"
            >
              {savePayoutMutation.isPending ? 'Menyimpan...' : t('settings.confirmPayoutBtn')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4 py-2 text-slate-700 text-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <p className="text-center font-medium">
            {t('settings.confirmPayoutDesc')}
          </p>
          <div className="bg-slate-50 p-4 rounded-xl text-xs space-y-1.5 border border-slate-200/80">
            <div className="flex justify-between">
              <span className="text-slate-500">Tipe:</span>
              <span className="font-bold text-slate-800">{payoutType === 'bank' ? 'Rekening Bank' : 'e-Wallet'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Penyedia:</span>
              <span className="font-bold text-slate-800">{providerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Nomor:</span>
              <span className="font-bold font-mono text-slate-800">{accountNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Nama Pemilik:</span>
              <span className="font-bold text-slate-800">{holderName}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
