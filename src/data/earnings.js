/**
 * earnings.js – Data dummy untuk halaman Penghasilan (/app/earnings).
 * Ganti dengan pemanggilan API saat backend siap.
 */

// Ringkasan saldo
export const EARNINGS_SUMMARY = {
  availableBalance: 1_250_000,
  totalCommission: 4_870_000,
  processing: 320_000,
  totalWithdrawn: 3_300_000,
}

// Kode & link referral
export const REFERRAL = {
  code: 'AFBLAST-USR2024',
  link: 'https://afblast.id/ref/AFBLAST-USR2024',
}

// Nilai grafik pendapatan 30 hari terakhir (nilai harian dalam Rupiah)
export const EARNINGS_CHART_DATA = (() => {
  const base = [
    45000, 0, 90000, 120000, 45000, 0, 75000,
    150000, 60000, 0, 90000, 30000, 120000, 75000,
    0, 45000, 180000, 90000, 60000, 0, 135000,
    75000, 45000, 0, 90000, 120000, 60000, 150000,
    45000, 90000,
  ]
  const today = new Date()
  return base.map((value, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (29 - i))
    return { date: d.toISOString().slice(0, 10), value }
  })
})()

// Riwayat komisi
export const COMMISSION_HISTORY = [
  {
    id: 'C001',
    date: '2026-10-15',
    fromUser: 'Budi Santoso',
    package: 'Pro',
    commission: 75000,
    status: 'paid',
  },
  {
    id: 'C002',
    date: '2026-10-12',
    fromUser: 'Rina Wati',
    package: 'Starter',
    commission: 30000,
    status: 'paid',
  },
  {
    id: 'C003',
    date: '2026-10-10',
    fromUser: 'Ahmad Fauzi',
    package: 'Business',
    commission: 150000,
    status: 'pending',
  },
  {
    id: 'C004',
    date: '2026-10-08',
    fromUser: 'Siti Aminah',
    package: 'Pro',
    commission: 75000,
    status: 'paid',
  },
  {
    id: 'C005',
    date: '2026-10-05',
    fromUser: 'Dedi Kurniawan',
    package: 'Business',
    commission: 150000,
    status: 'paid',
  },
  {
    id: 'C006',
    date: '2026-10-02',
    fromUser: 'Yanti Rahayu',
    package: 'Starter',
    commission: 30000,
    status: 'pending',
  },
  {
    id: 'C007',
    date: '2026-09-28',
    fromUser: 'Hendra Wijaya',
    package: 'Pro',
    commission: 75000,
    status: 'paid',
  },
  {
    id: 'C008',
    date: '2026-09-25',
    fromUser: 'Dewi Lestari',
    package: 'Business',
    commission: 150000,
    status: 'paid',
  },
]

// Batas minimum penarikan (Rupiah)
export const MIN_WITHDRAWAL = 100_000

// Metode pembayaran yang tersedia
export const PAYMENT_METHODS = [
  { value: 'bank_bca', label: 'BCA' },
  { value: 'bank_bri', label: 'BRI' },
  { value: 'bank_bni', label: 'BNI' },
  { value: 'bank_mandiri', label: 'Mandiri' },
  { value: 'gopay', label: 'GoPay' },
  { value: 'ovo', label: 'OVO' },
  { value: 'dana', label: 'DANA' },
]
