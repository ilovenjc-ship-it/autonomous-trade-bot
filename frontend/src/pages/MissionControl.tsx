import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Activity, Send, Zap, Radio, Shield, TrendingUp,
  TrendingDown, ChevronRight, AlertTriangle, CheckCircle2,
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

interface ChatEntry {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

// ── Mode badge ────────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: string }) {
  const cfg = {
    PAPER_ONLY:       { label: 'PAPER',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    APPROVED_FOR_LIVE:{ label: 'APPROVED', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    LIVE:             { label: 'LIVE',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  }[mode] ?? { label: mode, cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }

  return (
    <span className={clsx('text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border font-mono', cfg.cls)}>
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
        <span className="text-[10px] text-slate-500 font-mono">{label}</span>
        <span className={clsx('text-[10px] font-mono', check.ok ? 'text-emerald-400' : 'text-slate-400')}>
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

// ── Bot card ──────────────────────────────────────────────────────────────────

function BotCard({ bot, selected, onClick }: { bot: FleetBot; selected: boolean; onClick: () => void }) {
  const gatesPassed = [bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok].filter(Boolean).length

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-3 rounded-lg border transition-all duration-200 group',
        selected
          ? 'bg-blue-500/10 border-blue-500/40'
          : 'bg-slate-900/40 border-slate-700/40 hover:bg-slate-800/50 hover:border-slate-600/50'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            bot.is_active ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'
          )} />
          <span className="text-xs font-semibold text-slate-200 truncate max-w-[100px]">
            {bot.display_name}
          </span>
        </div>
        <ModeBadge mode={bot.mode} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        <div className="text-center">
          <div className={clsx('text-xs font-bold font-mono', bot.win_rate >= 55 ? 'text-emerald-400' : 'text-slate-300')}>
            {bot.win_rate.toFixed(0)}%
          </div>
          <div className="text-[9px] text-slate-600">win rate</div>
        </div>
        <div className="text-center">
          <div className={clsx('text-xs font-bold font-mono', bot.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {bot.total_pnl >= 0 ? '+' : ''}{bot.total_pnl.toFixed(3)}
          </div>
          <div className="text-[9px] text-slate-600">PnL TAO</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold font-mono text-slate-300">{bot.total_trades}</div>
          <div className="text-[9px] text-slate-600">trades</div>
        </div>
      </div>

      {/* Gate progress */}
      <div className="flex items-center gap-1">
        {[bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok].map((ok, i) => (
          <div key={i} className={clsx('w-2 h-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-slate-700')} />
        ))}
        <span className="text-[9px] text-slate-600 ml-1 font-mono">{gatesPassed}/4 gates</span>
        {bot.gate.all_clear && (
          <span className="ml-auto text-[9px] text-purple-400 font-bold animate-pulse">READY</span>
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
    system: { icon: Cpu,        cls: 'text-slate-400' },
    alert:  { icon: AlertTriangle, cls: 'text-orange-400' },
  }[kind] ?? { icon: Activity, cls: 'text-slate-400' }

  const Icon = cfg.icon
  return <Icon size={11} className={cfg.cls} />
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '' }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [fleet, setFleet] = useState<FleetBot[]>([])
  const [summary, setSummary] = useState<FleetSummary | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedBot, setSelectedBot] = useState<FleetBot | null>(null)
  const [countdown, setCountdown] = useState(300) // 5 min cycle
  const [tick, setTick] = useState(0)

  const activityRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

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

  // Initial load + chat history
  useEffect(() => {
    fetchFleet()
    fetchActivity()
    api.get('/fleet/chat/history').then(r => setChat(r.data.history || [])).catch(() => {})
  }, [fetchFleet, fetchActivity])

  // Polling
  useEffect(() => {
    const fleetTimer = setInterval(fetchFleet, 10_000)
    const actTimer   = setInterval(fetchActivity, 5_000)
    return () => { clearInterval(fleetTimer); clearInterval(actTimer) }
  }, [fetchFleet, fetchActivity])

  // Countdown tick
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchFleet(); fetchActivity(); return 300 }
        return c - 1
      })
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [fetchFleet, fetchActivity])

