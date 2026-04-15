import { useState, useEffect, useCallback } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff,
  PieChart, Lock, AlertTriangle, Layers,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

const TARGET_ADDRESS = '5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L'

/** Masks an SS58 address: first 6 chars + bullets + last 4 chars */
function maskAddr(addr: string): string {
  if (!addr || addr.length < 12) return '••••••••••••••••••'
  return `${addr.slice(0, 6)}${'•'.repeat(20)}${addr.slice(-4)}`
}

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

function AddrBox({ label, addr, show }: { label: string; addr: string; show: boolean }) {
  const copy = () => { navigator.clipboard.writeText(addr); toast.success('Copied!') }
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl px-4 py-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className={clsx('text-sm font-mono truncate flex-1 transition-all',
          show ? 'text-slate-100' : 'text-slate-500 tracking-widest')}>
          {show ? addr : maskAddr(addr)}
        </p>
        {/* Copy always works even when masked */}
        <button onClick={copy} className="text-slate-500 hover:text-white flex-shrink-0 transition-colors" title="Copy address">
          <Copy size={13} />
        </button>
        <a href={`https://taostats.io/account/${addr}`} target="_blank" rel="noopener noreferrer"
          className="text-slate-500 hover:text-accent-blue flex-shrink-0 transition-colors" title="View on Taostats">
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  )
}

