import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AdminSidebar from '../components/admin/AdminSidebar'
import AdminTopbar from '../components/admin/AdminTopbar'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AdminStreamProvider } from '../context/AdminStreamContext'

/**
 * AdminLayout – Shell utama untuk area Administrator (/admin/*).
 * Tema visual gelap slate-900 dengan aksen emerald,
 * navigasi admin terkelompok, desktop collapse toggle,
 * dukungan RTL penuh untuk bahasa Arab, dan notifikasi global.
 */
export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useLocalStorage('afblast_admin_sidebar_collapsed', false)
  const { i18n } = useTranslation()
  const location = useLocation()

  // Tutup drawer mobile saat navigasi berubah
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Tutup sidebar saat tekan Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  // Kunci scroll body saat drawer mobile terbuka
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('drawer-open')
    } else {
      document.body.classList.remove('drawer-open')
    }
    return () => document.body.classList.remove('drawer-open')
  }, [sidebarOpen])

  // Sinkronisasi dir/lang HTML dengan bahasa aktif
  useEffect(() => {
    const lang = i18n.language
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [i18n.language])

  const handleToggle = useCallback(() => setSidebarOpen((prev) => !prev), [])
  const handleClose = useCallback(() => setSidebarOpen(false), [])
  const handleToggleCollapse = useCallback(() => setIsCollapsed((prev) => !prev), [setIsCollapsed])

  return (
    <AdminStreamProvider>
      <div className="min-h-screen bg-bg font-sans text-text antialiased selection:bg-primary selection:text-white transition-colors duration-150">
        {/* Sidebar Admin – fixed di kiri (LTR) atau kanan (RTL) */}
        <AdminSidebar
          isOpen={sidebarOpen}
          onClose={handleClose}
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        {/* Konten utama Admin */}
        <div
          className={[
            'flex flex-col min-h-screen transition-[margin] duration-300 ease-in-out',
            isCollapsed ? 'lg:ms-20' : 'lg:ms-64',
          ].join(' ')}
        >
          {/* Topbar Admin */}
          <AdminTopbar isSidebarOpen={sidebarOpen} onMenuToggle={handleToggle} />

          {/* Konten Halaman Admin */}
          <main
            className="flex-1 w-full max-w-screen-2xl mx-auto p-4 sm:p-6 lg:p-8"
            id="admin-main-content"
            tabIndex={-1}
          >
            <Outlet />
          </main>

          {/* Footer Admin */}
          <footer className="py-4 px-4 sm:px-6 lg:px-8 border-t border-border bg-surface text-muted">
            <div className="w-full max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-muted gap-2">
              <p>© 2026 AF Blast Enterprise – Portal Staf</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-success font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <span>System Status: Optimal</span>
                </span>
                <span className="text-border">|</span>
                <span className="font-mono text-muted">Node Latency: 142ms</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </AdminStreamProvider>
  )
}
