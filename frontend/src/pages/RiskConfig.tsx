import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, RefreshCw, ShieldAlert, Zap, BarChart2, TrendingDown, Layers, Gauge, Target, Lock, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import toast from 'react-hot-toast'
import { InfoBubble } from '@/components/Tooltip'
import CapStructureSection from '@/components/CapStructureSection'

// ── types ─────────────────────────────────────────────────────────────────────
interface Config {
  max_drawdown_pct: number
  stop_loss_pct: number
  take_profit_pct: number
  max_position_size_pct: number
  max_concurrent_positions: number
  daily_loss_circuit_breaker_pct: number
  min_confidence_score: number
  consensus_votes: number        // integer 1–12 — source of truth for Fleet Consensus
  consensus_threshold: number    // kept in sync as votes/12
  cycle_interval_seconds: number
  // Session XXXI: drawdown auto-demotion (parallel to WR demotion)
  strategy_demote_drawdown_tao: number  // negative — strategy auto-demotes when cum PnL < this
  strategy_demote_min_cycles: number    // min cycles before drawdown demotion can fire
  // Session XXXII: Const 6-Filter Test gate for external signal sources
  subnet_quality_min_filters: number    // min filters a SOURCE subnet must pass (0-6)
  // Day 14 Session XLIV: Sharpe Score target (operator-set, 0–100 on Scale §3.5)
  sharpe_target_score: number            // target Sharpe Score 0–100; default 75 = "good" (Sharpe +1)
  // Day 14 F-37B (D-37 Part B): phased Kelly cap-structure feature flag
  feature_phased_cap_structure?: boolean // default false; render-gates the per-strategy cap panel
}

interface RiskStatus {
  global_halt: boolean
  circuit_breaker: boolean
  drawdown_pct: number
  daily_loss_pct: number
  open_positions: number
  max_positions: number
  phase: string
}

// Calibrated 2026-05-04 — UNPROVEN PHASE profile.
// Tight defaults until strategies prove themselves through the promotion gate.
// Graduation path (2-3 strategies gate-proven): size 5→10%, positions 3→4,
// drawdown 8→12%, daily CB 5→8%, confidence 0.65→0.60.
// See backend/routers/fleet.py _RISK_CONFIG_DEFAULTS for full rationale.
const DEFAULTS: Config = {
  max_drawdown_pct:               8,   // was 20 — unproven phase: halt fast, investigate
  stop_loss_pct:                  8,   // unchanged — calibrated for alpha volatility
  take_profit_pct:               12,   // unchanged — stick and move, book at 12%
  max_position_size_pct:          5,   // was 20 — prove it cheaply, earn the right to size up
  max_concurrent_positions:       3,   // was 4 — 3×5%=15% deployed, 85% liquid
  daily_loss_circuit_breaker_pct: 5,   // was 15 — calibrated for 5% positions
  min_confidence_score:          0.55, // XXXIV: now ENFORCED — 0.55 cuts ~40% fee-drag trades
  consensus_votes:                 7,  // 7/12 supermajority — Fleet Consensus rule, do not lower
  consensus_threshold:           7 / 12,
  cycle_interval_seconds:        300,  // unchanged — 5-min cycles
  strategy_demote_drawdown_tao:    -0.15, // Session XXXI: WR-independent cumulative PnL floor
  strategy_demote_min_cycles:        10,  // Session XXXI: noise gate before drawdown demote
  subnet_quality_min_filters:         6,  // Session XXXII: Const 6-Filter Test gate — default 6/6
  sharpe_target_score:               75,  // Day 14 Session XLIV: target Sharpe Score (75 = "good", Sharpe +1)
  feature_phased_cap_structure:    false, // Day 14 F-37B: phased Kelly cap-structure render flag
}

// ── risk colour helpers ────────────────────────────────────────────────────────
/**
 * riskDir: 'up'  → higher value = more dangerous (most params)
 *          'down'→ lower value  = more dangerous (stop-loss, confidence, consensus, cycle)
 */
function riskPct(value: number, min: number, max: number, riskDir: 'up' | 'down'): number {
  const raw = (value - min) / (max - min)
  return riskDir === 'up' ? raw : 1 - raw
}

function riskFill(pct: number): string {
  if (pct < 0.4) return '#10b981'   // emerald
  if (pct < 0.72) return '#f59e0b'  // amber
  return '#ef4444'                   // red
}

function riskTextClass(pct: number): string {
  if (pct < 0.4) return 'text-emerald-400'
  if (pct < 0.72) return 'text-amber-400'
  return 'text-red-400'
}

function riskGlow(pct: number): string {
  if (pct < 0.4) return '0 0 8px #10b981'
  if (pct < 0.72) return '0 0 8px #f59e0b'
  return '0 0 10px #ef4444'
}

// ── slider component ──────────────────────────────────────────────────────────
interface SliderProps {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  riskDir: 'up' | 'down'
  format?: (v: number) => string
  onChange: (v: number) => void
  rangeLabel?: string
}

function RiskSlider({ label, description, value, min, max, step, riskDir, format, onChange, rangeLabel }: SliderProps) {
  const fmt = format ?? ((v: number) => v.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0))
  const fillPct  = ((value - min) / (max - min)) * 100
  const rp       = riskPct(value, min, max, riskDir)
  const color    = riskFill(rp)
  const textCls  = riskTextClass(rp)
  const glow     = riskGlow(rp)
  const isDanger = rp >= 0.72

  return (
    <div className="space-y-2 group">
      {/* Label row */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-sm font-bold text-white tracking-wide truncate">{label}</span>
          <span
            className={clsx(
              'text-xl font-black font-mono transition-colors duration-300',
              textCls,
              isDanger && 'animate-pulse',
            )}
          >
            {fmt(value)}
          </span>
        </div>
        <span className="text-[13px] text-slate-500 font-mono flex-shrink-0">
          {rangeLabel ?? `${min} — ${max}`}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 leading-snug">{description}</p>

      {/* Track */}
      <div className="relative pt-1 pb-2">
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-300
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-dark-900
            [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-300"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${fillPct}%, #1e293b ${fillPct}%, #1e293b 100%)`,
            // thumb colour + glow via CSS variable trick — applied as inline style on thumb via filter
          }}
          // apply glow to the thumb via a wrapper trick: just set box-shadow on a wrapping div
        />
        {/* Colour-matched glow line under track */}
        <div
          className="absolute bottom-0 left-0 h-[1px] rounded-full transition-all duration-500 opacity-40"
          style={{ width: `${fillPct}%`, background: color, boxShadow: glow }}
        />
      </div>

      {/* Risk zone label */}
      <div className="flex justify-between text-[15px] font-mono text-slate-600">
        <span className="text-emerald-600">SAFE</span>
        <span className="text-amber-700">MODERATE</span>
        <span className="text-red-700">DANGER</span>
      </div>
    </div>
  )
}

