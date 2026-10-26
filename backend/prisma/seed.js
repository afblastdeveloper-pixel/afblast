const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
require('dotenv').config()

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 1. Akun Superadmin sesuai spesifikasi:
  // budi@superadmin, password awal dari .env SEED_SUPERADMIN_PASSWORD, wajib diganti saat login pertama
  const seedSuperadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'SuperPassword123!'
  const hashedSuperadminPassword = await bcrypt.hash(seedSuperadminPassword, 10)

  const budiSuperadmin = await prisma.user.upsert({
    where: { username: 'budi@superadmin' },
    update: {
      mustChangePassword: true,
      staffStatus: 'approved',
      role: 'superadmin',
    },
    create: {
      name: 'Budi Superadmin',
      email: 'budi@superadmin.afblast.id',
      username: 'budi@superadmin',
      password: hashedSuperadminPassword,
      role: 'superadmin',
      staffStatus: 'approved',
      mustChangePassword: true,
      failedLogin: 0,
    },
  })
  console.log(`Akun Superadmin seeded: ${budiSuperadmin.username} (wajib ganti password saat login pertama)`)

  // 2. Pertahankan & perbarui akun admin lama (admin@afblast.id) agar konsisten dengan skema baru
  const adminHashed = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@afblast.id' },
    update: {
      role: 'superadmin',
      staffStatus: 'approved',
      username: 'admin@superadmin',
    },
    create: {
      name: 'Admin AF Blast',
      email: 'admin@afblast.id',
      username: 'admin@superadmin',
      password: adminHashed,
      role: 'superadmin',
      staffStatus: 'approved',
      failedLogin: 0,
    },
  })
  console.log(`Akun admin lama terverifikasi: ${admin.email} (username: ${admin.username})`)

  // 3. Feature Flags Awal
  const featureFlags = [
    { key: 'whatsapp_gateway', enabled: true },
    { key: 'two_factor_auth', enabled: false },
    { key: 'dark_mode', enabled: true },
    { key: 'export_excel', enabled: true },
  ]

  for (const flag of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: flag,
    })
  }
  console.log('Feature flags seeded.')

  // 4. Site Settings (Tema & Maintenance)
  await prisma.siteSetting.upsert({
    where: { key: 'theme' },
    update: {},
    create: {
      key: 'theme',
      value: JSON.stringify({ mode: 'light', primaryColor: '#2563EB' }),
    },
  })

  await prisma.siteSetting.upsert({
    where: { key: 'maintenance' },
    update: {},
    create: {
      key: 'maintenance',
      value: JSON.stringify({
        enabled: false,
        message: 'Sistem sedang dalam pemeliharaan rutin. Silakan kembali beberapa saat lagi.',
        updatedAt: new Date().toISOString(),
      }),
    },
  })
  console.log('Site settings (tema & maintenance) seeded.')

  // 5. Menu Configs untuk tiap role
  const menuConfigs = [
    {
      role: 'user',
      items: [
        { title: 'Dashboard', path: '/app', icon: 'Home' },
        { title: 'Daftar Kontak', path: '/app/contacts', icon: 'Users' },
        { title: 'Template Pesan', path: '/app/templates', icon: 'FileText' },
        { title: 'Broadcast Kampanye', path: '/app/campaigns', icon: 'Send' },
        { title: 'Perangkat WhatsApp', path: '/app/device', icon: 'Smartphone' },
        { title: 'Komisi Saya', path: '/app/earnings', icon: 'DollarSign' },
        { title: 'Penarikan Saldo', path: '/app/withdrawals', icon: 'CreditCard' },
      ],
    },
    {
      role: 'adminfinance',
      items: [
        { title: 'Dashboard Keuangan', path: '/admin/dashboard/finance', icon: 'PieChart' },
        { title: 'Persetujuan Penarikan', path: '/admin/withdrawals', icon: 'CreditCard' },
        { title: 'Laporan Komisi', path: '/admin/commissions', icon: 'DollarSign' },
        { title: 'Daftar Paket & Rencana', path: '/admin/packages', icon: 'Package' },
      ],
    },
    {
      role: 'developer',
      items: [
        { title: 'Feature Flags', path: '/dev/flags', icon: 'Flag' },
        { title: 'Menu Navigation Config', path: '/dev/menu', icon: 'Menu' },
        { title: 'Pengaturan Tema', path: '/dev/theme', icon: 'Palette' },
        { title: 'Mode Maintenance', path: '/dev/maintenance', icon: 'Tool' },
        { title: 'Versi Aplikasi', path: '/dev/version', icon: 'GitBranch' },
        { title: 'Semua Fitur Admin (Kecuali Approve Staf)', path: '/admin', icon: 'Shield' },
      ],
    },
    {
      role: 'superadmin',
      items: [
        { title: 'Dashboard Admin', path: '/admin', icon: 'LayoutDashboard' },
        { title: 'Persetujuan & Manajemen Staf', path: '/admin/staff', icon: 'UserCheck' },
        { title: 'Manajemen Pengguna', path: '/admin/users', icon: 'Users' },
        { title: 'Penarikan Saldo', path: '/admin/withdrawals', icon: 'CreditCard' },
        { title: 'Komisi Referral', path: '/admin/commissions', icon: 'DollarSign' },
        { title: 'Paket & Langganan', path: '/admin/packages', icon: 'Package' },
        { title: 'Pengumuman Sistem', path: '/admin/announcements', icon: 'Bell' },
        { title: 'Audit Log Aktivitas', path: '/admin/logs', icon: 'List' },
        { title: 'Pengaturan Website', path: '/admin/settings', icon: 'Settings' },
      ],
    },
  ]

  for (const menu of menuConfigs) {
    await prisma.menuConfig.upsert({
      where: { role: menu.role },
      update: { items: menu.items },
      create: {
        role: menu.role,
        items: menu.items,
      },
    })
  }
  console.log('Menu configs seeded.')

  // 6. App Version Awal
  const existingVersion = await prisma.appVersion.findFirst({
    where: { version: '1.0.0' },
  })
  if (!existingVersion) {
    await prisma.appVersion.create({
      data: {
        version: '1.0.0',
        note: 'AF Blast initial release with 3-role staff management system',
      },
    })
  }
  console.log('App version seeded.')

  // 7. Template Contoh (Data Lama Tetap Terjaga)
  const templates = [
    {
      name: 'Promo Akhir Tahun',
      body: 'Halo {{name}}, nikmati diskon spesial akhir tahun hingga 50% di AF Blast! Kunjungi website kami sekarang.',
    },
    {
      name: 'Pengingat Pembayaran',
      body: 'Halo {{name}}, ini adalah pengingat bahwa tagihan layanan Anda akan jatuh tempo segera. Terima kasih.',
    },
    {
      name: 'Selamat Datang',
      body: 'Halo {{name}}, selamat bergabung dengan komunitas AF Blast! Kami siap membantu bisnis Anda berkembang.',
    },
  ]

  for (const tpl of templates) {
    const existing = await prisma.template.findFirst({
      where: { userId: admin.id, name: tpl.name },
    })
    if (!existing) {
      await prisma.template.create({
        data: {
          userId: admin.id,
          name: tpl.name,
          body: tpl.body,
        },
      })
    }
  }

  // 8. Kontak Contoh (Data Lama Tetap Terjaga)
  const contacts = [
    {
      name: 'Budi Santoso',
      phone: '6281234567890',
      tags: 'VIP,Pelanggan',
      optOut: false,
    },
    {
      name: 'Siti Rahma',
      phone: '6285898765432',
      tags: 'Prospek',
      optOut: false,
    },
    {
      name: 'Ahmad Dani',
      phone: '6282111112222',
      tags: 'Pelanggan',
      optOut: false,
    },
    {
      name: 'Dewi Lestari',
      phone: '6287712345678',
      tags: 'VIP',
      optOut: false,
    },
  ]

  for (const c of contacts) {
    await prisma.contact.upsert({
      where: {
        userId_phone: {
          userId: admin.id,
          phone: c.phone,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        name: c.name,
        phone: c.phone,
        tags: c.tags,
        optOut: c.optOut,
      },
    })
  }

  console.log('Database seeding completed successfully.')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
