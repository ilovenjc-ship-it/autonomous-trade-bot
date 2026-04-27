import { useEffect, useState } from 'react'
import { useBotStore } from '@/store/botStore'
import { botApi } from '@/api/client'
import type { BotConfig } from '@/types'
import {
  Save, Settings as SettingsIcon, ArrowLeftRight, Clock,
  Globe, Hash, KeyRound, User, AlertTriangle, RefreshCw,
  FlaskConical, Wifi,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import PageHeroSlider from '@/components/PageHeroSlider'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtInterval(s: number): string {
  if (!s || s <= 0) return '—'
  if (s < 60)  return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1)} hr`
}

// ── field components ──────────────────────────────────────────────────────────
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-5">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-600 pb-3">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { status, fetchStatus } = useBotStore()
  const [config,       setConfig]       = useState<Partial<BotConfig>>({})
  const [saving,       setSaving]       = useState(false)
  const [resetArmed,   setResetArmed]   = useState(false)   // two-step confirm
  const [resetting,    setResetting]    = useState(false)

  useEffect(() => {
    botApi.getConfig().then(c => setConfig(c)).catch(console.error)
  }, [])

  const set = <K extends keyof BotConfig>(k: K, v: BotConfig[K]) =>
    setConfig(c => ({ ...c, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await botApi.updateConfig(config as Record<string, unknown>)
      toast.success('Configuration saved')
      await fetchStatus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      // Soft reset — clears trade history, keeps wallet + config
      await botApi.updateConfig({ _reset_trades: true } as Record<string, unknown>)
      toast.success('Trade history cleared')
      setResetArmed(false)
    } catch {
      toast.error('Reset failed — no data was changed')
    } finally {
      setResetting(false)
    }
  }

  const isMainnet    = (config.network ?? 'finney') === 'finney'
  const isRunning    = status?.is_running ?? false
  const simMode      = status?.simulation_mode ?? true
  const tradeInterval = config.trade_interval ?? 0

  const heroSlides = [
    {
      title: 'System Config', subtitle: 'Bot Settings', accent: 'blue' as const,
      stats: [
        { label: 'Trading',      value: isRunning ? 'Running' : 'Stopped',                 color: isRunning ? 'emerald' : 'red' as any },
        { label: 'Mode',         value: simMode ? 'Simulation' : 'LIVE',                  color: simMode ? 'yellow' : 'emerald' as any },
        { label: 'Network',      value: isMainnet ? 'Finney' : 'Testnet',                 color: isMainnet ? 'emerald' : 'yellow' as any },
        { label: 'Trade Every',  value: tradeInterval ? `${tradeInterval}s` : '300s',     color: 'slate'   as const },
        { label: 'Config',       value: saving ? 'Saving…' : 'Saved',                    color: saving ? 'yellow' : 'emerald' as any },
      ],
    },
    {
      title: 'Network Settings', subtitle: 'Bittensor Chain', accent: 'emerald' as const,
      stats: [
        { label: 'Endpoint',     value: 'Finney RPC',                                     color: 'white'   as const },
        { label: 'Chain',        value: 'Finney Mainnet',                                 color: 'emerald' as const },
        { label: 'Protocol',     value: 'WebSocket',                                      color: 'blue'    as const },
        { label: 'Timeout',      value: '35s',                                            color: 'slate'   as const },
        { label: 'Status',       value: isRunning ? '✓ Active' : '✗ Idle',              color: isRunning ? 'emerald' : 'slate' as any },
      ],
    },
    {
      title: 'Risk Parameters', subtitle: 'Trade Safety', accent: 'orange' as const,
      stats: [
        { label: 'Min Confidence', value: '—',                                                         color: 'purple' as const },
        { label: 'Max Position',   value: '—',                                                         color: 'orange' as const },
        { label: 'Sim Mode',       value: simMode ? 'ON' : 'OFF',                                  color: simMode ? 'yellow' : 'emerald' as any },
        { label: 'Reset Armed',    value: resetArmed ? 'YES' : 'No',                              color: resetArmed ? 'red' : 'slate' as any },
        { label: 'Resetting',      value: resetting ? 'Yes' : 'No',                              color: resetting ? 'yellow' : 'slate' as any },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-dark-700/60 bg-dark-900/80">
        <SettingsIcon size={18} className="text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-white leading-none">Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">Bot behaviour, trade sizing, network identity</p>
        </div>
      </div>
      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── Combined status / mode / save strip ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Trading mode pill */}
          <span className={clsx(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-[14px] font-mono font-semibold border',
            simMode
              ? 'bg-slate-700/60 text-slate-300 border-slate-600'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          )}>
            <FlaskConical size={11} />
            {simMode ? 'PAPER MODE — no real funds at risk' : 'LIVE MODE — real TAO executing'}
          </span>

          {/* Mainnet warning pill */}
          {isMainnet && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[14px] font-mono font-semibold border bg-amber-500/10 text-amber-400 border-amber-500/30">
              <AlertTriangle size={11} />
              FINNEY MAINNET — real money
            </span>
          )}

          {/* Bot-is-running — compact pill, matches badge height */}
          {isRunning && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-mono font-semibold border bg-yellow-500/10 text-yellow-400 border-yellow-500/25">
              <AlertTriangle size={10} />
              Bot is running — changes apply next cycle
            </span>
          )}

          {/* Save Config — right-anchored */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-accent-blue/15 border border-accent-blue/30 rounded-full text-accent-blue text-[14px] font-mono font-semibold hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        </div>

        {/* ── 3 sections in a row across full page width ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Trade Execution */}
          <Section title="Trade Execution">
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
          </Section>

          {/* Network & Identity */}
          <Section title="Network &amp; Identity">
            <FieldRow icon={Globe} label="Network"
              hint={isMainnet ? '⚠ Finney mainnet — real TAO, real consequences' : 'Safe testing environment — no real funds'}>
              <select
                value={config.network ?? 'finney'}
                onChange={e => set('network', e.target.value)}
                className={clsx('input w-full', isMainnet && 'border-amber-500/40 text-amber-400')}
              >
                <option value="finney">Finney (Mainnet) — real TAO</option>
                <option value="test">Testnet — no real funds</option>
                <option value="local">Local — development only</option>
              </select>
            </FieldRow>
            <FieldRow icon={Hash} label="Subnet UID (netuid)"
              hint="Bittensor subnet the bot stakes and trades on — SN0 is the root network">
              <NumberInput
                value={config.netuid} min={0} max={512} step={1}
                onChange={v => set('netuid', v)}
              />
            </FieldRow>
            <FieldRow icon={User} label="Wallet Name (coldkey)"
              hint="Name of the Bittensor coldkey wallet on disk">
              <input
                type="text"
                value={(config.wallet_name as string | undefined) ?? ''}
                onChange={e => set('wallet_name', e.target.value)}
                className="input w-full font-mono"
                placeholder="default"
              />
            </FieldRow>
            <FieldRow icon={KeyRound} label="Hotkey Name"
              hint="Hotkey associated with the coldkey — used for staking and voting">
              <input
                type="text"
                value={(config.wallet_hotkey as string | undefined) ?? ''}
                onChange={e => set('wallet_hotkey', e.target.value)}
                className="input w-full font-mono"
                placeholder="default"
              />
            </FieldRow>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-500/8 border border-blue-500/15 rounded-lg">
              <Wifi size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-[14px] text-blue-400/80 leading-snug">
                Stop-loss %, take-profit %, and consensus thresholds are managed on the{' '}
                <span className="font-semibold text-blue-400">Risk Config</span> page.
              </p>
            </div>
          </Section>

          {/* Danger Zone */}
          <div className="bg-dark-800 border border-red-500/20 rounded-xl p-5">
            <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-red-500/15 pb-3 mb-4">
              Danger Zone
            </h2>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Clears all trade history from the local database. Wallet, configuration, and strategy
              state are preserved. This action cannot be undone.
            </p>
            {!resetArmed ? (
              <button
                onClick={() => setResetArmed(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
              >
                <AlertTriangle size={13} />
                Reset All Trade Data
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 font-semibold">
                    This will permanently delete all trade history. Are you sure?
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-xs font-bold hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                  >
                    {resetting ? <RefreshCw size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                    {resetting ? 'Clearing…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => setResetArmed(false)}
                    className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-400 text-xs hover:text-white hover:border-dark-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>{/* end 3-col row */}
      </div>{/* end scrollable */}
    </div>
  )
}