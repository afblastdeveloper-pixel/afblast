import { useId } from 'react'

/**
 * MiniChart.jsx – Grafik SVG mini ringan tanpa dependensi eksternal
 * Mendukung tipe 'area' (sparkline), 'bar', dan 'donut'.
 *
 * @param {'area'|'bar'|'donut'} type
 * @param {Array<number>} data - contoh [10, 25, 18, 40, 32, 60, 52]
 * @param {number} value - nilai persentase untuk mode donut (0-100)
 * @param {number} width
 * @param {number} height
 * @param {'primary'|'success'|'warning'|'danger'|'info'} variant
 * @param {string} className
 */
export default function MiniChart({
  type = 'area',
  data = [12, 18, 15, 26, 22, 35, 30, 48],
  value = 65,
  width = 120,
  height = 40,
  variant = 'primary',
  className = '',
}) {
  const gradientId = useId()

  const colorConfig = {
    primary: { stroke: '#2563EB', fill: '#2563EB' },
    success: { stroke: '#10B981', fill: '#10B981' },
    warning: { stroke: '#F59E0B', fill: '#F59E0B' },
    danger: { stroke: '#EF4444', fill: '#EF4444' },
    info: { stroke: '#38BDF8', fill: '#38BDF8' },
  }[variant] || { stroke: '#2563EB', fill: '#2563EB' }

  // 1. Tipe Donut Chart
  if (type === 'donut') {
    const size = Math.min(width, height) || 44
    const strokeWidth = 5
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference

    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            className="text-border"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colorConfig.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute text-[10px] font-bold font-mono text-text">
          {Math.round(value)}%
        </span>
      </div>
    )
  }

  // 2. Tipe Bar Chart Mini
  if (type === 'bar') {
    const maxVal = Math.max(...data, 1)
    const barWidth = Math.max(3, Math.floor((width - (data.length - 1) * 2) / data.length))

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`overflow-visible ${className}`}
      >
        {data.map((val, idx) => {
          const barHeight = Math.max(2, (val / maxVal) * (height - 4))
          const x = idx * (barWidth + 3)
          const y = height - barHeight

          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill={colorConfig.fill}
              className="opacity-80 hover:opacity-100 transition-opacity"
            />
          )
        })}
      </svg>
    )
  }

  // 3. Tipe Area / Sparkline Chart
  const minVal = Math.min(...data)
  const maxVal = Math.max(...data)
  const range = maxVal - minVal || 1
  const paddingY = 4

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width
    const y = height - paddingY - ((val - minVal) / range) * (height - paddingY * 2)
    return { x, y }
  })

  const pathD = points.reduce(
    (acc, pt, idx) =>
      idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`,
    ''
  )

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-hidden ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorConfig.fill} stopOpacity="0.3" />
          <stop offset="100%" stopColor={colorConfig.fill} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Area Fill */}
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Line Stroke */}
      <path
        d={pathD}
        fill="none"
        stroke={colorConfig.stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Titik Akhir */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={colorConfig.stroke}
        />
      )}
    </svg>
  )
}
