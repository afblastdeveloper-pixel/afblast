import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

/**
 * Toast.jsx – Notifikasi feedback aksi popup
 * Menggunakan design tokens AF Blast (Light & Dark mode).
 *
 * @param {string} message
 * @param {'success'|'error'|'danger'|'warning'|'info'} type
 * @param {function} onClose
 * @param {number} duration
 */
export default function Toast({
  message,
  type = 'success',
  onClose,
  duration = 4000,
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [message, duration, onClose])

  if (!visible || !message) return null

  const normalizedType = type === 'error' ? 'danger' : type

  const config = {
    success: {
      Icon: CheckCircle2,
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
    },
    danger: {
      Icon: AlertCircle,
      style: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
    },
    warning: {
      Icon: AlertTriangle,
      style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
    },
    info: {
      Icon: Info,
      style: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60',
    },
  }[normalizedType] || {
    Icon: Info,
    style: 'bg-surface-2 text-muted border-border',
  }

  const { Icon } = config

  return (
    <div
      className="fixed bottom-5 end-5 z-50 animate-[fadeIn_0.2s_ease-out] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl bg-surface border border-border max-w-sm"
      role="status"
    >
      <div className={`p-1.5 rounded-xl border flex-shrink-0 ${config.style}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs font-medium text-text flex-1 leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => {
          setVisible(false)
          onClose?.()
        }}
        className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
        aria-label="Tutup notifikasi"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
