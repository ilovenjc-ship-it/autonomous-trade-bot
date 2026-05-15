/**
 * CexListingHeroStrip — surfaces fresh CEX listing detections at the top
 * of Mission Control so they pop the moment they fire.
 *
 * Session XXXVII — Phase E (alert routing).
 *
 * Behaviour:
 *  • Polls /market/cex-listings every 30s (no force — uses the in-memory
 *    cache from the 10-min RSS poll loop).
 *  • Shows the most-recent hit detected within the last LIVE_WINDOW_MS
 *    (default 6 hours).  Anything older is treated as stale and the
 *    strip hides itself.
 *  • If multiple "live" hits exist, auto-rotates every 8s.
 *  • Pulsing exchange chip + breathing border accent until the operator
 *    dismisses it via the × button.  Dismissal is per-guid and persists
 *    in localStorage so it doesn't reappear on refresh.
 *  • On click of the title, opens the CEX article in a new tab.
 *  • Soft-fail: if /market/cex-listings is unreachable or empty, the
 *    component renders nothing (returns null) — no broken UI on cold
 *    startups.
 *
 * Layout: full-width 36-44px tall strip designed to sit ABOVE the Top
 * Subnets bar.  Uses a deep-cyan gradient with a thin animated bottom
 * border so it reads as a "alert lane" without being shouty.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { Megaphone, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

// ── Types (mirror backend response) ──────────────────────────────────────────
interface CexHit {
  exchange:         string
  guid:             string
  title:            string
  link:             string
  summary:          string
  published:        string
  matched_keywords: string[]
  detected_at:      string  // ISO8601 UTC
}
interface CexListingsResp {
  hits:               CexHit[]
  hit_count:          number
  last_fetch_at:      string | null
  refresh_interval_s: number
}

// ── Tunables ─────────────────────────────────────────────────────────────────
const POLL_MS         = 30_000        // 30s API poll
const ROTATE_MS       =  8_000        // 8s between hits if multiple live
const LIVE_WINDOW_MS  =  6 * 3600_000 // anything detected ≤ 6h ago is "live"
const PULSE_FRESH_MS  =  5 * 60_000   // pulse the chip if detected ≤ 5 min ago
const DISMISS_KEY     = 'cex_hero_dismissed_v1'

// Per-exchange accent colour (subtle differentiation in the chip).
const EXCHANGE_ACCENT: Record<string, string> = {
  Coinbase:    'text-blue-300 bg-blue-500/15 border-blue-400/30',
  Kraken:      'text-purple-300 bg-purple-500/15 border-purple-400/30',
  'Crypto.com':'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
}
const DEFAULT_ACCENT = 'text-cyan-300 bg-cyan-500/15 border-cyan-400/30'


// ── Helpers ──────────────────────────────────────────────────────────────────

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    // Cap stored guids at 200 so the key doesn't grow unbounded.
    const arr = Array.from(set).slice(-200)
    localStorage.setItem(DISMISS_KEY, JSON.stringify(arr))
  } catch {
    /* swallow — quota / private mode */
  }
}

function ageMs(iso: string): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Date.now() - t
}

