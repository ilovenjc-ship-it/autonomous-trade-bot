/**
 * Tooltip — universal hover-bubble component.
 *
 * Usage:
 *   <Tooltip content="Explains the thing">
 *     <SomeElement />
 *   </Tooltip>
 *
 * Supports multi-line ReactNode content, four sides, and an optional delay.
 * Wraps children in an inline-flex span so it works with any element type.
 */
import { useState, useRef } from 'react'

interface TooltipProps {
  /** Tooltip body — plain string or rich ReactNode */
  content: React.ReactNode
  children: React.ReactNode
  /** Which side to open on (default: top) */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Max pixel width of the tooltip box (default 280) */
  maxWidth?: number
  /** Extra classes on the wrapper span */
  className?: string
  /** Show delay in ms (default 200) */
  delay?: number
}

export default function Tooltip({
  content,
  children,
  side = 'top',
  maxWidth = 280,
  className = '',
  delay = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  // Positioning classes
  const positionMap = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full   left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2  -translate-y-1/2  mr-2',
    right:  'left-full  top-1/2  -translate-y-1/2  ml-2',
  }

  // Arrow classes (CSS border-trick triangle)
  const arrowMap = {
    top:    'absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#2d3f5a]',
    bottom: 'absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#2d3f5a]',
    left:   'absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-[#2d3f5a]',
    right:  'absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#2d3f5a]',
  }

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && (
        <span
          role="tooltip"
          style={{ maxWidth, zIndex: 9999 }}
          className={`absolute pointer-events-none ${positionMap[side]}`}
        >
          {/* Bubble */}
          <span className="block bg-[#0b1526] border border-[#2d3f5a] rounded-xl px-3.5 py-2.5 shadow-2xl shadow-black/50
                           text-[12px] font-mono text-slate-200 leading-relaxed whitespace-normal">
            {content}
          </span>
          {/* Arrow */}
          <span className={arrowMap[side]} />
        </span>
      )}
    </span>
  )
}

/**
 * InfoBubble — a small ⓘ icon that shows a tooltip on hover.
 * Drop this anywhere next to a label.
 */
export function InfoBubble({
  content,
  side = 'top',
  maxWidth,
  className = '',
}: Omit<TooltipProps, 'children'>) {
  return (
    <Tooltip content={content} side={side} maxWidth={maxWidth} className={className}>
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full
                   bg-slate-700/60 border border-slate-600/50 text-slate-400
                   hover:bg-slate-600/80 hover:text-slate-200 hover:border-slate-500/70
                   cursor-help transition-colors text-[10px] font-bold select-none"
        aria-label="More information"
      >
        i
      </span>
    </Tooltip>
  )
}