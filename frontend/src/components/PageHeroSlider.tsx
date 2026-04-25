/**
 * PageHeroSlider — full-width hero banner used at the top of every page.
 *
 * Accepts up to 6 slides; auto-advances every 6 s.
 * Navigation: left/right arrows + dot pips.
 * Each slide renders a title, optional subtitle, and an array of stat boxes.
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

export interface SliderStat {
  label: string
  value: string
  sub?: string
  color?: 'white' | 'emerald' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'slate'
}

export interface SliderSlide {
  title: string
  subtitle?: string
  /** Left-side icon / accent: colour key for the title + border */
  accent?: 'emerald' | 'blue' | 'purple' | 'orange' | 'yellow' | 'red'
  stats: SliderStat[]
}

interface PageHeroSliderProps {
  slides: SliderSlide[]
  intervalMs?: number
}

const ACCENT_CLS: Record<string, string> = {
  emerald: 'text-emerald-400',
  blue:    'text-blue-400',
  purple:  'text-purple-400',
  orange:  'text-orange-400',
  yellow:  'text-yellow-400',
  red:     'text-red-400',
}

const ACCENT_BORDER: Record<string, string> = {
  emerald: 'border-emerald-500/30',
  blue:    'border-blue-500/30',
  purple:  'border-purple-500/30',
  orange:  'border-orange-500/30',
  yellow:  'border-yellow-500/30',
  red:     'border-red-500/30',
}

const ACCENT_DOT: Record<string, string> = {
  emerald: 'bg-emerald-400',
  blue:    'bg-blue-400',
  purple:  'bg-purple-400',
  orange:  'bg-orange-400',
  yellow:  'bg-yellow-400',
  red:     'bg-red-400',
}

const ACCENT_BG: Record<string, string> = {
  emerald: 'from-emerald-900/20 to-transparent',
  blue:    'from-blue-900/20 to-transparent',
  purple:  'from-purple-900/20 to-transparent',
  orange:  'from-orange-900/20 to-transparent',
  yellow:  'from-yellow-900/20 to-transparent',
  red:     'from-red-900/20 to-transparent',
}

const VALUE_CLS: Record<string, string> = {
  white:   'text-white',
  emerald: 'text-emerald-400',
  red:     'text-red-400',
  yellow:  'text-yellow-300',
  blue:    'text-blue-400',
  purple:  'text-purple-400',
  orange:  'text-orange-400',
  slate:   'text-slate-400',
}

export default function PageHeroSlider({ slides, intervalMs = 6000 }: PageHeroSliderProps) {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const n = slides.length

  const go = (idx: number) => setCurrent(((idx % n) + n) % n)
  const prev = () => go(current - 1)
  const next = () => go(current + 1)

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setCurrent(c => (c + 1) % n), intervalMs)
  }

  useEffect(() => {
    resetTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [n, intervalMs])

  if (!slides.length) return null

  const slide = slides[current]
  const accent = slide.accent ?? 'blue'

  return (
    <div className={clsx(
      'relative flex-shrink-0 w-full border-b border-slate-800/60 overflow-hidden',
      'bg-gradient-to-r', ACCENT_BG[accent],
    )} style={{ height: 158 }}>

      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Content — fade transition */}
      <div key={current} className="absolute inset-0 flex items-stretch animate-fade-in">

        {/* Left accent strip + title */}
        <div className={clsx('flex-shrink-0 flex flex-col justify-center px-6 border-r', ACCENT_BORDER[accent])}
          style={{ minWidth: 220 }}>
          <div className="flex items-center gap-2 mb-1">
            <div className={clsx('w-2 h-2 rounded-full animate-pulse', ACCENT_DOT[accent])} />
            <span className={clsx('text-[11px] font-mono font-bold tracking-widest uppercase', ACCENT_CLS[accent])}>
              {slide.subtitle ?? 'Live'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white leading-tight tracking-wide">
            {slide.title}
          </h2>
        </div>

        {/* Stats grid */}
        <div className="flex-1 flex items-stretch divide-x divide-slate-800/60">
          {slide.stats.map((stat, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center px-4 py-3 text-center min-w-0">
              <div className="text-[11px] text-slate-500 uppercase tracking-widest font-mono mb-1 leading-none">
                {stat.label}
              </div>
              <div className={clsx(
                'text-2xl font-bold font-mono leading-none',
                VALUE_CLS[stat.color ?? 'white'],
              )}>
                {stat.value}
              </div>
              {stat.sub && (
                <div className="text-[10px] text-slate-600 font-mono mt-1 leading-none">{stat.sub}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Nav arrows */}
      <button
        onClick={() => { prev(); resetTimer() }}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900/60 border border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onClick={() => { next(); resetTimer() }}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900/60 border border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
      >
        <ChevronRight size={14} />
      </button>

      {/* Dot pips */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => { go(i); resetTimer() }}
            className={clsx(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              i === current
                ? clsx('scale-125', ACCENT_DOT[accent])
                : 'bg-slate-600 hover:bg-slate-400',
            )}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div className="absolute bottom-2.5 right-10 text-[10px] font-mono text-slate-600 z-10">
        {current + 1}/{n}
      </div>
    </div>
  )
}