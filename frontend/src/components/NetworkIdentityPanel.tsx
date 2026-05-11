/**
 * Network & Identity panel — relocated from Settings → Wallet (Session XXV spec).
 * Self-contained: reads/writes bot config via botApi.
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { botApi } from '@/api/client'
import type { BotConfig } from '@/types'
import { Globe, Hash, KeyRound, User, Wifi, Save } from 'lucide-react'

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
  value, onChange, min, max, step,
}: {
  value: number | undefined; onChange: (v: number) => void
  min?: number; max?: number; step?: number
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min} max={max} step={step ?? 'any'}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="input w-full"
    />
  )
}

export default function NetworkIdentityPanel() {
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
      toast.success('Network config saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isMainnet = (config.network ?? 'finney') === 'finney'

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-dark-600 pb-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Network &amp; Identity
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-1 bg-accent-blue/15 border border-accent-blue/30 rounded-full text-accent-blue text-[13px] font-mono font-semibold hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
        >
          <Save size={11} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

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
    </div>
  )
}