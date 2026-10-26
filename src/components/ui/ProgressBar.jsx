/**
 * ProgressBar.jsx – Komponen progress bar universal & segmented
 * Mendukung mode tunggal (persentase) atau mode multi-segmen (sukses, aktif, antre, gagal).
 *
 * @param {number} value - 0 hingga 100 (jika mode tunggal)
 * @param {Array<{ label: string, value: number, color?: string, variant?: 'success'|'primary'|'warning'|'danger'|'info' }>} segments
 * @param {boolean} showLabels - tampilkan legend & hitungan di bawah bar
 * @param {'sm'|'md'|'lg'} size
 * @param {string} className
 */
export default function ProgressBar({
  value,
  segments,
  showLabels = false,
  size = 'md',
  className = '',
}) {
  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  }[size] || 'h-2.5'

  // Variant color mapping ke design tokens
  const colorMap = {
    success: 'bg-success',
    primary: 'bg-primary',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    neutral: 'bg-muted/40',
  }

  // 1. Segmented Bar Mode
  if (Array.isArray(segments) && segments.length > 0) {
    const total = segments.reduce((acc, seg) => acc + (seg.value || 0), 0)

    return (
      <div className={`space-y-2 ${className}`}>
        {/* Progress Track */}
        <div
          className={`w-full ${heightClass} bg-surface-2 rounded-full overflow-hidden flex border border-border/60`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={total}
        >
          {segments.map((seg, idx) => {
            if (!seg.value || seg.value <= 0) return null
            const pct = total > 0 ? (seg.value / total) * 100 : 0
            const segmentColor = seg.color || colorMap[seg.variant || 'primary']

            return (
              <div
                key={idx}
                style={{ width: `${pct}%` }}
                className={`${segmentColor} transition-all duration-500 first:rounded-s-full last:rounded-e-full`}
                title={`${seg.label}: ${seg.value} (${pct.toFixed(1)}%)`}
              />
            )
          })}
        </div>

        {/* Labels & Legend */}
        {showLabels && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted pt-0.5">
            {segments.map((seg, idx) => {
              const segmentColor = seg.color || colorMap[seg.variant || 'primary']
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${segmentColor}`} />
                  <span className="font-medium text-text">{seg.label}:</span>
                  <span className="tabular-nums font-mono text-muted">{seg.value}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // 2. Single Value Mode
  const clampedValue = Math.min(100, Math.max(0, value || 0))

  return (
    <div
      className={`w-full ${heightClass} bg-surface-2 rounded-full overflow-hidden border border-border/60 ${className}`}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  )
}
