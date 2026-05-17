/**
 * CycleStatusBar — Session XXXV
 * =============================
 * The "RUNNING — Cycle #N · Next cycle in Xs · Y strategies active" pill
 * that used to live on the Dashboard. Mav relocated it to the OpenClaw
 * page (below the BFT explainer) and to the top of the Strategies page.
 *
 * Self-contained: subscribes to the bot store (already polled globally
 * from Layout.tsx every 15s) and runs its own 1-second clock for the
 * "next cycle in Xs" countdown.
 *
 * Drop-in usage:
 *
 *     <CycleStatusBar />
 *
 * Optional `chainSlot` prop overrides the right-side context note —
 * defaults to a chain-connected / paper-trading status string.
 */
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import clsx from 'clsx'
import { useBotStore } from '@/store/botStore'
import api from '@/api/client'

interface Props {
  /** Optional override for the right-side context label (chain / paper / etc.) */
  chainSlot?: React.ReactNode
}

export default function CycleStatusBar({ chainSlot }: Props) {
  const status      = useBotStore((s) => s.status)
  const isRunning   = status?.is_running ?? false
  const cycleN      = (status as any)?.cycle_number ?? 0
  const interval    = (status as any)?.cycle_interval ?? status?.trade_interval ?? 60

  // 1-second tick for "next cycle in Xs" countdown
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const secInCycle = tick % interval
  const secToNext  = interval - secInCycle

  // Active strategy count — small dedicated poll (cheap; cached upstream)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  useEffect(() => {
    let dead = false
    const fetchSummary = () =>
      api.get('/analytics/summary').then((r) => {
        if (!dead) setActiveCount(r.data?.active_strategies ?? null)
      }).catch(() => {})
    fetchSummary()
    const t = setInterval(fetchSummary, 30_000)
    return () => { dead = true; clearInterval(t) }
  }, [])

  // Default chain status — overridable
  const chainConnected = (status as any)?.network_connected ?? false
  const defaultChain = chainConnected
    ? <span className="text-indigo-400">⛓ CHAIN CONNECTED · Finney mainnet</span>
    : <span>⚠ Paper trading — OpenClaw gates LIVE execution</span>

  return (
    <div className={clsx(
      'flex items-center gap-3 px-4 py-2.5 rounded-xl border font-mono text-xs',
      isRunning
        ? 'bg-accent-green/5 border-accent-green/20'
        : 'bg-dark-800 border-dark-600'
    )}>
      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
        isRunning ? 'bg-accent-green run-pulse' : 'bg-slate-600')} />
      <span className={isRunning ? 'text-accent-green' : 'text-slate-300'}>
        {isRunning ? `RUNNING — Cycle #${cycleN}` : 'STOPPED'}
      </span>
      {isRunning && (
        <>
          <span className="text-slate-300">·</span>
          <Clock size={11} className="text-slate-300" />
          <span className="text-slate-300">Next cycle in {secToNext}s</span>
          {activeCount != null && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-300">{activeCount} strategies active</span>
            </>
          )}
        </>
      )}
      <span className="ml-auto text-slate-300 font-mono text-[13px]">
        {chainSlot ?? defaultChain}
      </span>
    </div>
  )
}