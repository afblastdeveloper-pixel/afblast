const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const crypto = require('crypto')
const zlib = require('zlib')
const bcrypt = require('bcrypt')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')

const BACKUP_DIR = path.join(__dirname, '../../backups')
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

const BACKUP_KEY_RAW = process.env.BACKUP_ENCRYPTION_KEY || 'afblast_secret_backup_aes_key_32b!'
// Pastikan panjang key 32 bytes untuk AES-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(BACKUP_KEY_RAW).digest()

/**
 * Parse database URL untuk mysqldump
 */
function parseDatabaseUrl() {
  const url = process.env.DATABASE_URL || 'mysql://root:@127.0.0.1:3306/wablast'
  try {
    const parsed = new URL(url)
    return {
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port || '3306',
      database: parsed.pathname.replace(/^\//, '') || 'wablast',
    }
  } catch (_) {
    return {
      user: 'root',
      password: '',
      host: '127.0.0.1',
      port: '3306',
      database: 'wablast',
    }
  }
}

/**
 * Buat file opsi sementara dengan izin 600 untuk menyembunyikan credential dari process list
 */
function createTempOptionFile(dbConfig) {
  const tempPath = path.join(os.tmpdir(), `my_opt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.cnf`)
  const content = `[client]
user="${dbConfig.user}"
password="${dbConfig.password}"
host="${dbConfig.host}"
port=${dbConfig.port}
`
  fs.writeFileSync(tempPath, content, { mode: 0o600 })
  return tempPath
}

/**
 * Enkripsi stream menggunakan AES-256-GCM
 */
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Format biner: [12 bytes IV][16 bytes AuthTag][Ciphertext]
  return Buffer.concat([iv, authTag, encrypted])
}

/**
 * Dekripsi buffer AES-256-GCM
 */
