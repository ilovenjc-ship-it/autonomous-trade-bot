/**
 * TradeExecutionSettings — Session XXVI: relocated from Settings → Trades page bottom.
 *
 * Self-contained: fetches current BotConfig, lets the operator tune the trade
 * execution parameters, and saves back. Shows a Save bar with live-running
 * warning. Safe to drop anywhere.
 */

import { useEffect, useState } from 'react'
import { useBotStore } from '@/store/botStore'
import { botApi } from '@/api/client'
import type { BotConfig } from '@/types'
import {
  Save, ArrowLeftRight, Clock, Hash, AlertTriangle, Settings as SettingsIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtInterval(s: number): string {
  if (!s || s <= 0) return '—'
  if (s < 60)  return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1)} hr`
}

function FieldRow({
  icon: Icon, label, hint, children,
}: {
  icon: React.ElementType; label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-6 p-1.5 rounded-lg bg-dark-700 border border-dark-600 flex-shrink-0">
        <Icon size={13} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>
        {children}
        {hint && <p className="text-[13px] text-slate-500 mt-1 leading-snug">{hint}</p>}
      </div>
    </div>
  )
}

function NumberInput({
  value, onChange, min, max, step, suffix,
}: {
  value: number | undefined; onChange: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value ?? ''}
        min={min} max={max} step={step ?? 'any'}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="input w-full pr-12"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-500 font-mono pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function TradeExecutionSettings() {
  const { status, fetchStatus } = useBotStore()
  const [config, setConfig] = useState<Partial<BotConfig>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    botApi.getConfig().then(c => setConfig(c)).catch(console.error)
  }, [])

  const set = <K extends keyof BotConfig>(k: K, v: BotConfig[K]) =>
    setConfig(c => ({ ...c, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await botApi.updateConfig(config as Record<string, unknown>)
      toast.success('Trade execution settings saved')
      await fetchStatus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isRunning    = status?.is_running ?? false
  const tradeInterval = config.trade_interval ?? 0

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-5">
      {/* Header + Save */}
      <div className="flex items-center gap-2 border-b border-dark-600 pb-3">
        <SettingsIcon size={14} className="text-slate-400" />
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Trade Execution</h2>
        {isRunning && (
          <span className="ml-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border bg-yellow-500/10 text-yellow-400 border-yellow-500/25">
            <AlertTriangle size={10} />
            Bot is running — changes apply next cycle
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-accent-blue/15 border border-accent-blue/30 rounded-full text-accent-blue text-[14px] font-mono font-semibold hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
        >
          <Save size={12} />
          {saving ? 'Saving…' : 'Save Config'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FieldRow icon={ArrowLeftRight} label="Trade Amount (TAO)"
          hint="Default TAO amount placed per individual trade">
          <NumberInput
            value={config.trade_amount} min={0.001} max={100} step={0.001} suffix="τ"
            onChange={v => set('trade_amount', v)}
          />
        </FieldRow>
        <FieldRow icon={ArrowLeftRight} label="Max Trade Amount (TAO)"
          hint="Hard ceiling — no single trade can exceed this regardless of signal strength">
          <NumberInput
            value={config.max_trade_amount} min={0.001} max={1000} step={0.001} suffix="τ"
            onChange={v => set('max_trade_amount', v)}
          />
        </FieldRow>
        <FieldRow icon={ArrowLeftRight} label="Min Trade Amount (TAO)"
          hint="Trades smaller than this are skipped — prevents dust transactions">
          <NumberInput
            value={config.min_trade_amount} min={0.0001} max={10} step={0.0001} suffix="τ"
            onChange={v => set('min_trade_amount', v)}
          />
        </FieldRow>
        <FieldRow icon={Clock} label="Trade Interval (seconds)"
          hint={`How long each bot waits between evaluation cycles${tradeInterval > 0 ? ` — currently ${fmtInterval(tradeInterval)}` : ''}`}>
          <NumberInput
            value={config.trade_interval} min={60} max={86400} step={60} suffix="s"
            onChange={v => set('trade_interval', v)}
          />
        </FieldRow>
        <FieldRow icon={Hash} label="Max Daily Trades"
          hint="Hard limit on total executions across all 12 bots per day">
          <NumberInput
            value={config.max_daily_trades} min={1} max={500} step={1}
            onChange={v => set('max_daily_trades', v)}
          />
        </FieldRow>
      </div>
    </div>
  )
}