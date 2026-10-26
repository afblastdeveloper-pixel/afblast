import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import Modal from '../ui/Modal'
import { apiFetch } from '../../utils/client'

/**
 * RiskStatementModal – Modal Pernyataan Risiko Wajib untuk Member
 * Sebelum pertama kali mengikuti kampanye blast WhatsApp.
 * - Menampilkan teks pernyataan risiko resmi yang berversi
 * - Kotak centang persetujuan wajib
 * - Mencatat persetujuan ke server via POST /api/member/risk-ack
 */
export default function RiskStatementModal({ isOpen, onClose, onAcknowledged }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [agreed, setAgreed] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 1. Fetch Status Pernyataan Risiko & Teks Versi Aktif
  const { data: riskData, isLoading } = useQuery({
    queryKey: ['memberRiskAck'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/risk-ack')
      if (!res.ok) throw new Error('Gagal memuat pernyataan risiko')
      return res.json()
    },
    enabled: isOpen,
    staleTime: 60000,
  })

  const version = riskData?.version || '1.0'
  const statement =
    riskData?.statement ||
    `1. Saya memahami bahwa keikutsertaan dalam sesi blast WhatsApp menggunakan nomor saya dapat menimbulkan risiko pemblokiran (banned) sementara atau permanen dari pihak WhatsApp jika terjadi lonjakan laporan spam.
2. Saya telah mematuhi aturan penyesuaian profil pengirim resmi (nama tampilan dan foto profil) sesuai instruksi AF Blast.
3. Saya menyatakan nomor WhatsApp yang saya tautkan adalah milik sah saya sendiri dan bukan hasil pencurian identitas atau penyalahgunaan nomor pihak lain.
4. Saya membebaskan platform AF Blast dari segala tuntutan hukum yang timbul akibat pelanggaran ketentuan penggunaan oleh pihak ketiga atau tindakan yang bertentangan dengan kebijakan Meta/WhatsApp.`

  // 2. Mutation Mencatat Persetujuan Member
  const ackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/member/risk-ack', {
        method: 'POST',
        body: JSON.stringify({
          version,
          agreed: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan persetujuan risiko')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberRiskAck'] })
      if (onAcknowledged) onAcknowledged()
      if (onClose) onClose()
    },
    onError: (err) => {
      setErrorMsg(err.message)
    },
  })

  const handleAgreeAndContinue = () => {
    if (!agreed) {
      setErrorMsg('Anda wajib mencentang persetujuan pernyataan risiko terlebih dahulu')
      return
    }
    setErrorMsg('')
    ackMutation.mutate()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pernyataan Risiko & Kepatuhan Blast"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Banner Peringatan */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold block">Pemberitahuan Wajib Sebelum Bergabung Kampanye:</span>
            <span>
              Sebelum Anda dapat mengikutsertakan nomor WhatsApp Anda ke dalam kampanye blast resmi, Anda wajib membaca dan menyetujui pernyataan risiko operasional di bawah ini.
            </span>
          </div>
        </div>

        {/* Versi Dokumen */}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Ketentuan Layanan Operasional</span>
          <span className="font-mono font-bold px-2 py-0.5 rounded bg-surface-2 text-text border border-border">
            Versi {version}
          </span>
        </div>

        {/* Teks Pernyataan Risiko (Scrollable Box) */}
        <div className="p-4 rounded-2xl bg-surface-2 border border-border text-xs text-text max-h-56 overflow-y-auto space-y-2 leading-relaxed whitespace-pre-wrap font-sans">
          {isLoading ? (
            <div className="py-8 text-center text-muted">Memuat dokumen pernyataan risiko...</div>
          ) : (
            statement
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Kotak Centang Persetujuan Wajib */}
        <div className="p-3.5 bg-surface rounded-xl border border-border shadow-2xs">
          <label className="flex items-start gap-3 cursor-pointer text-xs text-text leading-relaxed">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked)
                setErrorMsg('')
              }}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary/30"
            />
            <span>
              <strong>Persetujuan Penuh:</strong> Saya telah membaca, memahami, dan menyetujui seluruh ketentuan dan pernyataan risiko di atas tanpa paksaan dari pihak mana pun.
            </span>
          </label>
        </div>

        {/* Footer Tombol */}
        <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={ackMutation.isPending}
            className="px-4 py-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleAgreeAndContinue}
            disabled={!agreed || ackMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-hover text-xs font-bold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {ackMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>Saya Setuju & Lanjutkan</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
