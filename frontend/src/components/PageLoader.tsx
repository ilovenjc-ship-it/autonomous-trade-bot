/**
 * PageLoader — fallback shown while a lazy-loaded route chunk is fetched.
 *
 * Session XXXVII (perf pass) — code-splitting tax mitigation.
 *
 * Design notes:
 *   • Pulsing brain icon + a thin progress bar that animates indefinitely.
 *   • Centred in the page area (NOT full-screen) so the sidebar + topbar
 *     remain interactive while the route chunk downloads.
 *   • Fades in after 120ms so trivially-fast chunk loads (cached / preloaded)
 *     don't produce a visible flash.
 */
import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'

export default function PageLoader() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setShow(true), 120)
    return () => clearTimeout(id)
  }, [])

  if (!show) return <div className="w-full h-full" />

  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[60vh] py-16 animate-fade-in">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center
                        shadow-lg shadow-indigo-500/10">
          <Brain size={26} className="text-indigo-400 animate-pulse" />
        </div>
        <span className="absolute -inset-1 rounded-2xl border border-indigo-500/20 animate-ping" />
      </div>
      <div className="mt-5 w-40 h-1 rounded-full bg-dark-700 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-loader-slide" />
      </div>
      <p className="mt-3 text-[12px] font-mono text-slate-500 uppercase tracking-wider">Loading view…</p>
    </div>
  )
}