/**
 * OrbQuickPrompts — F-45 (Day 15 Ari rebrand).
 *
 * Three quick-prompt pills mounted between the orb-panel header and
 * the message stream. Each pill opens a small popover for parameter
 * selection (subnet + optional time-window), then submits the built
 * query string via the parent's `onSubmit` callback.
 *
 * Per the F-45 spec (specs/ari-rebrand/document.md), this is a thin
 * UI affordance that produces a chat-bound query string and hands it
 * off — it does NOT call the chat endpoint directly. Network I/O
 * remains in `Layout.tsx`'s existing `sendMessage` flow.
 *
 * Style note: the pills inherit the orb's red/HAL palette (this is
 * orb context, not page context). The chat-page pills in
 * `pages/IIAgent.tsx` use the page's emerald palette — different
 * surface, different pill style.
 */
import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import {
  ORB_QUICK_PROMPTS,
  ARI_ACTIVE_SUBNETS,
  WINDOW_OPTIONS,
  type OrbPrompt,
  type PromptWindow,
} from '@/lib/ariPrompts'

interface OrbQuickPromptsProps {
  /** Parent (Layout.tsx) handles the actual chat send. */
  onSubmit: (text: string) => void
  disabled?: boolean
}

export default function OrbQuickPrompts({ onSubmit, disabled }: OrbQuickPromptsProps) {
  /** Which pill's popover is open (null = all closed). */
  const [openPillId, setOpenPillId] = useState<string | null>(null)
  /** Selected subnet inside the active popover (before submit). */
  const [selSubnet, setSelSubnet] = useState<number | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!openPillId) return
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPillId(null)
        setSelSubnet(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openPillId])

  function handlePillClick(pill: OrbPrompt) {
    if (openPillId === pill.id) {
      setOpenPillId(null)
      setSelSubnet(null)
    } else {
      setOpenPillId(pill.id)
      setSelSubnet(null)
    }
  }

  function handleSubmitWithSubnet(pill: OrbPrompt, subnet: number, win?: PromptWindow) {
    const text = pill.build(subnet, win)
    onSubmit(text)
    setOpenPillId(null)
    setSelSubnet(null)
  }

  const activePill = ORB_QUICK_PROMPTS.find(p => p.id === openPillId) || null

  return (
    <div className="px-3 py-2 border-b border-slate-800/60 flex-shrink-0">
      {/* Pill row */}
      <div className="flex flex-wrap gap-1.5">
        {ORB_QUICK_PROMPTS.map(pill => (
          <button
            key={pill.id}
            onClick={() => handlePillClick(pill)}
            disabled={disabled}
            className={clsx(
              'text-[11px] font-mono px-2.5 py-1 rounded-full border transition-all duration-200',
              openPillId === pill.id
                ? 'border-red-400/60 bg-red-500/20 text-red-200'
                : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-400/50',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Popover — subnet picker + optional window picker */}
      {activePill && (
        <div
          ref={popoverRef}
          className="mt-2 rounded-lg border border-red-500/25 bg-[#0d1526] p-2.5 shadow-[0_0_24px_rgba(220,38,38,0.15)]"
        >
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1.5">
            {selSubnet === null
              ? `Pick a subnet · ${activePill.label}`
              : activePill.needsWindow
                ? `Pick a window · SN${selSubnet}`
                : `SN${selSubnet}`}
          </div>

          {/* Subnet picker */}
          {selSubnet === null && (
            <div className="flex flex-wrap gap-1">
              {ARI_ACTIVE_SUBNETS.map(n => (
                <button
                  key={n}
                  onClick={() =>
                    activePill.needsWindow
                      ? setSelSubnet(n)
                      : handleSubmitWithSubnet(activePill, n)
                  }
                  className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-700/40 bg-slate-800/40 text-slate-300 hover:bg-red-500/15 hover:border-red-400/40 hover:text-red-200 transition-colors"
                >
                  SN{n}
                </button>
              ))}
            </div>
          )}

          {/* Window picker */}
          {selSubnet !== null && activePill.needsWindow && (
            <div className="flex flex-wrap gap-1">
              {WINDOW_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSubmitWithSubnet(activePill, selSubnet, opt.value)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-700/40 bg-slate-800/40 text-slate-300 hover:bg-red-500/15 hover:border-red-400/40 hover:text-red-200 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Cancel hint */}
          <div className="mt-1.5 text-[9px] font-mono text-slate-600 italic">
            click outside to cancel
          </div>
        </div>
      )}
    </div>
  )
}