/**
 * TickerTape — always-visible bottom strip on every page.
 *
 * Shows: TAO/USD price + 24h change · top subnet tickers with APY & trend
 * Infinite CSS scroll — no JS animation loop, zero jank.
 * Refreshes data every 30 seconds.
 */
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react'
import clsx from 'clsx'

interface TickerItem {
  key: string
  label: string
  value: string
  change?: string
  up?: boolean | null   // null = neutral
  highlight?: boolean
}

// ── CSS keyframe injected once ────────────────────────────────────────────────
const STYLE_ID = 'ticker-tape-style'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes ticker-scroll {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .ticker-track {
      display: flex;
      width: max-content;
      animation: ticker-scroll 60s linear infinite;
    }
    .ticker-track:hover { animation-play-state: paused; }
  `
  document.head.appendChild(s)
}

// ── pill ──────────────────────────────────────────────────────────────────────
function Pill({ item }: { item: TickerItem }) {
  const color =
    item.up === true  ? 'text-accent-green' :
    item.up === false ? 'text-red-400'       :
                        'text-slate-300'

  const Icon = item.up === true ? TrendingUp : item.up === false ? TrendingDown : Minus

  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-3 whitespace-nowrap',
      item.highlight && 'text-yellow-300',
    )}>
      <Icon size={10} className={item.highlight ? 'text-yellow-300' : color} />
      <span className="text-[10px] font-mono text-slate-400">{item.label}</span>
      <span className={clsx('text-[11px] font-mono font-bold', item.highlight ? 'text-yellow-300' : color)}>
        {item.value}
      </span>
      {item.change && (
        <span className={clsx('text-[10px] font-mono', color)}>
          {item.change}
        </span>
      )}
      {/* separator dot */}
      <span className="text-dark-600 ml-1 select-none">·</span>
    </span>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([])

  useEffect(() => { ensureStyles() }, [])

  const fetchData = async () => {
    try {
      const [priceRes, subnetRes] = await Promise.all([
        fetch('/api/price/current').then(r => r.json()).catch(() => null),
        fetch('/api/market/subnets?limit=12').then(r => r.json()).catch(() => null),
      ])

      const next: TickerItem[] = []

      // TAO price — always first, highlighted
      if (priceRes) {
        const p = priceRes.price_usd ?? priceRes.price ?? null
        const chg = priceRes.price_change_pct_24h ?? priceRes.price_change_24h ?? null
        const up = chg != null ? chg >= 0 : null
        next.push({
          key: 'tao',
          label: 'TAO/USD',
          value: p != null ? `$${p.toFixed(2)}` : '—',
          change: chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : undefined,
          up,
          highlight: true,
        })
      }

      // Top subnets
      if (subnetRes?.subnets) {
        for (const s of subnetRes.subnets.slice(0, 12)) {
          next.push({
            key: `sn-${s.uid}`,
            label: `SN${s.uid} ${s.name.slice(0, 8)}`,
            value: `APY ${s.apy.toFixed(1)}%`,
            change: `${(s.stake_tao / 1e6).toFixed(1)}M τ`,
            up: s.trend === 'up' ? true : s.trend === 'down' ? false : null,
          })
        }
      }

      if (next.length > 0) setItems(next)
    } catch (e) {
      console.error('TickerTape fetch error', e)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [])

  if (items.length === 0) return null

  // Duplicate items so the loop is seamless
  const doubled = [...items, ...items]

  return (
    <div className="flex-shrink-0 h-7 bg-dark-950 border-t border-dark-700/80 flex items-center overflow-hidden relative"
      style={{ background: '#070d14' }}>

      {/* left badge */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 h-full
                      bg-accent-green/10 border-r border-accent-green/20 z-10">
        <Zap size={10} className="text-accent-green" />
        <span className="text-[9px] font-mono font-bold text-accent-green tracking-widest uppercase">
          Live
        </span>
      </div>

      {/* scrolling track */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <Pill key={`${item.key}-${i}`} item={item} />
          ))}
        </div>
      </div>

      {/* right fade mask */}
      <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to right, transparent, #070d14)' }} />
    </div>
  )
}