import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { apiFetch, buildApiUrl, getActiveToken } from '../utils/client'

const MemberStreamContext = createContext({
  isConnected: false,
  reconnectCount: 0,
  lastEventAt: null,
  lastEventData: null,
  reconnect: () => {},
})

/**
 * MemberStreamProvider – Mengelola sambungan SSE tunggal ber-tiket untuk seluruh portal member.
 * - Tiket sekali pakai (POST /api/member/stream/ticket)
 * - Auto-reconnect dengan backoff + jitter
 * - Memperbarui cache React Query secara langsung (setQueryData) tanpa flicker
 * - Mendukung event device.status, device.progress, engine.stopped, pool.stats
 */
export function MemberStreamProvider({ children }) {
  const { user, token } = useAuth()
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [lastEventAt, setLastEventAt] = useState(null)
  const [lastEventData, setLastEventData] = useState(null)

  const esRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const delayRef = useRef(1500)
  const isConnectingRef = useRef(false)

  const isMember = Boolean(token || getActiveToken())

  const handleEventPayload = useCallback((eventType, data) => {
    setLastEventAt(Date.now())
    setLastEventData({ event: eventType, data })

    if (!data) return

    if (eventType === 'device.progress') {
      // Perbarui progress run perangkat di cache overview & devices
      queryClient.setQueryData(['memberWhatsappOverview'], (old) => {
        if (!old || !old.devices) return old
        const updatedDevices = old.devices.map((d) => {
          if (d.id === data.deviceId) {
            return {
              ...d,
              activeRun: d.activeRun ? {
                ...d.activeRun,
                sent: data.sent ?? d.activeRun.sent,
                success: data.success ?? d.activeRun.success,
                failed: data.failed ?? d.activeRun.failed,
                earned: data.earned ?? d.activeRun.earned,
              } : null,
            }
          }
          return d
        })
        return { ...old, devices: updatedDevices }
      })
    } else if (eventType === 'device.status' || eventType === 'engine.stopped') {
      // Invalidate query agar data overview & devices tersinkronisasi akurat
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappOverview'] })
      queryClient.invalidateQueries({ queryKey: ['memberDevices'] })
      queryClient.invalidateQueries({ queryKey: ['memberWhatsappSummary'] })
    } else if (eventType === 'pool.stats') {
      queryClient.setQueryData(['memberWhatsappOverview'], (old) => {
        if (!old) return old
        return {
          ...old,
          remainingData: data.remaining ?? old.remainingData,
        }
      })
    }
  }, [queryClient])

  const connect = useCallback(async () => {
    if (!isMember || isConnectingRef.current) return
    isConnectingRef.current = true

    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    try {
      const ticketRes = await apiFetch('/api/member/stream/ticket', { method: 'POST' })
      if (!ticketRes.ok) {
        throw new Error(`Gagal membuat tiket stream member: ${ticketRes.status}`)
      }
      const { ticket } = await ticketRes.json()

      const streamUrl = buildApiUrl(`/api/member/stream?ticket=${encodeURIComponent(ticket)}`)
      const es = new EventSource(streamUrl)
      esRef.current = es

      es.onopen = () => {
        setIsConnected(true)
        isConnectingRef.current = false
        delayRef.current = 1500
      }

      const registeredEvents = [
        'device.status',
        'device.progress',
        'engine.stopped',
        'pool.stats',
        'heartbeat',
      ]

      registeredEvents.forEach((evt) => {
        es.addEventListener(evt, (e) => {
          try {
            const parsed = e.data ? JSON.parse(e.data) : null
            handleEventPayload(evt, parsed)
          } catch (err) {
            console.warn(`[Member SSE] Gagal parse payload untuk event ${evt}:`, err)
          }
        })
      })

      es.onerror = () => {
        setIsConnected(false)
        isConnectingRef.current = false
        es.close()
        esRef.current = null

        // Exponential backoff dengan jitter
        const jitter = Math.random() * 500
        const nextDelay = Math.min(delayRef.current * 1.5 + jitter, 15000)
        delayRef.current = nextDelay

        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          setReconnectCount((c) => c + 1)
          connect()
        }, nextDelay)
      }
    } catch (err) {
      isConnectingRef.current = false
      setIsConnected(false)

      const jitter = Math.random() * 500
      const nextDelay = Math.min(delayRef.current * 1.5 + jitter, 15000)
      delayRef.current = nextDelay

      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = setTimeout(() => {
        setReconnectCount((c) => c + 1)
        connect()
      }, nextDelay)
    }
  }, [isMember, handleEventPayload])

  useEffect(() => {
    if (isMember) {
      connect()
    } else {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setIsConnected(false)
    }

    return () => {
      clearTimeout(retryTimeoutRef.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [isMember, connect])

  return (
    <MemberStreamContext.Provider
      value={{
        isConnected,
        reconnectCount,
        lastEventAt,
        lastEventData,
        reconnect: connect,
      }}
    >
      {children}
    </MemberStreamContext.Provider>
  )
}

export function useMemberStream() {
  return useContext(MemberStreamContext)
}

export default MemberStreamContext
