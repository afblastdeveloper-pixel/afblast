import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isStaffPath, staffPath } from '../utils/portal'
import LanguageSwitcher from '../components/common/LanguageSwitcher'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const isStaff = isStaffPath(location.pathname)

  // Tentukan destinasi aman:
  // Tanpa sesi: SELALU ke /login member (anti-reconnaissance, tidak membocorkan keberadaan area staf)
  let destination = '/login'
  if (user && user.role === 'user') {
    destination = '/app'
  } else if (user && isStaff) {
    if (user.role === 'superadmin' || user.role === 'admin') destination = staffPath('/superadmin')
    else if (user.role === 'adminfinance') destination = staffPath('/finance')
    else if (user.role === 'developer') destination = staffPath('/developer')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 relative">
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-gray-200/80 shadow-xs">
        <LanguageSwitcher />
      </div>

      <div className="text-center max-w-sm w-full bg-white p-8 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50">
        <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-400" />
        </div>
        <p className="text-6xl font-black text-gray-200 mb-2 font-mono">404</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('pages.notFound')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('pages.notFoundDesc')}</p>
        <Link
          to={destination}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 text-white
                     text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors
                     shadow-sm shadow-green-200 w-full sm:w-auto"
        >
          <Home className="w-4 h-4" />
          <span>{t('pages.backHome')}</span>
        </Link>
      </div>
    </div>
  )
}
