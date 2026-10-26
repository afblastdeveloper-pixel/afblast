import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, Edit2, Trash2, Check, X, AlertCircle,
  RefreshCw, Eye, Sliders, ToggleLeft, ToggleRight, DollarSign,
  Layers
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import PageHeader from '../../components/ui/PageHeader'
import Can from '../../components/common/Can'

function formatRupiah(value, locale = 'id') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

export default function AdminWithdrawSettingsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // ─── STATE ATURAN (SETTINGS) ─────────────────────────────────────────────
  const [minInput, setMinInput] = useState('')
  const [maxInput, setMaxInput] = useState('')
  const [allowCustom, setAllowCustom] = useState(true)
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState('')
  const [settingsErrorMsg, setSettingsErrorMsg] = useState('')

  // ─── STATE PRESET MODAL & DELETE ─────────────────────────────────────────
  const [presetModalOpen, setPresetModalOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState(null)
  const [presetAmount, setPresetAmount] = useState('')
  const [presetSortOrder, setPresetSortOrder] = useState('0')
  const [presetIsActive, setPresetIsActive] = useState(true)
  const [presetModalError, setPresetModalError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, amount: 0 })

  // ─── 1. FETCH WITHDRAWAL SETTINGS ────────────────────────────────────────
  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    isError: isSettingsError,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['adminWithdrawSettings'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/withdraw/settings')
      if (!res.ok) throw new Error('Gagal memuat aturan penarikan')
      const json = await res.json()
      // Inisialisasi local form state saat data tiba
      if (json.settings) {
        setMinInput(String(json.settings.min))
        setMaxInput(String(json.settings.max))
        setAllowCustom(Boolean(json.settings.allowCustom))
      }
      return json
    },
    staleTime: 30000,
  })

  // ─── 2. FETCH PRESETS ────────────────────────────────────────────────────
  const {
    data: presetsData,
    isLoading: isPresetsLoading,
    isError: isPresetsError,
    refetch: refetchPresets,
  } = useQuery({
    queryKey: ['adminWithdrawPresets'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/withdraw/presets')
      if (!res.ok) throw new Error('Gagal memuat daftar preset nominal')
      return res.json()
    },
    staleTime: 15000,
  })

  const presets = presetsData?.presets || []

  // ─── MUTATION: UPDATE SETTINGS ───────────────────────────────────────────
  const updateSettingsMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiFetch('/api/admin/withdraw/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan aturan penarikan')
      }
      return res.json()
    },
    onSuccess: () => {
      setSettingsSuccessMsg('Aturan penarikan berhasil diperbarui!')
      setSettingsErrorMsg('')
      queryClient.invalidateQueries({ queryKey: ['adminWithdrawSettings'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawOptions'] })
      setTimeout(() => setSettingsSuccessMsg(''), 4000)
    },
    onError: (err) => {
      setSettingsErrorMsg(err.message)
      setSettingsSuccessMsg('')
    },
  })

  // ─── MUTATION: CREATE OR UPDATE PRESET ────────────────────────────────────
  const savePresetMutation = useMutation({
    mutationFn: async (payload) => {
      const isEdit = Boolean(editingPreset?.id)
      const endpoint = isEdit
        ? `/api/admin/withdraw/presets/${editingPreset.id}`
        : '/api/admin/withdraw/presets'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan preset')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWithdrawPresets'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawOptions'] })
      setPresetModalOpen(false)
      setEditingPreset(null)
      setPresetAmount('')
      setPresetModalError('')
    },
    onError: (err) => {
      setPresetModalError(err.message)
    },
  })

  // ─── MUTATION: TOGGLE ACTIVE / INACTIVE PRESET ────────────────────────────
  const togglePresetActiveMutation = useMutation({
    mutationFn: async ({ id, isActive, amount, sortOrder }) => {
      const res = await apiFetch(`/api/admin/withdraw/presets/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive, amount, sortOrder }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal mengubah status preset')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWithdrawPresets'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawOptions'] })
    },
  })

  // ─── MUTATION: DELETE PRESET ──────────────────────────────────────────────
  const deletePresetMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/admin/withdraw/presets/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menghapus preset')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWithdrawPresets'] })
      queryClient.invalidateQueries({ queryKey: ['memberWithdrawOptions'] })
      setDeleteConfirm({ open: false, id: null, amount: 0 })
    },
  })

  // ─── HANDLERS ────────────────────────────────────────────────────────────
  const handleSaveSettings = (e) => {
    e.preventDefault()
    setSettingsErrorMsg('')
    const min = parseInt(minInput, 10)
    const max = parseInt(maxInput, 10)

    if (isNaN(min) || min < 1000) {
      setSettingsErrorMsg('Minimal penarikan minimal Rp 1.000')
      return
    }
    if (isNaN(max) || max < min) {
      setSettingsErrorMsg('Maksimal penarikan harus lebih besar atau sama dengan minimal')
      return
    }

    updateSettingsMutation.mutate({ min, max, allowCustom })
  }

  const handleOpenAddPreset = () => {
    setEditingPreset(null)
    setPresetAmount('')
    setPresetSortOrder(String(presets.length + 1))
    setPresetIsActive(true)
    setPresetModalError('')
    setPresetModalOpen(true)
  }

  const handleOpenEditPreset = (preset) => {
    setEditingPreset(preset)
    setPresetAmount(String(preset.amount))
    setPresetSortOrder(String(preset.sortOrder))
    setPresetIsActive(preset.isActive)
    setPresetModalError('')
    setPresetModalOpen(true)
  }

  const handleSavePreset = (e) => {
    e.preventDefault()
    setPresetModalError('')

    const amountNum = parseInt(presetAmount.replace(/[^0-9]/g, ''), 10)
    const orderNum = parseInt(presetSortOrder, 10) || 0

    if (isNaN(amountNum) || amountNum <= 0) {
      setPresetModalError('Nominal harus berupa angka positif.')
      return
    }

    if (amountNum % 1000 !== 0) {
      setPresetModalError('Nominal harus kelipatan Rp 1.000.')
      return
    }

    // Validasi tidak duplikat (kecuali sedang mengedit preset yang sama)
    const isDuplicate = presets.some(
      (p) => p.amount === amountNum && (!editingPreset || p.id !== editingPreset.id)
    )
    if (isDuplicate) {
      setPresetModalError(`Nominal ${formatRupiah(amountNum, i18n.language)} sudah ada dalam daftar.`)
      return
    }

    savePresetMutation.mutate({
      amount: amountNum,
      sortOrder: orderNum,
      isActive: presetIsActive,
    })
  }

  return (
    <Can permission="withdrawPreset.manage" fallback={
      <div className="p-8 text-center text-muted">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-2" />
        <p className="font-bold text-text">Akses Dibatasi</p>
        <p className="text-xs">Hanya Superadmin dan Admin Finance yang memiliki izin mengatur penarikan.</p>
      </div>
    }>
      <div className="space-y-6 max-w-screen-2xl mx-auto">
        {/* Header Halaman */}
        <PageHeader
          title="Pengaturan Penarikan"
          subtitle="Kelola batas minimal/maksimal penarikan saldo dan pilihan nominal chip yang dilihat member."
          actions={
            <button
              type="button"
              onClick={() => {
                refetchSettings()
                refetchPresets()
              }}
              className="inline-flex items-center gap-2 h-10 px-4 text-xs font-semibold rounded-xl bg-surface border border-border text-text hover:bg-surface-2 transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Segarkan Data</span>
            </button>
          }
        />

        {/* ========================================================================= */}
        {/* 1. ATURAN PENARIKAN (MIN, MAX, ALLOW CUSTOM) */}
        {/* ========================================================================= */}
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-border">
            <Sliders className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-text">Aturan Batasan Penarikan</h2>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Minimal Penarikan */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Minimal Penarikan (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-muted text-sm font-semibold">Rp</span>
                  <input
                    type="number"
                    step={1000}
                    min={1000}
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 bg-surface-2 border border-border rounded-xl text-sm font-bold text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="20000"
                  />
                </div>
                <p className="text-[11px] text-muted mt-1">Batas terendah saldo yang dapat ditarik member</p>
              </div>

              {/* Maksimal Penarikan */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Maksimal Penarikan per Transaksi (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-muted text-sm font-semibold">Rp</span>
                  <input
                    type="number"
                    step={1000}
                    min={1000}
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 bg-surface-2 border border-border rounded-xl text-sm font-bold text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="5000000"
                  />
                </div>
                <p className="text-[11px] text-muted mt-1">Batas tertinggi penarikan dalam satu permohonan</p>
              </div>
            </div>

            {/* Toggle Nominal Manual */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-text">Izinkan Input Nominal Manual</p>
                <p className="text-xs text-muted mt-0.5">
                  Jika aktif, member dapat mengetik nominal sendiri (selama dalam batas min/max dan kelipatan 1.000). Jika nonaktif, member hanya bisa memilih chip yang disediakan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowCustom(!allowCustom)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  allowCustom ? 'bg-primary' : 'bg-surface border border-border'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    allowCustom ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Pesan Sukses / Error */}
            {settingsSuccessMsg && (
              <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-success text-xs flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{settingsSuccessMsg}</span>
              </div>
            )}
            {settingsErrorMsg && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{settingsErrorMsg}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                className="h-10 px-6 rounded-xl bg-primary hover:bg-primary-hover active:bg-blue-800 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
              >
                {updateSettingsMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Aturan</span>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* ========================================================================= */}
        {/* 2. PRATINJAU TAMPILAN CHIP SEPERTI DILIHAT MEMBER */}
        {/* ========================================================================= */}
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-2.5 mb-4">
            <Eye className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-text">Pratinjau Tampilan Chip (Seperti Dilihat Member)</h2>
              <p className="text-xs text-muted">
                Preset yang aktif akan tampil sebagai tombol chip instan di halaman penarikan member.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-surface-2 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2.5">
              Pratinjau Chip Nominal (Simulasi Saldo Rp 100.000):
            </p>
            <div className="flex flex-wrap gap-2.5">
              {presets.filter((p) => p.isActive).length === 0 ? (
                <span className="text-xs text-muted italic">Tidak ada preset aktif yang tampil</span>
              ) : (
                presets
                  .filter((p) => p.isActive)
                  .map((p) => {
                    const isExceedSimulation = p.amount > 100000
                    return (
                      <span
                        key={p.id}
                        className={[
                          'py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors',
                          isExceedSimulation
                            ? 'bg-surface text-muted border-border opacity-60 cursor-not-allowed'
                            : 'bg-primary-soft text-primary-text border-primary/20 shadow-2xs',
                        ].join(' ')}
                      >
                        {formatRupiah(p.amount, i18n.language)}
                      </span>
                    )
                  })
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. KELOLA PILIHAN NOMINAL (PRESETS CRUD) */}
        {/* ========================================================================= */}
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text">Kelola Pilihan Nominal</h2>
              <p className="text-xs text-muted">
                Daftar preset nominal chip. Harus kelipatan Rp 1.000 dan tidak boleh duplikat.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddPreset}
              className="inline-flex items-center gap-2 h-10 px-4 bg-primary hover:bg-primary-hover active:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Nominal</span>
            </button>
          </div>

          {isPresetsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 bg-surface-2 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isPresetsError ? (
            <div className="p-6 text-center text-danger text-xs">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-danger" />
              <p>Gagal memuat preset nominal.</p>
              <button onClick={() => refetchPresets()} className="mt-2 font-semibold underline">
                Coba Lagi
              </button>
            </div>
          ) : presets.length === 0 ? (
            <div className="p-8 text-center text-muted text-xs bg-surface-2 rounded-xl">
              Belum ada pilihan nominal preset yang ditambahkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 text-start font-semibold">Nominal (Rp)</th>
                    <th className="py-3 px-4 text-center font-semibold">Urutan</th>
                    <th className="py-3 px-4 text-center font-semibold">Status</th>
                    <th className="py-3 px-4 text-end font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {presets.map((preset) => (
                    <tr key={preset.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="py-3 px-4 font-bold text-text text-sm tabular-nums">
                        {formatRupiah(preset.amount, i18n.language)}
                      </td>
                      <td className="py-3 px-4 text-center text-muted font-mono">
                        {preset.sortOrder}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            togglePresetActiveMutation.mutate({
                              id: preset.id,
                              isActive: !preset.isActive,
                              amount: preset.amount,
                              sortOrder: preset.sortOrder,
                            })
                          }
                          disabled={togglePresetActiveMutation.isPending}
                          className="inline-flex items-center gap-1.5 focus:outline-none"
                        >
                          <Badge variant={preset.isActive ? 'success' : 'neutral'} size="sm">
                            {preset.isActive ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPreset(preset)}
                            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-2 transition-colors"
                            title="Ubah Preset"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                open: true,
                                id: preset.id,
                                amount: preset.amount,
                              })
                            }
                            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                            title="Hapus Preset"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* MODAL TAMBAH / UBAH PRESET */}
        {/* ========================================================================= */}
        <Modal
          isOpen={presetModalOpen}
          onClose={() => setPresetModalOpen(false)}
          title={editingPreset ? 'Ubah Pilihan Nominal' : 'Tambah Pilihan Nominal'}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSavePreset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Nominal Penarikan (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-muted text-sm font-semibold">Rp</span>
                <input
                  type="number"
                  step={1000}
                  min={1000}
                  value={presetAmount}
                  onChange={(e) => setPresetAmount(e.target.value)}
                  placeholder="50000"
                  required
                  className="w-full h-10 pl-10 pr-4 border border-border bg-surface-2 rounded-xl text-sm font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <p className="text-[11px] text-muted mt-1">Wajib kelipatan Rp 1.000 dan tidak boleh duplikat</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Urutan Tampil (Sort Order)
              </label>
              <input
                type="number"
                value={presetSortOrder}
                onChange={(e) => setPresetSortOrder(e.target.value)}
                placeholder="1"
                className="w-full h-10 px-3.5 border border-border bg-surface-2 rounded-xl text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[11px] text-muted mt-1">Angka lebih kecil tampil lebih awal</p>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2 border border-border">
              <span className="text-xs font-semibold text-text">Status Pilihan Ini:</span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={presetIsActive}
                  onChange={(e) => setPresetIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-primary"
                />
                <span className="text-xs font-semibold text-text">
                  {presetIsActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </label>
            </div>

            {presetModalError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{presetModalError}</span>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="flex-1 h-10 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savePresetMutation.isPending}
                className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
              >
                {savePresetMutation.isPending ? 'Menyimpan...' : 'Simpan Nominal'}
              </button>
            </div>
          </form>
        </Modal>

        {/* ========================================================================= */}
        {/* DIALOG KONFIRMASI HAPUS PRESET */}
        {/* ========================================================================= */}
        <ConfirmDialog
          isOpen={deleteConfirm.open}
          onClose={() => setDeleteConfirm({ open: false, id: null, amount: 0 })}
          onConfirm={() => deletePresetMutation.mutate(deleteConfirm.id)}
          title="Hapus Preset Nominal"
          message={`Yakin ingin menghapus pilihan nominal ${formatRupiah(deleteConfirm.amount, i18n.language)}? Member tidak akan dapat lagi memilih chip ini.`}
          confirmText="Hapus Preset"
          cancelText="Batal"
          variant="danger"
          isLoading={deletePresetMutation.isPending}
        />
      </div>
    </Can>
  )
}