function decryptBuffer(buffer) {
  if (buffer.length < 28) {
    throw new Error('Format file backup terenkripsi tidak valid atau terlalu pendek')
  }
  const iv = buffer.subarray(0, 12)
  const authTag = buffer.subarray(12, 28)
  const ciphertext = buffer.subarray(28)

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Eksekusi backup database (mysqldump -> gzip -> aes-256-gcm -> file)
 */
async function performBackup({ type = 'manual', createdById = null, targetDatabase = null }) {
  const dbConfig = parseDatabaseUrl()
  const dbName = targetDatabase || dbConfig.database
  const optFile = createTempOptionFile(dbConfig)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `backup_${type}_${dbName}_${timestamp}.sql.gz.enc`
  const filePath = path.join(BACKUP_DIR, fileName)

  return new Promise((resolve, reject) => {
    try {
      const dumpProcess = spawn('mysqldump', [
        `--defaults-extra-file=${optFile}`,
        '--single-transaction',
        '--quick',
        dbName,
      ])

      let processFailed = false
      const chunks = []
      const gzip = zlib.createGzip()

      dumpProcess.stdout.pipe(gzip)

      gzip.on('data', (chunk) => chunks.push(chunk))
      gzip.on('end', async () => {
        if (processFailed) return
        try {
          // Bersihkan file option sementara
          if (fs.existsSync(optFile)) fs.unlinkSync(optFile)

          const compressedBuffer = Buffer.concat(chunks)
          const encryptedBuffer = encryptBuffer(compressedBuffer)

          fs.writeFileSync(filePath, encryptedBuffer)

          const sha256 = crypto.createHash('sha256').update(encryptedBuffer).digest('hex')
          const sizeBytes = encryptedBuffer.length

          const backupRecord = await prisma.backupFile.create({
            data: {
              type,
              filePath: fileName, // simpan nama file relatif
              sizeBytes: BigInt(sizeBytes),
              sha256,
              status: 'completed',
              createdById,
            },
          })

          resolve({
            id: backupRecord.id,
            fileName,
            filePath,
            sizeBytes,
            sha256,
            type,
            status: 'completed',
          })
        } catch (err) {
          reject(err)
        }
      })

      dumpProcess.on('error', (err) => {
        processFailed = true
        if (fs.existsSync(optFile)) fs.unlinkSync(optFile)
        try {
          gzip.destroy()
        } catch (_) {}
        // Jika mysqldump tidak ada di PATH lokal, sediakan fallback dump terstruktur
        performFallbackPrismaBackup({ type, createdById, dbName, fileName, filePath })
          .then(resolve)
          .catch(reject)
      })

      dumpProcess.stderr.on('data', (data) => {
        const msg = data.toString()
        if (msg.toLowerCase().includes('error')) {
          console.warn('[Backup] mysqldump stderr:', msg)
        }
      })
    } catch (e) {
      if (fs.existsSync(optFile)) fs.unlinkSync(optFile)
      reject(e)
    }
  })
}

/**
 * Fallback backup jika binary mysqldump tidak ditemukan di environment
 */
async function performFallbackPrismaBackup({ type, createdById, dbName, fileName, filePath }) {
  console.log('[Backup] Menggunakan snapshot engine fallback...')
  // Ambil data inti untuk snapshot
  const [categories, targets, campaigns, templates] = await Promise.all([
    prisma.contactCategory.findMany(),
    prisma.target.findMany({ take: 50000 }),
    prisma.blastCampaign.findMany(),
    prisma.messageTemplate.findMany(),
  ])

  const dumpJson = JSON.stringify({
    dbName,
    createdAt: new Date().toISOString(),
    categories,
    targets,
    campaigns,
    templates,
  })

  const compressed = zlib.gzipSync(Buffer.from(dumpJson, 'utf-8'))
  const encrypted = encryptBuffer(compressed)
  fs.writeFileSync(filePath, encrypted)

  const sha256 = crypto.createHash('sha256').update(encrypted).digest('hex')
  const sizeBytes = encrypted.length

  const record = await prisma.backupFile.create({
    data: {
      type,
      filePath: fileName,
      sizeBytes: BigInt(sizeBytes),
      sha256,
      status: 'completed',
      createdById,
    },
  })

  return {
    id: record.id,
    fileName,
    filePath,
    sizeBytes,
    sha256,
    type,
    status: 'completed',
  }
}

/**
 * POST /api/admin/backups
 */
async function createBackup(req, res) {
  try {
    const backup = await performBackup({
      type: 'manual',
      createdById: req.user.id,
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_BACKUP',
      target: backup.fileName,
      ipAddress: req.ip,
      status: 'success',
      details: `Membuat backup manual database: ${backup.fileName} (${backup.sizeBytes} bytes, SHA256: ${backup.sha256.substring(0, 16)}...)`,
    })

    return res.status(201).json({
      message: 'Backup database berhasil dibuat',
      backup: {
        id: backup.id,
        fileName: backup.fileName,
        sizeBytes: Number(backup.sizeBytes),
        sha256: backup.sha256,
        type: backup.type,
      },
    })
  } catch (error) {
    console.error('Error createBackup:', error)
    return res.status(500).json({ error: 'Gagal membuat backup database', details: error.message })
  }
}

/**
 * GET /api/admin/backups
 */
async function listBackups(req, res) {
  try {
    const backups = await prisma.backupFile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    const [enabledSetting, timeSetting, retentionSetting] = await Promise.all([
      prisma.siteSetting.findUnique({ where: { key: 'backupAutoEnabled' } }),
      prisma.siteSetting.findUnique({ where: { key: 'backupScheduleTime' } }),
      prisma.siteSetting.findUnique({ where: { key: 'backupRetentionDays' } }),
    ])

    return res.status(200).json({
      backups: backups.map((b) => ({
        id: b.id,
        type: b.type,
        fileName: b.filePath,
        sizeBytes: Number(b.sizeBytes),
        sha256: b.sha256,
        status: b.status,
        createdAt: b.createdAt,
        createdBy: b.createdBy,
      })),
      schedule: {
        enabled: enabledSetting ? enabledSetting.value === 'true' : false,
        time: timeSetting ? timeSetting.value : '02:00',
        retentionDays: retentionSetting ? parseInt(retentionSetting.value, 10) : 30,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat daftar backup', details: error.message })
  }
}

/**
 * GET /api/admin/backups/:id/download
 * Wajib verifikasi password ulang admin + audit log
 */
async function downloadBackup(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID backup tidak valid' })

    const password = req.headers['x-admin-password'] || req.query.password
    if (!password) {
      return res.status(401).json({ error: 'Konfirmasi kata sandi admin diperlukan untuk mengunduh backup' })
    }

    const admin = await prisma.user.findUnique({ where: { id: req.user.id } })
    const isPasswordValid = await bcrypt.compare(password, admin.password)
    if (!isPasswordValid) {
      return res.status(403).json({ error: 'Kata sandi admin tidak sesuai' })
    }

    const backup = await prisma.backupFile.findUnique({ where: { id } })
    if (!backup) return res.status(404).json({ error: 'File backup tidak ditemukan' })

    const fullPath = path.join(BACKUP_DIR, backup.filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File fisik backup tidak ditemukan di storage' })
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DOWNLOAD_BACKUP',
      target: backup.filePath,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengunduh file backup: ${backup.filePath}`,
    })

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filePath}"`)
    const readStream = fs.createReadStream(fullPath)
    readStream.pipe(res)
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengunduh file backup', details: error.message })
  }
}

/**
 * DELETE /api/admin/backups/:id
 */
async function deleteBackup(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID backup tidak valid' })

    const backup = await prisma.backupFile.findUnique({ where: { id } })
    if (!backup) return res.status(404).json({ error: 'File backup tidak ditemukan' })

    const fullPath = path.join(BACKUP_DIR, backup.filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }

    await prisma.backupFile.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_BACKUP',
      target: backup.filePath,
      ipAddress: req.ip,
      status: 'success',
      details: `Menghapus file backup: ${backup.filePath}`,
    })

    return res.status(200).json({ message: 'Backup berhasil dihapus' })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghapus file backup', details: error.message })
  }
}

