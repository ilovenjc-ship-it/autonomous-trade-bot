import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, TrendingDown,
  Activity, BarChart2, Clock, Award, Radio,
  Brain, Vote, Bell, Gauge, ChevronRight, DollarSign, Target, Hash, CalendarDays,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import api from '@/api/client'
import DrawdownChart from '@/components/DrawdownChart'

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


// ── TradingView TAO Chart ─────────────────────────────────────────────────────
// Session XXVIII: switched height contract from Tailwind class → inline style
// (numeric px). Reasons:
//   1. The previous wrapper used `flex-1` which collapses any explicit height
//      when the parent isn't height-constrained — silently overrode XXVII's
//      `h-[1280px]` so the chart actually rendered at iframe-default height.
//   2. Tailwind JIT can drop arbitrary-value classes from the production
//      bundle if they're only referenced in a prop default. Inline style is
//      bundle-safe.
// Default 320px preserved for any other callers; Dashboard passes 3840px.
function TaoTradingViewChart({ heightPx = 320 }: { heightPx?: number } = {}) {
  const src = "https://s.tradingview.com/widgetembed/?frameElementId=tv_tao" +
    "&symbol=BINANCE%3ATAOUSDT&interval=60&hidesidetoolbar=0&symboledit=0" +
    "&saveimage=0&toolbarbg=152030&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC" +
    "&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D" +
    "&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget"
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 flex flex-col">
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
      <div className="rounded-lg overflow-hidden" style={{ height: `${heightPx}px` }}>
        <iframe
          id="tv_tao"
          src={src}
          title="TAO/USDT TradingView Chart"
          width="100%"
          height="100%"
          style={{ border: 'none', display: 'block' }}
          allowFullScreen
        />
      </div>
    </div>
  )
}

