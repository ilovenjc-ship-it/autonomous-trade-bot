import { useEffect, useRef, useState, useCallback } from 'react'
import SubnetHeatMap from '@/components/SubnetHeatMap'
import {
  Activity, Zap, BarChart2, BarChart3, CheckCircle2,
  TrendingUp, Radio, Shield, Cpu, AlertTriangle,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Subnet {
  uid: number
  name: string
  ticker: string
  stake_tao: number
  stake_usd: number
  emission: number
  apy: number
  miners: number
  trend: 'up' | 'down' | 'neutral'
  score: number
}

interface GateCheck {
  value: number
  required: number
  ok: boolean
}

interface GateProgress {
  cycles: GateCheck
  win_rate: GateCheck
  win_margin: GateCheck
  pnl: GateCheck
  all_clear: boolean
}

interface FleetBot {
  id: number
  name: string
  display_name: string
  description: string
  mode: 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE'
  is_active: boolean
  total_trades: number
  win_trades: number
  loss_trades: number
  win_rate: number
  total_pnl: number
  cycles_completed: number
  gate: GateProgress
}

interface FleetSummary {
  total: number
  live: number
  paper: number
  approved: number
  total_pnl: number
  tao_price: number
  rsi: number
}

interface ActivityEvent {
  id: string | number
  kind: string
  message: string
  strategy?: string
  detail?: string
  timestamp: string
}

// ── OpenClaw types ────────────────────────────────────────────────────────────

interface ConsensusVote {
  bot_name: string
  display_name: string
  vote: 'BUY' | 'SELL' | 'HOLD' | 'ABSTAIN'
  confidence: number
  mode: string
}

interface ConsensusRound {
  round_id: number
  triggered_by: string
  direction: string
  price_at_round: number
  timestamp: string
  result: string
  buy_count: number
  sell_count: number
  hold_count: number
  abstain_count: number
  approved: boolean
  votes: ConsensusVote[]
}

interface ConsensusStats {
  total_rounds: number
  approved_rounds: number
  rejected_rounds: number
  approval_rate_pct: number
  supermajority_threshold: number
  total_bots: number
}

// ── Subnet cards (same style as Dashboard) ────────────────────────────────────

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up')   return <ArrowUp size={11} className="text-accent-green" />
  if (trend === 'down') return <ArrowDown size={11} className="text-red-400" />
  return <Minus size={11} className="text-slate-500" />
}

