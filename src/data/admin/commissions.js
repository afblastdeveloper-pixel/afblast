/**
 * commissions.js – Data dummy Komisi & Referral untuk Admin
 */

export const ADMIN_COMMISSION_CONFIG = {
  defaultCommissionRate: 20, // persen
  minWithdrawalAmount: 100000, // Rp
  autoApproveBelow: 250000, // Rp
  cookieDurationDays: 60,
  requireActiveSubscription: true,
}

export const ADMIN_REFERRAL_EARNINGS = [
  {
    id: 'REF-001',
    affiliateName: 'Budi Pratama',
    affiliateEmail: 'budi@tokoonline.id',
    referralCode: 'AFBLAST-BUDI99',
    buyerName: 'Rina Wati',
    packageName: 'Starter',
    packagePrice: 149000,
    ratePercent: 20,
    commissionAmount: 29800,
    date: '2026-10-18',
    status: 'paid',
  },
  {
    id: 'REF-002',
    affiliateName: 'Andi Wijaya',
    affiliateEmail: 'andi@agencydigital.id',
    referralCode: 'AFBLAST-ANDI24',
    buyerName: 'PT Sukses Mandiri',
    packageName: 'Business',
    packagePrice: 799000,
    ratePercent: 25,
    commissionAmount: 199750,
    date: '2026-10-17',
    status: 'paid',
  },
  {
    id: 'REF-003',
    affiliateName: 'Siti Rahma',
    affiliateEmail: 'siti@fashionstore.com',
    referralCode: 'AFBLAST-SITI01',
    buyerName: 'Klinik Sehat',
    packageName: 'Pro',
    packagePrice: 349000,
    ratePercent: 20,
    commissionAmount: 69800,
    date: '2026-10-16',
    status: 'pending',
  },
  {
    id: 'REF-004',
    affiliateName: 'Ahmad Fauzi',
    affiliateEmail: 'ahmad@fauzi-logistics.co.id',
    referralCode: 'AFBLAST-FAUZI',
    buyerName: 'Toko Buku Cerdas',
    packageName: 'Pro',
    packagePrice: 349000,
    ratePercent: 20,
    commissionAmount: 69800,
    date: '2026-10-15',
    status: 'paid',
  },
  {
    id: 'REF-005',
    affiliateName: 'Hendra Saputra',
    affiliateEmail: 'hendra@kulinerbunda.com',
    referralCode: 'AFBLAST-HENDRAS',
    buyerName: 'CV Maju Jaya',
    packageName: 'Enterprise',
    packagePrice: 1999000,
    ratePercent: 30,
    commissionAmount: 599700,
    date: '2026-10-14',
    status: 'paid',
  },
]
