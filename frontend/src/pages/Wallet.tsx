import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Wallet as WalletIcon, Copy, ExternalLink, ShieldCheck,
  KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff,
  PieChart, AlertTriangle,
  Sparkles, RotateCcw, Send, Activity,
  Flame, Lock, Unlock, ArrowUpRight, ArrowDownLeft,
  EyeOff as EyeOffIcon, Shield, QrCode, X, Check,
  ChevronRight, Zap, Globe, ScanLine,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'
import NetworkIdentityPanel from '@/components/NetworkIdentityPanel'
import { PrivacyValue as SharedPrivacyValue, maskAddr } from '@/components/PrivacyValue'
import { usePrivacyMode } from '@/hooks/usePrivacyMode'

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

interface StakePosition {
  hotkey:      string
  stake:       number   // αTAO amount
  netuid:      number
  alpha_price: number   // TAO per αTAO (1.0 for SN0 root)
  tao_value:   number   // estimated TAO value of this position
}

interface StakesData {
  stakes:          StakePosition[]
  total:           number   // total αTAO
  total_tao_value: number   // total estimated TAO value
}

// ── Conviction-Era owner overlay (Session XXXIV — carry-over #7) ─────────────
// Pulled from /api/market/owners; surfaced inline on staking positions so the
// Operator can see takeover-risk on the subnets they're actively staked into.
// Compact subset of the full Research-page schema — only fields we render.
type RiskBand = 'FORTRESS' | 'DEFENDED' | 'CONTESTED' | 'VULNERABLE' | null
interface WalletOwnerRow {
  netuid: number
  is_trading: boolean
  subnet_name: string | null
  subnet_category: string | null
  scorecard_score: number | null
  owner_share: number | null
  takeover_risk_score: number | null
  takeover_risk_band: RiskBand
}
interface WalletOwnersResp {
  owners: WalletOwnerRow[]
  monitor_netuids: number[]
  trading_netuids: number[]
  conviction_unlock_drop_pct: number
  conviction_unlock_min_tao: number
  meta_age_s: number
}

