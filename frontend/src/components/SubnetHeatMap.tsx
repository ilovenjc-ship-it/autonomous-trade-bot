import { useState, useEffect } from 'react'
import { Flame } from 'lucide-react'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'

// ── II Agent monitored subnets (on-chain verified) ───────────────────────────
// Internal const name kept as TAOBOT_SUBNETS for backward compat — the App
// itself is the II Agent Orchestrator; "TaoBot" is a separate TaoStats validator.
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

/** Session XXXV: polarity flipped per Mav's spec.
 *  Was: cold (low) = blue → hot (high) = amber-red, which read backwards
 *  ('red is good') in this app's context. Now: low = red (bad), mid = amber,
 *  high = green (good). Hue ramps 0° (red) → 50° (amber) → 140° (green). */
function heatColor(norm: number): string {
  // 0 → 140° hue (red 0 → green 140 via amber 50 around mid-low)
  const hue   = Math.round(norm * 140)        // 0° red → 140° green
  const sat   = Math.round(70 + norm * 15)    // 70–85%
  const light = Math.round(30 - norm * 8)     // 30%→22%, slightly darker as it greens
  return `hsl(${hue},${sat}%,${light}%)`
}

function heatText(norm: number): string {
  // Bright text on dark backgrounds — pick contrast-friendly colour per band.
  if (norm > 0.75) return '#bbf7d0'   // green band
  if (norm > 0.5)  return '#fcd34d'   // amber band
  if (norm > 0.25) return '#fca5a5'   // light red band
  return '#fee2e2'                    // very low: pale red
}

