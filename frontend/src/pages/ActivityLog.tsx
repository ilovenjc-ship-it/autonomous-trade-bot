import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Activity, RefreshCw, Filter, ArrowUpCircle,
  CheckCircle2, AlertTriangle, Zap, Radio, TrendingUp,
  Webhook, Plus, Trash2, Send, X, Copy, ChevronDown,
  Shield, Globe, Slack, Check, Eye, EyeOff, ExternalLink,
  Settings2, ToggleLeft, ToggleRight, Info,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { useBotStore } from '@/store/botStore'

// ── types ─────────────────────────────────────────────────────────────────────
interface Event {
  id: string | number
  kind: 'trade' | 'signal' | 'gate' | 'system' | 'alert'
  message: string
  strategy?: string
  detail?: string
  timestamp: string
}

// ── kind config ───────────────────────────────────────────────────────────────
const KIND_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  trade:  { label: 'Trade',  color: 'text-accent-green  bg-accent-green/10 border-accent-green/30',  icon: TrendingUp     },
  signal: { label: 'Signal', color: 'text-accent-blue   bg-accent-blue/10  border-accent-blue/30',   icon: Radio          },
  gate:   { label: 'Gate',   color: 'text-yellow-400    bg-yellow-400/10   border-yellow-400/30',    icon: CheckCircle2   },
  system: { label: 'System', color: 'text-slate-300     bg-dark-700        border-dark-600',          icon: Zap            },
  alert:  { label: 'Alert',  color: 'text-red-400       bg-red-400/10      border-red-400/30',        icon: AlertTriangle  },
}

const ALL_KINDS = ['trade', 'signal', 'gate', 'system', 'alert']

/**
 * Format ISO timestamp as HH:MM:SS EST/EDT (24-hr, Eastern time, UTC-normalized).
 * Dynamically resolves EST (UTC-5, Nov–Mar) vs EDT (UTC-4, Mar–Nov).
 */
function ts(raw: string): string {
  if (!raw) return ''
  try {
    const utc = raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z'
    const d = new Date(utc)
    const tzAbbr =
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
        .formatToParts(d)
        .find(p => p.type === 'timeZoneName')?.value ?? 'ET'
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + ' ' + tzAbbr
  } catch {
    return raw.replace('T', ' ').slice(0, 19)
  }
}

/** Parse a SQLite/ISO timestamp string into a JS Date (UTC-normalized). */
function parseUTC(raw: string): number {
  try {
    const utc = raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z'
    return new Date(utc).getTime()
  } catch { return 0 }
}

function KindBadge({ kind }: { kind: string }) {
  const m = KIND_META[kind] ?? KIND_META.system
  const Icon = m.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[13px] font-mono font-semibold', m.color)}>
      <Icon size={10} />
      {m.label.toUpperCase()}
    </span>
  )
}

// ── Legend bar ────────────────────────────────────────────────────────────────
const LEGEND_ITEMS: { kind: string; desc: string }[] = [
  { kind: 'trade',  desc: 'TAO buy / sell executed'         },
  { kind: 'signal', desc: 'Bot signal or external feed event' },
  { kind: 'gate',   desc: 'Promotion / demotion checkpoint' },
  { kind: 'alert',  desc: 'Risk trigger or error'           },
  { kind: 'system', desc: 'Scheduler / system event'        },
]

function LegendBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-6 py-2">
      <span className="text-[13px] font-mono text-slate-500 uppercase tracking-widest pr-1">
        Legend
      </span>
      {LEGEND_ITEMS.map(({ kind, desc }) => {
        const m    = KIND_META[kind]
        const Icon = m.icon
        // pull first colour token (text-*) from the compound class string
        const textColor = m.color.split(/\s+/).find(c => c.startsWith('text-')) ?? 'text-slate-300'
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <Icon size={11} className={textColor} />
            <span className={clsx('text-[14px] font-mono font-semibold', textColor)}>
              {m.label}
            </span>
            <span className="text-[14px] text-slate-500 font-mono">— {desc}</span>
          </span>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Webhook Types ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

interface WebhookEndpoint {
  id: string
  name: string
  url: string
  url_display?: string
  kind: 'discord' | 'slack' | 'generic'
  enabled: boolean
  min_level: 'INFO' | 'WARNING' | 'CRITICAL'
  event_kinds: string[]
  event_types: string[]
  last_delivered: string | null
  last_status: number | null
  last_error: string | null
  delivery_count: number
  failure_count: number
  created_at: string
}

const KIND_OPTIONS = [
  { value: 'discord', label: 'Discord', icon: '🎮', hint: 'Rich embed with colour-coded alerts' },
  { value: 'slack',   label: 'Slack',   icon: '💬', hint: 'Block Kit formatted messages' },
  { value: 'generic', label: 'Generic', icon: '🔗', hint: 'Flat JSON — works with Zapier, n8n, Make…' },
]

const LEVEL_OPTIONS: Array<'INFO' | 'WARNING' | 'CRITICAL'> = ['INFO', 'WARNING', 'CRITICAL']
const EVENT_KIND_OPTIONS = ['trade', 'gate', 'alert', 'signal', 'system']
const EVENT_TYPE_OPTIONS = [
  'GATE_PROMOTION', 'CONSENSUS_APPROVED', 'CONSENSUS_VETOED',
  'REGIME_SHIFT', 'STRATEGY_HOT', 'STRATEGY_STRUGGLING',
  'PNL_MILESTONE', 'DRAWDOWN_ALERT', 'SYSTEM',
]

function levelColor(level: string) {
  if (level === 'CRITICAL') return 'text-red-400 bg-red-400/10 border-red-400/30'
  if (level === 'WARNING')  return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
  return 'text-accent-blue bg-accent-blue/10 border-accent-blue/30'
}

function statusBadge(ep: WebhookEndpoint) {
  if (!ep.last_status) return <span className="text-slate-500 font-mono text-[10px]">No delivery yet</span>
  const ok = ep.last_status >= 200 && ep.last_status < 300
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border',
      ok ? 'text-accent-green bg-accent-green/10 border-accent-green/30' : 'text-red-400 bg-red-400/10 border-red-400/30'
    )}>
      {ok ? <Check size={9} /> : <X size={9} />}
      HTTP {ep.last_status}
    </span>
  )
}

