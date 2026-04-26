import { useState, useRef, useCallback, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  Settings, Wallet, Activity, Radio, Bot, Shield, BarChart2, BookOpen, Globe, Vote, Brain, Bell,
  Mic, Send, ChevronDown, DollarSign, ShieldOff, Clock, Play, Square,
} from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import { useAlerts } from '@/hooks/useAlerts'
import api from '@/api/client'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import NotificationBell from '@/components/NotificationBell'
import TickerTape from '@/components/TickerTape'

// ── Page title map ─────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/':                'Dashboard',
  '/mission-control': 'Mission Control',
  '/fleet':           'Agent Fleet',
  '/ii-agent':        'II Agent',
  '/openclaw':        'OpenClaw BFT',
  '/alerts':          'Alerts',
  '/analytics':       'Analytics',
  '/pnl':             'P&L Summary',
  '/trades':          'Trades',
  '/trade-log':       'Trade Log',
  '/market':          'Market Data',
  '/strategies':      'Strategies',
  '/activity':        'Activity Log',
  '/risk':            'Risk Config',
  '/wallet':          'Wallet',
  '/settings':        'Settings',
  '/override':        'Human Override',
}

const navItems = [
  { to: '/',                 icon: LayoutDashboard, label: 'Dashboard'       },
  { to: '/mission-control',  icon: Radio,           label: 'Mission Control' },
  { to: '/fleet',            icon: Bot,             label: 'Agent Fleet'     },
  { to: '/ii-agent',         icon: Brain,           label: 'II Agent'        },
  { to: '/openclaw',         icon: Vote,            label: 'OpenClaw BFT'    },
  { to: '/alerts',           icon: Bell,            label: 'Alerts',         badge: true },
  { to: '/analytics',        icon: BarChart2,       label: 'Analytics'       },
  { to: '/pnl',              icon: DollarSign,      label: 'P&L Summary'     },
  { to: '/trades',           icon: ArrowLeftRight,  label: 'Trades'          },
  { to: '/trade-log',        icon: BookOpen,        label: 'Trade Log'       },
  { to: '/market',           icon: Globe,           label: 'Market Data'     },
  { to: '/strategies',       icon: TrendingUp,      label: 'Strategies'      },
  { to: '/activity',         icon: Activity,        label: 'Activity Log'    },
  { to: '/risk',             icon: Shield,          label: 'Risk Config'     },
  { to: '/wallet',           icon: Wallet,          label: 'Wallet'          },
  { to: '/settings',         icon: Settings,        label: 'Settings'        },
  { to: '/override',         icon: ShieldOff,       label: 'Human Override', danger: true },
]

