import { useEffect, useState, useCallback } from 'react'
import {
  AlertTriangle, ShieldOff, ShieldCheck, TrendingUp, TrendingDown,
  ArrowUp, ArrowDown, RefreshCw, Zap, Play, Square,
  ChevronRight, CheckCircle2, XCircle, FlaskConical, Flame, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'
import PageHeroSlider from '@/components/PageHeroSlider'

// ── types ─────────────────────────────────────────────────────────────────────
interface OverrideStatus {
  emergency_halted: boolean
  halted_at: string | null
  cycle_engine_running: boolean
  trading_engine_running: boolean
}

interface StrategyRow {
  name: string
  display_name: string
  mode: 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'PENDING_LIVE_APPROVAL' | 'LIVE'
  win_rate: number
  total_trades: number
  total_pnl: number
  stake_amount?: number | null
}

// ── constants ─────────────────────────────────────────────────────────────────
const MODE_ORDER = ['PAPER_ONLY', 'APPROVED_FOR_LIVE', 'LIVE']
const MODE_META: Record<string, { label: string; prefix: string; badge: string; short: string }> = {
  PAPER_ONLY:        { label: 'PAPER',    prefix: '◌', short: 'PAPER',    badge: 'bg-slate-700/60 text-slate-300 border-slate-600' },
  APPROVED_FOR_LIVE: { label: 'APPROVED', prefix: '◑', short: 'APPROVED', badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' },
  LIVE:              { label: 'LIVE',     prefix: '●', short: 'LIVE',     badge: 'bg-accent-green/10 text-accent-green border-accent-green/30' },
}

const STRATEGIES_LIST = [
  'momentum_cascade', 'dtao_flow_momentum', 'liquidity_hunter', 'breakout_hunter',
  'yield_maximizer', 'contrarian_flow', 'volatility_arb', 'sentiment_surge',
  'balanced_risk', 'mean_reversion', 'emission_momentum', 'macro_correlation',
]

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTao(n: number | null | undefined) {
  const _n = n ?? 0; const s = Math.abs(_n).toFixed(4)
  return _n >= 0 ? `+${s} τ` : `-${s} τ`
}

// ── sub-components ────────────────────────────────────────────────────────────
function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('w-2 h-2 rounded-full', on ? 'bg-accent-green animate-pulse' : 'bg-red-500')} />
      <span className="text-xs font-mono text-slate-300">{label}</span>
      <span className={clsx('text-xs font-mono font-bold', on ? 'text-accent-green' : 'text-red-400')}>
        {on ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  )
}

