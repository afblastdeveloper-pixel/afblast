import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, ChevronDown, LocateFixed, Check } from 'lucide-react'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { LS_TZ_KEY, FALLBACK_TIMEZONES } from '../../utils/constants'

/**
 * Mendapatkan semua zona waktu yang tersedia.
 * Menggunakan Intl.supportedValuesOf jika ada, jika tidak pakai fallback.
 */
function getAllTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    // Tidak tersedia
  }
  return FALLBACK_TIMEZONES
}

/**
 * Mendapatkan offset GMT dari timezone string
 * @param {string} tz - IANA timezone string
 * @returns {string} - mis. "GMT+7"
 */
function getOffset(tz) {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/**
 * TimezoneSelect – searchable combobox untuk memilih zona waktu.
 * Menyimpan pilihan di localStorage.
 *
 * @param {string}   value    - Zona waktu aktif
 * @param {function} onChange - Callback saat nilai berubah
 */
export default function TimezoneSelect({ value, onChange }) {
  const { t } = useTranslation()
  const allTimezones = useMemo(() => getAllTimezones(), [])
  const deviceTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Filter zona waktu berdasarkan pencarian
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allTimezones
    return allTimezones.filter(tz =>
      tz.toLowerCase().includes(q) || getOffset(tz).toLowerCase().includes(q)
    )
  }, [search, allTimezones])

  // Tutup saat klik di luar
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fokus input saat dropdown terbuka
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const handleSelect = (tz) => {
    onChange(tz)
    setIsOpen(false)
    setSearch('')
  }

  const handleUseDevice = () => {
    onChange(deviceTz)
    setIsOpen(false)
    setSearch('')
  }

  const displayValue = value || deviceTz
  const displayOffset = getOffset(displayValue)

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-center gap-1 p-2 rounded-xl text-xs text-muted
                   hover:text-text hover:bg-surface-2 transition-colors border border-transparent
                   hover:border-border min-w-[40px] min-h-[40px] max-w-[120px] sm:max-w-[160px]"
        aria-label={t('topbar.timezone')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
        <span className="truncate max-[480px]:hidden hidden sm:block">
          {displayValue.split('/').pop()?.replace(/_/g, ' ')} ({displayOffset})
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform max-[480px]:hidden hidden sm:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full mt-1 end-0 w-[calc(100vw-1.5rem)] sm:w-72 max-w-[320px] bg-surface border border-border
                     rounded-xl shadow-2xl z-50 overflow-hidden"
          role="dialog"
          aria-label={t('topbar.timezone')}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('topbar.searchTimezone')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-surface-2 border border-border rounded-lg
                         text-text placeholder:text-muted
                         focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Tombol gunakan lokasi perangkat */}
          <button
            type="button"
            onClick={handleUseDevice}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary
                       bg-primary-soft hover:bg-primary-soft/80 transition-colors border-b border-border"
          >
            <LocateFixed className="w-3.5 h-3.5 flex-shrink-0" />
            {t('topbar.useDeviceLocation')} ({deviceTz})
          </button>

          {/* Daftar timezone */}
          <ul
            className="tz-dropdown max-h-60 overflow-y-auto divide-y divide-border/30"
            role="listbox"
            aria-label={t('topbar.timezone')}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-xs text-muted text-center">–</li>
            ) : (
              filtered.map(tz => {
                const isSelected = tz === displayValue
                const offset = getOffset(tz)
                return (
                  <li key={tz} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => handleSelect(tz)}
                      className={[
                        'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm',
                        'hover:bg-surface-2 transition-colors text-start',
                        isSelected ? 'text-primary bg-primary-soft font-semibold' : 'text-text',
                      ].join(' ')}
                    >
                      <span className="truncate">{tz.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-muted flex-shrink-0 flex items-center gap-1">
                        {offset}
                        {isSelected && <Check className="w-3 h-3 text-primary" />}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
