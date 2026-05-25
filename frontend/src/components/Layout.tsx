import { useState, useRef, useCallback, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  Wallet, Activity, Bot, Shield, BarChart2, BookOpen, Globe, Vote, Brain, Bell,
  Mic, Send, ChevronDown, ChevronRight, DollarSign, ShieldOff, Clock, Play, Square, RefreshCw,
  Landmark,
  ChevronsDownUp, ChevronsUpDown, Bookmark, Undo2,   // Session XXX: sidebar Expand/Collapse + Save-as-Default
  Sparkles,                                         // Session XXXII: Research / Quality Framework
  Calculator,                                       // Session XXXIII: Operator Tools (Whales + Calc)
  Heart,                                            // Session XXXIV: System Health page
  ScrollText,                                       // Session XXXIV: Audit Trail page
  Trash2,                                           // Session XXXV: Reset chat history button
} from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import { useAlerts } from '@/hooks/useAlerts'
import api from '@/api/client'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import NotificationBell from '@/components/NotificationBell'
import TickerTape from '@/components/TickerTape'

// ── Page title map ─────────────────────────────────────────────────────────────
// Session XXVI: Trades → Manual Trades, Analytics → Network Analytics, Settings removed.
const PAGE_TITLES: Record<string, string> = {
  '/':                     'Dashboard',
  '/ii-agent':             'II Agent',
  '/openclaw':             'OpenClaw BFT',
  '/fleet':                'Agent Fleet',
  '/alerts':               'Alerts Log',
  '/trades':               'Manual Trades',
  '/trade-log':            'Trade Log',
  '/analytics':            'Subnet Analytics',
  '/pnl':                  'P&L Summary',
  '/market':               'Subnet Market Data',
  '/strategies':           'Strategies',
  '/activity':             'Activity Log',
  '/risk':                 'Risk Config',
  '/wallet':               'Wallet',
  '/wallet-transactions':  'Transactions',
  '/override':             'Manual Override',
  '/research':             'Subnet Scorecard',
  // '/tools' route deleted in Session XXXV — Whale Tracker briefly lived as a
  // Dashboard tile, then retired in XXXIX (Day 6) when Whale Flow superseded
  // it. /calculator (TAO Calculator) still served by Tools component with
  // mode='calc'.
  '/calculator':           'TAO Calculator',
  '/system-health':        'System Health',
  '/audit':                'Audit Trail',
}

// ── Sidebar structure ──────────────────────────────────────────────────────
// Session XXVI: Collapsible groups (all collapsed by default on first load),
// state persisted in localStorage. New grouping:
//   OVERVIEW / INTELLIGENCE / EXECUTION / PERFORMANCE / SUBNETS / ACTIVITIES
//   / ADMIN / ACTION. Settings removed entirely. OpenClaw moved to EXECUTION.
type NavItem = { to: string; icon: any; label: string; badge?: boolean; danger?: boolean }
type NavGroup = { heading: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    heading: 'OVERVIEW',
    items: [
      { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    heading: 'INTELLIGENCE',
    items: [
      { to: '/ii-agent',  icon: Brain, label: 'II Agent' },
    ],
  },
  {
    heading: 'EXECUTION',
    items: [
      { to: '/openclaw',   icon: Vote,       label: 'OpenClaw BFT' },
      { to: '/fleet',      icon: Bot,        label: 'Agent Fleet'  },
      { to: '/strategies', icon: TrendingUp, label: 'Strategies'   },
    ],
  },
  {
    heading: 'PERFORMANCE',
    items: [
      { to: '/pnl',       icon: DollarSign,  label: 'P&L Summary' },
    ],
  },
  // Session XXXV: ACTIVITIES moved up — sits between PERFORMANCE and SUBNETS
  // per Mav. Logical grouping: performance metrics → activity/alert feeds →
  // deeper dive into subnets.
  {
    heading: 'ACTIVITIES',
    items: [
      { to: '/alerts',    icon: Bell,     label: 'Alerts Log',   badge: true },
      { to: '/activity',  icon: Activity, label: 'Activity Log' },
      { to: '/trade-log', icon: BookOpen, label: 'Trade Log'    },
    ],
  },
  {
    heading: 'SUBNETS',
    items: [
      { to: '/analytics', icon: BarChart2, label: 'Subnet Analytics' },
      { to: '/market',    icon: Globe,     label: 'Subnet Market Data' },
      // Session XXXII: Const 6-Filter scorecard + Owner Watch + Conviction-Era heuristics
      { to: '/research',  icon: Sparkles,  label: 'Subnet Scorecard' },
      // Session XXXV: Whale Tracker page deleted — moved to a Dashboard tile.
      // Session XXXIX (Day 6): Tile retired. Whale Flow (live Finney RPC) is
      // the canonical whale surface now. Calculator stays under ADMIN.
    ],
  },
  {
    heading: 'ADMIN',
    items: [
      { to: '/risk',                icon: Shield,     label: 'Risk Config'   },
      { to: '/wallet',              icon: Wallet,     label: 'Wallet'        },
      { to: '/wallet-transactions', icon: Landmark,   label: 'Transactions'  },
      // Session XXXIV: Calculator moved here (Whale Tracker stays in SUBNETS).
      { to: '/calculator',          icon: Calculator, label: 'TAO Calculator'},
      { to: '/system-health',       icon: Heart,      label: 'System Health' },
      { to: '/audit',               icon: ScrollText, label: 'Audit Trail'   },
    ],
  },
  {
    heading: 'ACTION',
    items: [
      { to: '/trades',    icon: ArrowLeftRight, label: 'Manual Trades'                 },
      { to: '/override',  icon: ShieldOff,      label: 'Manual Override', danger: true  },
    ],
  },
]

// ── Sidebar persistence keys ──────────────────────────────────────────────
// Session XXVI: ephemeral key — auto-saved on every toggle (current state).
// Session XXX:  user-default key — only set when Operator clicks "Save as
//               Default", and used by "Reset to My Default" to restore.
const SIDEBAR_GROUPS_KEY  = 'taobot:sidebar:expanded-groups:v1'
const SIDEBAR_DEFAULT_KEY = 'taobot:sidebar:user-default:v1'

function loadExpandedGroups(pathname: string): Set<string> {
  // Always expand the group containing the current route, no matter what's stored.
  // Everything else: read from localStorage, default to empty (all collapsed).
  const active = navGroups.find(g => g.items.some(i => i.to === pathname))?.heading
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_KEY)
    const set = new Set<string>(raw ? JSON.parse(raw) : [])
    if (active) set.add(active)
    return set
  } catch {
    return new Set<string>(active ? [active] : [])
  }
}

