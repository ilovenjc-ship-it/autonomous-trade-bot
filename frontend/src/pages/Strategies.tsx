import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBotStore } from '@/store/botStore'
import {
  TrendingUp, TrendingDown, ExternalLink, RefreshCw,
  ArrowUpDown, Shield, Activity, Layers, Zap, BarChart2,
} from 'lucide-react'
import clsx from 'clsx'
import type { Strategy } from '@/types'
import PageHeroSlider from '@/components/PageHeroSlider'

// ── performance tier engine ───────────────────────────────────────────────────
type Tier = 'elite' | 'solid' | 'neutral' | 'weak' | 'failing'

interface TierMeta {
  label: string
  emoji: string
  multiplier: string
  multiplierNum: number
  badgeClass: string
  allocClass: string
  barClass: string
  minWr: number
}

const TIERS: Record<Tier, TierMeta> = {
  elite:   { label: 'ELITE',   emoji: '🏆', multiplier: '3×', multiplierNum: 3,   minWr: 65, badgeClass: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/40',  allocClass: 'text-yellow-300', barClass: 'bg-yellow-400' },
  solid:   { label: 'SOLID',   emoji: '✅', multiplier: '1.5×', multiplierNum: 1.5, minWr: 55, badgeClass: 'bg-accent-green/15 text-accent-green border-accent-green/40', allocClass: 'text-accent-green', barClass: 'bg-accent-green' },
  neutral: { label: 'NEUTRAL', emoji: '⚖️', multiplier: '1×',  multiplierNum: 1,   minWr: 45, badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',          allocClass: 'text-slate-300',   barClass: 'bg-accent-blue' },
  weak:    { label: 'WEAK',    emoji: '⚠️', multiplier: '0.5×', multiplierNum: 0.5, minWr: 35, badgeClass: 'bg-yellow-600/15 text-yellow-500 border-yellow-600/40',    allocClass: 'text-yellow-500', barClass: 'bg-yellow-500' },
  failing: { label: 'FAILING', emoji: '❌', multiplier: 'SUSP', multiplierNum: 0,   minWr: 0,  badgeClass: 'bg-red-500/15 text-red-400 border-red-500/40',             allocClass: 'text-red-400',    barClass: 'bg-red-500' },
}

function getTier(winRate: number, totalTrades: number): Tier {
  // Strategies with < 5 trades don't have enough data — treat as neutral
  if (totalTrades < 5) return 'neutral'
  if (winRate >= 65) return 'elite'
  if (winRate >= 55) return 'solid'
  if (winRate >= 45) return 'neutral'
  if (winRate >= 35) return 'weak'
  return 'failing'
}

// ── mode badge ────────────────────────────────────────────────────────────────
const MODE_META: Record<string, { label: string; badge: string; prefix: string }> = {
  LIVE:              { label: 'LIVE',     prefix: '●', badge: 'bg-accent-green/10 text-accent-green border-accent-green/30' },
  APPROVED_FOR_LIVE: { label: 'APPROVED', prefix: '◑', badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' },
  PAPER_ONLY:        { label: 'PAPER',    prefix: '◌', badge: 'bg-slate-700/60 text-slate-300 border-slate-600' },
}

function fmt(n: number) {
  const s = Math.abs(n).toFixed(4)
  return n >= 0 ? `+${s} τ` : `-${s} τ`
}

// ── sort / filter types ───────────────────────────────────────────────────────
type SortKey    = 'pnl' | 'win_rate' | 'trades' | 'cycles' | 'tier'
type SortDir    = 'desc' | 'asc'
type ModeFilter = 'all' | 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE'
type TierFilter = 'all' | Tier

// ── fleet summary bar ─────────────────────────────────────────────────────────
function FleetSummary({ strategies }: { strategies: Strategy[] }) {
  const n        = strategies.length
  const trades   = strategies.reduce((a, s) => a + s.total_trades, 0)
  const pnl      = strategies.reduce((a, s) => a + s.total_pnl, 0)
  const winRate  = n ? strategies.reduce((a, s) => a + s.win_rate, 0) / n : 0
  const live     = strategies.filter(s => s.mode === 'LIVE').length
  const approved = strategies.filter(s => s.mode === 'APPROVED_FOR_LIVE').length
  // Max possible stake if every LIVE bot fires in the same cycle
  const maxCycleStake = strategies
    .filter(s => s.mode === 'LIVE' && s.stake_amount != null)
    .reduce((a, s) => a + (s.stake_amount ?? 0), 0)

  // tier counts
  const tierCounts = strategies.reduce<Record<Tier, number>>(
    (acc, s) => { const t = getTier(s.win_rate, s.total_trades); acc[t]++; return acc },
    { elite: 0, solid: 0, neutral: 0, weak: 0, failing: 0 }
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Strategies',      value: String(n),                          color: 'text-white',        icon: <Layers size={12} className="text-accent-blue" /> },
          { label: 'Fleet Trades',    value: trades.toLocaleString(),            color: 'text-white',        icon: <Activity size={12} className="text-accent-blue" /> },
          { label: 'Avg Win Rate',    value: `${winRate.toFixed(1)}%`,           color: winRate >= 55 ? 'text-accent-green' : 'text-yellow-400', icon: <TrendingUp size={12} className="text-accent-green" /> },
          { label: 'Fleet PnL (τ)',   value: fmt(pnl),                           color: pnl >= 0 ? 'text-accent-green' : 'text-red-400', icon: pnl >= 0 ? <TrendingUp size={12} className="text-accent-green" /> : <TrendingDown size={12} className="text-red-400" /> },
          { label: 'Live / Approved', value: `${live} / ${approved}`,            color: 'text-accent-green', icon: <Shield size={12} className="text-yellow-400" /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              {icon}
              <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono">{label}</p>
            </div>
            <p className={clsx('text-lg font-bold font-mono', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Max-cycle stake banner — only when LIVE bots have assigned stakes */}
      {maxCycleStake > 0 && (
        <div className="bg-dark-800 border border-accent-green/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-accent-green" />
            <span className="text-[14px] text-slate-400 font-mono uppercase tracking-wider">
              Max on-chain stake if all LIVE bots fire simultaneously
            </span>
          </div>
          <span className="text-base font-bold font-mono text-accent-green">
            {maxCycleStake.toFixed(4)} τ
          </span>
        </div>
      )}

      {/* tier distribution bar */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BarChart2 size={12} className="text-accent-blue" />
            <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono">Capital Allocation Tiers</p>
          </div>
          <p className="text-[13px] text-slate-500 font-mono">performance-weighted · auto-rebalanced</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {(Object.entries(tierCounts) as [Tier, number][]).map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-1.5">
              <span className={clsx('px-1.5 py-0.5 rounded border text-[13px] font-mono font-bold', TIERS[tier].badgeClass)}>
                {TIERS[tier].emoji} {TIERS[tier].label}
              </span>
              <span className="text-sm font-bold font-mono text-white">{count}</span>
              <span className={clsx('text-[13px] font-mono', TIERS[tier].allocClass)}>{TIERS[tier].multiplier} capital</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ s }: { s: Strategy }) {
  const navigate = useNavigate()
  const mode     = MODE_META[s.mode] ?? MODE_META.PAPER_ONLY
  const tier     = getTier(s.win_rate, s.total_trades)
  const tierMeta = TIERS[tier]
  const gateMax  = 10
  const gatePct  = Math.min(100, Math.round((s.cycles_completed / gateMax) * 100))
  const isSuspended = tier === 'failing'

  return (
    <div className={clsx(
      'card p-5 transition-all hover:border-dark-500 group animate-slide-up flex flex-col',
      isSuspended && 'opacity-60',
      tier === 'elite' && 'border-yellow-400/20 shadow-[0_0_12px_rgba(250,204,21,0.06)]',
    )}>

      {/* ── card header ─────────────────────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* win-rate colored dot */}
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', tierMeta.barClass)} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight truncate">
              {s.display_name}
            </h3>
            <p className="text-[13px] font-mono text-slate-500 mt-0.5 truncate">{s.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {/* tier badge */}
          <span className={clsx('px-2 py-0.5 rounded border text-[13px] font-mono font-bold whitespace-nowrap', tierMeta.badgeClass)}>
            {tierMeta.emoji} {tierMeta.label}
          </span>
          {/* mode badge */}
          <span className={clsx('px-2 py-0.5 rounded border text-[13px] font-mono font-semibold whitespace-nowrap', mode.badge)}>
            {mode.prefix} {mode.label}
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

      {/* ── stats row ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-sm font-mono font-semibold text-white">{s.total_trades.toLocaleString()}</p>
          <p className="text-[13px] text-slate-500 mt-0.5">Trades</p>
        </div>
        <div className="text-center">
          <p className={clsx('text-sm font-mono font-semibold', tierMeta.allocClass)}>
            {s.win_rate.toFixed(1)}%
          </p>
          <p className="text-[13px] text-slate-500 mt-0.5">Win Rate</p>
        </div>
        <div className="text-center">
          <p className={clsx(
            'text-sm font-mono font-semibold',
            s.total_pnl > 0 ? 'text-accent-green' : s.total_pnl < 0 ? 'text-red-400' : 'text-slate-300',
          )}>
            {fmt(s.total_pnl)}
          </p>
          <p className="text-[13px] text-slate-500 mt-0.5">PnL (τ)</p>
        </div>
      </div>

      {/* ── stake / capital indicator ────────────────────── */}
      <div className={clsx(
        'flex items-center justify-between rounded-lg px-3 py-2 mb-4 border',
        isSuspended
          ? 'bg-red-500/8 border-red-500/20'
          : tier === 'elite'
          ? 'bg-yellow-400/8 border-yellow-400/20'
          : 'bg-dark-900 border-dark-600',
      )}>
        <div className="flex items-center gap-1.5">
          <Zap size={11} className={tierMeta.allocClass} />
          <span className="text-[13px] text-slate-400 font-mono uppercase tracking-wider">
            {s.mode === 'LIVE' ? 'Stake / Trade' : 'Capital Tier'}
          </span>
        </div>
        {s.mode === 'LIVE' && s.stake_amount != null ? (
          <div className="flex items-center gap-1.5">
            <span className={clsx('text-sm font-bold font-mono', tierMeta.allocClass)}>
              {s.stake_amount.toFixed(4)} τ
            </span>
            <span className="text-[13px] font-mono text-slate-500">{tierMeta.label}</span>
          </div>
        ) : (
          <span className={clsx('text-sm font-bold font-mono', tierMeta.allocClass)}>
            {isSuspended ? 'SUSPENDED' : tierMeta.multiplier + ' base'}
          </span>
        )}
      </div>

      {/* ── gate progress bar (cycles toward live) ──────── */}
      <div className="mt-auto">
        <div className="flex justify-between text-[13px] font-mono mb-1">
          <span className="text-slate-500">Promotion gate</span>
          <span className={clsx(s.cycles_completed >= gateMax ? 'text-accent-green' : 'text-slate-400')}>
            {s.cycles_completed}/{gateMax} cycles
          </span>
        </div>
        <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', tierMeta.barClass)}
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
  const [sortKey,    setSortKey]    = useState<SortKey>('win_rate')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')

  useEffect(() => { fetchStrategies() }, [fetchStrategies])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TIER_ORDER: Record<Tier, number> = { elite: 0, solid: 1, neutral: 2, weak: 3, failing: 4 }

  const sorted = useMemo(() => {
    let list = [...strategies]
    if (modeFilter !== 'all') list = list.filter(s => s.mode === modeFilter)
    if (tierFilter !== 'all') list = list.filter(s => getTier(s.win_rate, s.total_trades) === tierFilter)

    list.sort((a, b) => {
      let av = 0, bv = 0
      if (sortKey === 'pnl')      { av = a.total_pnl;    bv = b.total_pnl }
      if (sortKey === 'win_rate') { av = a.win_rate;     bv = b.win_rate }
      if (sortKey === 'trades')   { av = a.total_trades; bv = b.total_trades }
      if (sortKey === 'cycles')   { av = a.cycles_completed; bv = b.cycles_completed }
      if (sortKey === 'tier')     { av = TIER_ORDER[getTier(a.win_rate, a.total_trades)]; bv = TIER_ORDER[getTier(b.win_rate, b.total_trades)] }
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return list
  }, [strategies, sortKey, sortDir, modeFilter, tierFilter])

  const SORT_BTNS: { key: SortKey; label: string }[] = [
    { key: 'tier',     label: 'Tier' },
    { key: 'win_rate', label: 'Win %' },
    { key: 'pnl',     label: 'PnL' },
    { key: 'trades',  label: 'Trades' },
    { key: 'cycles',  label: 'Cycles' },
  ]

  const MODE_FILTERS: { key: ModeFilter; label: string }[] = [
    { key: 'all',               label: 'All Modes' },
    { key: 'PAPER_ONLY',        label: '◌ Paper' },
    { key: 'APPROVED_FOR_LIVE', label: '◑ Approved' },
    { key: 'LIVE',              label: '● Live' },
  ]

  const TIER_FILTERS: { key: TierFilter; label: string }[] = [
    { key: 'all',     label: 'All Tiers' },
    { key: 'elite',   label: '🏆 Elite' },
    { key: 'solid',   label: '✅ Solid' },
    { key: 'neutral', label: '⚖️ Neutral' },
    { key: 'weak',    label: '⚠️ Weak' },
    { key: 'failing', label: '❌ Failing' },
  ]

  const liveCount     = strategies.filter(s => s.mode === 'LIVE').length
  const approvedCount = strategies.filter(s => s.mode === 'APPROVED_FOR_LIVE').length
  const paperCount    = strategies.filter(s => s.mode === 'PAPER_ONLY').length
  const bestWR = strategies.length ? Math.max(...strategies.map(s => s.win_rate)) : 0
  const topPnL = strategies.length ? Math.max(...strategies.map(s => s.total_pnl)) : 0

  const heroSlides = [
    {
      title: 'Strategy Fleet', subtitle: '12 Autonomous Bots', accent: 'purple' as const,
      stats: [
        { label: 'Total',    value: String(strategies.length || 12), color: 'white'   as const },
        { label: 'LIVE',     value: String(liveCount),               color: 'emerald' as const },
        { label: 'APPROVED', value: String(approvedCount),           color: 'purple'  as const },
        { label: 'PAPER',    value: String(paperCount),              color: 'yellow'  as const },
        { label: 'Showing',  value: String(sorted.length),           color: 'slate'   as const },
      ],
    },
    {
      title: 'Performance', subtitle: 'Fleet Stats', accent: 'emerald' as const,
      stats: [
        { label: 'Best Win Rate', value: strategies.length ? `${bestWR.toFixed(0)}%` : '—',  color: 'emerald' as const },
        { label: 'Avg Win Rate',  value: strategies.length ? `${(strategies.reduce((s,x)=>s+x.win_rate,0)/strategies.length).toFixed(0)}%` : '—', color: 'blue' as const },
        { label: 'Top PnL',      value: strategies.length ? `+${topPnL.toFixed(3)}τ` : '—', color: 'emerald' as const },
        { label: 'Fleet PnL',    value: strategies.length ? `${strategies.reduce((s,x)=>s+x.total_pnl,0) >= 0 ? '+' : ''}${strategies.reduce((s,x)=>s+x.total_pnl,0).toFixed(3)}τ` : '—', color: strategies.reduce((s,x)=>s+x.total_pnl,0) >= 0 ? 'emerald' : 'red' as any },
        { label: 'Sort By',      value: sortKey.replace('_', ' ').toUpperCase(),             color: 'slate'   as const },
      ],
    },
    {
      title: 'Gate Progress', subtitle: 'Live Qualification', accent: 'blue' as const,
      stats: [
        { label: 'Gates Passed', value: String(strategies.filter(s => (s as any).gate_passed).length),    color: 'emerald' as const },
        { label: 'High Traders', value: String(strategies.filter(s => s.total_trades >= 50).length),      color: 'blue'    as const },
        { label: 'WR ≥ 55%',    value: String(strategies.filter(s => s.win_rate >= 55).length),          color: 'emerald' as const },
        { label: 'WR < 45%',    value: String(strategies.filter(s => s.win_rate < 45 && s.total_trades > 10).length), color: 'red' as const },
        { label: 'Filter',      value: modeFilter === 'all' ? 'All' : modeFilter.replace('_FOR_LIVE','').replace('_ONLY',''), color: 'slate' as const },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Strategy Fleet</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {strategies.length} strategies · performance-weighted capital allocation · all running simultaneously
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

        {/* tier filter */}
        <div className="flex items-center gap-1 bg-dark-800 border border-dark-600 rounded-lg p-1">
          {TIER_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTierFilter(key)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-mono font-semibold transition-all',
                tierFilter === key
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

      {/* ── allocation model legend ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* tier key */}
        <div className="card p-4">
          <h2 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart2 size={13} className="text-accent-blue" /> Allocation Tier Key
          </h2>
          <div className="space-y-2">
            {(Object.entries(TIERS) as [Tier, TierMeta][]).map(([, t]) => (
              <div key={t.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={clsx('px-1.5 py-0.5 rounded border text-[13px] font-mono font-bold', t.badgeClass)}>
                    {t.emoji} {t.label}
                  </span>
                  <span className="text-slate-400">Win rate ≥ {t.minWr}%</span>
                </div>
                <span className={clsx('font-mono font-bold text-sm', t.allocClass)}>
                  {t.multiplier === 'SUSP' ? 'Suspended' : t.multiplier + ' capital'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-slate-500 mt-3">
            Capital from suspended strategies flows up to elite performers automatically.
          </p>
        </div>

        {/* promotion gate */}
        <div className="card p-4">
          <h2 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <Shield size={13} className="text-yellow-400" /> Promotion Gate
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
            {[
              { n: '① Cycles ≥ 10',    desc: 'Must complete ≥ 10 full evaluation cycles' },
              { n: '② Win Rate ≥ 55%', desc: 'Must sustain >55% win rate across cycles' },
              { n: '③ Win Margin ≥ 2', desc: 'Wins must exceed losses by ≥ 2' },
              { n: '④ PnL > 0 τ',      desc: 'Cumulative realised PnL must be positive' },
            ].map(({ n, desc }) => (
              <div key={n} className="space-y-0.5">
                <p className="text-white font-mono text-[14px]">{n}</p>
                <p className="leading-relaxed text-[14px]">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-slate-500 mt-3">
            Gate pass → <span className="text-yellow-400">APPROVED</span>.
            Operator confirms → <span className="text-accent-green">LIVE</span>.
          </p>
        </div>
      </div>
      </div>{/* end scrollable */}
    </div>
  )
}