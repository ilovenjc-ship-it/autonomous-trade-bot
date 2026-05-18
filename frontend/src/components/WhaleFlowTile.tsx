/**
 * WhaleFlowTile — Session XXXVIII (final hour)
 * =============================================
 * Compact Dashboard tile that surfaces the live Whale Flow stream —
 * the direct-Finney-RPC stake event feed (DELEGATE / UNDELEGATE ≥ 100 τ
 * across all subnets). Sister tile to WhaleTrackerTile.tsx.
 *
 * Two surfaces sharing the Dashboard whale-row:
 *   • Whale Tracker = static top-100 holder leaderboard (positions)
 *   • Whale Flow    = live directional stake movement   (flow)
 *
 * Sized to mirror WhaleTrackerTile (rounded-xl / border / p-4 / KPI
 * mini-grid). Fed by /api/whale-flow/summary which returns net-flow
 * aggregates AND a top-3 inflow list ready to render.
 *
 * Soft-fails:
 *   - any error / empty response → silent retry, never blank
 *   - { connected: false } status → amber 'reconnecting' chip
 *
 * Click anywhere on a row → no-op for v1 (will deep-link to subnet
 * whale flow panel in Phase 2).
 */
import { useEffect, useState } from 'react'
import { Waves, ArrowDownLeft, ArrowUpRight, AlertTriangle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'

interface FlowEvent {
  id:               string
  block_number:     number
  timestamp:        string
  action:           'DELEGATE' | 'UNDELEGATE'
  direction:        'in' | 'out'
  nominator_ss58:   string
  amount_tao:       number
  amount_usd:       number
  netuid:           number
}

interface FlowSummary {
  netuid:           number | null
  window:           string
  gross_in_tao:     number
  gross_out_tao:    number
  net_flow_tao:     number
  gross_in_usd:     number
  gross_out_usd:    number
  net_flow_usd:     number
  unique_addresses: number
  event_count:      number
  top_inflows:      FlowEvent[]
  top_outflows:     FlowEvent[]
  fetched_at:       string
  stale?:           boolean
}

interface FlowStatus {
  connected:    boolean
  last_block:   number | null
  event_count:  number
  min_tao:      number
  last_error:   string | null
}

const fmtUsd = (n: number) =>
  n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(2) + 'M'
  : n >= 1_000   ? '$' + (n / 1_000).toFixed(1) + 'K'
  : '$' + n.toFixed(0)

const fmtTao = (n: number) =>
  n >= 1_000 ? (n / 1_000).toFixed(1) + 'K τ' : n.toFixed(1) + ' τ'

export default function WhaleFlowTile() {
  const [summary, setSummary] = useState<FlowSummary | null>(null)
  const [status,  setStatus]  = useState<FlowStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const [sumRes, statRes] = await Promise.all([
          // /whale-flow/summary supports window=1d|1w|1m. We use 1d for the
          // tile's "recent activity" view; full subnet panel uses 1w by default.
          api.get<FlowSummary>('/whale-flow/summary', { params: { window: '1d' } })
              .catch(() => api.get<FlowSummary>('/whale-flow/summary')),
          api.get<FlowStatus>('/whale-flow/status').catch(() => null),
        ])
        if (!dead) {
          setSummary(sumRes.data)
          setStatus(statRes?.data ?? null)
        }
      } catch {
        if (!dead) setSummary(null)
      } finally {
        if (!dead) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 30_000)   // 30s — fast tile, real-time feed
    return () => { dead = true; clearInterval(t) }
  }, [])

  const top = (summary?.top_inflows ?? [])
    .concat(summary?.top_outflows ?? [])
    .sort((a, b) => b.amount_tao - a.amount_tao)
    .slice(0, 3)

  const netFlowUsd  = summary?.net_flow_usd ?? 0
  const netFlowTao  = summary?.net_flow_tao ?? 0
  const netPositive = netFlowTao >= 0

  return (
    <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Waves size={14} className="text-accent-blue" />
          <h3 className="text-sm font-semibold text-white">Whale Flow</h3>
          <InfoBubble
            side="right"
            maxWidth={300}
            content={
              <div className="space-y-1.5">
                <p className="text-white font-bold text-[12px]">Live Stake Flow Stream</p>
                <p>
                  Direct subscription to Finney mainnet (every finalized block,
                  ~12s). Captures DELEGATE / UNDELEGATE events ≥ 100 τ across
                  all 200+ subnets. Net flow shows directional pressure: positive
                  = whales accumulating, negative = whales unwinding.
                </p>
                <p className="text-slate-300 text-[11px]">
                  <span className="text-emerald-400">↘ DELEGATE</span> = stake added ·{' '}
                  <span className="text-red-400">↗ UNDELEGATE</span> = stake removed
                </p>
                <p className="text-slate-400 text-[10.5px] border-t border-slate-700/50 pt-1">
                  Sourced from chain RPC (zero subscription cost). Distinct from
                  Whale Tracker, which shows static top-N holder positions.
                </p>
              </div>
            }
          />
        </div>
        <div className="flex items-center gap-1.5">
          {status?.connected === false ? (
            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              reconnecting
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              live · 30s
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-xs font-mono py-6 justify-center">
          <RefreshCw size={12} className="animate-spin" /> Loading whale flow…
        </div>
      )}

      {/* Empty / hard error */}
      {!loading && (!summary || (summary.event_count ?? 0) === 0) && (
        <div className="text-slate-500 text-xs font-mono py-6 text-center">
          {status?.connected
            ? `Listening on block ${status.last_block ?? '—'} · no whales ≥ ${status?.min_tao ?? 100} τ yet`
            : 'Whale flow warming up…'}
        </div>
      )}

      {/* Top 3 events */}
      {!loading && top.length > 0 && (
        <>
          <div className="space-y-1.5 mb-3">
            {top.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs font-mono">
                {e.direction === 'in' ? (
                  <ArrowDownLeft size={11} className="text-emerald-400 flex-shrink-0" />
                ) : (
                  <ArrowUpRight size={11} className="text-red-400 flex-shrink-0" />
                )}
                <span className="text-slate-500 w-12 flex-shrink-0">SN{e.netuid}</span>
                <span className="text-slate-200 flex-1 truncate">{e.nominator_ss58}</span>
                <span className={clsx('flex-shrink-0', e.direction === 'in' ? 'text-emerald-400' : 'text-red-400')}>
                  {fmtTao(e.amount_tao)}
                </span>
                {e.amount_usd > 0 && (
                  <span className="text-slate-500 flex-shrink-0 w-12 text-right">
                    {fmtUsd(e.amount_usd)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* KPI strip — net flow + counts + addresses */}
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Net flow</div>
              <div className={clsx(
                'font-bold',
                netPositive ? 'text-emerald-400' : 'text-red-400',
              )}>
                {netPositive ? '+' : ''}{netFlowTao.toFixed(0)} τ
              </div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Net USD</div>
              <div className={clsx(
                'font-bold',
                netPositive ? 'text-emerald-400' : 'text-red-400',
              )}>
                {netPositive ? '+' : ''}{fmtUsd(netFlowUsd)}
              </div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Events</div>
              <div className="text-slate-200 font-bold">{summary?.event_count ?? 0}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Wallets</div>
              <div className="text-accent-blue font-bold">{summary?.unique_addresses ?? 0}</div>
            </div>
          </div>

          {/* Stale warning */}
          {summary?.stale && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-amber-300/80 bg-amber-950/30 border border-amber-800/30 rounded px-2 py-1">
              <AlertTriangle size={10} />
              Feed stale · check chain connection
            </div>
          )}
        </>
      )}
    </div>
  )
}