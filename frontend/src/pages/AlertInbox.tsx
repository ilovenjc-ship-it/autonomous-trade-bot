/**
 * Alert Inbox — persistent log of all system alerts.
 * Supports filtering by level/type, mark-read, and clear-all.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, Check, CheckCheck,
  TrendingUp, Zap, ShieldCheck, ShieldX, Flame,
  AlertTriangle, Trophy, TrendingDown, Cpu, Filter,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import PageHeroSlider from '@/components/PageHeroSlider'
import { useBotStore } from '@/store/botStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Alert {
  id:        number
  type:      string
  level:     string
  title:     string
  message:   string
  strategy:  string | null
  detail:    string
  read:      boolean
  timestamp: string
}

interface AlertStats {
  total:    number
  unread:   number
  by_level: Record<string, number>
  by_type:  Record<string, number>
}

// ── Config ────────────────────────────────────────────────────────────────────

const LEVEL_CFG: Record<string, { label: string; dot: string; bg: string; border: string; text: string }> = {
  CRITICAL: { label: 'Critical', dot: 'bg-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400'    },
  WARNING:  { label: 'Warning',  dot: 'bg-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400'  },
  INFO:     { label: 'Info',     dot: 'bg-emerald-500',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-400'},
}

const TYPE_CFG: Record<string, { label: string; icon: typeof Bell }> = {
  GATE_PROMOTION:      { label: 'Gate Promotion',    icon: TrendingUp    },
  CONSENSUS_APPROVED:  { label: 'Consensus Approved',icon: ShieldCheck   },
  CONSENSUS_VETOED:    { label: 'Consensus Vetoed',  icon: ShieldX       },
  REGIME_SHIFT:        { label: 'Regime Shift',      icon: Zap           },
  STRATEGY_HOT:        { label: 'Strategy Hot',      icon: Flame         },
  STRATEGY_STRUGGLING: { label: 'Struggling',        icon: AlertTriangle },
  PNL_MILESTONE:       { label: 'PnL Milestone',     icon: Trophy        },
  DRAWDOWN_ALERT:      { label: 'Drawdown',          icon: TrendingDown  },
  SYSTEM:              { label: 'System',            icon: Cpu           },
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (isNaN(diff)) return '—'
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function toET(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   false,
    }) + ' ET'
  } catch {
    return '—'
  }
}

// ── AlertRow ──────────────────────────────────────────────────────────────────

function AlertRow({ alert, onMarkRead }: { alert: Alert; onMarkRead: (id: number) => void }) {
  const lc   = LEVEL_CFG[alert.level]  ?? LEVEL_CFG.INFO
  const tc   = TYPE_CFG[alert.type]   ?? TYPE_CFG.SYSTEM
  const Icon = tc.icon

  return (
    <div
      className={clsx(
        'flex gap-3 p-4 border-b border-dark-700 transition-all duration-300 group',
        !alert.read ? 'bg-dark-700/30' : 'opacity-60 hover:opacity-80',
      )}
    >
      {/* Unread dot */}
      <div className="flex flex-col items-center pt-1 w-4 flex-shrink-0">
        {!alert.read ? (
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', lc.dot)} />
        ) : (
          <span className="w-2 h-2 rounded-full bg-transparent" />
        )}
      </div>

      {/* Type icon */}
      <div className={clsx('p-1.5 rounded-lg h-fit flex-shrink-0 mt-0.5', lc.bg)}>
        <Icon size={13} className={lc.text} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={clsx('text-sm font-semibold', !alert.read ? 'text-white' : 'text-slate-300')}>
              {alert.title}
            </p>
            <span className={clsx(
              'text-[13px] font-mono font-bold px-1.5 py-0.5 rounded-full border',
              lc.bg, lc.border, lc.text,
            )}>
              {lc.label}
            </span>
            <span className="text-[13px] text-slate-300 font-mono bg-dark-700 px-1.5 py-0.5 rounded">
              {tc.label}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-[14px] text-slate-300 font-mono">{toET(alert.timestamp)}</p>
              <p className="text-[13px] text-slate-500 font-mono">{timeSince(alert.timestamp)}</p>
            </div>
            {!alert.read && (
              <button
                onClick={() => onMarkRead(alert.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-emerald-400 transition-all"
                title="Mark as read"
              >
                <Check size={12} />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-300 mt-1 leading-relaxed">{alert.message}</p>

        {alert.strategy && (
          <p className="text-[14px] text-indigo-400 font-mono mt-1">↳ {alert.strategy}</p>
        )}
        {alert.detail && (
          <p className="text-[13px] text-slate-300 font-mono mt-0.5">{alert.detail}</p>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const ALL_LEVELS = ['CRITICAL', 'WARNING', 'INFO']
const ALL_TYPES  = Object.keys(TYPE_CFG)

export default function AlertInbox() {
  const [alerts,      setAlerts]      = useState<Alert[]>([])
  const [stats,       setStats]       = useState<AlertStats | null>(null)
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [typeFilter,  setTypeFilter]  = useState<string>('ALL')
  const [unreadOnly,  setUnreadOnly]  = useState(false)

  const setAlertStats = useBotStore(s => s.setAlertStats)

  const load = useCallback(async () => {
    const [alertsRes, statsRes] = await Promise.allSettled([
      api.get('/alerts', { params: { limit: 150 } }),
      api.get('/alerts/stats'),
    ])
    if (alertsRes.status === 'fulfilled' && alertsRes.value.data.alerts)
      setAlerts(alertsRes.value.data.alerts)
    if (statsRes.status === 'fulfilled')
      setStats(statsRes.value.data)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const handleMarkRead = async (id: number) => {
    await api.post(`/alerts/${id}/read`)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
    setStats(prev => prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev)
  }

  const handleMarkAllRead = useCallback(async () => {
    await api.post('/alerts/read-all')
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    setStats(prev => prev ? { ...prev, unread: 0 } : prev)
  }, [])

  // Filter — PRIORITY is a special shorthand for CRITICAL + WARNING
  const filtered = alerts.filter(a => {
    if (unreadOnly && a.read) return false
    if (levelFilter === 'PRIORITY' && a.level !== 'CRITICAL' && a.level !== 'WARNING') return false
    if (levelFilter !== 'ALL' && levelFilter !== 'PRIORITY' && a.level !== levelFilter) return false
    if (typeFilter  !== 'ALL' && a.type !== typeFilter) return false
    return true
  })

  const priorityCount = alerts.filter(a => a.level === 'CRITICAL' || a.level === 'WARNING').length

  const unreadCount = stats?.unread ?? 0

  // Push live alert counts into shared store so Layout top bar can display them
  useEffect(() => {
    setAlertStats({ unread: unreadCount, priority: priorityCount, markAllRead: handleMarkAllRead })
    return () => setAlertStats(null)
  }, [unreadCount, priorityCount, handleMarkAllRead, setAlertStats])

  const heroSlides = [
    {
      title: 'Alert Overview', subtitle: 'Inbox Status', accent: 'red' as const,
      stats: [
        { label: 'Total Alerts', value: String(stats?.total ?? alerts.length),   color: 'white'   as const },
        { label: 'Unread',       value: String(unreadCount),                     color: unreadCount > 0 ? 'red' : 'emerald' as any },
        { label: 'Critical',     value: String(alerts.filter(a => a.level === 'CRITICAL').length), color: alerts.filter(a=>a.level==='CRITICAL').length > 0 ? 'red' : 'slate' as any },
        { label: 'Filtered',     value: String(filtered.length),                 color: 'white'   as const },
        { label: 'Auto-Refresh', value: '5s',                                    color: 'slate'   as const },
      ],
    },
    {
      title: 'Alert Levels', subtitle: 'By Severity', accent: 'orange' as const,
      stats: [
        { label: 'INFO',     value: String(alerts.filter(a => a.level === 'INFO').length),     color: 'blue'    as const },
        { label: 'WARNING',  value: String(alerts.filter(a => a.level === 'WARNING').length),  color: 'yellow'  as const },
        { label: 'CRITICAL', value: String(alerts.filter(a => a.level === 'CRITICAL').length), color: 'red'     as const },
        { label: 'SYSTEM',   value: String(alerts.filter(a => a.level === 'SYSTEM').length),   color: 'purple'  as const },
        { label: 'Read',     value: String(alerts.filter(a => a.read).length),                 color: 'emerald' as const },
      ],
    },
    {
      title: 'Alert Activity', subtitle: 'By Type', accent: 'blue' as const,
      stats: [
        { label: 'Trade',    value: String(alerts.filter(a => a.type === 'TRADE').length),     color: 'emerald' as const },
        { label: 'Gate',     value: String(alerts.filter(a => a.type === 'GATE').length),      color: 'purple'  as const },
        { label: 'Risk',     value: String(alerts.filter(a => a.type === 'RISK').length),      color: 'orange'  as const },
        { label: 'Signal',   value: String(alerts.filter(a => a.type === 'SIGNAL').length),    color: 'blue'    as const },
        { label: 'System',   value: String(alerts.filter(a => a.type === 'SYSTEM').length),    color: 'slate'   as const },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Stats row ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',    value: stats.total,                          accent: 'text-slate-300' },
            { label: 'Unread',   value: stats.unread,                         accent: 'text-red-400'    },
            { label: 'Critical', value: stats.by_level?.CRITICAL ?? 0,        accent: 'text-red-400'    },
            { label: 'Warnings', value: (stats.by_level?.WARNING ?? 0),       accent: 'text-amber-400'  },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl p-3 text-center">
              <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">{label}</p>
              <p className={clsx('text-2xl font-bold font-mono mt-1', accent)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter size={14} className="text-slate-300 flex-shrink-0" />

        {/* Priority + Level filter pills */}
        <div className="flex gap-1 flex-wrap">
          {/* ALL */}
          <button
            onClick={() => setLevelFilter('ALL')}
            className={clsx(
              'px-3 py-1 rounded-lg text-[13px] font-mono font-semibold transition-colors',
              levelFilter === 'ALL' ? 'bg-slate-600 text-white' : 'bg-dark-700 text-slate-300 hover:text-white',
            )}
          >
            All
          </button>

          {/* PRIORITY — CRITICAL + WARNING combined */}
          <button
            onClick={() => setLevelFilter('PRIORITY')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-mono font-semibold transition-colors border',
              levelFilter === 'PRIORITY'
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/40'
                : 'bg-dark-700 text-slate-300 border-transparent hover:text-orange-400 hover:border-orange-500/30',
            )}
          >
            ⚡ Priority
            {priorityCount > 0 && (
              <span className={clsx(
                'text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                levelFilter === 'PRIORITY' ? 'bg-orange-500/30 text-orange-300' : 'bg-red-500/20 text-red-400',
              )}>
                {priorityCount}
              </span>
            )}
          </button>

          {/* Individual level pills */}
          {ALL_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={clsx(
                'px-3 py-1 rounded-lg text-[13px] font-mono font-semibold transition-colors border',
                levelFilter === level
                  ? `${LEVEL_CFG[level]?.bg ?? ''} ${LEVEL_CFG[level]?.text ?? ''} ${LEVEL_CFG[level]?.border ?? ''}`
                  : 'bg-dark-700 text-slate-300 border-transparent hover:text-white',
              )}
            >
              {level.charAt(0) + level.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-dark-600 flex-shrink-0" />

        {/* Unread Only toggle */}
        <button
          onClick={() => setUnreadOnly(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-mono font-semibold transition-colors border',
            unreadOnly
              ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
              : 'bg-dark-700 text-slate-300 border-transparent hover:text-white',
          )}
        >
          {unreadOnly ? <Bell size={11} /> : <BellOff size={11} />}
          Unread Only
        </button>

        {/* Type filter — pushed to far right */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="ml-auto bg-dark-700 border border-dark-600 text-slate-300 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Types</option>
          {ALL_TYPES.map(type => (
            <option key={type} value={type}>{TYPE_CFG[type]?.label ?? type}</option>
          ))}
        </select>
      </div>

      {/* ── Alert list ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
          <Bell size={13} className="text-slate-300" />
          <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Alerts</span>
          <span className="ml-auto text-[13px] text-slate-300 font-mono">{filtered.length} shown</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BellOff size={36} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 text-sm font-mono">
              {unreadOnly ? 'No unread alerts.' : 'No alerts yet.'}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Alerts fire automatically when strategies are promoted,<br />
              OpenClaw votes, II Agent detects regime shifts, and more.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-dark-700/0">
            {filtered.map(alert => (
              <AlertRow key={alert.id} alert={alert} onMarkRead={handleMarkRead} />
            ))}
          </div>
        )}
      </div>

      {/* ── Alert type reference ── */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-xl p-4">
        <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-3">Alert Types</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.entries(TYPE_CFG).map(([type, cfg]) => {
            const Icon = cfg.icon
            const count = stats?.by_type?.[type] ?? 0
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? 'ALL' : type)}
                className={clsx(
                  'flex items-center gap-2 p-2 rounded-lg text-left transition-colors border',
                  typeFilter === type
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                    : 'bg-dark-700/50 border-dark-600/50 text-slate-300 hover:text-white hover:border-dark-500'
                )}
              >
                <Icon size={12} />
                <div>
                  <p className="text-[13px] font-mono leading-none">{cfg.label}</p>
                  <p className="text-[13px] text-slate-300 font-mono">{count} fired</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      </div>{/* end scrollable */}
    </div>
  )
}