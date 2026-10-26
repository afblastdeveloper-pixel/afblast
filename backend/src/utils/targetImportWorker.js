const fs = require('fs')
const readline = require('readline')
const prisma = require('../config/db')
const { publishAdminEvent } = require('./sseManager')
const targetStatsService = require('../services/targetStats.service')

/**
 * Normalisasi nomor WhatsApp:
 * - Buang spasi, +, dash, dll.
 * - 08xxx -> 628xxx
 * - 8xxx -> 628xxx
 * - Validasi panjang 8 - 16 digit angka
 */
function normalizePhone(raw) {
  if (!raw) return null
  let phone = String(raw).replace(/\D/g, '')

  if (phone.startsWith('08')) {
    phone = '62' + phone.substring(1)
  } else if (phone.startsWith('8') && phone.length >= 9 && phone.length <= 13) {
    phone = '62' + phone
  }

  if (phone.length < 8 || phone.length > 16) {
    return null
  }
  return phone
}

/**
 * Deteksi kode negara dari nomor telepon yang sudah dinormalisasi (1-4 digit angka)
 */
function detectCountryCode(phone) {
  if (phone.startsWith('62')) return '62'
  if (phone.startsWith('60')) return '60'
  if (phone.startsWith('65')) return '65'
  if (phone.startsWith('1')) return '1'
  if (phone.startsWith('91')) return '91'
  if (phone.startsWith('44')) return '44'
  if (phone.startsWith('61')) return '61'
  return phone.substring(0, Math.min(4, Math.max(1, 2)))
}

/**
 * Dapatkan atau buat kategori otomatis berdasarkan countryCode (1-4 digit angka)
 */
async function getOrCreateCategoryForCountry(countryCode) {
  const cleanCode = String(countryCode).replace(/\D/g, '').slice(0, 4)
  let cat = await prisma.contactCategory.findFirst({
    where: { countryCode: cleanCode },
  })
  if (!cat) {
    const name = cleanCode === '62' ? 'Indonesia (+62)' : `Negara +${cleanCode}`
    cat = await prisma.$transaction(async (tx) => {
      const created = await tx.contactCategory.create({
        data: {
          name,
          countryCode: cleanCode,
          ratePerMessage: 15,
          totalContacts: 0,
          isActive: true,
        },
      })
      await tx.categoryStats.create({
        data: {
          categoryId: created.id,
          total: 0,
          none: 0,
          queued: 0,
          active: 0,
          success: 0,
          failed: 0,
          optOut: 0,
        },
      })
      return created
    })
  }
  return cat.id
}

/**
 * Proses import file CSV / TXT dengan streaming baris ke baris, chunk 5000 createMany
 * Increment CategoryStats atomik DI DALAM transaksi yang sama per chunk.
 *
 * @param {Object} options
 * @param {string} options.filePath
 * @param {number|null} options.defaultCategoryId
 * @param {string} options.consentSource
 * @param {number} options.adminId
 * @returns {Promise<Object>} report
 */
