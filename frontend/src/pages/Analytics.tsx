import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Activity, BarChart2,
  Award, RefreshCw, ChevronUp, ChevronDown, Clock,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import SubnetHeatMap from '@/components/SubnetHeatMap'
import { useBotStore } from '@/store/botStore'

// Session XXVII: Recharts imports removed — Rolling Win Rate chart moved to
// PnL Summary. Network Analytics now serves as subnet + strategy metrics
// only, no on-page chart rendering (hence no recharts dependency).

// ── Top Subnets (relocated from Agent Fleet) ──────────────────────────────────
interface Subnet {
  uid: number; name: string; ticker: string
  stake_tao: number; stake_usd: number
  emission: number; apy: number; miners: number
  trend: 'up' | 'down' | 'neutral'; score: number
}
function SubnetTrendIcon({ trend }: { trend: string }) {
  if (trend === 'up')   return <ArrowUp   size={10} className="text-emerald-400" />
  if (trend === 'down') return <ArrowDown size={10} className="text-red-400" />
  return <Minus size={10} className="text-slate-500" />
}
function SubnetCard({ s, maxStake }: { s: Subnet; maxStake: number }) {
  const stakePct   = maxStake ? (s.stake_tao / maxStake) * 100 : 0
  const trendColor = s.trend === 'up' ? 'text-emerald-400' : s.trend === 'down' ? 'text-red-400' : 'text-slate-500'
  const scoreColor = s.score >= 90 ? '#34d399' : s.score >= 70 ? '#60a5fa' : s.score >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex-shrink-0 w-[160px] bg-dark-900 border border-dark-600 rounded-xl p-3 hover:border-dark-500 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white truncate">{s.name}</p>
          <p className="text-[10px] text-slate-500 font-mono uppercase">{s.ticker}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          <SubnetTrendIcon trend={s.trend} />
          <span className={clsx('text-[9px] font-mono font-bold', trendColor)}>{s.trend.toUpperCase()}</span>
        </div>
      </div>
      <div className="mb-2">
        <div className="flex justify-between text-[10px] font-mono mb-0.5">
          <span className="text-slate-500">Stake</span>
          <span className="text-slate-300">{((s.stake_tao ?? 0) / 1e6).toFixed(2)}M τ</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${stakePct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 mb-2">
        <div className="bg-dark-800 rounded px-1.5 py-0.5 text-center">
          <p className="text-[9px] text-slate-500 font-mono">APY</p>
          <p className="text-[11px] font-bold text-emerald-400 font-mono">{(s.apy ?? 0).toFixed(1)}%</p>
        </div>
        <div className="bg-dark-800 rounded px-1.5 py-0.5 text-center">
          <p className="text-[9px] text-slate-500 font-mono">Emit</p>
          <p className="text-[11px] font-bold text-yellow-400 font-mono">{((s.emission ?? 0) * 100).toFixed(2)}%</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] font-mono mb-0.5">
          <span className="text-slate-500">Score</span>
          <span className="font-bold" style={{ color: scoreColor }}>{(s.score ?? 0).toFixed(1)}</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.score ?? 0)}%`, background: scoreColor }} />
        </div>
      </div>
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Summary {
  total_trades: number
  total_pnl: number
  wins: number
  losses: number
  win_rate: number
  best_trade: number
  worst_trade: number
  active_strategies: number
}

interface StrategyStat {
  name: string
  label: string
  total_trades: number
  total_pnl: number
  wins: number
  losses: number
  win_rate: number
  avg_pnl: number
  best_trade: number
  worst_trade: number
}

// Session XXVII: EquityPoint + WinRatePoint types removed (charts relocated).

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, dec = 4) {
  const s = Math.abs(n).toFixed(dec)
  return n >= 0 ? `+${s}` : `-${s}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-slate-300 uppercase tracking-widest font-mono">{label}</p>
      <p className={clsx('text-2xl font-bold font-mono', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-300">{sub}</p>}
    </div>
  )
}

function PnlCell({ v }: { v: number }) {
  return (
    <span className={clsx('font-mono text-sm', v > 0 ? 'text-accent-green' : v < 0 ? 'text-red-400' : 'text-slate-300')}>
      {fmt(v, 4)}
    </span>
  )
}

function WinRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 70 ? 'bg-accent-green/20 text-accent-green' :
    rate >= 55 ? 'bg-blue-500/20 text-blue-400' :
    rate >= 40 ? 'bg-yellow-400/20 text-yellow-400' :
                 'bg-red-500/20 text-red-400'
  return (
    <span className={clsx('px-2 py-0.5 rounded font-mono text-xs font-semibold', color)}>
      {pct(rate)}
    </span>
  )
}

// Session XXVII: EquityTooltip + WrWindow removed with chart relocations.

