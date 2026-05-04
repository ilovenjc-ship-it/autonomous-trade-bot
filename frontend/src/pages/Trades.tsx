import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBotStore } from '@/store/botStore'
import { ArrowUpDown, TrendingUp, TrendingDown, DollarSign, Percent, RefreshCw,
         ChevronLeft, ChevronRight, ExternalLink, Zap, AlertTriangle,
         CheckCircle2, Copy, ShieldAlert, Activity } from 'lucide-react'
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
import PageHeroSlider from '@/components/PageHeroSlider'

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

// ── Paper Activity types ───────────────────────────────────────────────────────

interface PaperTrade {
  id:             number
  side:           'BUY' | 'SELL'
  strategy:       string
  label:          string
  amount_tao:     number
  price_usd:      number
  pnl_tao:        number
  pnl_pct:        number
  is_win:         boolean
  signal_reason:  string
  timestamp:      string
}

interface PaperStratCard {
  strategy:      string
  label:         string
  total_trades:  number
  wins:          number
  losses:        number
  win_rate:      number
  total_pnl:     number
  avg_pnl:       number
  last_trade_at: string | null
  last_side:     'BUY' | 'SELL'
  last_amount:   number
  last_price:    number
  last_pnl:      number
}

interface PaperActivity {
  recent_trades:  PaperTrade[]
  strategy_cards: PaperStratCard[]
  totals: {
    total_trades: number
    total_wins:   number
    win_rate:     number
    total_pnl:    number
  }
  tao_price: number
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

  // ── Paper Activity state ──────────────────────────────────────────────────
  const [paperActivity, setPaperActivity] = useState<PaperActivity | null>(null)
  const [paperLoading,  setPaperLoading]  = useState(false)

  const fetchPaperActivity = useCallback(async () => {
    setPaperLoading(true)
    try {
      const { data } = await api.get<PaperActivity>('/pnl/paper-activity')
      setPaperActivity(data)
    } catch (_) {}
    finally { setPaperLoading(false) }
  }, [])

  useEffect(() => { fetchPaperActivity() }, [fetchPaperActivity])
  useEffect(() => {
    const t = setInterval(fetchPaperActivity, 20_000)
    return () => clearInterval(t)
  }, [fetchPaperActivity])

  const stableRefresh = useCallback(() => { fetchTrades(page); fetchTradeStats() }, [fetchTrades, fetchTradeStats, page])

  useEffect(() => {
    setTradesPageStats({ total: tradeTotal ?? 0, mode: isLive ? 'LIVE' : 'Paper', winRate: tradeStats ? `${(tradeStats.win_rate ?? 0).toFixed(1)}%` : '—', refresh: stableRefresh })
    return () => setTradesPageStats(null)
  }, [tradeTotal, isLive, tradeStats?.win_rate, stableRefresh, setTradesPageStats])