function ownerBandStyle(band: RiskBand): string {
  switch (band) {
    case 'FORTRESS':   return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'DEFENDED':   return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    case 'CONTESTED':  return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'VULNERABLE': return 'bg-red-500/20 text-red-300 border-red-500/40'
    default:           return 'bg-slate-700/30 text-slate-500 border-slate-600/30'
  }
}
function ownerBandLabel(band: RiskBand): string {
  return band ?? 'UNMON'  // un-monitored subnets fall back to a neutral pill
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

// Session XXXIV: PrivacyValue moved to components/PrivacyValue.tsx so the
// WalletTransactions page can share the same renderer.  Re-export under the
// original local name to keep the rest of this file untouched.
const PrivacyValue = SharedPrivacyValue

// ── Hot Wallet — Send panel ───────────────────────────────────────────────────
type SendStep = 'form' | 'confirm' | 'done'

function SendPanel({ balance, privacy, onDone }: {
  balance: number; privacy: boolean; onDone: () => void
}) {
  const [step,     setStep]     = useState<SendStep>('form')
  const [toAddr,   setToAddr]   = useState('')
  const [amount,   setAmount]   = useState('')
  const [note,     setNote]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [txHash,   setTxHash]   = useState<string | null>(null)
  const taoPrice = useRef<number | null>(null)

  useEffect(() => {
    api.get('/price/current').then(r => { taoPrice.current = r.data.price ?? null }).catch(() => {})
  }, [])

  const amt       = parseFloat(amount) || 0
  const usdEst    = taoPrice.current ? amt * taoPrice.current : null
  const isValidAddr = toAddr.length >= 46 && toAddr.startsWith('5')
  const canProceed  = isValidAddr && amt > 0 && (balance <= 0 || amt <= balance)

  function handleMax() { setAmount((balance * 0.998).toFixed(6)) }  // leave a hair for fees

  async function handleSend() {
    setSending(true)
    try {
      const res = await api.post('/wallet/transfer', {
        to_address: toAddr.trim(),
        amount_tao: amt,
        note: note.trim() || undefined,
      })
      if (res.data.success) {
        setTxHash(res.data.tx_hash ?? 'confirmed')
        setStep('done')
        toast.success(`Sent τ${amt.toFixed(4)} ✓`)
        onDone()
      } else {
        toast.error(res.data.error ?? 'Transfer failed')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Network error')
    } finally {
      setSending(false)
    }
  }

  if (step === 'done') return (
    <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
      <div className="w-14 h-14 bg-accent-green/15 border border-accent-green/30 rounded-2xl flex items-center justify-center">
        <CheckCircle2 size={28} className="text-accent-green" />
      </div>
      <div>
        <p className="text-white font-bold text-base">Transfer Submitted</p>
        <p className="text-slate-400 text-xs font-mono mt-1">τ{amt.toFixed(4)} → {toAddr.slice(0,10)}…{toAddr.slice(-6)}</p>
        {txHash && <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">tx: {txHash.slice(0, 24)}…</p>}
      </div>
      <div className="flex gap-2">
        <a href={`https://taostats.io/account/${toAddr}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-xs font-mono text-slate-300 hover:text-white transition-colors">
          <ExternalLink size={11} /> Verify on Taostats
        </a>
        <button onClick={() => { setStep('form'); setToAddr(''); setAmount(''); setNote(''); setTxHash(null) }}
          className="px-3 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-xs font-mono text-slate-300 hover:text-white transition-colors">
          New Transfer
        </button>
      </div>
    </div>
  )

  if (step === 'confirm') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => setStep('form')} className="text-slate-400 hover:text-white transition-colors p-1"><X size={14} /></button>
        <p className="text-sm font-semibold text-white">Confirm Transfer</p>
      </div>

      {/* Review card */}
      <div className="bg-dark-700 border border-dark-500 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">Sending</span>
          <span className="text-white font-bold text-base">
            <PrivacyValue value={`τ ${amt.toFixed(6)}`} privacy={privacy} className="text-accent-green" />
          </span>
        </div>
        {usdEst != null && (
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">≈ USD</span>
            <PrivacyValue value={`$${usdEst.toFixed(2)}`} privacy={privacy} className="text-slate-300" />
          </div>
        )}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-[10px] text-slate-500 font-mono mb-1">TO ADDRESS</p>
          <p className="text-xs font-mono text-slate-200 break-all">{toAddr}</p>
        </div>
        {note && (
          <div className="border-t border-dark-600 pt-3">
            <p className="text-[10px] text-slate-500 font-mono mb-1">NOTE</p>
            <p className="text-xs text-slate-300">{note}</p>
          </div>
        )}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2.5">
        <AlertTriangle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-red-300 font-mono leading-snug">
          On-chain transfers are <strong>irreversible</strong>. Verify the destination address before confirming.
          Block time ~12 seconds. No chargebacks.
        </p>
      </div>

      <button onClick={handleSend} disabled={sending}
        className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {sending
          ? <><RefreshCw size={14} className="animate-spin" /> Broadcasting…</>
          : <><Send size={14} /> Confirm & Broadcast</>}
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Recipient */}
      <div>
        <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1.5">Recipient Address (SS58)</label>
        <div className={clsx('flex items-center gap-2 bg-dark-700 border rounded-lg px-3 py-2.5 transition-colors',
          toAddr && !isValidAddr ? 'border-red-500/50' :
          toAddr && isValidAddr ? 'border-accent-green/40' :
          'border-dark-500 focus-within:border-accent-blue')}>
          <input
            value={toAddr} onChange={e => setToAddr(e.target.value)}
            placeholder="5G…  (Bittensor SS58 address)"
            autoComplete="off" autoCorrect="off" spellCheck={false}
            className="flex-1 bg-transparent text-xs font-mono text-white focus:outline-none placeholder-slate-600"
          />
          {toAddr && (
            <button onClick={() => setToAddr('')} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
              <X size={11} />
            </button>
          )}
          {isValidAddr && <Check size={12} className="text-accent-green flex-shrink-0" />}
        </div>
        {toAddr && !isValidAddr && (
          <p className="text-[10px] text-red-400 font-mono mt-1">Must be a valid Bittensor SS58 address starting with '5'</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-slate-400 font-mono uppercase tracking-wide">Amount (τ TAO)</label>
          <button onClick={handleMax} className="text-[10px] font-mono text-accent-blue hover:text-white transition-colors flex items-center gap-1">
            MAX <PrivacyValue value={`τ${balance.toFixed(4)}`} privacy={privacy} className="" />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-dark-700 border border-dark-500 focus-within:border-accent-blue rounded-lg px-3 py-2.5 transition-colors">
          <input
            type="number" min="0" step="0.001" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.0000"
            className="flex-1 bg-transparent text-white font-mono text-sm focus:outline-none placeholder-slate-600"
          />
          <span className="text-slate-400 font-mono text-xs flex-shrink-0">τ</span>
        </div>
        {usdEst != null && amt > 0 && (
          <p className="text-[11px] text-slate-500 font-mono mt-1">
            ≈ <PrivacyValue value={`$${usdEst.toFixed(2)} USD`} privacy={privacy} className="" />
          </p>
        )}
      </div>

      {/* Note (optional) */}
      <div>
        <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1.5">Note (optional — not stored on-chain)</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Funding trading wallet"
          className="w-full bg-dark-700 border border-dark-500 focus:border-accent-blue rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
        />
      </div>

      <button onClick={() => setStep('confirm')} disabled={!canProceed}
        className="w-full py-3 bg-accent-blue/15 hover:bg-accent-blue/25 border border-accent-blue/40 text-accent-blue rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <ChevronRight size={15} /> Review Transfer
      </button>
    </div>
  )
}

// ── Hot Wallet — Receive panel ────────────────────────────────────────────────
function ReceivePanel({ address, privacy }: { address: string; privacy: boolean }) {
  const [showFull, setShowFull] = useState(false)
  const masked = address.length > 12 ? `${address.slice(0, 10)} ···· ${address.slice(-8)}` : address

  function copy() {
    navigator.clipboard.writeText(address)
    toast.success('Address copied — paste it to anyone sending you TAO')
  }

  if (!address || address === '—') return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
      <Shield size={28} className="text-slate-500" />
      <p className="text-slate-400 text-sm">Restore your wallet first to generate a receive address</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Receive address card */}
      <div className="bg-dark-700 border border-dark-500 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide">Your TAO Address</p>
          <button onClick={() => setShowFull(v => !v)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white font-mono transition-colors">
            {showFull ? <EyeOff size={11} /> : <Eye size={11} />}
            {showFull ? 'Hide' : 'Reveal full'}
          </button>
        </div>

        {/* Address display */}
        <div className={clsx('font-mono text-sm leading-relaxed break-all transition-all',
          privacy && !showFull ? 'blur-sm select-none' : 'text-slate-100'
        )}>
          {showFull && !privacy
            ? <span className="text-xs">{address}</span>
            : <span>{masked}</span>
          }
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2">
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/15 hover:bg-accent-blue/25 border border-accent-blue/30 text-accent-blue rounded-lg text-xs font-mono font-semibold transition-all flex-1 justify-center">
            <Copy size={11} /> Copy Address
          </button>
          <a href={`https://taostats.io/account/${address}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-600 border border-dark-500 hover:border-accent-blue/40 text-slate-300 hover:text-white rounded-lg text-xs font-mono transition-all">
            <ExternalLink size={11} /> Taostats
          </a>
        </div>
      </div>

      {/* Address segments — visual chunking for manual verification */}
      {!privacy && showFull && address && (
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
          <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wide mb-2">Segmented for verification</p>
          <div className="flex flex-wrap gap-1.5">
            {address.match(/.{1,8}/g)?.map((chunk, i) => (
              <span key={i} className={clsx(
                'font-mono text-xs px-2 py-0.5 rounded border',
                i === 0 ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue' :
                i === Math.floor(address.length / 8) ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' :
                'bg-dark-600 border-dark-500 text-slate-300'
              )}>
                {chunk}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 font-mono mt-2">First segment (blue) and last segment (green) are critical to verify</p>
        </div>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5">
        <Shield size={11} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
          Share this address only with people you expect to receive TAO from. 
          Unlike bank accounts, anyone can <em>verify</em> the on-chain balance of any address on Taostats — 
          never share your mnemonic, only this address.
        </p>
      </div>
    </div>
  )
}

type WalletTab = 'generate' | 'restore'
type HotWalletTab = 'overview' | 'send' | 'receive'

interface GeneratedWallet {
  mnemonic: string
  address:  string
}

export default function WalletPage() {
  const [chainInfo,  setChainInfo]  = useState<ChainInfo | null>(null)
  const [stakes,     setStakes]     = useState<StakesData | null>(null)
  const [stakesLoading, setStakesLoading] = useState(false)
  // Session XXXIV — Conviction-Era owner overlay for staking positions.
  const [ownersResp, setOwnersResp] = useState<WalletOwnersResp | null>(null)
  const [words,        setWords]        = useState<string[]>(Array(12).fill(''))
  const [showWords,  setShowWords]  = useState(false)
  const [showAddr,   setShowAddr]   = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [querying,   setQuerying]   = useState(false)
  const [taoPrice,   setTaoPrice]   = useState<number | null>(null)

  // Privacy mode — master toggle blurs all sensitive values.
  // Session XXXIV: backed by `usePrivacyMode` (localStorage + cross-component
  // sync) so the choice persists across navigation and follows the Operator
  // to WalletTransactions.  Default OFF — Operator opts INTO privacy.
  const [privacyMode, setPrivacyMode] = usePrivacyMode()

  // Hot wallet tab
  const [hotTab, setHotTab] = useState<HotWalletTab>('overview')

  // Generate wallet flow
  const [walletTab,    setWalletTab]    = useState<WalletTab>('restore')
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

  // Fetch live staking positions — enriched with alpha_price + tao_value
  const fetchStakes = useCallback(async () => {
    setStakesLoading(true)
    try {
      const { data } = await api.get<StakesData>('/wallet/stakes')
      setStakes(data)
    } catch {}
    finally { setStakesLoading(false) }
  }, [])

  // Session XXXIV — Conviction-Era owner snapshot. Soft-fail: a wallet that
  // can't reach /market/owners (cold cache, dev) still renders normally; we
  // simply skip the overlay rather than block the positions list.
  const fetchOwners = useCallback(async () => {
    try {
      const { data } = await api.get<WalletOwnersResp>('/market/owners')
      setOwnersResp(data)
    } catch {
      /* swallow — overlay is opportunistic */
    }
  }, [])

  useEffect(() => {
    loadStatus()
    fetchStakes()
    fetchOwners()
    // Also grab current TAO price for USD portfolio estimate
    api.get<{ price: number }>('/price/current')
      .then(r => setTaoPrice(r.data.price ?? null))
      .catch(() => {})
    const t = setInterval(() => { loadStatus(); fetchStakes(); fetchOwners() }, 30_000)
    return () => clearInterval(t)
  }, [loadStatus, fetchStakes, fetchOwners])

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

  const setWalletPageStats = useBotStore(s => s.setWalletPageStats)
  const stableQueryChain   = useCallback(() => { queryChain() }, [])

  const isConnected    = chainInfo?.connected ?? false
  const balance        = chainInfo?.balance_cached ?? 0
  const block          = chainInfo?.block_cached

  useEffect(() => {
    setWalletPageStats({ block: block ?? null, isConnected, querying, queryChain: stableQueryChain })
    return () => setWalletPageStats(null)
  }, [block, isConnected, querying, stableQueryChain, setWalletPageStats])

  const displayAddr    = chainInfo?.address || generated?.address || '—'
  const stakedTao      = stakes?.total_tao_value ?? 0
  const portfolioTotal = balance + stakedTao
  const usdValue       = taoPrice != null && balance ? balance * taoPrice : null
  const portfolioUsd   = taoPrice != null && portfolioTotal ? portfolioTotal * taoPrice : null

  // ── Session XXXIV: derive Conviction overlay state per position ───────────
  const ownerByNetuid = new Map<number, WalletOwnerRow>()
  ;(ownersResp?.owners ?? []).forEach(o => ownerByNetuid.set(o.netuid, o))
  const monitorSet = new Set<number>(ownersResp?.monitor_netuids ?? [])

  const positionConviction = (() => {
    const positions = stakes?.stakes ?? []
    if (!ownersResp || positions.length === 0) {
      return { monitored: 0, atRisk: 0, fortress: 0, total: positions.length }
    }
    let monitored = 0, atRisk = 0, fortress = 0
    for (const p of positions) {
      if (!monitorSet.has(p.netuid)) continue
      monitored += 1
      const band = ownerByNetuid.get(p.netuid)?.takeover_risk_band
      if (band === 'VULNERABLE' || band === 'CONTESTED') atRisk += 1
      if (band === 'FORTRESS') fortress += 1
    }
    return { monitored, atRisk, fortress, total: positions.length }
  })()

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex-1 overflow-y-auto bg-dark-900">

        {/* ── Top bar: chain status + privacy toggle ──────────────────────── */}
        <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur border-b border-dark-700 px-6 py-2.5 flex items-center gap-3">
          {/* Chain pill */}
          <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono',
            isConnected ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-400' : 'bg-dark-700 border-dark-600 text-slate-400')}>
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
            {isConnected ? `⛓ Finney · Block #${block?.toLocaleString() ?? '…'}` : '○ Chain offline'}
          </div>

          {balance != null && balance > 0 && (
            <span className="text-xs font-mono text-indigo-400 font-semibold">
              <PrivacyValue value={`τ ${balance.toFixed(6)}`} privacy={privacyMode} placeholder="τ ████████" />
            </span>
          )}

          {/* Privacy Mode toggle — right side */}
          <button
            onClick={() => setPrivacyMode(v => !v)}
            className={clsx(
              'ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all',
              privacyMode
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
                : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-white'
            )}
          >
            {privacyMode ? <EyeOff size={12} /> : <Eye size={12} />}
            {privacyMode ? 'Privacy ON' : 'Privacy OFF'}
          </button>

          <button onClick={queryChain} disabled={querying}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors" title="Refresh from chain">
            <RefreshCw size={13} className={querying ? 'animate-spin text-accent-blue' : ''} />
          </button>
        </div>

        <div className="p-6 space-y-5">

        {/* ══ HOT WALLET ════════════════════════════════════════════════════ */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">

          {/* Hot wallet header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-600 bg-gradient-to-r from-orange-500/8 via-transparent to-transparent">
            <div className="w-9 h-9 bg-orange-500/15 border border-orange-500/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <Flame size={17} className="text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-bold text-base">Hot Wallet</h2>
                <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded-full border',
                  chainInfo?.wallet_loaded
                    ? 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                    : 'bg-dark-600 border-dark-500 text-slate-400')}>
                  {chainInfo?.wallet_loaded ? '● ACTIVE' : '○ NOT LOADED'}
                </span>
              </div>
              <p className="text-slate-400 text-xs font-mono">TaoBot's active trading wallet — connected to Finney mainnet</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-dark-600">

            {/* LEFT PANEL: Balance + address + stats */}
            <div className="lg:col-span-2 p-5 space-y-4">

              {/* Big balance */}
              <div>
                <p className="text-[11px] text-slate-500 font-mono uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Lock size={10} /> Liquid Balance
                </p>
                <div className="flex items-baseline gap-2">
                  <span className={clsx('text-3xl font-black font-mono transition-all', balance > 0 ? 'text-white' : 'text-slate-600')}>
                    <PrivacyValue
                      value={balance > 0 ? `τ ${balance.toFixed(4)}` : 'τ —'}
                      privacy={privacyMode}
                      placeholder="τ ████████"
                      className="text-3xl font-black font-mono"
                    />
                  </span>
                  {usdValue != null && (
                    <span className="text-sm font-mono text-slate-400">
                      <PrivacyValue value={`≈ $${usdValue.toFixed(2)}`} privacy={privacyMode} placeholder="≈ $████" />
                    </span>
                  )}
                </div>
                {taoPrice && (
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">@ ${taoPrice.toFixed(2)} / TAO</p>
                )}
              </div>

              {/* Address */}
              <div className="bg-dark-700 border border-dark-600 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Coldkey Address</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setShowAddr(v => !v)}
                      className="text-slate-500 hover:text-white transition-colors p-0.5" title={showAddr ? 'Hide' : 'Reveal'}>
                      {showAddr ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(displayAddr); toast.success('Address copied') }}
                      className="text-slate-500 hover:text-accent-blue transition-colors p-0.5" title="Copy">
                      <Copy size={11} />
                    </button>
                    <a href={`https://taostats.io/account/${displayAddr}`} target="_blank" rel="noopener noreferrer"
                      className="text-slate-500 hover:text-accent-blue transition-colors p-0.5" title="Taostats">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
                <p className={clsx('text-xs font-mono transition-all break-all leading-relaxed',
                  privacyMode && !showAddr ? 'blur-sm select-none text-slate-300' :
                  showAddr ? 'text-slate-100' : 'text-slate-400'
                )}>
                  {(showAddr && !privacyMode) ? displayAddr : maskAddr(displayAddr)}
                </p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                  <p className="text-slate-500 font-mono mb-0.5">Staked</p>
                  <p className="text-purple-400 font-mono font-bold">
                    <PrivacyValue value={`τ ${stakedTao.toFixed(4)}`} privacy={privacyMode} placeholder="τ ████" />
                  </p>
                </div>
                <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                  <p className="text-slate-500 font-mono mb-0.5">Portfolio</p>
                  <p className="text-emerald-400 font-mono font-bold">
                    <PrivacyValue value={`τ ${portfolioTotal.toFixed(4)}`} privacy={privacyMode} placeholder="τ ████" />
                  </p>
                </div>
                <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                  <p className="text-slate-500 font-mono mb-0.5">Positions</p>
                  <p className="text-white font-mono font-bold">{stakes?.stakes?.length ?? 0} open</p>
                </div>
                <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                  <p className="text-slate-500 font-mono mb-0.5">Network</p>
                  <p className="text-accent-blue font-mono font-bold">Finney</p>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Send / Receive tabs */}
            <div className="lg:col-span-3 flex flex-col">
              {/* Tab bar */}
              <div className="flex border-b border-dark-600">
                {([
                  { id: 'overview', label: 'Overview',  icon: <WalletIcon size={12} /> },
                  { id: 'send',     label: 'Send',      icon: <ArrowUpRight size={12} /> },
                  { id: 'receive',  label: 'Receive',   icon: <ArrowDownLeft size={12} /> },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setHotTab(t.id)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs font-mono font-semibold transition-all',
                      hotTab === t.id
                        ? t.id === 'send'
                          ? 'bg-red-500/8 text-red-300 border-b-2 border-red-400'
                          : t.id === 'receive'
                          ? 'bg-accent-green/8 text-accent-green border-b-2 border-accent-green'
                          : 'bg-accent-blue/8 text-accent-blue border-b-2 border-accent-blue'
                        : 'text-slate-400 hover:text-white'
                    )}>
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 p-5">

                {/* OVERVIEW TAB */}
                {hotTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Total Portfolio', value: `τ ${portfolioTotal.toFixed(4)}`, sub: portfolioUsd ? `$${portfolioUsd.toFixed(2)}` : undefined, color: 'text-emerald-400' },
                        { label: 'Liquid TAO', value: `τ ${balance.toFixed(4)}`, sub: 'free · available', color: 'text-indigo-400' },
                        { label: 'Staked αTAO', value: `τ ${stakedTao.toFixed(4)}`, sub: `${stakes?.stakes?.length ?? 0} positions`, color: 'text-purple-400' },
                        { label: 'TAO Price', value: taoPrice ? `$${taoPrice.toFixed(2)}` : '—', sub: 'live · CoinGecko', color: 'text-yellow-400' },
                      ].map(card => (
                        <div key={card.label} className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                          <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wide mb-1">{card.label}</p>
                          <p className={clsx('font-bold font-mono text-base', card.color)}>
                            <PrivacyValue value={card.value} privacy={privacyMode && card.label !== 'TAO Price'} placeholder="████████" />
                          </p>
                          {card.sub && <p className="text-[11px] text-slate-500 font-mono mt-0.5">{card.sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Quick actions */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setHotTab('send')}
                        className="flex flex-col items-center gap-1.5 p-3 bg-dark-700 hover:bg-red-500/10 border border-dark-600 hover:border-red-500/30 rounded-xl transition-all group">
                        <ArrowUpRight size={16} className="text-slate-400 group-hover:text-red-300" />
                        <span className="text-[11px] font-mono text-slate-400 group-hover:text-red-300">Send TAO</span>
                      </button>
                      <button onClick={() => setHotTab('receive')}
                        className="flex flex-col items-center gap-1.5 p-3 bg-dark-700 hover:bg-accent-green/10 border border-dark-600 hover:border-accent-green/30 rounded-xl transition-all group">
                        <ArrowDownLeft size={16} className="text-slate-400 group-hover:text-accent-green" />
                        <span className="text-[11px] font-mono text-slate-400 group-hover:text-accent-green">Receive TAO</span>
                      </button>
                      <a href={`https://taostats.io/account/${displayAddr}`} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center gap-1.5 p-3 bg-dark-700 hover:bg-accent-blue/10 border border-dark-600 hover:border-accent-blue/30 rounded-xl transition-all group">
                        <Globe size={16} className="text-slate-400 group-hover:text-accent-blue" />
                        <span className="text-[11px] font-mono text-slate-400 group-hover:text-accent-blue">Taostats</span>
                      </a>
                    </div>

                    {/* Staking positions summary */}
                    {stakes?.stakes && stakes.stakes.length > 0 && (
                      <div className="bg-dark-700 border border-dark-600 rounded-xl p-4">
                        <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                          <Zap size={10} /> Active Staking Positions
                        </p>
                        <div className="space-y-1.5">
                          {stakes.stakes.map((pos, i) => (
                            <div key={i} className="flex items-center justify-between text-xs font-mono">
                              <span className="text-slate-400">SN{pos.netuid} · {pos.hotkey.slice(0,10)}…</span>
                              <div className="flex items-center gap-3">
                                <span className="text-purple-400">
                                  <PrivacyValue value={`${pos.stake.toFixed(4)} α`} privacy={privacyMode} placeholder="████ α" />
                                </span>
                                <span className="text-slate-500">
                                  <PrivacyValue value={`≈ τ${pos.tao_value.toFixed(4)}`} privacy={privacyMode} placeholder="≈ τ████" />
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SEND TAB */}
                {hotTab === 'send' && (
                  <div>
                    {!chainInfo?.wallet_loaded ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                        <Lock size={28} className="text-slate-500" />
                        <p className="text-slate-400 text-sm">Restore your wallet mnemonic first</p>
                        <button onClick={() => setWalletTab('restore')} className="text-xs text-accent-blue font-mono hover:underline">
                          Go to Key Management →
                        </button>
                      </div>
                    ) : (
                      <SendPanel balance={balance} privacy={privacyMode} onDone={() => { loadStatus(); fetchStakes() }} />
                    )}
                  </div>
                )}

                {/* RECEIVE TAB */}
                {hotTab === 'receive' && (
                  <ReceivePanel address={displayAddr} privacy={privacyMode} />
                )}

              </div>
            </div>
          </div>
        </div>

        {/* ══ TWO-COLUMN: Key Management | Portfolio ════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* KEY MANAGEMENT ─────────────────────────────────────────────── */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-600">
              <div className="w-8 h-8 bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <KeyRound size={15} className="text-slate-300" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm">Key Management</h2>
                <p className="text-slate-500 text-xs font-mono">Cold key — generate or restore wallet mnemonic</p>
              </div>
            </div>

            <div className="p-5">
              {/* Tab switcher */}
              <div className="flex gap-1 mb-5 bg-dark-900 rounded-lg p-1">
                <button onClick={() => setWalletTab('restore')}
                  className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all',
                    walletTab === 'restore' ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30' : 'text-slate-500 hover:text-slate-300')}>
                  <RotateCcw size={11} /> Restore Wallet
                </button>
                <button onClick={() => setWalletTab('generate')}
                  className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all',
                    walletTab === 'generate' ? 'bg-accent-green/15 text-accent-green border border-accent-green/30' : 'text-slate-500 hover:text-slate-300')}>
                  <Sparkles size={11} /> Generate New
                </button>
              </div>

              {/* ── RESTORE TAB ──────────────────────────────────────────── */}
              {walletTab === 'restore' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                    <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-300/90 leading-snug font-mono">
                      <strong>Bot wallet only.</strong> Never enter your personal wallet phrase here. This runs on a server.
                    </p>
                  </div>

                  {/* Progress + reveal row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{wordCount} / 12 words</span>
                    <button onClick={() => setShowWords(!showWords)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors">
                      {showWords ? <EyeOff size={11} /> : <Eye size={11} />}
                      {showWords ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {/* Dummy honeypot fields */}
                  <input type="text" name="username" style={{ display: 'none' }} readOnly tabIndex={-1} aria-hidden="true" />
                  <input type="password" name="password" style={{ display: 'none' }} readOnly tabIndex={-1} aria-hidden="true" />

                  <div className="grid grid-cols-3 gap-2">
                    {words.map((w, i) => (
                      <div key={i} className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-600 font-mono select-none">{i + 1}.</span>
                        <input
                          type="text"
                          value={showWords ? w : w ? '•'.repeat(Math.max(4, w.length)) : ''}
                          onChange={e => handleWordChange(i, e.target.value)}
                          placeholder={`word ${i + 1}`}
                          autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                          data-form-type="other" data-lpignore="true" name={`mnemonic-word-${i}`}
                          className="w-full min-h-[38px] pl-6 pr-2 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-[11px] font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-accent-blue transition-colors"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue rounded-full transition-all duration-300"
                      style={{ width: `${(wordCount / 12) * 100}%` }} />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleSaveMnemonic} disabled={!mnemonicOk || busy || saved}
                      className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border flex-1',
                        mnemonicOk && !saved ? 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25' : 'bg-dark-700 text-slate-500 border-dark-600 cursor-not-allowed')}>
                      {saved ? <CheckCircle2 size={13} /> : busy ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />}
                      {saved ? 'Wallet Restored ✓' : busy ? 'Restoring…' : 'Restore Wallet'}
                    </button>
                    <button onClick={clearWords} className="px-4 py-2.5 rounded-lg text-xs text-slate-400 border border-dark-600 hover:text-white hover:border-dark-500 transition-colors">
                      Clear
                    </button>
                  </div>

                  {saved && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-xs text-accent-green font-mono">
                      <CheckCircle2 size={11} /> Wallet restored — active until next redeploy. Store mnemonic in Railway ENV for persistence.
                    </div>
                  )}
                </div>
              )}

              {/* ── GENERATE TAB ─────────────────────────────────────────── */}
              {walletTab === 'generate' && (
                <div className="space-y-4">
                  {!generated ? (
                    <>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Creates a fresh Bittensor wallet. Only fund it with trading capital — never your personal holdings.
                        The 12-word phrase is shown <strong className="text-white">exactly once</strong>.
                      </p>
                      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                        <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-300/90 leading-snug font-mono">
                          Write the 12 words on paper and store offline before continuing. Cannot be recovered if lost.
                        </p>
                      </div>
                      <button onClick={handleGenerate} disabled={generating}
                        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-accent-green/15 border border-accent-green/40 text-accent-green font-bold text-sm hover:bg-accent-green/25 transition-all disabled:opacity-50">
                        {generating ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate New Bot Wallet</>}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <AlertTriangle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-300 font-semibold font-mono">Write these 12 words NOW — only shown once</p>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {generated.mnemonic.split(' ').map((word, i) => (
                          <div key={i} className="bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-600 font-mono w-4 flex-shrink-0">{i + 1}.</span>
                            <span className={clsx('text-xs font-mono font-semibold text-slate-100 transition-all', !showGenWords && 'blur-sm select-none')}>
                              {word}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowGenWords(v => !v)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors">
                          {showGenWords ? <EyeOff size={11} /> : <Eye size={11} />}
                          {showGenWords ? 'Hide' : 'Reveal'}
                        </button>
                        <button onClick={copyGenMnemonic}
                          className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-blue-300 font-mono transition-colors ml-auto">
                          <Copy size={11} /> Copy 12 words
                        </button>
                      </div>

                      <label className={clsx('flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
                        backedUp ? 'bg-accent-green/10 border-accent-green/30' : 'bg-dark-700 border-dark-500 hover:border-slate-500')}>
                        <input type="checkbox" checked={backedUp}
                          onChange={e => { setBackedUp(e.target.checked); if (e.target.checked) setShowNewAddr(true) }}
                          className="mt-0.5 accent-emerald-400" />
                        <span className={clsx('text-xs leading-snug', backedUp ? 'text-accent-green' : 'text-slate-300')}>
                          ✓ Written all 12 words down and stored them offline safely
                        </span>
                      </label>

                      {backedUp && (
                        <div className="bg-dark-700 border border-accent-green/20 rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-1.5 text-accent-green text-xs font-semibold">
                            <CheckCircle2 size={12} /> Wallet ready — fund this address
                          </div>
                          <div className="flex items-center gap-2 bg-dark-900 rounded-lg px-2.5 py-2 border border-dark-500">
                            <code className={clsx('text-[11px] font-mono flex-1 transition-all', showNewAddr ? 'text-slate-100' : 'text-slate-500')}>
                              {showNewAddr ? generated.address : maskAddr(generated.address)}
                            </code>
                            <button onClick={() => setShowNewAddr(v => !v)} className="text-slate-500 hover:text-white transition-colors">
                              {showNewAddr ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            <button onClick={copyGenAddress} className="text-slate-500 hover:text-accent-blue transition-colors">
                              <Copy size={11} />
                            </button>
                          </div>
                          <button onClick={() => { setGenerated(null); setBackedUp(false) }}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 font-mono transition-colors">
                            <RotateCcw size={10} /> Generate a different one
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PORTFOLIO ──────────────────────────────────────────────────── */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-600">
              <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <PieChart size={15} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm">Portfolio</h2>
                <p className="text-slate-500 text-xs font-mono">Liquid + staked positions · {taoPrice ? `$${taoPrice.toFixed(2)}/TAO` : 'price loading…'}</p>
              </div>
              <button onClick={fetchStakes} className="ml-auto text-slate-400 hover:text-white p-1 transition-colors" title="Refresh positions">
                <RefreshCw size={12} className={stakesLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Big total */}
              <div className="bg-dark-700 border border-emerald-500/15 rounded-xl p-4">
                <p className="text-[11px] text-slate-400 font-mono uppercase tracking-widest mb-1">Total Portfolio Value</p>
                <div className="flex items-end justify-between">
                  <span className={clsx('text-3xl font-black font-mono', portfolioTotal > 0 ? 'text-emerald-400' : 'text-slate-600')}>
                    <PrivacyValue value={portfolioTotal > 0 ? `τ ${portfolioTotal.toFixed(4)}` : 'τ —'} privacy={privacyMode} placeholder="τ ████████" />
                  </span>
                  <span className={clsx('text-sm font-mono pb-0.5', portfolioUsd != null ? 'text-emerald-300' : 'text-slate-600')}>
                    <PrivacyValue value={portfolioUsd != null ? `$${portfolioUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$ —'} privacy={privacyMode} placeholder="$████████" />
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] font-mono text-slate-500">
                  <span>Liquid: <PrivacyValue value={`τ${balance.toFixed(4)}`} privacy={privacyMode} className="text-indigo-400" /></span>
                  <span>+</span>
                  <span>Staked: <PrivacyValue value={`τ${stakedTao.toFixed(4)}`} privacy={privacyMode} className="text-purple-400" /></span>
                </div>
              </div>

              {/* Positions */}
              {stakes?.stakes && stakes.stakes.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wide">Staking Positions</p>
                    {ownersResp && positionConviction.monitored > 0 && (
                      <span
                        className="text-[10px] font-mono text-slate-500"
                        title="Conviction-Era owner watch — only subnets in MONITOR_OWNERS_NETUIDS are graded"
                      >
                        <Shield size={9} className="inline mr-1 -mt-px text-slate-500" />
                        {positionConviction.monitored}/{positionConviction.total} monitored
                      </span>
                    )}
                  </div>

                  {/* Conviction summary banner — only render when at least one
                      staked position lands in MONITOR_OWNERS_NETUIDS so we
                      don't add chrome for irrelevant data. */}
                  {ownersResp && positionConviction.monitored > 0 && (
                    <div
                      className={clsx(
                        'rounded-lg border px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono',
                        positionConviction.atRisk > 0
                          ? 'bg-red-500/5 border-red-500/30 text-red-300'
                          : positionConviction.fortress > 0
                            ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300'
                            : 'bg-slate-800/40 border-slate-700/40 text-slate-400'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {positionConviction.atRisk > 0 ? (
                          <AlertTriangle size={11} />
                        ) : (
                          <ShieldCheck size={11} />
                        )}
                        {positionConviction.atRisk > 0
                          ? `${positionConviction.atRisk} position${positionConviction.atRisk > 1 ? 's' : ''} on contested/vulnerable subnets`
                          : positionConviction.fortress > 0
                            ? `All monitored positions on FORTRESS-grade subnets`
                            : 'Conviction-Era watch active'}
                      </span>
                      <span className="text-slate-500">
                        ≥{ownersResp.conviction_unlock_drop_pct}% drop · ≥{ownersResp.conviction_unlock_min_tao}τ → alert
                      </span>
                    </div>
                  )}

                  {stakes.stakes.map((pos, i) => {
                    const pct = portfolioTotal > 0 ? (pos.tao_value / portfolioTotal) * 100 : 0
                    const owner = ownerByNetuid.get(pos.netuid)
                    const isMonitored = monitorSet.has(pos.netuid)
                    return (
                      <div key={i} className="bg-dark-700 border border-dark-600 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono font-bold text-white">SN{pos.netuid}</span>
                            {/* Risk pill — only show for monitored subnets that
                                have a populated band. Unmonitored positions
                                stay clean (no pill). */}
                            {isMonitored && owner?.takeover_risk_band && (
                              <span
                                className={clsx(
                                  'px-1.5 py-[1px] rounded border text-[9px] font-mono uppercase tracking-wide',
                                  ownerBandStyle(owner.takeover_risk_band)
                                )}
                                title={
                                  owner.owner_share != null
                                    ? `Owner share: ${(owner.owner_share * 100).toFixed(1)}% · Risk score: ${owner.takeover_risk_score?.toFixed(2) ?? '—'}`
                                    : `Conviction band: ${owner.takeover_risk_band}`
                                }
                              >
                                {ownerBandLabel(owner.takeover_risk_band)}
                              </span>
                            )}
                            {owner?.subnet_name && (
                              <span className="text-[10px] font-mono text-slate-400 truncate">{owner.subnet_name}</span>
                            )}
                            <span className="text-[10px] font-mono text-slate-500 truncate max-w-[100px]">{pos.hotkey.slice(0, 10)}…</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono font-bold text-purple-400">
                              <PrivacyValue value={`${pos.stake.toFixed(5)} α`} privacy={privacyMode} placeholder="██████ α" />
                            </p>
                            <p className="text-[10px] font-mono text-slate-500">
                              <PrivacyValue value={`≈ τ${pos.tao_value.toFixed(4)}`} privacy={privacyMode} placeholder="≈ τ████" />
                            </p>
                          </div>
                        </div>
                        <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-slate-600 font-mono">{pct.toFixed(1)}% of portfolio</p>
                          {isMonitored && owner?.owner_share != null && (
                            <p className="text-[10px] text-slate-600 font-mono">
                              owner: {(owner.owner_share * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                  <Activity size={20} className="text-slate-600" />
                  <p className="text-slate-500 text-xs font-mono">No open staking positions</p>
                  <p className="text-slate-600 text-[10px] font-mono">Positions appear here when the bot executes live trades</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recovery Tracker relocated → P&L Summary page */}

        {/* ── Network & Identity (relocated from Settings, per Session XXV spec) ── */}
        <NetworkIdentityPanel />

        </div>{/* end inner padding */}
      </div>{/* end scrollable */}
    </div>
  )
}