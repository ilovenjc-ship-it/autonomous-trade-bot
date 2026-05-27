/**
 * CapStructureSection.tsx — F-37B (D-37 Part B) Kelly cap-structure phasing
 * ============================================================================
 *
 * Library-Night doctrine (D-37 Part B): position cap is phased by deployment
 * stage and sample size — paper-static → ¼-Kelly → linear interp → ½-Kelly.
 * Full Kelly is architecturally unreachable.
 *
 * Sections (top → bottom):
 *   (1) Header + feature-flag pill
 *   (2) LTCM forward-warning panel — collapsible, default-open per session
 *   (3) Per-strategy cap cards — phase, formula, applied cap, warnings
 *
 * Render-gated upstream by `config.feature_phased_cap_structure`.  When the
 * flag is OFF, the section does not mount at all.  When ON, the section
 * fetches /api/fleet/risk/cap-structure on mount and refreshes every 30s.
 *
 * Doctrinal anchors:
 *   - D-31 half-Kelly default · full Kelly NEVER
 *   - D-32 LTCM forward-warning (correlated bets at full Kelly)
 *   - D-36 Bailey-min sample-size gate
 *   - D-37 continuous Kelly: f* = m/s²
 */
import { useEffect, useState, useCallback } from 'react'
import {
  ShieldAlert, AlertTriangle, ChevronDown, Lock, BarChart2,
  Activity, CheckCircle2, XCircle, Info, Layers, Beaker,
} from 'lucide-react'
import clsx from 'clsx'
import { InfoBubble } from '@/components/Tooltip'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────

interface KellyData {
  f_star: number | null
  m: number | null
  s_squared: number | null
  sample_size: number
  do_not_deploy: boolean
  reason: string | null
  inside_noise_floor: boolean
}

interface CapCard {
  strategy_id: string
  display_name: string
  mode: string
  phase: string
  phase_progress: number
  sample_size: number
  bailey_min: number
  static_cap_tao: number
  kelly: KellyData | null
  applied_formula: string
  applied_cap_tao: number
  multiplier_used: number
  do_not_deploy_lock: boolean
  warnings: string[]
  computed_at: string
}

interface CapStructureResponse {
  cards: CapCard[]
  global: {
    feature_enabled: boolean
    kelly_full_forbidden: boolean
    kelly_quarter_multiplier: number
    kelly_half_multiplier: number
    live_maturing_threshold: number
    bailey_min_trades_default: number
    ltcm_warning_required_on_increase: boolean
  }
  doctrine: { anchors: string[]; ceiling_label: string }
  timestamp: string
}

// ── helpers ───────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  paper_under_bailey: 'PAPER · n < Bailey',
  paper_at_bailey:    'PAPER · n ≥ Bailey',
  live_maturing:      'LIVE · MATURING',
  live_mature:        'LIVE · MATURE',
  error:              'ERROR',
}

