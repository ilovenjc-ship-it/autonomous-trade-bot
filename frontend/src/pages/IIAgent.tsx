/**
 * II Agent — Master Orchestrator Dashboard
 * The top-level intelligence view: regime, fleet health, observations, recommendations.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Brain, TrendingUp, TrendingDown, Minus, Zap,
  Activity, RefreshCw, ChevronRight, AlertTriangle,
  CheckCircle2, Flame, Eye, BarChart3, Lightbulb,
  Cpu, Radio, ShieldAlert, ArrowUpRight,
} from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentStatus {
  analysis_count:       number
  last_analysis_at:     string | null
  current_regime:       string
  regime_color:         string
  total_pnl:            number
  is_running:           boolean
  observation_count:    number
  recommendation_count: number
  fleet_health:         Record<string, string>
  price:                number | null
}

interface Observation {
  id:        number
  level:     string   // REGIME | FLEET | CONSENSUS | ALERT | SYSTEM
  message:   string
  data:      Record<string, unknown>
  timestamp: string
}

interface Recommendation {
  type:        string   // WARNING | OPPORTUNITY | REGIME | CONSENSUS
  strategy:    string | null
  action:      string
  priority:    string   // HIGH | MEDIUM | LOW
  timestamp:   string
  analysis_id: number
}

interface FleetBot {
  name:         string
  display_name: string
  mode:         string
  health:       string
  win_rate:     number
  total_pnl:    number
  cycles:       number
  total_trades: number
}

interface AnalysisReport {
  regime:        string
  regime_color:  string
  price:         number
  rsi:           number | null
  fleet_summary: FleetBot[]
  fleet_pnl:     number
  hot_bots:      string[]
  struggling_bots: string[]
  promotable_bots: string[]
  velocity:      number
}

// ── Regime config ─────────────────────────────────────────────────────────────

const REGIME_CONFIG: Record<string, { icon: typeof TrendingUp; label: string; glow: string; bg: string; text: string }> = {
  BULL:     { icon: TrendingUp,   label: 'BULL MARKET',   glow: 'shadow-emerald-500/30', bg: 'bg-emerald-500/10 border-emerald-500/40', text: 'text-emerald-400' },
  BEAR:     { icon: TrendingDown, label: 'BEAR MARKET',   glow: 'shadow-red-500/30',     bg: 'bg-red-500/10 border-red-500/40',         text: 'text-red-400'     },
  SIDEWAYS: { icon: Minus,        label: 'SIDEWAYS',      glow: 'shadow-amber-500/30',   bg: 'bg-amber-500/10 border-amber-500/40',     text: 'text-amber-400'   },
  VOLATILE: { icon: Zap,          label: 'VOLATILE',      glow: 'shadow-purple-500/30',  bg: 'bg-purple-500/10 border-purple-500/40',   text: 'text-purple-400'  },
  UNKNOWN:  { icon: Activity,     label: 'SCANNING…',     glow: 'shadow-slate-500/20',   bg: 'bg-slate-700/30 border-slate-600/40',     text: 'text-slate-300'   },
}

const HEALTH_CONFIG: Record<string, { label: string; border: string; bg: string; text: string; dot: string }> = {
  HOT:        { label: '🔥 HOT',       border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  HEALTHY:    { label: '✅ HEALTHY',   border: 'border-sky-500/40',     bg: 'bg-sky-500/10',     text: 'text-sky-300',     dot: 'bg-sky-500'     },
  WATCHING:   { label: '⚠️ WATCHING', border: 'border-amber-500/40',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   dot: 'bg-amber-500'   },
  STRUGGLING: { label: '🔴 WEAK',     border: 'border-red-500/40',     bg: 'bg-red-500/10',     text: 'text-red-300',     dot: 'bg-red-500'     },
  INACTIVE:   { label: '⚙️ WARMING',  border: 'border-slate-600/40',   bg: 'bg-slate-700/30',   text: 'text-slate-300',   dot: 'bg-slate-600'   },
}

const OBS_LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: typeof Brain }> = {
  REGIME:    { color: 'text-purple-400', bg: 'border-l-purple-500',  icon: Activity   },
  FLEET:     { color: 'text-sky-400',    bg: 'border-l-sky-500',     icon: BarChart3  },
  CONSENSUS: { color: 'text-amber-400',  bg: 'border-l-amber-500',   icon: Radio      },
  ALERT:     { color: 'text-red-400',    bg: 'border-l-red-500',     icon: AlertTriangle },
  SYSTEM:    { color: 'text-emerald-400',bg: 'border-l-emerald-500', icon: Cpu        },
}

const REC_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Lightbulb }> = {
  WARNING:   { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: ShieldAlert  },
  OPPORTUNITY:{ color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: ArrowUpRight },
  REGIME:    { color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  icon: Zap          },
  CONSENSUS: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Radio        },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeSince(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulseRing({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', color)} />
      <span className={clsx('relative inline-flex rounded-full h-3 w-3', color)} />
    </span>
  )
}

function RegimeCard({ regime, color, price, rsi }: {
  regime: string; color: string; price: number | null; rsi: number | null
}) {
  const cfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN
  const Icon = cfg.icon

  return (
    <div className={clsx(
      'relative rounded-2xl border p-5 flex flex-col gap-3 shadow-xl overflow-hidden',
      cfg.bg, cfg.glow,
    )}>
      {/* Ambient glow blob */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-20"
        style={{ background: color }}
      />

      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: color + '25' }}>
            <Icon size={22} style={{ color }} />
          </div>
          <div>
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-mono">Market Regime</p>
            <p className="text-2xl font-black tracking-tight" style={{ color }}>{cfg.label}</p>
          </div>
        </div>
        <PulseRing color={regime === 'BULL' ? 'bg-emerald-500' : regime === 'BEAR' ? 'bg-red-500' : 'bg-amber-500'} />
      </div>

      <div className="flex gap-4 relative">
        <div>
          <p className="text-[10px] text-slate-300 font-mono">TAO Price</p>
          <p className="text-lg font-bold text-white font-mono">${price?.toFixed(2) ?? '—'}</p>
        </div>
        {rsi !== null && (
          <div>
            <p className="text-[10px] text-slate-300 font-mono">RSI-14</p>
            <p className={clsx('text-lg font-bold font-mono', rsi > 65 ? 'text-red-400' : rsi < 35 ? 'text-emerald-400' : 'text-white')}>
              {rsi.toFixed(1)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function FleetHealthCard({ bot }: { bot: FleetBot }) {
  const hcfg = HEALTH_CONFIG[bot.health] ?? HEALTH_CONFIG.INACTIVE
  return (
    <div className={clsx(
      'rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-300',
      hcfg.bg, hcfg.border,
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-white truncate pr-1">{bot.display_name}</p>
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', hcfg.dot)} />
      </div>
      <p className={clsx('text-[10px] font-mono font-bold', hcfg.text)}>{hcfg.label}</p>
      <div className="flex justify-between text-[10px] font-mono text-slate-300">
        <span className={bot.win_rate >= 55 ? 'text-emerald-400' : 'text-red-400'}>{bot.win_rate.toFixed(1)}% WR</span>
        <span className={bot.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{bot.total_pnl >= 0 ? '+' : ''}{bot.total_pnl.toFixed(4)}τ</span>
      </div>
      <div className={clsx(
        'text-[9px] font-mono px-1.5 py-0.5 rounded self-start',
        bot.mode === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400' :
        bot.mode === 'APPROVED_FOR_LIVE' ? 'bg-sky-500/20 text-sky-400' :
        'bg-slate-700 text-slate-300'
      )}>
        {bot.mode === 'LIVE' ? '🚀 LIVE' : bot.mode === 'APPROVED_FOR_LIVE' ? '✅ APPROVED' : '📄 PAPER'}
      </div>
    </div>
  )
}

function ObservationRow({ obs }: { obs: Observation }) {
  const cfg = OBS_LEVEL_CONFIG[obs.level] ?? OBS_LEVEL_CONFIG.SYSTEM
  const Icon = cfg.icon
  return (
    <div className={clsx('border-l-2 pl-3 py-2 transition-colors hover:bg-dark-700/30', cfg.bg)}>
      <div className="flex items-start gap-2">
        <Icon size={12} className={clsx('mt-0.5 flex-shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-300 leading-relaxed">{obs.message}</p>
          <div className="flex gap-3 mt-1">
            <span className={clsx('text-[10px] font-mono font-bold', cfg.color)}>{obs.level}</span>
            <span className="text-[10px] text-slate-300 font-mono">{timeSince(obs.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const cfg = REC_CONFIG[rec.type] ?? REC_CONFIG.REGIME
  const Icon = cfg.icon
  return (
    <div className={clsx('rounded-xl border p-4 flex gap-3', cfg.bg, cfg.border)}>
      <div className={clsx('p-1.5 rounded-lg h-fit', cfg.bg)}>
        <Icon size={14} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('text-[10px] font-bold font-mono uppercase', cfg.color)}>{rec.type}</span>
          <span className={clsx(
            'text-[9px] font-mono px-1.5 py-0.5 rounded',
            rec.priority === 'HIGH'   ? 'bg-red-500/20 text-red-400' :
            rec.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-slate-700 text-slate-300'
          )}>{rec.priority}</span>
          {rec.strategy && (
            <span className="text-[10px] text-slate-300 font-mono truncate">{rec.strategy}</span>
          )}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{rec.action}</p>
        <p className="text-[10px] text-slate-300 font-mono mt-1">{timeSince(rec.timestamp)}</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IIAgent() {
  const [status,      setStatus]      = useState<AgentStatus | null>(null)
  const [observations,setObservations]= useState<Observation[]>([])
  const [recommendations,setRecs]     = useState<Recommendation[]>([])
  const [lastReport,  setLastReport]  = useState<AnalysisReport | null>(null)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [flash,       setFlash]       = useState(false)

  const load = useCallback(async () => {
    try {
      const [statusRes, obsRes, recsRes] = await Promise.all([
        fetch('/api/agent/status'),
        fetch('/api/agent/observations?limit=40'),
        fetch('/api/agent/recommendations'),
      ])
      const s = await statusRes.json()
      const o = await obsRes.json()
      const r = await recsRes.json()
      setStatus(s)
      if (o.observations) setObservations(o.observations)
      if (r.recommendations) setRecs(r.recommendations)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('II Agent load error', e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const res  = await fetch('/api/agent/analyze', { method: 'POST' })
      const data = await res.json()
      setLastReport(data.report)
      setFlash(true)
      setTimeout(() => setFlash(false), 1500)
      await load()
    } catch (e) {
      console.error('Analyze error', e)
    } finally {
      setAnalyzing(false)
    }
  }

  const regime    = status?.current_regime ?? 'UNKNOWN'
  const regimeCfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN

  // Build fleet array from last report or status health map
  const fleetBots: FleetBot[] = lastReport?.fleet_summary ?? []

  // Derive counts from observations
  const hotCount        = lastReport?.hot_bots?.length        ?? Object.values(status?.fleet_health ?? {}).filter(h => h === 'HOT').length
  const strugglingCount = lastReport?.struggling_bots?.length ?? Object.values(status?.fleet_health ?? {}).filter(h => h === 'STRUGGLING').length

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-700',
            flash ? 'bg-indigo-500 shadow-indigo-500/50' : 'bg-gradient-to-br from-indigo-600 to-purple-700 shadow-indigo-500/20',
          )}>
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">II Agent</h1>
              <span className="text-xs font-mono text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                Master Orchestrator
              </span>
            </div>
            <p className="text-xs text-slate-300 font-mono">
              Regime · Fleet · Consensus · Recommendations
              {status?.last_analysis_at && (
                <span className="ml-2 text-slate-300">· Last analysis {timeSince(status.last_analysis_at)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300 font-mono">↻ {lastRefresh.toLocaleTimeString()}</span>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300',
              analyzing
                ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 cursor-wait'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40'
            )}
          >
            {analyzing ? (
              <><RefreshCw size={14} className="animate-spin" /> Analysing…</>
            ) : (
              <><Brain size={14} /> Run Analysis</>
            )}
          </button>
          <button onClick={load} className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Top row: Regime + Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Regime card — takes 1 col */}
        <RegimeCard
          regime={regime}
          color={status?.regime_color ?? '#6b7280'}
          price={status?.price ?? null}
          rsi={lastReport?.rsi ?? null}
        />

        {/* Stat cards — 2 cols */}
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: BarChart3, label: 'Analyses Run',
              value: status?.analysis_count ?? 0,
              sub: 'total cycles', accent: 'text-indigo-400',
            },
            {
              icon: Flame, label: 'Hot Strategies',
              value: hotCount,
              sub: `${strugglingCount} struggling`, accent: 'text-emerald-400',
            },
            {
              icon: CheckCircle2, label: 'Fleet PnL',
              value: `${(status?.total_pnl ?? 0) >= 0 ? '+' : ''}${(status?.total_pnl ?? 0).toFixed(4)}τ`,
              sub: 'cumulative', accent: (status?.total_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            },
            {
              icon: Lightbulb, label: 'Recommendations',
              value: status?.recommendation_count ?? 0,
              sub: 'active directives', accent: 'text-amber-400',
            },
          ].map(({ icon: Icon, label, value, sub, accent }) => (
            <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon size={14} className={accent} />
                <p className="text-[10px] text-slate-300 uppercase tracking-wider font-mono">{label}</p>
              </div>
              <p className={clsx('text-xl font-bold font-mono', accent)}>{value}</p>
              <p className="text-[10px] text-slate-300">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fleet Health Grid ── */}
      {fleetBots.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-slate-300" />
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Fleet Health Monitor</span>
            <span className="ml-auto text-[10px] text-slate-300 font-mono">
              {fleetBots.filter(b => b.health === 'HOT').length} hot · {fleetBots.filter(b => b.health === 'STRUGGLING').length} struggling
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
            {fleetBots.map(bot => (
              <FleetHealthCard key={bot.name} bot={bot} />
            ))}
          </div>
        </div>
      )}

      {/* ── Observations + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Observations — 2/3 width */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <div className="relative">
              <Brain size={14} className="text-indigo-400" />
              {analyzing && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
              )}
            </div>
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Agent Observation Log</span>
            <span className="ml-auto text-[10px] text-slate-300 font-mono">{observations.length} entries</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px] divide-y divide-dark-700/50 px-4 py-2 space-y-0">
            {observations.length === 0 ? (
              <div className="py-12 text-center">
                <Brain size={32} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-300 text-sm font-mono">Agent initialising…</p>
                <p className="text-slate-700 text-xs mt-1">Click "Run Analysis" to trigger the first observation cycle.</p>
              </div>
            ) : (
              observations.map(obs => (
                <ObservationRow key={obs.id} obs={obs} />
              ))
            )}
          </div>
        </div>

        {/* Recommendations — 1/3 width */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400" />
            <span className="text-xs text-slate-300 uppercase tracking-wider font-mono">Directives</span>
            <span className="ml-auto text-[10px] text-slate-300 font-mono">{recommendations.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px] p-3 space-y-2">
            {recommendations.length === 0 ? (
              <div className="py-12 text-center">
                <Lightbulb size={28} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-300 text-xs font-mono">No recommendations yet.</p>
              </div>
            ) : (
              recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Agent Architecture ── */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-xl p-4">
        <p className="text-xs text-slate-300 uppercase tracking-wider font-mono mb-3">Orchestration Architecture</p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {[
            { label: '🧠 II Agent', sub: 'orchestrator', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
            { label: '→', sub: '', color: 'text-slate-300', bg: '' },
            { label: '⚡ OpenClaw', sub: 'BFT consensus', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
            { label: '→', sub: '', color: 'text-slate-300', bg: '' },
            { label: '🤖 12 Bots', sub: 'strategy fleet', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
            { label: '→', sub: '', color: 'text-slate-300', bg: '' },
            { label: '📈 Trades', sub: 'TAO execution', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
          ].map((item, i) => item.bg ? (
            <div key={i} className={clsx('px-3 py-1.5 rounded-lg border', item.bg)}>
              <p className={item.color}>{item.label}</p>
              {item.sub && <p className="text-slate-300 text-[9px]">{item.sub}</p>}
            </div>
          ) : (
            <ChevronRight key={i} size={14} className={item.color} />
          ))}
          <div className="ml-auto text-slate-300 text-[10px]">
            Analysis interval: 300s · Consensus threshold: 7/12 · Gate: 55% WR
          </div>
        </div>
      </div>
    </div>
  )
}