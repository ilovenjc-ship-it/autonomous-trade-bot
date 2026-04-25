import { useState, useEffect } from 'react'
import { Flame } from 'lucide-react'
import api from '@/api/client'

// ── TaoBot confirmed subnets (on-chain verified) ─────────────────────────────
const TAOBOT_SUBNETS = new Set([1, 8, 9, 18, 64])

// ── Metric modes ─────────────────────────────────────────────────────────────
type HeatMode = 'stake' | 'apy' | 'miners' | 'score'

interface ModeConfig {
  key: HeatMode
  label: string
  desc: string
  getValue: (s: SubnetRow) => number
  format: (v: number) => string
}

const MODES: ModeConfig[] = [
  {
    key: 'stake',
    label: 'Stake τ',
    desc: 'TAO staked on-chain (liquidity / market size)',
    getValue: s => s.stake_tao,
    format: v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
               : v >= 1_000     ? `${(v / 1_000).toFixed(0)}K`
               : v.toFixed(0),
  },
  {
    key: 'apy',
    label: 'APY %',
    desc: 'Annual emission yield (on-chain APY)',
    getValue: s => s.apy,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'miners',
    label: 'Miners',
    desc: 'Active validators/miners in subnet',
    getValue: s => s.miners ?? 0,
    format: v => v.toFixed(0),
  },
  {
    key: 'score',
    label: 'Score',
    desc: 'Composite score: log₁₀(stake) × 10 + APY',
    getValue: s => s.score,
    format: v => v.toFixed(0),
  },
]

interface SubnetRow {
  uid:       number
  name:      string
  ticker:    string
  stake_tao: number
  apy:       number
  miners:    number
  score:     number
  trend:     'up' | 'down' | 'neutral'
  data_source?: string
}

/** Percentile-normalise a value array to 0-1, clamped to p10–p90. */
function makeNorm(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.10))] ?? 0
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.90))] ?? 1
  return (v: number) =>
    p90 === p10 ? 0.5 : Math.max(0, Math.min(1, (v - p10) / (p90 - p10)))
}

/** cold (0) = deep blue → warm (0.5) = indigo/purple → hot (1) = amber-red */
function heatColor(norm: number): string {
  const hue   = Math.round(220 - norm * 220)
  const sat   = Math.round(60  + norm * 30)
  const light = Math.round(28  - norm * 6)
  return `hsl(${hue},${sat}%,${light}%)`
}

function heatText(norm: number): string {
  if (norm > 0.75) return '#fca5a5'
  if (norm > 0.5)  return '#fcd34d'
  if (norm > 0.25) return '#a5b4fc'
  return '#94a3b8'
}