const PHASE_TONE: Record<string, { color: string; bg: string; border: string; text: string }> = {
  paper_under_bailey: { color: '#94a3b8', bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-300'  },
  paper_at_bailey:    { color: '#a78bfa', bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-300' },
  live_maturing:      { color: '#fbbf24', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-300'  },
  live_mature:        { color: '#10b981', bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-300'},
  error:              { color: '#ef4444', bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-300'    },
}

const PHASE_DESCRIPTION: Record<string, string> = {
  paper_under_bailey: 'Sample below Bailey-min. Kelly NOT used; static cap rules. Continue paper-trading until n ≥ Bailey.',
  paper_at_bailey:    'Sample at/above Bailey-min. Cap = min(static, ¼ × max(f*, 0)). Kelly is the ceiling, not the target.',
  live_maturing:      'Live but inside first 100 trades. Multiplier interpolates linearly from ¼-Kelly to ½-Kelly as live trade count grows.',
  live_mature:        'Live and ≥100 trades. Cap = min(static, ½ × max(f*, 0)). Half-Kelly is the practitioner default per D-31.',
  error:              'Compute failed — check backend logs.',
}

const PHASES_ORDER = ['paper_under_bailey', 'paper_at_bailey', 'live_maturing', 'live_mature']

// ── LTCM warning panel ────────────────────────────────────────────────────

function LTCMWarningPanel() {
  // Default-open per session; persists collapsed state in sessionStorage.
  const STORAGE_KEY = 'ari.ltcm_warning_collapsed'
  const [open, setOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) !== '1' } catch { return true }
  })
  const handleToggle = () => {
    setOpen(prev => {
      const next = !prev
      try { sessionStorage.setItem(STORAGE_KEY, next ? '0' : '1') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="bg-amber-500/[0.04] border border-amber-500/30 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-500/[0.06] transition-colors"
      >
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
        <span className="text-[12px] uppercase tracking-widest font-mono text-amber-300 font-bold">
          LTCM forward-warning
        </span>
        <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
          review before any cap-loosening change · D-32
        </span>
        <ChevronDown
          size={16}
          className={clsx(
            'ml-auto text-amber-400/60 flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-amber-500/20 space-y-3">
          <p className="text-[13px] text-slate-200 leading-relaxed">
            <span className="text-amber-300 font-bold">Why this matters:</span> LTCM levered to{' '}
            <span className="font-mono text-amber-300">≈ 25:1</span> on positions whose historical
            correlation broke under stress. Same-data-feed strategies in Project Ari's fleet are
            correlated by construction — RSI, MACD, BB share inputs.
          </p>
          <p className="text-[13px] text-slate-300 leading-relaxed">
            Full Kelly assumes <span className="text-amber-300 font-mono">independent-bet sizing</span>;
            correlated bets at full Kelly have <span className="text-red-300 font-bold">compounding ruin
            risk during regime breaks</span>. Half-Kelly is the practitioner default for a reason.
          </p>
          <div className="flex items-start gap-2 pt-1.5 border-t border-amber-500/15">
            <Lock size={11} className="text-amber-400 flex-shrink-0 mt-1" />
            <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
              Sources: Poundstone <span className="text-slate-300 italic">Fortune's Formula</span> p231-233 ·
              Lowenstein <span className="text-slate-300 italic">When Genius Failed</span> · Chan{' '}
              <span className="text-slate-300 italic">Quantitative Trading 2nd Ed</span> p134-137 ·
              Decisions D-31, D-32, D-37.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phase progression timeline ────────────────────────────────────────────

function PhaseTimeline({ phase, progress }: { phase: string; progress: number }) {
  const idx = PHASES_ORDER.indexOf(phase)
  return (
    <div className="flex items-center gap-1 mt-2">
      {PHASES_ORDER.map((p, i) => {
        const reached = i <= idx
        const current = p === phase
        const tone = PHASE_TONE[p] || PHASE_TONE.error
        return (
          <div key={p} className="flex items-center gap-1 flex-1 min-w-0">
            <div
              className={clsx(
                'h-1.5 flex-1 rounded-full transition-all',
                reached ? tone.bg.replace('/10', '/30') : 'bg-dark-700',
              )}
              style={current ? {
                background: `linear-gradient(to right, ${tone.color} ${progress * 100}%, ${tone.color}30 ${progress * 100}%)`,
              } : undefined}
            />
            {current && (
              <div className="text-[9px] font-mono font-bold flex-shrink-0" style={{ color: tone.color }}>
                {Math.round(progress * 100)}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Strategy cap card ─────────────────────────────────────────────────────

function StrategyCapCard({ card }: { card: CapCard }) {
  const tone = PHASE_TONE[card.phase] || PHASE_TONE.error
  const phaseDesc = PHASE_DESCRIPTION[card.phase] || ''
  const bailey_met = card.sample_size >= card.bailey_min

  // Format helpers
  const f_star_str =
    card.kelly?.f_star == null ? '—'
    : card.kelly.f_star.toFixed(4)
  const m_str =
    card.kelly?.m == null ? '—'
    : `${(card.kelly.m * 100).toFixed(3)}%`
  const sq_str =
    card.kelly?.s_squared == null ? '—'
    : card.kelly.s_squared.toExponential(2)
  const applied_τ = card.applied_cap_tao.toFixed(4)
  const static_τ = card.static_cap_tao.toFixed(4)

  // Kelly verdict label
  const verdict = (() => {
    if (card.do_not_deploy_lock) return { label: 'MANUAL LOCK', color: '#94a3b8' }
    if (card.kelly?.reason === 'f_star_negative') return { label: 'DO NOT DEPLOY', color: '#ef4444' }
    if (card.kelly?.reason === 'sample_below_bailey') return { label: 'SAMPLE-BOUND', color: '#94a3b8' }
    if (card.kelly?.reason === 'degenerate_variance') return { label: 'DEGENERATE σ²', color: '#fbbf24' }
    if (card.kelly?.inside_noise_floor) return { label: 'NOISE FLOOR', color: '#fbbf24' }
    if (card.applied_cap_tao > 0) return { label: 'ACTIVE', color: '#10b981' }
    return { label: 'ZERO CAP', color: '#94a3b8' }
  })()

  return (
    <div className={clsx(
      'rounded-xl border p-4 space-y-3 transition-colors',
      tone.bg, tone.border,
    )}>
      {/* Header row — strategy name + phase pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-bold text-white truncate">{card.display_name}</span>
        <span
          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border"
          style={{ color: tone.color, borderColor: `${tone.color}50`, background: `${tone.color}15` }}
        >
          {PHASE_LABEL[card.phase] || card.phase}
        </span>
        <InfoBubble
          content={
            <>
              <p className="text-white font-bold mb-1">{PHASE_LABEL[card.phase]}</p>
              <p>{phaseDesc}</p>
              <p className="mt-2 text-slate-400">Mode: <span className="font-mono">{card.mode}</span></p>
            </>
          }
          side="top"
          maxWidth={340}
        />
        <span
          className="ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
          style={{ color: verdict.color, background: `${verdict.color}15` }}
        >
          {verdict.label}
        </span>
      </div>

      {/* Sample-size + Bailey gate */}
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <BarChart2 size={11} className="text-slate-500" />
        <span className="text-slate-400">
          Sample: <span className="text-white font-bold">{card.sample_size}</span> trades
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">
          Bailey-min: <span className="text-white font-bold">{card.bailey_min}</span>
        </span>
        {bailey_met
          ? <CheckCircle2 size={11} className="text-emerald-400" />
          : <XCircle size={11} className="text-slate-500" />}
      </div>

      {/* Kelly stats grid */}
      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
        <div className="bg-dark-800/60 rounded-lg px-2.5 py-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">f*</div>
          <div className="text-white font-bold mt-0.5">{f_star_str}</div>
        </div>
        <div className="bg-dark-800/60 rounded-lg px-2.5 py-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">m (mean)</div>
          <div className="text-white font-bold mt-0.5">{m_str}</div>
        </div>
        <div className="bg-dark-800/60 rounded-lg px-2.5 py-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">σ² (var)</div>
          <div className="text-white font-bold mt-0.5">{sq_str}</div>
        </div>
      </div>

      {/* Cap calculation */}
      <div className="bg-dark-900/60 rounded-lg px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-500">Static cap:</span>
          <span className="text-slate-300">{static_τ} τ</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-500">Formula:</span>
          <span className="text-amber-300 truncate ml-2" title={card.applied_formula}>
            {card.applied_formula}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px] font-mono pt-1 border-t border-dark-700">
          <span className="text-slate-400 font-bold">Applied:</span>
          <span
            className="text-base font-black"
            style={{ color: card.applied_cap_tao > 0 ? '#10b981' : '#94a3b8' }}
          >
            {applied_τ} τ
          </span>
        </div>
      </div>

      {/* Phase timeline */}
      <PhaseTimeline phase={card.phase} progress={card.phase_progress} />

      {/* Warnings (if any) */}
      {card.warnings.length > 0 && (
        <div className="space-y-1 pt-1.5 border-t border-dark-700/60">
          {card.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400 leading-snug">
              <Info size={9} className="text-amber-400/80 flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Top-level section ─────────────────────────────────────────────────────

export interface CapStructureSectionProps {
  /** Feature flag from risk_config; component renders nothing when false. */
  enabled: boolean
  /** Toggle handler — wired to the main RiskConfig form so isDirty fires. */
  onToggle: (next: boolean) => void
}

export default function CapStructureSection({ enabled, onToggle }: CapStructureSectionProps) {
  const [data, setData] = useState<CapStructureResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCaps = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const r = await api.get('/fleet/risk/cap-structure').then(res => res.data)
      setData(r as CapStructureResponse)
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'fetch failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    fetchCaps()
    const t = setInterval(fetchCaps, 30_000)
    return () => clearInterval(t)
  }, [enabled, fetchCaps])

  // Section is gated client-side on the feature flag.
  if (!enabled) {
    return (
      <div className="bg-dark-800/40 border border-dashed border-dark-600 rounded-xl px-5 py-4 flex items-center gap-3">
        <Beaker size={16} className="text-slate-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-slate-300 font-bold tracking-wide">
            Position Cap Structure <span className="text-slate-500 font-normal">· F-37B</span>
          </p>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            Phased cap doctrine (paper-static → ¼-Kelly → ½-Kelly · full Kelly NEVER).
            Default OFF; flip to render the per-strategy panel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 transition-colors flex-shrink-0"
        >
          ENABLE
        </button>
      </div>
    )
  }

  return (
    <div className="bg-dark-800/80 border border-dark-600 rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Layers size={18} className="text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black text-white tracking-wider uppercase">
              Position Cap Structure
            </h2>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
              F-37B
            </span>
            <InfoBubble
              content={
                <>
                  <p className="text-white font-bold mb-1">Phased Kelly cap-structure (D-37 Part B)</p>
                  <p>Position cap is phased by deployment stage and sample size:</p>
                  <ul className="mt-1.5 space-y-0.5 text-[12px]">
                    <li>· paper, n &lt; Bailey: <span className="font-mono">static cap</span> (Kelly NOT used)</li>
                    <li>· paper, n ≥ Bailey: <span className="font-mono">min(static, ¼·f*)</span></li>
                    <li>· live, &lt; 100 trades: <span className="font-mono">interp ¼→½ × f*</span></li>
                    <li>· live, ≥ 100 trades: <span className="font-mono">min(static, ½·f*)</span></li>
                    <li>· full Kelly: <span className="text-red-300 font-bold">NEVER</span></li>
                  </ul>
                  <p className="mt-2 text-slate-400 font-mono text-[11px]">
                    f* = m / s² (continuous Kelly, D-37 Part A) · half-Kelly per D-31.
                  </p>
                </>
              }
              side="right"
              maxWidth={420}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            Per-strategy phased cap · half-Kelly mature ceiling · full Kelly architecturally unreachable
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
        >
          ENABLED
        </button>
      </div>

      {/* LTCM warning panel */}
      <LTCMWarningPanel />

      {/* Doctrine reminder strip */}
      {data?.global && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
          <div className="bg-dark-900/60 rounded-lg px-3 py-2">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">¼-Kelly</div>
            <div className="text-violet-300 font-bold mt-0.5">{data.global.kelly_quarter_multiplier.toFixed(2)}</div>
          </div>
          <div className="bg-dark-900/60 rounded-lg px-3 py-2">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">½-Kelly ceiling</div>
            <div className="text-emerald-300 font-bold mt-0.5">{data.global.kelly_half_multiplier.toFixed(2)}</div>
          </div>
          <div className="bg-dark-900/60 rounded-lg px-3 py-2">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">Bailey min</div>
            <div className="text-slate-100 font-bold mt-0.5">{data.global.bailey_min_trades_default} trades</div>
          </div>
          <div className="bg-dark-900/60 rounded-lg px-3 py-2">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">Live mature ≥</div>
            <div className="text-slate-100 font-bold mt-0.5">{data.global.live_maturing_threshold} live</div>
          </div>
        </div>
      )}

      {/* Status / error / loading */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-red-300">
          <ShieldAlert size={13} />
          <span>Failed to load cap structure: {error}</span>
        </div>
      )}
      {loading && !data && (
        <div className="bg-dark-800/60 border border-dark-700 rounded-lg px-4 py-3 flex items-center gap-2 text-[12px] text-slate-400">
          <Activity size={13} className="animate-pulse" />
          <span>Computing per-strategy phased caps…</span>
        </div>
      )}

      {/* Strategy grid */}
      {data?.cards && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.cards.map(card => (
            <StrategyCapCard key={card.strategy_id} card={card} />
          ))}
        </div>
      )}

      {/* Footer / doctrine anchors */}
      {data?.doctrine && (
        <div className="pt-3 border-t border-dark-700/60 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500">
          <span className="uppercase tracking-widest text-violet-300">{data.doctrine.ceiling_label}</span>
          <span className="text-slate-700">·</span>
          {data.doctrine.anchors.map((a, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-dark-700/40 border border-dark-700 text-slate-400">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}