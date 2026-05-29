/**
 * Ari — Bittensor Guide and Navigator (filename `IIAgent.tsx` and
 * component name `IIAgent` retained for URL/bookmark/import-path
 * stability — see F-45 spec, internal identifier rename explicitly
 * out of scope).
 *
 * The top-level intelligence view: regime, fleet health, observations,
 * recommendations, and the chat-with-Ari surface with a rotating
 * placeholder cycling through page-anchored prompts (F-45).
 *
 * F-45.2: docstring title migrated from "Master Orchestrator Dashboard"
 * to the public-register naming for code/surface coherence.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Brain, TrendingUp, TrendingDown, Minus, Zap,
  Activity, RefreshCw, ChevronRight, AlertTriangle, Users,
  HelpCircle, ShieldCheck, ShieldX,
  Eye, BarChart3, Lightbulb,
  Cpu, Radio, ShieldAlert, ArrowUpRight, MessageSquare,
  Send, Sparkles, User, Bot,
  // Session XXXVIII: removed CheckCircle2, Flame — only used by the
  // retired top-row KPI strip (Fleet PnL + Hot Strategies cards).
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'
import { InfoBubble } from '@/components/Tooltip'
// Session XXXVIII: REGIME_CONFIG + RegimeCard extracted to
// components/RegimeCard.tsx so Manual Trades can import the same card.
// REGIME_CONFIG kept available here for regime label lookups in chat /
// observations rendering.
import { REGIME_CONFIG } from '@/components/RegimeCard'
// F-45 (Day 15 Ari rebrand): rotating placeholder + page-anchored prompts.
import { ROTATING_PROMPTS, ROTATING_PROMPT_STATIC } from '@/lib/ariPrompts'
// Day 16 (#11): Ari's Billboard — curated rotating messages from Ari, lives
// inside the Chat Window between quick prompts and message history. 9-second
// cadence, dots, pause-on-slide. See AriBillboard.tsx for doctrinal notes.
import { AriBillboard } from '@/components/AriBillboard'

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
// REGIME_CONFIG imported from components/RegimeCard.tsx at the top of the
// file (Session XXXVIII relocation).

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
  { label: '📊 PnL?',          text: 'What is the total fleet PnL right now?' },
  { label: '🏆 Top bots',     text: 'Which are the top 3 performing strategies?' },
  { label: '🌡️ Regime',       text: 'What is the current market regime and RSI?' },
  { label: '⚡ Gate status',   text: 'Which strategies are approved or close to promotion?' },
  { label: '🔁 Cycles',        text: 'How many autonomous cycles have completed?' },
  { label: '🛡️ Risk',          text: 'What are the current risk controls?' },
  // Carry-over #11 — All-subnets scoring chat capabilities
  { label: '🧬 Top by score',  text: 'Top 5 subnets by score' },
  { label: '💰 Top APY',       text: 'Top 5 subnets by APY' },
  { label: '🛡️ Fortress',      text: 'Show me FORTRESS subnets' },
  { label: '⚠️ Vulnerable',    text: 'Show me VULNERABLE subnets' },
  { label: '✅ 6/6 subnets',   text: 'Which subnets pass 6/6 filters?' },
  { label: '🤖 Bot trading',   text: 'What subnets is the bot trading?' },
  // Phase C — Fleet Consensus vote forecasting
  { label: '🔮 Forecast BUY',  text: 'Forecast: would a BUY signal pass right now?' },
  { label: '🔮 Forecast SELL', text: 'Forecast: would a SELL signal pass right now?' },
  // Session XXXVII — Audit-trail narration
  { label: '📜 What changed today?',     text: 'What changed today?' },
  { label: '📜 Recent edits',            text: 'Show me recent edits' },
  { label: '📜 Risk-config history',     text: 'Any risk config changes this week?' },
]

// ── Thought-bubble phrases (Session XXXVII) ──────────────────────────────────
// While the agent "thinks", we surface a contextual status string that swaps
// every ~700ms.  Each phrase set is a small narrative arc (3–4 beats) that
// matches the user's query domain.  We also enforce a minimum dwell time on
// the typing indicator so even fast keyword-routed responses feel deliberate.
//
// THOUGHT_PHRASES is a routing table:  each entry is { match, beats }.
//   match   — keyword regex tested against the user's lowercased message
//   beats   — array of italic status lines to cycle through
// First-match wins; the GENERIC arc is the fallback.

const THOUGHT_PHRASES: Array<{ match: RegExp; beats: string[] }> = [
  { match: /forecast|simulate|monte|trial|would.*(pass|win)/i, beats: [
      'Spinning up Monte-Carlo trials…',
      'Polling personality directional bias…',
      'Tallying simulated votes…',
      'Composing forecast…',
  ]},
  { match: /owner|team|hold|whale|conviction|fortress|vulnerable|defend/i, beats: [
      'Reading Conviction-Era owner snapshot…',
      'Cross-checking shield positions…',
      'Composing reply…',
  ]},
  { match: /pnl|profit|loss|earn|equity|return/i, beats: [
      'Reading fleet ledger…',
      'Aggregating live trade rows…',
      'Composing reply…',
  ]},
  { match: /regime|rsi|macd|trend|market|price/i, beats: [
      'Sampling latest TAO candle…',
      'Reading regime classifier…',
      'Composing reply…',
  ]},
  { match: /strategy|strategies|hot|struggling|gate|promot|demot/i, beats: [
      'Pulling fleet health map…',
      'Re-scoring strategies…',
      'Composing reply…',
  ]},
  { match: /risk|drawdown|circuit|cap|limit|control/i, beats: [
      'Reading risk config…',
      'Checking active circuit breakers…',
      'Composing reply…',
  ]},
  { match: /cycle|analysis|run|recommend|directive/i, beats: [
      'Reading autonomous cycle log…',
      'Composing reply…',
  ]},
  { match: /subnet|sn\d+|score|apy|top/i, beats: [
      'Reading 128-subnet scoring matrix…',
      'Filtering against gate criteria…',
      'Composing reply…',
  ]},
  { match: /trade|trades|trading|bot/i, beats: [
      'Reading recent trades…',
      'Cross-checking bot allocations…',
      'Composing reply…',
  ]},
  { match: /alert|listing|cex|coinbase|kraken/i, beats: [
      'Reading CEX listing watchlist…',
      'Composing reply…',
  ]},
  { match: /audit|changelog|narrate|recent edit|what changed|risk.*history|history of|who started|who edited/i, beats: [
      'Reading audit ring buffer…',
      'Filtering by time window…',
      'Grouping by category…',
      'Composing narrative…',
  ]},
  // Generic fallback
  { match: /.*/i, beats: [
      'Reading live state…',
      'Cross-checking sources…',
      'Composing reply…',
  ]},
]

