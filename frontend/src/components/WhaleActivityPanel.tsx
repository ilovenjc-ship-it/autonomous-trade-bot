/**
 * WhaleActivityPanel — Phase 1 (Session XXXVII)
 * ──────────────────────────────────────────────
 * Per-subnet feed of large stake / unstake events.
 *
 * Inspired by the Talisman wallet's "Whale Activity" right-rail panel
 * (Mav screenshot, 2026-05-17). Backed by our own service that polls
 * TaoStats /api/delegation/v1 — same chain data, free integration,
 * replaces the value of the $50/mo TaoStats Standard tier.
 *
 * Props
 *   netuid?: number   — filter to one subnet; omit for global feed
 *   limit?:  number   — default 12 rows
 *   className?: string
 *
 * Behavior
 *   - Polls /api/whale-flow/{netuid?}            every 30 s
 *   - Polls /api/whale-flow/{netuid?}/summary    every 30 s
 *   - 1D / 1W / 1M segmented toggle (defaults 1W to match Talisman)
 *   - Net flow bar: red (out) / green (in) with τ totals on each end
 *   - Empty state, loading state, "configured=false" setup CTA
 *   - Ping-pong badge when summary.pingpong_pairs > 0
 */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Waves, Info, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── types ────────────────────────────────────────────────────────────────────
type Window = '1d' | '1w' | '1m'

interface WhaleEvent {
  id: string
  block_number: number
  timestamp: string
  ts_unix: number
  action: 'DELEGATE' | 'UNDELEGATE'
  direction: 'in' | 'out'
  nominator_ss58: string
  nominator_full: string
  delegate_ss58: string
  delegate_full: string
  amount_tao: number
  amount_usd: number
  netuid: number
  extrinsic_id: string
}

interface ListResp {
  events: WhaleEvent[]
  total: number
  netuid: number | null
  window: Window
  min_tao: number
  fetched_at: string | null
  stale: boolean
  configured: boolean
}

