import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, TrendingDown,
  Activity, BarChart2, Award, Radio,
  Brain, Vote, Bell, ChevronRight, DollarSign, Target, Hash, CalendarDays, Flame,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import api from '@/api/client'
import CexListingHeroStrip from '@/components/CexListingHeroStrip'
import HowItAllConnects from '@/components/HowItAllConnects'
// Session XXXIX (Day 6): WhaleTrackerTile retired — Whale Flow (live RPC)
// is now the canonical dashboard whale surface. TaoStats top-100 leaderboard
// was the original Tracker source and has been 429-throttled for the entire
// paper-training run; rather than keep an empty tile lit, Mark green-lit the
// removal: 'Pioneers, oh Pioneers... All the past we leave behind'. Whale
// Flow tile now expands to fill the slot with full chronological feed +
// click-to-expand row detail.
import WhaleFlowTile from '@/components/WhaleFlowTile'
// Session XXXIX (Day 6): SignalFeedTile slots into the new bottom 3-col row.
import SignalFeedTile from '@/components/SignalFeedTile'
import { InfoBubble } from '@/components/Tooltip'

// ── intelligence types ────────────────────────────────────────────────────────
interface AgentStatus {
  current_regime: string; regime_color: string
  analysis_count: number; total_pnl: number
  fleet_health?: Record<string, string>
}
interface ConsensusStats { total_rounds: number; approval_rate_pct: number; total_buy_votes: number; total_sell_votes: number }
interface WalletStatus { balance_cached: number | null; connected: boolean; block_cached: number | null }
// Session XXXVIII: DailyCap interface relocated to WalletTransactions.tsx
// alongside the Daily Cap KPI card, which now lives in the Transactions page
// summary row instead of the Dashboard. Dashboard no longer fetches it.
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

