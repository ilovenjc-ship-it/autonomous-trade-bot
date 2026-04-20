/**
 * TradingModeBanner
 * ─────────────────
 * Full-width, always-visible strip that makes it impossible to
 * confuse LIVE on-chain trading with paper simulation.
 *
 * LIVE  → pulsing green  "⚡ LIVE TRADING ACTIVE"
 * PAPER → solid amber    "📋 PAPER TRADING · [reason]"
 *
 * Polls /api/bot/trading-mode every 20 seconds.
 * Clicking expands a gate-by-gate breakdown.
 */

import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Zap, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import api from '@/api/client'
import clsx from 'clsx'

interface Gate {
  chain_connected:      boolean
  validator_configured: boolean
  validator_in_memory:  boolean
  live_strategies:      number
}

interface TradeSummary {
  total: number
  real:  number
  paper: number
}

interface LiveStrategy {
  name:         string
  display_name: string
  mode:         string
}

interface TradingMode {
  overall_mode:      'LIVE' | 'PAPER'
  status_message:    string
  blocking_reason:   string | null
  gates:             Gate
  live_strategies:   LiveStrategy[]
  trade_summary:     TradeSummary
  validator_hotkey:  string | null
  wallet_balance_tao: number
  network:           string
}

export default function TradingModeBanner() {
  const [data,     setData]     = useState<TradingMode | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading,  setLoading]  = useState(true)

  const poll = useCallback(async () => {
    try {
      const res = await api.get<TradingMode>('/bot/trading-mode')
      setData(res.data)
    } catch {
      // silent — keep showing last known state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const t = setInterval(poll, 20_000)
    return () => clearInterval(t)
  }, [poll])

  if (loading && !data) {
    return (
      <div className="w-full h-8 bg-dark-700 flex items-center justify-center gap-2">
        <Loader2 size={12} className="animate-spin text-slate-400" />
        <span className="text-[10px] text-slate-400 font-mono">Checking trading mode…</span>
      </div>
    )
  }

  if (!data) return null

  const isLive = data.overall_mode === 'LIVE'

  // Defensive defaults — gates may be null on fresh Railway DB boot
  const gates = data.gates ?? {
    chain_connected: false, validator_configured: false,
    validator_in_memory: false, live_strategies: 0,
  }

  const gateItems: { label: string; ok: boolean }[] = [
    { label: 'Finney mainnet connected',  ok: gates.chain_connected },
    { label: 'Validator hotkey saved',    ok: gates.validator_configured },
    { label: 'Validator loaded in router',ok: gates.validator_in_memory },
    { label: `LIVE strategies armed (${gates.live_strategies})`,
      ok: gates.live_strategies > 0 },
  ]

  return (
    <div
      className={clsx(
        'w-full border-b transition-all duration-300',
        isLive
          ? 'bg-emerald-950/80 border-emerald-500/40'
          : 'bg-amber-950/80 border-amber-500/40'
      )}
    >
      {/* ── Main bar ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-2 hover:opacity-90 transition-opacity"
      >
        {/* Mode icon + label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLive ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              <Zap size={14} className="text-emerald-400" />
              <span className="text-xs font-bold tracking-widest text-emerald-300 uppercase">
                Live Trading Active
              </span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <FileText size={14} className="text-amber-400" />
              <span className="text-xs font-bold tracking-widest text-amber-300 uppercase">
                Paper Trading
              </span>
            </>
          )}
        </div>

        {/* Separator */}
        <span className={clsx('text-xs', isLive ? 'text-emerald-700' : 'text-amber-700')}>|</span>

        {/* Status message */}
        <span className={clsx(
          'text-xs font-mono flex-1 text-left truncate',
          isLive ? 'text-emerald-400/80' : 'text-amber-400/80'
        )}>
          {data.status_message}
        </span>

        {/* Trade counts */}
        <div className="flex items-center gap-4 flex-shrink-0 mr-3">
          <span className="text-[10px] font-mono text-slate-400">
            Total: <span className="text-slate-200">{(data.trade_summary?.total ?? 0).toLocaleString()}</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            Real: <span className={clsx('font-bold', (data.trade_summary?.real ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-400')}>
              {(data.trade_summary?.real ?? 0).toLocaleString()}
            </span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            Paper: <span className="text-amber-400">{(data.trade_summary?.paper ?? 0).toLocaleString()}</span>
          </span>
        </div>

        {/* Wallet */}
        {data.wallet_balance_tao > 0 && (
          <span className="text-[10px] font-mono text-slate-300 flex-shrink-0 mr-2">
            τ {data.wallet_balance_tao.toFixed(6)}
          </span>
        )}

        {/* Expand toggle */}
        {expanded
          ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        }
      </button>

      {/* ── Expanded gate detail ── */}
      {expanded && (
        <div className={clsx(
          'px-5 pb-4 pt-1 border-t',
          isLive ? 'border-emerald-800/40' : 'border-amber-800/40'
        )}>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 mb-4">
            {gateItems.map(g => (
              <div key={g.label} className="flex items-center gap-2">
                {g.ok
                  ? <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
                  : <XCircle    size={13} className="text-red-400 flex-shrink-0" />
                }
                <span className={clsx(
                  'text-[11px] font-mono',
                  g.ok ? 'text-slate-300' : 'text-red-300'
                )}>
                  {g.label}
                </span>
              </div>
            ))}
          </div>

          {/* Armed strategies */}
          {(data.live_strategies?.length ?? 0) > 0 && (
            <div className="mb-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Armed Strategies
              </p>
              <div className="flex flex-wrap gap-2">
                {(data.live_strategies ?? []).map(s => (
                  <span key={s.name}
                    className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] text-emerald-300 font-mono">
                    {s.display_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validator */}
          {data.validator_hotkey && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Target Validator
              </p>
              <p className="text-[10px] font-mono text-slate-400">
                {data.validator_hotkey}
              </p>
            </div>
          )}

          {/* What happens next */}
          {isLive ? (
            <p className="mt-3 text-[10px] text-emerald-400/60 font-mono">
              Next LIVE strategy signal + 7/12 OpenClaw votes → stake() fires on Finney → tx_hash recorded
            </p>
          ) : (
            <p className="mt-3 text-[10px] text-amber-400/60 font-mono">
              All conditions above must be ✅ for live trading to activate
            </p>
          )}
        </div>
      )}
    </div>
  )
}