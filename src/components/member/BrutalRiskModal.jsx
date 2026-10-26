import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, AlertTriangle, ShieldAlert, X } from 'lucide-react'
import Modal from '../ui/Modal'

export default function BrutalRiskModal({
  isOpen,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const isValid = agreed && confirmText.trim() === 'SAYA PAHAM'

  const handleConfirm = () => {
    if (!isValid) return
    onConfirm()
    onClose()
    setAgreed(false)
    setConfirmText('')
  }

  const handleClose = () => {
    setAgreed(false)
    setConfirmText('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="p-6 space-y-5 text-start">
        {/* Header with Flame Icon */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/10">
            <Flame className="w-7 h-7 fill-rose-600 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 mb-1">
              <AlertTriangle className="w-3 h-3" />
              SANGAT BERISIKO
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
              Aktivasi Mode Brutal (Tanpa Jeda)
            </h3>
          </div>
        </div>

        {/* Risk Points Box */}
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-950 dark:text-rose-200 space-y-2.5 leading-relaxed">
          <p className="font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Harap baca dan pahami konsekuensi berikut:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-700 dark:text-slate-300">
            <li>
              <strong>Tanpa Jeda Tambahan:</strong> Pesan dikirimkan secepat mungkin (minimal 700ms teknis).
            </li>
            <li>
              <strong>Risiko Banned Ekstrem:</strong> Algoritma anti-spam WhatsApp dapat mendeteksi dan memblokir nomor Anda secara permanen sewaktu-waktu.
            </li>
            <li>
              <strong>Blokir Tambah Perangkat:</strong> Selama Mode Brutal aktif pada akun Anda, penambahan perangkat WhatsApp baru akan diblokir oleh sistem.
            </li>
            <li>
              <strong>Pelepasan Tanggung Jawab:</strong> Segala kerugian pemblokiran nomor ditanggung sepenuhnya oleh pengguna.
            </li>
          </ul>
        </div>

        {/* Agreement Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 select-none group-hover:text-slate-900 dark:group-hover:text-slate-100">
            Saya memahami seluruh risiko di atas dan bertanggung jawab penuh atas segala konsekuensi pada akun WhatsApp saya.
          </span>
        </label>

        {/* Text Confirmation Input */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Ketik teks konfirmasi persis <span className="text-rose-600 font-mono font-black select-all">SAYA PAHAM</span> untuk melanjutkan:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="SAYA PAHAM"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm tracking-wider uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={handleConfirm}
            className={[
              'px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition-all',
              isValid
                ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-600/25'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-600 cursor-not-allowed',
            ].join(' ')}
          >
            Aktifkan Mode Brutal
          </button>
        </div>
      </div>
    </Modal>
  )
}
