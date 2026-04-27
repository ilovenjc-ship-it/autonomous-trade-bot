/**
 * P&L Summary — Milestone 12 / Session X
 * Cumulative PnL by strategy, by day, by trade type, equity curve.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, DollarSign, Trophy, Zap, ArrowUp, ArrowDown } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Fleet {
  total_pnl_tau:     number
  total_pnl_usd:     number
  total_trades:      number
  wins:              number
  losses:            number
  win_rate:          number
  total_volume_usd:  number
  avg_pnl_per_trade: number
  best_trade:        number
  worst_trade:       number
}

interface StrategyRow {
  strategy:     string
  label:        string
  mode:         string
  is_active:    boolean
  total_pnl:    number
  total_pnl_usd:number
  total_trades: number
  wins:         number
  win_rate:     number
  avg_pnl:      number
  best_trade:   number
  worst_trade:  number
  pnl_share:    number
}

interface TypeRow {
  type:         string
  total_trades: number
  total_pnl:    number
  total_pnl_usd:number
  wins:         number
  win_rate:     number
  avg_pnl:      number
  volume_usd:   number
}

interface DayRow {
  date:         string
  total_trades: number
  pnl:          number
  pnl_usd:      number
  win_rate:     number
}

interface EquityPoint {
  ts:         string
  cumulative: number
  strategy:   string
}

interface WeekRow {
  week:         string
  total_trades: number
  pnl:          number
  pnl_usd:      number
  win_rate:     number
}

interface PnLData {
  fleet:         Fleet
  by_strategy:   StrategyRow[]
  by_type:       TypeRow[]
  by_day:        DayRow[]
  by_week:       WeekRow[]
  equity_series: EquityPoint[]
  tao_price_usd: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, dp = 4) => (n ?? 0).toFixed(dp)
const fmtUSD = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTau = (n: number | null | undefined) => `${(n ?? 0) >= 0 ? '+' : ''}${(n ?? 0).toFixed(6)} τ`
const pnlColor = (n: number | null | undefined) => ((n ?? 0) >= 0 ? '#10b981' : '#f87171')

function ModeBadge({ mode, isActive }: { mode: string; isActive: boolean }) {
  const cfg: Record<string, string> = {
    LIVE:              'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    APPROVED_FOR_LIVE: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
    PAPER_ONLY:        'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  const label: Record<string, string> = {
    LIVE:              'LIVE',
    APPROVED_FOR_LIVE: 'APPROVED',
    PAPER_ONLY:        'PAPER',
  }
  return (
    <span className={clsx('text-[13px] font-mono font-bold px-2 py-0.5 rounded-full border', cfg[mode] ?? cfg.PAPER_ONLY)}>
      {label[mode] ?? mode}
    </span>
  )
}

// Custom tooltip for bar/area charts
function PnLTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val: number = payload[0]?.value ?? 0
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 shadow-xl text-xs font-mono">
      <p className="text-slate-400 mb-1">{label}</p>
      <p style={{ color: pnlColor(val) }} className="font-bold">{fmtTau(val)}</p>
      <p className="text-slate-500">{fmtUSD(val * 259.31)}</p>
    </div>
  )
}

function EquityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const val: number = payload[0]?.value ?? 0
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 shadow-xl text-xs font-mono">
      <p className="text-slate-400 mb-1">Cumulative PnL</p>
      <p style={{ color: pnlColor(val) }} className="font-bold">{fmtTau(val)}</p>
      <p className="text-slate-500">{fmtUSD(val * 259.31)}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PnLSummary() {
  const [data,    setData]    = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState<'day' | 'week'>('day')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/pnl/summary')
      setData(res.data)
    } catch (e) {
      console.error('PnL load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [load])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500 font-mono text-sm animate-pulse">Loading P&L data…</div>
      </div>
    )
  }

  const { fleet, by_strategy, by_type, by_day, by_week, equity_series } = data
  const barData = view === 'day' ? by_day : (by_week ?? by_day)
  const maxPnl  = Math.max(...by_strategy.map(s => Math.abs(s.total_pnl)), 0.001)
  const topStrategy = by_strategy[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Page header bar — P&L Summary ──────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 bg-dark-800/80 border-b border-dark-700/60">
        {/* Icon */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
          <TrendingUp size={15} className="text-white" />
        </div>

        {/* Title + subtitle */}
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-sm font-bold text-white tracking-tight leading-none">P&amp;L Summary</span>
          <span className="text-xs font-mono text-slate-400 mt-0.5 leading-none">Fleet performance</span>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Fleet Hero Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: TrendingUp,
            label: 'Total PnL',
            value: `${fleet.total_pnl_tau >= 0 ? '+' : ''}${(fleet.total_pnl_tau ?? 0).toFixed(4)} τ`,
            sub:   fmtUSD(fleet.total_pnl_usd),
            color: fleet.total_pnl_tau >= 0 ? 'text-emerald-400' : 'text-red-400',
            glow:  fleet.total_pnl_tau >= 0 ? 'shadow-emerald-500/10' : 'shadow-red-500/10',
          },
          {
            icon: Activity,
            label: 'Win Rate',
            value: `${fleet.win_rate}%`,
            sub:   `${fleet.wins}W / ${fleet.losses}L`,
            color: fleet.win_rate >= 60 ? 'text-emerald-400' : 'text-amber-400',
            glow:  'shadow-indigo-500/10',
          },
          {
            icon: Zap,
            label: 'Total Trades',
            value: fleet.total_trades.toLocaleString(),
            sub:   `avg ${fmtTau(fleet.avg_pnl_per_trade)} / trade`,
            color: 'text-indigo-400',
            glow:  'shadow-indigo-500/10',
          },
          {
            icon: DollarSign,
            label: 'Volume',
            value: fmtUSD(fleet.total_volume_usd),
            sub:   `Best: ${fmtTau(fleet.best_trade)}`,
            color: 'text-amber-400',
            glow:  'shadow-amber-500/10',
          },
        ].map(({ icon: Icon, label, value, sub, color, glow }) => (
          <div key={label} className={clsx('bg-dark-800 border border-dark-600 rounded-2xl p-4 shadow-lg', glow)}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={14} className="text-slate-400" />
              <p className="text-[14px] text-slate-400 uppercase tracking-wider font-mono">{label}</p>
            </div>
            <p className={clsx('text-2xl font-bold font-mono', color)}>{value}</p>
            <p className="text-[14px] text-slate-500 font-mono mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Equity Curve ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">Cumulative Equity Curve</span>
          <span className="ml-auto text-xs font-mono text-emerald-400 font-bold">
            {fmtTau(fleet.total_pnl_tau)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={equity_series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="ts" hide />
            <YAxis width={72} tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} tickFormatter={v => `${v.toFixed(3)}τ`} />
            <Tooltip content={<EquityTooltip />} />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={2} fill="url(#pnlGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Strategy Leaderboard + BUY/SELL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Strategy leaderboard — 2/3 width */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-700 flex items-center gap-2">
            <Trophy size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Strategy Leaderboard</span>
            <span className="ml-auto text-[13px] text-slate-500 font-mono">{by_strategy.length} strategies</span>
          </div>
          <div className="divide-y divide-dark-700/60">
            {by_strategy.map((s, i) => (
              <div key={s.strategy} className="px-5 py-3 flex items-center gap-3 hover:bg-dark-700/30 transition-colors">
                {/* Rank */}
                <span className={clsx('text-sm font-bold font-mono w-5 text-center flex-shrink-0',
                  i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-600'
                )}>
                  {i + 1}
                </span>

                {/* Name + badge */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{s.label}</span>
                    <ModeBadge mode={s.mode} isActive={s.is_active} />
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 bg-dark-700 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.abs(s.total_pnl) / maxPnl * 100}%`,
                        backgroundColor: s.total_pnl >= 0 ? '#10b981' : '#f87171',
                      }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right flex-shrink-0">
                  <p className={clsx('text-sm font-bold font-mono', s.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {fmtTau(s.total_pnl)}
                  </p>
                  <p className="text-[13px] text-slate-500 font-mono">
                    {s.win_rate}% WR · {s.total_trades} trades
                  </p>
                </div>

                {/* Share */}
                <div className="text-right flex-shrink-0 w-12">
                  <p className="text-xs font-mono text-slate-400">{s.pnl_share > 0 ? `${s.pnl_share}%` : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BUY vs SELL — 1/3 width */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-700 flex items-center gap-2">
            <Activity size={13} className="text-indigo-400" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">By Trade Type</span>
          </div>
          <div className="p-5 space-y-5">
            {by_type.map(t => (
              <div key={t.type}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {t.type === 'BUY'
                      ? <ArrowUp size={14} className="text-emerald-400" />
                      : <ArrowDown size={14} className="text-red-400" />
                    }
                    <span className="text-sm font-bold text-white">{t.type}</span>
                  </div>
                  <span className={clsx('text-sm font-bold font-mono',
                    t.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {fmtTau(t.total_pnl)}
                  </span>
                </div>
                <div className="space-y-1.5 text-[14px] font-mono">
                  {[
                    { label: 'Trades',   val: t.total_trades.toLocaleString() },
                    { label: 'Win Rate', val: `${t.win_rate}%` },
                    { label: 'Avg PnL',  val: fmtTau(t.avg_pnl) },
                    { label: 'Volume',   val: fmtUSD(t.volume_usd) },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-slate-500">{label}</span>
                      <span className="text-slate-300">{val}</span>
                    </div>
                  ))}
                </div>
                {/* Divider between types */}
                {t.type === 'BUY' && <div className="border-b border-dark-700 mt-4" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Daily / Weekly PnL Bar Chart ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-white">PnL Over Time</span>
          <div className="ml-auto flex gap-1">
            {(['day', 'week'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx(
                  'px-3 py-1 rounded-lg text-[14px] font-mono font-semibold transition-colors',
                  view === v
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-500 hover:text-white'
                )}
              >
                {v === 'day' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>
        {barData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-600 text-sm font-mono">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey={view === 'day' ? 'date' : 'week'}
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={v => v?.slice(-5) ?? v}
              />
              <YAxis
                width={72}
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={v => `${v.toFixed(3)}τ`}
              />
              <Tooltip content={<PnLTooltip />} />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {barData.map((entry: DayRow | WeekRow, i: number) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? '#10b981' : '#f87171'} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top / Worst Trade ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-800 border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-[13px] text-emerald-400 uppercase tracking-wider font-mono mb-2">Best Single Trade</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">{fmtTau(fleet.best_trade)}</p>
          <p className="text-xs text-slate-500 font-mono mt-1">{fmtUSD(fleet.best_trade * (data.tao_price_usd ?? 259.31))}</p>
        </div>
        <div className="bg-dark-800 border border-red-500/20 rounded-2xl p-4">
          <p className="text-[13px] text-red-400 uppercase tracking-wider font-mono mb-2">Worst Single Trade</p>
          <p className="text-2xl font-bold font-mono text-red-400">{fmtTau(fleet.worst_trade)}</p>
          <p className="text-xs text-slate-500 font-mono mt-1">{fmtUSD(fleet.worst_trade * (data.tao_price_usd ?? 259.31))}</p>
        </div>
      </div>

      </div>{/* end scrollable */}
    </div>
  )
}