import { useEffect, useState, useCallback } from 'react'
import { AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import toast from 'react-hot-toast'

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

interface SliderProps {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
  rangeLabel?: string
}

function RiskSlider({ label, description, value, min, max, step, format, onChange, rangeLabel }: SliderProps) {
  const fmt = format || ((v: number) => v.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) + (label.includes('%') ? '%' : ''))
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-slate-300">{label}</span>
          <span className="ml-3 text-sm font-bold text-emerald-400">{fmt(value)}</span>
        </div>
        <span className="text-[9px] text-slate-300 font-mono">{rangeLabel || `${min}% — ${max}%`}</span>
      </div>
      <p className="text-[10px] text-slate-300">{description}</p>
      <div className="relative">
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_6px_#34d399]"
          style={{
            background: `linear-gradient(to right, #34d399 0%, #34d399 ${pct}%, #1e293b ${pct}%, #1e293b 100%)`
          }}
        />
      </div>
    </div>
  )
}

export default function RiskConfig() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [status, setStatus] = useState<RiskStatus | null>(null)
  const [saving, setSaving] = useState(false)
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
    // Auto-refresh risk status every 5 s — circuit breaker, drawdown, halt can change at any time
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

  const handleReset = () => {
    setConfig(DEFAULTS)
    toast.success('Reset to defaults')
  }

  const handleHalt = async () => {
    setHalting(true)
    try {
      await api.post('/fleet/risk/halt')
      toast.error('⛔ Global halt activated — all trading suspended')
      await fetchConfig()
    } catch {
      toast.error('Failed to activate halt')
    } finally {
      setHalting(false)
    }
  }

  const handleRelease = async () => {
    try {
      await api.post('/fleet/risk/release')
      toast.success('Trading resumed')
      await fetchConfig()
    } catch {}
  }

  const isHalted = status?.global_halt || false
  const drawdown = status?.drawdown_pct || 0

  return (
    <div className="flex h-full bg-[#080d18] text-slate-100 font-mono overflow-hidden">

      {/* Left: Config sliders */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">RISK CONFIGURATION</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">Pre-trade guardrails — set once, bot operates autonomously within these limits</p>
            </div>
            <button onClick={handleHalt} disabled={halting || isHalted}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/15 border border-red-500/40 rounded text-red-400 text-[11px] font-bold hover:bg-red-500/25 disabled:opacity-50 transition-colors">
              <AlertOctagon size={13} />
              Emergency Halt
            </button>
          </div>

          {/* Trading status banner */}
          <div className={clsx('mt-3 flex items-center gap-3 px-4 py-2 rounded-lg border', {
            'bg-emerald-500/10 border-emerald-500/30': !isHalted,
            'bg-red-500/10 border-red-500/30': isHalted,
          })}>
            <div className={clsx('w-2 h-2 rounded-full', isHalted ? 'bg-red-400' : 'bg-emerald-400 animate-pulse')} />
            <span className={clsx('text-xs font-bold', isHalted ? 'text-red-400' : 'text-emerald-400')}>
              {isHalted ? '⛔ TRADING HALTED' : '✓ TRADING ACTIVE'}
            </span>
            {!isHalted && status && (
              <span className="text-[11px] text-slate-300">
                Running normally · drawdown {drawdown.toFixed(1)}% of {config.max_drawdown_pct}% limit
              </span>
            )}
            {isHalted && (
              <button onClick={handleRelease} className="ml-auto text-[10px] text-emerald-400 hover:text-emerald-300 underline">
                Release halt
              </button>
            )}
          </div>
        </div>

        {/* Sliders */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl space-y-6">
            <div>
              <h3 className="text-[9px] text-slate-300 uppercase tracking-widest mb-4">Autonomous Guardrails</h3>
              <div className="space-y-6">
                <RiskSlider
                  label="Max Drawdown %"
                  description="% Portfolio drop that triggers global HALT"
                  value={config.max_drawdown_pct}
                  min={5} max={50} step={1}
                  format={v => `${v.toFixed(0)}%`}
                  rangeLabel="5% — 50%"
                  onChange={v => setConfig(c => ({ ...c, max_drawdown_pct: v }))}
                />
                <RiskSlider
                  label="Stop Loss %"
                  description="Per-trade stop-loss as % of position"
                  value={config.stop_loss_pct}
                  min={0.5} max={20} step={0.5}
                  format={v => `${v.toFixed(1)}%`}
                  rangeLabel="0.5% — 20%"
                  onChange={v => setConfig(c => ({ ...c, stop_loss_pct: v }))}
                />
                <RiskSlider
                  label="Take Profit %"
                  description="Per-trade take-profit as % of position"
                  value={config.take_profit_pct}
                  min={1} max={50} step={1}
                  format={v => `${v.toFixed(0)}%`}
                  rangeLabel="1% — 50%"
                  onChange={v => setConfig(c => ({ ...c, take_profit_pct: v }))}
                />
                <RiskSlider
                  label="Max Position Size %"
                  description="Maximum % of portfolio per trade"
                  value={config.max_position_size_pct}
                  min={1} max={50} step={1}
                  format={v => `${v.toFixed(0)}%`}
                  rangeLabel="1% — 50%"
                  onChange={v => setConfig(c => ({ ...c, max_position_size_pct: v }))}
                />
                <RiskSlider
                  label="Max Concurrent Positions"
                  description="Max number of open trades at once"
                  value={config.max_concurrent_positions}
                  min={1} max={20} step={1}
                  format={v => `${v.toFixed(0)}`}
                  rangeLabel="1 — 20"
                  onChange={v => setConfig(c => ({ ...c, max_concurrent_positions: v }))}
                />
                <RiskSlider
                  label="Daily Circuit Breaker %"
                  description="Daily portfolio drop % that halts all trading"
                  value={config.daily_loss_circuit_breaker_pct}
                  min={2} max={50} step={1}
                  format={v => `${v.toFixed(0)}%`}
                  rangeLabel="2% — 50%"
                  onChange={v => setConfig(c => ({ ...c, daily_loss_circuit_breaker_pct: v }))}
                />
                <RiskSlider
                  label="Min AI Confidence"
                  description="Minimum confidence score to execute a trade"
                  value={config.min_confidence_score}
                  min={0.4} max={0.95} step={0.05}
                  format={v => v.toFixed(2)}
                  rangeLabel="0.4 — 0.95"
                  onChange={v => setConfig(c => ({ ...c, min_confidence_score: v }))}
                />
                <RiskSlider
                  label="OpenClaw Consensus Threshold"
                  description="Minimum fraction of bots that must agree direction for trade approval"
                  value={config.consensus_threshold}
                  min={0.4} max={0.9} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}% (${Math.ceil(v * 12)}/12 bots)`}
                  rangeLabel="0.40 — 0.90"
                  onChange={v => setConfig(c => ({ ...c, consensus_threshold: v }))}
                />
                <RiskSlider
                  label="Cycle Interval (seconds)"
                  description="How often each strategy bot evaluates and potentially trades"
                  value={config.cycle_interval_seconds}
                  min={60} max={3600} step={60}
                  format={v => v >= 3600 ? '1 hr' : v >= 60 ? `${v / 60} min` : `${v}s`}
                  rangeLabel="60s — 3600s"
                  onChange={v => setConfig(c => ({ ...c, cycle_interval_seconds: v }))}
                />
              </div>
            </div>

            {/* Apply / Reset */}
            <div className="flex gap-3 pt-2">
              <button onClick={handleApply} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
                <CheckCircle2 size={13} />
                {saving ? 'Applying…' : '⊙ Apply Configuration'}
              </button>
              <button onClick={handleReset}
                className="px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-300 text-[11px] hover:text-white hover:border-slate-600 transition-colors">
                <RefreshCw size={11} className="inline mr-1.5" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Risk Status */}
      <div className="w-72 flex-shrink-0 border-l border-slate-800/60 flex flex-col overflow-y-auto">

        {/* Live risk status */}
        <div className="p-4 border-b border-slate-800/60">
          <h3 className="text-[9px] text-slate-300 uppercase tracking-widest mb-3">Live Risk Status</h3>
          <div className="space-y-2">
            {[
              { label: 'Global HALT', value: isHalted ? 'ACTIVE' : 'CLEAR', danger: isHalted },
              { label: 'Circuit Breaker', value: status?.circuit_breaker ? 'TRIGGERED' : 'CLEAR', danger: status?.circuit_breaker },
            ].map(({ label, value, danger }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-slate-800/40">
                <span className="text-[10px] text-slate-300">{label}</span>
                <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded', danger ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/10 text-emerald-500')}>
                  {value}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1 border-b border-slate-800/40">
              <span className="text-[10px] text-slate-300">Drawdown</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', drawdown > 35 ? 'bg-red-500' : drawdown > 20 ? 'bg-yellow-500' : 'bg-emerald-500')}
                    style={{ width: `${(drawdown / config.max_drawdown_pct) * 100}%` }} />
                </div>
                <span className={clsx('text-[10px] font-bold', drawdown > 35 ? 'text-red-400' : 'text-slate-300')}>
                  {drawdown.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/40">
              <span className="text-[10px] text-slate-300">Daily Loss</span>
              <span className="text-[10px] text-slate-300">{(status?.daily_loss_pct || 0).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[10px] text-slate-300">Open Positions</span>
              <span className="text-[10px] text-slate-300">{status?.open_positions || 0} / {status?.max_positions || config.max_concurrent_positions}</span>
            </div>
          </div>
        </div>

        {/* Open positions */}
        <div className="p-4 border-b border-slate-800/60">
          <h3 className="text-[9px] text-slate-300 uppercase tracking-widest mb-3">
            Open Positions ({status?.open_positions || 0} / {status?.max_positions || config.max_concurrent_positions})
          </h3>
          {(status?.open_positions || 0) === 0 ? (
            <div className="text-center py-4 text-[11px] text-slate-500 italic">
              No open positions
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic">
              Position detail available once LIVE strategies are deployed.
            </div>
          )}
        </div>

        {/* System info */}
        <div className="p-4">
          <h3 className="text-[9px] text-slate-300 uppercase tracking-widest mb-3">System Info</h3>
          <div className="space-y-1 text-[10px] text-slate-300">
            <div>
              <span className="text-slate-500">▶ Phase: </span>
              <span className={clsx('font-bold', {
                'text-emerald-400': status?.phase === 'LIVE',
                'text-yellow-400':  status?.phase === 'APPROVED_FOR_LIVE',
                'text-slate-300':   !status?.phase || status.phase === 'PAPER_ONLY' || status.phase === 'PAPER',
              })}>
                {status?.phase
                  ? status.phase.replace(/_/g, ' ')
                  : 'PAPER — no live strategies yet'}
              </span>
            </div>
            <div className="mt-2 leading-relaxed text-slate-400">
              All 12 strategy bots run within these guardrails.<br />
              Circuit breaker + drawdown limits enforced each cycle.<br />
              Changes take effect from the next evaluation cycle.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}