function pickThoughtBeats(message: string): string[] {
  const lower = message.toLowerCase()
  for (const entry of THOUGHT_PHRASES) {
    if (entry.match.test(lower)) return entry.beats
  }
  return THOUGHT_PHRASES[THOUGHT_PHRASES.length - 1].beats
}

// Minimum dwell time (ms) for the typing bubble — scales with query length so
// "what is the regime?" feels different from a 30-word multi-clause query.
//
// Session XXXV: Mav asked for the thinking pause to be noticeably longer
// ("5 or 6 seconds — sounds crazy but the delay makes the II Agent feel real").
// Tuned the floor up to 5,000 ms with up to ~+1,000 ms scaling on long queries,
// plus ~+500 ms jitter. End-to-end window: roughly 5.0–6.5 s for short prompts,
// 5.5–6.5 s for verbose ones. Beats cycle every ~900 ms (was 700) so the
// operator always reads at least 5–6 distinct phrases before the response lands.
function minDwellMs(message: string): number {
  const baseMs = 5000
  const perWordMs = 70
  const wordCount = message.trim().split(/\s+/).length
  const total = baseMs + Math.min(wordCount, 14) * perWordMs
  // Add a small jitter so successive replies don't feel mechanical.
  return total + Math.floor(Math.random() * 500)
}

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
// Session XXXVIII: PulseRing + RegimeCard relocated to
// components/RegimeCard.tsx (the only thing that referenced them on this
// page was the retired top-row KPI strip). Manual Trades hosts the card
// now. REGIME_CONFIG is re-imported above so chat/observations rendering
// keeps working.

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




interface BotVote {
  bot_name:    string
  display_name: string
  vote:        string
  confidence:  number
  reason:      string
  mode?:       string
  reasoning?:  string
}

