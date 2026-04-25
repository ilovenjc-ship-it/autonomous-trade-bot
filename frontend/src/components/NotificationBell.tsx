/**
 * NotificationBell — Floating notification center
 *
 * A bell icon in the top-right corner of the main content area.
 * Shows unread count badge. Clicking opens a slide-down panel with
 * the last 20 alerts, mark-all-read, and links to the full inbox.
 *
 * This component makes the platform feel truly autonomous — the bot
 * reaches out to the user, not the other way around.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, CheckCheck, Zap, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import api from '@/api/client'

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

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)  return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function levelColor(level: string) {
  switch (level) {
    case 'CRITICAL': return { dot: 'bg-red-400',    text: 'text-red-400',    border: 'border-red-500/25' }
    case 'WARNING':  return { dot: 'bg-amber-400',  text: 'text-amber-400',  border: 'border-amber-500/25' }
    default:         return { dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/25' }
  }
}

function levelIcon(level: string) {
  switch (level) {
    case 'CRITICAL': return <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />
    case 'WARNING':  return <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
    default:         return <Info size={11} className="text-emerald-400 flex-shrink-0" />
  }
}

export default function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [open,   setOpen]   = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/alerts?limit=20')
      setAlerts(r.data.alerts ?? [])
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  // Fetch when panel opens
  useEffect(() => {
    if (open) fetchAlerts()
  }, [open, fetchAlerts])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markAllRead = async () => {
    try {
      await api.post('/alerts/read-all')
      setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    } catch (_) {}
  }

  const markRead = async (id: number) => {
    try {
      await api.post(`/alerts/${id}/read`)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
    } catch (_) {}
  }

  const unread = alerts.filter(a => !a.read).length

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-200',
          open
            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
            : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-white hover:border-slate-500'
        )}
        title="Notifications"
      >
        <Bell size={15} className={open ? 'text-indigo-300' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[15px] font-bold rounded-full flex items-center justify-center px-0.5 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-down panel */}
      {open && (
        <div className={clsx(
          'absolute right-0 top-10 w-[360px] z-50',
          'bg-[#0d1525] border border-slate-700/60 rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.6)]',
          'flex flex-col overflow-hidden',
        )} style={{ maxHeight: 480 }}>

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-indigo-400" />
              <span className="text-sm font-bold text-white">Notifications</span>
              {unread > 0 && (
                <span className="text-[13px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[13px] text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Mark all read"
                >
                  <CheckCheck size={11} />
                  All read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate('/alerts') }}
                className="text-[13px] text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
              >
                <ExternalLink size={10} />
                Inbox
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            )}
            {!loading && alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={24} className="text-slate-700" />
                <p className="text-xs text-slate-500">No notifications yet</p>
                <p className="text-[13px] text-slate-600">The fleet will page you when it matters</p>
              </div>
            )}
            {!loading && alerts.map(alert => {
              const colors = levelColor(alert.level)
              return (
                <div
                  key={alert.id}
                  onClick={() => markRead(alert.id)}
                  className={clsx(
                    'px-4 py-3 border-b border-slate-800/40 cursor-pointer transition-colors',
                    alert.read
                      ? 'bg-transparent hover:bg-slate-800/20'
                      : 'bg-indigo-500/5 hover:bg-indigo-500/10'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Unread dot */}
                    <div className="flex-shrink-0 mt-1">
                      {!alert.read
                        ? <span className={clsx('w-1.5 h-1.5 rounded-full block mt-0.5', colors.dot)} />
                        : <span className="w-1.5 h-1.5 rounded-full block mt-0.5 bg-transparent" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {levelIcon(alert.level)}
                        <span className={clsx('text-xs font-semibold leading-tight', alert.read ? 'text-slate-300' : 'text-white')}>
                          {alert.title}
                        </span>
                      </div>

                      {/* Message */}
                      <p className="text-[10.5px] text-slate-400 leading-relaxed line-clamp-2">
                        {alert.message}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1">
                        {alert.strategy && (
                          <span className="text-[15px] font-mono text-indigo-400/70 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                            {alert.strategy}
                          </span>
                        )}
                        <span className="text-[15px] text-slate-600 font-mono">
                          {timeAgo(alert.timestamp)}
                        </span>
                        <span className={clsx('text-[15px] font-mono ml-auto', colors.text)}>
                          {alert.level}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-800/60 flex-shrink-0 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[15px] text-slate-500 font-mono">Live · polling every 4s</span>
              </div>
              <button
                onClick={() => { setOpen(false); navigate('/alerts') }}
                className="text-[13px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                View full inbox <ExternalLink size={9} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}