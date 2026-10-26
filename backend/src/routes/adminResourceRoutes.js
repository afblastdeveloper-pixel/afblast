const express = require('express')
const router = express.Router()
const prisma = require('../config/db')
const adminResourceController = require('../controllers/adminResourceController')
const adminOperationsController = require('../controllers/adminOperationsController')
const adminDashboardController = require('../controllers/adminDashboardController')
const adminCategoryController = require('../controllers/adminCategoryController')
const adminTargetController = require('../controllers/adminTargetController')
const adminTemplateController = require('../controllers/adminTemplateController')
const adminCampaignController = require('../controllers/adminCampaignController')
const adminBackupController = require('../controllers/adminBackupController')
const adminEngineController = require('../controllers/adminEngineController')
const { createTicket, consumeTicket, handleStreamConnection } = require('../utils/sseManager')
const { requirePermission } = require('../middlewares/authMiddleware')
const { createRateLimiter } = require('../middlewares/rateLimiter')

const statsRecalculateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 3,
  message: 'Terlalu sering melakukan rekonsiliasi statistik. Silakan coba lagi nanti.',
})

// 1. Pengguna (Users)
router.get('/users', requirePermission('user.view'), adminResourceController.listUsers)
router.get('/users/:id', requirePermission('user.view'), adminResourceController.getUserDetail)
router.put('/users/:id', requirePermission('user.manage'), adminResourceController.updateUser)

// 2. Penarikan (Withdrawals)
router.get(
  '/withdrawals',
  requirePermission('withdrawal.view'),
  adminResourceController.listWithdrawals
)
router.patch(
  '/withdrawals/:id/approve',
  requirePermission('withdrawal.approve'),
  adminResourceController.approveWithdrawal
)
router.patch(
  '/withdrawals/:id/success',
  requirePermission('withdrawal.approve'),
  adminResourceController.markWithdrawalSuccess
)
router.patch(
  '/withdrawals/:id/reject',
  requirePermission('withdrawal.reject'),
  adminResourceController.rejectWithdrawal
)

// 3. Preset Penarikan (Withdrawal Presets) - HANYA superadmin dan adminfinance
router.get(
  '/withdraw-presets',
  requirePermission('withdrawPreset.manage'),
  adminOperationsController.listPresets
)
router.post(
  '/withdraw-presets',
  requirePermission('withdrawPreset.manage'),
  adminOperationsController.createPreset
)
router.put(
  '/withdraw-presets/:id',
  requirePermission('withdrawPreset.manage'),
  adminOperationsController.updatePreset
)
router.delete(
  '/withdraw-presets/:id',
  requirePermission('withdrawPreset.manage'),
  adminOperationsController.deletePreset
)

// 4. Pengaturan Penarikan (Withdrawal Settings) - HANYA superadmin dan adminfinance
router.get(
  '/withdraw-settings',
  requirePermission('withdrawSetting.manage'),
  adminOperationsController.getWithdrawSettings
)
router.put(
  '/withdraw-settings',
  requirePermission('withdrawSetting.manage'),
  adminOperationsController.updateWithdrawSettings
)

// 5. Contact Batches & Import Pool (superadmin & developer)
router.get(
  '/contact-batches',
  requirePermission('contactPool.manage'),
  adminOperationsController.listBatches
)
router.post(
  '/contact-batches',
  requirePermission('contactPool.manage'),
  adminOperationsController.createBatch
)
router.get(
  '/contact-batches/:id',
  requirePermission('contactPool.manage'),
  adminOperationsController.getBatch
)
router.put(
  '/contact-batches/:id',
  requirePermission('contactPool.manage'),
  adminOperationsController.updateBatch
)
router.delete(
  '/contact-batches/:id',
  requirePermission('contactPool.manage'),
  adminOperationsController.deleteBatch
)
router.post(
  '/contact-batches/:id/import',
  requirePermission('contactPool.manage'),
  adminOperationsController.importBatchContacts
)

// 6. Anggota Tim (Team) - superadmin & developer
router.get(
  '/team',
  requirePermission('team.manage'),
  adminOperationsController.listTeam
)
router.post(
  '/team',
  requirePermission('team.manage'),
  adminOperationsController.createTeamMember
)
router.put(
  '/team/:id',
  requirePermission('team.manage'),
  adminOperationsController.updateTeamMember
)
router.delete(
  '/team/:id',
  requirePermission('team.manage'),
  adminOperationsController.deleteTeamMember
)

// 7. Komisi (Commissions)
router.get(
  '/commissions',
  requirePermission('commission.view'),
  adminResourceController.listCommissions
)

// 8. Paket / Rencana (Plans & Packages)
router.get('/plans', requirePermission('plan.view'), adminResourceController.listPlans)
router.get('/packages', requirePermission('plan.view'), adminResourceController.listPlans)

