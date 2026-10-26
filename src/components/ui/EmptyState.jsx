import { Inbox } from 'lucide-react'

/**
 * EmptyState.jsx – Tampilan ketika data tidak ditemukan atau kosong
 * Menggunakan design tokens AF Blast (Light & Dark mode).
 *
 * @param {string} title
 * @param {string} description
 * @param {React.ComponentType} icon
 * @param {React.ReactNode} action
 * @param {string} className
 */
export default function EmptyState({
  title = 'Tidak Ada Data',
  description = 'Belum ada data yang tersedia untuk ditampilkan.',
  icon: Icon = Inbox,
  action,
  className = '',
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface rounded-2xl border border-dashed border-border',
        className,
      ].join(' ')}
    >
      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted mb-3.5 shadow-2xs">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-sm sm:text-base font-bold text-text">{title}</h3>
      <p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