async function processCsvImport({ filePath, defaultCategoryId, consentSource, adminId }) {
  let totalLines = 0
  let insertedCount = 0
  let duplicateOrInvalidCount = 0
  let invalidCount = 0
  let optOutSkippedCount = 0
  let mismatchCount = 0
  const rejectedData = []

  const CHUNK_SIZE = 5000
  let currentChunk = []
  const seenInFile = new Set()

  // Ambil pengaturan SiteSetting import.rejectCountryMismatch
  const rejectMismatchSetting = await prisma.siteSetting.findUnique({
    where: { key: 'import.rejectCountryMismatch' },
  })
  const rejectCountryMismatch = rejectMismatchSetting
    ? rejectMismatchSetting.value === 'true' || rejectMismatchSetting.value === true
    : false

  // Ambil data kategori default dan kode negaranya jika dipilih
  let defaultCountryCode = null
  if (defaultCategoryId) {
    const cat = await prisma.contactCategory.findUnique({
      where: { id: defaultCategoryId },
    })
    if (cat?.countryCode) {
      defaultCountryCode = cat.countryCode.replace(/\D/g, '')
    }
  }

  // Ambil daftar optOut dari database terlebih dahulu untuk proteksi
  const optOutRows = await prisma.target.findMany({
    where: { optOut: true },
    select: { phone: true },
  })
  const optOutSet = new Set(optOutRows.map((r) => r.phone))

  // Cache kategori id per countryCode
  const countryCatCache = new Map()
  if (defaultCategoryId) {
    countryCatCache.set('default', defaultCategoryId)
  }

  let lineIndex = 0
  let headerChecked = false
  let phoneColIdx = 0
  let nameColIdx = -1

  /**
   * Helper untuk commit chunk createMany dan increment atomik CategoryStats di transaksi yang sama
   */
  async function commitCurrentChunk(chunk) {
    if (!chunk || chunk.length === 0) return 0

    // Hitung distribusi target per categoryId dalam chunk
    const catDistribution = new Map()
    for (const item of chunk) {
      catDistribution.set(item.categoryId, (catDistribution.get(item.categoryId) || 0) + 1)
    }

    // Eksekusi atomik dalam transaksi Prisma
    const actualInserted = await prisma.$transaction(async (tx) => {
      const result = await tx.target.createMany({
        data: chunk,
        skipDuplicates: true,
      })

      if (result.count > 0) {
        if (catDistribution.size === 1) {
          const [catId] = catDistribution.keys()
          await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
            total: result.count,
            none: result.count,
          })
        } else {
          // Multi kategori (auto-country mapping)
          const ratio = result.count / chunk.length
          for (const [catId, count] of catDistribution.entries()) {
            const catCount = Math.round(count * ratio)
            if (catCount > 0) {
              await targetStatsService.updateCategoryStatsAtomic(tx, catId, {
                total: catCount,
                none: catCount,
              })
            }
          }
        }
      }

      return result.count
    })

    return actualInserted
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    lineIndex++
    // Bersihkan BOM UTF-8 dan spasi kosong di ujung
    let line = rawLine.replace(/^\uFEFF/, '').trim()
    if (!line) continue

    // Deteksi separator: koma, titik koma, tab, atau pipe
    let delimiter = null
    if (line.includes('\t')) delimiter = '\t'
    else if (line.includes(';')) delimiter = ';'
    else if (line.includes(',')) delimiter = ','
    else if (line.includes('|')) delimiter = '|'

    let cols = []
    if (delimiter) {
      cols = line.split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim())
    } else {
      cols = [line.replace(/^["']|["']$/g, '').trim()]
    }

    // Deteksi header pada baris pertama
    if (!headerChecked) {
      headerChecked = true
      const lowerCols = cols.map((c) => (c || '').toLowerCase())
      const pIdx = lowerCols.findIndex(
        (c) =>
          c.includes('phone') ||
          c.includes('nomor') ||
          c.includes('wa') ||
          c.includes('hp') ||
          c.includes('kontak') ||
          c.includes('target') ||
          c.includes('telp')
      )

      if (pIdx !== -1) {
        phoneColIdx = pIdx
        nameColIdx = lowerCols.findIndex((c) => c.includes('name') || c.includes('nama'))
        continue
      } else {
        const testPhone0 = normalizePhone(cols[0])
        const testPhone1 = cols.length > 1 ? normalizePhone(cols[1]) : null

        if (testPhone1 && !testPhone0) {
          phoneColIdx = 1
          nameColIdx = 0
        } else {
          phoneColIdx = 0
          if (cols.length > 1) nameColIdx = 1
        }
      }
    }

    totalLines++
    const rawPhone = cols[phoneColIdx] || ''
    const rawName = nameColIdx !== -1 && cols[nameColIdx] ? cols[nameColIdx] : null

    const phone = normalizePhone(rawPhone)

    if (!phone) {
      invalidCount++
      duplicateOrInvalidCount++
      if (rejectedData.length < 1000) {
        rejectedData.push({
          line: lineIndex,
          phone: rawPhone || '(Kosong)',
          reason: 'Format nomor tidak valid (minimal 8 digit angka)',
        })
      }
      continue
    }

    if (seenInFile.has(phone)) {
      duplicateOrInvalidCount++
      if (rejectedData.length < 1000) {
        rejectedData.push({
          line: lineIndex,
          phone: rawPhone,
          reason: 'Duplikat dalam berkas yang sama',
        })
      }
      continue
    }

    // Tolak jika nomor telah opt-out
    if (optOutSet.has(phone)) {
      optOutSkippedCount++
      duplicateOrInvalidCount++
      if (rejectedData.length < 1000) {
        rejectedData.push({
          line: lineIndex,
          phone: rawPhone,
          reason: 'Nomor telah meminta berhenti (Opt-out)',
        })
      }
      continue
    }

    // Validasi kecocokan kode negara kategori jika defaultCategoryId dipilih
    if (defaultCountryCode) {
      if (!phone.startsWith(defaultCountryCode)) {
        mismatchCount++
        if (rejectCountryMismatch) {
          duplicateOrInvalidCount++
          if (rejectedData.length < 1000) {
            rejectedData.push({
              line: lineIndex,
              phone: rawPhone,
              reason: `Kode negara tidak cocok dengan kategori (+${defaultCountryCode})`,
            })
          }
          continue
        }
      }
    }

    seenInFile.add(phone)

    // Tentukan categoryId
    let catId = defaultCategoryId
    if (!catId) {
      const cCode = detectCountryCode(phone)
      if (countryCatCache.has(cCode)) {
        catId = countryCatCache.get(cCode)
      } else {
        catId = await getOrCreateCategoryForCountry(cCode)
        countryCatCache.set(cCode, catId)
      }
    }

    currentChunk.push({
      categoryId: catId,
      phone,
      name: rawName,
      queueStatus: 'none',
      consentSource: consentSource || 'File Import',
      optOut: false,
    })

    // Eksekusi chunk jika sudah mencapai 5000
    if (currentChunk.length >= CHUNK_SIZE) {
      const count = await commitCurrentChunk(currentChunk)
      insertedCount += count
      const dupCount = currentChunk.length - count
      duplicateOrInvalidCount += dupCount

      publishAdminEvent('import.progress', {
        totalLines,
        insertedCount,
        duplicateOrInvalidCount,
        invalidCount,
        optOutSkippedCount,
        mismatchCount,
        percentage: Math.min(99, Math.round((totalLines / 200000) * 100)),
        status: 'processing',
      })

      currentChunk = []
    }
  }

  // Sisa baris terakhir
  if (currentChunk.length > 0) {
    const count = await commitCurrentChunk(currentChunk)
    insertedCount += count
    const dupCount = currentChunk.length - count
    duplicateOrInvalidCount += dupCount
  }

  // Invalidate Redis cache resmi setelah seluruh impor selesai
  await targetStatsService.invalidateStatsCache()

  // Kirim event selesai SSE
  publishAdminEvent('import.progress', {
    totalLines,
    insertedCount,
    duplicateOrInvalidCount,
    invalidCount,
    optOutSkippedCount,
    mismatchCount,
    percentage: 100,
    status: 'completed',
  })

  // Hapus file temp setelah selesai diproses
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (err) {
    console.warn('Gagal menghapus file temp import:', err.message)
  }

  const warnings = []
  if (mismatchCount > 0) {
    warnings.push(
      `${mismatchCount} nomor tidak berawalan kode negara kategori (+${defaultCountryCode || ''})`
    )
  }

  return {
    totalLines,
    insertedCount,
    duplicateOrInvalidCount,
    invalidCount,
    optOutSkippedCount,
    mismatchCount,
    warnings,
    rejectedData,
  }
}

module.exports = {
  normalizePhone,
  detectCountryCode,
  processCsvImport,
}

