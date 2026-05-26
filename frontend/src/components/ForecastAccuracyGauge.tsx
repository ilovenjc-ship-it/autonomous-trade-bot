/**
 * ForecastAccuracyGauge — model-drift indicator for Fleet Consensus.
 *
 * Session XXXVII — Phase F.  Closes the loop on Phase C (vote
 * forecasting): every consensus round records (forecast, actual);
 * this panel surfaces the rolling Brier Skill Score as a friendly
 * 0-100% calibration gauge plus a sparkline of the last 20 rounds.
 *
 * Design notes:
 *  · Compact panel — fits under the existing ForecastPanel without
 *    crowding the page.
 *  · Three-band semantics (calibrated / drifting / uncalibrated /
 *    cold) drive both the gauge needle colour and the verdict pill.
 *  · Sparkline shows ABSOLUTE ERROR per round (lower is better).
 *    Filled bar plots use emerald (correct: actual==1 and forecast≥0.5,
 *    or actual==0 and forecast<0.5) and red (wrong direction) so the
 *    operator can see WHICH rounds the model misjudged at a glance.
 *  · Per-direction split (BUY / SELL) appears as two thin stat tiles
 *    underneath so direction-specific drift is visible.
 *  · Soft-fail throughout: if /api/consensus/forecast-accuracy is
 *    unreachable or returns samples=0, we render a friendly cold-start
 *    state rather than a broken UI.
 *  · 30s polling — matches the ForecastPanel cadence.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Gauge as GaugeIcon, RefreshCw, Activity, TrendingUp, AlertTriangle,
  CheckCircle2, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types (mirror backend response shape) ───────────────────────────────────
interface ByDirection {
  samples:         number
  brier_score:     number
  brier_baseline:  number
  brier_skill:     number
  mean_abs_error:  number
  calibration_pct: number
  band:            'calibrated' | 'drifting' | 'uncalibrated' | 'cold'
  approved_rate:   number
}
interface AccuracySummary {
  samples:         number
  lifetime_total:  number
  window:          number
  brier_score:     number | null
  brier_baseline:  number | null
  brier_skill:     number | null
  mean_abs_error:  number | null
  calibration_pct: number | null
  band:            'calibrated' | 'drifting' | 'uncalibrated' | 'cold'
  by_direction:    Record<string, ByDirection>
  approved_rate:   number | null
  as_of:           string
}
interface RecentEntry {
  round_id:  number
  timestamp: string
  direction: string
  forecast:  number
  actual:    0 | 1
  abs_error: number
  sq_error:  number
}
interface AccuracyResp {
  summary: AccuracySummary
  recent:  RecentEntry[]
}

// ── Band metadata ───────────────────────────────────────────────────────────
const BAND_META: Record<string, { label: string; chip: string; needle: string; icon: typeof CheckCircle2 }> = {
  calibrated:   { label: 'CALIBRATED',   chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',  needle: 'bg-emerald-400', icon: CheckCircle2 },
  drifting:     { label: 'DRIFTING',     chip: 'bg-amber-500/15   text-amber-300   border-amber-400/40',    needle: 'bg-amber-400',   icon: TrendingUp    },
  uncalibrated: { label: 'UNCALIBRATED', chip: 'bg-red-500/15     text-red-300     border-red-400/40',      needle: 'bg-red-400',     icon: AlertTriangle },
  cold:         { label: 'COLD START',   chip: 'bg-slate-700/40   text-slate-400   border-slate-600/50',    needle: 'bg-slate-500',   icon: HelpCircle    },
}

// ── Component ───────────────────────────────────────────────────────────────
export default function ForecastAccuracyGauge() {
  const [data,    setData]    = useState<AccuracyResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api
        .get<AccuracyResp>('/consensus/forecast-accuracy?window=50&recent_limit=20')
        .then((r) => r.data)
      setData(res)
      setError(null)
    } catch (_e) {
      setError('Unable to reach forecast accuracy endpoint')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  // ── Loading / error states ──────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-950/40 p-4">
        <div className="text-[12px] font-mono text-slate-500">Loading forecast accuracy…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2 text-[12px] font-mono text-slate-500">
          <AlertTriangle size={13} className="text-amber-400" />
          {error ?? 'No data'}
        </div>
      </div>
    )
  }

  const summary  = data.summary
  const recent   = data.recent
  const bandMeta = BAND_META[summary.band] ?? BAND_META.cold
  const Icon     = bandMeta.icon
  const isCold   = summary.band === 'cold' || summary.samples === 0

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-950/40 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyan-500/10">
        <GaugeIcon size={14} className="text-cyan-400" />
        <span className="text-[12px] font-mono uppercase tracking-widest text-cyan-300">Forecast Accuracy</span>
        <span className="text-[11px] font-mono text-slate-500">· model-drift indicator</span>
        <span className="ml-auto text-[10px] font-mono text-slate-600">
          rolling window {summary.window} · {summary.samples} samples
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-cyan-300 transition-colors"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={11} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Big calibration gauge ── */}
        <div className="md:col-span-1 flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900/40 border border-slate-700/40">
          {isCold ? (
            <>
              <HelpCircle size={28} className="text-slate-500 mb-2" />
              <p className="text-[11px] font-mono text-slate-500 text-center leading-relaxed">
                Awaiting consensus rounds.<br />
                Gauge populates after the first round.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className={clsx('text-4xl font-bold font-mono tabular-nums',
                  summary.band === 'calibrated'   && 'text-emerald-300',
                  summary.band === 'drifting'     && 'text-amber-300',
                  summary.band === 'uncalibrated' && 'text-red-300',
                )}>
                  {(summary.calibration_pct ?? 0).toFixed(0)}
                </span>
                <span className="text-lg font-mono text-slate-500">%</span>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">calibration</p>

              {/* Horizontal band track */}
              <div className="relative w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
                {/* Three coloured zones */}
                <div className="absolute inset-y-0 left-0   w-[33%] bg-red-500/25" />
                <div className="absolute inset-y-0 left-[33%] w-[34%] bg-amber-500/25" />
                <div className="absolute inset-y-0 left-[67%] w-[33%] bg-emerald-500/25" />
                {/* Needle */}
                <div
                  className={clsx('absolute top-0 bottom-0 w-0.5 transition-all duration-500', bandMeta.needle)}
                  style={{ left: `${Math.max(0, Math.min(100, summary.calibration_pct ?? 0))}%` }}
                />
              </div>

              {/* Verdict pill */}
              <span className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border',
                bandMeta.chip,
              )}>
                <Icon size={11} />
                {bandMeta.label}
              </span>
            </>
          )}
        </div>

        {/* ── Stats tiles + sparkline ── */}
        <div className="md:col-span-2 flex flex-col gap-3">

          {/* 4 mini-tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile
              label="Brier Skill"
              value={summary.brier_skill != null ? summary.brier_skill.toFixed(2) : '—'}
              hint={summary.brier_skill != null
                ? (summary.brier_skill > 0
                    ? 'sharper than baseline'
                    : summary.brier_skill < 0 ? 'worse than baseline' : 'matches baseline')
                : 'no samples yet'}
            />
            <StatTile
              label="Mean Error"
              value={summary.mean_abs_error != null ? summary.mean_abs_error.toFixed(3) : '—'}
              hint="avg |forecast - actual|"
            />
            <StatTile
              label="Approval Rate"
              value={summary.approved_rate != null ? `${(summary.approved_rate * 100).toFixed(0)}%` : '—'}
              hint="actual approval rate"
            />
            <StatTile
              label="Lifetime"
              value={`${summary.lifetime_total}`}
              hint="total recorded"
            />
          </div>

          {/* Per-direction breakdown — only when both directions have samples */}
          {Object.keys(summary.by_direction).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {(['BUY', 'SELL'] as const).map((dir) => {
                const d = summary.by_direction[dir]
                if (!d) return (
                  <div key={dir} className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 uppercase tracking-wider">
                      <span>{dir}</span>
                      <span>—</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">no samples</div>
                  </div>
                )
                const dMeta = BAND_META[d.band] ?? BAND_META.cold
                return (
                  <div key={dir} className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                      <span>{dir}</span>
                      <span className="text-slate-600">{d.samples}n</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={clsx('text-lg font-mono font-bold',
                        d.band === 'calibrated'   && 'text-emerald-300',
                        d.band === 'drifting'     && 'text-amber-300',
                        d.band === 'uncalibrated' && 'text-red-300',
                      )}>
                        {d.calibration_pct.toFixed(0)}%
                      </span>
                      <span className={clsx('ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border', dMeta.chip)}>
                        {dMeta.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sparkline of recent rounds — abs_error per round, coloured by correctness */}
          <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <Activity size={10} className="inline mr-1 text-cyan-400" />
                last {recent.length} rounds — error per round
              </span>
              <span className="text-[10px] font-mono text-slate-600">lower bar = better</span>
            </div>
            {recent.length === 0 ? (
              <div className="text-[11px] font-mono text-slate-500 text-center py-4">
                No rounds recorded yet.
              </div>
            ) : (
              <div className="flex items-end gap-0.5 h-12">
                {/* Reverse so oldest is left, newest is right (chronological reading order) */}
                {[...recent].reverse().map((r) => {
                  const correct = (r.forecast >= 0.5) === (r.actual === 1)
                  return (
                    <div
                      key={`${r.round_id}-${r.timestamp}`}
                      className="flex-1 min-w-[3px] flex flex-col justify-end group relative"
                      title={`#${r.round_id} ${r.direction} · forecast ${(r.forecast * 100).toFixed(0)}% · actual ${r.actual ? 'APPROVED' : 'REJECTED'}`}
                    >
                      <div
                        className={clsx(
                          'rounded-sm transition-all',
                          correct ? 'bg-emerald-500/60 group-hover:bg-emerald-400'
                                  : 'bg-red-500/70    group-hover:bg-red-400',
                        )}
                        style={{ height: `${Math.max(2, r.abs_error * 100)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Helper sub-component ────────────────────────────────────────────────────
function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 px-2 py-1.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-mono font-bold text-slate-200 tabular-nums">{value}</div>
      <div className="text-[10px] font-mono text-slate-600 truncate">{hint}</div>
    </div>
  )
}