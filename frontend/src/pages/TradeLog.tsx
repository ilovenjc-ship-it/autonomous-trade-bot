import { useEffect, useState, useCallback } from 'react'
import {
  ArrowLeftRight, RefreshCw, Filter, ChevronLeft,
  ChevronRight, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Search,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────────
interface Trade {
  id: number
  trade_type: string
  status: string
  amount: number
  price_at_trade: number
  usd_value: number
  pnl: number
  pnl_pct: number
  strategy: string | null
  signal_reason: string | null
  created_at: string | null
}

interface TradesResponse {
  total: number
  page: number
  page_size: number
  trades: Trade[]
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt4(n: number) {
  const s = Math.abs(n).toFixed(4)
  return n >= 0 ? `+${s}` : `-${s}`
}

function ts(raw: string | null) {
  if (!raw) return '—'
  return raw.replace('T', ' ').slice(0, 16)
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
      'inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold',
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
      'inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-semibold',
      win ? 'bg-accent-green/10 text-accent-green' : 'bg-red-400/10 text-red-400'
    )}>
      {win ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {win ? 'WIN' : 'LOSS'}
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
          : 'text-slate-400 border-dark-600 hover:text-white hover:border-dark-400'
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
  const [search,      setSearch]      = useState('')
  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
      if (typeFilter)  params.trade_type = typeFilter
      if (resultFilt)  params.result     = resultFilt
      if (stratFilter) params.strategy   = stratFilter
      const res = await api.get('/trades', { params })
      setData(res.data)
    } catch (e) {
      console.error('TradeLog fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, resultFilt, stratFilter])

  useEffect(() => { load() }, [load])

  // reset page when filters change
  useEffect(() => { setPage(1) }, [typeFilter, resultFilt, stratFilter])

  const trades = data?.trades ?? []
  const total  = data?.total  ?? 0
  const pages  = Math.ceil(total / PAGE_SIZE)

  // Client-side text search on visible page
  const visible = search
    ? trades.filter(t =>
        (t.strategy ?? '').includes(search.toLowerCase()) ||
        (t.signal_reason ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(t.id).includes(search)
      )
    : trades

  return (
    <div className="flex flex-col h-screen bg-dark-900">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ArrowLeftRight size={22} className="text-accent-green" />
              Trade Log
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total} trades total · page {page}/{pages}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-400 hover:text-white transition-colors font-mono"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={12} className="text-slate-500 flex-shrink-0" />

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

          {/* Search */}
          <div className="ml-auto flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search this page…"
              className="bg-transparent text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none w-36"
            />
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-dark-900 border-b border-dark-600">
            <tr className="text-slate-500 uppercase tracking-wider font-mono">
              <th className="px-4 py-3 text-left w-16">ID</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Strategy</th>
              <th className="px-4 py-3 text-right">Amount (τ)</th>
              <th className="px-4 py-3 text-right">Price (USD)</th>
              <th className="px-4 py-3 text-right">USD Value</th>
              <th className="px-4 py-3 text-right">PnL</th>
              <th className="px-4 py-3 text-center">Result</th>
              <th className="px-4 py-3 text-left">Signal</th>
              <th className="px-4 py-3 text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="py-16 text-center">
                  <RefreshCw size={18} className="animate-spin text-slate-500 mx-auto" />
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-slate-500 font-mono">
                  No trades match the current filter
                </td>
              </tr>
            )}
            {!loading && visible.map((t, idx) => (
              <tr
                key={t.id}
                className={clsx(
                  'border-b border-dark-700/40 hover:bg-dark-800/60 transition-colors',
                  idx % 2 === 0 ? '' : 'bg-dark-800/20'
                )}
              >
                {/* ID */}
                <td className="px-4 py-2.5 text-slate-600 font-mono">#{t.id}</td>

                {/* Type */}
                <td className="px-4 py-2.5"><TypeBadge type={t.trade_type} /></td>

                {/* Strategy */}
                <td className="px-4 py-2.5">
                  <span className="text-slate-300 font-mono">
                    {STRATEGY_LABELS[t.strategy ?? ''] ?? t.strategy ?? '—'}
                  </span>
                  <br />
                  <span className="text-slate-600 text-[10px]">{t.strategy}</span>
                </td>

                {/* Amount */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {t.amount.toFixed(4)}
                </td>

                {/* Price */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                  ${t.price_at_trade.toFixed(2)}
                </td>

                {/* USD Value */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                  ${t.usd_value.toFixed(4)}
                </td>

                {/* PnL */}
                <td className={clsx(
                  'px-4 py-2.5 text-right font-mono font-semibold',
                  t.pnl > 0 ? 'text-accent-green' : t.pnl < 0 ? 'text-red-400' : 'text-slate-500'
                )}>
                  {fmt4(t.pnl)}
                </td>

                {/* Result */}
                <td className="px-4 py-2.5 text-center">
                  <ResultBadge pnl={t.pnl} />
                </td>

                {/* Signal */}
                <td className="px-4 py-2.5 max-w-[200px]">
                  <span className="text-slate-500 truncate block" title={t.signal_reason ?? ''}>
                    {t.signal_reason ? t.signal_reason.slice(0, 50) : '—'}
                  </span>
                </td>

                {/* Time */}
                <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                  {ts(t.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-dark-600 flex items-center justify-between">
        <p className="text-xs text-slate-500 font-mono">
          Showing {visible.length} of {total} trades
          {typeFilter || resultFilt || stratFilter
            ? ` (filtered)`
            : ''}
        </p>

        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="p-1.5 rounded border border-dark-600 text-slate-400 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                    : 'text-slate-400 border-dark-600 hover:text-white'
                )}
              >
                {p}
              </button>
            )
          })}

          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="p-1.5 rounded border border-dark-600 text-slate-400 hover:text-white hover:border-dark-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}