// ── status card ───────────────────────────────────────────────────────────────
function StatusCard({
  icon: Icon, label, value, sub, danger, warn, info,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; danger?: boolean; warn?: boolean
  // Day 12 (Session XLII): optional "(i)" tooltip per Mark's spec —
  // every Risk Config KPI card now carries an explainer bubble.
  info?: React.ReactNode
}) {
  return (
    <div className={clsx(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300',
      danger ? 'bg-red-500/10 border-red-500/30'
             : warn ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-dark-800 border-dark-700',
    )}>
      <div className={clsx('p-2 rounded-lg flex-shrink-0',
        danger ? 'bg-red-500/20' : warn ? 'bg-amber-500/20' : 'bg-slate-700/60')}>
        <Icon size={14} className={danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-slate-300'} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] text-slate-500 uppercase tracking-widest font-mono">{label}</p>
          {info && <InfoBubble content={info} side="right" maxWidth={320} />}
        </div>
        <p className={clsx('text-sm font-bold font-mono',
          danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-emerald-400')}>
          {value}
        </p>
        {sub && <p className="text-[13px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Daily Cap Status Card ─────────────────────────────────────────────────────
// Session XXXIX (Day 6) — relocated from Wallet/Transactions per Mav: "now
// since I know what it's for, I know where it goes."  Slot at the END of the
// Risk-Configuration KPI row (after Open Positions) so the row reads:
//   Global HALT · Circuit Breaker · Drawdown · Daily Loss · Open Positions · Daily Cap
// Uses the same outer StatusCard chrome (icon + label + value + sub) for
// visual parity, plus a thin progress bar and an InfoBubble — the operator
// tooltip Mav specifically called out as the reason this card now has a
// natural home on the Risk page.
interface DailyCap {
  staked_today_tao: number; cap_tao: number; liquid_tao: number
  pct_used: number; remaining_tao: number; reset_date: string | null; fraction: number
}

function DailyCapStatusCard() {
  const [cap, setCap] = useState<DailyCap | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/fleet/daily-cap')
        if (!cancelled && r.ok) setCap(await r.json())
      } catch { /* soft-fail */ }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const pct    = cap?.pct_used ?? 0
  const danger = pct >= 90
  const warn   = pct >= 60 && pct < 90
  const tone =
    danger ? 'text-red-400'    :
    warn   ? 'text-amber-400'  :
             'text-emerald-400'
  const bar =
    danger ? 'bg-red-500'    :
    warn   ? 'bg-amber-400'  :
             'bg-emerald-500'

  const tip = (
    <div className="space-y-2">
      <p className="text-white font-bold">Daily Deployment Cap</p>
      <p>The maximum TAO the autonomous fleet is allowed to deploy (stake) in a single UTC day. A safety guardrail — the fleet cannot exceed it even if every strategy votes BUY.</p>
      <p>Computed as <span className="text-amber-300 font-mono">liquid_balance × {((cap?.fraction ?? 0) * 100).toFixed(0)}%</span> with a floor of 0.02 τ. Resets at UTC midnight.</p>
      {cap && (
        <p className="text-[11px] text-slate-400 border-t border-slate-700/50 pt-1 font-mono">
          {cap.staked_today_tao.toFixed(4)} τ staked / {cap.cap_tao.toFixed(4)} τ cap · {cap.remaining_tao.toFixed(4)} τ left today
        </p>
      )}
    </div>
  )

  return (
    <div className={clsx(
      'relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300',
      danger ? 'bg-red-500/10 border-red-500/30'
             : warn ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-dark-800 border-dark-700',
    )}>
      <div className={clsx('p-2 rounded-lg flex-shrink-0',
        danger ? 'bg-red-500/20' : warn ? 'bg-amber-500/20' : 'bg-slate-700/60')}>
        <Gauge size={14} className={danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-amber-300'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] text-slate-500 uppercase tracking-widest font-mono">Daily Cap</p>
          <InfoBubble content={tip} side="left" maxWidth={320} />
        </div>
        <p className={clsx('text-sm font-bold font-mono', tone)}>
          {cap ? `${pct.toFixed(0)}%` : '—'}
        </p>
        <div className="h-1 mt-1 bg-dark-700 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', bar)}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className="text-[13px] text-slate-500 mt-0.5">
          {cap ? `${cap.remaining_tao.toFixed(4)} τ left today` : 'fetching…'}
        </p>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Sharpe Score — Risk-Adjusted Return Contract ─────────────────────────────
//
// Day 14 Session XLIV (Mark directive 2026-05-26):
//   "Add a Sharpe Score / Ratio Scale (composed of the 5 questions) to the
//    Risk Configuration Page... documents what risk-adjusted return means
//    to this fleet."
//
// Three-part panel:
//   (A) Sharpe Contract  — the 5 questions Mark answered Day 13 to lock
//                          SHARPE_SPEC.md, rendered read-only with a small
//                          "🔒" badge per row to signal "settled, do not
//                          drift."  Plus a bonus row for the Score-vs-Ratio
//                          surface decision.
//   (B) Scale Legend      — the −2 / −1 / 0 / +1 / +2  →  0 / 25 / 50 / 75 / 100
//                          mapping from §3.5, color-coded so the Target
//                          Score slider thumb reads against the same palette.
//   (C) Target Score slider — operator picks a target on 0–100; persisted to
//                          risk config; future Sharpe display will render
//                          this as a target line.  Inline "implied target"
//                          hint computed from the existing guardrail values
//                          (DD / position size / min confidence).
//
// Why on Risk Config:  Sharpe is the risk-adjusted-return contract.  This
// panel sits at the head of the page so the operator reads the contract
// first, picks the target, then tunes the guardrail knobs to match.
//
// Why locked Q&A (read-only):  per Mark Day 13, these five answers ARE the
// spec.  Rewriting them mid-flight would silently re-define the metric
// behind the operator's back — the same shape of mistake the spec's
// warmup-gate exists to prevent.  Future change requires a new
// SHARPE_SPEC version + an explicit Mark green-light, not a slider drag.
// ─────────────────────────────────────────────────────────────────────────────

interface SharpeQA {
  num: string
  dim: string
  question: string
  answer: string
  rationale: string
}

const SHARPE_CONTRACT: SharpeQA[] = [
  {
    num: '1',
    dim: 'Numeraire',
    question: 'TAO-denominated returns, USD-denominated, or both?',
    answer: 'Both — displayed side-by-side, never blended.',
    rationale: 'TAO is native; USD is operator-legible. Blending them would smuggle TAO/USD volatility into the Sharpe σ and conflate two different questions. Keep them separate so the operator sees both lenses honestly.',
  },
  {
    num: '2',
    dim: 'Risk-free Floor (Rf)',
    question: 'What\'s the floor we\'re beating?',
    answer: 'HODL-input baseline — did the trade flow beat just sitting on the τ?',
    rationale: 'Mirrors Pool Simulator §HODL Opportunity Cost (Day 12 R9). Rf = "what would `position_τ` have done if simply held over the same window?" Operator-meaningful, no external yield assumption smuggled in.',
  },
  {
    num: '3',
    dim: 'Time Unit',
    question: 'Per-trade, daily, weekly, annualized?',
    answer: 'Per-trade primary · daily secondary · annualize headline only with √N footnoted.',
    rationale: 'N is fat (~4,400 paper trades) — per-trade preserves trade-count semantics. Daily is the time-dimension-aware sibling for series UI. Annualization factor and trade-count basis footnoted on every public mention; never bare.',
  },
  {
    num: '4',
    dim: 'Cohorts & Track',
    question: 'Where do we compute it?',
    answer: '12 per-strategy + 1 fleet aggregate · paper and live tracked separately, never blended.',
    rationale: 'Per-strategy feeds bench-or-keep; fleet is the headline. Paper and live have different cost basis (slippage real on live, modeled on paper), so live Sharpe will run lower than paper Sharpe by construction — that asymmetry is the point.',
  },
  {
    num: '5',
    dim: 'Display vs Gate',
    question: 'Read-only display, or also a gate?',
    answer: 'Display first · soft gate after live volume · hard gate needs explicit green-light.',
    rationale: 'Hard-gating Sharpe on small samples is the same shape of mistake as the Day 12 R9 _hodl_block warming-up bug — confident-looking decision on insufficient data. INV-5 territory. v2 soft yellow-flag only after N_LIVE_MIN; v3 auto-bench requires Mark sign-off.',
  },
]

// Day 14 evening: relabeled from "BONUS ★" to "Q6" per Mark's UI flow follow-up
// — the surface decision (Score vs Ratio) is a peer of the other five, not a footnote.
const SHARPE_Q6: SharpeQA = {
  num: '6',
  dim: 'Surface',
  question: '"Sharpe Score" vs "Sharpe Ratio" — which do we expose?',
  answer: 'Both — raw ratio (truth) plus 0–100 normalized Score (UX legibility).',
  rationale: '"The raw ratio is the truth, the score is the UX affordance." Score = clip(50 + 25 × Sharpe, 0, 100). −2→0, −1→25, 0→50, +1→75, +2→100.',
}

// All six locked answers in display order — Q1–Q5 + Q6 (the surface decision).
const SHARPE_CONTRACT_FULL: SharpeQA[] = [...SHARPE_CONTRACT, SHARPE_Q6]

// Score → Sharpe band lookup (mirrors §3.5 of SHARPE_SPEC.md).
function sharpeBand(score: number): {
  label: string; sharpe: string; color: string; bgClass: string; ringClass: string
} {
  if (score < 13)  return { label: 'BROKEN',    sharpe: '≤ −2', color: '#ef4444', bgClass: 'bg-red-500/15',     ringClass: 'ring-red-500/40' }
  if (score < 38)  return { label: 'BAD',       sharpe: '−1',   color: '#f97316', bgClass: 'bg-orange-500/15',  ringClass: 'ring-orange-500/40' }
  if (score < 63)  return { label: 'NEUTRAL',   sharpe: '0',    color: '#94a3b8', bgClass: 'bg-slate-500/15',   ringClass: 'ring-slate-500/40' }
  if (score < 88)  return { label: 'GOOD',      sharpe: '+1',   color: '#10b981', bgClass: 'bg-emerald-500/15', ringClass: 'ring-emerald-500/40' }
  return             { label: 'EXCELLENT', sharpe: '+2',   color: '#06b6d4', bgClass: 'bg-cyan-500/15',    ringClass: 'ring-cyan-500/40' }
}

// Implied-target heuristic — soft advisory only.
//
// The intuition: tighter guardrails (smaller drawdown ceiling, smaller
// position size, higher confidence floor) mean the operator is asking
// the fleet to perform better-per-unit-risk, which is what a higher
// Sharpe target encodes.  Conversely, looser guardrails mean the
// operator is willing to accept more variance per τ deployed — a lower
// Sharpe ceiling is congruent.  This is a hint, not a constraint:
// future Sharpe v2 may calibrate the formula against live data.
function impliedTarget(maxDrawdown: number, maxPosition: number, minConfidence: number): number {
  // Each component contributes 0–100; lower-risk params push higher.
  const ddScore   = Math.max(30, Math.min(100, 100 - (maxDrawdown - 5)  * 2.5))   // 5%→100, 33%→30
  const posScore  = Math.max(30, Math.min(100, 100 - (maxPosition - 1)  * 2.5))   // 1%→100, 29%→30
  const confScore = Math.max(30, Math.min(100, minConfidence * 100))               // 0.30→30, 1.00→100
  return Math.round((ddScore + posScore + confScore) / 3)
}

function SharpeContractPanel({
  targetScore,
  onTargetChange,
  maxDrawdown,
  maxPosition,
  minConfidence,
}: {
  targetScore: number
  onTargetChange: (v: number) => void
  maxDrawdown: number
  maxPosition: number
  minConfidence: number
}) {
  const band    = sharpeBand(targetScore)
  const implied = impliedTarget(maxDrawdown, maxPosition, minConfidence)
  const impBand = sharpeBand(implied)
  const drift   = targetScore - implied
  const driftLabel =
    Math.abs(drift) <= 5 ? 'aligned'
    : drift > 0          ? `${drift} pts above implied`
    :                      `${Math.abs(drift)} pts below implied`
  const driftTone =
    Math.abs(drift) <= 5 ? 'text-emerald-400'
    : Math.abs(drift) <= 15 ? 'text-amber-400'
    :                         'text-red-400'

  // Day 14 evening UI flow follow-up: contract drawer collapsed by default
  // (saves vertical real estate; the locked answers are reference, not control)
  const [contractOpen, setContractOpen] = useState(false)

  return (
    <div className="bg-gradient-to-br from-violet-500/[0.04] via-dark-800/80 to-cyan-500/[0.04] border border-violet-500/20 rounded-2xl p-8 space-y-7">
      {/* ── Header — renamed "Sharpe Score / Ratio"; description tucked into (i) ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Target size={20} className="text-violet-300" />
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="text-lg font-black text-white tracking-wider uppercase">
            Sharpe Score / Ratio
          </h2>
          <InfoBubble
            content={
              <>
                <p className="text-white font-bold mb-1">Risk-Adjusted Return Contract</p>
                <p>What "risk-adjusted return" means for this fleet — six dimensions locked Day&nbsp;13. The operator-set target informs the (forthcoming) Sharpe display and feeds the guardrail-recommendation heuristic below.</p>
                <p className="mt-1 text-slate-400">Score = clip(50 + 25 × Sharpe, 0, 100). The raw ratio is the truth; the 0–100 score is the UX affordance.</p>
              </>
            }
            side="right"
            maxWidth={380}
          />
        </div>
      </div>

      {/* ── (1) Operator Target slider — moved to the TOP per Day 14 evening flow ── */}
      <div>
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-sm font-bold text-white tracking-wide">Sharpe Target Score</span>
            <span
              className="text-2xl font-black font-mono transition-colors duration-300"
              style={{ color: band.color, textShadow: `0 0 12px ${band.color}80` }}
            >
              {targetScore}
            </span>
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded-full border"
              style={{ color: band.color, borderColor: `${band.color}60`, background: `${band.color}15` }}
            >
              {band.label} · Sharpe {band.sharpe}
            </span>
          </div>
          <span className="text-[13px] text-slate-500 font-mono flex-shrink-0">
            0 (broken) — 100 (excellent)
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-snug mb-3">
          Where on the scale we want the fleet to land. Surfaces as a target line on the
          (forthcoming) Sharpe ratio display, and feeds the recommended-preset hint below.
          Default <span className="text-emerald-400 font-mono">75</span> = "good" — demand the
          fleet measurably beat the HODL baseline by ~1σ per trade.
        </p>

        {/* Slider — color-shifts to band as it moves */}
        <div className="relative pt-1 pb-2">
          <input
            type="range"
            min={0} max={100} step={5} value={targetScore}
            onChange={e => onTargetChange(parseInt(e.target.value, 10))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-300
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-dark-900"
            style={{
              background: `linear-gradient(to right,
                #ef4444 0%, #ef4444 13%,
                #f97316 13%, #f97316 38%,
                #94a3b8 38%, #94a3b8 63%,
                #10b981 63%, #10b981 88%,
                #06b6d4 88%, #06b6d4 100%
              )`,
            }}
          />
          {/* Tick marks at boundaries */}
          <div className="relative h-3 mt-1">
            {[0, 25, 50, 75, 100].map((tick) => (
              <div
                key={tick}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${tick}%` }}
              >
                <div className="w-px h-1.5 bg-slate-600" />
                <span className="text-[10px] font-mono text-slate-500 mt-0.5">{tick}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── (2) Sharpe Ratio → Score Scale legend ──────────────────────────── */}
      <div>
        <div className="text-[11px] uppercase tracking-widest font-mono text-slate-400 mb-3 flex items-center gap-2">
          <span>Sharpe Ratio → Score Scale</span>
          <span className="text-slate-600 font-normal normal-case tracking-normal">
            Score = clip(50 + 25 × Sharpe, 0, 100) · §3.5
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 rounded-xl overflow-hidden">
          {[
            { lo: 0,  hi: 13,  label: 'BROKEN',    sharpe: '≤ −2', desc: 'Worse than HODL by 2σ', bg: 'bg-red-500/20',     border: 'border-red-500/40',     text: 'text-red-300' },
            { lo: 13, hi: 38,  label: 'BAD',       sharpe: '−1',   desc: 'Underperforms HODL',     bg: 'bg-orange-500/20',  border: 'border-orange-500/40',  text: 'text-orange-300' },
            { lo: 38, hi: 63,  label: 'NEUTRAL',   sharpe: '0',    desc: 'Matches HODL',           bg: 'bg-slate-500/20',   border: 'border-slate-500/40',   text: 'text-slate-200' },
            { lo: 63, hi: 88,  label: 'GOOD',      sharpe: '+1',   desc: 'Beats HODL by 1σ',       bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-300' },
            { lo: 88, hi: 101, label: 'EXCELLENT', sharpe: '+2',   desc: 'Beats HODL by 2σ',       bg: 'bg-cyan-500/20',    border: 'border-cyan-500/40',    text: 'text-cyan-300' },
          ].map((zone) => {
            const inZone = targetScore >= zone.lo && targetScore < zone.hi
            return (
              <div
                key={zone.label}
                className={clsx(
                  'relative px-3 py-3 border rounded-lg transition-all duration-300',
                  zone.bg,
                  zone.border,
                  inZone && 'ring-2 ring-offset-2 ring-offset-dark-900 scale-[1.02]',
                  inZone && zone.label === 'BROKEN' && 'ring-red-400',
                  inZone && zone.label === 'BAD' && 'ring-orange-400',
                  inZone && zone.label === 'NEUTRAL' && 'ring-slate-400',
                  inZone && zone.label === 'GOOD' && 'ring-emerald-400',
                  inZone && zone.label === 'EXCELLENT' && 'ring-cyan-400',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className={clsx('text-[10px] font-mono font-bold tracking-widest', zone.text)}>
                    {zone.label}
                  </span>
                  <span className={clsx('text-[10px] font-mono', zone.text, 'opacity-60')}>
                    Sharpe {zone.sharpe}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className={clsx('text-base font-black font-mono', zone.text)}>
                    {zone.lo === 0 ? '0' : zone.lo}–{zone.hi === 101 ? '100' : zone.hi - 1}
                  </span>
                  {inZone && (
                    <span className={clsx('text-[10px] font-mono font-bold animate-pulse', zone.text)}>
                      ◀ TARGET
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  {zone.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── (3) Implied target advisory — moved BELOW the scale per flow ──── */}
      <div className={clsx(
        'rounded-xl border px-4 py-3 flex items-start gap-3',
        impBand.bgClass,
        Math.abs(drift) <= 5  ? 'border-emerald-500/30' :
        Math.abs(drift) <= 15 ? 'border-amber-500/30'   : 'border-red-500/30',
      )}>
        <div className="flex-shrink-0 mt-0.5">
          <Target size={14} style={{ color: impBand.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest font-mono text-slate-300 font-bold">
              Implied target from current guardrails
            </span>
            <span className="text-sm font-mono font-bold" style={{ color: impBand.color }}>
              ≈ {implied} ({impBand.label})
            </span>
            <span className={clsx('text-[11px] font-mono ml-auto', driftTone)}>
              your target {targetScore} · {driftLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
            Heuristic from <span className="font-mono text-amber-300">max_drawdown {maxDrawdown}%</span> ·
            <span className="font-mono text-amber-300"> max_position {maxPosition}%</span> ·
            <span className="font-mono text-amber-300"> min_confidence {minConfidence.toFixed(2)}</span>.
            Tighter guardrails ↔ higher Sharpe expectation. {Math.abs(drift) > 15 && (
              <span className="text-red-300">
                {' '}Large divergence — consider whether your guardrails and your Sharpe target are
                describing the same fleet.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── (4) The Sharpe Contract · 6 locked questions in a collapsed drawer ── */}
      <div className="bg-dark-800/40 border border-dark-700/60 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setContractOpen((o) => !o)}
          aria-expanded={contractOpen}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700/30 transition-colors"
        >
          <Lock size={12} className="text-violet-400 flex-shrink-0" />
          <span className="text-[12px] uppercase tracking-widest font-mono text-violet-300 font-bold flex-shrink-0">
            The Sharpe Contract
          </span>
          <span className="text-[11px] text-slate-500 font-mono flex-shrink-0 hidden sm:inline">
            6 questions settled · click to {contractOpen ? 'collapse' : 'expand'}
          </span>
          <InfoBubble
            content={
              <>
                <p className="text-white font-bold mb-1">Why the six are locked</p>
                <p>The six answers below define what "Sharpe" means for this fleet — numeraire, risk-free floor, time unit, cohort, gate-or-display, and surface (Score vs Ratio). Per the Day 13 spec session, they are settled.</p>
                <p className="mt-1 text-slate-400">Changing them mid-flight would silently re-define the metric behind the operator's back — the same shape of mistake the warmup gate exists to prevent. A future change requires a new <span className="font-mono text-amber-300">SHARPE_SPEC</span> version + explicit green-light, not a slider drag.</p>
              </>
            }
            side="top"
            maxWidth={360}
          />
          <ChevronDown
            size={16}
            className={clsx(
              'ml-auto text-slate-400 flex-shrink-0 transition-transform duration-200',
              contractOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Drawer body — only renders when open */}
        {contractOpen && (
          <div className="px-4 pb-4 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-3 border-t border-dark-700/60">
            {SHARPE_CONTRACT_FULL.map((qa) => (
              <div
                key={qa.num}
                className="group relative bg-dark-800/60 border border-dark-600/80 rounded-xl px-4 py-3 hover:border-violet-500/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-mono text-violet-400 font-bold tracking-wider">Q{qa.num}</span>
                    <Lock size={9} className="text-slate-600 mt-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[11px] uppercase tracking-widest font-mono text-violet-300 font-bold">
                        {qa.dim}
                      </span>
                      <InfoBubble
                        content={
                          <>
                            <p className="text-white font-bold mb-1">{qa.dim}</p>
                            <p className="text-slate-300 italic mb-2">"{qa.question}"</p>
                            <p>{qa.rationale}</p>
                          </>
                        }
                        side="top"
                        maxWidth={340}
                      />
                    </div>
                    <p className="text-[12px] text-slate-400 italic leading-snug mt-1">
                      "{qa.question}"
                    </p>
                    <p className="text-[13px] text-slate-100 font-mono mt-1.5 leading-snug">
                      {qa.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function RiskConfig() {
  const [config,   setConfig]   = useState<Config>(DEFAULTS)
  const [status,   setStatus]   = useState<RiskStatus | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [isDirty,  setIsDirty]  = useState(false)  // true while user is editing — prevents poll overwrite

  const fetchConfig = useCallback(async () => {
    const [cfgRes, stRes] = await Promise.allSettled([
      api.get('/fleet/risk/config').then(r => r.data),
      api.get('/fleet/risk/status').then(r => r.data),
    ])
    // Only overwrite config from server if user hasn't made unsaved changes
    if (!isDirty && cfgRes.status === 'fulfilled' && cfgRes.value && typeof cfgRes.value.max_drawdown_pct === 'number') {
      const srv = cfgRes.value as Partial<Config>
      // Derive consensus_votes from server value (support older server that only returns threshold)
      if (srv.consensus_votes == null && srv.consensus_threshold != null) {
        srv.consensus_votes = Math.ceil(srv.consensus_threshold * 12)
      }
      setConfig({ ...DEFAULTS, ...srv })
    }
    if (stRes.status === 'fulfilled' && stRes.value)
      setStatus(stRes.value)
  }, [isDirty])

  useEffect(() => {
    fetchConfig()
    const t = setInterval(fetchConfig, 5000)
    return () => clearInterval(t)
  }, [fetchConfig])

  const handleApply = async () => {
    setSaving(true)
    try {
      await api.post('/fleet/risk/config', config)
      toast.success('Risk configuration applied')
      setIsDirty(false)
      await fetchConfig()
    } catch {
      toast.error('Failed to apply configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConfig(DEFAULTS)
    setIsDirty(false)
    toast.success('Reset to defaults')
  }

  const handleRelease = async () => {
    try { await api.post('/fleet/risk/release'); toast.success('Trading resumed'); await fetchConfig() } catch {}
  }

  const isHalted    = status?.global_halt     ?? false
  const isCBTripped = status?.circuit_breaker ?? false
  const drawdown    = status?.drawdown_pct    ?? 0
  const dailyLoss   = status?.daily_loss_pct  ?? 0
  const openPos     = status?.open_positions  ?? 0
  const maxPos      = status?.max_positions   ?? config.max_concurrent_positions
  const drawdownPct = (drawdown / config.max_drawdown_pct) * 100

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#080d18] text-slate-100 font-mono">

      {/* ── Trading status banner ───────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center gap-3 px-5 py-3 rounded-xl border',
        isHalted ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
      )}>
        <div className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0',
          isHalted ? 'bg-red-400' : 'bg-emerald-400 animate-pulse')} />
        <span className={clsx('text-sm font-black tracking-wider', isHalted ? 'text-red-400' : 'text-emerald-400')}>
          {isHalted ? '⛔  TRADING HALTED' : '✓  TRADING ACTIVE'}
        </span>
        {!isHalted && status && (
          <span className="text-xs text-slate-400 ml-1">
            Running normally · drawdown {(drawdown ?? 0).toFixed(1)}% of {config.max_drawdown_pct}% limit
          </span>
        )}
        {isHalted && (
          <button onClick={handleRelease} className="ml-auto text-xs text-emerald-400 hover:text-emerald-300 underline font-semibold">
            Release halt →
          </button>
        )}
      </div>

      {/* ── Live status cards (relocated from right panel) ────────────────────
          Session XXXIX (Day 6): grid widened from 5 → 6 columns on lg+ to
          fit the relocated Daily Cap card at the end of the row. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatusCard
          icon={ShieldAlert}
          label="Global HALT"
          value={isHalted ? 'ACTIVE' : 'CLEAR'}
          sub={isHalted ? 'All bots suspended' : 'No halt active'}
          danger={isHalted}
          info={<>
            <p className="text-white font-bold mb-1">Global HALT</p>
            <p>The kill-switch for the entire fleet. When ACTIVE, every strategy is suspended — no signals fire, no orders submit, on-chain execution is blocked.</p>
            <p className="mt-1 text-slate-400">Triggered manually from the Danger Zone, or automatically when the Circuit Breaker trips. Operator must clear it to resume trading.</p>
          </>}
        />
        <StatusCard
          icon={Zap}
          label="Circuit Breaker"
          value={isCBTripped ? 'TRIGGERED' : 'CLEAR'}
          sub={isCBTripped ? 'Daily limit hit' : 'Daily loss within range'}
          danger={isCBTripped}
          info={<>
            <p className="text-white font-bold mb-1">Circuit Breaker</p>
            <p>Trips automatically when intraday cumulative loss exceeds the configured daily-loss threshold ({config.daily_loss_circuit_breaker_pct}% of equity).</p>
            <p className="mt-1 text-slate-400">When TRIGGERED, the breaker forces a Global HALT until UTC midnight reset or manual clear.</p>
          </>}
        />
        <StatusCard
          icon={TrendingDown}
          label="Drawdown"
          value={`${(drawdown ?? 0).toFixed(1)}%`}
          sub={drawdown === 0 ? 'Live trades only · 0% used' : `${Math.min(drawdownPct ?? 0, 100).toFixed(0)}% of ${config.max_drawdown_pct}% limit`}
          danger={drawdownPct >= 80}
          warn={drawdownPct >= 50}
          info={<>
            <p className="text-white font-bold mb-1">Drawdown from Peak</p>
            <p>Current equity decline from the all-time high water mark, on LIVE trades only (paper trades excluded). Configured ceiling: <span className="text-amber-300 font-mono">{config.max_drawdown_pct}%</span>.</p>
            <p className="mt-1 text-slate-400">≥50% of limit warns amber; ≥80% turns red. Full breach triggers a HALT.</p>
          </>}
        />
        <StatusCard
          icon={BarChart2}
          label="Daily Loss"
          value={`${(dailyLoss ?? 0).toFixed(1)}%`}
          sub={`Limit: ${config.daily_loss_circuit_breaker_pct}%`}
          danger={dailyLoss >= config.daily_loss_circuit_breaker_pct * 0.85}
          warn={dailyLoss >= config.daily_loss_circuit_breaker_pct * 0.5}
          info={<>
            <p className="text-white font-bold mb-1">Daily Loss</p>
            <p>Cumulative loss for the current UTC day as a percentage of equity. Resets at UTC midnight.</p>
            <p className="mt-1 text-slate-400">Crossing <span className="text-amber-300 font-mono">{config.daily_loss_circuit_breaker_pct}%</span> trips the Circuit Breaker. ≥50% of limit warns amber, ≥85% red.</p>
          </>}
        />
        <StatusCard
          icon={Layers}
          label="Open Positions"
          value={`${openPos} / ${maxPos}`}
          sub={openPos === 0 ? 'No active trades' : `${maxPos - openPos} slots remaining`}
          warn={openPos >= maxPos}
          info={<>
            <p className="text-white font-bold mb-1">Open Positions</p>
            <p>Live positions currently held against the configured maximum concurrent slot count ({maxPos}). New BUY signals are rejected when the slot count is full.</p>
            <p className="mt-1 text-slate-400">Slot count is sized so a single drawdown event doesn't compound across too many simultaneous bets.</p>
          </>}
        />
        {/* Session XXXIX (Day 6): Daily Cap KPI relocated here from
            Wallet/Transactions per Mav's call — natural home alongside the
            other autonomous-fleet guardrails. */}
        <DailyCapStatusCard />
      </div>

      {/* ── Sharpe Score — Risk-Adjusted Return Contract ─────────────────────
          Day 14 Session XLIV: 5-question Sharpe contract (locked, read-only) +
          0–100 Score scale legend (§3.5) + operator-tunable Target slider.
          Sits ABOVE Autonomous Guardrails so the operator reads the
          risk-adjusted-return contract first, picks a target, then tunes the
          guardrail knobs to match.  Implementation of the Sharpe metric
          itself remains gated on `SHARPE_SPEC.md` warmup criteria; this
          panel ships the philosophy + target now so the metric has a target
          line to render against on arrival. */}
      <SharpeContractPanel
        targetScore={config.sharpe_target_score ?? 75}
        onTargetChange={v => { setIsDirty(true); setConfig(c => ({ ...c, sharpe_target_score: v })) }}
        maxDrawdown={config.max_drawdown_pct}
        maxPosition={config.max_position_size_pct}
        minConfidence={config.min_confidence_score}
      />

      {/* ── Position Cap Structure (F-37B · D-37 Part B) ─────────────────────
          Day 14 evening: per-strategy phased Kelly cap-structure.  Sits
          BELOW the Sharpe Contract (the risk-adjusted-return *target*) and
          ABOVE the Autonomous Guardrails (the global *limits*) — phased
          caps are the per-strategy operationalization of the contract,
          gated by Bailey-min sample size and capped at half-Kelly.
          Renders only when the feature flag is ON; default OFF preserves
          the page's existing visual layout for operators not opted in. */}
      <CapStructureSection
        enabled={config.feature_phased_cap_structure === true}
        onToggle={(next) => {
          setIsDirty(true)
          setConfig(c => ({ ...c, feature_phased_cap_structure: next }))
        }}
      />

      {/* ── Autonomous Guardrails ───────────────────────────────────────────── */}
      <div className="bg-dark-800/80 border border-dark-600 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <ShieldAlert size={20} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-wider uppercase">
              Autonomous Guardrails
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Colour shifts green → amber → red as each parameter approaches danger territory
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
          <RiskSlider
            label="Max Drawdown"
            description="Cumulative portfolio drop % from peak that triggers a global HALT. 8% (unproven phase) = halt fast, investigate. With 5% positions, ~4 full stop-outs reach this limit — a clear systemic-failure signal. Graduate to 12% once strategies are gate-proven."
            value={config.max_drawdown_pct}
            min={5} max={45} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="5% (tight) — 45% (dangerous)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_drawdown_pct: v })) }}
          />
          <RiskSlider
            label="Stop Loss"
            description="Per-trade exit if the alpha position drops this far. 8% is deliberately calibrated for subnet alpha token volatility — tighter creates noise stop-outs on normal price swings; looser accepts too much per-trade pain. Do not change while building WR data."
            value={config.stop_loss_pct}
            min={2} max={20} step={0.5} riskDir="down"
            format={v => `${v.toFixed(1)}%`}
            rangeLabel="2% (tight) — 20% (loose)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, stop_loss_pct: v })) }}
          />
          <RiskSlider
            label="Take Profit"
            description="'Stick and move' target — position closes and books the gain when hit. Subnet alpha prices spike 10-20% then reverse. At 12% you capture the real move before reversal. Do not raise while in unproven phase — booking smaller wins builds WR faster."
            value={config.take_profit_pct}
            min={3} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="3% (scalp) — 50% (hold for big move)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, take_profit_pct: v })) }}
          />
          <RiskSlider
            label="Max Position Size"
            description="Maximum % of wallet per single trade. 5% (unproven phase): prove the model cheaply. 3 concurrent × 5% = 15% deployed, 85% liquid. A full wipeout of all open positions costs 15% — survivable and correctable. Graduate to 10% once gate-proven."
            value={config.max_position_size_pct}
            min={1} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="1% (micro) — 50% (concentrated)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_position_size_pct: v })) }}
          />
          <RiskSlider
            label="Max Concurrent Positions"
            description="How many live positions can coexist across all bots simultaneously. 3 pairs with 5% position size: 3×5%=15% deployed, 85% liquid for evaluation. Graduate to 4 once 2-3 strategies are gate-proven."
            value={config.max_concurrent_positions}
            min={1} max={12} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}`}
            rangeLabel="1 (one at a time) — 12 (all bots)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_concurrent_positions: v })) }}
          />
          <RiskSlider
            label="Daily Circuit Breaker"
            description="Daily portfolio loss % that halts ALL trading for the rest of the day. 5% calibrated for 5% positions: ~12 consecutive stop-outs in one day = algo is broken, not just unlucky. Old 15% required ~37 consecutive stops — effectively decorative."
            value={config.daily_loss_circuit_breaker_pct}
            min={2} max={40} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="2% (strict) — 40% (dangerous)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, daily_loss_circuit_breaker_pct: v })) }}
          />
          <RiskSlider
            label="Min AI Confidence"
            description="Conviction-gate floor. Each fired signal earns a heuristic confidence score (0.0–1.0) from RSI distance from neutral, EMA spread, MACD magnitude, and BB position. Signals below this threshold skip the trade entirely (no fee, no position) — strategy still earns cycle credit toward gate criteria. Session XXXIV: this slider is now ENFORCED in cycle_service. 0.55 default cuts mixed/weak signals (~40% of fee-drag trades) while preserving strong setups. Lower for more trades, raise for higher conviction."
            value={config.min_confidence_score}
            min={0.30} max={0.95} step={0.05} riskDir="down"
            format={v => v.toFixed(2)}
            rangeLabel="0.30 (permissive) — 0.95 (very selective)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, min_confidence_score: v })) }}
          />
          <RiskSlider
            label="Fleet Consensus"
            description="Minimum council votes required for a trade to be approved (out of 12 bots). 7/12 = 58.3% supermajority — the Byzantine Fault Tolerance threshold. Below 7 risks bad-actor manipulation; above 9 makes approval too rare."
            value={config.consensus_votes ?? 7}
            min={6} max={12} step={1} riskDir="down"
            format={v => `${v} / 12  (${((v/12)*100).toFixed(1)}%)`}
            rangeLabel="6/12 (permissive) — 12/12 (unanimous)"
            onChange={v => {
              setIsDirty(true)
              setConfig(c => ({
                ...c,
                consensus_votes: v,
                consensus_threshold: v / 12,
              }))
            }}
          />
          <RiskSlider
            label="Cycle Interval"
            description="How often the bot evaluates all strategies. Bug fixed: was hardcoded 60s regardless of this setting. Now reads from config dynamically — changes take effect after current cycle. 5 min is optimal for paper training: meaningful data per cycle, avoids 1,440 trades/day noise."
            value={config.cycle_interval_seconds}
            min={60} max={3600} step={60} riskDir="down"
            format={v => {
              if (v < 120) return `${v}s ⚡ aggressive`
              if (v < 600) return `${(v/60).toFixed(0)} min`
              if (v === 600) return '10 min'
              return `${(v/60).toFixed(0)} min`
            }}
            rangeLabel="60s (aggressive) — 60 min (conservative)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, cycle_interval_seconds: v })) }}
          />
          {/* Session XXXIV: Drawdown-Demote Min Cycles relocated to sit below
              Fleet Consensus per Partner spec — col-2 row-2 of the upper
              grid section.  Functionally still a Conviction-Era safety knob,
              promoted up here for Operator visibility next to its companion
              consensus / cycle controls. */}
          <RiskSlider
            label="Drawdown-Demote Min Cycles"
            description="Minimum cycles a strategy must complete before drawdown auto-demotion can fire. Filters out early-cycle noise (a single -0.15τ trade in cycle #2 shouldn't trigger demotion). 10 cycles ≈ 50 minutes at the default 5-min cadence."
            value={config.strategy_demote_min_cycles}
            min={3} max={50} step={1} riskDir="down"
            format={v => `${v.toFixed(0)} cycles`}
            rangeLabel="3 (twitchy) — 50 (very patient)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, strategy_demote_min_cycles: v })) }}
          />

          {/* ── Conviction-Era safety + quality knobs (Session XXXI / XXXII) ─────
              Session XXXIV: Drawdown-Demote Min Cycles moved up next to
              Fleet Consensus.  This section now hosts the drawdown floor
              + the subnet provenance gate side-by-side. */}
          <div className="lg:col-span-2 pt-3 border-t border-dark-600">
            <div className="text-[11px] uppercase tracking-widest font-mono text-violet-300 mb-2">
              ⛓ Conviction-Era Safety & Quality Gates
            </div>
            <div className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              These knobs gate the post-Conviction signal pipeline. The drawdown floor catches strategies whose
              cumulative PnL bleeds below a τ floor even when their win-rate looks fine. The subnet quality gate uses
              Const's 6-Filter Test as a provenance check on any external signal source.
            </div>
          </div>
          <RiskSlider
            label="Strategy Drawdown Floor"
            description="When a strategy's cumulative PnL falls below this τ amount AND the min-cycles gate has passed, it auto-demotes one tier (LIVE → APPROVED → PAPER). Parallel to WR demotion — catches the case where WR > 50% but a few catastrophic losses dominate cumulative PnL. Dormant during paper-only Day 2; armed once a strategy promotes through the WR gate."
            value={config.strategy_demote_drawdown_tao}
            min={-1.0} max={-0.05} step={0.01} riskDir="down"
            format={v => `${v.toFixed(2)} τ`}
            rangeLabel="−1.0 τ (very lenient) — −0.05 τ (twitchy)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, strategy_demote_drawdown_tao: v })) }}
          />
          {/* Session XXXIV: Subnet Quality Gate now sits to the right of
              Strategy Drawdown Floor — fills col-2 of the Conviction-Era grid. */}
          <RiskSlider
            label="Subnet Quality Gate (Const 6-Filter)"
            description="Minimum filters a SOURCE subnet must pass on Const's 6-Filter Test before its external signal feed is admitted to the consensus pipeline. Default 6/6 mirrors the seeded scorecard (Templar, Vanta, Chutes, etc. all confirmed 6/6). Lower to admit a 5/6 source; set to 0 to disable the gate entirely."
            value={config.subnet_quality_min_filters}
            min={0} max={6} step={1} riskDir="down"
            format={v => v === 0 ? 'gate OFF (open mode)' : `${v.toFixed(0)} / 6`}
            rangeLabel="0 (gate off) — 6/6 (strictest)"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, subnet_quality_min_filters: v })) }}
          />

          {/* Phase indicator + graduation path — spans full width */}
          <div className="lg:col-span-2 pt-3 border-t border-dark-600 space-y-2">
            <div className="flex items-center gap-3 flex-wrap gap-y-1">
              <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">Current Phase</span>
              <span className={clsx('text-sm font-bold font-mono', {
                'text-emerald-400': status?.phase === 'LIVE',
                'text-yellow-400':  status?.phase === 'APPROVED_FOR_LIVE',
                'text-slate-400':   !status?.phase || status.phase === 'PAPER_ONLY' || status.phase === 'PAPER',
              })}>
                {status?.phase ? status.phase.replace(/_/g, ' ') : 'PAPER — no live strategies yet'}
              </span>
              <span className="text-[11px] text-slate-500 ml-auto font-mono">
                Cycle interval changes take effect after current sleep — no restart needed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
              <span className="text-slate-600 uppercase tracking-widest">Graduation path:</span>
              <span className="px-2 py-0.5 rounded bg-dark-700 border border-dark-600 text-slate-400">Phase 1 (now): 5% size · 3 pos · 8% DD · 5% CB · 0.65 conf</span>
              <span className="text-slate-600">→</span>
              <span className="px-2 py-0.5 rounded bg-dark-700 border border-dark-600 text-yellow-600">Phase 2 (2-3 gate-proven): 10% size · 4 pos · 12% DD · 8% CB · 0.60 conf</span>
              <span className="text-slate-600">→</span>
              <span className="px-2 py-0.5 rounded bg-dark-700 border border-dark-600 text-emerald-700">Phase 3 (fleet proven): 15% size · 4 pos · 15% DD · 10% CB</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Apply / Reset ───────────────────────────────────────────────────── */}
      {isDirty && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-xl text-yellow-400 text-xs font-mono">
          <Zap size={12} className="text-yellow-400" />
          Unsaved changes — click Apply Configuration to save
        </div>
      )}
      <div className="flex gap-4 pb-6">
        <button
          onClick={handleApply} disabled={saving}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-colors tracking-wider border',
            isDirty
              ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/35'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25',
            saving && 'opacity-50 cursor-not-allowed',
          )}
        >
          <CheckCircle2 size={15} />
          {saving ? 'Applying…' : 'Apply Configuration'}
        </button>
        <button
          onClick={handleReset}
          className="px-8 py-3.5 bg-dark-700 border border-dark-600 rounded-xl text-slate-400 text-sm hover:text-white hover:border-dark-500 transition-colors"
        >
          <RefreshCw size={13} className="inline mr-2" />
          Reset to Defaults
        </button>
      </div>
      </div>{/* end scrollable */}
    </div>
  )
}