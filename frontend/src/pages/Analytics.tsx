import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Activity, BarChart2,
  Award, RefreshCw, ChevronUp, ChevronDown, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── colours ───────────────────────────────────────────────────────────────────
const C_GREEN  = '#00ff88'
const C_BLUE   = '#3b9eff'
const C_RED    = '#ff4757'
const C_YELLOW = '#ffd700'
const C_PURPLE = '#a78bfa'

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

interface EquityPoint  { time: string; pnl: number; cumulative: number; strategy: string }
interface DrawdownPoint { time: string; pnl: number; drawdown: number; equity: number }
interface WinRatePoint  { time: string; win_rate: number; n: number }

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

// ── custom tooltip ─────────────────────────────────────────────────────────────
function EquityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono">
      <p className="text-slate-300 mb-1">{label}</p>
      <p className="text-accent-green">Cumulative: {fmt(payload[0]?.value, 4)} TAO</p>
      <p className="text-blue-400">Trade PnL: {fmt(payload[1]?.value ?? 0, 6)}</p>
    </div>
  )
}

function DrawdownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono">
      <p className="text-slate-300 mb-1">{label}</p>
      <p className="text-accent-green">Equity: {fmt(payload[0]?.value, 4)}</p>
      <p className="text-red-400">Drawdown: {fmt(payload[1]?.value ?? 0, 4)}</p>
    </div>
  )
}

