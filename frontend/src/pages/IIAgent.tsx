/**
 * II Agent — Master Orchestrator Dashboard
 * The top-level intelligence view: regime, fleet health, observations, recommendations.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Brain, TrendingUp, TrendingDown, Minus, Zap,
  Activity, RefreshCw, ChevronRight, AlertTriangle,
  CheckCircle2, Flame, Eye, BarChart3, Lightbulb,
  Cpu, Radio, ShieldAlert, ArrowUpRight, MessageSquare,
  Send, Sparkles, User, Bot,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import PageHeroSlider from '@/components/PageHeroSlider'
import { useBotStore } from '@/store/botStore'
import { InfoBubble } from '@/components/Tooltip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentStatus {
  analysis_count:       number
  last_analysis_at:     string | null
  current_regime:       string
  regime_color:         string
  total_pnl:            number
  is_running:           boolean
  observation_count:    number
  recommendation_count: number
  fleet_health:         Record<string, string>
  price:                number | null
}

interface Observation {
  id:        number
  level:     string   // REGIME | FLEET | CONSENSUS | ALERT | SYSTEM
  message:   string
  data:      Record<string, unknown>
  timestamp: string
}

interface Recommendation {
  type:        string   // WARNING | OPPORTUNITY | REGIME | CONSENSUS
  strategy:    string | null
  action:      string
  priority:    string   // HIGH | MEDIUM | LOW
  timestamp:   string
  analysis_id: number
}

interface FleetBot {
  name:         string
  display_name: string
  mode:         string
  health:       string
  win_rate:     number
  total_pnl:    number
  cycles:       number
  total_trades: number
}

interface AnalysisReport {
  regime:        string
  regime_color:  string
  price:         number
  rsi:           number | null
  fleet_summary: FleetBot[]
  fleet_pnl:     number
  hot_bots:      string[]
  struggling_bots: string[]
  promotable_bots: string[]
  velocity:      number
}

// ── Regime config ─────────────────────────────────────────────────────────────

const REGIME_CONFIG: Record<string, { icon: typeof TrendingUp; label: string; glow: string; bg: string; text: string }> = {
  BULL:     { icon: TrendingUp,   label: 'BULL MARKET',   glow: 'shadow-emerald-500/30', bg: 'bg-emerald-500/10 border-emerald-500/40', text: 'text-emerald-400' },
  BEAR:     { icon: TrendingDown, label: 'BEAR MARKET',   glow: 'shadow-red-500/30',     bg: 'bg-red-500/10 border-red-500/40',         text: 'text-red-400'     },
  SIDEWAYS: { icon: Minus,        label: 'SIDEWAYS',      glow: 'shadow-amber-500/30',   bg: 'bg-amber-500/10 border-amber-500/40',     text: 'text-amber-400'   },
  VOLATILE: { icon: Zap,          label: 'VOLATILE',      glow: 'shadow-purple-500/30',  bg: 'bg-purple-500/10 border-purple-500/40',   text: 'text-purple-400'  },
  UNKNOWN:  { icon: Activity,     label: 'SCANNING…',     glow: 'shadow-slate-500/20',   bg: 'bg-slate-700/30 border-slate-600/40',     text: 'text-slate-300'   },
}

const HEALTH_CONFIG: Record<string, { label: string; border: string; bg: string; text: string; dot: string }> = {
  HOT:        { label: '🔥 HOT',       border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  HEALTHY:    { label: '✅ HEALTHY',   border: 'border-sky-500/40',     bg: 'bg-sky-500/10',     text: 'text-sky-300',     dot: 'bg-sky-500'     },
  WATCHING:   { label: '⚠️ WATCHING', border: 'border-amber-500/40',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   dot: 'bg-amber-500'   },
  STRUGGLING: { label: '🔴 WEAK',     border: 'border-red-500/40',     bg: 'bg-red-500/10',     text: 'text-red-300',     dot: 'bg-red-500'     },
  INACTIVE:   { label: '⚙️ WARMING',  border: 'border-slate-600/40',   bg: 'bg-slate-700/30',   text: 'text-slate-300',   dot: 'bg-slate-600'   },
}

const OBS_LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: typeof Brain }> = {
  REGIME:    { color: 'text-purple-400', bg: 'border-l-purple-500',  icon: Activity   },
  FLEET:     { color: 'text-sky-400',    bg: 'border-l-sky-500',     icon: BarChart3  },
  CONSENSUS: { color: 'text-amber-400',  bg: 'border-l-amber-500',   icon: Radio      },
  ALERT:     { color: 'text-red-400',    bg: 'border-l-red-500',     icon: AlertTriangle },
  SYSTEM:    { color: 'text-emerald-400',bg: 'border-l-emerald-500', icon: Cpu        },
}

const REC_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Lightbulb }> = {
  WARNING:   { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: ShieldAlert  },
  OPPORTUNITY:{ color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: ArrowUpRight },
  REGIME:    { color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  icon: Zap          },
  CONSENSUS: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Radio        },
}

// ── Chat types ────────────────────────────────────────────────────────────────

interface ChatMsg {
  role:      'user' | 'agent'
  content:   string
  timestamp: string
}

const QUICK_PROMPTS = [
  { label: '📊 PnL?',        text: 'What is the total fleet PnL right now?' },
  { label: '🏆 Top bots',   text: 'Which are the top 3 performing strategies?' },
  { label: '🌡️ Regime',     text: 'What is the current market regime and RSI?' },
  { label: '⚡ Gate status', text: 'Which strategies are approved or close to promotion?' },
  { label: '🔁 Cycles',      text: 'How many autonomous cycles have completed?' },
  { label: '🛡️ Risk',        text: 'What are the current risk controls?' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeSince(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulseRing({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', color)} />
      <span className={clsx('relative inline-flex rounded-full h-3 w-3', color)} />
    </span>
  )
}

function RegimeCard({ regime, color, price, rsi }: {
  regime: string; color: string; price: number | null; rsi: number | null
}) {
  const cfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN
  const Icon = cfg.icon

  return (
    <div className={clsx(
      'relative rounded-2xl border p-5 flex flex-col gap-3 shadow-xl overflow-hidden',
      cfg.bg, cfg.glow,
    )}>
      {/* Ambient glow blob */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-20"
        style={{ background: color }}
      />

      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: color + '25' }}>
            <Icon size={22} style={{ color }} />
          </div>
          <div>
            <p className="text-[13px] text-slate-300 uppercase tracking-widest font-mono">Market Regime</p>
            <p className="text-2xl font-black tracking-tight" style={{ color }}>{cfg.label}</p>
          </div>
        </div>
        <PulseRing color={regime === 'BULL' ? 'bg-emerald-500' : regime === 'BEAR' ? 'bg-red-500' : 'bg-amber-500'} />
      </div>

      <div className="flex gap-4 relative">
        <div>
          <p className="text-[13px] text-slate-300 font-mono">TAO Price</p>
          <p className="text-lg font-bold text-white font-mono">${price?.toFixed(2) ?? '—'}</p>
        </div>
        {rsi !== null && (
          <div>
            <p className="text-[13px] text-slate-300 font-mono">RSI-14</p>
            <p className={clsx('text-lg font-bold font-mono', rsi > 65 ? 'text-red-400' : rsi < 35 ? 'text-emerald-400' : 'text-white')}>
              {(rsi ?? 0).toFixed(1)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function FleetHealthCard({ bot }: { bot: FleetBot }) {
  const hcfg = HEALTH_CONFIG[bot.health] ?? HEALTH_CONFIG.INACTIVE
  return (
    <div className={clsx(
      'rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-300',
      hcfg.bg, hcfg.border,
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-white truncate pr-1">{bot.display_name}</p>
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', hcfg.dot)} />
      </div>
      <p className={clsx('text-[13px] font-mono font-bold', hcfg.text)}>{hcfg.label}</p>
      <div className="flex justify-between text-[13px] font-mono text-slate-300">
        <span className={bot.win_rate >= 55 ? 'text-emerald-400' : 'text-red-400'}>{(bot.win_rate ?? 0).toFixed(1)}% WR</span>
        <span className={bot.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{bot.total_pnl >= 0 ? '+' : ''}{(bot.total_pnl ?? 0).toFixed(4)}τ</span>
      </div>
      <div className={clsx(
        'text-[15px] font-mono px-1.5 py-0.5 rounded self-start',
        bot.mode === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400' :
        bot.mode === 'APPROVED_FOR_LIVE' ? 'bg-sky-500/20 text-sky-400' :
        'bg-slate-700 text-slate-300'
      )}>
        {bot.mode === 'LIVE' ? '🚀 LIVE' : bot.mode === 'APPROVED_FOR_LIVE' ? '✅ APPROVED' : '📄 PAPER'}
      </div>
    </div>
  )
}

function ObservationRow({ obs }: { obs: Observation }) {
  const cfg = OBS_LEVEL_CONFIG[obs.level] ?? OBS_LEVEL_CONFIG.SYSTEM
  const Icon = cfg.icon
  return (
    <div className={clsx('border-l-2 pl-3 py-2 transition-colors hover:bg-dark-700/30', cfg.bg)}>
      <div className="flex items-start gap-2">
        <Icon size={12} className={clsx('mt-0.5 flex-shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-300 leading-relaxed">{obs.message}</p>
          <div className="flex gap-3 mt-1">
            <span className={clsx('text-[13px] font-mono font-bold', cfg.color)}>{obs.level}</span>
            <span className="text-[13px] text-slate-300 font-mono">{timeSince(obs.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const cfg = REC_CONFIG[rec.type] ?? REC_CONFIG.REGIME
  const Icon = cfg.icon
  return (
    <div className={clsx('rounded-xl border p-4 flex gap-3', cfg.bg, cfg.border)}>
      <div className={clsx('p-1.5 rounded-lg h-fit', cfg.bg)}>
        <Icon size={14} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('text-[13px] font-bold font-mono uppercase', cfg.color)}>{rec.type}</span>
          <span className={clsx(
            'text-[15px] font-mono px-1.5 py-0.5 rounded',
            rec.priority === 'HIGH'   ? 'bg-red-500/20 text-red-400' :
            rec.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-slate-700 text-slate-300'
          )}>{rec.priority}</span>
          {rec.strategy && (
            <span className="text-[13px] text-slate-300 font-mono truncate">{rec.strategy}</span>
          )}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{rec.action}</p>
        <p className="text-[13px] text-slate-300 font-mono mt-1">{timeSince(rec.timestamp)}</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── OpenClaw BFT Explanation Component ────────────────────────────────────────

function OpenClawBFTSection() {
  const [expanded, setExpanded] = useState(true)

  // 12 bots: 7 agree (green), 3 faulty (red), 2 neutral (grey)
  const BOT_STATES: ('agree' | 'faulty' | 'neutral')[] = [
    'agree','agree','agree','agree','agree','agree','agree',
    'neutral','neutral','faulty','faulty','faulty',
  ]

  const stateStyle = {
    agree:   { bg: 'bg-emerald-500/20', border: 'border-emerald-500/60', text: 'text-emerald-400', glow: '0 0 10px rgba(52,211,153,0.4)', icon: '✓' },
    faulty:  { bg: 'bg-red-500/15',     border: 'border-red-500/50',     text: 'text-red-400',     glow: '0 0 10px rgba(239,68,68,0.3)',  icon: '✗' },
    neutral: { bg: 'bg-slate-700/30',   border: 'border-slate-600/40',   text: 'text-slate-400',   glow: 'none',                         icon: '—' },
  }

  const references = [
    { src: 'L. Lamport, R. Shostak & M. Pease', year: '1982', title: '"Byzantine Generals Problem"', journal: 'ACM TOCS', color: 'text-indigo-400' },
    { src: 'Bitcoin (Nakamoto, 2008)',           year: '—',    title: 'Proof-of-Work as BFT',         journal: 'Network', color: 'text-amber-400' },
    { src: 'Ethereum (Buterin et al., 2014)',    year: '—',    title: 'Casper PoS BFT variant',       journal: 'Finality', color: 'text-purple-400' },
    { src: 'Bittensor (Yuma Consensus, 2021)',   year: '—',    title: 'Metagraph weight trust',       journal: 'On-chain', color: 'text-emerald-400' },
  ]

  return (
    <div className="rounded-2xl border border-purple-500/25 overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0d1020 0%, #12102a 50%, #0d1020 100%)' }}>

      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-6 py-4 border-b border-purple-500/20 hover:bg-purple-500/5 transition-colors text-left"
        style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.10) 0%, rgba(99,102,241,0.05) 60%, transparent 100%)' }}
      >
        {/* Icon orb */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-purple-500/40 bg-purple-500/15"
             style={{ boxShadow: '0 0 18px rgba(139,92,246,0.25)' }}>
          <span className="text-lg">⚡</span>
        </div>
        <div>
          <p className="text-sm font-bold text-white font-mono tracking-wide">OpenClaw — Byzantine Fault Tolerant Consensus</p>
          <p className="text-[12px] text-purple-300/70 font-mono">The mathematical firewall between every strategy and the blockchain · Lamport, Shostak &amp; Pease, 1982</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] font-mono text-purple-400 border border-purple-500/30 rounded px-2 py-0.5 bg-purple-500/10">
            7 / 12 · 58.3% threshold
          </span>
          <ChevronRight size={16} className={`text-slate-500 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-6">

          {/* ── Row 1: Problem statement + Math ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Problem Statement */}
            <div className="bg-[#0a0e1e]/80 border border-purple-500/20 rounded-xl p-4 space-y-3">
              <p className="text-[11px] font-mono text-purple-400 uppercase tracking-[0.15em] font-bold">The Byzantine Generals Problem</p>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Lamport, Shostak &amp; Pease (1982) asked: <span className="text-white font-semibold">how can a group of actors reach correct
                agreement when some members might be wrong, corrupt, or sending bad information?</span>
              </p>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Imagine N generals surrounding a city. Each must vote ATTACK or RETREAT. If some generals are traitors,
                they may send different votes to different generals. The loyal generals must still reach the
                <span className="text-amber-300 font-semibold"> same correct decision</span>, even with traitors in the room.
              </p>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                The solution: if you have <span className="text-purple-300 font-bold">N actors</span>, you can tolerate up to{' '}
                <span className="text-red-400 font-bold">⌊(N−1)/3⌋ traitors</span> and still reach correct consensus — as long as the
                threshold is met.
              </p>
              <div className="border-t border-purple-500/15 pt-2 text-[12px] font-mono text-slate-500">
                Bitcoin, Ethereum, and Bittensor all use variants of this principle.
              </div>
            </div>

            {/* Math Box */}
            <div className="bg-[#0a0e1e]/80 border border-indigo-500/20 rounded-xl p-4 space-y-3">
              <p className="text-[11px] font-mono text-indigo-400 uppercase tracking-[0.15em] font-bold">The OpenClaw Numbers</p>
              <div className="space-y-2.5 font-mono">
                {[
                  { label: 'Total voting bots',         val: 'N = 12',                  color: 'text-white',      desc: 'One per strategy personality' },
                  { label: 'Max tolerable faulty bots', val: 'f = ⌊(N−1)/3⌋ = 3',      color: 'text-red-400',    desc: '3 bots can be wrong/biased' },
                  { label: 'Consensus threshold',       val: '2f + 1 = 7 votes',         color: 'text-emerald-400',desc: 'Minimum to guarantee correctness' },
                  { label: 'Threshold as % of N',       val: '7/12 = 58.3%',             color: 'text-purple-300', desc: 'Supermajority' },
                  { label: 'Result if threshold met',   val: 'TRADE APPROVED ✓',         color: 'text-emerald-400',desc: 'Executes on-chain' },
                  { label: 'Result if not met',         val: 'VETOED — no execution',    color: 'text-red-400',    desc: 'Position stays closed' },
                ].map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-3">
                    <span className="text-[11px] text-slate-500 flex-shrink-0 w-44">{row.label}</span>
                    <span className={`text-[12px] font-bold ${row.color} flex-shrink-0`}>{row.val}</span>
                    <span className="text-[11px] text-slate-600 text-right">{row.desc}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-indigo-500/15 pt-2">
                <p className="text-[11px] font-mono text-indigo-400/70">
                  The math guarantees: even if 3 bots are misbehaving, biased, or running stale data —
                  the remaining 9 can still produce a <span className="text-indigo-300">provably correct majority</span>.
                </p>
              </div>
            </div>
          </div>

          {/* ── Row 2: Voting visualiser ── */}
          <div className="bg-[#0a0e1e]/80 border border-slate-700/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-mono text-slate-400 uppercase tracking-[0.15em] font-bold">
                What a consensus round looks like — BUY signal, 7 agree, 3 faulty, 2 neutral
              </p>
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Agree (7)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />Neutral (2)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Faulty (3)</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {BOT_STATES.map((state, i) => {
                const s = stateStyle[state]
                return (
                  <div key={i}
                    className={`flex flex-col items-center gap-1 w-14 rounded-xl border ${s.bg} ${s.border} py-2 px-1 transition-all`}
                    style={{ boxShadow: s.glow }}>
                    <span className="text-[10px] font-mono text-slate-500">BOT {i + 1}</span>
                    <span className={`text-base font-bold ${s.text}`}>{s.icon}</span>
                    <span className={`text-[10px] font-bold font-mono ${s.text}`}>
                      {state === 'agree' ? 'BUY' : state === 'faulty' ? 'ERR' : 'HOLD'}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-500/40" />
              <span className="px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[12px] font-bold font-mono text-emerald-400"
                    style={{ boxShadow: '0 0 12px rgba(52,211,153,0.25)' }}>
                ✓ CONSENSUS REACHED — 7 of 12 agree · TRADE APPROVED
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-500/40" />
            </div>
          </div>

          {/* ── Row 3: Blockchain parallels ── */}
          <div>
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-[0.15em] mb-3">
              The same principle powers every major blockchain:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {references.map(ref => (
                <div key={ref.src} className="bg-[#0a0e1e]/60 border border-slate-700/30 rounded-xl p-3 space-y-1">
                  <p className={`text-[11px] font-bold font-mono ${ref.color}`}>{ref.src}</p>
                  {ref.year !== '—' && <p className="text-[10px] text-slate-500 font-mono">{ref.year}</p>}
                  <p className="text-[12px] text-slate-300 font-mono">{ref.title}</p>
                  <span className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                    {ref.journal}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Row 4: Why this matters for OpenClaw ── */}
          <div className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-4">
            <p className="text-[11px] font-mono text-purple-400 uppercase tracking-[0.15em] font-bold mb-2">
              Why this matters for your TAO
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] font-mono">
              {[
                {
                  icon: '🛡️', title: 'No single point of failure',
                  body: 'Even if 3 bots are badly tuned, running stale data, or outright wrong — their votes are mathematically overridden by the supermajority.',
                },
                {
                  icon: '📊', title: 'Signal quality filter',
                  body: 'Low-conviction signals that only 4–6 bots agree on are automatically vetoed. Only high-agreement signals — where ≥7 independent models concur — move real capital.',
                },
                {
                  icon: '⛓️', title: 'Blockchain-grade guarantee',
                  body: 'The same class of math that secures Bitcoin blocks and Ethereum finality is what stands between an uncertain signal and a real trade on Finney mainnet.',
                },
              ].map(card => (
                <div key={card.title} className="flex gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">{card.icon}</span>
                  <div>
                    <p className="text-slate-200 font-bold mb-1">{card.title}</p>
                    <p className="text-slate-400 leading-relaxed">{card.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

export default function IIAgent() {
  const [status,      setStatus]      = useState<AgentStatus | null>(null)
  const [observations,setObservations]= useState<Observation[]>([])
  const [recommendations,setRecs]     = useState<Recommendation[]>([])
  const [lastReport,  setLastReport]  = useState<AnalysisReport | null>(null)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [flash,       setFlash]       = useState(false)
  const [cStats,      setCStats]      = useState<{total_rounds:number,approved_rounds:number,approval_rate_pct:number}|null>(null)

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatInput,   setChatInput]   = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [statusRes, obsRes, recsRes, cStatsRes] = await Promise.allSettled([
      api.get('/agent/status'),
      api.get('/agent/observations', { params: { limit: 40 } }),
      api.get('/agent/recommendations'),
      api.get('/consensus/stats'),
    ])
    if (statusRes.status === 'fulfilled') setStatus(statusRes.value.data)
    if (obsRes.status === 'fulfilled' && obsRes.value.data.observations)
      setObservations(obsRes.value.data.observations)
    if (recsRes.status === 'fulfilled' && recsRes.value.data.recommendations)
      setRecs(recsRes.value.data.recommendations)
    if (cStatsRes.status === 'fulfilled' && cStatsRes.value.data.total_rounds != null)
      setCStats(cStatsRes.value.data)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const setIIAgentStats = useBotStore(s => s.setIIAgentStats)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const { data } = await api.post('/agent/analyze')
      setLastReport(data.report)
      setFlash(true)
      setTimeout(() => setFlash(false), 1500)
      await load()
    } catch (e) {
      console.error('Analyze error', e)
    } finally {
      setAnalyzing(false)
    }
  }

  const sendChat = async (text: string) => {
    const msg = text.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    const userEntry: ChatMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setChatHistory(prev => [...prev, userEntry])
    setChatLoading(true)
    try {
      const { data } = await api.post('/fleet/chat', { message: msg })
      const agentEntry: ChatMsg = {
        role: 'agent',
        content: data.response,
        timestamp: new Date().toISOString(),
      }
      setChatHistory(prev => [...prev, agentEntry])
    } catch {
      setChatHistory(prev => [...prev, {
        role: 'agent',
        content: '⚠️ Unable to reach the agent right now. Backend may be restarting.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // Scroll to bottom when new message arrives
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, chatLoading])

  const regime    = status?.current_regime ?? 'UNKNOWN'
  const regimeCfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN

  // Build fleet array from last report or status health map
  const fleetBots: FleetBot[] = lastReport?.fleet_summary ?? []

  // Derive counts from observations
  const hotCount        = lastReport?.hot_bots?.length        ?? Object.values(status?.fleet_health ?? {}).filter(h => h === 'HOT').length
  const strugglingCount = lastReport?.struggling_bots?.length ?? Object.values(status?.fleet_health ?? {}).filter(h => h === 'STRUGGLING').length

  const stableAnalyze = useCallback(() => { handleAnalyze() }, [analyzing])

  useEffect(() => {
    setIIAgentStats({ analyzing, handleAnalyze: stableAnalyze })
    return () => setIIAgentStats(null)
  }, [analyzing, stableAnalyze, setIIAgentStats])

  const heroSlides = [
    {
      title: 'Agent Intelligence', subtitle: 'Master Orchestrator', accent: 'blue' as const,
      stats: [
        { label: 'Market Regime',   value: regime,                                               color: regime === 'BULLISH' ? 'emerald' : regime === 'BEARISH' ? 'red' : 'yellow' as any },
        { label: 'TAO / USD',       value: '—',                                                                    color: 'white' as const },
        { label: 'RSI-14',          value: '—',                                                                    color: 'slate' as const },
        { label: 'Analysis',        value: analyzing ? 'Running…' : 'Idle',                     color: analyzing ? 'yellow' : 'slate' as any },
        { label: 'Observations',    value: String(observations.length),                          color: 'white' as const },
      ],
    },
    {
      title: 'Fleet Intelligence', subtitle: 'Bot Health', accent: 'purple' as const,
      stats: [
        { label: 'Hot Bots',        value: String(hotCount),                                     color: hotCount > 0 ? 'emerald' : 'slate' as any },
        { label: 'Struggling',      value: String(strugglingCount),                              color: strugglingCount > 0 ? 'red' : 'slate' as any },
        { label: 'Recommendations', value: String(recommendations.length),                       color: recommendations.length > 0 ? 'yellow' : 'white' as any },
        { label: 'Fleet Bots',      value: String(fleetBots.length || 12),                      color: 'white' as const },
        { label: 'Last Analysis',   value: lastReport ? 'Complete' : 'Pending',                 color: lastReport ? 'emerald' : 'slate' as any },
      ],
    },
    {
      title: 'OpenClaw Consensus', subtitle: 'BFT Council', accent: 'emerald' as const,
      stats: [
        { label: 'Approval Rate',   value: cStats ? `${(cStats.approval_rate_pct ?? 0).toFixed(1)}%` : '—',   color: 'emerald' as const },
        { label: 'Total Rounds',    value: cStats ? String(cStats.total_rounds) : '—',          color: 'white' as const },
        { label: 'Approved',        value: cStats ? String(cStats.approved_rounds) : '—',       color: 'emerald' as const },
        { label: 'Threshold',       value: '7/12',                                              color: 'purple' as const },
        { label: 'BFT Status',      value: cStats ? 'Active' : 'Waiting',                      color: cStats ? 'emerald' : 'slate' as any },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Top row: Regime + Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Regime card — takes 1 col */}
        <RegimeCard
          regime={regime}
          color={status?.regime_color ?? '#6b7280'}
          price={status?.price ?? null}
          rsi={lastReport?.rsi ?? null}
        />

        {/* Stat cards — 2 cols */}
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: BarChart3, label: 'Analyses Run',
              value: status?.analysis_count ?? 0,
              sub: 'total cycles', accent: 'text-indigo-400',
              tip: 'Total number of autonomous analysis cycles completed. Runs every 5 minutes. Each cycle evaluates all 12 bots, detects market regime, and issues recommendations.',
            },
            {
              icon: Flame, label: 'Hot Strategies',
              value: hotCount,
              sub: `${strugglingCount} struggling`, accent: 'text-emerald-400',
              tip: '🔥 HOT = bot is outperforming with a winning streak. 🔴 STRUGGLING = bot has consecutive losses or a win rate below threshold. Neither is permanent — conditions change every cycle.',
            },
            {
              icon: CheckCircle2, label: 'Fleet PnL',
              value: `${(status?.total_pnl ?? 0) >= 0 ? '+' : ''}${(status?.total_pnl ?? 0).toFixed(4)}τ`,
              sub: 'cumulative', accent: (status?.total_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
              tip: 'Cumulative profit/loss across ALL strategy bots, measured in TAO. Includes paper trades only until a bot earns LIVE promotion. Negative is expected early in paper training.',
            },
            {
              icon: Lightbulb, label: 'Recommendations',
              value: status?.recommendation_count ?? 0,
              sub: 'active directives', accent: 'text-amber-400',
              tip: 'Active directives issued by II Agent during the last analysis. Types: WARNING (risk alert), OPPORTUNITY (entry signal), REGIME (market-wide shift), CONSENSUS (BFT voting outcome). Scroll down to see the full list.',
            },
          ].map(({ icon: Icon, label, value, sub, accent, tip }) => (
            <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon size={14} className={accent} />
                <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">{label}</p>
                <InfoBubble content={tip} side="bottom" maxWidth={280} className="ml-auto" />
              </div>
              <p className={clsx('text-xl font-bold font-mono', accent)}>{value}</p>
              <p className="text-[13px] text-slate-300">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fleet Health Grid ── */}
      {fleetBots.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-slate-300" />
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Fleet Health Monitor</span>
            <span className="ml-auto text-[13px] text-slate-300 font-mono">
              {fleetBots.filter(b => b.health === 'HOT').length} hot · {fleetBots.filter(b => b.health === 'STRUGGLING').length} struggling
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
            {fleetBots.map(bot => (
              <FleetHealthCard key={bot.name} bot={bot} />
            ))}
          </div>
        </div>
      )}

      {/* ── Observations + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Observations — 2/3 width */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <div className="relative">
              <Brain size={14} className="text-indigo-400" />
              {analyzing && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
              )}
            </div>
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Agent Observation Log</span>
            <span className="ml-auto text-[13px] text-slate-300 font-mono">{observations.length} entries</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px] divide-y divide-dark-700/50 px-4 py-2 space-y-0">
            {observations.length === 0 ? (
              <div className="py-12 text-center">
                <Brain size={32} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-300 text-sm font-mono">Agent initialising…</p>
                <p className="text-slate-400 text-xs mt-1">Click "Run Analysis" to trigger the first observation cycle.</p>
              </div>
            ) : (
              observations.map(obs => (
                <ObservationRow key={obs.id} obs={obs} />
              ))
            )}
          </div>
        </div>

        {/* Recommendations — 1/3 width */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400" />
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Directives</span>
            <span className="ml-auto text-[13px] text-slate-300 font-mono">{recommendations.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px] p-3 space-y-2">
            {recommendations.length === 0 ? (
              <div className="py-12 text-center">
                <Lightbulb size={28} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-300 text-xs font-mono">No recommendations yet.</p>
              </div>
            ) : (
              recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Orchestration Architecture Banner ── */}
      <div className="relative rounded-2xl border border-dark-600 overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #0d1525 0%, #152030 50%, #0d1525 100%)' }}>

        {/* Subtle top glow strip */}
        <div className="absolute top-0 left-0 right-0 h-px"
             style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #10b981, #0ea5e9)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 rounded-full bg-indigo-400" />
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

          {/* Node 1 — II Agent */}
          <div className="group relative flex-1 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-indigo-400/60 hover:bg-indigo-500/15 hover:shadow-lg hover:shadow-indigo-500/10">
            {/* Default view */}
            <div className="transition-opacity duration-300 group-hover:opacity-0">
              <p className="text-lg mb-1">🧠</p>
              <p className="text-sm font-bold text-indigo-400 font-mono">II Agent</p>
              <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">Master Orchestrator</p>
              <p className="text-xs font-mono font-semibold text-slate-200">
                {status?.analysis_count ?? 0} analyses run
              </p>
              <p className="text-[13px] text-slate-400 font-mono">
                {status?.observation_count ?? 0} observations logged
              </p>
            </div>
            {/* Hover description */}
            <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
              <p className="text-xs font-bold text-indigo-300 mb-2">🧠 II Agent — Master Orchestrator</p>
              <p className="text-[14px] text-slate-300 leading-relaxed">
                Runs every 5 minutes. Analyses all 12 bots, detects market regime (BULL / BEAR / SIDEWAYS / VOLATILE),
                generates directives, and fires alerts when conditions change. The brain that watches everything.
              </p>
            </div>
          </div>

          {/* Arrow 1 */}
          <div className="flex items-center justify-center px-2 py-2 md:py-0">
            <div className="flex gap-0.5" style={{ animation: 'flowPulse 1.8s ease-in-out infinite' }}>
              <ChevronRight size={16} className="text-indigo-400/60" />
              <ChevronRight size={16} className="text-purple-400/60 -ml-2" />
            </div>
          </div>

          {/* Node 2 — OpenClaw */}
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
              <ChevronRight size={16} className="text-emerald-400/60 -ml-2" />
            </div>
          </div>

          {/* Node 3 — 12 Bots */}
          <div className="group relative flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-emerald-400/60 hover:bg-emerald-500/15 hover:shadow-lg hover:shadow-emerald-500/10">
            <div className="transition-opacity duration-300 group-hover:opacity-0">
              <p className="text-lg mb-1">🤖</p>
              <p className="text-sm font-bold text-emerald-400 font-mono">12 Bots</p>
              <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">Strategy Fleet</p>
              <p className="text-xs font-mono font-semibold text-slate-200">
                {Object.values(status?.fleet_health ?? {}).filter(h => h === 'LIVE' || h === 'HOT' || h === 'HEALTHY').length} active · {Object.values(status?.fleet_health ?? {}).filter(h => h === 'STRUGGLING').length} struggling
              </p>
              <p className="text-[13px] text-slate-400 font-mono">cycling every 60 seconds</p>
            </div>
            <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center">
              <p className="text-xs font-bold text-emerald-300 mb-2">🤖 12 Bots — Strategy Fleet</p>
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
              <ChevronRight size={16} className="text-emerald-400/60" />
              <ChevronRight size={16} className="text-sky-400/60 -ml-2" />
            </div>
          </div>

          {/* Node 4 — Trades */}
          <div className="group relative flex-1 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 cursor-default overflow-hidden transition-all duration-300 hover:border-sky-400/60 hover:bg-sky-500/15 hover:shadow-lg hover:shadow-sky-500/10">
            <div className="transition-opacity duration-300 group-hover:opacity-0">
              <p className="text-lg mb-1">📈</p>
              <p className="text-sm font-bold text-sky-400 font-mono">Trades</p>
              <p className="text-[13px] text-slate-400 uppercase tracking-wider mb-2">TAO Execution</p>
              <p className="text-xs font-mono font-semibold text-slate-200">
                {(status?.total_pnl ?? 0) >= 0 ? '+' : ''}{(status?.total_pnl ?? 0).toFixed(4)} τ PnL
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

      {/* ── OpenClaw BFT Explanation ── */}
      <OpenClawBFTSection />

      {/* ── Chat Panel ── */}
      <div className="rounded-2xl border border-indigo-500/25 overflow-hidden flex flex-col"
           style={{ background: 'linear-gradient(180deg, #0d1525 0%, #0a1020 100%)' }}>

        {/* Chat header — larger, more prominent orb-style */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-indigo-500/20"
             style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 60%, transparent 100%)' }}>

          {/* Chat orb */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center
                            shadow-lg shadow-indigo-500/20"
                 style={{ boxShadow: '0 0 20px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <MessageSquare size={22} className="text-indigo-400" />
            </div>
            {/* Online pulse dot */}
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0d1525] flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping absolute" />
            </span>
          </div>

          {/* Labels */}
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold text-white tracking-wide font-mono">Chat with II Agent</span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[12px] font-mono text-emerald-400">ONLINE</span>
              <span className="text-slate-600">·</span>
              <span className="text-[12px] font-mono text-slate-400">backed by live fleet &amp; market data</span>
            </div>
          </div>

          <span className="ml-auto text-[12px] font-mono text-slate-500 flex items-center gap-1.5">
            <Sparkles size={12} className="text-indigo-400" />
            keyword-matched · real-time indicators
          </span>
        </div>

        {/* Quick prompt pills */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-dark-700/50">
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.label}
              onClick={() => sendChat(qp.text)}
              disabled={chatLoading}
              className="text-[14px] font-mono px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/50 hover:text-indigo-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Message history */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ minHeight: '320px', maxHeight: '420px' }}>
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
                <Brain size={26} className="text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-slate-200 mb-1">Ask me anything about the fleet</p>
              <p className="text-xs text-slate-400 font-mono max-w-xs leading-relaxed">
                I'm backed by live market data, strategy metrics, and the autonomous cycle engine.
                Use the quick prompts above or type your own question.
              </p>
            </div>
          ) : (
            chatHistory.map((msg, i) => (
              <div key={i} className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                {/* Avatar */}
                <div className={clsx(
                  'w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'user'
                    ? 'bg-indigo-600/30 border border-indigo-500/40'
                    : 'bg-purple-600/30 border border-purple-500/40'
                )}>
                  {msg.role === 'user'
                    ? <User size={13} className="text-indigo-300" />
                    : <Bot  size={13} className="text-purple-300" />
                  }
                </div>

                {/* Bubble */}
                <div className={clsx(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed font-mono',
                  msg.role === 'user'
                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 rounded-tr-sm'
                    : 'bg-dark-700 border border-dark-600 text-slate-200 rounded-tl-sm'
                )}>
                  {/* Format **bold** inline */}
                  {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                    part.startsWith('**') && part.endsWith('**')
                      ? <strong key={j} className="text-white font-bold">{part.slice(2, -2)}</strong>
                      : <span key={j}>{part}</span>
                  )}
                  <p className="text-[15px] text-slate-500 mt-1.5 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {chatLoading && (
            <div className="flex gap-3 flex-row">
              <div className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={13} className="text-purple-300" />
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-dark-700 px-4 py-3">
          <form
            onSubmit={e => { e.preventDefault(); sendChat(chatInput) }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask about PnL, regime, strategies, risk controls…"
              disabled={chatLoading}
              className={clsx(
                'flex-1 bg-dark-700 border border-dark-600 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200',
                'placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30',
                'transition-all duration-200 disabled:opacity-50',
              )}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                chatInput.trim() && !chatLoading
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-dark-700 text-slate-500 border border-dark-600 cursor-not-allowed'
              )}
            >
              <Send size={14} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
          <p className="text-[13px] text-slate-500 font-mono mt-1.5 px-1">
            Responses are generated from live DB data · no LLM required
          </p>
        </div>
      </div>
      </div>{/* end scrollable content */}
    </div>
  )
}