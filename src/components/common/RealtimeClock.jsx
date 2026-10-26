import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { useNow } from '../../hooks/useNow'

/**
 * RealtimeClock – menampilkan jam dan tanggal real-time per 1 detik.
 * Format mengikuti bahasa aktif (Intl.DateTimeFormat) dan design tokens.
 *
 * @param {string} timezone - IANA timezone string (mis. "Asia/Jakarta")
 */
export default function RealtimeClock({ timezone }) {
  const { i18n } = useTranslation()
  const now = useNow()

  const intlLocaleMap = {
    id: 'id-ID',
    en: 'en-US',
    zh: 'zh-CN',
    ar: 'ar-SA',
    th: 'th-TH',
    fil: 'fil-PH',
  }
  const locale = intlLocaleMap[i18n.language] ?? 'id-ID'

  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  // Format jam: HH:MM:SS
  const timeStr = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  // Format tanggal: hari, tanggal bulan
  const dateStr = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now)

  // Singkatan zona waktu (mis. WIB, GMT+7)
  const tzAbbr = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''

  return (
    <div className="flex items-center gap-1.5 text-text flex-shrink-0">
      <Clock className="w-3.5 h-3.5 text-primary-text flex-shrink-0" aria-hidden="true" />
      <div className="leading-tight">
        <p className="text-xs sm:text-sm font-semibold tabular-nums tracking-tight whitespace-nowrap text-text">
          {timeStr}
          <span className="ms-1 text-[10px] font-normal text-muted max-[480px]:hidden">{tzAbbr}</span>
        </p>
        <p className="text-[10px] text-muted max-[480px]:hidden hidden sm:block">{dateStr}</p>
      </div>
    </div>
  )
}
