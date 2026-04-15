import { useEffect, useState } from 'react'
import { useBotStore } from '@/store/botStore'
import { botApi } from '@/api/client'
import type { BotConfig } from '@/types'
import { Save, Settings as SettingsIcon } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const { status, fetchStatus } = useBotStore()
  const [config, setConfig] = useState<Partial<BotConfig>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    botApi.getConfig().then((c) => setConfig(c)).catch(console.error)
  }, [])

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

  const field = (
    key: keyof BotConfig,
    label: string,
    type: 'number' | 'text' = 'number',
    hint?: string
  ) => (
    <div>
      <label className="block text-xs text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        value={(config[key] as string | number | undefined) ?? ''}
        onChange={(e) =>
          setConfig((c) => ({
            ...c,
            [key]: type === 'number' ? parseFloat(e.target.value) : e.target.value,
          }))
        }
        className="input"
      />
      {hint && <p className="text-[10px] text-slate-300 mt-1">{hint}</p>}
    </div>
  )

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <SettingsIcon size={18} /> Settings
        </h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Config'}
        </button>
      </div>

      {status?.is_running && (
        <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-xs">
          ⚠ Bot is running. Settings will apply on the next trading cycle.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trading */}
        <div className="card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white border-b border-dark-600 pb-2">Trading</h2>
          {field('trade_amount', 'Trade Amount (TAO)', 'number', 'Amount of TAO per trade')}
          {field('max_trade_amount', 'Max Trade Amount (TAO)')}
          {field('min_trade_amount', 'Min Trade Amount (TAO)')}
          {field('trade_interval', 'Trade Interval (seconds)', 'number', 'Time between trading cycles')}
          {field('max_daily_trades', 'Max Daily Trades', 'number', 'Hard limit on trades per day')}
        </div>

        {/* Risk */}
        <div className="card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white border-b border-dark-600 pb-2">Risk Management</h2>
          {field('stop_loss_pct', 'Stop Loss %', 'number', 'Exit trade if loss exceeds this %')}
          {field('take_profit_pct', 'Take Profit %', 'number', 'Exit trade when profit reaches this %')}

          <h2 className="text-sm font-semibold text-white border-b border-dark-600 pb-2 pt-2">Network</h2>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Network</label>
            <select
              value={config.network ?? 'finney'}
              onChange={(e) => setConfig((c) => ({ ...c, network: e.target.value }))}
              className="input"
            >
              <option value="finney">Finney (Mainnet)</option>
              <option value="test">Testnet</option>
              <option value="local">Local</option>
            </select>
          </div>
          {field('netuid', 'Subnet UID (netuid)', 'number', 'Bittensor subnet ID')}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card p-4 border-accent-red/20">
        <h2 className="text-sm font-semibold text-accent-red mb-2">Danger Zone</h2>
        <p className="text-xs text-slate-300 mb-3">
          These actions are irreversible. Resetting clears all trade history from the local database.
        </p>
        <button
          className="btn-danger text-xs px-3 py-1.5 opacity-70 hover:opacity-100"
          onClick={() => toast.error('Reset is disabled in this build for safety.')}
        >
          Reset All Trade Data
        </button>
      </div>
    </div>
  )
}