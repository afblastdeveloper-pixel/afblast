import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import {
  Menu, Search, Bell, User, Settings,
  LogOut, CheckCircle2, AlertTriangle
} from 'lucide-react'
import RealtimeClock from '../common/RealtimeClock'
import TimezoneSelect from '../common/TimezoneSelect'
import LanguageSwitcher from '../common/LanguageSwitcher'
import AnnouncementTicker from '../common/AnnouncementTicker'
import ThemeToggle from '../ui/ThemeToggle'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { LS_TZ_KEY, ANNOUNCEMENTS } from '../../utils/constants'
import { useAuth } from '../../context/AuthContext'
import { useAdminStream } from '../../hooks/useAdminStream'
import { staffPath } from '../../utils/portal'

/**
 * AdminTopbar – Topbar Admin yang kaya fitur:
 * - Search global
 * - Indikator SSE Realtime ("Live" / "Terputus")
 * - Notifikasi admin interaktif
 * - Menu profil dropdown
 * - Running announcement ticker
 * - Jam real-time & pemilih zona waktu
 * - Pemilih 6 bahasa
 * - ThemeToggle (Terang/Gelap/Sistem)
 */
export default function AdminTopbar({ isSidebarOpen, onMenuToggle }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { isConnected, reconnect } = useAdminStream()
  const navigate = useNavigate()
  const [timezone, setTimezone] = useLocalStorage(LS_TZ_KEY, null)

  // State dropdown
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [unreadNotifications, setUnreadNotifications] = useState([
    {
      id: 1,
      title: 'Permohonan Penarikan Baru',
      desc: 'Budi Pratama mengajukan penarikan Rp500.000 via BCA',
      time: '10 menit yang lalu',
      type: 'warning',
      unread: true,
      link: staffPath('/superadmin/withdrawals'),
    },
    {
      id: 2,
      title: 'Pengguna Baru Terdaftar',
      desc: 'Putri Ayu mendaftar paket Starter',
      time: '1 jam yang lalu',
      type: 'info',
      unread: true,
      link: staffPath('/superadmin/users'),
    },
    {
      id: 3,
      title: 'Gateway Node Tersambung',
      desc: 'Node Singapore berhasil sinkronisasi 99.98% uptime',
      time: '3 jam yang lalu',
      type: 'success',
      unread: false,
      link: staffPath('/superadmin/integration'),
    },
  ])

  const notifRef = useRef(null)
  const profileRef = useRef(null)

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const rolePrefix = user?.role === 'superadmin'
    ? staffPath('/superadmin')
    : user?.role === 'developer'
    ? staffPath('/developer')
    : user?.role === 'adminfinance'
    ? staffPath('/finance')
    : staffPath('/superadmin')

  const handleLogout = () => {
    logout()
    navigate(staffPath('/login'))
  }

  const markAllRead = () => {
    setUnreadNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  const unreadCount = unreadNotifications.filter((n) => n.unread).length

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`${rolePrefix}/users?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <header
      className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-border shadow-2xs"
      role="banner"
    >
      {/* Baris Utama Topbar */}
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 gap-3">
        {/* Sisi Kiri: Hamburger toggle + Global Search */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={onMenuToggle}
            className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-2
                       transition-colors flex-shrink-0 min-w-[40px] min-h-[40px]
                       flex items-center justify-center lg:hidden focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={isSidebarOpen ? t('topbar.closeMenu') : t('topbar.openMenu')}
            aria-expanded={isSidebarOpen}
            aria-controls="admin-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Global Search Input */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative hidden md:block max-w-xs xl:max-w-md w-full"
          >
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('adminTopbar.searchPlaceholder')}
              className="w-full ps-9 pe-4 py-2 text-xs sm:text-sm bg-surface-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text placeholder:text-muted"
            />
          </form>
        </div>

        {/* Sisi Kanan: Clock, Timezone, Language, ThemeToggle, Notifications, Admin Profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Jam real-time */}
          <div className="hidden xl:block">
            <RealtimeClock timezone={timezone} />
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border hidden xl:block" />

          {/* Timezone selector */}
          <div className="hidden lg:block">
            <TimezoneSelect value={timezone} onChange={setTimezone} />
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border hidden lg:block" />

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Indikator SSE Realtime */}
          <button
            type="button"
            onClick={!isConnected ? reconnect : undefined}
            className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 cursor-default'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer'
            }`}
            title={
              isConnected
                ? 'Event Stream Realtime Terhubung (SSE Aktif)'
                : 'Event Stream Terputus (Polling Fallback Aktif 15s) - Klik untuk menghubungkan ulang'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="hidden xs:inline">
              {isConnected ? t('adminTopbar.live', 'Live') : t('adminTopbar.disconnected', 'Terputus')}
            </span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Theme Toggle (Terang / Gelap / Sistem) */}
          <ThemeToggle />

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Notifikasi Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative p-2 rounded-xl text-muted hover:text-text hover:bg-surface-2 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label={t('adminTopbar.notifications')}
              aria-expanded={showNotifications}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 end-1.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotifications && (
              <div
                className="absolute end-0 mt-2 w-80 sm:w-96 bg-surface rounded-2xl shadow-xl border border-border py-3 z-50 animate-[fadeIn_0.15s_ease-out]"
                role="menu"
              >
                <div className="flex items-center justify-between px-4 pb-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text text-sm">
                      {t('adminTopbar.notifications')}
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-soft text-primary-text">
                        {unreadCount} baru
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      {t('adminTopbar.markAllRead')}
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
                  {unreadNotifications.length === 0 ? (
                    <p className="p-4 text-xs text-muted text-center">
                      {t('adminTopbar.noNotifications')}
                    </p>
                  ) : (
                    unreadNotifications.map((notif) => (
                      <Link
                        key={notif.id}
                        to={notif.link}
                        onClick={() => setShowNotifications(false)}
                        className={`flex items-start gap-3 p-3.5 hover:bg-surface-2 transition-colors ${
                          notif.unread ? 'bg-primary-soft/30' : ''
                        }`}
                      >
                        <div className="p-1.5 rounded-xl bg-surface-2 text-muted flex-shrink-0 mt-0.5 border border-border/50">
                          {notif.type === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-warning" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text">
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5 line-clamp-2">
                            {notif.desc}
                          </p>
                          <span className="text-[10px] text-muted/70 mt-1 block">
                            {notif.time}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profil Admin Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu((v) => !v)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-surface-2 transition-colors"
              aria-label="Admin Profile Menu"
              aria-expanded={showProfileMenu}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 shadow-xs">
                <span className="text-white text-xs font-bold">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
                </span>
              </div>
              <div className="hidden sm:block text-start pe-1">
                <p className="text-xs font-bold text-text leading-tight">
                  {user?.name || 'Administrator'}
                </p>
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Admin
                </span>
              </div>
            </button>

            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div
                className="absolute end-0 mt-2 w-56 bg-surface rounded-2xl shadow-xl border border-border py-2 z-50 animate-[fadeIn_0.15s_ease-out]"
                role="menu"
              >
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-xs font-bold text-text truncate">
                    {user?.name || 'Administrator'}
                  </p>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {user?.email || 'admin@afblast.id'}
                  </p>
                </div>

                <div className="py-1">
                  {user?.role !== 'adminfinance' && (
                    <>
                      <Link
                        to={`${rolePrefix}/profile`}
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 transition-colors"
                      >
                        <User className="w-4 h-4 text-muted" />
                        <span>{t('adminNav.profile')}</span>
                      </Link>
                      <Link
                        to={`${rolePrefix}/settings`}
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-muted" />
                        <span>{t('adminNav.settings')}</span>
                      </Link>
                    </>
                  )}
                </div>

                <div className="border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors text-start"
                  >
                    <LogOut className="w-4 h-4 text-danger" />
                    <span>{t('auth.logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Baris Pengumuman (AnnouncementTicker) */}
      <div className="border-t border-border bg-surface-2/60 px-4 py-1.5 flex items-center overflow-hidden">
        <AnnouncementTicker items={ANNOUNCEMENTS} />
      </div>
    </header>
  )
}
