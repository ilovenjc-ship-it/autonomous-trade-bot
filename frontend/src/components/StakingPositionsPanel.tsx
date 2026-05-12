/**
 * Staking Positions Panel — Live αTAO Deployment Monitor
 *
 * Extracted from PnLSummary (Session XXVI).
 * Self-contained: owns its fetch loop (/wallet/stakes, 30s poll) + independent
 * TAO/USD price fetch (/price/current, 60s poll) for the USD conversion that
 * was previously sourced from the parent's /pnl/summary response.
 * Drop-in: <StakingPositionsPanel /> — no required props.
 */
import { useCallback, useEffect, useState } from 'react'
import { Layers, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StakePosition {
  hotkey:      string
  stake:       number
  netuid:      number
  alpha_price: number
  tao_value:   number
}

interface StakesData {
  stakes:          StakePosition[]
  total:           number
  total_tao_value: number
}

// ── Static lookup ─────────────────────────────────────────────────────────────

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

export default function StakingPositionsPanel() {
  const [stakes,        setStakes]        = useState<StakesData | null>(null)
  const [stakesLoading, setStakesLoading] = useState(false)
  const [unstaking,     setUnstaking]     = useState<Record<string, boolean>>({})
  const [unstakingAll,  setUnstakingAll]  = useState(false)
  const [taoPriceUsd,   setTaoPriceUsd]   = useState<number | null>(null)

  const fetchStakes = useCallback(async () => {
    setStakesLoading(true)
    try {
      const { data: sd } = await api.get<StakesData>('/wallet/stakes')
      setStakes(sd)
    } catch {}
    finally { setStakesLoading(false) }
  }, [])

  const fetchPrice = useCallback(async () => {
    try {
      const { data } = await api.get('/price/current')
      setTaoPriceUsd(data?.price ?? null)
    } catch {}
  }, [])

  useEffect(() => { fetchStakes() }, [fetchStakes])
  useEffect(() => {
    const t = setInterval(fetchStakes, 30_000)
    return () => clearInterval(t)
  }, [fetchStakes])

  useEffect(() => { fetchPrice() }, [fetchPrice])
  useEffect(() => {
    const t = setInterval(fetchPrice, 60_000)
    return () => clearInterval(t)
  }, [fetchPrice])

  const handleUnstake = async (netuid: number, hotkey: string, subnetName: string) => {
    const key = `${netuid}-${hotkey}`
    setUnstaking(prev => ({ ...prev, [key]: true }))
    try {
      const { data: res } = await api.post<{
        success: boolean; alpha_amount?: number; tx_hash?: string; error?: string
      }>('/wallet/unstake-position', { netuid, hotkey })
      if (res.success) {
        toast.success(`✅ Unstaked ${(res.alpha_amount ?? 0).toFixed(4)} α from ${subnetName}`, { duration: 6000 })
        setTimeout(() => fetchStakes(), 4000)
      } else {
        toast.error(res.error ?? `Unstake failed for ${subnetName}`)
      }
    } catch {
      toast.error(`Network error unstaking ${subnetName}`)
    } finally {
      setUnstaking(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleUnstakeAll = async () => {
    if (!window.confirm('Unstake ALL positions? This withdraws every staked αTAO back to liquid TAO. Cannot be undone.')) return
    setUnstakingAll(true)
    try {
      const { data: res } = await api.post<{
        success: boolean; summary?: { total: number; succeeded: number; failed: number }; error?: string
      }>('/wallet/unstake-all')
      if (res.success) {
        const s = res.summary
        toast.success(`✅ Unstake All complete — ${s?.succeeded ?? '?'} positions exited`, { duration: 8000 })
        setTimeout(() => fetchStakes(), 5000)
      } else {
        toast.error(res.error ?? 'Unstake All failed')
      }
    } catch {
      toast.error('Network error during Unstake All')
    } finally {
      setUnstakingAll(false)
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Staking Positions</span>
          <span className="text-xs text-slate-500 font-mono">Live αTAO deployment</span>
          {stakes?.stakes && stakes.stakes.length > 0 && (
            <span className="px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
              {stakes.stakes.length} ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {stakes && stakes.total_tao_value > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-500">Total deployed:</span>
              <span className="text-purple-400 font-bold">τ{stakes.total_tao_value.toFixed(4)}</span>
              {taoPriceUsd != null && (
                <span className="text-slate-500">${(stakes.total_tao_value * taoPriceUsd).toFixed(2)}</span>
              )}
            </div>
          )}
          <button
            onClick={fetchStakes}
            disabled={stakesLoading}
            className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white font-mono transition-colors"
          >
            <RefreshCw size={11} className={stakesLoading ? 'animate-spin' : ''} />
            {stakesLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {stakesLoading && !stakes ? (
        <div className="flex items-center justify-center py-8 text-slate-500 text-xs font-mono gap-2">
          <RefreshCw size={12} className="animate-spin" /> Querying Finney mainnet…
        </div>
      ) : stakes?.stakes && stakes.stakes.length > 0 ? (
        <div className="space-y-2">
          {stakes.stakes.map((pos) => {
            const name   = SUBNET_NAMES[pos.netuid] ?? `Subnet ${pos.netuid}`
            const total  = stakes.total_tao_value > 0 ? stakes.total_tao_value : 1
            const pct    = (pos.tao_value / total) * 100
            const usd    = taoPriceUsd != null ? pos.tao_value * taoPriceUsd : null
            const isRoot = pos.netuid === 0
            const key    = `${pos.netuid}-${pos.hotkey}`
            return (
              <div
                key={key}
                className="bg-dark-700/80 border border-dark-600 rounded-xl p-3.5 space-y-2.5"
              >
                {/* Row 1: subnet name + badge + TAO value */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'text-[11px] font-bold font-mono px-1.5 py-0.5 rounded',
                      isRoot ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'
                    )}>
                      SN{pos.netuid}
                    </span>
                    <span className="text-sm font-semibold text-white">{name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono text-emerald-400">τ{pos.tao_value.toFixed(4)}</p>
                    {usd != null && <p className="text-[11px] font-mono text-slate-400">${usd.toFixed(2)}</p>}
                  </div>
                </div>

                {/* Row 2: αTAO × price + bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px] font-mono text-slate-400">
                    <span>
                      <span className="text-slate-300">{pos.stake.toFixed(4)}</span>
                      <span className="text-slate-500"> αTAO</span>
                      {!isRoot && (
                        <>
                          <span className="text-slate-600 mx-1">×</span>
                          <span className="text-slate-400">τ{pos.alpha_price.toFixed(5)}</span>
                          <span className="text-slate-600 text-[10px] ml-1">/ αTAO</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-500">{pct.toFixed(1)}% of deployed</span>
                  </div>
                  <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-700', isRoot ? 'bg-amber-400' : 'bg-purple-400')}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                {/* Row 3: hotkey + Unstake button */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-mono text-slate-600 truncate flex-1">{pos.hotkey}</p>
                  <button
                    onClick={() => handleUnstake(pos.netuid, pos.hotkey, name)}
                    disabled={unstaking[key] || unstakingAll}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono transition-all flex-shrink-0 border',
                      unstaking[key]
                        ? 'bg-red-500/10 text-red-400 border-red-500/30 cursor-wait'
                        : 'bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/50 active:scale-95'
                    )}
                  >
                    {unstaking[key]
                      ? <><RefreshCw size={9} className="animate-spin" /> Unstaking…</>
                      : <>↩ Unstake</>
                    }
                  </button>
                </div>
              </div>
            )
          })}

          {/* Footer: total + Unstake All */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-dark-700/40 border border-dark-600/50 rounded-xl mt-1">
            <span className="text-[13px] font-mono text-slate-400">Total Deployed</span>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-sm font-bold font-mono text-purple-400">τ{stakes.total_tao_value.toFixed(4)}</span>
                {taoPriceUsd != null && (
                  <span className="text-[11px] font-mono text-slate-500 ml-2">
                    ${(stakes.total_tao_value * taoPriceUsd).toFixed(2)}
                  </span>
                )}
              </div>
              <button
                onClick={handleUnstakeAll}
                disabled={unstakingAll || Object.values(unstaking).some(Boolean)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono transition-all border',
                  unstakingAll
                    ? 'bg-red-600/20 text-red-300 border-red-500/40 cursor-wait'
                    : 'bg-red-600/15 text-red-400 border-red-500/30 hover:bg-red-600/25 hover:border-red-500/60 active:scale-95'
                )}
              >
                {unstakingAll
                  ? <><RefreshCw size={10} className="animate-spin" /> Unstaking All…</>
                  : <>↩ Unstake All</>
                }
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500 text-xs font-mono space-y-1">
          <Layers size={22} className="mx-auto text-slate-700 mb-2" />
          <p>No open staking positions</p>
          <p className="text-slate-600">Positions appear here when the bot executes BUY trades</p>
        </div>
      )}
    </div>
  )
}