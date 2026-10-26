import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isStaffPath } from '../utils/portal'
import NotFoundPage from '../pages/NotFoundPage'
import ForbiddenPage from '../pages/ForbiddenPage'

/**
 * ProtectedRoute – Melindungi rute berdasarkan autentikasi, role server, dan permission.
 *
 * Aturan Keamanan Single Domain:
 * 1. Di area staf (STAFF_BASE):
 *    - Jika tanpa sesi staf: tampilkan 404 Not Found (sama dengan 404 member, tanpa redirect)
 *    - Jika role/permission salah: tampilkan 403 Forbidden
 * 2. Di area member:
 *    - Jika tanpa sesi: redirect ke /login
 *    - Jika role bukan user: redirect ke /login
 */
export default function ProtectedRoute({ role, roles, permission, children }) {
  const { user, isAuthenticated, loading, hasPermission } = useAuth()
  const location = useLocation()
  const isStaff = isStaffPath(location.pathname)

  // Tunggu inisialisasi sesi awal
  if (loading) {
    return (
      <div className={`min-h-screen ${isStaff ? 'bg-[#0B1220] text-blue-500' : 'bg-slate-900 text-emerald-400'} flex items-center justify-center`}>
        <div className={`w-8 h-8 border-2 ${isStaff ? 'border-blue-500' : 'border-emerald-500'} border-t-transparent rounded-full animate-spin`} />
      </div>
    )
  }

  // Belum login
  if (!isAuthenticated || !user) {
    if (isStaff) {
      // Area staf tanpa sesi: Jangan redirect! Tampilkan 404 yang SAMA dengan 404 member
      return <NotFoundPage />
    }
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Validasi Role
  const allowedRoles = roles || (role ? [role] : null)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <ForbiddenPage />
  }

  // Validasi Permission jika ditentukan
  if (permission && !hasPermission(permission)) {
    return <ForbiddenPage />
  }

  return children ? children : <Outlet />
}
