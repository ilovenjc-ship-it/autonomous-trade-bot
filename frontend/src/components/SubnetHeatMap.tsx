import { useState, useEffect } from 'react'
import { Flame } from 'lucide-react'
import api from '@/api/client'

// ── TaoBot confirmed subnets (from on-chain verification) ──────────────────
const TAOBOT_SUBNETS = new Set([1, 8, 9, 18, 64])

interface SubnetRow {
  uid:       number
  name:      string
  ticker:    string
  stake_tao: number
  apy:       number
  score:     number
  trend:     'up' | 'down' | 'neutral'
}

/** Map a normalised 0-1 heat value to an HSL colour string.
 *  cold (0) = deep blue  →  warm (0.5) = indigo/purple  →  hot (1) = fiery red */
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

  useEffect(() => {
    api.get<{ subnets: SubnetRow[] }>('/market/subnets?sort=uid&order=asc')
      .then(r => setSubnets(r.data.subnets))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const scores = subnets.map(s => s.score)
  const minS   = scores.length ? Math.min(...scores) : 0
  const maxS   = scores.length ? Math.max(...scores) : 1
  const norm   = (s: number) => maxS === minS ? 0.5 : (s - minS) / (maxS - minS)

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Flame size={15} className="text-orange-400" />
          Network Heat Map
          <span className="text-[10px] text-slate-500 font-mono font-normal">
            64 subnets · scored by APY + stake
          </span>
        </h2>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-slate-400">COLD</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
              <div key={v} style={{ background: heatColor(v), width: 14, height: 10, borderRadius: 2 }} />
            ))}
          </div>
          <span className="text-orange-400">HOT</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 text-xs font-mono">
          Loading subnet data…
        </div>
      ) : (
        <div className="relative">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
            {subnets.map(s => {
              const n        = norm(s.score)
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
                  className="relative cursor-default select-none rounded-xl flex flex-col items-center justify-center transition-transform hover:scale-105 hover:z-10"
                  style={{
                    background: bg,
                    height: 92,
                    outline:      isTaoBot ? '2px solid #00e5a0' : 'none',
                    outlineOffset: '2px',
                    boxShadow:    isTaoBot ? '0 0 14px rgba(0,229,160,0.50)' : undefined,
                  }}
                >
                  <span className="text-[13px] font-black leading-none tracking-tight" style={{ color: txt }}>
                    SN{s.uid}
                  </span>
                  <span className="text-[10px] font-mono leading-none mt-1.5 opacity-85" style={{ color: txt }}>
                    {s.apy.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-mono leading-none mt-1 opacity-60 truncate max-w-full px-1 text-center" style={{ color: txt }}>
                    {s.name.split(' ')[0]}
                  </span>
                  {isTaoBot && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent-green shadow-sm" />
                  )}
                  {s.trend === 'up' && (
                    <span className="absolute bottom-1 right-1.5 text-[8px] text-emerald-400 font-bold leading-none">▲</span>
                  )}
                  {s.trend === 'down' && (
                    <span className="absolute bottom-1 right-1.5 text-[8px] text-red-400 font-bold leading-none">▼</span>
                  )}
                </div>
              )
            })}
          </div>

          {hovered && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ left: Math.min(hoverPos.x, 420), top: hoverPos.y - 80 }}
            >
              <div className="bg-dark-900 border border-dark-500 rounded-xl px-3 py-2.5 shadow-2xl min-w-[170px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">SN{hovered.uid} — {hovered.name}</span>
                  {TAOBOT_SUBNETS.has(hovered.uid) && (
                    <span className="text-[9px] font-mono text-accent-green border border-accent-green/30 rounded px-1 py-0.5">
                      TaoBot ✓
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                  <span className="text-slate-500">APY</span>
                  <span className="text-amber-400 font-semibold">{hovered.apy.toFixed(1)}%</span>
                  <span className="text-slate-500">Stake</span>
                  <span className="text-slate-300">τ{hovered.stake_tao.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-slate-500">Score</span>
                  <span className="text-indigo-400">{hovered.score.toFixed(1)}</span>
                  <span className="text-slate-500">Trend</span>
                  <span className={hovered.trend === 'up' ? 'text-emerald-400' : hovered.trend === 'down' ? 'text-red-400' : 'text-slate-400'}>
                    {hovered.trend === 'up' ? '▲ up' : hovered.trend === 'down' ? '▼ down' : '— flat'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-green inline-block" />
          TaoBot validator active
        </div>
        <div className="flex items-center gap-1">
          <span className="text-emerald-400">▲</span> trending up
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-400">▼</span> trending down
        </div>
        <span className="ml-auto text-slate-600">Hover any tile for details</span>
      </div>
    </div>
  )
}