/**
 * P&L Summary — Milestone 12 / Session X
 * Cumulative PnL by strategy, by day, by trade type, equity curve.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, DollarSign, Trophy, Zap, ArrowUp, ArrowDown, Layers, RefreshCw, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import toast from 'react-hot-toast'

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

// ── Paper Activity types ───────────────────────────────────────────────────────

interface PaperTrade {
  id:             number
  side:           'BUY' | 'SELL'
  strategy:       string
  label:          string
  amount_tao:     number
  price_usd:      number
  pnl_tao:        number
  pnl_pct:        number
  is_win:         boolean
  signal_reason:  string
  timestamp:      string
}

interface PaperStratCard {
  strategy:      string
  label:         string
  total_trades:  number
  wins:          number
  losses:        number
  win_rate:      number
  total_pnl:     number
  avg_pnl:       number
  last_trade_at: string | null
  last_side:     'BUY' | 'SELL'
  last_amount:   number
  last_price:    number
  last_pnl:      number
}

interface PaperActivity {
  recent_trades:  PaperTrade[]
  strategy_cards: PaperStratCard[]
  totals: {
    total_trades: number
    total_wins:   number
    win_rate:     number
    total_pnl:    number
  }
  tao_price: number
}

// ── Staking position types ────────────────────────────────────────────────────

interface StakePosition {
  hotkey:      string
  stake:       number
  netuid:      number
  alpha_price: number
  tao_value:   number
}

interface StakesData {
  stakes:          StakePosition[]
  total:           number
  total_tao_value: number
}

// ── Live Positions types ──────────────────────────────────────────────────────

interface LivePosition {
  id:                  number
  netuid:              number
  hotkey:              string
  strategy:            string | null
  entry_alpha_price:   number
  current_alpha_price: number
  tao_staked:          number
  current_tao_value:   number
  pnl_pct:             number
  pnl_tao:             number
  sl_level:            number
  tp_level:            number
  sl_pct:              number
  tp_pct:              number
  status:              string
  open_tx_hash:        string | null
  realized_pnl_tao:    number | null
  opened_at:           string | null
  closed_at:           string | null
}

interface PositionsData {
  positions:  LivePosition[]
  open_count: number
  sl_pct:     number
  tp_pct:     number
}

const STRATEGY_DISPLAY: Record<string, string> = {
  momentum_cascade:   'Momentum Cascade',
  dtao_flow_momentum: 'dTAO Flow Momentum',
  liquidity_hunter:   'Liquidity Hunter',
  breakout_hunter:    'Breakout Hunter',
  yield_maximizer:    'Yield Maximizer',
  contrarian_flow:    'Contrarian Flow',
  volatility_arb:     'Volatility Arb',
  sentiment_surge:    'Sentiment Surge',
  balanced_risk:      'Balanced Risk',
  mean_reversion:     'Mean Reversion',
  emission_momentum:  'Emission Momentum',
  macro_correlation:  'Macro Correlation',
}

const SUBNET_NAMES: Record<number, string> = {
  0:   'Root Network',
  1:   'Apex',
  3:   'MyShell',
  8:   'Taoshi PTN',
  9:   'Pretrain',
  18:  'Cortex.t',
  19:  'Vision',
  21:  'Filetao',
  24:  'Omega Labs',
  64:  'Chutes',
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PnLSummary() {
  const [data,    setData]    = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState<'day' | 'week'>('day')

  // ── Paper Activity state ──────────────────────────────────────────────────
  const [paperActivity, setPaperActivity] = useState<PaperActivity | null>(null)
  const [paperLoading,  setPaperLoading]  = useState(false)

  const fetchPaperActivity = useCallback(async () => {
    setPaperLoading(true)
    try {
      const { data } = await api.get<PaperActivity>('/pnl/paper-activity')
      setPaperActivity(data)
    } catch (_) {}
    finally { setPaperLoading(false) }
  }, [])

  // ── Staking Positions state ───────────────────────────────────────────────
  const [stakes,       setStakes]       = useState<StakesData | null>(null)
  const [stakesLoading,setStakesLoading]= useState(false)
  const [unstaking,    setUnstaking]    = useState<Record<string, boolean>>({})
  const [unstakingAll, setUnstakingAll] = useState(false)

  // ── Live Positions state ──────────────────────────────────────────────────
  const [positions,  setPositions]  = useState<PositionsData | null>(null)
  const [posLoading, setPosLoading] = useState(false)

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

  const fetchStakes = useCallback(async () => {
    setStakesLoading(true)
    try {
      const { data: sd } = await api.get<StakesData>('/wallet/stakes')
      setStakes(sd)
    } catch {}
    finally { setStakesLoading(false) }
  }, [])

  const fetchPositions = useCallback(async () => {
    setPosLoading(true)
    try {
      const { data: pd } = await api.get<PositionsData>('/fleet/positions')
      setPositions(pd)
    } catch {}
    finally { setPosLoading(false) }
  }, [])

  const handleUnstake = async (netuid: number, hotkey: string, subnetName: string) => {
    const key = `${netuid}-${hotkey}`
    setUnstaking(prev => ({ ...prev, [key]: true }))
    try {
      const { data: res } = await api.post<{
        success: boolean; alpha_amount?: number; tx_hash?: string; error?: string
      }>('/wallet/unstake-position', { netuid, hotkey })
      if (res.success) {
        toast.success(`✅ Unstaked ${(res.alpha_amount ?? 0).toFixed(4)} α from ${subnetName}`, { duration: 6000 })
        setTimeout(() => fetchStakes(), 4000)
      } else {
        toast.error(res.error ?? `Unstake failed for ${subnetName}`)
      }
    } catch {
      toast.error(`Network error unstaking ${subnetName}`)
    } finally {
      setUnstaking(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleUnstakeAll = async () => {
    if (!window.confirm('Unstake ALL positions? This withdraws every staked αTAO back to liquid TAO. Cannot be undone.')) return
    setUnstakingAll(true)
    try {
      const { data: res } = await api.post<{
        success: boolean; summary?: { total: number; succeeded: number; failed: number }; error?: string
      }>('/wallet/unstake-all')
      if (res.success) {
        const s = res.summary
        toast.success(`✅ Unstake All complete — ${s?.succeeded ?? '?'} positions exited`, { duration: 8000 })
        setTimeout(() => fetchStakes(), 5000)
      } else {
        toast.error(res.error ?? 'Unstake All failed')
      }
    } catch {
      toast.error('Network error during Unstake All')
    } finally {
      setUnstakingAll(false)
    }
  }

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { fetchStakes() }, [fetchStakes])
  useEffect(() => {
    const t = setInterval(fetchStakes, 30_000)
    return () => clearInterval(t)
  }, [fetchStakes])

  useEffect(() => { fetchPositions() }, [fetchPositions])
  useEffect(() => {
    const t = setInterval(fetchPositions, 30_000)
    return () => clearInterval(t)
  }, [fetchPositions])

  useEffect(() => { fetchPaperActivity() }, [fetchPaperActivity])
  useEffect(() => {
    const t = setInterval(fetchPaperActivity, 20_000)   // refresh every 20s
    return () => clearInterval(t)
  }, [fetchPaperActivity])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500 font-mono text-sm animate-pulse">Loading P&L data…</div>
      </div>
    )
  }

  const { fleet, by_strategy, by_type, by_day, by_week } = data
  const barData = view === 'day' ? by_day : (by_week ?? by_day)
  const maxPnl  = Math.max(...by_strategy.map(s => Math.abs(s.total_pnl)), 0.001)
  const topStrategy = by_strategy[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">

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

      {/* ── Live Positions — Stop-Loss / Take-Profit Monitor (relocated from Wallet) ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className={
              (positions?.open_count ?? 0) > 0 ? 'text-amber-400' : 'text-slate-500'
            } />
            <h2 className="text-sm font-semibold text-white">Live Positions</h2>
            <span className="text-[12px] text-slate-500 font-mono">Stop-Loss / Take-Profit Monitor</span>
            {(positions?.open_count ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {positions?.open_count} OPEN
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* SL / TP badges */}
            {positions && (
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/20 text-red-400">
                  <TrendingDown size={10} /> SL {positions.sl_pct.toFixed(0)}%
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
                  <TrendingUp size={10} /> TP {positions.tp_pct.toFixed(0)}%
                </span>
              </div>
            )}
            <button
              onClick={fetchPositions}
              disabled={posLoading}
              className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white font-mono transition-colors"
            >
              <RefreshCw size={11} className={posLoading ? 'animate-spin' : ''} />
              {posLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Positions list */}
        {posLoading && !positions ? (
          <div className="flex items-center justify-center py-6 text-slate-500 text-xs font-mono gap-2">
            <Activity size={12} className="animate-pulse" /> Loading positions…
          </div>
        ) : positions?.positions && positions.positions.filter(p => p.status === 'open').length > 0 ? (
          <div className="space-y-3">
            {positions.positions.filter(p => p.status === 'open').map(pos => {
              const subnetName = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
              const stratName  = STRATEGY_DISPLAY[pos.strategy ?? ''] ?? pos.strategy ?? '—'
              const pnl        = pos.pnl_pct
              const isUp       = pnl > 0
              const isDown     = pnl < 0

              const slGap = pos.entry_alpha_price > 0
                ? ((pos.current_alpha_price - pos.sl_level) / (pos.entry_alpha_price - pos.sl_level)) * 100
                : 100
              const dangerZone = slGap < 25 && isDown

              const range  = pos.tp_pct + pos.sl_pct
              const barPos = Math.min(100, Math.max(0, ((pnl + pos.sl_pct) / range) * 100))

              return (
                <div
                  key={pos.id}
                  className={clsx(
                    'rounded-xl border p-4 space-y-3 transition-all',
                    dangerZone
                      ? 'bg-red-500/5 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.08)]'
                      : isUp
                      ? 'bg-dark-700 border-emerald-500/20'
                      : 'bg-dark-700 border-dark-600'
                  )}
                >
                  {/* Row 1: identity + PnL */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        SN{pos.netuid}
                      </span>
                      <span className="text-sm font-semibold text-white">{subnetName}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{stratName}</span>
                    </div>
                    <div className="text-right">
                      <p className={clsx(
                        'text-lg font-black font-mono',
                        isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-slate-400'
                      )}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}%
                      </p>
                      <p className={clsx(
                        'text-[11px] font-mono',
                        isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-slate-500'
                      )}>
                        {pos.pnl_tao >= 0 ? '+' : ''}{pos.pnl_tao.toFixed(4)}τ
                      </p>
                    </div>
                  </div>

                  {/* Row 2: SL-to-TP bar */}
                  <div className="space-y-1">
                    <div className="relative h-2 bg-dark-600 rounded-full overflow-visible">
                      {isDown && (
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-red-500/60"
                          style={{ width: `${barPos}%` }}
                        />
                      )}
                      {isUp && (
                        <div
                          className="absolute inset-y-0 rounded-full bg-emerald-500/60"
                          style={{ left: '50%', width: `${barPos - 50}%` }}
                        />
                      )}
                      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-500" />
                      <div
                        className={clsx(
                          'absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-all',
                          dangerZone ? 'border-red-400 bg-red-500 animate-pulse' :
                          isUp       ? 'border-emerald-400 bg-emerald-500' :
                                       'border-amber-400 bg-amber-500'
                        )}
                        style={{ left: `calc(${barPos}% - 5px)` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-red-400">SL {pos.sl_level.toFixed(4)}τ</span>
                      <span className="text-slate-500">entry {pos.entry_alpha_price.toFixed(4)}τ</span>
                      <span className="text-emerald-400">TP {pos.tp_level.toFixed(4)}τ</span>
                    </div>
                  </div>

                  {/* Row 3: price detail + staked */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <div className="flex items-center gap-3">
                      <span>
                        Current: <span className={clsx('font-semibold', isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-white')}>
                          {pos.current_alpha_price > 0 ? `τ${pos.current_alpha_price.toFixed(5)}` : 'no price'}
                        </span>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span>Staked: <span className="text-slate-300">{pos.tao_staked.toFixed(4)}τ</span></span>
                    </div>
                    {dangerZone && (
                      <span className="flex items-center gap-1 text-red-400 font-semibold animate-pulse">
                        <TrendingDown size={10} /> Near SL
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-xs font-mono space-y-1">
            <ShieldAlert size={20} className="mx-auto text-slate-700 mb-2" />
            <p>No open positions tracked</p>
            <p className="text-slate-600">
              Positions appear when LIVE bots execute on-chain BUY trades.
              Stop-loss ({positions?.sl_pct ?? 8}%) and take-profit ({positions?.tp_pct ?? 25}%) 
              monitor automatically.
            </p>
          </div>
        )}

        {/* Recently closed positions */}
        {positions?.positions && positions.positions.filter(p => p.status !== 'open').length > 0 && (
          <div className="mt-4 pt-4 border-t border-dark-600">
            <p className="text-[12px] text-slate-500 uppercase tracking-widest font-mono mb-3">Recently Closed (7 days)</p>
            <div className="space-y-2">
              {positions.positions.filter(p => p.status !== 'open').map(pos => {
                const subnetName = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
                const statusMap: Record<string, { label: string; color: string }> = {
                  sl_hit:      { label: '🛑 Stop-Loss',   color: 'text-red-400'     },
                  tp_hit:      { label: '🎯 Take-Profit', color: 'text-emerald-400' },
                  closed:      { label: '✓ Closed',       color: 'text-slate-400'   },
                  failed_exit: { label: '⚠ Failed Exit',  color: 'text-amber-400'   },
                }
                const s = statusMap[pos.status] ?? { label: pos.status, color: 'text-slate-400' }
                return (
                  <div key={pos.id} className="flex items-center justify-between px-3 py-2 bg-dark-700/50 rounded-lg text-[11px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">SN{pos.netuid}</span>
                      <span className="text-slate-400">{subnetName}</span>
                      <span className={clsx('font-semibold', s.color)}>{s.label}</span>
                    </div>
                    <div className="text-right">
                      {pos.realized_pnl_tao != null && (
                        <span className={clsx('font-semibold', pos.realized_pnl_tao >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {pos.realized_pnl_tao >= 0 ? '+' : ''}{pos.realized_pnl_tao.toFixed(4)}τ
                        </span>
                      )}
                      <span className="text-slate-600 ml-2">
                        {pos.closed_at ? new Date(pos.closed_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Paper Trading Activity ───────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700"
             style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Activity size={15} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Paper Trading Activity</p>
              <p className="text-[11px] text-slate-500 font-mono">
                Simulated trades — how all 12 strategies are buying &amp; selling in paper mode
              </p>
            </div>
            {paperActivity && (
              <div className="flex items-center gap-2 ml-2">
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-300">
                  {paperActivity.totals.total_trades} trades
                </span>
                <span className={clsx(
                  'px-2 py-0.5 text-[10px] font-bold font-mono rounded border',
                  (paperActivity.totals.total_pnl ?? 0) >= 0
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                    : 'bg-red-500/15 border-red-500/25 text-red-400'
                )}>
                  {(paperActivity.totals.total_pnl ?? 0) >= 0 ? '+' : ''}{(paperActivity.totals.total_pnl ?? 0).toFixed(4)}τ
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  {paperActivity.totals.win_rate}% WR
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              auto-refresh 20s · paper only
            </span>
            <button onClick={fetchPaperActivity} disabled={paperLoading}
              className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-white font-mono transition-colors">
              <RefreshCw size={11} className={paperLoading ? 'animate-spin' : ''} />
              {paperLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Explainer banner ── */}
          <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 text-[12px] font-mono text-slate-400 leading-relaxed">
            <span className="text-indigo-300 font-bold">How paper trading works: </span>
            Each strategy fires a BUY or SELL signal every cycle. The trade is simulated instantly using a
            fair random outcome (Gaussian, zero-drift) minus realistic round-trip fees — no artificial win bias.
            These are <span className="text-white font-bold">not real on-chain transactions</span>.
            They build the track record each strategy needs to earn promotion to LIVE.
            A strategy needs ≥55% win rate + ≥10 cycles to pass the gate.
          </div>

          {/* ── Strategy simulation cards grid ── */}
          {paperActivity && paperActivity.strategy_cards.length > 0 && (
            <div>
              <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">
                Strategy Simulation Cards — last action per bot
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {paperActivity.strategy_cards.map(card => {
                  const wr = card.win_rate
                  const wrColor = wr >= 70 ? 'text-emerald-400' : wr >= 55 ? 'text-sky-400' : wr >= 40 ? 'text-amber-400' : 'text-red-400'
                  const wrBg    = wr >= 70 ? 'bg-emerald-500/10 border-emerald-500/25' : wr >= 55 ? 'bg-sky-500/10 border-sky-500/25' : wr >= 40 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-red-500/10 border-red-500/25'
                  const pnlPos  = card.total_pnl >= 0
                  const lastWin = card.last_pnl > 0

                  // Time since last trade
                  const ago = card.last_trade_at
                    ? (() => {
                        const diff = Math.floor((Date.now() - new Date(card.last_trade_at).getTime()) / 1000)
                        if (diff < 60)  return `${diff}s ago`
                        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                        return `${Math.floor(diff / 3600)}h ago`
                      })()
                    : '—'

                  return (
                    <div key={card.strategy}
                      className={clsx('rounded-xl border p-3 flex flex-col gap-1.5 transition-all', wrBg)}>
                      {/* Strategy name */}
                      <div>
                        <p className="text-[11px] font-bold text-white leading-tight truncate">{card.label}</p>
                        <p className="text-[9px] font-mono text-slate-500 truncate">{card.strategy}</p>
                      </div>

                      {/* Last action badge */}
                      <div className="flex items-center gap-1">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border',
                          card.last_side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-red-500/20 text-red-400 border-red-500/40'
                        )}>
                          {card.last_side}
                        </span>
                        <span className={clsx('text-[10px] font-bold font-mono', lastWin ? 'text-emerald-400' : 'text-red-400')}>
                          {card.last_pnl > 0 ? '+' : ''}{card.last_pnl.toFixed(4)}τ
                        </span>
                      </div>

                      {/* Win rate */}
                      <div className={clsx('text-[11px] font-bold font-mono', wrColor)}>
                        {wr.toFixed(1)}% WR
                        <span className="text-slate-500 font-normal ml-1 text-[10px]">
                          {card.wins}W/{card.losses}L
                        </span>
                      </div>

                      {/* Cumulative PnL */}
                      <div className={clsx('text-[11px] font-bold font-mono', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                        {card.total_pnl >= 0 ? '+' : ''}{card.total_pnl.toFixed(4)}τ
                      </div>

                      {/* Last trade time */}
                      <p className="text-[9px] text-slate-600 font-mono">{ago} · {card.total_trades} trades</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Recent paper trade stream ── */}
          <div>
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">
              Recent Paper Trades — live stream (newest first)
            </p>

            {paperLoading && !paperActivity ? (
              <div className="flex items-center justify-center py-8 text-slate-500 text-xs font-mono gap-2">
                <Activity size={12} className="animate-pulse" /> Loading paper trades…
              </div>
            ) : !paperActivity?.recent_trades.length ? (
              <div className="rounded-xl border border-dark-600 py-10 text-center">
                <Activity size={28} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-mono">No paper trades yet.</p>
                <p className="text-slate-600 text-xs mt-1 font-mono">The cycle engine fires every 60s — trades will appear here.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dark-700/50 overflow-hidden">
                {/* Table header */}
                <div className="grid text-[10px] font-mono text-slate-500 uppercase tracking-wider px-4 py-2 bg-dark-900/50 border-b border-dark-700/50"
                     style={{ gridTemplateColumns: '90px 1fr 60px 80px 80px 70px 80px' }}>
                  <span>Time</span>
                  <span>Strategy</span>
                  <span className="text-center">Side</span>
                  <span className="text-right">Amount τ</span>
                  <span className="text-right">Price $</span>
                  <span className="text-right">PnL τ</span>
                  <span className="text-right">Result</span>
                </div>
                {/* Trade rows */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-dark-700/30">
                  {paperActivity.recent_trades.map(trade => {
                    const timeStr = (() => {
                      const d = new Date(trade.timestamp)
                      const diff = Math.floor((Date.now() - d.getTime()) / 1000)
                      if (diff < 60)  return `${diff}s ago`
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
                    })()
                    return (
                      <div key={trade.id}
                        className={clsx(
                          'grid px-4 py-2 text-[12px] font-mono transition-colors hover:bg-dark-700/30',
                          trade.is_win ? 'bg-emerald-500/3' : 'bg-red-500/3'
                        )}
                        style={{ gridTemplateColumns: '90px 1fr 60px 80px 80px 70px 80px' }}>
                        {/* Time */}
                        <span className="text-slate-600">{timeStr}</span>

                        {/* Strategy */}
                        <div className="min-w-0">
                          <span className="text-slate-300 truncate block">{trade.label}</span>
                          {trade.signal_reason && (
                            <span className="text-slate-600 text-[10px] truncate block">{trade.signal_reason.slice(0, 40)}</span>
                          )}
                        </div>

                        {/* Side badge */}
                        <div className="flex items-center justify-center">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            trade.side === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/35'
                              : 'bg-red-500/20 text-red-400 border-red-500/35'
                          )}>{trade.side}</span>
                        </div>

                        {/* Amount */}
                        <span className="text-right text-slate-300">{trade.amount_tao.toFixed(4)}</span>

                        {/* Price */}
                        <span className="text-right text-slate-500">${trade.price_usd.toFixed(2)}</span>

                        {/* PnL */}
                        <span className={clsx('text-right font-bold', trade.is_win ? 'text-emerald-400' : 'text-red-400')}>
                          {trade.pnl_tao > 0 ? '+' : ''}{trade.pnl_tao.toFixed(5)}
                        </span>

                        {/* Win/Loss pill */}
                        <div className="flex items-center justify-end">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            trade.is_win
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                          )}>
                            {trade.is_win ? 'WIN' : 'LOSS'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Staking Positions (relocated from Wallet) ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">Staking Positions</span>
            <span className="text-xs text-slate-500 font-mono">Live αTAO deployment</span>
            {stakes?.stakes && stakes.stakes.length > 0 && (
              <span className="px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                {stakes.stakes.length} ACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {stakes && stakes.total_tao_value > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-500">Total deployed:</span>
                <span className="text-purple-400 font-bold">τ{stakes.total_tao_value.toFixed(4)}</span>
                {data?.tao_price_usd && (
                  <span className="text-slate-500">${(stakes.total_tao_value * data.tao_price_usd).toFixed(2)}</span>
                )}
              </div>
            )}
            <button
              onClick={fetchStakes}
              disabled={stakesLoading}
              className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white font-mono transition-colors"
            >
              <RefreshCw size={11} className={stakesLoading ? 'animate-spin' : ''} />
              {stakesLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {stakesLoading && !stakes ? (
          <div className="flex items-center justify-center py-8 text-slate-500 text-xs font-mono gap-2">
            <RefreshCw size={12} className="animate-spin" /> Querying Finney mainnet…
          </div>
        ) : stakes?.stakes && stakes.stakes.length > 0 ? (
          <div className="space-y-2">
            {stakes.stakes.map((pos) => {
              const name   = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
              const total  = stakes.total_tao_value > 0 ? stakes.total_tao_value : 1
              const pct    = (pos.tao_value / total) * 100
              const usd    = data?.tao_price_usd ? pos.tao_value * data.tao_price_usd : null
              const isRoot = pos.netuid === 0
              const key    = `${pos.netuid}-${pos.hotkey}`
              return (
                <div
                  key={key}
                  className="bg-dark-700/80 border border-dark-600 rounded-xl p-3.5 space-y-2.5"
                >
                  {/* Row 1: subnet name + badge + TAO value */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'text-[11px] font-bold font-mono px-1.5 py-0.5 rounded',
                        isRoot ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'
                      )}>
                        SN{pos.netuid}
                      </span>
                      <span className="text-sm font-semibold text-white">{name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-emerald-400">τ{pos.tao_value.toFixed(4)}</p>
                      {usd != null && <p className="text-[11px] font-mono text-slate-400">${usd.toFixed(2)}</p>}
                    </div>
                  </div>

                  {/* Row 2: αTAO × price + bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px] font-mono text-slate-400">
                      <span>
                        <span className="text-slate-300">{pos.stake.toFixed(4)}</span>
                        <span className="text-slate-500"> αTAO</span>
                        {!isRoot && (
                          <>
                            <span className="text-slate-600 mx-1">×</span>
                            <span className="text-slate-400">τ{pos.alpha_price.toFixed(5)}</span>
                            <span className="text-slate-600 text-[10px] ml-1">/ αTAO</span>
                          </>
                        )}
                      </span>
                      <span className="text-slate-500">{pct.toFixed(1)}% of deployed</span>
                    </div>
                    <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all duration-700', isRoot ? 'bg-amber-400' : 'bg-purple-400')}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 3: hotkey + Unstake button */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-mono text-slate-600 truncate flex-1">{pos.hotkey}</p>
                    <button
                      onClick={() => handleUnstake(pos.netuid, pos.hotkey, name)}
                      disabled={unstaking[key] || unstakingAll}
                      className={clsx(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono transition-all flex-shrink-0 border',
                        unstaking[key]
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 cursor-wait'
                          : 'bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/50 active:scale-95'
                      )}
                    >
                      {unstaking[key]
                        ? <><RefreshCw size={9} className="animate-spin" /> Unstaking…</>
                        : <>↩ Unstake</>
                      }
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Footer: total + Unstake All */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-dark-700/40 border border-dark-600/50 rounded-xl mt-1">
              <span className="text-[13px] font-mono text-slate-400">Total Deployed</span>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-purple-400">τ{stakes.total_tao_value.toFixed(4)}</span>
                  {data?.tao_price_usd && (
                    <span className="text-[11px] font-mono text-slate-500 ml-2">
                      ${(stakes.total_tao_value * data.tao_price_usd).toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleUnstakeAll}
                  disabled={unstakingAll || Object.values(unstaking).some(Boolean)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono transition-all border',
                    unstakingAll
                      ? 'bg-red-600/20 text-red-300 border-red-500/40 cursor-wait'
                      : 'bg-red-600/15 text-red-400 border-red-500/30 hover:bg-red-600/25 hover:border-red-500/60 active:scale-95'
                  )}
                >
                  {unstakingAll
                    ? <><RefreshCw size={10} className="animate-spin" /> Unstaking All…</>
                    : <>↩ Unstake All</>
                  }
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs font-mono space-y-1">
            <Layers size={22} className="mx-auto text-slate-700 mb-2" />
            <p>No open staking positions</p>
            <p className="text-slate-600">Positions appear here when the bot executes BUY trades</p>
          </div>
        )}
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