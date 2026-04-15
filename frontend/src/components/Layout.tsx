import { useState, useRef, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  Settings, Wallet, Activity, Radio, Bot, Shield, BarChart2, BookOpen, Globe, Vote, Brain, Bell, Mic, MicOff,
} from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import { useAlerts } from '@/hooks/useAlerts'
import api from '@/api/client'
import clsx from 'clsx'

const navItems = [
  { to: '/',                 icon: LayoutDashboard, label: 'Dashboard'       },
  { to: '/mission-control',  icon: Radio,           label: 'Mission Control' },
  { to: '/fleet',            icon: Bot,             label: 'Agent Fleet'     },
  { to: '/ii-agent',         icon: Brain,           label: 'II Agent'        },
  { to: '/openclaw',         icon: Vote,            label: 'OpenClaw BFT'    },
  { to: '/alerts',           icon: Bell,            label: 'Alerts',         badge: true },
  { to: '/analytics',        icon: BarChart2,       label: 'Analytics'       },
  { to: '/trades',           icon: ArrowLeftRight,  label: 'Trades'          },
  { to: '/trade-log',        icon: BookOpen,        label: 'Trade Log'       },
  { to: '/market',           icon: Globe,           label: 'Market Data'     },
  { to: '/strategies',       icon: TrendingUp,      label: 'Strategies'      },
  { to: '/activity',         icon: Activity,        label: 'Activity Log'    },
  { to: '/risk',             icon: Shield,          label: 'Risk Config'     },
  { to: '/wallet',           icon: Wallet,          label: 'Wallet'          },
  { to: '/settings',         icon: Settings,        label: 'Settings'        },
]

