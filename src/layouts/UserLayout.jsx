import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from '../components/common/Sidebar'
import Topbar from '../components/common/Topbar'
import logoAf2 from '../assets/brand/Logo-AF-2.jpeg'
import { BRAND } from '../config/brand'
import { MemberStreamProvider } from '../context/MemberStreamContext'

/**
 * UserLayout – Shell utama area Pengguna (/app/*).
 * Mempertahankan fungsionalitas:
 * - Sidebar dengan navigasi pengguna & tombol logout
 * - Topbar dengan ticker pengumuman, jam real-time, pemilih zona waktu, dan bahasa
 * - Sinkronisasi otomatis LTR/RTL dan atribut lang
 */
export default function UserLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { i18n } = useTranslation()
  const location = useLocation()

  // Tutup sidebar saat navigasi berubah (mobile)
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

  // Sinkronisasi dir/lang HTML dengan bahasa aktif saat pertama render & perubahan bahasa
  useEffect(() => {
    const lang = i18n.language
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [i18n.language])

  const handleToggle = useCallback(() => setSidebarOpen(prev => !prev), [])
  const handleClose = useCallback(() => setSidebarOpen(false), [])

  return (
    <MemberStreamProvider>
      <div className="min-h-screen bg-bg text-text transition-colors duration-150">
        {/* Sidebar Pengguna – fixed, di kiri (LTR) atau kanan (RTL) */}
        <Sidebar isOpen={sidebarOpen} onClose={handleClose} />

        {/* Konten utama – bergeser sesuai lebar sidebar di desktop */}
        <div className={[
          'flex flex-col min-h-screen transition-[margin] duration-300',
          'lg:ms-64',
        ].join(' ')}>

          {/* Topbar dengan Ticker, Clock, Timezone, Language Switcher */}
          <Topbar isSidebarOpen={sidebarOpen} onMenuToggle={handleToggle} />

          {/* Area konten halaman */}
          <main
            className="flex-1 p-4 sm:p-6"
            id="main-content"
            tabIndex={-1}
          >
            <Outlet />
          </main>

          {/* Footer Pita Navy Member dengan Logo-AF-2.jpeg */}
          <footer className="py-4 px-4 sm:px-6 bg-[#0B1220] text-slate-300 border-t border-slate-800">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={logoAf2}
                  alt={`${BRAND.name} - ${BRAND.slogan}`}
                  className="h-10 sm:h-12 w-auto object-contain rounded-xl"
                />
              </div>
              <p className="text-xs text-slate-400 text-center sm:text-end">
                © 2026 {BRAND.name}
              </p>
            </div>
          </footer>
        </div>
      </div>
    </MemberStreamProvider>
  )
}
