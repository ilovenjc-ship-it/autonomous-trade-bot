import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown, Search, Filter, Star,
  Lock, Unlock, X, AlertTriangle, CheckCircle2, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'

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
  sparkline: number[]
  alpha_price: number | null
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

// ── Monitored subnet UIDs (matches backend TRADING_NETUIDS) ──────────────────
const MONITORED_UIDS = new Set([0, 8, 9, 18, 64, 96])

// ── sub-components ────────────────────────────────────────────────────────────

/** Mini SVG sparkline — last dot is highlighted, color follows trend */
function SparklineChart({ data, trend }: { data: number[] | undefined; trend: string }) {
  const pts = data && data.length >= 2 ? data : null
  if (!pts) {
    if (trend === 'up')   return <TrendingUp   size={12} className="text-accent-green" />
    if (trend === 'down') return <TrendingDown  size={12} className="text-red-400" />
    return <Minus size={12} className="text-slate-400" />
  }
  const W = 72, H = 26
  const color = trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : '#94a3b8'
  const fillColor = trend === 'up' ? 'rgba(52,211,153,0.08)' : trend === 'down' ? 'rgba(248,113,113,0.08)' : 'rgba(148,163,184,0.05)'
  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - 2 - (v * (H - 4))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polyStr = points.join(' ')
  // Area fill path
  const areaPath = `M ${points[0]} L ${points.join(' L ')} L ${W},${H} L 0,${H} Z`
  const lastX = parseFloat(points[points.length - 1].split(',')[0])
  const lastY = parseFloat(points[points.length - 1].split(',')[1])
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={areaPath} fill={fillColor} />
      <polyline points={polyStr} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

// ── Stake / Unstake modal ─────────────────────────────────────────────────────
interface StakeModalProps {
  subnet: Subnet | null
  onClose: () => void
}

function StakeModal({ subnet, onClose }: StakeModalProps) {
  const [tab, setTab] = useState<'stake' | 'unstake'>('stake')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [stakePosition, setStakePosition] = useState<{ hotkey: string; alpha: number; tao: number } | null>(null)
  const [loadingPos, setLoadingPos] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Load current stake position for this subnet
  useEffect(() => {
    if (!subnet) return
    setLoadingPos(true)
    api.get('/wallet/stakes').then(res => {
      const stakes: any[] = res.data?.stakes ?? []
      const pos = stakes.find((s: any) => s.netuid === subnet.uid)
      if (pos) {
        setStakePosition({ hotkey: pos.hotkey, alpha: pos.stake ?? 0, tao: pos.tao_value ?? 0 })
      } else {
        setStakePosition(null)
      }
    }).catch(() => setStakePosition(null)).finally(() => setLoadingPos(false))
  }, [subnet])

  if (!subnet) return null

  async function handleStake() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid TAO amount'); return }
    setLoading(true)
    try {
      const res = await api.post('/wallet/stake-subnet', { netuid: subnet!.uid, amount_tao: amt })
      if (res.data?.success) {
        toast.success(`Staked ${amt}τ into SN${subnet!.uid} ✓`)
        onClose()
      } else {
        toast.error(res.data?.error ?? 'Stake failed')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnstake() {
    if (!stakePosition) { toast.error('No stake position found on this subnet'); return }
    const amt = parseFloat(amount) || stakePosition.alpha
    if (amt <= 0) { toast.error('Enter amount or use full position'); return }
    setLoading(true)
    try {
      const res = await api.post('/wallet/unstake-position', {
        netuid: subnet!.uid,
        hotkey: stakePosition.hotkey,
        amount_tao: amt,
      })
      if (res.data?.success) {
        toast.success(`Unstaked ${amt.toFixed(4)}α from SN${subnet!.uid} ✓`)
        onClose()
      } else {
        toast.error(res.data?.error ?? 'Unstake failed')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-dark-800 border border-dark-500 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600">
          <div className="flex items-center gap-2.5">
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono',
              MONITORED_UIDS.has(subnet.uid) ? 'bg-accent-green/20 text-accent-green' : 'bg-dark-600 text-slate-300'
            )}>
              {subnet.uid}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{subnet.name}</p>
              <p className="text-slate-400 font-mono text-xs">{subnet.ticker.toUpperCase()} · SN{subnet.uid}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Current stats */}
        <div className="grid grid-cols-3 gap-0 border-b border-dark-600">
          <div className="px-5 py-3 text-center border-r border-dark-600">
            <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide">APY</p>
            <p className="text-sm font-bold text-accent-green font-mono">{subnet.apy.toFixed(1)}%</p>
          </div>
          <div className="px-5 py-3 text-center border-r border-dark-600">
            <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide">Staked</p>
            <p className="text-sm font-bold text-white font-mono">{fmtTAO(subnet.stake_tao)}</p>
          </div>
          <div className="px-5 py-3 text-center">
            <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide">α Price</p>
            <p className="text-sm font-bold text-accent-blue font-mono">
              {subnet.alpha_price != null ? `${subnet.alpha_price.toFixed(4)}` : '—'}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-dark-600">
          {(['stake', 'unstake'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount('') }}
              className={clsx(
                'flex-1 py-3 text-sm font-semibold font-mono uppercase tracking-wide transition-colors',
                tab === t
                  ? t === 'stake'
                    ? 'bg-accent-green/10 text-accent-green border-b-2 border-accent-green'
                    : 'bg-red-500/10 text-red-400 border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {t === 'stake' ? <><Lock size={12} className="inline mr-1.5" />Stake</> : <><Unlock size={12} className="inline mr-1.5" />Unstake</>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {tab === 'unstake' && (
            loadingPos ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                <RefreshCw size={12} className="animate-spin" /> Loading position…
              </div>
            ) : stakePosition ? (
              <div className="bg-dark-700 border border-dark-500 rounded-lg px-4 py-3">
                <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1">Your Position · SN{subnet.uid}</p>
                <p className="text-white font-semibold font-mono">{stakePosition.alpha.toFixed(5)} α</p>
                <p className="text-xs text-slate-400 font-mono">≈ {fmtTAO(stakePosition.tao)} TAO value</p>
                <button
                  onClick={() => setAmount(stakePosition.alpha.toFixed(6))}
                  className="mt-2 text-xs text-accent-blue hover:text-white font-mono underline underline-offset-2 transition-colors"
                >
                  Use full position
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2.5">
                <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-300 font-mono">No active stake position on SN{subnet.uid}</p>
              </div>
            )
          )}

          {/* Amount input */}
          <div>
            <label className="block text-xs text-slate-400 font-mono mb-1.5 uppercase tracking-wide">
              {tab === 'stake' ? 'Amount to Stake (τ TAO)' : 'Amount to Unstake (α alpha)'}
            </label>
            <div className="flex items-center gap-2 bg-dark-700 border border-dark-500 focus-within:border-accent-blue rounded-lg px-3 py-2 transition-colors">
              <input
                type="number"
                min="0"
                step="0.001"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={tab === 'stake' ? '0.000 τ' : '0.00000 α'}
                className="flex-1 bg-transparent text-white font-mono text-sm focus:outline-none placeholder-slate-600"
              />
              <span className="text-slate-400 font-mono text-xs">{tab === 'stake' ? 'τ' : 'α'}</span>
            </div>
          </div>

          {/* Info banner */}
          {tab === 'stake' && (
            <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono space-y-0.5">
              <p>• Stake routes through the II Agent's configured validator for SN{subnet.uid}</p>
              <p>• On-chain execution takes ~12 s (one block)</p>
              <p>• Keep at least 0.01τ liquid for fees</p>
            </div>
          )}
          {tab === 'unstake' && (
            <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono space-y-0.5">
              <p>• Unstake converts your α back to τ at the current alpha price</p>
              <p>• On-chain execution takes ~12 s (one block)</p>
              <p>• Partial unstake supported — enter a custom α amount</p>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={tab === 'stake' ? handleStake : handleUnstake}
            disabled={loading || (tab === 'unstake' && !stakePosition && !amount)}
            className={clsx(
              'w-full py-3 rounded-xl font-semibold font-mono text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
              tab === 'stake'
                ? 'bg-accent-green/20 hover:bg-accent-green/30 border border-accent-green/40 text-accent-green hover:shadow-lg hover:shadow-accent-green/20'
                : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:shadow-lg hover:shadow-red-500/20'
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={13} className="animate-spin" />
                {tab === 'stake' ? 'Staking…' : 'Unstaking…'}
              </span>
            ) : tab === 'stake' ? (
              <span className="flex items-center justify-center gap-1.5"><Lock size={13} />Stake τ{amount || '0'} into SN{subnet.uid}</span>
            ) : (
              <span className="flex items-center justify-center gap-1.5"><Unlock size={13} />Unstake from SN{subnet.uid}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
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
  const navigate = useNavigate()
  const [subnets,  setSubnets]  = useState<Subnet[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [sortCol,  setSortCol]  = useState<SortKey>('stake_tao')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [search,   setSearch]   = useState('')
  const [minApy,   setMinApy]   = useState(0)
  const [autoRef,  setAutoRef]  = useState(true)
  const [stakeSubnet, setStakeSubnet] = useState<Subnet | null>(null)

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

  const setMarketPageStats = useBotStore(s => s.setMarketPageStats)
  const toggleAutoRef = useCallback(() => setAutoRef(v => !v), [])
  useEffect(() => {
    setMarketPageStats({ subnets: subnets.length, upCount, downCount, autoRef, toggleAutoRef })
    return () => setMarketPageStats(null)
  }, [subnets.length, upCount, downCount, autoRef, toggleAutoRef, setMarketPageStats])

  return (
    <div className="flex flex-col h-full bg-dark-900">

      {/* ── KPI + Filters ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-4 pb-4 border-b border-dark-600">

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

          {/* "Actively monitored by II Agent" — Session XXXV: relocated FROM
              the legend bar (which has been removed) onto the same line as
              the Search box, sitting right of the APY percentages. */}
          <span className="flex items-center gap-1.5 ml-auto px-2.5 py-1 rounded-md bg-accent-green/8 border border-accent-green/20 text-[11px] font-mono text-accent-green">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse flex-shrink-0" />
            Actively monitored by II Agent
          </span>
        </div>
      </div>

      {/* Legend bar removed (Session XXXV) — "Top 3 subnets by rank" was deemed
          unnecessary by Mav (the gold ⭐ star next to the rank-1/2/3 rows is
          self-documenting). The "Actively monitored by II Agent" indicator
          relocated up to the filter row above. */}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-dark-900 border-b border-dark-600">
            <tr className="text-slate-400 uppercase tracking-wider font-mono text-[11px]">
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
              <SortTh col="score"      label="Score"       current={sortCol} order={sortAsc ? 'asc' : 'desc'} onClick={toggleSort} />
              <th className="px-4 py-3 text-center">7d Trend</th>
              <th className="px-3 py-3 text-center">Stake</th>
            </tr>
          </thead>
          <tbody>
            {loading && !subnets.length && (
              <tr>
                <td colSpan={11} className="py-16 text-center">
                  <RefreshCw size={18} className="animate-spin text-slate-400 mx-auto" />
                </td>
              </tr>
            )}

            {subnets.map((s, idx) => (
              <tr
                key={s.uid}
                onClick={() => navigate(`/market/subnet/${s.uid}`)}
                className={clsx(
                  'border-b border-dark-700/40 hover:bg-dark-800/60 transition-colors cursor-pointer group',
                  idx % 2 === 0 ? '' : 'bg-dark-800/20',
                  MONITORED_UIDS.has(s.uid) && 'ring-inset ring-1 ring-accent-green/20'
                )}
              >
                {/* Rank */}
                <td className="px-4 py-2.5 text-slate-400 font-mono">{idx + 1}</td>

                {/* Subnet name — Session XXXV: rank-star + monitor-dot now
                    live in fixed-width gutters so subnet names line up the
                    same way regardless of whether either indicator is
                    present (was: conditional inline, mis-aligned columns). */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-3 flex-shrink-0">
                      {idx < 3 && <Star size={10} className="text-yellow-400" />}
                    </span>
                    <span className="flex items-center justify-center w-3 flex-shrink-0">
                      {MONITORED_UIDS.has(s.uid) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" title="II Agent actively monitors this subnet" />
                      )}
                    </span>
                    <div>
                      <p className="text-white font-medium group-hover:text-accent-blue transition-colors">{s.name}</p>
                      <p className="text-slate-400 font-mono text-[11px]">SN{s.uid}</p>
                    </div>
                    <ExternalLink size={10} className="text-slate-600 group-hover:text-accent-blue transition-colors ml-0.5 flex-shrink-0" />
                  </div>
                </td>

                {/* Ticker */}
                <td className="px-4 py-2.5">
                  <span className="font-mono text-slate-300 text-[11px] bg-dark-700 px-1.5 py-0.5 rounded">
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
                <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                  {(s.emission ?? 0).toFixed(4)}
                </td>

                {/* Miners */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {s.miners}
                </td>

                {/* Score bar */}
                <td className="px-4 py-2.5">
                  <ScoreBar score={s.score} />
                </td>

                {/* 7d Trend Sparkline — last data point on the row */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center">
                    <SparklineChart data={s.sparkline} trend={s.trend} />
                  </div>
                </td>

                {/* Stake button */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setStakeSubnet(s)}
                    className={clsx(
                      'px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all duration-150',
                      'bg-dark-600 border border-dark-500 text-slate-300',
                      'hover:bg-accent-green/20 hover:border-accent-green/50 hover:text-accent-green hover:shadow-sm hover:shadow-accent-green/20',
                    )}
                    title={`Stake / Unstake on SN${s.uid}`}
                  >
                    <Lock size={10} className="inline mr-1" />
                    STAKE
                  </button>
                </td>
              </tr>
            ))}

            {!loading && subnets.length === 0 && (
              <tr>
                <td colSpan={11} className="py-16 text-center text-slate-400 font-mono">
                  No subnets match filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-dark-600 flex items-center justify-between">
        <p className="text-xs text-slate-400 font-mono">
          Click any row to view subnet details · auto-refresh every 15s
        </p>
        <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />
          Green glow = II Agent actively monitoring
        </p>
      </div>

      {/* Stake / Unstake modal */}
      {stakeSubnet && <StakeModal subnet={stakeSubnet} onClose={() => setStakeSubnet(null)} />}
    </div>
  )
}