// ── sort types ────────────────────────────────────────────────────────────────
type SortKey    = 'total_pnl' | 'win_rate' | 'total_trades' | 'best_trade' | 'worst_trade'
type TimeRange  = '1h' | '6h' | '24h' | '7d' | 'all'
type WrWindow   = 10 | 20 | 50

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1h': 1, '6h': 6, '24h': 24, '7d': 168, 'all': 0,
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Analytics() {
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [strategies, setStrategies] = useState<StrategyStat[]>([])
  const [equity,     setEquity]     = useState<EquityPoint[]>([])
  const [drawdown,   setDrawdown]   = useState<DrawdownPoint[]>([])
  const [winRate,    setWinRate]    = useState<WinRatePoint[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchErrors, setFetchErrors] = useState<string[]>([])
  const [sortKey,    setSortKey]    = useState<SortKey>('total_pnl')
  const [sortAsc,    setSortAsc]    = useState(false)
  const [activeChart, setActiveChart] = useState<'equity' | 'drawdown' | 'winrate'>('equity')
  const [timeRange,  setTimeRange]  = useState<TimeRange>('all')
  const [wrWindow,   setWrWindow]   = useState<WrWindow>(20)

  const load = useCallback(async (range: TimeRange = timeRange, window: WrWindow = wrWindow) => {
    setLoading(true)
    setFetchErrors([])
    const h = TIME_RANGE_HOURS[range]
    const hoursParam = h > 0 ? `?hours=${h}` : ''

    const results = await Promise.allSettled([
      api.get(`/analytics/summary${hoursParam}`),
      api.get('/analytics/strategies'),
      api.get(`/analytics/equity${hoursParam}`),
      api.get(`/analytics/drawdown${hoursParam}`),
      api.get(`/analytics/rolling-winrate?window=${window}${h > 0 ? `&hours=${h}` : ''}`),
    ])

    const errors: string[] = []

    if (results[0].status === 'fulfilled') setSummary(results[0].value.data)
    else errors.push('Summary')

    if (results[1].status === 'fulfilled') setStrategies(results[1].value.data)
    else errors.push('Strategies')

    if (results[2].status === 'fulfilled') setEquity(results[2].value.data)
    else errors.push('Equity curve')

    if (results[3].status === 'fulfilled') setDrawdown(results[3].value.data)
    else errors.push('Drawdown')

    if (results[4].status === 'fulfilled') setWinRate(results[4].value.data)
    else errors.push('Rolling win rate')

    if (errors.length) setFetchErrors(errors)
    setLoading(false)
  }, [timeRange, wrWindow])

  useEffect(() => { load() }, [load])

  function handleTimeRange(r: TimeRange) {
    setTimeRange(r)
    load(r, wrWindow)
  }
  function handleWrWindow(w: WrWindow) {
    setWrWindow(w)
    load(timeRange, w)
  }

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

  // thin equity data for rendering (show every Nth point if > 200 points)
  const stride = Math.max(1, Math.floor(equity.length / 200))
  const equityThin = equity.filter((_, i) => i % stride === 0)
  const ddThin     = drawdown.filter((_, i) => i % Math.max(1, Math.floor(drawdown.length / 100)) === 0)
  const wrThin     = winRate.filter((_, i) => i % stride === 0)

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 text-slate-300">
        <RefreshCw size={20} className="animate-spin" />
        <span className="font-mono text-sm">Loading analytics…</span>
      </div>
    </div>
  )

  // ── min drawdown for Y axis ────────────────────────────────────────────────
  const minDD = Math.min(0, ...drawdown.map(d => d.drawdown)) * 1.1 || -0.01

  return (
    <div className="p-6 space-y-6 min-h-screen bg-dark-900">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 size={24} className="text-accent-blue" />
            Analytics
          </h1>
          <p className="text-sm text-slate-300 mt-0.5">
            {summary?.total_trades ?? 0} trades across {summary?.active_strategies ?? 0} strategies
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-dark-800 border border-dark-600 rounded-lg p-1">
            <Clock size={11} className="text-slate-400 ml-1" />
            {(['1h', '6h', '24h', '7d', 'all'] as TimeRange[]).map(r => (
              <button key={r}
                onClick={() => handleTimeRange(r)}
                className={clsx(
                  'px-2.5 py-1 rounded text-[13px] font-mono font-bold transition-colors',
                  timeRange === r
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'text-slate-400 hover:text-slate-200'
                )}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => load()}
            className="flex items-center gap-2 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white hover:border-accent-blue transition-colors font-mono"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Fetch error banner ──────────────────────────────────────────────── */}
      {fetchErrors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs font-mono text-yellow-400">
          <span className="font-bold">⚠ Partial data</span>
          <span className="text-yellow-500/70">—</span>
          <span className="text-yellow-300/80">Failed to load: {fetchErrors.join(', ')}</span>
        </div>
      )}

      {/* ── Data context note ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[14px] font-mono text-slate-400">
        <span className="text-blue-400 font-bold flex-shrink-0">ℹ DATA CONTEXT</span>
        <span>
          Stats include <span className="text-slate-300">full trade history</span> (paper + real on-chain).
          Paper trades are simulation — they establish the win-rate and PnL baselines used for gate promotions.
          Real on-chain trades are a small subset — filter by <span className="text-emerald-400">⛓ Real Only</span> in Trade Log for the confirmed subset.
        </span>
      </div>

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPI
            label="Total PnL"
            value={`${fmt(summary.total_pnl, 4)} τ`}
            sub={`${summary.total_trades.toLocaleString()} trades`}
            color={summary.total_pnl >= 0 ? 'text-accent-green' : 'text-red-400'}
          />
          <KPI
            label="Win Rate"
            value={pct(summary.win_rate)}
            sub={`${summary.wins.toLocaleString()}W / ${summary.losses.toLocaleString()}L`}
            color={summary.win_rate >= 55 ? 'text-accent-green' : 'text-yellow-400'}
          />
          <KPI
            label="Best Trade"
            value={`${fmt(summary.best_trade, 4)} τ`}
            color="text-accent-green"
          />
          <KPI
            label="Worst Trade"
            value={`${fmt(summary.worst_trade, 4)} τ`}
            color="text-red-400"
          />
          <KPI
            label="Live Strategies"
            value={`${summary.active_strategies}`}
            sub="firing real trades"
            color="text-emerald-400"
          />
        </div>
      )}

      {/* ── Chart area ─────────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        {/* Tab selector + win rate window toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {[
              { key: 'equity',   icon: TrendingUp,   label: 'Equity Curve' },
              { key: 'drawdown', icon: TrendingDown,  label: 'Drawdown' },
              { key: 'winrate',  icon: Activity,      label: 'Rolling Win Rate' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveChart(key as any)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors',
                  activeChart === key
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                    : 'text-slate-300 hover:text-white border border-transparent'
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          {/* Win rate window toggle — only relevant on winrate tab */}
          {activeChart === 'winrate' && (
            <div className="flex items-center gap-1 bg-dark-700 border border-dark-600 rounded-lg p-0.5">
              <span className="text-[15px] text-slate-500 font-mono px-1.5">window</span>
              {([10, 20, 50] as WrWindow[]).map(w => (
                <button key={w}
                  onClick={() => handleWrWindow(w)}
                  className={clsx(
                    'px-2.5 py-1 rounded text-[13px] font-mono font-bold transition-colors',
                    wrWindow === w
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-slate-400 hover:text-slate-200'
                  )}>
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Equity Curve ─────────────────────────────────────────────────── */}
        {activeChart === 'equity' && (
          <div>
            <p className="text-xs text-slate-300 font-mono mb-3 uppercase tracking-widest">
              Cumulative PnL — {equity.length} trades
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={equityThin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="cumulGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C_GREEN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C_GREEN} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C_BLUE} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C_BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} />
                <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
                <Tooltip content={<EquityTooltip />} />
                <Area dataKey="cumulative" stroke={C_GREEN} strokeWidth={2} fill="url(#cumulGrad)" dot={false} name="Cumulative" />
                <Area dataKey="pnl"        stroke={C_BLUE}  strokeWidth={1} fill="url(#pnlGrad)"  dot={false} name="Trade PnL" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Drawdown ─────────────────────────────────────────────────────── */}
        {activeChart === 'drawdown' && (
          <div>
            <p className="text-xs text-slate-300 font-mono mb-3 uppercase tracking-widest">
              Drawdown from peak — hourly buckets
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={ddThin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C_GREEN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C_GREEN} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C_RED} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={C_RED} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} />
                <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
                <Tooltip content={<DrawdownTooltip />} />
                <Area dataKey="equity"   stroke={C_GREEN} strokeWidth={2} fill="url(#eqGrad)" dot={false} name="Equity" />
                <Area dataKey="drawdown" stroke={C_RED}   strokeWidth={1.5} fill="url(#ddGrad)" dot={false} name="Drawdown" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Rolling win rate ─────────────────────────────────────────────── */}
        {activeChart === 'winrate' && (
          <div>
            <p className="text-xs text-slate-300 font-mono mb-3 uppercase tracking-widest">
              Rolling {wrWindow}-trade win rate
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={wrThin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <ReferenceLine y={55} stroke={C_GREEN}  strokeDasharray="4 4" label={{ value: 'Gate 55%', fill: C_GREEN, fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={50} stroke={C_YELLOW} strokeDasharray="4 4" label={{ value: 'Break-even', fill: C_YELLOW, fontSize: 10, position: 'insideBottomRight' }} />
                <Tooltip
                  contentStyle={{ background: '#152030', border: '1px solid #243450', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                  formatter={(v: any) => [`${v}%`, 'Win Rate']}
                />
                <Line dataKey="win_rate" stroke={C_PURPLE} strokeWidth={2} dot={false} name="Win Rate" />
              </LineChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex gap-4 mt-2 justify-end text-xs font-mono">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-accent-green inline-block" /> Gate (55%)</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-yellow-400 inline-block" /> Break-even (50%)</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" /> Win Rate</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Strategy comparison table ───────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Award size={16} className="text-accent-blue" />
            Strategy Performance Leaderboard
          </h2>
          <p className="text-xs text-slate-300 font-mono">{strategies.length} strategies</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-xs text-slate-300 uppercase tracking-wider font-mono">
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Strategy</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('total_trades')}>
                  <span className="flex items-center justify-end gap-1">Trades <SortIcon col="total_trades" /></span>
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('win_rate')}>
                  <span className="flex items-center justify-end gap-1">Win Rate <SortIcon col="win_rate" /></span>
                </th>
                <th className="px-5 py-3 text-right">W / L</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('total_pnl')}>
                  <span className="flex items-center justify-end gap-1">Total PnL <SortIcon col="total_pnl" /></span>
                </th>
                <th className="px-5 py-3 text-right">Avg PnL</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('best_trade')}>
                  <span className="flex items-center justify-end gap-1">Best <SortIcon col="best_trade" /></span>
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('worst_trade')}>
                  <span className="flex items-center justify-end gap-1">Worst <SortIcon col="worst_trade" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <tr key={s.name} className="border-b border-dark-700/50 hover:bg-dark-700/40 transition-colors">
                  {/* Rank */}
                  <td className="px-5 py-3 text-slate-300 font-mono text-xs">{idx + 1}</td>

                  {/* Strategy name */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <span className="text-yellow-400">🥇</span>}
                      {idx === 1 && <span className="text-slate-300">🥈</span>}
                      {idx === 2 && <span className="text-amber-600">🥉</span>}
                      <div>
                        <p className="text-white font-medium text-xs">{s.label}</p>
                        <p className="text-slate-300 font-mono text-[13px]">{s.name}</p>
                      </div>
                    </div>
                  </td>

                  {/* Trades */}
                  <td className="px-5 py-3 text-right">
                    <span className="font-mono text-slate-300">{s.total_trades}</span>
                  </td>

                  {/* Win rate badge */}
                  <td className="px-5 py-3 text-right">
                    <WinRateBadge rate={s.win_rate} />
                  </td>

                  {/* W/L */}
                  <td className="px-5 py-3 text-right font-mono text-xs">
                    <span className="text-accent-green">{s.wins}</span>
                    <span className="text-slate-300"> / </span>
                    <span className="text-red-400">{s.losses}</span>
                  </td>

                  {/* Total PnL */}
                  <td className="px-5 py-3 text-right"><PnlCell v={s.total_pnl} /></td>

                  {/* Avg PnL */}
                  <td className="px-5 py-3 text-right"><PnlCell v={s.avg_pnl} /></td>

                  {/* Best */}
                  <td className="px-5 py-3 text-right">
                    <span className="font-mono text-xs text-accent-green">{fmt(s.best_trade, 4)}</span>
                  </td>

                  {/* Worst */}
                  <td className="px-5 py-3 text-right">
                    <span className="font-mono text-xs text-red-400">{fmt(s.worst_trade, 4)}</span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-300 font-mono text-xs">No trade data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PnL distribution mini bar chart ────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={16} className="text-accent-green" />
          Strategy PnL Distribution
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={[...strategies].sort((a, b) => b.total_pnl - a.total_pnl)}
            margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#243450" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              angle={-30}
              textAnchor="end"
              interval={0}
              height={50}
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} />
            <ReferenceLine y={0} stroke="#334155" />
            <Tooltip
              contentStyle={{ background: '#152030', border: '1px solid #243450', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
              formatter={(v: any) => [v.toFixed(4), 'Total PnL']}
            />
            <Bar dataKey="total_pnl" radius={[4, 4, 0, 0]}>
              {[...strategies]
                .sort((a, b) => b.total_pnl - a.total_pnl)
                .map((s, i) => (
                  <Cell key={s.name} fill={s.total_pnl >= 0 ? C_GREEN : C_RED} />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-end text-xs font-mono text-slate-300">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-accent-green inline-block" /> Positive</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Negative</span>
        </div>
      </div>

    </div>
  )
}