// ── sort types ────────────────────────────────────────────────────────────────
type SortKey    = 'total_pnl' | 'win_rate' | 'total_trades' | 'best_trade' | 'worst_trade'
type TimeRange  = '1h' | '6h' | '24h' | '7d' | 'all'

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1h': 1, '6h': 6, '24h': 24, '7d': 168, 'all': 0,
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Analytics() {
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [strategies, setStrategies] = useState<StrategyStat[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchErrors, setFetchErrors] = useState<string[]>([])
  const [sortKey,    setSortKey]    = useState<SortKey>('total_pnl')
  const [sortAsc,    setSortAsc]    = useState(false)
  const [timeRange,  setTimeRange]  = useState<TimeRange>('all')
  const [subnets,    setSubnets]    = useState<Subnet[]>([])

  const setAnalyticsStats = useBotStore(s => s.setAnalyticsStats)

  // Session XXVII: dropped /analytics/equity and /analytics/rolling-winrate
  // fetches from this page — charts moved to Dashboard (Drawdown, XXVI) and
  // PnL Summary (Rolling Win Rate, XXVII). Network Analytics now only needs
  // summary + strategy leaderboard data.
  const load = useCallback(async (range: TimeRange = timeRange) => {
    setLoading(true)
    setFetchErrors([])
    const h = TIME_RANGE_HOURS[range]
    const hoursParam = h > 0 ? `?hours=${h}` : ''

    const results = await Promise.allSettled([
      api.get(`/analytics/summary${hoursParam}`),
      api.get('/analytics/strategies'),
    ])

    const errors: string[] = []

    if (results[0].status === 'fulfilled') setSummary(results[0].value.data)
    else errors.push('Summary')

    if (results[1].status === 'fulfilled') setStrategies(results[1].value.data)
    else errors.push('Strategies')

    if (errors.length) setFetchErrors(errors)
    setLoading(false)
  }, [timeRange])

  useEffect(() => { load() }, [load])

  // Top Subnets — 60s refresh (relocated from Agent Fleet)
  useEffect(() => {
    const fetchSubnets = async () => {
      try {
        const r = await api.get('/market/subnets?limit=20&sort=stake')
        setSubnets(r.data.subnets ?? [])
      } catch { /* silent — non-critical */ }
    }
    fetchSubnets()
    const t = setInterval(fetchSubnets, 60_000)
    return () => clearInterval(t)
  }, [])

  const handleTimeRange = useCallback((r: TimeRange) => {
    setTimeRange(r)
    load(r)
  }, [load])

  // Push stats + time-range control into shared store so Layout top bar can display them
  useEffect(() => {
    setAnalyticsStats({
      totalTrades:      summary?.total_trades ?? 0,
      activeStrategies: summary?.active_strategies ?? 0,
      timeRange,
      handleTimeRange:  (r: string) => handleTimeRange(r as TimeRange),
    })
    return () => setAnalyticsStats(null)
  }, [summary?.total_trades, summary?.active_strategies, timeRange, handleTimeRange, setAnalyticsStats])

  // sort strategies
  const sorted = [...strategies].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number)
    return sortAsc ? diff : -diff
  })

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronUp size={10} className="text-slate-300" />
    return sortAsc
      ? <ChevronUp   size={10} className="text-accent-blue" />
      : <ChevronDown size={10} className="text-accent-blue" />
  }

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 text-slate-300">
        <RefreshCw size={20} className="animate-spin" />
        <span className="font-mono text-sm">Loading analytics…</span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-dark-900">

      {/* ── Fetch error banner ──────────────────────────────────────────────── */}
      {fetchErrors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs font-mono text-yellow-400">
          <span className="font-bold">⚠ Partial data</span>
          <span className="text-yellow-500/70">—</span>
          <span className="text-yellow-300/80">Failed to load: {fetchErrors.join(', ')}</span>
        </div>
      )}

      {/* ── Top Subnets by Stake ── TOP OF PAGE ──────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600">
          <BarChart2 size={13} className="text-accent-blue" />
          <span className="text-[12px] font-bold tracking-widest text-slate-300 uppercase">Top Subnets</span>
          <span className="text-[11px] text-slate-600 font-mono ml-1">by stake · live</span>
          <span className="ml-auto text-[11px] text-slate-600 font-mono">{subnets.length} loaded</span>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 py-3">
          {subnets.length === 0 ? (
            <div className="text-[11px] text-slate-600 font-mono py-2 flex items-center gap-2">
              <Activity size={11} className="animate-pulse" /> Loading subnets…
            </div>
          ) : (() => {
            const maxStake = Math.max(...subnets.map(s => s.stake_tao), 1)
            return subnets.map(s => <SubnetCard key={s.uid} s={s} maxStake={maxStake} />)
          })()}
        </div>
      </div>

      {/* ── Chart area ─────────────────────────────────────────────────────────
          Session XXVI: Drawdown relocated to Dashboard.
          Session XXVII: Rolling Win Rate relocated to PnL Summary (below
          Cumulative PnL) per partner request. Chart area removed entirely
          from Network Analytics — this page now focuses on subnet + strategy
          metrics only. ─────────────────────────────────────────────────── */}

      {/* Strategy table legend relocated to Strategies page (Session XXXV) —
          Mav: this Rank/WR/W-L key belongs next to the actual strategy cards,
          not on Subnet Analytics. Win-rate thresholds also reconciled against
          the canonical TIERS in Strategies.tsx (was a 4-tier mismatch). */}
      {/* Strategy Performance Leaderboard + Strategy PnL Distribution relocated to Strategies (Session XXV) */}

      {/* ── Network Heat Map ──────────────────────────────────────────────── */}
      <SubnetHeatMap />

      </div>{/* end scrollable */}
    </div>
  )
}