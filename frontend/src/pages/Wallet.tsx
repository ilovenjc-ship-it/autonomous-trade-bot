import { useState } from 'react'
import { useBotStore } from '@/store/botStore'
import { botApi } from '@/api/client'
import { Wallet as WalletIcon, Zap, Activity, Copy, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function WalletPage() {
  const { status, fetchStatus } = useBotStore()
  const [form, setForm] = useState({
    wallet_name: 'default',
    wallet_hotkey: 'default',
    wallet_path: '~/.bittensor/wallets',
    network: 'finney',
  })
  const [busy, setBusy] = useState(false)

  const handleConnect = async () => {
    setBusy(true)
    try {
      const result = await botApi.connectWallet(form)
      if (result.success) {
        toast.success('Wallet connected!')
        await fetchStatus()
      } else {
        toast.error(result.message)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    await botApi.disconnectWallet()
    toast.success('Wallet disconnected')
    await fetchStatus()
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold text-white">Wallet</h1>

      {/* Status card */}
      <div className={clsx(
        'card p-4 border',
        status?.wallet_connected ? 'border-accent-green/30' : 'border-dark-600'
      )}>
        <div className="flex items-center gap-3 mb-4">
          <div className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            status?.wallet_connected ? 'bg-accent-green/10' : 'bg-dark-700'
          )}>
            <WalletIcon size={18} className={status?.wallet_connected ? 'text-accent-green' : 'text-slate-500'} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {status?.wallet_connected ? 'Wallet Connected' : 'No Wallet Connected'}
            </p>
            <p className="text-xs text-slate-500">
              {status?.network_connected ? `Connected to ${status.network}` : 'Not connected to network'}
            </p>
          </div>
        </div>

        {status?.wallet_connected && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2 bg-dark-700 rounded-lg">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Coldkey</p>
                <p className="text-xs font-mono text-slate-300 truncate max-w-[250px]">
                  {status.coldkey_address ?? '—'}
                </p>
              </div>
              {status.coldkey_address && (
                <button onClick={() => copy(status.coldkey_address!)} className="text-slate-500 hover:text-white">
                  <Copy size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-dark-700 rounded-lg">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Hotkey</p>
                <p className="text-xs font-mono text-slate-300 truncate max-w-[250px]">
                  {status.hotkey_address ?? '—'}
                </p>
              </div>
              {status.hotkey_address && (
                <button onClick={() => copy(status.hotkey_address!)} className="text-slate-500 hover:text-white">
                  <Copy size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-dark-700 rounded-lg">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Balance</p>
                <p className="text-sm font-mono text-white font-semibold">
                  {status.wallet_balance?.toFixed(4)} TAO
                  {status.current_price && (
                    <span className="text-slate-500 font-normal ml-2 text-xs">
                      ≈ ${(status.wallet_balance * status.current_price).toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
              <Zap size={16} className="text-accent-yellow" />
            </div>
          </div>
        )}

        {status?.wallet_connected && (
          <button onClick={handleDisconnect} className="mt-3 btn-secondary text-xs">
            Disconnect Wallet
          </button>
        )}
      </div>

      {/* Connect form */}
      {!status?.wallet_connected && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-4">Connect Bittensor Wallet</h2>
          <div className="space-y-3">
            {[
              { key: 'wallet_name', label: 'Wallet Name', placeholder: 'default' },
              { key: 'wallet_hotkey', label: 'Hotkey Name', placeholder: 'default' },
              { key: 'wallet_path', label: 'Wallet Path', placeholder: '~/.bittensor/wallets' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input
                  type="text"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="input"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Network</label>
              <select
                value={form.network}
                onChange={(e) => setForm((f) => ({ ...f, network: e.target.value }))}
                className="input"
              >
                <option value="finney">Finney (Mainnet)</option>
                <option value="test">Testnet</option>
                <option value="local">Local</option>
              </select>
            </div>
          </div>
          <button onClick={handleConnect} disabled={busy} className="mt-4 btn-primary w-full">
            {busy ? 'Connecting…' : 'Connect Wallet'}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            ⚠ Your wallet keys never leave this machine. The bot connects locally to the Bittensor SDK.
          </p>
        </div>
      )}

      {/* Network info */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Activity size={14} className="text-accent-blue" /> Network
        </h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { label: 'Network', value: status?.network ?? '—' },
            { label: 'Netuid', value: status?.netuid ?? '—' },
            { label: 'Connected', value: status?.network_connected ? 'Yes' : 'No' },
            { label: 'Simulation', value: status?.simulation_mode ? 'ON' : 'OFF' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between px-3 py-2 bg-dark-700 rounded-lg">
              <span className="text-slate-500">{label}</span>
              <span className="font-mono text-white">{String(value)}</span>
            </div>
          ))}
        </div>
        <a
          href="https://taostats.io"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1 text-xs text-accent-blue hover:underline"
        >
          View on Taostats <ExternalLink size={10} />
        </a>
      </div>
    </div>
  )
}