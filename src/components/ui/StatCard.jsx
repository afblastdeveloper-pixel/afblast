import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * StatCard.jsx – Kartu metrik / KPI Admin & Member Reusable
 * Menggunakan token desain AF Blast (Light & Dark mode).
 *
 * @param {string} title
 * @param {string|number} value
 * @param {string} change - contoh '+12.5%'
 * @param {boolean} isPositive - default true
 * @param {React.ComponentType} icon - Lucide icon
 * @param {string} iconColor - Tailwind class
 * @param {string} subtext
 * @param {string} link - URL opsional
 * @param {string} linkText - Label tautan opsional
 * @param {boolean} loading - Tampilkan skeleton jika data sedang dimuat
 * @param {string} className
 */
export default function StatCard({
  title,
  value,
  change,
  isPositive = true,
  icon: Icon,
  iconColor = 'bg-primary-soft text-primary-text border border-primary/20',
  subtext,
  link,
  linkText,
  loading = false,
  className = '',
}) {
  if (loading) {
    return (
      <div
        className={[
          'bg-surface rounded-2xl p-5 border border-border shadow-xs animate-pulse flex flex-col justify-between h-[130px]',
          className,
        ].join(' ')}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-surface-2 rounded" />
            <div className="h-7 w-28 bg-surface-2 rounded-lg" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-2" />
        </div>
        <div className="h-3 w-36 bg-surface-2 rounded" />
      </div>
    )
  }

  const content = (
    <div
      className={[
        'bg-surface rounded-2xl p-5 border border-border shadow-2xs stat-card',
        'hover:border-primary/30 transition-all duration-200 flex flex-col justify-between',
        link ? 'group cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
            {title}
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-text mt-1.5 tabular-nums tracking-tight">
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${iconColor}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(change || subtext || link) && (
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
          {change ? (
            <div
              className={`flex items-center gap-1 font-semibold ${
                isPositive ? 'text-success' : 'text-danger'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span>{change}</span>
            </div>
          ) : subtext ? (
            <span className="text-muted truncate text-[11px] font-normal">
              {subtext}
            </span>
          ) : <span />}

          {link && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary-text group-hover:underline">
              <span>{linkText || 'Rincian'}</span>
              <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      )}
    </div>
  )

  if (link) {
    return (
      <Link to={link} className="block focus:outline-hidden">
        {content}
      </Link>
    )
  }

  return content
}
