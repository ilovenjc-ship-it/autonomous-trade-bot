/**
 * TransactionDetailModal
 * ──────────────────────
 * Full-detail popup for any trade record.  Shows every stored field, a
 * copy-able TX hash, and deep-links to Taostats + TAO.app for on-chain trades.
 */
import { useEffect, useRef } from 'react'
import {
  X, Copy, ExternalLink, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Zap, Hash, Activity,
  Database, Globe, Shield, AlertTriangle, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// ── types ─────────────────────────────────────────────────────────────────────
export interface TradeRecord {
  id: number
  trade_type: string          // 'buy' | 'sell'
  status: string              // 'executed' | 'failed' | 'pending' | 'cancelled'
  amount: number
  price_at_trade: number
  usd_value: number
  fee?: number
  pnl: number
  pnl_pct?: number
  strategy?: string | null
  signal_reason?: string | null
  tx_hash?: string | null
  netuid?: number | null
  network?: string | null
  live?: boolean
  created_at?: string | null
  executed_at?: string | null
  error_message?: string | null
  // allow any extra keys
  [key: string]: unknown
}

const STRATEGY_LABELS: Record<string, string> = {
  momentum_cascade:   'Momentum Cascade',
  dtao_flow_momentum: 'dTAO Flow Momentum',
  liquidity_hunter:   'Liquidity Hunter',
  breakout_hunter:    'Breakout Hunter',
  yield_maximizer:    'Yield Maximizer',
  contrarian_flow:    'Contrarian Flow',
  volatility_arb:     'Volatility Arb',
  sentiment_surge:    'Sentiment Surge',
  balanced_risk:      'Balanced Risk',
  mean_reversion:     'Mean Reversion',
  emission_momentum:  'Emission Momentum',
  macro_correlation:  'Macro Correlation',
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtET(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    const utc = raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z'
    const d = new Date(utc)
    const tzAbbr =
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
        .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'ET'
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + ' ' + tzAbbr
  } catch { return (raw ?? '').slice(0, 19) }
}

function copyText(text: string, label = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => toast.success(label))
}

function taostatsUrl(tx_hash: string): { url: string; label: string } {
  if (tx_hash.startsWith('block:')) {
    const blk = tx_hash.replace('block:', '')
    return { url: `https://taostats.io/block/${blk}`, label: `Block #${blk}` }
  }
  return { url: `https://taostats.io/extrinsic/${tx_hash}`, label: 'Extrinsic' }
}

// ── section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-[#1e3a5f]" />
      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{children}</span>
      <div className="h-px flex-1 bg-[#1e3a5f]" />
    </div>
  )
}

