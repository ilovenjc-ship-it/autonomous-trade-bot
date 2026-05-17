/**
 * OpenClaw BFT Consensus Engine
 * Real-time visualization of the 12-bot voting council.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Shield, ShieldCheck, ShieldX, Vote, Zap,
  TrendingUp, TrendingDown, Minus, HelpCircle,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  Activity, BarChart3, Users, ChevronRight,
  RefreshCw,                                          // Session XXXIV: Forecast panel
} from 'lucide-react'
// Recharts imports removed Session XXV (Vote Breakdown + Approval Trend charts gone)
import clsx from 'clsx'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'
import ForecastAccuracyGauge from '@/components/ForecastAccuracyGauge'
import CycleStatusBar from '@/components/CycleStatusBar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BotVote {
  bot_name:     string
  display_name: string
  vote:         'BUY' | 'SELL' | 'HOLD' | 'ABSTAIN'
  confidence:   number
  reasoning:    string
  mode:         string
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

const VOTE_META = {
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

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Compact top-of-page legend identifying every symbol on the page */
function LegendBar() {
  // Session XXIX — categories stacked vertically (was horizontal flex row).
  // Each category (Votes / Result / Mode) is its own row with the items
  // wrapping inside it. Matches partner spec: "stack them vertically for
  // better differentiation". Also relocated from page top → inside the
  // latest-round container, above Council Votes (see JSX usage below).
  const rowCls = "flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5"
  const labelCls = "text-slate-500 uppercase tracking-widest text-[13px] w-20 shrink-0"
  return (
    <div className="px-4 py-3 bg-dark-800/70 border border-dark-700 rounded-xl text-[13px] font-mono divide-y divide-dark-700/50">

      {/* Row 1 — Vote types */}
      <div className={rowCls}>
        <span className={labelCls}>Votes</span>
        <span className="flex items-center gap-1 text-emerald-400"><TrendingUp  size={10} /> BUY — strategy recommends buying</span>
        <span className="flex items-center gap-1 text-red-400">   <TrendingDown size={10} /> SELL — strategy recommends selling</span>
        <span className="flex items-center gap-1 text-amber-400"> <Minus        size={10} /> HOLD — no clear edge, wait</span>
        <span className="flex items-center gap-1 text-slate-400"> <HelpCircle   size={10} /> ABSTAIN — insufficient data</span>
      </div>

      {/* Row 2 — Round results */}
      <div className={rowCls}>
        <span className={labelCls}>Result</span>
        <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck   size={10} /> APPROVED — supermajority reached</span>
        <span className="flex items-center gap-1 text-red-400">   <ShieldX       size={10} /> REJECTED — vote failed</span>
        <span className="flex items-center gap-1 text-amber-400"> <AlertTriangle size={10} /> DEADLOCK — tie, no majority</span>
      </div>

      {/* Row 3 — Mode badges */}
      <div className={rowCls}>
        <span className={labelCls}>Mode</span>
        <span className="text-emerald-400">🚀 LIVE — executes real on-chain trades</span>
        <span className="text-sky-400">✅ APPROVED — gate passed, awaiting deploy</span>
        <span className="text-slate-400">📄 Paper Trading · uses Simulated USD · no real TAO moves</span>
      </div>

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

// ─── Forecast Panel (Session XXXIV — Phase C) ───────────────────────────────
// Surfaces the Monte Carlo prediction of what an OpenClaw round would yield
// right now if the operator hypothetically fired BUY/SELL. Sits next to the
// live vote bar so the comparison is one glance away.

interface ForecastResp {
  trials:                 number
  direction:              'BUY' | 'SELL'
  triggered_by:           string
  supermajority:          number
  total_bots:             number
  expected: { buy: number; sell: number; hold: number; abstain: number }
  approval_probability:   number
  approved_buy_prob:      number
  approved_sell_prob:     number
  deadlock_prob:          number
  rejected_prob:          number
  per_bot: Array<{
    bot_name:     string
    display_name: string
    mode:         string
    buy_prob:     number
    sell_prob:    number
    hold_prob:    number
    abstain_prob: number
    lean:         'BUY' | 'SELL' | 'HOLD' | 'ABSTAIN'
  }>
  market: { rsi: number | null; macd_hist: number | null; price: number }
  freshness_warning: string | null
}

function ForecastBar({
  buy, sell, hold, abstain, threshold, dotted,
}: {
  buy: number; sell: number; hold: number; abstain: number;
  threshold: number; dotted?: boolean
}) {
  const total = 12
  const w = (n: number) => `${(n / total) * 100}%`
  const threshPct = (threshold / total) * 100
  return (
    <div className="space-y-1">
      <div
        className={
          'relative h-7 rounded-lg overflow-hidden bg-dark-700 flex ring-1 ' +
          (dotted ? 'ring-cyan-500/40' : 'ring-transparent')
        }
        style={dotted ? { borderStyle: 'dashed' } : undefined}
      >
        {buy > 0 && (
          <div className="h-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ width: w(buy), background: dotted ? 'rgba(16,185,129,0.45)' : '#10b981' }}>
            {(buy / total) * 100 > 9 && `${buy.toFixed(1)}`}
          </div>
        )}
        {sell > 0 && (
          <div className="h-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ width: w(sell), background: dotted ? 'rgba(239,68,68,0.45)' : '#ef4444' }}>
            {(sell / total) * 100 > 9 && `${sell.toFixed(1)}`}
          </div>
        )}
        {hold > 0 && (
          <div className="h-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ width: w(hold), background: dotted ? 'rgba(245,158,11,0.45)' : '#f59e0b' }}>
            {(hold / total) * 100 > 9 && `${hold.toFixed(1)}`}
          </div>
        )}
        {abstain > 0 && (
          <div className="h-full flex items-center justify-center text-[11px] font-bold text-slate-200"
            style={{ width: w(abstain), background: dotted ? 'rgba(55,65,81,0.65)' : '#374151' }}>
            {(abstain / total) * 100 > 9 && `${abstain.toFixed(1)}`}
          </div>
        )}
        <div className="absolute top-0 h-full w-0.5 border-l border-dashed border-white/50"
             style={{ left: `${threshPct}%` }} />
      </div>
    </div>
  )
}

function ForecastPanel() {
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY')
  const [data, setData]           = useState<ForecastResp | null>(null)
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true)
    try {
      const { data } = await api.get<ForecastResp>('/consensus/forecast', {
        params: { direction, trials: 1000 },
      })
      setData(data); setErr(null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [direction])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30_000) // 30-s refresh
    return () => clearInterval(id)
  }, [load])

  const pp = data ? data.approval_probability * 100 : 0
  const verdictLabel =
    pp >= 60 ? 'LIKELY APPROVED' : pp >= 35 ? 'TOSS-UP' : 'LIKELY REJECTED'
  const verdictCls =
    pp >= 60
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : pp >= 35
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-red-500/20 text-red-300 border-red-500/40'

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-cyan-300 text-sm font-bold uppercase tracking-wide font-mono">
            ◇ Vote Forecast
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {data ? `${data.trials.toLocaleString()} Monte Carlo trials` : 'sampling…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-700 overflow-hidden">
            {(['BUY', 'SELL'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={
                  'px-2 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors ' +
                  (direction === d
                    ? d === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                    : 'bg-slate-800/40 text-slate-400 hover:bg-slate-700/40')
                }
              >
                If {d}
              </button>
            ))}
          </div>
          <button
            onClick={() => load()}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} className={busy ? 'animate-spin' : ''} /> Resample
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300 mb-2">
          Forecast load failed: {err}
        </div>
      )}

      {data && (
        <>
          <ForecastBar
            buy={data.expected.buy}
            sell={data.expected.sell}
            hold={data.expected.hold}
            abstain={data.expected.abstain}
            threshold={data.supermajority}
            dotted
          />
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-700/50 bg-slate-900/40 px-2 py-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Pass probability</div>
              <div className="text-lg font-bold font-mono">{pp.toFixed(1)}%</div>
              <span className={'inline-block mt-1 rounded border px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-wider ' + verdictCls}>
                {verdictLabel}
              </span>
            </div>
            <div className="rounded-md border border-slate-700/50 bg-slate-900/40 px-2 py-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Approved {direction}</div>
              <div className="text-lg font-bold font-mono text-emerald-300">
                {(direction === 'BUY' ? data.approved_buy_prob : data.approved_sell_prob) * 100 | 0}%
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                anti-{direction}: {((direction === 'BUY' ? data.approved_sell_prob : data.approved_buy_prob) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-md border border-slate-700/50 bg-slate-900/40 px-2 py-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Deadlock</div>
              <div className="text-lg font-bold font-mono text-amber-300">
                {(data.deadlock_prob * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-md border border-slate-700/50 bg-slate-900/40 px-2 py-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Rejected</div>
              <div className="text-lg font-bold font-mono text-slate-300">
                {(data.rejected_prob * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Per-bot leans — top 6 by forecast direction */}
          <div className="mt-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Top {direction} leans this round
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
              {data.per_bot
                .slice()
                .sort((a, b) => (direction === 'BUY' ? b.buy_prob - a.buy_prob : b.sell_prob - a.sell_prob))
                .slice(0, 6)
                .map((b) => {
                  const p = direction === 'BUY' ? b.buy_prob : b.sell_prob
                  return (
                    <div key={b.bot_name} className="flex items-center justify-between rounded-md bg-slate-900/40 px-2 py-1 text-[11px] font-mono">
                      <span className="truncate text-slate-300">{b.display_name}</span>
                      <span className={direction === 'BUY' ? 'text-emerald-300' : 'text-red-300'}>
                        {(p * 100).toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>

          {data.freshness_warning && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
              ⚠ {data.freshness_warning}
            </div>
          )}
          <div className="mt-2 text-[10px] font-mono text-slate-600">
            Market: RSI {data.market.rsi != null ? data.market.rsi.toFixed(1) : '—'} ·
            MACD-hist {data.market.macd_hist != null ? data.market.macd_hist.toFixed(5) : '—'} ·
            ${data.market.price.toFixed(2)}
          </div>
        </>
      )}
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

// ── OpenClaw BFT Explanation Component ────────────────────────────────────────

function OpenClawBFTSection() {
  // Session XXV: collapse by default — user requested no auto-expand
  const [expanded, setExpanded] = useState(false)

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

// ── OpenClaw Council Sidebar (relocated from Mission Control) ─────────────────

const VOTE_COLORS = {
  BUY:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400' },
  SELL:    { bg: 'bg-red-500/10',     border: 'border-red-500/25',     text: 'text-red-400'     },
  HOLD:    { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400'   },
  ABSTAIN: { bg: 'bg-slate-700/30',   border: 'border-slate-700/50',   text: 'text-slate-400'   },
} as const

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
        <span className="text-[13px] font-bold tracking-widest text-slate-200 uppercase">OpenClaw Council</span>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OpenClaw() {
  const [latestRound,   setLatestRound]   = useState<ConsensusRound | null>(null)
  const [history,       setHistory]       = useState<ConsensusRound[]>([])
  const [stats,         setStats]         = useState<ConsensusStats | null>(null)
  const [triggering,    setTriggering]    = useState(false)
  const [flashRound,    setFlashRound]    = useState(false)

  // ── Consensus History pagination (Session XXV spec) ───────────────────
  const HISTORY_PAGE_SIZE = 20
  const [historyPage, setHistoryPage] = useState(1)
  const historyTotal  = history.length
  const historyPages  = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE))
  const historyStart  = (historyPage - 1) * HISTORY_PAGE_SIZE
  const historySlice  = history.slice(historyStart, historyStart + HISTORY_PAGE_SIZE)
  // Reset to page 1 when history shrinks/refreshes
  useEffect(() => { if (historyPage > historyPages) setHistoryPage(1) }, [historyPages, historyPage])

  const load = useCallback(async () => {
    const [latestRes, histRes, statsRes] = await Promise.allSettled([
      api.get('/consensus/latest'),
      api.get('/consensus/history', { params: { limit: 200 } }),
      api.get('/consensus/stats'),
    ])
    if (latestRes.status === 'fulfilled' && latestRes.value.data.round)
      setLatestRound(latestRes.value.data.round)
    if (histRes.status === 'fulfilled' && histRes.value.data.rounds)
      setHistory(histRes.value.data.rounds)
    if (statsRes.status === 'fulfilled')
      setStats(statsRes.value.data)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 5s
  useEffect(() => {
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const handleTrigger = async (direction: 'BUY' | 'SELL') => {
    setTriggering(true)
    try {
      const { data } = await api.post('/consensus/trigger', { triggered_by: 'manual_ui', direction })
      if (data?.round) {
        setLatestRound(data.round)
        setFlashRound(true)
        setTimeout(() => setFlashRound(false), 1200)
      }
      await load()
    } catch (e) {
      console.error('Trigger error', e)
    } finally {
      setTriggering(false)
    }
  }

  // Build chart data from history
  // chartData removed — Vote Breakdown + Approval Trend charts retired Session XXV
  const rm = latestRound ? (RESULT_META[latestRound.result] ?? RESULT_META.REJECTED) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── How OpenClaw Works (Session XXIX: relocated to TOP of page, top-line)
            Was below Stat Cards / BFT Explainer; now leads the page so a fresh
            visitor sees the four-step process before any data. */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-xl p-4">
        <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-3">How OpenClaw Works</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs text-slate-300">
          <div className="flex gap-2">
            <span className="text-indigo-400 font-bold font-mono">01</span>
            <span>A <span className="text-white">LIVE</span> strategy generates a trade signal (BUY or SELL)</span>
          </div>
          <div className="flex gap-2">
            <span className="text-indigo-400 font-bold font-mono">02</span>
            <span>All <span className="text-white">12 bots</span> independently cast votes using RSI, MACD + personality</span>
          </div>
          <div className="flex gap-2">
            <span className="text-indigo-400 font-bold font-mono">03</span>
            <span><span className="text-white">7 of 12</span> bots must agree (58.3% supermajority) for trade approval</span>
          </div>
          <div className="flex gap-2">
            <span className="text-indigo-400 font-bold font-mono">04</span>
            <span>Approved trades execute · Vetoed trades are <span className="text-red-400">blocked</span> and logged</span>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      {/* (Session XXIX: <LegendBar /> previously rendered here as page top-line;
          now relocated INTO the latest-round container, above Council Votes,
          stacked vertically — see JSX below.) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={BarChart3}
          label="Total Rounds"
          value={stats?.total_rounds ?? 0}
          sub="consensus rounds run"
          accent="bg-indigo-500/15 text-indigo-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Approval Rate"
          value={`${(stats?.approval_rate_pct ?? 0).toFixed(1)}%`}
          sub={`${stats?.approved_rounds ?? 0} approved / ${stats?.rejected_rounds ?? 0} rejected`}
          accent="bg-emerald-500/15 text-emerald-400"
        />
        <StatCard
          icon={Users}
          label="Voting Bots"
          value={`${stats?.total_bots ?? 12}`}
          sub={`⊢ ${stats?.supermajority_threshold ?? 7}/12 supermajority`}
          accent="bg-purple-500/15 text-purple-400"
          tip={
            <div className="space-y-2">
              <p className="text-white font-bold">Voting Bots vs. Strategies — same thing?</p>
              <p>Yes — the same 12 trading strategies wear two hats.</p>
              <p>As a <span className="text-indigo-300 font-bold">strategy</span>, each bot runs its own indicators (RSI, MACD, EMA) and generates a signal — BUY, SELL, or HOLD — every 60 seconds.</p>
              <p>As a <span className="text-purple-300 font-bold">voting bot</span>, that same signal becomes a vote in this council. Same brain, two roles: one produces the signal, the other validates it collectively before any money moves.</p>
              <p className="text-slate-400 text-[11px] border-t border-slate-700/50 pt-1">7 of 12 must agree before a real trade executes. Paper-mode bots vote but their trades don't touch the chain.</p>
            </div>
          }
        />
        <StatCard
          icon={Activity}
          label="Last Result"
          value={latestRound ? (latestRound.approved ? '✅ APPROVED' : '🚫 REJECTED') : '—'}
          sub={latestRound ? `Round #${latestRound.round_id}` : 'No rounds yet'}
          accent={latestRound?.approved ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
        />
      </div>

      {/* ── BFT Explainer (relocated from II Agent page) ── */}
      <OpenClawBFTSection />

      {/* ── Cycle Status Bar (Session XXXV: relocated FROM Dashboard) ──────────
          Mav requested this anchor sit on the OpenClaw page directly below
          the BFT explainer so the operator can see "RUNNING — Cycle #N ·
          Next cycle in Xs · Y strategies active" right where consensus
          activity is being watched. Self-contained component subscribes to
          the bot store + analytics summary. */}
      <CycleStatusBar />

      {/* Session XXIX: 'How OpenClaw Works' was here — now relocated to TOP of
          the page (above Stat Cards). Promotion Gate already sits above
          Consensus History (XXVI placement). */}

      {/* ── Council + Latest Round — 2-column: round detail full width (council on II Agent) ── */}
      <div className="grid grid-cols-1 gap-4 items-start">

        {/* Right — Latest Round full detail */}
        {latestRound ? (
        <div className={clsx(
          'bg-dark-800 border rounded-2xl p-5 space-y-5 transition-all duration-500',
          flashRound ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10' : 'border-dark-600',
        )}>
          {/* Manual Trigger — Session XXIX: relocated to TOP of round container,
              above the colored vote bar AND above Council Votes. Partner spec. */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 uppercase tracking-widest">
              Manual trigger:
              <InfoBubble
                side="right"
                maxWidth={300}
                content={
                  <div className="space-y-2">
                    <p className="text-white font-bold">What do Trigger BUY / SELL actually do?</p>
                    <p>They fire a <span className="text-purple-300 font-bold">test consensus round</span> — no real trade is placed automatically.</p>
                    <p>They ask all 12 bots: <span className="text-slate-200 italic">"If the proposed direction is BUY (or SELL), how do you each vote?"</span> Each bot runs its own indicators and returns a vote.</p>
                    <p><span className="text-emerald-400 font-bold">BUY</span> = you're proposing to stake TAO onto a subnet (go long). <span className="text-red-400 font-bold">SELL</span> = you're proposing to unstake / exit the position.</p>
                    <p className="text-slate-400 text-[11px] border-t border-slate-700/50 pt-1">If 7+ bots agree → APPROVED. If not → REJECTED. In production, the cycle engine triggers these automatically when a strategy fires a signal.</p>
                  </div>
                }
              />
            </span>
            <button
              onClick={() => handleTrigger('BUY')}
              disabled={triggering}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              <TrendingUp size={12} />
              {triggering ? 'Voting…' : 'Trigger BUY'}
            </button>
            <button
              onClick={() => handleTrigger('SELL')}
              disabled={triggering}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >
              <TrendingDown size={12} />
              {triggering ? 'Voting…' : 'Trigger SELL'}
            </button>
          </div>

          {/* Vote bar — colored BUY/SELL/HOLD/ABSTAIN graph (Session XXIX:
              now second in container, sits below Manual Trigger). */}
          <VoteBar
            buyCount={latestRound.buy_count}
            sellCount={latestRound.sell_count}
            holdCount={latestRound.hold_count}
            abstainCount={latestRound.abstain_count}
            threshold={latestRound.supermajority}
          />

          {/* Forecast panel — Session XXXIV (Phase C). Sits right after the
              live vote bar so the operator can compare actual vs predicted
              at a glance. Updates every 30 s; user can flip BUY ↔ SELL. */}
          <ForecastPanel />

          {/* Forecast accuracy gauge — Session XXXVII (Phase F). Closes
              the loop on Phase C: every consensus round records (forecast,
              actual) and we surface the rolling Brier Skill Score as a
              0-100% calibration gauge.  Sparkline shows per-round error
              for the last 20 rounds.  Renders a friendly cold-start state
              until the first round completes. */}
          <ForecastAccuracyGauge />

          {/* Legend — Session XXIX: relocated from page top-line to here,
              stacked vertically (Votes / Result / Mode rows). Sits above
              Council Votes per partner spec, providing the colour-key
              context the next section needs. */}
          <LegendBar />

          {/* 12 bot vote cards — Council Votes section */}
          <div>
            <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
              Council Votes
              <InfoBubble
                side="right"
                maxWidth={310}
                content={
                  <div className="space-y-2">
                    <p className="text-white font-bold">What are the Council Votes?</p>
                    <p>Each card is one of the 12 bot personalities casting its vote on the proposed trade direction — <span className="text-emerald-400 font-bold">BUY</span>, <span className="text-red-400 font-bold">SELL</span>, <span className="text-amber-400 font-bold">HOLD</span>, or <span className="text-slate-400 font-bold">ABSTAIN</span>.</p>
                    <div className="space-y-1 border-t border-slate-700/50 pt-1.5">
                      <p><span className="text-emerald-400 font-bold">BUY</span> — this bot's indicators say conditions favour staking TAO onto a target subnet (going long).</p>
                      <p><span className="text-red-400 font-bold">SELL</span> — indicators say exit / unstake the position now.</p>
                      <p><span className="text-amber-400 font-bold">HOLD</span> — no strong conviction either way; don't act yet.</p>
                      <p><span className="text-slate-400 font-bold">ABSTAIN</span> — not enough price history or data to form a view.</p>
                    </div>
                    <p>The <span className="text-white font-bold">confidence bar</span> shows how certain the bot is (0–100%). The mode badge (🚀 LIVE / 📄 PAPER) shows whether that bot's own trades execute on-chain or are simulated — but all 12 vote regardless.</p>
                    <p className="text-slate-400 text-[11px] border-t border-slate-700/50 pt-1">Need 7 of 12 in the same direction → trade executes. Anything less → round rejected.</p>
                  </div>
                }
              />
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
              {latestRound.votes.map(v => (
                <BotVoteCard key={v.bot_name} vote={v} />
              ))}
            </div>
          </div>

          {/* Round header — Session XXIX: now at the BOTTOM of the round
              container (Manual Trigger has moved to the top). 2-column:
              [triggered-by center] [result right]. */}
          <div className="flex items-center gap-3">

            {/* Center — Triggered By · price
                Session XXVII: "triggered by" (lowercase) renamed to
                "Triggered By" (title case) per partner request. */}
            <div className="flex-1 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="uppercase tracking-wider text-[11px] text-slate-400 font-semibold">Triggered By</span>
                <InfoBubble
                  side="right"
                  maxWidth={280}
                  content={
                    <div className="space-y-1.5">
                      <p className="text-white font-bold">What does "Triggered By" mean?</p>
                      <p>Shows <span className="text-indigo-300">what initiated this consensus round</span>:</p>
                      <p><span className="text-emerald-400 font-bold">cycle_engine</span> — the autonomous 60-second trade cycle fired a strategy signal strong enough to call a vote.</p>
                      <p><span className="text-sky-400 font-bold">manual_ui</span> — you pressed the Trigger BUY/SELL button below.</p>
                      <p><span className="text-purple-400 font-bold">strategy_name</span> — a specific bot's signal escalated directly to a vote.</p>
                    </div>
                  }
                />
                <span className="text-indigo-400 font-semibold">{latestRound.triggered_by}</span>
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-white font-semibold">${(latestRound.price_at_round ?? 0).toFixed(2)} TAO</span>
            </div>

            {/* Right — result badge + timing */}
            <div className="flex items-center gap-3 shrink-0">
              {rm && (
                <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold', rm.bg)}>
                  <rm.icon size={14} className={rm.color} />
                  <span className={rm.color}>{rm.label}</span>
                </div>
              )}
              <span className="text-[13px] text-slate-400 font-mono">{timeSince(latestRound.timestamp)} · {latestRound.duration_ms}ms</span>
            </div>

          </div>

          {/* (Session XXIX: Manual Trigger relocated from here to the TOP of
              the round container — see above. The bottom of the container is
              now the Round-header row only.) */}
        </div>
      ) : (
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-10 text-center">
            <Vote size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 font-mono text-sm">No consensus rounds yet.</p>
            <p className="text-slate-300 text-xs mt-1">Trigger a manual vote above, or wait for a LIVE strategy to fire.</p>
          </div>
        )}

      </div>{/* end 2-col council+round grid */}

      {/* Vote Breakdown + Approval Trend charts removed per Session XXV spec —
          vote counts remain visible on the Latest Round panel; approval trend
          is captured by the Approval Rate stat card + Consensus History table. */}

      {/* ── Promotion Gate (Session XXVI: relocated to just above Consensus History) ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
          <Shield size={13} className="text-yellow-400" /> Promotion Gate
          <span className="ml-1 text-[11px] text-slate-500 font-mono normal-case font-normal">
            — criteria a strategy must clear before any real trade fires
          </span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400">
          {[
            { n: '① Cycles ≥ 30',    desc: 'Must complete ≥ 30 honest evaluation cycles' },
            { n: '② Win Rate ≥ 55%', desc: 'Must sustain >55% WR under honest physics' },
            { n: '③ Win Margin ≥ 5', desc: 'Wins must exceed losses by ≥ 5' },
            { n: '④ PnL > 0.01 τ',   desc: 'Cumulative PnL must exceed noise threshold' },
          ].map(({ n, desc }) => (
            <div key={n} className="space-y-0.5">
              <p className="text-white font-mono text-[14px]">{n}</p>
              <p className="leading-relaxed text-[14px]">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-slate-500 mt-3">
          Gate pass → <span className="text-orange-400">⏳ PENDING</span> →
          Operator approves → <span className="text-accent-green">● LIVE</span>.
          No strategy goes LIVE without human confirmation.
        </p>
      </div>

      {/* ── History Table (paginated per Session XXV spec) ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
          <Clock size={14} className="text-slate-300" />
          <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Consensus History</span>
          <span className="ml-auto text-xs text-slate-300 font-mono">
            {historyTotal} rounds
            {historyPages > 1 && (
              <span className="text-slate-500"> · page {historyPage} / {historyPages}</span>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-dark-700 text-[13px] text-slate-300 uppercase tracking-wider font-mono">
                <th className="px-3 py-2">Round</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2 text-center">Votes</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Latency</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-300 text-sm">
                    No consensus rounds recorded yet
                  </td>
                </tr>
              ) : (
                historySlice.map((r, i) => <RoundRow key={r.round_id} round={r} index={historyStart + i} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls — shown when there are multiple pages */}
        {historyPages > 1 && (
          <div className="px-4 py-2.5 border-t border-dark-700 flex items-center justify-between text-[13px] font-mono">
            <span className="text-slate-500">
              Showing {historyStart + 1}–{Math.min(historyStart + HISTORY_PAGE_SIZE, historyTotal)} of {historyTotal}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                disabled={historyPage === 1}
                className="px-2 py-1 rounded bg-dark-700 border border-dark-600 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>
              {Array.from({ length: Math.min(historyPages, 7) }).map((_, i) => {
                // Window around current page for friendly pagination
                let p: number
                if (historyPages <= 7)                  p = i + 1
                else if (historyPage <= 4)              p = i + 1
                else if (historyPage >= historyPages - 3) p = historyPages - 6 + i
                else                                      p = historyPage - 3 + i
                if (p < 1 || p > historyPages) return null
                return (
                  <button
                    key={p}
                    onClick={() => setHistoryPage(p)}
                    className={clsx(
                      'w-8 h-7 rounded font-bold transition-colors',
                      p === historyPage
                        ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                        : 'bg-dark-700 border border-dark-600 text-slate-400 hover:text-white'
                    )}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => setHistoryPage(p => Math.min(historyPages, p + 1))}
                disabled={historyPage === historyPages}
                className="px-2 py-1 rounded bg-dark-700 border border-dark-600 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

      </div>{/* end scrollable */}
    </div>
  )
}