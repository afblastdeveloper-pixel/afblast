const fs = require('fs')
const path = require('path')
const multer = require('multer')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const { validateImageMagicBytes } = require('../utils/fileValidator')
const { checkContentPolicy } = require('../utils/contentPolicy')
const { publishAdminEvent } = require('../utils/sseManager')

const UPLOAD_CAMPAIGN_DIR = path.join(__dirname, '../../uploads/campaign')
if (!fs.existsSync(UPLOAD_CAMPAIGN_DIR)) {
  fs.mkdirSync(UPLOAD_CAMPAIGN_DIR, { recursive: true })
}

// Multer memory storage agar bisa validasi magic bytes sebelum ditulis ke disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

const uploadImageMiddleware = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Gagal memproses unggahan file' })
    }
    next()
  })
}

/**
 * Middleware untuk memvalidasi magic bytes dan menyimpan gambar kampanye
 */
function processImageUpload(req, res, next) {
  let file = req.file
  if (!file && req.files) {
    if (Array.isArray(req.files) && req.files.length > 0) {
      file =
        req.files.find((f) => f.fieldname === 'image' || f.fieldname === 'media' || f.fieldname === 'file') ||
        req.files[0]
    } else if (req.files.image && req.files.image[0]) {
      file = req.files.image[0]
    } else if (req.files.media && req.files.media[0]) {
      file = req.files.media[0]
    }
  }

  if (!file) return next()

  const validation = validateImageMagicBytes(file.buffer)
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error })
  }

  const filename = `camp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${validation.format}`
  const targetPath = path.join(UPLOAD_CAMPAIGN_DIR, filename)

  try {
    fs.writeFileSync(targetPath, file.buffer)
    req.uploadedImageUrl = `/media/campaign/${filename}`
    next()
  } catch (err) {
    console.error('Error saving campaign image:', err)
    return res.status(500).json({ error: 'Gagal menyimpan gambar di server' })
  }
}

function formatCampaignData(camp) {
  if (!camp) return camp
  return {
    ...camp,
    name: camp.title,
    message: camp.caption,
    mediaUrl: camp.imageUrl,
    buttonText: camp.buttonLabel,
    totalRecipients: camp.totalTarget,
  }
}

/**
 * GET /api/admin/campaigns
 */
async function listCampaigns(req, res) {
  try {
    const { status, categoryId, tab } = req.query
    const where = {}

    if (tab === 'trash') {
      where.status = 'trash'
    } else if (tab === 'draft') {
      where.status = 'draft'
    } else if (tab === 'active') {
      where.status = { in: ['running', 'active', 'paused', 'completed'] }
    } else if (status) {
      where.status = status
    } else {
      where.status = { not: 'trash' }
    }

    if (categoryId) {
      where.categoryId = parseInt(categoryId, 10)
    }

    const [campaigns, draftCount, trashCount, activeCount] = await Promise.all([
      prisma.blastCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { id: true, name: true, ratePerMessage: true },
          },
          template: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.blastCampaign.count({ where: { status: 'draft' } }),
      prisma.blastCampaign.count({ where: { status: 'trash' } }),
      prisma.blastCampaign.count({ where: { status: { in: ['running', 'active', 'paused'] } } }),
    ])

    const formattedCampaigns = campaigns.map(formatCampaignData)

    return res.status(200).json({
      campaigns: formattedCampaigns,
      draftCount,
      trashCount,
      activeCount,
    })
  } catch (error) {
    console.error('Error listCampaigns:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar kampanye', details: error.message })
  }
}

/**
 * GET /api/admin/campaigns/:id
 */
async function getCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const campaign = await prisma.blastCampaign.findUnique({
      where: { id },
      include: {
        category: true,
        template: true,
        createdBy: { select: { id: true, name: true } },
      },
    })
    if (!campaign) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    return res.status(200).json({ campaign: formatCampaignData(campaign) })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat detail kampanye', details: error.message })
  }
}

/**
 * POST /api/admin/campaigns
 * CRUD: nama/title, categoryId, templateId atau isi sendiri
 */
