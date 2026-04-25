import { useEffect, useState, useCallback } from 'react'
import {
  Globe, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown, Search, Filter, Star,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────────
interface Subnet {
  uid: number
  name: string
  ticker: string
  stake_tao: number
  stake_usd: number
  emission: number
  apy: number
  miners: number
  trend: 'up' | 'down' | 'neutral'
  score: number
}

interface Overview {
  tao_price: number
  total_subnets: number
  total_stake_tao: number
  total_stake_usd: number
  avg_apy: number
  top_subnet: Subnet
  up_subnets: number
  down_subnets: number
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTAO(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M τ`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K τ`
  return `${v.toFixed(0)} τ`
}

function fmtUSD(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

type SortKey = 'uid' | 'stake_tao' | 'stake_usd' | 'apy' | 'emission' | 'miners' | 'score'

// ── sub-components ────────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up')   return <TrendingUp   size={12} className="text-accent-green" />
  if (trend === 'down') return <TrendingDown  size={12} className="text-red-400" />
  return <Minus size={12} className="text-slate-300" />
}

function ApyBadge({ apy }: { apy: number }) {
  const color =
    apy >= 40 ? 'bg-accent-green/20 text-accent-green' :
    apy >= 25 ? 'bg-blue-500/20 text-blue-400' :
    apy >= 15 ? 'bg-yellow-400/20 text-yellow-400' :
                'bg-dark-600 text-slate-300'
  return (
    <span className={clsx('px-2 py-0.5 rounded font-mono text-[14px] font-semibold', color)}>
      {(apy ?? 0).toFixed(1)}%
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  // score roughly 80–120 for real subnets
  const pct = Math.min(100, Math.max(0, (score - 60) / 80 * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-dark-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-blue to-accent-green rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-slate-300">{(score ?? 0).toFixed(0)}</span>
    </div>
  )
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex flex-col gap-1 min-w-0">
      <p className="text-[13px] text-slate-300 uppercase tracking-widest font-mono truncate">{label}</p>
      <p className={clsx('text-xl font-bold font-mono truncate', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-[13px] text-slate-300 truncate">{sub}</p>}
    </div>
  )
}

function SortTh({
  col, label, current, order, onClick,
}: {
  col: SortKey; label: string; current: SortKey; order: 'asc' | 'desc'; onClick: (c: SortKey) => void
}) {
  const active = col === current
  return (
    <th
      className="px-4 py-3 text-right cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => onClick(col)}
    >
      <span className="flex items-center justify-end gap-1">
        {label}
        {active
          ? order === 'desc'
            ? <ChevronDown size={11} className="text-accent-blue" />
            : <ChevronUp   size={11} className="text-accent-blue" />
          : <ChevronUp size={11} className="text-slate-700" />
        }
      </span>
    </th>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function MarketData() {
  const [subnets,  setSubnets]  = useState<Subnet[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [sortCol,  setSortCol]  = useState<SortKey>('stake_tao')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [search,   setSearch]   = useState('')
  const [minApy,   setMinApy]   = useState(0)
  const [autoRef,  setAutoRef]  = useState(true)

  const load = useCallback(async () => {
    const [ovRes, snRes] = await Promise.allSettled([
      api.get('/market/overview'),
      api.get('/market/subnets', {
        params: { sort: sortCol, order: sortAsc ? 'asc' : 'desc', min_apy: minApy, search },
      }),
    ])
    if (ovRes.status === 'fulfilled') setOverview(ovRes.value.data)
    else console.error('Market overview fetch error', ovRes.reason)
    if (snRes.status === 'fulfilled') setSubnets(snRes.value.data.subnets ?? [])
    else console.error('Market subnets fetch error', snRes.reason)
    setLoading(false)
  }, [sortCol, sortAsc, minApy, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRef) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [autoRef, load])

  function toggleSort(col: SortKey) {
    if (col === sortCol) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const upCount   = subnets.filter(s => s.trend === 'up').length
  const downCount = subnets.filter(s => s.trend === 'down').length

  return (
    <div className="flex flex-col h-full bg-dark-900">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Globe size={22} className="text-accent-blue" />
              Market Data
            </h1>
            <p className="text-sm text-slate-300 mt-0.5">
              {subnets.length} subnets ·
              <span className="text-accent-green ml-1">↑{upCount}</span>
              <span className="text-red-400 ml-1">↓{downCount}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRef(!autoRef)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border transition-colors',
                autoRef
                  ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                  : 'bg-dark-700 text-slate-300 border-dark-600'
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', autoRef ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
              {autoRef ? 'AUTO' : 'MANUAL'}
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white transition-colors font-mono"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI row */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
            <KPI label="TAO Price"       value={`$${(overview.tao_price ?? 0).toFixed(2)}`}  color="text-accent-blue" />
            <KPI label="Total Staked"    value={fmtTAO(overview.total_stake_tao)}     sub={fmtUSD(overview.total_stake_usd)} />
            <KPI label="Avg APY"         value={`${(overview.avg_apy ?? 0).toFixed(1)}%`}    color="text-accent-green" />
            <KPI label="Active Subnets"  value={`${overview.total_subnets}`}          sub={`${upCount}↑ / ${downCount}↓`} />
            <KPI label="Top Subnet"      value={overview.top_subnet?.name?.slice(0, 12) ?? '—'} sub={overview.top_subnet?.uid != null ? `SN${overview.top_subnet.uid}` : '—'} />
            <KPI label="Top Stake"       value={fmtTAO(overview.top_subnet?.stake_tao)} color="text-yellow-400" />
          </div>
        )}

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-slate-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subnets…"
              className="bg-transparent text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none w-36"
            />
          </div>

          {/* Min APY */}
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="text-slate-300" />
            <span className="text-xs text-slate-300 font-mono">Min APY:</span>
            {[0, 10, 20, 30].map(v => (
              <button
                key={v}
                onClick={() => setMinApy(v)}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-mono transition-colors',
                  minApy === v ? 'bg-accent-blue/20 text-accent-blue' : 'text-slate-300 hover:text-white'
                )}
              >
                {v === 0 ? 'All' : `${v}%+`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-dark-900 border-b border-dark-600">
            <tr className="text-slate-300 uppercase tracking-wider font-mono">
              <th className="px-4 py-3 text-left w-10">
                <span className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => toggleSort('uid')}>
                  # {sortCol === 'uid' ? (sortAsc ? <ChevronUp size={10} className="text-accent-blue" /> : <ChevronDown size={10} className="text-accent-blue" />) : <ChevronUp size={10} className="text-slate-700" />}
                </span>
              </th>
              <th className="px-4 py-3 text-left">Subnet</th>
              <th className="px-4 py-3 text-left">Ticker</th>
              <SortTh col="stake_tao"  label="Staked (τ)"  current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <SortTh col="stake_usd"  label="Staked ($)"  current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <SortTh col="apy"        label="APY"         current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <SortTh col="emission"   label="Emission"    current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <SortTh col="miners"     label="Miners"      current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <th className="px-4 py-3 text-center">Trend</th>
              <SortTh col="score"      label="Score"       current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {loading && !subnets.length && (
              <tr>
                <td colSpan={10} className="py-16 text-center">
                  <RefreshCw size={18} className="animate-spin text-slate-300 mx-auto" />
                </td>
              </tr>
            )}

            {subnets.map((s, idx) => (
              <tr
                key={s.uid}
                className={clsx(
                  'border-b border-dark-700/40 hover:bg-dark-800/60 transition-colors',
                  idx % 2 === 0 ? '' : 'bg-dark-800/20'
                )}
              >
                {/* Rank */}
                <td className="px-4 py-2.5 text-slate-300 font-mono">{idx + 1}</td>

                {/* Subnet name */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {idx < 3 && <Star size={10} className="text-yellow-400 flex-shrink-0" />}
                    <div>
                      <p className="text-white font-medium">{s.name}</p>
                      <p className="text-slate-300 font-mono text-[13px]">SN{s.uid}</p>
                    </div>
                  </div>
                </td>

                {/* Ticker */}
                <td className="px-4 py-2.5">
                  <span className="font-mono text-slate-300 text-[14px] bg-dark-700 px-1.5 py-0.5 rounded">
                    {s.ticker.toUpperCase()}
                  </span>
                </td>

                {/* Stake TAO */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {fmtTAO(s.stake_tao)}
                </td>

                {/* Stake USD */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {fmtUSD(s.stake_usd)}
                </td>

                {/* APY */}
                <td className="px-4 py-2.5 text-right">
                  <ApyBadge apy={s.apy} />
                </td>

                {/* Emission */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {(s.emission ?? 0).toFixed(4)}
                </td>

                {/* Miners */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {s.miners}
                </td>

                {/* Trend */}
                <td className="px-4 py-2.5 text-center">
                  <div className="flex justify-center">
                    <TrendIcon trend={s.trend} />
                  </div>
                </td>

                {/* Score bar */}
                <td className="px-4 py-2.5">
                  <ScoreBar score={s.score} />
                </td>
              </tr>
            ))}

            {!loading && subnets.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-slate-300 font-mono">
                  No subnets match filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-dark-600">
        <p className="text-xs text-slate-300 font-mono">
          Live Bittensor Finney mainnet · stake &amp; trend data from on-chain metagraph · auto-refresh every 15s
        </p>
      </div>
    </div>
  )
}