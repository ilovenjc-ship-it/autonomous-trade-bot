import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, BarChart2, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'

interface GateCheck { value: number; required: number; ok: boolean }
interface Gate {
  cycles: GateCheck; win_rate: GateCheck; win_margin: GateCheck; pnl: GateCheck; all_clear: boolean
}
interface Bot {
  rank: number; name: string; display_name: string; strategy: string
  mode: string; health: string; is_active: boolean; last_signal: string
  total_trades: number; win_trades: number; loss_trades: number
  win_rate: number; net_pnl_tao: number; capital_allocation_pct: number
  performance_score: number; consecutive_losses: number; gate_passed: boolean
  gate: Gate; cycles_completed: number
}
interface Summary {
  total: number; live: number; paper: number; approved: number
  green: number; yellow: number; red: number
  last_rebalanced_at: string | null
  promotions_this_session: number
}

function HealthDot({ health }: { health: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono', {
      'bg-emerald-500/15 text-emerald-400': health === 'GREEN',
      'bg-yellow-500/15 text-yellow-400': health === 'YELLOW',
      'bg-red-500/15 text-red-400': health === 'RED',
    })}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', {
        'bg-emerald-400': health === 'GREEN',
        'bg-yellow-400': health === 'YELLOW',
        'bg-red-400': health === 'RED',
      })} />
      {health}
    </span>
  )
}

function SignalBadge({ signal }: { signal: string }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold font-mono', {
      'bg-emerald-500/20 text-emerald-400': signal === 'BUY',
      'bg-red-500/20 text-red-400': signal === 'SELL',
      'bg-slate-500/20 text-slate-300': signal === 'HOLD',
    })}>
      {signal}
    </span>
  )
}

