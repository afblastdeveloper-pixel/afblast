/**
 * announcements.js – Data dummy Pengumuman Sistem untuk Admin CRUD
 */

export const ADMIN_ANNOUNCEMENTS = [
  {
    id: 'ANN-001',
    title: 'Pemeliharaan Server Berkala',
    content: 'Pemeliharaan server terjadwal pada 25 Oktober 2026 pukul 01:00 - 04:00 WIB. Pengiriman pesan tetap berjalan otomatis.',
    type: 'warning', // 'info' | 'warning' | 'success'
    startDate: '2026-10-18',
    endDate: '2026-10-25',
    isActive: true,
    targetRole: 'all', // 'all' | 'user' | 'admin'
    createdBy: 'Mahesa Danu',
  },
  {
    id: 'ANN-002',
    title: 'Fitur Baru: Pengiriman Media Gambar Cepat',
    content: 'Kini Anda dapat mengirim gambar beresolusi tinggi tanpa kompresi berlebih langsung melalui Campaign!',
    type: 'success',
    startDate: '2026-10-10',
    endDate: '2026-10-31',
    isActive: true,
    targetRole: 'user',
    createdBy: 'Mahesa Danu',
  },
  {
    id: 'ANN-003',
    title: 'Peningkatan Keamanan Dua Langkah (2FA)',
    content: 'Untuk keamanan akun, pastikan Anda memperbarui nomor pemulihan dan mengaktifkan verifikasi dua langkah.',
    type: 'info',
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    isActive: true,
    targetRole: 'all',
    createdBy: 'Mahesa Danu',
  },
  {
    id: 'ANN-004',
    title: 'Promo Diskon Paket Pro 20%',
    content: 'Gunakan kode promo PROMOHEMAT saat perpanjangan paket Pro untuk mendapatkan potongan 20%.',
    type: 'info',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    isActive: false,
    targetRole: 'user',
    createdBy: 'Mahesa Danu',
  },
]
