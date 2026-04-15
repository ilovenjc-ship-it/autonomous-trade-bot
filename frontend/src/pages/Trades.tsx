import { useEffect, useState } from 'react'
import { useBotStore } from '@/store/botStore'
import { ArrowUpDown, TrendingUp, TrendingDown, DollarSign, Percent, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import StatCard from '@/components/StatCard'

export default function Trades() {
  const { trades, tradeStats, fetchTrades, fetchTradeStats, manualTrade, status } = useBotStore()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [manualAction, setManualAction] = useState<'buy' | 'sell'>('buy')
  const [manualAmount, setManualAmount] = useState('0.1')
  const [manualBusy, setManualBusy] = useState(false)

  useEffect(() => {
    fetchTrades(page)
    fetchTradeStats()
  }, [page])

  const handleManualTrade = async () => {
    const amount = parseFloat(manualAmount)
    if (isNaN(amount) || amount <= 0) return toast.error('Enter a valid amount')
    setManualBusy(true)
    const result = await manualTrade(manualAction, amount)
    if (result.success) toast.success(`${manualAction.toUpperCase()} executed @ $${status?.current_price?.toFixed(2)}`)
    else toast.error(result.message)
    setManualBusy(false)
  }

  const filtered = filter === 'all' ? trades : trades.filter((t) => t.trade_type === filter)

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Trade History</h1>
        <button onClick={() => { fetchTrades(page); fetchTradeStats() }} className="btn-secondary p-2">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Paper trading disclosure */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-lg">
        <span className="text-yellow-400 text-sm">📄</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-yellow-400 font-mono uppercase tracking-wider">
            Simulated Performance
          </span>
          <span className="text-[10px] text-yellow-400/70 font-mono">
            These figures reflect paper trading only — no real TAO has moved. Volume and P&L are simulated.
            Win rate = execution success rate (executed ÷ total), not PnL-based.
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Trades" value={tradeStats?.total_trades ?? 0} icon={ArrowUpDown} />
        <StatCard label="Win Rate" value={`${tradeStats?.win_rate ?? 0}%`} icon={Percent} color="green"
          sub="Execution success rate" />
        <StatCard
          label="Total Volume"
          value={`$${(tradeStats?.total_volume_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="blue"
          sub="Simulated USD"
        />
        <StatCard
          label="Total P&L"
          value={`$${(tradeStats?.total_pnl_usd ?? 0).toFixed(2)}`}
          icon={(tradeStats?.total_pnl_usd ?? 0) >= 0 ? TrendingUp : TrendingDown}
          color={(tradeStats?.total_pnl_usd ?? 0) >= 0 ? 'green' : 'red'}
          sub="Simulated USD"
        />
      </div>

      {/* Manual trade panel */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Manual Trade</h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex gap-1">
            {(['buy', 'sell'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setManualAction(a)}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  manualAction === a && a === 'buy' && 'bg-accent-green text-dark-900',
                  manualAction === a && a === 'sell' && 'bg-accent-red text-white',
                  manualAction !== a && 'bg-dark-700 text-slate-300 hover:text-white'
                )}
              >
                {a.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Amount (TAO)</label>
            <input
              type="number"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              step="0.01"
              min="0.001"
              className="input w-36"
            />
          </div>
          {status?.current_price && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Estimated Value</label>
              <div className="input w-36 text-slate-300 bg-dark-700">
                ${(parseFloat(manualAmount || '0') * status.current_price).toFixed(2)}
              </div>
            </div>
          )}
          <button
            onClick={handleManualTrade}
            disabled={manualBusy}
            className={manualAction === 'buy' ? 'btn-primary' : 'btn-danger'}
          >
            {manualBusy ? 'Executing…' : `Execute ${manualAction.toUpperCase()}`}
          </button>
        </div>
        {status?.simulation_mode && (
          <p className="mt-2 text-xs text-yellow-400/70">⚠ Simulation mode — trade will not execute on-chain</p>
        )}
      </div>

      {/* Filter + Table */}
      <div className="card">
        <div className="flex items-center gap-2 p-4 border-b border-dark-600">
          {(['all', 'buy', 'sell'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-mono transition-colors',
                filter === f ? 'bg-accent-blue text-white' : 'text-slate-300 hover:text-white'
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-300">{filtered.length} trades</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-300 border-b border-dark-600">
                {['#', 'Type', 'Mode', 'Amount', 'Price', 'USD Value', 'P&L', 'Strategy', 'Status', 'Time'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-300">No trades found</td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-300">#{t.id}</td>
                    <td className="px-4 py-3">
                      <span className={t.trade_type === 'buy' ? 'tag-buy' : 'tag-sell'}>
                        {t.trade_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.tx_hash
                        ? <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">● LIVE</span>
                        : <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">◌ PAPER</span>
                      }
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{t.amount} TAO</td>
                    <td className="px-4 py-3 font-mono">${t.price_at_trade?.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">${t.usd_value?.toFixed(2)}</td>
                    <td className={clsx('px-4 py-3 font-mono', (t.pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.strategy ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-mono',
                        t.status === 'executed' ? 'bg-accent-green/10 text-accent-green' :
                        t.status === 'failed'   ? 'bg-accent-red/10 text-accent-red' :
                        'bg-dark-600 text-slate-300'
                      )}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono">
                      {t.created_at ? format(new Date(t.created_at), 'MMM d HH:mm') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}