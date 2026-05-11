import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBotStore } from '@/store/botStore'
import { ArrowUpDown, TrendingUp, TrendingDown, DollarSign, Percent, RefreshCw,
         ChevronLeft, ChevronRight, ExternalLink, Zap, AlertTriangle,
         CheckCircle2, Copy, ShieldAlert, Activity, Shield, Timer, Shuffle } from 'lucide-react'
import TransactionDetailModal, { type TradeRecord } from '@/components/TransactionDetailModal'
/**
 * Timestamp formatter — New York / Eastern Time (US)
 * SQLite stores UTC without 'Z'; we append it so browsers parse correctly.
 * Dynamically resolves EST (UTC-5, Nov–Mar) vs EDT (UTC-4, Mar–Nov).
 * Output: "Apr 29, 18:04 EDT"
 */
function fmtET(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    const utc = raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z'
    const d = new Date(utc)
    // Resolve correct abbreviation — EST in winter, EDT in summer
    const tzAbbr =
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
        .formatToParts(d)
        .find(p => p.type === 'timeZoneName')?.value ?? 'ET'
    return (
      d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
      }) + ' ' + tzAbbr
    )
  } catch { return (raw ?? '').slice(0, 16) }
}
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

// ── Execution Guard types ──────────────────────────────────────────────────────
interface GuardStatus {
  fee_model: {
    fee_per_leg_tao:    number
    round_trip_fee_tao: number
    description:        string
  }
  slippage_model: {
    base_pct_per_leg:   number
    model:              string
    formula:            string
    default_pool_depth: number
    pool_depth_source:  string
  }
  jitter: {
    enabled:         boolean
    window_seconds:  number
    description:     string
    strategies:      Record<string, number>
  }
  mev_guard: {
    enabled: boolean
    status:  string
    notes:   string
  }
  slippage_guard: {
    enabled:          boolean
    max_slippage_pct: number
    status:           string
    notes:            string
  }
  round_trip_cost_model: {
    fee_pct_of_amount: string
    slip_pct_approx:   string
    total_approx_pct:  string
  }
}