async function createCampaign(req, res) {
  try {
    const {
      title,
      name,
      caption,
      message,
      categoryId,
      templateId,
      buttonLabel,
      buttonText,
      buttonUrl,
      status: reqStatus,
    } = req.body

    const finalTitle = (title || name || '').trim()
    if (!finalTitle) {
      return res.status(400).json({ error: 'Nama/judul kampanye wajib diisi' })
    }

    let finalCaption =
      caption !== undefined && caption !== null && caption !== '' ? caption : (message || '')
    let imageUrl = req.uploadedImageUrl || null
    let finalButtonLabel = buttonLabel || buttonText || null
    let finalButtonUrl = buttonUrl || null

    // Jika templateId disertakan, ambil nilai default dari template jika belum diisi
    const parsedTemplateId = templateId ? parseInt(templateId, 10) : null
    if (parsedTemplateId) {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: parsedTemplateId },
      })
      if (template) {
        if (!finalCaption) finalCaption = template.body
        if (!imageUrl) imageUrl = template.imageUrl
        if (!finalButtonLabel) finalButtonLabel = template.buttonLabel
        if (!finalButtonUrl) finalButtonUrl = template.buttonUrl
      }
    }

    if (!finalCaption || !finalCaption.trim()) {
      return res.status(400).json({ error: 'Pesan/caption kampanye wajib diisi' })
    }

    // Validasi URL tombol https
    if (finalButtonUrl && !finalButtonUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Tautan tombol (buttonUrl) wajib diawali dengan https://' })
    }

    // Cek Kebijakan Konten
    const policyCheck = await checkContentPolicy([finalTitle, finalCaption, finalButtonLabel, finalButtonUrl])
    if (!policyCheck.allowed) {
      return res.status(400).json({
        error: 'Pelanggaran Kebijakan Konten: ' + policyCheck.reason,
        policyReason: policyCheck.reason,
      })
    }

    const parsedCatId = categoryId ? parseInt(categoryId, 10) : null

    // Hitung estimasi target dari kategori jika ada
    let totalTarget = 0
    if (parsedCatId) {
      totalTarget = await prisma.target.count({
        where: { categoryId: parsedCatId, optOut: false },
      })
    }

    const status = reqStatus || 'draft'
    const isStarted = status === 'active' || status === 'running'

    const campaign = await prisma.blastCampaign.create({
      data: {
        title: finalTitle,
        caption: finalCaption,
        imageUrl,
        buttonLabel: finalButtonLabel,
        buttonUrl: finalButtonUrl,
        categoryId: parsedCatId,
        templateId: parsedTemplateId,
        status,
        totalTarget,
        createdById: req.user.id,
        startedAt: isStarted ? new Date() : null,
      },
      include: {
        category: true,
        template: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_CAMPAIGN',
      target: campaign.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Membuat kampanye blast: ${campaign.title} (Status: ${status})`,
    })

    publishAdminEvent('campaign.progress', {
      campaignId: campaign.id,
      title: campaign.title,
      status: campaign.status,
      totalTarget,
    })

    publishAdminEvent('campaign_update', {
      id: campaign.id,
      title: campaign.title,
      name: campaign.title,
      status: campaign.status,
      totalTarget,
    })

    return res.status(201).json({
      message: 'Kampanye berhasil dibuat',
      campaign: formatCampaignData(campaign),
    })
  } catch (error) {
    console.error('Error in createCampaign:', error)
    return res.status(500).json({ error: 'Gagal membuat kampanye', details: error.message })
  }
}

/**
 * PUT/PATCH /api/admin/campaigns/:id
 */
async function updateCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const existing = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    const {
      title,
      name,
      caption,
      message,
      categoryId,
      templateId,
      buttonLabel,
      buttonText,
      buttonUrl,
      status,
    } = req.body

    const updateData = {}
    const finalTitle = title !== undefined ? title : name
    if (finalTitle) updateData.title = finalTitle.trim()

    const finalCaption = caption !== undefined ? caption : message
    if (finalCaption) updateData.caption = finalCaption

    if (req.uploadedImageUrl) updateData.imageUrl = req.uploadedImageUrl

    const finalButtonLabel = buttonLabel !== undefined ? buttonLabel : buttonText
    if (finalButtonLabel !== undefined) updateData.buttonLabel = finalButtonLabel

    if (buttonUrl !== undefined) {
      if (buttonUrl && !buttonUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Tautan tombol wajib diawali dengan https://' })
      }
      updateData.buttonUrl = buttonUrl
    }
    if (categoryId !== undefined) {
      updateData.categoryId = categoryId ? parseInt(categoryId, 10) : null
    }
    if (templateId !== undefined) {
      updateData.templateId = templateId ? parseInt(templateId, 10) : null
    }
    if (status) updateData.status = status

    // Cek Kebijakan Konten
    const policyCheck = await checkContentPolicy([
      updateData.title || existing.title,
      updateData.caption || existing.caption,
      updateData.buttonLabel !== undefined ? updateData.buttonLabel : existing.buttonLabel,
      updateData.buttonUrl !== undefined ? updateData.buttonUrl : existing.buttonUrl,
    ])
    if (!policyCheck.allowed) {
      return res.status(400).json({
        error: 'Pelanggaran Kebijakan Konten: ' + policyCheck.reason,
        policyReason: policyCheck.reason,
      })
    }

    const updated = await prisma.blastCampaign.update({
      where: { id },
      data: updateData,
      include: { category: true, template: true },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_CAMPAIGN',
      target: updated.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui kampanye blast ID ${id}`,
    })

    publishAdminEvent('campaign.progress', {
      campaignId: updated.id,
      title: updated.title,
      status: updated.status,
    })

    publishAdminEvent('campaign_update', {
      id: updated.id,
      title: updated.title,
      name: updated.title,
      status: updated.status,
    })

    return res.status(200).json({
      message: 'Kampanye berhasil diperbarui',
      campaign: formatCampaignData(updated),
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memperbarui kampanye', details: error.message })
  }
}

/**
 * POST /api/admin/campaigns/:id/duplicate
 */
async function duplicateCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const orig = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!orig) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    const duplicated = await prisma.blastCampaign.create({
      data: {
        title: `${orig.title} (Salinan)`,
        caption: orig.caption,
        imageUrl: orig.imageUrl,
        buttonLabel: orig.buttonLabel,
        buttonUrl: orig.buttonUrl,
        categoryId: orig.categoryId,
        templateId: orig.templateId,
        status: 'draft',
        totalTarget: orig.totalTarget,
        createdById: req.user.id,
      },
      include: {
        category: true,
        template: true,
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DUPLICATE_CAMPAIGN',
      target: duplicated.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Menduplikasi kampanye blast '${orig.title}' menjadi '${duplicated.title}'`,
    })

    return res.status(201).json({
      message: 'Kampanye berhasil diduplikasi sebagai Draft baru',
      campaign: formatCampaignData(duplicated),
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menduplikasi kampanye', details: error.message })
  }
}

/**
 * DELETE /api/admin/campaigns/:id
 */
async function deleteCampaign(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const existing = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    await prisma.blastCampaign.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_CAMPAIGN',
      target: existing.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Menghapus permanen kampanye blast ID ${id} (${existing.title})`,
    })

    return res.status(200).json({ message: 'Kampanye berhasil dihapus permanen' })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghapus kampanye', details: error.message })
  }
}

