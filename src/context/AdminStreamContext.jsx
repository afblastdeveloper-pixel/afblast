import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { apiFetch, buildApiUrl } from '../utils/client'

const AdminStreamContext = createContext({
  isConnected: false,
  reconnectCount: 0,
  lastEventAt: null,
  reconnect: () => {},
})

/**
 * AdminStreamProvider – Mengelola sambungan SSE tunggal ber-tiket untuk seluruh admin portal.
 * - Tiket aman single-use (POST /api/admin/stream/ticket)
 * - Auto-reconnect dengan exponential backoff + jitter
 * - Memperbarui cache React Query secara langsung (setQueryData) tanpa layout shift
 * - Fallback polling 15 detik saat koneksi terputus
 */
export function AdminStreamProvider({ children }) {
  const { user, token } = useAuth()
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [lastEventAt, setLastEventAt] = useState(null)

  const esRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const pollingIntervalRef = useRef(null)
  const delayRef = useRef(1500)
  const isConnectingRef = useRef(false)

  const isStaff = Boolean(
    token && user && ['superadmin', 'admin', 'developer', 'adminfinance'].includes(user.role)
  )

  // Dispatcher untuk memperbarui cache React Query secara instan
  const handleEventPayload = useCallback((eventType, data) => {
    setLastEventAt(Date.now())

    if (!data) return

    if (eventType === 'stats_update') {
      queryClient.setQueryData(['admin-dashboard'], (old) => {
        if (!old) return old
        return {
          ...old,
          stats: {
            ...old.stats,
            ...(data.stats || {}),
            memberIncome: {
              ...(old.stats?.memberIncome || {}),
              ...(data.memberIncome || {}),
            },
          },
          targetInfo: {
            ...(old.targetInfo || {}),
            ...(data.targetInfo || {}),
          },
        }
      })
    } else if (eventType === 'target_progress') {
      // Perbarui targetInfo di dashboard & statistik targets
      queryClient.setQueryData(['admin-dashboard'], (old) => {
        if (!old) return old
        const total = Number(data.totalUpload ?? old.targetInfo?.totalUpload ?? 0)
        const succ = Number(data.success ?? old.targetInfo?.success ?? 0)
        const fail = Number(data.failed ?? old.targetInfo?.failed ?? 0)
        const successPct = total > 0 ? Number(((succ / total) * 100).toFixed(1)) : 0
        const failedPct = total > 0 ? Number(((fail / total) * 100).toFixed(1)) : 0

        return {
          ...old,
          targetInfo: {
            ...old.targetInfo,
            ...data,
            successPct,
            failedPct,
          },
        }
      })
      queryClient.setQueryData(['admin-targets-stats'], (old) => {
        if (!old) return data
        return { ...old, ...data }
      })
    } else if (eventType === 'withdrawal_update') {
      // Perbarui metrik penarikan
      queryClient.setQueryData(['admin-dashboard'], (old) => {
        if (!old) return old
        return {
          ...old,
          stats: {
            ...old.stats,
            pendingWithdrawalsCount: data.pendingCount ?? old.stats?.pendingWithdrawalsCount,
            pendingWithdrawalsAmount: data.pendingAmount ?? old.stats?.pendingWithdrawalsAmount,
            memberIncome: {
              ...old.stats?.memberIncome,
              withdrawnTotal: data.totalWithdrawn ?? old.stats?.memberIncome?.withdrawnTotal,
            },
          },
        }
      })
      queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['admin-payment-groups'], exact: false })
    } else if (eventType === 'campaign_update') {
      // Perbarui progress kampanye di cache kampanye
      queryClient.setQueryData(['admin-campaigns'], (old) => {
        if (!old) return old
        if (Array.isArray(old)) {
          return old.map((c) => (c.id === data.id ? { ...c, ...data } : c))
        }
        if (old.campaigns && Array.isArray(old.campaigns)) {
          return {
            ...old,
            campaigns: old.campaigns.map((c) => (c.id === data.id ? { ...c, ...data } : c)),
          }
        }
        return old
      })
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', data.id] })
    } else if (eventType === 'device_update') {
      queryClient.setQueryData(['admin-dashboard'], (old) => {
        if (!old) return old
        return {
          ...old,
          stats: {
            ...old.stats,
            activeDevices: data.activeCount ?? old.stats?.activeDevices,
            totalDevices: data.totalCount ?? old.stats?.totalDevices,
          },
        }
      })
    }
  }, [queryClient])

  // Inisialisasi SSE Connection
  const connectSSE = useCallback(async () => {
    if (!isStaff) return
    if (isConnectingRef.current) return

    // Tutup koneksi sebelumnya jika ada
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    isConnectingRef.current = true

    try {
      // 1. Ambil Single-use ticket dari server
      const ticketRes = await apiFetch('/api/admin/stream/ticket', { method: 'POST' })
      if (!ticketRes.ok) {
        throw new Error(`Gagal membuat tiket stream: ${ticketRes.status}`)
      }
      const ticketData = await ticketRes.json()
      const ticket = ticketData.ticket
      if (!ticket) {
        throw new Error('Tiket SSE kosong')
      }

      // 2. Buat koneksi EventSource
      const streamUrl = buildApiUrl(`/api/admin/stream?ticket=${encodeURIComponent(ticket)}`)
      const es = new EventSource(streamUrl)
      esRef.current = es

      es.addEventListener('connected', () => {
        setIsConnected(true)
        delayRef.current = 1500 // Reset backoff saat berhasil
        setLastEventAt(Date.now())
      })

      es.addEventListener('ping', () => {
        setLastEventAt(Date.now())
      })

      // Listener event-event bisnis
      const eventNames = [
        'stats_update',
        'target_progress',
        'withdrawal_update',
        'campaign_update',
        'device_update',
      ]

      eventNames.forEach((evtName) => {
        es.addEventListener(evtName, (e) => {
          try {
            const parsed = JSON.parse(e.data)
            handleEventPayload(evtName, parsed)
          } catch (err) {
            console.warn(`[SSE] Gagal mem-parse data ${evtName}:`, err)
          }
        })
      })

      es.onerror = () => {
        setIsConnected(false)
        if (esRef.current) {
          esRef.current.close()
          esRef.current = null
        }
        scheduleReconnect()
      }
    } catch (err) {
      setIsConnected(false)
      scheduleReconnect()
    } finally {
      isConnectingRef.current = false
    }
  }, [isStaff, handleEventPayload])

  // Jadwalkan auto-reconnect dengan exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (!isStaff) return
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)

    setReconnectCount((c) => c + 1)
    const currentDelay = delayRef.current
    const jitter = Math.floor(Math.random() * 800)
    const nextWait = currentDelay + jitter

    // Exponential backoff maksimal 30 detik
    delayRef.current = Math.min(30000, Math.floor(currentDelay * 1.5))

    retryTimeoutRef.current = setTimeout(() => {
      connectSSE()
    }, nextWait)
  }, [isStaff, connectSSE])

  // Manual reconnect trigger
  const reconnect = useCallback(() => {
    delayRef.current = 1000
    connectSSE()
  }, [connectSSE])

  // Lifecycle koneksi SSE
  useEffect(() => {
    if (isStaff) {
      connectSSE()
    } else {
      setIsConnected(false)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [isStaff, connectSSE])

  // Fallback Polling 15 Detik:
  // Berjalan saat terputus untuk menjaga keakuratan data
  useEffect(() => {
    if (!isStaff) return

    pollingIntervalRef.current = setInterval(() => {
      if (!isConnected) {
        // Hanya trigger refetch dashboard & withdrawals jika SSE terputus
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
        queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] })
        queryClient.invalidateQueries({ queryKey: ['admin-targets-stats'] })
      }
    }, 15000)

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    }
  }, [isStaff, isConnected, queryClient])

  return (
    <AdminStreamContext.Provider
      value={{
        isConnected,
        reconnectCount,
        lastEventAt,
        reconnect,
      }}
    >
      {children}
    </AdminStreamContext.Provider>
  )
}

/**
 * Hook useAdminStream
 * Memberikan status koneksi SSE realtime dan fungsi reconnect
 */
export function useAdminStream() {
  return useContext(AdminStreamContext)
}

export default AdminStreamContext
