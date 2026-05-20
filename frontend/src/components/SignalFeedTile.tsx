/**
 * SignalFeedTile — Session XXXIX (Day 6)
 * =======================================
 * Compact Dashboard tile that surfaces the live community / news / on-chain
 * signal stream — the same `kind="signal"` events that the Activity Log
 * page renders, but distilled into a sentiment-row strip alongside the
 * Sentiment Gauge and Live Indicators.
 *
 * Powered sources (post-Session XXXIX Perplexity removal):
 *   coingecko    — TAO/USD spot price + 24h momentum     (60s,  no auth)
 *   reddit_rss   — r/bittensor_ community sentiment      (5min, no auth)
 *   taodaily_rss — TaoDaily ecosystem / subnet news      (30min, no auth)
 *   taostats     — Subnet alpha price + staking events   (60s,  optional API key)
 *   discord      — Bittensor server announcements        (WS,   pending OTF invite)
 *
 * Mark, Day 6: "Wire it to account w/ highest traffic or best signal for
 * the App". CoinGecko fires every 60s and is the highest-cadence source;
 * TaoDaily / Reddit / Discord deliver the qualitative narrative. We render
 * the unified stream rather than picking one — operator gets the whole
 * signal surface in one tile and can read at a glance which sources are
 * actively producing.
 *
 * Twitter/X is *not* wired:  the X API now starts at $100+/month for the
 * basic tier and Mark just told us to drop paid feeds (Perplexity).  When
 * a free-tier social-listening source becomes available it slots into the
 * same activity stream — this tile picks it up automatically.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Radio, Newspaper, MessageCircle, Coins, Link2, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'
import SignalEventDetailModal, { type SignalEvent } from '@/components/SignalEventDetailModal'

// ── Types — mirror /api/fleet/activity payload shape ────────────────────────
interface ActivityEvent {
  id:        number
  kind:      'trade' | 'signal' | 'gate' | 'system' | 'alert'
  message:   string
  strategy?: string | null
  detail?:   string
  timestamp: string
}

interface ActivityResp {
  events: ActivityEvent[]
  total:  number
}

// ── Source classification ───────────────────────────────────────────────────
// Signal events embed the source in their `detail` field as
//   "source:reddit_rss | …"   or   "source:coingecko | …"
// Same convention used by signal_ingestor.py.  We pull the source token out
// to drive icon / color / label.
type Source =
  | 'coingecko'
  | 'reddit_rss'
  | 'taodaily_rss'
  | 'taostats'
  | 'discord'
  | 'unknown'

interface SourceMeta {
  label: string
  Icon:  any
  cls:   string
}

const SOURCE_META: Record<Source, SourceMeta> = {
  coingecko:    { label: 'CoinGecko', Icon: Coins,         cls: 'text-amber-400'  },
  reddit_rss:   { label: 'Reddit',    Icon: MessageCircle, cls: 'text-orange-400' },
  taodaily_rss: { label: 'TaoDaily',  Icon: Newspaper,     cls: 'text-sky-400'    },
  taostats:     { label: 'Taostats',  Icon: Link2,         cls: 'text-purple-400' },
  discord:      { label: 'Discord',   Icon: MessageCircle, cls: 'text-indigo-400' },
  unknown:      { label: 'Signal',    Icon: Radio,         cls: 'text-slate-400'  },
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

function timeAgoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function SignalFeedTile() {
  const [events,        setEvents]        = useState<ActivityEvent[]>([])
  const [loading,       setLoading]       = useState(true)
  const [stale,         setStale]         = useState(false)
  // Session XL (Day 7): click-to-detail — selected event drives the modal.
  const [selectedEvent, setSelectedEvent] = useState<SignalEvent | null>(null)

  const load = async () => {
    try {
      // Pull a generous page so we still have ≥ N signal events after
      // filtering out trades / system / gate / alert kinds. The activity
      // endpoint sorts newest-first.
      const r = await api.get<ActivityResp>('/fleet/activity', { params: { limit: 80 } })
      const sigs = (r.data.events ?? []).filter(e => e.kind === 'signal').slice(0, 24)
      setEvents(sigs)
      setStale(false)
    } catch {
      setStale(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  // Source breakdown — drives the bottom KPI strip.
  const stats = useMemo(() => {
    const counts: Record<Source, number> = {
      coingecko: 0, reddit_rss: 0, taodaily_rss: 0, taostats: 0, discord: 0, unknown: 0,
    }
    for (const e of events) counts[detectSource(e.detail, e.message)] += 1
    const live = Object.entries(counts).filter(([k, v]) => v > 0 && k !== 'unknown').length
    return { counts, sources: live }
  }, [events])

  return (
    <div className="rounded-xl border border-dark-600 bg-dark-800 p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-accent-blue" />
          <h3 className="text-sm font-semibold text-white">Signal Feed</h3>
          <InfoBubble
            side="right"
            maxWidth={300}
            content={
              <div className="space-y-1.5">
                <p className="text-white font-bold text-[12px]">Inbound Signal Stream</p>
                <p>
                  Live feed of community / news / on-chain signals — the same
                  events the Activity Log page surfaces, distilled here for
                  at-a-glance sentiment context alongside the Market Sentiment
                  gauge and Live Indicators.
                </p>
                <p className="text-slate-300 text-[11px]">
                  Sources: <span className="text-amber-400">CoinGecko</span> ·{' '}
                  <span className="text-orange-400">Reddit</span> ·{' '}
                  <span className="text-sky-400">TaoDaily</span> ·{' '}
                  <span className="text-purple-400">Taostats</span> ·{' '}
                  <span className="text-indigo-400">Discord</span>{' '}
                  (when OTF invite lands)
                </p>
                <p className="text-slate-400 text-[10.5px] border-t border-slate-700/50 pt-1">
                  Configure feeds + API keys on the Activity Log page →
                  Signal Feeds drawer. Twitter/X intentionally not wired
                  (paid API tier).
                </p>
              </div>
            }
          />
        </div>
        <div className="flex items-center gap-1.5">
          {stale ? (
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
          <RefreshCw size={12} className="animate-spin" /> Loading signal feed…
        </div>
      )}

      {/* Empty */}
      {!loading && events.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono py-6 text-center px-4">
          No signal events yet · feeds warming up
        </div>
      )}

      {/* Event list */}
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
            {events.map((e) => {
              const src  = detectSource(e.detail, e.message)
              const meta = SOURCE_META[src]
              const Icon = meta.Icon
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelectedEvent(e)}
                  className="w-full flex items-center gap-2 text-xs font-mono px-2 py-1
                             rounded-md hover:bg-dark-700/60 hover:ring-1 hover:ring-dark-500/50
                             transition-all group cursor-pointer text-left
                             focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
                  title={`Event #${e.id} — click for full detail`}
                  aria-label={`Open detail for event #${e.id}: ${e.message}`}
                >
                  <Icon size={11} className={clsx('flex-shrink-0', meta.cls)} />
                  <span className={clsx('w-16 flex-shrink-0 text-[10px] uppercase tracking-wider', meta.cls)}>
                    {meta.label}
                  </span>
                  <span className="text-slate-200 flex-1 truncate group-hover:text-white">
                    {e.message}
                  </span>
                  {/* Event ID — dim power-user reference so rows can be cited
                      without opening the modal. Brightens slightly on hover. */}
                  <span
                    className="text-slate-600 flex-shrink-0 text-[9.5px] tabular-nums tracking-tight
                               group-hover:text-slate-400 transition-colors"
                    aria-hidden="true"
                  >
                    #{e.id}
                  </span>
                  <span className="text-slate-500 flex-shrink-0 text-[10px] tabular-nums group-hover:text-slate-300">
                    {timeAgoShort(e.timestamp)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* KPI strip — events + active sources */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Events</div>
              <div className="text-slate-200 font-bold">{events.length}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Sources</div>
              <div className="text-accent-blue font-bold">{stats.sources}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">Window</div>
              <div className="text-slate-200 font-bold">recent</div>
            </div>
          </div>
        </>
      )}

      {/* Session XL (Day 7): click-to-detail modal — portal-mounted to body */}
      <SignalEventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  )
}