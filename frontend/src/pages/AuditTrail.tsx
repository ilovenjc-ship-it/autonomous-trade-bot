/**
 * Audit Trail
 * ===========
 * Session XXXIV — observability hardening (Phase B).
 *
 * Append-only log of every operationally-meaningful mutation in the
 * system: risk-config changes, bot start/stop/override, gate
 * promotions/demotions, CEX listing detections, subnet owner changes.
 *
 * Backend: GET /api/audit/log[?limit&action&category&actor]
 *
 * Visual language: matches AlertInbox / ActivityLog (dense rows,
 * category chip, expandable JSON diff).
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ScrollText, RefreshCw, Filter, ChevronDown, ChevronRight,
  Settings, Power, Bot as BotIcon, Bell, AlertTriangle,
  CheckCircle2, XCircle, Eraser,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { fmtETDateTime } from '@/lib/time'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:        number
  timestamp: string
  action:    string
  actor:     string
  category:  string
  before:    unknown
  after:     unknown
  metadata:  Record<string, unknown>
}

interface AuditSummary {
  buffered:       number
  buffer_max:     number
  lifetime_total: number
  by_category:    Record<string, number>
  log_path:       string
  log_exists:     boolean
}

interface AuditResp {
  entries: AuditEntry[]
  summary: AuditSummary
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; cls: string; Icon: any }> = {
  config:    { label: 'Config',    cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30', Icon: Settings },
  lifecycle: { label: 'Lifecycle', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',       Icon: Power },
  trading:   { label: 'Trading',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: BotIcon },
  alert:     { label: 'Alert',     cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',    Icon: Bell },
  system:    { label: 'System',    cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',    Icon: AlertTriangle },
}

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META.system
}

function fmtTimestamp(iso: string): string {
  // Day 12: render in Eastern Time (America/New_York).
  return fmtETDateTime(iso, { seconds: true, year: true })
}

function actionPretty(action: string): string {
  // turn "risk_config_update" into "Risk Config Update"
  return action
    .split(/[:_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// ─── Diff renderer ───────────────────────────────────────────────────────────

function DiffPanel({ before, after }: { before: unknown; after: unknown }) {
  const beforeIsObj = before && typeof before === 'object' && !Array.isArray(before)
  const afterIsObj  = after  && typeof after  === 'object' && !Array.isArray(after)

  if (beforeIsObj && afterIsObj) {
    const b = before as Record<string, unknown>
    const a = after  as Record<string, unknown>
    const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort()
    return (
      <div className="overflow-hidden rounded-md border border-slate-700/50">
        <table className="w-full text-xs">
          <thead className="bg-slate-800/60 text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 py-1 text-left">Field</th>
              <th className="px-2 py-1 text-left">Before</th>
              <th className="px-2 py-1 text-left">After</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map(k => {
              const bv = b[k]
              const av = a[k]
              const changed = JSON.stringify(bv) !== JSON.stringify(av)
              return (
                <tr key={k} className="border-t border-slate-800/40">
                  <td className="px-2 py-1 font-mono text-slate-300">{k}</td>
                  <td className={clsx(
                    'px-2 py-1 font-mono',
                    changed ? 'text-red-300/90 line-through' : 'text-slate-500',
                  )}>
                    {formatDiffValue(bv)}
                  </td>
                  <td className={clsx(
                    'px-2 py-1 font-mono',
                    changed ? 'text-emerald-300/90' : 'text-slate-500',
                  )}>
                    {formatDiffValue(av)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Non-object before/after — render side-by-side <pre>s
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
        <div className="mb-1 text-[10px] font-mono uppercase text-slate-500">Before</div>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-300/80">
          {formatDiffValue(before)}
        </pre>
      </div>
      <div className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
        <div className="mb-1 text-[10px] font-mono uppercase text-slate-500">After</div>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-emerald-300/80">
          {formatDiffValue(after)}
        </pre>
      </div>
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AuditRow({ e }: { e: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const meta = categoryMeta(e.category)
  const Icon = meta.Icon
  const hasDiff =
    e.before !== null && e.before !== undefined ||
    e.after  !== null && e.after  !== undefined
  const hasMetadata =
    e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata).length > 0

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900/30">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-800/30"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {open ? (
            <ChevronDown size={14} className="flex-shrink-0 text-slate-500" />
          ) : (
            <ChevronRight size={14} className="flex-shrink-0 text-slate-500" />
          )}
          <span className={clsx('flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase', meta.cls)}>
            <Icon size={10} />
            {meta.label}
          </span>
          <span className="text-sm font-semibold text-white">
            {actionPretty(e.action)}
          </span>
          <code className="truncate font-mono text-[11px] text-slate-500">
            by {e.actor}
          </code>
        </div>
        <span className="flex-shrink-0 font-mono text-[11px] text-slate-500">
          {fmtTimestamp(e.timestamp)}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-800/40 p-3">
          {hasDiff ? (
            <DiffPanel before={e.before} after={e.after} />
          ) : (
            <div className="text-xs text-slate-500">No before/after payload.</div>
          )}
          {hasMetadata && (
            <div className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
              <div className="mb-1 text-[10px] font-mono uppercase text-slate-500">Metadata</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-400">
                {formatDiffValue(e.metadata)}
              </pre>
            </div>
          )}
          <div className="text-[10px] font-mono text-slate-600">
            ID #{e.id} · raw action: <code>{e.action}</code>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AuditTrail() {
  const [data, setData] = useState<AuditResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('')
  // Day 16 #13 — soft-reset (Read A) state.
  // The dialog asks for an optional reason that will be stamped onto the
  // tombstone audit event, so forensic readers can answer "why was this
  // buffer cleared at 02:13 EDT?" without guessing.
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetReason,     setResetReason]     = useState('')
  const [resetting,       setResetting]       = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true)
    try {
      const params: Record<string, string | number> = { limit: 500 }
      if (filterCategory) params.category = filterCategory
      const { data } = await api.get<AuditResp>('/audit/log', { params })
      setData(data)
      setErr(null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [filterCategory])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 10_000)
    return () => clearInterval(id)
  }, [load])

  // Day 16 #13 — soft-reset handler.
  // POSTs to /api/audit/clear-buffer with an optional reason, then
  // refreshes the page so the new tombstone-only state shows up
  // immediately (the buffer now contains exactly one entry: the
  // 'audit_buffer_clear' event we just wrote).
  const handleClearBuffer = useCallback(async () => {
    setResetting(true)
    try {
      const { data: payload } = await api.post<{ ok: boolean; cleared_buffered: number; tombstone_id: number | null; lifetime_total: number; log_preserved: boolean }>(
        '/audit/clear-buffer',
        { reason: resetReason.trim() },
      )
      if (payload?.ok) {
        toast.success(
          `Buffer cleared (${payload.cleared_buffered} entries) · disk log preserved`,
          { duration: 4500 },
        )
        setResetDialogOpen(false)
        setResetReason('')
        await load(true)
      } else {
        toast.error('Reset call returned ok=false; see backend logs')
      }
    } catch (e: any) {
      toast.error(`Reset failed: ${e?.message || String(e)}`)
    } finally {
      setResetting(false)
    }
  }, [resetReason, load])

  const categories = useMemo(() => {
    const cats = data?.summary.by_category ?? {}
    return Object.keys(CATEGORY_META).filter(k => (cats[k] ?? 0) > 0 || k === filterCategory)
  }, [data, filterCategory])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white md:text-2xl">
            <ScrollText className="text-amber-300" /> Audit Trail
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Append-only record of every operator + system mutation. Persisted to disk on the Railway volume.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Day 16 #13 — Soft-reset CTA. Read A: clears the active queue
              while preserving the JSONL on disk. Amber styling so it
              reads as a destructive-but-recoverable action; the actual
              click opens a confirmation dialog with an optional reason
              field (the reason is stamped onto the tombstone audit
              event for forensic clarity). */}
          <button
            onClick={() => setResetDialogOpen(true)}
            disabled={busy || resetting}
            className={clsx(
              'flex items-center gap-1.5 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-1.5 text-xs font-mono text-amber-300 transition-colors',
              (busy || resetting) ? 'opacity-50' : 'hover:bg-amber-500/20 hover:border-amber-500/60',
            )}
            title="Soft-reset the in-memory buffer · disk JSONL preserved"
          >
            <Eraser size={11} /> Soft-reset
          </button>
          <button
            onClick={() => load().then(() => toast.success('Refreshed'))}
            disabled={busy}
            className={clsx(
              'flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-mono text-slate-200 transition-colors',
              busy ? 'opacity-50' : 'hover:bg-slate-700/60',
            )}
          >
            <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            <span className="text-amber-300 font-bold">{data.summary.buffered}</span> buffered
            <span className="mx-1.5 text-slate-700">·</span>
            <span className="text-slate-200">{data.summary.lifetime_total.toLocaleString()}</span> lifetime
            <span className="mx-1.5 text-slate-700">·</span>
            <span className="text-slate-500">cap {data.summary.buffer_max}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterCategory('')}
              className={clsx(
                'rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
                filterCategory === ''
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500',
              )}
            >
              All
            </button>
            {categories.map(cat => {
              const m = categoryMeta(cat)
              const count = data.summary.by_category[cat] ?? 0
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={clsx(
                    'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
                    filterCategory === cat ? m.cls : 'border-slate-700 text-slate-400 hover:border-slate-500',
                  )}
                >
                  {m.label} <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
          <div className="ml-auto text-[10px] font-mono text-slate-600">
            <Filter size={10} className="inline mr-1 -mt-px" />
            disk: {data.summary.log_exists ? '✓' : '⚠ cold'} ·{' '}
            <code className="text-slate-500">{data.summary.log_path}</code>
          </div>
        </div>
      )}

      {/* Entries */}
      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          <XCircle size={16} className="mb-1 inline" /> Failed to load /api/audit/log: {err}
        </div>
      )}
      {data && data.entries.length > 0 ? (
        <div className="space-y-2">
          {data.entries.map(e => (
            <AuditRow key={e.id} e={e} />
          ))}
        </div>
      ) : data ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-6 text-center text-sm text-slate-400">
          <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-500/60" />
          No audit entries yet — the trail starts the first time the operator changes a setting, the bot starts/stops, or a high-stakes alert fires.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
          Loading…
        </div>
      )}

      {/* Day 16 #13 — Soft-reset confirmation dialog. Modal-ish overlay,
          explicit copy explaining what is and is not preserved, optional
          reason field, two-button footer. The reason is sent to the
          backend and stamped onto the tombstone event's metadata. */}
      {resetDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !resetting && setResetDialogOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-reset-dialog-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-600/40 bg-[#0d1525] p-5 shadow-2xl shadow-amber-500/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <Eraser size={18} className="text-amber-400" />
              <h2 id="audit-reset-dialog-title" className="text-base font-bold text-white">
                Soft-reset the audit buffer?
              </h2>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                This clears the in-memory <span className="text-amber-300">active queue</span>
                {' '}you see on this page. The disk log
                {' '}<code className="text-slate-400">{data?.summary.log_path ?? 'audit_log.jsonl'}</code>
                {' '}is <span className="text-emerald-400 font-semibold">preserved</span> — every
                entry the system has ever recorded stays on disk for forensic readers.
              </p>
              <p className="text-xs text-slate-400">
                A tombstone event (<code>audit_buffer_clear</code>) is automatically appended to
                the disk log and seeded into the cleared buffer, so the timeline of resets is
                itself auditable.
              </p>
              <div>
                <label htmlFor="audit-reset-reason" className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Reason (optional)
                </label>
                <input
                  id="audit-reset-reason"
                  type="text"
                  value={resetReason}
                  onChange={e => setResetReason(e.target.value)}
                  disabled={resetting}
                  placeholder="e.g. EOD reset · weekly housekeeping"
                  maxLength={300}
                  className="w-full rounded-md border border-slate-600/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setResetDialogOpen(false)}
                disabled={resetting}
                className="rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-mono text-slate-200 hover:bg-slate-700/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearBuffer}
                disabled={resetting}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md border border-amber-600/50 bg-amber-500/15 px-3 py-1.5 text-xs font-mono text-amber-200 transition-colors',
                  resetting ? 'opacity-60 cursor-wait' : 'hover:bg-amber-500/25 hover:border-amber-500/70',
                )}
              >
                {resetting ? (
                  <><RefreshCw size={11} className="animate-spin" /> Clearing…</>
                ) : (
                  <><Eraser size={11} /> Clear buffer · keep disk</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}