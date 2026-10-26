import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Send, Smartphone, Settings, X,
  LogOut, DollarSign, History
} from 'lucide-react'
import { NAV_MENU, APP_VERSION } from '../../utils/constants'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../config/brand'
import logoAfIcon from '../../assets/brand/Logo-AF.jpeg'

// Map icon string ke komponen Lucide
const ICON_MAP = {
  LayoutDashboard,
  Users,
  FileText,
  Send,
  Smartphone,
  Settings,
  DollarSign,
  History,
}

/**
 * Sidebar Pengguna – tampil fixed di desktop, drawer di mobile.
 * Mendukung RTL penuh untuk bahasa Arab.
 * Menampilkan nama/email pengguna aktif dan tombol Logout.
 *
 * @param {boolean} isOpen   - Status drawer mobile
 * @param {function} onClose - Callback tutup drawer
 */
export default function Sidebar({ isOpen, onClose }) {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'

  const handleLogout = () => {
    logout()
    onClose?.()
    navigate('/login')
  }

  // Hitung class translate berdasarkan state + RTL
  const translateClass = isOpen
    ? 'translate-x-0'
    : isRTL
      ? 'translate-x-full'
      : '-translate-x-full'

  // Posisi sidebar: kiri (LTR) atau kanan (RTL)
  const positionClass = isRTL ? 'right-0' : 'left-0'

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'M'

  return (
    <>
      {/* ===== OVERLAY – hanya di mobile saat drawer terbuka ===== */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ===== SIDEBAR ELEMENT ===== */}
      <aside
        id="sidebar"
        aria-label={t('nav.dashboard')}
        className={[
          'fixed top-0 z-50 h-full w-64 flex flex-col',
          positionClass,
          'bg-white border-e border-gray-200',
          'sidebar-drawer',
          translateClass,
          'lg:translate-x-0',
          'lg:z-30 lg:shadow-none',
          'shadow-2xl lg:shadow-none',
        ].join(' ')}
      >
        {/* ===== LOGO / HEADER ===== */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img
              src={logoAfIcon}
              alt={BRAND.name}
              className="w-9 h-9 rounded-xl object-contain flex-shrink-0 shadow-sm border border-slate-200/60"
            />
            <span className="text-xl font-bold text-gray-900 tracking-tight">
              {BRAND.name}
            </span>
          </div>
          {/* Tombol X – hanya di mobile */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label={t('topbar.closeMenu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===== MENU NAVIGASI ===== */}
        <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label={t('nav.dashboard')}>
          <ul className="space-y-0.5" role="list">
            {NAV_MENU.map((item) => {
              const IconComp = ICON_MAP[item.icon]
              return (
                <li key={item.key}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/app'}
                    onClick={onClose}
                    className={({ isActive }) => [
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                      'transition-all duration-150 group min-h-[40px]',
                      isActive
                        ? 'bg-blue-50 text-primary font-semibold shadow-xs'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    ].join(' ')}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={[
                          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                          isActive
                            ? 'bg-blue-100/80 text-primary'
                            : 'text-gray-400 group-hover:text-gray-600 group-hover:bg-gray-100',
                        ].join(' ')}>
                          {IconComp && <IconComp className="w-4 h-4" />}
                        </span>
                        <span className="flex-1 text-start">{t(item.labelKey)}</span>
                        {/* Titik indikator aktif */}
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" aria-hidden="true" />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ===== FOOTER SIDEBAR DENGAN INFO USER & TOMBOL LOGOUT ===== */}
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center flex-shrink-0 shadow-xs">
              <span className="text-white text-xs font-semibold">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {user?.name || 'Member AF Blast'}
                </p>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-primary rounded-md uppercase tracking-wider flex-shrink-0">
                  Anggota
                </span>
              </div>
              <p className="text-xs text-gray-400 truncate">
                {user?.username ? `@${user.username}` : user?.email || '@member'}
              </p>
            </div>
            {/* Akses Pengaturan Akun dari Profil Footer */}
            <NavLink
              to="/app/settings"
              onClick={onClose}
              title={t('nav.settings') || 'Pengaturan Akun'}
              aria-label={t('nav.settings') || 'Pengaturan Akun'}
              className={({ isActive }) => [
                'p-2 rounded-xl transition-all duration-150 flex-shrink-0 group',
                isActive
                  ? 'bg-blue-100 text-primary shadow-xs'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200/70',
              ].join(' ')}
            >
              <Settings className="w-4 h-4 transition-transform group-hover:rotate-45" />
            </NavLink>
          </div>

          {/* Tombol Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold
                       text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200
                       rounded-xl transition-colors border border-red-100"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('auth.logout')}</span>
          </button>

          <p className="mt-2 text-[10px] text-gray-400 text-center">
            {BRAND.name} v{APP_VERSION}
          </p>
        </div>
      </aside>
    </>
  )
}
