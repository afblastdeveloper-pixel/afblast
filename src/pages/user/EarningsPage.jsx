import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, Clock, ArrowDownCircle, Copy, Check, AlertCircle,
  ChevronLeft, ChevronRight, X, Filter, Calendar, ExternalLink,
  ShieldCheck, RefreshCw, Send
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

function formatRupiah(value, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(dateStr, locale) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

const PAYMENT_METHODS = [
  { value: 'BCA', label: 'Bank BCA' },
  { value: 'Mandiri', label: 'Bank Mandiri' },
  { value: 'BRI', label: 'Bank BRI' },
  { value: 'BNI', label: 'Bank BNI' },
  { value: 'DANA', label: 'DANA E-Wallet' },
  { value: 'OVO', label: 'OVO E-Wallet' },
  { value: 'GOPAY', label: 'GoPay E-Wallet' },
]

export default function EarningsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // Referral copy state
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Withdraw Modal / Form State
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState('')
  const [rawAmountInput, setRawAmountInput] = useState('')
  const [method, setMethod] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [formError, setFormError] = useState(null)
  const [showConfirmSummary, setShowConfirmSummary] = useState(false)

  // Riwayat Penarikan Filter & Pagination State
  const [filterStatus, setFilterStatus] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const limit = 10

  // Detail Modal Row
  const [detailRow, setDetailRow] = useState(null)

  // 1. Fetch Earnings Summary & Referral
  const {
    data: earningsData,
    isLoading: isEarningsLoading,
    refetch: refetchEarnings,
  } = useQuery({
    queryKey: ['memberEarnings'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/earnings')
      if (!res.ok) throw new Error('Gagal memuat saldo penghasilan')
      return res.json()
    },
    staleTime: 15000,
  })

  // 2. Fetch Withdrawal Options & Rules (Presets & Settings)
  const {
    data: optionsData,
    isLoading: isOptionsLoading,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: ['memberWithdrawOptions'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/withdraw/options')
      if (!res.ok) throw new Error('Gagal memuat opsi penarikan')
      return res.json()
    },
    staleTime: 15000,
  })

  // 3. Fetch Riwayat Penarikan (Paginated & Filtered)
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['memberWithdrawHistory', page, limit, filterStatus, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const res = await apiFetch(`/api/member/withdrawals?${params.toString()}`)
      if (!res.ok) throw new Error('Gagal memuat riwayat penarikan')
      return res.json()
    },
    staleTime: 10000,
  })

  // 4. Submit Withdrawal Mutation
  const withdrawMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/member/withdrawals', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengajukan penarikan saldo')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberEarnings'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawOptions'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawHistory'] })
      queryClient.invalidateQueries({ queryKey: ['memberDashboard'] })
      setShowConfirmSummary(false)
      setShowWithdrawModal(false)
      resetWithdrawForm()
    },
  })

  // 5. Fetch Privacy Status (Sembunyikan aktivitas dari grup Telegram)
  const { data: privacyData, isLoading: isPrivacyLoading } = useQuery({
    queryKey: ['memberPrivacy'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/privacy')
      if (!res.ok) return { hideFromPaymentChannel: false }
      return res.json()
    },
    staleTime: 30000,
  })

  // 6. Update Privacy Mutation
  const updatePrivacyMutation = useMutation({
    mutationFn: async (hideFromPaymentChannel) => {
      const res = await apiFetch('/api/member/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideFromPaymentChannel }),
      })
      if (!res.ok) throw new Error('Gagal memperbarui status privasi')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['memberPrivacy'], data)
    },
  })

  const isHidden = Boolean(privacyData?.hideFromPaymentChannel)

  const resetWithdrawForm = () => {
    setSelectedAmount('')
    setRawAmountInput('')
    setMethod('')
    setAccountNumber('')
    setAccountName('')
    setFormError(null)
  }

  const { user } = useAuth()

  // Earnings Data
  const summary = {
    balance: earningsData?.availableBalance ?? 0,
    pendingWithdrawal: earningsData?.pendingWithdrawal ?? 0,
    totalWithdrawn: earningsData?.totalWithdrawn ?? 0,
    referralCode: 'AFBLAST' + (user?.id ? String(user.id).padStart(4, '0') : 'MEM1'),
    referralUrl: window.location.origin + '/register?ref=AFBLAST' + (user?.id ? String(user.id).padStart(4, '0') : 'MEM1'),
  }

  const presets = optionsData?.presets || []
  const rules = {
    min: optionsData?.min ?? 20000,
    max: optionsData?.max ?? 5000000,
    allowCustom: optionsData?.allowCustom ?? true,
  }
  const currentBalance = summary.balance

  const withdrawals = historyData?.withdrawals || []
  const pagination = {
    total: historyData?.total ?? 0,
    page: historyData?.page ?? 1,
    limit: historyData?.limit ?? 10,
    totalPages: historyData?.totalPages ?? 1,
  }

  // Handlers
  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      }
    })
  }

  // Chip click handler
  const handleChipClick = (amount) => {
    setSelectedAmount(amount)
    setRawAmountInput(new Intl.NumberFormat(i18n.language).format(amount))
    setFormError(null)
  }

  // Manual input handler (formats Rupiah string while keeping numeric value)
  const handleManualAmountChange = (e) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '')
    if (!rawValue) {
      setRawAmountInput('')
      setSelectedAmount('')
      return
    }
    const num = parseInt(rawValue, 10)
    setSelectedAmount(num)
    setRawAmountInput(new Intl.NumberFormat(i18n.language).format(num))
    setFormError(null)
  }

  // Validation before confirmation
  const handleProceedConfirm = (e) => {
    e.preventDefault()
    setFormError(null)

    const amountNum = Number(selectedAmount)
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      setFormError('Silakan pilih atau masukkan nominal penarikan.')
      return
    }

    if (amountNum < rules.min) {
      setFormError(`Nominal penarikan minimal ${formatRupiah(rules.min, i18n.language)}`)
      return
    }

    if (amountNum > rules.max) {
      setFormError(`Nominal penarikan maksimal ${formatRupiah(rules.max, i18n.language)}`)
      return
    }

    if (amountNum > currentBalance) {
      setFormError(`Nominal melebihi saldo tersedia Anda (${formatRupiah(currentBalance, i18n.language)})`)
      return
    }

    if (amountNum % 1000 !== 0) {
      setFormError('Nominal penarikan harus kelipatan Rp 1.000')
      return
    }

    if (!method) {
      setFormError('Silakan pilih metode penarikan (Bank atau E-Wallet).')
      return
    }

    if (!accountNumber.trim()) {
      setFormError('Nomor rekening atau nomor e-wallet tujuan wajib diisi.')
      return
    }

    if (!accountName.trim()) {
      setFormError('Nama pemilik rekening atau e-wallet wajib diisi.')
      return
    }

    setShowConfirmSummary(true)
  }

  const handleFinalSubmit = () => {
    withdrawMutation.mutate({
      amount: Number(selectedAmount),
      method,
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim(),
    })
  }

  const statusVariantMap = {
    pending: 'warning',
    processing: 'info',
    success: 'success',
    rejected: 'danger',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Halaman & Tombol Tarik Saldo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {t('earnings.pageTitle', 'Penghasilan')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelola saldo komisi Anda, ajukan penarikan dana, dan pantau riwayat pencairan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetWithdrawForm()
            setShowWithdrawModal(true)
          }}
          disabled={currentBalance <= 0}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover active:bg-blue-800 disabled:bg-gray-300 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors disabled:cursor-not-allowed"
        >
          <Wallet className="w-4 h-4" />
          <span>Tarik Saldo</span>
        </button>
      </div>

      {/* 3 Kartu Saldo (Saldo Tersedia, Sedang Diproses, Total Ditarik) */}
      <section aria-label="Ringkasan Saldo">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Saldo Tersedia
              </span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums truncate block">
                {formatRupiah(summary.balance, i18n.language)}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Sedang Diproses
              </span>
              <span className="text-2xl font-bold text-amber-700 tabular-nums truncate block">
                {formatRupiah(summary.pendingWithdrawal, i18n.language)}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <ArrowDownCircle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Total Ditarik
              </span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums truncate block">
                {formatRupiah(summary.totalWithdrawn, i18n.language)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Kartu Referral */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 sm:p-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">Kode & Tautan Referral Anda</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Kode Referral */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Kode Referral</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm font-bold text-primary tracking-wider">
                {summary.referralCode}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(summary.referralCode, 'code')}
                className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          {/* Link Referral */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Link Pendaftaran</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-blue-600 font-mono truncate">
                {summary.referralUrl}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(summary.referralUrl, 'link')}
                className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Kartu Privasi Notifikasi Penarikan */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Privasi Publikasi Riwayat Penarikan
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                Sembunyikan aktivitas pencairan saldo Anda agar tidak dipublikasikan ke siaran grup Telegram resmi (@AFBlastPaymentBot).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <span className="text-xs font-semibold text-gray-600">
              {isPrivacyLoading ? 'Memuat...' : isHidden ? 'Disembunyikan' : 'Ditampilkan'}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                disabled={isPrivacyLoading || updatePrivacyMutation.isPending}
                checked={isHidden}
                onChange={(e) => updatePrivacyMutation.mutate(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* RIWAYAT PENARIKAN (MENGGANTIKAN RIWAYAT KOMISI LAMA) */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {/* Table Header & Filters */}
        <div className="p-5 sm:px-6 border-b border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Riwayat Penarikan Dana</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Daftar lengkap seluruh permohonan pencairan dana saldo Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchHistory()}
              className="self-start sm:self-center p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
              title="Segarkan Riwayat"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Bar: Status & Tanggal */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-50 text-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-600">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value)
                  setPage(1)
                }}
                className="border border-gray-200 rounded-xl px-2.5 py-1.5 bg-white text-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Semua Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Diproses</option>
                <option value="success">Berhasil</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-600">Dari:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(1)
                }}
                className="border border-gray-200 rounded-xl px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-600">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(1)
                }}
                className="border border-gray-200 rounded-xl px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {isHistoryLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : isHistoryError ? (
          <div className="p-8 text-center text-rose-600 text-sm">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p>Gagal memuat riwayat penarikan.</p>
            <button
              onClick={() => refetchHistory()}
              className="mt-2 text-xs font-semibold underline"
            >
              Coba Lagi
            </button>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-700">Belum ada riwayat penarikan</p>
            <p className="text-xs text-gray-400 mt-1">
              Setiap kali Anda mengajukan penarikan saldo, status dan detailnya akan tercatat di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-start">
              <thead className="bg-gray-50/70 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5 text-start">ID</th>
                  <th className="py-3 px-5 text-start">Tanggal</th>
                  <th className="py-3 px-5 text-end">Jumlah</th>
                  <th className="py-3 px-5 text-start">Metode</th>
                  <th className="py-3 px-5 text-start">Tujuan</th>
                  <th className="py-3 px-5 text-center">Status</th>
                  <th className="py-3 px-5 text-start">Catatan Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setDetailRow(item)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5 font-mono font-bold text-gray-900">
                      #{item.id}
                    </td>
                    <td className="py-3.5 px-5 text-gray-600 whitespace-nowrap">
                      {formatDate(item.createdAt, i18n.language)}
                    </td>
                    <td className="py-3.5 px-5 text-end font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(item.amount, i18n.language)}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-gray-800 uppercase">
                      {item.method}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-gray-600 whitespace-nowrap">
                      {item.accountNumber} <span className="text-gray-400">({item.accountName})</span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <Badge variant={statusVariantMap[item.status] || 'default'} size="sm">
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-5 text-gray-500 max-w-[200px] truncate">
                      {item.adminNote || item.rejectionReason || item.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginasi Riwayat */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* MODAL PENGAJUAN TARIK SALDO (CHIPS & CUSTOM NOMINAL) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showWithdrawModal && !showConfirmSummary}
        onClose={() => setShowWithdrawModal(false)}
        title="Ajukan Penarikan Saldo"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleProceedConfirm} className="p-6 space-y-4">
          {/* Info Saldo Tersedia */}
          <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900">Saldo Anda Saat Ini:</span>
            <span className="text-base font-extrabold text-primary tabular-nums">
              {formatRupiah(currentBalance, i18n.language)}
            </span>
          </div>

          {/* Pilihan Nominal (Chips) */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Pilihan Nominal
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => {
                const isExceed = preset.amount > currentBalance
                const isSelected = selectedAmount === preset.amount

                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isExceed}
                    onClick={() => handleChipClick(preset.amount)}
                    className={[
                      'py-2.5 px-2 rounded-xl text-xs font-bold transition-all border text-center truncate',
                      isExceed
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                        : isSelected
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-white hover:bg-blue-50 text-gray-700 border-gray-200',
                    ].join(' ')}
                  >
                    {formatRupiah(preset.amount, i18n.language)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Input Nominal Manual jika allowCustom == true */}
          {rules.allowCustom && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Atau Masukkan Nominal Manual (Rp):
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-gray-400 text-sm font-semibold">Rp</span>
                <input
                  type="text"
                  value={rawAmountInput}
                  onChange={handleManualAmountChange}
                  placeholder="Contoh: 150.000"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Minimal {formatRupiah(rules.min, i18n.language)}, Maksimal {formatRupiah(rules.max, i18n.language)}, kelipatan Rp 1.000.
              </p>
            </div>
          )}

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Metode Penarikan
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Pilih Bank / E-Wallet</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Nomor Rekening */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Nomor Rekening / E-Wallet
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Contoh: 1234567890 / 081234567890"
              className="w-full py-2 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Nama Pemilik Rekening */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Nama Pemilik Rekening
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Sesuai nama di buku tabungan / akun e-wallet"
              className="w-full py-2 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Pesan Error Validasi */}
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowWithdrawModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors"
            >
              Lanjutkan
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL KONFIRMASI RINGKASAN PENARIKAN */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showConfirmSummary}
        onClose={() => setShowConfirmSummary(false)}
        title="Konfirmasi Pengajuan Penarikan"
        maxWidth="max-w-md"
      >
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-200/60">
              <span className="text-gray-500">Nominal Penarikan:</span>
              <span className="font-bold text-gray-900 text-sm tabular-nums">
                {formatRupiah(selectedAmount, i18n.language)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200/60">
              <span className="text-gray-500">Metode:</span>
              <span className="font-semibold text-gray-800 uppercase">{method}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200/60">
              <span className="text-gray-500">Nomor Tujuan:</span>
              <span className="font-mono font-semibold text-gray-800">{accountNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200/60">
              <span className="text-gray-500">Nama Penerima:</span>
              <span className="font-semibold text-gray-800">{accountName}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Biaya Admin:</span>
              <span className="font-semibold text-primary">Rp 0 (Gratis)</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            Pastikan data rekening tujuan Anda sudah tepat. Dana akan ditransfer setelah disetujui staf finance.
          </p>

          {withdrawMutation.isError && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{withdrawMutation.error?.message || 'Gagal mengajukan penarikan'}</span>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowConfirmSummary(false)}
              disabled={withdrawMutation.isPending}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold disabled:opacity-50"
            >
              Ubah Data
            </button>
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={withdrawMutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {withdrawMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim Pengajuan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL DETAIL PENARIKAN (KLIK BARIS TABEL) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title="Rincian Penarikan Saldo"
        maxWidth="max-w-md"
      >
        {detailRow && (
          <div className="p-6 space-y-4 text-xs">
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-gray-200/60">
                <span className="text-gray-500">ID Penarikan:</span>
                <span className="font-mono font-bold text-gray-900">#{detailRow.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/60">
                <span className="text-gray-500">Tanggal Pengajuan:</span>
                <span className="text-gray-800">{formatDate(detailRow.createdAt, i18n.language)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/60">
                <span className="text-gray-500">Jumlah Dana:</span>
                <span className="font-extrabold text-gray-900 text-sm tabular-nums">
                  {formatRupiah(detailRow.amount, i18n.language)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/60">
                <span className="text-gray-500">Metode & Akun:</span>
                <span className="font-semibold text-gray-800">
                  {detailRow.method} - {detailRow.accountNumber}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/60">
                <span className="text-gray-500">Nama Penerima:</span>
                <span className="font-semibold text-gray-800">{detailRow.accountName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/60 items-center">
                <span className="text-gray-500">Status Saat Ini:</span>
                <Badge variant={statusVariantMap[detailRow.status] || 'default'} size="sm">
                  {detailRow.status}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Catatan Admin:</span>
                <span className="font-medium text-gray-700 text-end">
                  {detailRow.adminNote || detailRow.rejectionReason || detailRow.note || 'Tidak ada catatan khusus.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDetailRow(null)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors text-xs"
            >
              Tutup
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
