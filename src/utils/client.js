import { isStaffPath } from './portal'

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim()
export const API_BASE_URL = RAW_API_URL.replace(/\/+$/, '')

export const TOKEN_KEYS = {
  member: 'afblast.member.token',
  staff: 'afblast.staff.token',
}

export const AUTH_KEYS = {
  member: 'afblast.member.auth',
  staff: 'afblast.staff.auth',
}

export const PERMISSION_KEYS = {
  staff: 'afblast.staff.permissions',
}

/**
 * Mendapatkan kunci token yang sesuai dengan endpoint atau area path aktif
 * @param {string} [endpoint=''] - Endpoint yang dipanggil
 * @returns {string}
 */
export function getActiveTokenKey(endpoint = '') {
  const cleanEndpoint = String(endpoint || '').toLowerCase()
  if (
    cleanEndpoint.startsWith('/api/staff') ||
    cleanEndpoint.startsWith('/api/admin') ||
    cleanEndpoint.startsWith('/api/dev')
  ) {
    return TOKEN_KEYS.staff
  }
  if (
    cleanEndpoint.startsWith('/api/auth') ||
    cleanEndpoint.startsWith('/api/member')
  ) {
    return TOKEN_KEYS.member
  }
  return isStaffPath(typeof window !== 'undefined' ? window.location.pathname : '')
    ? TOKEN_KEYS.staff
    : TOKEN_KEYS.member
}

/**
 * Mendapatkan token aktif dari localStorage sesuai endpoint atau area
 * @param {string} [endpoint=''] - Endpoint API
 * @returns {string|null}
 */
export function getActiveToken(endpoint = '') {
  try {
    return localStorage.getItem(getActiveTokenKey(endpoint)) || null
  } catch {
    return null
  }
}

/**
 * Membentuk URL lengkap berdasarkan VITE_API_URL.
 * Mendukung URL absolut (http://localhost:4000) dan path relatif ('/api' atau '').
 * Menghindari duplikasi '/api/api' jika VITE_API_URL='/api'.
 * @param {string} endpoint - Path endpoint (misal: '/api/staff/login')
 * @returns {string}
 */
export function buildApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (!API_BASE_URL) return cleanEndpoint

  // Jika API_BASE_URL relatif (misal '/api')
  if (API_BASE_URL.startsWith('/')) {
    if (cleanEndpoint.startsWith(API_BASE_URL)) {
      return cleanEndpoint
    }
    return `${API_BASE_URL}${cleanEndpoint}`
  }

  // Jika API_BASE_URL absolut (misal 'http://localhost:4000')
  return `${API_BASE_URL}${cleanEndpoint}`
}

/**
 * Client HTTP yang otomatis memilih token sesuai target endpoint / portal aktif
 * dan memakai VITE_API_URL yang mendukung absolut & relatif.
 * @param {string} endpoint - Path endpoint API
 * @param {RequestInit} [options={}] - Opsi fetch
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = buildApiUrl(endpoint)
  const token = getActiveToken(endpoint)

  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

export default {
  getActiveTokenKey,
  getActiveToken,
  buildApiUrl,
  apiFetch,
  TOKEN_KEYS,
  AUTH_KEYS,
  PERMISSION_KEYS,
}
