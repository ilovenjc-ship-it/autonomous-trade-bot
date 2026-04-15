import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  Settings, Wallet, Activity, Zap, Radio, Bot, Shield, BarChart2, BookOpen, Globe, Vote, Brain, Bell,
} from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import { useAlerts } from '@/hooks/useAlerts'
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

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center">
              <Zap size={16} className="text-dark-900" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">TAO Bot</p>
              <p className="text-[10px] text-slate-300 font-mono">Finney Mainnet</p>
            </div>
          </div>
        </div>

        {/* Bot status badge */}
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