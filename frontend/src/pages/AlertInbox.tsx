/**
 * Alert Inbox — persistent log of all system alerts.
 * Supports filtering by level/type, mark-read, and clear-all.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, Check, CheckCheck, RefreshCw,
  TrendingUp, Zap, ShieldCheck, ShieldX, Flame,
  AlertTriangle, Trophy, TrendingDown, Cpu, Filter,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import PageHeroSlider from '@/components/PageHeroSlider'

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
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const load = useCallback(async () => {
    const [alertsRes, statsRes] = await Promise.allSettled([
      api.get('/alerts', { params: { limit: 150 } }),
      api.get('/alerts/stats'),
    ])
    if (alertsRes.status === 'fulfilled' && alertsRes.value.data.alerts)
      setAlerts(alertsRes.value.data.alerts)
    if (statsRes.status === 'fulfilled')
      setStats(statsRes.value.data)
    setLastRefresh(new Date())
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

  const handleMarkAllRead = async () => {
    await api.post('/alerts/read-all')
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    setStats(prev => prev ? { ...prev, unread: 0 } : prev)
  }

  // Filter
  const filtered = alerts.filter(a => {
    if (unreadOnly && a.read)           return false
    if (levelFilter !== 'ALL' && a.level !== levelFilter) return false
    if (typeFilter  !== 'ALL' && a.type  !== typeFilter)  return false
    return true
  })

  const unreadCount = stats?.unread ?? 0

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
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Bell size={18} className="text-white" />
            </div>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[13px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Alert Inbox</h1>
            <p className="text-xs text-slate-300 font-mono">
              {unreadCount > 0
                ? <span className="text-red-400">{unreadCount} unread alerts</span>
                : <span className="text-emerald-400">All caught up</span>}
              <span className="text-slate-300 ml-2">· ↻ {lastRefresh.toLocaleTimeString()}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
            >
              <CheckCheck size={13} />
              Mark All Read
            </button>
          )}
          <button onClick={load} className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

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
        <Filter size={14} className="text-slate-300" />

        {/* Level filter */}
        <div className="flex gap-1">
          {['ALL', ...ALL_LEVELS].map(level => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={clsx(
                'px-3 py-1 rounded-lg text-[14px] font-mono font-semibold transition-colors',
                levelFilter === level
                  ? level === 'ALL'
                    ? 'bg-slate-600 text-white'
                    : `${LEVEL_CFG[level]?.bg ?? ''} ${LEVEL_CFG[level]?.text ?? ''} border ${LEVEL_CFG[level]?.border ?? ''}`
                  : 'bg-dark-700 text-slate-300 hover:text-white',
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-dark-600" />

        {/* Unread toggle */}
        <button
          onClick={() => setUnreadOnly(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[14px] font-mono font-semibold transition-colors',
            unreadOnly
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              : 'bg-dark-700 text-slate-300 hover:text-white',
          )}
        >
          {unreadOnly ? <Bell size={11} /> : <BellOff size={11} />}
          Unread Only
        </button>

        {/* Type filter */}
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