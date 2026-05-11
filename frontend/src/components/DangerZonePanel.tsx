/**
 * Danger Zone — compact destructive-operations panel.
 * Relocated from Settings → Human Override (Session XXV spec).
 * Smaller footprint; two-step confirm preserved for safety.
 */
import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { botApi } from '@/api/client'

export default function DangerZonePanel() {
  const [armed,    setArmed]    = useState(false)
  const [resetting, setResetting] = useState(false)

  const handleReset = async () => {
    setResetting(true)
    try {
      await botApi.updateConfig({ _reset_trades: true } as Record<string, unknown>)
      toast.success('Trade history cleared')
      setArmed(false)
    } catch {
      toast.error('Reset failed — no data was changed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="bg-dark-800 border border-red-500/20 rounded-xl p-4">
      <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-red-500/15 pb-2 mb-3 flex items-center gap-2">
        <AlertTriangle size={12} />
        Danger Zone
      </h2>
      <p className="text-[12px] text-slate-400 mb-3 leading-relaxed">
        Clears all trade history from the local database. Wallet, configuration, and strategy
        state are preserved. This action cannot be undone.
      </p>
      {!armed ? (
        <button
          onClick={() => setArmed(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
        >
          <AlertTriangle size={12} />
          Reset All Trade Data
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2.5 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
            <p className="text-[12px] text-red-400 font-semibold leading-tight">
              This will permanently delete all trade history. Are you sure?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-xs font-bold hover:bg-red-500/30 disabled:opacity-50 transition-colors"
            >
              {resetting ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
              {resetting ? 'Clearing…' : 'Yes, delete everything'}
            </button>
            <button
              onClick={() => setArmed(false)}
              className="px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-slate-400 text-xs hover:text-white hover:border-dark-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}