import { useEffect } from 'react'
import { useBotStore } from '@/store/botStore'
import { TrendingUp, CheckCircle, Circle, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Strategies() {
  const { strategies, status, fetchStrategies, activateStrategy } = useBotStore()

  useEffect(() => {
    fetchStrategies()
  }, [])

  const handleActivate = async (name: string) => {
    await activateStrategy(name)
    toast.success(`Strategy "${name}" activated`)
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Strategies</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active: <span className="text-accent-blue font-mono">{status?.active_strategy ?? '—'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {strategies.map((s) => (
          <div
            key={s.name}
            className={clsx(
              'card p-5 transition-all animate-slide-up',
              s.is_active ? 'border-accent-blue/40 glow-green' : ''
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {s.is_active ? (
                  <CheckCircle size={16} className="text-accent-green" />
                ) : (
                  <Circle size={16} className="text-slate-600" />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">{s.display_name}</h3>
                  <p className="text-[10px] font-mono text-slate-500">{s.name}</p>
                </div>
              </div>
              {s.is_active && (
                <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded text-[10px] font-mono">
                  ACTIVE
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">{s.description}</p>

            {/* Params */}
            <div className="bg-dark-900 rounded-lg p-3 mb-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Parameters</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(s.parameters || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-mono text-slate-300">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Trades', value: s.total_trades },
                { label: 'Win Rate', value: `${s.win_rate.toFixed(1)}%` },
                { label: 'P&L', value: `$${s.total_pnl.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-xs font-mono text-white">{value}</p>
                  <p className="text-[10px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleActivate(s.name)}
              disabled={s.is_active}
              className={clsx(
                'w-full py-2 rounded-lg text-xs font-semibold transition-all',
                s.is_active
                  ? 'bg-dark-700 text-slate-500 cursor-not-allowed'
                  : 'btn-secondary hover:border-accent-blue/40 hover:text-accent-blue'
              )}
            >
              {s.is_active ? 'Currently Active' : 'Activate Strategy'}
            </button>
          </div>
        ))}
      </div>

      {/* Signal panel */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Zap size={14} className="text-accent-yellow" /> Current Signal
        </h2>
        <p className="text-xs text-slate-400">
          Strategy signals update every price tick. Start the bot to see live signals on the dashboard.
        </p>
      </div>
    </div>
  )
}