import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { useMemberAuth } from '../context/MemberAuthContext'
import { STAFF_BASE, isStaffPath } from '../utils/portal'

// Member Layout & Components
import UserLayout from '../layouts/UserLayout'
import IntroSplash from '../components/intro/IntroSplash'
import { useIntro } from '../hooks/useIntro'

// Member Auth Pages (dimuat langsung, non-lazy)
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage'

// User Area Pages (/app/*) (dimuat langsung)
import UserDashboardPage from '../pages/user/DashboardPage'
import UserWhatsAppPage from '../pages/user/WhatsAppPage'
import EarningsPage from '../pages/user/EarningsPage'
import UserTeamPage from '../pages/user/TeamPage'
import UserSettingsPage from '../pages/user/SettingsPage'

// Global 404 Page
import NotFoundPage from '../pages/NotFoundPage'

// Area Staf dimuat secara lazy dalam chunk terpisah ("staff")
const StaffRoutes = lazy(() => import('./StaffRoutes'))

/**
 * Loading fallback minimalis untuk chunk staf
 */
function StaffLoadingFallback() {
  return (
    <div className="min-h-screen bg-[#0B1220] flex items-center justify-center text-blue-500">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * Root Redirect untuk Portal Member (/)
 */
function MemberRootRedirect() {
  const { isAuthenticated, user } = useMemberAuth()
  if (isAuthenticated && user?.role === 'user') {
    return <Navigate to="/app" replace />
  }
  return <Navigate to="/login" replace />
}

/**
 * Public Auth Route Member: Cegah member yang sudah login masuk kembali ke /login atau /register
 */
function MemberPublicAuthRoute({ children }) {
  const { isAuthenticated, user } = useMemberAuth()
  if (isAuthenticated && user?.role === 'user') {
    return <Navigate to="/app" replace />
  }
  return children
}

/**
 * ProtectedRoute khusus Member (/app/*)
 */
function MemberProtectedRoute({ children }) {
  const { isAuthenticated, user, loading } = useMemberAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-emerald-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !user || user.role !== 'user') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children ? children : <Outlet />
}

/**
 * CombinedRouter – Router tunggal terpadu untuk Member dan Staf di satu domain.
 * - Rute Member dimuat biasa (cepat & ringan).
 * - Rute Staf dimuat dengan React.lazy + Suspense di bawah awalan STAFF_BASE (default /staff/*).
 * - Intro splash HANYA aktif di area member.
 */
export default function CombinedRouter() {
  const location = useLocation()
  const isStaff = isStaffPath(location.pathname)
  const { shouldShow, isFading, finishIntro } = useIntro()

  // Intro Splash HANYA untuk halaman member, tidak boleh pernah tampil di area staf
  const showIntroComponent = !isStaff && shouldShow

  return (
    <>
      {showIntroComponent && (
        <IntroSplash onFinish={finishIntro} isFading={isFading} />
      )}
      <Routes>
        {/* Rute Beranda Member */}
        <Route path="/" element={<MemberRootRedirect />} />

        {/* Rute Autentikasi Member */}
        <Route
          path="/login"
          element={(
            <MemberPublicAuthRoute>
              <LoginPage />
            </MemberPublicAuthRoute>
          )}
        />
        <Route
          path="/register"
          element={<RegisterPage />}
        />
        <Route
          path="/forgot-password"
          element={(
            <MemberPublicAuthRoute>
              <ForgotPasswordPage />
            </MemberPublicAuthRoute>
          )}
        />
        <Route
          path="/reset-password"
          element={<Navigate to="/forgot-password" replace />}
        />

        {/* Area Member (/app/*) */}
        <Route element={<MemberProtectedRoute />}>
          <Route path="/app" element={<UserLayout />}>
            <Route index element={<UserDashboardPage />} />
            <Route path="whatsapp" element={<UserWhatsAppPage />} />
            <Route path="earnings" element={<EarningsPage />} />
            <Route path="team" element={<UserTeamPage />} />
            <Route path="settings" element={<UserSettingsPage />} />
            <Route path="withdrawals" element={<Navigate to="/app/earnings" replace />} />
          </Route>
        </Route>

        {/* Area Staf ({STAFF_BASE}/*) - Lazy Loaded ke chunk "staff" */}
        <Route
          path={`${STAFF_BASE}/*`}
          element={(
            <Suspense fallback={<StaffLoadingFallback />}>
              <StaffRoutes />
            </Suspense>
          )}
        />

        {/* 404 Fallback Global */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
