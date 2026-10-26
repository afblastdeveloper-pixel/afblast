import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ShieldAlert, Home, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isStaffPath, staffPath } from '../utils/portal'
import LanguageSwitcher from '../components/common/LanguageSwitcher'

export default function ForbiddenPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isStaff = isStaffPath(location.pathname)

  let destination = '/login'
  if (user?.role === 'superadmin' || user?.role === 'admin') destination = staffPath('/superadmin')
  else if (user?.role === 'adminfinance') destination = staffPath('/finance')
  else if (user?.role === 'developer') destination = staffPath('/developer')
  else if (user?.role === 'user') destination = '/app'
  else if (isStaff) destination = staffPath('/login')

  const handleLogout = () => {
    logout()
    navigate(isStaff ? staffPath('/login') : '/login')
  }

  return (
    <div className={`min-h-screen ${isStaff ? 'bg-[#0B1220] text-white' : 'bg-gray-50 text-gray-900'} flex items-center justify-center p-6 relative`}>
      <div className={`absolute top-4 end-4 sm:top-6 sm:end-6 z-10 flex items-center gap-2 ${isStaff ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-gray-200/80'} backdrop-blur-md px-3 py-1.5 rounded-2xl border shadow-xs`}>
        <LanguageSwitcher />
      </div>

      <div className={`text-center max-w-md w-full ${isStaff ? 'bg-slate-900/90 border-slate-800 shadow-2xl' : 'bg-white border-gray-100 shadow-xl shadow-gray-200/50'} p-8 sm:p-10 rounded-3xl border`}>
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-amber-500" />
        </div>

        <p className="text-6xl font-black text-amber-500/20 mb-2 font-mono">
          {t('forbidden.code') || '403'}
        </p>
        <h1 className="text-xl font-bold mb-2">
          {t('forbidden.title') || 'Akses Ditolak'}
        </h1>
        <p className={`text-sm ${isStaff ? 'text-slate-400' : 'text-gray-500'} mb-4`}>
          {t('forbidden.desc') || 'Anda tidak memiliki hak akses untuk membuka halaman ini.'}
        </p>

        {user && (
          <div className={`mb-6 p-2.5 rounded-xl ${isStaff ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-100 text-gray-500'} border text-xs`}>
            <span>{t('forbidden.currentRole') || 'Role Aktif'}: </span>
            <span className={`font-semibold ${isStaff ? 'text-blue-400' : 'text-gray-800'} uppercase tracking-wide`}>
              {user.role} ({user.email})
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={destination}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white
                       text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Home className="w-4 h-4" />
            <span>{t('forbidden.backDashboard') || 'Kembali ke Dashboard'}</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 ${isStaff ? 'bg-slate-800 hover:bg-slate-700 text-red-400 border-slate-700' : 'bg-gray-100 hover:bg-gray-200 text-red-600 border-gray-200'}
                       text-sm font-semibold rounded-xl transition-colors border`}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('forbidden.logout') || 'Keluar'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