export default function Layout() {
  const status      = useBotStore((s) => s.status)
  const fetchStatus = useBotStore((s) => s.fetchStatus)
  const isRunning   = status?.is_running ?? false
  const { unreadCount } = useAlerts()
  const { pathname }    = useLocation()
  const pageTitle = PAGE_TITLES[pathname]
    ?? (pathname.startsWith('/strategy/') ? 'Strategy Detail' : 'Dashboard')

  // ── Global status poller — keeps data alive on every page ─────────
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 15_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  // ── Local clock + cycle tick ───────────────────────────────────────
  const [localTime, setLocalTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  )
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setLocalTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setTick(n => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [])
  const cycleInterval = (status as any)?.cycle_interval ?? status?.trade_interval ?? 60
  const secToNext = cycleInterval - (tick % cycleInterval)

  // ── Bot toggle (global — works from any page) ──────────────────────
  const [botBusy, setBotBusy] = useState(false)
  const handleToggle = useCallback(async () => {
    setBotBusy(true)
    try {
      const endpoint = isRunning ? '/bot/stop' : '/bot/start'
      const res = await api.post(endpoint)
      if (res.data.success) {
        toast.success(res.data.message)
        await fetchStatus()
      } else {
        toast.error(res.data.message || 'Failed to toggle bot')
      }
    } catch {
      toast.error('Bot toggle error — check connection')
    } finally {
      setBotBusy(false)
    }
  }, [isRunning, fetchStatus])

  // ── Orb toggle + floating chat state ─────────────────────────────
  const [orbOpen,     setOrbOpen]     = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [chatInput,   setChatInput]   = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [listening,   setListening]   = useState(false)
  const [voiceHint,   setVoiceHint]   = useState<string | null>(null)

  const chatPanelRef  = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // Auto-scroll chat panel
  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight
    }
  }, [chatHistory, chatLoading])

  // Load chat history when panel opens
  useEffect(() => {
    if (orbOpen && chatHistory.length === 0) {
      api.get('/fleet/chat/history').then(r => setChatHistory(r.data.history ?? [])).catch(() => {})
    }
  }, [orbOpen])

  const sendMessage = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatLoading(true)
    setChatHistory(prev => [...prev, { role: 'user', content: msg }])
    try {
      const data = await api.post('/fleet/chat', { message: msg }).then(r => r.data)
      setChatHistory(data.history ?? [])
    } catch {
      setChatHistory(prev => [...prev, { role: 'agent', content: 'Connection error. Please retry.' }])
    } finally {
      setChatLoading(false)
    }
  }, [chatLoading])

  const startVoice = useCallback(() => {
    if (listening) { recognitionRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) { setVoiceHint('Voice not supported in this browser'); return }

    const rec = new SR()
    rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US'
    rec.onstart  = () => { setListening(true); setVoiceHint(null) }
    rec.onend    = () => setListening(false)
    rec.onerror  = () => { setListening(false); setVoiceHint('Mic error — check permissions') }
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript
      setVoiceHint(null)
      sendMessage(t)
    }
    recognitionRef.current = rec
    rec.start()
  }, [listening, sendMessage])

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col">
        {/* Brand — upper left corner */}
        <div className="px-4 py-4 border-b border-dark-600">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Powered by</p>
          <p className="text-sm font-bold text-emerald-400 leading-tight tracking-wide drop-shadow-[0_0_8px_rgba(0,229,160,0.4)]">
            Intelligent Internet
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, badge, danger }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? danger
                      ? 'bg-red-500/15 text-red-400 font-medium border border-red-500/20'
                      : 'bg-accent-blue/15 text-accent-blue font-medium'
                    : danger
                      ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-dark-700'
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge && unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[13px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* II Agent Orb — compact so Human Override is fully visible */}
        <div className="px-4 py-2 border-t border-dark-600 flex flex-col items-center gap-1.5 relative">

          {/* ── Floating chat panel — fixed, right of sidebar ── */}
          {orbOpen && (
            <div className="fixed bottom-6 left-[232px] w-[300px] z-50
              bg-[#0d1526] border border-emerald-500/25 rounded-xl shadow-[0_0_40px_rgba(52,211,153,0.15)]
              flex flex-col overflow-hidden"
              style={{ height: 360 }}>

              {/* Panel header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
                  <span className="text-[13px] font-bold tracking-widest text-emerald-400 uppercase">II Agent</span>
                </div>
                <button onClick={() => setOrbOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Messages */}
              <div ref={chatPanelRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {chatHistory.length === 0 && !chatLoading && (
                  <p className="text-[13px] text-slate-500 italic text-center mt-4">
                    Ask II Agent anything about the fleet…
                  </p>
                )}
                {chatHistory.map((m, i) => (
                  <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx(
                      'max-w-[85%] px-2.5 py-1.5 rounded-lg text-[14px] leading-relaxed',
                      m.role === 'user'
                        ? 'bg-blue-500/20 text-blue-100 rounded-br-sm'
                        : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-slate-700/40'
                    )}>
                      {m.role === 'agent' && (
                        <div className="text-[8px] text-emerald-400 mb-0.5 font-bold tracking-wider">II AGENT</div>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/80 border border-slate-700/40 px-3 py-2 rounded-lg rounded-bl-sm flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                {voiceHint && (
                  <p className="text-[15px] text-red-400 text-center">{voiceHint}</p>
                )}
              </div>

              {/* Input row */}
              <div className="px-3 py-2 border-t border-slate-800/60 flex-shrink-0 flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(chatInput)}
                  placeholder="Ask II Agent…"
                  className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500/40 transition-colors"
                />
                {/* Mic button — voice option */}
                <button
                  onClick={startVoice}
                  title={listening ? 'Stop listening' : 'Voice input'}
                  className={clsx(
                    'px-2 py-1.5 rounded-lg border transition-all duration-200',
                    listening
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 animate-pulse'
                      : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30'
                  )}
                >
                  <Mic size={12} />
                </button>
                <button
                  onClick={() => sendMessage(chatInput)}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── The orb button (compact) ── */}
          <button
            onClick={() => setOrbOpen(o => !o)}
            title={orbOpen ? 'Close II Agent' : 'Open II Agent chat'}
            className="relative w-14 h-14 group focus:outline-none cursor-pointer"
          >
            {orbOpen && (
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping" />
            )}
            {!orbOpen && (
              <span className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping opacity-20" />
            )}
            <span className={clsx(
              'absolute inset-1 rounded-full border transition-all duration-500',
              orbOpen ? 'border-emerald-500/40' : 'border-emerald-500/15'
            )} />
            <span className={clsx(
              'absolute inset-0 rounded-full flex items-center justify-center transition-all duration-300',
              'group-hover:scale-105 group-active:scale-95',
              orbOpen && 'scale-105',
            )}>
              <span className={clsx(
                'w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-500',
                orbOpen
                  ? 'bg-gradient-to-br from-emerald-500/50 to-blue-500/30 border-emerald-400/60 shadow-[0_0_28px_rgba(52,211,153,0.55)]'
                  : 'bg-gradient-to-br from-emerald-500/25 to-blue-500/15 border-emerald-500/35 group-hover:from-emerald-500/40 group-hover:border-emerald-400/55 group-hover:shadow-[0_0_18px_rgba(52,211,153,0.3)]',
              )}>
                <div className={clsx(
                  'rounded-full transition-all duration-500',
                  orbOpen
                    ? 'w-4 h-4 bg-emerald-300 shadow-[0_0_20px_#34d399]'
                    : 'w-3.5 h-3.5 bg-emerald-400 shadow-[0_0_14px_#34d399]'
                )} />
              </span>
            </span>
            <span
              className="absolute inset-0 rounded-full border border-dashed border-emerald-500/25"
              style={{ animation: orbOpen ? 'spin 2s linear infinite' : 'spin 8s linear infinite' }}
            />
          </button>

          {/* Label */}
          <div className="text-center group/label cursor-pointer" onClick={() => setOrbOpen(o => !o)}>
            <div className="text-[11px] font-extrabold tracking-widest text-emerald-400 uppercase leading-none drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
              II Agent
            </div>
            <div className={clsx(
              'text-[10px] mt-0.5 font-mono transition-all duration-200',
              orbOpen
                ? 'text-emerald-400 animate-pulse opacity-100'
                : 'text-slate-500 opacity-0 group-hover/label:opacity-100 group-hover/label:text-emerald-400/70'
            )}>
              {listening ? '● listening…' : orbOpen ? '● active' : '▸ tap to chat'}
            </div>
          </div>
        </div>

        {/* Bottom-left — Finney mainnet · Live */}
        <div className="px-4 py-3 border-t border-dark-600">
          <div className="flex items-center gap-2">
            {/* Activity icon replaces the dot next to "Finney mainnet" */}
            <Activity size={14} className={clsx(
              'flex-shrink-0 transition-colors',
              status?.network_connected ? 'text-accent-green' : 'text-slate-500'
            )} />
            <div className="min-w-0">
              <p className="text-sm font-semibold font-mono text-accent-green leading-none">
                Finney mainnet
              </p>
              <p className={clsx(
                'text-[13px] font-mono mt-0.5',
                status?.network_connected ? 'text-accent-green' : 'text-slate-500'
              )}>
                {status?.network_connected ? '● Live' : '○ Offline'}
              </p>
            </div>
          </div>
          {status?.simulation_mode && (
            <p className="mt-1.5 text-[13px] text-yellow-400/80 font-mono">⚠ SIMULATION MODE</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Global top bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-dark-800 border-b border-dark-700/60">
          {/* Page title */}
          <h1 className="text-sm font-bold text-white font-mono flex-1 truncate">
            {pageTitle}
          </h1>

          {/* Local time */}
          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Clock size={10} className="text-slate-500" />
            <span>{localTime}</span>
          </div>

          <div className="w-px h-4 bg-dark-600" />

          {/* Next cycle */}
          {isRunning && (
            <div className="text-[11px] font-mono text-slate-400">
              Next <span className="text-accent-green font-bold">{secToNext}s</span>
            </div>
          )}

          {/* Bot status pill */}
          <div className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border font-mono',
            isRunning
              ? 'bg-accent-green/10 text-accent-green border-accent-green/25'
              : 'bg-dark-700 text-slate-400 border-dark-600'
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
              isRunning ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
            {isRunning ? 'BOT RUNNING' : 'BOT STOPPED'}
          </div>

          {/* Stop / Start Bot */}
          <button
            onClick={handleToggle}
            disabled={botBusy}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border font-mono transition-all',
              isRunning
                ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25'
                : 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25',
              botBusy && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRunning ? <Square size={10} /> : <Play size={10} />}
            {isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>

          {/* Notification Bell */}
          <NotificationBell unreadCount={unreadCount} />
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <Outlet />
        </div>
        <TickerTape />
      </main>
    </div>
  )
}