import { useEffect, useRef, useState } from 'react'

/**
 * AnimatedNumber – Menampilkan angka yang bertransisi halus saat nilai berubah,
 * menggunakan font-variant-numeric: tabular-nums agar lebar karakter seragam
 * dan tidak terjadi layout shift sedikitpun saat angka bertambah/berkurang.
 *
 * @param {number|string} value - Nilai angka target
 * @param {function} [formatter] - Fungsi format kustom (contoh: IDR, koma ribuan)
 * @param {number} [duration=600] - Durasi animasi dalam milidetik
 * @param {string} [className=''] - Kelas Tailwind tambahan
 */
export default function AnimatedNumber({
  value = 0,
  formatter = (v) => Number(v || 0).toLocaleString('id-ID'),
  duration = 500,
  className = '',
}) {
  const numericTarget = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, '')) || 0
  const [displayValue, setDisplayValue] = useState(numericTarget)
  const prevValueRef = useRef(numericTarget)
  const frameRef = useRef(null)

  useEffect(() => {
    const startVal = prevValueRef.current
    const endVal = numericTarget

    if (startVal === endVal) {
      setDisplayValue(endVal)
      return
    }

    const startTime = performance.now()

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Cubic ease-out: 1 - (1 - t)^3
      const ease = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startVal + (endVal - startVal) * ease)

      setDisplayValue(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = endVal
        setDisplayValue(endVal)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [numericTarget, duration])

  return (
    <span className={`tabular-nums tracking-tight select-none inline-block ${className}`}>
      {formatter(displayValue)}
    </span>
  )
}
