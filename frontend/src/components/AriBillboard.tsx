/**
 * AriBillboard.tsx — Day 16 (Mark + Ari, Session XLVII)
 *
 * "Messages from Ari" — a curated slideshow that lives inside the Chat Window
 * on the Ari page. Mark's framing: *"This can be a Bigger way for Ari to Connect
 * with user/operator."*
 *
 * Design contract (locked Day 16 morning):
 *   • 14 curated messages across 4 movements (Identity / Category / Doctrine / Safety)
 *   • 9-second cadence per slide (Mark's favorite number)
 *   • Auto-rotate with crossfade
 *   • Dot indicators — click any dot to jump
 *   • Pause-on-current-slide button (icon toggle)
 *   • Respects `prefers-reduced-motion` (no fade when reduced)
 *   • Keyboard: ← → arrows when focused; Space toggles pause
 *
 * Doctrinal note:
 *   The message list embodies D-45 (Project Ari does not disclaim its own behavior;
 *   the agent IS the product). The voice is first-person-plural for the team's
 *   commitments, third-person agentic for Ari's actions. AP-9 / AP-1 binding.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import clsx from 'clsx'

// ─────────────────────────────────────────────────────────────────────────────
// Curated messages — 14 picks across 4 movements
//
// Order is deliberate. A first-time viewer who only catches Movements I+II
// understands what Ari IS. A repeat viewer who catches III+IV sees the
// standard we're held to. Both halves stand alone.
// ─────────────────────────────────────────────────────────────────────────────

export type BillboardMovement = 'identity' | 'category' | 'doctrine' | 'safety'

export interface BillboardMessage {
  text: string
  movement: BillboardMovement
}

export const ARI_BILLBOARD_MESSAGES: BillboardMessage[] = [
  // I. Identity — who Ari is
  { movement: 'identity', text: 'Ari is Hebrew for "lion" — quiet authority, watchfulness, courage.' },
  { movement: 'identity', text: 'Ari is the watchful one.' },
  { movement: 'identity', text: 'Ari watches with you.' },
  { movement: 'identity', text: 'Ari is a presence that watches alongside you, not a switch you flip on.' },

  // II. Category — Ari vs. the marketplace stance
  { movement: 'category', text: 'Robinhood is the rails. You bring the brain. Project Ari is the opposite stance — we are the brain.' },
  { movement: 'category', text: "We don't ask the user to bring intelligence. We are the intelligence. The user brings trust and a wallet." },
  { movement: 'category', text: "Ari isn't a marketplace. Ari is the agent." },
  { movement: 'category', text: 'The Bittensor ecosystem is a maze. You need a Guide — a watchful eye, a Navigator. You need a Lion. You need Ari.' },

  // III. Doctrine — D-45, the moat
  { movement: 'doctrine', text: 'Project Ari does not disclaim its own behavior. The agent is the product. We own how Ari behaves — including mistakes. This is a competitive moat, not a liability.' },
  { movement: 'doctrine', text: "We're different over here." },
  { movement: 'doctrine', text: 'Ari is orchestrated on a single-architect frame: one orchestrator, one operator, strategies competing for capital — not emissions. We are not a Subnet.' },

  // IV. Safety — the promise
  { movement: 'safety', text: 'Ari will only touch the bucket you give it.' },
  { movement: 'safety', text: 'Roadmap for Safety: separate account buckets · per-trade notifications · live P&L visibility · one-tap disconnect · spending limits.' },
  { movement: 'safety', text: 'We don\'t say "Let Ari trade." We\'d never say that. Ari isn\'t switched on — Ari watches with you.' },
]

// Movement → display label + accent color
const MOVEMENT_META: Record<BillboardMovement, { label: string; accent: string; dot: string }> = {
  identity: { label: 'I · IDENTITY',  accent: 'text-amber-300',   dot: 'bg-amber-400' },
  category: { label: 'II · CATEGORY', accent: 'text-emerald-300', dot: 'bg-emerald-400' },
  doctrine: { label: 'III · DOCTRINE', accent: 'text-cyan-300',   dot: 'bg-cyan-400' },
  safety:   { label: 'IV · SAFETY',   accent: 'text-purple-300',  dot: 'bg-purple-400' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface AriBillboardProps {
  /** Cadence in milliseconds. Default 9000 (Mark's favorite number). */
  intervalMs?: number
  /** Optional override of the message list (testing). */
  messages?: BillboardMessage[]
  /** Optional className passthrough. */
  className?: string
}

