const express = require('express')
const router = express.Router()

const { authenticateToken, requirePermission } = require('../middleware/auth')
const staffManagement = require('../controllers/staffManagementController')
const adminController = require('../controllers/adminController')

// Semua route di /api/admin/* wajib terautentikasi
router.use(authenticateToken)

// --- STAFF MANAGEMENT (Persetujuan & Manajemen Akun Staf) ---
// Hanya Superadmin yang memiliki permission 'staff.approve', 'staff.manage', dll
router.get('/staff', requirePermission('staff.view'), staffManagement.getStaffList)
router.patch('/staff/:id/approve', requirePermission('staff.approve'), staffManagement.approveStaff)
router.patch('/staff/:id/reject', requirePermission('staff.reject'), staffManagement.rejectStaff)
router.patch('/staff/:id/suspend', requirePermission('staff.suspend'), staffManagement.suspendStaff)
router.patch('/staff/:id/role', requirePermission('staff.manage'), staffManagement.changeStaffRole)

// --- WITHDRAWALS (PENARIKAN) ---
// Dapat diakses oleh Superadmin, Admin Finance, Developer (view & action)
router.get('/withdrawals', requirePermission('withdrawal.view'), adminController.getWithdrawals)
router.patch('/withdrawals/:id/approve', requirePermission('withdrawal.approve'), adminController.approveWithdrawal)
router.patch('/withdrawals/:id/reject', requirePermission('withdrawal.reject'), adminController.rejectWithdrawal)

// --- USERS (PENGGUNA) ---
// Hanya Superadmin & Developer (Admin Finance TIDAK punya izin user.*)
router.get('/users', requirePermission('user.view'), adminController.getUsers)
router.post('/users', requirePermission('user.create'), adminController.createUser)
router.patch('/users/:id', requirePermission('user.update'), adminController.updateUser)
router.delete('/users/:id', requirePermission('user.delete'), adminController.deleteUser)

// --- ANNOUNCEMENTS (PENGUMUMAN) ---
router.get('/announcements', requirePermission('announcement.view'), adminController.getAnnouncements)
router.post('/announcements', requirePermission('announcement.manage'), adminController.createAnnouncement)

// --- COMMISSIONS & PLANS ---
router.get('/commissions', requirePermission('commission.view'), adminController.getCommissions)
router.get('/plans', requirePermission('plan.view'), adminController.getPlans)

// --- DASHBOARD ---
router.get('/dashboard', requirePermission('dashboard.view'), adminController.getDashboard)
router.get('/dashboard/finance', requirePermission('dashboard.finance'), adminController.getDashboardFinance)

// --- ACTIVITY LOGS ---
router.get('/logs', requirePermission('log.view'), adminController.getActivityLogs)

module.exports = router
