import { useEffect, useRef, useState, useCallback } from 'react'

export type PushEvent = {
  type: 'incident.created' | 'incident.resolved' | 'trace.error'
  id: string
  title: string
  severity?: string
  agent_id?: string
  trace_id?: string
  timestamp: string
  data?: Record<string, unknown>
}

const SEV_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
}

const STORAGE_KEY = 'orion_push_enabled'

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  // App-level toggle — persisted in localStorage so it survives refresh
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false' } catch { return true }
  })
  const [events, setEvents] = useState<PushEvent[]>([])
  const [unread, setUnread] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      setPushEnabled(true)
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }, [])

  const enablePush = useCallback(() => {
    setPushEnabled(true)
    localStorage.setItem(STORAGE_KEY, 'true')
  }, [])

  const disablePush = useCallback(() => {
    setPushEnabled(false)
    localStorage.setItem(STORAGE_KEY, 'false')
  }, [])

  const markRead = useCallback(() => setUnread(0), [])

  const fire = useCallback((evt: PushEvent) => {
    setEvents(prev => [evt, ...prev].slice(0, 50))
    setUnread(n => n + 1)

    // Only show OS notification if permission granted AND user hasn't turned it off
    if (permission !== 'granted' || !pushEnabled) return

    const icon = SEV_ICON[evt.severity ?? ''] ?? '⚡'
    const body =
      evt.type === 'incident.created'
        ? `${icon} ${evt.severity?.toUpperCase()} · Agent: ${evt.agent_id ?? 'unknown'}`
        : evt.type === 'incident.resolved'
        ? `✅ Resolved · ${evt.agent_id ?? ''}`
        : `Trace error on ${evt.agent_id ?? 'unknown'}`

    new Notification(evt.title, {
      body,
      icon: '/favicon.ico',
      tag: evt.id,
      silent: evt.severity === 'low',
    })
  }, [permission, pushEnabled])

  // SSE connection
  useEffect(() => {
    const connect = () => {
      if (esRef.current) esRef.current.close()
      const token = localStorage.getItem('orion_access_token') ?? ''
      const es = new EventSource(`/api/v1/events?token=${encodeURIComponent(token)}`)
      esRef.current = es
      es.onmessage = (e) => {
        try { fire(JSON.parse(e.data) as PushEvent) } catch { /* heartbeat */ }
      }
      es.onerror = () => {
        es.close()
        setTimeout(connect, 5_000)
      }
    }
    connect()
    return () => esRef.current?.close()
  }, [fire])

  return { permission, pushEnabled, requestPermission, enablePush, disablePush, events, unread, markRead }
}
