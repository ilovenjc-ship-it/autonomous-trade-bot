/**
 * SignalEventDetailModal — Session XL (Day 7)
 * ============================================
 * Full-detail popup for a single signal-feed event. Surfaced when the
 * user clicks any row inside the SignalFeedTile (Dashboard) and reusable
 * elsewhere (Activity Log future click-through).
 *
 * Shows every stored field of the activity event:
 *   • Source badge (coingecko / reddit / taodaily / taostats / discord)
 *   • Strategy (if present — e.g. balanced_risk, dtao_flow_momentum)
 *   • Full message (no truncation, no ellipsis)
 *   • Parsed detail — pipe-separated `key: value | key=value | bare-text`
 *     fragments rendered as a labeled grid for readability
 *   • Raw detail block (monospace) for power-user copy
 *   • Timestamp (UTC + relative)
 *   • Event ID (numeric, primary key on backend)
 *
 * Renders via createPortal to document.body. Closes on backdrop click,
 * ESC key, or X button. Mirrors WhaleFlowDetailModal's UX contract so
 * Dashboard tile interactions feel consistent.
 */
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Copy, Hash, Clock, Radio, Newspaper, MessageCircle, Coins, Link2,
  Database, Tag, Activity,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fmtETDateTime } from '@/lib/time'

// ── Types ────────────────────────────────────────────────────────────────────
export interface SignalEvent {
  id:        number
  kind:      'trade' | 'signal' | 'gate' | 'system' | 'alert'
  message:   string
  strategy?: string | null
  detail?:   string
  timestamp: string
}

interface Props {
  event:   SignalEvent | null
  onClose: () => void
}

// Source classification — kept in sync with SignalFeedTile.detectSource().
type Source =
  | 'coingecko'
  | 'reddit_rss'
  | 'taodaily_rss'
  | 'taostats'
  | 'discord'
  | 'unknown'

