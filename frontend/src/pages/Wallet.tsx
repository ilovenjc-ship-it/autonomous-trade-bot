import { useState, useEffect, useCallback } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff,
  PieChart, Lock, AlertTriangle, Layers,
  Sparkles, RotateCcw, Send, Target, Edit3, Trophy,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

// ── Recovery Tracker ──────────────────────────────────────────────────────────
const TARGET_STORAGE_KEY = 'tao_recovery_target'
const DEFAULT_TARGET = 1.0

function RecoveryTracker({ balance, taoPrice }: { balance: number | null; taoPrice: number | null }) {
  const [target,    setTarget]    = useState<number>(() => {
    const stored = localStorage.getItem(TARGET_STORAGE_KEY)
    return stored ? parseFloat(stored) : DEFAULT_TARGET
  })
  const [editing,   setEditing]   = useState(false)
  const [editVal,   setEditVal]   = useState(String(target))

  const pct        = balance != null ? Math.min(100, (balance / target) * 100) : 0
  const remaining  = balance != null ? Math.max(0, target - balance) : null
  const usdRemain  = remaining != null && taoPrice ? remaining * taoPrice : null
  const usdTarget  = taoPrice ? target * taoPrice : null
  const achieved   = balance != null && balance >= target

  // bar color by progress
  const barColor =
    pct >= 100 ? '#34d399' :   // green — achieved
    pct >= 75  ? '#34d399' :   // green — almost there
    pct >= 50  ? '#60a5fa' :   // blue  — halfway
    pct >= 25  ? '#fbbf24' :   // yellow — getting started
                 '#6366f1'     // indigo — early

  const glowColor =
    pct >= 75  ? 'rgba(52,211,153,0.35)' :
    pct >= 50  ? 'rgba(96,165,250,0.35)' :
    pct >= 25  ? 'rgba(251,191,36,0.35)' :
                 'rgba(99,102,241,0.35)'

  function saveTarget() {
    const v = parseFloat(editVal)
    if (!v || v <= 0) { toast.error('Enter a valid target'); return }
    setTarget(v)
    localStorage.setItem(TARGET_STORAGE_KEY, String(v))
    setEditing(false)
    toast.success(`Target updated to τ${v}`)
  }

  const MILESTONES = [0.25, 0.5, 0.75, 1.0].map(f => ({
    pct: f * 100,
    val: (target * f).toFixed(3),
    reached: pct >= f * 100,
  }))

  return (
    <div className={clsx(
      'rounded-xl border p-5 transition-all',
      achieved
        ? 'bg-accent-green/8 border-accent-green/40 shadow-[0_0_24px_rgba(52,211,153,0.15)]'
        : 'bg-dark-800 border-dark-600'
    )}>

      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {achieved
            ? <Trophy size={16} className="text-yellow-400" />
            : <Target size={16} className="text-accent-blue" />}
          <h2 className="text-sm font-semibold text-white">
            {achieved ? 'Target Achieved 🎉' : 'Recovery Tracker'}
          </h2>
          <span className="text-[13px] text-slate-500 font-mono ml-1">
            {achieved ? 'Next milestone?' : `toward τ${target.toFixed(3)}`}
          </span>
        </div>

        {/* edit target */}
        {!editing ? (
          <button
            onClick={() => { setEditVal(String(target)); setEditing(true) }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-mono text-slate-400
                       border border-dark-600 hover:text-white hover:border-dark-500 transition-colors"
          >
            <Edit3 size={10} /> Edit Target
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number" min="0.001" step="0.1"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveTarget()}
              className="w-24 bg-dark-900 border border-accent-blue/40 rounded-lg px-2 py-1
                         text-xs font-mono text-white focus:outline-none"
              autoFocus
            />
            <button onClick={saveTarget}
              className="px-2.5 py-1 rounded-lg text-[13px] font-mono bg-accent-blue/15
                         text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/25 transition-colors">
              Set
            </button>
            <button onClick={() => setEditing(false)}
              className="text-[13px] text-slate-500 hover:text-slate-300 font-mono transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* big progress bar */}
      <div className="relative mb-2">
        <div className="h-5 bg-dark-700 rounded-full overflow-hidden border border-dark-600">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(pct, balance != null ? 1 : 0)}%`,
              background: barColor,
              boxShadow: pct > 0 ? `0 0 12px ${glowColor}` : 'none',
            }}
          />
        </div>

        {/* milestone dots */}
        {MILESTONES.map(m => (
          <div
            key={m.pct}
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-all"
            style={{
              left: `calc(${m.pct}% - 5px)`,
              borderColor: m.reached ? barColor : '#334155',
              background: m.reached ? barColor : '#1e293b',
              boxShadow: m.reached ? `0 0 6px ${glowColor}` : 'none',
            }}
          />
        ))}
      </div>

      {/* milestone labels */}
      <div className="relative h-5 mb-4">
        {MILESTONES.map(m => (
          <div
            key={m.pct}
            className="absolute flex flex-col items-center"
            style={{ left: `calc(${m.pct}% - 20px)`, width: 40 }}
          >
            <span className={clsx(
              'text-[15px] font-mono leading-tight text-center',
              m.reached ? 'text-slate-300' : 'text-slate-600'
            )}>
              τ{m.val}
            </span>
          </div>
        ))}
      </div>

      {/* stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* current */}
        <div className="bg-dark-900 rounded-lg px-3 py-2.5 text-center border border-dark-700">
          <p className="text-[15px] text-slate-500 uppercase tracking-wider font-mono mb-1">Current</p>
          <p className={clsx('text-lg font-black font-mono', balance != null ? 'text-white' : 'text-slate-600')}>
            {balance != null ? `τ${balance.toFixed(4)}` : '—'}
          </p>
          {balance != null && taoPrice && (
            <p className="text-[13px] text-slate-400 font-mono mt-0.5">
              ${(balance * taoPrice).toFixed(2)}
            </p>
          )}
        </div>

        {/* target */}
        <div className="bg-dark-900 rounded-lg px-3 py-2.5 text-center border border-dark-700">
          <p className="text-[15px] text-slate-500 uppercase tracking-wider font-mono mb-1">Target</p>
          <p className="text-lg font-black font-mono text-accent-blue">τ{target.toFixed(3)}</p>
          {usdTarget && (
            <p className="text-[13px] text-slate-400 font-mono mt-0.5">${usdTarget.toFixed(2)}</p>
          )}
        </div>

        {/* remaining */}
        <div className="bg-dark-900 rounded-lg px-3 py-2.5 text-center border border-dark-700">
          <p className="text-[15px] text-slate-500 uppercase tracking-wider font-mono mb-1">Remaining</p>
          <p className={clsx('text-lg font-black font-mono', achieved ? 'text-accent-green' : 'text-yellow-400')}>
            {achieved ? '✓ Done' : remaining != null ? `τ${remaining.toFixed(4)}` : '—'}
          </p>
          {!achieved && usdRemain != null && (
            <p className="text-[13px] text-slate-400 font-mono mt-0.5">${usdRemain.toFixed(2)} to go</p>
          )}
        </div>

        {/* progress % */}
        <div className="bg-dark-900 rounded-lg px-3 py-2.5 text-center border border-dark-700">
          <p className="text-[15px] text-slate-500 uppercase tracking-wider font-mono mb-1">Progress</p>
          <p className="text-lg font-black font-mono" style={{ color: barColor }}>
            {balance != null ? `${pct.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[13px] text-slate-400 font-mono mt-0.5">
            {pct >= 75 ? 'Almost there' : pct >= 50 ? 'Halfway' : pct >= 25 ? 'Building' : 'Starting'}
          </p>
        </div>
      </div>
    </div>
  )
}



/** Masks an SS58 address: first 6 chars + bullets + last 4 chars */
function maskAddr(addr: string): string {
  if (!addr || addr.length < 12) return '••••••••••••••••••'
  return `${addr.slice(0, 6)}${'•'.repeat(20)}${addr.slice(-4)}`
}

interface ChainInfo {
  address:        string
  balance_cached: number | null   // API field — was incorrectly mapped as balance_tao
  block_cached:   number | null
  network:        string
  connected:      boolean
  last_chain_at:  string | null
  wallet_loaded:  boolean
  error?:         string
}

function AddrBox({ label, addr, show }: { label: string; addr: string; show: boolean }) {
  const copy = () => { navigator.clipboard.writeText(addr); toast.success('Copied!') }
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl px-4 py-3">
      <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono mb-1">{label}</p>
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

type WalletTab = 'generate' | 'restore'

interface GeneratedWallet {
  mnemonic: string
  address:  string
}

export default function WalletPage() {
  const [chainInfo,  setChainInfo]  = useState<ChainInfo | null>(null)
  const [words,      setWords]      = useState<string[]>(Array(12).fill(''))
  const [showWords,  setShowWords]  = useState(false)
  const [showAddr,   setShowAddr]   = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [querying,   setQuerying]   = useState(false)
  const [taoPrice,   setTaoPrice]   = useState<number | null>(null)

  // Generate wallet flow
  const [walletTab,    setWalletTab]    = useState<WalletTab>('generate')
  const [generating,   setGenerating]   = useState(false)
  const [generated,    setGenerated]    = useState<GeneratedWallet | null>(null)
  const [showGenWords, setShowGenWords] = useState(true)
  const [backedUp,     setBackedUp]     = useState(false)
  const [showNewAddr,  setShowNewAddr]  = useState(false)

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
        toast.success(`Chain queried ✅ Block #${data.block_cached?.toLocaleString()}`)
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

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerated(null)
    setBackedUp(false)
    setShowGenWords(true)
    setShowNewAddr(false)
    try {
      const { data } = await api.post<{ success: boolean; mnemonic?: string; address?: string; error?: string }>(
        '/wallet/generate', {}
      )
      if (data.success && data.mnemonic && data.address) {
        setGenerated({ mnemonic: data.mnemonic, address: data.address })
        // Refresh chain info to pick up new address
        api.get<ChainInfo>('/wallet/status').then(r => setChainInfo(r.data)).catch(() => {})
        toast.success('New wallet generated — write down your 12 words now!')
      } else {
        toast.error(data.error ?? 'Wallet generation failed')
      }
    } catch {
      toast.error('Failed to generate wallet')
    } finally {
      setGenerating(false)
    }
  }

  const copyGenMnemonic = () => {
    if (generated) {
      navigator.clipboard.writeText(generated.mnemonic)
      toast.success('12 words copied — paste into your password manager or write offline')
    }
  }

  const copyGenAddress = () => {
    if (generated) {
      navigator.clipboard.writeText(generated.address)
      toast.success('Address copied!')
    }
  }

  const isConnected   = chainInfo?.connected ?? false
  const balance       = chainInfo?.balance_cached ?? 0
  const block         = chainInfo?.block_cached
  const displayAddr   = chainInfo?.address || generated?.address || '—'
  const usdValue      = taoPrice != null && balance ? balance * taoPrice : null

  return (
    <div className="p-6 space-y-5 w-full">

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
        {block && (<><span className="text-slate-300">·</span>
          <span className="text-slate-300">Block #{block.toLocaleString()}</span></>)}
        {balance != null && (<><span className="text-slate-300">·</span>
          <span className="text-indigo-400 font-bold">τ{balance.toFixed(6)}</span></>)}
        <span className="ml-auto text-slate-300">finney.opentensor.ai</span>
      </div>

      {/* ── Recovery Tracker ────────────────────────────────────────────────── */}
      <RecoveryTracker
        balance={chainInfo?.balance_cached ?? null}
        taoPrice={taoPrice}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          ZONE 1 — Two-column: [Coldkey + Portfolio] | [Recovery Phrase]
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

        {/* LEFT — Coldkey address + Portfolio stacked */}
        <div className="flex flex-col gap-5">

          {/* ── Coldkey address ─────────────────────────────────────────── */}
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

          {/* ── Portfolio ───────────────────────────────────────────────── */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4 flex-1">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <PieChart size={15} className="text-accent-blue" /> Portfolio
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono mb-1">TAO Balance</p>
                <p className={clsx('text-2xl font-black font-mono', balance ? 'text-white' : 'text-slate-600')}>
                  {balance ? `τ ${balance.toFixed(4)}` : 'τ —'}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">Free · unstaked</p>
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono mb-1">Est. USD Value</p>
                <p className={clsx('text-2xl font-black font-mono', usdValue != null ? 'text-emerald-400' : 'text-slate-600')}>
                  {usdValue != null
                    ? `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '$ —'}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {taoPrice ? `@ $${taoPrice.toFixed(2)} / TAO` : 'Price unavailable'}
                </p>
              </div>
            </div>

            {/* Staking positions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono">Staking Positions</p>
                <span className="text-[13px] text-slate-600 font-mono">Per-subnet αTAO</span>
              </div>
              {isConnected ? (
                <div className="text-xs text-slate-500 font-mono px-3 py-4 bg-dark-700/60 rounded-lg border border-dark-600 text-center">
                  Subnet staking data loading… connect wallet to see αTAO per subnet
                </div>
              ) : (
                <div className="space-y-1.5">
                  {['SN 1 — Apex', 'SN 8 — Taoshi PTN', 'SN 18 — Cortex.t', 'SN 64 — Chutes'].map(name => (
                    <div key={name} className="flex items-center justify-between px-3 py-2 bg-dark-700/60 rounded-lg border border-dark-600/50">
                      <div className="flex items-center gap-2">
                        <Layers size={11} className="text-slate-600" />
                        <span className="text-xs text-slate-500 font-mono">{name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-slate-600 font-mono">
                        <Lock size={10} /> Chain offline
                      </div>
                    </div>
                  ))}
                  <p className="text-[13px] text-slate-600 font-mono text-center pt-1">
                    Query chain to load real αTAO staking positions
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Bot Wallet Setup */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 flex flex-col h-full">

          {/* Tab bar */}
          <div className="flex gap-1 mb-5 bg-dark-900 rounded-lg p-1">
            <button
              onClick={() => setWalletTab('generate')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all',
                walletTab === 'generate'
                  ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Sparkles size={12} /> Generate New Wallet
            </button>
            <button
              onClick={() => setWalletTab('restore')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all',
                walletTab === 'restore'
                  ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <RotateCcw size={12} /> Restore Existing
            </button>
          </div>

          {/* ── TAB: Generate New Wallet ──────────────────────────────────── */}
          {walletTab === 'generate' && (
            <div className="flex flex-col flex-1 gap-4">
              {!generated ? (
                <>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Creates a <span className="text-white font-semibold">brand-new wallet</span> from scratch — 
                    no history, no other funds. Only fund it with what you're willing to trade. 
                    The bot gets these keys and only these keys.
                  </p>

                  <div className="flex items-start gap-2 px-3 py-3 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                    <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[14px] text-amber-300/90 leading-snug">
                      The 12-word recovery phrase is shown <span className="font-bold text-amber-300">exactly once</span>.
                      Write it down offline before continuing. It cannot be recovered if lost.
                    </p>
                  </div>

                  <div className="flex-1" />

                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-accent-green/15 border border-accent-green/40 text-accent-green font-bold text-sm hover:bg-accent-green/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating
                      ? <><RefreshCw size={15} className="animate-spin" /> Generating…</>
                      : <><Sparkles size={15} /> Generate New Bot Wallet</>}
                  </button>
                </>
              ) : (
                <>
                  {/* ── Success: show the 12 words ── */}
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[14px] text-red-300 leading-snug font-semibold">
                      Write these 12 words down NOW — this is the only time they will be shown.
                    </p>
                  </div>

                  {/* Word grid — read-only */}
                  <div className="grid grid-cols-3 gap-2">
                    {generated.mnemonic.split(' ').map((word, i) => (
                      <div key={i} className="relative bg-dark-700 border border-dark-500 rounded-lg px-2 py-2 flex items-center gap-1.5">
                        <span className="text-[13px] text-slate-500 font-mono w-4 flex-shrink-0">{i + 1}.</span>
                        <span className={clsx('text-xs font-mono font-semibold text-slate-100 transition-all', !showGenWords && 'blur-sm select-none')}>
                          {word}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Word controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowGenWords(v => !v)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
                    >
                      {showGenWords ? <EyeOff size={12} /> : <Eye size={12} />}
                      {showGenWords ? 'Hide words' : 'Reveal words'}
                    </button>
                    <button
                      onClick={copyGenMnemonic}
                      className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-blue-300 font-mono transition-colors ml-auto"
                    >
                      <Copy size={12} /> Copy all 12 words
                    </button>
                  </div>

                  {/* Backup confirmation checkbox */}
                  <label className={clsx(
                    'flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer transition-all',
                    backedUp
                      ? 'bg-accent-green/10 border-accent-green/30'
                      : 'bg-dark-700 border-dark-500 hover:border-slate-500'
                  )}>
                    <input
                      type="checkbox"
                      checked={backedUp}
                      onChange={e => { setBackedUp(e.target.checked); if (e.target.checked) setShowNewAddr(true) }}
                      className="mt-0.5 accent-emerald-400"
                    />
                    <span className={clsx('text-xs leading-snug', backedUp ? 'text-accent-green' : 'text-slate-300')}>
                      I have safely written down all 12 words and stored them offline.
                    </span>
                  </label>

                  {/* Fund address — shown after backup confirmed */}
                  {backedUp && (
                    <div className="bg-dark-700 border border-accent-green/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-accent-green text-xs font-semibold">
                        <CheckCircle2 size={13} />
                        New bot wallet is live and ready to fund
                      </div>

                      <div>
                        <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono mb-1.5">
                          Send TAO to this address
                        </p>
                        <div className="flex items-center gap-2 bg-dark-900 rounded-lg px-3 py-2.5 border border-dark-500">
                          <code className={clsx(
                            'text-xs font-mono flex-1 transition-all',
                            showNewAddr ? 'text-slate-100' : 'text-slate-500 tracking-widest'
                          )}>
                            {showNewAddr ? generated.address : maskAddr(generated.address)}
                          </code>
                          <button onClick={() => setShowNewAddr(v => !v)} className="text-slate-500 hover:text-white transition-colors">
                            {showNewAddr ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                          <button onClick={copyGenAddress} className="text-slate-500 hover:text-accent-blue transition-colors">
                            <Copy size={11} />
                          </button>
                          <a
                            href={`https://taostats.io/account/${generated.address}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-slate-500 hover:text-accent-blue transition-colors"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-[14px] text-slate-400 font-mono">
                        <Send size={11} className="mt-0.5 text-slate-500 flex-shrink-0" />
                        Fund this address with TAO. Once funded, enable strategies in the Agent Fleet to begin live trading.
                      </div>

                      <button
                        onClick={() => { setGenerated(null); setBackedUp(false) }}
                        className="flex items-center gap-1.5 text-[14px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
                      >
                        <RotateCcw size={10} /> Generate a different wallet
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: Restore Existing ─────────────────────────────────────── */}
          {walletTab === 'restore' && (
            <div className="flex flex-col flex-1">
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Restore a previously generated bot wallet using its 12-word phrase.
                Paste the full phrase into the first box, or type word by word.
              </p>

              <div className="flex items-start gap-2 px-3 py-3 bg-amber-500/8 border border-amber-500/20 rounded-lg mb-4">
                <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[14px] text-amber-400/80 leading-snug">
                  <span className="font-semibold text-amber-400">Only restore the dedicated bot wallet.</span>{' '}
                  Never enter your personal wallet's phrase here.
                </p>
              </div>

              {/* Reveal toggle */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 font-mono">{wordCount} / 12 words entered</span>
                <button
                  onClick={() => setShowWords(!showWords)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
                >
                  {showWords ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showWords ? 'Hide' : 'Reveal'}
                </button>
              </div>

              {/* Hidden dummy fields — trick browsers into targeting these instead of the real inputs */}
              <input type="text"     name="username" style={{ display: 'none' }} readOnly tabIndex={-1} aria-hidden="true" />
              <input type="password" name="password" style={{ display: 'none' }} readOnly tabIndex={-1} aria-hidden="true" />

              <div className="grid grid-cols-3 gap-2.5 mb-4 flex-1">
                {words.map((w, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-500 font-mono select-none">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={showWords ? w : w ? '•'.repeat(Math.max(4, w.length)) : ''}
                      onChange={e => handleWordChange(i, e.target.value)}
                      onFocus={e => {
                        // Reveal the actual value on focus so the user can see/edit it
                        e.currentTarget.type = 'text'
                      }}
                      placeholder={`word ${i + 1}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-form-type="other"
                      data-lpignore="true"
                      name={`mnemonic-word-${i}`}
                      className="w-full h-full min-h-[42px] pl-7 pr-2 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-blue rounded-full transition-all duration-300"
                    style={{ width: `${(wordCount / 12) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-400 tabular-nums">{wordCount} / 12</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveMnemonic}
                  disabled={!mnemonicOk || busy || saved}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border flex-1',
                    mnemonicOk && !saved
                      ? 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25'
                      : 'bg-dark-700 text-slate-500 border-dark-600 cursor-not-allowed'
                  )}
                >
                  {saved ? <CheckCircle2 size={14} /> : busy ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {saved ? 'Wallet Restored' : busy ? 'Restoring…' : 'Restore Wallet'}
                </button>
                <button onClick={clearWords} className="px-4 py-2.5 rounded-lg text-xs text-slate-400 border border-dark-600 hover:text-white hover:border-dark-500 transition-colors">
                  Clear
                </button>
              </div>

              {saved && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-xs text-accent-green font-mono">
                  <CheckCircle2 size={12} />
                  Wallet restored — loaded automatically on next backend start.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      

    </div>
  )
}