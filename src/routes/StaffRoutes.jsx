import { useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useStaffAuth } from '../context/StaffAuthContext'
import { staffPath } from '../utils/portal'

// Layout
import AdminLayout from '../layouts/AdminLayout'

// Staff Auth Pages
import AdminLoginPage from '../pages/admin/AdminLoginPage'
import AdminRegisterPage from '../pages/admin/AdminRegisterPage'

// Shared Admin Pages
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminCampaignsPage from '../pages/admin/AdminCampaignsPage'
import AdminDevicesPage from '../pages/admin/AdminDevicesPage'
import AdminWithdrawalsPage from '../pages/admin/AdminWithdrawalsPage'
import AdminCommissionsPage from '../pages/admin/AdminCommissionsPage'
import AdminPackagesPage from '../pages/admin/AdminPackagesPage'
import AdminAnnouncementsPage from '../pages/admin/AdminAnnouncementsPage'
import AdminTemplatesPage from '../pages/admin/AdminTemplatesPage'
import AdminWebsiteSettingsPage from '../pages/admin/AdminWebsiteSettingsPage'
import AdminIntegrationPage from '../pages/admin/AdminIntegrationPage'
import AdminLogsPage from '../pages/admin/AdminLogsPage'
import AdminProfilePage from '../pages/admin/AdminProfilePage'
import AdminWithdrawSettingsPage from '../pages/admin/AdminWithdrawSettingsPage'
import AdminContactBatchesPage from '../pages/admin/AdminContactBatchesPage'
import AdminTeamPage from '../pages/admin/AdminTeamPage'
import AdminBlastCampaignsPage from '../pages/admin/AdminBlastCampaignsPage'
import AdminProfileRulePage from '../pages/admin/AdminProfileRulePage'
import AdminPaymentGroupPage from '../pages/admin/AdminPaymentGroupPage'
import AdminTargetsPage from '../pages/admin/AdminTargetsPage'
import AdminCategoriesPage from '../pages/admin/AdminCategoriesPage'
import AdminBackupPage from '../pages/admin/AdminBackupPage'

// Role Specific Pages
import AdminStaffApprovalPage from '../pages/admin/AdminStaffApprovalPage'
import FinanceDashboardPage from '../pages/finance/FinanceDashboardPage'
import DevFlagsPage from '../pages/developer/DevFlagsPage'
import DevMenuPage from '../pages/developer/DevMenuPage'
import DevThemePage from '../pages/developer/DevThemePage'
import DevMaintenancePage from '../pages/developer/DevMaintenancePage'
import DevVersionPage from '../pages/developer/DevVersionPage'

// Error Pages
import NotFoundPage from '../pages/NotFoundPage'
import ForbiddenPage from '../pages/ForbiddenPage'

/**
 * Root Redirect untuk Portal Staf ({STAFF_BASE}/)
 * Belum login -> {STAFF_BASE}/login
 * Sudah login -> ke dashboard sesuai role masing-masing
 */
function StaffRootRedirect() {
  const { user, isAuthenticated, loading } = useStaffAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1220] flex items-center justify-center text-blue-500">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={staffPath('/login')} replace />
  }

  if (user.role === 'superadmin' || user.role === 'admin') {
    return <Navigate to={staffPath('/superadmin')} replace />
  }
  if (user.role === 'adminfinance') {
    return <Navigate to={staffPath('/finance')} replace />
  }
  if (user.role === 'developer') {
    return <Navigate to={staffPath('/developer')} replace />
  }

  return <Navigate to={staffPath('/login')} replace />
}

/**
 * Public Auth Route untuk Staf:
 * Mencegah staf yang sudah login membuka form login/register kembali.
 */
function StaffPublicAuthRoute({ children }) {
  const { user, isAuthenticated } = useStaffAuth()

  if (isAuthenticated && user) {
    if (user.role === 'superadmin' || user.role === 'admin') {
      return <Navigate to={staffPath('/superadmin')} replace />
    }
    if (user.role === 'adminfinance') {
      return <Navigate to={staffPath('/finance')} replace />
    }
    if (user.role === 'developer') {
      return <Navigate to={staffPath('/developer')} replace />
    }
  }

  return children
}

/**
 * StaffProtectedRoute:
 * Sesuai aturan keamanan:
 * 1. Tanpa sesi staf: seluruh rute dashboard (superadmin, finance, developer) menampilkan
 *    halaman 404 yang SAMA dengan 404 member (jangan redirect, agar keberadaan panel tidak terbuka).
 * 2. Sesi staf valid tetapi role/permission salah: menampilkan 403 Forbidden.
 */
function StaffProtectedRoute({ role, roles, permission, children }) {
  const { user, isAuthenticated, loading, hasPermission } = useStaffAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1220] flex items-center justify-center text-blue-500">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Tanpa sesi staf: Tampilkan 404 Not Found persis seperti 404 member (anti-reconnaissance)
  if (!isAuthenticated || !user) {
    return <NotFoundPage />
  }

  // Role salah: Tampilkan 403 Forbidden
  const allowedRoles = roles || (role ? [role] : null)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <ForbiddenPage />
  }

  // Permission tidak cukup: Tampilkan 403 Forbidden
  if (permission && !hasPermission(permission)) {
    return <ForbiddenPage />
  }

  return children ? children : <Outlet />
}

