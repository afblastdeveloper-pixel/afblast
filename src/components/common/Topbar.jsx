import { useTranslation } from 'react-i18next'
import { Menu } from 'lucide-react'
import AnnouncementTicker from './AnnouncementTicker'
import RealtimeClock from './RealtimeClock'
import TimezoneSelect from './TimezoneSelect'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from '../ui/ThemeToggle'
import { ANNOUNCEMENTS } from '../../utils/constants'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { LS_TZ_KEY } from '../../utils/constants'

/**
 * Topbar – header utama dengan layout responsif:
 * - Desktop (>= 1024px / lg): 1 baris inline (AnnouncementTicker di tengah, controls di kanan)
 * - Mobile/Tablet (< 1024px):
 *     Baris 1: Hamburger di kiri (start) + Jam, Timezone, Bahasa, ThemeToggle, Avatar di kanan (end)
 *     Baris 2: Bilah Pengumuman selebar penuh (w-full) tepat di bawah navbar (sticky bersama)
 *
 * Menggunakan 1 instance AnnouncementTicker tanpa duplicate render di DOM.
 *
 * @param {boolean}  isSidebarOpen - Status drawer sidebar
 * @param {function} onMenuToggle  - Toggle buka/tutup sidebar
 */
export default function Topbar({ isSidebarOpen, onMenuToggle }) {
  const { t } = useTranslation()

  // Timezone tersimpan di localStorage
  const [timezone, setTimezone] = useLocalStorage(LS_TZ_KEY, null)

  return (
    <header
      className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm border-b border-border shadow-2xs"
      role="banner"
    >
      <div className="flex flex-wrap items-center lg:flex-nowrap lg:h-14">
        {/* === Baris 1: Hamburger button (hanya < lg) === */}
        <div className="order-1 flex items-center px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px] sm:min-h-[56px] lg:hidden">
          <button
            type="button"
            onClick={onMenuToggle}
            className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-2
                       transition-colors flex-shrink-0 min-w-[40px] min-h-[40px]
                       flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={isSidebarOpen ? t('topbar.closeMenu') : t('topbar.openMenu')}
            aria-expanded={isSidebarOpen}
            aria-controls="sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* === Baris 1 Kanan: Clock, Timezone, Language, ThemeToggle, Avatar === */}
        <div className="order-2 ms-auto flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px] sm:min-h-[56px] relative z-20 flex-shrink-0 lg:order-3 lg:ms-auto lg:py-0 lg:min-h-0 lg:px-4">
          {/* Jam real-time */}
          <RealtimeClock timezone={timezone} />

          {/* Divider */}
          <div className="w-px h-5 bg-border hidden sm:block" />

          {/* Timezone selector */}
          <TimezoneSelect value={timezone} onChange={setTimezone} />

          {/* Divider */}
          <div className="w-px h-5 bg-border hidden sm:block" />

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* ThemeToggle */}
          <ThemeToggle />

          {/* Divider */}
          <div className="w-px h-5 bg-border hidden sm:block" />

          {/* Avatar pengguna */}
          <button
            type="button"
            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-gradient-to-br from-primary to-accent
                       flex items-center justify-center flex-shrink-0
                       hover:opacity-90 transition-opacity shadow-2xs"
            aria-label={t('topbar.userProfile')}
          >
            <span className="text-white text-xs font-bold">A</span>
          </button>
        </div>

        {/* === Baris 2 (Mobile/Tablet) & Middle Inline (Desktop) === */}
        <div className="order-3 w-full basis-full border-t border-border bg-surface-2/60 px-3 sm:px-4 py-1.5 min-h-[36px] max-h-[40px] flex items-center overflow-hidden relative z-10 lg:order-2 lg:w-auto lg:basis-auto lg:flex-1 lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-0 lg:min-h-0 lg:max-h-none lg:mx-4">
          <AnnouncementTicker items={ANNOUNCEMENTS} />
        </div>
      </div>
    </header>
  )
}
