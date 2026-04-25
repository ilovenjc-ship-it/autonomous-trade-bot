import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBotStore } from '@/store/botStore'
import { ArrowUpDown, TrendingUp, TrendingDown, DollarSign, Percent, RefreshCw,
         ChevronLeft, ChevronRight, ExternalLink, Zap, AlertTriangle,
         CheckCircle2, Copy, ShieldAlert, Activity } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'
import StatCard from '@/components/StatCard'

interface TradingMode {
  overall_mode: 'LIVE' | 'PAPER'
  blocking_reason: string | null
  gates: { chain_connected: boolean; validator_configured: boolean; validator_in_memory: boolean; live_strategies: boolean }
  wallet_balance_tao: number
  validator_hotkey: string | null
}

interface TradeResult {
  success: boolean
  message: string
  tx_hash: string | null
  price: number
  amount: number
  is_real: boolean
}

const STRATEGY_LABELS: Record<string, string> = {
  momentum_cascade:   'Momentum Cascade',
  dtao_flow_momentum: 'dTAO Flow Momentum',
  liquidity_hunter:   'Liquidity Hunter',
  breakout_hunter:    'Breakout Hunter',
  yield_maximizer:    'Yield Maximizer',
  contrarian_flow:    'Contrarian Flow',
  volatility_arb:     'Volatility Arb',
  sentiment_surge:    'Sentiment Surge',
  balanced_risk:      'Balanced Risk',
  mean_reversion:     'Mean Reversion',
  emission_momentum:  'Emission Momentum',
  macro_correlation:  'Macro Correlation',
}

const PAGE_SIZE = 20

