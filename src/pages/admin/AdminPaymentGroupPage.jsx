import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Info,
  Check,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import { useAuth } from '../../context/AuthContext'
import Can from '../../components/common/Can'
import Badge from '../../components/ui/Badge'
import Toast from '../../components/ui/Toast'

function formatRupiah(value) {
  const num = Number(value) || 0
  return 'Rp ' + num.toLocaleString('id-ID')
}

export default function AdminPaymentGroupPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()

  // Toast state
  const [toast, setToast] = useState(null)

  // Preview state ('success' | 'processing' | 'rejected')
  const [previewTab, setPreviewTab] = useState('success')

  // Table filter state
  const [filterEvent, setFilterEvent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const limit = 15

  // Local form state for settings
  const [formState, setFormState] = useState({
    enabled: false,
    notifySuccess: true,
    notifyProcessing: false,
    notifyRejected: false,
    minAmount: 0,
  })
  const [isFormDirty, setIsFormDirty] = useState(false)

  // 1. Fetch Settings
  const { data: settingsData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['adminPaymentGroupSettings'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/payment-group/settings')
      if (!res.ok) throw new Error('Gagal memuat pengaturan grup pembayaran')
      const data = await res.json()
      return data.settings
    },
    onSuccess: (data) => {
      if (!isFormDirty) {
        setFormState({
          enabled: Boolean(data.enabled),
          notifySuccess: data.notifySuccess !== false,
          notifyProcessing: Boolean(data.notifyProcessing),
          notifyRejected: Boolean(data.notifyRejected),
          minAmount: data.minAmount || 0,
        })
      }
    },
  })

  // 2. Fetch Notifications List
  const {
    data: notifsData,
    isLoading: isNotifsLoading,
    refetch: refetchNotifs,
  } = useQuery({
    queryKey: ['adminPaymentGroupNotifs', page, limit, filterEvent, filterStatus, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (filterEvent && filterEvent !== 'all') params.append('event', filterEvent)
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus)
      if (searchQuery.trim()) params.append('search', searchQuery.trim())

      const res = await apiFetch(`/api/admin/payment-group/notifications?${params.toString()}`)
      if (!res.ok) throw new Error('Gagal memuat riwayat notifikasi')
      return res.json()
    },
    refetchInterval: 10000, // Polling setiap 10 detik agar realtime
  })

  // 3. Save Settings Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/admin/payment-group/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan pengaturan')
      }
      return res.json()
    },
    onSuccess: (res) => {
      setToast({ type: 'success', message: 'Pengaturan grup pembayaran berhasil disimpan!' })
      setIsFormDirty(false)
      queryClient.setQueryData(['adminPaymentGroupSettings'], res.settings)
    },
    onError: (err) => {
      setToast({ type: 'error', message: err.message })
    },
  })

  // 4. Send Test Message Mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/payment-group/test', {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengirim pesan pengujian')
      }
      return res.json()
    },
    onSuccess: () => {
      setToast({
        type: 'success',
        message: 'Pesan tes berhasil dikirim ke grup Telegram pengujian!',
      })
    },
    onError: (err) => {
      setToast({ type: 'error', message: err.message })
    },
  })

  // 5. Retry Notification Mutation
  const retryMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/payment-group/notifications/${id}/retry`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengulang notifikasi')
      }
      return res.json()
    },
    onSuccess: () => {
      setToast({
        type: 'success',
        message: 'Notifikasi berhasil dimasukkan kembali ke antrean BullMQ.',
      })
      queryClient.invalidateQueries({ queryKey: ['adminPaymentGroupNotifs'] })
    },
    onError: (err) => {
      setToast({ type: 'error', message: err.message })
    },
  })

  const handleSettingChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
    setIsFormDirty(true)
  }

  const handleSaveSettings = (e) => {
    e.preventDefault()
    saveMutation.mutate(formState)
  }

  // Pratinjau Teks Pesan Telegram
  const previewText = useMemo(() => {
    if (previewTab === 'success') {
      return (
        <div className="space-y-2.5">
          <p className="font-bold text-slate-100 text-[13px]">🎉 WITHDRAWAL BERHASIL!</p>
          <p className="text-slate-200">
            Halo, Member AF Blast! 👋<br /><br />
            Penarikan saldo kamu telah berhasil diproses dan ditransfer. Terima kasih telah menggunakan layanan AF Blast! 💙
          </p>
          <div className="py-1 text-slate-400 font-mono text-[11px]">━━━━━━━━━━━━━━━━━━</div>
          <p className="text-slate-200 leading-relaxed font-mono">
            💸 <b>Nominal:</b> Rp 250.000<br />
            🏦 <b>Bank:</b> BCA<br />
            👤 <b>Penerima:</b> T••• P••••••<br />
            💳 <b>Rekening:</b> ••••7890<br />
            ✅ <b>Status:</b> Berhasil Ditransfer
          </p>
          <div className="py-1 text-slate-400 font-mono text-[11px]">━━━━━━━━━━━━━━━━━━</div>
          <p className="text-slate-200">
            🚀 Terima kasih atas kepercayaan kamu kepada <b>AF Blast</b>.
          </p>
          <p className="text-slate-300 italic text-[11px]">
            ✨ Transaksi aman, proses nyaman!<br />
            <span className="not-italic font-bold text-sky-400">💙 AF BLAST — Fast, Secure, Reliable.</span>
          </p>
        </div>
      )
    }
    if (previewTab === 'processing') {
      return (
        <>
          <p className="font-bold text-slate-800">⏳ Withdrawal Diproses</p>
          <p className="mt-2 text-slate-700">
            💵 <b>Nominal:</b> Rp 250.000<br />
            🏦 <b>Bank:</b> BCA a/n T••• P••••••<br />
            🔢 <b>Rekening:</b> ••••7890<br />
            ✅ <b>Status:</b> Sedang diproses
          </p>
        </>
      )
    }
    return (
      <>
        <p className="font-bold text-slate-800">❌ Withdrawal Ditolak</p>
        <p className="mt-2 text-slate-700">
          💵 <b>Nominal:</b> Rp 250.000<br />
          🏦 <b>Bank:</b> BCA<br />
          🔢 <b>Rekening:</b> ••••7890<br />
          ✅ <b>Status:</b> Pengajuan ditolak
        </p>
        <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 p-1.5 rounded border border-amber-200">
          ℹ️ <i>Demi privasi member, varian ditolak TIDAK menampilkan nama pemilik dan TANPA alasan penolakan.</i>
        </p>
      </>
    )
  }, [previewTab])

  const canManage = hasPermission('paymentGroup.manage')

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header Halaman dengan Brand AF Blast */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#0B1220] text-white p-6 rounded-2xl shadow-xl border border-[#1E293B] relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-text shadow-inner">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Grup Pembayaran Telegram
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/20 text-[#60A5FA] border border-primary/30">
                  @AFBlastPaymentBot
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                Publikasi otomatis riwayat penarikan dana ke grup Telegram resmi dengan masking data ketat, rate limiting terintegrasi, dan proteksi privasi member.
              </p>
            </div>
          </div>
        </div>

        {/* Status Konfigurasi Lingkungan (.env) */}
        <div className="flex flex-wrap sm:flex-col gap-2 relative z-10 shrink-0">
          <div className="flex items-center gap-2 text-xs bg-[#070D18] px-3 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="text-slate-400">Bot Token:</span>
            {settingsData?.botTokenConfigured ? (
              <span className="text-success font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Terkonfigurasi
              </span>
            ) : (
              <span className="text-danger font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Belum Diatur
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs bg-[#070D18] px-3 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="text-slate-400">Grup Utama:</span>
            {settingsData?.chatIdConfigured ? (
              <span className="text-success font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Terkonfigurasi
              </span>
            ) : (
              <span className="text-danger font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Belum Diatur
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid 2 Kolom: Pengaturan & Live Bubble Mockup */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: Form Pengaturan (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleSaveSettings}
            className="bg-surface rounded-2xl shadow-sm border border-border p-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-text">
                  Konfigurasi Notifikasi Grup
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Tentukan kondisi penarikan mana saja yang dikirimkan ke grup Telegram.
                </p>
              </div>
              {!canManage && (
                <span className="text-xs bg-surface-2 text-muted px-2.5 py-1 rounded-md font-medium">
                  Mode Baca Saja
                </span>
              )}
            </div>

            {/* Master Toggle */}
            <div className="flex items-center justify-between p-4 bg-surface-2 rounded-xl border border-border">
              <div className="pr-4">
                <p className="text-sm font-semibold text-text">
                  Publikasi ke Grup Telegram
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Jika dinonaktifkan, seluruh proses penarikan akan dilewati (status: skipped).
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canManage || isSettingsLoading}
                  checked={formState.enabled}
                  onChange={(e) => handleSettingChange('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-2 border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Event Checkboxes */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Pemicu Notifikasi (Trigger Events)
              </p>

              <div className="space-y-2.5">
                {/* 1. Success */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-surface-2/60 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    disabled={!canManage || isSettingsLoading}
                    checked={formState.notifySuccess}
                    onChange={(e) => handleSettingChange('notifySuccess', e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4"
                  />
                  <div>
                    <span className="text-sm font-semibold text-text">
                      Tandai Berhasil (Sukses Ditransfer)
                    </span>
                    <p className="text-xs text-muted mt-0.5">
                      Direkomendasikan. Mengirim bukti transparansi pembayaran yang telah selesai dikirim admin finance.
                    </p>
                  </div>
                </label>

                {/* 2. Processing */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-surface-2/60 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    disabled={!canManage || isSettingsLoading}
                    checked={formState.notifyProcessing}
                    onChange={(e) => handleSettingChange('notifyProcessing', e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4"
                  />
                  <div>
                    <span className="text-sm font-semibold text-text">
                      Setujui (Sedang Diproses)
                    </span>
                    <p className="text-xs text-muted mt-0.5">
                      Kirimkan pemberitahuan saat permohonan disetujui dan sedang dalam antrean pengiriman.
                    </p>
                  </div>
                </label>

                {/* 3. Rejected */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-surface-2/60 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    disabled={!canManage || isSettingsLoading}
                    checked={formState.notifyRejected}
                    onChange={(e) => handleSettingChange('notifyRejected', e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4"
                  />
                  <div>
                    <span className="text-sm font-semibold text-text">
                      Tolak Penarikan (Ditolak)
                    </span>
                    <p className="text-xs text-muted mt-0.5">
                      Mengirim status penolakan. Data dikirimkan TANPA nama pemilik dan TANPA alasan penolakan.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Minimal Amount */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Batas Nominal Minimal (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  disabled={!canManage || isSettingsLoading}
                  value={formState.minAmount}
                  onChange={(e) =>
                    handleSettingChange('minAmount', Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-surface text-text text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted"
                  placeholder="0 (Semua nominal)"
                />
              </div>
              <p className="text-xs text-muted mt-1.5">
                Nilai 0 berarti semua nominal penarikan akan dipublikasikan. Contoh: isi 50.000 untuk hanya mengirim penarikan minimal Rp 50.000.
              </p>
            </div>

            {/* Aturan Privasi & Keamanan */}
            <div className="bg-primary-soft/60 border border-primary/20 rounded-xl p-4 text-xs text-text space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-primary">
                <Shield className="w-4 h-4 text-primary" />
                <span>Aturan Penyamaran & Keamanan AF Blast:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted pl-1">
                <li>Nama pemilik disamarkan otomatis (maksimal 3 kata, huruf pertama + titik-titik).</li>
                <li>Nomor rekening atau e-wallet hanya menampilkan 4 digit terakhir (contoh: ••••7890).</li>
                <li>Member dapat memilih opsi privasi di halaman Saldo untuk menyembunyikan penarikannya.</li>
                <li>Bot Telegram hanya memakai izin minimal <code>sendMessage</code> (tidak pin/hapus).</li>
              </ul>
            </div>

            {/* Tombol Simpan */}
            <Can permission="paymentGroup.manage">
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saveMutation.isPending || isSettingsLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-white shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Simpan Pengaturan
                    </>
                  )}
                </button>
              </div>
            </Can>
          </form>

          {/* Card Uji Coba Pengiriman */}
          <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-warning/15 border border-warning/30 flex items-center justify-center text-warning">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">
                    Uji Coba Pengiriman Pesan ([TES])
                  </h3>
                  <p className="text-xs text-muted">
                    Kirim pesan simulasi ke grup Telegram pengujian (<code>TELEGRAM_PAYMENT_TEST_CHAT_ID</code>).
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <div className="text-xs text-muted">
                <span className="font-semibold text-text">Batas Pengujian:</span> Maksimal 3 kali per jam.
              </div>

              <Can permission="paymentGroup.manage">
                <button
                  type="button"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !settingsData?.testChatIdConfigured}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface border border-border text-text transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {testMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Mengirim Uji Coba...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Kirim Pesan Uji Coba
                    </>
                  )}
                </button>
              </Can>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Pratinjau Chat Bubble Realistis (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-primary" />
                  Pratinjau Pesan Telegram
                </h3>
                <p className="text-xs text-muted">
                  Simulasi tampilan riwayat di grup Telegram.
                </p>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                CONTOH
              </span>
            </div>

            {/* Pilihan Tab Pratinjau */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface-2 border border-border rounded-xl text-xs font-medium text-muted">
              <button
                type="button"
                onClick={() => setPreviewTab('success')}
                className={`py-1.5 rounded-lg transition-all ${
                  previewTab === 'success'
                    ? 'bg-surface text-primary font-bold shadow-xs'
                    : 'hover:text-text'
                }`}
              >
                Sukses
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('processing')}
                className={`py-1.5 rounded-lg transition-all ${
                  previewTab === 'processing'
                    ? 'bg-surface text-primary font-bold shadow-xs'
                    : 'hover:text-text'
                }`}
              >
                Diproses
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('rejected')}
                className={`py-1.5 rounded-lg transition-all ${
                  previewTab === 'rejected'
                    ? 'bg-surface text-primary font-bold shadow-xs'
                    : 'hover:text-text'
                }`}
              >
                Ditolak
              </button>
            </div>

            {/* Visual Chat Bubble Mockup */}
            <div className="relative rounded-2xl bg-[#0e1621] p-5 text-white font-sans overflow-hidden shadow-inner border border-slate-700/50">
              {/* Watermark Label */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-5">
                <span className="text-7xl font-black rotate-[-25deg] tracking-widest text-white">
                  PREVIEW
                </span>
              </div>

              {/* Bot Header in Chat */}
              <div className="flex items-center gap-3 border-b border-slate-700/60 pb-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shadow">
                  AF
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-slate-100">
                      AF Blast Payment Bot
                    </span>
                    <span className="text-[10px] bg-primary/30 text-[#60A5FA] px-1 rounded">
                      bot
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">@AFBlastPaymentBot</span>
                </div>
              </div>

              {/* Chat Bubble */}
              <div className="bg-[#182533] rounded-2xl rounded-tl-sm p-4 text-xs leading-relaxed shadow-md border border-slate-700/50 relative">
                {previewText}

                <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-slate-400">
                  <span>14:32</span>
                  <Check className="w-3 h-3 text-sky-400" />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted text-center italic">
              Pesan dikirimkan sesuai format HTML Telegram secara otomatis setelah aksi diproses.
            </p>
          </div>
        </div>
      </div>

      {/* Bagian Bawah: Riwayat Notifikasi Penarikan (Log BullMQ) */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
        {/* Header Tabel & Filter */}
        <div className="p-6 border-b border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-text">
                Log Notifikasi Riwayat Penarikan
              </h2>
              <p className="text-xs text-muted">
                Rekaman setiap proses pengiriman notifikasi penarikan ke grup Telegram.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchNotifs()}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted hover:text-text hover:bg-surface-2 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Segarkan
            </button>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari ID penarikan, nama, bank..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Filter Event */}
            <div>
              <select
                value={filterEvent}
                onChange={(e) => {
                  setFilterEvent(e.target.value)
                  setPage(1)
                }}
                className="w-full py-2 px-3 text-xs rounded-xl border border-border bg-surface-2 text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">Semua Kejadian (Event)</option>
                <option value="success">Sukses (Berhasil)</option>
                <option value="processing">Diproses</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>

            {/* Filter Status */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value)
                  setPage(1)
                }}
                className="w-full py-2 px-3 text-xs rounded-xl border border-border bg-surface-2 text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">Semua Status Pengiriman</option>
                <option value="sent">Terkirim (Sent)</option>
                <option value="pending">Mengantre (Pending)</option>
                <option value="failed">Gagal (Failed)</option>
                <option value="skipped">Dilewati (Skipped)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabel */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-muted uppercase font-semibold text-[10px] tracking-wider">
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">ID Penarikan</th>
                <th className="py-3 px-4">Kejadian</th>
                <th className="py-3 px-4">Penerima & Rekening</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Status Pengiriman</th>
                <th className="py-3 px-4">Keterangan / Error</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isNotifsLoading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Memuat riwayat notifikasi...
                  </td>
                </tr>
              ) : notifsData?.notifications?.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-muted">
                    Tidak ada riwayat notifikasi yang sesuai filter.
                  </td>
                </tr>
              ) : (
                notifsData?.notifications?.map((notif) => {
                  const wd = notif.withdrawal
                  const dateStr = new Date(notif.createdAt).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })

                  return (
                    <tr key={notif.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="py-3 px-4 text-muted whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        #{notif.withdrawalId}
                      </td>
                      <td className="py-3 px-4">
                        {notif.event === 'success' && (
                          <Badge variant="success" size="sm">
                            Sukses
                          </Badge>
                        )}
                        {notif.event === 'processing' && (
                          <Badge variant="info" size="sm">
                            Diproses
                          </Badge>
                        )}
                        {notif.event === 'rejected' && (
                          <Badge variant="danger" size="sm">
                            Ditolak
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">
                          {notif.payload?.maskedName || 'Nama Disamarkan'}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {wd?.bank || 'Bank'} • {notif.payload?.maskedAccount || '••••0000'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {formatRupiah(wd?.amount || 0)}
                      </td>
                      <td className="py-3 px-4">
                        {notif.status === 'sent' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            Terkirim
                          </span>
                        )}
                        {notif.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-500 animate-spin" />
                            Mengantre ({notif.attempts}/5)
                          </span>
                        )}
                        {notif.status === 'skipped' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            Dilewati
                          </span>
                        )}
                        {notif.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-500" />
                            Gagal ({notif.attempts}x)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-500" title={notif.lastError || notif.payload?.skipReason || '-'}>
                        {notif.lastError || notif.payload?.skipReason || (notif.status === 'sent' ? 'ID Pesan: ' + notif.telegramMessageId : '-')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {notif.status === 'failed' && canManage && (
                          <button
                            type="button"
                            onClick={() => retryMutation.mutate(notif.id)}
                            disabled={retryMutation.isPending}
                            className="px-2 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors border border-rose-200 inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Ulangi
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {notifsData?.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Menampilkan {notifsData?.notifications?.length} dari {notifsData?.total} notifikasi
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-semibold text-slate-700">
                {page} / {notifsData?.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(notifsData.totalPages, p + 1))}
                disabled={page >= notifsData?.totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