// Day 9 — Moon phase (computed client-side, no backend dep).
// Conway's algorithm: returns phase index 0..7 + label + emoji + illumination%.
//   0 New · 1 Waxing Crescent · 2 First Quarter · 3 Waxing Gibbous
//   4 Full · 5 Waning Gibbous · 6 Last Quarter · 7 Waning Crescent
// Mark's brief listed Moon Phases alongside Volume / MFI / OI as ambient
// context indicators; this is the one we can light up immediately without a
// backend pipe. Volume/MFI/OI render '—' until the indicator service exposes
// them (mirrors how the existing IndRow rows behave on null inputs).
function moonPhase(date = new Date()): { idx: number; label: string; emoji: string; illum: number } {
  let y = date.getUTCFullYear()
  let m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  if (m < 3) { y -= 1; m += 12 }
  const a = Math.floor(y / 100)
  const b = Math.floor(a / 4)
  const c = 2 - a + b
  const e = Math.floor(365.25 * (y + 4716))
  const f = Math.floor(30.6001 * (m + 1))
  const jd = c + d + e + f - 1524.5
  const daysSinceNew = (jd - 2451549.5) % 29.53058867
  const norm = (daysSinceNew < 0 ? daysSinceNew + 29.53058867 : daysSinceNew) / 29.53058867
  const idx = Math.floor(norm * 8 + 0.5) % 8
  const labels = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                  'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent']
  const emojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘']
  // illumination % approximation: cosine of phase angle, normalized 0..100
  const phaseAngle = norm * 2 * Math.PI
  const illum = Math.round((1 - Math.cos(phaseAngle)) / 2 * 100)
  return { idx, label: labels[idx], emoji: emojis[idx], illum }
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

  // Day 9 R3: the per-input breakdown table (TAO F&G / RSI-14 / MACD Hist /
  // Consensus) was relocated OUT of this card and into the Live Indicators
  // column (between Moon Phase and Momentum Signal) per Mark's directive —
  // the gauge was reading too condensed with the table eating the lower
  // half of the card. The `inputs` array + `fgColor` helper that drove the
  // table are gone with it. Score / needle math below still uses RSI,
  // MACD, Consensus, and TAO F&G — those inputs still feed the gauge,
  // they're just no longer rendered as a separate readout block here.

  // Day 9 R4: dropped `h-full` from this card. With h-full the Sentiment
  // card was claiming 100% of Col 2's stretched stack height, fighting
  // Macro Reference's `flex-1` for space and pushing Macro down past the
  // row baseline. Now Sentiment sizes to its natural content (header +
  // zone band + capped 200px gauge ≈ 280px) and Macro absorbs the rest
  // of Col 2 cleanly via flex-1.
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col relative">

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

      {/* Gauge SVG — Day 9 R4: re-capped at maxHeight 200. R3 dropped the
          cap to let the gauge breathe after the input table was removed,
          but with no ceiling the SVG grew large enough that Col 2's stack
          (Sentiment + Macro Reference) ballooned past Col 3's natural
          baseline — pushing Macro Reference far down and leaving the
          Signal Feed column with too much empty void. 200px is the
          balanced read: gauge is comfortably visible (vs R1's condensed
          125), and the card's total height now leaves Macro Reference
          its natural ~280px slot below within the same row baseline as
          Col 3 (Live Indicators). preserveAspectRatio xMidYMid meet
          keeps the vector centered and proportional inside the cap. */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 200 }} preserveAspectRatio="xMidYMid meet">

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

      {/* Day 9 R3: input breakdown table removed from this card and
          relocated to the Live Indicators column (between Moon Phase and
          Momentum Signal). Comment retained so the layout history is
          legible from the source — see Live Indicators block below for
          the new home of the four sentiment inputs. */}
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

  // Session XXXVIII (Mav spec): bumped from 8 → up to 25 entries with an
  // internal scroll slider, mirroring the Top Strategies leaderboard pattern
  // so the panel doesn't push the page taller.
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-1 flex flex-col">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-accent-blue" /> Recent Trades
        <span className="ml-auto text-[12px] text-slate-500 font-mono">
          last {trades.length}{trades.length >= 25 ? ' · scroll' : ''}
        </span>
      </h2>
      <div className="space-y-2 overflow-y-auto pr-1 dashboard-strat-scroll" style={{ maxHeight: 460 }}>
        {trades.slice(0, 25).map(t => (
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

function IndRow({ label, val, good, bad, format }: {
  label: string; val: number | null | undefined
  good?: number; bad?: number
  /** Optional value formatter. Defaults to toFixed(4) for technical
   *  indicator readings. Day 9 R2: Volume / Open Interest pass a
   *  compact USD formatter so the row reads `$152M` not `152000000.0000`. */
  format?: (v: number) => string
}) {
  const color = val == null ? 'text-slate-300'
    : good != null && bad != null
      ? val <= good ? 'text-accent-green' : val >= bad ? 'text-red-400' : 'text-yellow-400'
      : 'text-white'
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dark-700 last:border-0">
      <span className="text-xs text-slate-300">{label}</span>
      <span className={clsx('text-xs font-mono font-semibold', color)}>
        {val != null ? (format ? format(val) : val.toFixed(4)) : '—'}
      </span>
    </div>
  )
}

// Day 9 R2 — compact USD formatter for Volume / Open Interest rows.
// Picks a magnitude suffix (B / M / K) so the Live Indicators column
// reads at-a-glance rather than as a long digit string.
function fmtCompactUsd(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

/** MacroRow — row variant for pre-formatted string values (e.g. BTC price
 *  with currency symbol, percentage with sign and % suffix). Day 9 Round 2:
 *  bumped label 11→13px, value 12→15px so the Macro Reference card carries
 *  more visual weight (Mark's call: "Enlarge the section just a bit");
 *  vertical padding doubled so each row contributes more height as the card
 *  stretches to fill the bottom of Column 2. */
function MacroRow({ label, val, cls }: {
  label: string; val: string; cls?: string
}) {
  return (
    <div className="flex justify-between items-center py-2 last:border-0">
      <span className="text-[13px] text-slate-400 font-mono">{label}</span>
      <span className={clsx('text-[15px] font-mono font-semibold', cls ?? 'text-white')}>
        {val}
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
  // Session XXXVIII: dailyCap state retired here (moved to Transactions page).
  const [openPositions,  setOpenPositions]  = useState<OpenPositionsSummary | null>(null)
  // TAO.app Fear & Greed (refreshed every 5 min — matches backend cache)
  const [taoFearGreed,   setTaoFearGreed]   = useState<number | null>(null)

  // Recent trades (for bottom panel)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])

  const load = useCallback(async () => {
    try {
      // Session XXXVIII: pulled /api/fleet/daily-cap out of this Promise.all
      // — the Daily Cap KPI now lives on the Transactions page and fetches
      // its own copy. Recent Trades limit bumped 8 → 25 for the expanded
      // section slider. Trades fetched from /api/trades?limit=25.
      const [statusRes, sumRes, stratRes, eqRes,
             agentRes, consensusRes, walletRes, alertsRes, tradesRes,
             posRes] = await Promise.all([
        api.get('/bot/status'),
        fetch('/api/analytics/summary'),
        fetch('/api/analytics/strategies'),
        fetch('/api/analytics/equity'),
        fetch('/api/agent/status').then(r => r.json()).catch(() => null),
        fetch('/api/consensus/stats').then(r => r.json()).catch(() => null),
        fetch('/api/wallet/status').then(r => r.json()).catch(() => null),
        fetch('/api/alerts/unread-count').then(r => r.json()).catch(() => null),
        fetch('/api/trades?limit=25').then(r => r.json()).catch(() => []),
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
  // Top Strategies leaderboard — Session XXX:
  // (1) Backend now honors reset_since so counts are post-Zero-Day honest.
  // (2) Sort priority: WR DESC (the gate-relevant metric), then PnL DESC tie-break.
  // (3) Require min 5 trades so 1-2 trade flukes don't headline. Fallback to
  //     all strategies if none qualify (so the empty state doesn't appear
  //     during the very-first hours of a fresh paper baseline).
  // Session XXXIV: show ALL strategies in the leaderboard with internal scroll
  // (independent of page scroll). Sort by WR desc, PnL desc tie-break.
  const allStrategiesSorted = [...strategies].sort((a, b) => {
    const wr = (b.win_rate ?? 0) - (a.win_rate ?? 0)
    return wr !== 0 ? wr : (b.total_pnl ?? 0) - (a.total_pnl ?? 0)
  })
  const isRunning = botStatus?.is_running ?? false
  const cycleN = botStatus?.cycle_number ?? 0
  const interval = botStatus?.cycle_interval ?? 60

  // seconds since last cycle (approx based on tick)
  const secInCycle = tick % interval
  const secToNext  = interval - secInCycle

  // ── Static card-grid computed values ───────────────────────────────────────
  const _up24h         = (change24h ?? 0) >= 0
  const _approvalRate  = consensusStats?.approval_rate_pct ?? 0
  // Paper Day counter — counts from official Zero Day.
  // Session XXX: corrected from 2026-05-12T12:00:00Z (XXVI placeholder) to the
  // formally-inscribed Zero Day from STATE.md — 2026-05-13T16:39:39 UTC, the
  // moment the threshold-gated fossil wipe fired and 8,552 fossil paper trades
  // were deleted. The 7-day gate opens at Zero Day + 7 days.
  // paperDay starts at Day 1 within the first 24h after Zero Day.
  const ZERO_DAY_UTC    = new Date('2026-05-13T16:39:39Z').getTime()
  const GATE_OPEN_UTC   = ZERO_DAY_UTC + 7 * 86_400_000
  const _msSinceZero    = Math.max(0, Date.now() - ZERO_DAY_UTC)
  const paperDay        = Math.max(1, Math.floor(_msSinceZero / 86_400_000) + 1)
  const _hrsToGate      = Math.max(0, (GATE_OPEN_UTC - Date.now()) / 3_600_000)
  const _daysToGate     = Math.floor(_hrsToGate / 24)
  const _remHrsToGate   = Math.floor(_hrsToGate - _daysToGate * 24)
  const gateLabel       = paperDay >= 7
    ? 'WR gate active'
    : (_daysToGate > 0
        ? `${_daysToGate}d ${_remHrsToGate}h to gate`
        : `${_remHrsToGate}h to gate`)
  const totalPnl       = summary?.total_pnl ?? 0
  const winRate        = summary?.win_rate ?? 0
  const totalTrades    = summary?.total_trades ?? 0

  // Hot / Struggling derived from agentStatus.fleet_health (Session XXXVIII —
  // Hot Strategies KPI relocated from II Agent page to slot 10 of the
  // Dashboard's two-row grid).
  const _fleetHealth   = agentStatus?.fleet_health ?? {}
  const hotCount       = Object.values(_fleetHealth).filter(h => h === 'HOT').length
  const strugglingCount = Object.values(_fleetHealth).filter(h => h === 'STRUGGLING').length

  return (
    <div className="p-6 space-y-5">

      {/* ── Hero strip — CEX Listing Watch (Phase E alert routing) ──────────── */}
      {/* Pops fresh CEX listing detections at the very top so they catch the   */}
      {/* operator's eye the moment they fire.  Renders nothing when no live    */}
      {/* hits — soft-fails on a cold backend.  See CexListingHeroStrip for     */}
      {/* behaviour: auto-rotate, pulse-on-fresh, dismissible per-guid in       */}
      {/* localStorage.                                                         */}
      <CexListingHeroStrip />

      {/* ── How It All Connects (Session XXXV: relocated FROM II Agent page) ── */}
      {/* Lives at the top of the Dashboard above the KPI grid, per Mav's spec. */}
      {/* Color swap from original placement: II Agent green, 12 Bots purple,   */}
      {/* OpenClaw stays purple, Trades stays sky.                              */}
      <HowItAllConnects />

      {/* ── Cycle status bar (Session XXXV: relocated TO OpenClaw + Strategies) */}
      {/* Removed from Dashboard. The bar still appears at the very top of the  */}
      {/* OpenClaw page (below the BFT explainer) and at the top of Strategies. */}

      {/* ══════════════════════════════════════════════════════════════════════
          OPERATOR STATIC CARDS — Session XXXVIII order (Mav spec):
          Row 1:  II Agent · Win Rate · Total PnL · Total Trades · Paper Day
          Row 2:  TAO/USD · 24h Change · Alerts · Approval Rate · Hot Strategies
                                                                  └─ replaced
                                                                     Daily Cap
                                                                     (relocated
                                                                      to the
                                                                      Transactions
                                                                      page KPI
                                                                      row)
          Every card now carries an InfoBubble (i) hover that explains what
          the metric is and how it's computed. ════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* 1 — II Agent regime */}
        <button onClick={() => navigate('/ii-agent')}
          className="bg-dark-800 border border-dark-600 hover:border-indigo-500/40 rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-all group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Brain size={14} style={{ color: agentStatus?.regime_color ?? '#818cf8' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">II Agent</p>
              <InfoBubble content="Current market regime detected by II Agent — BULL, BEAR, SIDEWAYS, or VOLATILE. Updated every 5-minute analysis cycle. The sub-line shows total analyses run since boot. Click the card to open the full II Agent page." side="right" maxWidth={300} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Win Rate</p>
              <InfoBubble content="Fraction of winning trades across the entire fleet (paper + live). The 55% promotion gate is the threshold a bot must clear to graduate from PAPER to APPROVED. 65% + positive PnL is required for APPROVED → LIVE." side="right" maxWidth={300} />
            </div>
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

        {/* 3 — Total PnL  (Session XXXVIII: tooltip merged with retired Fleet PnL definition) */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            totalPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            <DollarSign size={14} className={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Total PnL</p>
              <InfoBubble content="Cumulative profit/loss across ALL strategy bots, measured in TAO. Combines paper + live trades. A bot's contribution stays in PAPER until it earns LIVE promotion (55%+ WR → APPROVED, 65%+ WR & 0.05τ+ PnL → LIVE). Negative is expected early in paper training — this is the fleet's full track record from Zero Day." side="right" maxWidth={320} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Total Trades</p>
              <InfoBubble content="Total trade count across the fleet since Zero Day (formal restart 2026-05-13 16:39:39 UTC, when 8,552 fossil paper trades were wiped). Counts every entry/exit event from every strategy — paper and live combined." side="right" maxWidth={300} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Paper Day</p>
              <InfoBubble content="Days elapsed since Zero Day. Day 7 is the gate-open milestone — strategies need at least 7 days of paper history before they can pass the WR/PnL gates and earn promotion to LIVE. Until Day 7, the fleet is in pure observation mode." side="right" maxWidth={300} />
            </div>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              paperDay >= 7 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              Day {paperDay}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {gateLabel}
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">TAO / USD</p>
              <InfoBubble content="Current TAO spot price in USD. Sourced from CoinGecko, refreshed every 60 seconds. This is the same price feed every strategy reads when generating its BUY/SELL signal." side="right" maxWidth={280} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">24h Change</p>
              <InfoBubble content="TAO spot percentage move over the last 24 hours. Drives the regime detector — large moves shift the fleet's regime classification (e.g., > +5% = BULL, < -5% = BEAR, choppy = VOLATILE)." side="right" maxWidth={280} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Alerts</p>
              <InfoBubble content="Unread alert count across all levels (CRITICAL · WARNING · INFO · SYSTEM). Click the card to open the inbox. Critical/Warning alerts also surface in the top-right notification bell with a priority pill." side="right" maxWidth={280} />
            </div>
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
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Approval Rate</p>
              <InfoBubble content="OpenClaw BFT consensus approval rate — fraction of consensus rounds that hit the 7-of-12 supermajority. Healthy band is 45–65%. Too high = the council is rubber-stamping; too low = the council never agrees on a trade. Click to dig into OpenClaw." side="right" maxWidth={300} />
            </div>
            <p className={clsx('text-base font-black font-mono mt-0.5',
              _approvalRate >= 45 && _approvalRate <= 65 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {consensusStats ? `${_approvalRate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">BFT · 7/12 threshold</p>
          </div>
        </div>

        {/* 10 — Hot Strategies (Session XXXVIII: relocated FROM II Agent page,
                replaces Daily Cap which moved to the Transactions page) */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Flame size={14} className="text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Hot Strategies</p>
              <InfoBubble content="🔥 HOT = bot is outperforming with a winning streak. 🔴 STRUGGLING = bot has consecutive losses or a win rate below threshold. Neither label is permanent — conditions re-evaluate every cycle. Sub-line shows current struggling count." side="right" maxWidth={300} />
            </div>
            <p className="text-base font-black font-mono mt-0.5 text-emerald-400">
              {hotCount}
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {strugglingCount} struggling
            </p>
          </div>
        </div>

      </div>{/* end 10-card grid */}

      {/* ── Top working-data row: Top Strategies · Recent Trades · Whale Flow ──
          Session XXIX: TradingView chart relocated FROM here to BELOW this row
          (chart now sits at the bottom of the Dashboard). Partner walked the
          960px chart above the bottom row and called it impractical — the
          chart now sits below the working-data tiles so the actionable
          fleet/recent/flow view is the lead, and price chart is
          reference material at page-bottom.
          Session XXXIX (Day 6): Whale Flow swapped IN from the post-chart row
          per Mav — Whale Flow is the highest-signal action surface, belongs
          alongside strategy/trade tiles. Live Indicators moved DOWN to the
          new 3-col ambient/context row below the chart. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Strategy leaderboard — Session XXXIV: ALL strategies w/ internal scroll */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Award size={14} className="text-yellow-400" /> Top Strategies
            </h2>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              {allStrategiesSorted.length} total · scroll
            </span>
          </div>
          <div
            className="space-y-2 overflow-y-auto pr-1 dashboard-strat-scroll"
            style={{ maxHeight: 460 }}
          >
            {allStrategiesSorted.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 px-3 py-2 bg-dark-700 rounded-lg">
                <span className="text-slate-300 font-mono text-xs w-5 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">{s.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[13px] font-mono text-slate-300">{s.total_trades} trades</span>
                    <span className={clsx('text-[13px] font-mono',
                      s.win_rate >= 55 ? 'text-accent-green' : s.win_rate >= 40 ? 'text-amber-400' : 'text-red-400'
                    )}>{(s.win_rate ?? 0).toFixed(1)}% WR</span>
                  </div>
                </div>
                <span className={clsx('font-mono text-sm font-bold flex-shrink-0',
                  s.total_pnl > 0 ? 'text-accent-green' : s.total_pnl < 0 ? 'text-red-400' : 'text-slate-400'
                )}>
                  {fmt(s.total_pnl, 4)}
                </span>
              </div>
            ))}
            {allStrategiesSorted.length === 0 && (
              <p className="text-slate-300 text-xs font-mono text-center py-4">No strategy data yet</p>
            )}
          </div>
        </div>

        {/* Recent Trades */}
        <RecentTradesMini trades={recentTrades} />

        {/* Whale Flow — Session XXXIX (Day 6): promoted from the post-chart
            2-col row UP to the working-data 3-col row alongside Top Strategies
            + Recent Trades. Whale Flow is action-tier (directional pressure
            from large stake/unstake events) — natural neighbor for strategy
            and trade context. Live Indicators moved DOWN to the new ambient
            3-col row below the chart. */}
        <WhaleFlowTile />

      </div>

      {/* ── TradingView Chart — full width (Session XXIX) ─────────────────────
          History: XXVI 640px, XXVII intended 1280 (collapsed by flex-1 bug),
          XXVIII fixed wrapper + shipped 1920 (too tall) → patched to 960
          ("good feel but not practical"). XXIX: chart relocated from above
          bottom row to BELOW it, and reduced 960→640px per partner spec
          ("around the $295 price line, current market"). 640px is XXVI's
          previously-validated size; with the relocation, the chart now
          serves as page-bottom reference material rather than headline. */}
      <TaoTradingViewChart heightPx={640} />

      {/* ── Bottom row: Signal Feed · Market Sentiment · Live Indicators ──────
          Session XXVI placed Drawdown from Peak here. Session XXXV: Mav moved
          DrawdownChart down to P&L Summary and slotted the Whale Tracker here.
          Session XXXVIII added the Whale Flow tile alongside the Tracker.
          Session XXXIX morning (Day 6): Tracker retired (TaoStats free-tier
          429s) → 2-up: Sentiment + Flow.

          Session XXXIX (Day 6, second pass): Mav rearranged again —
            • Whale Flow swapped UP into the working-data row above the chart
              (action-tier, lives next to Top Strategies + Recent Trades).
            • Live Indicators swapped DOWN here (ambient/context tier — RSI,
              EMA, MACD etc. are reference signals, not trigger surfaces).
            • New SignalFeedTile added as the third column — pulls live
              kind="signal" events from the activity ring buffer (CoinGecko /
              Reddit / TaoDaily / Taostats / Discord). Twitter/X intentionally
              not wired (paid API tier; we just removed Perplexity for the
              same reason — see signal_ingestor.py XXXIX comment).
          Three columns fit and read better than two on this row. */}
      {/* Day 9 layout: Col 2 is now a VERTICAL STACK (Sentiment over Macro),
          per Mark's clarification. Bottom-row sections are no longer same-
          proportions siblings — Col 1 / Col 3 are full-height tiles, Col 2
          stacks two cards.
          Day 9 Round 2: dropped `items-start` so all three columns stretch
          to a common baseline (the tallest sibling). Inside Col 2, the
          Sentiment gauge takes its natural height and the Macro card flexes
          to fill the remainder — so Macro now reaches the bottom of the row
          alongside Signal Feed (Col 1) and Live Indicators (Col 3). */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Column 1 — Signal Feed (new XXXIX Day 6) */}
        <SignalFeedTile />

        {/* Column 2 — vertical stack: Market Sentiment on top, Macro
            Reference (BTC) + Divergence below in their own card.
            Macro/Divergence relocated FROM Live Indicators (Col 3) per Mark's
            Day 9 spec — sentiment-tier readings cluster together, ambient
            technical indicators stay together in Col 3. `h-full` makes the
            stack inherit the row's stretched height; the Macro card uses
            `flex-1` to fill what Sentiment doesn't claim. */}
        <div className="flex flex-col gap-5 h-full">
          <SentimentGauge ind={ind} consensusStats={consensusStats} taoFearGreed={taoFearGreed} />

          {/* Macro Reference (BTC) + Divergence — relocated card.
              The macro_correlation strategy fires on BTC-vs-TAO 24h
              divergence (±1.5pp + 1.0% BTC activity floor). Surfacing
              live values here gives the operator situational awareness on
              macro days without hunting through logs. Renders only when
              hydrator has populated btc_price / btc_change_24h on /bot/status
              indicators (Day 8 R5 wiring).
              Day 9 R2: padding 4→5, header 14→15px+gap, flex-1 to fill the
              column's bottom alongside Col 1 / Col 3. The Divergence row
              also got a typography bump for parity with the upgraded
              MacroRow. */}
          {(ind.btc_price != null || ind.btc_change_24h != null) && (
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 flex flex-col flex-1">
              <h2 className="text-base font-semibold text-white flex items-center gap-2.5 mb-3">
                <Radio size={15} className="text-orange-400" />
                Macro Reference <span className="text-[13px] text-slate-500 font-mono font-normal">BTC · TAO</span>
              </h2>
              <MacroRow label="BTC Price"
                        val={ind.btc_price != null ? `$${ind.btc_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'} />
              <MacroRow label="BTC 24h"
                        val={ind.btc_change_24h != null ? `${ind.btc_change_24h >= 0 ? '+' : ''}${ind.btc_change_24h.toFixed(2)}%` : '—'}
                        cls={ind.btc_change_24h == null ? 'text-slate-400' : ind.btc_change_24h >= 0 ? 'text-accent-green' : 'text-red-400'} />
              <MacroRow label="TAO 24h"
                        val={ind.tao_change_24h != null ? `${ind.tao_change_24h >= 0 ? '+' : ''}${ind.tao_change_24h.toFixed(2)}%` : '—'}
                        cls={ind.tao_change_24h == null ? 'text-slate-400' : ind.tao_change_24h >= 0 ? 'text-accent-green' : 'text-red-400'} />
              {ind.btc_change_24h != null && ind.tao_change_24h != null && (() => {
                const div = ind.btc_change_24h! - ind.tao_change_24h!
                const triggered = Math.abs(div) >= 1.5
                const cls = triggered ? (div > 0 ? 'text-accent-green' : 'text-red-400') : 'text-slate-400'
                const note = triggered
                  ? (div > 0 ? ' • TAO lagging' : ' • TAO leading')
                  : ' • neutral'
                return (
                  <div className="flex items-center justify-between font-mono mt-3 pt-3 border-t border-dark-700">
                    <span className="text-[13px] text-slate-400">Divergence</span>
                    <span className={clsx('text-[15px] font-semibold', cls)}>
                      {div > 0 ? '+' : ''}{div.toFixed(2)}pp{note}
                    </span>
                  </div>
                )
              })()}

              {/* Day 9 R2 — visual filler note pinned to the card bottom.
                  Carries the macro_correlation gate doctrine in plain
                  language so the operator reads context, not just numbers,
                  AND gives the card real ink to fill its stretched height
                  without forcing an empty void. `mt-auto` floats it to the
                  card's bottom edge. */}
              <div className="mt-auto pt-4">
                <div className="p-3 rounded-lg bg-dark-700/50 border border-dark-600/60">
                  <p className="text-[11px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">
                    Macro Gate
                  </p>
                  <p className="text-[12px] text-slate-300 font-mono leading-relaxed">
                    Macro Correlation fires on BTC↔TAO divergence ≥ <span className="text-slate-200">±1.5pp</span> with a <span className="text-slate-200">1.0%</span> BTC activity floor. Quiet macro days → bot abstains.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Column 3 — Live Indicators.
            Day 9 changes:
              · Macro Reference + Divergence relocated OUT (now lives in Col 2
                under Market Sentiment).
              · New ambient rows added per Mark's brief: Volume, MFI,
                Open Interest, Moon Phase. Volume/MFI/OI render '—' until the
                indicator service exposes them on /bot/status (mirrors how the
                existing rows behave on null — same nullable IndRow pattern).
                Moon Phase computes client-side via Conway's algorithm — no
                backend dep, lights up immediately.
              · Momentum Signal block stays at the bottom (the live trigger
                read-out, kept per Mark's brief). */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 h-full flex flex-col">
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

          {/* Day 9 R2 — new ambient rows, now backend-wired.
              · volume_24h: passthrough of CoinGecko's `usd_24h_vol` (rolling
                24h volume in USD). Compact-USD formatter.
              · mfi_14:     Wilder-smoothed Money Flow Index from price +
                volume buffers. ≤20 oversold (BUY), ≥80 overbought (SELL),
                mirrors RSI band semantics. Caveat documented backend-side:
                per-tick volume is rolling-24h not per-period candle, so the
                signal is degraded vs OHLCV-MFI — observability tier, not a
                strategy gate.
              · open_interest: USD-denominated OI from OKX TAO-USDT-SWAP.
                Polled on the 30s price loop. Renders '—' on stale fetch
                (e.g. if OKX is geo-blocked from Railway's edge).
              All three null-degrade to '—' just like RSI/EMA before
              warmup, same pattern. */}
          <IndRow label="Volume 24h"
                  val={(ind.volume_24h ?? null) as number | null}
                  format={fmtCompactUsd} />
          <IndRow label="MFI (14)"
                  val={(ind.mfi_14 ?? null) as number | null}
                  good={20} bad={80} />
          <IndRow label="Open Interest"
                  val={(ind.open_interest ?? null) as number | null}
                  format={fmtCompactUsd} />

          {/* Moon Phase — computed client-side, always live */}
          {(() => {
            const mp = moonPhase()
            return (
              <div className="flex justify-between items-center py-1.5 border-b border-dark-700 last:border-0">
                <span className="text-xs text-slate-300">Moon Phase</span>
                <span className="text-xs font-mono font-semibold text-slate-200 flex items-center gap-1.5"
                      title={`${mp.label} · ~${mp.illum}% illuminated`}>
                  <span className="text-base leading-none">{mp.emoji}</span>
                  <span className="text-slate-400 text-[11px]">{mp.label}</span>
                  <span className="text-slate-500 text-[11px]">{mp.illum}%</span>
                </span>
              </div>
            )
          })()}

          {/* Day 9 R3 — sentiment input rows, relocated FROM the Market
              Sentiment card per Mark's directive (no separate wrap). The
              Sentiment gauge was reading too condensed with these four
              rows eating the lower half of that card; moved here to
              de-clutter the gauge while keeping the readouts visible.
              RSI-14 not duplicated — already shown above as a Live
              Indicator row, would be redundant. The remaining three are
              the unique sentiment-tier inputs:
                · TAO F&G  — TAO.app Fear & Greed Index (5-min cache),
                  contrarian frame: ≤ −25 = fear/buy (green),
                  ≥ +25 = greed/sell (red).
                · MACD Hist — MACD line minus Signal line; positive =
                  bullish momentum, negative = bearish.
                · Consensus — OpenClaw BFT approval rate %; healthy band
                  is 45–65%, mirrors the KPI grid card. */}
          <IndRow label="TAO F&G"
                  val={taoFearGreed}
                  good={-25} bad={25}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} />
          <IndRow label="MACD Hist"
                  val={(ind.macd != null && ind.macd_signal != null)
                    ? (ind.macd as number) - (ind.macd_signal as number)
                    : null}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(4)}`} />
          <IndRow label="Consensus"
                  val={consensusStats?.approval_rate_pct ?? null}
                  format={(v) => `${v.toFixed(1)}%`} />

          {/* Momentum signal summary — Day 9 R4: relocated UP to sit just
              below Consensus (was floating at the column bottom via
              `mt-auto`). With Momentum hugging the sentiment cluster, Col 3
              now has a tight natural content height — which becomes the
              row's baseline. Col 2's Sentiment+Macro stack and Col 1's
              Signal Feed both flush to that baseline cleanly, no more
              empty void below the last row in any column. The summary
              block keeps its dark callout pill styling for the visual
              break from the indicator rows above; just `mt-3` spacing
              instead of an mt-auto floor. */}
          <div className="mt-3">
            <div className="p-3 rounded-lg bg-dark-700 border border-dark-600">
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

    </div>
  )
}