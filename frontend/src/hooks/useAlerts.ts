/**
 * useAlerts — global alert polling hook
 *
 * Mount once in Layout.tsx. Every 4 seconds it polls /api/alerts for
 * unread alerts and fires react-hot-toast notifications for new ones.
 * Returns the current unread count for the sidebar badge.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'

interface Alert {
  id:        number
  type:      string
  level:     string   // INFO | WARNING | CRITICAL
  title:     string
  message:   string
  strategy:  string | null
  detail:    string
  read:      boolean
  timestamp: string
}

const POLL_INTERVAL = 4000   // ms
const STORAGE_KEY   = 'tao_last_seen_alert_id'

function getLevelStyle(level: string): { background: string; color: string; border: string } {
  switch (level) {
    case 'CRITICAL':
      return { background: '#152030', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }
    case 'WARNING':
      return { background: '#152030', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }
    default:
      return { background: '#152030', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
  }
}

function getLevelDuration(level: string): number {
  switch (level) {
    case 'CRITICAL': return 6000   // drawdown — serious, needs time to register
    case 'WARNING':  return 4000   // regime / demotion — noted and gone
    default:         return 2500   // info / promotion — positive FYI, clear fast
  }
}

export function useAlerts() {
  const [unreadCount, setUnreadCount] = useState(0)
  const initialized                   = useRef(false)
  const lastSeenId = useRef<number>(
    parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10)
  )

  const poll = useCallback(async () => {
    if (!initialized.current) return   // don't toast until seed is done
    try {
      const res  = await fetch('/api/alerts?limit=20')
      if (!res.ok) return
      const data = await res.json()

      // Update badge count
      setUnreadCount(data.unread_count ?? 0)

      // Find alerts newer than last seen
      const alerts: Alert[] = data.alerts ?? []
      const newAlerts = alerts.filter(
        a => a.id > lastSeenId.current && !a.read
      )

      if (newAlerts.length === 0) return

      // Update last seen to highest ID
      const maxId = Math.max(...newAlerts.map(a => a.id))
      lastSeenId.current = maxId
      localStorage.setItem(STORAGE_KEY, String(maxId))

      // Fire toasts — newest last (so they stack oldest→newest), cap at 3
      const toShow = [...newAlerts].reverse().slice(0, 3)
      for (const alert of toShow) {
        const style = getLevelStyle(alert.level)
        const text  = alert.strategy
          ? `${alert.title}\n↳ ${alert.strategy}`
          : alert.title

        toast(text, {
          id:       `alert-${alert.id}`,
          duration: getLevelDuration(alert.level),
          style: {
            ...style,
            fontFamily: '"Space Grotesk", system-ui',
            fontSize:   12,
            padding:    '10px 14px',
            maxWidth:   380,
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
          },
        })
      }
    } catch (_) {
      // Silently fail — alert polling should never break the app
    }
  }, [])

  // Seed last seen ID on mount from current state (avoid toasting old alerts on page load)
  useEffect(() => {
    const seedInitial = async () => {
      try {
        const res  = await fetch('/api/alerts?limit=1')
        if (!res.ok) return
        const data = await res.json()
        const latest: Alert | undefined = data.alerts?.[0]

        if (latest) {
          // If stored ID is higher than the latest alert ID, the backend
          // restarted and reset its ring buffer — clear stored value so
          // we don't miss any new alerts going forward
          if (lastSeenId.current > latest.id) {
            lastSeenId.current = 0
            localStorage.removeItem(STORAGE_KEY)
          } else {
            // Normal case — seed to latest so we don't toast old backlog
            lastSeenId.current = latest.id
            localStorage.setItem(STORAGE_KEY, String(latest.id))
          }
        }
        setUnreadCount(data.unread_count ?? 0)
      } catch (_) {}
      finally { initialized.current = true }
    }
    seedInitial()
  }, [])

  // Polling loop
  useEffect(() => {
    const t = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [poll])

  const refresh = useCallback(() => poll(), [poll])

  return { unreadCount, refresh }
}