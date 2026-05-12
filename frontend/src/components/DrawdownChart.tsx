/**
 * Drawdown-from-peak chart — Session XXVI: relocated from Analytics to Dashboard.
 *
 * Standalone component that fetches its own data and renders the equity+drawdown
 * overlay chart. Designed to sit next to the Market Sentiment gauge on the
 * Dashboard bottom row. Can be reused anywhere.
 */

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { TrendingDown } from 'lucide-react'
import api from '@/api/client'

interface DrawdownPoint {
  time: string
  pnl: number
  drawdown: number
  equity: number
}

const C_GREEN = '#10b981'
const C_RED   = '#ef4444'

function fmt(n: number, dec = 4) {
  const s = Math.abs(n).toFixed(dec)
  return n >= 0 ? `+${s}` : `-${s}`
}

function DrawdownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono">
      <p className="text-slate-300 mb-1">{label}</p>
      <p className="text-accent-green">Equity: {fmt(payload[0]?.value ?? 0, 4)}</p>
      <p className="text-red-400">Drawdown: {fmt(payload[1]?.value ?? 0, 4)}</p>
    </div>
  )
}

export default function DrawdownChart({ hours = 0, height = 260 }: { hours?: number; height?: number }) {
  const [data, setData]     = useState<DrawdownPoint[]>([])
  const [loading, setLoad]  = useState(true)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const q = hours > 0 ? `?hours=${hours}` : ''
        const r = await api.get(`/analytics/drawdown${q}`)
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
  }, [hours])

  // thin data to 100 points for smooth render
  const thin  = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 100)) === 0)
  const minDD = Math.min(0, ...data.map(d => d.drawdown)) * 1.1 || -0.01

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <TrendingDown size={14} className="text-red-400" /> Drawdown from Peak
        <span className="text-[11px] text-slate-500 font-mono uppercase tracking-widest ml-auto">
          hourly buckets
        </span>
      </h2>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-slate-500 font-mono text-xs">Loading drawdown…</span>
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
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={thin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="dd-eq-grad-dash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C_GREEN} stopOpacity={0.3} />
                <stop offset="95%" stopColor={C_GREEN} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="dd-grad-dash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C_RED} stopOpacity={0.4} />
                <stop offset="95%" stopColor={C_RED} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#243450" />
            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => v.toFixed(3)}
              domain={[minDD, 'auto']}
            />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
            <Tooltip content={<DrawdownTooltip />} />
            <Area dataKey="equity"   stroke={C_GREEN} strokeWidth={2}   fill="url(#dd-eq-grad-dash)" dot={false} name="Equity" />
            <Area dataKey="drawdown" stroke={C_RED}   strokeWidth={1.5} fill="url(#dd-grad-dash)"    dot={false} name="Drawdown" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}