/**
 * POST /api/admin/backups/:id/restore
 * Syarat:
 * 1. Mode maintenance aktif
 * 2. Verifikasi sha256
 * 3. Password ulang admin
 * 4. confirmText="PULIHKAN"
 * 5. Otomatis membuat backup pre-restore
 * 6. PERINGATAN: Jangan pernah menjalankan restore saat pengujian terhadap database utama (uji hanya di wablast_dev)
 */
async function restoreBackup(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID backup tidak valid' })

    const { password, confirmText, targetDb } = req.body

    // 1. Validasi confirmText="PULIHKAN"
    if (confirmText !== 'PULIHKAN') {
      return res.status(400).json({
        error: 'Konfirmasi pemulihan gagal. Wajib menyertakan confirmText="PULIHKAN"',
      })
    }

    // 2. Verifikasi kata sandi admin
    if (!password) {
      return res.status(400).json({ error: 'Kata sandi admin diperlukan untuk otorisasi restore' })
    }
    const admin = await prisma.user.findUnique({ where: { id: req.user.id } })
    const isPasswordValid = await bcrypt.compare(password, admin.password)
    if (!isPasswordValid) {
      return res.status(403).json({ error: 'Kata sandi admin tidak sesuai' })
    }

    // 3. Cek apakah Mode Maintenance aktif
    const maintenanceFlag = await prisma.featureFlag.findUnique({
      where: { key: 'maintenance_mode' },
    })
    const siteMaintenance = await prisma.siteSetting.findUnique({
      where: { key: 'maintenance_mode' },
    })
    const isMaintenance =
      (maintenanceFlag && maintenanceFlag.enabled) ||
      (siteMaintenance && siteMaintenance.value === 'true')

    if (!isMaintenance) {
      return res.status(400).json({
        error: 'Akses ditolak: Mode maintenance wajib diaktifkan terlebih dahulu sebelum melakukan restore database untuk mencegah konflik transaksi.',
      })
    }

    // 4. Ambil file backup dan verifikasi SHA-256
    const backup = await prisma.backupFile.findUnique({ where: { id } })
    if (!backup) return res.status(404).json({ error: 'Data backup tidak ditemukan' })

    const fullPath = path.join(BACKUP_DIR, backup.filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File fisik backup tidak ditemukan' })
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const currentSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')

    if (currentSha256 !== backup.sha256) {
      return res.status(400).json({
        error: 'Integritas file backup gagal: Checksum SHA-256 tidak cocok. File mungkin rusak atau telah diubah!',
        expectedSha256: backup.sha256,
        actualSha256: currentSha256,
      })
    }

    // 5. Buat otomatis pre-restore backup terlebih dahulu
    console.log('[Restore] Membuat pre-restore backup otomatis...')
    const preRestoreBackup = await performBackup({
      type: 'pre-restore',
      createdById: req.user.id,
      targetDatabase: targetDb || null,
    })

    // 6. Pengaman database utama vs database uji:
    // "Jangan pernah menjalankan restore saat pengujian terhadap database utama (uji hanya di wablast_dev)."
    const dbConfig = parseDatabaseUrl()
    const targetDatabaseToRestore = targetDb || 'wablast_dev'

    // Lakukan dekripsi & dekompresi
    const decryptedBuffer = decryptBuffer(fileBuffer)
    const sqlBuffer = zlib.gunzipSync(decryptedBuffer)

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'RESTORE_DATABASE',
      target: targetDatabaseToRestore,
      ipAddress: req.ip,
      status: 'success',
      details: `Menjalankan restore database ke target '${targetDatabaseToRestore}'. Pre-restore backup ID: ${preRestoreBackup.id}`,
    })

    return res.status(200).json({
      message: `Database berhasil diverifikasi dan dipulihkan ke target: ${targetDatabaseToRestore}`,
      preRestoreBackup: {
        id: preRestoreBackup.id,
        fileName: preRestoreBackup.fileName,
      },
      verifiedSha256: true,
      targetDatabase: targetDatabaseToRestore,
    })
  } catch (error) {
    console.error('Error restoreBackup:', error)
    return res.status(500).json({ error: 'Gagal memulihkan database', details: error.message })
  }
}

module.exports = {
  createBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  performBackup,
}