function loadUserDefault(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_DEFAULT_KEY)
    return raw ? new Set<string>(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export default function Layout() {
  const status       = useBotStore((s) => s.status)
  const fetchStatus  = useBotStore((s) => s.fetchStatus)
  const fleetStats   = useBotStore((s) => s.fleetStats)
  const alertStats      = useBotStore((s) => s.alertStats)
  const analyticsStats  = useBotStore((s) => s.analyticsStats)
  const tradesPageStats = useBotStore((s) => s.tradesPageStats)
  const tradeLogStats   = useBotStore((s) => s.tradeLogStats)
  const marketPageStats = useBotStore((s) => s.marketPageStats)
  const strategiesStats = useBotStore((s) => s.strategiesStats)
  const activityStats   = useBotStore((s) => s.activityPageStats)
  const walletPageStats = useBotStore((s) => s.walletPageStats)
  const iiAgentStats    = useBotStore((s) => s.iiAgentStats)
  const isRunning   = status?.is_running ?? false
  const { unreadCount, criticalUnreadCount, ackAllCriticals } = useAlerts()
  const { pathname }    = useLocation()
  const pageTitle = PAGE_TITLES[pathname]
    ?? (pathname.startsWith('/strategy/') ? 'Strategy Detail' : 'Dashboard')

  // ── Session XXVI: collapsible sidebar groups ─────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => loadExpandedGroups(pathname))
  // Re-expand the active route's group when pathname changes (without collapsing others)
  useEffect(() => {
    const active = navGroups.find(g => g.items.some(i => i.to === pathname))?.heading
    if (!active) return
    setExpandedGroups(prev => {
      if (prev.has(active)) return prev
      const next = new Set(prev); next.add(active); return next
    })
  }, [pathname])
  const toggleGroup = useCallback((heading: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(heading)) next.delete(heading); else next.add(heading)
      try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  // ── Session XXX: Sidebar toolbar — Expand All / Collapse All / Save as Default
  // The active route's group is always re-expanded after Collapse All so the
  // user never loses navigation context to where they currently stand.
  const [savedDefault, setSavedDefault] = useState<Set<string> | null>(() => loadUserDefault())

  const handleExpandAll = useCallback(() => {
    const next = new Set<string>(navGroups.map(g => g.heading))
    setExpandedGroups(next)
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...next])) } catch {}
  }, [])

  const handleCollapseAll = useCallback(() => {
    const active = navGroups.find(g => g.items.some(i => i.to === pathname))?.heading
    const next = new Set<string>(active ? [active] : [])
    setExpandedGroups(next)
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...next])) } catch {}
  }, [pathname])

  const handleSaveAsDefault = useCallback(() => {
    try {
      const arr = [...expandedGroups]
      localStorage.setItem(SIDEBAR_DEFAULT_KEY, JSON.stringify(arr))
      setSavedDefault(new Set(arr))
      toast.success(arr.length === 0 ? 'Default saved: all collapsed' : `Default saved: ${arr.length} group${arr.length===1?'':'s'} expanded`)
    } catch {
      toast.error('Could not save default')
    }
  }, [expandedGroups])

  const handleResetToDefault = useCallback(() => {
    if (!savedDefault) {
      toast('No saved default yet — click the bookmark to save current layout', { icon: '💡' })
      return
    }
    // Always include active route's group so user keeps navigation context
    const active = navGroups.find(g => g.items.some(i => i.to === pathname))?.heading
    const next = new Set(savedDefault)
    if (active) next.add(active)
    setExpandedGroups(next)
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...next])) } catch {}
    toast.success('Restored to your saved default')
  }, [savedDefault, pathname])

  // ── Global status poller — keeps data alive on every page ─────────
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 15_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  // ── Local clock + cycle tick ───────────────────────────────────────
  // Session XXX: added Date alongside Time per Partner spec — universal
  // header treatment so every page shows "May 14 · 02:48:38 PM" upper-right.
  const ET_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/New_York' }
  const ET_DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'America/New_York' }
  const [localTime, setLocalTime] = useState(() => new Date().toLocaleTimeString('en-US', ET_OPTS))
  const [localDate, setLocalDate] = useState(() => new Date().toLocaleDateString('en-US', ET_DATE_OPTS))
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date()
      setLocalTime(now.toLocaleTimeString('en-US', ET_OPTS))
      setLocalDate(now.toLocaleDateString('en-US', ET_DATE_OPTS))
      setTick(n => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [])
  const cycleInterval = (status as any)?.cycle_interval ?? status?.trade_interval ?? 60
  const secToNext = cycleInterval - (tick % cycleInterval)

  // ── Bot toggle (global — works from any page) ──────────────────────
  // Session XXX: confirm copy is context-aware. Stopping a running bot
  // gets a real warning (it pauses signal generation). Starting a stopped
  // bot is innocuous in paper mode and gets a lighter prompt. The same
  // principle Partner asked for on the Force Paper Mode button.
  const [botBusy, setBotBusy] = useState(false)
  const isPaperMode = (status as any)?.force_paper_mode ?? true   // default-safe
  const handleToggle = useCallback(async () => {
    if (isRunning) {
      const ctx = isPaperMode
        ? 'Currently in PAPER mode — no real on-chain trades will be missed, only paper-stat accumulation pauses.'
        : '⚠ Currently in LIVE mode — stopping the bot will halt all signal generation including real on-chain execution.'
      if (!window.confirm(`STOP BOT?\n\n${ctx}\n\nResumable any time. Click OK to stop.`)) return
    } else {
      // Starting is reversible and low-risk; only confirm if leaving paper safety
      if (!isPaperMode) {
        if (!window.confirm('START BOT — LIVE MODE\n\nForce-paper flag is OFF. Once running, the cycle engine will fire signals and any LIVE strategy will execute real on-chain trades.\n\nConfirm start?')) return
      }
      // Paper-mode start: no confirm needed, frictionless
    }
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
  }, [isRunning, isPaperMode, fetchStatus])

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

  // Session XXXV: clear chat history. Mav: 'no way to delete/clear chat
  // messages — give it a Reset Option.' DELETE /api/fleet/chat/history wipes
  // the in-memory ring buffer and we mirror locally so the panel updates
  // immediately. Confirm prompt prevents an accidental nuke.
  const clearChatHistory = useCallback(async () => {
    if (chatHistory.length === 0) return
    if (!window.confirm('Reset chat with II Agent?\n\nClears all past conversation. This cannot be undone.')) return
    try {
      await api.delete('/fleet/chat/history')
      setChatHistory([])
      toast.success('Chat reset')
    } catch {
      toast.error('Reset failed — check connection')
    }
  }, [chatHistory.length])

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
      {/* Day 12 (Session XLII): sidebar widened 56→64 (224→256px) and font
          sizes bumped per Mark's spec — group headings 10→12px, nav items
          14→15px, icons 16→17. The width bump is a hard prerequisite of
          the larger nav-item font; otherwise long labels like "Wallet
          Transactions" wrap onto a second line. */}
      <aside className="w-64 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col">
        {/* Brand — upper left corner */}
        <div className="px-4 py-4 border-b border-dark-600">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Powered by</p>
          <p className="text-sm font-bold text-emerald-400 leading-tight tracking-wide drop-shadow-[0_0_8px_rgba(0,229,160,0.4)]">
            Intelligent Internet
          </p>
        </div>

        {/* Nav — collapsible groups (Session XXVI)
            - All groups collapsed on first load (localStorage: empty set).
            - Current route's group is auto-expanded on navigation.
            - Click group heading to toggle.
            - Preference persists across sessions.

            Session XXX: Operator toolbar — Expand All / Collapse All / Save
            current layout as personal default / Reset to saved default.
            Pure client-side via localStorage. Active route's group is always
            preserved through Collapse-All / Reset so context is never lost. */}
        <div className="px-3 pt-3 pb-1 flex items-center gap-1 border-b border-dark-700/50">
          <button
            onClick={handleExpandAll}
            title="Expand all groups"
            aria-label="Expand all groups"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-emerald-300 hover:bg-dark-700/60 transition-colors"
          >
            <ChevronsUpDown size={11} />
            Expand
          </button>
          <button
            onClick={handleCollapseAll}
            title="Collapse all groups (active route stays open)"
            aria-label="Collapse all groups"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-amber-300 hover:bg-dark-700/60 transition-colors"
          >
            <ChevronsDownUp size={11} />
            Collapse
          </button>
          <button
            onClick={handleSaveAsDefault}
            title="Use current appearance as my new default"
            aria-label="Save current layout as default"
            className="flex items-center justify-center px-2 py-1.5 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-dark-700/60 transition-colors"
          >
            <Bookmark size={12} />
          </button>
          <button
            onClick={handleResetToDefault}
            title={savedDefault ? 'Reset to my saved default' : 'No saved default yet'}
            aria-label="Reset to saved default"
            disabled={!savedDefault}
            className={clsx(
              'flex items-center justify-center px-2 py-1.5 rounded-md transition-colors',
              savedDefault
                ? 'text-slate-400 hover:text-indigo-300 hover:bg-dark-700/60'
                : 'text-slate-700 cursor-not-allowed'
            )}
          >
            <Undo2 size={11} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {navGroups.map((group, gi) => {
            const isExpanded = expandedGroups.has(group.heading)
            // Does any item in this group have unread-alert badge activity?
            const groupHasBadge = group.items.some(i => i.badge) && criticalUnreadCount > 0
            return (
              <div key={group.heading} className={gi === 0 ? '' : 'mt-2'}>
                <button
                  onClick={() => toggleGroup(group.heading)}
                  className="w-full flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-dark-700/40 transition-colors group"
                  aria-expanded={isExpanded}
                >
                  {isExpanded
                    ? <ChevronDown  size={11} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                    : <ChevronRight size={11} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                  }
                  <span className="text-[12px] font-semibold tracking-[0.16em] text-slate-500 group-hover:text-slate-300 uppercase flex-1 text-left">
                    {group.heading}
                  </span>
                  {/* collapsed-group badge hint — show a dot when something in the hidden group needs attention */}
                  {!isExpanded && groupHasBadge && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
                {isExpanded && (
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map(({ to, icon: Icon, label, badge, danger }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] transition-colors',
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
                        <Icon size={17} />
                        <span className="flex-1">{label}</span>
                        {badge && criticalUnreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[13px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                            {criticalUnreadCount > 99 ? '99+' : criticalUnreadCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* ── II Agent Orb — Session XXXV: HAL-eye edition ──────────────────
            Mav's Phase 9 spec: revert to HAL-red (homage to 2001: A Space
            Odyssey + Hal Finney mainnet), make significantly larger and
            more prominent ('barely noticeable as is'), slower mystic
            breathing pulse, brighter glow when pressed, invitational /
            luring presence. Outer container padding bumped so the orb
            commands the bottom-left of the sidebar without crowding the
            Finney Mainnet footer. */}
        <div className="px-3 py-3 border-t border-dark-600 flex flex-col items-center gap-2 relative">

          {/* ── Floating chat panel — HAL-red theme ── */}
          {orbOpen && (
            <div className="fixed bottom-6 left-[264px] w-[460px] z-50
              bg-[#0d1526] border border-red-500/30 rounded-xl shadow-[0_0_50px_rgba(220,38,38,0.20)]
              flex flex-col overflow-hidden"
              style={{ height: 540 }}>

              {/* Panel header — HAL-red accent + reset button.
                  Session XXXVI v9: the previous tiny red pulse dot is
                  replaced with a MINI HAL EYE — visually identical
                  anatomy to the main orb (black housing → red iris →
                  amber pupil → white incandescent pinpoint), just
                  scaled to ~16px to fit the header line. Per Mav: "copy
                  the Eye, exactly as it is, (don't remove it) and place
                  it in the same place as the red indicator dot." Same
                  breathing rhythm (animate-hal-breathe) so the chat
                  panel header feels like a window on the same living
                  presence as the orb in the bottom-left corner. */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 flex-shrink-0"
                   style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.10) 0%, rgba(127,29,29,0.05) 60%, transparent 100%)' }}>
                <div className="flex items-center gap-2">
                  {/* Mini HAL eye — header indicator. Scaled-down clone of
                      the main orb's core anatomy: breathing red→black
                      gradient sphere with an amber pupil + white pinpoint
                      filament. Decorative outer rotating ring + static
                      ring are omitted at this size because they read as
                      noise rather than detail at 16px. */}
                  <span className="relative w-4 h-4 flex-shrink-0" aria-hidden>
                    {/* Soft outer halo so the eye feels like a presence,
                        not a sticker. Scaled down version of the main
                        orb's room-glow halo. */}
                    <span
                      className="absolute -inset-0.5 rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, rgba(251,191,36,0.10) 0%, rgba(220,38,38,0.18) 30%, rgba(220,38,38,0.06) 60%, transparent 80%)',
                        filter: 'blur(2.5px)',
                      }}
                    />
                    {/* The eye sphere — same gradient + inset vignette
                        as the main orb, ratio-preserved at 16px scale. */}
                    <span
                      className="absolute inset-0 rounded-full flex items-center justify-center animate-hal-breathe"
                      style={{
                        background: 'radial-gradient(circle at 50% 50%, #fde68a 0%, #fbbf24 2%, #f59e0b 6%, #ea580c 11%, #b91c1c 20%, #7f1d1d 33%, #450a0a 45%, #1a0303 55%, #000000 63%, #000000 100%)',
                        boxShadow: 'inset 0 0 6px 2px rgba(0,0,0,1), inset 0 0 1.5px 0.4px rgba(251,191,36,0.25)',
                      }}
                    >
                      {/* Amber pupil — w-1 (4px) at this size, matches
                          the ~16% pupil ratio of the main orb's idle
                          state. Burnt amber-500 + soft halo. */}
                      <span className="rounded-full bg-amber-500 w-1 h-1 flex items-center justify-center shadow-[0_0_3px_0.7px_rgba(245,158,11,0.6),0_0_5px_1.5px_rgba(180,83,9,0.32)]">
                        {/* White pinpoint — barely-noticeable filament
                            at the very heart. w-px (1px) at this scale. */}
                        <span className="rounded-full bg-white w-px h-px shadow-[0_0_2px_0.4px_rgba(255,251,235,0.88),0_0_3.5px_0.8px_rgba(254,243,199,0.55)]" />
                      </span>
                    </span>
                  </span>
                  <span className="text-[13px] font-bold tracking-widest text-red-400 uppercase">II Agent</span>
                  <span className="text-[10px] font-mono text-slate-500 ml-1">orchestrator</span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Reset chat button */}
                  <button
                    onClick={clearChatHistory}
                    title="Reset chat history"
                    aria-label="Reset chat history"
                    disabled={chatHistory.length === 0}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                  {/* Close panel */}
                  <button
                    onClick={() => setOrbOpen(false)}
                    title="Close panel"
                    aria-label="Close chat panel"
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
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
                        <div className="text-[8px] text-red-400 mb-0.5 font-bold tracking-wider">II AGENT</div>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/80 border border-slate-700/40 px-3 py-2 rounded-lg rounded-bl-sm flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
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
                  className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-100 placeholder-slate-500 outline-none focus:border-red-500/40 transition-colors"
                />
                {/* Mic button — voice option */}
                <button
                  onClick={startVoice}
                  title={listening ? 'Stop listening' : 'Voice input'}
                  className={clsx(
                    'px-2 py-1.5 rounded-lg border transition-all duration-200',
                    listening
                      ? 'bg-red-500/20 border-red-400/50 text-red-300 animate-pulse'
                      : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-red-400 hover:border-red-500/30'
                  )}
                >
                  <Mic size={12} />
                </button>
                <button
                  onClick={() => sendMessage(chatInput)}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── The HAL Orb — bigger, brighter, slower mystic breath ──
              Container is w-20/h-20 (80×80) — substantially up from the
              previous 56×56. The inner red eye is 48×48. Animations:
                - idle:    `animate-hal-breathe`  (4.2s slow heartbeat glow)
                - active:  `animate-hal-active`   (2.4s brighter pulse, the
                           orb feels "engaged" when the chat panel is open)
                - hover:   subtle scale-up + halo intensifies
              Dashed outer ring rotates slowly (5.5s) — adds the omniscient
              "watching" character Mav asked for.
          */}
          <button
            onClick={() => setOrbOpen(o => !o)}
            title={orbOpen ? 'Close II Agent' : 'Talk to II Agent'}
            aria-label={orbOpen ? 'Close II Agent chat' : 'Open II Agent chat'}
            className="relative w-20 h-20 group focus:outline-none cursor-pointer transition-transform duration-300 hover:scale-[1.04] active:scale-[0.97]"
          >
            {/* Outer rotating ring — slow, dashed; speeds up subtly when active */}
            <span
              className={clsx(
                'absolute inset-0 rounded-full border border-dashed border-red-500/25',
                orbOpen ? 'animate-hal-active' : 'animate-hal-ring'
              )}
              style={orbOpen ? { animation: 'halRing 3s linear infinite' } : undefined}
            />

            {/* Static inner ring */}
            <span className={clsx(
              'absolute inset-1.5 rounded-full border transition-all duration-700',
              orbOpen ? 'border-red-400/55' : 'border-red-500/25 group-hover:border-red-400/45'
            )} />

            {/* The HAL eye itself — Session XXXVI v2: anatomically-banded.
                Mav's refined spec: read centre→edge as
                  • white pinpoint (tiny incandescent core)
                  • amber pupil (the warm focal ring)
                  • red iris (the main body)
                  • near-black housing (the lens shell)
                Previous v1 had amber dominating the outside, which inverted
                the anatomy. v2 compresses the amber to a tight pupil-band
                (4-18% of the radius), expands the red iris to do most of
                the visible work (22-58%), and pushes the dark housing all
                the way out to the rim (60-100% blends red-950 → pure black).
                The white pinpoint is rendered as a separate inner span so
                it stays sharp and crystalline rather than blurring into
                the amber band. ──────────────────────────────────────────── */}
            <span className="absolute inset-0 flex items-center justify-center">
              <span
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-700',
                  orbOpen ? 'animate-hal-active' : 'animate-hal-breathe',
                )}
                style={{
                  background: orbOpen
                    // Active — gradient origin centred (50% 50%) to match the
                    // white pinpoint span; amber pupil zone tightened so the
                    // bright area is a small, contained focal point not a sprawl
                    ? 'radial-gradient(circle at 50% 50%, #fef3c7 0%, #fcd34d 2%, #f59e0b 6%, #ea580c 10%, #dc2626 18%, #991b1b 32%, #450a0a 44%, #1a0303 54%, #000000 62%, #000000 100%)'
                    // Idle — same centred origin, even tighter amber band
                    : 'radial-gradient(circle at 50% 50%, #fde68a 0%, #fbbf24 2%, #f59e0b 6%, #ea580c 11%, #b91c1c 20%, #7f1d1d 33%, #450a0a 45%, #1a0303 55%, #000000 63%, #000000 100%)',
                  boxShadow: orbOpen
                    // Heavy inset vignette — about a third of the sphere is solid black housing
                    ? 'inset 0 0 28px 9px rgba(0,0,0,0.95), inset 0 0 6px 2px rgba(252,211,77,0.4)'
                    : 'inset 0 0 26px 10px rgba(0,0,0,1), inset 0 0 5px 1px rgba(251,191,36,0.25)',
                }}
              >
                {/* Pupil — Session XXXVI v6: the inner span flips from
                    white to AMBER per Mav. The previous build read as a
                    white pupil with an amber halo around it; Mav's spec
                    inverts that — the visible focal dot should BE the
                    amber pupil, with only a barely-noticeable white
                    pinpoint nested in its centre as the incandescent
                    filament. So now we render two stacked spans:
                      outer:  amber-400/300 disc — the pupil itself
                      inner:  tiny white pinpoint — the hot filament
                                                    that you can JUST
                                                    catch at the centre */}
                {/* Pupil — Session XXXVI v8: amber faded a touch per Mav.
                    Was amber-400/300 (#fbbf24/#fcd34d — bright yellow-amber);
                    now amber-500/400 (#f59e0b/#fbbf24 — burnt orange-amber).
                    Halo intensities pulled in too. The pupil now sits as a
                    warm focal point rather than a glowing yellow disc, so
                    the surrounding red iris breathes more. */}
                <span className={clsx(
                  'rounded-full transition-all duration-700 flex items-center justify-center',
                  orbOpen
                    // Active — amber-400 pupil, softer amber halo
                    ? 'w-2.5 h-2.5 bg-amber-400 shadow-[0_0_10px_2.5px_rgba(251,191,36,0.7),0_0_18px_5px_rgba(217,119,6,0.4)]'
                    // Idle — burnt amber-500 pupil, faded halo
                    : 'w-2 h-2 bg-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.6),0_0_14px_4px_rgba(180,83,9,0.32)]'
                )}>
                  {/* Touch of white — Session XXXVI v8: bumped one more
                      notch (was w-0.5 / w-1, now w-1 / w-1.5). With the
                      amber faded slightly, the white needs a touch more
                      presence to keep its role as the focal incandescence.
                      Still half the diameter of the amber pupil so it
                      reads as nested-inside, not competing-with. */}
                  <span className={clsx(
                    'rounded-full bg-white transition-all duration-700',
                    orbOpen
                      // Active: 6px white speck — clear filament glow
                      ? 'w-1.5 h-1.5 shadow-[0_0_7px_1.5px_rgba(255,255,255,0.95),0_0_12px_3px_rgba(254,243,199,0.65)]'
                      // Idle: 4px speck — visible incandescence at rest
                      : 'w-1 h-1 shadow-[0_0_6px_1.25px_rgba(255,251,235,0.88),0_0_10px_2.5px_rgba(254,243,199,0.55)]'
                  )} />
                </span>
              </span>
            </span>

            {/* Outer glow halo — Session XXXVI v2: red-dominant (was: amber
                inner / red outer). Now the eye itself owns the amber, and
                the room-glow is mostly red — like the eye's red body is
                spilling into the surrounding space. Subtle amber kiss
                lingers at the very inner edge of the halo so the warmth
                still reads. ────────────────────────────────────────────── */}
            <span
              aria-hidden
              className={clsx(
                'absolute -inset-2 rounded-full pointer-events-none transition-opacity duration-700',
                orbOpen ? 'opacity-100' : 'opacity-65 group-hover:opacity-95',
              )}
              style={{
                background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, rgba(220,38,38,0.22) 25%, rgba(220,38,38,0.10) 55%, rgba(220,38,38,0.03) 75%, transparent 85%)',
                filter: 'blur(10px)',
              }}
            />
          </button>

          {/* Label — HAL-red identity, more confident */}
          <div className="text-center group/label cursor-pointer" onClick={() => setOrbOpen(o => !o)}>
            <div className="text-[12px] font-extrabold tracking-[0.18em] text-red-400 uppercase leading-none drop-shadow-[0_0_8px_rgba(248,113,113,0.55)]">
              II Agent
            </div>
            <div className={clsx(
              'text-[10px] mt-1 font-mono transition-all duration-200 leading-none',
              orbOpen
                ? 'text-red-400 opacity-100'
                : 'text-slate-500 opacity-0 group-hover/label:opacity-100 group-hover/label:text-red-400/70'
            )}>
              {listening ? '● listening…' : orbOpen ? '● online' : '▸ tap to chat'}
            </div>
          </div>
        </div>

        {/* Bottom-left — Finney Mainnet */}
        <div className="px-4 py-3 border-t border-dark-600">
          <div className="flex items-center gap-2">
            {/* Activity icon replaces the dot next to "Finney mainnet" */}
            <Activity size={14} className={clsx(
              'flex-shrink-0 transition-colors',
              status?.network_connected ? 'text-accent-green' : 'text-slate-500'
            )} />
            <div className="min-w-0">
              <p className="text-sm font-semibold font-mono text-accent-green leading-none">
                Finney Mainnet
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
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-dark-800 border-b border-dark-700/60">

          {/* Left anchor — page-aware context label */}
          {pathname === '/openclaw' ? (
            /* OpenClaw page: show BFT identity instead of network status */
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow shadow-indigo-500/20">
                <Vote size={12} className="text-white" />
              </div>
              <span className="text-sm font-bold font-mono text-white leading-none tracking-tight">
                OpenClaw BFT Consensus
              </span>
              <span className="text-slate-600 select-none">·</span>
              <span className="text-xs font-mono text-slate-400 leading-none">
                BFT Multi-Agent Voting Council · 7/12 supermajority
              </span>
            </div>
          ) : (
            /* All other pages: page title · [mission stats] · Live / Paper Trading */
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={clsx(
                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                status?.network_connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              )} />
              <span className="text-sm font-bold font-mono text-white leading-none tracking-wide">
                {pageTitle}
              </span>
              {/* Agent Fleet inline stats */}
              {pathname === '/fleet' && fleetStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {fleetStats.agents} agents · {fleetStats.live} LIVE · {fleetStats.approved} Approved · {fleetStats.paper} Paper
                  </span>
                </>
              )}
              {/* Trades inline stats */}
              {pathname === '/trades' && tradesPageStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {tradesPageStats.total.toLocaleString()} trades · {tradesPageStats.mode} · {tradesPageStats.winRate} win rate
                  </span>
                </>
              )}
              {/* Trade Log inline stats */}
              {pathname === '/trade-log' && tradeLogStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {tradeLogStats.total.toLocaleString()} trades · p{tradeLogStats.page}/{tradeLogStats.pages}
                    {tradeLogStats.realCount !== null && (
                      <span className="text-emerald-400 ml-1">· ⛓ {tradeLogStats.realCount} real</span>
                    )}
                  </span>
                </>
              )}
              {/* Market Data inline stats */}
              {pathname === '/market' && marketPageStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {marketPageStats.subnets} subnets
                    <span className="text-emerald-400 ml-1">↑{marketPageStats.upCount}</span>
                    <span className="text-red-400 ml-1">↓{marketPageStats.downCount}</span>
                  </span>
                </>
              )}
              {/* Strategies inline stats */}
              {pathname === '/strategies' && strategiesStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {strategiesStats.total} strategies · {strategiesStats.live} live · {strategiesStats.approved} approved · {strategiesStats.paper} paper
                  </span>
                </>
              )}
              {/* Activity Log inline stats */}
              {pathname === '/activity' && activityStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {activityStats.filtered} / {activityStats.total} events
                  </span>
                </>
              )}
              {/* Wallet inline stats */}
              {pathname === '/wallet' && walletPageStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    Coldkey management{walletPageStats.isConnected && walletPageStats.block ? ` · Block #${walletPageStats.block.toLocaleString()}` : ''}
                  </span>
                </>
              )}
              {/* Settings page deleted (Session XXVI) — subtitle no longer rendered */}
              {/* Risk Config subtitle */}
              {pathname === '/risk' && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">Pre-trade guardrails · position limits</span>
                </>
              )}
              {/* Manual Override subtitle */}
              {pathname === '/override' && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">Full command authority · manual trades · emergency stop</span>
                </>
              )}
              {/* II Agent inline subtitle — Session XXXV: indigo → emerald with
                  small red HAL-eye dot, matching the section colour swap. */}
              {pathname === '/ii-agent' && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="HAL-eye indicator — homage to the original orb concept and Hal Finney" />
                    <span className="text-xs font-mono text-emerald-400/80 leading-none">Master Orchestrator · Regime · Fleet · Consensus</span>
                  </span>
                </>
              )}
              {/* Analytics inline stats */}
              {pathname === '/analytics' && analyticsStats && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">
                    {analyticsStats.totalTrades.toLocaleString()} trades · {analyticsStats.activeStrategies} strategies
                  </span>
                </>
              )}
              {/* P&L Summary inline subtitle */}
              {pathname === '/pnl' && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-slate-400 leading-none">Fleet performance</span>
                </>
              )}
              {/* Alerts inline unread count */}
              {pathname === '/alerts' && alertStats && alertStats.unread > 0 && (
                <>
                  <span className="text-slate-600 select-none">·</span>
                  <span className="text-xs font-mono text-red-400 leading-none">
                    {alertStats.unread} unread
                  </span>
                  {alertStats.priority > 0 && (
                    <span className="text-xs font-mono text-amber-400 leading-none">
                      · {alertStats.priority} priority
                    </span>
                  )}
                </>
              )}
              <span className="text-slate-600 select-none">·</span>
              {/* Trading mode — ground-truth: paper if any of
                  (a) force_paper_mode flag, (b) simulation_mode flag,
                  (c) zero live strategies in the fleet. */}
              {(() => {
                const liveCount = fleetStats?.live ?? strategiesStats?.live ?? 0
                const isPaper = !!status?.simulation_mode
                  || !!(status as any)?.force_paper_mode
                  || liveCount === 0
                return isPaper ? (
                  <span className="px-2.5 py-1 rounded-md bg-yellow-500/15 border border-yellow-500/40 text-sm font-bold font-mono text-yellow-400 leading-none tracking-wide">
                    ⚠ Paper Trading
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-sm font-bold font-mono text-emerald-400 leading-none tracking-wide">
                    ● Live Trading
                  </span>
                )
              })()}
            </div>
          )}

          {/* Push everything else to the right */}
          <div className="flex-1" />

          {/* II Agent — Run Analysis button (Session XXXV: emerald section colour) */}
          {pathname === '/ii-agent' && iiAgentStats && (
            <button
              onClick={iiAgentStats.handleAnalyze}
              disabled={iiAgentStats.analyzing}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all flex-shrink-0 mr-1',
                iiAgentStats.analyzing
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 cursor-wait'
                  : 'bg-emerald-600/80 text-white hover:bg-emerald-500 border border-emerald-500/50'
              )}
            >
              {iiAgentStats.analyzing
                ? <><RefreshCw size={11} className="animate-spin" /> Analysing…</>
                : <><Brain size={11} /> Run Analysis</>
              }
            </button>
          )}

          {/* Wallet — Query Chain button */}
          {pathname === '/wallet' && walletPageStats && (
            <button
              onClick={walletPageStats.queryChain}
              disabled={walletPageStats.querying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[13px] font-semibold hover:bg-indigo-500/25 transition-colors disabled:opacity-50 flex-shrink-0 mr-1"
            >
              <RefreshCw size={11} className={walletPageStats.querying ? 'animate-spin' : ''} />
              {walletPageStats.querying ? 'Querying…' : 'Query Chain'}
            </button>
          )}

          {/* Market Data — AUTO/MANUAL toggle */}
          {pathname === '/market' && marketPageStats && (
            <button
              onClick={marketPageStats.toggleAutoRef}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-mono border transition-colors flex-shrink-0 mr-1',
                marketPageStats.autoRef
                  ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                  : 'bg-dark-700 text-slate-300 border-dark-600'
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', marketPageStats.autoRef ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
              {marketPageStats.autoRef ? 'AUTO' : 'MANUAL'}
            </button>
          )}

          {/* Activity Log — FEED toggle */}
          {pathname === '/activity' && activityStats && (
            <button
              onClick={activityStats.toggleLive}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-mono border transition-colors flex-shrink-0 mr-1',
                activityStats.isLive
                  ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                  : 'bg-dark-700 text-slate-300 border-dark-600'
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', activityStats.isLive ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
              {activityStats.isLive ? 'FEED: LIVE' : 'FEED: PAUSED'}
            </button>
          )}

          {/* Strategies — Refresh */}
          {pathname === '/strategies' && strategiesStats && (
            <button
              onClick={strategiesStats.refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-[13px] text-slate-300 hover:text-white transition-colors font-mono flex-shrink-0 mr-1"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          )}

          {/* Trades — Refresh */}
          {pathname === '/trades' && tradesPageStats && (
            <button
              onClick={tradesPageStats.refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-[13px] text-slate-300 hover:text-white transition-colors font-mono flex-shrink-0 mr-1"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          )}

          {/* Trade Log — Refresh */}
          {pathname === '/trade-log' && tradeLogStats && (
            <button
              onClick={tradeLogStats.refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-[13px] text-slate-300 hover:text-white transition-colors font-mono flex-shrink-0 mr-1"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          )}

          {/* Analytics — time range selector */}
          {pathname === '/analytics' && analyticsStats && (
            <div className="flex items-center gap-0.5 bg-dark-700 border border-dark-600 rounded-lg p-1 flex-shrink-0 mr-1">
              <Clock size={11} className="text-slate-400 ml-1 mr-0.5" />
              {['1h', '6h', '24h', '7d', 'all'].map(r => (
                <button key={r}
                  onClick={() => analyticsStats.handleTimeRange(r)}
                  className={clsx(
                    'px-2.5 py-1 rounded text-[13px] font-mono font-bold transition-colors',
                    analyticsStats.timeRange === r
                      ? 'bg-accent-blue/20 text-accent-blue'
                      : 'text-slate-400 hover:text-slate-200'
                  )}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Agent Fleet — Rebalance Capital button */}
          {pathname === '/fleet' && fleetStats && (
            <button
              onClick={fleetStats.rebalance}
              disabled={fleetStats.rebalancing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-[13px] text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 mr-1"
            >
              {fleetStats.rebalancing
                ? <><RefreshCw size={11} className="animate-spin" /> Rebalancing…</>
                : <><BarChart2 size={11} /> Rebalance Capital</>
              }
            </button>
          )}

          {/* Reload / reset page — universal */}
          <button
            onClick={() => window.location.reload()}
            title="Reload page"
            className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white hover:bg-dark-600 transition-colors flex-shrink-0"
          >
            <RefreshCw size={14} />
          </button>

          <div className="w-px h-5 bg-dark-600 flex-shrink-0" />

          {/* Bot status pill — Command Dashboard sizing (px-4 py-2 text-sm) */}
          <div className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border flex-shrink-0 transition-all duration-300',
            botBusy
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : isRunning
                ? 'bg-accent-green/10 text-accent-green border-accent-green/30 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
                : 'bg-dark-700 text-slate-400 border-dark-600'
          )}>
            {botBusy ? (
              <svg className="w-2.5 h-2.5 animate-spin text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <span className={clsx(
                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                isRunning ? 'bg-accent-green animate-pulse' : 'bg-slate-600'
              )} />
            )}
            {botBusy
              ? (isRunning ? 'Stopping…' : 'Starting…')
              : isRunning ? 'Run Bot' : 'Bot Stopped'}
          </div>

          {/* Stop / Start Bot — Command Dashboard sizing */}
          <button
            onClick={handleToggle}
            disabled={botBusy}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border flex-shrink-0 transition-all duration-200',
              botBusy
                ? 'opacity-40 cursor-not-allowed bg-dark-700 border-dark-600 text-slate-400'
                : isRunning
                  ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/30 hover:border-red-400/50 hover:shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                  : 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/30 hover:border-accent-green/50 hover:shadow-[0_0_8px_rgba(52,211,153,0.2)]'
            )}
          >
            {isRunning ? <Square size={13} /> : <Play size={13} />}
            {botBusy
              ? (isRunning ? 'Stopping…' : 'Starting…')
              : isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>

          <div className="w-px h-5 bg-dark-600 flex-shrink-0" />

          {/* Local date + time — Session XXX: Partner spec, date next to time */}
          <div className="flex items-center gap-1.5 text-sm font-mono text-slate-400 flex-shrink-0">
            <Clock size={14} className="text-slate-500" />
            <span className="text-slate-300">{localDate}</span>
            <span className="text-slate-600">·</span>
            <span>{localTime}</span>
          </div>

          {/* Notification Bell — badge shows critical-only count */}
          <NotificationBell unreadCount={unreadCount} criticalCount={criticalUnreadCount} onAckAll={ackAllCriticals} />
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