const express = require('express')
const router = express.Router()
const staffAdminController = require('../controllers/staffAdminController')
const { requirePermission } = require('../middlewares/authMiddleware')

// Semua rute persetujuan staf memerlukan izin staff.approve (hanya superadmin)
router.use(requirePermission('staff.approve'))

// GET /api/admin/staff?status=pending
router.get('/', staffAdminController.listStaff)

// PATCH /api/admin/staff/:id/approve
router.patch('/:id/approve', staffAdminController.approveStaff)

// PATCH /api/admin/staff/:id/reject (alasan wajib)
router.patch('/:id/reject', staffAdminController.rejectStaff)

// PATCH /api/admin/staff/:id/suspend
router.patch('/:id/suspend', staffAdminController.suspendStaff)

// PATCH /api/admin/staff/:id/role (ubah role)
router.patch('/:id/role', staffAdminController.updateStaffRole)

module.exports = router
