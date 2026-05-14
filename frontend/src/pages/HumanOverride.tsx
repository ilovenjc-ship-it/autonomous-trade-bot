import { useEffect, useState, useCallback } from 'react'
import {
  AlertTriangle, ShieldCheck, TrendingUp, TrendingDown,
  RefreshCw, Zap, Play, Square,
  ChevronRight, CheckCircle2, XCircle, FlaskConical, Flame, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'
import DangerZonePanel from '@/components/DangerZonePanel'
import StrategyModeOverride from '@/components/StrategyModeOverride'

// ── types ─────────────────────────────────────────────────────────────────────
interface OverrideStatus {
  emergency_halted: boolean
  halted_at: string | null
  cycle_engine_running: boolean
  trading_engine_running: boolean
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

  // ── Session XXX: True operational mode  ─────────────────────────────────
  // The visible banner used to read "🔴 Live Trading Active" whenever the
  // force_paper flag was off — even if every strategy was still PAPER_ONLY
  // and not a single live trade could fire. That misled the Operator on
  // Day 2 of the paper baseline. Truth = (force_paper, live strategies):
  //   force_paper=true                       → PAPER_OVERRIDE (locked)
  //   force_paper=false AND liveCount === 0  → PAPER_BASELINE (no live yet)
  //   force_paper=false AND liveCount > 0    → LIVE_TRADING (real money out)
  const liveCount     = strategies.filter(s => s.mode === 'LIVE').length
  const approvedCount = strategies.filter(s => s.mode === 'APPROVED_FOR_LIVE').length
  const paperCount    = strategies.filter(s => s.mode === 'PAPER_ONLY').length
  type TrueMode = 'PAPER_OVERRIDE' | 'PAPER_BASELINE' | 'LIVE_TRADING'
  const trueMode: TrueMode = forcePaper
    ? 'PAPER_OVERRIDE'
    : (liveCount === 0 ? 'PAPER_BASELINE' : 'LIVE_TRADING')

  // ── actions — Session XXX: confirm copy is context-aware ────────────────

  async function doForcePaper() {
    // Distinct copy for each starting state. Partner spec: "When the
    // 'Force Paper Mode' button is clicked, a warning message appears...
    // However, that specific message should only appear when in Live Mode.
    // Since we're already in Paper Mode, message should reflect the
    // current status — the Paper Mode status."
    let msg = ''
    if (trueMode === 'LIVE_TRADING') {
      msg = `FORCE PAPER MODE — LIVE → PAPER\n\nYou are currently LIVE on Bittensor mainnet.\n${liveCount} strategy${liveCount===1?'':'ies'} actively executing real on-chain trades.\n\nThis will:\n• Block ALL real on-chain execution IMMEDIATELY\n• Demote every LIVE strategy back to PAPER_ONLY\n• Keep the cycle engine running (paper stats still accrue)\n• Open positions remain on chain — only NEW trades are blocked\n\nThis is reversible via "Resume Gate System".\n\nConfirm?`
    } else {
      // Already in paper (no live strategies). The button still locks in the
      // force flag, which prevents future LIVE promotions until lifted.
      msg = `LOCK PAPER MODE — already in paper baseline\n\nYou are currently in PAPER_BASELINE (force flag off, 0 strategies LIVE).\nNothing live is happening, so nothing live needs to stop.\n\nThis will set the force-paper FLAG, which:\n• Prevents any strategy from being promoted to LIVE\n• Locks the system in paper mode until the flag is lifted\n• No effect on running paper trades\n\nUse this if you want to be sure no auto-promotion can fire while you're away.\n\nLock paper mode?`
    }
    if (!window.confirm(msg)) return
    setTogglingPaper(true)
    try {
      await api.post('/bot/force-paper')
      setForcePaper(true)
      fetchStrategies()
      toast.success(trueMode === 'LIVE_TRADING'
        ? '🛑 Paper override active — live execution halted'
        : '🛑 Paper mode locked — no future LIVE promotions until lifted',
        { duration: 8000 })
    } catch { toast.error('Failed to activate paper override') }
    finally { setTogglingPaper(false) }
  }

  async function doResetPaperStats() {
    const trades = paperCount > 0 ? `across ${paperCount} paper strategies` : 'on the fleet'
    if (!window.confirm(
      `RESET PAPER STATS — ${trueMode}\n\nThis will:\n• Wipe all strategy win rates, PnL, and cycle counts ${trades}\n• Delete all paper trade history (live trades with tx_hash preserved)\n• Reset every strategy to PAPER_ONLY\n• Stamp a fresh stats_reset_at — establishes a new Zero Day for analytics\n\nThe gate countdown restarts from zero.\n\nConfirm?`
    )) return
    setResettingStats(true)
    try {
      await api.post('/bot/reset-paper-stats')
      fetchStrategies()
      toast.success('🗑️ Paper stats wiped — fresh Zero Day inscribed', { duration: 6000 })
    } catch { toast.error('Reset failed') }
    finally { setResettingStats(false) }
  }

  async function doResumeLive() {
    if (!window.confirm(
      `LIFT PAPER OVERRIDE — PAPER → GATE-CONTROLLED\n\nYou are currently in PAPER_OVERRIDE (force flag locked ON).\n\nThis will:\n• Lift the force-paper flag\n• Re-enable the gate system\n• NO strategies immediately go LIVE — they must pass gate thresholds first\n  (≥10 cycles, ≥55% WR, +2 win margin, +PnL, plus OpenClaw 7/12 supermajority)\n• ${approvedCount} strategy${approvedCount===1?'':'ies'} currently APPROVED_FOR_LIVE will become eligible\n\nConfirm?`
    )) return
    setTogglingPaper(true)
    try {
      await api.post('/bot/resume-live')
      setForcePaper(false)
      toast.success('✅ Paper override lifted — gate system active')
    } catch { toast.error('Failed to lift paper override') }
    finally { setTogglingPaper(false) }
  }

  async function doEmergencyStop() {
    const ctxLine = trueMode === 'LIVE_TRADING'
      ? `${liveCount} strategy${liveCount===1?'':'ies'} are LIVE on chain right now.`
      : 'System is in paper mode — this halt is precautionary.'
    if (!window.confirm(
      `EMERGENCY STOP — ${trueMode}\n\n${ctxLine}\n\nThis will halt ALL trading IMMEDIATELY:\n• Cycle engine stops\n• No new signals fire\n• Open on-chain positions remain — chain trades cannot be unwound automatically\n\nResumable via "Resume Trading" button.\n\nClick OK to confirm.`
    )) return
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

  async function doForcePromoCheck() {
    setPromoCheck(true)
    try {
      await api.post('/override/force-promote-check')
      toast.success('🔍 Promotion gate check completed')
      fetchStrategies()
    } catch { toast.error('Check failed') }
    finally { setPromoCheck(false) }
  }

  const halted = status?.emergency_halted ?? false
  // liveCount / approvedCount / paperCount / trueMode were computed above
  // (Session XXX) so the action handlers can render context-aware confirms.

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ══════════════════════════════════════════════════════════════════════
          Session XXX: Banner stack reordered + clarity rewrite per Partner spec.
          New order (top → bottom):
            1. SYSTEM OPERATIONAL  (was bottom — now its own top line)
            2. EXECUTION MODE      (was top — now tri-state, honest)

          The old single banner read "🔴 Live Trading Active" any time the
          force-paper FLAG was off — including Day 2 of paper baseline when
          0 strategies were LIVE. That misled the Operator. Tri-state truth:
            • PAPER_OVERRIDE  — force flag locked ON  (amber, locked-down)
            • PAPER_BASELINE  — flag off, 0 LIVE      (slate, neutral)
            • LIVE_TRADING    — flag off, 1+ LIVE     (green, real money)
          ══════════════════════════════════════════════════════════════════ */}

      {/* ── 1. SYSTEM OPERATIONAL — top line ────────────────────────────────── */}
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

      {/* ── 2. EXECUTION MODE — tri-state, context-aware (Session XXX) ──────── */}
      <div className={clsx(
        'rounded-xl border p-5 transition-all',
        trueMode === 'PAPER_OVERRIDE'
          ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
          : trueMode === 'LIVE_TRADING'
            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.15)]'
            : 'bg-dark-800 border-dark-600',
      )}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0',
              trueMode === 'PAPER_OVERRIDE' ? 'bg-amber-500/20 border border-amber-500/40'
              : trueMode === 'LIVE_TRADING'   ? 'bg-emerald-500/20 border border-emerald-500/40'
              :                                 'bg-dark-700 border border-dark-600',
            )}>
              {trueMode === 'PAPER_OVERRIDE'
                ? <FlaskConical size={18} className="text-amber-400" />
                : trueMode === 'LIVE_TRADING'
                  ? <Flame size={18} className="text-emerald-400" />
                  : <FlaskConical size={18} className="text-slate-400" />}
            </div>
            <div>
              <p className={clsx(
                'text-sm font-bold font-mono uppercase tracking-wider',
                trueMode === 'PAPER_OVERRIDE' ? 'text-amber-400'
                : trueMode === 'LIVE_TRADING'   ? 'text-emerald-400'
                :                                 'text-slate-300',
              )}>
                {trueMode === 'PAPER_OVERRIDE' && '🛑 Paper Mode Override — LOCKED'}
                {trueMode === 'PAPER_BASELINE' && '⏸  Paper Baseline — no LIVE strategies yet'}
                {trueMode === 'LIVE_TRADING'   && `🔴 Live Trading Active — ${liveCount} on chain`}
              </p>
              <p className="text-[13px] text-slate-400 font-mono mt-0.5">
                {trueMode === 'PAPER_OVERRIDE' && 'All on-chain execution is blocked. Strategies are running paper simulation only. No TAO will be spent.'}
                {trueMode === 'PAPER_BASELINE' && `Force flag is OFF, but 0 strategies are LIVE — nothing executes on chain. ${approvedCount} approved, ${paperCount} paper. Gate system is open; strategies must pass thresholds to go LIVE.`}
                {trueMode === 'LIVE_TRADING'   && `${liveCount} strategy${liveCount===1?'':'ies'} executing real on-chain stake() calls. TAO is being spent on every approved signal.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {trueMode === 'PAPER_OVERRIDE' ? (
              <button
                onClick={doResumeLive}
                disabled={togglingPaper}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-green/15 border border-accent-green/40 text-accent-green text-sm font-bold font-mono hover:bg-accent-green/25 transition-all disabled:opacity-50"
              >
                {togglingPaper ? <RefreshCw size={13} className="animate-spin" /> : <Flame size={13} />}
                {togglingPaper ? 'Lifting…' : 'Lift Override'}
              </button>
            ) : (
              <button
                onClick={doForcePaper}
                disabled={togglingPaper || halted}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold font-mono hover:bg-amber-500/25 transition-all disabled:opacity-50"
                title={trueMode === 'LIVE_TRADING' ? 'Halt all live execution and demote to paper' : 'Lock paper mode — prevent any future LIVE promotions'}
              >
                {togglingPaper ? <RefreshCw size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {togglingPaper
                  ? 'Activating…'
                  : trueMode === 'LIVE_TRADING' ? 'Force Paper Mode' : 'Lock Paper Mode'}
              </button>
            )}
          </div>
        </div>

        {/* Detail chips for PAPER_OVERRIDE */}
        {trueMode === 'PAPER_OVERRIDE' && (
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

        {/* Detail chips for PAPER_BASELINE — give Operator the same Reset access */}
        {trueMode === 'PAPER_BASELINE' && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-dark-700/50">
            <span className="px-2.5 py-1 rounded-lg bg-slate-700/30 border border-slate-600/30 text-slate-300 text-[13px] font-mono">
              {paperCount} paper · {approvedCount} approved · {liveCount} live
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-700/30 border border-slate-600/30 text-slate-300 text-[13px] font-mono">
              Gate system open
            </span>
            <button
              onClick={doResetPaperStats}
              disabled={resettingStats}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[13px] font-mono hover:bg-red-500/20 transition-colors disabled:opacity-50"
              title="Wipe paper stats and stamp a fresh Zero Day"
            >
              {resettingStats ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {resettingStats ? 'Resetting…' : 'Reset Paper Stats'}
            </button>
          </div>
        )}
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

        {/* Manual Trade duplicate removed — canonical Manual Trade lives on the Trades page (Session XXV spec). */}
        {/* Danger Zone (relocated from Settings) */}
        <DangerZonePanel />

      </div>{/* end 3-box control row */}

      {/* ── Strategy Mode Override (Session XXVI: relocated from Settings) ── */}
      <StrategyModeOverride />

      </div>{/* end scrollable */}
    </div>
  )
}