export default function SubnetHeatMap() {
  const [subnets,  setSubnets]  = useState<SubnetRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [hovered,  setHovered]  = useState<SubnetRow | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const [mode,     setMode]     = useState<HeatMode>('stake')
  // Session XXXV: pagination — 64 cells per page (8×8 grid),
  // 128 subnets across 2 pages per Mav's spec.
  const [page,     setPage]     = useState(1)

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
          <InfoBubble
            side="right"
            maxWidth={300}
            content={
              <div className="space-y-2">
                <p className="text-white font-bold text-[12px]">Network Heat Map</p>
                <p>Each cell = one Bittensor subnet (SN1–SN64). Color intensity reflects the selected metric — darker blue is cold (low), amber-red is hot (high).</p>
                <div className="border-t border-slate-700/50 pt-2 space-y-1">
                  <p className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm border-2 border-[#00e5a0] flex-shrink-0" />
                    <span><span className="text-emerald-400 font-bold">Green outline</span> = subnet actively monitored by the II Agent (SN1, 8, 9, 18, 64). The Orchestrator coordinates stake, votes, and emission collection on these networks.</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00e5a0] flex-shrink-0" />
                    <span><span className="text-emerald-400 font-bold">Green dot</span> (top-right corner) = same II Agent active indicator.</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold flex-shrink-0">▲</span>
                    <span>Rising / falling arrow = 30-min price trend from TAO.app.</span>
                  </p>
                </div>
                <p className="text-slate-400 text-[11px]">Hover any cell for full subnet stats. Switch view modes (Stake · APY · Miners · Score) with the buttons above.</p>
              </div>
            }
          />
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
      {/* Session XXXV: count line shows page slice instead of "64 subnets" */}
      <div className="text-[10px] text-slate-500 font-mono mb-2 flex-shrink-0 leading-none">
        {modeCfg.desc} · 8×8 · subnets {(page - 1) * 64 + 1}–{Math.min(page * 64, subnets.length)} of {subnets.length}
      </div>

      {/* ── Heat grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-slate-500 text-xs font-mono">
          Loading subnet data…
        </div>
      ) : (() => {
        // Session XXXV: 8×8 grid paginated across all 128 subnets.
        // Page 1 = SN1..SN64 (slice 0..64), Page 2 = SN65..SN128 (slice 64..128).
        const COLS = 8, ROWS = 8, SIZE = COLS * ROWS
        const start   = (page - 1) * SIZE
        const display = subnets.slice(start, start + SIZE)
        const padded: (SubnetRow | null)[] = [...display, ...Array(Math.max(0, SIZE - display.length)).fill(null)]
        return (
          <div className="flex-1 relative min-h-0">
            <div className="h-full grid gap-1" style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows:    `repeat(${ROWS}, 1fr)`,
            }}>
              {padded.map((s, idx) => {
                if (!s) {
                  return <div key={`empty-${idx}`} className="rounded bg-dark-700/30 opacity-30" />
                }
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
                      // Session XXXV: anchor tooltip AT the hovered cell, not at
                      // the upper-left corner. Position it adjacent to the cell
                      // (default: right-of-cell), flipped to left-of-cell when
                      // the right edge would overflow, and clamped vertically.
                      const container = (e.currentTarget as HTMLElement)
                        .closest('.relative') as HTMLElement
                      const rect = container.getBoundingClientRect()
                      const el = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const TOOLTIP_W = 200
                      const TOOLTIP_H = 140
                      const cellLeft = el.left - rect.left
                      const cellTop  = el.top  - rect.top
                      const cellW    = el.right - el.left
                      // Default: place to the right of the cell (8px gap).
                      let x = cellLeft + cellW + 8
                      // If overflow on the right, flip to left of the cell.
                      if (x + TOOLTIP_W > rect.width) {
                        x = cellLeft - TOOLTIP_W - 8
                        if (x < 0) x = Math.max(0, cellLeft)   // last-resort overlap top of cell
                      }
                      // Vertical: align tooltip top with cell top, clamp to container.
                      let y = cellTop
                      if (y + TOOLTIP_H > rect.height) {
                        y = Math.max(0, rect.height - TOOLTIP_H)
                      }
                      setHoverPos({ x, y })
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

            {/* Tooltip — Session XXXV: anchored adjacent to hovered cell */}
            {hovered && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ left: hoverPos.x, top: hoverPos.y }}
              >
                <div className="bg-[#0d1424] border border-slate-700/60 rounded-xl px-3 py-2.5 shadow-2xl min-w-[180px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-bold text-white">SN{hovered.uid} — {hovered.name}</span>
                    {TAOBOT_SUBNETS.has(hovered.uid) && (
                      <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 rounded px-1 py-0.5">
                        II Agent ✓
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

      {/* ── Pagination — Session XXXV ─────────────────────────────────────── */}
      {!loading && subnets.length > 64 && (() => {
        const totalPages = Math.max(1, Math.ceil(subnets.length / 64))
        return (
          <div className="mt-2 flex items-center justify-center gap-2 flex-shrink-0 text-[11px] font-mono">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded border border-slate-700/50 bg-slate-800/40 text-slate-300 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ◀ Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  p === page
                    ? 'border-orange-500/50 bg-orange-500/15 text-orange-300 font-bold'
                    : 'border-slate-700/50 bg-slate-800/40 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                {p === 1 ? 'SN1–64' : `SN${(p - 1) * 64 + 1}–${Math.min(p * 64, 128)}`}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded border border-slate-700/50 bg-slate-800/40 text-slate-300 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next ▶
            </button>
          </div>
        )
      })()}

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="mt-2 flex-shrink-0 space-y-1">
        {/* II Agent active legend — more prominent */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/30">
          <span className="w-3 h-3 rounded-sm border-2 border-emerald-400 flex-shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
          <span className="text-[11px] font-mono text-emerald-400 font-bold">II Agent Active Subnets</span>
          <span className="text-[10px] font-mono text-emerald-600">SN1 · SN8 · SN9 · SN18 · SN64</span>
          <span className="ml-auto text-[10px] font-mono text-slate-600">Green outline = II Agent</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 px-1">
          <span className="text-emerald-400 font-bold">▲</span><span>rising</span>
          <span className="text-red-400 font-bold">▼</span><span>falling</span>
          <span className="ml-auto text-slate-600">Hover any cell for full stats</span>
        </div>
      </div>
    </div>
  )
}