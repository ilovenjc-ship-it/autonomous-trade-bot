import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, TrendingDown,
  Award, RefreshCw, ChevronUp, ChevronDown, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import SubnetHeatMap from '@/components/SubnetHeatMap'
import { useBotStore } from '@/store/botStore'

// Session XXVII: Recharts imports removed — Rolling Win Rate chart moved to
// PnL Summary. Network Analytics now serves as subnet + strategy metrics
// only, no on-page chart rendering (hence no recharts dependency).

// Day 9 (Session XLI): Top Subnets card relocated from this page → Subnet
// Market Data (where it sits above the search/filter row, alongside the
// table that drills into the same subnet roster). Subnet/SubnetCard/
// SubnetTrendIcon/useNavigate import all left with it. In their place, the
// KPI Row was relocated FROM Subnet Market Data → here, sitting above the
// Network Heat Map so the page leads with TAO price + total stake + active
// subnet count + up/down breakdown before the heatmap visualisation.

// ── KPI Row types (relocated from Subnet Market Data, Day 9) ──────────────────
interface Overview {
  tao_price: number
  total_subnets: number
  total_stake_tao: number
  total_stake_usd: number
  avg_apy: number
  top_subnet: { uid?: number; name?: string; stake_tao?: number } | null
  up_subnets: number
  down_subnets: number
}

// ── Helpers (relocated alongside the KPI Row) ─────────────────────────────────
function fmtTAO(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M τ`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K τ`
  return `${v.toFixed(0)} τ`
}
function fmtUSD(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

// Compact KPI tile — matches the look the row had on Subnet Market Data.
function KpiTile({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex flex-col gap-1 min-w-0">
      <p className="text-[13px] text-slate-300 uppercase tracking-widest font-mono truncate">{label}</p>
      <p className={clsx('text-xl font-bold font-mono truncate', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-[13px] text-slate-300 truncate">{sub}</p>}
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
  const [overview,   setOverview]   = useState<Overview | null>(null)

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

  // KPI Row — /market/overview, 30s refresh (relocated from Subnet Market
  // Data, Day 9). Quiet on errors — overview is decorative; the heatmap
  // below is the load-bearing surface on this page.
  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const r = await api.get('/market/overview')
        setOverview(r.data)
      } catch { /* silent — non-critical */ }
    }
    fetchOverview()
    const t = setInterval(fetchOverview, 30_000)
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

      {/* ── KPI Row (relocated from Subnet Market Data, Day 9) ──────────────
          Renders above the Network Heat Map. Stays decorative — the heatmap
          is the load-bearing surface on Subnet Analytics; KPIs lead the page
          with at-a-glance market context (TAO price, total stake, avg APY,
          active subnet count, top subnet) before the heatmap. */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <KpiTile label="TAO Price"      value={`$${(overview.tao_price ?? 0).toFixed(2)}`}        color="text-accent-blue" />
          <KpiTile label="Total Staked"   value={fmtTAO(overview.total_stake_tao)}                   sub={fmtUSD(overview.total_stake_usd)} />
          <KpiTile label="Avg APY"        value={`${(overview.avg_apy ?? 0).toFixed(1)}%`}           color="text-accent-green" />
          <KpiTile label="Active Subnets" value={`${overview.total_subnets ?? 0}`}                   sub={`${overview.up_subnets ?? 0}↑ / ${overview.down_subnets ?? 0}↓`} />
          <KpiTile label="Top Subnet"     value={overview.top_subnet?.name?.slice(0, 12) ?? '—'}     sub={overview.top_subnet?.uid != null ? `SN${overview.top_subnet.uid}` : '—'} />
          <KpiTile label="Top Stake"      value={fmtTAO(overview.top_subnet?.stake_tao)}             color="text-yellow-400" />
        </div>
      )}

      {/* ── Chart area ─────────────────────────────────────────────────────────
          Session XXVI: Drawdown relocated to Dashboard.
          Session XXVII: Rolling Win Rate relocated to PnL Summary (below
          Cumulative PnL) per partner request. Chart area removed entirely
          from Network Analytics — this page now focuses on subnet + strategy
          metrics only.
          Day 9 (XLI): Top Subnets card relocated OUT of this page → Subnet
          Market Data (sits above its search/filter row). KPI Row relocated
          IN from Subnet Market Data → above the heatmap (see above). */}

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