const STRATEGY_DISPLAY: Record<string, string> = {
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

export default function Trades() {
  const navigate = useNavigate()
  const { trades, tradeStats, tradeTotal, fetchTrades, fetchTradeStats, manualTrade, status, setTradesPageStats } = useBotStore()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [liveOnly, setLiveOnly] = useState(false)

  // Manual trade panel state
  const [manualAction, setManualAction]   = useState<'buy' | 'sell'>('buy')
  const [manualAmount, setManualAmount]   = useState('0.0001')
  const [manualBusy,   setManualBusy]     = useState(false)
  const [confirming,   setConfirming]     = useState(false)
  const [tradeResult,  setTradeResult]    = useState<TradeResult | null>(null)
  const [tradingMode,  setTradingMode]    = useState<TradingMode | null>(null)
  const [strategyModes, setStrategyModes] = useState<Record<string, string>>({})
  const [selectedTrade, setSelectedTrade] = useState<TradeRecord | null>(null)

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

  useEffect(() => { setPage(1) }, [filter, liveOnly])

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

  // ── Execution Guard state ──────────────────────────────────────────────────
  const [guardStatus, setGuardStatus] = useState<GuardStatus | null>(null)

  const fetchGuardStatus = useCallback(async () => {
    try {
      const { data } = await api.get<GuardStatus>('/bot/execution-guard')
      setGuardStatus(data)
    } catch (_) {}
  }, [])

  useEffect(() => { fetchGuardStatus() }, [fetchGuardStatus])

  const stableRefresh = useCallback(() => { fetchTrades(page); fetchTradeStats() }, [fetchTrades, fetchTradeStats, page])

  useEffect(() => {
    setTradesPageStats({ total: tradeTotal ?? 0, mode: isLive ? 'LIVE' : 'Paper', winRate: tradeStats ? `${(tradeStats.win_rate ?? 0).toFixed(1)}%` : '—', refresh: stableRefresh })
    return () => setTradesPageStats(null)
  }, [tradeTotal, isLive, tradeStats?.win_rate, stableRefresh, setTradesPageStats])

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

  // A trade is "live/on-chain" if it has a tx_hash that isn't a simulation placeholder
  const isOnChain = (t: { tx_hash?: string | null }) =>
    !!t.tx_hash && !t.tx_hash.startsWith('block:sim')

  const filtered = trades.filter((t) => {
    if (filter !== 'all' && t.trade_type !== filter) return false
    if (liveOnly && !isOnChain(t)) return false
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* Stats — labels clarified per Session XXV: Simulated USD in paper mode */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Trades"
          value={tradeStats?.total_trades ?? 0}
          icon={ArrowUpDown}
          sub={isLive ? 'Live + paper combined' : 'Paper only'}
        />
        <StatCard
          label="Win Rate"
          value={`${tradeStats?.win_rate ?? 0}%`}
          icon={Percent}
          color={(tradeStats?.win_rate ?? 0) >= 55 ? 'green' : 'yellow'}
          sub={(tradeStats?.total_trades ?? 0) === 0 ? 'No trades yet' : 'Execution success rate'}
        />
        <StatCard
          label={isLive ? 'Total Volume' : 'Total Volume (Simulated USD)'}
          value={`$${(tradeStats?.total_volume_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="blue"
          sub={isLive ? 'all trades' : 'Simulated USD · no real USD'}
        />
        <StatCard
          label={isLive ? 'Total P&L' : 'Total P&L (Simulated USD)'}
          value={`$${(tradeStats?.total_pnl_usd ?? 0).toFixed(2)}`}
          icon={(tradeStats?.total_pnl_usd ?? 0) >= 0 ? TrendingUp : TrendingDown}
          color={(tradeStats?.total_pnl_usd ?? 0) >= 0 ? 'green' : 'red'}
          sub={isLive ? 'realized + unrealized' : 'Simulated USD · paper only'}
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
          {/* Trading mode pill — lives here, in the Manual Trade header */}
          <div className={clsx(
            'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[13px] font-mono font-semibold',
            isLive
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
              isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
            {isLive
              ? 'LIVE — real add_stake() on Finney'
              : 'Paper Trading · uses Simulated USD · no real TAO moves'}
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
          {/* Trade Mode — Paper / Live selector (Session XXV spec).
              Mode reflects bot-wide state. Clicking to switch flips the
              FORCE_PAPER_MODE override (requires confirmation on Live). */}
          <div>
            <label className="block text-[13px] text-slate-500 uppercase tracking-wider font-mono mb-1.5">Trade Mode</label>
            <div className="flex gap-1">
              <button
                onClick={async () => {
                  if (isLive) {
                    if (!confirm('Switch bot to PAPER MODE?\n\nThis will halt all on-chain execution across the whole fleet until you resume Live.')) return
                    try { await api.post('/bot/force-paper-mode'); toast.success('🛑 Paper mode active'); loadTradingMode() }
                    catch { toast.error('Switch failed') }
                  }
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-all border',
                  !isLive
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-dark-700 text-slate-500 border-dark-600 hover:text-slate-300'
                )}
                title={isLive ? 'Switch bot to Paper mode (halts all live trades)' : 'Bot is already in Paper mode'}
              >
                📄 Paper
              </button>
              <button
                onClick={async () => {
                  if (!isLive) {
                    if (!confirm('Switch bot to LIVE MODE?\n\n⚠ This enables real on-chain execution. Real TAO will be staked. Only proceed if the fleet has earned promotion.')) return
                    try { await api.post('/bot/resume-live'); toast.success('⚡ Live mode active'); loadTradingMode() }
                    catch { toast.error('Switch failed — check wallet/chain connection') }
                  }
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-all border',
                  isLive
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-dark-700 text-slate-500 border-dark-600 hover:text-slate-300'
                )}
                title={!isLive ? 'Switch bot to Live mode (real on-chain execution)' : 'Bot is already in Live mode'}
              >
                ⚡ Live
              </button>
            </div>
          </div>

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

      {/* Trade Log History removed — full history lives on the Trade Log page */}
      {false && (
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

          {/* Live-Only toggle — separates on-chain trades from paper history */}
          <div className="w-px h-4 bg-dark-600 mx-1" />
          <button
            onClick={() => setLiveOnly(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-semibold border transition-all',
              liveOnly
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'text-slate-400 border-dark-600 hover:text-slate-200 hover:border-dark-500'
            )}
          >
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
              liveOnly ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
            ⛓ Live Only
          </button>

          <span className="text-xs text-slate-500 ml-1">
            {filtered.length} shown
            {liveOnly && <span className="text-emerald-500 ml-1">· on-chain only</span>}
          </span>

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
                {['#', 'Type', 'Mode', 'Amount', 'Price', 'USD Value', 'P&L', 'Strategy', 'Status', 'Time (ET · NYC)'].map((h) => (
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
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTrade(t as unknown as TradeRecord)}
                    className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors cursor-pointer"
                    title="Click to view transaction details"
                  >
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
                    <td className="px-4 py-3 text-slate-300 font-mono whitespace-nowrap">
                      {fmtET(t.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── Execution Guard ─────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700"
             style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.07) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/12 border border-amber-500/30 flex items-center justify-center">
              <Shield size={15} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Execution Guard</p>
              <p className="text-[11px] text-slate-500 font-mono">
                Fee model · slippage estimation · MEV jitter · signal protection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">JITTER ACTIVE</span>
            <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">MEV SCAFFOLD</span>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Cost model row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Fee */}
            <div className="rounded-xl border border-dark-600 bg-dark-700/40 p-4 space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={13} className="text-sky-400" />
                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">Fee Model</span>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">ACTIVE</span>
              </div>
              <div className="space-y-1 text-[12px] font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Per leg</span>
                  <span className="text-white">τ{guardStatus?.fee_model.fee_per_leg_tao ?? '0.003'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Round trip</span>
                  <span className="text-white">τ{guardStatus?.fee_model.round_trip_fee_tao ?? '0.006'}</span>
                </div>
                <p className="text-[10px] text-slate-600 pt-1 leading-relaxed">
                  Substrate weight-based extrinsic fee. Flat — not gas-auction-based.
                </p>
              </div>
            </div>

            {/* Slippage */}
            <div className="rounded-xl border border-dark-600 bg-dark-700/40 p-4 space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <Shuffle size={13} className="text-purple-400" />
                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">Slippage Model</span>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">ACTIVE</span>
              </div>
              <div className="space-y-1 text-[12px] font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Model</span>
                  <span className="text-white">AMM x·y=k</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Base per leg</span>
                  <span className="text-white">{guardStatus?.slippage_model.base_pct_per_leg ?? '0.2'}%</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Default pool</span>
                  <span className="text-white">τ{guardStatus?.slippage_model.default_pool_depth ?? '200'}</span>
                </div>
                <p className="text-[10px] text-slate-600 pt-1 leading-relaxed">
                  Pool-depth-aware. Live SDK depth data planned.
                </p>
              </div>
            </div>

            {/* Total round-trip cost */}
            <div className="rounded-xl border border-dark-600 bg-dark-700/40 p-4 space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={13} className="text-rose-400" />
                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">Round-Trip Cost</span>
              </div>
              <div className="space-y-1 text-[12px] font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Fee</span>
                  <span>0.6% (flat τ)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Slippage</span>
                  <span>≈0.4%</span>
                </div>
                <div className="flex justify-between text-white font-bold border-t border-dark-600 pt-1 mt-1">
                  <span>Total</span>
                  <span className="text-amber-400">≈1.0%</span>
                </div>
                <p className="text-[10px] text-slate-600 pt-1 leading-relaxed">
                  Minimum edge any strategy must generate per trade to be profitable.
                </p>
              </div>
            </div>
          </div>

          {/* MEV / Signal Protection explainer */}
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-[12px] font-mono text-slate-400 leading-relaxed">
            <span className="text-amber-300 font-bold">Why this matters on Bittensor: </span>
            Bittensor (Finney) is a Substrate chain — there is no EVM-style public mempool for sandwich attacks.
            The real risk is <span className="text-white font-bold">signal self-contamination</span>: all 12 bots firing
            simultaneously creates a correlated α-price spike that poisons the next cycle's indicators.
            Execution jitter desynchronises each strategy across a 0–{guardStatus?.jitter.window_seconds ?? 45}s window
            so no two bots hit the same block. MEV monitoring scaffolded for full rollout when fleet scales to live capital.
          </div>

          {/* Jitter table */}
          {guardStatus?.jitter.strategies && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Timer size={12} className="text-emerald-400" />
                <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  Execution Jitter — per-strategy offset (deterministic, 0–{guardStatus.jitter.window_seconds}s)
                </p>
                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">ACTIVE</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {Object.entries(guardStatus.jitter.strategies)
                  .sort(([,a],[,b]) => a - b)
                  .map(([name, delay]) => {
                    const pct = (delay / guardStatus.jitter.window_seconds) * 100
                    return (
                      <div key={name} className="rounded-lg border border-dark-600 bg-dark-700/40 p-2.5 flex flex-col gap-1">
                        <p className="text-[10px] font-bold text-white truncate">
                          {STRATEGY_DISPLAY[name] ?? name}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1 bg-dark-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500/60 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold tabular-nums w-8 text-right">
                            {delay}s
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-600 font-mono">fires at +{delay}s</p>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* MEV & Slippage guard status row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-dark-600 bg-dark-700/30 px-4 py-3 flex items-start gap-3">
              <Shield size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[12px] font-bold text-white">MEV Guard</p>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">SCAFFOLDED</span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                  {guardStatus?.mev_guard.notes ?? 'Monitoring framework in place. Full activation when fleet scales to live capital.'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-dark-600 bg-dark-700/30 px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[12px] font-bold text-white">Slippage Guard</p>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">SCAFFOLDED</span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                  Pre-flight check runs on every live trade — logs warnings, does not block.
                  Max threshold: {guardStatus?.slippage_guard.max_slippage_pct ?? 2}% cost.
                  Enable blocking: set SLIPPAGE_GUARD_ENABLED=True in execution_guard.py.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>


      </div>{/* end scrollable */}

      {/* ── Transaction Detail Modal ─────────────────────────────────────── */}
      {selectedTrade && (
        <TransactionDetailModal
          trade={selectedTrade}
          strategyMode={strategyModes[selectedTrade.strategy ?? '']}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  )
}