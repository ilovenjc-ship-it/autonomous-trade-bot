import { useState, useEffect, useCallback } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff,
  PieChart, Lock, AlertTriangle, Layers, Flame,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

// ── TaoBot confirmed subnets (from on-chain verification) ──────────────────
const TAOBOT_SUBNETS = new Set([1, 8, 9, 18, 64])

interface SubnetRow {
  uid:       number
  name:      string
  ticker:    string
  stake_tao: number
  apy:       number
  score:     number
  trend:     'up' | 'down' | 'neutral'
}

/** Map a normalised 0-1 heat value to an HSL colour string.
 *  cold (0) = deep blue  →  warm (0.5) = indigo/purple  →  hot (1) = fiery red */
function heatColor(norm: number): string {
  // Hue: 220° (blue) → 280° (purple) → 30° (amber) → 0° (red)
  // We walk hue from 220 down to 0 with a slight purple bulge
  const hue  = Math.round(220 - norm * 220)
  const sat  = Math.round(60  + norm * 30)   // 60 → 90%
  const light = Math.round(28 - norm * 6)    // 28 → 22% (darker when hotter)
  return `hsl(${hue},${sat}%,${light}%)`
}

function heatText(norm: number): string {
  if (norm > 0.75) return '#fca5a5'  // red-300
  if (norm > 0.5)  return '#fcd34d'  // amber-300
  if (norm > 0.25) return '#a5b4fc'  // indigo-300
  return '#94a3b8'                   // slate-400
}

function SubnetHeatMap() {
  const [subnets, setSubnets] = useState<SubnetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<SubnetRow | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    api.get<{ subnets: SubnetRow[] }>('/market/subnets?sort=uid&order=asc')
      .then(r => setSubnets(r.data.subnets))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Normalise scores across the fetched set
  const scores = subnets.map(s => s.score)
  const minS   = scores.length ? Math.min(...scores) : 0
  const maxS   = scores.length ? Math.max(...scores) : 1
  const norm   = (s: number) => maxS === minS ? 0.5 : (s - minS) / (maxS - minS)

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Flame size={15} className="text-orange-400" />
          Network Heat Map
          <span className="text-[10px] text-slate-500 font-mono font-normal">64 subnets · scored by APY + stake</span>
        </h2>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-slate-400">COLD</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
              <div key={v} style={{ background: heatColor(v), width: 14, height: 10, borderRadius: 2 }} />
            ))}
          </div>
          <span className="text-orange-400">HOT</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 text-xs font-mono">
          Loading subnet data…
        </div>
      ) : (
        <div className="relative">
          {/* Grid */}
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
            {subnets.map(s => {
              const n        = norm(s.score)
              const bg       = heatColor(n)
              const txt      = heatText(n)
              const isTaoBot = TAOBOT_SUBNETS.has(s.uid)
              return (
                <div
                  key={s.uid}
                  onMouseEnter={e => {
                    setHovered(s)
                    const rect = (e.currentTarget as HTMLElement)
                      .closest('.relative')!.getBoundingClientRect()
                    const el   = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setHoverPos({ x: el.left - rect.left, y: el.top - rect.top })
                  }}
                  onMouseLeave={() => setHovered(null)}
                  className="relative cursor-default select-none rounded-md flex flex-col items-center justify-center transition-transform hover:scale-110 hover:z-10"
                  style={{
                    background: bg,
                    height: 52,
                    outline: isTaoBot ? '2px solid #00e5a0' : 'none',
                    outlineOffset: isTaoBot ? '1px' : undefined,
                    boxShadow: isTaoBot ? '0 0 8px rgba(0,229,160,0.5)' : undefined,
                  }}
                >
                  <span className="text-[11px] font-black leading-none" style={{ color: txt }}>
                    SN{s.uid}
                  </span>
                  <span className="text-[8px] font-mono opacity-70 leading-none mt-0.5" style={{ color: txt }}>
                    {s.apy.toFixed(0)}%
                  </span>
                  {isTaoBot && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent-green" />
                  )}
                  {s.trend === 'up' && (
                    <span className="absolute bottom-0.5 right-1 text-[7px] text-emerald-400 font-bold">▲</span>
                  )}
                  {s.trend === 'down' && (
                    <span className="absolute bottom-0.5 right-1 text-[7px] text-red-400 font-bold">▼</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Hover tooltip */}
          {hovered && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ left: Math.min(hoverPos.x, 420), top: hoverPos.y - 80 }}
            >
              <div className="bg-dark-900 border border-dark-500 rounded-xl px-3 py-2.5 shadow-2xl min-w-[170px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">SN{hovered.uid} — {hovered.name}</span>
                  {TAOBOT_SUBNETS.has(hovered.uid) && (
                    <span className="text-[9px] font-mono text-accent-green border border-accent-green/30 rounded px-1 py-0.5">TaoBot ✓</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                  <span className="text-slate-500">APY</span>
                  <span className="text-amber-400 font-semibold">{hovered.apy.toFixed(1)}%</span>
                  <span className="text-slate-500">Stake</span>
                  <span className="text-slate-300">τ{hovered.stake_tao.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                  <span className="text-slate-500">Score</span>
                  <span className="text-indigo-400">{hovered.score.toFixed(1)}</span>
                  <span className="text-slate-500">Trend</span>
                  <span className={hovered.trend === 'up' ? 'text-emerald-400' : hovered.trend === 'down' ? 'text-red-400' : 'text-slate-400'}>
                    {hovered.trend === 'up' ? '▲ up' : hovered.trend === 'down' ? '▼ down' : '— flat'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-green inline-block" />
          TaoBot validator active
        </div>
        <div className="flex items-center gap-1">
          <span className="text-emerald-400">▲</span> trending up
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-400">▼</span> trending down
        </div>
        <span className="ml-auto text-slate-600">Hover any tile for details</span>
      </div>
    </div>
  )
}

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
    <div className="p-6 space-y-5 max-w-4xl">

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

      {/* ── Subnet Heat Map ────────────────────────────────────────────────── */}
      <SubnetHeatMap />

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