// ── Add/Edit form ─────────────────────────────────────────────────────────────
interface WebhookFormProps {
  initial?: Partial<WebhookEndpoint>
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}

function WebhookForm({ initial, onSave, onCancel }: WebhookFormProps) {
  const [name,       setName]       = useState(initial?.name        ?? '')
  const [url,        setUrl]        = useState(initial?.url          ?? '')
  const [showUrl,    setShowUrl]    = useState(false)
  const [kind,       setKind]       = useState<string>(initial?.kind ?? 'generic')
  const [minLevel,   setMinLevel]   = useState<'INFO' | 'WARNING' | 'CRITICAL'>(initial?.min_level   ?? 'WARNING')
  const [eventKinds, setEventKinds] = useState<string[]>(initial?.event_kinds ?? ['all'])
  const [eventTypes, setEventTypes] = useState<string[]>(initial?.event_types ?? ['all'])
  const [saving,     setSaving]     = useState(false)

  function toggleKind(k: string) {
    if (k === 'all') { setEventKinds(['all']); return }
    const without = eventKinds.filter(x => x !== 'all' && x !== k)
    const next    = eventKinds.includes(k) ? without : [...without, k]
    setEventKinds(next.length ? next : ['all'])
  }
  function toggleType(t: string) {
    if (t === 'all') { setEventTypes(['all']); return }
    const without = eventTypes.filter(x => x !== 'all' && x !== t)
    const next    = eventTypes.includes(t) ? without : [...without, t]
    setEventTypes(next.length ? next : ['all'])
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Enter a name for this webhook'); return }
    if (!url.trim() || !url.startsWith('http')) { toast.error('Enter a valid https:// URL'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), url: url.trim(), kind, min_level: minLevel, event_kinds: eventKinds, event_types: eventTypes })
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-dark-800 border border-dark-500 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-white font-semibold text-sm">{initial?.id ? 'Edit Webhook' : 'New Webhook Endpoint'}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors p-1"><X size={15} /></button>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Discord #alerts"
          className="w-full bg-dark-700 border border-dark-500 focus:border-accent-blue rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none transition-colors placeholder-slate-600" />
      </div>

      {/* URL */}
      <div>
        <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1">Webhook URL</label>
        <div className="flex items-center gap-2 bg-dark-700 border border-dark-500 focus-within:border-accent-blue rounded-lg px-3 py-2 transition-colors">
          <input
            type={showUrl ? 'text' : 'password'}
            value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            className="flex-1 bg-transparent text-sm text-white font-mono focus:outline-none placeholder-slate-600"
          />
          <button onClick={() => setShowUrl(v => !v)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
            {showUrl ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 font-mono mt-1">URL is stored encrypted in the backend and masked in all UI displays</p>
      </div>

      {/* Type */}
      <div>
        <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1.5">Endpoint Type</label>
        <div className="grid grid-cols-3 gap-2">
          {KIND_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setKind(opt.value)}
              className={clsx('flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-mono transition-all',
                kind === opt.value
                  ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                  : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-400 hover:text-white'
              )}>
              <span className="text-base">{opt.icon}</span>
              <span className="font-semibold">{opt.label}</span>
              <span className="text-[10px] text-center leading-tight opacity-70">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Min Level + Event Kinds row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Min level */}
        <div>
          <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1.5">Minimum Severity</label>
          <div className="flex gap-1.5 flex-wrap">
            {LEVEL_OPTIONS.map(l => (
              <button key={l} onClick={() => setMinLevel(l)}
                className={clsx('px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border transition-colors',
                  minLevel === l ? levelColor(l) : 'text-slate-400 border-dark-600 hover:text-white'
                )}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-1">Only alerts at or above this level are sent</p>
        </div>

        {/* Event kinds */}
        <div>
          <label className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide mb-1.5">Activity Kinds</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setEventKinds(['all'])}
              className={clsx('px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
                eventKinds.includes('all') ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue' : 'border-dark-600 text-slate-400 hover:text-white'
              )}>ALL</button>
            {EVENT_KIND_OPTIONS.map(k => (
              <button key={k} onClick={() => toggleKind(k)}
                className={clsx('px-2 py-0.5 rounded text-[10px] font-mono border capitalize transition-colors',
                  eventKinds.includes(k) ? 'bg-accent-green/20 border-accent-green/50 text-accent-green' : 'border-dark-600 text-slate-400 hover:text-white'
                )}>{k}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Alert types (collapsible advanced) */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] text-slate-400 font-mono uppercase tracking-wide flex items-center gap-1 select-none list-none hover:text-white transition-colors">
          <ChevronDown size={11} className="group-open:rotate-180 transition-transform" />
          Advanced: Alert Type Filter (default: all)
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => setEventTypes(['all'])}
            className={clsx('px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
              eventTypes.includes('all') ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue' : 'border-dark-600 text-slate-400 hover:text-white'
            )}>ALL</button>
          {EVENT_TYPE_OPTIONS.map(t => (
            <button key={t} onClick={() => toggleType(t)}
              className={clsx('px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
                eventTypes.includes(t) ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'border-dark-600 text-slate-400 hover:text-white'
              )}>{t}</button>
          ))}
        </div>
      </details>

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/40 text-accent-blue rounded-lg text-sm font-mono font-semibold transition-all disabled:opacity-50">
          {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
          {initial?.id ? 'Save Changes' : 'Add Webhook'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-mono transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Webhook row ───────────────────────────────────────────────────────────────
function WebhookRow({ ep, onDelete, onToggle, onTest, onEdit }: {
  ep: WebhookEndpoint
  onDelete: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onTest:   (id: string) => Promise<void>
  onEdit:   (ep: WebhookEndpoint) => void
}) {
  const [testing, setTesting] = useState(false)
  const kindIcon = { discord: '🎮', slack: '💬', generic: '🔗' }[ep.kind] ?? '🔗'

  async function handleTest() {
    setTesting(true)
    try { await onTest(ep.id) } finally { setTesting(false) }
  }

  return (
    <div className={clsx(
      'bg-dark-800 border rounded-xl px-4 py-3 transition-all',
      ep.enabled ? 'border-dark-500 hover:border-dark-400' : 'border-dark-700 opacity-60'
    )}>
      <div className="flex items-start gap-3">
        {/* Icon + enabled toggle */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 pt-0.5">
          <span className="text-lg">{kindIcon}</span>
          <button onClick={() => onToggle(ep.id, !ep.enabled)} title={ep.enabled ? 'Disable' : 'Enable'}
            className="text-slate-400 hover:text-white transition-colors">
            {ep.enabled
              ? <ToggleRight size={16} className="text-accent-green" />
              : <ToggleLeft  size={16} className="text-slate-600" />}
          </button>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{ep.name}</span>
            <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase', levelColor(ep.min_level))}>
              {ep.min_level}+
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-dark-700 border border-dark-600 px-1.5 py-0.5 rounded uppercase">
              {ep.kind}
            </span>
            {statusBadge(ep)}
          </div>

          {/* URL masked */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 font-mono truncate">{ep.url_display ?? ep.url.slice(0, 40) + '…'}</p>
            <button onClick={() => { navigator.clipboard.writeText(ep.url); toast.success('URL copied') }}
              className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0" title="Copy URL">
              <Copy size={10} />
            </button>
          </div>

          {/* Kinds + stats */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
            <span>Kinds: {ep.event_kinds.join(', ')}</span>
            <span>·</span>
            <span className="text-accent-green">{ep.delivery_count} sent</span>
            {ep.failure_count > 0 && <><span>·</span><span className="text-red-400">{ep.failure_count} failed</span></>}
            {ep.last_error && <><span>·</span><span className="text-red-400 truncate max-w-[160px]">{ep.last_error}</span></>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={handleTest} disabled={testing}
            title="Send test payload"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-500 hover:border-accent-blue/40 rounded-lg text-xs font-mono text-slate-300 hover:text-accent-blue transition-all disabled:opacity-50">
            {testing ? <RefreshCw size={10} className="animate-spin" /> : <Send size={10} />}
            {testing ? 'Sending…' : 'Test'}
          </button>
          <button onClick={() => onEdit(ep)} title="Edit"
            className="p-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-500 rounded-lg text-slate-400 hover:text-white transition-all">
            <Settings2 size={13} />
          </button>
          <button onClick={() => onDelete(ep.id)} title="Delete"
            className="p-1.5 bg-dark-700 hover:bg-red-500/20 border border-dark-500 hover:border-red-500/40 rounded-lg text-slate-400 hover:text-red-400 transition-all">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Webhook Drawer ─────────────────────────────────────────────────────────────
function WebhookDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [loading,   setLoading]   = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [editTarget, setEditTarget] = useState<WebhookEndpoint | null>(null)
  const [exportStr,  setExportStr]  = useState('')
  const [showExport, setShowExport] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/webhooks')
      setEndpoints(res.data.endpoints ?? [])
    } catch { toast.error('Failed to load webhooks') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  async function handleAdd(data: any) {
    try {
      await api.post('/webhooks', data)
      toast.success(`Webhook "${data.name}" added ✓`)
      setShowForm(false)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to add webhook')
    }
  }

  async function handleEdit(data: any) {
    if (!editTarget) return
    try {
      await api.put(`/webhooks/${editTarget.id}`, data)
      toast.success('Webhook updated ✓')
      setEditTarget(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to update webhook')
    }
  }

  async function handleDelete(id: string) {
    const ep = endpoints.find(e => e.id === id)
    if (!confirm(`Delete webhook "${ep?.name}"?`)) return
    try {
      await api.delete(`/webhooks/${id}`)
      toast.success('Webhook deleted')
      load()
    } catch { toast.error('Failed to delete') }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await api.put(`/webhooks/${id}`, { enabled })
      setEndpoints(prev => prev.map(e => e.id === id ? { ...e, enabled } : e))
    } catch { toast.error('Failed to toggle webhook') }
  }

  async function handleTest(id: string) {
    try {
      const res = await api.post(`/webhooks/${id}/test`)
      if (res.data.success) {
        toast.success('Test delivered ✓')
      } else {
        toast.error(`Test failed: ${res.data.error ?? `HTTP ${res.data.status}`}`)
      }
      load()   // refresh status
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Test delivery failed')
    }
  }

  async function handleExport() {
    try {
      const res = await api.get('/webhooks/export')
      setExportStr(res.data.value)
      setShowExport(true)
    } catch { toast.error('Export failed') }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-dark-900 border-l border-dark-500 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500/15 border border-indigo-500/30 rounded-lg flex items-center justify-center">
              <Webhook size={15} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Webhook Notifications</h2>
              <p className="text-slate-400 text-xs font-mono">{endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''} configured</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors" title="Refresh">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* How it works banner */}
        <div className="mx-5 mt-4 flex items-start gap-2.5 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex-shrink-0">
          <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 font-mono space-y-0.5">
            <p><span className="text-white font-semibold">How it works:</span> Every II Agent alert or high-value activity event (trade executed, gate promotion, drawdown, consensus vote) is POSTed to your configured endpoints in real time.</p>
            <p>Supports <span className="text-indigo-300">Discord</span>, <span className="text-green-300">Slack</span>, and <span className="text-slate-300">Generic HTTP</span> (Zapier, n8n, Make, PagerDuty, custom).</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* Add / Edit form */}
          {(showForm || editTarget) && (
            <WebhookForm
              initial={editTarget ?? undefined}
              onSave={editTarget ? handleEdit : handleAdd}
              onCancel={() => { setShowForm(false); setEditTarget(null) }}
            />
          )}

          {/* Endpoint list */}
          {loading && !endpoints.length && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={18} className="animate-spin text-slate-400" />
            </div>
          )}

          {!loading && !endpoints.length && !showForm && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <div className="w-14 h-14 bg-dark-700 border border-dark-600 rounded-2xl flex items-center justify-center">
                <Webhook size={24} className="text-slate-500" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">No webhooks configured yet</p>
                <p className="text-slate-400 text-xs font-mono mt-1">Add your first endpoint to start receiving live notifications</p>
              </div>
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/40 text-accent-blue rounded-lg text-sm font-mono font-semibold transition-all">
                <Plus size={13} />
                Add First Webhook
              </button>
            </div>
          )}

          {endpoints.map(ep => (
            <WebhookRow
              key={ep.id}
              ep={ep}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onTest={handleTest}
              onEdit={ep => { setEditTarget(ep); setShowForm(false) }}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-dark-600 flex items-center gap-2">
          {!showForm && !editTarget && (
            <button onClick={() => { setShowForm(true); setEditTarget(null) }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-accent-blue/15 hover:bg-accent-blue/25 border border-accent-blue/30 text-accent-blue rounded-lg text-sm font-mono font-semibold transition-all">
              <Plus size={13} />
              Add Endpoint
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3.5 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-500 text-slate-300 hover:text-white rounded-lg text-sm font-mono transition-all ml-auto"
            title="Export config for Railway persistence">
            <Copy size={12} />
            Export for Railway
          </button>
        </div>

        {/* Export modal */}
        {showExport && exportStr && (
          <div className="absolute inset-0 bg-dark-900/95 backdrop-blur flex flex-col p-5 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Export Webhook Config</h3>
              <button onClick={() => setShowExport(false)} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="bg-dark-700 border border-dark-500 rounded-xl p-4 space-y-3 flex-1 overflow-auto">
              <p className="text-sm text-slate-300 font-mono">
                Paste this value as a Railway environment variable named{' '}
                <span className="bg-dark-600 px-1.5 py-0.5 rounded text-accent-blue font-semibold">WEBHOOK_CONFIGS</span>{' '}
                to preserve your webhook configuration across redeploys.
              </p>
              <div className="relative">
                <textarea
                  readOnly value={exportStr}
                  className="w-full h-32 bg-dark-800 border border-dark-600 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none resize-none"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(exportStr); toast.success('Copied to clipboard ✓') }}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-dark-700 border border-dark-500 rounded text-xs text-slate-300 hover:text-white transition-colors">
                  <Copy size={10} />
                  Copy
                </button>
              </div>
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300 font-mono">
                  This string contains your full webhook URLs. Treat it like a secret — do not share it publicly.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Signal Feeds Drawer ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

interface SignalFeed {
  id:             string
  name:           string
  description:    string
  icon:           string
  auth:           'none' | 'api_key' | 'bot_token' | 'link_only'
  interval_label: string
  enabled:        boolean
  status:         'connected' | 'error' | 'disabled' | 'connecting' | 'pending_invite'
  last_fetch:     string | null
  last_value:     string | null
  error:          string | null
  events_total:   number
  config:         Record<string, string>
}

// Day 12 (cont.) — added "x" entry for the new link-only X · #bittensor
// pivot feed. Same registry shape as the others; rendered with a glyph
// instead of an emoji so the card feels native to X's brand mark.
const FEED_ICON: Record<string, string> = {
  coin:    '💰',
  reddit:  '🔴',
  news:    '📰',
  chain:   '⛓️',
  ai:      '🤖',
  discord: '💬',
  x:       '𝕏',
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  connected:      { label: 'Connected',      cls: 'text-accent-green bg-accent-green/10 border-accent-green/30' },
  error:          { label: 'Error',          cls: 'text-red-400      bg-red-400/10      border-red-400/30'      },
  disabled:       { label: 'Disabled',       cls: 'text-slate-400    bg-dark-700        border-dark-600'        },
  connecting:     { label: 'Connecting…',    cls: 'text-yellow-400   bg-yellow-400/10   border-yellow-400/30'   },
  pending_invite: { label: 'Pending Invite', cls: 'text-orange-400   bg-orange-400/10   border-orange-400/30'   },
}

function timeSinceShort(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function SignalFeedCard({ feed, onToggle, onSaveKey, onTest }: {
  feed:       SignalFeed
  onToggle:   (id: string, enabled: boolean) => void
  onSaveKey:  (id: string, config: Record<string, string>) => void
  onTest:     (id: string) => void
}) {
  const [keyVal,   setKeyVal]   = useState('')
  const [showKey,  setShowKey]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const sm = STATUS_META[feed.status] ?? STATUS_META.disabled

  async function handleSaveKey() {
    if (!keyVal.trim()) { toast.error('Enter an API key'); return }
    setSaving(true)
    try { await onSaveKey(feed.id, { api_key: keyVal.trim() }) }
    finally { setSaving(false); setKeyVal('') }
  }

  async function handleTest() {
    setTesting(true)
    try { await onTest(feed.id) }
    finally { setTesting(false) }
  }

  const isDiscord  = feed.id === 'discord'
  // Day 12 (cont.) — link-only feeds (X #bittensor) don't have a polling
  // loop; they expose a public search URL via feed.config.url and render
  // as an "Open on X →" pivot button instead of an API-key form / test
  // fetch.  The toggle is also disabled (always-on; link is just there).
  const isLinkOnly = feed.auth === 'link_only'
  const linkUrl    = isLinkOnly ? (feed.config?.url ?? '').trim() : ''

  return (
    <div className={clsx(
      'bg-dark-800 border rounded-xl p-4 space-y-3 transition-all',
      feed.enabled ? 'border-dark-500' : 'border-dark-700 opacity-75',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl leading-none flex-shrink-0">{FEED_ICON[feed.icon] ?? '📡'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{feed.name}</span>
              <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold', sm.cls)}>
                {sm.label}
              </span>
              <span className="text-[10px] font-mono text-slate-500 bg-dark-700 px-1.5 py-0.5 rounded border border-dark-600">
                {feed.interval_label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5 leading-snug">{feed.description}</p>
          </div>
        </div>

        {/* Toggle (link-only feeds are always-on, render as a static pill) */}
        {isLinkOnly ? (
          <span
            className="flex-shrink-0 px-2 py-0.5 rounded-md bg-accent-green/10 border border-accent-green/30 text-[10px] font-mono uppercase tracking-wide text-accent-green"
            title="Link-only pivot — always available, no toggle"
          >
            Link · Always On
          </span>
        ) : (
          <button
            onClick={() => onToggle(feed.id, !feed.enabled)}
            disabled={isDiscord && feed.status !== 'connected'}
            title={isDiscord && feed.status !== 'connected' ? 'Discord requires OTF server invite — cannot enable manually' : undefined}
            className={clsx('flex-shrink-0 transition-colors', isDiscord && feed.status !== 'connected' && 'opacity-40 cursor-not-allowed')}
          >
            {feed.enabled
              ? <ToggleRight size={28} className="text-accent-green" />
              : <ToggleLeft  size={28} className="text-slate-500" />
            }
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
        <span>Last fetch: <span className="text-slate-300">{timeSinceShort(feed.last_fetch)}</span></span>
        {feed.last_value && (
          <span>Value: <span className="text-slate-300">{feed.last_value}</span></span>
        )}
        <span className="ml-auto">
          {feed.events_total} event{feed.events_total !== 1 ? 's' : ''} emitted
        </span>
      </div>

      {/* Error banner */}
      {feed.error && (
        <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-300 font-mono leading-snug">{feed.error}</p>
        </div>
      )}

      {/* API key input (for taostats — perplexity removed XXXIX Day 6) */}
      {feed.auth === 'api_key' && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">
            API Key {feed.config?.api_key ? '— currently saved (masked)' : '— required to enable'}
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-dark-700 border border-dark-500 focus-within:border-accent-blue rounded-lg px-3 py-2 transition-colors">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyVal}
                onChange={e => setKeyVal(e.target.value)}
                placeholder={feed.config?.api_key ? 'Enter new key to replace…' : 'Paste API key here…'}
                className="flex-1 bg-transparent text-xs text-white font-mono focus:outline-none placeholder-slate-600"
              />
              <button onClick={() => setShowKey(v => !v)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
                {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={saving || !keyVal.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/40 text-accent-blue rounded-lg text-xs font-mono font-semibold transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
              Save
            </button>
          </div>
          {feed.id === 'taostats' && (
            <p className="text-[10px] text-slate-500 font-mono">
              Sign up free at{' '}
              <a href="https://taostats.io/pro" target="_blank" rel="noopener" className="text-accent-blue hover:underline">
                taostats.io/pro
              </a>
            </p>
          )}
          {/* Session XXXIX (Day 6): Perplexity helper removed — feed dropped (paid subscription). */}
        </div>
      )}

      {/* TaoStats status — not connected banner */}
      {feed.id === 'taostats' && feed.status !== 'connected' && (
        <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/25 rounded-lg px-3 py-2.5">
          <span className="text-red-400 flex-shrink-0 text-[11px] font-bold mt-0.5">⊗</span>
          <div className="text-[11px] font-mono leading-snug space-y-1">
            <p className="text-red-300 font-bold uppercase tracking-wide">TaoStats Not Connected</p>
            <p className="text-slate-400">
              Status: <span className="text-orange-300 font-semibold">{feed.status || 'disconnected'}</span>
            </p>
            <p className="text-slate-500 text-[10px]">
              TaoStats price signals are not flowing into the Activity Log.
              Verify your API key below or check your subscription at{' '}
              <a href="https://taostats.io/pro" target="_blank" rel="noopener" className="text-orange-300 hover:underline">taostats.io/pro</a>.
            </p>
          </div>
        </div>
      )}

      {/* Discord status — not connected banner */}
      {isDiscord && feed.status !== 'connected' && (
        <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/25 rounded-lg px-3 py-2.5">
          <span className="text-red-400 flex-shrink-0 text-[11px] font-bold mt-0.5">⊗</span>
          <div className="text-[11px] font-mono leading-snug space-y-1.5">
            <p className="text-red-300 font-bold uppercase tracking-wide">Discord Not Connected — Awaiting OTF Server Invite</p>
            <p className="text-slate-400">
              Status: <span className="text-orange-300 font-semibold">{feed.status === 'pending_invite' ? 'Pending invite' : feed.status}</span>
              {' · '}Bot token is loaded and valid. The only blocker is a server invite.
            </p>
            <div className="text-slate-500 text-[10px] space-y-0.5 border-t border-slate-700/40 pt-1.5">
              <p className="text-slate-300 font-semibold text-[11px]">How to unblock this:</p>
              <p>1. Open{' '}
                <a href="https://discord.gg/bittensor" target="_blank" rel="noopener" className="text-sky-400 hover:underline">discord.gg/bittensor</a>
                {' '}and navigate to <span className="text-white">#dev-support</span> or <span className="text-white">#general</span>
              </p>
              <p>2. Ask an OTF admin or moderator to invite the II Agent webhook bot to the server</p>
              <p>3. Once invited, the gateway connects automatically — no code change needed</p>
              <p className="text-slate-600 pt-0.5">Alternatively: invite the bot to any Discord server you manage to test the signal pipeline end-to-end while awaiting OTF access.</p>
            </div>
          </div>
        </div>
      )}

      {/* Test button (non-Discord, non-link-only only) */}
      {!isDiscord && !isLinkOnly && feed.enabled && (
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-500 text-slate-300 hover:text-white rounded-lg text-xs font-mono transition-all disabled:opacity-50"
        >
          {testing
            ? <RefreshCw size={10} className="animate-spin" />
            : <Send size={10} />
          }
          {testing ? 'Fetching…' : 'Test fetch → Activity Log'}
        </button>
      )}

      {/* Day 12 (cont.) — link-only pivot row.  X has no free API tier;
          this card surfaces the connection as a one-click search-pivot
          (same pattern as the Subnet Detail "Community" card and the
          Dashboard SignalFeedTile pivot row).  Cost: $0. */}
      {isLinkOnly && linkUrl && (
        <div className="flex items-center gap-2">
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-dark-500 hover:border-slate-400/50 text-slate-200 hover:text-white rounded-lg text-xs font-mono transition-all"
            title={`Open ${feed.name} in a new tab`}
          >
            <ExternalLink size={10} />
            Open on {feed.name.split('·')[0].trim()} →
          </a>
          <span className="text-[10px] text-slate-500 font-mono">
            Live X search · no API key needed · opens in new tab
          </span>
        </div>
      )}
    </div>
  )
}

function SignalFeedsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [feeds,    setFeeds]   = useState<SignalFeed[]>([])
  const [loading,  setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/signal-feeds')
      setFeeds(res.data.feeds ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    const t = setInterval(load, 8000)   // refresh status every 8s while open
    return () => clearInterval(t)
  }, [open, load])

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await api.post(`/signal-feeds/${id}/toggle`, { enabled })
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled, status: enabled ? 'connecting' : 'disabled' } : f))
      toast.success(enabled ? 'Feed enabled ✓' : 'Feed disabled')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Toggle failed')
    }
  }

  async function handleSaveKey(id: string, config: Record<string, string>) {
    try {
      await api.post(`/signal-feeds/${id}/config`, { config })
      toast.success('API key saved — feed enabled ✓')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Save failed')
    }
  }

  async function handleTest(id: string) {
    try {
      await api.post(`/signal-feeds/${id}/test`)
      toast.success('Test fetch triggered — check Activity Log')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Test failed')
    }
  }

  if (!open) return null

  const connected  = feeds.filter(f => f.status === 'connected').length
  const total      = feeds.length

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-dark-900 border-l border-dark-500 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-accent-blue/10 border border-accent-blue/30 rounded-lg flex items-center justify-center">
              <Radio size={15} className="text-accent-blue" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Signal Feeds</h2>
              <p className="text-slate-400 text-xs font-mono">
                {loading ? 'Loading…' : `${connected} / ${total} connected`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-4 flex items-start gap-2.5 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex-shrink-0">
          <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 font-mono space-y-0.5">
            <p><span className="text-white font-semibold">Inbound signal feeds</span> — external sources polled on a schedule and injected into the Activity Log as <span className="text-accent-blue font-semibold">SIGNAL</span> events.</p>
            <p>Free sources auto-start. API-key sources activate when you paste a key. Discord requires an OTF server invite.</p>
          </div>
        </div>

        {/* Feed cards */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && !feeds.length && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={18} className="animate-spin text-slate-400" />
            </div>
          )}
          {feeds.map(feed => (
            <SignalFeedCard
              key={feed.id}
              feed={feed}
              onToggle={handleToggle}
              onSaveKey={handleSaveKey}
              onTest={handleTest}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-dark-600">
          <p className="text-[10px] text-slate-500 font-mono">
            Signal events appear in the Activity Log stream under the <span className="text-accent-blue font-semibold">SIGNAL</span> filter.
            All polling is server-side — no browser connection required.
          </p>
        </div>

      </div>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ActivityLog() {
  const [events,           setEvents]           = useState<Event[]>([])
  const [loading,          setLoading]          = useState(true)
  const [live,             setLive]             = useState(true)
  const [filter,           setFilter]           = useState<string>('all')
  const [search,           setSearch]           = useState('')
  const [webhookOpen,      setWebhookOpen]      = useState(false)
  const [signalFeedsOpen,  setSignalFeedsOpen]  = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/fleet/activity?limit=200')
      setEvents(res.data.events || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!live) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [live, load])

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.kind !== filter) return false
    if (search && !e.message.toLowerCase().includes(search.toLowerCase()) &&
        !(e.strategy || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const setActivityPageStats = useBotStore(s => s.setActivityPageStats)
  const toggleLive = useCallback(() => setLive(v => !v), [])
  useEffect(() => {
    setActivityPageStats({ filtered: filtered.length, total: events.length, isLive: live, toggleLive })
    return () => setActivityPageStats(null)
  }, [filtered.length, events.length, live, toggleLive, setActivityPageStats])

  const counts = ALL_KINDS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = events.filter(e => e.kind === k).length
    return acc
  }, {})

  // Paper training baseline started 2026-05-04 on Railway
  const PAPER_START = new Date('2026-05-04T14:10:00Z')
  const paperDay = Math.max(1, Math.floor((Date.now() - PAPER_START.getTime()) / 86_400_000) + 1)

  // Signal rate: signals in last 200 events (counts.signal) over time window
  // Approximate: if events span ~1 hr, rate = counts.signal / 1 hr
  const signalPct = events.length ? Math.round((counts.signal ?? 0) / events.length * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header Bar ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 bg-dark-900 overflow-hidden">

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-3 pb-3 border-b border-dark-600">

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Kind filter chips */}
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-slate-300" />
            <button
              onClick={() => setFilter('all')}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-mono transition-colors',
                filter === 'all' ? 'bg-accent-blue/20 text-accent-blue' : 'text-slate-300 hover:text-white'
              )}
            >
              ALL ({events.length})
            </button>
            {ALL_KINDS.map(k => {
              const m = KIND_META[k]
              return (
                <button
                  key={k}
                  onClick={() => setFilter(filter === k ? 'all' : k)}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-mono transition-colors',
                    filter === k ? 'bg-accent-blue/20 text-accent-blue' : 'text-slate-300 hover:text-white'
                  )}
                >
                  {m.label} ({counts[k] || 0})
                </button>
              )
            })}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            className="ml-auto px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-300 placeholder-slate-600 font-mono focus:outline-none focus:border-accent-blue w-48"
          />

          {/* Webhooks button */}
          <button
            onClick={() => setWebhookOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-200 rounded-lg text-xs font-mono font-semibold transition-all"
            title="Configure outbound webhook notifications"
          >
            <Webhook size={12} />
            Webhooks
          </button>

          {/* Signal Feeds button */}
          <button
            onClick={() => setSignalFeedsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 hover:border-accent-blue/50 text-accent-blue hover:text-sky-200 rounded-lg text-xs font-mono font-semibold transition-all"
            title="Connect inbound signal feeds (CoinGecko, TaoDaily, Reddit, Taostats, Discord)"
          >
            <Radio size={12} />
            Signal Feeds
          </button>
        </div>
      </div>

      {/* ── Event stream — newest at top, no auto-scroll ───────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
        {/* topRef sits at the very top; "Jump to latest" scrolls here */}
        <div ref={topRef} />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-slate-300" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-300">
            <Activity size={32} className="mb-3 opacity-40" />
            <p className="font-mono text-sm">No events match your filter</p>
          </div>
        )}

        {/* Explicit descending sort — independent of whatever order the backend returns.
            Newest timestamp first; ties broken by numeric ID descending. */}
        {[...filtered]
          .sort((a, b) => {
            const diff = parseUTC(b.timestamp) - parseUTC(a.timestamp)
            if (diff !== 0) return diff
            return Number(b.id) - Number(a.id)
          })
          .map((ev, idx) => {
          const m = KIND_META[ev.kind] ?? KIND_META.system
          const Icon = m.icon
          return (
            <div
              key={`${ev.id}-${idx}`}
              className="group flex items-start gap-3 px-4 py-2.5 bg-dark-800 border border-dark-700/50 rounded-lg hover:border-dark-500 transition-colors"
            >
              {/* Icon */}
              {(() => {
                const cc = m.color.split(/\s+/).filter(Boolean)
                return (
                  <div className={clsx('mt-0.5 w-6 h-6 rounded flex items-center justify-center flex-shrink-0', cc[1])}>
                    <Icon size={12} className={cc[0]} />
                  </div>
                )
              })()}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <KindBadge kind={ev.kind} />
                  {ev.strategy && (
                    <span className="text-[13px] font-mono text-slate-300 bg-dark-700 px-1.5 py-0.5 rounded">
                      {ev.strategy}
                    </span>
                  )}
                  <span className="text-[13px] font-mono text-slate-300 ml-auto">
                    {ts(ev.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1 font-mono">{ev.message}</p>
                {ev.detail && (
                  <p className="text-xs text-slate-300 mt-0.5">{ev.detail}</p>
                )}
              </div>
            </div>
          )
        })}

        </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-dark-600 flex items-center justify-between">
        <p className="text-xs text-slate-300 font-mono">
          Ring buffer — last 200 events in memory
        </p>
        <button
          onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-white font-mono transition-colors"
        >
          <ArrowUpCircle size={12} /> Jump to latest
        </button>
      </div>
      </div>{/* end inner flex-col */}

      {/* Outbound webhook configuration drawer */}
      <WebhookDrawer open={webhookOpen} onClose={() => setWebhookOpen(false)} />

      {/* Inbound signal feeds drawer */}
      <SignalFeedsDrawer open={signalFeedsOpen} onClose={() => setSignalFeedsOpen(false)} />
    </div>
  )
}