/**
 * Aksi transisi status kampanye: start, pause, draft, trash, restore
 */
async function transitionCampaignStatus(req, res, action) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const campaign = await prisma.blastCampaign.findUnique({ where: { id } })
    if (!campaign) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    let newStatus = campaign.status
    const updatePayload = {}

    switch (action) {
      case 'start':
      case 'resume':
        newStatus = 'active'
        if (!campaign.startedAt) updatePayload.startedAt = new Date()
        break
      case 'pause':
        newStatus = 'paused'
        break
      case 'draft':
        newStatus = 'draft'
        break
      case 'trash':
        newStatus = 'trash'
        break
      case 'restore':
        newStatus = 'draft'
        break
      case 'end':
        newStatus = 'ended'
        updatePayload.endedAt = new Date()
        break
      default:
        return res.status(400).json({ error: 'Aksi status tidak valid' })
    }

    updatePayload.status = newStatus

    const updated = await prisma.blastCampaign.update({
      where: { id },
      data: updatePayload,
      include: { category: true, template: true },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: `CAMPAIGN_${action.toUpperCase()}`,
      target: campaign.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengubah status kampanye '${campaign.title}' menjadi ${newStatus}`,
    })

    publishAdminEvent('campaign.progress', {
      campaignId: updated.id,
      title: updated.title,
      status: updated.status,
      sentCount: updated.sentCount,
      deliveredCount: updated.deliveredCount,
      readCount: updated.readCount,
      failedCount: updated.failedCount,
    })

    return res.status(200).json({
      message: `Status kampanye berhasil diubah menjadi '${newStatus}'`,
      campaign: updated,
    })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengubah status kampanye', details: error.message })
  }
}

/**
 * GET /api/admin/campaigns/:id/report
 * sent, delivered, read, failed, deliveryRate, readRate, hourly series, top failures
 */
async function getCampaignReport(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID kampanye tidak valid' })

    const campaign = await prisma.blastCampaign.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } },
      },
    })
    if (!campaign) return res.status(404).json({ error: 'Kampanye tidak ditemukan' })

    const sent = campaign.sentCount || 0
    const delivered = campaign.deliveredCount || 0
    const read = campaign.readCount || 0
    const failed = campaign.failedCount || 0

    const deliveryRate = sent > 0 ? parseFloat(((delivered / sent) * 100).toFixed(2)) : 0
    // readRate = read/delivered (null bila penyedia tidak mengirim status baca)
    const readRate = delivered > 0 && read > 0 ? parseFloat(((read / delivered) * 100).toFixed(2)) : null

    // 1. Seri per jam (Hourly Series) dari tabel MessageEvent
    const events = await prisma.messageEvent.findMany({
      where: { campaignId: id },
      select: { status: true, at: true },
      orderBy: { at: 'asc' },
    })

    const hourlyMap = new Map()
    for (const ev of events) {
      const hourKey = new Date(ev.at).toISOString().substring(0, 13) + ':00:00Z'
      if (!hourlyMap.has(hourKey)) {
        hourlyMap.set(hourKey, { hour: hourKey, sent: 0, delivered: 0, read: 0, failed: 0 })
      }
      const item = hourlyMap.get(hourKey)
      if (item[ev.status] !== undefined) {
        item[ev.status]++
      }
    }
    const hourlySeries = Array.from(hourlyMap.values())

    // 2. Kegagalan teratas (Top Failures) dari tabel BlastLog / BlastTask
    const failedLogs = await prisma.blastLog.groupBy({
      by: ['error'],
      where: {
        campaignId: id,
        status: 'failed',
        error: { not: null },
      },
      _count: { id: true },
      orderBy: {
        _count: { id: 'desc' },
      },
      take: 5,
    })

    const topFailures = failedLogs.map((f) => ({
      reason: f.error || 'Unknown Error',
      count: f._count.id,
    }))

    return res.status(200).json({
      campaign: {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        startedAt: campaign.startedAt || campaign.startAt,
        endedAt: campaign.endedAt || campaign.endAt,
      },
      metrics: {
        sent,
        delivered,
        read,
        failed,
        deliveryRate,
        readRate,
      },
      hourlySeries,
      topFailures,
    })
  } catch (error) {
    console.error('Error in getCampaignReport:', error)
    return res.status(500).json({ error: 'Gagal memuat laporan kampanye', details: error.message })
  }
}

/**
 * GET /api/admin/campaigns/report/export?id=...&format=xlsx|pdf
 * Streaming ekspor exceljs & pdfkit
 */
async function exportCampaignReport(req, res) {
  try {
    const campaignId = parseInt(req.query.id || req.params.id, 10)
    const format = (req.query.format || 'xlsx').toLowerCase()

    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'ID kampanye wajib disertakan' })
    }

    const campaign = await prisma.blastCampaign.findUnique({
      where: { id: campaignId },
      include: { category: true, createdBy: true },
    })
    if (!campaign) {
      return res.status(404).json({ error: 'Kampanye tidak ditemukan' })
    }

    const sent = campaign.sentCount || 0
    const delivered = campaign.deliveredCount || 0
    const read = campaign.readCount || 0
    const failed = campaign.failedCount || 0
    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(2) + '%' : '0%'
    const readRate = delivered > 0 && read > 0 ? ((read / delivered) * 100).toFixed(2) + '%' : 'N/A'

    if (format === 'xlsx') {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="campaign-report-${campaignId}-${Date.now()}.xlsx"`
      )

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Laporan Kampanye')

      worksheet.columns = [
        { header: 'Parameter', key: 'param', width: 25 },
        { header: 'Nilai', key: 'value', width: 35 },
      ]

      worksheet.addRow({ param: 'ID Kampanye', value: campaign.id })
      worksheet.addRow({ param: 'Nama Kampanye', value: campaign.title })
      worksheet.addRow({ param: 'Kategori', value: campaign.category?.name || 'Semua' })
      worksheet.addRow({ param: 'Status', value: campaign.status })
      worksheet.addRow({ param: 'Total Terkirim (Sent)', value: sent })
      worksheet.addRow({ param: 'Tersampaikan (Delivered)', value: delivered })
      worksheet.addRow({ param: 'Dibaca (Read)', value: read })
      worksheet.addRow({ param: 'Gagal (Failed)', value: failed })
      worksheet.addRow({ param: 'Delivery Rate', value: deliveryRate })
      worksheet.addRow({ param: 'Read Rate', value: readRate })
      worksheet.addRow({ param: 'Waktu Ekspor', value: new Date().toISOString() })

      await workbook.xlsx.write(res)
      res.end()
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="campaign-report-${campaignId}-${Date.now()}.pdf"`
      )

      const doc = new PDFDocument({ margin: 40 })
      doc.pipe(res)

      doc.fontSize(20).text('Laporan Kampanye WhatsApp Blast', { align: 'center' })
      doc.moveDown()
      doc.fontSize(14).text(`Judul: ${campaign.title}`)
      doc.fontSize(11).text(`ID: ${campaign.id} | Status: ${campaign.status}`)
      doc.text(`Kategori: ${campaign.category?.name || '-'}`)
      doc.text(`Tanggal: ${new Date().toLocaleString('id-ID')}`)
      doc.moveDown()

      doc.fontSize(14).text('Ringkasan Metrik Pengiriman:')
      doc.fontSize(12)
      doc.text(`- Total Terkirim (Sent): ${sent}`)
      doc.text(`- Berhasil Tersampaikan (Delivered): ${delivered}`)
      doc.text(`- Telah Dibaca (Read): ${read}`)
      doc.text(`- Gagal (Failed): ${failed}`)
      doc.text(`- Tingkat Keberhasilan (Delivery Rate): ${deliveryRate}`)
      doc.text(`- Tingkat Pembacaan (Read Rate): ${readRate}`)
      doc.moveDown()

      doc.fontSize(10).text('Dokumen ini dibuat otomatis oleh Sistem AF Blast.', { align: 'center' })

      doc.end()
    } else {
      return res.status(400).json({ error: 'Format ekspor tidak didukung. Gunakan xlsx atau pdf.' })
    }

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'EXPORT_CAMPAIGN_REPORT',
      target: campaign.title,
      ipAddress: req.ip,
      status: 'success',
      details: `Mengekspor laporan kampanye '${campaign.title}' format ${format}`,
    })
  } catch (error) {
    console.error('Error exportCampaignReport:', error)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Gagal mengekspor laporan kampanye', details: error.message })
    }
  }
}

module.exports = {
  upload,
  uploadImageMiddleware,
  processImageUpload,
  formatCampaignData,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  duplicateCampaign,
  deleteCampaign,
  transitionCampaignStatus,
  startCampaign: (req, res) => transitionCampaignStatus(req, res, 'start'),
  pauseCampaign: (req, res) => transitionCampaignStatus(req, res, 'pause'),
  draftCampaign: (req, res) => transitionCampaignStatus(req, res, 'draft'),
  trashCampaign: (req, res) => transitionCampaignStatus(req, res, 'trash'),
  restoreCampaign: (req, res) => transitionCampaignStatus(req, res, 'restore'),
  getCampaignReport,
  exportCampaignReport,
}