const SOURCE_META: Record<Source, { label: string; Icon: any; cls: string; bg: string; ring: string }> = {
  coingecko:    { label: 'CoinGecko', Icon: Coins,         cls: 'text-amber-400',  bg: 'bg-amber-500/10',  ring: 'ring-amber-500/30'  },
  reddit_rss:   { label: 'Reddit',    Icon: MessageCircle, cls: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/30' },
  taodaily_rss: { label: 'TaoDaily',  Icon: Newspaper,     cls: 'text-sky-400',    bg: 'bg-sky-500/10',    ring: 'ring-sky-500/30'    },
  taostats:     { label: 'Taostats',  Icon: Link2,         cls: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-500/30' },
  discord:      { label: 'Discord',   Icon: MessageCircle, cls: 'text-indigo-400', bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/30' },
  unknown:      { label: 'Signal',    Icon: Radio,         cls: 'text-slate-400',  bg: 'bg-slate-500/10',  ring: 'ring-slate-500/30'  },
}

function detectSource(detail?: string, message?: string): Source {
  const blob = `${detail ?? ''} ${message ?? ''}`.toLowerCase()
  if (blob.includes('source:coingecko')    || blob.includes('coingecko'))    return 'coingecko'
  if (blob.includes('source:reddit')       || blob.includes('reddit'))       return 'reddit_rss'
  if (blob.includes('source:taodaily')     || blob.includes('taodaily'))     return 'taodaily_rss'
  if (blob.includes('source:taostats')     || blob.includes('taostats'))     return 'taostats'
  if (blob.includes('source:discord')      || blob.includes('discord'))      return 'discord'
  return 'unknown'
}

// ── helpers ──────────────────────────────────────────────────────────────────
// Day 12: timestamps render in Eastern Time (America/New_York).
function fmtEt(raw: string): string {
  return fmtETDateTime(raw, { seconds: true, year: true })
}

function fmtRelative(raw: string): string {
  if (!raw) return ''
  try {
    const d   = new Date(raw)
    const sec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (sec < 60)    return `${sec}s ago`
    if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
    return `${Math.floor(sec / 86400)}d ago`
  } catch { return '' }
}

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error('Copy failed'))
}

/**
 * Parse the `detail` string into structured key/value fragments.
 *
 * Backend convention (from signal_ingestor.py + consensus + II Agent):
 *   "source:coingecko"
 *   "source:reddit_rss | Some article title"
 *   "Direction=SELL | 7/12 threshold | 7ms"
 *   "Hot: 0 | Struggling: 11 | Consensus approval: 56.2%"
 *
 * Each pipe-separated fragment can be:
 *   - "k: v"  — key/value with colon
 *   - "k=v"   — key/value with equals (config-style)
 *   - "free text" — rendered as a bare note
 */
interface DetailFragment {
  key?:  string
  value: string
}

// URL detector — matches http(s) and any well-formed `scheme://...` URI.
// Used both by the detail parser (so URLs aren't shredded by the colon split)
// and by the renderer (so URL values become clickable anchors).
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i
function isUrl(s: string): boolean { return URL_RE.test(s.trim()) }

function parseDetail(detail?: string): DetailFragment[] {
  if (!detail) return []
  return detail.split('|').map(seg => seg.trim()).filter(Boolean).map((seg) => {
    // URL guard — handle BEFORE the colon split, otherwise `https://...`
    // gets sliced into key="https" / value="//..." (the bug seen in #17).
    if (isUrl(seg)) {
      return { key: 'Link', value: seg }
    }
    // colon split — but only the FIRST colon to preserve values containing colons
    const colonIdx = seg.indexOf(':')
    const eqIdx    = seg.indexOf('=')
    if (colonIdx > 0 && (eqIdx < 0 || colonIdx < eqIdx)) {
      return { key: seg.slice(0, colonIdx).trim(), value: seg.slice(colonIdx + 1).trim() }
    }
    if (eqIdx > 0) {
      return { key: seg.slice(0, eqIdx).trim(), value: seg.slice(eqIdx + 1).trim() }
    }
    return { value: seg }
  })
}

// ── component ────────────────────────────────────────────────────────────────
export default function SignalEventDetailModal({ event, onClose }: Props) {
  // ESC to close + lock body scroll
  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [event, onClose])

  const fragments = useMemo(() => parseDetail(event?.detail), [event?.detail])

  if (!event) return null

  const src   = detectSource(event.detail, event.message)
  const meta  = SOURCE_META[src]
  const Icon  = meta.Icon

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_.15s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signal-event-title"
    >
      <div
        className={clsx(
          'relative w-full max-w-2xl max-h-[90vh] overflow-y-auto',
          'rounded-2xl border bg-dark-800 shadow-2xl ring-1',
          'border-dark-600', meta.ring,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-dark-600 bg-dark-800/95 backdrop-blur px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={clsx('rounded-lg p-2 flex-shrink-0', meta.bg)}>
              <Icon size={20} className={meta.cls} />
            </div>
            <div className="min-w-0">
              <div className={clsx('text-[10.5px] font-mono uppercase tracking-[0.18em] mb-0.5', meta.cls)}>
                Signal · {meta.label}
              </div>
              <h2 id="signal-event-title" className="text-lg font-semibold text-white">
                Signal Event
              </h2>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                ID #{event.id}
                {event.strategy && <> · strategy: <span className="text-slate-300">{event.strategy}</span></>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 transition flex-shrink-0"
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5">

          {/* Hero — full message */}
          <div className={clsx(
            'rounded-xl border p-5',
            'border-dark-600 bg-dark-900/50',
          )}>
            <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-2">
              <Activity size={12} /> Message
            </div>
            <div className="text-base font-medium text-white leading-relaxed break-words">
              {event.message}
            </div>
          </div>

          {/* Parsed detail fragments */}
          {fragments.length > 0 && (
            <Section icon={<Database size={12} />} title="Detail">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fragments.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-dark-600 bg-dark-900/60 px-3 py-2.5"
                  >
                    {f.key ? (
                      <>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                          {f.key}
                        </div>
                        {isUrl(f.value) ? (
                          <a
                            href={f.value}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-sm font-mono text-accent-blue hover:text-accent-blue/80 underline-offset-2 hover:underline break-all transition-colors"
                          >
                            {f.value}
                          </a>
                        ) : (
                          <div className="text-sm font-mono text-slate-200 break-all">
                            {f.value}
                          </div>
                        )}
                      </>
                    ) : isUrl(f.value) ? (
                      <a
                        href={f.value}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm font-mono text-accent-blue hover:text-accent-blue/80 underline-offset-2 hover:underline break-words transition-colors"
                      >
                        {f.value}
                      </a>
                    ) : (
                      <div className="text-sm font-mono text-slate-300 break-words italic">
                        {f.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Strategy (if present) */}
          {event.strategy && (
            <Section icon={<Tag size={12} />} title="Originating Strategy">
              <div className="inline-flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-900/60 px-3 py-2 text-sm font-mono text-slate-200">
                <span className="w-2 h-2 rounded-full bg-accent-blue" />
                {event.strategy}
              </div>
            </Section>
          )}

          {/* Timestamp */}
          <Section icon={<Clock size={12} />} title="Timestamp">
            <div className="rounded-lg border border-dark-600 bg-dark-900/60 px-3 py-2.5">
              <div className="text-sm font-mono text-slate-200 break-all">
                {fmtEt(event.timestamp)}
              </div>
              <div className="text-[10.5px] font-mono text-slate-500 mt-0.5">
                {fmtRelative(event.timestamp)}
              </div>
            </div>
          </Section>

          {/* Raw detail (collapsible-feeling block for power users) */}
          {event.detail && (
            <Section icon={<Hash size={12} />} title="Raw">
              <div className="flex items-start gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-[11.5px] font-mono text-slate-300 break-all whitespace-pre-wrap">
                  {event.detail}
                </code>
                <button
                  onClick={() => copy(event.detail ?? '', 'Detail')}
                  className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-dark-700 border border-dark-600 transition flex-shrink-0"
                  aria-label="Copy raw detail"
                  type="button"
                >
                  <Copy size={13} />
                </button>
              </div>
            </Section>
          )}

          {/* Footer — provenance line */}
          <div className="text-[10.5px] font-mono text-slate-500 border-t border-dark-700 pt-3">
            Sourced via the unified signal stream — same `kind="signal"` events
            surfaced on the Activity Log page. Click outside or press <kbd className="px-1 py-0.5 rounded bg-dark-700 border border-dark-600">Esc</kbd> to close.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── sub-components ───────────────────────────────────────────────────────────
function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-2">
        {icon}{title}
      </div>
      {children}
    </div>
  )
}