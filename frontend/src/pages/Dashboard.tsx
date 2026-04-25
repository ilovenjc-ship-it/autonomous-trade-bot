import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Play, Square, RefreshCw, TrendingUp, TrendingDown,
  Activity, Zap, Bot, Shield, BarChart2, Clock, Award, Radio,
  Brain, Vote, Bell, Wallet, ArrowUp, ArrowDown, Minus,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  ComposedChart, Bar,
} from 'recharts'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/api/client'

// ── intelligence types ────────────────────────────────────────────────────────
interface AgentStatus { current_regime: string; regime_color: string; analysis_count: number; total_pnl: number }
interface ConsensusStats { total_rounds: number; approval_rate_pct: number; total_buy_votes: number; total_sell_votes: number }
interface WalletStatus { balance_cached: number | null; connected: boolean; block_cached: number | null }

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

// ── subnet mini cards ─────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up')   return <ArrowUp size={11} className="text-accent-green" />
  if (trend === 'down') return <ArrowDown size={11} className="text-red-400" />
  return <Minus size={11} className="text-slate-500" />
}

function SubnetCard({ s, maxStake }: { s: Subnet; maxStake: number }) {
  const stakePct = maxStake ? (s.stake_tao / maxStake) * 100 : 0
  const trendColor = s.trend === 'up' ? 'text-accent-green' : s.trend === 'down' ? 'text-red-400' : 'text-slate-500'
  const scoreColor = s.score >= 90 ? '#34d399' : s.score >= 70 ? '#60a5fa' : s.score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div className="flex-shrink-0 w-[168px] bg-dark-900 border border-dark-600 rounded-xl p-3 hover:border-dark-500 transition-colors">
      {/* name + trend */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white truncate">{s.name}</p>
          <p className="text-[15px] text-slate-500 font-mono uppercase">{s.ticker}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          <TrendIcon trend={s.trend} />
          <span className={clsx('text-[15px] font-mono font-bold', trendColor)}>
            {s.trend.toUpperCase()}
          </span>
        </div>
      </div>

      {/* stake bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[15px] font-mono mb-1">
          <span className="text-slate-500">Stake</span>
          <span className="text-slate-300">{(s.stake_tao / 1e6).toFixed(2)}M τ</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-blue/60 rounded-full transition-all"
            style={{ width: `${stakePct}%` }} />
        </div>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="bg-dark-800 rounded px-2 py-1 text-center">
          <p className="text-[15px] text-slate-500 font-mono">APY</p>
          <p className="text-[14px] font-bold text-accent-green font-mono">{s.apy.toFixed(1)}%</p>
        </div>
        <div className="bg-dark-800 rounded px-2 py-1 text-center">
          <p className="text-[15px] text-slate-500 font-mono">Emit</p>
          <p className="text-[14px] font-bold text-yellow-400 font-mono">{(s.emission * 100).toFixed(2)}%</p>
        </div>
      </div>

      {/* score gauge */}
      <div>
        <div className="flex justify-between text-[15px] font-mono mb-1">
          <span className="text-slate-500">Score</span>
          <span className="font-bold" style={{ color: scoreColor }}>{s.score.toFixed(1)}</span>
        </div>
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, s.score)}%`, background: scoreColor }} />
        </div>
      </div>
    </div>
  )
}

function SubnetMiniRow({ subnets }: { subnets: Subnet[] }) {
  const maxStake = subnets.length ? Math.max(...subnets.map(s => s.stake_tao)) : 1
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart2 size={14} className="text-accent-blue" />
          Top Subnets
          <span className="text-[13px] text-slate-500 font-mono font-normal">by stake · live</span>
        </h2>
        <span className="text-[13px] text-slate-500 font-mono">{subnets.length} subnets</span>
      </div>
      {subnets.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {subnets.map(s => <SubnetCard key={s.uid} s={s} maxStake={maxStake} />)}
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-slate-500 font-mono text-sm">
          Loading subnet data…
        </div>
      )}
    </div>
  )
}

// ── Hero Slider ───────────────────────────────────────────────────────────────
function HeroSlider({
  price, change24h, agentStatus, summary, consensusStats, botStatus, walletStatus,
}: {
  price: number | null | undefined
  change24h: number | null | undefined
  agentStatus: AgentStatus | null
  summary: Summary | null
  consensusStats: ConsensusStats | null
  botStatus: BotStatus | null
  walletStatus: WalletStatus | null
}) {
  const [idx, setIdx] = useState(0)
  const SLIDE_COUNT = 3
  const next = () => setIdx(i => (i + 1) % SLIDE_COUNT)
  const prev = () => setIdx(i => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT)

  useEffect(() => {
    const t = setInterval(next, 6000)
    return () => clearInterval(t)
  }, [])

  const ind = botStatus?.indicators ?? {}
  const rsi = ind.rsi_14 as number | null
  const regime = agentStatus?.current_regime ?? 'UNKNOWN'
  const regimeColor = agentStatus?.regime_color ?? '#6b7280'
  const up24h = (change24h ?? 0) >= 0
  const totalRounds = consensusStats?.total_rounds ?? 0
  const approvalRate = consensusStats?.approval_rate_pct ?? 0
  const buyVotes = consensusStats?.total_buy_votes ?? 0
  const sellVotes = consensusStats?.total_sell_votes ?? 0
  const bias = buyVotes > sellVotes ? 'BULLISH' : buyVotes < sellVotes ? 'BEARISH' : 'NEUTRAL'
  const biasColor = bias === 'BULLISH' ? '#00e5a0' : bias === 'BEARISH' ? '#f87171' : '#94a3b8'

  const slides = [
    /* ── Slide 0: Market Pulse ── */
    <div key="market" className="h-full flex items-center px-8 gap-10">
      <div>
        <p className="text-[13px] font-mono text-slate-400 uppercase tracking-widest mb-1">TAO / USD · Market Pulse</p>
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-black font-mono text-white">
            {price ? `$${price.toFixed(2)}` : '—'}
          </span>
          {change24h != null && (
            <span className={clsx('text-xl font-bold font-mono', up24h ? 'text-accent-green' : 'text-red-400')}>
              {up24h ? '+' : ''}{change24h.toFixed(2)}% 24h
            </span>
          )}
        </div>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">II Agent Regime</p>
        <p className="text-2xl font-extrabold font-mono" style={{ color: regimeColor }}>
          {regime === 'BULL' ? '🐂 BULL' : regime === 'BEAR' ? '🐻 BEAR' : regime === 'SIDEWAYS' ? '↔ SIDEWAYS' : regime === 'VOLATILE' ? '⚡ VOLATILE' : '⟳ SCANNING'}
        </p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">RSI-14</p>
        <p className={clsx('text-2xl font-bold font-mono',
          rsi == null ? 'text-slate-400' : rsi < 35 ? 'text-accent-green' : rsi > 65 ? 'text-red-400' : 'text-yellow-400'
        )}>
          {rsi != null ? rsi.toFixed(1) : '—'}
        </p>
        <p className="text-[13px] font-mono text-slate-500">
          {rsi == null ? '' : rsi < 35 ? 'Oversold' : rsi > 65 ? 'Overbought' : 'Neutral'}
        </p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Chain</p>
        <p className="text-[14px] font-mono text-indigo-400">Block #{walletStatus?.block_cached?.toLocaleString() ?? '—'}</p>
        <p className={clsx('text-[14px] font-mono mt-0.5', walletStatus?.connected ? 'text-accent-green' : 'text-slate-500')}>
          {walletStatus?.connected ? '● Finney Connected' : '○ Offline'}
        </p>
      </div>
    </div>,

    /* ── Slide 1: Fleet Performance ── */
    <div key="fleet" className="h-full flex items-center px-8 gap-10">
      <div>
        <p className="text-[13px] font-mono text-slate-400 uppercase tracking-widest mb-1">Fleet Performance</p>
        <p className={clsx('text-5xl font-black font-mono',
          (summary?.total_pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-red-400'
        )}>
          {summary ? fmt(summary.total_pnl, 4) + ' τ' : '—'}
        </p>
        <p className="text-[14px] font-mono text-slate-500 mt-1">Cumulative PnL · All Strategies</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Win Rate</p>
        <p className={clsx('text-3xl font-bold font-mono',
          (summary?.win_rate ?? 0) >= 55 ? 'text-accent-green' : 'text-yellow-400'
        )}>
          {summary ? `${summary.win_rate.toFixed(1)}%` : '—'}
        </p>
        <p className="text-[14px] font-mono text-slate-500">{summary ? `${summary.wins}W / ${summary.losses}L` : ''}</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Active Strategies</p>
        <p className="text-3xl font-bold font-mono text-accent-blue">{summary?.active_strategies ?? '—'}</p>
        <p className="text-[14px] font-mono text-slate-500">in fleet</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Total Trades</p>
        <p className="text-3xl font-bold font-mono text-white">{summary?.total_trades?.toLocaleString() ?? '—'}</p>
        <p className="text-[14px] font-mono text-slate-500">all time</p>
      </div>
    </div>,

    /* ── Slide 2: OpenClaw Status ── */
    <div key="openclaw" className="h-full flex items-center px-8 gap-10">
      <div>
        <p className="text-[13px] font-mono text-slate-400 uppercase tracking-widest mb-1">OpenClaw BFT Council</p>
        <p className="text-5xl font-black font-mono text-white">{approvalRate.toFixed(1)}%</p>
        <p className="text-[14px] font-mono text-slate-500 mt-1">Approval Rate · 7/12 threshold</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Rounds Completed</p>
        <p className="text-3xl font-bold font-mono text-accent-blue">{totalRounds.toLocaleString()}</p>
        <p className="text-[14px] font-mono text-slate-500">consensus rounds</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Vote Bias</p>
        <p className="text-3xl font-bold font-mono" style={{ color: biasColor }}>{bias}</p>
        <p className="text-[14px] font-mono text-slate-500">{buyVotes}B · {sellVotes}S</p>
      </div>
      <div className="h-16 w-px bg-dark-600" />
      <div>
        <p className="text-[13px] font-mono text-slate-500 uppercase tracking-widest mb-1">Status</p>
        <p className={clsx('text-[14px] font-bold font-mono',
          approvalRate >= 45 && approvalRate <= 65 ? 'text-accent-green' : 'text-yellow-400'
        )}>
          {approvalRate >= 45 && approvalRate <= 65 ? '✅ CALIBRATED' : '⚠ REVIEW'}
        </p>
        <p className="text-[14px] font-mono text-slate-500">12-bot fleet</p>
      </div>
    </div>,
  ]

  const gradients = [
    'from-indigo-950/60 via-dark-800 to-dark-800',
    'from-emerald-950/60 via-dark-800 to-dark-800',
    'from-violet-950/60 via-dark-800 to-dark-800',
  ]

  return (
    <div className={clsx(
      'relative w-full rounded-xl border border-dark-600 overflow-hidden bg-gradient-to-r',
      gradients[idx]
    )} style={{ height: 120, transition: 'background 0.5s ease' }}>

      {/* slide content with fade transition */}
      <div className="absolute inset-0" style={{ transition: 'opacity 0.4s ease' }}>
        {slides[idx]}
      </div>

      {/* nav arrows */}
      <button onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-dark-900/70 border border-dark-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-dark-700 transition-all z-10">
        <ChevronLeft size={13} />
      </button>
      <button onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-dark-900/70 border border-dark-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-dark-700 transition-all z-10">
        <ChevronRight size={13} />
      </button>

      {/* dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={clsx('rounded-full transition-all duration-300',
              i === idx ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-slate-600 hover:bg-slate-400'
            )} />
        ))}
      </div>

      {/* slide label */}
      <div className="absolute top-2.5 right-10 text-[12px] font-mono text-slate-600">
        {idx + 1} / {SLIDE_COUNT}
      </div>
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
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 flex flex-col">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <Activity size={14} className="text-yellow-400" /> Market Sentiment
      </h2>

      {/* Gauge SVG */}
      <div className="flex justify-center">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
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
            {score > 0 ? '+' : ''}{score.toFixed(0)}
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
      <div className="mt-2 space-y-2 border-t border-dark-600 pt-3">
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
              {t.amount.toFixed(4)}τ
            </span>

            {/* PnL */}
            <span className={clsx(
              'text-[13px] font-mono font-bold w-16 text-right flex-shrink-0',
              t.pnl >= 0 ? 'text-accent-green' : 'text-red-400'
            )}>
              {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(4)}
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
  const [botBusy,    setBotBusy]    = useState(false)
  const [tick,       setTick]       = useState(0)  // countdown tick
  // Intelligence layer
  const [agentStatus,    setAgentStatus]    = useState<AgentStatus | null>(null)
  const [consensusStats, setConsensusStats] = useState<ConsensusStats | null>(null)
  const [walletStatus,   setWalletStatus]   = useState<WalletStatus | null>(null)
  const [unreadAlerts,   setUnreadAlerts]   = useState(0)
  // Charts
  const [priceHistory,   setPriceHistory]   = useState<PricePoint[]>([])
  const [priceRange,     setPriceRange]     = useState<PriceRange>('24H')
  const [subnets,        setSubnets]        = useState<Subnet[]>([])

  // Recent trades (for bottom panel)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])

  const loadCharts = useCallback(async (range: PriceRange) => {
    try {
      const days = range === '7D' ? 7 : 1
      const [priceRes, subnetRes] = await Promise.all([
        fetch(`/api/price/history?days=${days}`).then(r => r.json()).catch(() => null),
        fetch('/api/market/subnets?limit=8').then(r => r.json()).catch(() => null),
      ])
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
      if (subnetRes?.subnets) setSubnets(subnetRes.subnets)
    } catch (e) {
      console.error('Chart load error', e)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const [statusRes, sumRes, stratRes, eqRes,
             agentRes, consensusRes, walletRes, alertsRes, tradesRes] = await Promise.all([
        api.get('/bot/status'),
        fetch('/api/analytics/summary'),
        fetch('/api/analytics/strategies'),
        fetch('/api/analytics/equity'),
        fetch('/api/agent/status').then(r => r.json()).catch(() => null),
        fetch('/api/consensus/stats').then(r => r.json()).catch(() => null),
        fetch('/api/wallet/status').then(r => r.json()).catch(() => null),
        fetch('/api/alerts/unread-count').then(r => r.json()).catch(() => null),
        fetch('/api/trades?limit=8').then(r => r.json()).catch(() => []),
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

  const handleToggle = async () => {
    setBotBusy(true)
    try {
      const endpoint = botStatus?.is_running ? '/bot/stop' : '/bot/start'
      const res = await api.post(endpoint)
      if (res.data.success) {
        toast.success(res.data.message)
        await load()
      } else {
        // "already running" is treated as success — just refresh status
        if (res.data.message?.toLowerCase().includes('already')) {
          toast.success('Bot is running')
          await load()
        } else {
          toast.error(res.data.message || 'Failed to toggle bot')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reach backend'
      toast.error(`Bot toggle error: ${msg}`)
      console.error('handleToggle error:', e)
    } finally {
      setBotBusy(false)
    }
  }

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

  return (
    <div className="p-6 space-y-5">

      {/* ── Hero Slider ────────────────────────────────────────────────────── */}
      <HeroSlider
        price={price}
        change24h={change24h}
        agentStatus={agentStatus}
        summary={summary}
        consensusStats={consensusStats}
        botStatus={botStatus}
        walletStatus={walletStatus}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap size={20} className="text-accent-green" /> Command Dashboard
          </h1>
          <p className="text-xs text-slate-300 mt-0.5 font-mono">
            Finney Mainnet · {botStatus?.simulation_mode ? 'Paper Trading' : 'Live Trading'} · {isRunning ? `Cycle #${cycleN}` : 'Stopped'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {/* Bot status pill — same size as Stop Bot button */}
          <div className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border',
            isRunning
              ? 'bg-accent-green/10 text-accent-green border-accent-green/25'
              : 'bg-dark-700 text-slate-400 border-dark-600'
          )}>
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
              isRunning ? 'bg-accent-green run-pulse' : 'bg-slate-600')} />
            {isRunning ? 'BOT RUNNING' : 'BOT STOPPED'}
          </div>
          <button
            onClick={handleToggle}
            disabled={botBusy}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border',
              isRunning
                ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/30'
                : 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/30',
              botBusy && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRunning ? <Square size={13} /> : <Play size={13} />}
            {isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </div>

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

      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Account Balance — live from Finney chain */}
        <KPI label="Account Balance" icon={Wallet}
          value={walletStatus?.balance_cached != null
            ? `τ${walletStatus.balance_cached.toFixed(4)}`
            : '—'}
          sub={walletStatus?.balance_cached != null && price
            ? `$${(walletStatus.balance_cached * price).toFixed(2)} USD`
            : walletStatus?.connected ? 'Querying chain…' : 'Offline'}
          color="text-indigo-400"
        />
        <KPI label="TAO Price" icon={TrendingUp}
          value={price ? `$${price.toFixed(2)}` : '—'}
          sub={change24h != null ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% 24h` : undefined}
          color={change24h != null ? (change24h >= 0 ? 'text-accent-green' : 'text-red-400') : 'text-accent-blue'}
        />
        <KPI label="Total PnL" icon={BarChart2}
          value={summary ? `${fmt(summary.total_pnl, 4)} τ` : '—'}
          sub={summary ? `${summary.total_trades} trades` : undefined}
          color={summary && summary.total_pnl >= 0 ? 'text-accent-green' : 'text-red-400'}
        />
        <KPI label="Win Rate" icon={Shield}
          value={summary ? `${summary.win_rate.toFixed(1)}%` : '—'}
          sub={summary ? `${summary.wins}W / ${summary.losses}L` : undefined}
          color={summary && summary.win_rate >= 55 ? 'text-accent-green' : 'text-yellow-400'}
        />
        <KPI label="Strategies" icon={Bot}
          value={summary ? `${summary.active_strategies}` : '—'}
          sub="active in fleet"
          color="text-accent-blue"
        />
      </div>

      {/* ── Intelligence Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* II Agent Regime */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Brain size={15} style={{ color: agentStatus?.regime_color ?? '#6b7280' }} />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">II Agent Regime</p>
            <p className="text-sm font-bold font-mono mt-0.5" style={{ color: agentStatus?.regime_color ?? '#6b7280' }}>
              {REGIME_LABEL[agentStatus?.current_regime ?? 'UNKNOWN'] ?? '⟳ SCANNING'}
            </p>
            <p className="text-[13px] text-slate-300 font-mono">{agentStatus?.analysis_count ?? 0} analyses</p>
          </div>
        </div>

        {/* OpenClaw consensus */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Vote size={15} className={
            (consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
          } />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">Consensus Rate</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5',
              (consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {consensusStats ? `${consensusStats.approval_rate_pct.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[13px] text-slate-300 font-mono">{consensusStats?.total_rounds ?? 0} rounds</p>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Bell size={15} className={unreadAlerts > 0 ? 'text-red-400' : 'text-slate-300'} />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">Unread Alerts</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5',
              unreadAlerts > 0 ? 'text-red-400' : 'text-emerald-400'
            )}>
              {unreadAlerts > 0 ? `${unreadAlerts} new` : 'All clear'}
            </p>
            <p className="text-[13px] text-slate-300 font-mono">auto-detected</p>
          </div>
        </div>

        {/* Wallet chain */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Wallet size={15} className={walletStatus?.connected ? 'text-indigo-400' : 'text-slate-300'} />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-300 uppercase tracking-wider font-mono">Chain Balance</p>
            <p className="text-sm font-bold font-mono mt-0.5 text-indigo-400">
              {walletStatus?.balance_cached != null
                ? `τ${walletStatus.balance_cached.toFixed(6)}`
                : walletStatus?.connected ? 'Querying…' : 'Offline'}
            </p>
            <p className="text-[13px] text-slate-300 font-mono">
              {walletStatus?.block_cached ? `Block #${walletStatus.block_cached.toLocaleString()}` : 'Finney mainnet'}
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

      {/* ── Subnet Mini Charts ───────────────────────────────────────────────── */}
      <SubnetMiniRow subnets={subnets} />

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
                    )}>{s.win_rate.toFixed(1)}% WR</span>
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