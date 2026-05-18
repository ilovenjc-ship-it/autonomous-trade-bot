/**
 * HowItAllConnects — Session XXXV
 * ================================
 * Orchestration architecture banner. Originally lived on the II Agent
 * page; Mav relocated it to the top of the Dashboard so visitors see
 * the four-stage pipeline (II Agent → OpenClaw → 12 Bots → Trades)
 * before diving into KPI cards.
 *
 * Color swap from the original IIAgent placement:
 *   - II Agent  : indigo  →  GREEN (it IS the Intelligent Internet's
 *                 emerald-themed orchestrator, not just any planner)
 *   - 12 Bots   : emerald →  PURPLE (Session XXXV) → ROSE (Session XXXVIII)
 *                 OpenClaw and 12 Bots both rendered as side-by-side
 *                 purples (purple-500 + fuchsia-500). Mav flagged the
 *                 monotony; rose-400 keeps a warm hue at the strategy-
 *                 fleet (workhorse) layer while letting OpenClaw retain
 *                 its consensus-purple identity untouched.
 *   - OpenClaw  : purple  →  PURPLE (unchanged — keeps consensus identity)
 *   - Trades    : sky     →  SKY (unchanged — chain execution layer)
 *
 * Self-contained: pulls its own live data from /agent/status, /consensus/
 * stats, and /bot/status — no parent prop drilling required.
 */
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import api from '@/api/client'

interface AgentStatus {
  analysis_count?:    number
  observation_count?: number
  fleet_health?:      Record<string, string>
}
interface ConsensusStats {
  total_rounds?:       number
  approval_rate_pct?:  number
}
interface BotStatus {
  total_pnl?: number
}

