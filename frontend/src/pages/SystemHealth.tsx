/**
 * System Health
 * =============
 * Session XXXIV — observability foundation (Phase A of the new theme).
 *
 * Surfaces the system_health_service registry: every background loop's
 * status (healthy / stale / error / cold), last run timestamp, last
 * error message, run/success/error counts, and recent duration.
 *
 * Backend: GET /api/system/health → { summary, services[] }
 *
 * Refresh cadence: 5 s. Cheap call (in-memory dict serialisation).
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock,
  Heart, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'

// ─── Types (mirror backend schema) ───────────────────────────────────────────

type ServiceStatus = 'healthy' | 'stale' | 'error' | 'cold'

interface ServiceHealth {
  name:             string
  label:            string
  description:      string
  status:           ServiceStatus
  stale_after_s:    number
  registered_at:    string | null
  last_run_at:      string | null
  last_success_at:  string | null
  last_error_at:    string | null
  last_error:       string | null
  last_duration_ms: number | null
  run_count:        number
  success_count:    number
  error_count:      number
  age_seconds:      number | null
}

interface HealthSummary {
  total:          number
  healthy:        number
  stale:          number
  error:          number
  cold:           number
  uptime_seconds: number
  boot_at:        string | null
}

interface HealthResp {
  summary:  HealthSummary
  services: ServiceHealth[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAge(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds.toFixed(0)}s ago`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m ago`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h ago`
  return `${(seconds / 86400).toFixed(1)}d ago`
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function statusStyle(status: ServiceStatus): {
  badge: string
  dot: string
  Icon: any
  label: string
} {
  switch (status) {
    case 'healthy':
      return {
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        dot:   'bg-emerald-400',
        Icon:  CheckCircle2,
        label: 'HEALTHY',
      }
    case 'stale':
      return {
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        dot:   'bg-amber-400',
        Icon:  Clock,
        label: 'STALE',
      }
    case 'error':
      return {
        badge: 'bg-red-500/20 text-red-300 border-red-500/40',
        dot:   'bg-red-400',
        Icon:  XCircle,
        label: 'ERROR',
      }
    case 'cold':
    default:
      return {
        badge: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
        dot:   'bg-slate-500',
        Icon:  Activity,
        label: 'COLD',
      }
  }
}

// ─── Compact summary header strip ────────────────────────────────────────────

function SummaryStrip({ s }: { s: HealthSummary }) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-gradient-to-br from-slate-900/60 to-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-500/15 p-2">
            <Heart className="text-emerald-300" size={18} />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
              System health
            </div>
            <div className="text-2xl font-bold text-white">
              {s.healthy} / {s.total} <span className="text-xs font-mono text-slate-500">healthy</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
          <PillCount label="Healthy" count={s.healthy} cls="bg-emerald-500/10 text-emerald-300 border-emerald-500/30" />
          <PillCount label="Stale"   count={s.stale}   cls="bg-amber-500/10 text-amber-300 border-amber-500/30" />
          <PillCount label="Error"   count={s.error}   cls="bg-red-500/10 text-red-300 border-red-500/30" />
          <PillCount label="Cold"    count={s.cold}    cls="bg-slate-500/10 text-slate-400 border-slate-600/30" />
        </div>
        <div className="text-right">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
            Uptime
          </div>
          <div className="text-sm font-mono text-slate-200">{fmtUptime(s.uptime_seconds)}</div>
          <div className="text-[10px] font-mono text-slate-600">
            since {s.boot_at?.slice(0, 19).replace('T', ' ') ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

function PillCount({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className={clsx('rounded-md border px-2 py-1', cls)}>
      <span className="font-bold">{count}</span> <span className="opacity-70">{label}</span>
    </div>
  )
}

// ─── Service row ─────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const ss = statusStyle(svc.status)
  const Icon = ss.Icon
  const successRate =
    svc.run_count > 0 ? (svc.success_count / svc.run_count) * 100 : null

  return (
    <div
      className={clsx(
        'rounded-xl border bg-slate-900/40 p-4 transition-colors',
        svc.status === 'error'   && 'border-red-500/40',
        svc.status === 'stale'   && 'border-amber-500/30',
        svc.status === 'healthy' && 'border-slate-700/40',
        svc.status === 'cold'    && 'border-slate-700/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={clsx('h-2 w-2 rounded-full', ss.dot)} />
            <h4 className="font-bold text-white">{svc.label}</h4>
            <code className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              {svc.name}
            </code>
          </div>
          {svc.description && (
            <p className="mt-1 text-xs text-slate-400">{svc.description}</p>
          )}
        </div>
        <span
          className={clsx(
            'flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider',
            ss.badge,
          )}
        >
          <Icon size={10} /> {ss.label}
        </span>
      </div>

      {/* Metrics row */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono md:grid-cols-4">
        <div className="rounded-md bg-slate-800/40 px-2 py-1.5">
          <div className="text-slate-500">Last run</div>
          <div className="text-slate-200">{fmtAge(svc.age_seconds)}</div>
        </div>
        <div className="rounded-md bg-slate-800/40 px-2 py-1.5">
          <div className="text-slate-500">Duration</div>
          <div className="text-slate-200">
            {svc.last_duration_ms != null ? `${svc.last_duration_ms.toFixed(0)} ms` : '—'}
          </div>
        </div>
        <div className="rounded-md bg-slate-800/40 px-2 py-1.5">
          <div className="text-slate-500">Runs</div>
          <div className="text-slate-200">
            {svc.run_count}
            {successRate != null && (
              <span className="ml-1 text-slate-500">
                ({successRate.toFixed(1)}% ok)
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-slate-800/40 px-2 py-1.5">
          <div className="text-slate-500">Stale after</div>
          <div className="text-slate-200">{svc.stale_after_s}s</div>
        </div>
      </div>

      {/* Error detail */}
      {svc.last_error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <div className="font-mono uppercase tracking-wide text-red-400">
              Last error
            </div>
            <div className="mt-0.5 break-words font-mono text-red-200/90">
              {svc.last_error}
            </div>
            {svc.last_error_at && (
              <div className="mt-0.5 text-[10px] font-mono text-red-400/60">
                at {svc.last_error_at.slice(0, 19).replace('T', ' ')} UTC
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  const [data, setData] = useState<HealthResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true)
    try {
      const { data } = await api.get<HealthResp>('/system/health')
      setData(data)
      setErr(null)
    } catch (e: any) {
      const msg = e?.message || String(e)
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 5_000) // 5-s refresh
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white md:text-2xl">
            <Zap className="text-emerald-300" /> System Health
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Live heartbeat for every background loop. 5-second refresh.
            Built on the system_health registry pattern (Session XXXIV).
          </p>
        </div>
        <button
          onClick={() => {
            load().then(() => toast.success('Refreshed'))
          }}
          disabled={busy}
          className={clsx(
            'flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-mono text-slate-200 transition-colors',
            busy ? 'opacity-50' : 'hover:bg-slate-700/60',
          )}
        >
          <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      {data && <SummaryStrip s={data.summary} />}

      {/* Service cards */}
      {data && data.services.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.services.map((svc) => (
            <ServiceCard key={svc.name} svc={svc} />
          ))}
        </div>
      ) : data ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
          <Activity size={20} className="mx-auto mb-2 text-slate-600" />
          No services registered yet — registry is cold. Backend may still be
          booting; this view auto-refreshes every 5 seconds.
        </div>
      ) : err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-300">
          <XCircle size={20} className="mx-auto mb-2" />
          Failed to load /api/system/health: <span className="font-mono">{err}</span>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
          Loading…
        </div>
      )}
    </div>
  )
}