export default function Trades() {
  const navigate = useNavigate()
  const { trades, tradeStats, tradeTotal, fetchTrades, fetchTradeStats, manualTrade, status } = useBotStore()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')

  // Manual trade panel state
  const [manualAction, setManualAction]   = useState<'buy' | 'sell'>('buy')
  const [manualAmount, setManualAmount]   = useState('0.0001')
  const [manualBusy,   setManualBusy]     = useState(false)
  const [confirming,   setConfirming]     = useState(false)
  const [tradeResult,  setTradeResult]    = useState<TradeResult | null>(null)
  const [tradingMode,  setTradingMode]    = useState<TradingMode | null>(null)
  const [strategyModes, setStrategyModes] = useState<Record<string, string>>({})

  const pages = Math.max(1, Math.ceil((tradeTotal ?? 0) / PAGE_SIZE))

  // Load trading mode (LIVE vs PAPER) — needed to show real-trade warning
  const loadTradingMode = useCallback(async () => {
    try {
      const { data } = await api.get<TradingMode>('/bot/trading-mode')
      setTradingMode(data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchTrades(page)
    fetchTradeStats()
  }, [page])

  useEffect(() => { setPage(1) }, [filter])

  useEffect(() => {
    loadTradingMode()
    const t = setInterval(loadTradingMode, 20_000)
    return () => clearInterval(t)
  }, [loadTradingMode])

  // Load strategy modes so per-trade badges reflect current mode not just tx_hash
  useEffect(() => {
    const loadModes = () =>
      api.get('/strategies').then(r => {
        const map: Record<string, string> = {}
        for (const s of r.data ?? []) map[s.name] = s.mode
        setStrategyModes(map)
      }).catch(() => {})
    loadModes()
    const t = setInterval(loadModes, 30_000)
    return () => clearInterval(t)
  }, [])

  const isLive = tradingMode?.overall_mode === 'LIVE'

  // Step 1: show confirm for LIVE trades
  const handleFireClick = () => {
    const amount = parseFloat(manualAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (isLive) { setConfirming(true) } else { executeManualTrade() }
  }

  // Step 2: actually execute
  const executeManualTrade = async () => {
    setConfirming(false)
    const amount = parseFloat(manualAmount)
    setManualBusy(true)
    setTradeResult(null)
    try {
      const { data } = await api.post<{ success: boolean; message: string; tx_hash: string | null; price: number; amount: number }>(
        '/trades/manual', { action: manualAction, amount, reason: 'Manual — user initiated' }
      )
      // block:XXXXX  = add_stake() returned True — stake confirmed included in that block
      // extrinsic:XX = proper extrinsic hash from SDK
      // null / undefined = genuine paper trade (wallet not loaded / hotkey missing)
      const isReal = !!data.tx_hash
      setTradeResult({ ...data, is_real: isReal })
      if (data.success) {
        if (isReal) toast.success('🟢 REAL trade fired — tx_hash captured!')
        else toast.success(`Paper ${manualAction.toUpperCase()} simulated`)
        fetchTrades(1); fetchTradeStats()
      } else {
        toast.error(data.message)
      }
    } catch {
      toast.error('Trade request failed')
    } finally {
      setManualBusy(false)
    }
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

      {/* Trading mode disclosure — updates dynamically */}
      {isLive ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg">
          <span className="text-emerald-400 text-sm">🟢</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-bold text-emerald-400 font-mono uppercase tracking-wider">
              Live Trading — Real TAO
            </span>
            <span className="text-[13px] text-emerald-400/70 font-mono">
              System is armed. Strategies with LIVE status fire real <code className="font-mono">add_stake()</code> calls on Finney mainnet.
              Stats include both paper history and confirmed on-chain trades.
              Win rate = execution success rate (executed ÷ total).
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-lg">
          <span className="text-yellow-400 text-sm">📄</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-bold text-yellow-400 font-mono uppercase tracking-wider">
              Paper Trading — Simulated
            </span>
            <span className="text-[13px] text-yellow-400/70 font-mono">
              These figures reflect paper trading only — no real TAO has moved. Volume and P&amp;L are simulated.
              Win rate = execution success rate (executed ÷ total), not PnL-based.
            </span>
          </div>
        </div>
      )}

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

      {/* ── Manual Trade Panel ────────────────────────────────────────────────── */}
      <div className={clsx(
        'rounded-xl border p-5 space-y-4',
        isLive
          ? 'bg-emerald-500/5 border-emerald-500/25'
          : 'bg-dark-800 border-dark-600'
      )}>
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap size={14} className={isLive ? 'text-emerald-400' : 'text-slate-500'} />
            Manual Trade
          </h2>
          <div className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold font-mono tracking-wider border',
            isLive
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
            {isLive ? 'LIVE — REAL STAKE' : 'PAPER — SIMULATED'}
          </div>
        </div>

        {/* LIVE warning */}
        {isLive && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-lg">
            <ShieldAlert size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-[14px] text-emerald-300/90 leading-snug">
              System is <span className="font-bold text-emerald-300">LIVE</span>. This fires a real{' '}
              <code className="text-emerald-200 font-mono text-[13px]">add_stake()</code> on Finney mainnet.
              {tradingMode?.validator_hotkey && (
                <> Validator: <code className="text-emerald-200 font-mono text-[13px]">{tradingMode.validator_hotkey.slice(0, 12)}…</code></>
              )}
              {' '}Balance: <span className="font-bold text-emerald-300">τ{tradingMode?.wallet_balance_tao?.toFixed(4)}</span>
            </p>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-end gap-3 flex-wrap">
          {/* BUY / SELL toggle */}
          <div>
            <label className="block text-[13px] text-slate-500 uppercase tracking-wider font-mono mb-1.5">Action</label>
            <div className="flex gap-1">
              {(['buy', 'sell'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => { setManualAction(a); setTradeResult(null); setConfirming(false) }}
                  className={clsx(
                    'px-5 py-2 rounded-lg text-sm font-bold transition-all',
                    manualAction === a && a === 'buy'  && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
                    manualAction === a && a === 'sell' && 'bg-red-500/20 text-red-400 border border-red-500/40',
                    manualAction !== a && 'bg-dark-700 text-slate-500 border border-dark-600 hover:text-slate-300'
                  )}
                >
                  {a === 'buy' ? '▲ BUY' : '▼ SELL'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[13px] text-slate-500 uppercase tracking-wider font-mono mb-1.5">Amount (TAO)</label>
            <input
              type="number"
              value={manualAmount}
              onChange={(e) => { setManualAmount(e.target.value); setTradeResult(null); setConfirming(false) }}
              step="0.0001"
              min="0.0001"
              className="input w-36 font-mono"
            />
          </div>

          {/* USD estimate */}
          {status?.current_price && (
            <div>
              <label className="block text-[13px] text-slate-500 uppercase tracking-wider font-mono mb-1.5">≈ USD</label>
              <div className="w-28 h-9 flex items-center px-3 bg-dark-700 border border-dark-600 rounded-lg text-sm font-mono text-slate-400">
                ${(parseFloat(manualAmount || '0') * (status.current_price ?? 0)).toFixed(4)}
              </div>
            </div>
          )}

          {/* Fire button */}
          <button
            onClick={handleFireClick}
            disabled={manualBusy || confirming}
            className={clsx(
              'h-9 px-6 rounded-lg text-sm font-bold transition-all flex items-center gap-2 border',
              manualAction === 'buy'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30',
              (manualBusy || confirming) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {manualBusy
              ? <><RefreshCw size={13} className="animate-spin" /> Executing…</>
              : <><Zap size={13} /> {manualAction === 'buy' ? 'Buy' : 'Sell'} {manualAmount} TAO</>
            }
          </button>
        </div>

        {/* Confirm step — only for LIVE */}
        {confirming && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-300">Confirm real on-chain trade</p>
              <p className="text-[13px] text-amber-400/80 mt-0.5">
                {manualAction.toUpperCase()} τ{manualAmount} ≈ $
                {(parseFloat(manualAmount || '0') * (status?.current_price ?? 0)).toFixed(4)} —
                this will fire <code className="font-mono">add_stake()</code> on Finney mainnet
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-dark-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeManualTrade}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600/80 border border-emerald-500/50 hover:bg-emerald-600 transition-colors"
              >
                Confirm — Fire Trade
              </button>
            </div>
          </div>
        )}

        {/* Result panel */}
        {tradeResult && (
          <div className={clsx(
            'rounded-xl border px-4 py-3 space-y-2',
            tradeResult.is_real
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-dark-700 border-dark-600'
          )}>
            <div className="flex items-center gap-2">
              {tradeResult.success
                ? <CheckCircle2 size={14} className={tradeResult.is_real ? 'text-emerald-400' : 'text-slate-400'} />
                : <AlertTriangle size={14} className="text-red-400" />
              }
              <span className={clsx(
                'text-xs font-bold',
                tradeResult.is_real ? 'text-emerald-300' : 'text-slate-300'
              )}>
                {tradeResult.is_real
                  ? tradeResult.tx_hash?.startsWith('block:')
                    ? `🟢 REAL STAKE CONFIRMED — Block #${tradeResult.tx_hash.replace('block:', '')}`
                    : '🟢 REAL TRADE EXECUTED ON-CHAIN'
                  : '🟡 Paper trade simulated'}
              </span>
              <span className="ml-auto text-[13px] font-mono text-slate-500">
                τ{tradeResult.amount} @ ${tradeResult.price?.toFixed(2)}
              </span>
            </div>

            {/* tx_hash — the money shot */}
            {tradeResult.tx_hash && (
              <div className="flex items-center gap-2 bg-dark-900 rounded-lg px-3 py-2 border border-dark-500">
                <Activity size={11} className={tradeResult.is_real ? 'text-emerald-400' : 'text-slate-500'} />
                <code className="text-[13px] font-mono text-slate-300 flex-1 truncate">
                  {tradeResult.tx_hash}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(tradeResult.tx_hash!); toast.success('Copied!') }}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <Copy size={11} />
                </button>
                {tradeResult.is_real && (() => {
                  const hash = tradeResult.tx_hash!
                  const isBlockRef = hash.startsWith('block:')
                  const blockNum   = isBlockRef ? hash.replace('block:', '') : null
                  const url = isBlockRef
                    ? `https://taostats.io/block/${blockNum}`
                    : `https://taostats.io/extrinsic/${hash}`
                  return (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 transition-colors"
                      title={isBlockRef ? `View block #${blockNum} on Taostats` : 'View extrinsic on Taostats'}
                    >
                      <ExternalLink size={11} />
                    </a>
                  )
                })()}
              </div>
            )}

            {!tradeResult.success && (
              <p className="text-[14px] text-red-400 font-mono">{tradeResult.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Filter + Table */}
      <div className="card">
        <div className="flex items-center gap-2 p-4 border-b border-dark-600 flex-wrap">
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
          <span className="text-xs text-slate-300 ml-2">{tradeTotal ?? 0} total</span>

          {/* Pagination controls */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-300 font-mono mr-1">
              Page {page}/{pages}
            </span>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1 rounded border border-dark-600 text-slate-300 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const start = Math.max(1, page - 2)
              const p = start + i
              if (p > pages) return null
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={clsx(
                    'px-2 py-0.5 rounded text-xs font-mono border transition-colors',
                    p === page ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-slate-300 border-dark-600 hover:text-white'
                  )}>
                  {p}
                </button>
              )
            })}
            <button
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
              className="p-1 rounded border border-dark-600 text-slate-300 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
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
                      {(() => {
                        const mode = strategyModes[t.strategy ?? '']
                        const onChain = t.tx_hash && !t.tx_hash.startsWith('block:sim')
                        if (mode === 'LIVE') return (
                          <span className="inline-flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded text-[13px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">● LIVE</span>
                            {onChain && <span className="px-1.5 py-0.5 rounded text-[15px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">⛓</span>}
                          </span>
                        )
                        if (mode === 'APPROVED_FOR_LIVE') return (
                          <span className="px-2 py-0.5 rounded text-[13px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">✅ APPROVED</span>
                        )
                        return (
                          <span className="px-2 py-0.5 rounded text-[13px] font-mono font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">◌ PAPER</span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{t.amount} TAO</td>
                    <td className="px-4 py-3 font-mono">${t.price_at_trade?.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">${t.usd_value?.toFixed(2)}</td>
                    <td className={clsx('px-4 py-3 font-mono font-semibold', (t.pnl ?? 0) > 0 ? 'text-accent-green' : (t.pnl ?? 0) < 0 ? 'text-accent-red' : 'text-slate-300')}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}{(t.pnl ?? 0).toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      {t.strategy ? (
                        <button
                          onClick={() => navigate(`/strategy/${t.strategy}`)}
                          className="flex items-center gap-1 text-slate-300 hover:text-accent-blue transition-colors group"
                        >
                          <span className="font-mono text-xs">
                            {STRATEGY_LABELS[t.strategy] ?? t.strategy}
                          </span>
                          <ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[13px] font-mono',
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