import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Play, Square, RefreshCw, TrendingUp, TrendingDown,
  Activity, Zap, Bot, Shield, BarChart2, Clock, Award, Radio,
  Brain, Vote, Bell, Wallet, ArrowUp, ArrowDown, Minus,
  MessageSquare, Send, ChevronDown, ChevronUp,
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
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">TAO / USD</p>
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
          <p className="text-[11px] font-semibold text-white truncate">{s.name}</p>
          <p className="text-[9px] text-slate-500 font-mono uppercase">{s.ticker}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          <TrendIcon trend={s.trend} />
          <span className={clsx('text-[9px] font-mono font-bold', trendColor)}>
            {s.trend.toUpperCase()}
          </span>
        </div>
      </div>

      {/* stake bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[9px] font-mono mb-1">
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
          <p className="text-[9px] text-slate-500 font-mono">APY</p>
          <p className="text-[11px] font-bold text-accent-green font-mono">{s.apy.toFixed(1)}%</p>
        </div>
        <div className="bg-dark-800 rounded px-2 py-1 text-center">
          <p className="text-[9px] text-slate-500 font-mono">Emit</p>
          <p className="text-[11px] font-bold text-yellow-400 font-mono">{(s.emission * 100).toFixed(2)}%</p>
        </div>
      </div>

      {/* score gauge */}
      <div>
        <div className="flex justify-between text-[9px] font-mono mb-1">
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
          <span className="text-[10px] text-slate-500 font-mono font-normal">by stake · live</span>
        </h2>
        <span className="text-[10px] text-slate-500 font-mono">{subnets.length} subnets</span>
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
        <p className="text-[10px] text-slate-300 uppercase tracking-widest font-mono">{label}</p>
        <p className={clsx('text-xl font-bold font-mono mt-0.5', color ?? 'text-white')}>{value}</p>
        {sub && <p className="text-[11px] text-slate-300 mt-0.5">{sub}</p>}
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

  // Mini-chat
  const [miniChatOpen,    setMiniChatOpen]    = useState(true)
  const [miniChatInput,   setMiniChatInput]   = useState('')
  const [miniChatLoading, setMiniChatLoading] = useState(false)
  const [miniChatLast,    setMiniChatLast]    = useState<{ q: string; a: string } | null>(null)
  const miniChatInputRef = useRef<HTMLInputElement>(null)

  const MINI_QUICK = [
    { label: '📊 PnL',     text: 'What is the current fleet PnL?' },
    { label: '🌡️ Regime',  text: 'What is the market regime and RSI?' },
    { label: '🏆 Top bot', text: 'Which is the top performing strategy?' },
  ]

  const sendMiniChat = async (text: string) => {
    const msg = text.trim()
    if (!msg || miniChatLoading) return
    setMiniChatInput('')
    setMiniChatLoading(true)
    setMiniChatLast({ q: msg, a: '' })
    try {
      const { data } = await api.post('/fleet/chat', { message: msg })
      setMiniChatLast({ q: msg, a: data.response })
    } catch {
      setMiniChatLast({ q: msg, a: '⚠️ Agent unreachable — try again.' })
    } finally {
      setMiniChatLoading(false)
    }
  }

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
      const [statusRes, sumRes, stratRes, eqRes, actRes,
             agentRes, consensusRes, walletRes, alertsRes] = await Promise.all([
        api.get('/bot/status'),
        fetch('/api/analytics/summary'),
        fetch('/api/analytics/strategies'),
        fetch('/api/analytics/equity'),
        api.get('/fleet/activity?limit=12'),
        fetch('/api/agent/status').then(r => r.json()).catch(() => null),
        fetch('/api/consensus/stats').then(r => r.json()).catch(() => null),
        fetch('/api/wallet/status').then(r => r.json()).catch(() => null),
        fetch('/api/alerts/unread-count').then(r => r.json()).catch(() => null),
      ])
      setBotStatus(statusRes.data)
      setSummary(await sumRes.json())
      setStrategies(await stratRes.json())
      const eqData: EquityPoint[] = await eqRes.json()
      const stride = Math.max(1, Math.floor(eqData.length / 100))
      setEquity(eqData.filter((_, i) => i % stride === 0))
      setActivity(actRes.data.events || [])
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
        toast.error(res.data.message)
      }
    } catch {
      toast.error('Failed to toggle bot')
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
        <span className="ml-auto text-slate-300 font-mono text-[10px]">
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
            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-mono">II Agent Regime</p>
            <p className="text-sm font-bold font-mono mt-0.5" style={{ color: agentStatus?.regime_color ?? '#6b7280' }}>
              {REGIME_LABEL[agentStatus?.current_regime ?? 'UNKNOWN'] ?? '⟳ SCANNING'}
            </p>
            <p className="text-[10px] text-slate-300 font-mono">{agentStatus?.analysis_count ?? 0} analyses</p>
          </div>
        </div>

        {/* OpenClaw consensus */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Vote size={15} className={
            (consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
          } />
          <div className="min-w-0">
            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-mono">Consensus Rate</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5',
              (consensusStats?.approval_rate_pct ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {consensusStats ? `${consensusStats.approval_rate_pct.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[10px] text-slate-300 font-mono">{consensusStats?.total_rounds ?? 0} rounds</p>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Bell size={15} className={unreadAlerts > 0 ? 'text-red-400' : 'text-slate-300'} />
          <div className="min-w-0">
            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-mono">Unread Alerts</p>
            <p className={clsx('text-sm font-bold font-mono mt-0.5',
              unreadAlerts > 0 ? 'text-red-400' : 'text-emerald-400'
            )}>
              {unreadAlerts > 0 ? `${unreadAlerts} new` : 'All clear'}
            </p>
            <p className="text-[10px] text-slate-300 font-mono">auto-detected</p>
          </div>
        </div>

        {/* Wallet chain */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
          <Wallet size={15} className={walletStatus?.connected ? 'text-indigo-400' : 'text-slate-300'} />
          <div className="min-w-0">
            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-mono">Chain Balance</p>
            <p className="text-sm font-bold font-mono mt-0.5 text-indigo-400">
              {walletStatus?.balance_cached != null
                ? `τ${walletStatus.balance_cached.toFixed(6)}`
                : walletStatus?.connected ? 'Querying…' : 'Offline'}
            </p>
            <p className="text-[10px] text-slate-300 font-mono">
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

        {/* Equity curve — 2/3 width */}
        <div className="xl:col-span-2 bg-dark-800 border border-dark-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp size={14} className="text-accent-green" />
              Equity Curve
              <span className="text-[10px] text-slate-500 font-mono font-normal">cumulative PnL over time</span>
            </h2>
            {equity.length > 1 && summary && (
              <div className="flex items-center gap-3">
                <span className={clsx(
                  'text-sm font-bold font-mono',
                  summary.total_pnl >= 0 ? 'text-accent-green' : 'text-red-400'
                )}>
                  {summary.total_pnl >= 0 ? '+' : ''}{summary.total_pnl.toFixed(4)} τ
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{equity.length} pts</span>
              </div>
            )}
          </div>
          {equity.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="eqGr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00ff88" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false}
                  axisLine={false} tickFormatter={v => v.toFixed(3)} />
                <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: '#152030', border: '1px solid #243450', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  formatter={(v: any) => [`${v.toFixed(4)} τ`, 'Cumulative PnL']}
                />
                <Area dataKey="cumulative" stroke="#00ff88" strokeWidth={2}
                  fill="url(#eqGr)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-300 font-mono text-sm">
              {loading ? 'Loading equity curve…' : 'No trade data yet'}
            </div>
          )}
        </div>

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
            <p className="text-[10px] text-slate-300 font-mono uppercase tracking-widest mb-1">Momentum Signal</p>
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
                    <span className="text-[10px] font-mono text-slate-300">{s.total_trades} trades</span>
                    <span className={clsx('text-[10px] font-mono',
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

        {/* Live activity feed */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 xl:col-span-1">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Activity size={14} className="text-accent-blue" /> Live Activity
            <span className="ml-auto text-[10px] text-slate-300 font-mono">auto-refresh 15s</span>
          </h2>
          <div className="space-y-2 overflow-y-auto max-h-[230px]">
            {activity.slice(0, 20).map((ev, i) => {
              const colors: Record<string, string> = {
                trade: 'text-accent-green', signal: 'text-accent-blue',
                gate: 'text-yellow-400', system: 'text-slate-300', alert: 'text-red-400',
              }
              return (
                <div key={`${ev.id}-${i}`} className="flex items-start gap-2">
                  <span className={clsx('font-mono font-bold flex-shrink-0 text-[11px] mt-0.5 w-10',
                    colors[ev.kind] ?? 'text-slate-300')}>
                    {ev.kind.toUpperCase().slice(0, 3)}
                  </span>
                  <span className="text-slate-200 font-mono text-[12px] truncate leading-relaxed">{ev.message}</span>
                  {ev.strategy && (
                    <span className="text-slate-400 text-[11px] ml-auto flex-shrink-0 font-mono">{ev.strategy.slice(0, 10)}</span>
                  )}
                </div>
              )
            })}
            {activity.length === 0 && (
              <p className="text-slate-300 text-[12px] font-mono text-center py-4">No activity yet</p>
            )}
          </div>
        </div>

        {/* ── Mini-chat ──────────────────────────────────────────────────────── */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden flex flex-col xl:col-span-1">
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-dark-700 cursor-pointer select-none hover:bg-dark-700/40 transition-colors"
            onClick={() => setMiniChatOpen(o => !o)}
          >
            <div className="relative">
              <MessageSquare size={13} className="text-indigo-400" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            </div>
            <span className="text-xs font-bold text-white font-mono uppercase tracking-wider flex-1">Ask II Agent</span>
            {miniChatOpen ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
          </div>

          {miniChatOpen && (
            <>
              {/* Quick prompts */}
              <div className="flex gap-1.5 px-3 py-2 border-b border-dark-700/50 flex-wrap">
                {MINI_QUICK.map(qp => (
                  <button
                    key={qp.label}
                    onClick={() => sendMiniChat(qp.text)}
                    disabled={miniChatLoading}
                    className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/8 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/40 transition-all duration-200 disabled:opacity-40"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>

              {/* Last exchange */}
              <div className="flex-1 px-3 py-3 space-y-2 min-h-[140px] max-h-[180px] overflow-y-auto">
                {!miniChatLast && !miniChatLoading && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Brain size={20} className="text-slate-600 mx-auto mb-1.5" />
                      <p className="text-[11px] text-slate-500 font-mono">Ask about PnL, regime, or top bots</p>
                    </div>
                  </div>
                )}

                {miniChatLast && (
                  <>
                    {/* User question */}
                    <div className="flex justify-end">
                      <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl rounded-tr-sm px-3 py-2 max-w-[90%]">
                        <p className="text-[11px] font-mono text-indigo-100">{miniChatLast.q}</p>
                      </div>
                    </div>

                    {/* Agent answer or loading */}
                    <div className="flex justify-start">
                      <div className="bg-dark-700 border border-dark-600 rounded-xl rounded-tl-sm px-3 py-2 max-w-[90%]">
                        {miniChatLoading || !miniChatLast.a ? (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          <p className="text-[11px] font-mono text-slate-200 leading-relaxed">
                            {miniChatLast.a.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                              part.startsWith('**') && part.endsWith('**')
                                ? <strong key={j} className="text-white font-bold">{part.slice(2, -2)}</strong>
                                : <span key={j}>{part}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-dark-700 px-3 py-2.5">
                <form
                  onSubmit={e => { e.preventDefault(); sendMiniChat(miniChatInput) }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={miniChatInputRef}
                    type="text"
                    value={miniChatInput}
                    onChange={e => setMiniChatInput(e.target.value)}
                    placeholder="Ask anything…"
                    disabled={miniChatLoading}
                    className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!miniChatInput.trim() || miniChatLoading}
                    className={clsx(
                      'p-1.5 rounded-lg transition-all duration-200',
                      miniChatInput.trim() && !miniChatLoading
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        : 'bg-dark-700 text-slate-500 border border-dark-600 cursor-not-allowed'
                    )}
                  >
                    <Send size={12} />
                  </button>
                </form>
              </div>
            </>
          )}

          {!miniChatOpen && miniChatLast?.a && (
            <div className="px-4 py-2">
              <p className="text-[10px] font-mono text-slate-400 truncate">{miniChatLast.a}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}