  const heroSlides = [
    {
      title: 'Trade Overview', subtitle: isLive ? 'LIVE Mode' : 'Paper Mode', accent: isLive ? 'emerald' : 'yellow' as any,
      stats: [
        { label: 'Total Trades',  value: String(tradeTotal ?? 0),                                        color: 'white'   as const },
        { label: 'Mode',          value: isLive ? 'LIVE' : 'PAPER',                                      color: isLive ? 'emerald' : 'yellow' as any },
        { label: 'Win Rate',      value: tradeStats ? `${(tradeStats.win_rate ?? 0).toFixed(1)}%` : '—',        color: (tradeStats?.win_rate ?? 0) >= 55 ? 'emerald' : 'yellow' as any },
        { label: 'Total PnL',     value: '—',                                                                                            color: 'white' as const },
        { label: 'Filter',        value: filter.toUpperCase(),                                           color: 'slate'   as const },
      ],
    },
    {
      title: 'Win / Loss Stats', subtitle: 'Trade Outcomes', accent: 'blue' as const,
      stats: [
        { label: 'Wins',          value: tradeStats ? String(Math.round((tradeStats.win_rate/100) * (tradeTotal ?? 0))) : '—', color: 'emerald' as const },
        { label: 'Losses',        value: tradeStats ? String(Math.round(((100-tradeStats.win_rate)/100) * (tradeTotal ?? 0))) : '—', color: 'red' as const },
        { label: 'Avg Win',       value: '—',                                                                          color: 'emerald' as const },
        { label: 'Avg Loss',      value: '—',                                                                          color: 'red'     as const },
        { label: 'Page',          value: `${page}/${Math.max(1,Math.ceil((tradeTotal??0)/20))}`,        color: 'slate'   as const },
      ],
    },
    {
      title: 'Strategy Modes', subtitle: 'Live Distribution', accent: 'purple' as const,
      stats: [
        { label: 'LIVE',          value: String(Object.values(strategyModes).filter(m => m === 'LIVE').length),              color: 'emerald' as const },
        { label: 'APPROVED',      value: String(Object.values(strategyModes).filter(m => m === 'APPROVED_FOR_LIVE').length), color: 'purple'  as const },
        { label: 'PAPER',         value: String(Object.values(strategyModes).filter(m => m === 'PAPER_ONLY').length),        color: 'yellow'  as const },
        { label: 'Strategies',    value: String(Object.keys(strategyModes).length || 12),                                   color: 'white'   as const },
        { label: 'Last Trade',    value: tradeResult ? 'Complete' : '—',                                                   color: tradeResult ? 'emerald' : 'slate' as any },
      ],
    },
  ]

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
      <PageHeroSlider slides={heroSlides} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

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
              : 'PAPER — simulated · no real TAO moving'}
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

      {/* ── Paper Trading Activity ───────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700"
             style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Activity size={15} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Paper Trading Activity</p>
              <p className="text-[11px] text-slate-500 font-mono">
                Simulated trades — how all 12 strategies are buying &amp; selling in paper mode
              </p>
            </div>
            {paperActivity && (
              <div className="flex items-center gap-2 ml-2">
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-300">
                  {paperActivity.totals.total_trades} trades
                </span>
                <span className={clsx(
                  'px-2 py-0.5 text-[10px] font-bold font-mono rounded border',
                  (paperActivity.totals.total_pnl ?? 0) >= 0
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                    : 'bg-red-500/15 border-red-500/25 text-red-400'
                )}>
                  {(paperActivity.totals.total_pnl ?? 0) >= 0 ? '+' : ''}{(paperActivity.totals.total_pnl ?? 0).toFixed(4)}τ
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  {paperActivity.totals.win_rate}% WR
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              auto-refresh 20s · paper only
            </span>
            <button onClick={fetchPaperActivity} disabled={paperLoading}
              className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-white font-mono transition-colors">
              <RefreshCw size={11} className={paperLoading ? 'animate-spin' : ''} />
              {paperLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Explainer banner ── */}
          <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 text-[12px] font-mono text-slate-400 leading-relaxed">
            <span className="text-indigo-300 font-bold">How paper trading works: </span>
            Each strategy fires a BUY or SELL signal every cycle. The trade is simulated instantly using a
            fair random outcome (Gaussian, zero-drift) minus realistic round-trip fees — no artificial win bias.
            These are <span className="text-white font-bold">not real on-chain transactions</span>.
            They build the track record each strategy needs to earn promotion to LIVE.
            A strategy needs ≥55% win rate + ≥10 cycles to pass the gate.
          </div>

          {/* ── Strategy simulation cards grid ── */}
          {paperActivity && paperActivity.strategy_cards.length > 0 && (
            <div>
              <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">
                Strategy Simulation Cards — last action per bot
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {paperActivity.strategy_cards.map(card => {
                  const wr = card.win_rate
                  const wrColor = wr >= 70 ? 'text-emerald-400' : wr >= 55 ? 'text-sky-400' : wr >= 40 ? 'text-amber-400' : 'text-red-400'
                  const wrBg    = wr >= 70 ? 'bg-emerald-500/10 border-emerald-500/25' : wr >= 55 ? 'bg-sky-500/10 border-sky-500/25' : wr >= 40 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-red-500/10 border-red-500/25'
                  const pnlPos  = card.total_pnl >= 0
                  const lastWin = card.last_pnl > 0

                  const ago = card.last_trade_at
                    ? (() => {
                        const diff = Math.floor((Date.now() - new Date(card.last_trade_at).getTime()) / 1000)
                        if (diff < 60)   return `${diff}s ago`
                        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                        return `${Math.floor(diff / 3600)}h ago`
                      })()
                    : '—'

                  return (
                    <div key={card.strategy}
                      className={clsx('rounded-xl border p-3 flex flex-col gap-1.5 transition-all', wrBg)}>
                      <div>
                        <p className="text-[11px] font-bold text-white leading-tight truncate">{card.label}</p>
                        <p className="text-[9px] font-mono text-slate-500 truncate">{card.strategy}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border',
                          card.last_side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-red-500/20 text-red-400 border-red-500/40'
                        )}>
                          {card.last_side}
                        </span>
                        <span className={clsx('text-[10px] font-bold font-mono', lastWin ? 'text-emerald-400' : 'text-red-400')}>
                          {card.last_pnl > 0 ? '+' : ''}{card.last_pnl.toFixed(4)}τ
                        </span>
                      </div>
                      <div className={clsx('text-[11px] font-bold font-mono', wrColor)}>
                        {wr.toFixed(1)}% WR
                        <span className="text-slate-500 font-normal ml-1 text-[10px]">{card.wins}W/{card.losses}L</span>
                      </div>
                      <div className={clsx('text-[11px] font-bold font-mono', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                        {card.total_pnl >= 0 ? '+' : ''}{card.total_pnl.toFixed(4)}τ
                      </div>
                      <p className="text-[9px] text-slate-600 font-mono">{ago} · {card.total_trades} trades</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Recent paper trade stream ── */}
          <div>
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">
              Recent Paper Trades — live stream (newest first)
            </p>

            {paperLoading && !paperActivity ? (
              <div className="flex items-center justify-center py-8 text-slate-500 text-xs font-mono gap-2">
                <Activity size={12} className="animate-pulse" /> Loading paper trades…
              </div>
            ) : !paperActivity?.recent_trades.length ? (
              <div className="rounded-xl border border-dark-600 py-10 text-center">
                <Activity size={28} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-mono">No paper trades yet.</p>
                <p className="text-slate-600 text-xs mt-1 font-mono">The cycle engine fires every 60s — trades will appear here.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dark-700/50 overflow-hidden">
                <div className="grid text-[10px] font-mono text-slate-500 uppercase tracking-wider px-4 py-2 bg-dark-900/50 border-b border-dark-700/50"
                     style={{ gridTemplateColumns: '90px 1fr 60px 80px 80px 70px 80px' }}>
                  <span>Time</span>
                  <span>Strategy</span>
                  <span className="text-center">Side</span>
                  <span className="text-right">Amount τ</span>
                  <span className="text-right">Price $</span>
                  <span className="text-right">PnL τ</span>
                  <span className="text-right">Result</span>
                </div>
                <div className="max-h-[380px] overflow-y-auto divide-y divide-dark-700/30">
                  {paperActivity.recent_trades.map(trade => {
                    const timeStr = (() => {
                      const d = new Date(trade.timestamp)
                      const diff = Math.floor((Date.now() - d.getTime()) / 1000)
                      if (diff < 60)   return `${diff}s ago`
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
                    })()
                    return (
                      <div key={trade.id}
                        className={clsx(
                          'grid px-4 py-2 text-[12px] font-mono transition-colors hover:bg-dark-700/30',
                          trade.is_win ? 'bg-emerald-500/3' : 'bg-red-500/3'
                        )}
                        style={{ gridTemplateColumns: '90px 1fr 60px 80px 80px 70px 80px' }}>
                        <span className="text-slate-600">{timeStr}</span>
                        <div className="min-w-0">
                          <span className="text-slate-300 truncate block">{trade.label}</span>
                          {trade.signal_reason && (
                            <span className="text-slate-600 text-[10px] truncate block">{trade.signal_reason.slice(0, 40)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-center">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            trade.side === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/35'
                              : 'bg-red-500/20 text-red-400 border-red-500/35'
                          )}>{trade.side}</span>
                        </div>
                        <span className="text-right text-slate-300">{trade.amount_tao.toFixed(4)}</span>
                        <span className="text-right text-slate-500">${trade.price_usd.toFixed(2)}</span>
                        <span className={clsx('text-right font-bold', trade.is_win ? 'text-emerald-400' : 'text-red-400')}>
                          {trade.pnl_tao > 0 ? '+' : ''}{trade.pnl_tao.toFixed(5)}
                        </span>
                        <div className="flex items-center justify-end">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            trade.is_win
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                          )}>
                            {trade.is_win ? 'WIN' : 'LOSS'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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