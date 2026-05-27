/**
 * Pre-Trade Simulator — Day 12 (TaoDX-equivalent, our build)
 * ===========================================================
 *
 * Single-page surface for "what does this trade actually look like before
 * I sign it?". Inputs:
 *   • Subnet — full active dTAO universe (Day 12 R8: reserve cache spans
 *     all subnets returned by the price scan, not just TRADING_NETUIDS).
 *     Subnets without a fresh reserve snapshot show as disabled in the
 *     dropdown until the backend's 5-min metagraph cycle populates them.
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
import SlicedExecutionCard from '@/components/SlicedExecutionCard'

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

// R9: cliffs gain a `pool_pct` anchor so a bare "53,580τ" reads with
// "≈1.01% of pool" beside it.
interface CliffEntry { threshold_pct: number; cost_tao: number | null; pool_pct?: number | null }
interface ExitEntry  { move_pct: number; new_price_tao: number; tao_out: number; pnl_tao: number; pnl_pct: number }
// R9: HODL block gains `actual_lookback_days` so the UI can honestly
// surface "comparing against ~12h of history (need 30d)" rather than
// rendering a confident $0.00 verdict.
interface HodlBlock {
  tao_path_usd: number; alpha_path_usd: number; delta_usd: number; winner: string
  lookback_days: number; warming_up: boolean
  actual_lookback_days?: number
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

// Day 12 R6: subnet list fetched dynamically from /api/market/subnets/list
// — full SN0 Root + SN1-SN128 (vs hardcoded 6).
// R7: each entry carries `tradable: bool` so non-tradable rows render
// as disabled and selecting one shows a clean info card, not a 404.
// R8 (Mark green-lit "All subnets wired"): `tradable` semantic shifted
// from "in TRADING_NETUIDS" to "has cached reserves right now".  The
// "warming up" group shrinks organically each 5-min cycle as reserves
// populate; first cold-start cycle covers the bot's TRADING_NETUIDS as
// fallback so the UI is never empty.
type SubnetEntry = { uid: number; name: string; tradable: boolean }
const FALLBACK_SUBNETS: SubnetEntry[] = [
  { uid: 0, name: 'SN0  · Root', tradable: true },
]
const fmtSubnetLabel = (uid: number, name: string, tradable: boolean) => {
  const base = uid === 0 ? `SN0  · Root` : `SN${uid}  · ${name}`
  return tradable ? base : `${base}  · (warming up)`
}

// R7: defensive coercion — FastAPI sometimes returns `detail` as an object
// or array (validation errors).  Direct `${err}` then renders "[object Object]".
const errToString = (e: any): string => {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail))     return detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join('; ')
  if (detail && typeof detail === 'object') return detail.msg ?? JSON.stringify(detail)
  return e?.message ?? 'Request failed'
}

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
  // Day 12 R8: Mark dropped default trade size from 10τ → 0.1τ.  More
  // realistic for the typical paper-trade probe size; avoids landing
  // first-time users on a slippage figure that looks alarming for tiny
  // pools (a 10τ probe on a 5,000τ pool reads as ~0.4% — nothing wrong
  // with the math, just bad first impression).
  const [amount, setAmount]    = useState<number>(0.1)

  // Server state
  const [pool,    setPool]    = useState<PoolResponse | null>(null)
  const [sim,     setSim]     = useState<SimResponse  | null>(null)
  const [poolErr, setPoolErr] = useState<string | null>(null)
  const [simErr,  setSimErr]  = useState<string | null>(null)
  const [loadingPool, setLoadingPool] = useState(false)
  const [loadingSim,  setLoadingSim]  = useState(false)

  // Day 12 R6: dynamic full subnet list (Root + SN1-SN128)
  const [subnets, setSubnets] = useState<SubnetEntry[]>(FALLBACK_SUBNETS)

  // F-39B: feature flag for the Almgren-Chriss sliced-execution card.
  // Read from /api/fleet/risk/config; default OFF preserves the page layout.
  const [slicingFlag, setSlicingFlag] = useState<boolean>(false)
  useEffect(() => {
    let cancelled = false
    api.get<{ feature_almgren_chriss_slicing?: boolean }>('/fleet/risk/config')
      .then(r => { if (!cancelled) setSlicingFlag(r.data?.feature_almgren_chriss_slicing === true) })
      .catch(() => { /* silent — card just stays hidden */ })
    return () => { cancelled = true }
  }, [])

  // Fetch full subnet list once on mount
  useEffect(() => {
    let cancelled = false
    api.get<{ subnets: { uid: number; name: string; tradable: boolean }[] }>('/market/subnets/list')
      .then(r => {
        if (cancelled) return
        const list = r.data?.subnets ?? []
        if (list.length > 0) {
          setSubnets(list.map(s => ({
            uid: s.uid,
            name: fmtSubnetLabel(s.uid, s.name, s.tradable),
            tradable: s.tradable,
          })))
        }
      })
      .catch(() => { /* keep fallback so the selector still renders */ })
    return () => { cancelled = true }
  }, [])

  // Look up tradability for the currently-selected uid
  const selectedSubnet  = subnets.find(s => s.uid === netuid)
  const isTradable      = selectedSubnet?.tradable ?? true  // assume tradable until list loads

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchPool = useCallback(async (uid: number, tradable: boolean) => {
    // R7 guard (R8 update): skip the network call entirely when reserves
    // aren't cached yet. With reserve coverage now spanning all active
    // subnets, this is a temporal state ("warming up on the metagraph
    // loop") rather than a categorical "not in TRADING_NETUIDS".
    if (!tradable) {
      setPool(null); setSim(null)
      setPoolErr(null); setSimErr(null)
      return
    }
    setLoadingPool(true); setPoolErr(null)
    try {
      const { data } = await api.get<PoolResponse>(`/market/pool/${uid}`)
      setPool(data)
    } catch (e: any) {
      setPoolErr(errToString(e))
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
      setSimErr(errToString(e))
      setSim(null)
    } finally {
      setLoadingSim(false)
    }
  }, [])

  // Pool — refetch on subnet change + 30s poll (skipped for non-tradable subnets)
  useEffect(() => {
    fetchPool(netuid, isTradable)
    if (!isTradable) return
    const t = window.setInterval(() => fetchPool(netuid, isTradable), 30_000)
    return () => window.clearInterval(t)
  }, [netuid, isTradable, fetchPool])

  // Sim — debounced re-run on any input change (skipped for non-tradable)
  useEffect(() => {
    if (!isTradable) { setSim(null); setSimErr(null); return }
    const handle = window.setTimeout(() => runSim(netuid, side, amount), 250)
    return () => window.clearTimeout(handle)
  }, [netuid, side, amount, isTradable, runSim])

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
            Subnet Pool Simulator
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
              {/* R7/R8: split into two opt-groups — live reserves first,
                  warming-up second (selectable, surfaces an info panel
                  instead of a 404). The warming-up group shrinks every
                  5-min cycle as the backend's pool snapshotter populates
                  the rest of the active-subnet universe. */}
              <optgroup label={`Live reserves (${subnets.filter(s => s.tradable).length})`}>
                {subnets.filter(s => s.tradable).map(s => (
                  <option key={s.uid} value={s.uid}>{s.name}</option>
                ))}
              </optgroup>
              <optgroup label={`Warming up — reserves on next cycle (${subnets.filter(s => !s.tradable).length})`}>
                {subnets.filter(s => !s.tradable).map(s => (
                  <option key={s.uid} value={s.uid}>{s.name}</option>
                ))}
              </optgroup>
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
            {/* R7 guard: when pool reserves missing/0, show "—% pool" instead
                of the divide-by-zero artefact "10000% pool". */}
            <span>
              {sliderMax}τ (
              {(() => {
                const tau = pool?.reserves?.tao_in ?? 0
                return tau > 0
                  ? `${Math.round((sliderMax / tau) * 100)}% pool`
                  : '—% pool'
              })()}
              )
            </span>
          </div>
        </div>

        {/* Status banners */}
        {/* R7/R8: warming-up selection — clean info panel, not a red error.
            Reserve coverage spans all active subnets; this card reflects
            the temporal "next-cycle" state rather than a categorical
            "not tradable". The set shrinks every 5-min cycle. */}
        {!isTradable && selectedSubnet && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-600/40 text-slate-300 text-[13px]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <span className="text-slate-200 font-mono">{selectedSubnet.name.replace(/  · \(warming up\)$/, '')}</span> — reserves warming up.
              The simulator math runs against on-chain <span className="font-mono">(τ_in, α_in)</span> snapshots; the backend metagraph loop
              writes a fresh batch every 5 minutes and walks the full active-subnet universe. Try again in a moment, or pick
              a subnet from the <span className="text-slate-200">Live reserves</span> group above.
            </div>
          </div>
        )}
        {isTradable && (poolErr || pool?.warming_up) && (
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
        {isTradable && simErr && !pool?.warming_up && (
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
                {/* R9: cost_tao on top, pool_pct below as an anchor.  Bare
                    "53,580τ" can read as off without context — "≈1.01% of
                    pool" makes the size relationship explicit. */}
                <div className="text-right">
                  <div className="font-mono text-sm text-white">
                    {c.cost_tao != null ? fmtTao(c.cost_tao, 2) : '—'}
                  </div>
                  {c.pool_pct != null && (
                    <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                      ≈{c.pool_pct.toFixed(2)}% of pool
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(!sim || !sim.liquidity_cliffs?.length) && (
              <div className="text-[12px] text-slate-500 italic">awaiting simulation…</div>
            )}
            {/* R9: contextual footer — how far the current probe sits below
                the 1% cliff.  Helps sanity-check "is my trade size
                reasonable?". */}
            {sim?.liquidity_cliffs?.[0]?.cost_tao != null && sim.amount_tao > 0 && (() => {
              const cliff1 = sim.liquidity_cliffs[0].cost_tao!
              const headroom = cliff1 / sim.amount_tao
              return (
                <div className="text-[10px] font-mono text-slate-500 italic pt-1 px-1">
                  current probe {fmtTao(sim.amount_tao, 4)} · headroom to 1% cliff: {headroom >= 1000 ? `${(headroom/1000).toFixed(1)}k×` : `${headroom.toFixed(1)}×`}
                </div>
              )
            })()}
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
              {/* R9: when the probe is microscopic vs pool depth (≪0.1%),
                  the rebalanced-pool unwind is essentially price·entry_α
                  — i.e., a pure linear ±50% mapping.  Surface this so the
                  "exactly +50% / −50%" numbers don't read as fake.  At
                  larger sizes the unwind shows real curvature (the entry
                  α moves the rebalanced pool when redeemed). */}
              {sim && pool?.reserves && sim.amount_tao / pool.reserves.tao_in < 0.001 && (
                <div className="text-[10px] font-mono text-slate-500 italic px-1 pb-1 leading-snug">
                  probe is {((sim.amount_tao / pool.reserves.tao_in) * 100).toFixed(4)}% of pool — linear regime, the
                  rebalanced-pool math collapses to <span className="text-slate-400">price·entry_α</span> so ±50% maps cleanly to ±50% P&L.
                  Increase trade size to see curvature.
                </div>
              )}
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

      {/* ── Sliced Execution (F-39B · D-39 Part B) ───────────────────────────
          Almgren-Chriss optimal slicing companion to single-shot above.
          Render-gated on `feature_almgren_chriss_slicing` (default OFF
          preserves the page layout for operators not opted in).  When ON,
          the card POSTs to /api/market/sliced-execution on parameter
          change (debounced) and surfaces convexity savings + optimal N* T*. */}
      {slicingFlag && side === 'stake' && isTradable && (
        <SlicedExecutionCard
          enabled={slicingFlag}
          netuid={netuid}
          taoIn={amount}
        />
      )}

      {/* ── HODL Opportunity Cost ──────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-accent-yellow" />
          HODL Opportunity Cost · 30 days
          <InfoBubble side="right" content="If 30 days ago you'd spent the same TAO on this alpha at then-spot, would plain TAO have beaten holding alpha? Positive delta = alpha won; negative = TAO won. Warming-up flag means we don't have 30 days of pool snapshots yet." />
        </h2>
        {sim?.hodl_opportunity ? (
          <div>
            {/* R9 (Mark caught): the prior `warming_up` flag was true ONLY
                when there were zero rows.  As soon as we had one snapshot
                (which we always do post-Day-12-launch), it returned a
                confident $0.00 verdict comparing against minutes-old data.
                Backend now also flags warming_up when actual_lookback_days
                < 25; UI surfaces the real window honestly. */}
            {sim.hodl_opportunity.warming_up && (() => {
              const days = sim.hodl_opportunity.actual_lookback_days ?? 0
              const human =
                days < 1 ? `${(days * 24).toFixed(1)}h` :
                days < 7 ? `${days.toFixed(1)}d` :
                          `${Math.round(days)}d`
              return (
                <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-[12px]">
                  <span className="font-semibold">Warming up</span> — comparing against {human} of history (need 30d for the canonical verdict).
                  The numbers below reflect that shorter window; treat the delta as indicative only until the pool snapshotter has banked a full month of data.
                </div>
              )
            })()}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Plain TAO held</div>
                <div className="text-lg font-mono font-semibold text-white">{fmtUsd(sim.hodl_opportunity.tao_path_usd)}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  ${sim.hodl_opportunity.tao_30d_usd.toFixed(2)} → ${sim.hodl_opportunity.tao_now_usd.toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Bought alpha {sim.hodl_opportunity.warming_up
                    ? <span className="lowercase text-slate-500">(short window)</span>
                    : '30d ago'}
                </div>
                <div className="text-lg font-mono font-semibold text-white">{fmtUsd(sim.hodl_opportunity.alpha_path_usd)}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  α @ {sim.hodl_opportunity.alpha_30d_tao.toFixed(6)}τ → {sim.hodl_opportunity.alpha_now_tao.toFixed(6)}τ
                </div>
              </div>
              <div className={clsx('p-4 rounded-lg border',
                sim.hodl_opportunity.warming_up
                  ? 'bg-slate-800/60 border-slate-600/40'
                  : (sim.hodl_opportunity.delta_usd >= 0
                       ? 'bg-emerald-500/10 border-emerald-500/30'
                       : 'bg-red-500/10 border-red-500/30'))}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Delta (alpha − TAO)</div>
                <div className={clsx('text-lg font-mono font-semibold',
                  sim.hodl_opportunity.warming_up
                    ? 'text-slate-300'
                    : (sim.hodl_opportunity.delta_usd >= 0 ? 'text-accent-green' : 'text-accent-red'))}>
                  {sim.hodl_opportunity.delta_usd >= 0 ? '+' : ''}{fmtUsd(sim.hodl_opportunity.delta_usd)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1 uppercase">
                  {sim.hodl_opportunity.warming_up
                    ? 'verdict · pending 30d window'
                    : <>Winner · {sim.hodl_opportunity.winner}</>}
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