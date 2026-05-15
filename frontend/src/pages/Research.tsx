/**
 * Research & Quality Framework
 * ============================
 *
 * Surfaces the Conviction-Era instrumentation we shipped in Session XXXII:
 *
 *   1. Owner Watch — live snapshots from /api/market/owners
 *      (real owner-coldkey αTAO baselines, governance state, scorecard cross-link).
 *   2. Const 6-Filter Test — the seeded scorecard from /api/research/subnet-scorecard
 *      (all 10 confirmed 6/6 subnets, framework metadata, six verbatim filters).
 *   3. Signal Candidate Pipeline — subnets actively researched for live
 *      external-signal integration (SN3 Templar, SN8 Vanta).
 *   4. Quality Gate Status — current threshold + monitor coverage.
 *
 * Background docs: STATE.md §12 (Const's 6-Filter Test article filing) and
 *                  Session XXXII closeout in the master brief.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Search, RefreshCw, Sparkles, Shield, Target, Eye,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, ExternalLink, Star,
  Globe, Lock, Activity, ChevronLeft, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'
import { InfoBubble } from '@/components/Tooltip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FilterDef {
  id: string
  name: string
  summary: string
}
interface FrameworkMeta {
  name: string
  author: string
  source_article: string
  source_url: string
  filed_to_state_md: string
  max_score: number
  filters: FilterDef[]
}
interface SubnetEntry {
  rank: number
  netuid: number
  name: string
  category: string
  filters_passed: string[]
  score: number
  callouts: string[]
  is_taobot_signal_candidate: boolean
}
interface ScorecardResp {
  framework: FrameworkMeta
  scorecard_version: string
  scorecard_filed: string
  subnets: SubnetEntry[]
  loaded_ok: boolean
  subnet_count: number
}

interface OwnerRow {
  netuid: number
  is_trading: boolean
  owner_ss58: string | null
  owner_uid: number | null
  owner_alpha: number
  fetched_at: string | null
  subnet_name: string | null
  subnet_category: string | null
  scorecard_score: number | null
  scorecard_max: number | null
  is_signal_candidate: boolean
  // Session XXXII: Subnet King takeover-risk enrichment
  subnet_total_alpha: number | null
  owner_share: number | null
  takeover_risk_score: number | null
  takeover_risk_band: 'FORTRESS' | 'DEFENDED' | 'CONTESTED' | 'VULNERABLE' | null
}
interface OwnersResp {
  owners: OwnerRow[]
  monitor_netuids: number[]
  trading_netuids: number[]
  conviction_unlock_drop_pct: number
  conviction_unlock_min_tao: number
  meta_age_s: number
}

interface RiskConfig {
  subnet_quality_min_filters?: number
  [k: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAlpha(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M τ`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K τ`
  if (n >= 1) return `${n.toFixed(2)} τ`
  return `${n.toFixed(4)} τ`
}
function fmtAge(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s ago`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m ago`
  return `${(seconds / 3600).toFixed(1)}h ago`
}
function shortSs58(addr: string | null): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function bandStyle(band: string | null): string {
  switch (band) {
    case 'FORTRESS':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'DEFENDED':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    case 'CONTESTED':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'VULNERABLE':
      return 'bg-red-500/20 text-red-300 border-red-500/40'
    default:
      return 'bg-slate-700/30 text-slate-500 border-slate-600/30'
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Research() {
  const [scorecard, setScorecard] = useState<ScorecardResp | null>(null)
  const [owners, setOwners] = useState<OwnersResp | null>(null)
  const [risk, setRisk] = useState<RiskConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  // Session XXXIV: pagination for subnet listings (Trade Logs pattern).
  const [scPage, setScPage] = useState(1)
  const [ownersPage, setOwnersPage] = useState(1)
  const SUBNET_PAGE_SIZE = 5

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [sc, ow, rc] = await Promise.all([
        api.get<ScorecardResp>('/research/subnet-scorecard').then((r) => r.data),
        api.get<OwnersResp>('/market/owners').then((r) => r.data),
        api.get<RiskConfig>('/fleet/risk/config').then((r) => r.data),
      ])
      setScorecard(sc)
      setOwners(ow)
      setRisk(rc)
    } catch (e: any) {
      toast.error(`Research load failed: ${e?.message || e}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 60_000) // 60-s soft refresh
    return () => clearInterval(id)
  }, [load])

  const handleHotReload = useCallback(async () => {
    try {
      const r = await api.post('/research/subnet-scorecard/refresh').then((r) => r.data)
      toast.success(`Scorecard reloaded — ${r.subnet_count} subnets`)
      await load(true)
    } catch (e: any) {
      toast.error(`Hot-reload failed: ${e?.message || e}`)
    }
  }, [load])

  // ── Derived ─────────────────────────────────────────────────────────────
  const filters = scorecard?.framework.filters ?? []
  const subnets = scorecard?.subnets ?? []
  const candidates = subnets.filter((s) => s.is_taobot_signal_candidate)

  const visibleSubnets = subnets.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      `sn${s.netuid}`.includes(q)
    )
  })

  // Session XXXIV: pagination — slice visibleSubnets into pages of 5.
  const scPageCount = Math.max(1, Math.ceil(visibleSubnets.length / SUBNET_PAGE_SIZE))
  const scPageSafe = Math.min(scPage, scPageCount)
  const scPageStart = (scPageSafe - 1) * SUBNET_PAGE_SIZE
  const visibleSubnetsPaged = visibleSubnets.slice(scPageStart, scPageStart + SUBNET_PAGE_SIZE)

  // Pagination for Owner Watch listing too — same page-size for consistency.
  const ownersList = owners?.owners ?? []
  const ownersPageCount = Math.max(1, Math.ceil(ownersList.length / SUBNET_PAGE_SIZE))
  const ownersPageSafe = Math.min(ownersPage, ownersPageCount)
  const ownersPageStart = (ownersPageSafe - 1) * SUBNET_PAGE_SIZE
  const ownersListPaged = ownersList.slice(ownersPageStart, ownersPageStart + SUBNET_PAGE_SIZE)

  // Reset scorecard page when search filter changes.
  useEffect(() => { setScPage(1) }, [search])

  const minFilters = (risk?.subnet_quality_min_filters as number) ?? 6
  const passingGate = subnets.filter((s) => s.score >= minFilters).length
  const totalOwnerAlpha = owners?.owners.reduce((acc, o) => acc + (o.owner_alpha || 0), 0) ?? 0

  // Takeover-risk band tally (FORTRESS / DEFENDED / CONTESTED / VULNERABLE)
  const bandTally = (owners?.owners ?? []).reduce<Record<string, number>>(
    (acc, o) => {
      if (o.takeover_risk_band) acc[o.takeover_risk_band] = (acc[o.takeover_risk_band] ?? 0) + 1
      return acc
    },
    {},
  )
  const vulnerableCount = bandTally['VULNERABLE'] ?? 0
  const contestedCount  = bandTally['CONTESTED'] ?? 0
  const defendedCount   = bandTally['DEFENDED'] ?? 0
  const fortressCount   = bandTally['FORTRESS'] ?? 0

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="animate-spin" size={20} />
          <span>Loading research data…</span>
        </div>
      </div>
    )
  }

  // Session XXXIV: hover info text for the (i) icon next to the page header.
  const headerHoverInfo = `Live owner-coldkey αTAO instrumentation from chain, cross-linked with ${
    scorecard?.framework.name ?? "Const's 6-Filter Test"
  }. The quality gate that admits external signal sources lives here. Conviction-era heuristics surface alpha-locked subnets where the owner's stake is unmoved long enough to signal high conviction — and where any movement is a CONVICTION_UNLOCK alert (early warning of regime change).`

  return (
    // Session XXXIV: p-6 padding adds the left-margin divider between the side
    // menu and the page content (other pages had p-6, Research didn't).
    <div className="p-6 space-y-6">
      {/* ── Hero strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-slate-900/60 to-slate-950 p-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-violet-300">
            <Sparkles size={14} /> Conviction Era Framework
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white tracking-wider uppercase">
            Conviction Unlock Alerts
            <InfoBubble content={headerHoverInfo} side="right" maxWidth={420} />
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Scorecard · Owner Watch · Signal Candidates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleHotReload}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
            title="Re-read backend/data/subnet_scorecard.json — no redeploy"
          >
            <RefreshCw size={14} /> Hot-reload JSON
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={clsx(refreshing && 'animate-spin')} size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={<Shield size={16} className="text-emerald-400" />}
          label="Quality Gate"
          value={`≥${minFilters}/${scorecard?.framework.max_score ?? 6}`}
          sub={`${passingGate} subnet${passingGate === 1 ? '' : 's'} pass`}
        />
        <KpiCard
          icon={<Eye size={16} className="text-cyan-300" />}
          label="Owner Watch"
          value={`${owners?.owners.length ?? 0} live`}
          sub={
            owners?.meta_age_s != null
              ? `cache ${fmtAge(owners.meta_age_s)}`
              : 'cache cold'
          }
        />
        <KpiCard
          icon={<Target size={16} className="text-amber-300" />}
          label="Signal Candidates"
          value={String(candidates.length)}
          sub={candidates.map((c) => c.name).join(' · ') || '—'}
        />
        <KpiCard
          icon={<Activity size={16} className="text-violet-300" />}
          label="Total Owner-Locked α"
          value={fmtAlpha(totalOwnerAlpha)}
          sub={`${owners?.monitor_netuids.length ?? 0} subnets monitored`}
        />
        <KpiCard
          icon={
            vulnerableCount > 0 ? (
              <AlertTriangle size={16} className="text-red-400" />
            ) : (
              <Shield size={16} className="text-emerald-400" />
            )
          }
          label="Takeover Risk"
          value={
            vulnerableCount > 0
              ? `${vulnerableCount} VULNERABLE`
              : `${fortressCount + defendedCount} safe`
          }
          sub={`F${fortressCount} · D${defendedCount} · C${contestedCount} · V${vulnerableCount}`}
        />
      </div>

      {/* ── Owner Watch section ───────────────────────────────────────────── */}
      <Section
        icon={<Eye className="text-cyan-300" />}
        title="Owner Watch — live"
        subtitle="Subnet-owner coldkey αTAO snapshots. Drives SUBNET_OWNER_CHANGE + CONVICTION_UNLOCK alerts."
      >
        <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/60">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/70 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">SN</th>
                <th className="px-3 py-2 text-left">Subnet</th>
                <th className="px-3 py-2 text-left">Score</th>
                <th className="px-3 py-2 text-right">Owner α</th>
                <th
                  className="px-3 py-2 text-center"
                  title="Subnet King takeover-risk score (0=fortress, 1=vulnerable). Computed as 1 − (owner_alpha / total_subnet_alpha)."
                >
                  Takeover Risk
                </th>
                <th className="px-3 py-2 text-left">Owner ss58</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Last fetch</th>
              </tr>
            </thead>
            <tbody>
              {ownersListPaged.map((o) => (
                <tr
                  key={o.netuid}
                  className={clsx(
                    'border-t border-slate-800/70',
                    o.is_signal_candidate && 'bg-amber-500/5',
                  )}
                >
                  <td className="px-3 py-2 font-mono text-slate-300">
                    SN{o.netuid}
                  </td>
                  <td className="px-3 py-2">
                    {o.subnet_name ? (
                      <div className="flex items-center gap-2">
                        {o.is_signal_candidate && (
                          <Star size={12} className="text-amber-400" />
                        )}
                        <span className="font-medium text-white">
                          {o.subnet_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {o.subnet_category}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {o.scorecard_score != null ? (
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-xs font-bold',
                          o.scorecard_score === 6
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-slate-600/30 text-slate-300',
                        )}
                      >
                        {o.scorecard_score}/{o.scorecard_max}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">off</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">
                    {fmtAlpha(o.owner_alpha)}
                    {o.subnet_total_alpha != null && (
                      <div className="text-[10px] text-slate-500 font-normal">
                        of {fmtAlpha(o.subnet_total_alpha)} total
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {o.takeover_risk_band ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={clsx(
                            'inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            bandStyle(o.takeover_risk_band),
                          )}
                          title={`Owner share ${((o.owner_share ?? 0) * 100).toFixed(2)}% of total subnet alpha`}
                        >
                          {o.takeover_risk_band}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {((o.takeover_risk_score ?? 0)).toFixed(3)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {shortSs58(o.owner_ss58)}
                  </td>
                  <td className="px-3 py-2">
                    {o.is_trading ? (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase text-cyan-300">
                        <Activity size={10} /> Trading
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] uppercase text-violet-300">
                        <Lock size={10} /> Monitor
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">
                    {o.fetched_at
                      ? new Date(o.fetched_at).toLocaleTimeString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {(!owners || owners.owners.length === 0) && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-sm text-slate-500"
                  >
                    No owner snapshots yet — first metagraph cycle pending.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Session XXXIV: Owner Watch pagination — Trade Logs pattern */}
        {ownersList.length > SUBNET_PAGE_SIZE && (
          <PageNav
            label={`Showing ${ownersListPaged.length} of ${ownersList.length} subnets`}
            page={ownersPageSafe}
            pageCount={ownersPageCount}
            onChange={setOwnersPage}
          />
        )}
        {owners && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              <strong className="text-slate-300">Conviction unlock heuristic:</strong>{' '}
              ≥{owners.conviction_unlock_drop_pct}% drop AND ≥
              {owners.conviction_unlock_min_tao}τ → fires WARNING
            </span>
            <span>
              <strong className="text-slate-300">Monitor set:</strong>{' '}
              {owners.monitor_netuids.map((n) => `SN${n}`).join(' · ')}
            </span>
          </div>
        )}
      </Section>

      {/* ── Signal Candidates highlight box ───────────────────────────────── */}
      {candidates.length > 0 && (
        <Section
          icon={<Target className="text-amber-300" />}
          title="Signal Candidate Pipeline"
          subtitle="Subnets flagged for active research as external signal contributors. Quality gate already passed."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {candidates.map((c) => (
              <div
                key={c.netuid}
                className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-slate-900/60 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Star size={14} className="text-amber-400" />
                      <span className="text-xs font-mono uppercase tracking-wider text-amber-200">
                        SN{c.netuid} · #{c.rank}
                      </span>
                    </div>
                    <h4 className="mt-1 text-lg font-bold text-white">
                      {c.name}
                    </h4>
                    <div className="text-xs text-slate-400">{c.category}</div>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
                    {c.score}/6
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {c.callouts.map((co, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2
                        size={14}
                        className="mt-0.5 flex-shrink-0 text-emerald-400"
                      />
                      <span>{co}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Const's 6-Filter Test scorecard ───────────────────────────────── */}
      <Section
        icon={<Shield className="text-violet-300" />}
        title={scorecard?.framework.name ?? '6-Filter Test'}
        subtitle={
          scorecard
            ? `${scorecard.framework.author} · filed ${scorecard.framework.filed_to_state_md}`
            : ''
        }
        right={
          scorecard?.framework.source_url && (
            <a
              href={scorecard.framework.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
            >
              source <ExternalLink size={12} />
            </a>
          )
        }
      >
        {/* Filter legend */}
        <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {filters.map((f, i) => (
            <div
              key={f.id}
              className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
                F{i + 1}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-white">
                {f.name}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">
                {f.summary}
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subnet, category, or SN-id…"
              className="w-full rounded-lg border border-slate-700/50 bg-slate-900/60 py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500">
            {visibleSubnets.length} / {subnets.length}
          </span>
        </div>

        {/* Scorecard table */}
        <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/60">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/70 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Subnet</th>
                <th className="px-3 py-2 text-left">Category</th>
                {filters.map((f, i) => (
                  <th
                    key={f.id}
                    className="px-2 py-2 text-center"
                    title={f.name}
                  >
                    F{i + 1}
                  </th>
                ))}
                <th className="px-3 py-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {visibleSubnetsPaged.map((s) => {
                const isOpen = expandedRow === s.netuid
                return (
                  <>
                    <tr
                      key={s.netuid}
                      className={clsx(
                        'cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/40',
                        s.is_taobot_signal_candidate && 'bg-amber-500/5',
                      )}
                      onClick={() =>
                        setExpandedRow(isOpen ? null : s.netuid)
                      }
                    >
                      <td className="px-3 py-2 text-slate-400">{s.rank}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {s.is_taobot_signal_candidate && (
                            <Star size={12} className="text-amber-400" />
                          )}
                          <span className="font-mono text-xs text-slate-400">
                            SN{s.netuid}
                          </span>
                          <span className="font-medium text-white">
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {s.category}
                      </td>
                      {filters.map((f) => {
                        const passed = s.filters_passed.includes(f.id)
                        return (
                          <td
                            key={f.id}
                            className="px-2 py-2 text-center"
                            title={passed ? `Passes — ${f.name}` : `Fails — ${f.name}`}
                          >
                            {passed ? (
                              <CheckCircle2
                                size={14}
                                className="mx-auto text-emerald-400"
                              />
                            ) : (
                              <XCircle
                                size={14}
                                className="mx-auto text-red-400"
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={clsx(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-bold',
                            s.score === 6
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : s.score >= 4
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-red-500/15 text-red-300',
                          )}
                        >
                          {s.score}/6
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-950/50">
                        <td colSpan={4 + filters.length} className="px-6 py-3">
                          <div className="text-xs text-slate-400">
                            <div className="mb-2 font-semibold text-slate-300">
                              Callouts
                            </div>
                            {s.callouts.length > 0 ? (
                              <ul className="space-y-1">
                                {s.callouts.map((co, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-violet-400">›</span>
                                    <span>{co}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-500 italic">
                                No callouts on file.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {visibleSubnets.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + filters.length}
                    className="px-3 py-6 text-center text-sm text-slate-500"
                  >
                    No matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Session XXXIV: Scorecard pagination — Trade Logs pattern */}
        {visibleSubnets.length > SUBNET_PAGE_SIZE && (
          <PageNav
            label={`Showing ${visibleSubnetsPaged.length} of ${visibleSubnets.length} subnets${
              search ? ` (filtered from ${subnets.length})` : ''
            }`}
            page={scPageSafe}
            pageCount={scPageCount}
            onChange={setScPage}
          />
        )}

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <span>
            <strong className="text-slate-300">Quality gate policy:</strong>{' '}
            external signal sources rooted at a specific subnet must pass{' '}
            <strong className="text-violet-300">{minFilters}/6</strong> before
            their feed is admitted to the consensus pipeline. Adjust via{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px]">
              subnet_quality_min_filters
            </code>{' '}
            in Risk Config.
          </span>
        </div>
      </Section>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500 truncate">{sub}</div>
    </div>
  )
}

function Section({
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            {icon} {title}
          </h3>
          {subtitle && (
            <div className="mt-0.5 text-xs text-slate-400">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

// ─── Pagination — Session XXXIV (Trade Logs pattern) ──────────────────────────
function PageNav({
  label,
  page,
  pageCount,
  onChange,
}: {
  label: string
  page: number
  pageCount: number
  onChange: (p: number) => void
}) {
  const start = Math.max(1, page - 2)
  const visiblePages = Math.min(5, pageCount)
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
      <p className="text-xs font-mono text-slate-300">{label}</p>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="p-1.5 rounded border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: visiblePages }, (_, i) => {
          const p = start + i
          if (p > pageCount) return null
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={clsx(
                'px-2.5 py-1 rounded text-xs font-mono border transition-colors',
                p === page
                  ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
                  : 'text-slate-300 border-slate-700/60 hover:text-white',
              )}
            >
              {p}
            </button>
          )
        })}
        <button
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          className="p-1.5 rounded border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}