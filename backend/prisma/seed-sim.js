/**
 * Skrip Seeding Data Uji Simulator (hanya untuk NODE_ENV !== 'production')
 * Menghasilkan:
 * 1. Kategori "UJI-SIMULATOR" (kode negara 62, tarif Rp 1.000)
 * 2. 500 kontak FIKTIF berawalan 62800000 (tanpa nomor nyata, consentSource: "DATA UJI SIMULATOR")
 * 3. 1 kampanye aktif untuk kategori tersebut (teks + gambar contoh + tombol https://example.com)
 * Seluruh data ditandai dengan isSimulated: true
 */

const prisma = require('../src/config/db')

async function seedSim() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL] Skrip seed:sim DITOLAK: Tidak boleh dijalankan pada lingkungan production!')
    process.exit(1)
  }

  console.log('--- Memulai Seeding Data Uji WA Gateway Simulator ---')

  // 1. Cari user pembuat (superadmin atau user pertama)
  let creator = await prisma.user.findFirst({
    where: { role: 'superadmin' },
  })
  if (!creator) {
    creator = await prisma.user.findFirst()
  }
  if (!creator) {
    throw new Error('Tidak ada akun user di database untuk mengaitkan kampanye.')
  }

  // 2. Kategori "UJI-SIMULATOR"
  const categoryName = 'UJI-SIMULATOR'
  let category = await prisma.contactCategory.findUnique({
    where: { name: categoryName },
  })

  if (!category) {
    category = await prisma.contactCategory.create({
      data: {
        name: categoryName,
        countryCode: '62',
        ratePerMessage: 1000,
        totalContacts: 500,
        isActive: true,
        isSimulated: true,
      },
    })
    console.log(`[Seed] Kategori '${categoryName}' dibuat (ID: ${category.id})`)
  } else {
    category = await prisma.contactCategory.update({
      where: { id: category.id },
      data: {
        countryCode: '62',
        ratePerMessage: 1000,
        totalContacts: 500,
        isActive: true,
        isSimulated: true,
      },
    })
    console.log(`[Seed] Kategori '${categoryName}' diperbarui (ID: ${category.id})`)
  }

  // 3. CategoryStats
  await prisma.categoryStats.upsert({
    where: { categoryId: category.id },
    create: {
      categoryId: category.id,
      total: 500,
      none: 500,
      queued: 0,
      active: 0,
      success: 0,
      failed: 0,
      draft: 0,
      optOut: 0,
    },
    update: {
      total: 500,
      none: 500,
      queued: 0,
      active: 0,
      success: 0,
      failed: 0,
      draft: 0,
      optOut: 0,
    },
  })

  // 4. 500 Kontak FIKTIF berawalan 62800000
  console.log('[Seed] Menyiapkan 500 kontak fiktif berawalan 62800000...')
  const targets = []
  for (let i = 1; i <= 500; i++) {
    const pad = String(i).padStart(4, '0')
    const phone = `62800000${pad}`
    targets.push({
      categoryId: category.id,
      phone,
      name: `Uji Simulasi #${i}`,
      consentSource: 'DATA UJI SIMULATOR',
      queueStatus: 'none',
      optOut: false,
      isSimulated: true,
    })
  }

  // Hapus data fiktif lama pada kategori ini agar bersih
  await prisma.target.deleteMany({
    where: { categoryId: category.id, isSimulated: true },
  })

  // Batch insert 100 per batch
  const batchSize = 100
  for (let b = 0; b < targets.length; b += batchSize) {
    const slice = targets.slice(b, b + batchSize)
    await prisma.target.createMany({
      data: slice,
      skipDuplicates: true,
    })
  }
  console.log(`[Seed] Berhasil memasukkan 500 kontak fiktif (628000000001 - 628000000500)`)

  // 5. Buat 1 Kampanye Aktif untuk Kategori "UJI-SIMULATOR"
  const existingCamp = await prisma.blastCampaign.findFirst({
    where: { categoryId: category.id, isSimulated: true },
  })

  if (existingCamp) {
    await prisma.blastCampaign.update({
      where: { id: existingCamp.id },
      data: {
        title: 'Kampanye Uji Simulator WA',
        imageUrl: 'https://images.unsplash.com/photo-1579208575657-c595a053b9b7?w=600&auto=format&fit=crop&q=80',
        caption: 'Halo {{name}}, ini adalah pesan uji dari WA Gateway Simulator AF Blast. Kami menguji keandalan sistem pengiriman pesan.',
        buttonLabel: 'Kunjungi Website Uji',
        buttonUrl: 'https://example.com',
        status: 'active',
        totalTarget: 500,
        isSimulated: true,
      },
    })
    console.log(`[Seed] Kampanye aktif simulasi diperbarui (ID: ${existingCamp.id})`)
  } else {
    const camp = await prisma.blastCampaign.create({
      data: {
        title: 'Kampanye Uji Simulator WA',
        imageUrl: 'https://images.unsplash.com/photo-1579208575657-c595a053b9b7?w=600&auto=format&fit=crop&q=80',
        caption: 'Halo {{name}}, ini adalah pesan uji dari WA Gateway Simulator AF Blast. Kami menguji keandalan sistem pengiriman pesan.',
        buttonLabel: 'Kunjungi Website Uji',
        buttonUrl: 'https://example.com',
        categoryId: category.id,
        status: 'active',
        totalTarget: 500,
        isSimulated: true,
        createdById: creator.id,
      },
    })
    console.log(`[Seed] Kampanye aktif simulasi berhasil dibuat (ID: ${camp.id})`)
  }

  try {
    const targetStatsService = require('../src/services/targetStats.service')
    await targetStatsService.invalidateStatsCache()
  } catch (_) {}

  await prisma.$disconnect()
  console.log('--- Seeding Data Uji WA Simulator Selesai & Berhasil! ---')
  process.exit(0)
}

seedSim().catch((err) => {
  console.error('[Seed Error]:', err)
  process.exit(1)
})
