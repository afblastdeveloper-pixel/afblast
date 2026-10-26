import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * PageHeader.jsx – Header standar halaman panel Staf & Member
 * Menampilkan judul, subjudul, status badge opsional, dan tombol aksi di kanan.
 * Responsif & wrap rapi pada layar mobile tanpa layout shift.
 *
 * @param {string} title - Judul halaman utama
 * @param {string} subtitle - Deskripsi ringkas halaman
 * @param {React.ReactNode} badge - Badge opsional di samping judul
 * @param {React.ReactNode} actions - Slot tombol aksi di sisi kanan
 * @param {boolean|string} backTo - Tampilkan tombol kembali (boolean atau URL path)
 * @param {string} className
 */
export default function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  backTo,
  className = '',
}) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (typeof backTo === 'string') {
      navigate(backTo)
    } else {
      navigate(-1)
    }
  }

  return (
    <div
      className={[
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-3 min-w-0">
        {backTo && (
          <button
            type="button"
            onClick={handleBack}
            className="p-2 -ms-1 mt-0.5 rounded-xl border border-border bg-surface text-muted hover:text-text hover:bg-surface-2 transition-colors focus:ring-2 focus:ring-primary/20 flex-shrink-0"
            title="Kembali ke halaman sebelumnya"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight truncate">
              {title}
            </h1>
            {badge && <div className="flex-shrink-0">{badge}</div>}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs sm:text-sm text-muted leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
