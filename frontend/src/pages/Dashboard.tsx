import { useEffect, useState, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown,
  Activity, Bot, BarChart2, Clock, Award, Radio,
  Brain, Vote, Bell, Gauge, ShieldAlert, ChevronRight,
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
  useEffect(() => { loadCharts(priceRange) }, [loadCharts, priceRange])
  useEffect(() => {
    loadFearGreed()
    const id = setInterval(loadFearGreed, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadFearGreed])

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
      <PageHeroSlider slides={heroSlides} intervalMs={10000} />

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
          OPERATOR STRIP — 4 high-signal cards: TAO/USD · Daily Cap · Alerts · II Agent
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* 1 — TAO / USD price (first position) */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            (change24h ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            {(change24h ?? 0) >= 0
              ? <TrendingUp size={14} className="text-emerald-400" />
              : <TrendingDown size={14} className="text-red-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">TAO / USD</p>
            <p className="text-base font-black font-mono text-white mt-0.5">
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

        {/* 3 — Alerts */}
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
            <p className={clsx('text-base font-black font-mono mt-0.5',
              unreadAlerts > 0 ? 'text-red-400' : 'text-emerald-400'
            )}>
              {unreadAlerts > 0 ? `${unreadAlerts} unread` : 'All clear ✓'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {unreadAlerts > 0 ? 'click to review' : 'no new alerts'}
            </p>
          </div>
          {unreadAlerts > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0 mt-0.5">
              {unreadAlerts}
            </span>
          )}
          <ChevronRight size={11} className="text-slate-600 group-hover:text-white transition-colors mt-1" />
        </button>

        {/* 4 — II Agent regime status */}
        <button onClick={() => navigate('/ii-agent')}
          className="bg-dark-800 border border-dark-600 hover:border-indigo-500/40 rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Brain size={14} style={{ color: agentStatus?.regime_color ?? '#818cf8' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">II Agent</p>
            <p className="text-base font-black font-mono mt-0.5" style={{ color: agentStatus?.regime_color ?? '#818cf8' }}>
              {REGIME_LABEL[agentStatus?.current_regime ?? 'UNKNOWN'] ?? '⟳ SCANNING'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {agentStatus?.analysis_count ?? 0} analyses · Master Orchestrator
            </p>
          </div>
          <ChevronRight size={11} className="text-slate-600 group-hover:text-indigo-400 transition-colors mt-1" />
        </button>
      </div>

      {/* ── Main 2-col: TradingView (Traditional) + Market Sentiment ────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* TAO/USDT TradingView chart — Traditional — 2/3 width */}
        <TaoTradingViewChart />

        {/* Market Sentiment — 1/3 width (relocated from bottom row) */}
        <SentimentGauge ind={ind} consensusStats={consensusStats} taoFearGreed={taoFearGreed} />

      </div>

      {/* ── TAO/USD Price Chart (Modern / Alternative) ───────────────────────── */}
      <TaoPriceChart
        data={priceHistory}
        range={priceRange}
        onRange={r => setPriceRange(r)}
      />

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
    </div>
  )
}