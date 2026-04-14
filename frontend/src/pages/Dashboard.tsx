import { useEffect, useState } from 'react'
import { useBotStore } from '@/store/botStore'
import StatCard from '@/components/StatCard'
import {
  Play, Square, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, Activity, Zap, ArrowUpDown, BarChart2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Dashboard() {
  const {
    status, trades, tradeStats, priceHistory,
    fetchStatus, fetchTrades, fetchTradeStats, fetchPriceHistory,
    startBot, stopBot, refreshAll, loading,
  } = useBotStore()

  const [historyDays, setHistoryDays] = useState(7)
  const [botBusy, setBotBusy] = useState(false)

  useEffect(() => {
    refreshAll()
    fetchPriceHistory(historyDays)
    const interval = setInterval(() => {
      fetchStatus()
      fetchTrades()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchPriceHistory(historyDays)
  }, [historyDays])

  const handleToggleBot = async () => {
    setBotBusy(true)
    try {
      const result = status?.is_running ? await stopBot() : await startBot()
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    } finally {
      setBotBusy(false)
    }
  }

  const recentTrades = trades.slice(0, 5)
  const price = status?.current_price
  const change = status?.price_change_24h
  const indicators = status?.indicators || {}

  const chartData = priceHistory.map((p) => ({
    time: format(new Date(p.timestamp), 'MMM d HH:mm'),
    price: p.price,
  }))

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {status?.simulation_mode ? '⚠ Simulation Mode — no real trades' : `Active on ${status?.network}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="btn-secondary p-2"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleToggleBot}
            disabled={botBusy}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all',
              status?.is_running
                ? 'bg-accent-red/20 text-accent-red border border-accent-red/40 hover:bg-accent-red hover:text-white'
                : 'bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green hover:text-dark-900',
              botBusy && 'opacity-50 cursor-not-allowed'
            )}
          >
            {status?.is_running ? <Square size={14} /> : <Play size={14} />}
            {status?.is_running ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {status?.status_message && (
        <div className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono border',
          status.is_running
            ? 'bg-accent-green/5 border-accent-green/20 text-accent-green/80'
            : 'bg-dark-700 border-dark-600 text-slate-400'
        )}>
          <Activity size={12} className={status.is_running ? 'run-pulse text-accent-green' : 'text-slate-600'} />
          {status.status_message}
        </div>
      )}

      {/* Price & key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="TAO Price"
          value={price ? `$${price.toFixed(2)}` : '—'}
          sub={change !== undefined ? `${change >= 0 ? '+' : ''}${change?.toFixed(2)}% 24h` : undefined}
          icon={DollarSign}
          color={change !== undefined ? (change >= 0 ? 'green' : 'red') : 'default'}
        />
        <StatCard
          label="Wallet Balance"
          value={`${(status?.wallet_balance ?? 0).toFixed(4)} TAO`}
          sub={price ? `≈ $${((status?.wallet_balance ?? 0) * price).toFixed(2)}` : undefined}
          icon={Zap}
          color="blue"
        />
        <StatCard
          label="Total Trades"
          value={status?.total_trades ?? 0}
          sub={`${status?.daily_trades ?? 0} / ${status?.max_daily_trades ?? 50} today`}
          icon={ArrowUpDown}
        />
        <StatCard
          label="Total P&L"
          value={`$${(status?.total_pnl ?? 0).toFixed(2)}`}
          sub={`${tradeStats?.win_rate ?? 0}% win rate`}
          icon={BarChart2}
          color={(status?.total_pnl ?? 0) >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Chart */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp size={14} className="text-accent-blue" /> TAO Price Chart
          </h2>
          <div className="flex gap-1">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setHistoryDays(d)}
                className={clsx(
                  'px-2 py-1 text-xs rounded font-mono transition-colors',
                  historyDays === d ? 'bg-accent-blue text-white' : 'text-slate-400 hover:text-white'
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: '#0d1424', border: '1px solid #1a2540', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                itemStyle={{ color: '#3b82f6', fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, 'TAO']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#priceGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-slate-600 text-sm">
            Loading chart data…
          </div>
        )}
      </div>

      {/* Indicators + Recent trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Indicators */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart2 size={14} className="text-accent-purple" /> Technical Indicators
          </h2>
          <div className="space-y-2">
            {[
              { label: 'RSI (14)', value: indicators.rsi_14?.toFixed(1), threshold: [30, 70] },
              { label: 'EMA 9', value: indicators.ema_9 ? `$${indicators.ema_9.toFixed(2)}` : undefined },
              { label: 'EMA 21', value: indicators.ema_21 ? `$${indicators.ema_21.toFixed(2)}` : undefined },
              { label: 'MACD', value: indicators.macd?.toFixed(4) },
              { label: 'MACD Signal', value: indicators.macd_signal?.toFixed(4) },
              { label: 'BB Upper', value: indicators.bb_upper ? `$${indicators.bb_upper.toFixed(2)}` : undefined },
              { label: 'BB Lower', value: indicators.bb_lower ? `$${indicators.bb_lower.toFixed(2)}` : undefined },
            ].map(({ label, value, threshold }) => {
              const num = parseFloat(value || '')
              let color = 'text-white'
              if (threshold && !isNaN(num)) {
                if (num <= threshold[0]) color = 'text-accent-green'
                else if (num >= threshold[1]) color = 'text-accent-red'
                else color = 'text-accent-yellow'
              }
              return (
                <div key={label} className="flex justify-between items-center text-xs py-1 border-b border-dark-700">
                  <span className="text-slate-500">{label}</span>
                  <span className={clsx('font-mono font-medium', color)}>{value ?? '—'}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent trades */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <ArrowUpDown size={14} className="text-accent-yellow" /> Recent Trades
          </h2>
          {recentTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-600 text-sm gap-2">
              <ArrowUpDown size={24} />
              <p>No trades yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTrades.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-dark-700 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className={t.trade_type === 'buy' ? 'tag-buy' : 'tag-sell'}>
                      {t.trade_type.toUpperCase()}
                    </span>
                    <span className="font-mono text-white">{t.amount} TAO</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-slate-300">${t.price_at_trade?.toFixed(2)}</p>
                    <p className="text-slate-500 text-[10px]">
                      {t.created_at ? format(new Date(t.created_at), 'MMM d HH:mm') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}