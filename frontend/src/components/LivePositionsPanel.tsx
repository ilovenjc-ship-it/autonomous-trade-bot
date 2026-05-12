/**
 * Live Positions Panel — Stop-Loss / Take-Profit Monitor
 *
 * Extracted from PnLSummary (Session XXVI).
 * Self-contained: owns its fetch loop (/fleet/positions, 15s poll) and state.
 * Drop-in: <LivePositionsPanel /> — no required props.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Activity, RefreshCw, ShieldAlert, TrendingDown, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LivePosition {
  id:                  number
  netuid:              number
  hotkey:              string
  strategy:            string | null
  entry_alpha_price:   number
  current_alpha_price: number
  tao_staked:          number
  current_tao_value:   number
  pnl_pct:             number
  pnl_tao:             number
  sl_level:            number
  tp_level:            number
  sl_pct:              number
  tp_pct:              number
  status:              string
  open_tx_hash:        string | null
  realized_pnl_tao:    number | null
  opened_at:           string | null
  closed_at:           string | null
}

interface PositionsData {
  positions:  LivePosition[]
  open_count: number
  sl_pct:     number
  tp_pct:     number
}

// ── Static lookups ────────────────────────────────────────────────────────────

const STRATEGY_DISPLAY: Record<string, string> = {
  momentum_cascade:   'Momentum Cascade',
  dtao_flow_momentum: 'dTAO Flow Momentum',
  liquidity_hunter:   'Liquidity Hunter',
  breakout_hunter:    'Breakout Hunter',
  yield_maximizer:    'Yield Maximizer',
  contrarian_flow:    'Contrarian Flow',
  volatility_arb:     'Volatility Arb',
  sentiment_surge:    'Sentiment Surge',
  balanced_risk:      'Balanced Risk',
  mean_reversion:     'Mean Reversion',
  emission_momentum:  'Emission Momentum',
  macro_correlation:  'Macro Correlation',
}

const SUBNET_NAMES: Record<number, string> = {
  0:   'Root Network',
  1:   'Apex',
  3:   'MyShell',
  8:   'Taoshi PTN',
  9:   'Pretrain',
  18:  'Cortex.t',
  19:  'Vision',
  21:  'Filetao',
  24:  'Omega Labs',
  64:  'Chutes',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LivePositionsPanel() {
  const [positions,  setPositions]  = useState<PositionsData | null>(null)
  const [posLoading, setPosLoading] = useState(false)

  const fetchPositions = useCallback(async () => {
    setPosLoading(true)
    try {
      const { data: pd } = await api.get<PositionsData>('/fleet/positions')
      setPositions(pd)
    } catch {}
    finally { setPosLoading(false) }
  }, [])

  useEffect(() => { fetchPositions() }, [fetchPositions])
  useEffect(() => {
    const t = setInterval(fetchPositions, 15_000)
    return () => clearInterval(t)
  }, [fetchPositions])

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className={
            (positions?.open_count ?? 0) > 0 ? 'text-amber-400' : 'text-slate-500'
          } />
          <h2 className="text-sm font-semibold text-white">Live Positions</h2>
          <span className="text-[12px] text-slate-500 font-mono">Stop-Loss / Take-Profit Monitor</span>
          {(positions?.open_count ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {positions?.open_count} OPEN
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* SL / TP badges */}
          {positions && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/20 text-red-400">
                <TrendingDown size={10} /> SL {positions.sl_pct.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
                <TrendingUp size={10} /> TP {positions.tp_pct.toFixed(0)}%
              </span>
            </div>
          )}
          <button
            onClick={fetchPositions}
            disabled={posLoading}
            className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white font-mono transition-colors"
          >
            <RefreshCw size={11} className={posLoading ? 'animate-spin' : ''} />
            {posLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Positions list */}
      {posLoading && !positions ? (
        <div className="flex items-center justify-center py-6 text-slate-500 text-xs font-mono gap-2">
          <Activity size={12} className="animate-pulse" /> Loading positions…
        </div>
      ) : positions?.positions && positions.positions.filter(p => p.status === 'open').length > 0 ? (
        <div className="space-y-3">
          {positions.positions.filter(p => p.status === 'open').map(pos => {
            const subnetName = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
            const stratName  = STRATEGY_DISPLAY[pos.strategy ?? ''] ?? pos.strategy ?? '—'
            const pnl        = pos.pnl_pct
            const isUp       = pnl > 0
            const isDown     = pnl < 0

            const slGap = pos.entry_alpha_price > 0
              ? ((pos.current_alpha_price - pos.sl_level) / (pos.entry_alpha_price - pos.sl_level)) * 100
              : 100
            const dangerZone = slGap < 25 && isDown

            const range  = pos.tp_pct + pos.sl_pct
            const barPos = Math.min(100, Math.max(0, ((pnl + pos.sl_pct) / range) * 100))

            return (
              <div
                key={pos.id}
                className={clsx(
                  'rounded-xl border p-4 space-y-3 transition-all',
                  dangerZone
                    ? 'bg-red-500/5 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.08)]'
                    : isUp
                    ? 'bg-dark-700 border-emerald-500/20'
                    : 'bg-dark-700 border-dark-600'
                )}
              >
                {/* Row 1: identity + PnL */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      SN{pos.netuid}
                    </span>
                    <span className="text-sm font-semibold text-white">{subnetName}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{stratName}</span>
                  </div>
                  <div className="text-right">
                    <p className={clsx(
                      'text-lg font-black font-mono',
                      isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-slate-400'
                    )}>
                      {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}%
                    </p>
                    <p className={clsx(
                      'text-[11px] font-mono',
                      isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-slate-500'
                    )}>
                      {pos.pnl_tao >= 0 ? '+' : ''}{pos.pnl_tao.toFixed(4)}τ
                    </p>
                  </div>
                </div>

                {/* Row 2: SL-to-TP bar */}
                <div className="space-y-1">
                  <div className="relative h-2 bg-dark-600 rounded-full overflow-visible">
                    {isDown && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-red-500/60"
                        style={{ width: `${barPos}%` }}
                      />
                    )}
                    {isUp && (
                      <div
                        className="absolute inset-y-0 rounded-full bg-emerald-500/60"
                        style={{ left: '50%', width: `${barPos - 50}%` }}
                      />
                    )}
                    <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-500" />
                    <div
                      className={clsx(
                        'absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-all',
                        dangerZone ? 'border-red-400 bg-red-500 animate-pulse' :
                        isUp       ? 'border-emerald-400 bg-emerald-500' :
                                     'border-amber-400 bg-amber-500'
                      )}
                      style={{ left: `calc(${barPos}% - 5px)` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-red-400">SL {pos.sl_level.toFixed(4)}τ</span>
                    <span className="text-slate-500">entry {pos.entry_alpha_price.toFixed(4)}τ</span>
                    <span className="text-emerald-400">TP {pos.tp_level.toFixed(4)}τ</span>
                  </div>
                </div>

                {/* Row 3: price detail + staked */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <div className="flex items-center gap-3">
                    <span>
                      Current: <span className={clsx('font-semibold', isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-white')}>
                        {pos.current_alpha_price > 0 ? `τ${pos.current_alpha_price.toFixed(5)}` : 'no price'}
                      </span>
                    </span>
                    <span className="text-slate-600">·</span>
                    <span>Staked: <span className="text-slate-300">{pos.tao_staked.toFixed(4)}τ</span></span>
                  </div>
                  {dangerZone && (
                    <span className="flex items-center gap-1 text-red-400 font-semibold animate-pulse">
                      <TrendingDown size={10} /> Near SL
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-500 text-xs font-mono space-y-1">
          <ShieldAlert size={20} className="mx-auto text-slate-700 mb-2" />
          <p>No open positions tracked</p>
          <p className="text-slate-600">
            Positions appear when LIVE bots execute on-chain BUY trades.
            Stop-loss ({positions?.sl_pct ?? 8}%) and take-profit ({positions?.tp_pct ?? 25}%) 
            monitor automatically.
          </p>
        </div>
      )}

      {/* Recently closed positions */}
      {positions?.positions && positions.positions.filter(p => p.status !== 'open').length > 0 && (
        <div className="mt-4 pt-4 border-t border-dark-600">
          <p className="text-[12px] text-slate-500 uppercase tracking-widest font-mono mb-3">Recently Closed (7 days)</p>
          <div className="space-y-2">
            {positions.positions.filter(p => p.status !== 'open').map(pos => {
              const subnetName = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
              const statusMap: Record<string, { label: string; color: string }> = {
                sl_hit:      { label: '🛑 Stop-Loss',   color: 'text-red-400'     },
                tp_hit:      { label: '🎯 Take-Profit', color: 'text-emerald-400' },
                closed:      { label: '✓ Closed',       color: 'text-slate-400'   },
                failed_exit: { label: '⚠ Failed Exit',  color: 'text-amber-400'   },
              }
              const s = statusMap[pos.status] ?? { label: pos.status, color: 'text-slate-400' }
              return (
                <div key={pos.id} className="flex items-center justify-between px-3 py-2 bg-dark-700/50 rounded-lg text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">SN{pos.netuid}</span>
                    <span className="text-slate-400">{subnetName}</span>
                    <span className={clsx('font-semibold', s.color)}>{s.label}</span>
                  </div>
                  <div className="text-right">
                    {pos.realized_pnl_tao != null && (
                      <span className={clsx('font-semibold', pos.realized_pnl_tao >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pos.realized_pnl_tao >= 0 ? '+' : ''}{pos.realized_pnl_tao.toFixed(4)}τ
                      </span>
                    )}
                    <span className="text-slate-600 ml-2">
                      {pos.closed_at ? new Date(pos.closed_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}