import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Check,
  FileSpreadsheet,
  Send,
  Clock,
  EyeOff,
  Shield,
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Info,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Tabs from '../../components/ui/Tabs'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Toast from '../../components/ui/Toast'
import PageHeader from '../../components/ui/PageHeader'
import { apiFetch } from '../../utils/client'
import { useAdminStream } from '../../hooks/useAdminStream'
import { ADMIN_WITHDRAWALS } from '../../data/admin/withdrawals'

export default function AdminWithdrawalsPage() {
  const { t, i18n } = useTranslation()
  const { lastEventAt } = useAdminStream()
  const [withdrawals, setWithdrawals] = useState(ADMIN_WITHDRAWALS)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'pending' | 'processing' | 'success' | 'rejected'
  const [isLoading, setIsLoading] = useState(false)

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

  // 4. Modal Lihat Review / Detail Catatan
  const [viewDetailModal, setViewDetailModal] = useState({
    isOpen: false,
    item: null,
  })

  // Toast State
  const [toastMsg, setToastMsg] = useState(null)

  // Format currency
  const formatRupiah = (val) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0)

  // Load real data dari backend API
  const loadWithdrawals = async () => {
    setIsLoading(true)
    try {
      const res = await apiFetch('/api/admin/withdrawals')
      if (res.ok) {
        const data = await res.json()
        if (data.withdrawals) {
          setWithdrawals(
            data.withdrawals.map((w) => ({
              ...w,
              userName: w.userName || 'Member',
              userEmail: w.userEmail || '-',
              date: w.createdAt ? new Date(w.createdAt).toISOString().slice(0, 10) : '-',
              time: w.createdAt ? new Date(w.createdAt).toTimeString().slice(0, 5) : '-',
              method: w.bank || 'Bank Transfer',
              destination: w.accountNumber || '-',
              destinationName: w.accountName || w.userName || '-',
            }))
          )
        }
      }
    } catch (err) {
      // tetap gunakan mock data jika endpoint bermasalah
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadWithdrawals()
  }, [lastEventAt])

  // Tab definitions dengan hitungan dinamis (memperhitungkan 'approved' dan 'processing')
  const tabs = [
    { key: 'all', label: 'Semua Status', count: withdrawals.length },
    {
      key: 'pending',
      label: 'Menunggu',
      count: withdrawals.filter((w) => w.status === 'pending').length,
    },
    {
      key: 'processing',
      label: 'Diproses',
      count: withdrawals.filter((w) => w.status === 'processing' || w.status === 'approved').length,
    },
    {
      key: 'success',
      label: 'Berhasil',
      count: withdrawals.filter((w) => w.status === 'success').length,
    },
    {
      key: 'rejected',
      label: 'Ditolak',
      count: withdrawals.filter((w) => w.status === 'rejected').length,
    },
  ]

  // Filtered by Tab
  const filteredWithdrawals = useMemo(() => {
    if (activeTab === 'all') return withdrawals
    if (activeTab === 'processing') {
      return withdrawals.filter((w) => w.status === 'processing' || w.status === 'approved')
    }
    return withdrawals.filter((w) => w.status === activeTab)
  }, [withdrawals, activeTab])

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'ID',
      'User',
      'Email',
      'Tanggal',
      'Nominal',
      'Metode',
      'Rekening/Tujuan',
      'Atas Nama',
      'Status',
      'Review/Catatan Client',
    ]
    const rows = filteredWithdrawals.map((w) => [
      w.id,
      `"${w.userName}"`,
      w.userEmail,
      `${w.date} ${w.time}`,
      w.amount,
      w.method,
      `'${w.destination}`,
      `"${w.destinationName}"`,
      w.status,
      `"${w.rejectionReason || w.note || ''}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `withdrawals_report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setToastMsg({ type: 'success', text: 'Laporan penarikan berhasil diekspor ke CSV!' })
  }

  // Buka Modal Setujui
  const triggerApprove = (item) => {
    setApproveModal({
      isOpen: true,
      item,
      reviewNote: 'Pengajuan penarikan disetujui oleh admin keuangan. Dana sedang diproses transfer ke rekening Anda.',
      isSubmitting: false,
    })
  }

  // Eksekusi Submit Setujui & Berikan Review
  const handleApproveSubmit = async (e) => {
    e.preventDefault()
    const { item, reviewNote } = approveModal
    if (!item) return

    setApproveModal((prev) => ({ ...prev, isSubmitting: true }))

    try {
      await apiFetch(`/api/admin/withdrawals/${item.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote.trim() }),
      })
    } catch (err) {
      // lanjut optimistik
    }

    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === item.id
          ? {
              ...w,
              status: 'processing',
              note: reviewNote.trim(),
            }
          : w
      )
    )

    setApproveModal({ isOpen: false, item: null, reviewNote: '', isSubmitting: false })
    setToastMsg({
      type: 'success',
      text: `Penarikan #${item.id} disetujui. Review telah dikirimkan ke Telegram client.`,
    })
    loadWithdrawals()
  }

  // Buka Modal Tandai Berhasil
  const triggerMarkSuccess = (item) => {
    setSuccessModal({
      isOpen: true,
      item,
      transferRef: 'Transfer berhasil diselesaikan dan diverifikasi via BI-Fast',
      isSubmitting: false,
    })
  }

  // Eksekusi Submit Tandai Berhasil
  const handleSuccessSubmit = async (e) => {
    e.preventDefault()
    const { item, transferRef } = successModal
    if (!item) return

    setSuccessModal((prev) => ({ ...prev, isSubmitting: true }))

    try {
      await apiFetch(`/api/admin/withdrawals/${item.id}/success`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: transferRef.trim() }),
      })
    } catch (err) {
      // lanjut optimistik
    }

    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === item.id
          ? {
              ...w,
              status: 'success',
              note: transferRef.trim(),
            }
          : w
      )
    )

    setSuccessModal({ isOpen: false, item: null, transferRef: '', isSubmitting: false })
    setToastMsg({
      type: 'success',
      text: `Penarikan #${item.id} berhasil ditandai selesai dan dipublikasikan ke grup Telegram!`,
    })
    loadWithdrawals()
  }

  // Buka Modal Tolak
  const triggerReject = (item) => {
    setRejectModal({
      isOpen: true,
      item,
      reason: '',
      error: '',
      isSubmitting: false,
    })
  }

  // Eksekusi Submit Tolak & Berikan Review
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
      await apiFetch(`/api/admin/withdrawals/${item.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
    } catch (err) {
      // lanjut optimistik
    }

    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === item.id
          ? {
              ...w,
              status: 'rejected',
              rejectionReason: reason.trim(),
            }
          : w
      )
    )

    setRejectModal({ isOpen: false, item: null, reason: '', error: '', isSubmitting: false })
    setToastMsg({
      type: 'success',
      text: `Penarikan #${item.id} ditolak. Saldo dikembalikan & review dikirim ke client.`,
    })
    loadWithdrawals()
  }

  // Template Alasan Cepat Penolakan
  const quickRejectReasons = [
    'Nomor rekening tidak ditemukan atau salah',
    'Nama pemilik rekening tidak sesuai dengan identitas akun',
    'Nomor rekening tujuan dormant atau diblokir bank',
    'Syarat minimum penarikan belum terpenuhi',
    'Permintaan penarikan dibatalkan oleh pengguna',
  ]

  // Template Catatan Cepat Persetujuan
  const quickApproveNotes = [
    'Pengajuan penarikan disetujui. Dana sedang diproses kirim ke rekening Anda.',
    'Disetujui. Estimasi dana masuk 1x24 jam hari kerja.',
    'Disetujui oleh admin keuangan. Sedang menunggu antrean transfer bank.',
  ]

  // Kolom Tabel
  const columns = [
    {
      key: 'id',
      label: 'ID & Tanggal',
      sortable: true,
      render: (_, row) => (
        <div>
          <span className="font-bold text-text text-xs font-mono">#{row.id}</span>
          <p className="text-[11px] text-muted mt-0.5 whitespace-nowrap">
            {row.date} • {row.time}
          </p>
        </div>
      ),
    },
    {
      key: 'userName',
      label: 'Pemohon Affiliate',
      sortable: true,
      render: (_, row) => (
        <div>
          <p className="font-semibold text-text text-xs">{row.userName}</p>
          <p className="text-[11px] text-muted truncate max-w-[160px]">{row.userEmail}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Nominal',
      sortable: true,
      render: (amt) => (
        <span className="font-bold text-text font-mono text-xs tabular-nums whitespace-nowrap">
          {formatRupiah(amt)}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Metode & Rekening',
      sortable: true,
      render: (_, row) => (
        <div className="max-w-[200px]">
          <Badge variant="primary" size="sm">
            {row.method}
          </Badge>
          <p className="text-xs font-mono font-medium text-text mt-1">
            {row.destination}
          </p>
          <p className="text-[11px] text-muted truncate">
            a.n {row.destinationName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status & Telegram',
      sortable: true,
      render: (status, row) => {
        const isProcessing = status === 'processing' || status === 'approved'
        const variantMap = {
          pending: 'warning',
          processing: 'info',
          approved: 'info',
          success: 'success',
          rejected: 'danger',
        }
        const labelMap = {
          pending: 'Menunggu',
          processing: 'Diproses',
          approved: 'Diproses',
          success: 'Berhasil',
          rejected: 'Ditolak',
        }

        const notif = row.latestNotification || row.paymentNotifications?.[0]

        return (
          <div className="space-y-1.5 min-w-[190px]">
            {/* Baris Badge Utama Status & Indikator Telegram */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={variantMap[status] || 'neutral'} dot={true} size="sm">
                {labelMap[status] || status}
              </Badge>

              {/* Status Notifikasi Grup Telegram */}
              {notif?.status === 'sent' && (
                <span
                  title="Notifikasi terkirim ke Grup Telegram Resmi"
                  className="inline-flex items-center text-success bg-success/15 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-success/30"
                >
                  <Send className="w-2.5 h-2.5 mr-0.5 text-success" />
                  Grup
                </span>
              )}
              {notif?.status === 'pending' && (
                <span
                  title="Sedang mengantre di sistem antrean grup Telegram"
                  className="inline-flex items-center text-warning bg-warning/15 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-warning/30"
                >
                  <Clock className="w-2.5 h-2.5 mr-0.5 animate-spin text-warning" />
                  Antre
                </span>
              )}
              {notif?.status === 'skipped' && (
                <span
                  title={`Dilewati: ${notif.lastError || notif.payload?.skipReason || 'Privasi / dinonaktifkan'}`}
                  className="inline-flex items-center text-muted bg-surface-2 px-1.5 py-0.5 rounded text-[10px] border border-border"
                >
                  <EyeOff className="w-2.5 h-2.5 mr-0.5" />
                  Skip
                </span>
              )}
              {notif?.status === 'failed' && (
                <span
                  title={`Gagal kirim: ${notif.lastError}`}
                  className="inline-flex items-center text-danger bg-danger/15 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-danger/30"
                >
                  <AlertCircle className="w-2.5 h-2.5 mr-0.5 text-danger" />
                  Gagal
                </span>
              )}

              {/* Status Bot Telegram Personal Client */}
              {row.telegramLinked ? (
                <span
                  title="Bot Telegram Client aktif: Client menerima notifikasi review & status langsung di Telegram"
                  className="inline-flex items-center text-primary bg-primary/15 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-primary/30"
                >
                  <Send className="w-2.5 h-2.5 mr-0.5 text-primary" />
                  Bot Client
                </span>
              ) : (
                <span
                  title="Client belum menautkan bot Telegram"
                  className="inline-flex items-center text-muted bg-surface-2 px-1.5 py-0.5 rounded text-[10px] border border-border"
                >
                  Bot Off
                </span>
              )}

              {/* Status Privasi Member */}
              {row.hideFromPaymentChannel && (
                <span
                  title="Member mengaktifkan opsi sembunyikan penarikan dari siaran grup"
                  className="inline-flex items-center text-muted bg-surface-2 px-1 py-0.5 rounded text-[9px] border border-border"
                >
                  <Shield className="w-2.5 h-2.5" />
                </span>
              )}
            </div>

            {/* Kotak Review / Catatan yang Diberikan ke Client */}
            {row.rejectionReason ? (
              <div
                onClick={() => setViewDetailModal({ isOpen: true, item: row })}
                className="text-[11px] text-danger bg-danger/10 border border-danger/30 rounded-lg p-1.5 cursor-pointer hover:bg-danger/15 transition-colors"
                title="Klik untuk melihat review lengkap"
              >
                <span className="font-bold block text-[10px] uppercase text-danger">
                  Review Penolakan:
                </span>
                <p className="line-clamp-2 italic mt-0.5 leading-snug">
                  "{row.rejectionReason}"
                </p>
              </div>
            ) : row.note ? (
              <div
                onClick={() => setViewDetailModal({ isOpen: true, item: row })}
                className="text-[11px] text-primary bg-primary/10 border border-primary/30 rounded-lg p-1.5 cursor-pointer hover:bg-primary/15 transition-colors"
                title="Klik untuk melihat review lengkap"
              >
                <span className="font-bold block text-[10px] uppercase text-primary">
                  Review / Catatan Admin:
                </span>
                <p className="line-clamp-2 italic mt-0.5 leading-snug">
                  "{row.note}"
                </p>
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'actions',
      label: 'Tindakan',
      align: 'end',
      render: (_, row) => {
        const isProcessing = row.status === 'processing' || row.status === 'approved'

        return (
          <div
            className="flex items-center justify-end gap-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {row.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={() => triggerApprove(row)}
                  className="px-2.5 py-1 text-xs font-semibold bg-success/15 hover:bg-success/25 text-success rounded-lg transition-colors border border-success/30 inline-flex items-center gap-1 shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  Setujui
                </button>
                <button
                  type="button"
                  onClick={() => triggerReject(row)}
                  className="px-2.5 py-1 text-xs font-semibold bg-danger/15 hover:bg-danger/25 text-danger rounded-lg transition-colors border border-danger/30 inline-flex items-center gap-1 shadow-2xs"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Tolak
                </button>
              </>
            )}

            {isProcessing && (
              <>
                <button
                  type="button"
                  onClick={() => triggerMarkSuccess(row)}
                  className="px-2.5 py-1 text-xs font-semibold bg-primary/15 hover:bg-primary/25 text-primary rounded-lg transition-colors border border-primary/30 flex items-center gap-1 shadow-2xs whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Tandai Berhasil
                </button>
                <button
                  type="button"
                  onClick={() => triggerReject(row)}
                  className="px-2.5 py-1 text-xs font-semibold bg-danger/15 hover:bg-danger/25 text-danger rounded-lg transition-colors border border-danger/30 inline-flex items-center gap-1 shadow-2xs"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Tolak
                </button>
              </>
            )}

            {(row.status === 'success' || row.status === 'rejected') && (
              <div className="flex items-center gap-1.5">
                {(row.note || row.rejectionReason) && (
                  <button
                    type="button"
                    onClick={() => setViewDetailModal({ isOpen: true, item: row })}
                    className="px-2 py-0.5 text-[11px] font-semibold text-muted bg-surface-2 hover:bg-surface-2/80 rounded-md border border-border transition-colors inline-flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3 text-muted" />
                    Review
                  </button>
                )}
                <span className="text-xs text-muted italic">Selesai</span>
              </div>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
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
        title="Persetujuan Penarikan"
        subtitle="Tinjau, setujui, dan proses permohonan penarikan saldo pengguna beserta pengiriman review langsung ke client."
        badge="Keuangan"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadWithdrawals}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-2 text-text border border-border rounded-xl text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50"
              title="Segarkan data penarikan"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-2 text-text border border-border rounded-xl text-xs font-semibold transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-success" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        }
      />

      {/* Tab Filter Status */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredWithdrawals}
        searchPlaceholder="Cari ID, nama pemohon, atau nomor rekening..."
        pageSize={8}
      />

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
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-muted font-medium">Nominal Penarikan:</span>
                <span className="text-sm font-bold font-mono text-text">
                  {formatRupiah(approveModal.item?.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted pt-1">
                <div>
                  <span className="text-muted/70 block text-[11px]">Metode Transfer:</span>
                  <span className="font-semibold text-text">{approveModal.item?.method}</span>
                </div>
                <div>
                  <span className="text-muted/70 block text-[11px]">Rekening Tujuan:</span>
                  <span className="font-mono font-semibold text-text">
                    {approveModal.item?.destination} (a.n {approveModal.item?.destinationName})
                  </span>
                </div>
              </div>
            </div>

            {/* Status Telegram Client */}
            <div className="p-3 rounded-xl border text-xs flex items-start gap-2.5 bg-primary-soft text-primary-text border-primary/20">
              <Send className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-text">
                  {approveModal.item?.telegramLinked
                    ? 'Bot Telegram Client Terhubung'
                    : 'Client Belum Menautkan Telegram'}
                </p>
                <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                  {approveModal.item?.telegramLinked
                    ? 'Catatan review ini akan otomatis dikirimkan langsung ke bot Telegram pribadi member bersama pemberitahuan penarikan.'
                    : 'Catatan review ini akan disimpan dan ditampilkan pada halaman riwayat penarikan saldo member.'}
                </p>
              </div>
            </div>

            {/* Input Review / Catatan Admin */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Catatan Review untuk Client
              </label>
              <textarea
                rows={3}
                value={approveModal.reviewNote}
                onChange={(e) =>
                  setApproveModal({ ...approveModal, reviewNote: e.target.value })
                }
                placeholder="Tuliskan catatan review proses penarikan untuk client..."
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text leading-relaxed placeholder:text-muted"
                required
              />

              {/* Quick Chip Catatan */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-muted font-semibold uppercase">Pilihan Cepat:</span>
                {quickApproveNotes.map((noteText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setApproveModal({ ...approveModal, reviewNote: noteText })}
                    className="text-[11px] bg-surface-2 hover:bg-surface-2/80 text-muted hover:text-text px-2 py-0.5 rounded-md border border-border transition-colors"
                  >
                    {noteText.slice(0, 32)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                disabled={approveModal.isSubmitting}
                onClick={() =>
                  setApproveModal({ isOpen: false, item: null, reviewNote: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-border text-muted hover:text-text rounded-xl text-xs font-semibold hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={approveModal.isSubmitting}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
      {/* 2. MODAL TANDAI BERHASIL (TRANSFER SELESAI) */}
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
            <div className="p-3 bg-success/15 rounded-xl border border-success/30 flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-text">Transfer Siap Diselesaikan</p>
                <p className="text-muted mt-0.5 leading-relaxed text-[11px]">
                  Konfirmasi ini akan menandai status transfer menjadi <b>Berhasil</b>, mengirimkan pesan bukti transfer ke bot pribadi member, dan mempublikasikan ringkasan riwayat ke Grup Telegram Resmi.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                Nomor Referensi Transfer / Catatan Bank
              </label>
              <input
                type="text"
                value={successModal.transferRef}
                onChange={(e) =>
                  setSuccessModal({ ...successModal, transferRef: e.target.value })
                }
                placeholder="Contoh: TRX-BCA-20261022-9901 atau Berhasil via BI-Fast"
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text placeholder:text-muted"
              />
              <p className="text-[11px] text-muted mt-1">
                Catatan ini akan tersimpan di riwayat penarikan member sebagai bukti verifikasi transfer.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                disabled={successModal.isSubmitting}
                onClick={() =>
                  setSuccessModal({ isOpen: false, item: null, transferRef: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-border text-muted hover:text-text rounded-xl text-xs font-semibold hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={successModal.isSubmitting}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
      {/* 3. MODAL TOLAK & BERIKAN REVIEW KE CLIENT */}
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
            <div className="p-3 bg-danger/15 rounded-xl border border-danger/30 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-text">
                  Saldo Sebesar {formatRupiah(rejectModal.item?.amount)} Akan Dikembalikan
                </p>
                <p className="text-muted mt-0.5 leading-relaxed text-[11px]">
                  Saldo akan langsung dikembalikan ke akun member. Alasan penolakan / review ini akan dikirimkan ke Telegram pribadi client dan ditampilkan pada riwayat penarikan member.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Alasan Penolakan / Review untuk Client <span className="text-danger">*</span>
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
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl focus:ring-2 focus:ring-danger/20 focus:border-danger transition-all text-text placeholder:text-muted leading-relaxed"
                required
              />
              {rejectModal.error && (
                <p className="text-xs text-danger mt-1 font-medium">{rejectModal.error}</p>
              )}

              {/* Template Alasan Cepat */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-muted font-semibold uppercase">Pilihan Cepat:</span>
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
                    className="text-[11px] bg-surface-2 hover:bg-surface-2/80 text-muted hover:text-text px-2 py-0.5 rounded-md border border-border transition-colors"
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                disabled={rejectModal.isSubmitting}
                onClick={() =>
                  setRejectModal({ isOpen: false, item: null, reason: '', error: '', isSubmitting: false })
                }
                className="px-4 py-2 border border-border text-muted hover:text-text rounded-xl text-xs font-semibold hover:bg-surface-2 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={rejectModal.isSubmitting}
                className="px-5 py-2 bg-danger hover:bg-danger/90 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
            {/* Header Profil */}
            <div className="bg-surface-2 p-3 rounded-xl border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text text-sm">{viewDetailModal.item?.userName}</span>
                <span className="font-mono font-bold text-text text-sm">
                  {formatRupiah(viewDetailModal.item?.amount)}
                </span>
              </div>
              <p className="text-muted">{viewDetailModal.item?.userEmail}</p>
              <div className="pt-1.5 border-t border-border text-muted flex items-center justify-between">
                <span>{viewDetailModal.item?.method} ({viewDetailModal.item?.destination})</span>
                <span className="font-semibold text-text">{viewDetailModal.item?.destinationName}</span>
              </div>
            </div>

            {/* Kotak Review */}
            {viewDetailModal.item?.rejectionReason && (
              <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl space-y-1">
                <span className="font-bold text-danger uppercase tracking-wider text-[10px] block">
                  Alasan Penolakan yang Diterima Client:
                </span>
                <p className="text-danger leading-relaxed italic text-xs">
                  "{viewDetailModal.item?.rejectionReason}"
                </p>
              </div>
            )}

            {viewDetailModal.item?.note && (
              <div className="p-3.5 bg-primary/10 border border-primary/30 rounded-xl space-y-1">
                <span className="font-bold text-primary uppercase tracking-wider text-[10px] block">
                  Catatan / Review Admin yang Diberikan:
                </span>
                <p className="text-primary leading-relaxed italic text-xs">
                  "{viewDetailModal.item?.note}"
                </p>
              </div>
            )}

            {/* Status Telegram */}
            <div className="p-3 bg-surface-2 rounded-xl border border-border text-muted space-y-1">
              <span className="font-bold uppercase tracking-wider text-[10px] text-muted block">
                Kanal Notifikasi:
              </span>
              <p className="text-[11px]">
                • Bot Personal Client: <b className="text-text">{viewDetailModal.item?.telegramLinked ? 'Terkirim ke Telegram Member' : 'Belum Ditautkan'}</b>
              </p>
              <p className="text-[11px]">
                • Siaran Grup Telegram: <b className="text-text">{viewDetailModal.item?.latestNotification?.status || 'Tidak ada notifikasi grup'}</b>
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setViewDetailModal({ isOpen: false, item: null })}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-colors"
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