  // Auto-scroll activity
  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = 0
  }, [events])

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chat])

  const sendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatLoading(true)
    const userEntry: ChatEntry = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setChat(prev => [...prev, userEntry])
    try {
      const data = await api.post('/fleet/chat', { message: msg }).then(r => r.data)
      setChat(data.history || [])
    } catch {
      setChat(prev => [...prev, { role: 'agent', content: 'Connection error. Please retry.', timestamp: new Date().toISOString() }])
    } finally {
      setChatLoading(false)
    }
  }

  const fmtCountdown = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
  const rsiTrend = (summary?.rsi ?? 50) > 60 ? 'Overbought' : (summary?.rsi ?? 50) < 40 ? 'Oversold' : 'Neutral'

  return (
    <div className="flex h-full bg-[#080d18] text-slate-200 overflow-hidden font-mono">

      {/* ── LEFT: Agent Fleet ─────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 border-r border-slate-800/60 flex flex-col">
        {/* Header */}
        <div className="px-3 py-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span className="text-[11px] font-bold tracking-widest text-slate-300 uppercase">Agent Fleet</span>
          </div>
          {summary && (
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-emerald-400 text-xs font-bold">{summary.live}</div>
                <div className="text-[9px] text-slate-600">live</div>
              </div>
              <div>
                <div className="text-yellow-400 text-xs font-bold">{summary.paper}</div>
                <div className="text-[9px] text-slate-600">paper</div>
              </div>
              <div>
                <div className="text-purple-400 text-xs font-bold">{summary.approved}</div>
                <div className="text-[9px] text-slate-600">approved</div>
              </div>
            </div>
          )}
        </div>

        {/* Bot cards */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {fleet.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-xs">Loading fleet…</div>
          ) : (
            fleet.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                selected={selectedBot?.id === bot.id}
                onClick={() => setSelectedBot(prev => prev?.id === bot.id ? null : bot)}
              />
            ))
          )}
        </div>

        {/* Fleet PnL footer */}
        {summary && (
          <div className="px-3 py-2 border-t border-slate-800/60">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider">Fleet PnL</div>
            <div className={clsx('text-sm font-bold', summary.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {summary.total_pnl >= 0 ? '+' : ''}{summary.total_pnl.toFixed(4)} TAO
            </div>
          </div>
        )}
      </div>

      {/* ── CENTER: Activity + Chat ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800/60">

        {/* Selected bot detail */}
        {selectedBot && (
          <div className="px-4 py-3 border-b border-slate-800/60 bg-blue-500/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={13} className="text-blue-400" />
                <span className="text-xs font-bold text-blue-300">{selectedBot.display_name} — Gate Detail</span>
              </div>
              <ModeBadge mode={selectedBot.mode} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <GateBar label="Cycles" check={selectedBot.gate.cycles} />
              <GateBar label="Win %" check={selectedBot.gate.win_rate} />
              <GateBar label="Win Margin" check={selectedBot.gate.win_margin} />
              <GateBar label="PnL TAO" check={selectedBot.gate.pnl} />
            </div>
            {selectedBot.gate.all_clear && (
              <div className="mt-2 flex items-center gap-2 text-purple-400">
                <CheckCircle2 size={12} />
                <span className="text-[10px] font-bold tracking-wider">ALL GATES CLEAR — READY FOR LIVE PROMOTION</span>
              </div>
            )}
          </div>
        )}

        {/* Activity stream */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-slate-800/40 flex items-center gap-2">
            <Activity size={12} className="text-blue-400" />
            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Activity Stream</span>
            <span className="ml-auto text-[9px] text-slate-700 font-mono">live</span>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div ref={activityRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {events.length === 0 ? (
              <div className="text-center py-6 text-slate-700 text-xs">Waiting for events…</div>
            ) : (
              events.map((ev, i) => (
                <div key={`${ev.id}-${i}`} className="flex items-start gap-2 py-1 group">
                  <div className="mt-0.5 flex-shrink-0">
                    <EventIcon kind={ev.kind} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-300 leading-tight">{ev.message}</div>
                    {ev.detail && (
                      <div className="text-[9px] text-slate-600 truncate mt-0.5">{ev.detail}</div>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {fmtTime(ev.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat interface */}
        <div className="border-t border-slate-800/60 flex flex-col" style={{ height: '220px' }}>
          <div className="px-4 py-2 border-b border-slate-800/40 flex items-center gap-2">
            <Cpu size={12} className="text-emerald-400" />
            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">II Agent Chat</span>
          </div>
          <div ref={chatRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {chat.length === 0 && (
              <div className="text-[11px] text-slate-600 italic">Ask II Agent about price, strategy status, gate progress…</div>
            )}
            {chat.map((entry, i) => (
              <div key={i} className={clsx('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[80%] px-3 py-2 rounded-lg text-[11px] leading-relaxed',
                  entry.role === 'user'
                    ? 'bg-blue-500/20 text-blue-100 rounded-br-sm'
                    : 'bg-slate-800/80 text-slate-300 rounded-bl-sm border border-slate-700/50'
                )}>
                  {entry.role === 'agent' && (
                    <div className="text-[9px] text-emerald-400 mb-1 font-bold tracking-wider">II AGENT</div>
                  )}
                  {entry.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/80 border border-slate-700/50 px-3 py-2 rounded-lg rounded-bl-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="px-3 py-2 border-t border-slate-800/40">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Ask II Agent…"
                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/50 transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Command Panel ──────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 flex flex-col">

        {/* II Agent status */}
        <div className="px-4 py-4 border-b border-slate-800/60 text-center">
          {/* HAL-like indicator */}
          <div className="relative mx-auto w-16 h-16 mb-3">
            <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping opacity-30" />
            <div className="absolute inset-1 rounded-full border border-emerald-500/30" />
            <div className="absolute inset-0 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/30 to-blue-500/30 border border-emerald-500/40 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              </div>
            </div>
            {/* Orbit ring */}
            <div
              className="absolute inset-0 rounded-full border border-dashed border-emerald-500/20"
              style={{ animation: 'spin 8s linear infinite' }}
            />
          </div>
          <div className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">II Agent</div>
          <div className="text-[9px] text-slate-600 mt-0.5">Autonomous Mode</div>
        </div>

        {/* Next cycle countdown */}
        <div className="px-4 py-3 border-b border-slate-800/60">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} className="text-slate-500" />
            <span className="text-[9px] text-slate-600 uppercase tracking-wider">Next Cycle</span>
          </div>
          <div className="text-2xl font-bold text-slate-200 tracking-widest">
            {fmtCountdown(countdown)}
          </div>
          <div className="mt-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000"
              style={{ width: `${((300 - countdown) / 300) * 100}%` }}
            />
          </div>
        </div>

        {/* Market intel */}
        <div className="px-4 py-3 border-b border-slate-800/60">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">Market Intel</div>
          {summary ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">TAO/USD</span>
                <span className="text-[11px] font-bold text-white">${summary.tao_price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">RSI-14</span>
                <span className={clsx('text-[11px] font-bold', summary.rsi > 60 ? 'text-red-400' : summary.rsi < 40 ? 'text-emerald-400' : 'text-slate-300')}>
                  {summary.rsi.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">Momentum</span>
                <div className="flex items-center gap-1">
                  {summary.rsi > 55
                    ? <TrendingUp size={10} className="text-emerald-400" />
                    : summary.rsi < 45
                    ? <TrendingDown size={10} className="text-red-400" />
                    : <Circle size={10} className="text-slate-500" />
                  }
                  <span className="text-[10px] text-slate-400">{rsiTrend}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-700">Loading…</div>
          )}
        </div>

        {/* Gate summary */}
        <div className="px-4 py-3 border-b border-slate-800/60">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">Gate Summary</div>
          <div className="space-y-1.5">
            {fleet.map(bot => {
              const passed = [bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok].filter(Boolean).length
              return (
                <div key={bot.id} className="flex items-center gap-2">
                  <div className={clsx('w-1 h-4 rounded-full flex-shrink-0', {
                    'bg-emerald-500': bot.mode === 'LIVE',
                    'bg-purple-500': bot.mode === 'APPROVED_FOR_LIVE',
                    'bg-yellow-500/50': bot.mode === 'PAPER_ONLY',
                  })} />
                  <span className="text-[10px] text-slate-400 truncate flex-1">{bot.display_name}</span>
                  <div className="flex gap-0.5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={clsx('w-1 h-1 rounded-full', i < passed ? 'bg-emerald-500' : 'bg-slate-700')} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* System status */}
        <div className="px-4 py-3 flex-1">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">System</div>
          <div className="space-y-1.5">
            {[
              { label: 'Price Feed',   ok: true },
              { label: 'Database',     ok: true },
              { label: 'Strategy Eng', ok: true },
              { label: 'Risk Guard',   ok: true },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{label}</span>
                <div className="flex items-center gap-1">
                  <div className={clsx('w-1.5 h-1.5 rounded-full', ok ? 'bg-emerald-400' : 'bg-red-400')} />
                  <span className={clsx('text-[9px]', ok ? 'text-emerald-500' : 'text-red-500')}>{ok ? 'OK' : 'ERR'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lock / live trading guard */}
        <div className="px-4 py-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-2 py-1.5">
            <Lock size={10} className="text-yellow-500 flex-shrink-0" />
            <span className="text-[9px] text-yellow-500/80 leading-tight">Gate enforced — paper results required before live</span>
          </div>
        </div>
      </div>
    </div>
  )
}