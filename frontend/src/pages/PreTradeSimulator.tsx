/**
 * Pre-Trade Simulator — Day 12 (TaoDX-equivalent, our build)
 * ===========================================================
 *
 * Single-page surface for "what does this trade actually look like before
 * I sign it?". Inputs:
 *   • Subnet (one of TRADING_NETUIDS — 0, 8, 9, 18, 64, 96)
 *   • Side  — stake (TAO → α) or unstake (α → TAO)
 *   • Amount in TAO (slider + numeric input)
 *
 * Outputs (all from /api/market/simulate, math = constant-product AMM):
 *   • Live slippage at the chosen size + filled amount + post-trade price
 *   • Three "liquidity cliffs" (1% / 2% / 5% slippage thresholds)
 *   • ±50% alpha-price exit scenarios with TAO P&L projections
 *   • Slippage curve chart (log-spaced, 64 points)
 *   • Depth tier (deep / healthy / moderate / thin)
 *   • 30-day HODL opportunity cost (alpha vs plain-TAO USD comparison)
 *   • 30-day pool-depth + 30-day price sparklines
 *
 * Reserves come from /api/market/pool/{netuid} (5-min refresh on the
 * backend; frontend polls every 30s for the live tile).
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import {
  Sparkles, Activity, TrendingUp, TrendingDown,
  AlertTriangle, Droplet, Target, ArrowRight, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import StatCard from '@/components/StatCard'
import { InfoBubble } from '@/components/Tooltip'
import { fmtETTime } from '@/lib/time'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PoolReserves {
  netuid: number
  tao_in: number
  alpha_in: number
  price_tao: number
  fetched_at: string
}

interface PoolResponse {
  netuid: number
  warming_up: boolean
  reserves?: PoolReserves
  depth_tier?: string
  sparkline_30d?: { ts: string; tao_in: number; alpha_in: number; price_tao: number }[]
  sparkline_7d?:  { ts: string; tao_in: number; alpha_in: number; price_tao: number }[]
  turnover_24h?: { avg_tao_in: number; tao_in_min: number; tao_in_max: number; tao_swing: number; samples: number }
  flow_14d?: { days: { day: string; in_tao: number; out_tao: number; events: number }[]; lookback_days: number; unavailable?: boolean }
  fetched_at?: string
  message?: string
}

interface CliffEntry { threshold_pct: number; cost_tao: number | null }
interface ExitEntry  { move_pct: number; new_price_tao: number; tao_out: number; pnl_tao: number; pnl_pct: number }
interface HodlBlock {
  tao_path_usd: number; alpha_path_usd: number; delta_usd: number; winner: string
  lookback_days: number; warming_up: boolean
  tao_now_usd: number; tao_30d_usd: number; alpha_now_tao: number; alpha_30d_tao: number
}
interface SimResponse {
  netuid: number; side: string; amount_tao: number
  reserves_before: { tao_in: number; alpha_in: number }
  reserves_after:  { tao_in: number; alpha_in: number }
  price_before: number; price_after: number
  filled: number; filled_unit: string
  slippage_pct: number
  depth_tier: string
  liquidity_cliffs: CliffEntry[]
  exit_scenarios:   ExitEntry[]
  hodl_opportunity: HodlBlock
  slippage_curve:   { cost_tao: number; slippage_pct: number }[]
  fetched_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRADING_UIDS: { uid: number; name: string }[] = [
  { uid: 0,  name: 'SN0  · Root' },
  { uid: 8,  name: 'SN8  · Vanta (PTN)' },
  { uid: 9,  name: 'SN9  · Pretraining' },
  { uid: 18, name: 'SN18 · Cortext' },
  { uid: 64, name: 'SN64 · Chutes' },
  { uid: 96, name: 'SN96 · Targon' },
]

const DEPTH_TIER_COLOR: Record<string, string> = {
  deep:     'text-accent-green',
  healthy:  'text-emerald-400',
  moderate: 'text-yellow-400',
  thin:     'text-red-400',
}

const SLIPPAGE_COLOR = (s: number) =>
  s < 0.5 ? 'text-accent-green'
  : s < 2   ? 'text-emerald-400'
  : s < 5   ? 'text-yellow-400'
  :           'text-red-400'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTao = (n: number, frac = 4) => `${n >= 0 ? '' : ''}${n.toFixed(frac)}τ`
const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(2)}K`
  :                `$${n.toFixed(2)}`
const fmtPct = (n: number, frac = 2) => `${n >= 0 ? '' : ''}${n.toFixed(frac)}%`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PreTradeSimulator() {
  // Inputs
  const [netuid, setNetuid]    = useState<number>(0)
  const [side, setSide]        = useState<'stake' | 'unstake'>('stake')
  const [amount, setAmount]    = useState<number>(10.0)

  // Server state
  const [pool,    setPool]    = useState<PoolResponse | null>(null)
  const [sim,     setSim]     = useState<SimResponse  | null>(null)
  const [poolErr, setPoolErr] = useState<string | null>(null)
  const [simErr,  setSimErr]  = useState<string | null>(null)
  const [loadingPool, setLoadingPool] = useState(false)
  const [loadingSim,  setLoadingSim]  = useState(false)

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchPool = useCallback(async (uid: number) => {
    setLoadingPool(true); setPoolErr(null)
    try {
      const { data } = await api.get<PoolResponse>(`/market/pool/${uid}`)
      setPool(data)
    } catch (e: any) {
      setPoolErr(e?.response?.data?.detail ?? e?.message ?? 'Pool fetch failed')
      setPool(null)
    } finally {
      setLoadingPool(false)
    }
  }, [])

  const runSim = useCallback(async (uid: number, sideArg: string, amt: number) => {
    if (amt <= 0) { setSim(null); return }
    setLoadingSim(true); setSimErr(null)
    try {
      const { data } = await api.post<SimResponse>('/market/simulate', {
        netuid: uid, side: sideArg, amount_tao: amt,
      })
      setSim(data)
    } catch (e: any) {
      setSimErr(e?.response?.data?.detail ?? e?.message ?? 'Simulate failed')
      setSim(null)
    } finally {
      setLoadingSim(false)
    }
  }, [])

  // Pool — refetch on subnet change + 30s poll
  useEffect(() => {
    fetchPool(netuid)
    const t = window.setInterval(() => fetchPool(netuid), 30_000)
    return () => window.clearInterval(t)
  }, [netuid, fetchPool])

  // Sim — debounced re-run on any input change
  useEffect(() => {
    const handle = window.setTimeout(() => runSim(netuid, side, amount), 250)
    return () => window.clearTimeout(handle)
  }, [netuid, side, amount, runSim])

  // ── Derived: max slider value = 25% of pool depth (or 100τ floor) ──────────
  const sliderMax = useMemo(() => {
    const tau = pool?.reserves?.tao_in ?? 0
    return Math.max(100, Math.floor(tau * 0.25))
  }, [pool?.reserves?.tao_in])

  const depthTier = sim?.depth_tier ?? pool?.depth_tier ?? '—'
  const tier      = depthTier.toLowerCase()

  // Slippage curve data with the user's chosen point overlaid
  const curveData = useMemo(() => {
    if (!sim?.slippage_curve) return []
    return sim.slippage_curve.map(p => ({ x: p.cost_tao, y: p.slippage_pct }))
  }, [sim?.slippage_curve])

  // Sparkline data — pool depth + price over 30d
  const sparkData = useMemo(() => {
    const rows = pool?.sparkline_30d ?? []
    return rows.map(r => ({
      ts: r.ts,
      tao_in: r.tao_in,
      price: r.price_tao,
    }))
  }, [pool?.sparkline_30d])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    /* R5 (Day 12): page wrapped in the same dark-frame pattern Risk Config /
       Agent Fleet use — bg-[#080d18] (near-black) + p-6 padding.  The dark
       bg gives the slate-500 frame borders (top/left/right from Layout.tsx)
       the high contrast they need to read clearly; the p-6 inset the content
       so it doesn't butt up against the frame edges. */
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 pb-8 bg-[#080d18] text-slate-100 font-mono">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-accent-blue" />
            Pre-Trade Simulator
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            Live constant-product AMM math — see slippage, fill, and exit P&L <span className="text-accent-yellow">before</span> you sign.
          </p>
        </div>
        {pool?.reserves && (
          <div className="text-right text-[12px] font-mono text-slate-400">
            <div>τ_in {pool.reserves.tao_in.toLocaleString(undefined, { maximumFractionDigits: 0 })}  ·  α_in {pool.reserves.alpha_in.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div>last refresh · {fmtETTime(pool.reserves.fetched_at)}</div>
          </div>
        )}
      </div>

      {/* ── Inputs row ──────────────────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Subnet selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              Subnet
              <InfoBubble side="right" content="Choose any tradable subnet. Each operates as an independent constant-product AMM with its own (τ_in, α_in) reserves." />
            </label>
            <select
              value={netuid}
              onChange={e => setNetuid(parseInt(e.target.value, 10))}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-accent-blue"
            >
              {TRADING_UIDS.map(s => (
                <option key={s.uid} value={s.uid}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Side toggle */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              Direction
              <InfoBubble side="right" content="Stake = TAO into the pool, receive alpha. Unstake = alpha into the pool, receive TAO. Both use the same constant-product math." />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['stake', 'unstake'] as const).map(s => (
                <button key={s} onClick={() => setSide(s)}
                  className={clsx(
                    'py-2 rounded-lg text-sm font-mono uppercase tracking-wide border transition',
                    side === s
                      ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                      : 'bg-dark-800 border-dark-600 text-slate-400 hover:border-dark-500',
                  )}>
                  {s === 'stake' ? 'Stake (τ → α)' : 'Unstake (α → τ)'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              Trade size · TAO
              <InfoBubble side="left" content="Amount of TAO to commit. Slippage rises super-linearly as your trade approaches a meaningful share of pool depth." />
            </label>
            <input
              type="number" min={0} max={sliderMax} step={0.1}
              value={amount}
              onChange={e => setAmount(Math.max(0, Math.min(sliderMax, parseFloat(e.target.value) || 0)))}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
        </div>

        {/* Slider — tactile sizing across orders of magnitude */}
        <div className="pt-2">
          <input
            type="range" min={0} max={sliderMax} step={0.1}
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value))}
            className="w-full accent-accent-blue cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>0τ</span>
            <span>{Math.floor(sliderMax * 0.25)}τ</span>
            <span>{Math.floor(sliderMax * 0.5)}τ</span>
            <span>{Math.floor(sliderMax * 0.75)}τ</span>
            <span>{sliderMax}τ ({Math.round(sliderMax / Math.max(pool?.reserves?.tao_in ?? 1, 1) * 100)}% pool)</span>
          </div>
        </div>

        {/* Status banners */}
        {(poolErr || pool?.warming_up) && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-[13px]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              {poolErr
                ? <>Pool fetch failed — <span className="font-mono text-yellow-400">{poolErr}</span></>
                : <>Reserves warming up — <span className="font-mono text-slate-400">{pool?.message ?? 'first metagraph cycle pending'}</span>. The pool snapshotter writes every 5 min on the metagraph loop; pull the page in a moment.</>
              }
            </div>
          </div>
        )}
        {simErr && !pool?.warming_up && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[13px]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Simulator error — <span className="font-mono">{simErr}</span></span>
          </div>
        )}
      </div>

      {/* ── KPI row: live readouts ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Slippage"
          value={sim ? fmtPct(sim.slippage_pct, 4) : '—'}
          color={sim && sim.slippage_pct < 1 ? 'green' : sim && sim.slippage_pct < 5 ? 'yellow' : 'red'}
          icon={Target}
          info="Standard definition: (ideal − actual) / ideal × 100. Ideal = amount × spot price. Actual = AMM-curve fill."
        />
        <StatCard
          label="You receive"
          value={sim ? `${sim.filled.toFixed(4)} ${sim.filled_unit === 'alpha' ? 'α' : 'τ'}` : '—'}
          color="blue"
          icon={ArrowRight}
          info={side === 'stake'
            ? 'Alpha tokens you would receive for staking the chosen TAO. Decreases super-linearly as cost approaches pool depth.'
            : 'TAO you would receive for unstaking the alpha-equivalent of the chosen TAO at spot.'}
        />
        <StatCard
          label="Spot → After"
          value={sim ? `${sim.price_before.toFixed(6)}` : '—'}
          sub={sim ? `→ ${sim.price_after.toFixed(6)}τ/α` : ''}
          color="default"
          icon={Activity}
          info="Alpha price in TAO before the trade and the post-trade pool-implied price (τ_in / α_in after the swap)."
        />
        <StatCard
          label="Depth Tier"
          value={depthTier.toUpperCase()}
          color={tier === 'deep' || tier === 'healthy' ? 'green' : tier === 'moderate' ? 'yellow' : 'red'}
          icon={Droplet}
          info="Classification of TAO-side reserve. Deep ≥ 5,000τ, healthy ≥ 1,500τ, moderate ≥ 400τ, else thin."
        />
        <StatCard
          label="24h Pool Swing"
          value={pool?.turnover_24h ? `${pool.turnover_24h.tao_swing.toLocaleString(undefined, { maximumFractionDigits: 0 })}τ` : '—'}
          sub={pool?.turnover_24h ? `${pool.turnover_24h.samples} snapshots` : ''}
          color="purple"
          icon={TrendingUp}
          info="Lower-bound 24h pool turnover, computed from max−min of τ_in over the last 24h of snapshots. A reserve that swings widely indicates active trading volume."
        />
      </div>

      {/* ── Slippage curve + Sparkline ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Slippage curve */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp size={14} className="text-accent-blue" />
              Slippage Curve
              <InfoBubble side="right" content="Slippage as a function of trade size. Log-spaced cost axis. The dot marks your current trade. The dashed lines mark the 1%/2%/5% liquidity cliffs." />
            </h2>
            {loadingSim && <Loader2 size={12} className="animate-spin text-slate-500" />}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curveData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="slipGr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="x" type="number" scale="log" domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v: number) => v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(0) : `${(v/1000).toFixed(1)}k`}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={42}
              />
              <Tooltip
                contentStyle={{ background: '#0d1117', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                formatter={(v: any) => [`${(v as number).toFixed(3)}%`, 'slippage']}
                labelFormatter={(v: any) => `${(v as number).toFixed(3)}τ trade`}
              />
              {/* Liquidity-cliff reference lines */}
              {[1, 2, 5].map(t => (
                <ReferenceLine key={t} y={t} stroke="#475569" strokeDasharray="2 4"
                  label={{ value: `${t}%`, fill: '#94a3b8', fontSize: 10, position: 'right' }}
                />
              ))}
              <Area dataKey="y" stroke="#3b82f6" strokeWidth={2} fill="url(#slipGr)" />
              {/* User's current trade */}
              {sim && (
                <ReferenceDot
                  x={sim.amount_tao} y={sim.slippage_pct}
                  r={5} fill="#fbbf24" stroke="#fde68a" strokeWidth={2}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 30d Pool depth sparkline */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Droplet size={14} className="text-accent-green" />
              30-Day Pool Depth · τ_in
              <InfoBubble side="right" content="TAO-side reserve evolution over 30 days. Trending up → liquidity inflow. Trending down → liquidity bleed. Sampled every 5 min on the metagraph loop." />
            </h2>
            <span className="text-[10px] font-mono text-slate-500">{sparkData.length} pts</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sparkData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="ts" tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v: string) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : ''}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v: number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}k` : v.toFixed(0)}
                width={56}
              />
              <Tooltip
                contentStyle={{ background: '#0d1117', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                formatter={(v: any) => [`${(v as number).toLocaleString(undefined, { maximumFractionDigits: 0 })}τ`, 'τ_in']}
                labelFormatter={(v: string) => v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) : ''}
              />
              <Line dataKey="tao_in" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Liquidity cliffs + Exit scenarios ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Liquidity cliffs */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-yellow-400" />
            Liquidity Cliffs
            <InfoBubble side="right" content="The exact TAO trade size at which slippage crosses each threshold. Closed-form: cost = τ_in · s / (1 − s). Anything above the 5% cliff is generally a bad fill." />
          </h2>
          <div className="space-y-2">
            {sim?.liquidity_cliffs?.map(c => (
              <div key={c.threshold_pct} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-2 h-8 rounded',
                    c.threshold_pct === 1 ? 'bg-accent-green' :
                    c.threshold_pct === 2 ? 'bg-yellow-500' :
                    'bg-red-500')} />
                  <div>
                    <div className="text-[11px] uppercase text-slate-400 tracking-wider">{c.threshold_pct}% slippage</div>
                    <div className="text-[10px] text-slate-500">
                      {c.threshold_pct === 1 ? 'safe zone' :
                       c.threshold_pct === 2 ? 'tolerable' :
                       'avoid above this'}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-sm text-white">
                  {c.cost_tao != null ? fmtTao(c.cost_tao, 2) : '—'}
                </div>
              </div>
            ))}
            {(!sim || !sim.liquidity_cliffs?.length) && (
              <div className="text-[12px] text-slate-500 italic">awaiting simulation…</div>
            )}
          </div>
        </div>

        {/* Exit scenarios */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <TrendingDown size={14} className="text-accent-purple" />
            Exit Scenarios · ±50% alpha price
            <InfoBubble side="right" content="What you'd unwind back to in TAO if alpha price moved ±50% from spot. Assumes pool reserves rebalance to that price preserving k = τ_in · α_in. Stake direction only." />
          </h2>
          {side === 'unstake' ? (
            <div className="text-[12px] text-slate-500 italic px-2 py-6 text-center">
              Exit scenarios apply to stake (open position) only. <br/>
              Unstake closes the position immediately.
            </div>
          ) : (
            <div className="space-y-2">
              {sim?.exit_scenarios?.map(e => (
                <div key={e.move_pct} className="px-3 py-3 rounded-lg bg-dark-800/60 border border-dark-700">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {e.move_pct > 0
                        ? <TrendingUp size={14} className="text-accent-green" />
                        : <TrendingDown size={14} className="text-accent-red" />}
                      <span className="text-[12px] font-mono text-slate-200">
                        Alpha price {e.move_pct >= 0 ? '+' : ''}{e.move_pct}%
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        → {e.new_price_tao.toFixed(6)} τ/α
                      </span>
                    </div>
                    <span className={clsx('text-sm font-mono font-semibold',
                      e.pnl_tao >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                      {e.pnl_tao >= 0 ? '+' : ''}{e.pnl_tao.toFixed(4)}τ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Unwind: {e.tao_out.toFixed(4)}τ</span>
                    <span className={e.pnl_pct >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                      {e.pnl_pct >= 0 ? '+' : ''}{e.pnl_pct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
              {(!sim?.exit_scenarios?.length) && (
                <div className="text-[12px] text-slate-500 italic">awaiting simulation…</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── HODL Opportunity Cost ──────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-accent-yellow" />
          HODL Opportunity Cost · 30 days
          <InfoBubble side="right" content="If 30 days ago you'd spent the same TAO on this alpha at then-spot, would plain TAO have beaten holding alpha? Positive delta = alpha won; negative = TAO won. Warming-up flag means we don't have 30 days of pool snapshots yet." />
        </h2>
        {sim?.hodl_opportunity ? (
          <div>
            {sim.hodl_opportunity.warming_up && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-[12px]">
                Warming up — using oldest available history (need 30d of pool snapshots for the canonical comparison).
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Plain TAO held</div>
                <div className="text-lg font-mono font-semibold text-white">{fmtUsd(sim.hodl_opportunity.tao_path_usd)}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  ${sim.hodl_opportunity.tao_30d_usd.toFixed(2)} → ${sim.hodl_opportunity.tao_now_usd.toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Bought alpha 30d ago</div>
                <div className="text-lg font-mono font-semibold text-white">{fmtUsd(sim.hodl_opportunity.alpha_path_usd)}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  α @ {sim.hodl_opportunity.alpha_30d_tao.toFixed(6)}τ → {sim.hodl_opportunity.alpha_now_tao.toFixed(6)}τ
                </div>
              </div>
              <div className={clsx('p-4 rounded-lg border',
                sim.hodl_opportunity.delta_usd >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30')}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Delta (alpha − TAO)</div>
                <div className={clsx('text-lg font-mono font-semibold',
                  sim.hodl_opportunity.delta_usd >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {sim.hodl_opportunity.delta_usd >= 0 ? '+' : ''}{fmtUsd(sim.hodl_opportunity.delta_usd)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1 uppercase">
                  Winner · {sim.hodl_opportunity.winner}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-slate-500 italic">awaiting simulation…</div>
        )}
      </div>

      {/* ── Footer reference block ─────────────────────────────────────────── */}
      <div className="card p-4 text-[12px] text-slate-400 leading-relaxed">
        <div className="flex items-start gap-2">
          <Activity size={13} className="text-accent-blue mt-0.5 shrink-0" />
          <div>
            <span className="text-slate-300">Constant-product math · </span>
            Each subnet operates as <span className="text-accent-blue">τ_in · α_in = k</span>. A stake of cost <span className="font-mono">c</span> yields <span className="font-mono">α_in − τ_in·α_in / (τ_in + c)</span> alpha. Reserves snapshotted every 5 min from Finney via the metagraph loop. <span className="text-slate-500">Reference: docs.learnbittensor.org/learn/slippage</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}