import { useEffect, useState, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown,
  Activity, Bot, Shield, BarChart2, Clock, Award, Radio,
  Brain, Vote, Bell, Wallet, Gauge, ShieldAlert, ChevronRight,
  ArrowUpRight, ArrowDownRight, Layers,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeroSlider, { SliderSlide } from '@/components/PageHeroSlider'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  ComposedChart, Bar,
} from 'recharts'
import clsx from 'clsx'
import api from '@/api/client'

// ── intelligence types ────────────────────────────────────────────────────────
interface AgentStatus { current_regime: string; regime_color: string; analysis_count: number; total_pnl: number }
interface ConsensusStats { total_rounds: number; approval_rate_pct: number; total_buy_votes: number; total_sell_votes: number }
interface WalletStatus { balance_cached: number | null; connected: boolean; block_cached: number | null }
interface DailyCap {
  staked_today_tao: number; cap_tao: number; liquid_tao: number
  pct_used: number; remaining_tao: number; reset_date: string | null; fraction: number
}
interface OpenPositionsSummary { open_count: number; sl_pct: number; tp_pct: number }

const REGIME_LABEL: Record<string, string> = {
  BULL: '🐂 BULL', BEAR: '🐻 BEAR', SIDEWAYS: '↔ SIDEWAYS', VOLATILE: '⚡ VOLATILE', UNKNOWN: '⟳ SCANNING',
}

// ── types ─────────────────────────────────────────────────────────────────────
interface BotStatus {
  is_running: boolean
  cycle_number: number
  cycle_interval: number
  status_message: string
  current_price: number | null
  price_change_24h: number | null
  indicators: Record<string, number | null>
  simulation_mode: boolean
  network: string
}

interface Summary {
  total_trades: number
  total_pnl: number
  wins: number
  losses: number
  win_rate: number
  best_trade: number
  worst_trade: number
  active_strategies: number
}

interface StrategyStat {
  name: string; label: string; total_trades: number
  total_pnl: number; win_rate: number; wins: number; losses: number
}

interface EquityPoint { time: string; cumulative: number }

interface ActivityEvent {
  id: string | number; kind: string; message: string
  strategy?: string; timestamp: string
}

interface PricePoint {
  timestamp: number
  price: number
  volume: number
  time: string   // formatted label
}

type PriceRange = '1H' | '6H' | '24H' | '7D'

interface RecentTrade {
  id: number
  trade_type: string
  strategy: string
  pnl: number
  amount: number
  price_at_trade: number
  tx_hash: string | null
  executed_at: string
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  const s = Math.abs(n).toFixed(d)
  return n >= 0 ? `+${s}` : `-${s}`
}

// ── TAO price chart ───────────────────────────────────────────────────────────
const RANGE_LABELS: PriceRange[] = ['1H', '6H', '24H', '7D']
const RANGE_HOURS: Record<PriceRange, number> = { '1H': 1, '6H': 6, '24H': 24, '7D': 168 }

