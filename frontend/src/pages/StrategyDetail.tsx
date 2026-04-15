import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ArrowLeft, TrendingUp, CheckCircle2,
  XCircle, RefreshCw, Shield, Activity,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── types ─────────────────────────────────────────────────────────────────────
interface GateCheck { value: number; required: number; ok: boolean }
interface Gate { cycles: GateCheck; win_rate: GateCheck; margin: GateCheck; pnl: GateCheck }
interface EquityPoint { time: string; pnl: number; cumulative: number }
interface RecentTrade {
  id: number; type: string; amount: number; price: number
  pnl: number; signal: string; time: string; win: boolean
}
interface Detail {
  name: string; display_name: string; description: string; mode: string
  total_trades: number; win_trades: number; loss_trades: number
  win_rate: number; total_pnl: number; cycles_completed: number
  equity: EquityPoint[]; recent_trades: RecentTrade[]; gate: Gate
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  const s = Math.abs(n).toFixed(d)
  return n >= 0 ? `+${s}` : `-${s}`
}

const MODE_COLOR: Record<string, string> = {
  LIVE:              'bg-accent-green/20 text-accent-green border-accent-green/40',
  APPROVED_FOR_LIVE: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/40',
  PAPER_ONLY:        'bg-slate-700 text-slate-300 border-slate-600',
}

