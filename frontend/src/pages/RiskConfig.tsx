import { useEffect, useState, useCallback } from 'react'
import { AlertOctagon, CheckCircle2, RefreshCw, ShieldAlert, Zap, BarChart2, TrendingDown, Layers } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import toast from 'react-hot-toast'

// ── types ─────────────────────────────────────────────────────────────────────
interface Config {
  max_drawdown_pct: number
  stop_loss_pct: number
  take_profit_pct: number
  max_position_size_pct: number
  max_concurrent_positions: number
  daily_loss_circuit_breaker_pct: number
  min_confidence_score: number
  consensus_threshold: number
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
  consensus_threshold: 0.45,
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
        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
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
      <div className="flex justify-between text-[9px] font-mono text-slate-600">
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
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">{label}</p>
        <p className={clsx('text-sm font-bold font-mono',
          danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-emerald-400')}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function RiskConfig() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [status, setStatus] = useState<RiskStatus | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [halting, setHalting] = useState(false)

  const fetchConfig = useCallback(async () => {
    const [cfgRes, stRes] = await Promise.allSettled([
      api.get('/fleet/risk/config').then(r => r.data),
      api.get('/fleet/risk/status').then(r => r.data),
    ])
    if (cfgRes.status === 'fulfilled' && cfgRes.value && typeof cfgRes.value.max_drawdown_pct === 'number')
      setConfig(cfgRes.value)
    if (stRes.status === 'fulfilled' && stRes.value)
      setStatus(stRes.value)
  }, [])

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
      await fetchConfig()
    } catch {
      toast.error('Failed to apply configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => { setConfig(DEFAULTS); toast.success('Reset to defaults') }

  const handleHalt = async () => {
    setHalting(true)
    try {
      await api.post('/fleet/risk/halt')
      toast.error('⛔ Global halt activated — all trading suspended')
      await fetchConfig()
    } catch { toast.error('Failed to activate halt') }
    finally { setHalting(false) }
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
    <div className="p-6 space-y-6 overflow-y-auto bg-[#080d18] min-h-full text-slate-100 font-mono">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">
            Risk Configuration
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pre-trade guardrails — set once, all 12 bots operate autonomously within these limits
          </p>
        </div>
        <button
          onClick={handleHalt} disabled={halting || isHalted}
          className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-red-500/15 border border-red-500/40 rounded-xl text-red-400 text-sm font-bold hover:bg-red-500/25 disabled:opacity-50 transition-colors"
        >
          <AlertOctagon size={15} />
          Emergency Halt
        </button>
      </div>

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
            Running normally · drawdown {drawdown.toFixed(1)}% of {config.max_drawdown_pct}% limit
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
          value={`${drawdown.toFixed(1)}%`}
          sub={`${drawdownPct.toFixed(0)}% of ${config.max_drawdown_pct}% limit`}
          danger={drawdownPct >= 80}
          warn={drawdownPct >= 50}
        />
        <StatusCard
          icon={BarChart2}
          label="Daily Loss"
          value={`${dailyLoss.toFixed(1)}%`}
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
            onChange={v => setConfig(c => ({ ...c, max_drawdown_pct: v }))}
          />
          <RiskSlider
            label="Stop Loss"
            description="Per-trade exit if position drops this far — lower value = tighter protection"
            value={config.stop_loss_pct}
            min={0.5} max={20} step={0.5} riskDir="down"
            format={v => `${v.toFixed(1)}%`}
            rangeLabel="0.5% — 20%"
            onChange={v => setConfig(c => ({ ...c, stop_loss_pct: v }))}
          />
          <RiskSlider
            label="Take Profit"
            description="Per-trade target — position closes and locks gain when hit"
            value={config.take_profit_pct}
            min={1} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="1% — 50%"
            onChange={v => setConfig(c => ({ ...c, take_profit_pct: v }))}
          />
          <RiskSlider
            label="Max Position Size"
            description="Maximum % of portfolio per single trade — limits concentration risk"
            value={config.max_position_size_pct}
            min={1} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="1% — 50%"
            onChange={v => setConfig(c => ({ ...c, max_position_size_pct: v }))}
          />
          <RiskSlider
            label="Max Concurrent Positions"
            description="How many open trades can coexist across all 12 bots simultaneously"
            value={config.max_concurrent_positions}
            min={1} max={20} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}`}
            rangeLabel="1 — 20"
            onChange={v => setConfig(c => ({ ...c, max_concurrent_positions: v }))}
          />
          <RiskSlider
            label="Daily Circuit Breaker"
            description="Daily portfolio loss % that halts all trading for the rest of the day"
            value={config.daily_loss_circuit_breaker_pct}
            min={2} max={50} step={1} riskDir="up"
            format={v => `${v.toFixed(0)}%`}
            rangeLabel="2% — 50%"
            onChange={v => setConfig(c => ({ ...c, daily_loss_circuit_breaker_pct: v }))}
          />
          <RiskSlider
            label="Min AI Confidence"
            description="Minimum confidence score required — lower value accepts weaker signals"
            value={config.min_confidence_score}
            min={0.4} max={0.95} step={0.05} riskDir="down"
            format={v => v.toFixed(2)}
            rangeLabel="0.40 — 0.95"
            onChange={v => setConfig(c => ({ ...c, min_confidence_score: v }))}
          />
          <RiskSlider
            label="OpenClaw Consensus"
            description="Bot agreement % required — lower means fewer bots need to agree"
            value={config.consensus_threshold}
            min={0.4} max={0.9} step={0.05} riskDir="down"
            format={v => `${(v * 100).toFixed(0)}%  (${Math.ceil(v * 12)}/12 bots)`}
            rangeLabel="40% — 90%"
            onChange={v => setConfig(c => ({ ...c, consensus_threshold: v }))}
          />
          <RiskSlider
            label="Cycle Interval"
            description="How often each bot evaluates — shorter intervals mean more frequent trading"
            value={config.cycle_interval_seconds}
            min={60} max={3600} step={60} riskDir="down"
            format={v => v >= 3600 ? '1 hr' : `${(v / 60).toFixed(0)} min`}
            rangeLabel="60 s — 60 min"
            onChange={v => setConfig(c => ({ ...c, cycle_interval_seconds: v }))}
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
      <div className="flex gap-4 pb-6">
        <button
          onClick={handleApply} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-400 text-sm font-bold hover:bg-emerald-500/25 disabled:opacity-50 transition-colors tracking-wider"
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
    </div>
  )
}