export default function Layout() {
  const status = useBotStore((s) => s.status)
  const isRunning = status?.is_running ?? false
  const price = status?.current_price
  const { unreadCount } = useAlerts()

  // ── Push-to-talk state ────────────────────────────────────────────
  const [listening, setListening]   = useState(false)
  const [orbPopup,  setOrbPopup]    = useState<{ text: string; kind: 'transcript' | 'response' | 'error' } | null>(null)
  const recognitionRef  = useRef<any>(null)
  const popupTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showPopup = (text: string, kind: 'transcript' | 'response' | 'error', autoDismiss = 7000) => {
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current)
    setOrbPopup({ text, kind })
    if (autoDismiss > 0) {
      popupTimerRef.current = setTimeout(() => setOrbPopup(null), autoDismiss)
    }
  }

  const handleOrbClick = useCallback(async () => {
    // Stop if already listening
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      showPopup('Voice not supported in this browser', 'error')
      return
    }

    const rec = new SR()
    rec.continuous   = false
    rec.interimResults = false
    rec.lang         = 'en-US'

    rec.onstart  = () => { setListening(true); setOrbPopup(null) }
    rec.onend    = () => setListening(false)
    rec.onerror  = () => { setListening(false); showPopup('Mic error — check permissions', 'error') }

    rec.onresult = async (e: any) => {
      const transcript = e.results[0][0].transcript
      showPopup(`"${transcript}"`, 'transcript', 0)   // hold until response arrives
      try {
        const data = await api.post('/fleet/chat', { message: transcript }).then(r => r.data)
        const last = (data.history ?? []).findLast((m: any) => m.role === 'agent')
        showPopup(last?.content ?? 'No response', 'response')
      } catch {
        showPopup('II Agent unreachable', 'error')
      }
    }

    recognitionRef.current = rec
    rec.start()
  }, [listening])

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col">
        {/* Bot status badge — top of sidebar */}
        <div className="px-4 py-3 border-b border-dark-600">
          <div className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono',
            isRunning ? 'bg-accent-green/10 text-accent-green' : 'bg-dark-700 text-slate-300'
          )}>
            <span className={clsx('w-2 h-2 rounded-full', isRunning ? 'bg-accent-green run-pulse' : 'bg-slate-600')} />
            {isRunning ? 'BOT RUNNING' : 'BOT STOPPED'}
          </div>
          {price && (
            <p className="mt-2 text-xs text-slate-300 font-mono px-1">
              TAO <span className="text-white font-semibold">${price.toFixed(2)}</span>
            </p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-accent-blue/15 text-accent-blue font-medium'
                    : 'text-slate-300 hover:text-white hover:bg-dark-700'
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge && unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* II Agent Orb — push to talk */}
        <div className="px-4 py-5 border-t border-dark-600 flex flex-col items-center gap-3">
          <div className="relative flex flex-col items-center">

            {/* Speech bubble popup */}
            {orbPopup && (
              <div className={clsx(
                'absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-44 text-[10px] leading-snug px-3 py-2 rounded-lg border shadow-xl z-50 text-center',
                orbPopup.kind === 'response' && 'bg-slate-800 border-emerald-500/30 text-slate-200',
                orbPopup.kind === 'transcript' && 'bg-slate-900 border-slate-600/50 text-slate-400 italic',
                orbPopup.kind === 'error'    && 'bg-red-950/60 border-red-500/30 text-red-300',
              )}>
                {orbPopup.text}
                {/* Tail */}
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0
                  border-l-[6px] border-r-[6px] border-t-[6px]
                  border-l-transparent border-r-transparent
                  border-t-slate-700" />
              </div>
            )}

            {/* The orb button */}
            <button
              onClick={handleOrbClick}
              title={listening ? 'Tap to stop listening' : 'Push to talk — ask II Agent'}
              className="relative w-20 h-20 group focus:outline-none"
            >
              {/* Listening pulse ring */}
              {listening && (
                <span className="absolute inset-0 rounded-full border-2 border-emerald-400/70 animate-ping" />
              )}
              {/* Idle outer ping */}
              {!listening && (
                <span className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping opacity-20" />
              )}
              {/* Inner static ring */}
              <span className="absolute inset-1 rounded-full border border-emerald-500/15" />
              {/* Core shell */}
              <span className={clsx(
                'absolute inset-0 rounded-full flex items-center justify-center transition-all duration-200',
                'group-hover:scale-105 group-active:scale-95',
                listening && 'scale-105',
              )}>
                <span className={clsx(
                  'w-14 h-14 rounded-full border flex items-center justify-center transition-all duration-300',
                  listening
                    ? 'bg-gradient-to-br from-emerald-500/55 to-blue-500/35 border-emerald-400/70 shadow-[0_0_28px_rgba(52,211,153,0.4)]'
                    : 'bg-gradient-to-br from-emerald-500/25 to-blue-500/15 border-emerald-500/35 group-hover:from-emerald-500/40 group-hover:border-emerald-400/55',
                )}>
                  {/* Core dot or mic icon */}
                  {listening
                    ? <Mic size={18} className="text-emerald-300 animate-pulse" />
                    : <div className="w-5 h-5 rounded-full bg-emerald-400 shadow-[0_0_20px_#34d399] group-hover:shadow-[0_0_28px_#34d399] transition-all duration-200" />
                  }
                </span>
              </span>
              {/* Orbit ring */}
              <span
                className="absolute inset-0 rounded-full border border-dashed border-emerald-500/25"
                style={{ animation: listening ? 'spin 2.5s linear infinite' : 'spin 8s linear infinite' }}
              />
            </button>
          </div>

          {/* Label */}
          <div className="text-center">
            <div className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase leading-none">II Agent</div>
            <div className={clsx(
              'text-[8px] mt-0.5 font-mono transition-colors duration-200',
              listening ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
            )}>
              {listening ? '● listening…' : 'push to talk'}
            </div>
          </div>
        </div>

        {/* Network indicator */}
        <div className="px-4 py-3 border-t border-dark-600">
          <div className="flex items-center gap-2">
            <Activity size={12} className={status?.network_connected ? 'text-accent-green' : 'text-slate-300'} />
            <span className="text-xs text-slate-300 font-mono">
              {status?.network_connected ? status.network : 'disconnected'}
            </span>
          </div>
          {status?.simulation_mode && (
            <p className="mt-1 text-[10px] text-yellow-400/80 font-mono">⚠ SIMULATION MODE</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}