import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, UploadCloud, Plus, X, Check, AlertCircle,
  ExternalLink, Smartphone, Clock, RefreshCw, Save
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import PageHeader from '../../components/ui/PageHeader'
import Can from '../../components/common/Can'

export default function AdminProfileRulePage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  // Form State
  const [notice, setNotice] = useState('')
  const [channelUrl, setChannelUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState('')
  const [nameOptions, setNameOptions] = useState([])
  const [newNameInput, setNewNameInput] = useState('')
  const [maxPerMember, setMaxPerMember] = useState(3)
  const [delayMin, setDelayMin] = useState(5)
  const [delayMax, setDelayMax] = useState(15)

  const [dragOver, setDragOver] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // 1. Fetch Profile Rule & Device Settings
  const {
    data: ruleData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['adminProfileRule'],
    queryFn: async () => {
      const res = await apiFetch('/api/admin/profile-rule')
      if (!res.ok) throw new Error('Gagal memuat aturan profil pengirim')
      return res.json()
    },
    staleTime: 30000,
  })

  // Sinkronkan data server ke form
  useEffect(() => {
    if (ruleData) {
      setNotice(ruleData.notice || '')
      setChannelUrl(ruleData.channelUrl || '')
      setPhotoUrl(ruleData.photoUrl || '/media/campaign/default_profile.png')
      setPreviewPhoto(ruleData.photoUrl || '/media/campaign/default_profile.png')
      setNameOptions(Array.isArray(ruleData.nameOptions) ? ruleData.nameOptions : [])
      setMaxPerMember(ruleData.maxPerMember || 3)
      setDelayMin(ruleData.delayMin || 5)
      setDelayMax(ruleData.delayMax || 15)
    }
  }, [ruleData])

  // 2. Mutation Update Profile Rule
  const updateMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage('')
      setSuccessMessage('')

      const formData = new FormData()
      formData.append('notice', notice.trim())
      formData.append('channelUrl', channelUrl.trim())
      formData.append('nameOptions', JSON.stringify(nameOptions))
      formData.append('maxPerMember', String(maxPerMember))
      formData.append('delayMin', String(delayMin))
      formData.append('delayMax', String(delayMax))

      if (selectedFile) {
        formData.append('photo', selectedFile)
      } else if (photoUrl) {
        formData.append('photoUrl', photoUrl)
      }

      const res = await apiFetch('/api/admin/profile-rule', {
        method: 'PUT',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Gagal menyimpan aturan profil')
      }

      return res.json()
    },
    onSuccess: (data) => {
      setSuccessMessage('Aturan profil dan pengaturan perangkat berhasil diperbarui.')
      if (data.photoUrl) {
        setPhotoUrl(data.photoUrl)
        setPreviewPhoto(data.photoUrl)
        setSelectedFile(null)
      }
      queryClient.invalidateQueries({ queryKey: ['adminProfileRule'] })
      queryClient.invalidateQueries({ queryKey: ['memberProfileRule'] })
      setTimeout(() => setSuccessMessage(''), 4000)
    },
    onError: (err) => {
      setErrorMessage(err.message)
    },
  })

  // Handle Foto File
  const handleFileChange = (file) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setErrorMessage('Format file tidak didukung. Hanya JPEG, PNG, dan WEBP yang diizinkan.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Ukuran file foto maksimal 2 MB.')
      return
    }
    setErrorMessage('')
    setSelectedFile(file)
    setPreviewPhoto(URL.createObjectURL(file))
  }

  // Tambah Pilihan Nama
  const handleAddName = (e) => {
    e?.preventDefault()
    const clean = newNameInput.trim()
    if (!clean) return
    if (nameOptions.includes(clean)) {
      setErrorMessage('Nama tersebut sudah ada di daftar pilihan.')
      return
    }
    setNameOptions((prev) => [...prev, clean])
    setNewNameInput('')
  }

  // Hapus Pilihan Nama
  const handleRemoveName = (idx) => {
    setNameOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <Can permission="profileRule.manage">
      <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
        {/* Header */}
        <PageHeader
          title="Aturan Profil & Pengaturan Blast"
          subtitle="Konfigurasikan foto profil wajib, pilihan nama WhatsApp resmi, teks pengumuman, saluran channel, batas perangkat, serta rentang jeda pengiriman pesan."
          actions={
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 h-10 px-4 text-xs font-semibold rounded-xl bg-surface border border-border text-text hover:bg-surface-2 transition-colors shadow-xs"
              title="Segarkan data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Segarkan Data</span>
            </button>
          }
        />

        {/* Feedback Notifications */}
        {successMessage && (
          <div className="p-4 rounded-2xl bg-success/10 border border-success/20 text-success text-xs sm:text-sm font-semibold flex items-center gap-2.5 animate-in fade-in">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-xs sm:text-sm font-semibold flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="bg-surface rounded-2xl p-8 border border-border shadow-xs space-y-6">
            <div className="h-28 bg-surface-2 rounded-2xl animate-pulse" />
            <div className="h-40 bg-surface-2 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. SEKSI FOTO PROFIL WAJIB & PILIHAN NAMA */}
            <div className="bg-surface rounded-2xl border border-border shadow-xs p-6 sm:p-8 space-y-6">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-text">
                  Identitas Profil Pengirim Resmi
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Foto dan nama ini akan ditampilkan di banner atas dashboard member sebagai panduan setup akun WhatsApp mereka.
                </p>
              </div>

              {/* Upload Foto Profil Wajib */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-surface-2 rounded-2xl border border-border text-center">
                  <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-surface shadow-md bg-surface mb-2">
                    <img
                      src={previewPhoto || '/media/campaign/default_profile.png'}
                      alt="Pratinjau Foto Profil"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'https://ui-avatars.com/api/?name=AF+Blast&background=0B1220&color=fff'
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-text">Pratinjau Avatar</span>
                  <span className="text-[10px] text-muted">Rasio 1:1 Lingkaran</span>
                </div>

                <div className="md:col-span-8 space-y-2">
                  <label className="text-xs font-bold text-text block">
                    Upload Foto Profil Resmi (Maks. 2 MB)
                  </label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(false)
                      if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0])
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
                      dragOver
                        ? 'border-primary bg-primary-soft'
                        : 'border-border hover:border-primary/50 bg-surface-2',
                    ].join(' ')}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileChange(e.target.files[0])
                      }}
                    />
                    <UploadCloud className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-xs sm:text-sm font-semibold text-text">
                      Klik atau seret berkas foto profil ke sini
                    </p>
                    <p className="text-[11px] text-muted mt-1">
                      Format didukung: JPEG, PNG, WEBP (Maksimal 2 MB)
                    </p>
                  </div>
                </div>
              </div>

              {/* Daftar Pilihan Nama WhatsApp (Chips Tag) */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-text block">
                  Daftar Pilihan Nama WhatsApp (Member dapat memilih dan menyalin)
                </label>

                {/* Input Tambah Tag */}
                <form onSubmit={handleAddName} className="flex gap-2 max-w-lg">
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    placeholder="Contoh: CS AF Blast Official"
                    className="flex-1 h-10 px-4 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-xs sm:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    + Tambah Nama
                  </button>
                </form>

                {/* Daftar Tag Pilihan */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {nameOptions.map((name, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-soft border border-primary/20 text-primary-text text-xs font-mono font-medium shadow-2xs"
                    >
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveName(idx)}
                        className="p-0.5 rounded-md hover:bg-primary/20 text-primary-text"
                        title="Hapus nama"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {nameOptions.length === 0 && (
                    <p className="text-xs text-muted italic">
                      Belum ada pilihan nama. Tambahkan nama di atas.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. SEKSI TEKS PEMBERITAHUAN & TAUTAN CHANNEL */}
            <div className="bg-surface rounded-2xl border border-border shadow-xs p-6 sm:p-8 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-text">
                  Teks Pemberitahuan & Saluran Resmi
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Informasi instruksi yang wajib ditaati member pengirim pesan blast.
                </p>
              </div>

              {/* Teks Pemberitahuan */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text block">
                  Teks Pemberitahuan (Notice)
                </label>
                <textarea
                  rows={3}
                  value={notice}
                  onChange={(e) => setNotice(e.target.value)}
                  placeholder="Gunakan nama dan foto profil resmi AF Blast saat menjalankan sesi blast pesan agar akun tetap terpercaya..."
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-xs sm:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden leading-relaxed"
                />
              </div>

              {/* Tautan Channel WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text block">
                  Tautan Saluran Resmi WhatsApp (Channel URL)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://whatsapp.com/channel/..."
                    className="w-full h-10 px-4 rounded-xl border border-border bg-surface-2 text-text placeholder:text-muted text-xs sm:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden font-mono"
                  />
                  {channelUrl && (
                    <a
                      href={channelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* 3. SEKSI PENGATURAN PERANGKAT & JEDA BLAST */}
            <div className="bg-surface rounded-2xl border border-border shadow-xs p-6 sm:p-8 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-text">
                  Pengaturan Perangkat & Jeda Pengiriman Pesan
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Atur kuota tautan maksimal per akun member dan jeda acak antrean blast untuk menghindari deteksi spam WhatsApp.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Batas Perangkat */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-surface-2 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-primary" />
                    <label className="text-xs font-bold text-text">
                      Batas Perangkat / Member
                    </label>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={maxPerMember}
                    onChange={(e) => setMaxPerMember(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-10 px-4 rounded-xl bg-surface border border-border text-sm font-bold font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                  <p className="text-[11px] text-muted">Default: 3 perangkat</p>
                </div>

                {/* Jeda Min */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-surface-2 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-success" />
                    <label className="text-xs font-bold text-text">
                      Jeda Minimal (detik)
                    </label>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={delayMin}
                    onChange={(e) => setDelayMin(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-10 px-4 rounded-xl bg-surface border border-border text-sm font-bold font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                  <p className="text-[11px] text-muted">Jeda acak minimum per pesan</p>
                </div>

                {/* Jeda Max */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-surface-2 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-danger" />
                    <label className="text-xs font-bold text-text">
                      Jeda Maksimal (detik)
                    </label>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={delayMax}
                    onChange={(e) => setDelayMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-10 px-4 rounded-xl bg-surface border border-border text-sm font-bold font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                  <p className="text-[11px] text-muted">Jeda acak maksimum per pesan</p>
                </div>
              </div>
            </div>

            {/* Tombol Simpan */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-2 h-11 px-8 rounded-xl bg-primary hover:bg-primary-hover active:bg-blue-800 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {updateMutation.isPending ? 'Menyimpan Pengaturan...' : 'Simpan Seluruh Aturan Profil'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Can>
  )
}
