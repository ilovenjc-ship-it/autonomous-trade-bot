/**
 * FundamentalLawCard.tsx — F-30 (D-30) Grinold/Kahn IC × √Breadth decomposition
 * ============================================================================
 *
 * Per-strategy edge decomposition: skill (IC) × opportunity (Breadth).
 *
 *   IR ≈ IC × √Breadth     (Grinold & Kahn, Active Portfolio Management Ch 6)
 *
 * For Project Ari's HODL-benchmark β=1 construction, IR collapses to Sharpe.
 * The 5 cells surface:
 *   - Sharpe (= IR)           observed
 *   - IC                       calibrated band (excellent / good / marginal / noise)
 *   - Breadth                  raw n + n_independent (direction-cluster) tooltip
 *   - Implied IR               IC × √Breadth (theoretical)
 *   - Drift = Sharpe − Implied banded forward-warning
 *
 * Render-gated client-side on `feature_grinold_fundamental_law`.  When OFF
 * the card does not mount.  When ON it fetches once on mount and on
 * strategy change.
 *
 * Open/closed state persists per-strategy in localStorage.
 *
 * Citations: Grinold & Kahn p146-150 · López de Prado Ch 3 (probFailure).
 */
import { useEffect, useState, useCallback } from 'react'
import {
  ChevronDown, Info, Activity, AlertTriangle, BarChart2,
  Target, GitBranch, TrendingUp, Beaker,
} from 'lucide-react'
import clsx from 'clsx'
import { InfoBubble } from '@/components/Tooltip'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────

export interface GrinoldPayload {
  strategy_id: string
  display_name?: string
  mode?: string
  window_days: number
  trade_count: number
  sharpe_observed: number | null
  ic: number | null
  ic_band: 'excellent' | 'good' | 'marginal' | 'noise' | null
  breadth: number
  breadth_method: string
  n_independent_estimate: number
  implied_ir: number | null
  drift: number | null
  drift_band: 'green' | 'amber' | 'red' | null
  forecast_method: string
  warnings: string[]
  computed_at?: string
}

// ── band styling ───────────────────────────────────────────────────────────

const IC_TONE: Record<string, { color: string; bg: string; label: string; caption: string }> = {
  excellent: { color: '#06b6d4', bg: 'bg-cyan-500/15',    label: 'EXCELLENT', caption: 'Exceptional skill — verify sample size before celebrating' },
  good:      { color: '#10b981', bg: 'bg-emerald-500/15', label: 'GOOD',      caption: 'Calibrated skill range — typical for surviving quant strategies' },
  marginal:  { color: '#f59e0b', bg: 'bg-amber-500/15',   label: 'MARGINAL',  caption: 'Below conventional threshold — edge weak or sample noisy' },
  noise:     { color: '#ef4444', bg: 'bg-red-500/15',     label: 'NOISE',     caption: 'Statistically indistinguishable from zero' },
}

const DRIFT_TONE: Record<string, { color: string; bg: string; label: string; caption: string }> = {
  green: { color: '#10b981', bg: 'bg-emerald-500/15', label: 'ON-TARGET', caption: 'Strategy is meeting or exceeding its theoretical edge' },
  amber: { color: '#f59e0b', bg: 'bg-amber-500/15',   label: 'DRAG',      caption: 'Some implementation drag — fill quality or cost worth checking' },
  red:   { color: '#ef4444', bg: 'bg-red-500/15',     label: 'MATERIAL',  caption: 'Material drag — IC decay, breadth miscount, or execution cost dominating' },
}

// ── helpers ─────────────────────────────────────────────────────────────────