function SubnetCard({ s, maxStake }: { s: Subnet; maxStake: number }) {
  const stakePct  = maxStake ? (s.stake_tao / maxStake) * 100 : 0
  const trendColor = s.trend === 'up' ? 'text-accent-green' : s.trend === 'down' ? 'text-red-400' : 'text-slate-500'
  const scoreColor = s.score >= 90 ? '#34d399' : s.score >= 70 ? '#60a5fa' : s.score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div className="flex-shrink-0 w-[168px] bg-dark-900 border border-dark-600 rounded-xl p-3 hover:border-dark-500 transition-colors">
      {/* name + trend */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{s.name}</p>
          <p className="text-[11px] text-slate-500 font-mono uppercase">{s.ticker}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          <TrendIcon trend={s.trend} />
          <span className={clsx('text-[10px] font-mono font-bold', trendColor)}>
            {s.trend.toUpperCase()}
          </span>
        </div>
      </div>

      {/* stake bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-500">Stake</span>
          <span className="text-slate-300">{((s.stake_tao ?? 0) / 1e6).toFixed(2)}M τ</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-blue/60 rounded-full transition-all"
            style={{ width: `${stakePct}%` }} />
        </div>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="bg-dark-800 rounded px-2 py-1 text-center">
          <p className="text-[10px] text-slate-500 font-mono">APY</p>
          <p className="text-[12px] font-bold text-accent-green font-mono">{(s.apy ?? 0).toFixed(1)}%</p>
        </div>
        <div className="bg-dark-800 rounded px-2 py-1 text-center">
          <p className="text-[10px] text-slate-500 font-mono">Emit</p>
          <p className="text-[12px] font-bold text-yellow-400 font-mono">{((s.emission ?? 0) * 100).toFixed(2)}%</p>
        </div>
      </div>

      {/* score gauge */}
      <div>
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-500">Score</span>
          <span className="font-bold" style={{ color: scoreColor }}>{(s.score ?? 0).toFixed(1)}</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, s.score ?? 0)}%`, background: scoreColor }} />
        </div>
      </div>
    </div>
  )
}

// ── Mode badge ────────────────────────────────────────────────────────────────

function ModeBadge({ mode, compact = false }: { mode: string; compact?: boolean }) {
  const cfg = {
    PAPER_ONLY:       { label: compact ? 'PAP' : 'PAPER',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    APPROVED_FOR_LIVE:{ label: compact ? 'APR' : 'APPROVED', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    LIVE:             { label: 'LIVE',                        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  }[mode] ?? { label: mode, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' }

  return (
    <span className={clsx('font-bold tracking-widest px-1 py-0.5 rounded border font-mono leading-none',
      compact ? 'text-[9px]' : 'text-[11px]', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ── Gate progress bars ────────────────────────────────────────────────────────

function GateBar({ label, check }: { label: string; check: GateCheck }) {
  const pct = Math.min(100, (check.value / (check.required || 1)) * 100)
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[13px] text-slate-300 font-mono">{label}</span>
        <span className={clsx('text-[13px] font-mono', check.ok ? 'text-emerald-400' : 'text-slate-300')}>
          {check.ok ? '✓' : `${check.value}/${check.required}`}
        </span>
      </div>
      <div className="h-0.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', check.ok ? 'bg-emerald-500' : 'bg-blue-500/60')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Bot card (compact grid-cell version) ──────────────────────────────────────

function BotCard({ bot, selected, onClick }: { bot: FleetBot; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full h-full text-left px-2 py-1.5 rounded-lg border transition-all duration-200 flex flex-col min-w-0',
        selected
          ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
          : 'bg-slate-900/40 border-slate-700/40 hover:bg-slate-800/50 hover:border-slate-600/50'
      )}
    >
      {/* Name + active dot */}
      <div className="flex items-center gap-1 mb-1 min-w-0">
        <div className={clsx(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          bot.is_active ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-slate-600'
        )} />
        <span className="text-[11px] font-semibold text-slate-100 truncate flex-1 leading-none">
          {bot.display_name.split(' ').slice(0, 2).join(' ')}
        </span>
      </div>

      {/* Mode badge — compact */}
      <div className="mb-1"><ModeBadge mode={bot.mode} compact /></div>

      {/* Win rate + PnL */}
      <div className="flex items-baseline justify-between gap-1 mt-auto min-w-0">
        <span className={clsx('text-[12px] font-bold font-mono leading-none flex-shrink-0',
          bot.win_rate >= 55 ? 'text-emerald-400' : bot.win_rate >= 45 ? 'text-yellow-400' : 'text-red-400')}>
          {(bot.win_rate ?? 0).toFixed(0)}%
        </span>
        <span className={clsx('text-[10px] font-mono truncate',
          bot.total_pnl >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
          {bot.total_pnl >= 0 ? '+' : ''}{(bot.total_pnl ?? 0).toFixed(2)}τ
        </span>
      </div>

      {/* Gate dots */}
      <div className="flex gap-0.5 mt-1.5">
        {[bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok].map((ok, i) => (
          <div key={i} className={clsx('flex-1 h-0.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-slate-700')} />
        ))}
        {bot.gate.all_clear && (
          <span className="text-[8px] text-purple-400 font-bold animate-pulse ml-0.5">✓</span>
        )}
      </div>
    </button>
  )
}

// ── Event kind icon + color ───────────────────────────────────────────────────

function EventIcon({ kind }: { kind: string }) {
  const cfg = {
    trade:  { icon: TrendingUp, cls: 'text-blue-400' },
    signal: { icon: Radio,      cls: 'text-yellow-400' },
    gate:   { icon: Shield,     cls: 'text-purple-400' },
    system: { icon: Cpu,        cls: 'text-slate-300' },
    alert:  { icon: AlertTriangle, cls: 'text-orange-400' },
  }[kind] ?? { icon: Activity, cls: 'text-slate-300' }

  const Icon = cfg.icon
  return <Icon size={11} className={cfg.cls} />
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/New_York' })
  } catch { return '' }
}

// ── OpenClaw Council Monitor ──────────────────────────────────────────────────

const VOTE_COLORS = {
  BUY:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  SELL:    { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30'     },
  HOLD:    { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30'  },
  ABSTAIN: { bg: 'bg-slate-800/50',   text: 'text-slate-500',   border: 'border-slate-700/40'   },
} as const

const RESULT_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED_BUY:  { label: '✓ APPROVED BUY',  cls: 'text-emerald-400' },
  APPROVED_SELL: { label: '✓ APPROVED SELL', cls: 'text-red-400'     },
  REJECTED:      { label: '✗ REJECTED',       cls: 'text-orange-400'  },
  DEADLOCK:      { label: '⊘ DEADLOCK',       cls: 'text-purple-400'  },
}

function OpenClawCouncil() {
  const [latest,  setLatest]  = useState<ConsensusRound | null>(null)
  const [stats,   setStats]   = useState<ConsensusStats  | null>(null)
  const [history, setHistory] = useState<ConsensusRound[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [lR, sR, hR] = await Promise.all([
        api.get('/consensus/latest'),
        api.get('/consensus/stats'),
        api.get('/consensus/history?limit=32'),
      ])
      setLatest(lR.data.round || null)
      setStats(sR.data || null)
      setHistory(hR.data.rounds || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 5_000)
    return () => clearInterval(t)
  }, [fetchAll])

  const rLabel = latest ? (RESULT_LABEL[latest.result] ?? { label: latest.result, cls: 'text-slate-400' }) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/40 flex-shrink-0">
        <Zap size={12} className="text-purple-400" />
        <span className="text-[13px] font-bold tracking-widest text-slate-300 uppercase">OpenClaw Council</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] font-mono text-purple-400/70 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
            BFT · 7/12 Threshold
          </span>
          {latest && (
            <span className="text-[11px] font-mono text-slate-500">#{latest.round_id}</span>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex-shrink-0 flex border-b border-slate-800/40">
        {stats ? (
          <>
            <div className="flex-1 px-3 py-2 border-r border-slate-800/40 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Approval</div>
              <div className={clsx('text-lg font-bold font-mono leading-tight',
                stats.approval_rate_pct >= 45 && stats.approval_rate_pct <= 65
                  ? 'text-emerald-400' : stats.approval_rate_pct > 65 ? 'text-yellow-400' : 'text-orange-400')}>
                {(stats.approval_rate_pct ?? 0).toFixed(1)}%
              </div>
            </div>
            <div className="flex-1 px-3 py-2 border-r border-slate-800/40 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Rounds</div>
              <div className="text-lg font-bold font-mono text-slate-200 leading-tight">{stats.total_rounds}</div>
            </div>
            <div className="flex-1 px-3 py-2 border-r border-slate-800/40 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Approved</div>
              <div className="text-lg font-bold font-mono text-emerald-400 leading-tight">{stats.approved_rounds}</div>
            </div>
            <div className="flex-2 px-3 py-2 text-center min-w-0 flex-1">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Last</div>
              <div className={clsx('text-[11px] font-bold font-mono leading-tight truncate', rLabel?.cls ?? 'text-slate-500')}>
                {rLabel?.label ?? '—'}
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 py-2 text-[11px] text-slate-500 font-mono">Loading…</div>
        )}
      </div>

      {/* Bot vote grid + tally — natural height, no flex-1 stretch */}
      <div className="flex-shrink-0 px-3 py-2.5">
        {latest?.votes && latest.votes.length > 0 ? (
          <>
            {/* Trigger context */}
            <div className="text-[10px] text-slate-500 font-mono mb-2 leading-none">
              Round #{latest.round_id} · {latest.direction} signal ·{' '}
              <span className="text-slate-400">{latest.triggered_by.replace(/_/g, ' ')}</span>
            </div>

            {/* 2-col grid of 12 bot votes */}
            <div className="grid grid-cols-2 gap-1">
              {latest.votes.map(v => {
                const vc = VOTE_COLORS[v.vote as keyof typeof VOTE_COLORS] ?? VOTE_COLORS.ABSTAIN
                return (
                  <div key={v.bot_name}
                    className={clsx('flex items-center gap-2 px-2.5 py-1.5 rounded-lg border', vc.bg, vc.border)}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-200 truncate leading-tight">{v.display_name}</div>
                      <div className="text-[9px] text-slate-500 font-mono">{((v.confidence ?? 0) * 100).toFixed(0)}% conf</div>
                    </div>
                    <span className={clsx('text-[11px] font-bold font-mono flex-shrink-0', vc.text)}>
                      {v.vote}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Vote tally bars */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-emerald-400 w-12">BUY {latest.buy_count}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/70 rounded-full transition-all"
                    style={{ width: `${(latest.buy_count / 12) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-red-400 w-12">SELL {latest.sell_count}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500/70 rounded-full transition-all"
                    style={{ width: `${(latest.sell_count / 12) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-yellow-400 w-12">HOLD {latest.hold_count}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500/50 rounded-full transition-all"
                    style={{ width: `${(latest.hold_count / 12) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-slate-500 w-12">ABS {latest.abstain_count}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-600/50 rounded-full transition-all"
                    style={{ width: `${(latest.abstain_count / 12) * 100}%` }} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Zap size={32} className="text-purple-400/30 mb-3" />
            <div className="text-[13px] text-slate-400 font-mono">Waiting for consensus rounds…</div>
            <div className="text-[11px] text-slate-600 mt-1">Rounds fire when LIVE strategies trigger</div>
          </div>
        )}
      </div>

      {/* History sparkline — flex-1 fills all remaining vertical space */}
      <div className="flex-1 min-h-0 border-t border-slate-800/40 px-3 py-2.5 flex flex-col">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono flex items-center justify-between flex-shrink-0">
          <span>Round History</span>
          {history.length > 0 && (
            <span className="text-slate-600">{history.length} rounds</span>
          )}
        </div>
        {/* bars expand to fill all remaining height */}
        <div className="flex gap-0.5 items-end flex-1 min-h-[40px]">
          {history.length === 0 ? (
            <span className="text-[11px] text-slate-600 font-mono self-center">No rounds yet</span>
          ) : (
            [...history].reverse().map((r, i) => (
              <div
                key={i}
                title={`Round ${r.round_id}: ${r.result}`}
                className={clsx(
                  'flex-1 rounded-sm transition-all cursor-default',
                  r.approved ? 'bg-emerald-500/65 hover:bg-emerald-400/80' : 'bg-orange-500/55 hover:bg-orange-400/70'
                )}
                style={{ height: `${Math.max(15, Math.min(100, ((r.buy_count || 0) / 12) * 100))}%` }}
              />
            ))
          )}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[9px] font-mono text-slate-600 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-1.5 bg-emerald-500/65 rounded-sm" />Approved</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-1.5 bg-orange-500/55 rounded-sm" />Rejected</span>
        </div>
      </div>

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [events,   setEvents]   = useState<ActivityEvent[]>([])
  const [_selectedBot, _setSelectedBot] = useState<FleetBot | null>(null)
  const [subnets,  setSubnets]  = useState<Subnet[]>([])

  const activityRef = useRef<HTMLDivElement>(null)

  // Fetch activity
  const fetchActivity = useCallback(async () => {
    try {
      const data = await api.get('/fleet/activity?limit=60').then(r => r.data)
      setEvents(data.events || [])
    } catch {}
  }, [])

  // Fetch top subnets
  const fetchSubnets = useCallback(async () => {
    try {
      const data = await api.get('/market/subnets?sort=stake_tao&order=desc').then(r => r.data)
      setSubnets((data.subnets || []).slice(0, 16))
    } catch {}
  }, [])

  useEffect(() => {
    fetchActivity()
    fetchSubnets()
    const actTimer    = setInterval(fetchActivity, 5_000)
    const subnetTimer = setInterval(fetchSubnets, 30_000)
    return () => { clearInterval(actTimer); clearInterval(subnetTimer) }
  }, [fetchActivity, fetchSubnets])

  // Auto-scroll activity
  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = 0
  }, [events])

  return (
    <div className="flex-1 flex flex-col bg-[#080d18] text-slate-100 overflow-hidden font-mono">

      {/* ══ TOP SUBNETS BAR — full Dashboard-style cards ══ */}
      <div className="flex-shrink-0 border-b border-slate-800/60">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800/40">
          <BarChart2 size={12} className="text-accent-blue" />
          <span className="text-[12px] font-bold tracking-widest text-slate-300 uppercase">Top Subnets</span>
          <span className="text-[11px] text-slate-600 font-mono ml-1">by stake · live</span>
          <span className="ml-auto text-[11px] text-slate-600 font-mono">{subnets.length} subnets</span>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-thin">
          {subnets.length === 0 ? (
            <div className="text-[11px] text-slate-600 font-mono py-2">Loading subnets…</div>
          ) : (
            (() => {
              const maxStake = Math.max(...subnets.map(s => s.stake_tao), 1)
              return subnets.map(s => <SubnetCard key={s.uid} s={s} maxStake={maxStake} />)
            })()
          )}
        </div>
      </div>{/* end TOP SUBNETS */}

      {/* ══ BOTTOM SECTION: OpenClaw Council | Activity Stream | Subnet Heat Map ══ */}
      <div className="flex flex-1 min-h-0">

        {/* OpenClaw Council Monitor — fills its box fully */}
        <div className="w-[480px] flex-shrink-0 border-r border-slate-800/60 flex flex-col overflow-hidden">
          <OpenClawCouncil />
        </div>

        {/* Right side: activity stream + heat map */}
        <div className="flex-1 flex min-w-0 min-h-0">

          {/* Activity stream */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden p-3 border-r border-slate-800/60">

            {/* Activity stream — 50 most-recent events, scrolls inside box */}
            <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40 flex-shrink-0">
                <Activity size={12} className="text-blue-400" />
                <span className="text-[13px] font-bold tracking-widest text-slate-300 uppercase">Activity Stream</span>
                <span className="ml-auto text-[15px] text-slate-400 font-mono">live</span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div ref={activityRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {events.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">Waiting for events…</div>
                ) : (
                  events.slice(0, 50).map((ev, i) => (
                    <div key={`${ev.id}-${i}`} className="flex items-center gap-1.5 py-0.5">
                      <div className="flex-shrink-0"><EventIcon kind={ev.kind} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] text-slate-300 leading-tight truncate">{ev.message}</div>
                      </div>
                      <div className="text-[14px] text-slate-500 flex-shrink-0 font-mono">{fmtTime(ev.timestamp)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>{/* end activity column */}

          {/* Subnet Heat Map — equal width, fills box */}
          <div className="flex-1 overflow-hidden p-3 flex flex-col">
            <SubnetHeatMap />
          </div>

        </div>
      </div>{/* end BOTTOM SECTION */}

    </div>
  )
}