interface Summary {
  netuid: number | null
  window: Window
  gross_in_tao: number
  gross_out_tao: number
  net_flow_tao: number
  gross_in_usd: number
  gross_out_usd: number
  net_flow_usd: number
  unique_addresses: number
  event_count: number
  top_inflows: WhaleEvent[]
  top_outflows: WhaleEvent[]
  pingpong_pairs: number
  min_tao: number
}

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTao(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M τ`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K τ`
  if (n >= 100)       return `${n.toFixed(0)} τ`
  return `${n.toFixed(1)} τ`
}
function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(0)}`
}
function timeAgo(unix: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unix))
  if (diff < 60)         return `${diff}s ago`
  if (diff < 3_600)      return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400)     return `${Math.floor(diff / 3_600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

// Derive a stable little gradient avatar from the address hex — matches
// Talisman's per-address coloured-disc convention without pulling in a
// hash library.
function avatarColors(addr: string): [string, string] {
  if (!addr) return ['#475569', '#1e293b']
  let h1 = 0, h2 = 0
  for (let i = 0; i < addr.length; i++) {
    const c = addr.charCodeAt(i)
    h1 = (h1 * 31 + c) >>> 0
    h2 = (h2 * 17 + c) >>> 0
  }
  const hue1 = h1 % 360
  const hue2 = (hue1 + 60 + (h2 % 80)) % 360
  return [`hsl(${hue1} 70% 55%)`, `hsl(${hue2} 70% 38%)`]
}

// ── window pill ──────────────────────────────────────────────────────────────
function WindowToggle({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  const opts: Window[] = ['1d', '1w', '1m']
  return (
    <div className="inline-flex bg-dark-700 border border-dark-500 rounded-md p-0.5">
      {opts.map(w => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={clsx(
            'px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide rounded transition-colors',
            value === w
              ? 'bg-accent-blue/25 text-accent-blue'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {w}
        </button>
      ))}
    </div>
  )
}

// ── flow bar ─────────────────────────────────────────────────────────────────
function NetFlowBar({ inTao, outTao }: { inTao: number; outTao: number }) {
  const total = inTao + outTao
  if (total <= 0) {
    return (
      <div className="h-1.5 bg-dark-700 rounded-full" />
    )
  }
  const inPct  = (inTao  / total) * 100
  const outPct = (outTao / total) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-red-400">{fmtTao(outTao)}</span>
        <span className="text-accent-green">{fmtTao(inTao)}</span>
      </div>
      <div className="h-1.5 flex bg-dark-700 rounded-full overflow-hidden">
        <div className="h-full bg-red-500/80"      style={{ width: `${outPct}%` }} />
        <div className="h-full bg-accent-green/80" style={{ width: `${inPct}%`  }} />
      </div>
    </div>
  )
}

// ── event row ────────────────────────────────────────────────────────────────
function EventRow({ ev }: { ev: WhaleEvent }) {
  const [c1, c2] = avatarColors(ev.nominator_full)
  const isIn = ev.direction === 'in'
  return (
    <div className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-dark-700/40 transition-colors">
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 border border-dark-500"
        style={{ background: `radial-gradient(circle at 30% 30%, ${c1}, ${c2})` }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono text-slate-200 truncate" title={ev.nominator_full}>
          {ev.nominator_ss58 || '—'}
        </p>
        <p className="text-[10px] font-mono text-slate-500">
          {timeAgo(ev.ts_unix)}
          {ev.netuid !== undefined && (
            <span className="ml-1 text-slate-600">· SN{ev.netuid}</span>
          )}
        </p>
      </div>
      <div className="text-right">
        <p
          className={clsx(
            'text-xs font-mono font-semibold',
            isIn ? 'text-accent-green' : 'text-red-400',
          )}
        >
          {isIn ? '+' : '−'} {fmtTao(ev.amount_tao)}
        </p>
        <p className="text-[10px] font-mono text-slate-500">{fmtUsd(ev.amount_usd)}</p>
      </div>
    </div>
  )
}

// ── main panel ───────────────────────────────────────────────────────────────
export default function WhaleActivityPanel({
  netuid,
  limit = 12,
  className,
}: {
  netuid?: number
  limit?: number
  className?: string
}) {
  const [windowSel, setWindowSel] = useState<Window>('1w')
  const [resp, setResp]           = useState<ListResp | null>(null)
  const [summary, setSummary]     = useState<Summary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)

  const path = useMemo(() => {
    return netuid !== undefined ? `/whale-flow/${netuid}` : '/whale-flow'
  }, [netuid])
  const summaryPath = useMemo(() => {
    return netuid !== undefined ? `/whale-flow/${netuid}/summary` : '/whale-flow/summary'
  }, [netuid])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [eRes, sRes] = await Promise.all([
          api.get(path,        { params: { window: windowSel, limit } }),
          api.get(summaryPath, { params: { window: windowSel } }),
        ])
        if (cancelled) return
        setResp(eRes.data as ListResp)
        setSummary(sRes.data as Summary)
        setErr(null)
      } catch (e: any) {
        if (cancelled) return
        setErr(e?.message || 'Failed to load whale flow')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    setLoading(true)
    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [path, summaryPath, windowSel, limit])

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className={clsx(
      'bg-dark-800 border border-dark-600 rounded-xl overflow-hidden',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-blue/15 border border-accent-blue/30 flex items-center justify-center">
            <Waves size={13} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm leading-tight">Whale Activity</h3>
            <p className="text-[10px] text-slate-500 font-mono">
              {netuid !== undefined ? `SN${netuid}` : 'All subnets'} · ≥ {summary?.min_tao ?? resp?.min_tao ?? 100} τ
            </p>
          </div>
        </div>
        <WindowToggle value={windowSel} onChange={setWindowSel} />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">

        {/* Setup CTA when no API key */}
        {resp && !resp.configured && (
          <div className="flex items-start gap-2.5 bg-yellow-500/8 border border-yellow-500/25 rounded-lg px-3 py-2.5">
            <Info size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-yellow-200 font-mono mb-0.5">TaoStats key not configured</p>
              <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                Set <span className="text-slate-200">TAOSTATS_API_KEY</span> (free tier) to start the whale-flow ingest. We piggyback on the same delegation-events endpoint Talisman uses — no paid tier needed.
              </p>
            </div>
          </div>
        )}

        {/* Net flow bar + meta line */}
        {summary && resp?.configured && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Whale Trade Flow</p>
              <p className={clsx(
                'text-[10px] font-mono',
                summary.net_flow_tao > 0 ? 'text-accent-green'
                  : summary.net_flow_tao < 0 ? 'text-red-400'
                  : 'text-slate-400',
              )}>
                Net {summary.net_flow_tao >= 0 ? '+' : ''}{fmtTao(summary.net_flow_tao)}
              </p>
            </div>
            <NetFlowBar inTao={summary.gross_in_tao} outTao={summary.gross_out_tao} />
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>{summary.event_count} event{summary.event_count === 1 ? '' : 's'} · {summary.unique_addresses} address{summary.unique_addresses === 1 ? '' : 'es'}</span>
              {summary.pingpong_pairs > 0 && (
                <span
                  className="flex items-center gap-1 text-amber-400"
                  title="Same address moved equal amounts in opposite directions within 60 s — likely wallet rebalance, not directional conviction"
                >
                  <AlertCircle size={9} />
                  {summary.pingpong_pairs} ping-pong
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stale banner */}
        {resp?.stale && resp.configured && (
          <p className="text-[10px] font-mono text-amber-400/80 italic">
            Showing cached data — last fetch was &gt; 10 min ago
          </p>
        )}

        {/* Events list */}
        <div className="border-t border-dark-700 -mx-4 px-4 pt-1">
          {loading && !resp ? (
            <div className="flex items-center justify-center py-6 text-slate-500 text-xs font-mono">
              <RefreshCw size={12} className="animate-spin mr-2" />
              Loading whale events…
            </div>
          ) : err ? (
            <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/25 rounded-lg px-3 py-2.5">
              <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-300 font-mono">{err}</p>
            </div>
          ) : !resp || resp.events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-dark-700 border border-dark-600 flex items-center justify-center mb-2">
                <Waves size={14} className="text-slate-500" />
              </div>
              <p className="text-xs text-slate-400 font-mono">
                No whales active in the last {windowSel}
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Threshold: ≥ {summary?.min_tao ?? resp?.min_tao ?? 100} τ
              </p>
            </div>
          ) : (
            <div className="divide-y divide-dark-700/60">
              {resp.events.map(ev => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </div>
          )}
        </div>

        {/* Footer attribution */}
        {resp?.configured && (
          <p className="text-[9px] font-mono text-slate-600 text-center pt-1 leading-relaxed">
            Sourced from TaoStats <code className="text-slate-500">/api/delegation/v1</code>
            {summary && summary.event_count > 0 && (
              <span className="text-slate-700"> · {fmtUsd(summary.gross_in_usd + summary.gross_out_usd)} gross moved</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}