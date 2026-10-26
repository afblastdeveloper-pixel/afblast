import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Unlink,
  Link2,
  Lock,
  Loader2,
  X,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Badge from '../ui/Badge'

const DEFAULT_BOT_NAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'AFBlastRecoveryBot'

export default function TelegramStatusCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Modal states
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showUnlinkModal, setShowUnlinkModal] = useState(false)

  // Link token state
  const [linkData, setLinkData] = useState(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState('')

  // Unlink form state
  const [password, setPassword] = useState('')
  const [unlinkLoading, setUnlinkLoading] = useState(false)
  const [unlinkError, setUnlinkError] = useState('')

  // Fetch status
  const {
    data: statusData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['memberTelegramStatus'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/telegram/status')
      if (!res.ok) {
        throw new Error('Gagal memuat status Telegram')
      }
      return res.json()
    },
    staleTime: 10000,
  })

  const isLinked = Boolean(statusData?.linked)
  const botName = statusData?.botUsername || linkData?.botUsername || DEFAULT_BOT_NAME

  // Polling saat modal Tautkan dibuka
  const pollingRef = useRef(null)
  useEffect(() => {
    if (!showLinkModal || isLinked) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }

    const poll = async () => {
      try {
        const res = await apiFetch('/api/member/telegram/status')
        if (res.ok) {
          const data = await res.json()
          if (data.linked) {
            queryClient.invalidateQueries(['memberTelegramStatus'])
            setShowLinkModal(false)
          }
        }
      } catch {
        // Abaikan
      }
    }

    pollingRef.current = setInterval(poll, 3000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [showLinkModal, isLinked, queryClient])

  // Handle buka modal tautkan
  const handleOpenLinkModal = async () => {
    setLinkError('')
    setShowLinkModal(true)
    setLinkLoading(true)
    try {
      const res = await apiFetch('/api/member/telegram/link-token', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat token tautan Telegram.')
      }
      setLinkData(data)
    } catch (err) {
      setLinkError(err.message || 'Gagal menghubungkan ke server Telegram.')
    } finally {
      setLinkLoading(false)
    }
  }

  // Handle putuskan tautan
  const handleUnlink = async (e) => {
    e?.preventDefault()
    setUnlinkError('')

    if (!password.trim()) {
      setUnlinkError(t('telegram.passwordRequired', 'Masukkan kata sandi untuk konfirmasi.'))
      return
    }

    setUnlinkLoading(true)
    try {
      const res = await apiFetch('/api/member/telegram', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memutuskan tautan Telegram.')
      }

      queryClient.invalidateQueries(['memberTelegramStatus'])
      setShowUnlinkModal(false)
      setPassword('')
    } catch (err) {
      setUnlinkError(err.message || 'Terjadi kesalahan sistem saat memutuskan Telegram.')
    } finally {
      setUnlinkLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center flex-shrink-0 shadow-xs">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900">
                  {t('telegram.recoveryTitle', 'Pemulihan Akun via Telegram')}
                </h3>
                {isLoading ? (
                  <span className="w-16 h-5 bg-gray-100 animate-pulse rounded-full" />
                ) : isLinked ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="w-3 h-3 me-1" />
                    {t('telegram.statusLinked', 'Tertaut')}
                  </Badge>
                ) : (
                  <Badge variant="warning" size="sm">
                    <ShieldAlert className="w-3 h-3 me-1" />
                    {t('telegram.statusUnlinked', 'Belum Tertaut')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-xl leading-relaxed">
                {isLinked
                  ? t(
                      'telegram.descLinked',
                      'Akun Telegram Anda terhubung aktif. Gunakan bot resmi untuk mereset kata sandi kapan saja secara mandiri.'
                    )
                  : t(
                      'telegram.descUnlinked',
                      'Tautkan akun Anda ke bot Telegram resmi agar dapat melakukan reset kata sandi mandiri secara aman.'
                    )}
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 w-full sm:w-auto">
            {isLoading ? (
              <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-xl" />
            ) : isLinked ? (
              <button
                type="button"
                onClick={() => {
                  setUnlinkError('')
                  setPassword('')
                  setShowUnlinkModal(true)
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>{t('telegram.unlinkButton', 'Putuskan')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenLinkModal}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#229ED9] hover:bg-[#1E88E5] shadow-xs shadow-blue-400/20 rounded-xl transition-all"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{t('telegram.linkButton', 'Tautkan Telegram')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Tautkan Telegram */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative space-y-4">
            <button
              onClick={() => setShowLinkModal(false)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 p-1 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-[#229ED9] flex items-center justify-center mb-3">
                <Send className="w-6 h-6 -rotate-12 translate-x-0.5" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {t('telegram.modalLinkTitle', 'Tautkan Akun Telegram')}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {t('telegram.modalLinkSubtitle', 'Buka bot pemulihan resmi kami dan klik tombol Start.')}
              </p>
            </div>

            {linkLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>{t('telegram.generatingToken', 'Menghubungkan ke bot Telegram...')}</span>
              </div>
            ) : linkError ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{linkError}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 text-xs text-gray-700 space-y-2">
                  <p className="font-semibold text-gray-900">
                    Langkah Aktivasi:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600">
                    <li>Klik tombol <strong>Buka Bot Telegram</strong> di bawah.</li>
                    <li>Tekan <strong>Start</strong> di aplikasi Telegram.</li>
                    <li>Status akan otomatis terhubung di halaman ini.</li>
                  </ol>
                </div>

                <div className="flex items-center justify-center gap-2 py-2 text-xs text-gray-500 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-[#229ED9]" />
                  <span>{t('telegram.waitingConfirmation', 'Menunggu konfirmasi di bot Telegram...')}</span>
                </div>

                <a
                  href={linkData?.deepLink || `https://t.me/${botName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#229ED9] hover:bg-[#1E88E5] shadow-md shadow-blue-400/20 transition-all"
                >
                  <span>{t('telegram.openTelegramBot', 'Buka Bot Telegram')}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Putuskan Tautan (Wajib Konfirmasi Password) */}
      {showUnlinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative space-y-4">
            <button
              onClick={() => setShowUnlinkModal(false)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 p-1 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                <Unlink className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {t('telegram.unlinkConfirmTitle', 'Putuskan Tautan Telegram')}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {t(
                  'telegram.unlinkConfirmSubtitle',
                  'Setelah diputuskan, Anda tidak bisa lagi mereset password mandiri melalui bot Telegram.'
                )}
              </p>
            </div>

            {unlinkError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{unlinkError}</span>
              </div>
            )}

            <form onSubmit={handleUnlink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('telegram.confirmPasswordForUnlink', 'Konfirmasi Kata Sandi Anda')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('telegram.enterCurrentPassword', 'Masukkan kata sandi saat ini')}
                    className="w-full ps-10 pe-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnlinkModal(false)}
                  className="w-1/2 py-2.5 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  {t('common.cancel', 'Batal')}
                </button>
                <button
                  type="submit"
                  disabled={unlinkLoading || !password.trim()}
                  className="w-1/2 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {unlinkLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('telegram.confirmUnlink', 'Ya, Putuskan')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
