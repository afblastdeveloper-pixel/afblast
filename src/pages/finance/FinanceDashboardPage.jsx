import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Check,
  XCircle,
  Send,
  EyeOff,
  Shield,
  MessageSquare,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Toast from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import { staffPath } from '../../utils/portal'

export default function FinanceDashboardPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const location = useLocation()

  const [financeData, setFinanceData] = useState(null)
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  // 1. Modal Setujui & Berikan Review ke Client
  const [approveModal, setApproveModal] = useState({
    isOpen: false,
    item: null,
    reviewNote: 'Pengajuan penarikan disetujui oleh admin keuangan. Dana sedang diproses transfer ke rekening Anda.',
    isSubmitting: false,
  })

  // 2. Modal Tandai Berhasil
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    item: null,
    transferRef: 'Transfer berhasil diselesaikan dan diverifikasi via BI-Fast',
    isSubmitting: false,
  })

  // 3. Modal Tolak & Berikan Review ke Client
  const [rejectModal, setRejectModal] = useState({
    isOpen: false,
    item: null,
    reason: '',
    error: '',
    isSubmitting: false,
  })

  // 4. Modal Lihat Review
  const [viewDetailModal, setViewDetailModal] = useState({
    isOpen: false,
    item: null,
  })

  // Path dinamis untuk rute penarikan
  const basePath = useMemo(() => {
    return staffPath('/finance')
  }, [])

  const quickApproveNotes = [
    'Pengajuan penarikan disetujui. Dana sedang diproses kirim ke rekening Anda.',
    'Disetujui. Estimasi dana masuk 1x24 jam hari kerja.',
    'Disetujui oleh admin keuangan. Sedang menunggu antrean transfer bank.',
  ]

  const quickRejectReasons = [
    'Nomor rekening tidak ditemukan atau salah',
    'Nama pemilik rekening tidak sesuai dengan identitas akun',
    'Nomor rekening tujuan dormant atau diblokir bank',
    'Syarat minimum penarikan belum terpenuhi',
    'Permintaan penarikan dibatalkan oleh pengguna',
  ]

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch dashboard finance stats
      const statsRes = await fetch('/api/admin/dashboard/finance', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!statsRes.ok) throw new Error('Gagal memuat ringkasan keuangan')
      const statsData = await statsRes.json()
      setFinanceData(statsData.finance || {})

      // 2. Fetch withdrawals
      const withRes = await fetch('/api/admin/withdrawals', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (withRes.ok) {
        const withData = await withRes.json()
        setWithdrawals(withData.withdrawals || [])
      }
    } catch (err) {
      console.error('Error fetching finance data:', err)
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const formatRupiah = (val) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0)

  // Trigger Action Handlers
  const triggerApprove = (item) => {
    setApproveModal({
      isOpen: true,
      item,
      reviewNote: 'Pengajuan penarikan disetujui oleh admin keuangan. Dana sedang diproses transfer ke rekening Anda.',
      isSubmitting: false,
    })
  }

  const handleApproveSubmit = async (e) => {
    e.preventDefault()
    const { item, reviewNote } = approveModal
    if (!item) return

    setApproveModal((prev) => ({ ...prev, isSubmitting: true }))

    try {
      const res = await fetch(`/api/admin/withdrawals/${item.id}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: reviewNote.trim() }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal menyetujui penarikan')
      }

      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === item.id
            ? { ...w, status: 'processing', note: reviewNote.trim() }
            : w
        )
      )

      setApproveModal({ isOpen: false, item: null, reviewNote: '', isSubmitting: false })
      setToastMsg({
        type: 'success',
        text: `Penarikan #${item.id} disetujui. Review telah dikirimkan ke Telegram client.`,
      })
      fetchData()
    } catch (err) {
      setToastMsg({ type: 'danger', text: err.message || 'Gagal memproses persetujuan' })
      setApproveModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const triggerReject = (item) => {
    setRejectModal({
      isOpen: true,
      item,
      reason: '',
      error: '',
      isSubmitting: false,
    })
  }

  const handleRejectSubmit = async (e) => {
    e.preventDefault()
    const { item, reason } = rejectModal
    if (!reason.trim()) {
      setRejectModal((prev) => ({
        ...prev,
        error: 'Alasan penolakan / review untuk client wajib diisi.',
      }))
      return
    }

    setRejectModal((prev) => ({ ...prev, isSubmitting: true }))

    try {
      const res = await fetch(`/api/admin/withdrawals/${item.id}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal menolak penarikan')
      }

      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === item.id
            ? { ...w, status: 'rejected', rejectionReason: reason.trim() }
            : w
        )
      )

      setRejectModal({ isOpen: false, item: null, reason: '', error: '', isSubmitting: false })
      setToastMsg({
        type: 'success',
        text: `Penarikan #${item.id} ditolak. Saldo dikembalikan & review dikirim ke client.`,
      })
      fetchData()
    } catch (err) {
      setToastMsg({ type: 'danger', text: err.message || 'Gagal memproses penolakan' })
      setRejectModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const triggerMarkSuccess = (item) => {
    setSuccessModal({
      isOpen: true,
      item,
      transferRef: 'Transfer berhasil diselesaikan dan diverifikasi via BI-Fast',
      isSubmitting: false,
    })
  }

  const handleSuccessSubmit = async (e) => {
    e.preventDefault()
    const { item, transferRef } = successModal
    if (!item) return

    setSuccessModal((prev) => ({ ...prev, isSubmitting: true }))

    try {
      const res = await fetch(`/api/admin/withdrawals/${item.id}/success`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: transferRef.trim() }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal menyelesaikan penarikan')
      }

      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === item.id
            ? { ...w, status: 'success', note: transferRef.trim() }
            : w
        )
      )

      setSuccessModal({ isOpen: false, item: null, transferRef: '', isSubmitting: false })
      setToastMsg({
        type: 'success',
        text: `Penarikan #${item.id} berhasil ditandai selesai dan dipublikasikan ke grup Telegram!`,
      })
      fetchData()
    } catch (err) {
      setToastMsg({ type: 'danger', text: err.message || 'Gagal memproses konfirmasi transfer' })
      setSuccessModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Toast Alert */}
      {toastMsg && (
        <Toast
          message={toastMsg.text}
          type={toastMsg.type}
          onClose={() => setToastMsg(null)}
        />
      )}

      {/* Header Panel with PageHeader Component */}
      <PageHeader
        title="Dashboard Keuangan"
        subtitle="Ringkasan omset transaksi, penarikan saldo, status notifikasi Telegram, dan review langsung ke client."
        badge="Finance"
        actions={
          <div className="flex items-center gap-2">
            <Link
              to={`${basePath}/withdrawals`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors shadow-xs"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Kelola Semua Penarikan</span>
            </Link>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-surface border border-border text-text hover:bg-surface-2 transition-colors shadow-xs disabled:opacity-50"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="text-xs font-semibold underline hover:no-underline text-danger"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
          <p className="text-sm">Memuat data keuangan...</p>
        </div>
      ) : (
        <>
          {/* Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Pendapatan"
              value={formatRupiah(financeData?.totalRevenue)}
              icon={TrendingUp}
              delta="+14.2% bln ini"
              trend="up"
            />
            <StatCard
              title="Pendapatan Bulan Ini"
              value={formatRupiah(financeData?.monthlyRevenue)}
              icon={DollarSign}
            />
            <StatCard
              title="Penarikan Menunggu"
              value={formatRupiah(financeData?.pendingWithdrawals)}
              icon={Clock}
              delta="Perlu diproses"
              trend="down"
            />
            <StatCard
              title="Penarikan Selesai"
              value={formatRupiah(financeData?.completedWithdrawals)}
              icon={CheckCircle2}
              delta="Bulan ini"
              trend="up"
            />
          </div>

          {/* Quick Links & Permintaan Penarikan Terbaru */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tabel Penarikan Menunggu / Terbaru */}
            <div className="lg:col-span-2 bg-surface rounded-2xl border border-border shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <span>Persetujuan Penarikan & Status Telegram</span>
                    <span className="text-[11px] font-semibold bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                      Live
                    </span>
                  </h2>
                  <p className="text-xs text-muted">
                    Setujui atau tolak penarikan serta berikan review langsung ke Telegram client
                  </p>
                </div>
                <Link
                  to={`${basePath}/withdrawals`}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <span>Buka Semua Penarikan</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {withdrawals.length === 0 ? (
                <EmptyState
                  title="Tidak Ada Penarikan"
                  description="Saat ini belum ada permintaan penarikan saldo."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-semibold uppercase">
                        <th className="pb-3 text-start">Pengguna</th>
                        <th className="pb-3 text-start">Bank & Rekening</th>
                        <th className="pb-3 text-end">Jumlah</th>
                        <th className="pb-3 text-start pl-3">Status & Telegram</th>
                        <th className="pb-3 text-end">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {withdrawals.slice(0, 8).map((w) => {
                        const notif = w.latestNotification || w.paymentNotifications?.[0]
                        const isPending = w.status === 'pending'
                        const isProcessing = w.status === 'processing' || w.status === 'approved'

                        return (
                          <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                            {/* 1. Pengguna */}
                            <td className="py-3">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {w.userName || `User #${w.userId}`}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate max-w-[130px]">
                                {w.userEmail || '-'}
                              </p>
                            </td>

                            {/* 2. Bank & Rekening */}
                            <td className="py-3 text-slate-600 dark:text-slate-300">
                              <div className="font-medium text-slate-800 dark:text-slate-100">{w.bank || 'Bank'}</div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {w.accountNumber || '-'}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                a.n {w.accountName || w.userName || '-'}
                              </div>
                            </td>

                            {/* 3. Jumlah */}
                            <td className="py-3 text-end font-bold font-mono text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                              {formatRupiah(w.amount)}
                            </td>

                            {/* 4. Status & Telegram */}
                            <td className="py-3 pl-3 min-w-[180px]">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge
                                    variant={
                                      w.status === 'success'
                                        ? 'success'
                                        : w.status === 'rejected'
                                        ? 'danger'
                                        : isProcessing
                                        ? 'info'
                                        : 'warning'
                                    }
                                    dot={true}
                                    size="sm"
                                  >
                                    {w.status === 'pending'
                                      ? 'Menunggu'
                                      : isProcessing
                                      ? 'Diproses'
                                      : w.status === 'success'
                                      ? 'Berhasil'
                                      : w.status === 'rejected'
                                      ? 'Ditolak'
                                      : w.status}
                                  </Badge>

                                  {/* Badge Bot Client */}
                                  {w.telegramLinked ? (
                                    <span
                                      title="Bot Telegram Client Aktif (Client menerima review di Telegram)"
                                      className="inline-flex items-center text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-indigo-200 dark:border-indigo-800"
                                    >
                                      <Send className="w-2.5 h-2.5 mr-0.5 text-indigo-500" />
                                      Bot Client
                                    </span>
                                  ) : (
                                    <span
                                      title="Client belum menautkan Telegram"
                                      className="inline-flex items-center text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded text-[10px] border border-slate-200 dark:border-slate-700"
                                    >
                                      Bot Off
                                    </span>
                                  )}

                                  {/* Status Grup Telegram */}
                                  {notif?.status === 'sent' && (
                                    <span
                                      title="Terkirim ke Grup Telegram Resmi"
                                      className="inline-flex items-center text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800"
                                    >
                                      <Send className="w-2.5 h-2.5 mr-0.5 text-emerald-500" />
                                      Grup
                                    </span>
                                  )}
                                  {notif?.status === 'pending' && (
                                    <span
                                      title="Antrean kirim grup Telegram"
                                      className="inline-flex items-center text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-200 dark:border-amber-800"
                                    >
                                      <Clock className="w-2.5 h-2.5 mr-0.5 animate-spin text-amber-500" />
                                      Antre
                                    </span>
                                  )}
                                  {notif?.status === 'skipped' && (
                                    <span
                                      title="Dilewati (privasi / aturan)"
                                      className="inline-flex items-center text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded text-[10px] border border-slate-200 dark:border-slate-700"
                                    >
                                      <EyeOff className="w-2.5 h-2.5 mr-0.5" />
                                      Skip
                                    </span>
                                  )}
                                  {notif?.status === 'failed' && (
                                    <span
                                      title={`Gagal kirim grup: ${notif.lastError}`}
                                      className="inline-flex items-center text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-rose-200 dark:border-rose-800"
                                    >
                                      <AlertCircle className="w-2.5 h-2.5 mr-0.5 text-rose-500" />
                                      Gagal
                                    </span>
                                  )}
                                </div>

                                {/* Review / Catatan Preview */}
                                {w.rejectionReason ? (
                                  <div
                                    onClick={() => setViewDetailModal({ isOpen: true, item: w })}
                                    className="text-[11px] text-rose-700 bg-rose-50/90 border border-rose-200 rounded p-1 cursor-pointer hover:bg-rose-100/70 transition-colors"
                                    title="Klik untuk detail review"
                                  >
                                    <span className="font-bold block text-[9px] uppercase text-rose-800">Review Ditolak:</span>
                                    <p className="line-clamp-1 italic text-[10px]">"{w.rejectionReason}"</p>
                                  </div>
                                ) : w.note ? (
                                  <div
                                    onClick={() => setViewDetailModal({ isOpen: true, item: w })}
                                    className="text-[11px] text-blue-700 bg-blue-50/90 border border-blue-200 rounded p-1 cursor-pointer hover:bg-blue-100/70 transition-colors"
                                    title="Klik untuk detail review"
                                  >
                                    <span className="font-bold block text-[9px] uppercase text-blue-800">Review Admin:</span>
                                    <p className="line-clamp-1 italic text-[10px]">"{w.note}"</p>
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            {/* 5. Tindakan Cepat */}
                            <td className="py-3 text-end whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                {isPending && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => triggerApprove(w)}
                                      className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200 inline-flex items-center gap-1 shadow-2xs"
                                      title="Setujui dan beri review ke client"
                                    >
                                      <Check className="w-3 h-3" />
                                      Setujui
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerReject(w)}
                                      className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200 inline-flex items-center gap-1 shadow-2xs"
                                      title="Tolak dan kembalikan saldo dengan review"
                                    >
                                      <XCircle className="w-3 h-3" />
                                      Tolak
                                    </button>
                                  </>
                                )}

                                {isProcessing && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => triggerMarkSuccess(w)}
                                      className="px-2 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors border border-blue-200 inline-flex items-center gap-1 shadow-2xs"
                                      title="Konfirmasi transfer berhasil"
                                    >
                                      <Check className="w-3 h-3" />
                                      Selesai
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerReject(w)}
                                      className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200 inline-flex items-center gap-1 shadow-2xs"
                                      title="Tolak penarikan"
                                    >
                                      <XCircle className="w-3 h-3" />
                                      Tolak
                                    </button>
                                  </>
                                )}

                                {!isPending && !isProcessing && (
                                  <button
                                    type="button"
                                    onClick={() => setViewDetailModal({ isOpen: true, item: w })}
                                    className="px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-200 transition-colors inline-flex items-center gap-1"
                                  >
                                    <MessageSquare className="w-3 h-3 text-slate-500" />
                                    Review
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick Actions & Menu Navigasi Finance */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                  Akses Cepat Keuangan
                </h3>
                <div className="space-y-2">
                  <Link
                    to={`${basePath}/withdrawals`}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors text-xs font-semibold"
                  >
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>Persetujuan Penarikan (Lengkap)</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    to={`${basePath}/commissions`}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors text-xs font-semibold"
                  >
                    <div className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>Laporan Komisi Referral</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    to={`${basePath}/payment-group`}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors text-xs font-semibold"
                  >
                    <div className="flex items-center gap-2.5">
                      <Send className="w-4 h-4 text-emerald-600" />
                      <span>Pengaturan Grup Pembayaran Telegram</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Info Hak Akses Finance */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4 text-xs text-blue-800 dark:text-blue-300">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>Kanal Telegram Otomatis</span>
                </p>
                <p className="leading-relaxed text-[11px]">
                  Setiap kali Anda <b>menyetujui</b> atau <b>menolak</b> penarikan dengan catatan review, bot Telegram akan langsung mengirimkan pesan secara instan ke bot pribadi member dan mempublikasikan ringkasan ke grup Telegram resmi.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 1. MODAL SETUJUI & BERIKAN REVIEW KE CLIENT */}
      {/* ========================================================================= */}
      {approveModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() =>
            !approveModal.isSubmitting &&
            setApproveModal({ isOpen: false, item: null, reviewNote: '', isSubmitting: false })
          }
          title="Setujui Penarikan & Kirim Review ke Client"
          subtitle={`Permohonan #${approveModal.item?.id} • Pemohon: ${approveModal.item?.userName}`}
          maxWidth="lg"
        >
          <form onSubmit={handleApproveSubmit} className="space-y-4">
            {/* Ringkasan Permohonan */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Nominal Penarikan:</span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {formatRupiah(approveModal.item?.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
                <div>
                  <span className="text-slate-400 block text-[11px]">Metode Transfer:</span>
                  <span className="font-semibold text-slate-800">{approveModal.item?.bank || 'Bank Transfer'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Rekening Tujuan:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {approveModal.item?.accountNumber} (a.n {approveModal.item?.accountName || approveModal.item?.userName})
                  </span>
                </div>
              </div>
            </div>

            {/* Status Telegram Client */}
            <div className="p-3 rounded-xl border text-xs flex items-start gap-2.5 bg-indigo-50/70 border-indigo-200/80">
              <Send className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-900">
                  {approveModal.item?.telegramLinked
                    ? 'Bot Telegram Client Terhubung'
                    : 'Client Belum Menautkan Telegram'}
                </p>
                <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                  {approveModal.item?.telegramLinked
                    ? 'Catatan review ini akan otomatis dikirimkan langsung ke bot Telegram pribadi member bersama pemberitahuan penarikan.'
                    : 'Catatan review ini akan disimpan dan ditampilkan pada halaman riwayat penarikan saldo member.'}
                </p>
              </div>
            </div>

            {/* Input Review / Catatan Admin */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Catatan Review untuk Client
              </label>
              <textarea
                rows={3}
                value={approveModal.reviewNote}
                onChange={(e) =>
                  setApproveModal({ ...approveModal, reviewNote: e.target.value })
                }
                placeholder="Tuliskan catatan review proses penarikan untuk client..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-800 leading-relaxed"
                required
              />

              {/* Quick Chip Catatan */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Pilihan Cepat:</span>
                {quickApproveNotes.map((noteText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setApproveModal({ ...approveModal, reviewNote: noteText })}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 transition-colors"
                  >
                    {noteText.slice(0, 32)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={approveModal.isSubmitting}
                onClick={() =>
                  setApproveModal({ isOpen: false, item: null, reviewNote: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={approveModal.isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {approveModal.isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Setujui & Kirim Review
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 2. MODAL TOLAK & BERIKAN REVIEW KE CLIENT */}
      {/* ========================================================================= */}
      {rejectModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() =>
            !rejectModal.isSubmitting &&
            setRejectModal({ isOpen: false, item: null, reason: '', error: '', isSubmitting: false })
          }
          title="Tolak Penarikan & Berikan Review ke Client"
          subtitle={`Permohonan #${rejectModal.item?.id} • Pemohon: ${rejectModal.item?.userName}`}
          maxWidth="lg"
        >
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">
                  Saldo Sebesar {formatRupiah(rejectModal.item?.amount)} Akan Dikembalikan
                </p>
                <p className="text-red-700 mt-0.5 leading-relaxed text-[11px]">
                  Saldo akan langsung dikembalikan ke akun member. Alasan penolakan / review ini akan dikirimkan ke Telegram pribadi client dan ditampilkan pada riwayat penarikan member.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Alasan Penolakan / Review untuk Client <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectModal.reason}
                onChange={(e) =>
                  setRejectModal({
                    ...rejectModal,
                    reason: e.target.value,
                    error: '',
                  })
                }
                placeholder="Tuliskan alasan penolakan secara jelas agar member dapat memperbaikinya..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-slate-800 leading-relaxed"
                required
              />
              {rejectModal.error && (
                <p className="text-xs text-red-500 mt-1 font-medium">{rejectModal.error}</p>
              )}

              {/* Template Alasan Cepat */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Pilihan Cepat:</span>
                {quickRejectReasons.map((reasonText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setRejectModal({
                        ...rejectModal,
                        reason: reasonText,
                        error: '',
                      })
                    }
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 transition-colors"
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={rejectModal.isSubmitting}
                onClick={() =>
                  setRejectModal({ isOpen: false, item: null, reason: '', error: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={rejectModal.isSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {rejectModal.isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menolak...
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    Tolak Penarikan & Kembalikan Saldo
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL TANDAI BERHASIL (TRANSFER SELESAI) */}
      {/* ========================================================================= */}
      {successModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() =>
            !successModal.isSubmitting &&
            setSuccessModal({ isOpen: false, item: null, transferRef: '', isSubmitting: false })
          }
          title="Tandai Penarikan Berhasil Ditransfer"
          subtitle={`Permohonan #${successModal.item?.id} • Nominal: ${formatRupiah(successModal.item?.amount)}`}
          maxWidth="md"
        >
          <form onSubmit={handleSuccessSubmit} className="space-y-4">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">Transfer Siap Diselesaikan</p>
                <p className="text-emerald-700 mt-0.5 leading-relaxed text-[11px]">
                  Konfirmasi ini akan menandai status transfer menjadi <b>Berhasil</b>, mengirimkan bukti transfer ke bot Telegram client, dan mempublikasikan ringkasan ke Grup Telegram.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Nomor Referensi Transfer / Catatan Bank
              </label>
              <input
                type="text"
                value={successModal.transferRef}
                onChange={(e) =>
                  setSuccessModal({ ...successModal, transferRef: e.target.value })
                }
                placeholder="Contoh: TRX-BCA-20261022-9901 atau Berhasil via BI-Fast"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={successModal.isSubmitting}
                onClick={() =>
                  setSuccessModal({ isOpen: false, item: null, transferRef: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={successModal.isSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {successModal.isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Konfirmasi Transfer Berhasil
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL DETAIL LIHAT REVIEW / CATATAN CLIENT */}
      {/* ========================================================================= */}
      {viewDetailModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setViewDetailModal({ isOpen: false, item: null })}
          title="Detail Review Penarikan Client"
          subtitle={`ID Permohonan #${viewDetailModal.item?.id}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{viewDetailModal.item?.userName}</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatRupiah(viewDetailModal.item?.amount)}
                </span>
              </div>
              <p className="text-slate-400">{viewDetailModal.item?.userEmail}</p>
              <div className="pt-1.5 border-t border-slate-200 text-slate-600 flex items-center justify-between">
                <span>{viewDetailModal.item?.bank} ({viewDetailModal.item?.accountNumber})</span>
                <span className="font-semibold">{viewDetailModal.item?.accountName || viewDetailModal.item?.userName}</span>
              </div>
            </div>

            {viewDetailModal.item?.rejectionReason && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <span className="font-bold text-rose-800 uppercase tracking-wider text-[10px] block">
                  Alasan Penolakan yang Diterima Client:
                </span>
                <p className="text-rose-900 leading-relaxed italic text-xs">
                  "{viewDetailModal.item?.rejectionReason}"
                </p>
              </div>
            )}

            {viewDetailModal.item?.note && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                <span className="font-bold text-blue-800 uppercase tracking-wider text-[10px] block">
                  Catatan / Review Admin yang Diberikan:
                </span>
                <p className="text-blue-900 leading-relaxed italic text-xs">
                  "{viewDetailModal.item?.note}"
                </p>
              </div>
            )}

            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-slate-600 space-y-1">
              <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 block">
                Kanal Notifikasi Telegram:
              </span>
              <p className="text-[11px]">
                • Bot Personal Client: <b>{viewDetailModal.item?.telegramLinked ? 'Terkirim ke Telegram Member' : 'Belum Ditautkan'}</b>
              </p>
              <p className="text-[11px]">
                • Siaran Grup Telegram: <b>{viewDetailModal.item?.latestNotification?.status || 'Tidak ada antrean grup'}</b>
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewDetailModal({ isOpen: false, item: null })}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
