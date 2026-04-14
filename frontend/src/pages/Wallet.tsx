import { useState, useEffect, useCallback } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, AlertTriangle, CheckCircle2, RefreshCw, Eye, EyeOff, Zap,
  Link, Database, Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

const TARGET_ADDRESS = '5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L'

interface ChainInfo {
  address:     string
  balance_tao: number | null
  block:       number | null
  network:     string
  connected:   boolean
  timestamp:   string | null
  wallet_loaded: boolean
  error?:      string
}

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
  const [chainInfo,  setChainInfo]  = useState<ChainInfo | null>(null)
  const [words,      setWords]      = useState<string[]>(Array(12).fill(''))
  const [showWords,  setShowWords]  = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [querying,   setQuerying]   = useState(false)

  // Load cached wallet status on mount
  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/wallet/status')
      setChainInfo(await r.json())
    } catch {}
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Query live chain (slower — hits Finney)
  const queryChain = async () => {
    setQuerying(true)
    try {
      const r = await fetch('/api/wallet/chain')
      const data: ChainInfo = await r.json()
      setChainInfo(data)
      if (data.connected) {
        toast.success(`Chain queried ✅ Block #${data.block?.toLocaleString()}`)
      } else {
        toast.error('Chain unreachable — using cached data')
      }
    } catch (e) {
      toast.error('Chain query failed')
    } finally {
      setQuerying(false)
    }
  }

  const wordCount = words.filter(w => w.trim()).length
  const mnemonicOk = wordCount === 12

  const handleWordChange = (i: number, val: string) => {
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
      // Use new /api/wallet/mnemonic endpoint which uses bittensor 10.x
      const r    = await fetch('/api/wallet/mnemonic', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mnemonic: phrase }),
      })
      const data = await r.json()
      if (data.success) {
        setSaved(true)
        if (data.chain) setChainInfo(data.chain)
        toast.success(`✅ Wallet restored — ${data.address?.slice(0, 16)}…`)
      } else {
        toast.error(data.error ?? 'Mnemonic restore failed')
      }
    } catch {
      toast.error('Failed to restore wallet')
    } finally {
      setBusy(false)
    }
  }

  const clearWords = () => { setWords(Array(12).fill('')); setSaved(false) }

  const isConnected = chainInfo?.connected ?? false
  const balance     = chainInfo?.balance_tao
  const block       = chainInfo?.block

  return (
    <div className="p-6 space-y-5 max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <WalletIcon size={22} className="text-accent-blue" /> Wallet
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Bittensor Finney mainnet · Coldkey management
          </p>
        </div>
        <button
          onClick={queryChain}
          disabled={querying}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/25 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={querying ? 'animate-spin' : ''} />
          {querying ? 'Querying…' : 'Query Chain'}
        </button>
      </div>

      {/* ── Chain status ───────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border font-mono text-xs',
        isConnected
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-dark-800 border-dark-600',
      )}>
        <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0',
          isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600')} />
        <span className={isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
          {isConnected ? '⛓ FINNEY MAINNET CONNECTED' : '○ CHAIN OFFLINE'}
        </span>
        {block && (
          <><span className="text-slate-600">·</span>
          <span className="text-slate-400">Block #{block.toLocaleString()}</span></>
        )}
        {balance != null && (
          <><span className="text-slate-600">·</span>
          <span className="text-indigo-400 font-bold">τ{balance.toFixed(6)}</span></>
        )}
        <span className="ml-auto text-slate-600">finney.opentensor.ai</span>
      </div>

      {/* ── Known address ──────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={15} className="text-accent-green" /> Target Wallet Address
        </h2>
        <AddrBox label="Coldkey (SS58)" addr={TARGET_ADDRESS} />
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Chain Balance</p>
            <p className={clsx('font-mono font-bold', balance != null ? 'text-indigo-400' : 'text-slate-600')}>
              {balance != null ? `τ${balance.toFixed(6)}` : querying ? 'Querying…' : '—'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Block</p>
            <p className="text-white font-mono">
              {block ? `#${block.toLocaleString()}` : '—'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-500 mb-0.5">Chain Status</p>
            <p className={clsx('font-mono font-semibold',
              isConnected ? 'text-emerald-400' : 'text-amber-400')}>
              {isConnected ? '⛓ Live' : '○ Cached'}
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
            { label: 'Balance',    val: balance != null ? `τ${balance.toFixed(6)}` : '—' },
            { label: 'Chain',      val: isConnected ? '✅ Connected' : '○ Cached' },
            { label: 'Block',      val: block ? `#${block.toLocaleString()}` : '—' },
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