export default function HowItAllConnects() {
  const [agent,     setAgent]     = useState<AgentStatus | null>(null)
  const [cStats,    setCStats]    = useState<ConsensusStats | null>(null)
  const [bot,       setBot]       = useState<BotStatus | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [a, c, b] = await Promise.all([
          api.get('/agent/status').catch(() => ({ data: null })),
          api.get('/consensus/stats').catch(() => ({ data: null })),
          api.get('/bot/status').catch(() => ({ data: null })),
        ])
        setAgent(a.data)
        setCStats(c.data)
        setBot(b.data)
      } catch {/* soft-fail */}
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  const fleetHealth = agent?.fleet_health ?? {}
  const liveCount   = Object.values(fleetHealth).filter(h => h === 'LIVE' || h === 'HOT' || h === 'HEALTHY').length
  const strugCount  = Object.values(fleetHealth).filter(h => h === 'STRUGGLING').length
  const totalPnl    = bot?.total_pnl ?? 0

  return (
    <div className="relative rounded-2xl border border-dark-600 overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0d1525 0%, #152030 50%, #0d1525 100%)' }}>

      {/* Subtle top glow strip — green→purple→rose→sky to match new node colours */}
      <div className="absolute top-0 left-0 right-0 h-px"
           style={{ background: 'linear-gradient(90deg, #10b981, #a855f7, #fb7185, #0ea5e9)' }} />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full bg-emerald-400" />
          <p className="text-xs text-slate-300 uppercase tracking-[0.2em] font-mono font-semibold">
            How It All Connects
          </p>
        </div>
        <p className="text-[13px] font-mono text-slate-400">
          Hover each tier to learn more
        </p>
      </div>

      {/* Pipeline nodes */}
      <div className="flex flex-col md:flex-row items-stretch gap-0 px-6 pb-5">

        {/* Node 1 — II Agent  ── GREEN (Session XXXV colour swap) */}
        <div className="group relative flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-emerald-400/60 hover:bg-emerald-500/15 hover:shadow-lg hover:shadow-emerald-500/10">
          <div className="transition-opacity duration-300 group-hover:opacity-0">
            <p className="text-lg mb-1">🧠</p>
            <p className="text-sm font-bold text-emerald-400 font-mono">II Agent</p>
            <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">Master Orchestrator</p>
            <p className="text-xs font-mono font-semibold text-slate-200">
              {agent?.analysis_count ?? 0} analyses run
            </p>
            <p className="text-[13px] text-slate-400 font-mono">
              {agent?.observation_count ?? 0} observations logged
            </p>
          </div>
          <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
            <p className="text-xs font-bold text-emerald-300 mb-2">🧠 II Agent — Master Orchestrator</p>
            <p className="text-[14px] text-slate-300 leading-relaxed">
              The conductor. Runs every 5 minutes. Reads the market regime
              (BULL / BEAR / SIDEWAYS / VOLATILE), reads all 12 bots' health,
              and writes observations + directives. The brain that watches
              everything — but never trades.
            </p>
          </div>
        </div>

        {/* Arrow 1 */}
        <div className="flex items-center justify-center px-2 py-2 md:py-0">
          <div className="flex gap-0.5" style={{ animation: 'flowPulse 1.8s ease-in-out infinite' }}>
            <ChevronRight size={16} className="text-emerald-400/60" />
            <ChevronRight size={16} className="text-purple-400/60 -ml-2" />
          </div>
        </div>

        {/* Node 2 — OpenClaw ── PURPLE (unchanged) */}
        <div className="group relative flex-1 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-purple-400/60 hover:bg-purple-500/15 hover:shadow-lg hover:shadow-purple-500/10">
          <div className="transition-opacity duration-300 group-hover:opacity-0">
            <p className="text-lg mb-1">⚡</p>
            <p className="text-sm font-bold text-purple-400 font-mono">OpenClaw</p>
            <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">BFT Consensus</p>
            <p className="text-xs font-mono font-semibold text-slate-200">
              {cStats?.total_rounds ?? 0} rounds · {cStats?.approval_rate_pct?.toFixed(1) ?? 0}% approved
            </p>
            <p className="text-[13px] text-slate-400 font-mono">7 of 12 supermajority required</p>
          </div>
          <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
            <p className="text-xs font-bold text-purple-300 mb-2">⚡ OpenClaw — BFT Consensus Engine</p>
            <p className="text-[14px] text-slate-300 leading-relaxed">
              Every LIVE trade must pass a 7-of-12 supermajority vote before executing.
              12 bot personalities vote BUY / SELL / HOLD based on their own signal weights.
              No consensus = no trade. No exceptions.
            </p>
          </div>
        </div>

        {/* Arrow 2 */}
        <div className="flex items-center justify-center px-2 py-2 md:py-0">
          <div className="flex gap-0.5" style={{ animation: 'flowPulse 1.8s ease-in-out infinite 0.3s' }}>
            <ChevronRight size={16} className="text-purple-400/60" />
            <ChevronRight size={16} className="text-rose-400/60 -ml-2" />
          </div>
        </div>

        {/* Node 3 — 12 Bots  ── ROSE (Session XXXVIII colour swap; previously
            fuchsia which read as a second shade of purple next to OpenClaw) */}
        <div className="group relative flex-1 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-rose-300/60 hover:bg-rose-400/15 hover:shadow-lg hover:shadow-rose-400/10">
          <div className="transition-opacity duration-300 group-hover:opacity-0">
            <p className="text-lg mb-1">🤖</p>
            <p className="text-sm font-bold text-rose-300 font-mono">12 Bots</p>
            <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">Strategy Fleet</p>
            <p className="text-xs font-mono font-semibold text-slate-200">
              {liveCount} active · {strugCount} struggling
            </p>
            <p className="text-[13px] text-slate-400 font-mono">cycling every 60 seconds</p>
          </div>
          <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
            <p className="text-xs font-bold text-rose-200 mb-2">🤖 12 Bots — Strategy Fleet</p>
            <p className="text-[14px] text-slate-300 leading-relaxed">
              12 strategies run autonomously every 60 seconds. Each starts in PAPER mode and earns
              promotion through performance — 55%+ win rate unlocks APPROVED, 65%+ unlocks LIVE.
              The gate system never sleeps.
            </p>
          </div>
        </div>

        {/* Arrow 3 */}
        <div className="flex items-center justify-center px-2 py-2 md:py-0">
          <div className="flex gap-0.5" style={{ animation: 'flowPulse 1.8s ease-in-out infinite 0.6s' }}>
            <ChevronRight size={16} className="text-rose-400/60" />
            <ChevronRight size={16} className="text-sky-400/60 -ml-2" />
          </div>
        </div>

        {/* Node 4 — Trades  ── SKY (unchanged) */}
        <div className="group relative flex-1 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-sky-400/60 hover:bg-sky-500/15 hover:shadow-lg hover:shadow-sky-500/10">
          <div className="transition-opacity duration-300 group-hover:opacity-0">
            <p className="text-lg mb-1">📈</p>
            <p className="text-sm font-bold text-sky-400 font-mono">Trades</p>
            <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">TAO Execution</p>
            <p className="text-xs font-mono font-semibold text-slate-200">
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)} τ PnL
            </p>
            <p className="text-[13px] text-slate-400 font-mono">Finney mainnet · live chain</p>
          </div>
          <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
            <p className="text-xs font-bold text-sky-300 mb-2">📈 Trades — On-Chain Execution</p>
            <p className="text-[14px] text-slate-300 leading-relaxed">
              Only trades that clear every layer reach execution. Paper trades build the track record.
              LIVE trades pass BFT consensus then execute on Finney mainnet via AsyncSubtensor.
              Real TAO moves only when the full pipeline agrees.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="border-t border-dark-600 px-6 py-2.5 flex flex-wrap gap-4">
        {[
          { label: 'Analysis interval', value: '300s' },
          { label: 'Consensus threshold', value: '7 / 12 votes' },
          { label: 'Gate — Paper → Approved', value: '55% win rate' },
          { label: 'Gate — Approved → Live', value: '65% WR + 0.05τ PnL' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[13px] font-mono text-slate-500 uppercase tracking-wider">{label}:</span>
            <span className="text-[13px] font-mono text-slate-300 font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}