// 9. Pengumuman (Announcements)
router.get(
  '/announcements',
  requirePermission('announcement.view'),
  adminResourceController.listAnnouncements
)
router.post(
  '/announcements',
  requirePermission('announcement.manage'),
  adminResourceController.createAnnouncement
)

// 10. Dashboards
router.get('/dashboard', requirePermission('dashboard.view'), adminDashboardController.getDashboardStats)
router.get(
  '/dashboard/finance',
  requirePermission('dashboard.finance'),
  adminResourceController.getFinanceDashboard
)

// 11. Audit Log
router.get('/logs', requirePermission('log.view'), adminResourceController.listActivityLogs)

// 12. Pengaturan Global
router.get('/settings', requirePermission('setting.view'), adminResourceController.getSettings)
router.put('/settings', requirePermission('setting.manage'), adminResourceController.updateSetting)

// 13. Kampanye WhatsApp Blast (CRUD dengan upload gambar)
const adminBlastController = require('../controllers/adminBlastController')

router.get(
  '/blast-campaigns',
  requirePermission('blastCampaign.manage'),
  adminBlastController.listCampaigns
)
router.post(
  '/blast-campaigns',
  requirePermission('blastCampaign.manage'),
  adminBlastController.upload.single('image'),
  adminBlastController.processCampaignImage,
  adminBlastController.createCampaign
)
router.get(
  '/blast-campaigns/:id',
  requirePermission('blastCampaign.manage'),
  adminBlastController.getCampaign
)
router.put(
  '/blast-campaigns/:id',
  requirePermission('blastCampaign.manage'),
  adminBlastController.upload.single('image'),
  adminBlastController.processCampaignImage,
  adminBlastController.updateCampaign
)
router.delete(
  '/blast-campaigns/:id',
  requirePermission('blastCampaign.manage'),
  adminBlastController.deleteCampaign
)

// 14. Aturan Profil & Pengaturan Perangkat WhatsApp
router.get(
  '/profile-rule',
  requirePermission('profileRule.manage'),
  adminBlastController.getProfileRule
)
router.put(
  '/profile-rule',
  requirePermission('profileRule.manage'),
  adminBlastController.upload.single('photo'),
  adminBlastController.processCampaignImage,
  adminBlastController.updateProfileRule
)
router.get(
  '/device-settings',
  requirePermission('blastCampaign.manage'),
  adminBlastController.getDeviceSettings
)
router.put(
  '/device-settings',
  requirePermission('blastCampaign.manage'),
  adminBlastController.updateDeviceSettings
)

// 15. Permintaan Ganti Rekening (Payout Change Requests)
// Izin: payoutChange.manage (Superadmin & Admin Finance)
const staffPayoutSupport = require('../controllers/staffPayoutSupportController')

router.get(
  '/payout-requests',
  requirePermission('payoutChange.manage'),
  staffPayoutSupport.getPayoutRequests
)
router.post(
  '/payout-requests/:id/approve',
  requirePermission('payoutChange.manage'),
  staffPayoutSupport.approvePayoutRequest
)
router.post(
  '/payout-requests/:id/reject',
  requirePermission('payoutChange.manage'),
  staffPayoutSupport.rejectPayoutRequest
)

// 16. Pesan Bantuan (Support Messages)
// Izin: support.manage (Superadmin & Developer)
router.get(
  '/support',
  requirePermission('support.manage'),
  staffPayoutSupport.getSupportMessages
)
router.post(
  '/support/:id/reply',
  requirePermission('support.manage'),
  staffPayoutSupport.replySupportMessage
)

// 17. Detail Transfer Rekening Penarikan untuk Finance
router.get(
  '/withdrawals/:id/payout-detail',
  requirePermission('withdrawal.approve'),
  staffPayoutSupport.getWithdrawalPayoutDetail
)

// 18. Riwayat & Pengaturan Grup Pembayaran Telegram (@AFBlastPaymentBot)
const adminPaymentGroupController = require('../controllers/adminPaymentGroupController')

router.get(
  '/payment-group/settings',
  requirePermission('paymentGroup.view'),
  adminPaymentGroupController.getSettings
)
router.put(
  '/payment-group/settings',
  requirePermission('paymentGroup.manage'),
  adminPaymentGroupController.updateSettings
)
router.post(
  '/payment-group/test',
  requirePermission('paymentGroup.manage'),
  adminPaymentGroupController.sendTest
)
router.get(
  '/payment-group/notifications',
  requirePermission('paymentGroup.view'),
  adminPaymentGroupController.listNotifications
)
router.post(
  '/payment-group/notifications/:id/retry',
  requirePermission('paymentGroup.manage'),
  adminPaymentGroupController.retryNotification
)