export function AriBillboard({
  intervalMs = 9000,
  messages = ARI_BILLBOARD_MESSAGES,
  className,
}: AriBillboardProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Respect prefers-reduced-motion — no crossfade if user opts out.
  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Advance helper — wraps with modulo, used by interval + dots + arrows.
  const goTo = useCallback(
    (next: number) => {
      const len = messages.length
      const idx = ((next % len) + len) % len
      setActiveIdx(idx)
    },
    [messages.length],
  )

  const next = useCallback(() => goTo(activeIdx + 1), [activeIdx, goTo])
  const prev = useCallback(() => goTo(activeIdx - 1), [activeIdx, goTo])

  // Auto-rotate — pauses when isPaused is true.
  useEffect(() => {
    if (isPaused) return
    const id = window.setInterval(() => {
      setActiveIdx(i => (i + 1) % messages.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [isPaused, intervalMs, messages.length])

  // Keyboard navigation when focused.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        setIsPaused(p => !p)
      }
    },
    [next, prev],
  )

  if (messages.length === 0) return null
  const msg = messages[activeIdx]
  const meta = MOVEMENT_META[msg.movement]

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Messages from Ari"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={clsx(
        // Day 16 — relocated ABOVE the Chat window per Mark's spec ("first
        // thing the user/operator sees"). Now a self-contained card with its
        // own emerald border + rounded corners, instead of a section inside
        // the chat panel. Text bumped up for billboard-scale presence.
        'relative px-6 py-5 rounded-2xl border border-emerald-500/25 mb-4',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/40',
        className,
      )}
      style={{
        // Match the Chat panel's gradient so the two cards feel like a pair
        // (billboard speaks → operator chats).
        background: 'linear-gradient(180deg, #0d1525 0%, #0a1020 100%)',
      }}
    >
      {/* Top row: movement label + pause/play toggle */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={clsx(
            'text-[11px] font-mono tracking-[0.18em] uppercase',
            meta.accent,
          )}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {String(activeIdx + 1).padStart(2, '0')} / {String(messages.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={() => setIsPaused(p => !p)}
            aria-label={isPaused ? 'Resume billboard rotation' : 'Pause on current slide'}
            title={isPaused ? 'Resume rotation' : 'Pause on this slide'}
            className={clsx(
              'w-6 h-6 rounded-md flex items-center justify-center',
              'border transition-colors duration-150',
              isPaused
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-slate-600/40 bg-slate-700/20 text-slate-400 hover:text-slate-200 hover:border-slate-500/60',
            )}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        </div>
      </div>

      {/* The slide itself — fixed min-height keeps the layout from jumping
          as message lengths vary across the 14-card rotation. Billboard-
          scale type (Day 16: bumped from 15px → 20px when relocated above
          the chat window). */}
      <div className="relative" style={{ minHeight: '88px' }}>
        <p
          key={activeIdx}
          className={clsx(
            'text-[20px] leading-relaxed text-slate-50 font-semibold tracking-tight',
            // Crossfade in (skipped for prefers-reduced-motion users).
            reduceMotion ? '' : 'animate-billboard-fade',
          )}
        >
          {msg.text}
        </p>
      </div>

      {/* Dot row — clickable jumps. Active dot uses the movement's accent
          color so the rhythm of the four movements is visible at a glance. */}
      <div className="flex items-center gap-1.5 mt-3">
        {messages.map((m, i) => {
          const dotMeta = MOVEMENT_META[m.movement]
          const isActive = i === activeIdx
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show message ${i + 1} of ${messages.length} — ${dotMeta.label}`}
              aria-current={isActive ? 'true' : 'false'}
              className={clsx(
                'rounded-full transition-all duration-200',
                isActive
                  ? `w-4 h-1.5 ${dotMeta.dot}`
                  : 'w-1.5 h-1.5 bg-slate-600/50 hover:bg-slate-500',
              )}
            />
          )
        })}
        {isPaused && (
          <span className="ml-2 text-[10px] font-mono text-amber-400/80 tracking-wider">
            PAUSED
          </span>
        )}
      </div>
    </div>
  )
}

export default AriBillboard