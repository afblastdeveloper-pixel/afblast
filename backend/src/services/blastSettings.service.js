/**
 * Service Konfigurasi Mesin Blast (backend/src/services/blastSettings.service.js)
 * Mengelola pembacaan, validasi, dan pembaharuan SiteSetting untuk mesin blast.
 */

const prisma = require('../config/db')

const DEFAULT_SETTINGS = {
  'blast.allowedSpeeds': '[1,2,3,4,5,10,15,20,30,45,60,90]',
  'blast.defaultSpeed': '30',
  'blast.safeModeEnabled': 'true',
  'blast.brutalModeEnabled': 'false',
  'blast.brutalMinIntervalMs': '700',
  'blast.dailyLimitDefault': '200',
  'blast.failStopThreshold': '5',
  'blast.safeJitterPercent': '30',
  'blast.safePauseEvery': '25',
  'blast.safePauseSeconds': '60',
  'earning.creditOn': 'accepted',
}

async function getBlastSettings() {
  const keys = Object.keys(DEFAULT_SETTINGS)
  const existing = await prisma.siteSetting.findMany({
    where: { key: { in: keys } },
  })

  const map = { ...DEFAULT_SETTINGS }
  for (const s of existing) {
    map[s.key] = s.value
  }

  let allowedSpeeds
  try {
    allowedSpeeds = JSON.parse(map['blast.allowedSpeeds'])
    if (!Array.isArray(allowedSpeeds)) throw new Error()
  } catch (_) {
    allowedSpeeds = [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60, 90]
  }

  return {
    allowedSpeeds,
    defaultSpeed: parseInt(map['blast.defaultSpeed'], 10) || 30,
    safeModeEnabled: map['blast.safeModeEnabled'] === 'true',
    brutalModeEnabled: map['blast.brutalModeEnabled'] === 'true',
    brutalMinIntervalMs: parseInt(map['blast.brutalMinIntervalMs'], 10) || 700,
    dailyLimitDefault: parseInt(map['blast.dailyLimitDefault'], 10) || 200,
    failStopThreshold: parseInt(map['blast.failStopThreshold'], 10) || 5,
    safeJitterPercent: parseInt(map['blast.safeJitterPercent'], 10) || 30,
    safePauseEvery: parseInt(map['blast.safePauseEvery'], 10) || 25,
    safePauseSeconds: parseInt(map['blast.safePauseSeconds'], 10) || 60,
    creditOn: map['earning.creditOn'] || 'accepted',
    rawMap: map,
  }
}

async function initDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    })
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  getBlastSettings,
  initDefaultSettings,
}
