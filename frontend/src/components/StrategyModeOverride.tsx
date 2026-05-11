/**
 * Strategy Mode Override — self-contained panel.
 *
 * Shows the full 12-bot fleet with per-strategy mode step buttons
 * (PAPER → APPROVED → LIVE), quick UP/DOWN promote/demote buttons,
 * and an inline-editable stake-per-trade input.
 *
 * Relocated from Strategies → Settings (Session XXV spec).
 * Extracted into a reusable component so the same panel can appear
 * on Settings without duplicating state or handler logic.
 */
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useBotStore } from '@/store/botStore'
import api from '@/api/client'
import { ArrowUp, ArrowDown, ChevronRight, RefreshCw } from 'lucide-react'

const MODE_ORDER = ['PAPER_ONLY', 'APPROVED_FOR_LIVE', 'LIVE'] as const

const MODE_META: Record<string, { label: string; badge: string; prefix: string }> = {
  LIVE:                  { label: 'LIVE',     prefix: '●',  badge: 'bg-accent-green/10 text-accent-green border-accent-green/30' },
  APPROVED_FOR_LIVE:     { label: 'APPROVED', prefix: '◑',  badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' },
  PENDING_LIVE_APPROVAL: { label: 'PENDING',  prefix: '⏳', badge: 'bg-orange-400/10 text-orange-400 border-orange-400/30' },
  PAPER_ONLY:            { label: 'PAPER',    prefix: '◌',  badge: 'bg-slate-700/60 text-slate-300 border-slate-600' },
}

function fmt(n: number | null | undefined) {
  const _n = n ?? 0
  const s = Math.abs(_n).toFixed(4)
  return _n >= 0 ? `+${s} τ` : `-${s} τ`
}

function ModeStep({
  mode, active, onClick, pending,
}: {
  mode: string; active: boolean; onClick?: () => void; pending?: boolean
}) {
  const m = MODE_META[mode]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active || pending}
      title={active ? `Already at ${m.label}` : `Set to ${m.label}`}
      className={clsx(
        'px-2 py-0.5 rounded border text-[13px] font-mono font-bold transition-all',
        active
          ? clsx('cursor-default shadow-sm', m.badge)
          : 'cursor-pointer text-slate-500 border-dark-700 hover:text-white hover:border-dark-500 opacity-70 hover:opacity-100',
      )}
    >
      {pending ? <RefreshCw size={10} className="inline animate-spin" /> : m.prefix} {m.label}
    </button>
  )
}