export default function WalletPage() {
  const [chainInfo,  setChainInfo]  = useState<ChainInfo | null>(null)
  const [words,      setWords]      = useState<string[]>(Array(12).fill(''))
  const [showWords,  setShowWords]  = useState(false)
  const [showAddr,   setShowAddr]   = useState(false)   // address hidden by default
  const [busy,       setBusy]       = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [querying,   setQuerying]   = useState(false)
  const [taoPrice,   setTaoPrice]   = useState<number | null>(null)

  // Load cached wallet status — auto-refresh every 30 s (cached, not live chain)
  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get<ChainInfo>('/wallet/status')
      setChainInfo(data)
    } catch {}
  }, [])

  useEffect(() => {
    loadStatus()
    // Also grab current TAO price for USD portfolio estimate
    api.get<{ price: number }>('/price/current')
      .then(r => setTaoPrice(r.data.price ?? null))
      .catch(() => {})
    const t = setInterval(loadStatus, 30_000)
    return () => clearInterval(t)
  }, [loadStatus])

  // Query live chain (slower — hits Finney mainnet directly)
  const queryChain = async () => {
    setQuerying(true)
    try {
      const { data } = await api.get<ChainInfo>('/wallet/chain')
      setChainInfo(data)
      if (data.connected) {
        toast.success(`Chain queried ✅ Block #${data.block?.toLocaleString()}`)
      } else {
        toast.error('Chain unreachable — using cached data')
      }
    } catch {
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
      const { data } = await api.post<{ success: boolean; address?: string; chain?: ChainInfo; error?: string }>(
        '/wallet/mnemonic', { mnemonic: phrase }
      )
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

  const isConnected   = chainInfo?.connected ?? false
  const balance       = chainInfo?.balance_tao ?? 0
  const block         = chainInfo?.block
  const displayAddr   = chainInfo?.address || TARGET_ADDRESS
  const usdValue      = taoPrice != null && balance ? balance * taoPrice : null

  return (
    <div className="p-6 space-y-5 max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <WalletIcon size={22} className="text-accent-blue" /> Wallet
          </h1>
          <p className="text-sm text-slate-300 mt-0.5">
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
        <span className={isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
          {isConnected ? '⛓ FINNEY MAINNET CONNECTED' : '○ CHAIN OFFLINE'}
        </span>
        {block && (
          <><span className="text-slate-300">·</span>
          <span className="text-slate-300">Block #{block.toLocaleString()}</span></>
        )}
        {balance != null && (
          <><span className="text-slate-300">·</span>
          <span className="text-indigo-400 font-bold">τ{balance.toFixed(6)}</span></>
        )}
        <span className="ml-auto text-slate-300">finney.opentensor.ai</span>
      </div>

      {/* ── Coldkey address ────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck size={15} className="text-accent-green" /> Coldkey Address
          </h2>
          <button
            onClick={() => setShowAddr(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
          >
            {showAddr ? <EyeOff size={12} /> : <Eye size={12} />}
            {showAddr ? 'Hide' : 'Reveal'}
          </button>
        </div>

        <AddrBox label="Coldkey (SS58)" addr={displayAddr} show={showAddr} />

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-400 mb-0.5">TAO Balance</p>
            <p className={clsx('font-mono font-bold', balance ? 'text-indigo-400' : 'text-slate-500')}>
              {querying ? 'Querying…' : balance ? `τ${balance.toFixed(4)}` : '—'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-400 mb-0.5">Block</p>
            <p className="text-white font-mono">
              {block ? `#${block.toLocaleString()}` : '—'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-center">
            <p className="text-slate-400 mb-0.5">Chain Status</p>
            <p className={clsx('font-mono font-semibold',
              isConnected ? 'text-emerald-400' : 'text-amber-400')}>
              {isConnected ? '⛓ Live' : '○ Cached'}
            </p>
          </div>
        </div>

        <a
          href={`https://taostats.io/account/${displayAddr}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-accent-blue hover:underline font-mono"
        >
          <ExternalLink size={11} /> View on Taostats.io
        </a>
      </div>

      {/* ── Portfolio ───────────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <PieChart size={15} className="text-accent-blue" /> Portfolio
        </h2>

        {/* Top-line value cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-1">TAO Balance</p>
            <p className={clsx('text-2xl font-black font-mono', balance ? 'text-white' : 'text-slate-600')}>
              {balance ? `τ ${balance.toFixed(4)}` : 'τ —'}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono">Free · unstaked</p>
          </div>
          <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-1">Est. USD Value</p>
            <p className={clsx('text-2xl font-black font-mono', usdValue != null ? 'text-emerald-400' : 'text-slate-600')}>
              {usdValue != null ? `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$ —'}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              {taoPrice ? `@ $${taoPrice.toFixed(2)} / TAO` : 'Price unavailable'}
            </p>
          </div>
        </div>

        {/* Staking positions — placeholder until chain connected */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Staking Positions</p>
            <span className="text-[10px] text-slate-600 font-mono">Per-subnet αTAO</span>
          </div>
          {isConnected ? (
            <div className="text-xs text-slate-500 font-mono px-3 py-4 bg-dark-700/60 rounded-lg border border-dark-600 text-center">
              Subnet staking data loading… connect wallet to see αTAO per subnet
            </div>
          ) : (
            <div className="space-y-1.5">
              {[
                { name: 'SN 1 — Apex', amt: null },
                { name: 'SN 3 — MyShell', amt: null },
                { name: 'SN 18 — Cortex', amt: null },
              ].map(({ name }) => (
                <div key={name} className="flex items-center justify-between px-3 py-2 bg-dark-700/60 rounded-lg border border-dark-600/50">
                  <div className="flex items-center gap-2">
                    <Layers size={11} className="text-slate-600" />
                    <span className="text-xs text-slate-500 font-mono">{name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                    <Lock size={10} />
                    Chain offline
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-600 font-mono text-center pt-1">
                Query chain to load real staking positions
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recovery Phrase ────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound size={15} className="text-accent-blue" /> Recovery Phrase
          </h2>
          <button
            onClick={() => setShowWords(!showWords)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
          >
            {showWords ? <EyeOff size={12} /> : <Eye size={12} />}
            {showWords ? 'Hide' : 'Reveal'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Manage and backup your recovery phrase. Enter your 12-word BIP39 phrase below —
          paste the full phrase into the first box or type word by word.
          Stored encrypted, used locally only.
        </p>

        {/* Backup reminder */}
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg mb-4">
          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400/80 leading-snug">
            <span className="font-semibold text-amber-400">Never share your recovery phrase.</span>{' '}
            Anyone with these 12 words has full access to your wallet and all funds.
            Store them offline in a secure location.
          </p>
        </div>

        {/* 12-word grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
          {words.map((w, i) => (
            <div key={i} className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 font-mono select-none">
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
          <span className="text-xs font-mono text-slate-300">{wordCount}/12</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveMnemonic}
            disabled={!mnemonicOk || busy || saved}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border flex-1',
              mnemonicOk && !saved
                ? 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/30'
                : 'bg-dark-700 text-slate-300 border-dark-600 cursor-not-allowed'
            )}
          >
            {saved ? <CheckCircle2 size={14} /> : busy ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {saved ? 'Mnemonic Saved' : busy ? 'Saving…' : 'Save Mnemonic'}
          </button>
          <button
            onClick={clearWords}
            className="px-3 py-2 rounded-lg text-xs text-slate-300 border border-dark-600 hover:text-white hover:border-dark-400 transition-colors"
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

      </div>
  )
}