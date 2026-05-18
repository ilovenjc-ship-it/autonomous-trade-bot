/**
 * RegimeCard — Session XXXVIII
 * ============================
 * The big "Market Regime" card (icon + label + TAO price + RSI). Originally
 * lived as a private helper inside pages/IIAgent.tsx. Mav relocated the
 * card from II Agent → Manual Trades in Session XXXVIII, so this lives
 * in shared components and both pages import from here.
 *
 * Tooltip moves with the card (per Mav: "Keep all tooltips and use at next
 * location"). The InfoBubble explains what regime means and how it's set.
 */
import clsx from 'clsx'
import {
  TrendingUp, TrendingDown, Minus, Zap, Activity,
} from 'lucide-react'
import { InfoBubble } from './Tooltip'

export const REGIME_CONFIG: Record<
  string,
  { icon: typeof TrendingUp; label: string; glow: string; bg: string; text: string }
> = {
  BULL:     { icon: TrendingUp,   label: 'BULL MARKET', glow: 'shadow-emerald-500/30', bg: 'bg-emerald-500/10 border-emerald-500/40', text: 'text-emerald-400' },
  BEAR:     { icon: TrendingDown, label: 'BEAR MARKET', glow: 'shadow-red-500/30',     bg: 'bg-red-500/10 border-red-500/40',         text: 'text-red-400'     },
  SIDEWAYS: { icon: Minus,        label: 'SIDEWAYS',    glow: 'shadow-amber-500/30',   bg: 'bg-amber-500/10 border-amber-500/40',     text: 'text-amber-400'   },
  VOLATILE: { icon: Zap,          label: 'VOLATILE',    glow: 'shadow-purple-500/30',  bg: 'bg-purple-500/10 border-purple-500/40',   text: 'text-purple-400'  },
  UNKNOWN:  { icon: Activity,     label: 'SCANNING…',   glow: 'shadow-slate-500/20',   bg: 'bg-slate-700/30 border-slate-600/40',     text: 'text-slate-300'   },
}

function PulseRing({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', color)} />
      <span className={clsx('relative inline-flex rounded-full h-3 w-3', color)} />
    </span>
  )
}

export interface RegimeCardProps {
  regime: string
  color:  string
  price:  number | null
  rsi:    number | null
}

export default function RegimeCard({ regime, color, price, rsi }: RegimeCardProps) {
  const cfg  = REGIME_CONFIG[regime] ?? REGIME_CONFIG.UNKNOWN
  const Icon = cfg.icon

  const tip = (
    <div className="space-y-2">
      <p className="text-white font-bold">Market Regime</p>
      <p>How II Agent currently classifies the TAO market. Updated every 5-minute analysis cycle from price + indicator state.</p>
      <p className="text-[11px] font-mono text-slate-300">
        BULL · BEAR · SIDEWAYS · VOLATILE · SCANNING
      </p>
      <p className="text-slate-400 text-[11px] border-t border-slate-700/50 pt-1">
        Strategies bench themselves when the live regime isn't in their suitable list — that's why some bots quiet down for hours at a time. Manual Trade approvals here ignore the regime gate by design (operator override).
      </p>
    </div>
  )

  return (
    <div className={clsx(
      'relative rounded-2xl border p-5 flex flex-col gap-3 shadow-xl overflow-hidden',
      cfg.bg, cfg.glow,
    )}>
      {/* Ambient glow blob */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-20"
        style={{ background: color }}
      />

      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: color + '25' }}>
            <Icon size={22} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] text-slate-300 uppercase tracking-widest font-mono">Market Regime</p>
              <InfoBubble content={tip} side="right" maxWidth={320} />
            </div>
            <p className="text-2xl font-black tracking-tight" style={{ color }}>{cfg.label}</p>
          </div>
        </div>
        <PulseRing
          color={
            regime === 'BULL'
              ? 'bg-emerald-500'
              : regime === 'BEAR'
                ? 'bg-red-500'
                : 'bg-amber-500'
          }
        />
      </div>

      <div className="flex gap-4 relative">
        <div>
          <p className="text-[13px] text-slate-300 font-mono">TAO Price</p>
          <p className="text-lg font-bold text-white font-mono">${price?.toFixed(2) ?? '—'}</p>
        </div>
        {rsi !== null && (
          <div>
            <p className="text-[13px] text-slate-300 font-mono">RSI-14</p>
            <p
              className={clsx(
                'text-lg font-bold font-mono',
                rsi > 65 ? 'text-red-400' : rsi < 35 ? 'text-emerald-400' : 'text-white',
              )}
            >
              {(rsi ?? 0).toFixed(1)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}