export default function StrategyModeOverride() {
  const { strategies, fetchStrategies } = useBotStore()
  const [opPending,    setOpPending]    = useState<string | null>(null)
  const [stakeEditing, setStakeEditing] = useState<string | null>(null)
  const [stakeInput,   setStakeInput]   = useState<string>('')

  const refresh = useCallback(async () => {
    try { await fetchStrategies() } catch { /* silent */ }
  }, [fetchStrategies])

  useEffect(() => { refresh() }, [refresh])

  async function doPromote(name: string) {
    setOpPending(name + '_up')
    try {
      await api.post(`/strategies/${name}/promote`)
      toast.success(`${name} promoted`)
      await refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Promote failed')
    } finally { setOpPending(null) }
  }

  async function doDemote(name: string) {
    setOpPending(name + '_down')
    try {
      await api.post(`/strategies/${name}/demote`)
      toast.success(`${name} demoted`)
      await refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Demote failed')
    } finally { setOpPending(null) }
  }

  async function doSetMode(name: string, mode: 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE') {
    setOpPending(name + '_' + mode)
    try {
      await api.put(`/strategies/${name}`, { mode })
      toast.success(`${name} → ${MODE_META[mode].label}`)
      await refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Mode change failed')
    } finally { setOpPending(null) }
  }

  async function doSetStake(name: string) {
    const amount = parseFloat(stakeInput)
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error('Invalid stake amount')
      return
    }
    try {
      await api.put(`/strategies/${name}`, { stake_amount: amount })
      toast.success(`${name} stake → ${amount}τ`)
      setStakeEditing(null)
      await refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Stake update failed')
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <ArrowUp size={13} className="text-accent-green" /> Strategy Mode Override
        </h2>
        <p className="text-[13px] text-slate-500 font-mono">bypasses gate · instant · permanent until changed</p>
      </div>

      {/* Mode legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {MODE_ORDER.map(m => {
          const meta = MODE_META[m]
          return (
            <span key={m} className={clsx('px-2 py-0.5 rounded border text-[13px] font-mono font-bold', meta.badge)}>
              {meta.prefix} {meta.label}
            </span>
          )
        })}
        <span className="text-[13px] text-slate-500 ml-2">— click ↑ to promote, ↓ to demote</span>
      </div>

      {/* Strategy rows */}
      <div className="space-y-1.5">
        {strategies.map(s => {
          const atCeiling   = s.mode === 'LIVE'
          const atFloor     = s.mode === 'PAPER_ONLY'
          const upPending   = opPending === s.name + '_up'
          const downPending = opPending === s.name + '_down'
          return (
            <div
              key={s.name}
              className="flex items-center gap-3 px-3 py-2.5 bg-dark-900 rounded-lg border border-dark-700/60 hover:border-dark-600 transition-colors group"
            >
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{s.display_name}</p>
                <p className="text-[13px] text-slate-500 font-mono">{s.name}</p>
              </div>

              {/* Win rate */}
              <div className="text-right flex-shrink-0 w-16 hidden sm:block">
                <p className={clsx('text-xs font-mono font-bold',
                  s.win_rate >= 55 ? 'text-accent-green' : s.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                  {(s.win_rate ?? 0).toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500">win rate</p>
              </div>

              {/* PnL */}
              <div className="text-right flex-shrink-0 w-24 hidden md:block">
                <p className={clsx('text-xs font-mono font-bold',
                  s.total_pnl > 0 ? 'text-accent-green' : s.total_pnl < 0 ? 'text-red-400' : 'text-slate-400')}>
                  {fmt(s.total_pnl)}
                </p>
                <p className="text-[11px] text-slate-500">PnL</p>
              </div>

              {/* Stake per trade — inline editable */}
              <div className="flex-shrink-0 hidden lg:block">
                {stakeEditing === s.name ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0.001" max="1.0" step="0.001"
                      value={stakeInput}
                      onChange={e => setStakeInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  doSetStake(s.name)
                        if (e.key === 'Escape') setStakeEditing(null)
                      }}
                      autoFocus
                      className="w-20 px-2 py-1 text-xs font-mono bg-dark-800 border border-accent-blue/50 rounded text-white focus:outline-none focus:border-accent-blue"
                      placeholder="0.0100"
                    />
                    <span className="text-[13px] text-slate-500 font-mono">τ</span>
                    <button onClick={() => doSetStake(s.name)}
                      className="text-accent-green hover:text-white text-[13px] font-mono font-bold transition-colors" title="Save">✓</button>
                    <button onClick={() => setStakeEditing(null)}
                      className="text-slate-500 hover:text-red-400 text-[13px] font-mono transition-colors" title="Cancel">✗</button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setStakeEditing(s.name)
                      setStakeInput(s.stake_amount != null ? Number(s.stake_amount).toFixed(4) : '')
                    }}
                    className="text-right group/stake"
                    title="Click to edit stake per trade"
                  >
                    <p className={clsx('text-xs font-mono font-bold group-hover/stake:text-accent-blue transition-colors',
                      s.mode === 'LIVE' ? 'text-white' : 'text-slate-500')}>
                      {s.stake_amount != null ? `${Number(s.stake_amount).toFixed(4)} τ` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">stake/trade</p>
                  </button>
                )}
              </div>

              {/* Mode step buttons — PAPER → APPROVED → LIVE */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {MODE_ORDER.map((m, i) => {
                  const modeKey  = m as 'PAPER_ONLY' | 'APPROVED_FOR_LIVE' | 'LIVE'
                  const isPending = opPending === s.name + '_' + m
                  return (
                    <div key={m} className="flex items-center gap-1">
                      <ModeStep
                        mode={m}
                        active={m === s.mode}
                        pending={isPending}
                        onClick={() => doSetMode(s.name, modeKey)}
                      />
                      {i < MODE_ORDER.length - 1 && <ChevronRight size={10} className="text-slate-600" />}
                    </div>
                  )
                })}
              </div>

              {/* UP / DOWN quick promote / demote */}
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => doPromote(s.name)}
                  disabled={atCeiling || upPending || downPending}
                  title={atCeiling ? 'Already at LIVE' : 'Promote one level'}
                  className={clsx(
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                    atCeiling
                      ? 'text-slate-600 border-dark-700 cursor-not-allowed'
                      : 'text-accent-green border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/15 hover:border-accent-green/50 active:scale-95',
                  )}
                >
                  {upPending ? <RefreshCw size={10} className="animate-spin" /> : <ArrowUp size={10} />} UP
                </button>
                <button
                  onClick={() => doDemote(s.name)}
                  disabled={atFloor || upPending || downPending}
                  title={atFloor ? 'Already at PAPER' : 'Demote one level'}
                  className={clsx(
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                    atFloor
                      ? 'text-slate-600 border-dark-700 cursor-not-allowed'
                      : 'text-red-400 border-red-500/30 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/50 active:scale-95',
                  )}
                >
                  {downPending ? <RefreshCw size={10} className="animate-spin" /> : <ArrowDown size={10} />} DOWN
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[13px] text-slate-500 font-mono mt-4 leading-relaxed">
        Mode changes are instant and persistent (written to DB). Promoting to LIVE while paper mode is active
        means the strategy will execute real on-chain trades when paper mode is lifted. Demoting from LIVE does not cancel open positions.
      </p>
    </div>
  )
}