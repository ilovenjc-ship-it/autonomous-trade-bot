import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, RefreshCw, ShieldAlert, Zap, BarChart2, TrendingDown, Layers } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import toast from 'react-hot-toast'
import PageHeroSlider from '@/components/PageHeroSlider'

// ── types ─────────────────────────────────────────────────────────────────────
interface Config {
  max_drawdown_pct: number
  stop_loss_pct: number
  take_profit_pct: number
  max_position_size_pct: number
  max_concurrent_positions: number
  daily_loss_circuit_breaker_pct: number
  min_confidence_score: number
  consensus_votes: number        // integer 1–12 — source of truth for OpenClaw
  consensus_threshold: number    // kept in sync as votes/12
  cycle_interval_seconds: number
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

const DEFAULTS: Config = {
  max_drawdown_pct: 45,
  stop_loss_pct: 8,
  take_profit_pct: 25,
  max_position_size_pct: 30,
  max_concurrent_positions: 4,
  daily_loss_circuit_breaker_pct: 40,
  min_confidence_score: 0.6,
  consensus_votes: 7,            // 7/12 supermajority — OpenClaw rule
  consensus_threshold: 7 / 12,   // ≈ 0.5833 — kept in sync
  cycle_interval_seconds: 600,
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
  icon: Icon, label, value, sub, danger, warn,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; danger?: boolean; warn?: boolean
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
        <p className="text-[13px] text-slate-500 uppercase tracking-widest font-mono">{label}</p>
        <p className={clsx('text-sm font-bold font-mono',
          danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-emerald-400')}>
          {value}
        </p>
        {sub && <p className="text-[13px] text-slate-500 mt-0.5">{sub}</p>}
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

  const heroSlides = [
    {
      title: 'Risk Overview', subtitle: 'Safety Status', accent: isHalted ? 'red' : 'orange' as any,
      stats: [
        { label: 'Global Halt',    value: isHalted ? 'HALTED' : 'ACTIVE',               color: isHalted ? 'red' : 'emerald' as any },
        { label: 'Circuit Breaker',value: isCBTripped ? 'TRIPPED' : 'OK',               color: isCBTripped ? 'red' : 'emerald' as any },
        { label: 'Open Positions', value: `${openPos}/${maxPos}`,                       color: openPos >= maxPos ? 'red' : 'white' as any },
        { label: 'Drawdown',       value: `${(drawdown ?? 0).toFixed(2)}%`,                    color: drawdown > config.max_drawdown_pct * 0.8 ? 'red' : 'orange' as any },
        { label: 'Daily Loss',     value: `${(dailyLoss ?? 0).toFixed(2)}%`,                  color: 'slate' as const },
      ],
    },
    {
      title: 'Capital Config', subtitle: 'Position Limits', accent: 'blue' as const,
      stats: [
        { label: 'Max Drawdown',  value: `${(config.max_drawdown_pct ?? 0).toFixed(1)}%`,      color: 'orange' as const },
        { label: 'Max Daily Loss',value: '—',                                           color: 'orange' as const },
        { label: 'Max Positions', value: String(config.max_concurrent_positions),       color: 'white'  as const },
        { label: 'Max Per Trade', value: '—',                                          color: 'blue'   as const },
        { label: 'Min Conf.',     value: '—',                                          color: 'purple' as const },
      ],
    },
    {
      title: 'Safety Status', subtitle: 'All Checks', accent: 'emerald' as const,
      stats: [
        { label: 'Halt Status',   value: isHalted ? '⛔ HALT' : '✓ Running',            color: isHalted ? 'red' : 'emerald' as any },
        { label: 'Circuit Brk',  value: isCBTripped ? '⛔ Tripped' : '✓ Clear',        color: isCBTripped ? 'red' : 'emerald' as any },
        { label: 'Drawdown Chk', value: drawdownPct < 80 ? '✓ OK' : '⚠ Near Limit',  color: drawdownPct < 80 ? 'emerald' : 'orange' as any },
        { label: 'Pos. Limit',   value: openPos < maxPos ? '✓ OK' : '⛔ At Limit',   color: openPos < maxPos ? 'emerald' : 'red' as any },
        { label: 'Config',       value: saving ? 'Saving…' : 'Saved',                 color: saving ? 'yellow' : 'emerald' as any },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <PageHeroSlider slides={heroSlides} />
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

      {/* ── Live status cards (relocated from right panel) ──────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatusCard
          icon={ShieldAlert}
          label="Global HALT"
          value={isHalted ? 'ACTIVE' : 'CLEAR'}
          sub={isHalted ? 'All bots suspended' : 'No halt active'}
          danger={isHalted}
        />
        <StatusCard
          icon={Zap}
          label="Circuit Breaker"
          value={isCBTripped ? 'TRIGGERED' : 'CLEAR'}
          sub={isCBTripped ? 'Daily limit hit' : 'Daily loss within range'}
          danger={isCBTripped}
        />
        <StatusCard
          icon={TrendingDown}
          label="Drawdown"
          value={`${(drawdown ?? 0).toFixed(1)}%`}
          sub={`${(drawdownPct ?? 0).toFixed(0)}% of ${config.max_drawdown_pct}% limit`}
          danger={drawdownPct >= 80}
          warn={drawdownPct >= 50}
        />
        <StatusCard
          icon={BarChart2}
          label="Daily Loss"
          value={`${(dailyLoss ?? 0).toFixed(1)}%`}
          sub={`Limit: ${config.daily_loss_circuit_breaker_pct}%`}
          danger={dailyLoss >= config.daily_loss_circuit_breaker_pct * 0.85}
          warn={dailyLoss >= config.daily_loss_circuit_breaker_pct * 0.5}
        />
        <StatusCard
          icon={Layers}
          label="Open Positions"
          value={`${openPos} / ${maxPos}`}
          sub={openPos === 0 ? 'No active trades' : `${maxPos - openPos} slots remaining`}
          warn={openPos >= maxPos}
        />
      </div>

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
            description="Portfolio drop % that triggers a global HALT — hard ceiling on total portfolio pain"
            value={config.max_drawdown_pct}
            min={5} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="5% — 50%"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_drawdown_pct: v })) }}
          />
          <RiskSlider
            label="Stop Loss"
            description="Per-trade exit if position drops this far — lower value = tighter protection"
            value={config.stop_loss_pct}
            min={0.5} max={20} step={0.5} riskDir="down"
            format={v => `${v.toFixed(1)}%`}
            rangeLabel="0.5% — 20%"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, stop_loss_pct: v })) }}
          />
          <RiskSlider
            label="Take Profit"
            description="Per-trade target — position closes and locks gain when hit"
            value={config.take_profit_pct}
            min={1} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="1% — 50%"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, take_profit_pct: v })) }}
          />
          <RiskSlider
            label="Max Position Size"
            description="Maximum % of portfolio per single trade — limits concentration risk"
            value={config.max_position_size_pct}
            min={1} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="1% — 50%"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_position_size_pct: v })) }}
          />
          <RiskSlider
            label="Max Concurrent Positions"
            description="How many open trades can coexist across all 12 bots simultaneously"
            value={config.max_concurrent_positions}
            min={1} max={20} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}`}
            rangeLabel="1 — 20"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, max_concurrent_positions: v })) }}
          />
          <RiskSlider
            label="Daily Circuit Breaker"
            description="Daily portfolio loss % that halts all trading for the rest of the day"
            value={config.daily_loss_circuit_breaker_pct}
            min={2} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="2% — 50%"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, daily_loss_circuit_breaker_pct: v })) }}
          />
          <RiskSlider
            label="Min AI Confidence"
            description="Minimum confidence score required — lower value accepts weaker signals"
            value={config.min_confidence_score}
            min={0.4} max={0.95} step={0.05} riskDir="down"
            format={v => v.toFixed(2)}
            rangeLabel="0.40 — 0.95"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, min_confidence_score: v })) }}
          />
          <RiskSlider
            label="OpenClaw Consensus"
            description="Minimum bot votes required for trade approval — 7/12 is the supermajority rule"
            value={config.consensus_votes ?? 7}
            min={6} max={12} step={1} riskDir="down"
            format={v => `${v} / 12 votes`}
            rangeLabel="6 votes — 12 votes (unanimous)"
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
            description="How often each bot evaluates — shorter intervals mean more frequent trading"
            value={config.cycle_interval_seconds}
            min={60} max={3600} step={60} riskDir="down"
            format={v => v >= 3600 ? '1 hr' : `${(v / 60).toFixed(0)} min`}
            rangeLabel="60 s — 60 min"
            onChange={v => { setIsDirty(true); setConfig(c => ({ ...c, cycle_interval_seconds: v })) }}
          />

          {/* Phase indicator — spans full width */}
          <div className="lg:col-span-2 pt-2 border-t border-dark-600 flex items-center gap-3">
            <span className="text-xs text-slate-500 uppercase tracking-widest">Phase</span>
            <span className={clsx('text-sm font-bold', {
              'text-emerald-400': status?.phase === 'LIVE',
              'text-yellow-400':  status?.phase === 'APPROVED_FOR_LIVE',
              'text-slate-400':   !status?.phase || status.phase === 'PAPER_ONLY' || status.phase === 'PAPER',
            })}>
              {status?.phase ? status.phase.replace(/_/g, ' ') : 'PAPER — no live strategies yet'}
            </span>
            <span className="text-xs text-slate-600 ml-auto">Changes take effect next evaluation cycle</span>
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