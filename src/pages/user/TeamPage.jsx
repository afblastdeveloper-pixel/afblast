import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Copy,
  Check,
  Share2,
  Smartphone,
  Send,
  UserCheck,
  AlertCircle,
  RefreshCw,
  Search,
  Gift,
  UserPlus,
  ShieldCheck,
  Sparkles,
  HeartHandshake,
} from 'lucide-react'
import { apiFetch } from '../../utils/client'
import { BRAND } from '../../config/brand'

export default function TeamPage() {
  const { t } = useTranslation()
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'active' | 'idle'

  const {
    data: responseData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['memberAffiliateTeam'],
    queryFn: async () => {
      const res = await apiFetch('/api/member/team')
      if (!res.ok) throw new Error('Gagal memuat data tim afiliasi pertemanan')
      return res.json()
    },
    staleTime: 30000,
  })

  const myReferralCode = responseData?.myReferralCode || ''
  const referralLink =
    responseData?.referralLink ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${myReferralCode}`
      : '')
  const referrer = responseData?.referrer || null
  const stats = responseData?.stats || {
    totalFriends: 0,
    activeFriends: 0,
    totalTeamDevices: 0,
    totalTeamMessages: 0,
  }
  const teamList = responseData?.team || []

  // Filter friends list based on search and status tab
  const filteredTeam = useMemo(() => {
    return teamList.filter((friend) => {
      const matchesSearch =
        (friend.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (friend.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (friend.maskedEmail || '').toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchesSearch) return false

      if (filterTab === 'active') return friend.status === 'active'
      if (filterTab === 'idle') return friend.status !== 'active'
      return true
    })
  }, [teamList, searchQuery, filterTab])

  const handleCopyCode = async () => {
    if (!myReferralCode) return
    try {
      await navigator.clipboard.writeText(myReferralCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (err) {
      console.warn('Gagal menyalin kode:', err)
    }
  }

  const handleCopyLink = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch (err) {
      console.warn('Gagal menyalin link:', err)
    }
  }

  const handleShareWhatsApp = () => {
    if (!referralLink) return
    const text = `Halo! Yuk gabung bersama saya di ${BRAND.name} untuk automasi WhatsApp Broadcast. Gunakan kode referral saya: *${myReferralCode}* atau langsung daftar lewat tautan: ${referralLink}`
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(waUrl, '_blank')
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(dateString))
    } catch {
      return dateString
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-slate-700/50">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -top-12 w-64 h-64 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-semibold uppercase tracking-wider border border-emerald-500/30">
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>Jaringan Pertemanan & Afiliasi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Tim Afiliasi Pertemanan
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Setiap teman yang bergabung menggunakan kode referral Anda otomatis menjadi bagian dari tim Anda.
              Tumbuh dan kelola jaringan broadcast bersama untuk performa maksimal!
            </p>
          </div>

          {/* Pengundang (Upline / Referrer) Status Badge */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 max-w-xs shrink-0">
            <p className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider mb-1">
              Status Pengundang Anda
            </p>
            {referrer ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center font-bold text-emerald-200">
                  {referrer.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-bold text-white truncate">{referrer.name}</p>
                  <p className="text-xs text-slate-300">
                    {referrer.username ? `@${referrer.username}` : 'Teman Pengundang'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-200 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Akun Utama (Direct Member)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Referral Hub & Sharing Actions */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-gray-900">Kode Referral & Tautan Tim Anda</h2>
            </div>
            <p className="text-xs sm:text-sm text-gray-500">
              Bagikan kode atau tautan unik di bawah ini kepada teman, rekan bisnis, atau komunitas Anda.
            </p>
          </div>

          {/* Quick Sharing Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Bagikan ke WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Tersalin!' : 'Salin Tautan'}</span>
            </button>
          </div>
        </div>

        {/* Code & Link Display Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Referral Code Box */}
          <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/40 p-4 sm:p-5 rounded-2xl border border-emerald-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
                Kode Referral Pribadi
              </p>
              <p className="text-2xl sm:text-3xl font-black text-gray-900 tracking-wider font-mono">
                {myReferralCode || '...'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!myReferralCode}
              className="p-3 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/80 shadow-xs transition-all active:scale-95 shrink-0"
              title="Salin Kode Referral"
            >
              {copiedCode ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          {/* Referral Link Box */}
          <div className="bg-gray-50/80 p-4 sm:p-5 rounded-2xl border border-gray-200/70 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 truncate">
                Tautan Pendaftaran Otomatis
              </p>
              <p className="text-xs sm:text-sm text-gray-800 font-mono truncate select-all">
                {referralLink || 'Memuat tautan...'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!referralLink}
              className="p-3 bg-white hover:bg-gray-100 text-gray-700 rounded-xl border border-gray-200 shadow-xs transition-all active:scale-95 shrink-0"
              title="Salin Tautan"
            >
              {copiedLink ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Stat 1: Total Teman */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Teman
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {stats.totalFriends}
          </p>
          <p className="text-xs text-gray-400 mt-1">Mendaftar lewat referral Anda</p>
        </div>

        {/* Stat 2: Teman Aktif */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Teman Aktif
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
            {stats.activeFriends}
          </p>
          <p className="text-xs text-gray-400 mt-1">Memiliki perangkat WhatsApp online</p>
        </div>

        {/* Stat 3: Perangkat WhatsApp Tim */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Perangkat Tim
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {stats.totalTeamDevices}
          </p>
          <p className="text-xs text-gray-400 mt-1">Nomor WhatsApp pengirim tim</p>
        </div>

        {/* Stat 4: Pesan Tim Terkirim */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Pesan Diproses
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {stats.totalTeamMessages}
          </p>
          <p className="text-xs text-gray-400 mt-1">Total pesan sukses dalam tim</p>
        </div>
      </div>

      {/* Friendship Network List / Table Section */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">
              Daftar Teman dalam Tim ({filteredTeam.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pantau aktivitas teman dan keaktifan nomor WhatsApp dalam tim pertemanan Anda.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Filter Tabs */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('active')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'active' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('idle')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'idle' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Menunggu
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama teman..."
                className="w-full sm:w-48 ps-9 pe-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="p-10 space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-gray-100 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded-md w-1/3" />
                  <div className="h-3 bg-gray-100 rounded-md w-1/4" />
                </div>
                <div className="h-8 bg-gray-100 rounded-xl w-24 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-rose-700">
              {error?.message || 'Gagal memuat daftar tim'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold shadow-xs hover:bg-rose-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && filteredTeam.length === 0 && (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <UserPlus className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <p className="text-base font-bold text-gray-800">
                {teamList.length === 0
                  ? 'Belum ada teman di tim afiliasi Anda'
                  : 'Tidak ada teman yang cocok dengan filter'}
              </p>
              <p className="text-xs sm:text-sm text-gray-400">
                {teamList.length === 0
                  ? 'Ajak rekan, sahabat, atau komunitas Anda mendaftar menggunakan kode referral Anda untuk mulai membangun tim broadcast.'
                  : 'Coba ubah kata kunci pencarian atau ganti filter status.'}
              </p>
            </div>
            {teamList.length === 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Ajak Teman Sekarang</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Team Table */}
        {!isLoading && !isError && filteredTeam.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Teman</th>
                  <th className="py-3.5 px-6">Bergabung</th>
                  <th className="py-3.5 px-6 text-center">Perangkat WhatsApp</th>
                  <th className="py-3.5 px-6 text-center">Pesan Diproses</th>
                  <th className="py-3.5 px-6 text-end">Status Tim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredTeam.map((member) => {
                  const initial = (member.name || 'U').charAt(0).toUpperCase()
                  const isOnline = member.activeDevices > 0

                  return (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Name & Contact */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{member.name}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {member.username ? `@${member.username} • ` : ''}
                              {member.maskedEmail}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="py-4 px-6 text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(member.joinedAt)}
                      </td>

                      {/* Devices Count */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          <Smartphone className="w-3.5 h-3.5 text-gray-500" />
                          <span>{member.activeDevices} Terhubung</span>
                        </div>
                      </td>

                      {/* Processed Messages */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <span className="font-semibold text-gray-800 text-xs">
                          {member.sentMessages.toLocaleString('id-ID')}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-6 text-end whitespace-nowrap">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Aktif</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <span>Menunggu</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How it Works / 3-Step Guide */}
      <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-3xl p-6 sm:p-8 border border-emerald-100/60">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base sm:text-lg font-bold text-gray-900">
            Cara Kerja Tim Afiliasi Pertemanan
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
              1
            </div>
            <h4 className="font-bold text-gray-900 text-sm">Bagikan Kode Referral</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Kirimkan tautan pendaftaran atau kode referral unik Anda kepada teman, relasi, atau komunitas WhatsApp.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-primary font-bold flex items-center justify-center text-sm">
              2
            </div>
            <h4 className="font-bold text-gray-900 text-sm">Teman Mendaftar Akun</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Saat teman Anda menyelesaikan registrasi dengan kode Anda, mereka langsung terhubung sebagai tim afiliasi Anda.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-sm">
              3
            </div>
            <h4 className="font-bold text-gray-900 text-sm">Kolaborasi & Tumbuh Bersama</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Pantau perangkat yang aktif dan volume pesan tim Anda. Bersama-sama ciptakan jaringan broadcast yang solid!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
