import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Check, ChevronDown } from 'lucide-react'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { SUPPORTED_LANGUAGES, LS_LANG_KEY } from '../../utils/constants'

/**
 * LanguageSwitcher – dropdown pilihan bahasa.
 * Menyimpan pilihan di localStorage dan mengubah dir/lang pada <html>.
 */
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const [, setStoredLang] = useLocalStorage(LS_LANG_KEY, 'id')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)
    ?? SUPPORTED_LANGUAGES[0]

  // Tutup saat klik di luar
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (lang) => {
    // Ubah bahasa i18next
    i18n.changeLanguage(lang.code)
    // Simpan ke localStorage
    setStoredLang(lang.code)
    // Update atribut html untuk aksesibilitas dan RTL
    document.documentElement.lang = lang.code
    document.documentElement.dir = lang.dir
    // Lock/unlock scroll body jika perlu
    if (lang.dir === 'rtl') {
      document.body.classList.add('rtl')
    } else {
      document.body.classList.remove('rtl')
    }
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium
                   text-muted hover:text-text hover:bg-surface-2 transition-colors border border-transparent
                   hover:border-border min-w-[40px] min-h-[40px]"
        aria-label={t('lang.label')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Languages className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
        <span className="max-[480px]:hidden hidden sm:block">{currentLang.label}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform max-[480px]:hidden hidden sm:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <ul
          className="absolute top-full mt-1 end-0 w-44 sm:w-40 max-w-[calc(100vw-1.5rem)] bg-surface border border-border
                     rounded-xl shadow-2xl z-50 overflow-hidden py-1 divide-y divide-border/40"
          role="listbox"
          aria-label={t('lang.label')}
        >
          {SUPPORTED_LANGUAGES.map(lang => {
            const isActive = lang.code === i18n.language
            return (
              <li key={lang.code} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => handleSelect(lang)}
                  className={[
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm',
                    'hover:bg-surface-2 transition-colors min-h-[40px]',
                    isActive ? 'text-primary bg-primary-soft font-semibold' : 'text-text',
                  ].join(' ')}
                >
                  <span>{lang.label}</span>
                  {isActive && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
