/**
 * WhaleFlowTile — Session XXXVIII (final hour) · upgraded XXXIX (Day 6)
 * =====================================================================
 * Compact Dashboard tile that surfaces the live Whale Flow stream —
 * the direct-Finney-RPC stake event feed (DELEGATE / UNDELEGATE ≥ 100 τ
 * across all subnets).
 *
 * XXXIX changes (Mark, Day 6):
 *   • Whale Tracker tile retired — Whale Flow is now the canonical
 *     dashboard whale surface (sentiment + flow, 2-up).
 *   • Switched from "top 3 single events" to "chronological recent feed"
 *     so all flow visible at a glance, with overflow scroll.
 *   • Click any row → opens WhaleFlowDetailModal with full event detail
 *     (full SS58, block number, USD value, Taostats deep links).
 *
 * Two endpoints fetched in parallel:
 *   • /api/whale-flow?window=1d&limit=20  → newest-first event feed
 *   • /api/whale-flow/summary?window=1d   → KPI aggregates (net flow etc.)
 *
 * Soft-fails:
 *   - any error / empty response → silent retry, never blank
 *   - { connected: false } status → amber 'reconnecting' chip
 */
import { useEffect, useState } from 'react'
import { Waves, ArrowDownLeft, ArrowUpRight, AlertTriangle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'
import WhaleFlowDetailModal, { type WhaleFlowEvent } from '@/components/WhaleFlowDetailModal'

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
  fetched_at:       string
  stale?:           boolean
}

interface FlowListResp {
  events:     WhaleFlowEvent[]
  total:      number
  netuid:     number | null
  window:     string
  min_tao:    number
  fetched_at: string
  stale:      boolean
  configured: boolean
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
  const [events,  setEvents]  = useState<WhaleFlowEvent[]>([])
  const [summary, setSummary] = useState<FlowSummary | null>(null)
  const [status,  setStatus]  = useState<FlowStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<WhaleFlowEvent | null>(null)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const [listRes, sumRes, statRes] = await Promise.all([
          // Chronological newest-first feed for the row list. limit=50
          // gives plenty of scroll depth — list container is flex-1 so
          // visible-row count auto-adapts to the tile's actual height.
          api.get<FlowListResp>('/whale-flow', { params: { window: '1d', limit: 50 } })
              .catch(() => null),
          // KPI aggregates for the bottom strip.
          api.get<FlowSummary>('/whale-flow/summary', { params: { window: '1d' } })
              .catch(() => api.get<FlowSummary>('/whale-flow/summary')),
          api.get<FlowStatus>('/whale-flow/status').catch(() => null),
        ])
        if (!dead) {
          setEvents(listRes?.data?.events ?? [])
          setSummary(sumRes?.data ?? null)
          setStatus(statRes?.data ?? null)
        }
      } catch {
        if (!dead) {
          setEvents([])
          setSummary(null)
        }
      } finally {
        if (!dead) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 30_000)   // 30s — fast tile, real-time feed
    return () => { dead = true; clearInterval(t) }
  }, [])

  const netFlowUsd  = summary?.net_flow_usd ?? 0
  const netFlowTao  = summary?.net_flow_tao ?? 0
  const netPositive = netFlowTao >= 0

  return (
    <>
      {/* h-full + flex column → tile stretches to match the Sentiment tile's
          height (CSS Grid items-stretch default), and the events list grows
          to fill whatever vertical space remains after header/KPI-strip.
          Session XXXIX (Day 6) follow-up: Mark — 'extend the data entries
          to fill the section'. List has max-h cap to prevent runaway growth
          (h-full + flex-1 + tall list = circular height cascade if both
          siblings use h-full, which Sentiment does). 360px ≈ 16 rows, plenty. */}
      <div className="rounded-xl border border-dark-600 bg-dark-800 p-4 h-full flex flex-col">
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
                    Click any row for full transaction detail (block, USD value,
                    full coldkey, Taostats deep link). Sourced from chain RPC —
                    zero subscription cost.
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
          <div className="flex-1 flex items-center gap-2 text-slate-500 text-xs font-mono py-6 justify-center">
            <RefreshCw size={12} className="animate-spin" /> Loading whale flow…
          </div>
        )}

        {/* Empty / hard error */}
        {!loading && events.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono py-6 text-center">
            {status?.connected
              ? `Listening on block ${status.last_block ?? '—'} · no whales ≥ ${status?.min_tao ?? 100} τ yet`
              : 'Whale flow warming up…'}
          </div>
        )}

        {/* Event list — chronological, scrollable, click for detail.
            flex-1 + min-h-0 lets the list expand to fill remaining tile
            height regardless of how tall the sibling tile (Sentiment) is. */}
        {!loading && events.length > 0 && (
          <>
            <div
              className="flex-1 min-h-0 space-y-1 mb-3 overflow-y-auto pr-1 -mr-1
                         [&::-webkit-scrollbar]:w-1.5
                         [&::-webkit-scrollbar-track]:bg-transparent
                         [&::-webkit-scrollbar-thumb]:bg-dark-600
                         [&::-webkit-scrollbar-thumb]:rounded-full
                         hover:[&::-webkit-scrollbar-thumb]:bg-dark-500"
              style={{ maxHeight: 360 }}
            >
              {events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="w-full flex items-center gap-2 text-xs font-mono px-2 py-1
                             rounded-md hover:bg-dark-700/50 active:bg-dark-700
                             transition-colors group text-left"
                  title="Click for full transaction detail"
                >
                  {e.direction === 'in' ? (
                    <ArrowDownLeft size={11} className="text-emerald-400 flex-shrink-0" />
                  ) : (
                    <ArrowUpRight size={11} className="text-red-400 flex-shrink-0" />
                  )}
                  <span className="text-slate-500 w-12 flex-shrink-0 group-hover:text-slate-400">
                    SN{e.netuid}
                  </span>
                  <span className="text-slate-200 flex-1 truncate group-hover:text-white">
                    {e.nominator_ss58}
                  </span>
                  <span
                    className={clsx(
                      'flex-shrink-0 tabular-nums',
                      e.direction === 'in' ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {fmtTao(e.amount_tao)}
                  </span>
                  {e.amount_usd > 0 && (
                    <span className="text-slate-500 flex-shrink-0 w-14 text-right tabular-nums group-hover:text-slate-400">
                      {fmtUsd(e.amount_usd)}
                    </span>
                  )}
                </button>
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
                <div className="text-slate-200 font-bold">{summary?.event_count ?? events.length}</div>
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

      {/* Detail modal — portal, sits over everything */}
      <WhaleFlowDetailModal event={selected} onClose={() => setSelected(null)} />
    </>
  )
}