function fmtPriceTime(ts: number, range: PriceRange): string {
  const d = new Date(ts)
  if (range === '7D') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function TaoPriceChart({ data, range, onRange }: {
  data: PricePoint[]; range: PriceRange; onRange: (r: PriceRange) => void
}) {
  const prices = data.map(d => d.price)
  const high   = prices.length ? Math.max(...prices) : 0
  const low    = prices.length ? Math.min(...prices) : 0
  const first  = data[0]?.price ?? 0
  const last   = data[data.length - 1]?.price ?? 0
  const pctChg = first ? ((last - first) / first) * 100 : 0
  const up     = pctChg >= 0

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      {/* header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[13px] text-slate-400 uppercase tracking-widest font-mono">TAO / USD</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-mono text-white">
                ${last ? last.toFixed(2) : '—'}
              </span>
              {data.length > 1 && (
                <span className={clsx('text-sm font-mono font-bold', up ? 'text-accent-green' : 'text-red-400')}>
                  {up ? '+' : ''}{pctChg.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          {data.length > 1 && (
            <div className="flex gap-4 text-xs font-mono hidden sm:flex">
              <div>
                <p className="text-slate-500">High</p>
                <p className="text-accent-green font-bold">${high.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-500">Low</p>
                <p className="text-red-400 font-bold">${low.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-500">Range</p>
                <p className="text-slate-300 font-bold">${(high - low).toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* range selector */}
        <div className="flex items-center gap-1 bg-dark-900 border border-dark-600 rounded-lg p-1">
          {RANGE_LABELS.map(r => (
            <button key={r} onClick={() => onRange(r)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-mono font-bold transition-all',
                range === r
                  ? up ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                       : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* chart */}
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="taoGr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={up ? '#34d399' : '#f87171'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 9 }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: '#475569', fontSize: 9 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `$${v.toFixed(0)}`}
              width={52}
            />
            <Tooltip
              contentStyle={{ background: '#0d1117', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
              formatter={(v: any, name: string) => [
                name === 'price' ? `$${(v as number).toFixed(2)}` : `$${((v as number) / 1e6).toFixed(1)}M`,
                name === 'price' ? 'TAO Price' : 'Volume',
              ]}
              labelFormatter={label => `Time: ${label}`}
            />
            <Bar dataKey="volume" fill={up ? '#34d399' : '#f87171'} fillOpacity={0.12} yAxisId={0} />
            <Area dataKey="price" stroke={up ? '#34d399' : '#f87171'} strokeWidth={2}
              fill="url(#taoGr)" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[180px] flex items-center justify-center text-slate-500 font-mono text-sm">
          Loading price data…
        </div>
      )}
    </div>
  )
}

// ── TradingView TAO Chart ─────────────────────────────────────────────────────
function TaoTradingViewChart() {
  const src = "https://s.tradingview.com/widgetembed/?frameElementId=tv_tao" +
    "&symbol=BINANCE%3ATAOUSDT&interval=60&hidesidetoolbar=0&symboledit=0" +
    "&saveimage=0&toolbarbg=152030&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC" +
    "&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D" +
    "&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget"
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-2 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp size={14} className="text-accent-green" />
          TAO / USDT
          <span className="text-[13px] text-slate-500 font-mono font-normal">live · TradingView</span>
        </h2>
        <a
          href="https://www.tradingview.com/chart/?symbol=BINANCE:TAOUSDT"
          target="_blank" rel="noopener noreferrer"
          className="text-[13px] font-mono text-accent-blue hover:text-blue-300 transition-colors"
        >
          Open Full ↗
        </a>
      </div>
      <div className="flex-1 rounded-lg overflow-hidden" style={{ minHeight: 260 }}>
        <iframe
          id="tv_tao"
          src={src}
          title="TAO/USDT TradingView Chart"
          width="100%"
          height="100%"
          style={{ border: 'none', minHeight: 260, display: 'block' }}
          allowFullScreen
        />
      </div>
    </div>
  )
}

// ── Sentiment Gauge ───────────────────────────────────────────────────────────
function SentimentGauge({
  ind, consensusStats,
}: {
  ind: Record<string, number | null>
  consensusStats: ConsensusStats | null
}) {
  const rsi      = (ind.rsi_14      as number | null) ?? null
  const macdHist = (ind.macd != null && ind.macd_signal != null)
    ? (ind.macd as number) - (ind.macd_signal as number)
    : null

  // Compute composite sentiment score: -100 (fear) → +100 (greed)
  let score = 0
  let factors = 0
  if (rsi != null) {
    score += ((rsi - 50) / 50) * 100 * 0.40  // RSI contributes 40%
    factors++
  }
  if (macdHist != null) {
    const macdScore = Math.max(-1, Math.min(1, macdHist / 0.5)) * 100
    score += macdScore * 0.30                  // MACD contributes 30%
    factors++
  }
  if (consensusStats) {
    const total = (consensusStats.total_buy_votes + consensusStats.total_sell_votes) || 1
    const voteScore = ((consensusStats.total_buy_votes / total) - 0.5) * 200
    score += voteScore * 0.30                  // Consensus contributes 30%
    factors++
  }
  score = Math.max(-100, Math.min(100, factors > 0 ? score : 0))

  const label =
    score >= 60  ? 'Extreme Greed' :
    score >= 25  ? 'Greed'         :
    score >= -25 ? 'Neutral'       :
    score >= -60 ? 'Fear'          :
                   'Extreme Fear'

  const labelColor =
    score >= 60  ? '#00e5a0' :
    score >= 25  ? '#86efac' :
    score >= -25 ? '#f59e0b' :
    score >= -60 ? '#f87171' :
                   '#ef4444'

  // SVG arc gauge: semicircle, needle rotates from -90° (left=fear) to +90° (right=greed)
  const W = 220; const H = 130
  const cx = W / 2; const cy = H - 20
  const R = 85
  const needleAngleDeg = (score / 100) * 90   // -90° to +90°
  const needleAngleRad = (needleAngleDeg - 90) * (Math.PI / 180)  // -180° = left, 0° = top
  const nx = cx + R * 0.75 * Math.cos(needleAngleRad)
  const ny = cy + R * 0.75 * Math.sin(needleAngleRad)

  // Arc segments: fear (red) → greed (green) across the top semicircle
  const segments = [
    { from: 180, to: 216, color: '#ef4444' },   // Extreme Fear
    { from: 216, to: 252, color: '#f87171' },   // Fear
    { from: 252, to: 288, color: '#f59e0b' },   // Neutral
    { from: 288, to: 324, color: '#86efac' },   // Greed
    { from: 324, to: 360, color: '#00e5a0' },   // Extreme Greed
  ]

  function arcPath(startDeg: number, endDeg: number, r: number) {
    const s = (startDeg * Math.PI) / 180
    const e = (endDeg   * Math.PI) / 180
    const x1 = cx + r * Math.cos(s); const y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e); const y2 = cy + r * Math.sin(e)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const inputs: { label: string; value: string; color: string }[] = [
    { label: 'RSI-14',    value: rsi != null ? rsi.toFixed(1) : '—',
      color: rsi == null ? '#64748b' : rsi < 35 ? '#00e5a0' : rsi > 65 ? '#f87171' : '#f59e0b' },
    { label: 'MACD Hist', value: macdHist != null ? (macdHist > 0 ? '+' : '') + macdHist.toFixed(4) : '—',
      color: macdHist == null ? '#64748b' : macdHist > 0 ? '#00e5a0' : '#f87171' },
    { label: 'Consensus', value: consensusStats ? `${consensusStats.approval_rate_pct.toFixed(1)}%` : '—',
      color: '#818cf8' },
  ]

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 flex flex-col h-full">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
        <Activity size={14} className="text-yellow-400" /> Market Sentiment
      </h2>

      {/* Gauge SVG — fills remaining box space */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 180 }} preserveAspectRatio="xMidYMid meet">
          {/* background arc */}
          <path d={arcPath(180, 360, R)} fill="none" stroke="#1e293b" strokeWidth={14} />

          {/* coloured segments */}
          {segments.map((seg, i) => (
            <path key={i} d={arcPath(seg.from, seg.to, R)}
              fill="none" stroke={seg.color} strokeWidth={14} strokeOpacity={0.85} />
          ))}

          {/* inner track */}
          <path d={arcPath(180, 360, R - 18)} fill="none" stroke="#0d1525" strokeWidth={2} />

          {/* needle */}
          <line x1={cx} y1={cy} x2={nx} y2={ny}
            stroke="white" strokeWidth={2.5} strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' }} />
          <circle cx={cx} cy={cy} r={5} fill="white" />

          {/* score label */}
          <text x={cx} y={cy - 28} textAnchor="middle"
            fontSize={22} fontWeight="800" fontFamily="monospace" fill={labelColor}>
            {(score ?? 0) > 0 ? '+' : ''}{(score ?? 0).toFixed(0)}
          </text>
          <text x={cx} y={cy - 10} textAnchor="middle"
            fontSize={11} fontFamily="monospace" fill={labelColor}>
            {label}
          </text>

          {/* axis labels */}
          <text x={12}  y={cy + 4} fontSize={9} fill="#ef4444" fontFamily="monospace">Fear</text>
          <text x={W - 36} y={cy + 4} fontSize={9} fill="#00e5a0" fontFamily="monospace">Greed</text>
        </svg>
      </div>

      {/* Input breakdown */}
      <div className="space-y-1.5 border-t border-dark-600 pt-2 mt-auto">
        {inputs.map(inp => (
          <div key={inp.label} className="flex items-center justify-between">
            <span className="text-[13px] font-mono text-slate-400">{inp.label}</span>
            <span className="text-[14px] font-mono font-bold" style={{ color: inp.color }}>{inp.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Recent Trades Mini ────────────────────────────────────────────────────────
function RecentTradesMini({ trades }: { trades: RecentTrade[] }) {
  const STRAT_SHORT: Record<string, string> = {
    momentum_cascade:   'MomCas',  dtao_flow_momentum: 'dTAO',
    liquidity_hunter:   'LiqHnt',  emission_momentum:  'EmitMo',
    balanced_risk:      'BalRsk',  mean_reversion:     'MeanRv',
    volatility_arb:     'VolArb',  sentiment_surge:    'SentSg',
    macro_correlation:  'MacroCo', breakout_hunter:    'BrkHnt',
    yield_maximizer:    'YldMax',  contrarian_flow:    'CntFlo',
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-1">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-accent-blue" /> Recent Trades
        <span className="ml-auto text-[12px] text-slate-500 font-mono">last {trades.length}</span>
      </h2>
      <div className="space-y-2">
        {trades.slice(0, 8).map(t => (
          <div key={t.id}
            className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors">
            {/* Side badge */}
            <span className={clsx(
              'text-[12px] font-bold font-mono w-8 flex-shrink-0 text-center rounded px-1',
              t.trade_type === 'buy'
                ? 'text-accent-green bg-accent-green/10'
                : 'text-red-400 bg-red-400/10'
            )}>
              {t.trade_type.toUpperCase().slice(0, 1)}
            </span>

            {/* Strategy */}
            <span className="text-[13px] font-mono text-slate-300 flex-1 truncate">
              {STRAT_SHORT[t.strategy] ?? t.strategy.slice(0, 6)}
            </span>

            {/* Amount */}
            <span className="text-[12px] font-mono text-slate-500">
              {(t.amount ?? 0).toFixed(4)}τ
            </span>

            {/* PnL */}
            <span className={clsx(
              'text-[13px] font-mono font-bold w-16 text-right flex-shrink-0',
              t.pnl >= 0 ? 'text-accent-green' : 'text-red-400'
            )}>
              {(t.pnl ?? 0) >= 0 ? '+' : ''}{(t.pnl ?? 0).toFixed(4)}
            </span>

            {/* Real badge */}
            {t.tx_hash && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded flex-shrink-0">
                REAL
              </span>
            )}
          </div>
        ))}
        {trades.length === 0 && (
          <p className="text-slate-500 text-[13px] font-mono text-center py-6">No trades yet</p>
        )}
      </div>
    </div>
  )
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ElementType
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-5 py-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={color ?? 'text-slate-300'} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-slate-300 uppercase tracking-widest font-mono">{label}</p>
        <p className={clsx('text-xl font-bold font-mono mt-0.5', color ?? 'text-white')}>{value}</p>
        {sub && <p className="text-[14px] text-slate-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function IndRow({ label, val, good, bad }: {
  label: string; val: number | null | undefined; good?: number; bad?: number
}) {
  const color = val == null ? 'text-slate-300'
    : good != null && bad != null
      ? val <= good ? 'text-accent-green' : val >= bad ? 'text-red-400' : 'text-yellow-400'
      : 'text-white'
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dark-700 last:border-0">
      <span className="text-xs text-slate-300">{label}</span>
      <span className={clsx('text-xs font-mono font-semibold', color)}>
        {val != null ? val.toFixed(4) : '—'}
      </span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [botStatus,  setBotStatus]  = useState<BotStatus | null>(null)
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [strategies, setStrategies] = useState<StrategyStat[]>([])
  const [equity,     setEquity]     = useState<EquityPoint[]>([])
  const [activity,   setActivity]   = useState<ActivityEvent[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tick,       setTick]       = useState(0)  // countdown tick
  // Intelligence layer
  const [agentStatus,    setAgentStatus]    = useState<AgentStatus | null>(null)
  const [consensusStats, setConsensusStats] = useState<ConsensusStats | null>(null)
  const [walletStatus,   setWalletStatus]   = useState<WalletStatus | null>(null)
  const [unreadAlerts,   setUnreadAlerts]   = useState(0)
  const [dailyCap,       setDailyCap]       = useState<DailyCap | null>(null)
  const [openPositions,  setOpenPositions]  = useState<OpenPositionsSummary | null>(null)
  // Charts
  const [priceHistory,   setPriceHistory]   = useState<PricePoint[]>([])
  const [priceRange,     setPriceRange]     = useState<PriceRange>('24H')

  // Recent trades (for bottom panel)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])

  const loadCharts = useCallback(async (range: PriceRange) => {
    try {
      const days = range === '7D' ? 7 : 1
      const priceRes = await fetch(`/api/price/history?days=${days}`).then(r => r.json()).catch(() => null)
      if (priceRes?.data) {
        // Filter to the requested range
        const cutoffMs = Date.now() - RANGE_HOURS[range] * 3600 * 1000
        const raw: PricePoint[] = priceRes.data
          .filter((p: any) => p.timestamp >= cutoffMs)
          .map((p: any) => ({
            timestamp: p.timestamp,
            price: p.price,
            volume: p.volume ?? 0,
            time: fmtPriceTime(p.timestamp, range),
          }))
        // Downsample to max 120 points for perf
        const stride = Math.max(1, Math.floor(raw.length / 120))
        setPriceHistory(raw.filter((_, i) => i % stride === 0))
      }
    } catch (e) {
      console.error('Chart load error', e)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const [statusRes, sumRes, stratRes, eqRes,
             agentRes, consensusRes, walletRes, alertsRes, tradesRes,
             capRes, posRes] = await Promise.all([
        api.get('/bot/status'),
        fetch('/api/analytics/summary'),
        fetch('/api/analytics/strategies'),
        fetch('/api/analytics/equity'),
        fetch('/api/agent/status').then(r => r.json()).catch(() => null),
        fetch('/api/consensus/stats').then(r => r.json()).catch(() => null),
        fetch('/api/wallet/status').then(r => r.json()).catch(() => null),
        fetch('/api/alerts/unread-count').then(r => r.json()).catch(() => null),
        fetch('/api/trades?limit=8').then(r => r.json()).catch(() => []),
        fetch('/api/fleet/daily-cap').then(r => r.json()).catch(() => null),
        fetch('/api/fleet/positions').then(r => r.json()).catch(() => null),
      ])
      setBotStatus(statusRes.data)
      setSummary(await sumRes.json())
      setStrategies(await stratRes.json())
      const eqData: EquityPoint[] = await eqRes.json()
      const stride = Math.max(1, Math.floor(eqData.length / 100))
      setEquity(eqData.filter((_, i) => i % stride === 0))
      const tradesData = await tradesRes
      setRecentTrades(Array.isArray(tradesData) ? tradesData : tradesData.trades ?? [])
      if (agentRes)    setAgentStatus(agentRes)
      if (consensusRes)setConsensusStats(consensusRes)
      if (walletRes)   setWalletStatus(walletRes)
      if (alertsRes)   setUnreadAlerts(alertsRes.unread_count ?? 0)
      if (capRes)      setDailyCap(capRes)
      if (posRes)      setOpenPositions({ open_count: posRes.open_count ?? 0, sl_pct: posRes.sl_pct ?? 8, tp_pct: posRes.tp_pct ?? 25 })
    } catch (e) {
      console.error('Dashboard load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCharts(priceRange) }, [loadCharts, priceRange])

  // refresh every 15s, tick every second for cycle countdown
  useEffect(() => {
    const refresh = setInterval(load, 15_000)
    const chartRefresh = setInterval(() => loadCharts(priceRange), 60_000)
    const countdown = setInterval(() => setTick(t => t + 1), 1_000)
    return () => { clearInterval(refresh); clearInterval(chartRefresh); clearInterval(countdown) }
  }, [load, loadCharts, priceRange])

  const navigate = useNavigate()
  const ind = botStatus?.indicators ?? {}
  const price = botStatus?.current_price
  const change24h = botStatus?.price_change_24h
  const top5 = [...strategies].sort((a, b) => b.total_pnl - a.total_pnl).slice(0, 5)
  const isRunning = botStatus?.is_running ?? false
  const cycleN = botStatus?.cycle_number ?? 0
  const interval = botStatus?.cycle_interval ?? 60

  // seconds since last cycle (approx based on tick)
  const secInCycle = tick % interval
  const secToNext  = interval - secInCycle

  // ── Build PageHeroSlider slides from live data ──────────────────────────────
  const _rsi        = ind.rsi_14 as number | null
  const _regime     = agentStatus?.current_regime ?? 'UNKNOWN'
  const _up24h      = (change24h ?? 0) >= 0
  const _totalRounds   = consensusStats?.total_rounds ?? 0
  const _approvalRate  = consensusStats?.approval_rate_pct ?? 0
  const _buyVotes      = consensusStats?.total_buy_votes ?? 0
  const _sellVotes     = consensusStats?.total_sell_votes ?? 0
  const _bias = _buyVotes > _sellVotes ? 'BULLISH' : _buyVotes < _sellVotes ? 'BEARISH' : 'NEUTRAL'

  const heroSlides: SliderSlide[] = [
    {
      title: 'Market Pulse',
      subtitle: 'TAO / USD',
      accent: 'blue',
      stats: [
        { label: 'TAO Price',     value: price ? `$${price.toFixed(2)}` : '—', color: 'blue' },
        { label: '24h Change',    value: change24h != null ? `${_up24h ? '+' : ''}${change24h.toFixed(2)}%` : '—', color: _up24h ? 'emerald' : 'red' },
        { label: 'II Agent',      value: REGIME_LABEL[_regime] ?? _regime, color: _regime === 'BULL' ? 'emerald' : _regime === 'BEAR' ? 'red' : 'slate' },
        { label: 'RSI-14',        value: _rsi != null ? _rsi.toFixed(1) : '—', sub: _rsi == null ? '' : _rsi < 35 ? 'Oversold' : _rsi > 65 ? 'Overbought' : 'Neutral', color: _rsi == null ? 'slate' : _rsi < 35 ? 'emerald' : _rsi > 65 ? 'red' : 'yellow' },
        { label: 'Block',         value: walletStatus?.block_cached ? `#${walletStatus.block_cached.toLocaleString()}` : '—', color: 'slate' },
      ],
    },
    {
      title: 'Fleet Performance',
      subtitle: 'Fleet Stats',
      accent: 'emerald',
      stats: [
        { label: 'Total PnL',        value: summary ? `${fmt(summary.total_pnl, 4)} τ` : '—', color: (summary?.total_pnl ?? 0) >= 0 ? 'emerald' : 'red' },
        { label: 'Win Rate',         value: summary ? `${summary.win_rate.toFixed(1)}%` : '—', sub: summary ? `${summary.wins}W / ${summary.losses}L` : '', color: (summary?.win_rate ?? 0) >= 55 ? 'emerald' : 'yellow' },
        { label: 'Active Strategies', value: `${summary?.active_strategies ?? '—'}`, sub: 'in fleet', color: 'blue' },
        { label: 'Total Trades',     value: summary ? summary.total_trades.toLocaleString() : '—', sub: 'all time', color: 'white' },
      ],
    },
    {
      title: 'OpenClaw Status',
      subtitle: 'BFT Council',
      accent: 'purple',
      stats: [
        { label: 'Approval Rate', value: `${_approvalRate.toFixed(1)}%`, sub: '7/12 threshold', color: _approvalRate >= 45 && _approvalRate <= 65 ? 'emerald' : 'yellow' },
        { label: 'Rounds',        value: _totalRounds.toLocaleString(), sub: 'consensus rounds', color: 'blue' },
        { label: 'Vote Bias',     value: _bias, color: _bias === 'BULLISH' ? 'emerald' : _bias === 'BEARISH' ? 'red' : 'slate' },
        { label: 'Status',        value: _approvalRate >= 45 && _approvalRate <= 65 ? 'CALIBRATED' : 'REVIEW', color: _approvalRate >= 45 && _approvalRate <= 65 ? 'emerald' : 'yellow' },
      ],
    },
  ]

  return (
    <div className="p-6 space-y-5">

      {/* ── Hero Slider ────────────────────────────────────────────────────── */}
      <PageHeroSlider slides={heroSlides} />

      {/* ── Cycle status bar ─────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl border font-mono text-xs',
        isRunning
          ? 'bg-accent-green/5 border-accent-green/20'
          : 'bg-dark-800 border-dark-600'
      )}>
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
          isRunning ? 'bg-accent-green run-pulse' : 'bg-slate-600')} />
        <span className={isRunning ? 'text-accent-green' : 'text-slate-300'}>
          {isRunning ? `RUNNING — Cycle #${cycleN}` : 'STOPPED'}
        </span>
        {isRunning && (
          <>
            <span className="text-slate-300">·</span>
            <Clock size={11} className="text-slate-300" />
            <span className="text-slate-300">Next cycle in {secToNext}s</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-300">{summary?.active_strategies ?? 0} strategies active</span>
          </>
        )}
        <span className="ml-auto text-slate-300 font-mono text-[13px]">
          {walletStatus?.connected
            ? <span className="text-indigo-400">⛓ CHAIN CONNECTED · Block #{walletStatus.block_cached?.toLocaleString()}</span>
            : <span>⚠ Paper trading — OpenClaw gates LIVE execution</span>}
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          COMMAND STRIP — 6 operator-critical metrics at a glance
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">

        {/* 1 — Liquid Balance */}
        <button onClick={() => navigate('/wallet')}
          className="bg-dark-800 border border-dark-600 hover:border-indigo-500/40 rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Wallet size={14} className="text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Liquid TAO</p>
            <p className="text-base font-black font-mono text-indigo-400 mt-0.5">
              {walletStatus?.balance_cached != null ? `τ${(walletStatus.balance_cached).toFixed(4)}` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {walletStatus?.balance_cached != null && price
                ? `$${(walletStatus.balance_cached * price).toFixed(2)}`
                : 'free · unstaked'}
            </p>
          </div>
          <ChevronRight size={12} className="text-slate-600 group-hover:text-indigo-400 mt-1 transition-colors" />
        </button>

        {/* 2 — Daily Cap meter */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Gauge size={14} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Daily Cap</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              (dailyCap?.pct_used ?? 0) >= 90 ? 'text-red-400' :
              (dailyCap?.pct_used ?? 0) >= 60 ? 'text-amber-400' : 'text-emerald-400'
            )}>
              {dailyCap ? `${dailyCap.pct_used.toFixed(0)}%` : '—'}
            </p>
            <div className="mt-1 h-1 bg-dark-600 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all',
                (dailyCap?.pct_used ?? 0) >= 90 ? 'bg-red-500' :
                (dailyCap?.pct_used ?? 0) >= 60 ? 'bg-amber-400' : 'bg-emerald-500'
              )} style={{ width: `${Math.min(100, dailyCap?.pct_used ?? 0)}%` }} />
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-1">
              {dailyCap ? `${dailyCap.staked_today_tao.toFixed(3)} / ${dailyCap.cap_tao.toFixed(3)}τ` : 'no data'}
            </p>
          </div>
        </div>

        {/* 3 — Open Positions */}
        <button onClick={() => navigate('/wallet')}
          className="bg-dark-800 border border-dark-600 hover:border-purple-500/40 rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
            <Layers size={14} className="text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Positions</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              (openPositions?.open_count ?? 0) > 0 ? 'text-purple-400' : 'text-slate-500'
            )}>
              {openPositions?.open_count ?? 0}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {(openPositions?.open_count ?? 0) > 0
                ? `SL ${openPositions?.sl_pct ?? 8}% · TP ${openPositions?.tp_pct ?? 25}% active`
                : 'no open positions'}
            </p>
          </div>
          <ChevronRight size={12} className="text-slate-600 group-hover:text-purple-400 mt-1 transition-colors" />
        </button>

        {/* 4 — Fleet Win Rate */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            (summary?.win_rate ?? 0) >= 55 ? 'bg-emerald-500/10' : 'bg-yellow-500/10'
          )}>
            <Shield size={14} className={(summary?.win_rate ?? 0) >= 55 ? 'text-emerald-400' : 'text-yellow-400'} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Win Rate</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              (summary?.win_rate ?? 0) >= 55 ? 'text-emerald-400' : 'text-yellow-400'
            )}>
              {summary ? `${summary.win_rate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {summary ? `${summary.wins}W · ${summary.losses}L` : 'no trades yet'}
            </p>
          </div>
        </div>

        {/* 5 — Total PnL */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            (summary?.total_pnl ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            {(summary?.total_pnl ?? 0) >= 0
              ? <ArrowUpRight size={14} className="text-emerald-400" />
              : <ArrowDownRight size={14} className="text-red-400" />}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Total P&L</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              (summary?.total_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {summary ? `${fmt(summary.total_pnl, 4)}τ` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {summary ? `${summary.total_trades} trades` : '—'}
            </p>
          </div>
        </div>

        {/* 6 — Next Cycle countdown */}
        <div className={clsx(
          'rounded-xl px-4 py-3.5 flex items-start gap-3 border',
          isRunning ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-dark-800 border-dark-600'
        )}>
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isRunning ? 'bg-emerald-500/15' : 'bg-dark-700'
          )}>
            <Clock size={14} className={isRunning ? 'text-emerald-400' : 'text-slate-500'} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">
              {isRunning ? 'Next Cycle' : 'Bot Status'}
            </p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              isRunning ? 'text-emerald-400' : 'text-slate-500'
            )}>
              {isRunning ? `${secToNext}s` : 'STOPPED'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {isRunning ? `Cycle #${cycleN} · ${summary?.active_strategies ?? 0} active` : 'click Start Bot'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Intelligence strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* II Agent Regime */}
        <button onClick={() => navigate('/ii-agent')}
          className="bg-dark-800 border border-dark-600 hover:border-slate-500 rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all group">
          <Brain size={15} style={{ color: agentStatus?.regime_color ?? '#6b7280' }} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">II Agent</p>
            <p className="text-sm font-bold font-mono mt-0.5" style={{ color: agentStatus?.regime_color ?? '#6b7280' }}>
              {REGIME_LABEL[agentStatus?.current_regime ?? 'UNKNOWN'] ?? '⟳ SCANNING'}
            </p>
            <p className="text-[11px] text-slate-500 font-mono">{agentStatus?.analysis_count ?? 0} analyses</p>
          </div>
          <ChevronRight size={11} className="text-slate-600 group-hover:text-white transition-colors" />
        </button>

        {/* OpenClaw */}
        <button onClick={() => navigate('/openclaw')}
          className="bg-dark-800 border border-dark-600 hover:border-slate-500 rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all group">
          <Vote size={15} className={(consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">OpenClaw BFT</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5',
              (consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {consensusStats ? `${consensusStats.approval_rate_pct.toFixed(1)}% approval` : '—'}
            </p>
            <p className="text-[11px] text-slate-500 font-mono">{consensusStats?.total_rounds ?? 0} rounds · 7/12 threshold</p>
          </div>
          <ChevronRight size={11} className="text-slate-600 group-hover:text-white transition-colors" />
        </button>

        {/* Alerts — clickable */}
        <button onClick={() => navigate('/alerts')}
          className={clsx(
            'rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all group border',
            unreadAlerts > 0
              ? 'bg-red-500/5 border-red-500/25 hover:border-red-500/50'
              : 'bg-dark-800 border-dark-600 hover:border-slate-500'
          )}>
          <Bell size={15} className={unreadAlerts > 0 ? 'text-red-400' : 'text-slate-400'} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Alerts</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5', unreadAlerts > 0 ? 'text-red-400' : 'text-emerald-400')}>
              {unreadAlerts > 0 ? `${unreadAlerts} unread` : 'All clear ✓'}
            </p>
            <p className="text-[11px] text-slate-500 font-mono">
              {unreadAlerts > 0 ? 'click to review' : 'no new alerts'}
            </p>
          </div>
          {unreadAlerts > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0">
              {unreadAlerts}
            </span>
          )}
          <ChevronRight size={11} className="text-slate-600 group-hover:text-white transition-colors" />
        </button>

        {/* TAO 24h price move */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          {(change24h ?? 0) >= 0
            ? <TrendingUp size={15} className="text-emerald-400" />
            : <TrendingDown size={15} className="text-red-400" />}
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">TAO / USD</p>
            <p className="text-sm font-bold font-mono mt-0.5 text-white">
              {price ? `$${price.toFixed(2)}` : '—'}
            </p>
            <p className={clsx('text-[11px] font-mono mt-0.5',
              (change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {change24h != null
                ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% 24h`
                : 'loading…'}
            </p>
          </div>
        </div>
      </div>

      {/* ── TAO Price Chart ──────────────────────────────────────────────────── */}
      <TaoPriceChart
        data={priceHistory}
        range={priceRange}
        onRange={r => setPriceRange(r)}
      />

      {/* ── Main 2-col ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* TAO TradingView chart — 2/3 width */}
        <TaoTradingViewChart />

        {/* Indicators — 1/3 width */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Radio size={14} className="text-accent-blue" /> Live Indicators
          </h2>
          <IndRow label="RSI (14)"     val={ind.rsi_14}      good={30} bad={70} />
          <IndRow label="EMA 9"        val={ind.ema_9} />
          <IndRow label="EMA 21"       val={ind.ema_21} />
          <IndRow label="MACD"         val={ind.macd} />
          <IndRow label="MACD Signal"  val={ind.macd_signal} />
          <IndRow label="BB Upper"     val={ind.bb_upper} />
          <IndRow label="BB Lower"     val={ind.bb_lower} />
          <IndRow label="SMA 50"       val={ind.sma_50} />

          {/* Momentum signal summary */}
          <div className="mt-4 p-3 rounded-lg bg-dark-700 border border-dark-600">
            <p className="text-[13px] text-slate-300 font-mono uppercase tracking-widest mb-1">Momentum Signal</p>
            {ind.rsi_14 != null ? (
              <p className={clsx('text-sm font-bold font-mono',
                ind.rsi_14 < 35 ? 'text-accent-green' :
                ind.rsi_14 > 65 ? 'text-red-400' : 'text-yellow-400'
              )}>
                {ind.rsi_14 < 35 ? '🟢 OVERSOLD — BUY' :
                 ind.rsi_14 > 65 ? '🔴 OVERBOUGHT — SELL' : '🟡 NEUTRAL — HOLD'}
              </p>
            ) : (
              <p className="text-slate-300 text-sm font-mono">Accumulating data…</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Strategy leaderboard */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-1">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Award size={14} className="text-yellow-400" /> Top Strategies
          </h2>
          <div className="space-y-2">
            {top5.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 px-3 py-2 bg-dark-700 rounded-lg">
                <span className="text-slate-300 font-mono text-xs w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">{s.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[13px] font-mono text-slate-300">{s.total_trades} trades</span>
                    <span className={clsx('text-[13px] font-mono',
                      s.win_rate >= 55 ? 'text-accent-green' : 'text-yellow-400'
                    )}>{(s.win_rate ?? 0).toFixed(1)}% WR</span>
                  </div>
                </div>
                <span className={clsx('font-mono text-sm font-bold',
                  s.total_pnl >= 0 ? 'text-accent-green' : 'text-red-400'
                )}>
                  {fmt(s.total_pnl, 4)}
                </span>
              </div>
            ))}
            {top5.length === 0 && (
              <p className="text-slate-300 text-xs font-mono text-center py-4">No strategy data yet</p>
            )}
          </div>
        </div>

        {/* Recent Trades — replaces Live Activity */}
        <RecentTradesMini trades={recentTrades} />

        {/* Sentiment Gauge — replaces Ask II Agent chat */}
        <SentimentGauge ind={ind} consensusStats={consensusStats} />

      </div>
    </div>
  )
}