function fmtRelative(iso: string): string {
  const ms = ageMs(iso)
  const m = Math.floor(ms / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}


// ── Component ────────────────────────────────────────────────────────────────

export default function CexListingHeroStrip() {
  const [hits,        setHits]        = useState<CexHit[]>([])
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [dismissed,   setDismissed]   = useState<Set<string>>(loadDismissed)
  const dismissedRef = useRef(dismissed)
  dismissedRef.current = dismissed

  // ── Fetch loop ────────────────────────────────────────────────────────────
  const fetchHits = useCallback(async () => {
    try {
      const data = await api
        .get<CexListingsResp>('/market/cex-listings')
        .then((r) => r.data)
      const live = (data?.hits ?? [])
        .filter((h) => h && h.guid)
        .filter((h) => ageMs(h.detected_at) <= LIVE_WINDOW_MS)
        .filter((h) => !dismissedRef.current.has(h.guid))
        // Newest first.
        .sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at))
      setHits(live)
      // Snap activeIdx back to 0 when new hits arrive (most recent on top).
      setActiveIdx((prev) => (prev >= live.length ? 0 : prev))
    } catch {
      // Soft-fail: leave previous hits in place; if no prior hits, the
      // strip simply stays hidden.
    }
  }, [])

  useEffect(() => {
    fetchHits()
    const id = setInterval(fetchHits, POLL_MS)
    return () => clearInterval(id)
  }, [fetchHits])

  // ── Auto-rotate when multiple live hits ───────────────────────────────────
  useEffect(() => {
    if (hits.length <= 1) return
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % hits.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [hits.length])

  // ── Dismiss handler ───────────────────────────────────────────────────────
  const dismiss = useCallback((guid: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(guid)
      saveDismissed(next)
      return next
    })
    // Optimistically drop the hit from the visible list.
    setHits((prev) => prev.filter((h) => h.guid !== guid))
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  if (hits.length === 0) return null
  const active = hits[activeIdx]
  if (!active) return null

  const accent  = EXCHANGE_ACCENT[active.exchange] ?? DEFAULT_ACCENT
  const isFresh = ageMs(active.detected_at) <= PULSE_FRESH_MS

  return (
    <div
      className={clsx(
        'flex-shrink-0 relative overflow-hidden rounded-xl border',
        // Cyan accent on a deep gradient — reads as an "alert lane" without
        // being shouty.  Matches the existing Research page feed-card vibe.
        'border-cyan-500/30 bg-gradient-to-r from-cyan-900/40 via-slate-900/60 to-slate-900/40',
        // Subtle breathe when the active hit is fresh.
        isFresh && 'animate-pulse-slow',
      )}
      data-testid="cex-listing-hero"
    >
      {/* Accent line at the very top — stronger when fresh */}
      <div className={clsx(
        'absolute top-0 left-0 right-0 h-0.5 rounded-t-xl',
        isFresh ? 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent' : 'bg-cyan-500/20',
      )} />

      <div className="flex items-center gap-3 px-4 py-2">
        {/* Megaphone icon */}
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center">
          <Megaphone size={14} className={clsx('text-cyan-300', isFresh && 'animate-pulse')} />
        </div>

        {/* Label + count */}
        <div className="flex-shrink-0 flex flex-col leading-tight">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-200/80">CEX Listing Watch</span>
          <span className="text-[10px] font-mono text-slate-500">
            {hits.length} live {hits.length === 1 ? 'hit' : 'hits'} · last {LIVE_WINDOW_MS / 3600_000}h
          </span>
        </div>

        {/* Exchange chip */}
        <span className={clsx(
          'flex-shrink-0 text-[11px] font-mono px-2 py-0.5 rounded border',
          accent,
          isFresh && 'animate-pulse',
        )}>
          {active.exchange}
        </span>

        {/* Title — clickable, links to article */}
        <a
          href={active.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 group flex items-center gap-1.5"
          title={active.title}
        >
          <span className="truncate text-[13px] text-slate-100 group-hover:text-cyan-200 transition-colors">
            {active.title}
          </span>
          <ExternalLink size={11} className="flex-shrink-0 text-slate-500 group-hover:text-cyan-400 transition-colors" />
        </a>

        {/* Matched keywords — first 3 only */}
        {active.matched_keywords.slice(0, 3).length > 0 && (
          <div className="hidden md:flex flex-shrink-0 items-center gap-1">
            {active.matched_keywords.slice(0, 3).map((k) => (
              <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/60 text-slate-400">
                {k}
              </span>
            ))}
          </div>
        )}

        {/* Time ago */}
        <span className="flex-shrink-0 text-[11px] font-mono text-slate-500 hidden sm:inline">
          {fmtRelative(active.detected_at)}
        </span>

        {/* Rotation controls — only if >1 live hit */}
        {hits.length > 1 && (
          <div className="flex-shrink-0 flex items-center gap-0.5 ml-1">
            <button
              onClick={() => setActiveIdx((i) => (i - 1 + hits.length) % hits.length)}
              className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-cyan-300 transition-colors"
              title="Previous hit"
              aria-label="Previous hit"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums w-8 text-center">
              {activeIdx + 1}/{hits.length}
            </span>
            <button
              onClick={() => setActiveIdx((i) => (i + 1) % hits.length)}
              className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-cyan-300 transition-colors"
              title="Next hit"
              aria-label="Next hit"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={() => dismiss(active.guid)}
          className="flex-shrink-0 p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-red-300 transition-colors"
          title="Dismiss this listing"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}