/**
 * AF Blast Staff Role Permission Matrix
 *
 * Rules:
 * - superadmin: semua kecuali dev.*
 * - adminfinance: dashboard.finance, withdrawal.view, withdrawal.approve, withdrawal.reject, commission.view, plan.view, withdrawPreset.manage, withdrawSetting.manage
 * - developer: semua izin superadmin kecuali staff.approve, withdrawPreset.manage, withdrawSetting.manage, ditambah dev.flags, dev.menu, dev.theme, dev.maintenance, dev.version, contactPool.manage, team.manage
 * - user: regular user, tidak memiliki akses staf
 */

const ALL_PERMISSIONS = [
  // Dashboard
  'dashboard.view',
  'dashboard.finance',

  // Withdrawals (Penarikan)
  'withdrawal.view',
  'withdrawal.approve',
  'withdrawal.reject',

  // Withdrawal Presets & Settings (Khusus Superadmin & Adminfinance)
  'withdrawPreset.manage',
  'withdrawSetting.manage',

  // Contact Pool & Batches (Superadmin & Developer)
  'contactPool.manage',

  // Team Management (Superadmin & Developer)
  'team.manage',

  // Commissions
  'commission.view',
  'commission.manage',

  // Plans / Packages
  'plan.view',
  'plan.manage',

  // Users (Pengguna)
  'user.view',
  'user.manage',
  'user.create',
  'user.update',
  'user.delete',

  // Announcements (Pengumuman)
  'announcement.view',
  'announcement.manage',

  // Staff Management
  'staff.view',
  'staff.approve',
  'staff.reject',
  'staff.suspend',
  'staff.manage',

  // Campaigns & Templates
  'campaign.view',
  'campaign.manage',
  'blastCampaign.manage',
  'profileRule.manage',
  'template.view',
  'template.manage',

  // Devices & Integrations
  'device.view',
  'device.manage',

  // Logs & Settings
  'log.view',
  'setting.view',
  'setting.manage',

  // Payout Change Requests & Support
  'payoutChange.manage',
  'support.manage',

  // Telegram Payment Group Notifications (Grup Pembayaran)
  'paymentGroup.view',
  'paymentGroup.manage',

  // Target & Category Management (Superadmin & Developer)
  'target.view',
  'target.manage',
  'category.view',
  'category.manage',

  // Backup Management (Khusus Superadmin)
  'backup.manage',

  // Developer specific permissions (dev.*)
  'dev.flags',
  'dev.menu',
  'dev.theme',
  'dev.maintenance',
  'dev.version',
]

const DEV_PERMISSIONS = [
  'dev.flags',
  'dev.menu',
  'dev.theme',
  'dev.maintenance',
  'dev.version',
]

// Superadmin: semua kecuali dev.*
const SUPERADMIN_PERMISSIONS = ALL_PERMISSIONS.filter((perm) => !perm.startsWith('dev.'))

// Admin Finance: dashboard.finance, withdrawal.view, withdrawal.approve, withdrawal.reject, commission.view, plan.view, withdrawPreset.manage, withdrawSetting.manage, payoutChange.manage, paymentGroup.view, paymentGroup.manage
const ADMINFINANCE_PERMISSIONS = [
  'dashboard.finance',
  'withdrawal.view',
  'withdrawal.approve',
  'withdrawal.reject',
  'commission.view',
  'plan.view',
  'withdrawPreset.manage',
  'withdrawSetting.manage',
  'payoutChange.manage',
  'paymentGroup.view',
  'paymentGroup.manage',
]

// Developer: semua izin superadmin kecuali staff.approve, withdrawPreset.manage, withdrawSetting.manage, payoutChange.manage, paymentGroup.manage, backup.manage, ditambah dev.*
const DEVELOPER_PERMISSIONS = [
  ...SUPERADMIN_PERMISSIONS.filter(
    (perm) =>
      perm !== 'staff.approve' &&
      perm !== 'withdrawPreset.manage' &&
      perm !== 'withdrawSetting.manage' &&
      perm !== 'payoutChange.manage' &&
      perm !== 'paymentGroup.manage' &&
      perm !== 'backup.manage'
  ),
  ...DEV_PERMISSIONS,
]

const ROLE_PERMISSIONS = {
  superadmin: SUPERADMIN_PERMISSIONS,
  adminfinance: ADMINFINANCE_PERMISSIONS,
  developer: DEVELOPER_PERMISSIONS,
  user: [],
}

/**
 * Dapatkan daftar permissions berdasarkan role
 * @param {string} role
 * @returns {string[]}
 */
function getPermissionsForRole(role) {
  if (!role || !ROLE_PERMISSIONS[role]) {
    return []
  }
  return [...ROLE_PERMISSIONS[role]]
}

/**
 * Cek apakah permission tertentu dimiliki oleh role atau daftar permission
 * @param {string|string[]} roleOrPerms
 * @param {string} requiredPerm
 * @returns {boolean}
 */
function hasPermission(roleOrPerms, requiredPerm) {
  if (!requiredPerm) return true

  let perms = []
  if (Array.isArray(roleOrPerms)) {
    perms = roleOrPerms
  } else if (typeof roleOrPerms === 'string') {
    perms = getPermissionsForRole(roleOrPerms)
  }

  // Jika cek prefix wildcard seperti 'dev.*'
  if (requiredPerm.endsWith('.*')) {
    const prefix = requiredPerm.slice(0, -1)
    return perms.some((p) => p.startsWith(prefix))
  }

  return perms.includes(requiredPerm)
}

module.exports = {
  ALL_PERMISSIONS,
  DEV_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSIONS: ROLE_PERMISSIONS,
  getPermissionsForRole,
  getPermissionsByRole: getPermissionsForRole,
  hasPermission,
}
