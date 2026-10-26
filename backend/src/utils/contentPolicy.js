const prisma = require('../config/db')

const DEFAULT_BLOCKED_TERMS = [
  'judi',
  'slot',
  'togel',
  'casino',
  'gacor',
  'taruhan',
  'pinjol ilegal',
  'phishing',
]

const DEFAULT_BLOCKED_DOMAINS = [
  '.bet',
  '.casino',
  '.poker',
  '.slot',
  '.judionline',
  't.me/judislot',
]

/**
 * Dapatkan daftar kata terlarang gabungan (default + database)
 * Kebijakan: Superadmin boleh menambah daftar, tetapi tidak boleh menonaktifkan kata dasar.
 */
async function getBlockedTerms() {
  const terms = new Set(DEFAULT_BLOCKED_TERMS.map((t) => t.toLowerCase()))

  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: 'contentPolicy.blockedTerms' },
    })
    if (setting && setting.value) {
      let custom = []
      try {
        custom = JSON.parse(setting.value)
      } catch (_) {
        custom = setting.value.split(',').map((s) => s.trim())
      }
      if (Array.isArray(custom)) {
        for (const item of custom) {
          if (typeof item === 'string' && item.trim()) {
            terms.add(item.trim().toLowerCase())
          }
        }
      }
    }
  } catch (error) {
    console.warn('Gagal membaca custom blocked terms:', error.message)
  }

  return Array.from(terms)
}

/**
 * Periksa teks dari pelanggaran konten terlarang
 * @param {string|string[]} contents
 * @returns {Promise<{ allowed: boolean, reason?: string, matchedTerm?: string }>}
 */
async function checkContentPolicy(contents) {
  const textList = Array.isArray(contents) ? contents : [contents]
  const combinedText = textList.filter(Boolean).join(' ').toLowerCase()

  if (!combinedText.trim()) {
    return { allowed: true }
  }

  // 1. Cek kata terlarang
  const blockedTerms = await getBlockedTerms()
  for (const term of blockedTerms) {
    // Regex boundary check untuk mendeteksi kata terlarang
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(combinedText) || combinedText.includes(term)) {
      return {
        allowed: false,
        reason: `Konten ditolak karena mengandung istilah terlarang kebijakan: "${term}"`,
        matchedTerm: term,
      }
    }
  }

  // 2. Cek domain terlarang
  for (const domain of DEFAULT_BLOCKED_DOMAINS) {
    if (combinedText.includes(domain)) {
      return {
        allowed: false,
        reason: `Konten ditolak karena mengandung tautan atau domain terlarang: "${domain}"`,
        matchedTerm: domain,
      }
    }
  }

  return { allowed: true }
}

module.exports = {
  DEFAULT_BLOCKED_TERMS,
  DEFAULT_BLOCKED_DOMAINS,
  getBlockedTerms,
  checkContentPolicy,
}
