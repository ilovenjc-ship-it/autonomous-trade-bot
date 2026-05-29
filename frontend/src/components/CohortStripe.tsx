/**
 * CohortStripe — Day 16 #15
 * =========================
 * Renders a one-line "post-D-44 cohort" stat banner: trades / win rate /
 * total PnL / days since cohort started, plus a small "since fd6f5922"
 * provenance tail so the operator can verify which architectural
 * before/after line we're using.
 *
 * Default cohort is the D-44 inscription (commit fd6f5922 — Architect
 * standing authority + same-day live-wire batch, 2026-05-27 16:55:18 UTC).
 *
 * Mounted on:
 *   - pages/Strategies.tsx (under FleetSummary)
 *   - pages/AgentFleet.tsx (under the regime banner)
 *
 * Backend: GET /api/trades/cohort-stats[?since=<iso>]
 *
 * Display policy:
 *   - Subdued ribbon at first glance — this is reference data, not an
 *     alert.
 *   - PnL coloured per sign (emerald / red) so the operator can read
 *     direction without parsing the number.
 *   - Win-rate threshold colours: ≥55% emerald, 33-55% amber, <33% red
 *     (matches the strategic-fork band at 33-36% Fleet WR Mark and I
 *     have been tracking).
 *   - Loading / error states are quiet — the stripe is optional context,
 *     not the operator's primary signal.
 */
import { useEffect, useState } from 'react'
import { Anchor, Calendar, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import api from '@/api/client'

interface CohortStats {
  cohort_label:  string
  since:         string
  commit_sha:    string
  now:           string
  days_since:    number
  total_trades:  number
  executed:      number
  wins:          number
  losses:        number
  win_rate:      number
  total_pnl_tau: number
  per_strategy:  Array<{
    strategy:      string
    total:         number
    executed:      number
    wins:          number
    losses:        number
    win_rate:      number
    total_pnl_tau: number
  }>
}

function fmtTau(v: number): string {
  // Match the rest of the app's τ formatting — 4 decimals, sign included.
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(4)} τ`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

interface CohortStripeProps {
  /** Optional cohort start override. Defaults to D-44 inscription on the backend. */
  since?: string
  /** Optional className passthrough so the parent can control margin / spacing. */
  className?: string
  /** Optional override for the leading icon's accent colour. */
  accent?: string
}

export function CohortStripe({ since, className, accent = 'text-amber-300' }: CohortStripeProps) {
  const [data, setData]     = useState<CohortStats | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoad]  = useState<boolean>(true)

  useEffect(() => {
    let cancel = false
    setLoad(true)
    setError(null)
    const params: Record<string, string> = {}
    if (since) params.since = since
    api.get<CohortStats>('/trades/cohort-stats', { params })
      .then(res => { if (!cancel) { setData(res.data); setLoad(false) } })
      .catch(err => {
        if (!cancel) {
          setError(err?.message || 'Failed to load cohort stats')
          setLoad(false)
        }
      })
    return () => { cancel = true }
  }, [since])

  // Refresh every 60s so the stripe stays in sync with new trades.
  useEffect(() => {
    if (!data) return
    const id = setInterval(() => {
      const params: Record<string, string> = {}
      if (since) params.since = since
      api.get<CohortStats>('/trades/cohort-stats', { params })
        .then(res => setData(res.data))
        .catch(() => { /* silent — keep last good payload */ })
    }, 60_000)
    return () => clearInterval(id)
  }, [data, since])

  if (loading) {
    return (
      <div className={clsx(
        'rounded-xl border border-slate-700/40 bg-slate-900/30 px-4 py-2',
        'text-[12px] font-mono text-slate-500',
        className,
      )}>
        Loading cohort stats…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={clsx(
        'rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2',
        'text-[12px] font-mono text-red-300 flex items-center gap-2',
        className,
      )}>
        <AlertTriangle size={12} />
        Cohort stats unavailable {error ? `· ${error}` : ''}
      </div>
    )
  }

  const pnlPositive = data.total_pnl_tau >= 0
  const wrColor =
    data.win_rate >= 55 ? 'text-emerald-300' :
    data.win_rate >= 33 ? 'text-amber-300'   :
    'text-red-300'

  return (
    <div className={clsx(
      'rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.07] to-transparent',
      'px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-mono',
      className,
    )}>
      <div className="flex items-center gap-1.5">
        <Anchor size={13} className={accent} />
        <span className="text-slate-300 uppercase tracking-wider text-[11px]">
          {data.cohort_label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-slate-400">
        <Calendar size={11} className="text-slate-500" />
        <span className="text-slate-300">{fmtDate(data.since)}</span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">{data.days_since}d</span>
      </div>

      <div className="text-slate-400">
        <span className="text-white font-bold">{data.executed.toLocaleString()}</span>
        <span className="ml-1 text-slate-500">executed</span>
        {data.total_trades > data.executed && (
          <span className="ml-1 text-slate-600">
            (of {data.total_trades.toLocaleString()})
          </span>
        )}
      </div>

      <div className="text-slate-400">
        <span className={clsx('font-bold', wrColor)}>{data.win_rate.toFixed(1)}%</span>
        <span className="ml-1 text-slate-500">WR</span>
        <span className="ml-1 text-slate-600">
          ({data.wins}W / {data.losses}L)
        </span>
      </div>

      <div className="flex items-center gap-1">
        {pnlPositive ? (
          <TrendingUp size={12} className="text-emerald-400" />
        ) : (
          <TrendingDown size={12} className="text-red-400" />
        )}
        <span className={clsx(
          'font-bold',
          pnlPositive ? 'text-emerald-300' : 'text-red-300',
        )}>
          {fmtTau(data.total_pnl_tau)}
        </span>
      </div>

      {data.commit_sha && (
        <span className="ml-auto text-[10px] text-slate-600 tracking-wide">
          since <code className="text-slate-500">{data.commit_sha}</code>
        </span>
      )}
    </div>
  )
}

export default CohortStripe