import { useState, useEffect } from 'react'
import { AlertTriangle, Info, CheckCircle2, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import Modal from './Modal'

/**
 * ConfirmDialog.jsx – Dialog konfirmasi aksi penting
 * Mendukung opsi:
 * - Ketik kata konfirmasi (e.g. ketik "HAPUS" atau "RESET" untuk konfirmasi)
 * - Verifikasi password admin ulang (e.g. untuk hapus massal atau restore)
 * - Tampilan jumlah data terdampak (affectedCount)
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {function} onConfirm - dipanggil dengan (password) jika requirePassword aktif
 * @param {string} title
 * @param {string} message
 * @param {string} confirmText
 * @param {string} cancelText
 * @param {'danger'|'warning'|'success'|'primary'} variant
 * @param {boolean} isLoading
 * @param {string} confirmWord - kata konfirmasi opsional yang harus diketik pengguna
 * @param {boolean} requirePassword - apakah membutuhkan password staf/admin
 * @param {number|string} affectedCount - jumlah item terdampak
 * @param {React.ReactNode} extraContent
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  variant = 'danger',
  isLoading = false,
  confirmWord,
  requirePassword = false,
  affectedCount,
  extraContent,
}) {
  const [typedWord, setTypedWord] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Reset input saat dialog dibuka/tutup
  useEffect(() => {
    if (isOpen) {
      setTypedWord('')
      setPassword('')
      setShowPassword(false)
    }
  }, [isOpen])

  const iconConfig = {
    danger: {
      Icon: AlertTriangle,
      color: 'text-danger bg-danger/10 border border-danger/20',
      btn: 'bg-danger hover:bg-danger/90 text-white focus:ring-danger/30',
    },
    warning: {
      Icon: AlertTriangle,
      color: 'text-warning bg-warning/10 border border-warning/20',
      btn: 'bg-warning hover:bg-warning/90 text-white focus:ring-warning/30',
    },
    success: {
      Icon: CheckCircle2,
      color: 'text-success bg-success/10 border border-success/20',
      btn: 'bg-success hover:bg-success/90 text-white focus:ring-success/30',
    },
    primary: {
      Icon: Info,
      color: 'text-primary-text bg-primary-soft border border-primary/20',
      btn: 'bg-primary hover:bg-primary-hover text-white focus:ring-primary/30',
    },
  }[variant] || {
    Icon: AlertTriangle,
    color: 'text-danger bg-danger/10 border border-danger/20',
    btn: 'bg-danger hover:bg-danger/90 text-white',
  }

  const { Icon } = iconConfig
  const isWordValid = !confirmWord || typedWord.trim().toUpperCase() === confirmWord.toUpperCase()
  const isPasswordValid = !requirePassword || password.trim().length > 0
  const isConfirmDisabled = isLoading || !isWordValid || !isPasswordValid

  const handleConfirmClick = () => {
    if (isConfirmDisabled) return
    onConfirm(password)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 h-10 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isConfirmDisabled}
            className={`px-5 py-2 h-10 rounded-xl text-xs font-semibold shadow-xs transition-colors focus:ring-2 disabled:opacity-40 disabled:cursor-not-allowed ${iconConfig.btn}`}
          >
            {isLoading ? 'Memproses...' : confirmText}
          </button>
        </>
      )}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconConfig.color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-xs text-muted leading-relaxed">{message}</p>

          {/* Indikator Jumlah Data Terdampak */}
          {affectedCount !== undefined && affectedCount !== null && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>
                Jumlah data terdampak: <strong className="font-semibold tabular-nums">{Number(affectedCount).toLocaleString('id-ID')} item</strong>
              </span>
            </div>
          )}

          {/* Opsi Ketik Kata Konfirmasi */}
          {confirmWord && (
            <div className="p-3 bg-surface-2 rounded-xl border border-border space-y-1.5">
              <label className="block text-[11px] font-semibold text-text">
                Ketik <span className="font-mono font-bold text-danger px-1 bg-surface rounded">{confirmWord}</span> untuk melanjutkan:
              </label>
              <input
                type="text"
                value={typedWord}
                onChange={(e) => setTypedWord(e.target.value)}
                placeholder={`Ketik "${confirmWord}"`}
                className="w-full h-9 px-3 text-xs bg-surface border border-border rounded-lg text-text focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                autoComplete="off"
              />
            </div>
          )}

          {/* Opsi Masukkan Password Admin */}
          {requirePassword && (
            <div className="p-3 bg-surface-2 rounded-xl border border-border space-y-1.5">
              <label className="block text-[11px] font-semibold text-text">
                Masukkan Password Anda untuk verifikasi keamanan:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password akun staf Anda"
                  className="w-full h-9 ps-3 pe-9 text-xs bg-surface border border-border rounded-lg text-text focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {extraContent && <div>{extraContent}</div>}
        </div>
      </div>
    </Modal>
  )
}
