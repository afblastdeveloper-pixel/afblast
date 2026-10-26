/**
 * Badge.jsx – Status & label badge reusable
 * Menggunakan design tokens AF Blast dengan kontras AA di mode Terang & Gelap.
 */

const VARIANT_CLASSES = {
  primary: 'bg-primary-soft text-primary-text border border-primary/20 dark:border-primary/30',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
  emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
  info: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60',
  neutral: 'bg-surface-2 text-muted border border-border',
  default: 'bg-surface-2 text-muted border border-border',
  indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60',
}

const DOT_COLORS = {
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  emerald: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-muted',
  default: 'bg-muted',
  indigo: 'bg-indigo-500',
}

export default function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
  size = 'md',
}) {
  const baseClasses = VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral
  const dotColor = DOT_COLORS[variant] || DOT_COLORS.neutral

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px]'
      : size === 'lg'
      ? 'px-3 py-1 text-xs'
      : 'px-2.5 py-0.5 text-[11px]'

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-semibold rounded-full shadow-2xs whitespace-nowrap transition-colors',
        baseClasses,
        sizeClasses,
        className,
      ].join(' ')}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
