import { useEffect, useState, useCallback } from 'react'
import {
  ArrowLeftRight, RefreshCw, Filter, ChevronLeft,
  ChevronRight, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Search, Zap,
  // Day 12 (Session XLII): icons for the relocated Best/Worst/By-Type
  // section that now lives at the top of this page.
  Activity, ArrowUp, ArrowDown,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'
import TransactionDetailModal, { type TradeRecord } from '@/components/TransactionDetailModal'
import { InfoBubble } from '@/components/Tooltip'

// ── Day 12 (Session XLII) ────────────────────────────────────────────────────
// Best Single / Worst Single / By Trade Type relocated FROM PnL Summary.
// Pulls the same /pnl/summary payload (fleet.best_trade, fleet.worst_trade,
// by_type[]). No backend change. Type defs duplicated from PnLSummary.tsx
// rather than importing to keep the page self-contained.
interface PnLTypeRow {
  type: 'BUY' | 'SELL'
  total_trades: number
  win_rate: number
  total_pnl: number
  avg_pnl: number
  volume_usd: number
}
interface PnLSummaryFleet {
  best_trade:  number
  worst_trade: number
}
interface PnLSummaryPayload {
  fleet:         PnLSummaryFleet
  by_type:       PnLTypeRow[]
  tao_price_usd: number
}

const fmtTau = (n: number | null | undefined) =>
  `${(n ?? 0) >= 0 ? '+' : ''}${(n ?? 0).toFixed(6)} τ`
const fmtPnLUSD = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── types ─────────────────────────────────────────────────────────────────────
interface Trade {
  id: number
  trade_type: string
  status: string
  amount: number
  price_at_trade: number
  usd_value: number
  fee?: number
  pnl: number
  pnl_pct: number
  strategy: string | null
  signal_reason: string | null
  tx_hash: string | null
  netuid?: number | null
  network?: string | null
  live?: boolean
  created_at: string | null
  executed_at?: string | null
  error_message?: string | null
}

interface TradesResponse {
  total: number
  page: number
  page_size: number
  trades: Trade[]
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt4(n: number | null | undefined) {
  const _n = n ?? 0; const s = Math.abs(_n).toFixed(4)
  return _n >= 0 ? `+${s}` : `-${s}`
}

/**
 * Timestamp formatter — New York / Eastern Time (US)
 * SQLite stores UTC without 'Z'; we append it so browsers parse correctly.
 * Dynamically resolves EST (UTC-5, Nov–Mar) vs EDT (UTC-4, Mar–Nov).
 * Output: "Apr 29, 18:04 EDT"
 */
function ts(raw: string | null): string {
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
  } catch { return (raw ?? '').replace('T', ' ').slice(0, 16) }
}

const STRATEGIES = [
  'momentum_cascade', 'dtao_flow_momentum', 'liquidity_hunter', 'breakout_hunter',
  'yield_maximizer', 'contrarian_flow', 'volatility_arb', 'sentiment_surge',
  'balanced_risk', 'mean_reversion', 'emission_momentum', 'macro_correlation',
]

const STRATEGY_LABELS: Record<string, string> = {
  momentum_cascade:   'Momentum Cascade',
  dtao_flow_momentum: 'dTAO Flow',
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

// ── sub-components ────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const isBuy = type === 'buy'
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[14px] font-bold',
      isBuy ? 'bg-accent-green/15 text-accent-green' : 'bg-red-400/15 text-red-400'
    )}>
      {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {type.toUpperCase()}
    </span>
  )
}

function ResultBadge({ pnl }: { pnl: number }) {
  const win = pnl > 0
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[14px] font-semibold',
      win ? 'bg-accent-green/10 text-accent-green' : 'bg-red-400/10 text-red-400'
    )}>
      {win ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {win ? 'WIN' : 'LOSS'}
    </span>
  )
}