function AllocationBar({ pct, max }: { pct: number; max: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(pct / max) * 100}%` }} />
      </div>
      <span className="text-[10px] text-slate-300 font-mono w-8 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ── Radar / pentagon chart ────────────────────────────────────────────────────
function RadarChart({ bot }: { bot: Bot }) {
  const cx = 135, cy = 132, r = 100, n = 5
  const gatesPassed = [bot.gate.cycles.ok, bot.gate.win_rate.ok, bot.gate.win_margin.ok, bot.gate.pnl.ok]
    .filter(Boolean).length

  const axes = [
    { label: 'Win Rate',  value: Math.min(bot.win_rate / 75, 1) },
    { label: 'Score',     value: Math.min(bot.performance_score / 100, 1) },
    { label: 'Gate',      value: gatesPassed / 4 },
    { label: 'Alloc',     value: Math.min(bot.capital_allocation_pct / 25, 1) },
    { label: 'P&L',       value: Math.min(Math.max((bot.net_pnl_tao + 0.05) / 0.35, 0), 1) },
  ]

  const angle = (i: number) => (i * 2 * Math.PI / n) - Math.PI / 2
  const pt    = (i: number, s: number) => ({
    x: cx + r * s * Math.cos(angle(i)),
    y: cy + r * s * Math.sin(angle(i)),
  })
  const poly  = (s: number) => Array.from({ length: n }, (_, i) => pt(i, s))
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const dataPts = axes.map((a, i) => pt(i, Math.max(a.value, 0.04)))
  const dataPath = dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + 'Z'

  const hc = bot.health === 'GREEN' ? '#34d399' : bot.health === 'YELLOW' ? '#fbbf24' : '#f87171'

  return (
    <svg width="270" height="265" viewBox="0 0 270 265" className="overflow-visible mx-auto block">
      <defs>
        <style>{`
          @keyframes radarBloom {
            from { opacity:0; transform:scale(0.2); }
            to   { opacity:1; transform:scale(1); }
          }
        `}</style>
      </defs>

      {/* Grid rings at 25 / 50 / 75 / 100% */}
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={poly(s)}
          fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth={s === 1 ? 1.5 : 1} />
      ))}

      {/* Axis spokes */}
      {axes.map((_, i) => {
        const o = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y}
          stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
      })}

      {/* Data shape — blooms on each new bot selection */}
      <g key={bot.name}
        style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'radarBloom 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
        <path d={dataPath}
          fill={`${hc}28`}
          stroke={hc}
          strokeWidth="1.5"
          strokeLinejoin="round"
          filter={`drop-shadow(0 0 6px ${hc}88)`}
        />
        {dataPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5"
            fill={hc}
            filter={`drop-shadow(0 0 4px ${hc})`}
          />
        ))}
      </g>

      {/* Axis labels */}
      {axes.map((a, i) => {
        const lp = pt(i, 1.3)
        return (
          <text key={i} x={lp.x} y={lp.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="rgba(148,163,184,0.8)"
            fontFamily="monospace" fontWeight="bold">
            {a.label}
          </text>
        )
      })}

      {/* Centre dot */}
      <circle cx={cx} cy={cy} r="2" fill="rgba(148,163,184,0.3)" />
    </svg>
  )
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', score >= 60 ? 'bg-emerald-500' : score >= 30 ? 'bg-yellow-500' : 'bg-red-500')}
          style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-slate-300 font-mono">{score.toFixed(0)}</span>
    </div>
  )
}

export default function AgentFleet() {
  const navigate = useNavigate()
  const [bots, setBots] = useState<Bot[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [selected, setSelected] = useState<Bot | null>(null)
  const [loading, setLoading] = useState(false)
  const [rebalancing, setRebalancing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [slide, setSlide] = useState(0) // 0 = radar profile, 1 = capital allocation

  const fetchBots = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/fleet/bots').then(r => r.data)
      setBots(data.bots || [])
      setSummary(data.summary || null)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Fleet bots fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRebalance = useCallback(async () => {
    setRebalancing(true)
    try {
      const { data } = await api.post('/fleet/rebalance')
      if (data.success) {
        toast.success(`Capital rebalanced — top: ${(data.top as string[]).map(n => n.replace(/_/g, ' ')).join(', ')}`)
        await fetchBots() // refresh bars immediately
      } else {
        toast.error('Rebalance failed')
      }
    } catch {
      toast.error('Rebalance request failed')
    } finally {
      setRebalancing(false)
    }
  }, [fetchBots])

  useEffect(() => {
    fetchBots()
    const t = setInterval(fetchBots, 60_000)
    return () => clearInterval(t)
  }, [fetchBots])

  const maxAlloc = Math.max(...bots.map(b => b.capital_allocation_pct), 25)

  return (
    <div className="flex h-full bg-[#080d18] text-slate-100 font-mono overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header bar */}
        <div className="px-6 py-3 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-[10px] text-slate-300 uppercase tracking-wider">Fleet Health:</div>
            {summary && (
              <>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-400 font-bold">{summary.green}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="text-yellow-400 font-bold">{summary.yellow}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-red-400 font-bold">{summary.red}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-300">Updated every 60s by II Agent health-check loop</span>
            {lastUpdated && <span className="text-[10px] text-slate-400">Last: {lastUpdated}</span>}
            <button onClick={fetchBots} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded text-[11px] text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* How it works — under Fleet Health */}
        <div className="px-6 py-3 border-b border-slate-800/40 grid grid-cols-3 gap-x-8 gap-y-2">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 mt-1" />
            <span className="text-xs"><span className="text-emerald-400 font-bold">GREEN</span><span className="text-slate-400 ml-1.5">Healthy — full consensus weight</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 font-bold flex-shrink-0 text-xs">◆</span>
            <span className="text-xs"><span className="text-blue-400 font-bold">LEADERBOARD</span><span className="text-slate-400 ml-1.5">Ranked by win rate × net P&L. Top performers get more capital.</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold flex-shrink-0 text-xs">◇</span>
            <span className="text-xs"><span className="text-emerald-400 font-bold">GATE PASSED</span><span className="text-slate-400 ml-1.5">Profitability threshold met. Required for live promotion.</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0 mt-1" />
            <span className="text-xs"><span className="text-yellow-400 font-bold">YELLOW</span><span className="text-slate-400 ml-1.5">Degraded — reduced consensus weight</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 font-bold flex-shrink-0 text-xs">⊙</span>
            <span className="text-xs"><span className="text-yellow-400 font-bold">BFT CONSENSUS</span><span className="text-slate-400 ml-1.5">Bots vote each cycle. OpenClaw needs ≥ 45% weighted agreement.</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-400 font-bold flex-shrink-0 text-xs">✗</span>
            <span className="text-xs"><span className="text-slate-300 font-bold">PAPER</span><span className="text-slate-400 ml-1.5">Gate not yet cleared — trading in simulation only.</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 mt-1" />
            <span className="text-xs"><span className="text-red-400 font-bold">RED</span><span className="text-slate-400 ml-1.5">Critical — excluded from consensus</span></span>
          </div>
        </div>

        {/* Title row */}
        <div className="px-6 py-4 border-b border-slate-800/40 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">AGENT FLEET</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {bots.length} Specialized Trading Bot Sub-Agents · Ranked by Performance
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleRebalance}
              disabled={rebalancing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-[11px] font-bold hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {rebalancing
                ? <><RefreshCw size={12} className="animate-spin" /> Rebalancing…</>
                : <><BarChart2 size={12} /> Rebalance Capital</>
              }
            </button>
            {/* Autonomous engine status */}
            <div className="flex items-center gap-3 text-[9px] font-mono">
              <span className="flex items-center gap-1 text-emerald-400/70">
                <Zap size={9} />
                Auto-engine active
              </span>
              {summary?.last_rebalanced_at ? (
                <span className="text-slate-500">
                  Last rebalanced: {new Date(summary.last_rebalanced_at).toLocaleTimeString()}
                </span>
              ) : (
                <span className="text-slate-600">Next rebalance: 24h cycle</span>
              )}
              {summary && summary.promotions_this_session > 0 && (
                <span className="text-amber-400/70">
                  {summary.promotions_this_session} promoted
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#080d18] border-b border-slate-800/60 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal w-8">#</th>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal">AGENT</th>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal">HEALTH</th>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal">SIGNAL</th>
                <th className="text-right px-4 py-2.5 text-slate-300 font-normal">WIN RATE</th>
                <th className="text-right px-4 py-2.5 text-slate-300 font-normal">P&L (TAO)</th>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal">ALLOCATION</th>
                <th className="text-left px-4 py-2.5 text-slate-300 font-normal">SCORE</th>
                <th className="text-center px-4 py-2.5 text-slate-300 font-normal">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {bots.map(bot => (
                <tr key={bot.name}
                  onClick={() => setSelected(prev => prev?.name === bot.name ? null : bot)}
                  className={clsx('cursor-pointer transition-colors', {
                    'bg-blue-500/5 border-l-2 border-blue-500/40': selected?.name === bot.name,
                    'hover:bg-slate-800/30': selected?.name !== bot.name,
                  })}>
                  <td className="px-4 py-3 text-slate-300 font-bold">#{bot.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', {
                        'bg-emerald-400 shadow-[0_0_6px_#34d399]': bot.is_active,
                        'bg-slate-600': !bot.is_active,
                      })} />
                      <div>
                        <div className="text-slate-100 font-bold uppercase tracking-wider text-[10px]">{bot.display_name}</div>
                        <div className="text-slate-300 text-[9px] truncate max-w-[160px]">{bot.mode === 'LIVE' ? '● LIVE MODE' : bot.mode === 'APPROVED_FOR_LIVE' ? '◆ APPROVED' : '✗ PAPER'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><HealthDot health={bot.health} /></td>
                  <td className="px-4 py-3"><SignalBadge signal={bot.last_signal} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className={clsx('font-bold', bot.win_rate >= 55 ? 'text-emerald-400' : bot.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                      {bot.win_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={clsx('font-bold', bot.net_pnl_tao > 0 ? 'text-emerald-400' : bot.net_pnl_tao < 0 ? 'text-red-400' : 'text-slate-300')}>
                      {bot.net_pnl_tao > 0 ? '+' : ''}{bot.net_pnl_tao.toFixed(4)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <AllocationBar pct={bot.capital_allocation_pct} max={maxAlloc} />
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBar score={bot.performance_score} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); api.post(`/fleet/bots/${bot.name}/deactivate`) }}
                        className={clsx('px-2 py-0.5 rounded text-[9px] font-bold transition-colors', !bot.is_active ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'text-slate-300 hover:text-slate-300')}>
                        OFF
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); api.post(`/fleet/bots/${bot.name}/activate`) }}
                        className={clsx('px-2 py-0.5 rounded text-[9px] font-bold transition-colors', bot.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-300 hover:text-slate-300')}>
                        ON
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/strategy/${bot.name}`) }}
                        className="px-1.5 py-0.5 rounded text-[9px] text-slate-300 hover:text-accent-blue border border-transparent hover:border-accent-blue/30 transition-colors"
                        title="View strategy detail"
                      >
                        <ExternalLink size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          
        </div>
      </div>

      {/* Right panel — carousel */}
      <div className="w-[310px] flex-shrink-0 border-l border-slate-800/60 flex flex-col overflow-hidden">

        {/* Slide tabs + arrow nav */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex gap-1">
            <button onClick={() => setSlide(0)}
              className={clsx('px-2.5 py-1 rounded text-[10px] font-bold transition-colors', slide === 0
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200')}>
              ◈ Profile
            </button>
            <button onClick={() => setSlide(1)}
              className={clsx('px-2.5 py-1 rounded text-[10px] font-bold transition-colors', slide === 1
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200')}>
              ▦ Capital
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))}
              className="p-1 text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-20"
              disabled={slide === 0}>
              <ChevronLeft size={13} />
            </button>
            <div className="flex gap-1">
              {[0, 1].map(i => (
                <div key={i} onClick={() => setSlide(i)}
                  className={clsx('w-1.5 h-1.5 rounded-full cursor-pointer transition-colors',
                    slide === i ? 'bg-emerald-400' : 'bg-slate-600 hover:bg-slate-400')} />
              ))}
            </div>
            <button onClick={() => setSlide(s => Math.min(1, s + 1))}
              className="p-1 text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-20"
              disabled={slide === 1}>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Sliding viewport */}
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${slide * 100}%)` }}>

            {/* ── Slide 0: Agent Profile (radar + detail) ── */}
            <div className="min-w-full h-full overflow-y-auto">
              {selected ? (
                <div className="p-4 space-y-3">
                  {/* Name + health */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{selected.display_name}</span>
                    <HealthDot health={selected.health} />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed -mt-1">{selected.strategy}</p>

                  {/* Radar chart — fills width */}
                  <div className="bg-slate-900/30 rounded-lg border border-slate-800/60 pt-3 pb-1">
                    <RadarChart bot={selected} />
                    <p className="text-center text-[8px] text-slate-600 font-mono pb-1">
                      WIN RATE · SCORE · GATE · ALLOC · P&L
                    </p>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Trades',   value: selected.total_trades },
                      { label: 'Wins',     value: selected.win_trades,     cls: 'text-emerald-400' },
                      { label: 'Losses',   value: selected.loss_trades,    cls: 'text-red-400' },
                      { label: 'Cycles',   value: selected.cycles_completed },
                      { label: 'Win Rate', value: `${selected.win_rate.toFixed(1)}%`, cls: selected.win_rate >= 55 ? 'text-emerald-400' : 'text-yellow-400' },
                      { label: 'Net PnL',  value: `${selected.net_pnl_tao >= 0 ? '+' : ''}${selected.net_pnl_tao.toFixed(4)}τ`, cls: selected.net_pnl_tao >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className="bg-slate-800/40 rounded p-2">
                        <div className="text-[9px] text-slate-400 uppercase">{label}</div>
                        <div className={clsx('text-xs font-bold mt-0.5', cls ?? 'text-slate-100')}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Gate progress */}
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-2">Gate Progress</div>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Cycles ≥ 10',    check: selected.gate.cycles },
                        { label: 'Win Rate ≥ 55%', check: selected.gate.win_rate },
                        { label: 'Win Margin ≥ 2', check: selected.gate.win_margin },
                        { label: 'PnL > 0 TAO',    check: selected.gate.pnl },
                      ].map(({ label, check }) => (
                        <div key={label} className="flex items-center gap-2">
                          {check.ok
                            ? <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />
                            : <XCircle size={11} className="text-slate-600 flex-shrink-0" />}
                          <span className={clsx('text-[10px]', check.ok ? 'text-emerald-400' : 'text-slate-400')}>{label}</span>
                          <span className="ml-auto text-[9px] text-slate-500 font-mono">{check.value}/{check.required}</span>
                        </div>
                      ))}
                    </div>
                    {selected.gate.all_clear && (
                      <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-[10px] text-purple-400 font-bold text-center">
                        ✓ READY FOR LIVE PROMOTION
                      </div>
                    )}
                  </div>

                  {/* Mode chip */}
                  <div className="p-2 bg-slate-800/40 rounded flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 uppercase">Mode</span>
                    <span className={clsx('text-xs font-bold', {
                      'text-emerald-400': selected.mode === 'LIVE',
                      'text-purple-400': selected.mode === 'APPROVED_FOR_LIVE',
                      'text-yellow-400': selected.mode === 'PAPER_ONLY',
                    })}>
                      {selected.mode === 'PAPER_ONLY' ? 'PAPER' : selected.mode === 'APPROVED_FOR_LIVE' ? 'APPROVED' : 'LIVE'}
                    </span>
                  </div>
                </div>
              ) : (
                /* No bot selected — empty radar */
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                  <svg width="270" height="265" viewBox="0 0 270 265" className="overflow-visible opacity-25">
                    {[0.25, 0.5, 0.75, 1].map(s => {
                      const n = 5, cx = 135, cy = 132, r = 100
                      const pts = Array.from({ length: n }, (_, i) => {
                        const a = (i * 2 * Math.PI / n) - Math.PI / 2
                        return `${(cx + r * s * Math.cos(a)).toFixed(1)},${(cy + r * s * Math.sin(a)).toFixed(1)}`
                      }).join(' ')
                      return <polygon key={s} points={pts} fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                    })}
                  </svg>
                  <p className="text-[11px] italic -mt-4">Select an agent to view profile</p>
                </div>
              )}
            </div>

            {/* ── Slide 1: Capital Allocation ── */}
            <div className="min-w-full h-full overflow-y-auto p-4">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-4 font-bold">
                Capital Allocation %
              </div>
              <div className="space-y-3">
                {bots.map(bot => (
                  <div key={bot.name}
                    onClick={() => { setSelected(prev => prev?.name === bot.name ? null : bot); setSlide(0) }}
                    className="cursor-pointer group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-300 group-hover:text-white transition-colors font-mono truncate max-w-[160px]">
                        {bot.display_name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{bot.capital_allocation_pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div className={clsx(
                        'h-full rounded-full transition-all duration-500',
                        bot.health === 'GREEN' ? 'bg-emerald-500/70' : bot.health === 'YELLOW' ? 'bg-yellow-500/70' : 'bg-red-500/70'
                      )} style={{ width: `${(bot.capital_allocation_pct / maxAlloc) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-center text-[9px] text-slate-600 italic mt-6">
                Click a bar to open agent profile
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}