import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap, Play, Square, AlertTriangle, ShieldCheck, Info,
  Flame, ChevronDown, Check, Activity
} from 'lucide-react'
import CategorySelectDropdown from './CategorySelectDropdown'

const SPEED_CONFIG = {
  1: { label: '1 Detik (Tercepat)', risk: 'fastest', color: 'red' },
  2: { label: '2 Detik', risk: 'fastest', color: 'red' },
  3: { label: '3 Detik', risk: 'fastest', color: 'red' },
  4: { label: '4 Detik', risk: 'fastest', color: 'red' },
  5: { label: '5 Detik', risk: 'fast', color: 'amber' },
  10: { label: '10 Detik', risk: 'fast', color: 'amber' },
  15: { label: '15 Detik', risk: 'fast', color: 'amber' },
  20: { label: '20 Detik', risk: 'fast', color: 'amber' },
  30: { label: '30 Detik (Standar)', risk: 'standard', color: 'green' },
  45: { label: '45 Detik', risk: 'safe', color: 'blue' },
  60: { label: '60 Detik (Aman)', risk: 'safe', color: 'blue' },
  90: { label: '90 Detik (Paling Lambat)', risk: 'safe', color: 'blue' },
}

export default function MassControlPanel({
  categories = [],
  selectedCategoryId,
  onSelectCategory,
  speedSeconds = 30,
  onChangeSpeed,
  allowedSpeeds = [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60, 90],
  onStartAll,
  onStopAll,
  hasRunningDevices = false,
  hasIdleConnectedDevices = false,
  isLoading = false,
}) {
  const { t } = useTranslation()

  // Get current speed banner config
  const getSpeedBanner = (sec) => {
    if (sec <= 4) {
      return {
        badge: 'TERCEPAT & BERISIKO TINGGI',
        text: t('memberWhatsapp.speedBannerFastest', 'Pengiriman sangat agresif dengan interval sangat rapat. Risiko deteksi spam tinggi.'),
        classes: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200',
        badgeClass: 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100',
        icon: <Flame className="w-4 h-4 text-rose-600 fill-rose-600 shrink-0" />,
      }
    }
    if (sec <= 20) {
      return {
        badge: 'CEPAT',
        text: t('memberWhatsapp.speedBannerFast', 'Pengiriman dengan kecepatan tinggi. Disarankan untuk nomor yang sudah berumur.'),
        classes: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200',
        badgeClass: 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
      }
    }
    if (sec === 30) {
      return {
        badge: 'STANDAR',
        text: t('memberWhatsapp.speedBannerStandard', 'STANDAR — Keseimbangan optimal antara efisiensi pengiriman dan keamanan akun.'),
        classes: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200',
        badgeClass: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
        icon: <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />,
      }
    }
    return {
      badge: 'AMAN & PERLAHAN',
      text: t('memberWhatsapp.speedBannerSafe', 'AMAN & PERLAHAN — Interval santai yang meniru perilaku manusia normal. Paling aman dari deteksi.'),
      classes: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-200',
      badgeClass: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
      icon: <Info className="w-4 h-4 text-sky-600 shrink-0" />,
    }
  }

  const speedBanner = getSpeedBanner(speedSeconds)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-md space-y-6">
      {/* 1. Header: Badge, Title, Description */}
      <div className="space-y-1.5 text-start">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950 text-primary dark:text-blue-300">
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>{t('memberWhatsapp.smartEngine', 'SMART ENGINE')}</span>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          {t('memberWhatsapp.massControlTitle', 'Kendali Massal')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
          {t(
            'memberWhatsapp.massControlDesc',
            'Kendalikan semua akun WhatsApp Anda sekaligus. Atur kecepatan pengiriman untuk mengontrol risiko terdeteksi spam.'
          )}
        </p>
      </div>

      {/* 2. Dropdown Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Dropdown Kategori Target */}
        <div className="space-y-1.5 text-start">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            {t('memberWhatsapp.targetCategory', 'KATEGORI TARGET')}
          </label>
          <CategorySelectDropdown
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={onSelectCategory}
            disabled={isLoading}
          />
        </div>

        {/* Dropdown Kecepatan Pengiriman */}
        <div className="space-y-1.5 text-start">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            {t('memberWhatsapp.speedLabel', 'KECEPATAN PENGIRIMAN')}
          </label>
          <select
            value={speedSeconds}
            onChange={(e) => onChangeSpeed(parseInt(e.target.value, 10))}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
          >
            {allowedSpeeds.map((s) => {
              const cfg = SPEED_CONFIG[s] || { label: `${s} Detik` }
              return (
                <option key={s} value={s}>
                  {cfg.label}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {/* 3. Reactive Speed Risk Banner */}
      <div
        className={[
          'p-3.5 rounded-2xl border text-xs flex items-start gap-3 transition-colors duration-200',
          speedBanner.classes,
        ].join(' ')}
      >
        {speedBanner.icon}
        <div className="space-y-1 min-w-0">
          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${speedBanner.badgeClass}`}>
            {speedBanner.badge}
          </span>
          <p className="text-xs leading-relaxed font-medium">{speedBanner.text}</p>
        </div>
      </div>

      {/* 4. Action Buttons (Mulai Semua & Hentikan Semua) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {/* Mulai Semua */}
          <button
            type="button"
            disabled={isLoading || !hasIdleConnectedDevices || !selectedCategoryId}
            onClick={onStartAll}
            title={
              !selectedCategoryId
                ? 'Pilih kategori target terlebih dahulu'
                : !hasIdleConnectedDevices
                ? 'Tidak ada perangkat terhubung yang idle'
                : ''
            }
            className={[
              'px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2',
              !hasIdleConnectedDevices || !selectedCategoryId || isLoading
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-600 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-emerald-600/25',
            ].join(' ')}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{t('memberWhatsapp.startAll', 'Mulai Semua')}</span>
          </button>

          {/* Hentikan Semua */}
          <button
            type="button"
            disabled={isLoading || !hasRunningDevices}
            onClick={onStopAll}
            className={[
              'px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2',
              !hasRunningDevices || isLoading
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                : 'bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-600/25',
            ].join(' ')}
          >
            <Square className="w-4 h-4 fill-white" />
            <span>{t('memberWhatsapp.stopAll', 'Hentikan Semua')}</span>
          </button>
        </div>

        {/* 5. Warning Footer Text */}
        <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 justify-start sm:justify-end">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{t('memberWhatsapp.riskWarningFooter', 'Risiko diblokir WhatsApp tetap ditanggung pengguna')}</span>
        </p>
      </div>
    </div>
  )
}
