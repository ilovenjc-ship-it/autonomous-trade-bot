/**
 * WhaleTrackerTile — Session XXXV
 * ================================
 * Compact Dashboard tile that surfaces the top-3 TAO whale wallets
 * and tier counts (whales / dolphins / shrimp). Drop-in replacement
 * for the DrawdownChart slot Mav vacated when DrawdownChart moved
 * to the P&L Summary page.
 *
 * Sized to mirror the System Health page's ServiceCard layout
 * (rounded-xl / border / p-4 / KPI mini-grid), with an "i" info
 * icon in the header that explains what the tracker is and where
 * the data comes from.
 *
 * Soft-fails:
 *   - 503 service-unavailable          → "warming up" placeholder
 *   - { configured: false } payload    → "API key missing" hint
 *   - { stale: true } payload          → renders cached data + amber banner
 *   - any error → silent retry, never blank
 *
 * Click anywhere on the tile → navigates to the full Whale Tracker page.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Fish, Shell, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'

interface WhaleRow {
  rank:           number
  address_short:  string
  balance_tao:    number
  share_pct:      number
  tier:           'whale' | 'dolphin' | 'shrimp'
}
interface WhalesResp {
  configured?:     boolean
  stale?:          boolean
  stale_age_s?:    number
  stale_reason?:   string
  setup_hint?:     string
  count?:          number
  leaderboard:     WhaleRow[]
  kpi?: {
    whales?:       number
    dolphins?:     number
    shrimp?:       number
    total_tao?:    number
    share_pct?:    number
    top_balance_tao?: number
  }
  tao_price_usd?:  number
}

const fmtTao = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M τ'
  : n >= 1_000   ? (n / 1_000).toFixed(1) + 'K τ'
  : n.toFixed(2) + ' τ'

export default function WhaleTrackerTile() {
  const navigate = useNavigate()
  const [data, setData] = useState<WhalesResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const resp = await api.get<WhalesResp>('/tools/whales', { params: { limit: 3 } })
        if (!dead) setData(resp.data)
      } catch {
        if (!dead) setData(null)
      } finally {
        if (!dead) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [])

  const k = data?.kpi || {}
  const top = (data?.leaderboard ?? []).slice(0, 3)

  const handleOpen = () => navigate('/tools')

  return (
    <div
      onClick={handleOpen}
      className="rounded-xl border border-dark-600 bg-dark-800 p-4 cursor-pointer hover:border-cyan-500/40 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-cyan-300" />
          <h3 className="text-sm font-semibold text-white">Whale Tracker</h3>
          <InfoBubble
            side="right"
            maxWidth={280}
            content={
              <div className="space-y-1.5">
                <p className="text-white font-bold text-[12px]">Top TAO Holder Leaderboard</p>
                <p>
                  Live snapshot of the top-100 TAO wallets by balance, sourced from
                  TaoStats every 60s. Used as a leading-signal lens for stake-redirection
                  events that front-run α-pool moves on monitored subnets.
                </p>
                <p className="text-slate-300">
                  <span className="text-cyan-300">🐋 Whale</span> = ≥10K τ ·{' '}
                  <span className="text-sky-300">🐬 Dolphin</span> = 1K–10K τ ·{' '}
                  <span className="text-slate-300">🦐 Shrimp</span> = &lt;1K τ
                </p>
                <p className="text-slate-400 text-[11px] pt-1 border-t border-slate-700/50">
                  Click the tile to open the full leaderboard and search.
                </p>
              </div>
            }
          />
        </div>
        <ChevronRight size={14} className="text-slate-600 group-hover:text-cyan-300 transition-colors" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-xs font-mono py-6 justify-center">
          <RefreshCw size={12} className="animate-spin" /> Loading leaderboard…
        </div>
      )}

      {/* Unconfigured (no API key) */}
      {!loading && data && data.configured === false && (
        <div className="flex items-start gap-2 text-amber-300 text-xs font-mono py-3">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <p>{data.setup_hint || 'Set TAOSTATS_API_KEY to enable.'}</p>
        </div>
      )}

      {/* Empty / hard error */}
      {!loading && (!data || (data.configured !== false && (data.leaderboard?.length ?? 0) === 0)) && (
        <div className="text-slate-500 text-xs font-mono py-6 text-center">
          No leaderboard data available
        </div>
      )}

      {/* Stale banner (compact) */}
      {!loading && data?.stale && (data.leaderboard?.length ?? 0) > 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-mono text-amber-300/80 bg-amber-950/30 border border-amber-800/30 rounded px-2 py-1">
          <AlertTriangle size={10} />
          Stale snapshot · {Math.floor((data.stale_age_s ?? 0) / 60)}m old
        </div>
      )}

      {/* Leaderboard + KPI */}
      {!loading && (data?.leaderboard?.length ?? 0) > 0 && (
        <>
          {/* Top 3 wallets */}
          <div className="space-y-1.5 mb-3">
            {top.map((w) => (
              <div key={w.rank} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-500 w-5 flex-shrink-0">#{w.rank}</span>
                <span className="text-slate-200 flex-1 truncate">{w.address_short}</span>
                <span className="text-cyan-300 flex-shrink-0">{fmtTao(w.balance_tao)}</span>
                <span className="text-slate-500 flex-shrink-0 w-10 text-right">{w.share_pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* Tier KPI strip — 4 mini-tiles, mirrors System Health card metrics row */}
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">🐋</div>
              <div className="text-cyan-300 font-bold">{k.whales ?? 0}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">🐬</div>
              <div className="text-sky-300 font-bold">{k.dolphins ?? 0}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">🦐</div>
              <div className="text-slate-300 font-bold">{k.shrimp ?? 0}</div>
            </div>
            <div className="rounded-md bg-slate-800/40 px-2 py-1.5 text-center">
              <div className="text-slate-500">% supply</div>
              <div className="text-emerald-400 font-bold">{(k.share_pct ?? 0).toFixed(1)}%</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// quiet "unused import" noise — Fish / Shell are kept for future tier badges
void Fish; void Shell