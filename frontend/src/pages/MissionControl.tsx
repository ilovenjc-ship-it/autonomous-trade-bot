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
  }[mode] ?? { label: mode, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' }

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
        <span className="text-[10px] text-slate-300 font-mono">{label}</span>
        <span className={clsx('text-[10px] font-mono', check.ok ? 'text-emerald-400' : 'text-slate-300')}>
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
        'flex-shrink-0 w-[148px] text-left px-3 py-2.5 rounded-lg border transition-all duration-200',
        selected
          ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
          : 'bg-slate-900/40 border-slate-700/40 hover:bg-slate-800/50 hover:border-slate-600/50'
      )}
    >
      {/* Name + active dot */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={clsx(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          bot.is_active ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'
        )} />
        <span className="text-[11px] font-semibold text-slate-100 truncate flex-1">
          {bot.display_name}
        </span>
      </div>

      {/* Mode badge */}
      <div className="mb-2">
        <ModeBadge mode={bot.mode} />
      </div>

      {/* Win rate + PnL side by side */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className={clsx('text-sm font-bold font-mono leading-none', bot.win_rate >= 55 ? 'text-emerald-400' : bot.win_rate >= 45 ? 'text-yellow-400' : 'text-red-400')}>
            {bot.win_rate.toFixed(0)}%
          </div>
          <div className="text-[8px] text-slate-500 mt-0.5">win rate</div>
        </div>
        <div className="text-right">
          <div className={clsx('text-[11px] font-bold font-mono leading-none', bot.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {bot.total_pnl >= 0 ? '+' : ''}{bot.total_pnl.toFixed(3)}τ
          </div>
          <div className="text-[8px] text-slate-500 mt-0.5">{bot.total_trades} trades</div>
        </div>
      </div>

      {/* Gate dots */}
      <div className="flex items-center gap-1">
        {[bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok].map((ok, i) => (
          <div key={i} className={clsx('flex-1 h-1 rounded-full', ok ? 'bg-emerald-500' : 'bg-slate-700')} />
        ))}
        {bot.gate.all_clear && (
          <span className="text-[8px] text-purple-400 font-bold animate-pulse ml-1">✓</span>
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
  const [liveTime, setLiveTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

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

  // Countdown tick + live clock
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchFleet(); fetchActivity(); return 300 }
        return c - 1
      })
      setTick(t => t + 1)
      setLiveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
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
    <div className="flex flex-col h-full bg-[#080d18] text-slate-100 overflow-hidden font-mono">

      {/* ══ TOP SECTION: left info panel + right strips (h = 2 × 162px) ══ */}
      <div className="flex flex-shrink-0 h-[324px] border-b border-slate-800/60">

        {/* Left panel: Lock Guard → Clock → Market Intel → System */}
        <div className="w-56 flex-shrink-0 border-r border-slate-800/60 flex flex-col overflow-hidden">

          {/* Lock guard — top of column */}
          <div className="flex-shrink-0 border-b border-yellow-500/20 px-3 py-2 bg-yellow-500/5">
            <div className="flex items-center gap-2">
              <Lock size={10} className="text-yellow-400 flex-shrink-0" />
              <span className="text-[9px] text-yellow-400/90 leading-tight font-mono tracking-wide">Gate enforced — paper required</span>
            </div>
          </div>

          {/* Clock + Next Cycle */}
          <div className="flex-shrink-0 border-b border-slate-800/50 px-4 py-3 bg-slate-900/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={8} /> Local Time
              </span>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Next Cycle</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[19px] font-bold text-slate-100 font-mono leading-none">{liveTime}</div>
              <div className="text-[19px] font-bold text-blue-300 font-mono leading-none">{fmtCountdown(countdown)}</div>
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
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-2">Market Intel</div>
            {summary ? (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400">TAO/USD</span>
                  <span className="text-[11px] font-bold text-white">${summary.tao_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400">RSI-14</span>
                  <span className={clsx('text-[11px] font-bold', summary.rsi > 60 ? 'text-red-400' : summary.rsi < 40 ? 'text-emerald-400' : 'text-slate-300')}>
                    {summary.rsi.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400">Momentum</span>
                  <div className="flex items-center gap-1">
                    {summary.rsi > 55 ? <TrendingUp size={10} className="text-emerald-400" />
                      : summary.rsi < 45 ? <TrendingDown size={10} className="text-red-400" />
                      : <Circle size={10} className="text-slate-400" />}
                    <span className="text-[10px] text-slate-300">{rsiTrend}</span>
                  </div>
                </div>
              </div>
            ) : <div className="text-xs text-slate-500">Loading…</div>}
          </div>

          {/* System */}
          <div className="flex-shrink-0 border-b border-slate-800/50 px-3 py-2.5">
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-2">System</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                { label: 'Price Feed',   ok: true },
                { label: 'Database',     ok: true },
                { label: 'Strategy Eng', ok: true },
                { label: 'Risk Guard',   ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', ok ? 'bg-emerald-400' : 'bg-red-400')} />
                  <span className="text-[9px] text-slate-300 truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

          

        </div>{/* end left panel */}

        {/* Right: Fleet strip (h-162) + Gate Summary strip (h-162) */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Fleet strip */}
          <div className="h-[162px] flex flex-col border-b border-slate-800/60">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800/40 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Agent Fleet</span>
              {summary && (
                <div className="flex items-center gap-4 ml-1">
                  <span className="text-[10px] text-emerald-400 font-bold">{summary.live} live</span>
                  <span className="text-[10px] text-purple-400 font-bold">{summary.approved} approved</span>
                  <span className="text-[10px] text-yellow-400 font-bold">{summary.paper} paper</span>
                </div>
              )}
              {summary && (
                <div className={clsx('ml-auto text-[11px] font-bold', summary.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  Fleet PnL: {summary.total_pnl >= 0 ? '+' : ''}{summary.total_pnl.toFixed(4)} τ
                </div>
              )}
            </div>
            <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-1">
              {fleet.length === 0 ? (
                <div className="text-slate-300 text-xs py-2">Loading fleet…</div>
              ) : (
                fleet.map(bot => (
                  <BotCard key={bot.id} bot={bot}
                    selected={selectedBot?.id === bot.id}
                    onClick={() => setSelectedBot(prev => prev?.id === bot.id ? null : bot)} />
                ))
              )}
            </div>
          </div>

          {/* Gate Summary strip — same h-[162px], chips fill full height */}
          <div className="h-[162px] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800/40 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a78bfa] animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Gate Summary</span>
              <span className="ml-auto text-[9px] text-slate-400">Cyc · WR · WM · PnL</span>
            </div>
            {/* flex-1 row — chips use h-full to fill the remaining 126px */}
            <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-1">
              {fleet.map(bot => {
                const modeColor = bot.mode === 'LIVE' ? 'bg-emerald-500'
                  : bot.mode === 'APPROVED_FOR_LIVE' ? 'bg-purple-500' : 'bg-slate-600'
                const modeBorder = bot.mode === 'LIVE' ? 'border-l-emerald-500/60'
                  : bot.mode === 'APPROVED_FOR_LIVE' ? 'border-l-purple-500/60' : 'border-l-slate-600/60'
                return (
                  <div key={bot.id}
                    className={clsx(
                      'flex-shrink-0 flex flex-col bg-slate-800/50 border border-slate-700/40 border-l-2 rounded-md px-2.5 py-2 min-w-[130px] h-full justify-between',
                      modeBorder
                    )}>
                    {/* Name */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', modeColor)} />
                      <div className="text-[10px] text-slate-200 font-semibold truncate">{bot.display_name}</div>
                    </div>
                    {/* Labeled gate rows */}
                    <div className="space-y-1 flex-1">
                      {([
                        { label: 'Cycles', ok: bot.gate.cycles.ok, val: `${bot.gate.cycles.value}/${bot.gate.cycles.required}` },
                        { label: 'Win %',  ok: bot.gate.win_rate.ok, val: `${bot.gate.win_rate.value.toFixed(0)}%` },
                        { label: 'Margin', ok: bot.gate.win_margin.ok, val: `${bot.gate.win_margin.value.toFixed(1)}%` },
                        { label: 'PnL',    ok: bot.gate.pnl.ok, val: `${bot.gate.pnl.value.toFixed(2)}τ` },
                      ] as const).map(({ label, ok, val }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={clsx('w-8 h-1 rounded-full flex-shrink-0', ok ? 'bg-emerald-500' : 'bg-slate-700')} />
                          <span className="text-[8px] text-slate-500 w-8 flex-shrink-0">{label}</span>
                          <span className={clsx('text-[8px] font-mono ml-auto', ok ? 'text-emerald-400' : 'text-slate-500')}>{ok ? '✓' : val}</span>
                        </div>
                      ))}
                    </div>
                    {/* Win rate large */}
                    <div className={clsx('text-[15px] font-bold font-mono mt-1.5 leading-none',
                      bot.win_rate >= 55 ? 'text-emerald-400' : bot.win_rate >= 45 ? 'text-yellow-400' : 'text-red-400'
                    )}>{bot.win_rate.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>{/* end right strips */}
      </div>{/* end TOP SECTION */}

      {/* ══ BOTTOM SECTION: Chat (wider) + Activity (narrower) ══ */}
      <div className="flex flex-1 min-h-0">

        {/* II Agent Chat — wider */}
        <div className="w-[520px] flex-shrink-0 border-r border-slate-800/60 flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-800/40 flex items-center gap-2 flex-shrink-0">
            <Cpu size={12} className="text-emerald-400" />
            <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">II Agent Chat</span>
          </div>
          <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {chat.length === 0 && (
              <div className="text-[11px] text-slate-400 italic mt-1">
                Ask II Agent about strategy status, win rates, next cycle…
              </div>
            )}
            {chat.map((entry, i) => (
              <div key={i} className={clsx('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[88%] px-3 py-2 rounded-lg text-[11px] leading-relaxed',
                  entry.role === 'user'
                    ? 'bg-blue-500/20 text-blue-100 rounded-br-sm'
                    : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-slate-700/50'
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
          {/* FAQ quick-prompt chips */}
          <div className="px-3 pt-2 pb-1 border-t border-slate-800/40 flex flex-wrap gap-1.5">
            {[
              'Fleet win rate?',
              'Who is closest to LIVE?',
              'Next cycle ETA?',
              'Gate status summary',
              'Why is Mean Reversion PAPER?',
              'What is TAO doing?',
            ].map(q => (
              <button
                key={q}
                onClick={() => { setChatInput(q); setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[placeholder="Ask II Agent…"]'); el?.focus() }, 0) }}
                className="text-[9px] px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-emerald-300 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors font-mono"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-slate-800/40 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Ask II Agent…"
                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Activity feed — flex-1 (narrower, takes remaining width) */}
        <div className="flex-1 flex flex-col min-w-0 p-3">

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
                  <span className="text-[10px] font-bold tracking-wider">ALL GATES CLEAR — READY FOR LIVE PROMOTION</span>
                </div>
              )}
            </div>
          )}

          {/* Activity stream */}
          <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40 flex-shrink-0">
              <Activity size={12} className="text-blue-400" />
              <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Activity Stream</span>
              <span className="ml-auto text-[9px] text-slate-400 font-mono">live</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <div ref={activityRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {events.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">Waiting for events…</div>
              ) : (
                events.map((ev, i) => (
                  <div key={`${ev.id}-${i}`} className="flex items-start gap-2 py-1">
                    <div className="mt-0.5 flex-shrink-0"><EventIcon kind={ev.kind} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-300 leading-tight">{ev.message}</div>
                      {ev.detail && <div className="text-[9px] text-slate-400 truncate mt-0.5">{ev.detail}</div>}
                    </div>
                    <div className="text-[9px] text-slate-400 flex-shrink-0 font-mono">{fmtTime(ev.timestamp)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>{/* end BOTTOM SECTION */}
    </div>
  )
}