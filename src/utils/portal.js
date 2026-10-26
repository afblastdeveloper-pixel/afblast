/**
 * Utility pendeteksi portal dan path AF Blast berbasis Path (Single Domain).
 * Seluruh area staf berada di bawah awalan STAFF_BASE (default "/staff").
 * Membaca konfigurasi dari environment variable (VITE_STAFF_BASE).
 */

// Validasi VITE_STAFF_BASE: diawali "/", tanpa "/" di akhir, huruf kecil/angka/strip
function sanitizeStaffBase(raw) {
  if (!raw || typeof raw !== 'string') return '/staff'
  const trimmed = raw.trim().toLowerCase()
  if (/^\/[a-z0-9-]+$/.test(trimmed)) {
    return trimmed
  }
  return '/staff'
}

export const STAFF_BASE = sanitizeStaffBase(
  (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env.VITE_STAFF_BASE
    : (typeof process !== 'undefined' ? process.env?.VITE_STAFF_BASE : '/staff')
)

/**
 * Membentuk path lengkap untuk area staf.
 * Contoh: staffPath('/login') => '/staff/login'
 *         staffPath('/superadmin') => '/staff/superadmin'
 * @param {string} [subPath=''] - Sub-path staf (opsional)
 * @returns {string}
 */
export function staffPath(subPath = '') {
  if (!subPath || subPath === '/' || subPath === '') {
    return STAFF_BASE
  }
  const clean = subPath.startsWith('/') ? subPath : `/${subPath}`
  return `${STAFF_BASE}${clean}`
}

/**
 * Mengecek apakah suatu path (atau pathname aktif di browser) termasuk area staf
 * @param {string} [path] - Path yang ingin dicek. Jika kosong, membaca window.location.pathname.
 * @returns {boolean}
 */
export function isStaffPath(path) {
  const currentPath = typeof path === 'string'
    ? path.toLowerCase()
    : (typeof window !== 'undefined' ? (window.location.pathname || '').toLowerCase() : '')

  return currentPath === STAFF_BASE || currentPath.startsWith(`${STAFF_BASE}/`)
}

/**
 * Mengecek apakah suatu path adalah area member
 * @param {string} [path]
 * @returns {boolean}
 */
export const isMemberPath = (path) => !isStaffPath(path)

/**
 * Aliases kompatibilitas
 */
export const isStaffPortal = (path) => isStaffPath(path)
export const isMemberPortal = (path) => !isStaffPath(path)
export const getPortal = (path) => (isStaffPath(path) ? 'staff' : 'member')

export default {
  STAFF_BASE,
  staffPath,
  isStaffPath,
  isMemberPath,
  isStaffPortal,
  isMemberPortal,
  getPortal,
}
