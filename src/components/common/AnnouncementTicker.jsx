import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Megaphone, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'

const TYPE_STYLES = {
  info: { icon: Info, color: 'text-info' },
  warning: { icon: AlertTriangle, color: 'text-warning' },
  success: { icon: CheckCircle2, color: 'text-success' },
}

export default function AnnouncementTicker({ items = [] }) {
  const { t } = useTranslation()
  const [prefersReduced, setPrefersReduced] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)

    const handler = (e) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!prefersReduced || items.length === 0) return
    const timer = setInterval(() => {
      setActiveIndex(i => (i + 1) % items.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [prefersReduced, items.length])

  if (items.length === 0) return null

  const activeItem = items[activeIndex] ?? items[0]
  const ActiveTypeIcon = (TYPE_STYLES[activeItem?.type] ?? TYPE_STYLES.info).icon
  const activeColor = (TYPE_STYLES[activeItem?.type] ?? TYPE_STYLES.info).color

  return (
    <div
      className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 w-full"
      aria-live="polite"
      aria-label={t('topbar.announcements')}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onPointerCancel={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0 bg-primary-soft text-primary-text px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-primary/20 shadow-2xs">
        <Megaphone className="w-3.5 h-3.5 flex-shrink-0 text-primary-text" aria-hidden="true" />
        <span className="text-xs font-semibold whitespace-nowrap max-[480px]:hidden inline">
          {t('topbar.announcements')}
        </span>
      </div>

      <div className="overflow-hidden flex-1 min-w-0">
        {prefersReduced ? (
          <div className="flex items-center gap-2 py-0.5">
            <ActiveTypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${activeColor}`} aria-hidden="true" />
            <p className="text-xs sm:text-sm text-text truncate transition-opacity duration-300">
              {t(activeItem.i18nKey)}
            </p>
          </div>
        ) : (
          <div
            className="ticker-track"
            role="marquee"
            aria-atomic="false"
            data-paused={isPaused ? 'true' : undefined}
          >
            {/* Duplikasi array untuk looping marquee seamless tanpa jeda */}
            {[...items, ...items].map((item, idx) => {
              const typeStyle = TYPE_STYLES[item.type] ?? TYPE_STYLES.info
              const TypeIcon = typeStyle.icon
              return (
                <span
                  key={`${item.id}-${idx}`}
                  className="inline-flex items-center gap-1.5 me-8 sm:me-10 whitespace-nowrap text-xs sm:text-sm text-text select-none"
                >
                  <TypeIcon
                    className={`w-3.5 h-3.5 flex-shrink-0 ${typeStyle.color}`}
                    aria-hidden="true"
                  />
                  <span>{t(item.i18nKey)}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
