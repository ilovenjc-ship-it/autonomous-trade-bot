import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBotStore } from '@/store/botStore'
import {
  TrendingUp, TrendingDown, ExternalLink, RefreshCw,
  ArrowUpDown, Shield, Activity, Layers,
} from 'lucide-react'
import clsx from 'clsx'
import type { Strategy } from '@/types'

// ── mode badge ────────────────────────────────────────────────────────────────
const MODE_META: Record<string, { label: string; dot: string; badge: string }> = {
  LIVE:              { label: 'LIVE',     dot: 'bg-accent-green',  badge: 'bg-accent-green/10 text-accent-green border-accent-green/30' },
  APPROVED_FOR_LIVE: { label: 'APPROVED', dot: 'bg-yellow-400',    badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' },
  PAPER_ONLY:        { label: 'PAPER',    dot: 'bg-slate-400',     badge: 'bg-slate-700/60 text-slate-300 border-slate-600' },
}

function healthDot(wr: number) {
  if (wr >= 55) return 'bg-accent-green'
  if (wr >= 40) return 'bg-yellow-400'
  return 'bg-red-400'
}

function fmt(n: number) {
  const s = Math.abs(n).toFixed(4)
  return n >= 0 ? `+${s} τ` : `-${s} τ`
}

// ── sort / filter types ───────────────────────────────────────────────────────
type SortKey  = 'pnl' | 'win_rate' | 'trades' | 'cycles'
type SortDir  = 'desc' | 'asc'
type ModeFilter = 'all' | 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE'

// ── fleet summary bar ─────────────────────────────────────────────────────────
function FleetSummary({ strategies }: { strategies: Strategy[] }) {
  const n        = strategies.length
  const trades   = strategies.reduce((a, s) => a + s.total_trades, 0)
  const pnl      = strategies.reduce((a, s) => a + s.total_pnl, 0)
  const winRate  = n ? strategies.reduce((a, s) => a + s.win_rate, 0) / n : 0
  const live     = strategies.filter(s => s.mode === 'LIVE').length
  const approved = strategies.filter(s => s.mode === 'APPROVED_FOR_LIVE').length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[
        { label: 'Strategies',  value: String(n),              color: 'text-white',        icon: <Layers size={12} className="text-accent-blue" /> },
        { label: 'Fleet Trades', value: String(trades),         color: 'text-white',        icon: <Activity size={12} className="text-accent-blue" /> },
        { label: 'Avg Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate >= 55 ? 'text-accent-green' : 'text-yellow-400', icon: <TrendingUp size={12} className="text-accent-green" /> },
        { label: 'Fleet PnL',   value: fmt(pnl),               color: pnl >= 0 ? 'text-accent-green' : 'text-red-400', icon: pnl >= 0 ? <TrendingUp size={12} className="text-accent-green" /> : <TrendingDown size={12} className="text-red-400" /> },
        { label: 'Live / Approved', value: `${live} / ${approved}`, color: 'text-accent-green', icon: <Shield size={12} className="text-yellow-400" /> },
      ].map(({ label, value, color, icon }) => (
        <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            {icon}
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">{label}</p>
          </div>
          <p className={clsx('text-lg font-bold font-mono', color)}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// ── strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ s }: { s: Strategy }) {
  const navigate = useNavigate()
  const mode     = MODE_META[s.mode] ?? MODE_META.PAPER_ONLY
  const gateMax  = 10
  const gatePct  = Math.min(100, Math.round((s.cycles_completed / gateMax) * 100))

  return (
    <div className="card p-5 transition-all hover:border-dark-500 group animate-slide-up flex flex-col">

      {/* ── card header ─────────────────────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* health dot */}
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', healthDot(s.win_rate))} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight truncate">
              {s.display_name}
            </h3>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{s.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* mode badge */}
          <span className={clsx(
            'px-2 py-0.5 rounded border text-[10px] font-mono font-semibold whitespace-nowrap',
            mode.badge,
          )}>
            {mode.label}
          </span>
          {/* detail link */}
          <button
            onClick={() => navigate(`/strategy/${s.name}`)}
            className="p-1 rounded text-slate-500 hover:text-accent-blue transition-colors opacity-0 group-hover:opacity-100"
            title="Open strategy detail"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* description */}
      <p className="text-xs text-slate-400 mb-4 leading-relaxed line-clamp-2">{s.description || '—'}</p>

      {/* ── parameters ──────────────────────────────────── */}
      {Object.keys(s.parameters || {}).length > 0 && (
        <div className="bg-dark-900 rounded-lg p-3 mb-4">
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Parameters</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(s.parameters).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-slate-400 truncate">{k}</span>
                <span className="font-mono text-slate-300 ml-2">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── stats row ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-sm font-mono font-semibold text-white">{s.total_trades}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Trades</p>
        </div>
        <div className="text-center">
          <p className={clsx(
            'text-sm font-mono font-semibold',
            s.win_rate >= 55 ? 'text-accent-green' : s.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400',
          )}>
            {s.win_rate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Win Rate</p>
        </div>
        <div className="text-center">
          <p className={clsx(
            'text-sm font-mono font-semibold',
            s.total_pnl > 0 ? 'text-accent-green' : s.total_pnl < 0 ? 'text-red-400' : 'text-slate-300',
          )}>
            {fmt(s.total_pnl)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">P&amp;L</p>
        </div>
      </div>

      {/* ── gate progress bar (cycles toward live) ──────── */}
      <div className="mt-auto">
        <div className="flex justify-between text-[10px] font-mono mb-1">
          <span className="text-slate-500">Gate progress</span>
          <span className={clsx(
            s.cycles_completed >= gateMax ? 'text-accent-green' : 'text-slate-400',
          )}>
            {s.cycles_completed}/{gateMax} cycles
          </span>
        </div>
        <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              s.cycles_completed >= gateMax ? 'bg-accent-green' : 'bg-accent-blue',
            )}
            style={{ width: `${gatePct}%` }}
          />
        </div>
      </div>

    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Strategies() {
  const { strategies, fetchStrategies } = useBotStore()
  const [sortKey, setSortKey]   = useState<SortKey>('pnl')
  const [sortDir, setSortDir]   = useState<SortDir>('desc')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')

  useEffect(() => { fetchStrategies() }, [fetchStrategies])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    let list = modeFilter === 'all'
      ? [...strategies]
      : strategies.filter(s => s.mode === modeFilter)

    list.sort((a, b) => {
      let av = 0, bv = 0
      if (sortKey === 'pnl')      { av = a.total_pnl;    bv = b.total_pnl }
      if (sortKey === 'win_rate') { av = a.win_rate;     bv = b.win_rate }
      if (sortKey === 'trades')   { av = a.total_trades; bv = b.total_trades }
      if (sortKey === 'cycles')   { av = a.cycles_completed; bv = b.cycles_completed }
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return list
  }, [strategies, sortKey, sortDir, modeFilter])

  const SORT_BTNS: { key: SortKey; label: string }[] = [
    { key: 'pnl',      label: 'P&L' },
    { key: 'win_rate', label: 'Win %' },
    { key: 'trades',   label: 'Trades' },
    { key: 'cycles',   label: 'Cycles' },
  ]

  const MODE_FILTERS: { key: ModeFilter; label: string }[] = [
    { key: 'all',              label: 'All' },
    { key: 'PAPER_ONLY',        label: 'Paper' },
    { key: 'APPROVED_FOR_LIVE', label: 'Approved' },
    { key: 'LIVE',              label: 'Live' },
  ]

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* ── page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Strategies</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {strategies.length} strategies · all running simultaneously
          </p>
        </div>
        <button
          onClick={() => fetchStrategies()}
          className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── fleet summary ───────────────────────────────────────────────────── */}
      <FleetSummary strategies={strategies} />

      {/* ── controls row ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* mode filter */}
        <div className="flex items-center gap-1 bg-dark-800 border border-dark-600 rounded-lg p-1">
          {MODE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setModeFilter(key)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-mono font-semibold transition-all',
                modeFilter === key
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* sort */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown size={12} className="text-slate-500" />
          {SORT_BTNS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-mono transition-all border',
                sortKey === key
                  ? 'bg-dark-700 text-white border-dark-500'
                  : 'text-slate-400 border-transparent hover:text-white',
              )}
            >
              {label}
              {sortKey === key && (
                <span className="ml-1 text-accent-blue">{sortDir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── card grid ───────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-400 font-mono text-sm">No strategies match this filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map(s => <StrategyCard key={s.name} s={s} />)}
        </div>
      )}

      {/* ── gate legend ─────────────────────────────────────────────────────── */}
      <div className="card p-4">
        <h2 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
          <Shield size={13} className="text-yellow-400" /> Promotion Gate
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-400">
          {[
            { n: '① Cycles ≥ 10',    desc: 'Strategy must complete ≥ 10 full evaluation cycles' },
            { n: '② Win Rate ≥ 55%', desc: 'Must sustain >55% win rate across all cycles' },
            { n: '③ Win Margin ≥ 2', desc: 'Wins must exceed losses by at least 2' },
            { n: '④ PnL > 0 τ',      desc: 'Cumulative realised P&L must be positive' },
          ].map(({ n, desc }) => (
            <div key={n} className="space-y-1">
              <p className="text-white font-mono text-[11px]">{n}</p>
              <p className="leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-3">
          Strategies that pass all four gates are promoted to <span className="text-yellow-400">APPROVED</span>.
          Operator review required before elevation to <span className="text-accent-green">LIVE</span>.
        </p>
      </div>

    </div>
  )
}