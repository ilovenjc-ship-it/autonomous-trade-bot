import { useState, useEffect } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, AlertTriangle, CheckCircle2, RefreshCw, Eye, EyeOff, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

const TARGET_ADDRESS = '5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L'

function AddrBox({ label, addr }: { label: string; addr: string }) {
  const copy = () => { navigator.clipboard.writeText(addr); toast.success('Copied!') }
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-mono text-slate-200 truncate flex-1">{addr}</p>
        <button onClick={copy} className="text-slate-500 hover:text-white flex-shrink-0"><Copy size={13} /></button>
        <a href={`https://taostats.io/account/${addr}`} target="_blank" rel="noopener noreferrer"
          className="text-slate-500 hover:text-accent-blue flex-shrink-0"><ExternalLink size={13} /></a>
      </div>
    </div>
  )
}

export default function WalletPage() {
  const [botStatus, setBotStatus] = useState<any>(null)
  const [words, setWords]         = useState<string[]>(Array(12).fill(''))
  const [showWords, setShowWords] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [saved, setSaved]         = useState(false)

  useEffect(() => {
    api.get('/bot/status').then(r => setBotStatus(r.data)).catch(() => {})
  }, [])

  const wordCount = words.filter(w => w.trim()).length
  const mnemonicOk = wordCount === 12

  const handleWordChange = (i: number, val: string) => {
    // Support pasting full mnemonic into first box
    if (i === 0 && val.trim().split(/\s+/).length >= 12) {
      const parts = val.trim().split(/\s+/).slice(0, 12)
      setWords([...parts, ...Array(12 - parts.length).fill('')])
      return
    }
    const next = [...words]
    next[i] = val.toLowerCase().trim()
    setWords(next)
  }

  const handleSaveMnemonic = async () => {
    if (!mnemonicOk) { toast.error('Enter all 12 words first'); return }
    setBusy(true)
    try {
      const phrase = words.join(' ')
      await api.post('/bot/wallet/save-mnemonic', { mnemonic: phrase })
      setSaved(true)
      toast.success('Mnemonic saved — wallet will be loaded when Bittensor library is available')
    } catch {
      toast.error('Failed to save mnemonic')
    } finally {
      setBusy(false)
    }
  }

  const clearWords = () => { setWords(Array(12).fill('')); setSaved(false) }

  const price = botStatus?.current_price ?? 0

  return (
    <div className="p-6 space-y-5 max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <WalletIcon size={22} className="text-accent-blue" /> Wallet
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Bittensor Finney mainnet · Coldkey management
        </p>
      </div>

      {/* ── Simulation warning ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl">
        <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-yellow-300 font-semibold">Simulation Mode Active</p>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            All trades are paper trades. No real TAO will move until the Bittensor library
            is installed and a wallet is connected. Save your mnemonic below to restore when ready.
          </p>
        </div>
      </div>

      {/* ── Known address ──────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={15} className="text-accent-green" /> Target Wallet Address
        </h2>
        <AddrBox label="Coldkey (SS58)" addr={TARGET_ADDRESS} />
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Balance</p>
            <p className="text-white font-mono font-semibold">
              {botStatus?.wallet_balance ? `${botStatus.wallet_balance.toFixed(4)} τ` : '—'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Network</p>
            <p className="text-white font-mono">Finney</p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Status</p>
            <p className={clsx('font-mono font-semibold',
              botStatus?.wallet_connected ? 'text-accent-green' : 'text-yellow-400')}>
              {botStatus?.wallet_connected ? 'Connected' : 'Simulation'}
            </p>
          </div>
        </div>
        <a
          href={`https://taostats.io/account/${TARGET_ADDRESS}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-accent-blue hover:underline font-mono"
        >
          <ExternalLink size={11} /> View on Taostats.io
        </a>
      </div>

      {/* ── Mnemonic restore ───────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound size={15} className="text-accent-blue" /> Mnemonic Phrase Restore
          </h2>
          <button
            onClick={() => setShowWords(!showWords)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-mono"
          >
            {showWords ? <EyeOff size={12} /> : <Eye size={12} />}
            {showWords ? 'Hide' : 'Show'}
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Enter your 12-word BIP39 mnemonic. You can paste the full phrase into any word box.
          Words are stored encrypted and only used locally.
        </p>

        {/* 12-word grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
          {words.map((w, i) => (
            <div key={i} className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono select-none">
                {i + 1}.
              </span>
              <input
                type={showWords ? 'text' : 'password'}
                value={w}
                onChange={e => handleWordChange(i, e.target.value)}
                placeholder={`word ${i + 1}`}
                className="w-full pl-6 pr-2 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-accent-blue"
              />
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all"
              style={{ width: `${(wordCount / 12) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-slate-400">{wordCount}/12</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveMnemonic}
            disabled={!mnemonicOk || busy || saved}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border flex-1',
              mnemonicOk && !saved
                ? 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/30'
                : 'bg-dark-700 text-slate-500 border-dark-600 cursor-not-allowed'
            )}
          >
            {saved ? <CheckCircle2 size={14} /> : busy ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {saved ? 'Mnemonic Saved' : busy ? 'Saving…' : 'Save Mnemonic'}
          </button>
          <button
            onClick={clearWords}
            className="px-3 py-2 rounded-lg text-xs text-slate-500 border border-dark-600 hover:text-white hover:border-dark-400 transition-colors"
          >
            Clear
          </button>
        </div>

        {saved && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-xs text-accent-green font-mono">
            <CheckCircle2 size={12} />
            Mnemonic stored. Will be loaded automatically when Bittensor library is installed.
          </div>
        )}
      </div>

      {/* ── Network status ─────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Zap size={15} className="text-yellow-400" /> Network Status
        </h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Network',    val: 'Finney (Mainnet)' },
            { label: 'TAO Price',  val: price ? `$${price.toFixed(2)}` : '—' },
            { label: 'Wallet',     val: botStatus?.wallet_connected ? '✅ Connected' : '⚪ Simulation' },
            { label: 'Node',       val: botStatus?.network_connected ? '✅ Online' : '⚪ Not connected' },
          ].map(({ label, val }) => (
            <div key={label} className="flex justify-between items-center px-3 py-2 bg-dark-700 rounded-lg">
              <span className="text-slate-500">{label}</span>
              <span className="font-mono text-slate-200">{val}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 mt-4 font-mono">
          Install bittensor: pip install bittensor==6.9.3 · Requires Python 3.11+
        </p>
      </div>

    </div>
  )
}