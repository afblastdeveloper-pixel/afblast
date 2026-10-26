import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Smartphone, QrCode, RefreshCw, AlertCircle, CheckCircle2,
  XCircle, Clock, Trash2, Unlink, Plus, Check, Copy, Download,
  ExternalLink, Info, AlertTriangle, X, Play, Square, Layers,
  Zap, ShieldCheck, Flame, Activity
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import { useMemberStream } from '../../hooks/useMemberStream'

// Sub-components
import CategorySelectDropdown from '../../components/member/CategorySelectDropdown'
import DeviceCard from '../../components/member/DeviceCard'
import MassControlPanel from '../../components/member/MassControlPanel'
import LinkDeviceModal from '../../components/member/LinkDeviceModal'
import DeviceHistoryModal from '../../components/member/DeviceHistoryModal'
import BrutalRiskModal from '../../components/member/BrutalRiskModal'

function formatNumber(val, locale) {
  if (val === null || val === undefined || isNaN(Number(val))) return '-'
  return new Intl.NumberFormat(locale || 'id-ID').format(Number(val))
}

export default function WhatsAppPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isRTL = i18n.language === 'ar'

  // SSE Stream integration
  const { isConnected: isSseConnected, lastEventData } = useMemberStream()

  // 1. BANNER ATURAN PROFIL DISMISS STATE
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('afblast.profile_rule_dismissed') === 'true'
  })
  const [copiedName, setCopiedName] = useState(null)
  const [activeTooltip, setActiveTooltip] = useState(false)

  // 2. MODAL & DIALOG STATES
  const [linkModal, setLinkModal] = useState({ open: false, targetDevice: null })
  const [historyModal, setHistoryModal] = useState({ open: false, device: null })
  const [brutalRiskModal, setBrutalRiskModal] = useState({ open: false, device: null })

  // Confirmation dialogs
  const [confirmStopAll, setConfirmStopAll] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState({ open: false, device: null })
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, device: null })

  // Toast feedback state
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })

  // Mass Control state
  const [selectedMassCategoryId, setSelectedMassCategoryId] = useState('')
  const [massSpeedSeconds, setMassSpeedSeconds] = useState(30)

  // Listen for realtime SSE events and trigger toast notifications
  useEffect(() => {
    if (!lastEventData) return
    const { event, data } = lastEventData

    if (event === 'device.status') {
      if (data?.status === 'logged_out' || data?.status === 'disconnected') {
        setToast({
          show: true,
          message: `Nomor ${data.phone || 'WhatsApp'} terputus dari jaringan (${data.reason || 'Logout'}).`,
          type: 'error',
        })
      } else if (data?.status === 'connected') {
        setToast({
          show: true,
          message: `Perangkat ${data.phone || ''} berhasil terhubung ke WhatsApp.`,
          type: 'success',
        })
      }
    } else if (event === 'engine.stopped') {
      setToast({
        show: true,
        message: `Mesin pada perangkat #${data?.deviceId} dihentikan (${data?.reason || 'user_stop'}).`,
        type: 'info',
      })
    }
  }, [lastEventData])

  // ─── DATA QUERIES ──────────────────────────────────────────────────────────

  // 1. Overview API: /api/member/whatsapp/overview
  const {
    data: overviewData,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['memberWhatsappOverview'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/whatsapp/overview')
      if (!res.ok) throw new Error('Gagal memuat ringkasan overview WhatsApp')
      return res.json()
    },
    staleTime: 10000,
  })

  // 2. Profile Rule API: /api/member/profile-rule
  const {
    data: profileRuleData,
    isLoading: isRuleLoading,
  } = useQuery({
    queryKey: ['memberProfileRule'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/profile-rule')
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 60000,
  })

  // Parse overview data
  const performance = overviewData?.performance || {}
  const devices = overviewData?.devices || []
  const categories = overviewData?.kategori || []
  const settings = overviewData?.settings || {
    allowedSpeeds: [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60, 90],
    defaultSpeed: 30,
    safeModeEnabled: true,
    brutalModeEnabled: false,
    dailyLimitDefault: 200,
  }
  const isSimulatorActive = Boolean(overviewData?.isSimulated)

  // Default selected category for mass control
  useEffect(() => {
    if (!selectedMassCategoryId && categories.length > 0) {
      const firstAvailable = categories.find((c) => c.hasActiveCampaign && c.remaining > 0)
      if (firstAvailable) {
        setSelectedMassCategoryId(firstAvailable.id)
      } else {
        setSelectedMassCategoryId(categories[0].id)
      }
    }
  }, [categories, selectedMassCategoryId])

  // Calculations for Mass Control
  const hasRunningDevices = useMemo(() => {
    return devices.some((d) => d.engineState === 'running')
  }, [devices])

  const hasIdleConnectedDevices = useMemo(() => {
    return devices.some((d) => d.status === 'connected' && d.engineState !== 'running')
  }, [devices])

  // Remaining total contacts in shared pool
  const remainingTotalData = useMemo(() => {
    return categories.reduce((acc, c) => acc + (c.remaining || 0), 0)
  }, [categories])

  // Max devices allowed
  const maxAllowedDevices = 3
  const isMaxDevicesReached = devices.length >= maxAllowedDevices

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  // Start Device Mutation
  const startDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, config }) => {
      const res = await apiFetch(`/api/member/devices/${deviceId}/start`, {
        method: 'POST',
        body: JSON.stringify({
          categoryId: selectedMassCategoryId,
          ...config,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memulai mesin perangkat')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setToast({ show: true, message: 'Mesin blast berhasil dimulai.', type: 'success' })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Stop Device Mutation
  const stopDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      const res = await apiFetch(`/api/member/devices/${deviceId}/stop`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghentikan mesin perangkat')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setToast({ show: true, message: 'Mesin blast berhasil dihentikan.', type: 'info' })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Start All Mutation
  const startAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/member/engine/start-all', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: selectedMassCategoryId,
          speedSeconds: massSpeedSeconds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memulai semua perangkat')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setToast({
        show: true,
        message: `${data.startedCount || 'Semua'} perangkat berhasil dimulai.`,
        type: 'success',
      })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Stop All Mutation
  const stopAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/member/engine/stop-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghentikan semua perangkat')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setConfirmStopAll(false)
      setToast({
        show: true,
        message: `${data.stoppedCount || 'Semua'} perangkat berhasil dihentikan.`,
        type: 'info',
      })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Update Config Mutation
  const updateConfigMutation = useMutation({
    mutationFn: async ({ deviceId, config }) => {
      const res = await apiFetch(`/api/member/devices/${deviceId}/config`, {
        method: 'PATCH',
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan konfigurasi')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Disconnect Device Mutation
  const disconnectMutation = useMutation({
    mutationFn: async (deviceId) => {
      const res = await apiFetch(`/api/member/devices/${deviceId}/disconnect`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memutuskan perangkat')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setDisconnectConfirm({ open: false, device: null })
      setToast({ show: true, message: 'Perangkat berhasil diputuskan secara manual.', type: 'info' })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // Delete Device Mutation
  const deleteMutation = useMutation({
    mutationFn: async (deviceId) => {
      const res = await apiFetch(`/api/member/devices/${deviceId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus perangkat')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      setDeleteConfirm({ open: false, device: null })
      setToast({ show: true, message: 'Perangkat berhasil dihapus dari slot.', type: 'success' })
    },
    onError: (err) => {
      setToast({ show: true, message: err.message, type: 'error' })
    },
  })

  // ─── ACTION HANDLERS ───────────────────────────────────────────────────────

  const handleDismissBanner = () => {
    setIsBannerDismissed(true)
    localStorage.setItem('afblast.profile_rule_dismissed', 'true')
  }

  const handleCopyName = (name) => {
    navigator.clipboard?.writeText(name)
    setCopiedName(name)
    setTimeout(() => setCopiedName(null), 2500)
  }

  const handleOpenAddDevice = () => {
    if (isMaxDevicesReached) return
    setLinkModal({ open: true, targetDevice: null })
  }

  const handleOpenReconnect = (device) => {
    setLinkModal({ open: true, targetDevice: device })
  }

  const handleOpenHistory = (device) => {
    setHistoryModal({ open: true, device })
  }

  const handleOpenBrutalRisk = (device) => {
    setBrutalRiskModal({ open: true, device })
  }

  const handleConfirmBrutalMode = () => {
    if (!brutalRiskModal.device) return
    updateConfigMutation.mutate({
      deviceId: brutalRiskModal.device.id,
      config: {
        brutalMode: true,
        safeMode: false,
        confirmText: 'SAYA PAHAM',
      },
    })
  }

  const profileRule = profileRuleData?.rule || {}

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-start">
      {/* ========================================================================= */}
      {/* 0. BANNER SIMULATOR MODE (Hanya jika mode uji aktif) */}
      {/* ========================================================================= */}
      {isSimulatorActive && (
        <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-lg bg-amber-500 text-white shrink-0">
              <Zap className="w-4 h-4 fill-white" />
            </span>
            <span className="truncate">
              {t(
                'memberWhatsapp.simulatorNotice',
                'MODE UJI: tidak mengirim pesan WhatsApp sungguhan dan pendapatan tidak dapat ditarik.'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 shrink-0">
            SIMULATOR AKTIF
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PAGE HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {t('memberWhatsapp.pageTitle', 'WhatsApp Pengirim')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {t(
              'memberWhatsapp.pageSubtitle',
              'Tautkan akun WhatsApp Anda untuk sesi blast, jalankan kampanye resmi, dan pantau metrik performa secara real-time.'
            )}
          </p>
        </div>

        {/* Realtime Stream Status Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors',
              isSseConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
            ].join(' ')}
            title={isSseConnected ? 'Event Stream Realtime Terhubung' : 'Stream Terputus (Polling Aktif)'}
          >
            <span
              className={[
                'w-2 h-2 rounded-full',
                isSseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
              ].join(' ')}
            />
            <span>{isSseConnected ? 'Realtime Aktif' : 'Tersinkron'}</span>
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BANNER ATURAN PROFIL RESMI */}
      {/* ========================================================================= */}
      {!isBannerDismissed && (
        <div className="relative rounded-3xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-5 sm:p-6 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <button
            type="button"
            onClick={handleDismissBanner}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 rounded-xl text-amber-700/70 hover:text-amber-900 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            title="Tutup pengumuman"
            aria-label="Tutup banner aturan profil"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-5 pr-8">
            {/* Foto Profil Wajib */}
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-amber-300 shadow-sm bg-white dark:bg-slate-800">
                <img
                  src={profileRule.photoUrl || '/media/campaign/default_profile.png'}
                  alt="Foto Profil Resmi"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = 'https://ui-avatars.com/api/?name=AF+Blast&background=0B1220&color=fff'
                  }}
                />
              </div>
              <a
                href={profileRule.photoUrl || '#'}
                download="AFBlast-Official-Profile.png"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200/80 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
              >
                <Download className="w-3 h-3" />
                <span>Unduh Foto</span>
              </a>
            </div>

            {/* Isi Aturan */}
            <div className="flex-1 space-y-2.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500 text-white">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  {t('memberWhatsapp.profileRuleBanner', 'PERHATIAN: ATURAN PROFIL')}
                </h2>
              </div>

              <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
                {profileRule.notice ||
                  'Gunakan nama dan foto profil resmi AF Blast saat menjalankan sesi blast pesan agar akun tetap terpercaya dan terhindar dari pemblokiran.'}
              </p>

              {/* Tautan Channel & Pilihan Nama */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {profileRule.channelUrl && (
                  <a
                    href={profileRule.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-100/50 transition-colors shadow-2xs"
                  >
                    <span>Saluran WhatsApp Resmi</span>
                    <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                  </a>
                )}

                {profileRule.nameOptions && profileRule.nameOptions.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-400">
                      Pilihan Nama:
                    </span>
                    {profileRule.nameOptions.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleCopyName(name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-200 text-xs font-mono font-medium transition-colors"
                        title="Klik untuk menyalin"
                      >
                        {copiedName === name ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                            <span>{name}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. KARTU "Alokasi Kontak Bersama" & TOMBOL "Tambah Perangkat" */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0B1220] to-[#15233E] rounded-3xl p-6 sm:p-7 text-white shadow-xl border border-slate-800 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            {t('memberWhatsapp.poolTitle', 'Alokasi Kontak Bersama')}
          </span>
          <h2 className="text-base sm:text-lg font-medium text-slate-300">
            {t('memberWhatsapp.remainingContacts', 'Data yang tersisa saat ini')}
          </h2>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight tabular-nums pt-1">
            {isOverviewLoading ? (
              <span className="inline-block w-28 h-9 bg-slate-800 rounded-lg animate-pulse" />
            ) : (
              formatNumber(remainingTotalData, i18n.language)
            )}
            <span className="text-sm font-normal text-slate-400 ms-2">
              {t('memberWhatsapp.activeContacts', 'kontak aktif')}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleOpenAddDevice}
            disabled={isMaxDevicesReached}
            className={[
              'inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl text-sm font-bold shadow-lg transition-all',
              isMaxDevicesReached
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-primary to-primary-light hover:brightness-110 active:scale-[0.98] text-white shadow-blue-500/25',
            ].join(' ')}
          >
            <Plus className="w-4 h-4" />
            <span>{t('memberWhatsapp.addDevice', 'Tambah Perangkat')}</span>
            <span
              className={[
                'px-2 py-0.5 rounded-full text-xs font-mono font-bold',
                isMaxDevicesReached ? 'bg-slate-700 text-slate-400' : 'bg-white/20 text-white',
              ].join(' ')}
            >
              {devices.length}/{maxAllowedDevices}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. "Ringkasan Performa Blast" (6 Kartu Metrik Realtime) */}
      {/* ========================================================================= */}
      <section aria-label="Ringkasan Performa Blast" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {t('memberWhatsapp.performanceTitle', 'Ringkasan Performa Blast')}
          </h2>
          <button
            type="button"
            onClick={() => refetchOverview()}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Muat ulang metrik"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Card 1: Slot Aktif */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              {t('memberWhatsapp.slotActive', 'Slot Aktif')}
            </span>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
              {isOverviewLoading ? '...' : formatNumber(performance.slotAktif, i18n.language)}
            </p>
          </div>

          {/* Card 2: Sukses (All Time) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block truncate">
              {t('memberWhatsapp.successAllTime', 'Sukses (All Time)')}
            </span>
            <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1 truncate">
              {isOverviewLoading ? '...' : formatNumber(performance.sentAllTime, i18n.language)}
            </p>
          </div>

          {/* Card 3: Gagal (All Time) + Tooltip */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow relative">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider block truncate">
                {t('memberWhatsapp.failedAllTime', 'Gagal (All Time)')}
              </span>
              <button
                type="button"
                onClick={() => setActiveTooltip((prev) => !prev)}
                onMouseEnter={() => setActiveTooltip(true)}
                onMouseLeave={() => setActiveTooltip(false)}
                className="text-slate-400 hover:text-slate-600 focus:outline-hidden"
                aria-label="Info kegagalan blast"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums mt-1 truncate">
              {isOverviewLoading ? '...' : formatNumber(performance.failedAllTime, i18n.language)}
            </p>

            {/* Tooltip Popup */}
            {activeTooltip && (
              <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl leading-normal pointer-events-none">
                {t(
                  'memberWhatsapp.failedTooltip',
                  'Pesan gagal biasanya terjadi akibat nomor tujuan tidak terdaftar di WhatsApp, privasi ketat, atau jaringan operator timeout.'
                )}
                <div className="w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
              </div>
            )}
          </div>

          {/* Card 4: Partisipasi Blast (Fix [object Object]) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              {t('memberWhatsapp.blastParticipation', 'Partisipasi Blast')}
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-primary dark:text-blue-400 tabular-nums mt-1 truncate">
              {isOverviewLoading
                ? '...'
                : `${formatNumber(
                    performance.participationCampaigns ?? performance.participations?.campaigns ?? performance.distinctCampaigns ?? 0,
                    i18n.language
                  )} Campaign`}
            </p>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">
              {isOverviewLoading
                ? '...'
                : `${formatNumber(
                    performance.participationProcessed ?? performance.participations?.totalProcessed ?? performance.totalProcessed ?? 0,
                    i18n.language
                  )} pesan`}
            </p>
          </div>

          {/* Card 5: Nomor Tertaut */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              {t('memberWhatsapp.linkedNumbers', 'Nomor Tertaut')}
            </span>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
              {isOverviewLoading ? '...' : `${formatNumber(performance.nomorTertaut || 0, i18n.language)} Unik`}
            </p>
          </div>

          {/* Card 6: Rata-rata Speed */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-sm transition-shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              {t('memberWhatsapp.avgSpeed', 'Rata-rata Speed')}
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
              {isOverviewLoading
                ? '...'
                : `${performance.avgSecondsPerMessage || 0} detik/pesan`}
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. KONDISIONAL: EMPTY STATE vs KENDALI MASSAL + GRID KARTU PERANGKAT */}
      {/* ========================================================================= */}
      {isOverviewLoading ? (
        // Loading Skeleton
        <div className="space-y-6 pt-4 animate-pulse">
          <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-72 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            ))}
          </div>
        </div>
      ) : devices.length === 0 ? (
        // Empty State (HANYA tampilkan kartu ini bila belum ada perangkat tertaut)
        <section aria-label="Belum Ada Perangkat" className="pt-4">
          <div className="p-10 sm:p-14 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4 max-w-xl mx-auto">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-blue-50 dark:bg-blue-950/60 text-primary dark:text-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/10">
              <Smartphone className="w-10 h-10" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                {t('memberWhatsapp.emptyStateTitle', 'Belum Ada WhatsApp Tertaut')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                {t(
                  'memberWhatsapp.emptyStateDesc',
                  'Tautkan nomor WhatsApp Anda dengan memindai kode QR atau menggunakan kode tautan untuk mulai menjalankan broadcast dan memperoleh komisi.'
                )}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenAddDevice}
                className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-light hover:brightness-110 active:scale-95 text-white text-sm font-bold shadow-lg shadow-blue-500/25 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{t('memberWhatsapp.emptyStateBtn', 'Tambah Perangkat Sekarang')}</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        // Tampilkan Kendali Massal dan Grid Kartu Perangkat
        <section aria-label="Mesin WhatsApp Blast" className="space-y-6 pt-2">
          {/* A. PANEL KENDALI MASSAL */}
          <MassControlPanel
            categories={categories}
            selectedCategoryId={selectedMassCategoryId}
            onSelectCategory={setSelectedMassCategoryId}
            speedSeconds={massSpeedSeconds}
            onChangeSpeed={setMassSpeedSeconds}
            allowedSpeeds={settings.allowedSpeeds}
            onStartAll={() => startAllMutation.mutate()}
            onStopAll={() => setConfirmStopAll(true)}
            hasRunningDevices={hasRunningDevices}
            hasIdleConnectedDevices={hasIdleConnectedDevices}
            isLoading={startAllMutation.isPending || stopAllMutation.isPending}
          />

          {/* B. GRID KARTU PERANGKAT (1 Kolom Mobile, 2 Tablet, 3 Desktop) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Daftar Perangkat WhatsApp ({devices.length})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Maksimal {maxAllowedDevices} perangkat
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  allowedSpeeds={settings.allowedSpeeds}
                  settings={settings}
                  selectedGlobalCategoryId={selectedMassCategoryId}
                  onStart={(devId, cfg) => startDeviceMutation.mutate({ deviceId: devId, config: cfg })}
                  onStop={(devId) => stopDeviceMutation.mutate(devId)}
                  onUpdateConfig={(devId, cfg) => updateConfigMutation.mutate({ deviceId: devId, config: cfg })}
                  onReconnect={handleOpenReconnect}
                  onDisconnect={(dev) => setDisconnectConfirm({ open: true, device: dev })}
                  onDelete={(dev) => setDeleteConfirm({ open: true, device: dev })}
                  onOpenHistory={handleOpenHistory}
                  onOpenBrutalRisk={handleOpenBrutalRisk}
                  isActionLoading={
                    startDeviceMutation.isPending ||
                    stopDeviceMutation.isPending ||
                    updateConfigMutation.isPending
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. MODALS & DRAWERS */}
      {/* ========================================================================= */}

      {/* a. Modal Tautkan Perangkat / Sambungkan Ulang */}
      <LinkDeviceModal
        isOpen={linkModal.open}
        targetDevice={linkModal.targetDevice}
        onClose={() => setLinkModal({ open: false, targetDevice: null })}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
          setToast({ show: true, message: 'WhatsApp berhasil ditautkan!', type: 'success' })
        }}
      />

      {/* b. Modal Riwayat Pengiriman & Sesi Run */}
      <DeviceHistoryModal
        isOpen={historyModal.open}
        device={historyModal.device}
        onClose={() => setHistoryModal({ open: false, device: null })}
      />

      {/* c. Modal Peringatan Risiko Mode Brutal */}
      <BrutalRiskModal
        isOpen={brutalRiskModal.open}
        device={brutalRiskModal.device}
        onClose={() => setBrutalRiskModal({ open: false, device: null })}
        onConfirm={handleConfirmBrutalMode}
      />

      {/* d. Dialog Konfirmasi Hentikan Semua */}
      <ConfirmDialog
        isOpen={confirmStopAll}
        onClose={() => setConfirmStopAll(false)}
        onConfirm={() => stopAllMutation.mutate()}
        title={t('memberWhatsapp.confirmStopAllTitle', 'Hentikan Semua Perangkat?')}
        description={t(
          'memberWhatsapp.confirmStopAllDesc',
          'Mesin blast pada semua perangkat yang sedang berjalan akan dihentikan.'
        )}
        confirmLabel={t('memberWhatsapp.stopAll', 'Hentikan Semua')}
        cancelLabel={t('common.cancel', 'Batal')}
        variant="danger"
        isLoading={stopAllMutation.isPending}
      />

      {/* e. Dialog Konfirmasi Putuskan Manual */}
      <ConfirmDialog
        isOpen={disconnectConfirm.open}
        onClose={() => setDisconnectConfirm({ open: false, device: null })}
        onConfirm={() => disconnectConfirm.device && disconnectMutation.mutate(disconnectConfirm.device.id)}
        title={t('memberWhatsapp.confirmDisconnectTitle', 'Putuskan WhatsApp?')}
        description={t(
          'memberWhatsapp.confirmDisconnectDesc',
          'Koneksi WhatsApp pada perangkat ini akan diputus dan mesin blast dihentikan.'
        )}
        confirmLabel={t('memberWhatsapp.disconnectBtn', 'Putuskan')}
        cancelLabel={t('common.cancel', 'Batal')}
        variant="warning"
        isLoading={disconnectMutation.isPending}
      />

      {/* f. Dialog Konfirmasi Hapus Perangkat */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, device: null })}
        onConfirm={() => deleteConfirm.device && deleteMutation.mutate(deleteConfirm.device.id)}
        title={t('memberWhatsapp.confirmDeleteDeviceTitle', 'Hapus Perangkat WhatsApp?')}
        description={t(
          'memberWhatsapp.confirmDeleteDeviceDesc',
          'Slot perangkat ini akan dihapus dari akun Anda. Tindakan ini tidak dapat dibatalkan.'
        )}
        confirmLabel={t('memberWhatsapp.deleteDevice', 'Hapus Perangkat')}
        cancelLabel={t('common.cancel', 'Batal')}
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Toast Notification */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: '', type: 'info' })}
        />
      )}
    </div>
  )
}