// ==========================================
// SUPER ADMIN PANEL API ENDPOINTS
// ==========================================

// --- B. REALTIME SSE STREAM ---
router.post('/stream/ticket', requirePermission(null), async (req, res) => {
  try {
    const ticket = await createTicket(req.user, req.userPermissions || [])
    return res.status(200).json({ ticket, expiresIn: 30 })
  } catch (error) {
    return res.status(500).json({ error: 'Gagal membuat tiket stream', details: error.message })
  }
})

router.get('/stream', async (req, res) => {
  try {
    const { ticket } = req.query
    if (!ticket) {
      return res.status(401).json({ error: 'Tiket SSE (ticket) wajib disertakan' })
    }
    const clientData = await consumeTicket(ticket)
    if (!clientData) {
      return res.status(403).json({ error: 'Tiket SSE tidak valid atau telah kedaluwarsa' })
    }
    handleStreamConnection(req, res, clientData)
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghubungkan ke SSE stream', details: error.message })
  }
})

// --- C.2 KATEGORI KONTAK ---
router.get('/categories', requirePermission('category.view'), adminCategoryController.listCategories)
router.post('/categories', requirePermission('category.manage'), adminCategoryController.createCategory)
router.get('/categories/:id', requirePermission('category.view'), adminCategoryController.getCategory)
router.patch('/categories/:id', requirePermission('category.manage'), adminCategoryController.updateCategory)
router.put('/categories/:id', requirePermission('category.manage'), adminCategoryController.updateCategory)
router.delete('/categories/:id', requirePermission('category.manage'), adminCategoryController.deleteCategory)

// --- C.3 TARGET KONTAK (Cursor Pagination, Import CSV, Reset Queue, Bulk Delete, Export) ---
router.get('/targets', requirePermission('target.view'), adminTargetController.listTargets)
router.post('/targets', requirePermission('target.manage'), adminTargetController.createTarget)
router.patch('/targets/:id', requirePermission('target.manage'), adminTargetController.updateTarget)
router.delete('/targets/:id', requirePermission('target.manage'), adminTargetController.deleteTarget)
router.post(
  '/targets/import',
  requirePermission('target.manage'),
  adminTargetController.uploadCsv.single('file'),
  adminTargetController.importTargets
)
router.post(
  '/targets/upload-csv',
  requirePermission('target.manage'),
  adminTargetController.uploadCsv.single('file'),
  adminTargetController.importTargets
)
router.post(
  '/targets/upload-txt',
  requirePermission('target.manage'),
  adminTargetController.uploadCsv.single('file'),
  adminTargetController.importTargets
)
router.post(
  '/targets/upload',
  requirePermission('target.manage'),
  adminTargetController.uploadCsv.single('file'),
  adminTargetController.importTargets
)
router.post('/targets/reset-queue', requirePermission('target.manage'), adminTargetController.resetQueue)
router.post('/targets/bulk-delete', requirePermission('target.manage'), adminTargetController.bulkDeleteTargets)
router.get('/targets/export', requirePermission('target.view'), adminTargetController.exportTargets)
router.post(
  '/targets/stats/recalculate',
  requirePermission('target.manage'),
  statsRecalculateLimiter,
  adminTargetController.recalculateStats
)

