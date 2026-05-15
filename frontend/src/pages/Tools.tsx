/**
 * Operator Tools — Whale Tracker + TAO Calculator
 * ================================================
 *
 * Session XXXIII new page.  Surfaces two operator utilities the partner
 * asked for after walking the Conviction-Era surface:
 *
 *   1. Whale Tracker — live top-100 TAO holder leaderboard with whale /
 *      dolphin / shrimp tiering and one-click TaoStats deep-link.  Used as
 *      a leading-signal lens for stake-redirection events that front-run
 *      α-pool moves on the affected subnets.
 *
 *   2. TAO Calculator — two-way τ ↔ fiat (USD/EUR/GBP/JPY/BTC) converter
 *      backed by the existing PriceService poll, plus a CoinGecko-sourced
 *      historical price lookup so the operator can answer "what was 100τ
 *      worth on day X?" without leaving the app.
 *
 * Backend: routers/tools.py (Session XXXIII) — three endpoint families
 *   GET /api/tools/whales
 *   GET /api/tools/calc/quote
 *   GET /api/tools/calc/historical
 *   GET /api/tools/calc/chart
 *
 * Visual language matches Research.tsx (violet hero strip, slate cards,
 * KpiCard / Section helper components inlined for self-containment).
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  RefreshCw, Search, Copy, ExternalLink, AlertTriangle,
  Calculator, Coins, TrendingUp, TrendingDown, History,
  Wallet as WalletIcon, ArrowRightLeft, Sparkles, Activity,
  Crown, Fish, Shell,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface WhaleRow {
  rank: number
  address: string
  address_short: string
  balance_tao: number
  balance_24h_ago_tao: number | null
  share_pct: number
  tier: 'whale' | 'dolphin' | 'shrimp'
  balance_change_24h: number | null
  rank_change_24h: number | null
  block_number: number | null
  taostats_url: string | null
}

interface WhalesResp {
  configured: boolean
  fetched_at: number
  count: number
  total_supply: number
  tao_price_usd: number
  kpi: {
    tracked_wallets?: number
    total_tao?: number
    share_pct?: number
    usd_value?: number | null
    whales?: number
    dolphins?: number
    shrimp?: number
    top_balance_tao?: number
  }
  leaderboard: WhaleRow[]
  setup_hint?: string
  error?: string
}

interface QuoteResp {
  tao_amount: number
  currency: string
  tao_price_usd: number
  tao_price_target: number
  converted_amount: number
  fx_rate: number
  market_cap: number | null
  volume_24h: number | null
  price_change_24h: number | null
  fetched_at: number
}

interface HistoricalResp {
  date: string
  tao_amount: number
  currency: string
  price_usd_on_date: number
  price_target_on_date: number
  converted_amount: number
  current_price_usd: number | null
  delta_pct_since: number | null
  market_cap_on_date: number | null
  volume_on_date: number | null
  fx_rate: number
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Tab = 'whales' | 'calc'

const QUICK_AMOUNTS = [1, 10, 50, 100, 500, 1000]
const FIATS = ['USD', 'EUR', 'GBP', 'JPY', 'BTC'] as const
type Fiat = typeof FIATS[number]

// Session XXXIV: Split — /tools renders Whale Tracker only, /calculator renders TAO Calculator only.
export default function Tools({ mode = 'whales' }: { mode?: Tab }) {
  if (mode === 'calc') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-slate-950 p-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300">
              <Calculator size={14} /> Operator Calculator
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white">TAO Calculator</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Two-way τ ↔ fiat (USD/EUR/GBP/JPY/BTC) conversion at live or any
              historical date back to TAO genesis. Powered by CoinGecko price feed.
            </p>
          </div>
        </div>
        <CalculatorTab />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-slate-950 p-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300">
            <Crown size={14} /> Operator Tools
          </div>
          <h2 className="mt-1 text-2xl font-bold text-white">Whale Tracker</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Live top-100 TAO holder leaderboard with whale / dolphin / shrimp
            tiers and 24-hour delta — a leading lens into stake-redirection
            events.
          </p>
        </div>
      </div>
      <WhaleTrackerTab />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Whale Tracker tab
// ════════════════════════════════════════════════════════════════════════════

function WhaleTrackerTab() {
  const [data, setData] = useState<WhalesResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tierFilter, setTierFilter] = useState<'all' | 'whale' | 'dolphin' | 'shrimp'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const params: Record<string, string | number | boolean> = { limit: 100 }
      if (force) params.refresh = true
      const resp = await api.get<WhalesResp>('/tools/whales', { params })
      setData(resp.data)
    } catch (e: any) {
      toast.error(`Whale fetch failed: ${e.message}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(false), 60_000)   // soft 60s refresh
    return () => clearInterval(t)
  }, [load])

  const filtered = useMemo(() => {
    if (!data?.leaderboard) return []
    let rows = data.leaderboard
    if (tierFilter !== 'all') rows = rows.filter((r) => r.tier === tierFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.address.toLowerCase().includes(q) ||
          String(r.rank) === q ||
          r.address_short.toLowerCase().includes(q),
      )
    }
    return rows
  }, [data, tierFilter, search])

  // ── Loading / unconfigured states ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="animate-spin" size={20} />
          Loading whale leaderboard…
        </div>
      </div>
    )
  }

  if (data && !data.configured) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <div>
            <h3 className="text-base font-bold text-amber-200">
              TaoStats API key required
            </h3>
            <p className="mt-1 text-sm text-amber-100/80">
              {data.setup_hint || 'Set TAOSTATS_API_KEY to enable the whale tracker.'}
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-slate-300">
              <li>
                Sign up free at{' '}
                <a
                  className="text-cyan-400 underline"
                  href="https://taostats.io/pro"
                  target="_blank"
                  rel="noreferrer"
                >
                  taostats.io/pro
                </a>
              </li>
              <li>
                Add <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">TAOSTATS_API_KEY=&lt;your_key&gt;</code>{' '}
                to the backend environment (Railway → Variables, or local{' '}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">backend/.env</code>)
              </li>
              <li>Redeploy / restart the backend, then click Refresh.</li>
            </ol>
            <div className="mt-3">
              <button
                onClick={() => load(true)}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
              >
                <RefreshCw size={12} className="mr-1 inline" /> Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200">
        <AlertTriangle size={18} className="mr-2 inline text-red-400" />
        TaoStats fetch error: <code className="ml-1">{data.error}</code>
        <div className="mt-3">
          <button
            onClick={() => load(true)}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const k = data?.kpi || {}
  const px = data?.tao_price_usd || 0

  return (
    <div className="space-y-5">
      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={<WalletIcon size={16} className="text-cyan-300" />}
          label="Wallets Tracked"
          value={fmtInt(k.tracked_wallets || 0)}
          sub={`top ${data?.count ?? 0} by balance`}
        />
        <KpiCard
          icon={<Coins size={16} className="text-emerald-400" />}
          label="Total τ"
          value={fmtTao(k.total_tao || 0)}
          sub={`${(k.share_pct || 0).toFixed(2)}% of supply`}
        />
        <KpiCard
          icon={<Activity size={16} className="text-amber-300" />}
          label="USD Market Value"
          value={k.usd_value ? fmtUsd(k.usd_value) : '—'}
          sub={px ? `@ $${fmtNum(px, 2)}/τ` : 'price warming up'}
        />
        <KpiCard
          icon={<Crown size={16} className="text-violet-400" />}
          label="Top Wallet"
          value={fmtTao(k.top_balance_tao || 0)}
          sub={data?.leaderboard[0]?.address_short ?? '—'}
        />
        <KpiCard
          icon={<Fish size={16} className="text-sky-400" />}
          label="Tier Counts"
          value={`${k.whales || 0}🐋 · ${k.dolphins || 0}🐬 · ${k.shrimp || 0}🦐`}
          sub="whales · dolphins · shrimp"
        />
      </div>

      {/* ── Filters / search ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ss58 fragment or rank…"
            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
          />
        </div>
        <FilterChip active={tierFilter === 'all'} onClick={() => setTierFilter('all')}>
          All
        </FilterChip>
        <FilterChip
          active={tierFilter === 'whale'}
          onClick={() => setTierFilter('whale')}
          color="violet"
        >
          🐋 Whales (≥1%)
        </FilterChip>
        <FilterChip
          active={tierFilter === 'dolphin'}
          onClick={() => setTierFilter('dolphin')}
          color="sky"
        >
          🐬 Dolphins (0.1–1%)
        </FilterChip>
        <FilterChip
          active={tierFilter === 'shrimp'}
          onClick={() => setTierFilter('shrimp')}
          color="emerald"
        >
          🦐 Shrimp (&lt;0.1%)
        </FilterChip>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="ml-auto flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* ── Leaderboard table ───────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/70 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Address</th>
                <th className="px-3 py-2 text-right">Balance (τ)</th>
                <th className="px-3 py-2 text-right">% Supply</th>
                <th className="px-3 py-2 text-right">USD Value</th>
                <th className="px-3 py-2 text-right">Δ 24h (τ)</th>
                <th className="px-3 py-2 text-center">Tier</th>
                <th className="px-3 py-2 text-center">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No wallets match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.address || row.rank} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {medalForRank(row.rank)} {row.rank}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-200">
                          {row.address_short || '—'}
                        </span>
                        {row.address && (
                          <button
                            onClick={() => copyToClip(row.address)}
                            title="Copy address"
                            className="text-slate-500 hover:text-cyan-300"
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {fmtTao(row.balance_tao)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-300">
                      {row.share_pct.toFixed(3)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {px ? fmtUsd(row.balance_tao * px) : '—'}
                    </td>
                    <td
                      className={clsx(
                        'px-3 py-2 text-right font-mono text-xs',
                        row.balance_change_24h == null
                          ? 'text-slate-600'
                          : row.balance_change_24h > 0
                          ? 'text-emerald-400'
                          : row.balance_change_24h < 0
                          ? 'text-red-400'
                          : 'text-slate-500',
                      )}
                    >
                      {row.balance_change_24h == null
                        ? '—'
                        : (row.balance_change_24h > 0 ? '+' : '') +
                          fmtNum(row.balance_change_24h, 2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.taostats_url ? (
                        <a
                          href={row.taostats_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                          title="Open on TaoStats"
                        >
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
        <Activity size={14} className="mt-0.5 flex-shrink-0 text-cyan-400" />
        <span>
          <strong className="text-slate-300">Signal use:</strong> top-100
          coldkey rebalances of 5–10K τ tend to lead α-pool moves on the
          affected subnets by hours. Cross-reference with{' '}
          <a className="text-cyan-400 hover:underline" href="/research">Research → Owner Watch</a>{' '}
          to attribute movement to specific subnet actions.
          Cache refresh: 60 s soft / on-demand via Refresh.
        </span>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Calculator tab
// ════════════════════════════════════════════════════════════════════════════

function CalculatorTab() {
  const [tao, setTao] = useState<string>('1')
  const [fiat, setFiat] = useState<Fiat>('USD')
  const [quote, setQuote] = useState<QuoteResp | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(true)

  const [histDate, setHistDate] = useState<string>('')
  const [hist, setHist] = useState<HistoricalResp | null>(null)
  const [histErr, setHistErr] = useState<string | null>(null)
  const [histLoading, setHistLoading] = useState(false)

  // ── Live quote refresh (driven by tao + fiat changes) ──────────────────
  const fetchQuote = useCallback(async (amount: number, currency: Fiat) => {
    try {
      const r = await api.get<QuoteResp>('/tools/calc/quote', {
        params: { amount, currency: currency.toLowerCase() },
      })
      setQuote(r.data)
    } catch (e: any) {
      toast.error(`Quote failed: ${e.message}`)
    } finally {
      setLoadingQuote(false)
    }
  }, [])

  useEffect(() => {
    const n = Math.max(0, Number(tao) || 0)
    fetchQuote(n, fiat)
    const t = setInterval(() => {
      const m = Math.max(0, Number(tao) || 0)
      fetchQuote(m, fiat)
    }, 30_000)
    return () => clearInterval(t)
  }, [tao, fiat, fetchQuote])

  // ── Two-way binding: when fiat side typed, derive τ from current px ────
  const onFiatInput = (v: string) => {
    const f = Number(v) || 0
    if (!quote || !quote.tao_price_target) return
    const newTao = f / quote.tao_price_target
    setTao(String(round(newTao, 6)))
  }

  // ── Historical lookup ─────────────────────────────────────────────────
  const lookupHistorical = useCallback(async () => {
    if (!histDate) {
      toast.error('Pick a date first')
      return
    }
    setHistLoading(true)
    setHistErr(null)
    try {
      const r = await api.get<HistoricalResp>('/tools/calc/historical', {
        params: {
          date:     histDate,
          amount:   Math.max(0, Number(tao) || 1),
          currency: fiat.toLowerCase(),
        },
      })
      setHist(r.data)
    } catch (e: any) {
      setHistErr(e.message)
      setHist(null)
    } finally {
      setHistLoading(false)
    }
  }, [histDate, tao, fiat])

  const px24Change = quote?.price_change_24h ?? null
  const isUp = (px24Change ?? 0) >= 0

  return (
    <div className="space-y-5">
      {/* ── Live price banner ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-cyan-300">
              Live TAO Price
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-3xl font-bold text-white">
                ${quote ? fmtNum(quote.tao_price_usd, 2) : '—'}
              </div>
              {px24Change !== null && (
                <div
                  className={clsx(
                    'flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium',
                    isUp
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-red-500/15 text-red-300',
                  )}
                >
                  {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isUp ? '+' : ''}
                  {px24Change.toFixed(2)}% 24h
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Mini label="Market Cap" value={quote?.market_cap ? fmtUsdShort(quote.market_cap) : '—'} />
            <Mini label="Volume 24h" value={quote?.volume_24h ? fmtUsdShort(quote.volume_24h) : '—'} />
            <Mini
              label="Updated"
              value={quote?.fetched_at ? fmtAge(Date.now() / 1000 - quote.fetched_at) : '—'}
            />
          </div>
        </div>
      </div>

      {/* ── Two-way converter ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <ArrowRightLeft size={16} className="text-cyan-300" /> Two-way Converter
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              TAO Amount
            </label>
            <div className="mt-1 flex rounded-lg border border-slate-700/60 bg-slate-950/60 focus-within:border-cyan-500/60">
              <input
                type="number"
                step="any"
                min="0"
                value={tao}
                onChange={(e) => setTao(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2.5 text-lg font-mono text-white focus:outline-none"
                placeholder="0"
              />
              <div className="flex items-center px-3 text-xs font-semibold text-slate-400">
                τ TAO
              </div>
            </div>
          </div>

          <div className="hidden text-slate-500 sm:flex sm:items-center sm:justify-center sm:px-2 sm:pb-3">
            <ArrowRightLeft size={18} />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              {fiat} Amount
            </label>
            <div className="mt-1 flex rounded-lg border border-slate-700/60 bg-slate-950/60 focus-within:border-cyan-500/60">
              <input
                type="number"
                step="any"
                min="0"
                value={quote ? round(quote.converted_amount, 6) : 0}
                onChange={(e) => onFiatInput(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2.5 text-lg font-mono text-white focus:outline-none"
                placeholder="0"
              />
              <select
                value={fiat}
                onChange={(e) => setFiat(e.target.value as Fiat)}
                className="rounded-r-lg border-l border-slate-700/60 bg-slate-900 px-3 text-sm font-semibold text-cyan-300 focus:outline-none"
              >
                {FIATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick-amount buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              onClick={() => setTao(String(q))}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                Number(tao) === q
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700/60 bg-slate-900/60 text-slate-300 hover:bg-slate-800',
              )}
            >
              {q}τ
            </button>
          ))}
        </div>

        {quote && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm sm:grid-cols-4">
            <Mini label="1 τ →" value={`${fiat} ${fmtNum(quote.tao_price_target, 4)}`} />
            <Mini label="FX rate" value={`USD→${fiat} ${fmtNum(quote.fx_rate, 4)}`} />
            <Mini label="Position USD" value={`$${fmtNum((Number(tao) || 0) * quote.tao_price_usd, 2)}`} />
            <Mini
              label="If 24h Δ holds"
              value={
                px24Change != null
                  ? `${fiat} ${fmtNum(((Number(tao) || 0) * quote.tao_price_target) * (1 + px24Change / 100), 2)}`
                  : '—'
              }
              hint={px24Change != null ? `${px24Change.toFixed(2)}% 24h` : undefined}
            />
          </div>
        )}
        {!quote && loadingQuote && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
            <RefreshCw size={14} className="animate-spin" /> Loading live quote…
          </div>
        )}
      </div>

      {/* ── Historical lookup ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <History size={16} className="text-amber-300" /> Historical Price Lookup
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              Date (UTC)
            </label>
            <input
              type="date"
              value={histDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setHistDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>
          <button
            onClick={lookupHistorical}
            disabled={histLoading || !histDate}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {histLoading ? (
              <span className="flex items-center gap-2"><RefreshCw size={13} className="animate-spin" /> Looking up…</span>
            ) : (
              'Lookup'
            )}
          </button>
          <div className="text-xs text-slate-500">
            Uses CoinGecko historical data — ~6 h cached, no API key needed.
          </div>
        </div>

        {histErr && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-200">
            <AlertTriangle size={14} className="text-red-400" />
            {histErr}
          </div>
        )}

        {hist && (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-slate-300">
              On <strong className="text-amber-300">{hist.date}</strong>,{' '}
              <strong className="text-emerald-300">
                {fmtNum(hist.tao_amount, 4)} τ
              </strong>{' '}
              was worth{' '}
              <strong className="text-cyan-300">
                {hist.currency} {fmtNum(hist.converted_amount, 2)}
              </strong>{' '}
              (1 τ = {hist.currency} {fmtNum(hist.price_target_on_date, 4)}).
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini
                label="Price on date (USD)"
                value={`$${fmtNum(hist.price_usd_on_date, 4)}`}
              />
              <Mini
                label="Price now (USD)"
                value={hist.current_price_usd ? `$${fmtNum(hist.current_price_usd, 4)}` : '—'}
              />
              <Mini
                label="% Change since"
                value={
                  hist.delta_pct_since != null
                    ? `${hist.delta_pct_since >= 0 ? '+' : ''}${hist.delta_pct_since.toFixed(2)}%`
                    : '—'
                }
                hint={hist.delta_pct_since != null && hist.delta_pct_since >= 0 ? 'gained' : 'lost'}
                tone={hist.delta_pct_since != null ? (hist.delta_pct_since >= 0 ? 'positive' : 'negative') : 'neutral'}
              />
              <Mini
                label="Market Cap then"
                value={hist.market_cap_on_date ? fmtUsdShort(hist.market_cap_on_date) : '—'}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
        <Activity size={14} className="mt-0.5 flex-shrink-0 text-cyan-400" />
        <span>
          Live quote refreshes every 30 s while this tab is open (driven by
          the existing PriceService poll).  Historical lookups hit CoinGecko's
          public endpoint — no API key required.
        </span>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-components & helpers
// ════════════════════════════════════════════════════════════════════════════

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        active
          ? 'bg-cyan-500/20 text-cyan-200 shadow-inner'
          : 'text-slate-400 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  children,
  color = 'cyan',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  color?: 'cyan' | 'violet' | 'sky' | 'emerald'
}) {
  const palette: Record<string, string> = {
    cyan:    'border-cyan-500/40 bg-cyan-500/15 text-cyan-200',
    violet:  'border-violet-500/40 bg-violet-500/15 text-violet-200',
    sky:     'border-sky-500/40 bg-sky-500/15 text-sky-200',
    emerald: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  }
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
        active
          ? palette[color]
          : 'border-slate-700/60 bg-slate-900/60 text-slate-400 hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  )
}

function TierBadge({ tier }: { tier: 'whale' | 'dolphin' | 'shrimp' }) {
  if (tier === 'whale') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200">
        <Crown size={10} /> Whale
      </span>
    )
  }
  if (tier === 'dolphin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
        <Fish size={10} /> Dolphin
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
      <Shell size={10} /> Shrimp
    </span>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500 truncate">{sub}</div>
    </div>
  )
}

function Mini({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'negative'
      ? 'text-red-300'
      : 'text-white'
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={clsx('mt-0.5 text-base font-mono font-semibold', toneClass)}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  )
}

// ── formatters ───────────────────────────────────────────────────────────────

function fmtTao(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M τ`
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K τ`
  return `${fmtNum(v, 2)} τ`
}
function fmtUsd(v: number): string {
  return `$${fmtNum(v, 2)}`
}
function fmtUsdShort(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`
  return `$${v.toFixed(2)}`
}
function fmtNum(v: number, dp = 2): string {
  if (Number.isNaN(v) || v == null) return '—'
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  })
}
function fmtInt(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${(seconds / 3600).toFixed(1)}h ago`
}
function round(v: number, dp = 2): number {
  const m = 10 ** dp
  return Math.round(v * m) / m
}
function medalForRank(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

async function copyToClip(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Address copied')
  } catch {
    toast.error('Copy failed')
  }
}