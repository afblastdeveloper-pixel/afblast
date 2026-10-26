import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Smartphone, Trash2, Play, Square, RefreshCw, Unlink,
  Flame, ShieldCheck, Check, Edit2, AlertTriangle, Activity,
  Info, ExternalLink, Zap
} from 'lucide-react'

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

export default function DeviceCard({
  device,
  allowedSpeeds = [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60, 90],
  settings = {},
  selectedGlobalCategoryId = null,
  onStart,
  onStop,
  onUpdateConfig,
  onReconnect,
  onDisconnect,
  onDelete,
  onOpenHistory,
  onOpenBrutalRisk,
  isActionLoading = false,
}) {
  const { t, i18n } = useTranslation()

  // Local card state
  const [speedSeconds, setSpeedSeconds] = useState(device.speedSeconds || 30)
  const [safeMode, setSafeMode] = useState(Boolean(device.safeMode))
  const [brutalMode, setBrutalMode] = useState(Boolean(device.brutalMode))
  const [hasRunLimit, setHasRunLimit] = useState(Boolean(device.runLimit))
  const [runLimitValue, setRunLimitValue] = useState(device.runLimit || 100)

  // Inline editing state for label
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelInput, setLabelInput] = useState(device.label || `Slot #${device.slotNumber}`)

  // Sync state when device prop updates
  useEffect(() => {
    setSpeedSeconds(device.speedSeconds || 30)
    setSafeMode(Boolean(device.safeMode))
    setBrutalMode(Boolean(device.brutalMode))
    setHasRunLimit(Boolean(device.runLimit))
    setRunLimitValue(device.runLimit || 100)
    setLabelInput(device.label || `Slot #${device.slotNumber}`)
  }, [device])

  const isRunning = device.engineState === 'running'
  const isDisconnected = device.status === 'disconnected' || device.status === 'logged_out'
  const isConnected = device.status === 'connected'

  const formatNumber = (num) => new Intl.NumberFormat(i18n.language || 'id-ID').format(num || 0)

  // Save label inline
  const handleSaveLabel = () => {
    setIsEditingLabel(false)
    if (labelInput.trim() && labelInput.trim() !== device.label) {
      onUpdateConfig(device.id, { label: labelInput.trim() })
    }
  }

  // Handle Safe Mode Toggle
  const handleToggleSafeMode = (checked) => {
    if (isRunning) return
    if (!settings.safeModeEnabled && checked) return

    setSafeMode(checked)
    if (checked) {
      setBrutalMode(false)
    }
    onUpdateConfig(device.id, {
      safeMode: checked,
      brutalMode: checked ? false : brutalMode,
    })
  }

  // Handle Brutal Mode Toggle
  const handleToggleBrutalMode = (checked) => {
    if (isRunning) return
    if (checked) {
      // Buka dialog risiko khusus Mode Brutal
      onOpenBrutalRisk(device)
    } else {
      setBrutalMode(false)
      onUpdateConfig(device.id, { brutalMode: false })
    }
  }

  // Handle Speed change
  const handleChangeSpeed = (val) => {
    if (isRunning) return
    const num = parseInt(val, 10)
    setSpeedSeconds(num)
    onUpdateConfig(device.id, { speedSeconds: num })
  }

  // Handle Limit toggle
  const handleToggleLimit = (checked) => {
    if (isRunning) return
    setHasRunLimit(checked)
    onUpdateConfig(device.id, {
      runLimit: checked ? runLimitValue : null,
    })
  }

  // Handle Limit change
  const handleChangeLimitValue = (val) => {
    const num = Math.max(1, parseInt(val, 10) || 1)
    setRunLimitValue(num)
    onUpdateConfig(device.id, { runLimit: num })
  }

  // Action: Start or Stop
  const handleToggleEngine = () => {
    if (isRunning) {
      onStop(device.id)
    } else {
      onStart(device.id, {
        speedSeconds,
        safeMode,
        brutalMode,
        runLimit: hasRunLimit ? runLimitValue : null,
      })
    }
  }

  // Total earned for active run
  const activeRunEarned = device.activeRun?.earned || 0
  const isSimulated = Boolean(device.isSimulated || device.activeRun?.isSimulated)

  return (
    <div
      className={[
        'rounded-3xl p-5 sm:p-6 transition-all duration-200 border flex flex-col justify-between relative shadow-xs',
        isDisconnected
          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
          : isRunning
          ? 'bg-blue-50/40 dark:bg-blue-950/20 border-primary/40 dark:border-primary/50 ring-1 ring-primary/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
      ].join(' ')}
    >
      {/* 1. TOP HEADER: Phone, Slot, Label, Status, Delete */}
      <div className="space-y-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          {/* Phone & Slot */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={[
                'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs',
                isDisconnected
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400'
                  : isRunning
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
              ].join(' ')}
            >
              <Smartphone className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  {device.phone || '-'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  SLOT #{device.slotNumber}
                </span>
              </div>

              {/* Inline Editable Label */}
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {isEditingLabel ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel()}
                      className="px-2 py-0.5 text-xs rounded-lg border border-primary dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveLabel}
                      className="p-1 text-emerald-600 hover:text-emerald-700"
                      title={t('memberWhatsapp.saveLabel', 'Simpan')}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group">
                    <span className="truncate max-w-[140px] font-medium text-slate-600 dark:text-slate-400">
                      {device.label || `Slot #${device.slotNumber}`}
                    </span>
                    {!isRunning && (
                      <button
                        type="button"
                        onClick={() => setIsEditingLabel(true)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity p-0.5"
                        title={t('memberWhatsapp.editLabel', 'Ubah Nama')}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delete Button (Only when engine stopped) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onDelete(device)}
              title={
                isRunning
                  ? 'Hentikan mesin terlebih dahulu untuk menghapus perangkat'
                  : t('memberWhatsapp.deleteDevice', 'Hapus Perangkat')
              }
              className={[
                'p-1.5 rounded-xl transition-colors',
                isRunning
                  ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40',
              ].join(' ')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Badge & Earnings Badge */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          {/* Status Badge */}
          <div>
            {device.status === 'connected' && device.engineState === 'running' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                {t('memberWhatsapp.statusRunning', 'BERJALAN')}
              </span>
            ) : device.status === 'connected' && device.engineState === 'paused' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('memberWhatsapp.statusPaused', 'DIJEDA')}
              </span>
            ) : device.status === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t('memberWhatsapp.statusConnectedIdle', 'TERHUBUNG (IDLE)')}
              </span>
            ) : device.status === 'logged_out' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('memberWhatsapp.statusLogout', 'LOGOUT')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shadow-2xs">
                {t('memberWhatsapp.statusDisconnected', 'TERPUTUS')}
              </span>
            )}
          </div>

          {/* Earnings Badge */}
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
              Rp {formatNumber(activeRunEarned)}
            </span>
            {isSimulated && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                {t('memberWhatsapp.simulatedBadge', 'Simulasi')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. DISCONNECTED RED BANNER (If disconnected/logged out) */}
      {isDisconnected && (
        <div className="my-3 p-3.5 rounded-2xl bg-rose-100/80 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-900 text-xs text-rose-900 dark:text-rose-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {t('memberWhatsapp.disconnectedBanner', 'Nomor ini ter-logout dari WhatsApp. Mesin dihentikan.')}
              </p>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                Alasan: {device.disconnectedReason || 'Sesi WhatsApp dikeluarkan oleh ponsel atau server.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onReconnect(device)}
            className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('memberWhatsapp.reconnectBtn', 'Sambungkan Ulang Sekarang')}</span>
          </button>
        </div>
      )}

      {/* 3. SETTING PERANGKAT (Kecepatan & 3 Checkbox) */}
      <div className="space-y-3.5 py-3">
        {/* Speed Selector */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            {t('memberWhatsapp.speedLabel', 'KECEPATAN PENGIRIMAN')}
          </label>
          <select
            value={speedSeconds}
            disabled={isRunning}
            onChange={(e) => handleChangeSpeed(e.target.value)}
            className={[
              'w-full px-3 py-2 text-xs rounded-xl border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-hidden',
              isRunning
                ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-800'
                : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary/20',
            ].join(' ')}
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

        {/* 3 Checkboxes */}
        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Checkbox 1: MODE AMAN */}
          <label
            className={[
              'flex items-start gap-2.5 p-2 rounded-xl transition-colors cursor-pointer',
              !settings.safeModeEnabled
                ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/40'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
            ].join(' ')}
            title={!settings.safeModeEnabled ? t('memberWhatsapp.safeModeDisabledAdmin') : ''}
          >
            <input
              type="checkbox"
              checked={safeMode}
              disabled={isRunning || !settings.safeModeEnabled}
              onChange={(e) => handleToggleSafeMode(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-primary border-slate-300 focus:ring-primary"
            />
            <div className="min-w-0">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                {t('memberWhatsapp.safeModeTitle', 'MODE AMAN (ANTI-BAN)')}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                {t('memberWhatsapp.safeModeDesc', 'Simulasi mengetik, jeda acak, dan pengiriman lebih hati-hati.')}
              </span>
            </div>
          </label>

          {/* Checkbox 2: MODE BRUTAL (Only if brutalModeEnabled is true) */}
          {settings.brutalModeEnabled && (
            <label
              className={[
                'flex items-start gap-2.5 p-2 rounded-xl transition-colors cursor-pointer',
                brutalMode
                  ? 'bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={brutalMode}
                disabled={isRunning}
                onChange={(e) => handleToggleBrutalMode(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500"
              />
              <div className="min-w-0">
                <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 fill-rose-600" />
                  {t('memberWhatsapp.brutalModeTitle', 'MODE BRUTAL (TANPA JEDA)')}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                  {t('memberWhatsapp.brutalModeDesc', 'Kirim beruntun tanpa jeda. Risiko diblokir ditanggung sendiri.')}
                </span>
              </div>
            </label>
          )}

          {/* Checkbox 3: TENTUKAN LIMIT PENGIRIMAN */}
          <div className="p-2 rounded-xl space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRunLimit}
                disabled={isRunning}
                onChange={(e) => handleToggleLimit(e.target.checked)}
                className="w-4 h-4 rounded text-primary border-slate-300 focus:ring-primary"
              />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {t('memberWhatsapp.limitModeTitle', 'TENTUKAN LIMIT PENGIRIMAN')}
              </span>
            </label>

            {hasRunLimit && (
              <div className="pt-1 ps-6 space-y-1 animate-in fade-in duration-150">
                <input
                  type="number"
                  min="1"
                  max={device.dailyLimit || 50000}
                  value={runLimitValue}
                  disabled={isRunning}
                  onChange={(e) => handleChangeLimitValue(e.target.value)}
                  placeholder={t('memberWhatsapp.limitPlaceholder', { max: device.dailyLimit || 200 })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 block">
                  {t('memberWhatsapp.dailyLimitInfo', { limit: device.dailyLimit || 200 })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. RUN STATISTICS (3 Columns: DIKIRIM, SUKSES, GAGAL) */}
      <div className="my-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-center">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Statistik Sesi Saat Ini
          </span>
          <button
            type="button"
            onClick={() => onOpenHistory(device)}
            className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
          >
            <span>{t('memberWhatsapp.viewHistory', 'Riwayat')}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700 text-center">
          <div className="px-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">
              {t('memberWhatsapp.statSent', 'DIKIRIM')}
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {formatNumber(device.activeRun?.sent || 0)}
            </span>
          </div>

          <div className="px-1">
            <span className="text-[10px] font-semibold text-emerald-600 uppercase block">
              {t('memberWhatsapp.statSuccess', 'SUKSES')}
            </span>
            <span className="text-base font-extrabold text-emerald-600 font-mono">
              {formatNumber(device.activeRun?.success || 0)}
            </span>
          </div>

          <div className="px-1">
            <span className="text-[10px] font-semibold text-rose-500 uppercase block">
              {t('memberWhatsapp.statFailed', 'GAGAL')}
            </span>
            <span className="text-base font-extrabold text-rose-600 font-mono">
              {formatNumber(device.activeRun?.failed || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. ACTION BUTTONS: Jalankan Mesin / Hentikan Mesin + Putuskan / Sambungkan */}
      <div className="pt-2 flex items-center gap-2">
        {/* Toggle Engine Button */}
        {isRunning ? (
          <button
            type="button"
            disabled={isActionLoading}
            onClick={handleToggleEngine}
            className="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>{t('memberWhatsapp.stopEngine', 'Hentikan Mesin')}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isActionLoading || !isConnected || !selectedGlobalCategoryId}
            onClick={handleToggleEngine}
            title={
              !isConnected
                ? 'Perangkat belum terhubung ke WhatsApp'
                : !selectedGlobalCategoryId
                ? 'Pilih kategori target pada panel atas terlebih dahulu'
                : ''
            }
            className={[
              'flex-1 py-3 px-4 rounded-2xl text-white text-xs font-bold shadow-lg transition-all flex items-center justify-center gap-2',
              !isConnected || !selectedGlobalCategoryId
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-600 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-emerald-600/25',
            ].join(' ')}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{t('memberWhatsapp.startEngine', 'Jalankan Mesin')}</span>
          </button>
        )}

        {/* Secondary: Reconnect or Disconnect */}
        {isDisconnected ? (
          <button
            type="button"
            onClick={() => onReconnect(device)}
            className="py-3 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
            title={t('memberWhatsapp.reconnectBtn', 'Sambungkan Ulang')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onDisconnect(device)}
            className={[
              'py-3 px-3 rounded-2xl text-xs font-bold transition-colors',
              isRunning
                ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300',
            ].join(' ')}
            title={t('memberWhatsapp.disconnectBtn', 'Putuskan Manual')}
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
