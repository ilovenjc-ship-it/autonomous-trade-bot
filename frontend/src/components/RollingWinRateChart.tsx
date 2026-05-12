/**
 * Rolling Win Rate chart — Session XXVII: relocated from Network Analytics
 * to PnL Summary, placed directly below Cumulative PnL per partner request.
 *
 * Standalone component that fetches its own data + owns the window toggle
 * (10 / 20 / 50 trades). Can be reused anywhere.
 */

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { Activity } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

interface WinRatePoint { time: string; win_rate: number; n: number }
type WrWindow = 10 | 20 | 50

const C_GREEN  = '#10b981'
const C_YELLOW = '#fbbf24'
const C_PURPLE = '#a78bfa'

export default function RollingWinRateChart({ hours = 0, height = 260 }: { hours?: number; height?: number }) {
  const [wrWindow, setWrWindow] = useState<WrWindow>(20)
  const [data,     setData]     = useState<WinRatePoint[]>([])
  const [loading,  setLoad]     = useState(true)
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const q1 = `window=${wrWindow}`
        const q2 = hours > 0 ? `&hours=${hours}` : ''
        const r = await api.get(`/analytics/rolling-winrate?${q1}${q2}`)
        if (!cancelled) {
          setData(Array.isArray(r.data) ? r.data : [])
          setErr(null)
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'load failed')
      } finally {
        if (!cancelled) setLoad(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [hours, wrWindow])

  // thin data to 200 points for smooth render
  const thin = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 200)) === 0)

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-accent-blue" />
          <span className="text-sm font-semibold text-white">Rolling Win Rate</span>
        </div>
        {/* Window toggle */}
        <div className="flex items-center gap-1 bg-dark-700 border border-dark-600 rounded-lg p-0.5">
          <span className="text-[11px] text-slate-500 font-mono px-1.5">window</span>
          {([10, 20, 50] as WrWindow[]).map(w => (
            <button
              key={w}
              onClick={() => setWrWindow(w)}
              className={clsx(
                'px-2.5 py-1 rounded text-[12px] font-mono font-bold transition-colors',
                wrWindow === w
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-slate-500 font-mono text-xs">Loading win rate…</span>
        </div>
      ) : err ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-red-400 font-mono text-xs">Error: {err}</span>
        </div>
      ) : thin.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-slate-500 font-mono text-xs">No trade history yet</span>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-300 font-mono mb-3 uppercase tracking-widest">
            Rolling {wrWindow}-trade win rate
          </p>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={thin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <ReferenceLine y={55} stroke={C_GREEN}  strokeDasharray="4 4" label={{ value: 'Gate 55%',    fill: C_GREEN,  fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={50} stroke={C_YELLOW} strokeDasharray="4 4" label={{ value: 'Break-even', fill: C_YELLOW, fontSize: 10, position: 'insideBottomRight' }} />
              <Tooltip
                contentStyle={{ background: '#152030', border: '1px solid #243450', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                formatter={(v: any) => [`${v}%`, 'Win Rate']}
              />
              <Line dataKey="win_rate" stroke={C_PURPLE} strokeWidth={2} dot={false} name="Win Rate" />
            </LineChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex gap-4 mt-2 justify-end text-xs font-mono">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-accent-green inline-block" /> Gate (55%)</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-yellow-400 inline-block" /> Break-even (50%)</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" /> Win Rate</span>
          </div>
        </>
      )}
    </div>
  )
}