export default function SubnetHeatMap() {
  const [subnets,  setSubnets]  = useState<SubnetRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [hovered,  setHovered]  = useState<SubnetRow | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const [mode,     setMode]     = useState<HeatMode>('stake')

  useEffect(() => {
    api.get<{ subnets: SubnetRow[] }>('/market/subnets?sort=uid&order=asc')
      .then(r => setSubnets(r.data.subnets))
      .catch(() => {})
      .finally(() => setLoading(false))

    // Refresh every 30s
    const t = setInterval(() => {
      api.get<{ subnets: SubnetRow[] }>('/market/subnets?sort=uid&order=asc')
        .then(r => setSubnets(r.data.subnets))
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  const modeCfg   = MODES.find(m => m.key === mode) ?? MODES[0]
  const rawValues = subnets.map(s => modeCfg.getValue(s))
  const norm      = makeNorm(rawValues)

  const liveCount = subnets.filter(s => s.data_source === 'live' || s.data_source === 'live_trend').length

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 h-full flex flex-col">

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-2 gap-2 flex-shrink-0">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 flex-shrink-0">
          <Flame size={14} className="text-orange-400" />
          Network Heat Map
        </h2>
        <div className="flex items-center gap-1 text-[11px] font-mono flex-shrink-0">
          <span className="text-slate-500">COLD</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
              <div key={v} style={{ background: heatColor(v), width: 12, height: 8, borderRadius: 2 }} />
            ))}
          </div>
          <span className="text-orange-400">HOT</span>
        </div>
      </div>

      {/* ── Metric slider (tab buttons) ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mr-1 flex-shrink-0">View:</span>
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.desc}
            className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-wider border transition-all flex-shrink-0 ${
              mode === m.key
                ? 'bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600/50'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-600 font-mono">
          {liveCount > 0 && `${liveCount} live`}
        </span>
      </div>

      {/* ── Mode description ─────────────────────────────────────────────────── */}
      <div className="text-[10px] text-slate-500 font-mono mb-2 flex-shrink-0 leading-none">
        {modeCfg.desc} · {subnets.length} subnets
      </div>

      {/* ── Heat grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-slate-500 text-xs font-mono">
          Loading subnet data…
        </div>
      ) : (() => {
        const cols = Math.ceil(Math.sqrt(subnets.length))
        const rows = Math.ceil(subnets.length / cols)
        return (
          <div className="flex-1 relative min-h-0">
            <div className="h-full grid gap-1" style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows:    `repeat(${rows}, 1fr)`,
            }}>
              {subnets.map(s => {
                const raw      = modeCfg.getValue(s)
                const n        = norm(raw)
                const bg       = heatColor(n)
                const txt      = heatText(n)
                const isTaoBot = TAOBOT_SUBNETS.has(s.uid)
                return (
                  <div
                    key={s.uid}
                    onMouseEnter={e => {
                      setHovered(s)
                      const rect = (e.currentTarget as HTMLElement)
                        .closest('.relative')!.getBoundingClientRect()
                      const el = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setHoverPos({ x: el.left - rect.left, y: el.top - rect.top })
                    }}
                    onMouseLeave={() => setHovered(null)}
                    className="relative cursor-default select-none rounded flex flex-col items-center justify-center transition-transform hover:scale-105 hover:z-10"
                    style={{
                      background:   bg,
                      outline:      isTaoBot ? '2px solid #00e5a0' : 'none',
                      outlineOffset: '1px',
                      boxShadow:    isTaoBot ? '0 0 10px rgba(0,229,160,0.40)' : undefined,
                    }}
                  >
                    <span className="text-[10px] font-black leading-none tracking-tight" style={{ color: txt }}>
                      SN{s.uid}
                    </span>
                    <span className="text-[9px] font-mono leading-none mt-0.5 opacity-90" style={{ color: txt }}>
                      {modeCfg.format(raw)}
                    </span>
                    {isTaoBot && (
                      <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-accent-green" />
                    )}
                    {s.trend === 'up' && (
                      <span className="absolute bottom-0.5 right-1 text-[6px] text-emerald-400 font-bold leading-none">▲</span>
                    )}
                    {s.trend === 'down' && (
                      <span className="absolute bottom-0.5 right-1 text-[6px] text-red-400 font-bold leading-none">▼</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tooltip */}
            {hovered && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ left: Math.min(hoverPos.x, 380), top: Math.max(0, hoverPos.y - 100) }}
              >
                <div className="bg-[#0d1424] border border-slate-700/60 rounded-xl px-3 py-2.5 shadow-2xl min-w-[180px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-bold text-white">SN{hovered.uid} — {hovered.name}</span>
                    {TAOBOT_SUBNETS.has(hovered.uid) && (
                      <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 rounded px-1 py-0.5">
                        TaoBot ✓
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono">
                    <span className="text-slate-500">APY</span>
                    <span className="text-amber-400 font-semibold">{(hovered.apy ?? 0).toFixed(1)}%</span>
                    <span className="text-slate-500">Stake τ</span>
                    <span className="text-slate-200">{hovered.stake_tao.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span className="text-slate-500">Miners</span>
                    <span className="text-slate-300">{hovered.miners}</span>
                    <span className="text-slate-500">Score</span>
                    <span className="text-indigo-400">{(hovered.score ?? 0).toFixed(1)}</span>
                    <span className="text-slate-500">Trend</span>
                    <span className={hovered.trend === 'up' ? 'text-emerald-400' : hovered.trend === 'down' ? 'text-red-400' : 'text-slate-400'}>
                      {hovered.trend === 'up' ? '▲ rising' : hovered.trend === 'down' ? '▼ falling' : '— flat'}
                    </span>
                    <span className="text-slate-500">Source</span>
                    <span className={hovered.data_source === 'live' || hovered.data_source === 'live_trend' ? 'text-emerald-400' : 'text-slate-500'}>
                      {hovered.data_source ?? '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="mt-2 flex-shrink-0 flex items-center gap-3 text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />
          TaoBot active
        </div>
        <span className="text-emerald-400">▲</span><span>rising</span>
        <span className="text-red-400">▼</span><span>falling</span>
        <span className="ml-auto text-slate-600">Hover for details</span>
      </div>
    </div>
  )
}