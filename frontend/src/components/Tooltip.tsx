/**
 * Tooltip — universal hover-bubble component.
 *
 * Renders via React Portal at document.body with position:fixed so it is
 * NEVER clipped by ancestor overflow:hidden / overflow-y:auto containers.
 * Coordinates are calculated from the trigger element's getBoundingClientRect()
 * so the bubble always appears adjacent to the icon regardless of scroll position.
 *
 * Usage:
 *   <Tooltip content="Explains the thing" side="right">
 *     <SomeElement />
 *   </Tooltip>
 */
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** Tooltip body — plain string or rich ReactNode */
  content: React.ReactNode
  children: React.ReactNode
  /** Which side to open on (default: right — horizontal, never clips at page bottom) */
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
  side = 'right',
  maxWidth = 280,
  className = '',
  delay = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0 })
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef            = useRef<HTMLSpanElement>(null)

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const r   = triggerRef.current.getBoundingClientRect()
        const GAP = 10   // px gap between trigger and bubble edge
        let top = 0, left = 0
        switch (side) {
          case 'right':  top = r.top + r.height / 2; left = r.right + GAP;         break
          case 'left':   top = r.top + r.height / 2; left = r.left  - GAP;         break
          case 'top':    top = r.top  - GAP;          left = r.left + r.width / 2;  break
          case 'bottom': top = r.bottom + GAP;        left = r.left + r.width / 2;  break
        }
        setPos({ top, left })
      }
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  // CSS transform so the bubble is anchored correctly to the calculated point
  const transformMap = {
    right:  'translateY(-50%)',
    left:   'translateX(-100%) translateY(-50%)',
    top:    'translateX(-50%) translateY(-100%)',
    bottom: 'translateX(-50%)',
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && createPortal(
        <span
          role="tooltip"
          style={{
            position:      'fixed',
            top:           pos.top,
            left:          pos.left,
            maxWidth,
            zIndex:        9999,
            transform:     transformMap[side],
            pointerEvents: 'none',
          }}
        >
          <span className="block bg-[#0b1526] border border-[#2d3f5a] rounded-xl px-3.5 py-2.5
                           shadow-2xl shadow-black/50 text-[12px] font-mono text-slate-200
                           leading-relaxed whitespace-normal">
            {content}
          </span>
        </span>,
        document.body,
      )}
    </span>
  )
}

/**
 * InfoBubble — a small ⓘ icon that shows a tooltip on hover.
 * Defaults to side="right" (horizontal) — never clips at the page bottom.
 */
export function InfoBubble({
  content,
  side = 'right',
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