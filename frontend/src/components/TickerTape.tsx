/**
 * TickerTape — always-visible bottom strip on every page.
 *
 * Shows: TAO/USD (highlighted) + all major crypto assets whose market cap
 * exceeds Bittensor TAO's — data from CoinGecko public API via backend proxy.
 *
 * Infinite CSS scroll, zero JS animation loop, zero jank.
 * Refreshes every 90 s (backend caches to respect CoinGecko free tier).
 */
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react'
import clsx from 'clsx'

interface TickerItem {
  key: string
  symbol: string
  name: string
  price: number
  change24h: number | null
  highlight?: boolean   // TAO — yellow treatment
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
      animation: ticker-scroll 80s linear infinite;
    }
    .ticker-track:hover { animation-play-state: paused; }
  `
  document.head.appendChild(s)
}

// ── pill ──────────────────────────────────────────────────────────────────────
function Pill({ item }: { item: TickerItem }) {
  const chg = item.change24h
  const up: boolean | null = chg === null ? null : chg >= 0
  const color = item.highlight
    ? 'text-yellow-300'
    : up === true  ? 'text-emerald-400'
    : up === false ? 'text-red-400'
    : 'text-slate-300'

  const Icon = up === true ? TrendingUp : up === false ? TrendingDown : Minus

  // Format price nicely
  const fmtPrice = (p: number) =>
    p >= 10_000 ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : p >= 100   ? `$${p.toFixed(2)}`
    : p >= 1     ? `$${p.toFixed(3)}`
    :              `$${p.toFixed(5)}`

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-3 whitespace-nowrap', color)}>
      <Icon size={10} className={color} />
      <span className="text-[13px] font-mono text-slate-400">{item.symbol}</span>
      <span className={clsx('text-[14px] font-mono font-bold', color)}>
        {fmtPrice(item.price)}
      </span>
      {chg !== null && (
        <span className={clsx('text-[12px] font-mono', color)}>
          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
        </span>
      )}
      <span className="text-slate-700 ml-1 select-none">·</span>
    </span>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([])

  useEffect(() => { ensureStyles() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/market/crypto-ticker').then(r => r.json()).catch(() => null)
      if (!res?.coins?.length) return

      const next: TickerItem[] = res.coins.map((c: any) => ({
        key:       c.id,
        symbol:    c.symbol,
        name:      c.name,
        price:     c.price ?? 0,
        change24h: c.change_24h ?? null,
        highlight: c.highlight ?? false,
      }))

      if (next.length > 0) setItems(next)
    } catch (e) {
      console.error('TickerTape fetch error', e)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 90_000)
    return () => clearInterval(id)
  }, [])

  if (items.length === 0) return null

  // Duplicate for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="flex-shrink-0 h-8 bg-dark-950 border-t border-dark-700/80 flex items-center overflow-hidden relative"
      style={{ background: '#060c13' }}>

      {/* left badge */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 h-full
                      bg-emerald-500/8 border-r border-emerald-500/20 z-10">
        <Zap size={10} className="text-emerald-400" />
        <span className="text-[12px] font-mono font-bold text-emerald-400 tracking-widest uppercase">
          Crypto
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
      <div className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to right, transparent, #060c13)' }} />
    </div>
  )
}