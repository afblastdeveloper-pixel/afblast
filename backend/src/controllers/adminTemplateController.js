const { z } = require('zod')
const prisma = require('../config/db')
const { logActivity } = require('../utils/activityLogger')
const { checkContentPolicy } = require('../utils/contentPolicy')

function formatTemplateData(tpl) {
  if (!tpl) return tpl
  return {
    ...tpl,
    buttonText: tpl.buttonLabel,
    buttonLabel: tpl.buttonLabel,
    mediaUrl: tpl.imageUrl,
    imageUrl: tpl.imageUrl,
  }
}

/**
 * GET /api/admin/templates
 */
async function listTemplates(req, res) {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true },
        },
      },
    })
    return res.status(200).json({ templates: templates.map(formatTemplateData) })
  } catch (error) {
    console.error('Error listTemplates:', error)
    return res.status(500).json({ error: 'Gagal memuat daftar template', details: error.message })
  }
}

/**
 * GET /api/admin/templates/:id
 */
async function getTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID template tidak valid' })

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })
    if (!template) return res.status(404).json({ error: 'Template tidak ditemukan' })

    return res.status(200).json({ template: formatTemplateData(template) })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat template', details: error.message })
  }
}

/**
 * POST /api/admin/templates
 */
async function createTemplate(req, res) {
  try {
    const name = (req.body.name || req.body.title || '').trim()
    const body = (req.body.body || req.body.message || req.body.caption || '').trim()
    const buttonLabel = (req.body.buttonLabel || req.body.buttonText || '').trim() || null
    let buttonUrl = (req.body.buttonUrl || '').trim() || null
    const imageUrl = req.uploadedImageUrl || req.body.imageUrl || req.body.mediaUrl || null

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nama template minimal 2 karakter' })
    }
    if (!body || body.length < 5) {
      return res.status(400).json({ error: 'Isi template minimal 5 karakter' })
    }
    if (buttonUrl && !buttonUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Button URL wajib menggunakan protokol HTTPS yang aman (https://)' })
    }

    // Cek Kebijakan Konten
    const policyCheck = await checkContentPolicy([name, body, buttonLabel, buttonUrl])
    if (!policyCheck.allowed) {
      return res.status(400).json({
        error: 'Pelanggaran Kebijakan Konten: ' + policyCheck.reason,
        policyReason: policyCheck.reason,
      })
    }

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        body,
        imageUrl,
        buttonLabel,
        buttonUrl,
        createdById: req.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'CREATE_TEMPLATE',
      target: template.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Membuat template pesan: ${template.name}`,
    })

    return res.status(201).json({
      message: 'Template berhasil dibuat',
      template: formatTemplateData(template),
    })
  } catch (error) {
    console.error('Error createTemplate:', error)
    const errorMsg =
      error.issues?.[0]?.message ||
      error.errors?.[0]?.message ||
      error.message ||
      'Gagal membuat template'
    return res.status(400).json({ error: errorMsg })
  }
}

/**
 * PATCH & PUT /api/admin/templates/:id
 */
async function updateTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID template tidak valid' })

    const existing = await prisma.messageTemplate.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Template tidak ditemukan' })

    const updateData = {}
    if (req.body.name !== undefined) {
      const name = req.body.name.trim()
      if (name.length < 2) return res.status(400).json({ error: 'Nama template minimal 2 karakter' })
      updateData.name = name
    }
    if (req.body.body !== undefined) {
      const body = req.body.body.trim()
      if (body.length < 5) return res.status(400).json({ error: 'Isi template minimal 5 karakter' })
      updateData.body = body
    }
    if (req.uploadedImageUrl) {
      updateData.imageUrl = req.uploadedImageUrl
    } else if (req.body.imageUrl !== undefined) {
      updateData.imageUrl = req.body.imageUrl || null
    }

    if (req.body.buttonLabel !== undefined || req.body.buttonText !== undefined) {
      const bText = (req.body.buttonLabel || req.body.buttonText || '').trim()
      updateData.buttonLabel = bText || null
    }

    if (req.body.buttonUrl !== undefined) {
      const bUrl = (req.body.buttonUrl || '').trim()
      if (bUrl && !bUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Button URL wajib menggunakan protokol HTTPS yang aman (https://)' })
      }
      updateData.buttonUrl = bUrl || null
    }

    // Cek Kebijakan Konten
    const policyCheck = await checkContentPolicy([
      updateData.name || existing.name,
      updateData.body || existing.body,
      updateData.buttonLabel !== undefined ? updateData.buttonLabel : existing.buttonLabel,
      updateData.buttonUrl !== undefined ? updateData.buttonUrl : existing.buttonUrl,
    ])
    if (!policyCheck.allowed) {
      return res.status(400).json({
        error: 'Pelanggaran Kebijakan Konten: ' + policyCheck.reason,
        policyReason: policyCheck.reason,
      })
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'UPDATE_TEMPLATE',
      target: updated.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Memperbarui template pesan ID ${id}`,
    })

    return res.status(200).json({
      message: 'Template berhasil diperbarui',
      template: formatTemplateData(updated),
    })
  } catch (error) {
    console.error('Error updateTemplate:', error)
    const errorMsg =
      error.issues?.[0]?.message ||
      error.errors?.[0]?.message ||
      error.message ||
      'Gagal memperbarui template'
    return res.status(400).json({ error: errorMsg })
  }
}

/**
 * DELETE /api/admin/templates/:id
 */
async function deleteTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'ID template tidak valid' })

    const template = await prisma.messageTemplate.findUnique({ where: { id } })
    if (!template) return res.status(404).json({ error: 'Template tidak ditemukan' })

    await prisma.messageTemplate.delete({ where: { id } })

    await logActivity({
      userId: req.user.id,
      adminName: req.user.name,
      action: 'DELETE_TEMPLATE',
      target: template.name,
      ipAddress: req.ip,
      status: 'success',
      details: `Menghapus template pesan: ${template.name}`,
    })

    return res.status(200).json({ message: 'Template berhasil dihapus' })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghapus template', details: error.message })
  }
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  formatTemplateData,
}
