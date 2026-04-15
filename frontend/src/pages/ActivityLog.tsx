import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Activity, RefreshCw, Filter, ArrowDownCircle,
  CheckCircle2, AlertTriangle, Zap, Radio, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────────
interface Event {
  id: string | number
  kind: 'trade' | 'signal' | 'gate' | 'system' | 'alert'
  message: string
  strategy?: string
  detail?: string
  timestamp: string
}

// ── kind config ───────────────────────────────────────────────────────────────
const KIND_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  trade:  { label: 'Trade',  color: 'text-accent-green  bg-accent-green/10 border-accent-green/30',  icon: TrendingUp     },
  signal: { label: 'Signal', color: 'text-accent-blue   bg-accent-blue/10  border-accent-blue/30',   icon: Radio          },
  gate:   { label: 'Gate',   color: 'text-yellow-400    bg-yellow-400/10   border-yellow-400/30',    icon: CheckCircle2   },
  system: { label: 'System', color: 'text-slate-300     bg-dark-700        border-dark-600',          icon: Zap            },
  alert:  { label: 'Alert',  color: 'text-red-400       bg-red-400/10      border-red-400/30',        icon: AlertTriangle  },
}

const ALL_KINDS = ['trade', 'signal', 'gate', 'system', 'alert']

/** Format ISO timestamp as HH:MM:SS ET (24-hr military, Eastern time) */
function ts(raw: string) {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' ET'
  } catch {
    return raw.replace('T', ' ').slice(0, 19)
  }
}

function KindBadge({ kind }: { kind: string }) {
  const m = KIND_META[kind] ?? KIND_META.system
  const Icon = m.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono font-semibold', m.color)}>
      <Icon size={10} />
      {m.label.toUpperCase()}
    </span>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ActivityLog() {
  const [events,   setEvents]   = useState<Event[]>([])
  const [loading,  setLoading]  = useState(true)
  const [live,     setLive]     = useState(true)
  const [filter,   setFilter]   = useState<string>('all')
  const [search,   setSearch]   = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/fleet/activity?limit=200')
      setEvents(res.data.events || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!live) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [live, load])

  // auto-scroll to bottom when live
  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events, live])

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.kind !== filter) return false
    if (search && !e.message.toLowerCase().includes(search.toLowerCase()) &&
        !(e.strategy || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = ALL_KINDS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = events.filter(e => e.kind === k).length
    return acc
  }, {})

  return (
    <div className="flex flex-col h-screen bg-dark-900">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity size={22} className="text-accent-blue" />
              Activity Log
            </h1>
            <p className="text-sm text-slate-300 mt-0.5">
              {filtered.length} events{filter !== 'all' ? ` (${filter})` : ''} — {events.length} total
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Live toggle */}
            <button
              onClick={() => setLive(!live)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border transition-colors',
                live
                  ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                  : 'bg-dark-700 text-slate-300 border-dark-600'
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', live ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
              {live ? 'LIVE' : 'PAUSED'}
            </button>

            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white transition-colors font-mono"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Kind filter chips */}
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-slate-300" />
            <button
              onClick={() => setFilter('all')}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-mono transition-colors',
                filter === 'all' ? 'bg-accent-blue/20 text-accent-blue' : 'text-slate-300 hover:text-white'
              )}
            >
              ALL ({events.length})
            </button>
            {ALL_KINDS.map(k => {
              const m = KIND_META[k]
              return (
                <button
                  key={k}
                  onClick={() => setFilter(filter === k ? 'all' : k)}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-mono transition-colors',
                    filter === k ? 'bg-accent-blue/20 text-accent-blue' : 'text-slate-300 hover:text-white'
                  )}
                >
                  {m.label} ({counts[k] || 0})
                </button>
              )
            })}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            className="ml-auto px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none focus:border-accent-blue w-48"
          />
        </div>
      </div>

      {/* ── Event stream ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-slate-300" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-300">
            <Activity size={32} className="mb-3 opacity-40" />
            <p className="font-mono text-sm">No events match your filter</p>
          </div>
        )}

        {filtered.map((ev, idx) => {
          const m = KIND_META[ev.kind] ?? KIND_META.system
          const Icon = m.icon
          return (
            <div
              key={`${ev.id}-${idx}`}
              className="group flex items-start gap-3 px-4 py-2.5 bg-dark-800 border border-dark-700/50 rounded-lg hover:border-dark-500 transition-colors"
            >
              {/* Icon */}
              {(() => {
                const cc = m.color.split(/\s+/).filter(Boolean)
                return (
                  <div className={clsx('mt-0.5 w-6 h-6 rounded flex items-center justify-center flex-shrink-0', cc[1])}>
                    <Icon size={12} className={cc[0]} />
                  </div>
                )
              })()}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KindBadge kind={ev.kind} />
                  {ev.strategy && (
                    <span className="text-[10px] font-mono text-slate-300 bg-dark-700 px-1.5 py-0.5 rounded">
                      {ev.strategy}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-300 ml-auto">
                    {ts(ev.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1 font-mono">{ev.message}</p>
                {ev.detail && (
                  <p className="text-xs text-slate-300 mt-0.5">{ev.detail}</p>
                )}
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-dark-600 flex items-center justify-between">
        <p className="text-xs text-slate-300 font-mono">
          Ring buffer — last 200 events in memory
        </p>
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-slate-300 font-mono transition-colors"
        >
          <ArrowDownCircle size={12} /> Jump to latest
        </button>
      </div>

    </div>
  )
}