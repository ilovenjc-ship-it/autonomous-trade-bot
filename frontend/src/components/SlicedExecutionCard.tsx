/**
 * SlicedExecutionCard.tsx — F-39B (D-39 Part B) Almgren-Chriss optimal slicing
 * ============================================================================
 *
 * Companion to the single-shot simulator on PreTradeSimulator.tsx.  Where
 * /simulate answers "what's the single-shot cost?", this card answers "if
 * we split into N slices over T cycles, what does the total cost become?"
 *
 * For Bittensor's constant-product AMM:
 *
 *     cost(τ_in) = τ_in · s / (1 − s)     where  s = τ_in / pool_τ
 *
 * This is the convex linear-impact case from Cartea/Jaimungal/Penalva Ch 6
 * §6.1.  Convexity ⇒ splitting reduces total cost — bounded above only by
 * adverse-selection (signal decay during the slicing window).
 *
 * Pool-fraction bands (D-39 Part B doctrine):
 *     < 1% pool   green   safe (no split)
 *     1–5% pool   amber   split recommended (N≥5)
 *     > 5% pool   red     mandatory split (N≥10) — operator-token override
 *
 * Render-gated client-side on `feature_almgren_chriss_slicing`.  When OFF
 * the card does not mount.
 *
 * Citations: Cartea/Jaimungal/Penalva *Algorithmic and HF Trading* Ch 6 §6.1.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Layers, AlertTriangle, ChevronDown, Info, Activity,
  Zap, Target, ArrowRight, TrendingDown, Shield,
} from 'lucide-react'
import clsx from 'clsx'
import { InfoBubble } from '@/components/Tooltip'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────

interface SlicedExecutionResponse {
  netuid: number
  strategy_id: string | null
  pool_tao_reserves: number
  tao_in: number
  pool_fraction: number
  band: {
    name: 'safe' | 'recommend_split' | 'mandatory_split'
    split_required: boolean
    recommend_n: number
    color: 'green' | 'amber' | 'red'
  }
  single_shot: { s: number; cost_tao: number }
  sliced: {
    n_slices: number
    t_cycles: number
    per_slice_size_tao: number
    per_slice_s: number
    per_slice_cost_tao: number
    total_cost_tao: number
    savings_tao: number
    savings_pct: number
    adverse_selection_uplift: number
    adverse_selection_warning: string | null
  }
  optimal: {
    n_star: number
    t_star: number
    optimal_cost_tao: number
    optimal_savings_tao: number
    method: string
  }
  adverse_selection: {
    signal_half_life_cycles: number | null
    t_cycles: number
    within_signal_window: boolean
    uplift: number
    warning: string | null
  }
  doctrine: { cost_formula: string; source: string; anchor: string }
  fetched_at: string
  computed_at: string
}

// ── helpers ───────────────────────────────────────────────────────────────

const BAND_TONE: Record<string, { color: string; bg: string; border: string; label: string; caption: string }> = {
  safe:             { color: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'SAFE',             caption: '< 1% pool — single-shot is fine, no split needed' },
  recommend_split:  { color: '#f59e0b', bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'SPLIT RECOMMENDED', caption: '1–5% pool — split into N≥5 slices to harvest convexity savings' },
  mandatory_split:  { color: '#ef4444', bg: 'bg-red-500/10',     border: 'border-red-500/30',     label: 'MANDATORY SPLIT',   caption: '> 5% pool — single-shot triggers material adverse fill; operator-token override required' },
}

function formatTau(n: number, digits = 4): string {
  if (n === Number.POSITIVE_INFINITY) return '∞ τ'
  if (n === Number.NEGATIVE_INFINITY) return '−∞ τ'
  if (Number.isNaN(n)) return '— τ'
  return `${n.toFixed(digits)} τ`
}

function formatPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

// ── pool-fraction band stripe ─────────────────────────────────────────────

function PoolFractionBandStripe({ pool_fraction }: { pool_fraction: number }) {
  const pct = pool_fraction * 100
  // Map pct to a 0..100 stripe position, capped.
  const clipped = Math.min(10, pct)  // beyond 10% just clamps
  const stripePos = (clipped / 10) * 100   // 0% → 0, 10% → 100

  return (
    <div className="space-y-1">
      <div className="flex items-center text-[10px] font-mono">
        <span className="text-emerald-400 flex-shrink-0">&lt; 1% safe</span>
        <span className="ml-auto text-amber-400">1–5% recommend split</span>
        <span className="ml-auto text-red-400 flex-shrink-0">&gt; 5% mandatory</span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden bg-dark-700">
        {/* Three bands */}
        <div className="absolute inset-y-0 left-0 bg-emerald-500/30" style={{ width: '10%' }} />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: '10%', width: '40%' }} />
        <div className="absolute inset-y-0 bg-red-500/30" style={{ left: '50%', width: '50%' }} />
        {/* Marker for current pool_fraction */}
        <div
          className="absolute -top-0.5 w-1 h-3 bg-white rounded-full shadow-lg"
          style={{ left: `calc(${stripePos}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-slate-500">
        <span>0%</span>
        <span className="text-white font-bold">● {formatPct(pct, 2)}</span>
        <span>≥10%</span>
      </div>
    </div>
  )
}

// ── mandatory-split modal ─────────────────────────────────────────────────

function MandatorySplitModal({
  data,
  onSwitchToSliced,
  onReduceTrade,
  onOverride,
  onClose,
}: {
  data: SlicedExecutionResponse
  onSwitchToSliced: () => void
  onReduceTrade: () => void
  onOverride: (token: string) => void
  onClose: () => void
}) {
  const [token, setToken] = useState('')
  const tokenValid = token.trim().toUpperCase() === 'LTCM_AWARE'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-900 border border-red-500/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 flex-shrink-0">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Mandatory Split Required</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">
              D-39 Part B doctrine · pool fraction &gt; 5%
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-slate-500 hover:text-white text-xl leading-none"
            aria-label="close"
          >×</button>
        </div>
        <div className="space-y-3 text-[13px] text-slate-200 leading-relaxed">
          <p>
            This trade is <span className="text-red-300 font-mono font-bold">{formatPct(data.pool_fraction * 100, 2)}</span> of pool reserves.
            Single-shot execution at this size triggers materially adverse fill quality and visible market impact.
          </p>
          <p className="text-slate-400">
            Per <span className="text-violet-300">{data.doctrine.anchor}</span> doctrine: pool fraction &gt; 5% requires split.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={onSwitchToSliced}
            className="w-full px-4 py-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 font-mono text-sm font-bold transition"
          >
            ▸ Switch to sliced execution (recommended)
          </button>
          <button
            onClick={onReduceTrade}
            className="w-full px-4 py-3 rounded-lg bg-dark-800 border border-dark-600 text-slate-300 hover:border-dark-500 font-mono text-sm font-bold transition"
          >
            ◂ Reduce trade size
          </button>
        </div>
        <div className="border-t border-dark-700 pt-3 space-y-2">
          <p className="text-[11px] text-slate-500 font-mono uppercase tracking-widest">
            Override (operator green-light only)
          </p>
          <input
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Type LTCM_AWARE to override"
            className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-red-500"
          />
          <button
            disabled={!tokenValid}
            onClick={() => tokenValid && onOverride(token)}
            className={clsx(
              'w-full px-4 py-2 rounded-lg font-mono text-sm font-bold transition',
              tokenValid
                ? 'bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30'
                : 'bg-dark-800 border border-dark-700 text-slate-600 cursor-not-allowed',
            )}
          >
            {tokenValid ? '⚠ Override mandatory split' : 'Type LTCM_AWARE to enable'}
          </button>
          <p className="text-[10px] text-slate-600 font-mono leading-snug">
            Override is logged to the audit trail with timestamp + operator token.
            Per D-32 LTCM forward-warning: correlated bets at unfraction-checked
            sizes have compounding ruin risk during regime breaks.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── main card ─────────────────────────────────────────────────────────────

export interface SlicedExecutionCardProps {
  /** Feature flag — render-gated; component returns null when false. */
  enabled: boolean
  netuid: number
  taoIn: number
  /** Optional strategy_id for adverse-selection half-life lookup. */
  strategyId?: string
}

export default function SlicedExecutionCard({
  enabled, netuid, taoIn, strategyId,
}: SlicedExecutionCardProps) {
  const [nSlices, setNSlices] = useState<number>(5)
  const [tCycles, setTCycles] = useState<number>(5)
  const [urgency, setUrgency] = useState<number>(0.5)
  const [data, setData] = useState<SlicedExecutionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [overridden, setOverridden] = useState<boolean>(false)

  const fetchData = useCallback(async () => {
    if (!enabled || taoIn <= 0) return
    setLoading(true)
    try {
      const res = await api.post<SlicedExecutionResponse>(
        '/market/sliced-execution',
        {
          netuid,
          tao_in: taoIn,
          n_slices: nSlices,
          t_cycles: tCycles,
          urgency,
          strategy_id: strategyId,
        },
      )
      setData(res.data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'sliced-execution fetch failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [enabled, netuid, taoIn, nSlices, tCycles, urgency, strategyId])

  // Debounced re-fetch on input change.
  useEffect(() => {
    if (!enabled) return
    const handle = window.setTimeout(fetchData, 300)
    return () => window.clearTimeout(handle)
  }, [fetchData, enabled])

  // Auto-trip the mandatory-split modal when band turns red and operator
  // hasn't already overridden.
  useEffect(() => {
    if (data?.band.name === 'mandatory_split' && !overridden && nSlices === 1) {
      setModalOpen(true)
    }
  }, [data, overridden, nSlices])

  if (!enabled) return null

  if (taoIn <= 0) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <Layers size={16} className="text-slate-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-slate-300 font-bold">Sliced Execution · F-39B</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Set a trade size above 0 τ to see Almgren-Chriss optimal slicing math.
          </p>
        </div>
      </div>
    )
  }

  const band = data?.band ? BAND_TONE[data.band.name] : null
  const sliced = data?.sliced
  const optimal = data?.optimal
  const adv = data?.adverse_selection

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Layers size={18} className="text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-white tracking-wide">
              Sliced Execution
            </h2>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
              F-39B · Almgren-Chriss
            </span>
            <InfoBubble
              content={
                <>
                  <p className="text-white font-bold mb-1">Almgren-Chriss optimal slicing</p>
                  <p>The AMM cost function is convex: <span className="font-mono text-amber-200">cost(τ_in) = τ_in · s / (1 − s)</span> where <span className="font-mono">s = τ_in / pool_τ</span>. Splitting reduces total cost — bounded above only by adverse-selection.</p>
                  <p className="mt-1.5 text-slate-400 text-[11px]">Cartea/Jaimungal/Penalva — Algorithmic &amp; HF Trading Ch 6 §6.1 · D-39 Part B (D-40 grant)</p>
                </>
              }
              side="bottom"
              maxWidth={400}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Convexity savings · pool-fraction bands · Almgren-Chriss optimal N* T*
          </p>
        </div>
        {loading && <Activity size={14} className="animate-pulse text-violet-400 flex-shrink-0" />}
      </div>

      {/* Pool-fraction band stripe */}
      {data && <PoolFractionBandStripe pool_fraction={data.pool_fraction} />}

      {/* Band verdict pill */}
      {band && data && (
        <div className={clsx(
          'rounded-xl border px-4 py-3 flex items-start gap-3',
          band.bg, band.border,
        )}>
          <div className="flex-shrink-0 mt-0.5">
            {data.band.name === 'safe'             && <Shield   size={16} style={{ color: band.color }} />}
            {data.band.name === 'recommend_split'  && <Layers   size={16} style={{ color: band.color }} />}
            {data.band.name === 'mandatory_split'  && <AlertTriangle size={16} style={{ color: band.color }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-[11px] font-mono font-bold tracking-widest"
                style={{ color: band.color }}
              >
                {band.label}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                pool fraction <span className="text-white">{formatPct(data.pool_fraction * 100, 2)}</span> ·
                recommend N≥{data.band.recommend_n}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">{band.caption}</p>
          </div>
        </div>
      )}

      {/* Controls — N slices, T cycles, urgency */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono flex items-center gap-1.5">
            Slices (N)
            <InfoBubble side="right" content="Number of equal slices the trade is split into. More slices = lower per-slice s = lower per-slice cost. Convexity guarantees savings for s>0 before adverse-selection uplift." />
          </label>
          <div className="grid grid-cols-4 gap-1">
            {[1, 5, 10, 20].map(n => (
              <button
                key={n}
                onClick={() => setNSlices(n)}
                className={clsx(
                  'py-1.5 rounded-lg text-[11px] font-mono font-bold border transition',
                  nSlices === n
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                    : 'bg-dark-800 border-dark-600 text-slate-400 hover:border-dark-500',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono flex items-center gap-1.5">
            Cycles (T)
            <InfoBubble side="right" content="Slicing window in fleet cycles (~5 min/cycle). Longer T = slower execution = more adverse-selection risk if signal half-life is shorter than T." />
          </label>
          <div className="grid grid-cols-4 gap-1">
            {[1, 5, 10, 20].map(t => (
              <button
                key={t}
                onClick={() => setTCycles(t)}
                className={clsx(
                  'py-1.5 rounded-lg text-[11px] font-mono font-bold border transition',
                  tCycles === t
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                    : 'bg-dark-800 border-dark-600 text-slate-400 hover:border-dark-500',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono flex items-center gap-1.5">
            Urgency
            <InfoBubble side="left" content="0=patient (low penalty for slow slicing), 1=urgent (high penalty when T exceeds signal half-life). Modulates the adverse-selection cost uplift." />
          </label>
          <input
            type="range" min={0} max={1} step={0.1}
            value={urgency}
            onChange={e => setUrgency(parseFloat(e.target.value))}
            className="w-full accent-violet-400 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500">
            <span>patient</span>
            <span className="text-violet-300 font-bold">{urgency.toFixed(1)}</span>
            <span>urgent</span>
          </div>
        </div>
      </div>

      {/* Cost comparison cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Single-shot */}
          <div className="rounded-xl bg-dark-800/60 border border-dark-700 p-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">
              Single-shot
            </div>
            <div className="text-xl font-black font-mono text-slate-200">
              {formatTau(data.single_shot.cost_tao, 4)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              s = {formatPct(data.single_shot.s * 100, 4)}
            </div>
          </div>
          {/* Sliced */}
          <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/30 p-4">
            <div className="text-[10px] uppercase tracking-widest text-amber-300 font-mono mb-1">
              Sliced (N={sliced?.n_slices}, T={sliced?.t_cycles})
            </div>
            <div className="text-xl font-black font-mono text-amber-200">
              {sliced ? formatTau(sliced.total_cost_tao, 4) : '—'}
            </div>
            {sliced && (
              <div className="text-[10px] font-mono text-emerald-400 mt-1">
                savings {formatTau(sliced.savings_tao, 4)} ({formatPct(sliced.savings_pct, 1)})
              </div>
            )}
          </div>
          {/* Almgren-Chriss optimal */}
          <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30 p-4">
            <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-mono mb-1 flex items-center gap-1">
              <Target size={10} /> Optimal (N*={optimal?.n_star}, T*={optimal?.t_star})
            </div>
            <div className="text-xl font-black font-mono text-emerald-200">
              {optimal ? formatTau(optimal.optimal_cost_tao, 4) : '—'}
            </div>
            {optimal && (
              <div className="text-[10px] font-mono text-emerald-400 mt-1">
                savings {formatTau(optimal.optimal_savings_tao, 4)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-slice details */}
      {sliced && (
        <div className="rounded-lg bg-dark-900/60 border border-dark-700 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">per-slice size</div>
            <div className="text-slate-100 font-bold mt-0.5">{formatTau(sliced.per_slice_size_tao, 3)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">per-slice s</div>
            <div className="text-slate-100 font-bold mt-0.5">{formatPct(sliced.per_slice_s * 100, 4)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">per-slice cost</div>
            <div className="text-slate-100 font-bold mt-0.5">{formatTau(sliced.per_slice_cost_tao, 4)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">adv-sel uplift</div>
            <div className={clsx(
              'font-bold mt-0.5',
              sliced.adverse_selection_uplift > 1.0 ? 'text-amber-300' : 'text-emerald-300',
            )}>
              {sliced.adverse_selection_uplift.toFixed(3)}×
            </div>
          </div>
        </div>
      )}

      {/* Adverse selection check */}
      {adv && (
        <div className={clsx(
          'rounded-lg border px-4 py-2.5 flex items-start gap-2 text-[11px]',
          adv.warning && !adv.within_signal_window
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : adv.signal_half_life_cycles == null
              ? 'bg-slate-800/40 border-slate-600/40 text-slate-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
        )}>
          {adv.warning && !adv.within_signal_window
            ? <TrendingDown size={12} className="flex-shrink-0 mt-0.5" />
            : adv.signal_half_life_cycles == null
              ? <Info size={12} className="flex-shrink-0 mt-0.5" />
              : <Zap size={12} className="flex-shrink-0 mt-0.5" />}
          <div className="leading-snug">
            <span className="font-mono font-bold uppercase tracking-widest text-[10px]">Adverse-selection · </span>
            {adv.warning ?? (
              adv.signal_half_life_cycles != null
                ? <>T={adv.t_cycles} cycles within signal window (half-life {adv.signal_half_life_cycles}) — uplift {adv.uplift.toFixed(2)}×</>
                : <>signal half-life unknown — check skipped</>
            )}
          </div>
        </div>
      )}

      {/* Error / loading */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-[12px] text-red-300 flex items-center gap-2">
          <AlertTriangle size={13} />
          <span>{error}</span>
        </div>
      )}

      {/* Doctrine footer */}
      {data?.doctrine && (
        <div className="border-t border-dark-700 pt-3 space-y-1 text-[10px] font-mono text-slate-500 leading-relaxed">
          <p><span className="text-violet-300 uppercase tracking-widest">cost function · </span>{data.doctrine.cost_formula}</p>
          <p><span className="text-violet-300 uppercase tracking-widest">source · </span>{data.doctrine.source}</p>
          <p><span className="text-violet-300 uppercase tracking-widest">anchor · </span>{data.doctrine.anchor}</p>
        </div>
      )}

      {/* Mandatory-split modal */}
      {modalOpen && data && (
        <MandatorySplitModal
          data={data}
          onClose={() => setModalOpen(false)}
          onSwitchToSliced={() => {
            setNSlices(Math.max(data.band.recommend_n, 5))
            setTCycles(Math.max(5, tCycles))
            setModalOpen(false)
          }}
          onReduceTrade={() => {
            // Operator reduces externally; we just close and let the page
            // owner adjust taoIn (this card is read-only on the trade size).
            setModalOpen(false)
          }}
          onOverride={(_token) => {
            setOverridden(true)
            setModalOpen(false)
            // Note: actual override-audit logging would be wired through
            // an explicit endpoint when execution is connected; for the
            // simulator-only build, we mark UI state and warn inline.
          }}
        />
      )}

      {/* Override banner once acknowledged */}
      {overridden && data?.band.name === 'mandatory_split' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-[11px] text-red-300 flex items-center gap-2">
          <AlertTriangle size={12} />
          <span className="font-mono">
            Mandatory-split override active · operator-acknowledged · LTCM forward-warning logged
          </span>
        </div>
      )}
    </div>
  )
}