import { useEffect, useRef, useState, useCallback } from 'react'
import SubnetHeatMap from '@/components/SubnetHeatMap'
import {
  Activity, Zap, Radio, Shield, TrendingUp,
  TrendingDown, AlertTriangle, CheckCircle2,
  Circle, Clock, BarChart3, Cpu, Lock
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types ────────────────────────────────────────────────────────────────────

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
          {bot.win_rate.toFixed(0)}%
        </span>
        <span className={clsx('text-[10px] font-mono truncate',
          bot.total_pnl >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
          {bot.total_pnl >= 0 ? '+' : ''}{bot.total_pnl.toFixed(2)}τ
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
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
                {stats.approval_rate_pct.toFixed(1)}%
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

      {/* Bot vote grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 min-h-0">
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
                      <div className="text-[9px] text-slate-500 font-mono">{(v.confidence * 100).toFixed(0)}% conf</div>
                    </div>
                    <span className={clsx('text-[11px] font-bold font-mono flex-shrink-0', vc.text)}>
                      {v.vote}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Vote tally bar */}
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
          <div className="flex flex-col items-center justify-center h-full py-6 text-center">
            <Zap size={32} className="text-purple-400/30 mb-3" />
            <div className="text-[13px] text-slate-400 font-mono">Waiting for consensus rounds…</div>
            <div className="text-[11px] text-slate-600 mt-1">Rounds fire when LIVE strategies trigger</div>
          </div>
        )}
      </div>

      {/* History sparkline */}
      <div className="flex-shrink-0 border-t border-slate-800/40 px-3 py-2.5">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono flex items-center justify-between">
          <span>Round History</span>
          {history.length > 0 && (
            <span className="text-slate-600">{history.length} rounds</span>
          )}
        </div>
        <div className="flex gap-0.5 items-end h-7">
          {history.length === 0 ? (
            <span className="text-[11px] text-slate-600 font-mono">No rounds yet</span>
          ) : (
            /* Render newest on right: history is newest-first, so reverse */
            [...history].reverse().map((r, i) => (
              <div
                key={i}
                title={`Round ${r.round_id}: ${r.result}`}
                className={clsx(
                  'flex-1 rounded-sm transition-all cursor-default',
                  r.approved ? 'bg-emerald-500/65 hover:bg-emerald-400/80' : 'bg-orange-500/55 hover:bg-orange-400/70'
                )}
                style={{ height: `${Math.max(25, Math.min(100, ((r.buy_count || 0) / 12) * 100))}%` }}
              />
            ))
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-slate-600">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-1.5 bg-emerald-500/65 rounded-sm" />Approved</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-1.5 bg-orange-500/55 rounded-sm" />Rejected</span>
        </div>
      </div>

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [fleet, setFleet] = useState<FleetBot[]>([])
  const [summary, setSummary] = useState<FleetSummary | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [selectedBot, setSelectedBot] = useState<FleetBot | null>(null)
  const [countdown, setCountdown] = useState(300) // 5 min cycle
  const [liveTime, setLiveTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

  const activityRef    = useRef<HTMLDivElement>(null)
  const countdownRef   = useRef(300)   // tracks real value synchronously — avoids setState-in-updater

  // Fetch fleet status
  const fetchFleet = useCallback(async () => {
    try {
      const data = await api.get('/fleet/status').then(r => r.data)
      setFleet(data.fleet || [])
      setSummary(data.summary || null)
    } catch {}
  }, [])

  // Fetch activity
  const fetchActivity = useCallback(async () => {
    try {
      const data = await api.get('/fleet/activity?limit=60').then(r => r.data)
      setEvents(data.events || [])
    } catch {}
  }, [])

  // Initial load
  useEffect(() => {
    fetchFleet()
    fetchActivity()
  }, [fetchFleet, fetchActivity])

  // Polling
  useEffect(() => {
    const fleetTimer = setInterval(fetchFleet, 10_000)
    const actTimer   = setInterval(fetchActivity, 5_000)
    return () => { clearInterval(fleetTimer); clearInterval(actTimer) }
  }, [fetchFleet, fetchActivity])

  // Countdown tick + live clock
  useEffect(() => {
    const t = setInterval(() => {
      countdownRef.current -= 1
      if (countdownRef.current <= 0) {
        countdownRef.current = 300
        fetchFleet()
        fetchActivity()
      }
      setCountdown(countdownRef.current)
      setLiveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(t)
  }, [fetchFleet, fetchActivity])

  // Auto-scroll activity
  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = 0
  }, [events])

  const fmtCountdown = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
  const rsiTrend = (summary?.rsi ?? 50) > 60 ? 'Overbought' : (summary?.rsi ?? 50) < 40 ? 'Oversold' : 'Neutral'

  return (
    <div className="flex-1 flex flex-col bg-[#080d18] text-slate-100 overflow-hidden font-mono">

      {/* ══ TOP SECTION: left info panel + right strips (h = 2 × 162px) ══ */}
      <div className="flex flex-shrink-0 h-[324px] border-b border-slate-800/60">

        {/* Left panel: Clock → Market Intel → System */}
        <div className="w-56 flex-shrink-0 border-r border-slate-800/60 flex flex-col overflow-hidden">

          {/* Clock + Next Cycle */}
          <div className="flex-shrink-0 border-b border-slate-800/50 px-4 py-3 bg-slate-900/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={8} /> Local Time
              </span>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider">Next Cycle</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[17px] font-bold text-slate-100 font-mono leading-none">{liveTime}</div>
              <div className="text-[17px] font-bold text-blue-300 font-mono leading-none">{fmtCountdown(countdown)}</div>
            </div>
            <div className="mt-2 h-0.5 bg-slate-700/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000 rounded-full"
                style={{ width: `${((300 - countdown) / 300) * 100}%` }}
              />
            </div>
          </div>

          {/* Market Intel */}
          <div className="flex-shrink-0 border-b border-slate-800/50 px-3 py-2.5">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-2">Market Intel</div>
            {summary ? (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-slate-400">TAO/USD</span>
                  <span className="text-[13px] font-bold text-white">${summary.tao_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-slate-400">RSI-14</span>
                  <span className={clsx('text-[13px] font-bold', summary.rsi > 60 ? 'text-red-400' : summary.rsi < 40 ? 'text-emerald-400' : 'text-slate-300')}>
                    {summary.rsi.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-slate-400">Momentum</span>
                  <div className="flex items-center gap-1">
                    {summary.rsi > 55 ? <TrendingUp size={10} className="text-emerald-400" />
                      : summary.rsi < 45 ? <TrendingDown size={10} className="text-red-400" />
                      : <Circle size={10} className="text-slate-400" />}
                    <span className="text-[12px] text-slate-300">{rsiTrend}</span>
                  </div>
                </div>
              </div>
            ) : <div className="text-xs text-slate-500">Loading…</div>}
          </div>

          {/* System */}
          <div className="flex-shrink-0 border-b border-slate-800/50 px-3 py-2.5">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-2">System</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                { label: 'Price Feed',   ok: true },
                { label: 'Database',     ok: true },
                { label: 'Strategy Eng', ok: true },
                { label: 'Risk Guard',   ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', ok ? 'bg-emerald-400' : 'bg-red-400')} />
                  <span className="text-[12px] text-slate-300 truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>{/* end left panel */}

        {/* Right: Fleet strip (h-162) + Gate Summary strip (h-162) — symmetric rows */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Row 1: Agent Fleet ─────────────────────────────────────────── */}
          <div className="h-[162px] flex flex-col border-b border-slate-800/60">

            {/* Uniform header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/40 flex-shrink-0 h-10">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold tracking-wide text-white uppercase">Agent Fleet</span>
              {summary && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded border text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/35">
                    {summary.live} LIVE
                  </span>
                  <span className="px-2.5 py-1 rounded border text-[11px] font-bold bg-purple-500/15 text-purple-400 border-purple-500/35">
                    {summary.approved} APPROVED
                  </span>
                  <span className="px-2.5 py-1 rounded border text-[11px] font-bold bg-yellow-500/10 text-yellow-400 border-yellow-500/25">
                    {summary.paper} PAPER
                  </span>
                </div>
              )}
            </div>

            {/* Bot cards — auto-fill columns, no overflow scroll */}
            <div className="flex-1 grid gap-1.5 px-3 py-1.5 overflow-hidden"
              style={{ gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)' }}>
              {fleet.length === 0 ? (
                <div className="text-slate-500 text-xs py-2 font-mono col-span-full">Loading fleet…</div>
              ) : (
                fleet.map(bot => (
                  <BotCard key={bot.id} bot={bot}
                    selected={selectedBot?.id === bot.id}
                    onClick={() => setSelectedBot(prev => prev?.id === bot.id ? null : bot)} />
                ))
              )}
              {/* Paper Trading summary cell */}
              {summary && (
                <div className="w-full h-full px-2 py-1.5 rounded-lg border bg-yellow-500/5 border-yellow-500/20 flex flex-col justify-center">
                  <div className="text-[9px] text-yellow-400/60 uppercase tracking-wider font-bold">Paper</div>
                  <div className="text-lg font-bold text-yellow-400 font-mono leading-none">{summary.paper}</div>
                  <div className="text-[9px] text-yellow-400/40 leading-tight">in simulation</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 2: Gate Summary ─────────────────────────────────────────── */}
          <div className="h-[162px] flex flex-col">

            {/* Uniform header — mirrors Row 1 exactly */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/40 flex-shrink-0 h-10">
              <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a78bfa] animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold tracking-wide text-white uppercase">Gate Summary</span>
              <span className="ml-auto text-[11px] font-mono text-slate-500">Cyc · WR · Margin · PnL</span>
            </div>

            {/* Gate chips — same auto-fill grid, no overflow scroll */}
            <div className="flex-1 grid gap-1.5 px-3 py-1.5 overflow-hidden"
              style={{ gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)' }}>
              {fleet.map(bot => {
                const modeColor  = bot.mode === 'LIVE' ? 'bg-emerald-500'   : bot.mode === 'APPROVED_FOR_LIVE' ? 'bg-purple-500' : 'bg-slate-600'
                const modeBorder = bot.mode === 'LIVE' ? 'border-l-emerald-500/60' : bot.mode === 'APPROVED_FOR_LIVE' ? 'border-l-purple-500/60' : 'border-l-slate-600/60'
                return (
                  <div key={bot.id}
                    className={clsx(
                      'flex flex-col bg-slate-800/50 border border-slate-700/40 border-l-2 rounded-md px-1.5 py-1.5 h-full justify-between min-w-0',
                      modeBorder
                    )}>
                    <div className="flex items-center gap-1 mb-0.5 min-w-0">
                      <div className={clsx('w-1 h-1 rounded-full flex-shrink-0', modeColor)} />
                      <div className="text-[10px] text-slate-200 font-semibold truncate leading-none">
                        {bot.display_name.split(' ')[0]}
                      </div>
                    </div>
                    <div className="space-y-0.5 flex-1">
                      {([
                        { ok: bot.gate.cycles.ok,    val: `${bot.gate.cycles.value}/${bot.gate.cycles.required}` },
                        { ok: bot.gate.win_rate.ok,  val: `${bot.gate.win_rate.value.toFixed(0)}%` },
                        { ok: bot.gate.win_margin.ok,val: `${bot.gate.win_margin.value.toFixed(1)}%` },
                        { ok: bot.gate.pnl.ok,       val: `${bot.gate.pnl.value.toFixed(2)}τ` },
                      ] as const).map(({ ok, val }, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <div className={clsx('h-0.5 rounded-full flex-shrink-0', ok ? 'bg-emerald-500' : 'bg-slate-700')}
                            style={{ width: 20 }} />
                          <span className={clsx('text-[8px] font-mono ml-auto', ok ? 'text-emerald-400' : 'text-slate-600')}>
                            {ok ? '✓' : val}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={clsx('text-[11px] font-bold font-mono mt-1 leading-none',
                      bot.win_rate >= 55 ? 'text-emerald-400' : bot.win_rate >= 45 ? 'text-yellow-400' : 'text-red-400')}>
                      {bot.win_rate.toFixed(0)}%
                    </div>
                  </div>
                )
              })}

              {/* Gate Enforced chip */}
              {summary && (
                <>
                  <div className="flex flex-col bg-yellow-500/5 border border-yellow-500/20 border-l-2 border-l-yellow-500/40 rounded-md px-1.5 py-1.5 h-full justify-between min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Lock size={7} className="text-yellow-400 flex-shrink-0" />
                      <div className="text-[10px] text-yellow-400 font-semibold truncate leading-none">Gate</div>
                    </div>
                    <div className="space-y-0.5 flex-1">
                      {[['100+', '55%', '>0', '>0τ']].flat().map((v, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="h-0.5 rounded-full flex-shrink-0 bg-yellow-500/30" style={{ width: 20 }} />
                          <span className="text-[8px] font-mono ml-auto text-yellow-400/60">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] text-yellow-400/40 font-mono mt-1">min</div>
                  </div>

                  {/* Fleet PnL chip */}
                  <div className="flex flex-col bg-slate-800/50 border border-slate-700/40 border-l-2 border-l-emerald-500/60 rounded-md px-1.5 py-1.5 h-full justify-between min-w-0">
                    <div className="text-[10px] text-slate-300 font-semibold leading-none mb-0.5">Fleet</div>
                    <div className="flex-1" />
                    <div className={clsx('text-[12px] font-bold font-mono leading-none',
                      summary.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {summary.total_pnl >= 0 ? '+' : ''}{summary.total_pnl.toFixed(3)}τ
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>{/* end right strips */}
      </div>{/* end TOP SECTION */}

      {/* ══ BOTTOM SECTION: OpenClaw Council | Activity Stream | Subnet Heat Map ══ */}
      <div className="flex flex-1 min-h-0">

        {/* OpenClaw Council Monitor */}
        <div className="w-[520px] flex-shrink-0 border-r border-slate-800/60 flex flex-col">
          <OpenClawCouncil />
        </div>

        {/* Right side: activity stream (half) + heat map (half) — equal split */}
        <div className="flex-1 flex min-w-0 min-h-0">

          {/* Activity stream — equal width, content capped + contained */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden p-3 border-r border-slate-800/60">

            {/* Selected bot gate detail */}
            {selectedBot && (
              <div className="flex-shrink-0 mb-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={13} className="text-blue-400" />
                    <span className="text-xs font-bold text-blue-300">{selectedBot.display_name} — Gate Detail</span>
                  </div>
                  <ModeBadge mode={selectedBot.mode} />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <GateBar label="Cycles"     check={selectedBot.gate.cycles} />
                  <GateBar label="Win %"      check={selectedBot.gate.win_rate} />
                  <GateBar label="Win Margin" check={selectedBot.gate.win_margin} />
                  <GateBar label="PnL TAO"    check={selectedBot.gate.pnl} />
                </div>
                {selectedBot.gate.all_clear && (
                  <div className="mt-2 flex items-center gap-2 text-purple-400">
                    <CheckCircle2 size={12} />
                    <span className="text-[13px] font-bold tracking-wider">ALL GATES CLEAR — READY FOR LIVE PROMOTION</span>
                  </div>
                )}
              </div>
            )}

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