function ModeBadge({ mode, txHash }: { mode: string | undefined; txHash: string | null }) {
  const onChain = txHash && !txHash.startsWith('block:sim')

  if (mode === 'LIVE') return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[13px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
        ● LIVE
      </span>
      {onChain && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono text-[15px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          ⛓ chain
        </span>
      )}
    </span>
  )

  if (mode === 'APPROVED_FOR_LIVE') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[13px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
      ✅ APPROVED
    </span>
  )

  // PAPER_ONLY or unknown
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[13px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
      ◌ PAPER
    </span>
  )
}

function FilterBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border',
        active
          ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
          : 'text-slate-300 border-dark-600 hover:text-white hover:border-dark-400'
      )}
    >
      {children}
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function TradeLog() {
  const [data,        setData]        = useState<TradesResponse | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(1)
  const [typeFilter,  setTypeFilter]  = useState<string>('')    // '' | 'buy' | 'sell'
  const [resultFilt,  setResultFilt]  = useState<string>('')    // '' | 'win' | 'loss'
  const [stratFilter, setStratFilter] = useState<string>('')
  const [realOnly,    setRealOnly]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [realCount,   setRealCount]   = useState<number | null>(null)
  const [archivedCount, setArchivedCount] = useState<number | null>(null)
  // strategy mode map — name → 'LIVE' | 'APPROVED_FOR_LIVE' | 'PAPER_ONLY'
  const [strategyModes, setStrategyModes] = useState<Record<string, string>>({})
  // Transaction detail modal
  const [selectedTrade, setSelectedTrade] = useState<TradeRecord | null>(null)
  // Day 12 (Session XLII): /pnl/summary payload for the relocated
  // Best/Worst/By-Type section at the top of the page.
  const [pnlSummary, setPnlSummary] = useState<PnLSummaryPayload | null>(null)
  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = { page, page_size: PAGE_SIZE }
      if (typeFilter)  params.trade_type = typeFilter
      if (resultFilt)  params.result     = resultFilt
      if (stratFilter) params.strategy   = stratFilter
      if (realOnly)    params.real_only  = true
      // Session XXXV: search query goes to the backend (was client-side only,
      // limited to current page). Backend ILIKE-matches strategy + signal_reason
      // + tx_hash, plus exact id match if numeric.
      if (search.trim()) params.q = search.trim()
      const res = await api.get('/trades', { params })
      setData(res.data)
    } catch (e) {
      console.error('TradeLog fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, resultFilt, stratFilter, realOnly, search])

  // Fetch real trade count + archive stats once on mount for the banner
  useEffect(() => {
    api.get('/trades', { params: { real_only: true, page_size: 1, page: 1 } })
      .then(r => setRealCount(r.data.total ?? 0))
      .catch(() => {})
    api.get('/trades/archive/stats')
      .then(r => setArchivedCount(r.data.archived_paper ?? 0))
      .catch(() => {})
    // Load strategy modes — refreshed every 30s so promotions show instantly
    const loadModes = () =>
      api.get('/strategies').then(r => {
        const map: Record<string, string> = {}
        for (const s of r.data ?? []) map[s.name] = s.mode
        setStrategyModes(map)
      }).catch(() => {})
    loadModes()
    const t = setInterval(loadModes, 30_000)
    // Day 12 (Session XLII): poll /pnl/summary for the relocated
    // Best/Worst/By-Type strip. 60-s cadence — these are aggregate
    // statistics, no need for real-time refresh.
    const loadPnL = () =>
      api.get<PnLSummaryPayload>('/pnl/summary')
        .then(r => setPnlSummary(r.data))
        .catch(() => {/* soft-fail — strip will not render */})
    loadPnL()
    const t2 = setInterval(loadPnL, 60_000)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [])

  useEffect(() => { load() }, [load])

  // reset page when filters or search change
  useEffect(() => { setPage(1) }, [typeFilter, resultFilt, stratFilter, realOnly, search])

  const trades = data?.trades ?? []
  const total  = data?.total  ?? 0
  const pages  = Math.ceil(total / PAGE_SIZE)

  const setTradeLogStats = useBotStore(s => s.setTradeLogStats)
  useEffect(() => {
    setTradeLogStats({ total, page, pages: pages || 1, realCount, refresh: load })
    return () => setTradeLogStats(null)
  }, [total, page, pages, realCount, load, setTradeLogStats])

  // Session XXXV: server-side search means `trades` is already filtered.
  const visible = trades

  return (
    <div className="flex flex-col h-full bg-dark-900">

      {/* ── Data Context — Session XXXV: collapsed FROM a fat banner TO a
            small pill button left of the Search box, with the explainer
            text behind an "(i)" InfoBubble. The pill itself sits in the
            filter row below — see end of that flex group. */}

      {/* ── Best / Worst / By Trade Type — Day 12 (Session XLII) RELOCATED
            FROM PnL Summary per Mark's spec ('relocate Best Single Trade +
            Worst Single Trade + Trade By Type from Bottom of Page to
            Trade Log Page > to sit at Top of Page (first line) > Above
            All Types...'). Renders only when /pnl/summary has loaded;
            soft-fails to nothing if the endpoint hiccups. */}
      {pnlSummary && (
        <div className="flex-shrink-0 px-6 pt-4 pb-2 space-y-3 border-b border-dark-700/40 bg-dark-900">
          {/* Top row — Best + Worst single-trade cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-dark-800 border border-emerald-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <p className="text-[12px] text-emerald-400 uppercase tracking-wider font-mono">Best Single Trade</p>
                <InfoBubble side="right" maxWidth={300} content={<>
                  <p className="text-white font-bold mb-1">Best Single Trade</p>
                  <p>The single most profitable trade across the entire fleet, paper + live combined. The fleet-wide ceiling.</p>
                </>} />
              </div>
              <p className="text-xl font-bold font-mono text-emerald-400">{fmtTau(pnlSummary.fleet.best_trade)}</p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {fmtPnLUSD(pnlSummary.fleet.best_trade * (pnlSummary.tao_price_usd ?? 259.31))}
              </p>
            </div>
            <div className="bg-dark-800 border border-red-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <p className="text-[12px] text-red-400 uppercase tracking-wider font-mono">Worst Single Trade</p>
                <InfoBubble side="right" maxWidth={300} content={<>
                  <p className="text-white font-bold mb-1">Worst Single Trade</p>
                  <p>The single largest loss across the fleet. Watch for outliers — one large red number can drag a strategy below its WR/PnL gate even when the strategy is otherwise sound.</p>
                </>} />
              </div>
              <p className="text-xl font-bold font-mono text-red-400">{fmtTau(pnlSummary.fleet.worst_trade)}</p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {fmtPnLUSD(pnlSummary.fleet.worst_trade * (pnlSummary.tao_price_usd ?? 259.31))}
              </p>
            </div>
          </div>

          {/* By Trade Type — BUY vs SELL aggregated */}
          {pnlSummary.by_type?.length > 0 && (
            <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-dark-700 flex items-center gap-2">
                <Activity size={12} className="text-indigo-400" />
                <span className="text-[12px] font-semibold text-white uppercase tracking-wider">By Trade Type</span>
                <InfoBubble side="right" maxWidth={300} content={<>
                  <p className="text-white font-bold mb-1">By Trade Type</p>
                  <p>Aggregated fleet performance split by entry direction (BUY vs SELL). Asymmetric WR or PnL between the two sides is a meaningful signal — most often it means a strategy's directional gates are mis-calibrated for the current regime.</p>
                </>} />
                <span className="ml-auto text-[11px] text-slate-500 font-mono">aggregated fleet</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {pnlSummary.by_type.map(t => (
                  <div key={t.type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {t.type === 'BUY'
                          ? <ArrowUp size={13} className="text-emerald-400" />
                          : <ArrowDown size={13} className="text-red-400" />
                        }
                        <span className="text-[13px] font-bold text-white">{t.type}</span>
                      </div>
                      <span className={clsx('text-[13px] font-bold font-mono',
                        t.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      )}>
                        {fmtTau(t.total_pnl)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[12px] font-mono">
                      <div>
                        <div className="text-slate-500">Trades</div>
                        <div className="text-slate-300">{t.total_trades.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Win Rate</div>
                        <div className="text-slate-300">{t.win_rate}%</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Avg PnL</div>
                        <div className="text-slate-300">{fmtTau(t.avg_pnl)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Volume</div>
                        <div className="text-slate-300">{fmtPnLUSD(t.volume_usd)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-3 pb-4 border-b border-dark-600">

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={12} className="text-slate-300 flex-shrink-0" />

          {/* Type */}
          <div className="flex gap-1">
            <FilterBtn active={typeFilter === ''}     onClick={() => setTypeFilter('')}>     All Types </FilterBtn>
            <FilterBtn active={typeFilter === 'buy'}  onClick={() => setTypeFilter('buy')}>  🟢 BUY    </FilterBtn>
            <FilterBtn active={typeFilter === 'sell'} onClick={() => setTypeFilter('sell')}> 🔴 SELL   </FilterBtn>
          </div>

          <span className="text-dark-600 text-sm">|</span>

          {/* Result */}
          <div className="flex gap-1">
            <FilterBtn active={resultFilt === ''}     onClick={() => setResultFilt('')}>     All Results </FilterBtn>
            <FilterBtn active={resultFilt === 'win'}  onClick={() => setResultFilt('win')}>  ✅ WIN      </FilterBtn>
            <FilterBtn active={resultFilt === 'loss'} onClick={() => setResultFilt('loss')}> ❌ LOSS     </FilterBtn>
          </div>

          <span className="text-dark-600 text-sm">|</span>

          {/* Strategy */}
          <select
            value={stratFilter}
            onChange={e => setStratFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs font-mono text-slate-300 focus:outline-none focus:border-accent-blue"
          >
            <option value="">All Strategies</option>
            {STRATEGIES.map(s => (
              <option key={s} value={s}>{STRATEGY_LABELS[s] || s}</option>
            ))}
          </select>

          <span className="text-dark-600 text-sm">|</span>

          {/* Real trades only toggle */}
          <button
            onClick={() => setRealOnly(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
              realOnly
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(52,211,153,0.2)]'
                : 'text-slate-400 border-dark-600 hover:text-emerald-400 hover:border-emerald-500/30'
            )}
          >
            <Zap size={11} className={realOnly ? 'text-emerald-400' : ''} />
            {realOnly ? '⛓ Real Only' : 'Real Only'}
          </button>

          {/* Data Context pill — Session XXXV: replaces the old fat banner.
              Sits LEFT of the Search box (ml-auto pushes the pair right). */}
          <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[11px] font-mono">
            ℹ Data Context
            <InfoBubble
              side="bottom"
              maxWidth={360}
              content={
                <div className="space-y-1.5">
                  <p className="text-white font-bold text-[12px]">What you're looking at</p>
                  <p>
                    Stats include the <span className="text-slate-200 font-semibold">full trade history</span>
                    {' '}(paper + real on-chain). Paper trades are simulation — they establish the win-rate
                    and PnL baselines used for gate promotions.
                  </p>
                  <p>
                    Real on-chain trades are a small subset — toggle the
                    {' '}<span className="text-emerald-300">⛓ Real Only</span> button to see just the
                    {' '}confirmed on-chain subset.
                  </p>
                </div>
              }
            />
          </span>

          {/* Search — Session XXXV: now searches ALL trades, not just current
              page. Backend ILIKE-matches strategy / signal_reason / tx_hash
              + exact id when numeric. */}
          <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-slate-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search all trades…"
              className="bg-transparent text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none w-44"
            />
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-dark-900 border-b border-dark-600">
            <tr className="text-slate-300 uppercase tracking-wider font-mono">
              <th className="px-4 py-3 text-left w-16">ID</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Mode</th>
              <th className="px-4 py-3 text-left">Strategy</th>
              <th className="px-4 py-3 text-right">Amount (τ)</th>
              <th className="px-4 py-3 text-right">Price (USD)</th>
              <th className="px-4 py-3 text-right">USD Value</th>
              <th className="px-4 py-3 text-right">PnL</th>
              <th className="px-4 py-3 text-center">Result</th>
              <th className="px-4 py-3 text-left">Signal</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Time (ET · NYC)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="py-16 text-center">
                  <RefreshCw size={18} className="animate-spin text-slate-300 mx-auto" />
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={11} className="py-16 text-center text-slate-300 font-mono">
                  No trades match the current filter
                </td>
              </tr>
            )}
            {!loading && visible.map((t, idx) => (
              <tr
                key={t.id}
                onClick={() => setSelectedTrade(t as TradeRecord)}
                className={clsx(
                  'border-b border-dark-700/40 hover:bg-dark-800/60 transition-colors cursor-pointer',
                  idx % 2 === 0 ? '' : 'bg-dark-800/20'
                )}
                title="Click to view transaction details"
              >
                {/* ID */}
                <td className="px-4 py-2.5 text-slate-300 font-mono">#{t.id}</td>

                {/* Type */}
                <td className="px-4 py-2.5"><TypeBadge type={t.trade_type} /></td>

                {/* Mode */}
                <td className="px-4 py-2.5">
                  <ModeBadge mode={strategyModes[t.strategy ?? '']} txHash={t.tx_hash} />
                </td>

                {/* Strategy */}
                <td className="px-4 py-2.5">
                  <span className="text-slate-300 font-mono">
                    {STRATEGY_LABELS[t.strategy ?? ''] ?? t.strategy ?? '—'}
                  </span>
                </td>

                {/* Amount */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {(t.amount ?? 0).toFixed(4)}
                </td>

                {/* Price */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  ${(t.price_at_trade ?? 0).toFixed(2)}
                </td>

                {/* USD Value */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  ${(t.usd_value ?? 0).toFixed(4)}
                </td>

                {/* PnL */}
                <td className={clsx(
                  'px-4 py-2.5 text-right font-mono font-semibold',
                  t.pnl > 0 ? 'text-accent-green' : t.pnl < 0 ? 'text-red-400' : 'text-slate-300'
                )}>
                  {fmt4(t.pnl)}
                </td>

                {/* Result */}
                <td className="px-4 py-2.5 text-center">
                  <ResultBadge pnl={t.pnl} />
                </td>

                {/* Signal */}
                <td className="px-4 py-2.5 max-w-[200px]">
                  <span className="text-slate-300 truncate block" title={t.signal_reason ?? ''}>
                    {t.signal_reason ? t.signal_reason.slice(0, 50) : '—'}
                  </span>
                </td>

                {/* Time */}
                <td className="px-4 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                  {ts(t.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-dark-600 flex items-center justify-between">
        <p className="text-xs text-slate-300 font-mono">
          Showing {visible.length} of {total.toLocaleString()} trades
          {(typeFilter || resultFilt || stratFilter || realOnly) && (
            <span className="ml-1">
              {realOnly
                ? <span className="text-emerald-400">(⛓ real only)</span>
                : <span className="text-slate-400">(filtered)</span>
              }
            </span>
          )}
        </p>

        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="p-1.5 rounded border border-dark-600 text-slate-300 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          {Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const start = Math.max(1, page - 2)
            const p = start + i
            if (p > pages) return null
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-mono border transition-colors',
                  p === page
                    ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                    : 'text-slate-300 border-dark-600 hover:text-white'
                )}
              >
                {p}
              </button>
            )
          })}

          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="p-1.5 rounded border border-dark-600 text-slate-300 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

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