// --- C.4 TEMPLATE PESAN ---
router.get('/templates', requirePermission('template.view'), adminTemplateController.listTemplates)
router.post(
  '/templates',
  requirePermission('template.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminTemplateController.createTemplate
)
router.get('/templates/:id', requirePermission('template.view'), adminTemplateController.getTemplate)
router.patch(
  '/templates/:id',
  requirePermission('template.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminTemplateController.updateTemplate
)
router.put(
  '/templates/:id',
  requirePermission('template.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminTemplateController.updateTemplate
)
router.delete('/templates/:id', requirePermission('template.manage'), adminTemplateController.deleteTemplate)

// --- C.5 KAMPANYE BLAST ---
router.get('/campaigns', requirePermission('campaign.view'), adminCampaignController.listCampaigns)
router.post(
  '/campaigns',
  requirePermission('campaign.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminCampaignController.createCampaign
)
router.get('/campaigns/:id', requirePermission('campaign.view'), adminCampaignController.getCampaign)
router.patch(
  '/campaigns/:id',
  requirePermission('campaign.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminCampaignController.updateCampaign
)
router.put(
  '/campaigns/:id',
  requirePermission('campaign.manage'),
  adminCampaignController.uploadImageMiddleware,
  adminCampaignController.processImageUpload,
  adminCampaignController.updateCampaign
)
router.delete('/campaigns/:id', requirePermission('campaign.manage'), adminCampaignController.deleteCampaign)
router.post('/campaigns/:id/duplicate', requirePermission('campaign.manage'), adminCampaignController.duplicateCampaign)
router.post('/campaigns/:id/status', requirePermission('campaign.manage'), (req, res) => {
  const action = req.body?.action === 'resume' ? 'start' : (req.body?.action || 'start')
  return adminCampaignController.transitionCampaignStatus(req, res, action)
})
router.post('/campaigns/:id/start', requirePermission('campaign.manage'), adminCampaignController.startCampaign)
router.post('/campaigns/:id/pause', requirePermission('campaign.manage'), adminCampaignController.pauseCampaign)
router.post('/campaigns/:id/draft', requirePermission('campaign.manage'), adminCampaignController.draftCampaign)
router.post('/campaigns/:id/trash', requirePermission('campaign.manage'), adminCampaignController.trashCampaign)
router.post('/campaigns/:id/restore', requirePermission('campaign.manage'), adminCampaignController.restoreCampaign)
router.get('/campaigns/:id/report', requirePermission('campaign.view'), adminCampaignController.getCampaignReport)
router.get('/campaigns/report/export', requirePermission('campaign.view'), adminCampaignController.exportCampaignReport)
router.get('/campaigns/:id/report/export', requirePermission('campaign.view'), adminCampaignController.exportCampaignReport)

// --- C.7 BACKUP & RESTORE (Khusus Superadmin, izin backup.manage) ---
router.post('/backups', requirePermission('backup.manage'), adminBackupController.createBackup)
router.get('/backups', requirePermission('backup.manage'), adminBackupController.listBackups)
router.get('/backups/:id/download', requirePermission('backup.manage'), adminBackupController.downloadBackup)
router.delete('/backups/:id', requirePermission('backup.manage'), adminBackupController.deleteBackup)
router.post('/backups/:id/restore', requirePermission('backup.manage'), adminBackupController.restoreBackup)
router.post('/backups/restore', requirePermission('backup.manage'), adminBackupController.restoreBackup)

// Aliases untuk /backup
router.post('/backup', requirePermission('backup.manage'), adminBackupController.createBackup)
router.get('/backup', requirePermission('backup.manage'), adminBackupController.listBackups)
router.post('/backup/create', requirePermission('backup.manage'), adminBackupController.createBackup)
router.put('/backup/schedule', requirePermission('backup.manage'), async (req, res) => {
  try {
    const { enabled, time, retentionDays } = req.body
    if (enabled !== undefined) {
      await prisma.siteSetting.upsert({
        where: { key: 'backupAutoEnabled' },
        create: { key: 'backupAutoEnabled', value: String(enabled) },
        update: { value: String(enabled) },
      })
    }
    if (time !== undefined) {
      await prisma.siteSetting.upsert({
        where: { key: 'backupScheduleTime' },
        create: { key: 'backupScheduleTime', value: String(time) },
        update: { value: String(time) },
      })
    }
    if (retentionDays !== undefined) {
      await prisma.siteSetting.upsert({
        where: { key: 'backupRetentionDays' },
        create: { key: 'backupRetentionDays', value: String(retentionDays) },
        update: { value: String(retentionDays) },
      })
    }
    return res.json({ message: 'Pengaturan jadwal berhasil disimpan' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})
router.post('/backup/:id/download-ticket', requirePermission('backup.manage'), async (req, res) => {
  const bcrypt = require('bcrypt')
  const { password } = req.body
  const admin = await prisma.user.findUnique({ where: { id: req.user.id } })
  const isMatch = await bcrypt.compare(password, admin.password)
  if (!isMatch) return res.status(403).json({ error: 'Password tidak sesuai' })
  return res.json({ ticket: password })
})
router.get('/backup/:id/download', requirePermission('backup.manage'), (req, res, next) => {
  if (req.query.ticket && !req.query.password) {
    req.query.password = req.query.ticket
  }
  return adminBackupController.downloadBackup(req, res, next)
})
router.delete('/backup/:id', requirePermission('backup.manage'), adminBackupController.deleteBackup)
router.post('/backup/:id/restore', requirePermission('backup.manage'), adminBackupController.restoreBackup)

// --- C.8 ENGINE SETTINGS & MONITORING (Superadmin & Developer) ---
router.get('/engine-settings', requirePermission('setting.view'), adminEngineController.getEngineSettings)
router.put('/engine-settings', requirePermission('setting.manage'), adminEngineController.updateEngineSettings)
router.get('/engine/devices', requirePermission('device.view'), adminEngineController.getEngineDevices)
router.post('/engine/devices/:id/force-stop', requirePermission('device.manage'), adminEngineController.forceStopDevice)

module.exports = router
