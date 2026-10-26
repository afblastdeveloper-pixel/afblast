import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react'
import { useAuth } from './AuthContext'
import { apiFetch } from '../utils/client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
})

const ConfigContext = createContext(null)

/**
 * Fetcher untuk /api/config
 */
async function fetchConfig() {
  const res = await apiFetch('/api/config')
  if (!res.ok) {
    throw new Error('Gagal mengambil konfigurasi aplikasi')
  }
  return res.json()
}

/**
 * Komponen Banner Pembaruan Versi Aplikasi
 */
function UpdateBanner({ version, onReload }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2.5 shadow-lg flex items-center justify-between text-xs sm:text-sm font-medium animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-white flex-shrink-0" />
        <span>
          Pembaruan sistem tersedia <strong>({typeof version === 'object' ? version?.version : version})</strong>. Muat ulang aplikasi untuk mendapatkan fitur terbaru.
        </span>
      </div>
      <button
        type="button"
        onClick={onReload}
        className="px-3 py-1 bg-white text-orange-600 hover:bg-orange-50 font-semibold rounded-lg shadow-xs text-xs transition-colors flex-shrink-0 ms-3"
      >
        Muat Ulang
      </button>
    </div>
  )
}

/**
 * Layar Mode Pemeliharaan (Maintenance Screen)
 */
function MaintenanceScreen({ message }) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
          <Wrench className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
          Sistem Sedang Dalam Pemeliharaan
        </h1>
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          {message || 'Kami sedang melakukan pembaruan rutin untuk meningkatkan layanan. Mohon tunggu beberapa saat.'}
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 text-xs text-slate-400 border border-slate-600/50">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Status: Maintenance Mode</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Inner Provider yang terhubung dengan React Query
 */
function ConfigProviderInner({ children }) {
  const { token, role } = useAuth()
  const initialVersionRef = useRef(null)
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  const {
    data: configData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['systemConfig', token],
    queryFn: () => fetchConfig(token),
    refetchInterval: 60000, // Refetch otomatis setiap 60 detik
    refetchOnWindowFocus: true, // Refetch otomatis saat jendela fokus
  })

  const flags = configData?.flags || {}
  const theme = configData?.theme || 'light'
  const maintenance = configData?.maintenance || { enabled: false, message: '' }
  const version = configData?.version || '1.0.0'
  const menu = configData?.menu || []

  // 1. Terapkan Tema (CSS Variable & Class)
  useEffect(() => {
    if (!theme) return

    let primaryColor = '#10B981' // default emerald
    let isDark = false

    if (typeof theme === 'string') {
      if (theme === 'dark') isDark = true
    } else if (typeof theme === 'object') {
      if (theme.primaryColor) primaryColor = theme.primaryColor
      if (theme.mode === 'dark') isDark = true
    }

    document.documentElement.style.setProperty('--brand-primary', primaryColor)

    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // 2. Deteksi Perubahan Versi Aplikasi
  useEffect(() => {
    if (!configData?.version) return

    const currentVer = typeof configData.version === 'object' ? configData.version.version : configData.version

    if (!initialVersionRef.current) {
      initialVersionRef.current = currentVer
    } else if (initialVersionRef.current !== currentVer) {
      setIsUpdateAvailable(true)
    }
  }, [configData?.version])

  const handleReload = () => {
    window.location.reload()
  }

  // 3. Cek Mode Maintenance:
  // Hanya role superadmin dan developer yang boleh melewati layar maintenance
  const isBypassRole = role === 'superadmin' || role === 'developer'
  const isMaintenanceActive = Boolean(maintenance.enabled)

  if (isMaintenanceActive && !isBypassRole) {
    return <MaintenanceScreen message={maintenance.message} />
  }

  const value = {
    flags,
    theme,
    maintenance,
    version,
    menu,
    isUpdateAvailable,
    isLoading,
    refetchConfig: refetch,
  }

  return (
    <ConfigContext.Provider value={value}>
      {/* Banner pembaruan versi jika server merilis versi baru */}
      {isUpdateAvailable && (
        <UpdateBanner version={version} onReload={handleReload} />
      )}

      {/* Indikator pemeliharaan untuk Superadmin & Developer */}
      {isMaintenanceActive && isBypassRole && (
        <div className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-b border-amber-500/30 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Mode Maintenance Sedang Aktif (Hanya terlihat oleh Superadmin & Developer)</span>
        </div>
      )}

      {children}
    </ConfigContext.Provider>
  )
}

/**
 * Root ConfigProvider yang membungkus QueryClientProvider
 */
export function ConfigProvider({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProviderInner>{children}</ConfigProviderInner>
    </QueryClientProvider>
  )
}

/**
 * Hook untuk menggunakan konfigurasi sistem
 */
export function useConfig() {
  const context = useContext(ConfigContext)
  if (!context) {
    throw new Error('useConfig harus digunakan di dalam <ConfigProvider>')
  }
  return context
}

/**
 * Hook untuk memeriksa apakah Feature Flag tertentu aktif
 * @param {string} flagKey
 * @returns {boolean}
 */
export function useFeatureFlag(flagKey) {
  const { flags } = useConfig()
  if (!flagKey) return true
  return Boolean(flags[flagKey])
}

export default ConfigContext
