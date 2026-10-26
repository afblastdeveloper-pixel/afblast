import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../context/ThemeContext'

/**
 * ThemeToggle Component
 * Mendukung 3 mode: Terang (light), Gelap (dark), Sistem (system).
 * Dilengkapi aksesibilitas keyboard, animasi transisi halus, dan i18n.
 *
 * @param {'pill'|'dropdown'|'auto'} variant - Tampilan kontrol (default 'auto')
 */
export default function ThemeToggle({ variant = 'auto' }) {
  const { t } = useTranslation()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const options = [
    {
      key: 'light',
      label: t('theme.light', 'Terang'),
      icon: Sun,
    },
    {
      key: 'dark',
      label: t('theme.dark', 'Gelap'),
      icon: Moon,
    },
    {
      key: 'system',
      label: t('theme.system', 'Sistem'),
      icon: Monitor,
    },
  ]

  // Variant Pill (Segmented Bar) - Cocok untuk topbar desktop
  if (variant === 'pill') {
    return (
      <div
        className="inline-flex items-center bg-surface-2 p-1 rounded-xl border border-border"
        role="group"
        aria-label={t('theme.switchTheme', 'Ubah Tema')}
      >
        {options.map((opt) => {
          const Icon = opt.icon
          const isActive = theme === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTheme(opt.key)}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium transition-all',
                isActive
                  ? 'bg-surface text-primary shadow-xs font-semibold'
                  : 'text-muted hover:text-text hover:bg-surface/50',
              ].join(' ')}
              title={`${opt.label} (${t('theme.mode', 'Mode')})`}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // Variant Dropdown / Compact Button - Cocok untuk mobile dan topbar compact
  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="h-10 w-10 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-muted hover:text-text hover:bg-surface-2 transition-colors shadow-2xs focus:ring-2 focus:ring-primary/20"
        title={t('theme.switchTheme', 'Pilih Tema Tampilan (Terang/Gelap/Sistem)')}
        aria-label={t('theme.switchTheme', 'Pilih Tema')}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-4 h-4 text-primary-text" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
        <span className="hidden md:inline text-xs font-medium text-text capitalize">
          {theme === 'system' ? t('theme.system', 'Sistem') : theme === 'dark' ? t('theme.dark', 'Gelap') : t('theme.light', 'Terang')}
        </span>
      </button>

      {dropdownOpen && (
        <div
          className="absolute end-0 mt-2 w-36 py-1 bg-surface border border-border rounded-xl shadow-lg z-50 animate-[fadeIn_0.15s_ease-out]"
          role="menu"
        >
          {options.map((opt) => {
            const Icon = opt.icon
            const isSelected = theme === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setTheme(opt.key)
                  setDropdownOpen(false)
                }}
                className={[
                  'w-full flex items-center justify-between px-3 py-2 text-xs transition-colors',
                  isSelected
                    ? 'bg-primary-soft text-primary font-semibold'
                    : 'text-text hover:bg-surface-2',
                ].join(' ')}
                role="menuitem"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