/**
 * StaffRoutes – Bundel rute area staf (dimuat via React.lazy ke chunk "staff")
 * Mengatur:
 * - `<meta name="robots" content="noindex,nofollow">`
 * - Judul tab "Portal Staf - AF Blast"
 * - Tema gelap & label "Portal Staf"
 */
export default function StaffRoutes() {
  // Atur meta robots dan judul tab khusus area staf
  useEffect(() => {
    const originalTitle = document.title
    document.title = 'Portal Staf - AF Blast'

    let metaRobots = document.querySelector('meta[name="robots"]')
    let created = false
    if (!metaRobots) {
      metaRobots = document.createElement('meta')
      metaRobots.setAttribute('name', 'robots')
      document.head.appendChild(metaRobots)
      created = true
    }
    const previousContent = metaRobots.getAttribute('content')
    metaRobots.setAttribute('content', 'noindex,nofollow')

    return () => {
      document.title = originalTitle || 'AF Blast'
      if (created) {
        metaRobots?.remove()
      } else if (previousContent) {
        metaRobots?.setAttribute('content', previousContent)
      } else {
        metaRobots?.removeAttribute('content')
      }
    }
  }, [])

  return (
    <div className="dark bg-[#0B1220] min-h-screen text-slate-100">
      <Routes>
        {/* Rute Akar Staf ({STAFF_BASE}) */}
        <Route index element={<StaffRootRedirect />} />

        {/* Rute Autentikasi Staf */}
        <Route
          path="login"
          element={(
            <StaffPublicAuthRoute>
              <AdminLoginPage />
            </StaffPublicAuthRoute>
          )}
        />
        <Route
          path="admin/login"
          element={<Navigate to={staffPath('/login')} replace />}
        />
        <Route
          path="register"
          element={(
            <StaffPublicAuthRoute>
              <AdminRegisterPage />
            </StaffPublicAuthRoute>
          )}
        />

        {/* 1. SUPER ADMIN DASHBOARD (superadmin/*) */}
        <Route element={<StaffProtectedRoute roles={['superadmin', 'admin']} />}>
          <Route path="superadmin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="staff" element={<AdminStaffApprovalPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="targets" element={<AdminTargetsPage />} />
            <Route path="contact-batches" element={<AdminTargetsPage />} />
            <Route path="campaigns" element={<AdminCampaignsPage />} />
            <Route path="blast-campaigns" element={<AdminCampaignsPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="templates" element={<AdminTemplatesPage />} />
            <Route path="backup" element={<AdminBackupPage />} />
            <Route path="settings" element={<AdminWebsiteSettingsPage />} />
            <Route path="devices" element={<AdminDevicesPage />} />
            <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="commissions" element={<AdminCommissionsPage />} />
            <Route path="packages" element={<AdminPackagesPage />} />
            <Route path="announcements" element={<AdminAnnouncementsPage />} />
            <Route path="withdraw-settings" element={<AdminWithdrawSettingsPage />} />
            <Route path="team" element={<AdminTeamPage />} />
            <Route path="profile-rule" element={<AdminProfileRulePage />} />
            <Route path="payment-group" element={<AdminPaymentGroupPage />} />
            <Route path="integration" element={<AdminIntegrationPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="profile" element={<AdminProfilePage />} />
          </Route>
        </Route>

        {/* 2. ADMIN FINANCE DASHBOARD (finance/*) */}
        <Route element={<StaffProtectedRoute role="adminfinance" />}>
          <Route path="finance" element={<AdminLayout />}>
            <Route index element={<FinanceDashboardPage />} />
            <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="commissions" element={<AdminCommissionsPage />} />
            <Route path="packages" element={<AdminPackagesPage />} />
            <Route path="withdraw-settings" element={<AdminWithdrawSettingsPage />} />
            <Route path="payment-group" element={<AdminPaymentGroupPage />} />
          </Route>
        </Route>

        {/* 3. DEVELOPER DASHBOARD (developer/*) */}
        <Route element={<StaffProtectedRoute role="developer" />}>
          <Route path="developer" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="flags" element={<DevFlagsPage />} />
            <Route path="menu" element={<DevMenuPage />} />
            <Route path="theme" element={<DevThemePage />} />
            <Route path="maintenance" element={<DevMaintenancePage />} />
            <Route path="version" element={<DevVersionPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="campaigns" element={<AdminCampaignsPage />} />
            <Route path="devices" element={<AdminDevicesPage />} />
            <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="commissions" element={<AdminCommissionsPage />} />
            <Route path="packages" element={<AdminPackagesPage />} />
            <Route path="announcements" element={<AdminAnnouncementsPage />} />
            <Route path="templates" element={<AdminTemplatesPage />} />
            <Route path="contact-batches" element={<AdminContactBatchesPage />} />
            <Route path="team" element={<AdminTeamPage />} />
            <Route path="blast-campaigns" element={<AdminBlastCampaignsPage />} />
            <Route path="profile-rule" element={<AdminProfileRulePage />} />
            <Route path="payment-group" element={<AdminPaymentGroupPage />} />
            <Route path="settings" element={<AdminWebsiteSettingsPage />} />
            <Route path="integration" element={<AdminIntegrationPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="profile" element={<AdminProfilePage />} />
          </Route>
        </Route>

        {/* Halaman Otorisasi 403 & 404 di area staf */}
        <Route path="403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  )
}
