const prisma = require('../src/config/db')
const { redis } = require('../src/config/redis')
const targetStatsService = require('../src/services/targetStats.service')
const { processCsvImport } = require('../src/utils/targetImportWorker')

async function runTestSuite() {
  console.log('====================================================')
  console.log('MEMULAI UJI E2E: TARGET STATS SEBAGAI SINGLE SOURCE OF TRUTH')
  console.log('====================================================')

  let passedTests = 0
  let failedTests = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`)
      passedTests++
    } else {
      console.error(`[FAIL] ${message}`)
      failedTests++
    }
  }

  try {
    // 1. UJI BACKFILL DAN KONSISTENSI ANGKA AWAL
    console.log('\n--- 1. UJI KONSISTENSI ANGKA (Daftar Target = Kategori = Dasbor = Member) ---')
    const backfillReport = await targetStatsService.backfillCategoryStats()
    console.log(`Backfill selesai. Total direkonsiliasi: ${backfillReport.totalReconciled}`)

    const globalStats = await targetStatsService.getGlobalStats()
    const categoryStats = await targetStatsService.getCategoryStats()
    const memberSummary = await targetStatsService.getMemberPoolSummary()

    // Hitung total dari kategori aktif
    const activeCats = await prisma.contactCategory.findMany({
      where: { isActive: true },
      include: { stats: true },
    })

    let sumCatTotal = 0
    let sumCatRemaining = 0
    for (const c of activeCats) {
      sumCatTotal += c.stats?.total || 0
      sumCatRemaining += (c.stats?.none || 0) + (c.stats?.queued || 0) + (c.stats?.active || 0)
    }

    assert(globalStats.total === sumCatTotal, `Global total (${globalStats.total}) = Jumlah total per kategori (${sumCatTotal})`)
    assert(globalStats.remaining === sumCatRemaining, `Global remaining (${globalStats.remaining}) = Jumlah remaining per kategori (${sumCatRemaining})`)
    assert(memberSummary.total === globalStats.total, `Member summary total (${memberSummary.total}) = Global total (${globalStats.total})`)
    assert(memberSummary.remaining === globalStats.remaining, `Member summary remaining (${memberSummary.remaining}) = Global remaining (${globalStats.remaining})`)

    // Pastikan ada setidaknya 1 kategori aktif untuk tes
    const testCat = activeCats[0]
    if (!testCat) {
      throw new Error('Tidak ada kategori kontak aktif untuk pengujian')
    }
    const catId = testCat.id
    console.log(`Menggunakan kategori uji: ID ${catId} (${testCat.name})`)

    // 2. UJI TAMBAH 1 KONTAK (+1)
    console.log('\n--- 2. UJI TAMBAH 1 KONTAK (Semua angka naik 1 <= 5 detik) ---')
    const initialGlobal = await targetStatsService.getGlobalStats()
    const testPhone = `6289999${Date.now().toString().slice(-6)}`

    // Buat target dalam transaksi atomik
    const createdTarget = await prisma.$transaction(async (tx) => {
      const t = await tx.target.create({
        data: {
          categoryId: catId,
          phone: testPhone,
          name: 'Tes Kontak E2E',
          queueStatus: 'none',
          consentSource: 'Uji E2E',
          optOut: false,
        },
      })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: 1,
        none: 1,
      })
      return t
    })

    // Invalidate cache
    await targetStatsService.invalidateStatsCache()

    const afterAddGlobal = await targetStatsService.getGlobalStats()
    const afterAddMember = await targetStatsService.getMemberPoolSummary()

    assert(afterAddGlobal.total === initialGlobal.total + 1, `Global total naik 1: ${initialGlobal.total} -> ${afterAddGlobal.total}`)
    assert(afterAddGlobal.remaining === initialGlobal.remaining + 1, `Global remaining naik 1: ${initialGlobal.remaining} -> ${afterAddGlobal.remaining}`)
    assert(afterAddMember.total === afterAddGlobal.total, `Member total sinkron: ${afterAddMember.total}`)
    assert(afterAddMember.remaining === afterAddGlobal.remaining, `Member remaining sinkron: ${afterAddMember.remaining}`)

    // 3. UJI HAPUS KONTAK (-1)
    console.log('\n--- 3. UJI HAPUS KONTAK (Turun 1) ---')
    await prisma.$transaction(async (tx) => {
      await tx.target.delete({ where: { id: createdTarget.id } })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: -1,
        none: -1,
      })
    })
    await targetStatsService.invalidateStatsCache()

    const afterDelGlobal = await targetStatsService.getGlobalStats()
    const afterDelMember = await targetStatsService.getMemberPoolSummary()

    assert(afterDelGlobal.total === initialGlobal.total, `Global total kembali: ${afterDelGlobal.total}`)
    assert(afterDelGlobal.remaining === initialGlobal.remaining, `Global remaining kembali: ${afterDelGlobal.remaining}`)
    assert(afterDelMember.total === initialGlobal.total, `Member total kembali: ${afterDelMember.total}`)

    // 4. UJI IMPOR CHUNK (5.000 BARIS)
    console.log('\n--- 4. UJI IMPOR 5.000 BARIS (Naik sesuai laporan) ---')
    const CHUNK_SIZE = 5000
    const mockChunk = []
    const basePhoneNum = Date.now().toString().slice(-6)
    for (let i = 0; i < CHUNK_SIZE; i++) {
      mockChunk.push({
        categoryId: catId,
        phone: `62877${basePhoneNum}${String(i).padStart(4, '0')}`,
        name: `Impor Bulk ${i}`,
        queueStatus: 'none',
        consentSource: 'Uji Chunk 5000',
        optOut: false,
      })
    }

    const beforeImportGlobal = await targetStatsService.getGlobalStats()

    // Eksekusi transaksi atomik chunk 5000
    const insertedCount = await prisma.$transaction(async (tx) => {
      const res = await tx.target.createMany({
        data: mockChunk,
        skipDuplicates: true,
      })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: res.count,
        none: res.count,
      })
      return res.count
    })

    await targetStatsService.invalidateStatsCache()

    const afterImportGlobal = await targetStatsService.getGlobalStats()
    assert(insertedCount === CHUNK_SIZE, `Chunk 5.000 berhasil di-insert: ${insertedCount}`)
    assert(
      afterImportGlobal.total === beforeImportGlobal.total + CHUNK_SIZE,
      `Global total naik tepat 5.000: ${beforeImportGlobal.total} -> ${afterImportGlobal.total}`
    )
    assert(
      afterImportGlobal.remaining === beforeImportGlobal.remaining + CHUNK_SIZE,
      `Global remaining naik tepat 5.000: ${beforeImportGlobal.remaining} -> ${afterImportGlobal.remaining}`
    )

    // Bersihkan data tes 5.000 baris
    console.log('Membersihkan data 5.000 baris tes...')
    await prisma.$transaction(async (tx) => {
      const del = await tx.target.deleteMany({
        where: {
          categoryId: catId,
          consentSource: 'Uji Chunk 5000',
        },
      })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: -del.count,
        none: -del.count,
      })
    })
    await targetStatsService.invalidateStatsCache()

    // 5. UJI KATEGORI DINONAKTIFKAN (isActive = false)
    console.log('\n--- 5. UJI KATEGORI DINONAKTIFKAN (Hilang dari remaining member) ---')
    // Buat kategori khusus untuk diuji nonaktif
    const disabledCat = await prisma.$transaction(async (tx) => {
      const c = await tx.contactCategory.create({
        data: {
          name: `Kategori Tes Nonaktif ${Date.now()}`,
          countryCode: '62',
          ratePerMessage: 20,
          isActive: true,
          totalContacts: 10,
        },
      })
      await tx.categoryStats.create({
        data: {
          categoryId: c.id,
          total: 10,
          none: 10,
          queued: 0,
          active: 0,
          success: 0,
          failed: 0,
          optOut: 0,
        },
      })
      return c
    })
    await targetStatsService.invalidateStatsCache()

    const activeMember = await targetStatsService.getMemberPoolSummary()
    const foundInActive = activeMember.categories.some((c) => c.id === disabledCat.id)
    assert(foundInActive, 'Kategori aktif muncul di daftar kategori member')

    // Nonaktifkan kategori
    await prisma.contactCategory.update({
      where: { id: disabledCat.id },
      data: { isActive: false },
    })
    await targetStatsService.invalidateStatsCache()

    const inactiveMember = await targetStatsService.getMemberPoolSummary()
    const foundInInactive = inactiveMember.categories.some((c) => c.id === disabledCat.id)
    assert(!foundInInactive, 'Kategori dinonaktifkan hilang dari daftar kategori member')

    // Hapus kategori tes
    await prisma.contactCategory.delete({ where: { id: disabledCat.id } })
    await targetStatsService.invalidateStatsCache()

    // 6. UJI KONTAK OPTOUT DAN SUKSES TIDAK DIHITUNG TERSISA
    console.log('\n--- 6. UJI OPTOUT DAN SUKSES TIDAK DIHITUNG TERSISA ---')
    const optOutPhone = `6289999${Date.now().toString().slice(-5)}1`
    const successPhone = `6289999${Date.now().toString().slice(-5)}2`

    const [tOptOut, tSuccess] = await prisma.$transaction(async (tx) => {
      const o = await tx.target.create({
        data: {
          categoryId: catId,
          phone: optOutPhone,
          name: 'Kontak OptOut',
          queueStatus: 'none',
          consentSource: 'Uji OptOut',
          optOut: true,
        },
      })
      const s = await tx.target.create({
        data: {
          categoryId: catId,
          phone: successPhone,
          name: 'Kontak Sukses',
          queueStatus: 'success',
          consentSource: 'Uji Sukses',
          optOut: false,
        },
      })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: 2,
        optOut: 1,
        success: 1,
      })
      return [o, s]
    })
    await targetStatsService.invalidateStatsCache()

    const statsAfterOpt = await targetStatsService.getGlobalStats()
    const memberAfterOpt = await targetStatsService.getMemberPoolSummary()

    // Remaining = none + queued + active (optOut dan success TIDAK boleh menambah remaining)
    assert(
      statsAfterOpt.remaining === beforeImportGlobal.remaining,
      `Remaining tidak bertambah untuk kontak optOut dan sukses (Tersisa tetap: ${statsAfterOpt.remaining})`
    )
    assert(
      statsAfterOpt.total === beforeImportGlobal.total + 2,
      `Total bertambah 2: ${statsAfterOpt.total}`
    )

    // Bersihkan kontak tes
    await prisma.$transaction(async (tx) => {
      await tx.target.deleteMany({ where: { id: { in: [tOptOut.id, tSuccess.id] } } })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
        total: -2,
        optOut: -1,
        success: -1,
      })
    })
    await targetStatsService.invalidateStatsCache()

    // 7. UJI RESPONS MEMBER DAN SSE TIDAK MEMUAT NOMOR
    console.log('\n--- 7. UJI KEAMANAN PRIVASI: RESPONS MEMBER BEBAS NOMOR TELEPON ---')
    const memberPayload = await targetStatsService.getMemberPoolSummary()
    const payloadString = JSON.stringify(memberPayload)

    assert(!payloadString.includes('phone'), 'Respons member tidak memuat properti phone')
    assert(!payloadString.includes('nomor'), 'Respons member tidak memuat kata nomor')
    assert(!payloadString.includes('targets'), 'Respons member tidak memuat array targets')
    assert(typeof memberPayload.remaining === 'number', 'memberPayload.remaining berupa Number')
    assert(typeof memberPayload.total === 'number', 'memberPayload.total berupa Number')
    assert(Array.isArray(memberPayload.categories), 'memberPayload.categories berupa Array kategori')

    // 8. UJI DUA PERANGKAT BERSAMAAN TIDAK MENGIRIM KE KONTAK YANG SAMA
    console.log('\n--- 8. UJI KONKURENSI ATOMIK (Dua perangkat bersamaan) ---')
    // Buat 1 target untuk dites klaim bersamaan
    const concPhone = `628888${Date.now().toString().slice(-6)}`
    const concTarget = await prisma.target.create({
      data: {
        categoryId: catId,
        phone: concPhone,
        name: 'Tes Konkurensi',
        queueStatus: 'none',
        consentSource: 'Tes Konkurensi',
        optOut: false,
      },
    })
    await prisma.$transaction(async (tx) => {
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, { total: 1, none: 1 })
    })

    // Simulasikan 2 klaim bersamaan secara paralel
    const claimWorker1 = async () => {
      return await prisma.$transaction(async (tx) => {
        const res = await tx.target.updateMany({
          where: { id: concTarget.id, queueStatus: 'none', optOut: false },
          data: { queueStatus: 'queued' },
        })
        if (res.count > 0) {
          await targetStatsService.updateCategoryStatsAtomic(tx, catId, { none: -1, queued: 1 })
        }
        return res.count
      })
    }

    const claimWorker2 = async () => {
      return await prisma.$transaction(async (tx) => {
        const res = await tx.target.updateMany({
          where: { id: concTarget.id, queueStatus: 'none', optOut: false },
          data: { queueStatus: 'queued' },
        })
        if (res.count > 0) {
          await targetStatsService.updateCategoryStatsAtomic(tx, catId, { none: -1, queued: 1 })
        }
        return res.count
      })
    }

    const [res1, res2] = await Promise.all([claimWorker1(), claimWorker2()])
    const totalClaimed = res1 + res2
    assert(totalClaimed === 1, `Tepat SATU worker berhasil mengklaim target (Worker 1: ${res1}, Worker 2: ${res2})`)

    // Bersihkan target tes
    await prisma.$transaction(async (tx) => {
      await tx.target.delete({ where: { id: concTarget.id } })
      await targetStatsService.updateCategoryStatsAtomic(tx, catId, { total: -1, queued: -1 })
    })
    await targetStatsService.invalidateStatsCache()

    // 9. UJI REKONSILIASI MEMPERBAIKI SELISIH BUATAN
    console.log('\n--- 9. UJI RECONCILE MEMPERBAIKI SELISIH BUATAN ---')
    // Buat selisih sengaja di tabel category_stats
    console.log('Menyuntikkan selisih buatan: total = 999999 di category_stats...')
    await prisma.categoryStats.update({
      where: { categoryId: catId },
      data: { total: 999999 },
    })

    const reconReport = await targetStatsService.recalculateStats()
    assert(reconReport.differencesCount > 0, `Rekonsiliasi mendeteksi selisih: ${reconReport.differencesCount} perbedaan ditemukan`)

    const catAfterRecon = await prisma.categoryStats.findUnique({
      where: { categoryId: catId },
    })
    assert(catAfterRecon.total !== 999999, `CategoryStats berhasil diperbaiki kembali dari 999999 -> ${catAfterRecon.total}`)

    const realTargetCount = await prisma.target.count({
      where: { categoryId: catId },
    })
    assert(catAfterRecon.total === realTargetCount, `Total di CategoryStats (${catAfterRecon.total}) = Jumlah riil Target (${realTargetCount})`)

    console.log('\n====================================================')
    console.log(`HASIL AKHIR: ${passedTests} LULUS, ${failedTests} GAGAL`)
    console.log('====================================================')

    if (failedTests > 0) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  } catch (err) {
    console.error('Error saat menjalankan test suite:', err)
    process.exit(1)
  }
}

runTestSuite()
