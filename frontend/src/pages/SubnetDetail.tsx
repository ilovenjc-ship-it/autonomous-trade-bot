/**
 * SubnetDetail — full token/subnet information page
 * Opened when operator clicks a subnet row on the Market Data table.
 * Route: /market/subnet/:uid
 *
 * Sections:
 *  1. Header — name, ticker, UID, II Agent status badge
 *  2. Key metrics grid — stake, APY, emission, miners, score, alpha price
 *  3. Sparkline / price chart (large)
 *  4. Subnet description
 *  5. Stake / Unstake inline panel
 *  6. External resource links
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, ExternalLink, Shield, TrendingUp, TrendingDown,
  Minus, Lock, Unlock, AlertTriangle, CheckCircle2, Activity, Users,
  Zap, BarChart2, Globe, X, Info, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import WhaleActivityPanel from '@/components/WhaleActivityPanel'

// ── types ─────────────────────────────────────────────────────────────────────
interface SubnetDetail {
  uid: number
  name: string
  ticker: string
  stake_tao: number
  stake_usd: number
  emission: number
  apy: number
  miners: number
  trend: string
  score: number
  sparkline: number[]
  alpha_price: number | null
  price_history: number[]
  description: string
  is_monitored: boolean
  taostats_url: string
  tao_app_url: string
  signal_candidate_label: string
  data_source: string
}

interface StakePosition {
  hotkey: string
  alpha: number
  tao_value: number
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTAO(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M τ`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K τ`
  return `${v.toFixed(2)} τ`
}
function fmtUSD(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

// ── Large SVG sparkline chart ─────────────────────────────────────────────────
function LargeChart({ data, trend }: { data: number[]; trend: string }) {
  const W = 600, H = 120
  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 font-mono text-sm">
        Collecting price history — check back after next poll cycle
      </div>
    )
  }

  const mn = Math.min(...data)
  const mx = Math.max(...data)
  const rng = mx - mn || 1
  const pad = 8

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
    const y = H - pad - ((v - mn) / rng) * (H - 2 * pad)
    return { x, y, v }
  })
  const polyStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `M ${pts[0].x},${pts[0].y} ${pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L ${pts[pts.length - 1].x},${H} L ${pts[0].x},${H} Z`

  const color = trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : '#94a3b8'
  const fillGrad = trend === 'up' ? ['rgba(52,211,153,0.25)', 'rgba(52,211,153,0.0)']
                 : trend === 'down' ? ['rgba(248,113,113,0.2)', 'rgba(248,113,113,0.0)']
                 : ['rgba(148,163,184,0.12)', 'rgba(148,163,184,0.0)']
  const gradId = `grad-${trend}`

  const last = pts[pts.length - 1]
  const pctChange = data.length >= 2
    ? ((data[data.length - 1] - data[0]) / (data[0] || 1)) * 100
    : 0

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillGrad[0]} />
            <stop offset="100%" stopColor={fillGrad[1]} />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} x2={W} y1={pad + (1 - f) * (H - 2 * pad)} y2={pad + (1 - f) * (H - 2 * pad)}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />
        {/* Line */}
        <polyline points={polyStr} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Last dot */}
        <circle cx={last.x} cy={last.y} r="4" fill={color} />
        <circle cx={last.x} cy={last.y} r="7" fill={color} fillOpacity="0.25" />
      </svg>
      {/* Change badge overlay */}
      <div className={clsx('absolute top-2 right-2 text-xs font-mono font-bold px-2 py-0.5 rounded-full',
        pctChange > 0 ? 'bg-accent-green/20 text-accent-green' :
        pctChange < 0 ? 'bg-red-500/20 text-red-400' :
        'bg-dark-600 text-slate-400'
      )}>
        {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}% ({data.length} pts)
      </div>
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  icon, label, value, sub, color, badge,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; badge?: React.ReactNode
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col gap-1.5 relative overflow-hidden">
      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono uppercase tracking-wider">
        {icon}
        {label}
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <p className={clsx('text-xl font-bold font-mono', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-400 font-mono">{sub}</p>}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function SubnetDetail() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const netuid = Number(uid)

  // Day 12 (cont.) — Mark's nav-context fix:
  //   Subnet Detail is reachable from two pages:
  //     • /market           (Subnet Market Data — Top Subnets card + table)
  //     • /analytics        (Subnet Analytics — Heat Map)
  //   The back button used to hard-code /market, which sent Analytics
  //   visitors to the wrong page.  Each entry point now passes
  //   `state: { from, label }` on navigate(); we read it here and fall
  //   back to /market for direct URL hits.
  const navState = (location.state ?? {}) as { from?: string; label?: string }
  const backTo    = navState.from  ?? '/market'
  const backLabel = navState.label ?? 'Market Data'

  const [detail, setDetail]     = useState<SubnetDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Stake panel state
  const [stakeTab, setStakeTab]       = useState<'stake' | 'unstake'>('stake')
  const [stakeAmt, setStakeAmt]       = useState('')
  const [stakeLoading, setStakeLoading] = useState(false)
  const [position, setPosition]       = useState<StakePosition | null>(null)
  const [posLoading, setPosLoading]   = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────
  // Day 16 (Bug #3): falsy-zero guard. Previously `if (!netuid) return`
  // short-circuited on Subnet 0 (Root) because Number("0") === 0 is falsy
  // in JS, so the detail page never fetched. Use Number.isFinite to accept 0
  // and reject NaN/undefined.
  const load = useCallback(async () => {
    if (!Number.isFinite(netuid)) return
    try {
      const res = await api.get(`/market/subnet/${netuid}`)
      setDetail(res.data)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to load subnet data')
    } finally {
      setLoading(false)
    }
  }, [netuid])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  // Load stake position
  // Day 16 (Bug #3): same falsy-zero guard as `load` above — Subnet 0 has netuid=0.
  const loadPosition = useCallback(async () => {
    if (!Number.isFinite(netuid)) return
    setPosLoading(true)
    try {
      const res = await api.get('/wallet/stakes')
      const stakes: any[] = res.data?.stakes ?? []
      const pos = stakes.find((s: any) => s.netuid === netuid)
      setPosition(pos ? { hotkey: pos.hotkey, alpha: pos.stake ?? 0, tao_value: pos.tao_value ?? 0 } : null)
    } catch {
      setPosition(null)
    } finally {
      setPosLoading(false)
    }
  }, [netuid])

  useEffect(() => { loadPosition() }, [loadPosition])

  // ── Stake / Unstake handlers ─────────────────────────────────────────────
  async function handleStake() {
    const amt = parseFloat(stakeAmt)
    if (!amt || amt <= 0) { toast.error('Enter a valid TAO amount'); return }
    setStakeLoading(true)
    try {
      const res = await api.post('/wallet/stake-subnet', { netuid, amount_tao: amt })
      if (res.data?.success) {
        toast.success(`Staked ${amt}τ into SN${netuid} ✓`)
        setStakeAmt('')
        loadPosition()
        load()
      } else {
        toast.error(res.data?.error ?? 'Stake failed')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Network error')
    } finally {
      setStakeLoading(false)
    }
  }

  async function handleUnstake() {
    if (!position) { toast.error('No stake position found on this subnet'); return }
    const amt = parseFloat(stakeAmt) || position.alpha
    if (amt <= 0) { toast.error('Enter amount or use full position'); return }
    setStakeLoading(true)
    try {
      const res = await api.post('/wallet/unstake-position', {
        netuid,
        hotkey: position.hotkey,
        amount_tao: amt,
      })
      if (res.data?.success) {
        toast.success(`Unstaked ${amt.toFixed(4)}α from SN${netuid} ✓`)
        setStakeAmt('')
        loadPosition()
        load()
      } else {
        toast.error(res.data?.error ?? 'Unstake failed')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Network error')
    } finally {
      setStakeLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-900">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-accent-blue" />
          <p className="text-slate-400 font-mono text-sm">Loading SN{netuid}…</p>
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-900">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-white font-semibold">Subnet not found</p>
          <p className="text-slate-400 text-sm">{error ?? `SN${netuid} data unavailable`}</p>
          <button onClick={() => navigate(backTo)} className="px-4 py-2 bg-dark-700 border border-dark-500 rounded-lg text-sm text-white hover:bg-dark-600 transition-colors">
            ← Back to {backLabel}
          </button>
        </div>
      </div>
    )
  }

  const trendColor = detail.trend === 'up' ? 'text-accent-green' : detail.trend === 'down' ? 'text-red-400' : 'text-slate-400'
  const TrendIco = detail.trend === 'up' ? TrendingUp : detail.trend === 'down' ? TrendingDown : Minus

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-auto">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur border-b border-dark-600 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-mono"
        >
          <ArrowLeft size={15} />
          {backLabel}
        </button>
        <div className="h-4 w-px bg-dark-600" />

        {/* Subnet identity */}
        <div className="flex items-center gap-3 flex-1">
          <div className={clsx(
            'w-9 h-9 rounded-xl flex items-center justify-center font-bold font-mono text-sm border',
            detail.is_monitored
              ? 'bg-accent-green/15 border-accent-green/40 text-accent-green'
              : 'bg-dark-700 border-dark-500 text-slate-300'
          )}>
            {netuid}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-white font-semibold text-base">{detail.name}</h1>
              {detail.is_monitored && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-accent-green/15 border border-accent-green/30 rounded-full text-[10px] font-mono text-accent-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                  Ari Active
                </span>
              )}
            </div>
            <p className="text-slate-400 font-mono text-xs">
              {detail.ticker.toUpperCase()} · SN{netuid} · {detail.data_source === 'live' ? '🟢 Live' : '🔵 Simulated'}
            </p>
          </div>
        </div>

        {/* Header action */}
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <a href={detail.taostats_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-xs font-mono text-slate-300 hover:text-white hover:border-accent-blue/50 transition-colors">
            <ExternalLink size={11} />
            Taostats
          </a>
          <a href={detail.tao_app_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-xs font-mono text-slate-300 hover:text-white hover:border-accent-blue/50 transition-colors">
            <Globe size={11} />
            TAO.app
          </a>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5 max-w-6xl mx-auto w-full">

        {/* ── Metrics grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            icon={<Lock size={11} />}
            label="Total Staked"
            value={fmtTAO(detail.stake_tao)}
            sub={fmtUSD(detail.stake_usd)}
            color="text-white"
          />
          <MetricCard
            icon={<Zap size={11} />}
            label="APY"
            value={`${detail.apy.toFixed(1)}%`}
            color={detail.apy >= 30 ? 'text-accent-green' : detail.apy >= 15 ? 'text-blue-400' : 'text-yellow-400'}
          />
          <MetricCard
            icon={<Activity size={11} />}
            label="Emission / block"
            value={detail.emission.toFixed(6)}
            sub="τ per block"
            color="text-slate-300"
          />
          <MetricCard
            icon={<Users size={11} />}
            label="Active Miners"
            value={String(detail.miners)}
            color="text-white"
          />
          <MetricCard
            icon={<BarChart2 size={11} />}
            label="Score"
            value={detail.score.toFixed(1)}
            sub="log₁₀(stake)×10 + APY"
            color="text-accent-blue"
          />
          <MetricCard
            icon={<TrendIco size={11} />}
            label="α Price"
            value={detail.alpha_price != null ? `${detail.alpha_price.toFixed(6)}` : '—'}
            sub="dTAO alpha"
            color={trendColor}
          />
        </div>

        {/* ── Price chart ──────────────────────────────────────────────── */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold text-sm">Alpha Price Trend</h2>
              <span className={clsx('flex items-center gap-1 text-xs font-mono', trendColor)}>
                <TrendIco size={11} />
                {detail.trend}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {detail.price_history.length > 0
                ? `${detail.price_history.length} on-chain snapshots (60s apart)`
                : 'Synthetic sparkline — real data accumulates over time'}
            </span>
          </div>
          <LargeChart
            data={detail.price_history.length >= 2 ? detail.price_history : detail.sparkline}
            trend={detail.trend}
          />
        </div>

        {/* ── Description ─────────────────────────────────────────────── */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-slate-400" />
              <h2 className="text-white font-semibold text-sm">About SN{netuid}</h2>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={detail.taostats_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-400 hover:text-accent-blue border border-dark-600 hover:border-accent-blue/40 transition-colors"
              >
                <BarChart2 size={10} />
                Taostats
                <ExternalLink size={9} />
              </a>
              <a
                href={detail.tao_app_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-400 hover:text-purple-400 border border-dark-600 hover:border-purple-500/40 transition-colors"
              >
                <Globe size={10} />
                TAO.app
                <ExternalLink size={9} />
              </a>
            </div>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{detail.description}</p>
          {detail.is_monitored && (
            <div className="mt-3 flex items-start gap-2 bg-accent-green/8 border border-accent-green/25 rounded-lg px-3 py-2.5">
              <Shield size={13} className="text-accent-green flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent-green/90 font-mono">
                Ari actively coordinates stake on this subnet. Consensus-approved signals from
                the Fleet Consensus engine routes TAO in and out via the configured validator. Performance data
                feeds directly into the Strategy Leaderboard and P&L Summary.
              </p>
            </div>
          )}
        </div>

        {/* ── Whale Flow panel ──────────────────────────────────────────
            Phase 1 (Session XXXVII) replicated Talisman's Whale Activity
            pattern, originally backed by TaoStats /api/delegation/v1.
            Session XXXVIII pivot: now sourced from a direct Finney WS
            subscription (zero subscription cost, lower latency, tighter
            data contract). Canonical name is "Whale Flow" everywhere
            user-facing; legacy filename WhaleActivityPanel.tsx kept to
            avoid a churn-only rename. ───────────────────────────────── */}
        <WhaleActivityPanel netuid={netuid} />

        {/* ── Stake / Unstake panel ────────────────────────────────────── */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-600">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <Lock size={13} className="text-accent-green" />
              Stake Management
            </h2>
            {position ? (
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <CheckCircle2 size={11} className="text-accent-green" />
                <span className="text-accent-green">Open position: {position.alpha.toFixed(5)} α</span>
              </div>
            ) : posLoading ? (
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" /> Loading…
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-mono">No open position on SN{netuid}</span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-dark-600">
            {(['stake', 'unstake'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setStakeTab(t); setStakeAmt('') }}
                className={clsx(
                  'flex-1 py-3 text-sm font-semibold font-mono uppercase tracking-wide transition-colors',
                  stakeTab === t
                    ? t === 'stake'
                      ? 'bg-accent-green/10 text-accent-green border-b-2 border-accent-green'
                      : 'bg-red-500/10 text-red-400 border-b-2 border-red-500'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                {t === 'stake'
                  ? <><Lock size={12} className="inline mr-1.5" />Stake TAO</>
                  : <><Unlock size={12} className="inline mr-1.5" />Unstake α</>}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {/* Position summary (unstake only) */}
            {stakeTab === 'unstake' && (
              posLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                  <RefreshCw size={12} className="animate-spin" /> Loading position…
                </div>
              ) : position ? (
                <div className="bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1">Your Position</p>
                    <p className="text-white font-semibold font-mono text-base">{position.alpha.toFixed(5)} α</p>
                    <p className="text-xs text-slate-400 font-mono">≈ {fmtTAO(position.tao_value)} at current alpha price</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">via {position.hotkey.slice(0, 20)}…</p>
                  </div>
                  <button
                    onClick={() => setStakeAmt(position.alpha.toFixed(6))}
                    className="text-xs text-accent-blue hover:text-white font-mono underline underline-offset-2 transition-colors flex-shrink-0 ml-4"
                  >
                    Use full position
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2.5">
                  <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0" />
                  <p className="text-xs text-yellow-300 font-mono">No active stake position found on SN{netuid}</p>
                </div>
              )
            )}

            {/* Input row — single column, help tooltip on label */}
            <div className="max-w-md">
              {/* Label row with hover-help */}
              <div className="flex items-center gap-2 mb-1.5 group relative">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wide">
                  {stakeTab === 'stake' ? 'Amount to Stake (τ TAO)' : 'Amount to Unstake (α alpha)'}
                </label>
                {/* Help trigger */}
                <div className="relative">
                  <HelpCircle size={13} className="text-slate-600 hover:text-slate-300 cursor-help transition-colors" />
                  {/* Tooltip — visible on hover of the icon */}
                  <div className="absolute left-5 top-0 z-50 w-72 bg-dark-900 border border-dark-500 rounded-xl p-4 shadow-2xl text-xs font-mono text-slate-400 space-y-1.5 leading-relaxed
                    opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                    {stakeTab === 'stake' ? (
                      <>
                        <p className="text-slate-200 font-bold mb-2">How staking works</p>
                        <p>• Your τ TAO converts to α alpha tokens at the current bonding-curve rate</p>
                        <p>• Alpha earns yield from subnet emission — current APY: <span className="text-accent-green font-bold">{detail.apy.toFixed(1)}%</span></p>
                        <p>• Routes through Ari's configured validator for SN{netuid}</p>
                        <p>• Minimum stake: 0.001 τ · Block time: ~12 s</p>
                        <p>• Keep ≥ 0.01 τ liquid to cover future extrinsic fees</p>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-200 font-bold mb-2">How unstaking works</p>
                        <p>• α alpha converts back to τ TAO at the current alpha price</p>
                        <p>• Partial unstake supported — enter any α ≤ your open position</p>
                        <p>• Leave blank to unstake your full position</p>
                        <p>• On-chain confirmation ~12 s (one Bittensor block)</p>
                        <p>• Unstaked TAO arrives in your coldkey wallet immediately</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-dark-700 border border-dark-500 focus-within:border-accent-blue rounded-lg px-3 py-2.5 transition-colors">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={stakeAmt}
                  onChange={e => setStakeAmt(e.target.value)}
                  placeholder={stakeTab === 'stake' ? '0.000 τ' : '0.00000 α'}
                  className="flex-1 bg-transparent text-white font-mono text-sm focus:outline-none placeholder-slate-600"
                />
                <span className="text-slate-400 font-mono text-xs">{stakeTab === 'stake' ? 'τ' : 'α'}</span>
              </div>
              <button
                onClick={stakeTab === 'stake' ? handleStake : handleUnstake}
                disabled={stakeLoading || (stakeTab === 'unstake' && !position && !stakeAmt)}
                className={clsx(
                  'mt-3 w-full py-2.5 rounded-xl font-semibold font-mono text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
                  stakeTab === 'stake'
                    ? 'bg-accent-green/20 hover:bg-accent-green/30 border border-accent-green/40 text-accent-green hover:shadow-lg hover:shadow-accent-green/20'
                    : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:shadow-lg hover:shadow-red-500/20'
                )}
              >
                {stakeLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw size={13} className="animate-spin" />
                    {stakeTab === 'stake' ? 'Staking on-chain…' : 'Unstaking on-chain…'}
                  </span>
                ) : stakeTab === 'stake' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Lock size={13} />
                    Stake τ{stakeAmt || '0'} → SN{netuid}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Unlock size={13} />
                    Unstake α{stakeAmt || (position?.alpha.toFixed(4) ?? '0')} ← SN{netuid}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── External links ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-6">
          <a
            href={detail.taostats_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-dark-800 border border-dark-600 hover:border-accent-blue/40 rounded-xl p-4 transition-all group"
          >
            <div className="w-9 h-9 bg-blue-500/15 border border-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChart2 size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold group-hover:text-accent-blue transition-colors">Taostats</p>
              <p className="text-slate-400 text-xs font-mono">On-chain explorer · validators · emissions</p>
            </div>
            <ExternalLink size={12} className="text-slate-500 group-hover:text-accent-blue ml-auto flex-shrink-0" />
          </a>

          <a
            href={detail.tao_app_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-dark-800 border border-dark-600 hover:border-accent-blue/40 rounded-xl p-4 transition-all group"
          >
            <div className="w-9 h-9 bg-purple-500/15 border border-purple-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Globe size={16} className="text-purple-400" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold group-hover:text-accent-blue transition-colors">TAO.app</p>
              <p className="text-slate-400 text-xs font-mono">Market data · fear & greed · analytics</p>
            </div>
            <ExternalLink size={12} className="text-slate-500 group-hover:text-accent-blue ml-auto flex-shrink-0" />
          </a>

          <a
            href={`https://x.com/search?q=%23bittensor+SN${netuid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-dark-800 border border-dark-600 hover:border-accent-blue/40 rounded-xl p-4 transition-all group"
          >
            <div className="w-9 h-9 bg-dark-600 border border-dark-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Activity size={16} className="text-slate-300" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold group-hover:text-accent-blue transition-colors">Community</p>
              <p className="text-slate-400 text-xs font-mono">Search #bittensor SN{netuid} on X</p>
            </div>
            <ExternalLink size={12} className="text-slate-500 group-hover:text-accent-blue ml-auto flex-shrink-0" />
          </a>
        </div>
      </div>
    </div>
  )
}