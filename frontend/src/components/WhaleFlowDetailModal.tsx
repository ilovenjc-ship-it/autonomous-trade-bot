/**
 * WhaleFlowDetailModal — Session XXXIX (Day 6)
 * ============================================
 * Full-detail popup for a single whale flow event. Surfaced when the
 * user clicks any row inside the WhaleFlowTile (Dashboard) or the
 * Whale Flow panel (subnet detail page).
 *
 * Shows every stored field of the normalised stake event:
 *   • Direction & action (DELEGATE / UNDELEGATE)
 *   • Subnet (with link to subnet detail page)
 *   • Coldkey (nominator) — full SS58 + copy button + Taostats deep link
 *   • Hotkey  (delegate)  — full SS58 + copy button + Taostats deep link
 *   • Amount (τ + USD)
 *   • Block number — Taostats explorer deep link
 *   • Extrinsic id
 *   • Timestamps (UTC + relative)
 *
 * Renders via createPortal to the document body so it floats above all
 * page chrome regardless of mount location. Closes on backdrop click,
 * ESC key, or X button.
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Copy, ExternalLink, ArrowDownLeft, ArrowUpRight,
  Hash, Layers, Clock, User, Server,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { fmtETDateTime } from '@/lib/time'

export interface WhaleFlowEvent {
  id:               string
  extrinsic_id?:    string
  block_number:     number
  timestamp:        string
  ts_unix?:         number
  action:           'DELEGATE' | 'UNDELEGATE'
  direction:        'in' | 'out'
  nominator_ss58:   string
  nominator_full?:  string
  delegate_ss58?:   string
  delegate_full?:   string
  amount_tao:       number
  amount_usd:       number
  netuid:           number
}

interface Props {
  event:    WhaleFlowEvent | null
  onClose:  () => void
}

// ── helpers ───────────────────────────────────────────────────────────────────
// Day 12: timestamps render in Eastern Time (America/New_York).
function fmtEt(raw: string): string {
  return fmtETDateTime(raw, { seconds: true, year: true })
}

function fmtRelative(raw: string): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    const sec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (sec < 60)       return `${sec}s ago`
    if (sec < 3600)     return `${Math.floor(sec / 60)}m ago`
    if (sec < 86400)    return `${Math.floor(sec / 3600)}h ago`
    return `${Math.floor(sec / 86400)}d ago`
  } catch { return '' }
}

function fmtTao(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M τ'
  if (n >= 1_000)     return (n / 1_000).toFixed(2)    + 'K τ'
  return n.toFixed(4) + ' τ'
}

function fmtUsd(n: number): string {
  if (!n) return '$0'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(2)    + 'K'
  return '$' + n.toFixed(2)
}

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error('Copy failed'))
}

// ── component ─────────────────────────────────────────────────────────────────
export default function WhaleFlowDetailModal({ event, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Lock body scroll while open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [event, onClose])

  if (!event) return null

  const isIn = event.direction === 'in'
  const tone = isIn
    ? { ring: 'ring-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'STAKE ADDED' }
    : { ring: 'ring-red-500/30',     text: 'text-red-400',     bg: 'bg-red-500/10',     label: 'STAKE REMOVED' }

  const coldFull = event.nominator_full ?? event.nominator_ss58
  const hotFull  = event.delegate_full  ?? event.delegate_ss58 ?? ''

  // Taostats deep links — public URLs, no auth required.
  const taostatsBlock   = `https://taostats.io/block/${event.block_number}`
  const taostatsCold    = `https://taostats.io/account/${coldFull}`
  const taostatsHot     = hotFull ? `https://taostats.io/hotkey/${hotFull}` : ''
  const subnetLink      = `/market/subnet/${event.netuid}`

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_.15s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={clsx(
          'relative w-full max-w-2xl max-h-[90vh] overflow-y-auto',
          'rounded-2xl border bg-dark-800 shadow-2xl ring-1',
          'border-dark-600', tone.ring,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-dark-600 bg-dark-800/95 backdrop-blur px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={clsx('rounded-lg p-2 flex-shrink-0', tone.bg)}>
              {isIn
                ? <ArrowDownLeft size={20} className={tone.text} />
                : <ArrowUpRight  size={20} className={tone.text} />
              }
            </div>
            <div className="min-w-0">
              <div className={clsx('text-[10.5px] font-mono uppercase tracking-[0.18em] mb-0.5', tone.text)}>
                {tone.label} · {event.action}
              </div>
              <h2 className="text-lg font-semibold text-white">
                Whale Flow Event
              </h2>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                ID: {event.id}
                {event.extrinsic_id && <> · ext {event.extrinsic_id}</>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-dark-700 transition flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5">

          {/* Hero — amount block */}
          <div className={clsx(
            'rounded-xl border p-5',
            isIn ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-red-800/40 bg-red-950/20',
          )}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-1">
                  Amount
                </div>
                <div className={clsx('text-3xl font-bold tabular-nums', tone.text)}>
                  {isIn ? '+' : '−'}{fmtTao(event.amount_tao)}
                </div>
                {event.amount_usd > 0 && (
                  <div className="text-sm font-mono text-slate-300 mt-1">
                    ≈ {fmtUsd(event.amount_usd)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-1">
                  Subnet
                </div>
                <Link
                  to={subnetLink}
                  state={{ from: '/', label: 'Dashboard' }}
                  className="inline-flex items-center gap-1 text-xl font-bold text-accent-blue hover:underline"
                  onClick={onClose}
                >
                  SN{event.netuid}
                  <ExternalLink size={14} className="opacity-70" />
                </Link>
              </div>
            </div>
          </div>

          {/* Block & timestamp */}
          <div className="grid grid-cols-2 gap-3">
            <DetailRow
              icon={<Layers size={13} />}
              label="Block Number"
              value={event.block_number.toLocaleString()}
              link={taostatsBlock}
              linkLabel="Taostats"
            />
            <DetailRow
              icon={<Clock size={13} />}
              label="Timestamp"
              value={fmtEt(event.timestamp)}
              hint={fmtRelative(event.timestamp)}
            />
          </div>

          {/* Coldkey — nominator (the wallet that initiated) */}
          <Section icon={<User size={12} />} title="Coldkey · Nominator">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-[11.5px] font-mono text-slate-200 break-all">
                {coldFull}
              </code>
              <IconButton onClick={() => copy(coldFull, 'Coldkey')}><Copy size={13} /></IconButton>
              <a href={taostatsCold} target="_blank" rel="noopener noreferrer">
                <IconButton><ExternalLink size={13} /></IconButton>
              </a>
            </div>
          </Section>

          {/* Hotkey — delegate (the validator that received) */}
          {hotFull && (
            <Section icon={<Server size={12} />} title="Hotkey · Delegate">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-[11.5px] font-mono text-slate-200 break-all">
                  {hotFull}
                </code>
                <IconButton onClick={() => copy(hotFull, 'Hotkey')}><Copy size={13} /></IconButton>
                {taostatsHot && (
                  <a href={taostatsHot} target="_blank" rel="noopener noreferrer">
                    <IconButton><ExternalLink size={13} /></IconButton>
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Tx-id row */}
          <Section icon={<Hash size={12} />} title="Event Identifier">
            <div className="grid grid-cols-2 gap-3 text-[11.5px] font-mono">
              <div className="px-3 py-2 rounded-lg bg-dark-900 border border-dark-600">
                <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-0.5">Event ID</div>
                <div className="text-slate-200">{event.id}</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-dark-900 border border-dark-600">
                <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-0.5">Extrinsic</div>
                <div className="text-slate-200">{event.extrinsic_id ?? '—'}</div>
              </div>
            </div>
          </Section>

          {/* Source line */}
          <div className="text-[10.5px] font-mono text-slate-500 border-t border-dark-700 pt-3">
            Sourced via direct Finney WebSocket subscription — every finalized
            block, ≥ 100 τ floor. No third-party API.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── sub-components ────────────────────────────────────────────────────────────
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

function DetailRow({
  icon, label, value, hint, link, linkLabel,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  link?: string
  linkLabel?: string
}) {
  return (
    <div className="rounded-lg border border-dark-600 bg-dark-900/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
        {icon}{label}
      </div>
      <div className="text-sm font-mono text-slate-200 break-all">{value}</div>
      {hint && <div className="text-[10.5px] font-mono text-slate-500 mt-0.5">{hint}</div>}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-mono text-accent-blue hover:underline"
        >
          {linkLabel ?? 'View'} <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

function IconButton({
  children, onClick,
}: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-dark-700 border border-dark-600 transition flex-shrink-0"
      type="button"
    >
      {children}
    </button>
  )
}