// ── Sentiment Gauge ───────────────────────────────────────────────────────────
function SentimentGauge({
  ind, consensusStats, taoFearGreed,
}: {
  ind: Record<string, number | null>
  consensusStats: ConsensusStats | null
  taoFearGreed: number | null
}) {
  const [showInfo, setShowInfo] = useState(false)

  const rsi      = (ind.rsi_14      as number | null) ?? null
  const macdHist = (ind.macd != null && ind.macd_signal != null)
    ? (ind.macd as number) - (ind.macd_signal as number)
    : null

  // Composite sentiment score: -100 (fear) → +100 (greed)
  // Weights: RSI 30% · MACD 25% · Consensus 20% · TAO F&G 25%
  // If TAO F&G unavailable, redistribute its weight to the others.
  const hasFg = taoFearGreed != null
  const wRsi  = hasFg ? 0.30 : 0.40
  const wMacd = hasFg ? 0.25 : 0.30
  const wCons = hasFg ? 0.20 : 0.30
  const wFg   = hasFg ? 0.25 : 0.00

  let score = 0
  if (rsi != null)      score += ((rsi - 50) / 50) * 100 * wRsi
  if (macdHist != null) score += Math.max(-1, Math.min(1, macdHist / 0.5)) * 100 * wMacd
  if (consensusStats) {
    const total = (consensusStats.total_buy_votes + consensusStats.total_sell_votes) || 1
    score += ((consensusStats.total_buy_votes / total) - 0.5) * 200 * wCons
  }
  if (hasFg) score += (taoFearGreed as number) * wFg
  score = Math.max(-100, Math.min(100, score))

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

  // SVG arc gauge: semicircle from 180° (left=Extreme Fear) → 360° (right=Extreme Greed)
  const W = 240; const H = 148
  const cx = W / 2; const cy = H - 24
  const R = 90
  const needleAngleDeg = (score / 100) * 90   // maps score -100→+100 to degrees -90→+90
  const needleAngleRad = (needleAngleDeg - 90) * (Math.PI / 180)
  const nx = cx + R * 0.72 * Math.cos(needleAngleRad)
  const ny = cy + R * 0.72 * Math.sin(needleAngleRad)

  // 5 coloured arc zones: Extreme Fear → Fear → Neutral → Greed → Extreme Greed
  const zones = [
    { from: 180, to: 216, color: '#ef4444', label: 'Ext. Fear' },
    { from: 216, to: 252, color: '#f87171', label: 'Fear'      },
    { from: 252, to: 288, color: '#f59e0b', label: 'Neutral'   },
    { from: 288, to: 324, color: '#86efac', label: 'Greed'     },
    { from: 324, to: 360, color: '#00e5a0', label: 'Ext. Greed'},
  ]

  // Zone boundary tick-mark angles (at each zone boundary)
  const ticks = [180, 216, 252, 288, 324, 360]

  function arcPath(startDeg: number, endDeg: number, r: number) {
    const s = (startDeg * Math.PI) / 180
    const e = (endDeg   * Math.PI) / 180
    const x1 = cx + r * Math.cos(s); const y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e); const y2 = cy + r * Math.sin(e)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  /** Returns x,y for a point at angle deg, radius r from centre */
  function pt(deg: number, r: number) {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  const fgColor = taoFearGreed == null ? '#64748b'
    : taoFearGreed >= 60  ? '#00e5a0'
    : taoFearGreed >= 25  ? '#86efac'
    : taoFearGreed >= -25 ? '#f59e0b'
    : taoFearGreed >= -60 ? '#f87171'
    : '#ef4444'

  const inputs: { label: string; value: string; color: string; weight: string; tag?: string; tip: string }[] = [
    {
      label: 'TAO F&G',  value: taoFearGreed != null ? `${taoFearGreed > 0 ? '+' : ''}${taoFearGreed.toFixed(0)}` : '—',
      color: fgColor, weight: '25%', tag: 'live',
      tip: 'TAO.app Fear & Greed Index. Scale: −100 (extreme fear) → +100 (extreme greed). Updates every 5 min from TAO.app live API.',
    },
    {
      label: 'RSI-14',   value: rsi != null ? rsi.toFixed(1) : '—',
      color: rsi == null ? '#64748b' : rsi < 35 ? '#00e5a0' : rsi > 65 ? '#f87171' : '#f59e0b',
      weight: '30%',
      tip: 'Relative Strength Index (14 periods). Below 35 = oversold (bullish signal). Above 65 = overbought (bearish signal). Normalised to −100…+100.',
    },
    {
      label: 'MACD Hist', value: macdHist != null ? (macdHist > 0 ? '+' : '') + macdHist.toFixed(4) : '—',
      color: macdHist == null ? '#64748b' : macdHist > 0 ? '#00e5a0' : '#f87171',
      weight: '25%',
      tip: 'MACD histogram (MACD line − Signal line). Positive = bullish momentum. Negative = bearish momentum. Clamped to −100…+100.',
    },
    {
      label: 'Consensus', value: consensusStats ? `${consensusStats.approval_rate_pct.toFixed(1)}%` : '—',
      color: '#818cf8', weight: '20%',
      tip: 'OpenClaw BFT consensus approval rate. % of bot votes that are BUY vs SELL across recent rounds. Above 50% = net bullish.',
    },
  ]

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col h-full relative">

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Activity size={14} className="text-yellow-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-white">Market Sentiment</h2>
        {/* Info button */}
        <button
          onClick={() => setShowInfo(v => !v)}
          className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-slate-700/60 border border-slate-600/50
                     text-slate-400 hover:bg-indigo-500/20 hover:border-indigo-400/50 hover:text-indigo-300
                     transition-colors cursor-help text-[11px] font-bold select-none"
          title="How is this score calculated?"
        >i</button>
      </div>

      {/* Info popover */}
      {showInfo && (
        <div className="absolute top-10 right-4 z-20 w-[280px] bg-[#0b1526] border border-[#2d3f5a] rounded-xl px-4 py-3
                        shadow-2xl text-[12px] font-mono text-slate-300 leading-relaxed space-y-2">
          <p className="text-white font-bold text-[13px] mb-1">How is this score calculated?</p>
          <p>A blended composite on a <span className="text-yellow-300">−100 (Fear) → +100 (Greed)</span> scale:</p>
          <div className="space-y-1 mt-1">
            {[
              { src: 'RSI-14',       w: hasFg ? '30%' : '40%', desc: 'Momentum oscillator' },
              { src: 'MACD Hist',    w: hasFg ? '25%' : '30%', desc: 'Trend / momentum' },
              { src: 'BFT Consensus',w: hasFg ? '20%' : '30%', desc: 'Bot vote approval rate' },
              { src: 'TAO F&G',      w: hasFg ? '25%' : '—',   desc: 'Live TAO.app index' },
            ].map(r => (
              <div key={r.src} className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{r.src}</span>
                <span className="text-indigo-300 font-bold">{r.w}</span>
                <span className="text-slate-500 text-[11px]">{r.desc}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700/50 pt-2 text-slate-400">
            <span className="text-amber-400 font-bold">Zones: </span>
            ±25 = Neutral boundary · ±60 = Extreme boundary
          </div>
          <button onClick={() => setShowInfo(false)} className="text-slate-500 hover:text-slate-300 text-[11px] mt-1">✕ close</button>
        </div>
      )}

      {/* Zone band — quick color strip showing current zone */}
      <div className="flex rounded overflow-hidden h-1.5 mb-2 gap-px">
        {zones.map(z => (
          <div key={z.label} className="flex-1 rounded-sm transition-all"
               style={{ background: z.color, opacity: label === z.label ? 1 : 0.22 }} />
        ))}
      </div>

      {/* Gauge SVG */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 185 }} preserveAspectRatio="xMidYMid meet">

          {/* Shadow/background arc */}
          <path d={arcPath(180, 360, R)} fill="none" stroke="#1e293b" strokeWidth={16} />

          {/* Coloured zone segments */}
          {zones.map((z, i) => (
            <path key={i} d={arcPath(z.from, z.to, R)}
              fill="none" stroke={z.color} strokeWidth={16} strokeOpacity={0.82} />
          ))}

          {/* Zone boundary tick marks */}
          {ticks.map(deg => {
            const outer = pt(deg, R + 10)
            const inner = pt(deg, R - 10)
            return (
              <line key={deg}
                x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
                stroke="#0d1525" strokeWidth={2} />
            )
          })}

          {/* Inner glow ring */}
          <path d={arcPath(180, 360, R - 20)} fill="none" stroke="#0d1525" strokeWidth={2.5} />

          {/* Zone text labels (inside arc) */}
          {[
            { deg: 198, txt: 'Ext.', color: '#ef4444' },
            { deg: 198, txt: 'Fear',  color: '#ef4444', dy: 10 },
            { deg: 234, txt: 'Fear', color: '#f87171' },
            { deg: 270, txt: 'Neutral', color: '#f59e0b' },
            { deg: 306, txt: 'Greed', color: '#86efac' },
            { deg: 342, txt: 'Ext.',  color: '#00e5a0' },
            { deg: 342, txt: 'Greed', color: '#00e5a0', dy: 10 },
          ].map((lbl, i) => {
            const p = pt(lbl.deg, R - 34)
            return (
              <text key={i} x={p.x} y={p.y + (lbl.dy ?? 0)}
                textAnchor="middle" fontSize={7.5} fontFamily="monospace"
                fill={lbl.color} fillOpacity={0.75}>
                {lbl.txt}
              </text>
            )
          })}

          {/* Needle shadow */}
          <line x1={cx} y1={cy} x2={nx} y2={ny}
            stroke="rgba(0,0,0,0.5)" strokeWidth={4} strokeLinecap="round" />
          {/* Needle */}
          <line x1={cx} y1={cy} x2={nx} y2={ny}
            stroke="white" strokeWidth={2.5} strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.7))' }} />
          {/* Pivot circle */}
          <circle cx={cx} cy={cy} r={6} fill="#1e293b" stroke="white" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={3} fill="white" />

          {/* Score number */}
          <text x={cx} y={cy - 30} textAnchor="middle"
            fontSize={24} fontWeight="800" fontFamily="monospace" fill={labelColor}
            style={{ filter: `drop-shadow(0 0 6px ${labelColor}60)` }}>
            {score > 0 ? '+' : ''}{score.toFixed(0)}
          </text>
          {/* Zone label */}
          <text x={cx} y={cy - 13} textAnchor="middle"
            fontSize={10} fontFamily="monospace" fill={labelColor} fontWeight="600">
            {label}
          </text>

          {/* Far-edge axis labels */}
          <text x={8}    y={cy + 6} fontSize={9} fill="#ef4444" fontFamily="monospace" fontWeight="700">Fear</text>
          <text x={W - 34} y={cy + 6} fontSize={9} fill="#00e5a0" fontFamily="monospace" fontWeight="700">Greed</text>

          {/* Centre label */}
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize={7.5} fill="#94a3b8" fontFamily="monospace">NEUTRAL</text>
        </svg>
      </div>

      {/* Input breakdown */}
      <div className="space-y-1 border-t border-dark-600 pt-2 mt-auto">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Signal</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Weight</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-14 text-right">Value</span>
          </div>
        </div>
        {inputs.map(inp => (
          <div key={inp.label} className="flex items-center justify-between group">
            <span className="text-[12px] font-mono text-slate-400 flex items-center gap-1.5">
              {inp.label}
              {inp.tag === 'live' && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-900/60 text-emerald-400 tracking-wide">LIVE</span>
              )}
              {/* Per-signal info tooltip */}
              <span className="relative inline-flex items-center">
                <span
                  className="w-3.5 h-3.5 rounded-full bg-slate-700/40 border border-slate-600/30 text-slate-500
                             hover:bg-indigo-500/20 hover:border-indigo-400/40 hover:text-indigo-300
                             transition-colors cursor-help text-[9px] font-bold select-none
                             items-center justify-center hidden group-hover:inline-flex"
                  title={inp.tip}
                >i</span>
              </span>
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-600">{inp.weight}</span>
              <span className="text-[13px] font-mono font-bold w-14 text-right" style={{ color: inp.color }}>{inp.value}</span>
            </div>
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
  // TAO.app Fear & Greed (refreshed every 5 min — matches backend cache)
  const [taoFearGreed,   setTaoFearGreed]   = useState<number | null>(null)

  // Recent trades (for bottom panel)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])

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

  // Fear & Greed — fetch once on mount, then refresh every 5 minutes
  const loadFearGreed = useCallback(async () => {
    try {
      const res = await fetch('/api/market/fear-greed')
      if (res.ok) {
        const data = await res.json()
        if (data.value != null) setTaoFearGreed(data.value)
      }
    } catch { /* non-critical — leave null */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    loadFearGreed()
    const id = setInterval(loadFearGreed, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadFearGreed])

  // refresh every 15s, tick every second for cycle countdown
  useEffect(() => {
    const refresh = setInterval(load, 15_000)
    const countdown = setInterval(() => setTick(t => t + 1), 1_000)
    return () => { clearInterval(refresh); clearInterval(countdown) }
  }, [load])

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

  // ── Static card-grid computed values ───────────────────────────────────────
  const _up24h         = (change24h ?? 0) >= 0
  const _approvalRate  = consensusStats?.approval_rate_pct ?? 0
  // Paper Day counter — counts from Zero Day.
  // Session XXVI (2026-05-12): True Clean Slate wipe re-established the baseline.
  // Previous wipe (Session XXV, 2026-05-11) missed the BotConfig singleton and
  // drifted immediately. Today's wipe is the honest start.
  const ZERO_DAY_UTC   = new Date('2026-05-12T12:00:00Z').getTime()
  const paperDay       = Math.max(1, Math.floor((Date.now() - ZERO_DAY_UTC) / 86_400_000) + 1)
  const totalPnl       = summary?.total_pnl ?? 0
  const winRate        = summary?.win_rate ?? 0
  const totalTrades    = summary?.total_trades ?? 0

  return (
    <div className="p-6 space-y-5">

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
          OPERATOR STATIC CARDS — Session XXVIII order (Partner spec):
          Row 1:  II Agent · Win Rate · Total PnL · Total Trades · Paper Day
          Row 2:  TAO/USD · 24h Change · Alerts · Approval Rate · Daily Cap
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* 1 — II Agent regime */}
        <button onClick={() => navigate('/ii-agent')}
          className="bg-dark-800 border border-dark-600 hover:border-indigo-500/40 rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Brain size={14} style={{ color: agentStatus?.regime_color ?? '#818cf8' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">II Agent</p>
            <p className="text-base font-black font-mono mt-0.5 truncate" style={{ color: agentStatus?.regime_color ?? '#818cf8' }}>
              {REGIME_LABEL[agentStatus?.current_regime ?? 'UNKNOWN'] ?? '⟳ SCANNING'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
              {agentStatus?.analysis_count ?? 0} analyses
            </p>
          </div>
          <ChevronRight size={11} className="text-slate-600 group-hover:text-indigo-400 transition-colors mt-1 flex-shrink-0" />
        </button>

        {/* 2 — Win Rate */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            winRate >= 55 ? 'bg-emerald-500/10' : winRate >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10'
          )}>
            <Target size={14} className={winRate >= 55 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Win Rate</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              winRate >= 55 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400'
            )}>
              {summary ? `${winRate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {summary ? `${summary.wins}W · ${summary.losses}L` : 'gate: 55%'}
            </p>
          </div>
        </div>

        {/* 3 — Total PnL */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            totalPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            <DollarSign size={14} className={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Total PnL</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-300'
            )}>
              {summary ? `${fmt(totalPnl, 4)} τ` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">fleet cumulative</p>
          </div>
        </div>

        {/* 4 — Total Trades */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
            <Hash size={14} className="text-slate-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Total Trades</p>
            <p className="text-base font-black font-mono text-white mt-0.5">
              {summary ? totalTrades.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">since Zero Day</p>
          </div>
        </div>

        {/* 5 — Paper Day */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            paperDay >= 7 ? 'bg-emerald-500/10' : 'bg-amber-500/10'
          )}>
            <CalendarDays size={14} className={paperDay >= 7 ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Paper Day</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              paperDay >= 7 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              Day {paperDay}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {paperDay >= 7 ? 'WR gate active' : `${7 - paperDay}d to gate`}
            </p>
          </div>
        </div>

        {/* 6 — TAO / USD price */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            _up24h ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            {_up24h ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">TAO / USD</p>
            <p className="text-base font-black font-mono text-white mt-0.5">
              {price ? `$${price.toFixed(2)}` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">spot</p>
          </div>
        </div>

        {/* 7 — 24h Change */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            _up24h ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            {_up24h ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">24h Change</p>
            <p className={clsx('text-base font-black font-mono mt-0.5', _up24h ? 'text-emerald-400' : 'text-red-400')}>
              {change24h != null ? `${_up24h ? '+' : ''}${change24h.toFixed(2)}%` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">TAO spot</p>
          </div>
        </div>

        {/* 8 — Alerts */}
        <button onClick={() => navigate('/alerts')}
          className={clsx(
            'rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group border',
            unreadAlerts > 0
              ? 'bg-red-500/5 border-red-500/25 hover:border-red-500/50'
              : 'bg-dark-800 border-dark-600 hover:border-slate-500'
          )}>
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            unreadAlerts > 0 ? 'bg-red-500/10' : 'bg-slate-700/50'
          )}>
            <Bell size={14} className={unreadAlerts > 0 ? 'text-red-400' : 'text-slate-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Alerts</p>
            <p className={clsx('text-base font-black font-mono mt-0.5 truncate',
              unreadAlerts > 0 ? 'text-red-400' : 'text-emerald-400'
            )}>
              {unreadAlerts > 0 ? `${unreadAlerts} unread` : 'All clear ✓'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {unreadAlerts > 0 ? 'click to review' : 'no new alerts'}
            </p>
          </div>
          <ChevronRight size={11} className="text-slate-600 group-hover:text-white transition-colors mt-1 flex-shrink-0" />
        </button>

        {/* 9 — Approval Rate (BFT) */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
            <Vote size={14} className="text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Approval Rate</p>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              _approvalRate >= 45 && _approvalRate <= 65 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {consensusStats ? `${_approvalRate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">BFT · 7/12 threshold</p>
          </div>
        </div>

        {/* 10 — Daily Cap */}
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
          </div>
        </div>

      </div>{/* end 10-card grid */}

      {/* ── TradingView Chart — full width, 3× height (Session XXVIII patch) ──
          Session XXVI doubled 320→640px. XXVII intended 640→1280px but the
          flex-1 wrapper collapsed the explicit height. XXVIII fixed the
          wrapper (inline style) and shipped at 1920px — partner walked the
          live deploy, called it ~2× too tall ("$340 line looks about right"
          in the live screenshot). XXVIII-patch halves to 960px (3× original
          baseline). Bottom of chart now lands near the $340 line at typical
          desktop zoom — visible-and-scannable without dominating the page. */}
      <TaoTradingViewChart heightPx={960} />

      {/* ── Bottom row: Top Strategies · Recent Trades · Live Indicators ─────── */}
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

        {/* Recent Trades */}
        <RecentTradesMini trades={recentTrades} />

        {/* Live Indicators (relocated from 2-col row) */}
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

      {/* ── Bottom row: Market Sentiment + Drawdown from Peak (Session XXVI) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SentimentGauge ind={ind} consensusStats={consensusStats} taoFearGreed={taoFearGreed} />
        <DrawdownChart />
      </div>

    </div>
  )
}