function GateBar({ label, g }: { label: string; g: GateCheck }) {
  const pct = Math.min(100, (g.value / Math.max(g.required, 0.001)) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-slate-300">{label}</span>
        <span className={g.ok ? 'text-accent-green' : 'text-slate-300'}>
          {g.value.toFixed(typeof g.value === 'number' && g.value % 1 !== 0 ? 1 : 0)}
          {' / '}{g.required}
          {g.ok ? ' ✓' : ''}
        </span>
      </div>
      <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', g.ok ? 'bg-accent-green' : 'bg-accent-blue')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function StrategyDetail() {
  const { name }     = useParams<{ name: string }>()
  const navigate     = useNavigate()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<Detail>(`/analytics/strategy/${name}`)
      setDetail(data)
    } catch (e) {
      setError(`Could not load strategy "${name}"`)
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-slate-300" />
    </div>
  )

  if (error || !detail) return (
    <div className="p-8 text-center">
      <p className="text-red-400 font-mono">{error || 'Not found'}</p>
      <button onClick={() => navigate('/fleet')} className="mt-4 text-accent-blue text-sm hover:underline">
        ← Back to Fleet
      </button>
    </div>
  )

  const { gate } = detail
  const gatesPassed = Object.values(gate).filter(g => g.ok).length
  const stride = Math.max(1, Math.floor(detail.equity.length / 150))
  const eqThin = detail.equity.filter((_, i) => i % stride === 0)

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/fleet')}
          className="mt-1 p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{detail.display_name}</h1>
            <span className={clsx('px-2 py-0.5 rounded border text-xs font-mono font-semibold',
              MODE_COLOR[detail.mode] ?? MODE_COLOR.PAPER_ONLY)}>
              {detail.mode.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1">{detail.description}</p>
        </div>
        <button onClick={load} className="mt-1 p-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:text-white">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Trades', value: String(detail.total_trades), color: 'text-white' },
          { label: 'Win Rate',     value: `${detail.win_rate.toFixed(1)}%`,
            color: detail.win_rate >= 55 ? 'text-accent-green' : 'text-yellow-400' },
          { label: 'W / L',        value: `${detail.win_trades} / ${detail.loss_trades}`, color: 'text-white' },
          { label: 'Total PnL',    value: `${fmt(detail.total_pnl)} τ`,
            color: detail.total_pnl >= 0 ? 'text-accent-green' : 'text-red-400' },
          { label: 'Cycles',       value: String(detail.cycles_completed), color: 'text-accent-blue' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-mono">{label}</p>
            <p className={clsx('text-xl font-bold font-mono mt-1', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Equity curve + Gate ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Equity — 2/3 */}
        <div className="xl:col-span-2 bg-dark-800 border border-dark-600 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-accent-green" />
            Cumulative PnL — {detail.equity.length} trades
          </h2>
          {eqThin.length > 1 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={eqThin} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="sdGrad" x1="0" y1="0" x2="0" y2="1">
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
                  formatter={(v: any) => [`${v.toFixed(4)} τ`, 'Cumulative']}
                />
                <Area dataKey="cumulative" stroke="#00ff88" strokeWidth={2}
                  fill="url(#sdGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-300 text-sm font-mono">
              Not enough trades yet
            </div>
          )}
        </div>

        {/* Gate progress — 1/3 */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <Shield size={14} className="text-yellow-400" /> Gate Progress
            <span className={clsx('ml-auto text-xs font-mono px-2 py-0.5 rounded border',
              gatesPassed === 4
                ? 'text-accent-green bg-accent-green/10 border-accent-green/30'
                : 'text-slate-300 bg-dark-700 border-dark-600')}>
              {gatesPassed}/4 gates
            </span>
          </h2>

          <div className="space-y-4">
            <GateBar label="Cycles completed (≥10)" g={gate.cycles} />
            <GateBar label="Win rate (≥55%)"        g={gate.win_rate} />
            <GateBar label="Win margin (wins−losses≥2)" g={gate.margin} />
            <GateBar label="Cumulative PnL (>0 τ)"  g={gate.pnl} />
          </div>

          <div className={clsx(
            'mt-5 px-3 py-2.5 rounded-lg border text-xs font-mono text-center font-semibold',
            detail.mode === 'LIVE'              ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' :
            detail.mode === 'APPROVED_FOR_LIVE' ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400' :
                                                  'bg-dark-700 border-dark-600 text-slate-300'
          )}>
            {detail.mode === 'LIVE'              ? '🚀 LIVE — Executing real trades' :
             detail.mode === 'APPROVED_FOR_LIVE' ? '🎯 APPROVED — Awaiting deployment' :
                                                   '📋 PAPER ONLY — Gate training'}
          </div>
        </div>
      </div>

      {/* ── Recent trades table ─────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity size={14} className="text-accent-blue" /> Recent Trades
          </h2>
          <span className="text-xs text-slate-300 font-mono">last 50 · newest first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-600 text-[10px] text-slate-300 uppercase tracking-wider font-mono">
                <th className="px-4 py-2.5 text-left">ID</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-right">Price</th>
                <th className="px-4 py-2.5 text-right">PnL</th>
                <th className="px-4 py-2.5 text-center">Result</th>
                <th className="px-4 py-2.5 text-left">Signal</th>
                <th className="px-4 py-2.5 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {detail.recent_trades.map((t, i) => (
                <tr key={t.id} className={clsx(
                  'border-b border-dark-700/40 hover:bg-dark-700/40',
                  i % 2 === 0 ? '' : 'bg-dark-800/30'
                )}>
                  <td className="px-4 py-2 text-slate-300 font-mono">#{t.id}</td>
                  <td className="px-4 py-2">
                    <span className={clsx('font-mono font-bold text-[11px]',
                      t.type === 'buy' ? 'text-accent-green' : 'text-red-400')}>
                      {t.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-300">{t.amount.toFixed(4)} τ</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-300">${t.price.toFixed(2)}</td>
                  <td className={clsx('px-4 py-2 text-right font-mono font-semibold',
                    t.pnl > 0 ? 'text-accent-green' : t.pnl < 0 ? 'text-red-400' : 'text-slate-300')}>
                    {fmt(t.pnl, 4)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {t.win
                      ? <CheckCircle2 size={12} className="text-accent-green mx-auto" />
                      : <XCircle     size={12} className="text-red-400 mx-auto" />
                    }
                  </td>
                  <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate">{t.signal || '—'}</td>
                  <td className="px-4 py-2 font-mono text-slate-300 whitespace-nowrap">{t.time}</td>
                </tr>
              ))}
              {detail.recent_trades.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-300 font-mono">
                  No trades yet
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}