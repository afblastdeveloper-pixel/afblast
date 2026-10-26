import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Smartphone, QrCode, RefreshCw, CheckCircle2, Copy, Check,
  AlertCircle, X, ShieldCheck
} from 'lucide-react'
import Modal from '../ui/Modal'
import { apiFetch } from '../../utils/client'

export default function LinkDeviceModal({
  isOpen,
  onClose,
  targetDevice = null, // if provided, reconnect mode; if null, add device mode
  onSuccess,
}) {
  const { t } = useTranslation()

  const isReconnect = Boolean(targetDevice)
  const [activeTab, setActiveTab] = useState('qr') // 'qr' | 'code'
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [deviceId, setDeviceId] = useState(null)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'polling' | 'connected' | 'expired' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const pollingRef = useRef(null)
  const countdownRef = useRef(null)

  // Initialize modal state on open
  useEffect(() => {
    if (!isOpen) {
      cleanup()
      return
    }

    if (isReconnect && targetDevice) {
      setDeviceId(targetDevice.id)
      const cleanPhone = String(targetDevice.phone || '').replace(/\D/g, '')
      setPhone(cleanPhone.startsWith('62') ? cleanPhone : cleanPhone ? `62${cleanPhone}` : '62')
      startSession(targetDevice.id, 'qr')
    } else {
      setPhone('62')
      setDeviceId(null)
      startNewDeviceSession('qr')
    }
  }, [isOpen, isReconnect, targetDevice])

  const cleanup = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setStatus('idle')
    setQrCodeUrl('')
    setPairingCode('')
    setErrorMsg('')
    setPhoneError('')
    setCodeCopied(false)
  }

  // Create new device slot if adding new device
  const startNewDeviceSession = async (method = 'qr') => {
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await apiFetch('/api/member/devices', {
        method: 'POST',
        body: JSON.stringify({ label: `Slot WhatsApp Baru` }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyiapkan slot perangkat baru')
      }
      setDeviceId(data.device.id)
      if (method === 'qr') {
        await loadQr(data.device.id)
      } else {
        setStatus('idle')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  // Start session for existing device (reconnect)
  const startSession = async (devId, method = 'qr') => {
    setStatus('loading')
    setErrorMsg('')
    try {
      await apiFetch(`/api/member/devices/${devId}/reconnect`, {
        method: 'POST',
        body: JSON.stringify({ phone }),
      })
      if (method === 'qr') {
        await loadQr(devId)
      } else {
        setStatus('idle')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  // Load QR Code
  const loadQr = async (devId) => {
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await apiFetch(`/api/member/devices/${devId}/link/qr`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memuat kode QR')

      setQrCodeUrl(data.qr)
      setStatus('polling')
      startCountdown(60)
      startPolling(devId)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  // Request Pairing Code
  const handleRequestCode = async (e) => {
    e?.preventDefault()
    const clean = phone.replace(/\D/g, '')
    if (!clean.startsWith('62') || clean.length < 10) {
      setPhoneError('Nomor WhatsApp harus berawalan 62 dan minimal 10 digit.')
      return
    }
    setPhoneError('')

    let currentDevId = deviceId
    if (!currentDevId) {
      setStatus('loading')
      try {
        const createRes = await apiFetch('/api/member/devices', {
          method: 'POST',
          body: JSON.stringify({ label: 'Slot WhatsApp Baru' }),
        })
        const createData = await createRes.json()
        if (!createRes.ok) throw new Error(createData.error || 'Gagal membuat slot')
        currentDevId = createData.device.id
        setDeviceId(currentDevId)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err.message)
        return
      }
    }

    setStatus('loading')
    try {
      const res = await apiFetch(`/api/member/devices/${currentDevId}/link/code`, {
        method: 'POST',
        body: JSON.stringify({ phone: clean }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal meminta kode tautan')

      setPairingCode(data.code)
      setStatus('polling')
      startCountdown(60)
      startPolling(currentDevId)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  const startCountdown = (initialSec = 60) => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(initialSec)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          setStatus('expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const startPolling = (devId) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/member/devices/${devId}/status`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'connected') {
            clearInterval(pollingRef.current)
            clearInterval(countdownRef.current)
            setStatus('connected')
            setTimeout(() => {
              if (onSuccess) onSuccess()
              handleModalClose()
            }, 1500)
          }
        }
      } catch (_) {}
    }, 3000)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setErrorMsg('')
    if (deviceId) {
      if (tab === 'qr') {
        loadQr(deviceId)
      } else {
        if (pollingRef.current) clearInterval(pollingRef.current)
        if (countdownRef.current) clearInterval(countdownRef.current)
        setStatus(pairingCode ? 'polling' : 'idle')
      }
    }
  }

  const handleCopyCode = () => {
    if (!pairingCode) return
    navigator.clipboard?.writeText(pairingCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const handleModalClose = () => {
    cleanup()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleModalClose} size="md">
      <div className="p-6 space-y-5 text-start">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                {isReconnect
                  ? t('memberWhatsapp.modalReconnectTitle', { slot: targetDevice?.slotNumber || 1 })
                  : t('memberWhatsapp.modalLinkTitle', 'Hubungkan WhatsApp')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isReconnect
                  ? `Menyambungkan kembali nomor terdaftar ${targetDevice?.phone || ''}`
                  : 'Pilih metode penautan akun WhatsApp Anda'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: QR vs CODE */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
          <button
            type="button"
            onClick={() => handleTabChange('qr')}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
              activeTab === 'qr'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            ].join(' ')}
          >
            <QrCode className="w-4 h-4" />
            <span>{t('memberWhatsapp.tabQr', 'Scan QR')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('code')}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
              activeTab === 'code'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            ].join(' ')}
          >
            <Smartphone className="w-4 h-4" />
            <span>{t('memberWhatsapp.tabCode', 'Gunakan Kode')}</span>
          </button>
        </div>

        {/* Success View */}
        {status === 'connected' ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">
              {t('memberWhatsapp.statusConnectedSuccess', 'WhatsApp Berhasil Ditautkan!')}
            </h4>
            <p className="text-xs text-slate-500">Perangkat Anda telah siap untuk sesi blast.</p>
          </div>
        ) : (
          <>
            {/* TAB 1: SCAN QR */}
            {activeTab === 'qr' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 relative min-h-[220px]">
                  {status === 'loading' ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-slate-400 py-10">
                      <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                      <span>Membuat sesi QR WhatsApp...</span>
                    </div>
                  ) : status === 'expired' ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {t('memberWhatsapp.statusExpired', 'Sesi QR telah kedaluwarsa.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => deviceId && loadQr(deviceId)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-110"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t('memberWhatsapp.qrRefreshBtn', 'Perbarui QR')}</span>
                      </button>
                    </div>
                  ) : qrCodeUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200">
                        <img
                          src={qrCodeUrl}
                          alt="WhatsApp QR Code"
                          className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                        />
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>{t('memberWhatsapp.qrExpiryCountdown', { seconds: countdown })}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Instructions */}
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                  <p className="font-bold text-primary dark:text-blue-300">Petunjuk Pemindaian:</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <li>{t('memberWhatsapp.qrInstruction1', 'Buka WhatsApp di ponsel Anda')}</li>
                    <li>{t('memberWhatsapp.qrInstruction2', 'Ketuk Menu (Android) atau Pengaturan (iPhone) > Perangkat Tertaut')}</li>
                    <li>{t('memberWhatsapp.qrInstruction3', 'Arahkan kamera ponsel Anda ke kode QR di layar ini')}</li>
                  </ol>
                </div>
              </div>
            )}

            {/* TAB 2: GUNAKAN KODE */}
            {activeTab === 'code' && (
              <div className="space-y-4">
                <form onSubmit={handleRequestCode} className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {t('memberWhatsapp.phoneNumberLabel', 'Nomor WhatsApp (format 62...)')}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isReconnect}
                      placeholder="6281234567890"
                      className={[
                        'w-full px-4 py-2.5 rounded-xl border text-sm font-mono tracking-wider focus:outline-hidden',
                        isReconnect
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20',
                      ].join(' ')}
                    />
                    {phoneError && (
                      <p className="text-[11px] text-rose-500 font-semibold mt-1">{phoneError}</p>
                    )}
                  </div>

                  {!pairingCode && (
                    <button
                      type="submit"
                      disabled={status === 'loading'}
                      className="w-full py-2.5 rounded-xl bg-primary hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {status === 'loading' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{t('memberWhatsapp.getCodeBtn', 'Dapatkan Kode Tautan')}</span>
                    </button>
                  )}
                </form>

                {pairingCode && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center space-y-3">
                    <p className="text-xs font-medium text-slate-500">
                      {t('memberWhatsapp.enterCodeInstruction', 'Masukkan Kode Ini di WhatsApp Anda:')}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 border-2 border-primary/40 font-mono text-2xl sm:text-3xl font-black tracking-widest text-primary dark:text-primary-light shadow-sm select-all">
                        {pairingCode}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors shadow-2xs"
                        title="Salin Kode"
                      >
                        {codeCopied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400">
                      {t('memberWhatsapp.qrExpiryCountdown', { seconds: countdown })}
                    </p>
                  </div>
                )}

                {/* Instructions */}
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                  <p className="font-bold text-primary dark:text-blue-300">Petunjuk Memasukkan Kode:</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <li>{t('memberWhatsapp.codeInstruction1', 'Buka WhatsApp di ponsel Anda')}</li>
                    <li>{t('memberWhatsapp.codeInstruction2', 'Ketuk Menu / Pengaturan > Perangkat Tertaut > Tautkan dengan nomor telepon')}</li>
                    <li>{t('memberWhatsapp.codeInstruction3', 'Masukkan 8 digit kode yang muncul di atas')}</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Footer Status Message (Tab-Aware, Never says "scan QR" on code tab) */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {activeTab === 'qr'
                    ? t('memberWhatsapp.statusWaitingScan', 'Menunggu pindaian QR dari WhatsApp ponsel Anda...')
                    : t('memberWhatsapp.statusWaitingCode', 'Menunggu konfirmasi input kode di WhatsApp ponsel Anda...')}
                </span>
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
