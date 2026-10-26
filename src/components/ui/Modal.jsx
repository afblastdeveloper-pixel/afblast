import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Modal.jsx – Dialog modal responsif & aksesibel
 * Menggunakan design tokens AF Blast (Light & Dark mode).
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {string} title
 * @param {string} subtitle
 * @param {React.ReactNode} children
 * @param {React.ReactNode} footer
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|'4xl'} maxWidth
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) {
  // ESC key handler
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.classList.add('overflow-hidden')
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('overflow-hidden')
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  }[maxWidth] || 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className={[
          'bg-surface rounded-2xl shadow-2xl border border-border flex flex-col',
          'w-full max-h-[90vh] overflow-hidden animate-[fadeIn_0.15s_ease-out]',
          widthClasses,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 id="modal-title" className="text-base sm:text-lg font-bold text-text">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors focus:ring-2 focus:ring-primary/20"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content / Body */}
        <div className="p-6 overflow-y-auto flex-1 text-text">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 bg-surface-2 border-t border-border flex items-center justify-end gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