interface ConsensusRound {
  round_id:       number
  triggered_by:   string
  direction:      string
  price_at_round: number
  timestamp:      string
  votes:          BotVote[]
  result:         string
  buy_count:      number
  sell_count:     number
  hold_count:     number
  abstain_count:  number
  supermajority:  number
  approved:       boolean
  duration_ms:    number
}

interface ConsensusStats {
  total_rounds:       number
  approved_rounds:    number
  rejected_rounds:    number
  total_buy_votes:    number
  total_sell_votes:   number
  total_hold_votes:   number
  approval_rate_pct:  number
  supermajority_threshold: number
  total_bots:         number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VOTE_META: Record<string, { label: string; color: string; bg: string; border: string; text: string; icon: any }> = {
  BUY:     { label: 'BUY',     color: '#10b981', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: TrendingUp    },
  SELL:    { label: 'SELL',    color: '#ef4444', bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-400',     icon: TrendingDown  },
  HOLD:    { label: 'HOLD',    color: '#f59e0b', bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-400',   icon: Minus         },
  ABSTAIN: { label: 'ABSTAIN', color: '#6b7280', bg: 'bg-slate-700/40',   border: 'border-slate-600/40',   text: 'text-slate-300',   icon: HelpCircle    },
}

const RESULT_META: Record<string, { label: string; color: string; bg: string; icon: typeof ShieldCheck }> = {
  APPROVED_BUY:  { label: 'APPROVED BUY',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: ShieldCheck },
  APPROVED_SELL: { label: 'APPROVED SELL', color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30',         icon: ShieldCheck },
  REJECTED:      { label: 'REJECTED',      color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         icon: ShieldX     },
  DEADLOCK:      { label: 'DEADLOCK',      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     icon: AlertTriangle },
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Compact top-of-page legend identifying every symbol on the page */
function LegendBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 bg-dark-800/70 border border-dark-700 rounded-xl text-[13px] font-mono">

      {/* Vote types */}
      <span className="text-slate-500 uppercase tracking-widest text-[15px]">Votes</span>
      <span className="flex items-center gap-1 text-emerald-400"><TrendingUp  size={10} /> BUY — strategy recommends buying</span>
      <span className="flex items-center gap-1 text-red-400">   <TrendingDown size={10} /> SELL — strategy recommends selling</span>
      <span className="flex items-center gap-1 text-amber-400"> <Minus        size={10} /> HOLD — no clear edge, wait</span>
      <span className="flex items-center gap-1 text-slate-400"> <HelpCircle   size={10} /> ABSTAIN — insufficient data</span>

      {/* Divider */}
      <span className="hidden sm:block w-px h-4 bg-dark-600" />

      {/* Round results */}
      <span className="text-slate-500 uppercase tracking-widest text-[15px]">Result</span>
      <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck   size={10} /> APPROVED — supermajority reached</span>
      <span className="flex items-center gap-1 text-red-400">   <ShieldX       size={10} /> REJECTED — vote failed</span>
      <span className="flex items-center gap-1 text-amber-400"> <AlertTriangle size={10} /> DEADLOCK — tie, no majority</span>

      {/* Divider */}
      <span className="hidden sm:block w-px h-4 bg-dark-600" />

      {/* Mode badges */}
      <span className="text-slate-500 uppercase tracking-widest text-[15px]">Mode</span>
      <span className="text-emerald-400">🚀 LIVE — executes real on-chain trades</span>
      <span className="text-sky-400">✅ APPROVED — gate passed, awaiting deploy</span>
      <span className="text-slate-400">📄 Paper Trading · uses Simulated USD · no real TAO moves</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent, tip }: {
  icon: typeof Zap; label: string; value: string | number
  sub?: string; accent?: string; tip?: React.ReactNode
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex items-start gap-3">
      <div className={clsx('p-2 rounded-lg mt-0.5 flex-shrink-0', accent ?? 'bg-indigo-500/15')}>
        <Icon size={16} className={clsx(accent ? '' : 'text-indigo-400')} />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
          {label}
          {tip && <InfoBubble content={tip} side="right" maxWidth={300} />}
        </p>
        <p className="text-xl font-bold text-white font-mono mt-0.5">{value}</p>
        {sub && <p className="text-[14px] text-slate-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function VoteBar({ buyCount, sellCount, holdCount, abstainCount, threshold }: {
  buyCount: number; sellCount: number; holdCount: number; abstainCount: number; threshold: number
}) {
  const total = 12
  const buyPct     = (buyCount / total) * 100
  const sellPct    = (sellCount / total) * 100
  const holdPct    = (holdCount / total) * 100
  const abstainPct = (abstainCount / total) * 100
  const threshPct  = (threshold / total) * 100

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-300 font-mono mb-1">
        <span>0</span>
        <span>12</span>
      </div>
      <div className="relative h-8 rounded-lg overflow-hidden bg-dark-700 flex">
        {buyCount > 0 && (
          <div
            className="h-full flex items-center justify-center text-xs font-bold text-white transition-all duration-700"
            style={{ width: `${buyPct}%`, background: '#10b981' }}
          >
            {buyPct > 8 && `${buyCount}B`}
          </div>
        )}
        {sellCount > 0 && (
          <div
            className="h-full flex items-center justify-center text-xs font-bold text-white transition-all duration-700"
            style={{ width: `${sellPct}%`, background: '#ef4444' }}
          >
            {sellPct > 8 && `${sellCount}S`}
          </div>
        )}
        {holdCount > 0 && (
          <div
            className="h-full flex items-center justify-center text-xs font-bold text-white transition-all duration-700"
            style={{ width: `${holdPct}%`, background: '#f59e0b' }}
          >
            {holdPct > 8 && `${holdCount}H`}
          </div>
        )}
        {abstainCount > 0 && (
          <div
            className="h-full flex items-center justify-center text-xs font-bold text-slate-300 transition-all duration-700"
            style={{ width: `${abstainPct}%`, background: '#374151' }}
          >
            {abstainPct > 8 && `${abstainCount}A`}
          </div>
        )}
        {/* Threshold marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/60 border-l border-dashed border-white/40"
          style={{ left: `${threshPct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs font-mono">
        <span className="text-emerald-400">● BUY {buyCount}</span>
        <span className="text-red-400">● SELL {sellCount}</span>
        <span className="text-amber-400">● HOLD {holdCount}</span>
        <span className="text-slate-300">● ABSTAIN {abstainCount}</span>
      </div>
    </div>
  )
}

function BotVoteCard({ vote }: { vote: BotVote }) {
  const meta = VOTE_META[vote.vote] ?? VOTE_META.HOLD
  const Icon = meta.icon

  return (
    <div className={clsx(
      'rounded-xl border p-3 flex flex-col gap-2 transition-all duration-500',
      meta.bg, meta.border,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-white truncate pr-1">{vote.display_name}</p>
        <div className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-bold', meta.bg)}>
          <Icon size={10} className={meta.text} />
          <span className={meta.text}>{vote.vote}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-[13px] font-mono mb-1">
          <span className="text-slate-300">Confidence</span>
          <span className={meta.text}>{((vote.confidence ?? 0) * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${vote.confidence * 100}%`, background: meta.color }}
          />
        </div>
      </div>

      {/* Mode badge */}
      <div className="flex items-center justify-between">
        <span className={clsx(
          'text-[15px] font-mono px-1.5 py-0.5 rounded font-semibold',
          vote.mode === 'LIVE'             ? 'bg-emerald-500/20 text-emerald-400' :
          vote.mode === 'APPROVED_FOR_LIVE'? 'bg-sky-500/20 text-sky-400' :
                                             'bg-slate-700 text-slate-300'
        )}>
          {vote.mode === 'LIVE' ? '🚀 LIVE' : vote.mode === 'APPROVED_FOR_LIVE' ? '✅ APPROVED' : '📄 PAPER'}
        </span>
      </div>

      {/* Reasoning */}
      <p className="text-[13px] text-slate-300 leading-tight line-clamp-2">{vote.reasoning}</p>
    </div>
  )
}

function RoundRow({ round, index }: { round: ConsensusRound; index: number }) {
  const rm = RESULT_META[round.result] ?? RESULT_META.REJECTED
  const ResultIcon = rm.icon
  return (
    <tr className={clsx('border-b border-dark-700 hover:bg-dark-700/40 transition-colors', index === 0 && 'bg-dark-700/30')}>
      <td className="px-3 py-2 font-mono text-xs text-slate-300">#{round.round_id}</td>
      <td className="px-3 py-2 text-xs text-slate-300 truncate max-w-[120px]">{round.triggered_by}</td>
      <td className="px-3 py-2">
        <span className={clsx(
          'text-[13px] font-bold font-mono px-2 py-0.5 rounded-full border',
          rm.bg, rm.color,
        )}>
          {rm.label}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-center">
        <span className="text-emerald-400">{round.buy_count}B</span>
        <span className="text-slate-300 mx-1">/</span>
        <span className="text-red-400">{round.sell_count}S</span>
        <span className="text-slate-300 mx-1">/</span>
        <span className="text-amber-400">{round.hold_count}H</span>
      </td>
      <td className="px-3 py-2 text-[14px] text-slate-300 font-mono">${(round.price_at_round ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2 text-[14px] text-slate-300">{timeSince(round.timestamp)}</td>
      <td className="px-3 py-2 text-[13px] text-slate-300 font-mono">{round.duration_ms}ms</td>
    </tr>
  )
}


// VOTE_COLORS — used by CouncilPanel (matches Fleet Consensus's compact vote style)
const VOTE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  BUY:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400' },
  SELL:    { bg: 'bg-red-500/10',     border: 'border-red-500/25',     text: 'text-red-400'     },
  HOLD:    { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400'   },
  ABSTAIN: { bg: 'bg-slate-700/30',   border: 'border-slate-700/50',   text: 'text-slate-400'   },
}

function CouncilPanel({
  stats, latestRound: round,
}: {
  stats: ConsensusStats | null
  latestRound: ConsensusRound | null
}) {
  const rMeta = round
    ? (RESULT_META[round.result] ?? { label: round.result, color: 'text-slate-400', bg: '', icon: AlertTriangle })
    : null

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600 flex-shrink-0">
        <div className="p-1 rounded bg-purple-500/15">
          <Users size={12} className="text-purple-400" />
        </div>
        <span className="text-[13px] font-bold tracking-widest text-slate-200 uppercase">Fleet Consensus</span>
        <span className="ml-auto text-[11px] font-mono text-purple-400/70 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
          BFT · 7/12
        </span>
      </div>

      {/* Stats strip */}
      {stats ? (
        <div className="flex flex-shrink-0 border-b border-dark-600">
          <div className="flex-1 px-3 py-2 border-r border-dark-600 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Approval</p>
            <p className={clsx('text-lg font-bold font-mono leading-tight',
              stats.approval_rate_pct >= 45 && stats.approval_rate_pct <= 65 ? 'text-emerald-400'
              : stats.approval_rate_pct > 65 ? 'text-yellow-400' : 'text-orange-400'
            )}>{(stats.approval_rate_pct ?? 0).toFixed(1)}%</p>
          </div>
          <div className="flex-1 px-3 py-2 border-r border-dark-600 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Rounds</p>
            <p className="text-lg font-bold font-mono text-slate-200 leading-tight">{stats.total_rounds}</p>
          </div>
          <div className="flex-1 px-3 py-2 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Approved</p>
            <p className="text-lg font-bold font-mono text-emerald-400 leading-tight">{stats.approved_rounds}</p>
          </div>
        </div>
      ) : (
        <div className="px-4 py-2.5 text-[11px] text-slate-500 font-mono flex-shrink-0 border-b border-dark-600">Loading…</div>
      )}

      {/* Latest result */}
      {round && rMeta && (
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-dark-600">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Round #{round.round_id}</span>
            <div className={clsx('flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border', rMeta.bg, rMeta.color)}>
              <rMeta.icon size={11} />
              {rMeta.label}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
            {round.triggered_by.replace(/_/g, ' ')} · {round.direction} · ${(round.price_at_round ?? 0).toFixed(2)} TAO
          </p>
        </div>
      )}

      {/* 2-col vote grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {round?.votes && round.votes.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-1 mb-3">
              {round.votes.map(v => {
                const vc = VOTE_COLORS[v.vote as keyof typeof VOTE_COLORS] ?? VOTE_COLORS.ABSTAIN
                return (
                  <div key={v.bot_name}
                    className={clsx('flex items-center gap-1.5 px-2 py-1.5 rounded-lg border', vc.bg, vc.border)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-slate-200 truncate leading-tight">{v.display_name}</p>
                      <p className="text-[9px] text-slate-500 font-mono">{((v.confidence ?? 0) * 100).toFixed(0)}% conf</p>
                    </div>
                    <span className={clsx('text-[11px] font-bold font-mono flex-shrink-0', vc.text)}>{v.vote}</span>
                  </div>
                )
              })}
            </div>

            {/* Tally bars */}
            <div className="space-y-1.5">
              {[
                { label: 'BUY',     count: round.buy_count,     color: 'bg-emerald-500/70', text: 'text-emerald-400' },
                { label: 'SELL',    count: round.sell_count,    color: 'bg-red-500/70',     text: 'text-red-400'     },
                { label: 'HOLD',    count: round.hold_count,    color: 'bg-yellow-500/50',  text: 'text-yellow-400'  },
                { label: 'ABSTAIN', count: round.abstain_count, color: 'bg-slate-600/50',   text: 'text-slate-400'   },
              ].map(({ label, count, color, text }) => (
                <div key={label} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={clsx('w-16 flex-shrink-0', text)}>{label} {count}</span>
                  <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full transition-all', color)}
                      style={{ width: `${(count / 12) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-slate-500 text-[12px] font-mono">No votes yet</div>
        )}
      </div>
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
  const [cStats,      setCStats]      = useState<ConsensusStats | null>(null)

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatInput,   setChatInput]   = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  // F-45 — Rotating placeholder. Cycles every 4s through page-anchored
  // "Ask Ari: …" prompts. Pauses when input is focused or non-empty,
  // and respects prefers-reduced-motion (renders the static fallback).
  const [chatInputFocused, setChatInputFocused] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const reduceMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (reduceMotion) return
    if (chatInputFocused || chatInput.length > 0) return
    const id = window.setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % ROTATING_PROMPTS.length)
    }, 4000)
    return () => window.clearInterval(id)
  }, [chatInputFocused, chatInput, reduceMotion])
  const rotatingPlaceholder = reduceMotion
    ? ROTATING_PROMPT_STATIC
    : ROTATING_PROMPTS[placeholderIdx]
  // Session XXXVII — thought-bubble UX
  const [thoughtBeats, setThoughtBeats] = useState<string[]>([])
  const [thoughtIdx,   setThoughtIdx]   = useState(0)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  // Session XXXIV: scroll the chat container directly (not the whole page) to
  // prevent the prompt-pill row from jumping the viewport to the bottom of the
  // panel when the Operator clicks a quick-prompt at the top of the chat.
  const chatScrollRef = useRef<HTMLDivElement>(null)

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

    // Session XXXVII — pick contextual thought beats and start the typing bubble.
    // We race the network round-trip against a minimum dwell time so the bubble
    // is on screen long enough to read at least one beat (≥1.4s, scales with
    // query length).  The Promise.all([...]) pattern below guarantees both the
    // fetch AND the dwell-timer resolve before we drop the typing bubble.
    const beats = pickThoughtBeats(msg)
    setThoughtBeats(beats)
    setThoughtIdx(0)
    setChatLoading(true)

    const dwell = new Promise<void>(resolve => setTimeout(resolve, minDwellMs(msg)))
    const network = (async () => {
      try {
        const { data } = await api.post('/fleet/chat', { message: msg })
        return { ok: true as const, content: data.response as string }
      } catch {
        return { ok: false as const, content: '⚠️ Unable to reach the agent right now. Backend may be restarting.' }
      }
    })()

    try {
      const [, result] = await Promise.all([dwell, network])
      const agentEntry: ChatMsg = {
        role: 'agent',
        content: result.content,
        timestamp: new Date().toISOString(),
      }
      setChatHistory(prev => [...prev, agentEntry])
    } finally {
      setChatLoading(false)
      setThoughtBeats([])
      setThoughtIdx(0)
    }
  }

  // Cycle through thought beats every ~900 ms while the bubble is visible.
  // Session XXXV: bumped from 700 ms to 900 ms to match the longer 5–6 s
  // dwell — pacing now lets the operator actually read each phrase before it
  // moves on. We still hold on the LAST beat (don't loop) so the first beat
  // never re-appears mid-reply.
  useEffect(() => {
    if (!chatLoading || thoughtBeats.length === 0) return
    const id = setInterval(() => {
      setThoughtIdx(i => Math.min(i + 1, thoughtBeats.length - 1))
    }, 900)
    return () => clearInterval(id)
  }, [chatLoading, thoughtBeats])

  // Scroll the chat container ITSELF to bottom when a new message arrives.
  // Session XXXIV: previously used `chatBottomRef.scrollIntoView()` which
  // bubbles to ALL ancestors and jumped the whole page to the chat panel
  // whenever the Operator clicked a quick-prompt at the top. Switched to
  // direct scrollTop on the chat-history container so only that pane scrolls.
  useEffect(() => {
    if (chatHistory.length === 0) return
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatHistory, chatLoading])

  const regime    = status?.current_regime ?? 'UNKNOWN'
  const regimeCfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN

  // Build fleet array from last report or status health map
  const fleetBots: FleetBot[] = lastReport?.fleet_summary ?? []

  // Session XXXVIII: hotCount/strugglingCount were only used by the retired
  // top-row KPI strip. The Hot Strategies KPI now lives on the Dashboard
  // and computes its own counts there.

  const stableAnalyze = useCallback(() => { handleAnalyze() }, [analyzing])

  useEffect(() => {
    setIIAgentStats({ analyzing, handleAnalyze: stableAnalyze })
    return () => setIIAgentStats(null)
  }, [analyzing, stableAnalyze, setIIAgentStats])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Top KPI strip — RETIRED in Session XXXVIII ────────────────────────
          Mav redistributed the four KPIs across the rest of the app:
            · Market Regime    → Manual Trades (top of page)
            · Fleet PnL        → tooltip merged into Dashboard's "Total PnL"
            · Analyses Run     → Fleet Consensus KPI row (right of Total Rounds)
            · Hot Strategies   → Dashboard slot 10 (replaces Daily Cap)
            · Recommendations  → already covered by the "Active Directives"
                                 section in the right column below; KPI removed
          The page now leads straight into the Chat Panel — the actual
          interaction surface — without the redundant KPI deck. ──────────── */}

      {/* ── Day 16 (#11) — Ari's Billboard ──
          Relocated to the TOP of the page per Mark's spec: this is the first
          thing the operator sees when they land on the Ari page. Lifted out
          of the Chat Window because the chat surface is too crowded once a
          prompt + response start to fill it. 14 messages across 4 movements
          (Identity / Category / Doctrine / Safety). 9-second cadence.
          Embodies D-45 — Ari speaks first, in her own voice. */}
      <AriBillboard />

      {/* ── Chat Panel ──
          Session XXXV: dominant section colour flipped from indigo → emerald
          per Mav's spec ("Green w/ Red Indicator"). The red indicator is the
          HAL-eye dot in the upper-right of the chat orb — a nod to the
          original red orb concept and to Hal Finney (Finney mainnet). */}
      <div className="rounded-2xl border border-emerald-500/25 overflow-hidden flex flex-col"
           style={{ background: 'linear-gradient(180deg, #0d1525 0%, #0a1020 100%)' }}>

        {/* Chat header — larger, more prominent orb-style */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-emerald-500/20"
             style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(45,212,191,0.06) 60%, transparent 100%)' }}>

          {/* Day 16 #6 — Mini HAL-eye dot REMOVED from the chat orb.
              The lifelike HAL eye now lives in three richer placements
              (side-menu orb, Dashboard, billboard) — keeping a tiny copy
              up here was redundant and created a "sticker" feel on the
              chat panel header. The orb itself stays emerald; the
              presence/identity is carried by the dedicated billboard
              card above this chat panel. */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center
                            shadow-lg shadow-emerald-500/20"
                 style={{ boxShadow: '0 0 20px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <MessageSquare size={22} className="text-emerald-400" />
            </div>
          </div>

          {/* Labels — Day 16 #8: title changed from "Chat with Ari" → "Ari · On-line".
              The chat surface no longer tells the operator what THEY do
              ("chat"); it tells them Ari's status ("on-line"). The action
              is implicit (it's a chat panel, with a Send button). The
              ONLINE pill on the second line is collapsed into the title;
              the second line keeps just the data-source provenance. */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-base font-bold text-white tracking-wide font-mono">Ari · On-line</span>
            </div>
            <span className="text-[12px] font-mono text-slate-400">backed by live fleet &amp; market data</span>
          </div>

          <span className="ml-auto text-[12px] font-mono text-slate-500 flex items-center gap-1.5">
            <Sparkles size={12} className="text-emerald-400" />
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
              className="text-[14px] font-mono px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:text-emerald-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Message history */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ minHeight: '320px', maxHeight: '420px' }}>
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center">
              {/* Day 16 #7/#10 (Mark's correction, then follow-up):
                  empty-state Brain icon recoloured emerald → pink, then
                  un-boxed. The previous emerald version sat inside a
                  56×56 rounded tile; once the brain went pink, the tile
                  shrank the icon and made it look like a button instead
                  of a presence. Per Mark's spec the container is dropped
                  and the brain is re-enlarged to ~52px so it stands on
                  its own as a free-floating sigil — Ari's signature in
                  the chat surface. The green-online-pill on the chat
                  header stays as-is per Mark's earlier spec — that pill
                  signals connection liveness, not Ari's identity. */}
              <Brain
                size={52}
                className="text-pink-400 mb-3 drop-shadow-[0_0_12px_rgba(244,114,182,0.35)]"
                aria-hidden
              />
              <p className="text-sm font-semibold text-slate-200 mb-1">Ask me anything about the fleet</p>
              <p className="text-xs text-slate-400 font-mono max-w-xs leading-relaxed">
                I'm backed by live market data, strategy metrics, and the autonomous cycle engine.
                Use the quick prompts above or type your own question.
              </p>
            </div>
          ) : (
            chatHistory.map((msg, i) => (
              // Session XXXIV: Operator (user) on LEFT, II Agent (agent) on RIGHT
              // — flipped from previous order per Partner spec.
              <div key={i} className={clsx('flex gap-3', msg.role === 'agent' ? 'flex-row-reverse' : 'flex-row')}>
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

                {/* Bubble — Session XXXIV: Operator on left (rounded-tl-sm), Agent on right (rounded-tr-sm) */}
                <div className={clsx(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed font-mono',
                  msg.role === 'user'
                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 rounded-tl-sm'
                    : 'bg-dark-700 border border-dark-600 text-slate-200 rounded-tr-sm'
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

          {/* Typing indicator — Session XXXIV: agent now on right side
              Session XXXVII: now shows a cycling thought-bubble label so the
              operator can see WHAT the agent is "doing" while it composes. */}
          {chatLoading && (
            <div className="flex gap-3 flex-row-reverse">
              <div className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={13} className="text-purple-300" />
              </div>
              <div className="bg-dark-700 border border-dark-600 rounded-2xl rounded-tr-sm px-4 py-3 flex items-center gap-2.5 max-w-[78%]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {thoughtBeats.length > 0 && (
                  <span
                    key={thoughtIdx /* re-mounts to retrigger fade */}
                    className="text-[12px] font-mono italic text-slate-400 animate-thought-fade"
                  >
                    {thoughtBeats[thoughtIdx]}
                  </span>
                )}
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
              onFocus={() => setChatInputFocused(true)}
              onBlur={() => setChatInputFocused(false)}
              // F-45: rotating placeholder cycles through page-anchored
              // "Ask Ari: …" prompts every 4s when input is empty + unfocused.
              // Static fallback for prefers-reduced-motion.
              placeholder={rotatingPlaceholder}
              disabled={chatLoading}
              className={clsx(
                'flex-1 bg-dark-700 border border-dark-600 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200',
                'placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30',
                'transition-all duration-200 disabled:opacity-50',
              )}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                chatInput.trim() && !chatLoading
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
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

      {/* ── Observations + Active Directives ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Observations — 2/3 width */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <div className="relative">
              <Brain size={14} className="text-emerald-400" />
              {analyzing && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
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

        {/* Active Directives — 1/3 width
            Session XXXVIII: section renamed Directives → Active Directives
            (Mav spec). The retired "Recommendations" KPI card pointed here
            anyway, so the new name makes the section self-describing. */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400" />
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Active Directives</span>
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

      {/* Orchestration Architecture Banner relocated FROM here TO Dashboard.
          Session XXXV: How It All Connects moved to the top of the Dashboard
          per Mav spec. See components/HowItAllConnects.tsx for the colour
          swap (II Agent green, 12 Bots purple). */}


      </div>{/* end scrollable content */}
    </div>
  )
}