// ── metric cell ───────────────────────────────────────────────────────────────
function MetricCell({
  label, value, valueClass = 'text-white', mono = true,
}: {
  label: string
  value: React.ReactNode
  valueClass?: string
  mono?: boolean
}) {
  return (
    <div className="bg-[#070e1a] border border-[#1e3a5f] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className={clsx('text-sm font-semibold', valueClass, mono && 'font-mono')}>{value}</div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
interface Props {
  trade: TradeRecord | null
  onClose: () => void
  /** Optional: current strategy mode map for this trade */
  strategyMode?: string
}

export default function TransactionDetailModal({ trade, onClose, strategyMode }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!trade) return null

  const isBuy      = trade.trade_type === 'buy'
  const isLive     = trade.live ?? (!!trade.tx_hash && !trade.tx_hash?.startsWith('block:sim'))
  const hasTx      = !!trade.tx_hash
  const fee        = trade.fee ?? 0
  const pnl        = trade.pnl ?? 0
  const pnlPct     = trade.pnl_pct ?? 0
  const pnlPos     = pnl >= 0
  const statusOk   = trade.status === 'executed'
  const stratLabel = STRATEGY_LABELS[trade.strategy ?? ''] ?? trade.strategy ?? '—'

  // Chain links
  const { url: taostatsHref, label: taostatsLabel } =
    hasTx ? taostatsUrl(trade.tx_hash!) : { url: '', label: '' }
  const taoAppHref = trade.netuid != null
    ? `https://tao.app/subnet/${trade.netuid}`
    : 'https://tao.app'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2, 8, 20, 0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1e3a5f] shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0a1628 60%, #061220 100%)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-[#1e3a5f]"
          style={{ background: 'rgba(8,15,30,0.96)', backdropFilter: 'blur(12px)' }}>

          {/* Trade ID + direction icon */}
          <div className={clsx(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            isBuy ? 'bg-emerald-500/15 border border-emerald-500/30'
                  : 'bg-red-500/15 border border-red-500/30'
          )}>
            {isBuy
              ? <TrendingUp size={16} className="text-emerald-400" />
              : <TrendingDown size={16} className="text-red-400" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-base">Trade #{trade.id}</span>

              {/* BUY / SELL badge */}
              <span className={clsx(
                'px-2 py-0.5 rounded-md text-[11px] font-black font-mono',
                isBuy
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              )}>
                {isBuy ? '▲ BUY' : '▼ SELL'}
              </span>

              {/* LIVE / PAPER badge */}
              {isLive ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE · ON-CHAIN
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  ◌ PAPER
                </span>
              )}

              {/* Status */}
              <span className={clsx(
                'px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold',
                statusOk  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25'
                : trade.status === 'failed'
                          ? 'text-red-400 bg-red-500/10 border border-red-500/25'
                          : 'text-slate-400 bg-slate-500/10 border border-slate-500/25'
              )}>
                {trade.status?.toUpperCase()}
              </span>
            </div>

            <div className="text-slate-500 text-xs mt-0.5 font-mono">{fmtET(trade.created_at)}</div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-6">

          {/* ── Financials grid ─── */}
          <div>
            <SectionLabel>Financials</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <MetricCell
                label="Amount"
                value={`τ ${trade.amount?.toFixed(6)}`}
                valueClass={isBuy ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCell
                label="TAO Price"
                value={`$${(trade.price_at_trade ?? 0).toFixed(2)}`}
                valueClass="text-slate-200"
              />
              <MetricCell
                label="USD Value"
                value={`$${(trade.usd_value ?? 0).toFixed(4)}`}
                valueClass="text-slate-200"
              />
              <MetricCell
                label="Realised P&L"
                value={`${pnlPos ? '+' : ''}${pnl.toFixed(6)} τ`}
                valueClass={pnlPos ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCell
                label="P&L %"
                value={`${pnlPos ? '+' : ''}${pnlPct.toFixed(2)}%`}
                valueClass={pnlPos ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCell
                label="Network Fee"
                value={fee > 0 ? `τ ${fee.toFixed(6)}` : 'None recorded'}
                valueClass={fee > 0 ? 'text-amber-400' : 'text-slate-600'}
              />
            </div>
          </div>

          {/* ── Classification ─── */}
          <div>
            <SectionLabel>Classification</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCell
                label="Strategy"
                value={stratLabel}
                valueClass="text-cyan-300"
                mono={false}
              />
              <MetricCell
                label="Subnet"
                value={trade.netuid != null ? `SN${trade.netuid}` : '—'}
                valueClass="text-violet-300"
              />
              <MetricCell
                label="Network"
                value={trade.network ?? 'finney'}
                valueClass="text-slate-300"
              />
              <MetricCell
                label="Mode at Time"
                value={strategyMode ?? (isLive ? 'LIVE' : 'PAPER')}
                valueClass={isLive ? 'text-emerald-400' : 'text-amber-400'}
              />
            </div>

            {/* Signal reason — full text */}
            {trade.signal_reason && (
              <div className="mt-2.5 bg-[#070e1a] border border-[#1e3a5f] rounded-xl p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Signal Reason</div>
                <p className="text-slate-300 text-xs leading-relaxed font-mono">{trade.signal_reason}</p>
              </div>
            )}
          </div>

          {/* ── On-Chain Data ─── */}
          <div>
            <SectionLabel>On-Chain Data</SectionLabel>

            {!hasTx ? (
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                <Database size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-amber-400 text-xs font-semibold">Paper Trade — No Chain Data</div>
                  <div className="text-amber-500/70 text-[11px] mt-0.5">
                    This trade was simulated. No on-chain extrinsic exists. Switch the strategy to LIVE to generate real txns.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* TX Hash box */}
                <div className="bg-[#070e1a] border border-[#1e3a5f] rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Hash size={12} className="text-slate-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {trade.tx_hash?.startsWith('block:') ? 'Block Reference' : 'TX Hash / Extrinsic'}
                    </span>
                    {isLive && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Confirmed on-chain
                      </span>
                    )}
                  </div>

                  {/* Full hash display */}
                  <div className="flex items-start gap-2">
                    <code className="flex-1 text-[11px] font-mono text-slate-200 break-all leading-relaxed">
                      {trade.tx_hash}
                    </code>
                    <button
                      onClick={() => copyText(trade.tx_hash!, 'TX hash copied')}
                      className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors mt-0.5"
                      title="Copy TX hash"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                {/* Explorer links grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Taostats */}
                  <a
                    href={taostatsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-[#1e3a5f]
                               bg-[#070e1a] hover:border-orange-500/40 hover:bg-orange-500/5 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30
                                    flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Activity size={14} className="text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-semibold">Taostats</div>
                      <div className="text-slate-500 text-[11px]">View {taostatsLabel}</div>
                    </div>
                    <ExternalLink size={12} className="text-slate-600 group-hover:text-orange-400 transition-colors flex-shrink-0" />
                  </a>

                  {/* TAO.app */}
                  {trade.netuid != null && (
                    <a
                      href={taoAppHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-[#1e3a5f]
                                 bg-[#070e1a] hover:border-violet-500/40 hover:bg-violet-500/5 transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30
                                      flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <Globe size={14} className="text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-semibold">TAO.app</div>
                        <div className="text-slate-500 text-[11px]">SN{trade.netuid} overview</div>
                      </div>
                      <ExternalLink size={12} className="text-slate-600 group-hover:text-violet-400 transition-colors flex-shrink-0" />
                    </a>
                  )}
                </div>

                {/* Verification tip */}
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl
                                bg-emerald-500/5 border border-emerald-500/20 text-[11px]">
                  <Shield size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-emerald-400/80">
                    <span className="font-semibold text-emerald-300">Verify independently</span> — always cross-check the TX hash on Taostats to confirm settlement.
                    If you see the extrinsic listed with <span className="font-semibold">Success</span>, the stake operation completed on Bittensor's Finney mainnet.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Timestamps ─── */}
          <div>
            <SectionLabel>Timestamps</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <MetricCell
                label="Created (ET · NYC)"
                value={fmtET(trade.created_at)}
                valueClass="text-slate-300"
                mono={false}
              />
              {trade.executed_at && (
                <MetricCell
                  label="Executed (ET · NYC)"
                  value={fmtET(trade.executed_at)}
                  valueClass="text-slate-300"
                  mono={false}
                />
              )}
            </div>
          </div>

          {/* ── Error (if any) ─── */}
          {trade.error_message && (
            <div className="flex items-start gap-3 px-4 py-3 bg-red-500/8 border border-red-500/25 rounded-xl">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-red-400 text-xs font-semibold mb-1">Error</div>
                <div className="text-red-400/80 text-[11px] font-mono leading-relaxed">{trade.error_message}</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-[#1e3a5f] flex items-center justify-between gap-3"
          style={{ background: 'rgba(8,15,30,0.96)', backdropFilter: 'blur(12px)' }}>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400
                       border border-[#1e3a5f] hover:text-white hover:border-slate-500 transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {hasTx && (
              <>
                {trade.netuid != null && (
                  <a
                    href={taoAppHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold
                               text-violet-400 border border-violet-500/40 hover:bg-violet-500/10 transition-colors"
                  >
                    <Globe size={12} />
                    TAO.app
                    <ExternalLink size={10} />
                  </a>
                )}
                <a
                  href={taostatsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                             text-white bg-orange-500/20 border border-orange-500/40
                             hover:bg-orange-500/30 transition-colors"
                >
                  <Activity size={12} className="text-orange-400" />
                  View on Taostats
                  <ChevronRight size={11} />
                </a>
              </>
            )}
            {!hasTx && (
              <span className="text-[11px] text-slate-600 italic">
                Paper trade — no chain data to view
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}