function formatNum(n: number | null, digits = 3): string {
  if (n === null || n === undefined) return '—'
  if (Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

// ── individual cell ─────────────────────────────────────────────────────────

interface CellProps {
  label: string
  value: string
  sub: string
  toneColor?: string
  toneBg?: string
  toneLabel?: string
  tooltip: React.ReactNode
}

function MetricCell({ label, value, sub, toneColor, toneBg, toneLabel, tooltip }: CellProps) {
  return (
    <div className={clsx(
      'rounded-xl border px-3 py-3 transition-colors',
      toneBg ? `${toneBg} border-current` : 'bg-dark-800/60 border-dark-700',
    )}
      style={toneColor ? { borderColor: `${toneColor}50` } : undefined}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500 font-bold">
          {label}
        </span>
        <InfoBubble content={tooltip} side="top" maxWidth={360} />
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="text-xl font-black font-mono"
          style={toneColor ? { color: toneColor } : { color: '#e2e8f0' }}
        >
          {value}
        </span>
        {toneLabel && (
          <span
            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
            style={{ color: toneColor, background: `${toneColor}20` }}
          >
            {toneLabel}
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-500 mt-1 leading-snug">{sub}</p>
    </div>
  )
}

// ── component ───────────────────────────────────────────────────────────────

export interface FundamentalLawCardProps {
  /** Feature flag — render-gated; component returns null when false. */
  enabled: boolean
  /** Strategy name (matches DB Strategy.name). */
  strategyName: string
  /** Window in days; default 30. */
  windowDays?: number
}

export default function FundamentalLawCard({
  enabled, strategyName, windowDays = 30,
}: FundamentalLawCardProps) {
  // localStorage key per strategy — open state persists.
  const STORAGE_KEY = `ari.grinold.open.${strategyName}`
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const handleToggle = () => {
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const [data, setData] = useState<GrinoldPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const fetchData = useCallback(async () => {
    if (!enabled || !strategyName) return
    setLoading(true)
    try {
      const res = await api.get<GrinoldPayload>(
        `/analytics/strategies/${strategyName}/grinold`,
        { params: { window_days: windowDays } },
      )
      setData(res.data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setLoading(false)
    }
  }, [enabled, strategyName, windowDays])

  useEffect(() => { fetchData() }, [fetchData])

  if (!enabled) return null

  // ── summary line (always visible) ────────────────────────────────────────
  const summaryLine = (() => {
    if (!data) return loading ? 'computing…' : (error ?? 'no data')
    const sharpeStr = formatNum(data.sharpe_observed, 2)
    const icStr = formatNum(data.ic, 3)
    const breadthStr = data.breadth.toString()
    const impStr = formatNum(data.implied_ir, 2)
    const driftStr = formatNum(data.drift, 2)
    return `Sharpe ${sharpeStr}  ·  IC ${icStr}  ·  Breadth ${breadthStr}  ·  Implied ${impStr}  ·  Drift ${driftStr}`
  })()

  const icTone = data?.ic_band ? IC_TONE[data.ic_band] : null
  const driftTone = data?.drift_band ? DRIFT_TONE[data.drift_band] : null

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-dark-700/30 transition-colors text-left"
      >
        <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 flex-shrink-0">
          <GitBranch size={14} className="text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white tracking-wide">
              Fundamental Law decomposition
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
              F-30
            </span>
            <InfoBubble
              content={
                <>
                  <p className="text-white font-bold mb-1">Grinold/Kahn Fundamental Law</p>
                  <p className="font-mono text-amber-200 mb-1.5">IR ≈ IC × √Breadth</p>
                  <p>Decomposes per-strategy edge into <span className="text-emerald-300">skill (IC)</span> × <span className="text-emerald-300">opportunity (Breadth)</span>. For this fleet's HODL-benchmark β=1 construction, IR collapses to Sharpe.</p>
                  <p className="mt-1.5 text-slate-400 text-[11px]">Source: Grinold &amp; Kahn <span className="italic">Active Portfolio Management</span> p146-150 · D-30 (D-40 grant)</p>
                </>
              }
              side="bottom"
              maxWidth={400}
            />
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
            {summaryLine}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={clsx(
            'text-slate-400 flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="border-t border-dark-700 px-5 py-4 space-y-4">
          {/* Loading / error states */}
          {loading && !data && (
            <div className="flex items-center gap-2 text-[12px] text-slate-400">
              <Activity size={13} className="animate-pulse" />
              <span>Computing IC × √Breadth decomposition…</span>
            </div>
          )}
          {error && !data && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-red-300">
              <AlertTriangle size={13} />
              <span>Failed to load: {error}</span>
              <button
                onClick={fetchData}
                className="ml-auto text-[11px] font-bold underline hover:text-red-200"
              >
                retry
              </button>
            </div>
          )}

          {/* Insufficient sample state */}
          {data && data.trade_count > 0 && data.trade_count < 30 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-amber-300">
              <AlertTriangle size={12} />
              <span>
                Insufficient sample (n={data.trade_count} &lt; 30) — Sharpe shown,
                IC and Implied IR pending.
              </span>
            </div>
          )}
          {data && data.trade_count === 0 && (
            <div className="bg-dark-700/40 border border-dark-600 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-slate-400">
              <Beaker size={12} />
              <span>No trades in last {data.window_days}d window — decomposition unavailable.</span>
            </div>
          )}

          {/* 5-cell metric row */}
          {data && data.trade_count > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <MetricCell
                label="Sharpe (= IR)"
                value={formatNum(data.sharpe_observed, 3)}
                sub="observed · per-trade"
                tooltip={
                  <>
                    <p className="text-white font-bold mb-1">Sharpe (per-trade)</p>
                    <p>Mean realized return / stdev realized return per trade. For Project Ari's HODL-benchmark β=1 construction, Sharpe equals IR — the same number, different name.</p>
                    <p className="mt-1 text-slate-400 text-[11px] font-mono">SHARPE_SPEC.md §3 · D-21 contract</p>
                  </>
                }
              />
              <MetricCell
                label="IC"
                value={formatNum(data.ic, 3)}
                sub={icTone ? icTone.caption : 'sample-bound'}
                toneColor={icTone?.color}
                toneBg={icTone?.bg}
                toneLabel={icTone?.label}
                tooltip={
                  <>
                    <p className="text-white font-bold mb-1">Information Coefficient</p>
                    <p>Per-bet correlation between forecast direction and realized HODL-relative return. v1 uses direction-only forecast (no signal magnitude in trades table).</p>
                    <ul className="mt-1.5 space-y-0.5 text-[11px]">
                      <li>· ≥ 0.15 <span className="text-cyan-300">excellent</span></li>
                      <li>· 0.05–0.15 <span className="text-emerald-300">good — typical surviving range</span></li>
                      <li>· 0.02–0.05 <span className="text-amber-300">marginal</span></li>
                      <li>· &lt; 0.02 <span className="text-red-300">noise</span></li>
                    </ul>
                    <p className="mt-1.5 text-slate-400 text-[11px] font-mono">Grinold &amp; Kahn p146-150</p>
                  </>
                }
              />
              <MetricCell
                label="Breadth"
                value={data.breadth.toString()}
                sub={`raw · ${data.n_independent_estimate} effective`}
                tooltip={
                  <>
                    <p className="text-white font-bold mb-1">Breadth</p>
                    <p>Number of forecasts in the window. Independence assumption: each trade's forecast is uncorrelated with the prior. We surface BOTH:</p>
                    <ul className="mt-1.5 space-y-0.5 text-[11px]">
                      <li>· <span className="text-slate-200 font-mono">raw</span>: trade count</li>
                      <li>· <span className="text-slate-200 font-mono">effective</span>: direction-cluster count (consecutive same-direction trades collapse to 1 bet)</li>
                    </ul>
                    <p className="mt-1.5 text-slate-400 text-[11px]">Implied IR uses the conservative effective count — direction-clustered breadth.</p>
                    <p className="mt-0.5 text-slate-400 text-[11px] font-mono">Grinold &amp; Kahn p146</p>
                  </>
                }
              />
              <MetricCell
                label="Implied IR"
                value={formatNum(data.implied_ir, 3)}
                sub="IC × √Breadth"
                tooltip={
                  <>
                    <p className="text-white font-bold mb-1">Implied IR (theoretical)</p>
                    <p>What the strategy <span className="italic">should</span> deliver if it has the skill measured (IC) and gets the opportunities counted (effective Breadth).</p>
                    <p className="mt-1 font-mono text-amber-200 text-[11px]">|IC| × √(n_independent)</p>
                    <p className="mt-1.5 text-slate-400 text-[11px] font-mono">Grinold &amp; Kahn — Fundamental Law of Active Management</p>
                  </>
                }
              />
              <MetricCell
                label="Drift"
                value={formatNum(data.drift, 3)}
                sub={driftTone ? driftTone.caption : 'sample-bound'}
                toneColor={driftTone?.color}
                toneBg={driftTone?.bg}
                toneLabel={driftTone?.label}
                tooltip={
                  <>
                    <p className="text-white font-bold mb-1">Drift = Sharpe − Implied IR</p>
                    <p>Negative drift means observed performance is below theoretical edge. Possible causes:</p>
                    <ul className="mt-1.5 space-y-0.5 text-[11px]">
                      <li>· IC measurement is overstated</li>
                      <li>· Breadth has correlation we missed</li>
                      <li>· Implementation cost (fill quality, slippage) is eating the edge</li>
                    </ul>
                    <p className="mt-1.5 text-slate-300 text-[11px]">
                      F-39B (Almgren-Chriss optimal slicing) targets the implementation-cost branch.
                    </p>
                  </>
                }
              />
            </div>
          )}

          {/* Warnings list */}
          {data && data.warnings.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-dark-700/60">
              {data.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400 leading-snug">
                  <Info size={10} className="text-amber-400/80 flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer / window + forecast method */}
          {data && (
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-slate-500 pt-2 border-t border-dark-700/60">
              <BarChart2 size={10} />
              <span>window: {data.window_days}d</span>
              <span className="text-slate-700">·</span>
              <Target size={10} />
              <span>forecast: {data.forecast_method.replace('_', ' ')}</span>
              <span className="text-slate-700">·</span>
              <TrendingUp size={10} />
              <span>{data.trade_count} trades · {data.n_independent_estimate} effective</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}