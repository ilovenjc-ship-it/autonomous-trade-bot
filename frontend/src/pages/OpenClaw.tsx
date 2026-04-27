/**
 * OpenClaw BFT Consensus Engine
 * Real-time visualization of the 12-bot voting council.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, ShieldX, Vote, Zap,
  TrendingUp, TrendingDown, Minus, HelpCircle,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  Activity, BarChart3, Users,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import clsx from 'clsx'
import api from '@/api/client'
import PageHeroSlider from '@/components/PageHeroSlider'

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
      <span className="text-slate-400">📄 PAPER — simulated, no real funds</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Zap; label: string; value: string | number
  sub?: string; accent?: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex items-start gap-3">
      <div className={clsx('p-2 rounded-lg mt-0.5', accent ?? 'bg-indigo-500/15')}>
        <Icon size={16} className={clsx(accent ? '' : 'text-indigo-400')} />
      </div>
      <div>
        <p className="text-[14px] text-slate-300 uppercase tracking-wider font-mono">{label}</p>
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
        <span className="text-amber-400">⊢ {threshold}/12 supermajority</span>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OpenClaw() {
  const [latestRound,   setLatestRound]   = useState<ConsensusRound | null>(null)
  const [history,       setHistory]       = useState<ConsensusRound[]>([])
  const [stats,         setStats]         = useState<ConsensusStats | null>(null)
  const [triggering,    setTriggering]    = useState(false)
  const [flashRound,    setFlashRound]    = useState(false)

  const load = useCallback(async () => {
    const [latestRes, histRes, statsRes] = await Promise.allSettled([
      api.get('/consensus/latest'),
      api.get('/consensus/history', { params: { limit: 30 } }),
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
  const chartData = [...history].reverse().slice(-20).map((r, i) => ({
    id:       `#${r.round_id}`,
    buy:      r.buy_count,
    sell:     r.sell_count,
    hold:     r.hold_count,
    approved: r.approved ? 1 : 0,
  }))

  const rm = latestRound ? (RESULT_META[latestRound.result] ?? RESULT_META.REJECTED) : null

  const heroSlides = [
    {
      title: 'BFT Consensus', subtitle: 'OpenClaw Council', accent: 'purple' as const,
      stats: [
        { label: 'Approval Rate', value: stats ? `${(stats.approval_rate_pct ?? 0).toFixed(1)}%` : '—', color: 'emerald' as const },
        { label: 'Total Rounds',  value: stats ? String(stats.total_rounds) : '—',             color: 'white'   as const },
        { label: 'Approved',      value: stats ? String(stats.approved_rounds) : '—',          color: 'emerald' as const },
        { label: 'Rejected',      value: stats ? String(stats.rejected_rounds ?? (stats.total_rounds - stats.approved_rounds)) : '—', color: 'orange' as const },
        { label: 'Threshold',     value: '7/12',                                               color: 'purple'  as const },
      ],
    },
    {
      title: 'Latest Round', subtitle: latestRound ? `#${latestRound.round_id}` : 'Pending', accent: 'blue' as const,
      stats: [
        { label: 'Direction',   value: latestRound?.direction ?? '—',                          color: latestRound?.direction === 'BUY' ? 'emerald' : latestRound?.direction === 'SELL' ? 'red' : 'slate' as any },
        { label: 'Result',      value: latestRound ? (latestRound.approved ? 'APPROVED' : 'REJECTED') : '—', color: latestRound?.approved ? 'emerald' : 'orange' as any },
        { label: 'BUY votes',   value: latestRound ? String(latestRound.buy_count)  : '—',    color: 'emerald' as const },
        { label: 'SELL votes',  value: latestRound ? String(latestRound.sell_count) : '—',    color: 'red'     as const },
        { label: 'HOLD votes',  value: latestRound ? String(latestRound.hold_count) : '—',    color: 'yellow'  as const },
      ],
    },
    {
      title: 'Round History', subtitle: `Last ${history.length} rounds`, accent: 'emerald' as const,
      stats: [
        { label: 'Rounds Logged', value: String(history.length),                               color: 'white'   as const },
        { label: 'History Cap',   value: '200',                                                color: 'slate'   as const },
        { label: 'Buy Bias',      value: history.length ? `${((history.filter(r => r.direction==='BUY').length / history.length)*100).toFixed(0)}%` : '—', color: 'emerald' as const },
        { label: 'Approval Pct',  value: history.length ? `${((history.filter(r => r.approved).length / history.length)*100).toFixed(0)}%` : '—', color: 'purple' as const },
        { label: 'Bots',          value: '12',                                                 color: 'blue'    as const },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Page header bar — OpenClaw BFT Consensus ───────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 bg-dark-800/80 border-b border-dark-700/60">
        {/* Icon */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
          <Vote size={15} className="text-white" />
        </div>

        {/* Title + subtitle */}
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-sm font-bold text-white tracking-tight leading-none">
            OpenClaw BFT Consensus
          </span>
          <span className="text-xs font-mono text-slate-400 mt-0.5 leading-none">
            BFT Multi-Agent Voting Council · 7/12 supermajority
          </span>
        </div>

        <div className="flex-1" />

        {/* Manual trigger buttons */}
        <button
          onClick={() => handleTrigger('BUY')}
          disabled={triggering}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <TrendingUp size={13} />
          {triggering ? 'Voting…' : 'Trigger BUY'}
        </button>
        <button
          onClick={() => handleTrigger('SELL')}
          disabled={triggering}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <TrendingDown size={13} />
          {triggering ? 'Voting…' : 'Trigger SELL'}
        </button>
      </div>

      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Symbol Legend ── */}
      <LegendBar />

      {/* ── Stat Cards ── */}
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
          sub={`${stats?.supermajority_threshold ?? 7}/12 to pass`}
          accent="bg-purple-500/15 text-purple-400"
        />
        <StatCard
          icon={Activity}
          label="Last Result"
          value={latestRound ? (latestRound.approved ? '✅ APPROVED' : '🚫 REJECTED') : '—'}
          sub={latestRound ? `Round #${latestRound.round_id}` : 'No rounds yet'}
          accent={latestRound?.approved ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
        />
      </div>

      {/* ── Latest Round ── */}
      {latestRound ? (
        <div className={clsx(
          'bg-dark-800 border rounded-2xl p-5 space-y-5 transition-all duration-500',
          flashRound ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10' : 'border-dark-600',
        )}>
          {/* Round header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-slate-300 font-mono text-sm">Round <span className="text-white font-bold">#{latestRound.round_id}</span></span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-300 text-xs font-mono">triggered by <span className="text-indigo-400">{latestRound.triggered_by}</span></span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-300 text-xs font-mono">${(latestRound.price_at_round ?? 0).toFixed(2)} TAO</span>
            </div>
            <div className="flex items-center gap-3">
              {rm && (
                <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold', rm.bg)}>
                  <rm.icon size={14} className={rm.color} />
                  <span className={rm.color}>{rm.label}</span>
                </div>
              )}
              <span className="text-[14px] text-slate-300 font-mono">{timeSince(latestRound.timestamp)} · {latestRound.duration_ms}ms</span>
            </div>
          </div>

          {/* Vote bar */}
          <VoteBar
            buyCount={latestRound.buy_count}
            sellCount={latestRound.sell_count}
            holdCount={latestRound.hold_count}
            abstainCount={latestRound.abstain_count}
            threshold={latestRound.supermajority}
          />

          {/* 12 bot vote cards */}
          <div>
            <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-3">Council Votes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
              {latestRound.votes.map(v => (
                <BotVoteCard key={v.bot_name} vote={v} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-10 text-center">
          <Vote size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-300 font-mono text-sm">No consensus rounds yet.</p>
          <p className="text-slate-300 text-xs mt-1">Trigger a manual vote above, or wait for a LIVE strategy to fire.</p>
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vote breakdown chart */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-4">Vote Breakdown — Last 20 Rounds</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={8} barGap={1}>
                <XAxis dataKey="id" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 12]} />
                <Tooltip
                  contentStyle={{ background: '#152030', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="buy"  fill="#10b981" name="BUY"     radius={[2,2,0,0]} />
                <Bar dataKey="sell" fill="#ef4444" name="SELL"    radius={[2,2,0,0]} />
                <Bar dataKey="hold" fill="#f59e0b" name="HOLD"    radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-300 text-sm">No data yet</div>
          )}
        </div>

        {/* Approval trend */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-4">Approval Trend (1=approved · 0=rejected)</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="id" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} domain={[-0.1, 1.1]} ticks={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: '#152030', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                />
                <Line
                  type="step"
                  dataKey="approved"
                  stroke="#818cf8"
                  strokeWidth={2}
                  dot={{ fill: '#818cf8', r: 3 }}
                  name="Approved"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-300 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* ── History Table ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
          <Clock size={14} className="text-slate-300" />
          <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Consensus History</span>
          <span className="ml-auto text-xs text-slate-300 font-mono">{history.length} rounds</span>
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
                history.map((r, i) => <RoundRow key={r.round_id} round={r} index={i} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── How it works ── */}
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
      </div>{/* end scrollable */}
    </div>
  )
}