function ModeStep({
  mode, active, onClick, pending,
}: {
  mode: string; active: boolean; onClick?: () => void; pending?: boolean
}) {
  const m = MODE_META[mode]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active || pending}
      title={active ? `Already at ${m.label}` : `Set to ${m.label}`}
      className={clsx(
        'px-2 py-0.5 rounded border text-[13px] font-mono font-bold transition-all',
        active
          ? m.badge + ' cursor-default'
          : pending
            ? 'bg-dark-900 text-slate-500 border-dark-700 cursor-wait opacity-60'
            : 'bg-dark-900 text-slate-500 border-dark-700 hover:border-slate-500 hover:text-slate-300 cursor-pointer active:scale-95',
      )}
    >
      {pending ? '…' : `${m.prefix} ${m.short}`}
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function HumanOverride() {
  const { strategies, fetchStrategies } = useBotStore()

  const [status,         setStatus]         = useState<OverrideStatus | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [halting,        setHalting]        = useState(false)
  const [resuming,       setResuming]       = useState(false)
  const [promoCheck,     setPromoCheck]     = useState(false)
  const [forcePaper,     setForcePaper]     = useState(false)
  const [togglingPaper,  setTogglingPaper]  = useState(false)
  const [resettingStats, setResettingStats] = useState(false)

  // manual trade form
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy')
  const [tradeAmt,    setTradeAmt]    = useState('')
  const [tradeReason, setTradeReason] = useState('')
  const [tradingNow,  setTradingNow]  = useState(false)
  const [confirmTrade, setConfirmTrade] = useState(false)

  // promote / demote
  const [opPending, setOpPending] = useState<string | null>(null)

  // inline stake editing
  const [stakeEditing, setStakeEditing] = useState<string | null>(null)
  const [stakeInput,   setStakeInput]   = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const [ovRes, botRes] = await Promise.all([
        api.get('/override/status'),
        api.get('/bot/status'),
      ])
      setStatus(ovRes.data)
      setForcePaper(botRes.data.force_paper_mode ?? false)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchStrategies()
    const id = setInterval(fetchStatus, 8000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchStrategies])

  // ── actions ──────────────────────────────────────────────────────────────

  async function doForcePaper() {
    if (!window.confirm(
      'FORCE PAPER MODE\n\nThis will:\n• Block ALL real on-chain execution immediately\n• Reset every strategy to PAPER_ONLY\n• Keep the cycle engine running (paper stats still accrue)\n\nConfirm?'
    )) return
    setTogglingPaper(true)
    try {
      await api.post('/bot/force-paper')
      setForcePaper(true)
      fetchStrategies()
      toast.success('🛑 Paper mode override active — no live trades will fire', { duration: 8000 })
    } catch { toast.error('Failed to activate paper override') }
    finally { setTogglingPaper(false) }
  }

  async function doResetPaperStats() {
    if (!window.confirm(
      'RESET PAPER STATS\n\nThis will:\n• Wipe all strategy win rates, PnL, and cycle counts\n• Delete all paper trade history\n• Reset every strategy to PAPER_ONLY\n\nUse this to clear contaminated data from the old biased simulation.\nLive trades with tx_hash are preserved.\n\nConfirm?'
    )) return
    setResettingStats(true)
    try {
      await api.post('/bot/reset-paper-stats')
      fetchStrategies()
      toast.success('🗑️ Paper stats wiped — clean slate for honest simulation', { duration: 6000 })
    } catch { toast.error('Reset failed') }
    finally { setResettingStats(false) }
  }

  async function doResumeLive() {
    if (!window.confirm(
      'LIFT PAPER OVERRIDE\n\nThis allows strategies to re-earn LIVE status through the gate system.\nNo strategies will immediately go live — they must pass gate thresholds again.\n\nConfirm?'
    )) return
    setTogglingPaper(true)
    try {
      await api.post('/bot/resume-live')
      setForcePaper(false)
      toast.success('✅ Paper override lifted — gate system active, strategies must re-earn LIVE status')
    } catch { toast.error('Failed to lift paper override') }
    finally { setTogglingPaper(false) }
  }

  async function doEmergencyStop() {
    if (!window.confirm('EMERGENCY STOP — halt ALL trading right now?\n\nThis is immediate. Click OK to confirm.')) return
    setHalting(true)
    try {
      await api.post('/override/emergency-stop')
      toast.error('🚨 EMERGENCY STOP activated', { duration: 6000 })
      fetchStatus()
    } catch { toast.error('Emergency stop failed') }
    finally { setHalting(false) }
  }

  async function doResume() {
    setResuming(true)
    try {
      await api.post('/override/resume')
      toast.success('✅ Trading resumed')
      fetchStatus()
    } catch { toast.error('Resume failed') }
    finally { setResuming(false) }
  }

  async function doManualTrade() {
    const amount = parseFloat(tradeAmt)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (!confirmTrade) { setConfirmTrade(true); return }

    setTradingNow(true)
    setConfirmTrade(false)
    try {
      const res = await api.post('/override/trade', {
        action: tradeAction,
        amount,
        reason: tradeReason || `Human override — manual ${tradeAction}`,
      })
      if (res.data.success) {
        toast.success(`✅ Manual ${tradeAction.toUpperCase()} ${amount} τ @ $${res.data.price?.toFixed(2)} executed`)
        setTradeAmt('')
        setTradeReason('')
      } else {
        toast.error(`Trade failed: ${res.data.message}`)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Trade request failed')
    }
    finally { setTradingNow(false) }
  }

  async function doPromote(name: string) {
    setOpPending(name + '_up')
    try {
      const res = await api.post(`/override/promote/${name}`)
      if (res.data.success) {
        toast.success(res.data.message)
        fetchStrategies()
      } else {
        toast(`${res.data.message}`, { icon: '⚠️' })
      }
    } catch { toast.error('Promotion failed') }
    finally { setOpPending(null) }
  }

  async function doDemote(name: string) {
    setOpPending(name + '_down')
    try {
      const res = await api.post(`/override/demote/${name}`)
      if (res.data.success) {
        toast.success(res.data.message)
        fetchStrategies()
      } else {
        toast(`${res.data.message}`, { icon: '⚠️' })
      }
    } catch { toast.error('Demotion failed') }
    finally { setOpPending(null) }
  }

  async function doSetMode(name: string, mode: 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE') {
    const key = name + '_' + mode
    setOpPending(key)
    try {
      const res = await api.post(`/override/set-mode/${name}`, { mode })
      if (res.data.success) {
        toast.success(res.data.message)
        fetchStrategies()
      } else {
        toast(res.data.message, { icon: '⚠️' })
      }
    } catch { toast.error('Mode change failed') }
    finally { setOpPending(null) }
  }

  async function doForcePromoCheck() {
    setPromoCheck(true)
    try {
      await api.post('/override/force-promote-check')
      toast.success('🔍 Promotion gate check completed')
      fetchStrategies()
    } catch { toast.error('Check failed') }
    finally { setPromoCheck(false) }
  }

  async function doSetStake(name: string) {
    const amount = parseFloat(stakeInput)
    if (isNaN(amount) || amount < 0.001) { toast.error('Minimum stake is 0.001 τ'); return }
    if (amount > 1.0) { toast.error('Max override stake is 1.0 τ — protect the wallet'); return }
    try {
      await api.put(`/strategies/${name}`, { stake_amount: amount })
      toast.success(`✅ ${name}: stake → ${amount.toFixed(4)} τ/trade`)
      setStakeEditing(null)
      setStakeInput('')
      fetchStrategies()
    } catch { toast.error('Failed to update stake') }
  }

  const halted = status?.emergency_halted ?? false

  // build strategy rows from store
  const rows: StrategyRow[] = STRATEGIES_LIST.map(name => {
    const s = strategies.find(x => x.name === name)
    return s
      ? { name: s.name, display_name: s.display_name, mode: s.mode, win_rate: s.win_rate, total_trades: s.total_trades, total_pnl: s.total_pnl, stake_amount: s.stake_amount }
      : { name, display_name: name, mode: 'PAPER_ONLY' as const, win_rate: 0, total_trades: 0, total_pnl: 0, stake_amount: null }
  })

  const liveCount     = rows.filter(r => r.mode === 'LIVE').length
  const approvedCount = rows.filter(r => r.mode === 'APPROVED_FOR_LIVE').length
  const paperCount    = rows.filter(r => r.mode === 'PAPER_ONLY').length

  const heroSlides = [
    {
      title: 'System Status', subtitle: 'Command Authority', accent: halted ? 'red' : 'emerald' as any,
      stats: [
        { label: 'System',          value: halted ? '⛔ HALTED' : '✓ Running',                   color: halted ? 'red' : 'emerald' as any },
        { label: 'Cycle Engine',    value: status?.cycle_engine_running   ? '✓ Online' : '✗ Off', color: status?.cycle_engine_running   ? 'emerald' : 'red' as any },
        { label: 'Trading Engine',  value: status?.trading_engine_running ? '✓ Online' : '✗ Off', color: status?.trading_engine_running ? 'emerald' : 'red' as any },
        { label: 'Override Gate',   value: halted ? '⛔ Closed' : '✓ Open',                      color: halted ? 'red' : 'emerald' as any },
        { label: 'Strategies',      value: String(rows.length),                                   color: 'white'   as const },
      ],
    },
    {
      title: 'Mode Distribution', subtitle: 'Strategy Modes', accent: forcePaper ? 'yellow' as const : 'purple' as const,
      stats: [
        { label: 'Override',  value: forcePaper ? 'PAPER LOCK' : 'None',  color: forcePaper ? 'yellow' : 'slate' as any },
        { label: 'LIVE',      value: String(liveCount),                    color: forcePaper ? 'slate' : 'emerald' as any },
        { label: 'APPROVED',  value: String(approvedCount),                color: 'purple'  as const },
        { label: 'PAPER',     value: String(paperCount),                   color: 'yellow'  as const },
        { label: 'Status',    value: forcePaper ? 'PAPER ONLY' : halted ? 'HALTED' : 'Active', color: forcePaper ? 'yellow' : halted ? 'red' : 'emerald' as any },
      ],
    },
    {
      title: 'Manual Controls', subtitle: 'Override Tools', accent: 'orange' as const,
      stats: [
        { label: 'Halt Control',  value: halted ? 'Release Ready' : 'Halt Ready',  color: halted ? 'yellow' : 'orange' as any },
        { label: 'Mode Override', value: 'Available',                               color: 'blue'    as const },
        { label: 'Manual Trade',  value: 'Available',                               color: 'emerald' as const },
        { label: 'Live Bots',     value: String(liveCount),                         color: liveCount > 0 ? 'emerald' : 'slate' as any },
        { label: 'Authority',     value: 'Full Override',                           color: 'orange'  as const },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── PAPER MODE OVERRIDE BANNER ──────────────────────────────────────── */}
      <div className={clsx(
        'rounded-xl border p-5 transition-all',
        forcePaper
          ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
          : 'bg-dark-800 border-dark-600',
      )}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0',
              forcePaper ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-dark-700 border border-dark-600',
            )}>
              {forcePaper
                ? <FlaskConical size={18} className="text-amber-400" />
                : <Flame size={18} className="text-accent-green" />
              }
            </div>
            <div>
              <p className={clsx(
                'text-sm font-bold font-mono uppercase tracking-wider',
                forcePaper ? 'text-amber-400' : 'text-accent-green',
              )}>
                {forcePaper ? '🛑 Paper Mode Override — Active' : '🔴 Live Trading Active'}
              </p>
              <p className="text-[13px] text-slate-400 font-mono mt-0.5">
                {forcePaper
                  ? 'All on-chain execution is blocked. Strategies are running paper simulation only. No TAO will be spent.'
                  : 'Strategies in LIVE mode are executing real on-chain stake() calls. TAO is being spent on every approved signal.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {forcePaper ? (
              <button
                onClick={doResumeLive}
                disabled={togglingPaper}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-green/15 border border-accent-green/40 text-accent-green text-sm font-bold font-mono hover:bg-accent-green/25 transition-all disabled:opacity-50"
              >
                {togglingPaper ? <RefreshCw size={13} className="animate-spin" /> : <Flame size={13} />}
                {togglingPaper ? 'Lifting…' : 'Resume Gate System'}
              </button>
            ) : (
              <button
                onClick={doForcePaper}
                disabled={togglingPaper || halted}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold font-mono hover:bg-amber-500/25 transition-all disabled:opacity-50"
              >
                {togglingPaper ? <RefreshCw size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {togglingPaper ? 'Activating…' : 'Force Paper Mode'}
              </button>
            )}
          </div>
        </div>

        {/* Paper mode detail chips */}
        {forcePaper && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-amber-500/20">
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[13px] font-mono">
              ✓ Live gate blocked
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[13px] font-mono">
              ✓ Auto-promotion suspended
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[13px] font-mono">
              ✓ Honest simulation active
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[13px] font-mono">
              ✓ No TAO at risk
            </span>
            <button
              onClick={doResetPaperStats}
              disabled={resettingStats}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[13px] font-mono hover:bg-red-500/20 transition-colors disabled:opacity-50"
              title="Wipe contaminated stats from old biased simulation — start fresh"
            >
              {resettingStats ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {resettingStats ? 'Resetting…' : 'Reset Paper Stats'}
            </button>
          </div>
        )}
      </div>

      {/* ── system status bar ───────────────────────────────────────────────── */}
      <div className={clsx(
        'rounded-xl border px-5 py-4',
        halted
          ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
          : 'bg-dark-800 border-dark-600',
      )}>
        <div className="flex flex-wrap items-center gap-6">
          {halted ? (
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-400 animate-pulse" />
              <div>
                <p className="text-sm font-bold text-red-400 font-mono">EMERGENCY HALT ACTIVE</p>
                {status?.halted_at && (
                  <p className="text-[13px] text-red-400/60 font-mono">Halted at {status.halted_at.replace('T', ' ').slice(0, 19)} UTC</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent-green" />
              <span className="text-sm font-bold text-accent-green font-mono">SYSTEM OPERATIONAL</span>
            </div>
          )}
          <div className="flex flex-wrap gap-6 ml-auto">
            {status && <>
              <StatusDot on={status.cycle_engine_running}   label="Cycle Engine" />
              <StatusDot on={status.trading_engine_running} label="Trading Engine" />
              <StatusDot on={!halted}                       label="Override Gate" />
            </>}
          </div>
        </div>
      </div>

      {/* ── Row 1: 3 control boxes side by side ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Emergency controls */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-400" /> Emergency Controls
          </h2>
          {!halted ? (
            <button
              onClick={doEmergencyStop}
              disabled={halting}
              className={clsx(
                'w-full py-4 rounded-xl border-2 font-bold text-sm font-mono transition-all',
                'bg-red-500/10 border-red-500/50 text-red-400',
                'hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
                'active:scale-[0.98]',
                halting && 'opacity-50 cursor-not-allowed',
              )}
            >
              {halting
                ? <span className="flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" /> Halting…</span>
                : <span className="flex items-center justify-center gap-2"><Square size={14} fill="currentColor" /> 🚨 EMERGENCY STOP</span>
              }
            </button>
          ) : (
            <button
              onClick={doResume}
              disabled={resuming}
              className={clsx(
                'w-full py-4 rounded-xl border-2 font-bold text-sm font-mono transition-all',
                'bg-accent-green/10 border-accent-green/50 text-accent-green',
                'hover:bg-accent-green/20 hover:border-accent-green hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]',
                'active:scale-[0.98]',
                resuming && 'opacity-50 cursor-not-allowed',
              )}
            >
              {resuming
                ? <span className="flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" /> Resuming…</span>
                : <span className="flex items-center justify-center gap-2"><Play size={14} fill="currentColor" /> ✅ RESUME TRADING</span>
              }
            </button>
          )}
          <p className="text-[13px] text-slate-500 font-mono leading-relaxed">
            Emergency Stop halts the cycle engine and trading engine immediately. No new trades will execute until Resume is called.
          </p>
        </div>

        {/* Fleet controls */}
        <div className="card p-5 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Zap size={13} className="text-accent-blue" /> Fleet Controls
          </h2>
          <button
            onClick={doForcePromoCheck}
            disabled={promoCheck}
            className="w-full flex items-center justify-between px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg hover:border-yellow-400/40 hover:bg-yellow-400/5 transition-all text-sm font-mono text-slate-300 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck size={13} className={clsx('text-yellow-400', promoCheck && 'animate-spin')} />
              Force Promotion Gate Check
            </span>
            <ChevronRight size={13} className="text-slate-500" />
          </button>
          <p className="text-[13px] text-slate-500 font-mono">
            Gate check evaluates all 12 strategies for promotion eligibility right now, bypassing the 5-minute throttle. Capital rebalances automatically every 24h and on every promote/demote.
          </p>
        </div>

        {/* Manual trade */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={13} className="text-accent-green" /> Manual Trade
          </h2>
          {halted && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle size={11} className="text-red-400" />
              <span className="text-[14px] text-red-400 font-mono">System halted — resume before trading</span>
            </div>
          )}
          <div className="flex rounded-lg overflow-hidden border border-dark-600">
            <button
              onClick={() => { setTradeAction('buy'); setConfirmTrade(false) }}
              className={clsx('flex-1 py-2.5 text-sm font-bold font-mono transition-all flex items-center justify-center gap-1.5',
                tradeAction === 'buy' ? 'bg-accent-green/20 text-accent-green' : 'text-slate-500 hover:text-slate-300')}
            >
              <TrendingUp size={14} /> BUY
            </button>
            <button
              onClick={() => { setTradeAction('sell'); setConfirmTrade(false) }}
              className={clsx('flex-1 py-2.5 text-sm font-bold font-mono transition-all flex items-center justify-center gap-1.5',
                tradeAction === 'sell' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-slate-300')}
            >
              <TrendingDown size={14} /> SELL
            </button>
          </div>
          <div>
            <label className="text-[13px] text-slate-400 uppercase tracking-wider font-mono block mb-1.5">Amount (τ)</label>
            <input type="number" min="0" step="0.001" value={tradeAmt}
              onChange={e => { setTradeAmt(e.target.value); setConfirmTrade(false) }}
              placeholder="e.g. 0.005"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-blue/50"
            />
          </div>
          <div>
            <label className="text-[13px] text-slate-400 uppercase tracking-wider font-mono block mb-1.5">Reason (optional)</label>
            <input type="text" value={tradeReason} onChange={e => setTradeReason(e.target.value)}
              placeholder="Human override — manual buy"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-blue/50"
            />
          </div>
          <button
            onClick={doManualTrade}
            disabled={tradingNow || halted || !tradeAmt}
            className={clsx(
              'w-full py-3 rounded-xl font-bold text-sm font-mono transition-all flex items-center justify-center gap-2',
              confirmTrade
                ? tradeAction === 'buy'
                  ? 'bg-accent-green text-dark-900 shadow-[0_0_16px_rgba(52,211,153,0.4)] animate-pulse'
                  : 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.4)] animate-pulse'
                : tradeAction === 'buy'
                  ? 'bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25'
                  : 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25',
              (tradingNow || halted || !tradeAmt) && 'opacity-40 cursor-not-allowed',
            )}
          >
            {tradingNow ? <><RefreshCw size={14} className="animate-spin" /> Executing…</>
              : confirmTrade ? <><CheckCircle2 size={14} /> CONFIRM — {tradeAction.toUpperCase()} {tradeAmt} τ</>
              : <>{tradeAction === 'buy' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {tradeAction.toUpperCase()} {tradeAmt ? `${tradeAmt} τ` : '—'}</>
            }
          </button>
          {confirmTrade && (
            <button onClick={() => setConfirmTrade(false)}
              className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors font-mono flex items-center justify-center gap-1">
              <XCircle size={11} /> Cancel
            </button>
          )}
          <p className="text-[13px] text-slate-500 font-mono">
            First click stages the trade. Second click executes. In paper mode this records a simulated trade. In live mode this submits to chain.
          </p>
        </div>

      </div>{/* end 3-box control row */}

      {/* ── Row 2: Strategy Mode Override — full page width ─────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <ArrowUp size={13} className="text-accent-green" /> Strategy Mode Override
          </h2>
          <p className="text-[13px] text-slate-500 font-mono">bypasses gate · instant · permanent until changed</p>
        </div>

        {/* Mode legend */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {MODE_ORDER.map(m => {
            const meta = MODE_META[m]
            return (
              <span key={m} className={clsx('px-2 py-0.5 rounded border text-[13px] font-mono font-bold', meta.badge)}>
                {meta.prefix} {meta.label}
              </span>
            )
          })}
          <span className="text-[13px] text-slate-500 ml-2">— click ↑ to promote, ↓ to demote</span>
        </div>

        {/* Strategy rows */}
        <div className="space-y-1.5">
          {rows.map(s => {
            const atCeiling  = s.mode === 'LIVE'
            const atFloor    = s.mode === 'PAPER_ONLY'
            const upPending  = opPending === s.name + '_up'
            const downPending = opPending === s.name + '_down'
            return (
              <div key={s.name}
                className="flex items-center gap-3 px-3 py-2.5 bg-dark-900 rounded-lg border border-dark-700/60 hover:border-dark-600 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{s.display_name}</p>
                  <p className="text-[13px] text-slate-500 font-mono">{s.name}</p>
                </div>
                <div className="text-right flex-shrink-0 w-16 hidden sm:block">
                  <p className={clsx('text-xs font-mono font-bold',
                    s.win_rate >= 55 ? 'text-accent-green' : s.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                    {(s.win_rate ?? 0).toFixed(1)}%
                  </p>
                  <p className="text-[15px] text-slate-500">win rate</p>
                </div>
                <div className="text-right flex-shrink-0 w-24 hidden md:block">
                  <p className={clsx('text-xs font-mono font-bold',
                    s.total_pnl > 0 ? 'text-accent-green' : s.total_pnl < 0 ? 'text-red-400' : 'text-slate-400')}>
                    {fmtTao(s.total_pnl)}
                  </p>
                  <p className="text-[15px] text-slate-500">PnL</p>
                </div>
                <div className="flex-shrink-0 hidden lg:block">
                  {stakeEditing === s.name ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min="0.001" max="1.0" step="0.001" value={stakeInput}
                        onChange={e => setStakeInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') doSetStake(s.name); if (e.key === 'Escape') setStakeEditing(null) }}
                        autoFocus
                        className="w-20 px-2 py-1 text-xs font-mono bg-dark-800 border border-accent-blue/50 rounded text-white focus:outline-none focus:border-accent-blue"
                        placeholder="0.0100"
                      />
                      <span className="text-[13px] text-slate-500 font-mono">τ</span>
                      <button onClick={() => doSetStake(s.name)} className="text-accent-green hover:text-white text-[13px] font-mono font-bold transition-colors" title="Save">✓</button>
                      <button onClick={() => setStakeEditing(null)} className="text-slate-500 hover:text-red-400 text-[13px] font-mono transition-colors" title="Cancel">✗</button>
                    </div>
                  ) : (
                    <button onClick={() => { setStakeEditing(s.name); setStakeInput(s.stake_amount != null ? (s.stake_amount ?? 0).toFixed(4) : '') }}
                      className="text-right group/stake" title="Click to edit stake per trade">
                      <p className={clsx('text-xs font-mono font-bold group-hover/stake:text-accent-blue transition-colors',
                        s.mode === 'LIVE' ? 'text-white' : 'text-slate-500')}>
                        {s.stake_amount != null ? `${(s.stake_amount ?? 0).toFixed(4)} τ` : '—'}
                      </p>
                      <p className="text-[15px] text-slate-500">stake/trade</p>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {MODE_ORDER.map((m, i) => {
                    const modeKey = m as 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE'
                    const isPending = opPending === s.name + '_' + m
                    return (
                      <div key={m} className="flex items-center gap-1">
                        <ModeStep
                          mode={m}
                          active={m === s.mode}
                          pending={isPending}
                          onClick={() => doSetMode(s.name, modeKey)}
                        />
                        {i < MODE_ORDER.length - 1 && <ChevronRight size={10} className="text-slate-600" />}
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => doPromote(s.name)} disabled={atCeiling || upPending || downPending}
                    title={atCeiling ? 'Already at LIVE' : 'Promote one level'}
                    className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                      atCeiling ? 'text-slate-600 border-dark-700 cursor-not-allowed'
                        : 'text-accent-green border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/15 hover:border-accent-green/50 active:scale-95')}>
                    {upPending ? <RefreshCw size={10} className="animate-spin" /> : <ArrowUp size={10} />} UP
                  </button>
                  <button onClick={() => doDemote(s.name)} disabled={atFloor || upPending || downPending}
                    title={atFloor ? 'Already at PAPER' : 'Demote one level'}
                    className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                      atFloor ? 'text-slate-600 border-dark-700 cursor-not-allowed'
                        : 'text-red-400 border-red-500/30 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/50 active:scale-95')}>
                    {downPending ? <RefreshCw size={10} className="animate-spin" /> : <ArrowDown size={10} />} DOWN
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[13px] text-slate-500 font-mono mt-4 leading-relaxed">
          Mode changes are instant and persistent (written to DB). Promoting a strategy to LIVE while in paper trading mode
          means it will execute real on-chain trades when live mode is enabled. Demoting from LIVE does not cancel open positions.
        </p>
      </div>{/* end Strategy Mode Override */}
      </div>{/* end scrollable */}
    </div>
  )
}