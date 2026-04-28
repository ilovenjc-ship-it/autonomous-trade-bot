/**
 * Wallet Transactions — complete funding ledger
 *
 * Every TAO deposit into the bot wallet is documented here.
 * No more guessing. This is the accounting record.
 *
 * Tabs:
 *   Funding Events — operator-recorded and chain-detected inflows
 *   Ledger         — unified timeline (fundings + live trades)
 *   Chain Transfers — raw on-chain inbound transfers (Taostats API)
 */
import { useEffect, useState, useCallback } from 'react'
import {
  ArrowDownCircle, ArrowUpCircle, RefreshCw, ExternalLink, Plus,
  Copy, Trash2, DollarSign, TrendingDown, CheckCircle2, XCircle,
  AlertTriangle, ArrowRightLeft, Landmark, ChevronDown, type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api from '@/api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total_funded_tao:    number
  funding_count:       number
  current_balance_tao: number
  staked_tao:          number
  total_value_tao:     number
  net_pnl_tao:         number
  net_pnl_pct:         number
  coldkey_address:     string
  taostats_url:        string
}

interface FundingEntry {
  type:         string
  subtype:      string
  id:           string
  db_id?:       number
  amount_tao:   number
  from_address?: string
  tx_hash?:     string
  block_number?: number
  timestamp?:   string
  note?:        string
  source:       string
  deletable?:   boolean
}

interface TradeEntry {
  type:       string
  subtype:    string
  id:         string
  amount_tao: number
  tx_hash?:   string
  timestamp?: string
  strategy?:  string
  netuid?:    number
  pnl?:       number
  fee?:       number
  note?:      string
  source:     string
  live?:      boolean
}

interface ChainTransfer {
  type:          string
  subtype:       string
  id:            string
  amount_tao:    number
  from_address?: string
  to_address?:   string
  tx_hash?:      string
  block_number?: number
  timestamp?:    string
  source:        string
}

type LedgerRow = FundingEntry | TradeEntry | ChainTransfer

interface TransactionsData {
  summary:        Summary
  fundings:       FundingEntry[]
  trades:         TradeEntry[]
  chain_transfers: ChainTransfer[]
  chain_error:    string
  unified_ledger: LedgerRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined, dp = 4): string {
  if (n === undefined || n === null || isNaN(n)) return '—'
  return `τ ${n.toFixed(dp)}`
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
      hour12: false,
    }).format(new Date(iso)) + ' ET'
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

function shortHash(h?: string): string {
  if (!h) return '—'
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'))
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color = 'text-cyan-400', icon: Icon,
}: {
  label: string; value: string; sub?: string
  color?: string; icon: LucideIcon
}) {
  return (
    <div className="bg-[#0f1929] border border-[#1e3a5f] rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider">
        <Icon size={13} className={color} />
        {label}
      </div>
      <div className={clsx('text-2xl font-bold font-mono', color)}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

// ── Add Funding Modal ─────────────────────────────────────────────────────────

function AddFundingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount]       = useState('')
  const [date,   setDate]         = useState(new Date().toISOString().slice(0, 16))
  const [note,   setNote]         = useState('')
  const [txHash, setTxHash]       = useState('')
  const [fromAddr, setFromAddr]   = useState('')
  const [saving, setSaving]       = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid TAO amount'); return }
    setSaving(true)
    try {
      await api.post('/wallet/funding', {
        amount_tao:   amt,
        funded_at:    new Date(date).toISOString(),
        note:         note.trim() || undefined,
        tx_hash:      txHash.trim() || undefined,
        from_address: fromAddr.trim() || undefined,
      })
      toast.success(`τ${amt.toFixed(4)} funding recorded`)
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e?.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1b2e] border border-[#1e3a5f] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-emerald-400" />
            <span className="font-bold text-white">Record Wallet Funding</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="p-6 flex flex-col gap-4">
          {/* Amount */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Amount (TAO) *
            </label>
            <input
              type="number" step="0.0001" min="0.0001" required
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 0.5000"
              className="w-full bg-[#0a1220] border border-[#1e3a5f] rounded-lg px-3 py-2
                         text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Date & Time *
            </label>
            <input
              type="datetime-local" required
              value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-[#0a1220] border border-[#1e3a5f] rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Note
            </label>
            <input
              type="text"
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Initial seed, Emergency refill, Session XIV recovery"
              className="w-full bg-[#0a1220] border border-[#1e3a5f] rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* TX Hash */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              Transaction Hash (optional)
            </label>
            <input
              type="text"
              value={txHash} onChange={e => setTxHash(e.target.value)}
              placeholder="0x... or extrinsic ID"
              className="w-full bg-[#0a1220] border border-[#1e3a5f] rounded-lg px-3 py-2
                         text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* From Address */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">
              From Address (optional)
            </label>
            <input
              type="text"
              value={fromAddr} onChange={e => setFromAddr(e.target.value)}
              placeholder="5… sender coldkey"
              className="w-full bg-[#0a1220] border border-[#1e3a5f] rounded-lg px-3 py-2
                         text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[#1e3a5f] text-slate-400
                         hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500
                         text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Record Funding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type, subtype }: { type: string; subtype?: string }) {
  const live = subtype === 'live' || subtype === 'chain'

  const cfg: Record<string, { label: string; cls: string }> = {
    FUNDING:     { label: '↓ FUNDING',    cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    TRANSFER_IN: { label: '↓ TRANSFER',   cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    STAKE:       { label: live ? '🔴 STAKE' : '📄 STAKE',
                   cls: live ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                             : 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    UNSTAKE:     { label: live ? '🔴 UNSTAKE' : '📄 UNSTAKE',
                   cls: live ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                             : 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  }

  const { label, cls } = cfg[type] ?? { label: type, cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
  return (
    <span className={clsx('px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap', cls)}>
      {label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = 'fundings' | 'ledger' | 'chain'

export default function WalletTransactions() {
  const [data,       setData]       = useState<TransactionsData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<Tab>('fundings')
  const [showModal,  setShowModal]  = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<TransactionsData>('/wallet/transactions')
      setData(res.data)
    } catch (err) {
      toast.error('Failed to load transaction data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteFunding(id: number) {
    if (!window.confirm('Delete this funding record?')) return
    setDeletingId(id)
    try {
      await api.delete(`/wallet/funding/${id}`)
      toast.success('Record deleted')
      await load()
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const s = data?.summary
  const pnlPositive = (s?.net_pnl_tao ?? 0) >= 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full bg-[#070e1a] text-white">

      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1e3a5f] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Landmark size={22} className="text-cyan-400" />
            Wallet Transactions
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Complete funding ledger — every TAO sent to this wallet, accounted for
          </p>
          {s?.coldkey_address && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] font-mono text-slate-500 bg-[#0a1220] px-2 py-1 rounded-lg border border-[#1e3a5f]">
                {s.coldkey_address.slice(0, 12)}…{s.coldkey_address.slice(-8)}
              </span>
              <button
                onClick={() => copyText(s.coldkey_address)}
                className="text-slate-500 hover:text-cyan-400 transition-colors"
                title="Copy address"
              >
                <Copy size={12} />
              </button>
              {s.taostats_url && (
                <a
                  href={s.taostats_url} target="_blank" rel="noopener noreferrer"
                  className="text-slate-500 hover:text-cyan-400 transition-colors"
                  title="View on Taostats"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#0f1929] border border-[#1e3a5f]
                     rounded-lg text-slate-300 hover:text-white text-sm transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Funded"
          value={s ? fmt(s.total_funded_tao) : '…'}
          sub={`${s?.funding_count ?? 0} recorded deposit${(s?.funding_count ?? 0) !== 1 ? 's' : ''}`}
          color="text-emerald-400"
          icon={ArrowDownCircle}
        />
        <SummaryCard
          label="Current Balance"
          value={s ? fmt(s.current_balance_tao) : '…'}
          sub={s ? `+ τ${s.staked_tao.toFixed(4)} staked` : '…'}
          color="text-cyan-400"
          icon={DollarSign}
        />
        <SummaryCard
          label="Total Value"
          value={s ? fmt(s.total_value_tao) : '…'}
          sub="Liquid + staked"
          color="text-blue-400"
          icon={ArrowRightLeft}
        />
        <SummaryCard
          label="Net P&L"
          value={s ? (pnlPositive ? '+' : '') + fmt(s.net_pnl_tao) : '…'}
          sub={s ? `${s.net_pnl_pct >= 0 ? '+' : ''}${s.net_pnl_pct.toFixed(1)}% vs funded` : '…'}
          color={pnlPositive ? 'text-emerald-400' : 'text-red-400'}
          icon={pnlPositive ? CheckCircle2 : TrendingDown}
        />
      </div>

      {/* Chain error banner */}
      {data?.chain_error && (
        <div className="mx-6 mb-3 px-4 py-2 bg-amber-500/10 border border-amber-500/30
                        rounded-lg flex items-center gap-2 text-amber-400 text-xs">
          <AlertTriangle size={13} />
          <span>Chain transfer API unavailable: {data.chain_error.slice(0, 120)}</span>
        </div>
      )}

      {/* No funding warning */}
      {!loading && data && s && s.total_funded_tao === 0 && (
        <div className="mx-6 mb-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30
                        rounded-lg flex items-start gap-3 text-amber-300 text-sm">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">No funding events recorded yet.</div>
            <div className="text-xs text-amber-400/80 mt-1">
              Use "Record Funding" to document every TAO deposit into this wallet.
              This is your accounting foundation — without it, net P&L cannot be calculated.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 flex items-center gap-1 border-b border-[#1e3a5f] pb-0">
        {([
          ['fundings', 'Funding Events', ArrowDownCircle],
          ['ledger',   'Full Ledger',    ArrowRightLeft],
          ['chain',    'Chain Transfers',ExternalLink],
        ] as [Tab, string, LucideIcon][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              tab === id
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-white'
            )}
          >
            <Icon size={13} />
            {label}
            {id === 'fundings' && data && (
              <span className="ml-1 bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {data.fundings.length}
              </span>
            )}
            {id === 'chain' && data && data.chain_transfers.length > 0 && (
              <span className="ml-1 bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {data.chain_transfers.length}
              </span>
            )}
          </button>
        ))}

        {/* Add funding button — right aligned */}
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto mb-1.5 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600
                     hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus size={12} />
          Record Funding
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto px-6 py-4">

        {/* ── Funding Events tab ──────────────────────────────────────────── */}
        {tab === 'fundings' && (
          <div>
            {(!data?.fundings || data.fundings.length === 0) ? (
              <EmptyState
                icon={ArrowDownCircle}
                title="No funding events recorded"
                body="Every time you send TAO to this wallet, record it here. This is how net P&L is calculated."
                action={{ label: 'Record First Funding', onClick: () => setShowModal(true) }}
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#1e3a5f]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0a1220] text-slate-400 text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Date / Time</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Note</th>
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-left">TX Hash</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3a5f]">
                    {data.fundings.map((f, i) => (
                      <tr
                        key={f.id}
                        className={clsx(
                          'transition-colors',
                          i % 2 === 0 ? 'bg-[#070e1a]' : 'bg-[#0a1220]',
                          'hover:bg-[#0f1929]'
                        )}
                      >
                        <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                          {fmtDate(f.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          {fmt(f.amount_tao)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">
                          {f.note || <span className="text-slate-600 italic">no note</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            f.source === 'manual'
                              ? 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                              : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                          )}>
                            {f.source?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {f.tx_hash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-400">
                                {shortHash(f.tx_hash)}
                              </span>
                              <button
                                onClick={() => copyText(f.tx_hash!)}
                                className="text-slate-500 hover:text-cyan-400 transition-colors"
                              >
                                <Copy size={10} />
                              </button>
                              <a
                                href={`https://taostats.io/extrinsic/${f.tx_hash}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-slate-500 hover:text-cyan-400 transition-colors"
                              >
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {f.deletable && (
                            <button
                              onClick={() => f.db_id && deleteFunding(f.db_id)}
                              disabled={deletingId === f.db_id}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                              title="Delete record"
                            >
                              {deletingId === f.db_id ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals footer */}
                  <tfoot>
                    <tr className="bg-[#0d1b2e] border-t border-[#1e3a5f]">
                      <td className="px-4 py-3 text-slate-400 text-xs font-semibold">
                        TOTAL ({data.fundings.length} deposits)
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {fmt(s?.total_funded_tao)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Full Ledger tab ─────────────────────────────────────────────── */}
        {tab === 'ledger' && (
          <div>
            <div className="text-xs text-slate-500 mb-3">
              Unified timeline — funding events + live on-chain trades. Paper trades excluded.
              Sorted newest first.
            </div>
            {(!data?.unified_ledger || data.unified_ledger.length === 0) ? (
              <EmptyState
                icon={ArrowRightLeft}
                title="No ledger entries yet"
                body="Record funding events and execute live trades to populate the ledger."
              />
            ) : (
              <div className="space-y-1.5">
                {data.unified_ledger
                  .filter((row) => {
                    // Show fundings, chain transfers, and LIVE trades only
                    if (row.type === 'FUNDING' || row.type === 'TRANSFER_IN') return true
                    const tr = row as TradeEntry
                    return tr.live === true
                  })
                  .map((row) => (
                    <LedgerRow
                      key={row.id}
                      row={row}
                      expanded={!!expanded[row.id]}
                      onToggle={() => toggleExpand(row.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── Chain Transfers tab ─────────────────────────────────────────── */}
        {tab === 'chain' && (
          <div>
            <div className="flex items-start gap-3 mb-4 px-4 py-3 bg-blue-500/10
                            border border-blue-500/20 rounded-xl text-xs text-blue-300">
              <ExternalLink size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">On-chain transfer data from Taostats API</div>
                <div className="text-blue-400/80">
                  Shows inbound TAO transfers detected on-chain. If the API is unavailable, data may be empty.
                  Cross-reference with Taostats.io for verification.
                  {s?.taostats_url && (
                    <>
                      {' '}
                      <a href={s.taostats_url} target="_blank" rel="noopener noreferrer"
                         className="underline hover:text-white">
                        View wallet on Taostats ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {data?.chain_error && (
              <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30
                              rounded-xl text-amber-300 text-xs flex items-start gap-2">
                <XCircle size={14} className="mt-0.5" />
                <div>
                  <div className="font-semibold">API Error</div>
                  <div className="text-amber-400/80 mt-0.5">{data.chain_error}</div>
                  <div className="text-amber-500/60 mt-1">
                    Manually record funding events in the "Funding Events" tab as a fallback.
                  </div>
                </div>
              </div>
            )}

            {!data?.chain_transfers || data.chain_transfers.length === 0 ? (
              <EmptyState
                icon={ExternalLink}
                title="No chain transfers detected"
                body="Either the Taostats API is unavailable, or no inbound TAO transfers have occurred on-chain yet."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#1e3a5f]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0a1220] text-slate-400 text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">From</th>
                      <th className="px-4 py-3 text-left">Block</th>
                      <th className="px-4 py-3 text-left">TX Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3a5f]">
                    {data.chain_transfers.map((t, i) => (
                      <tr
                        key={t.id}
                        className={clsx(
                          i % 2 === 0 ? 'bg-[#070e1a]' : 'bg-[#0a1220]',
                          'hover:bg-[#0f1929] transition-colors'
                        )}
                      >
                        <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                          {fmtDate(t.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                          {fmt(t.amount_tao)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-400 max-w-[180px] truncate">
                          {t.from_address || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {t.block_number?.toLocaleString() || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {t.tx_hash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-400">
                                {shortHash(t.tx_hash)}
                              </span>
                              <button onClick={() => copyText(t.tx_hash!)}
                                className="text-slate-500 hover:text-cyan-400">
                                <Copy size={10} />
                              </button>
                              <a href={`https://taostats.io/extrinsic/${t.tx_hash}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-slate-500 hover:text-cyan-400">
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Funding Modal */}
      {showModal && (
        <AddFundingModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ── Ledger Row (expandable) ───────────────────────────────────────────────────

function LedgerRow({
  row, expanded, onToggle,
}: {
  row: LedgerRow; expanded: boolean; onToggle: () => void
}) {
  const tr = row as TradeEntry
  const isFunding = row.type === 'FUNDING' || row.type === 'TRANSFER_IN'

  return (
    <div className={clsx(
      'border rounded-xl transition-colors overflow-hidden',
      isFunding ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#1e3a5f] bg-[#070e1a]'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        {/* Icon */}
        <div className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          isFunding ? 'bg-emerald-500/20' : 'bg-slate-500/20'
        )}>
          {isFunding
            ? <ArrowDownCircle size={14} className="text-emerald-400" />
            : tr.type === 'STAKE'
              ? <ArrowUpCircle size={14} className="text-amber-400" />
              : <ArrowDownCircle size={14} className="text-blue-400" />
          }
        </div>

        {/* Type badge */}
        <TypeBadge type={row.type} subtype={(row as TradeEntry).subtype} />

        {/* Amount */}
        <span className={clsx(
          'font-mono font-bold text-sm',
          isFunding ? 'text-emerald-400' : 'text-white'
        )}>
          {isFunding ? '+' : tr.type === 'STAKE' ? '-' : '+'}{fmt(row.amount_tao)}
        </span>

        {/* Strategy / note preview */}
        <span className="text-slate-500 text-xs flex-1 truncate">
          {(row as TradeEntry).strategy
            ? `SN${(row as TradeEntry).netuid ?? '?'} · ${(row as TradeEntry).strategy}`
            : (row as FundingEntry).note || ''}
        </span>

        {/* Date */}
        <span className="text-slate-500 text-[11px] whitespace-nowrap">
          {fmtDate(row.timestamp)}
        </span>

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          className={clsx('text-slate-500 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[#1e3a5f] grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {row.tx_hash && (
            <div>
              <div className="text-slate-500 uppercase font-semibold mb-1">TX Hash</div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-slate-300">{shortHash(row.tx_hash)}</span>
                <button onClick={() => copyText(row.tx_hash!)} className="text-slate-500 hover:text-cyan-400">
                  <Copy size={10} />
                </button>
                <a href={`https://taostats.io/extrinsic/${row.tx_hash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-slate-500 hover:text-cyan-400">
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
          {(row as FundingEntry).from_address && (
            <div>
              <div className="text-slate-500 uppercase font-semibold mb-1">From</div>
              <div className="font-mono text-slate-300 truncate">{(row as FundingEntry).from_address}</div>
            </div>
          )}
          {(row as TradeEntry).pnl !== undefined && (
            <div>
              <div className="text-slate-500 uppercase font-semibold mb-1">Est. P&L</div>
              <div className={clsx('font-mono font-bold', (tr.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {(tr.pnl ?? 0) >= 0 ? '+' : ''}{fmt(tr.pnl)}
              </div>
            </div>
          )}
          {(row as TradeEntry).fee !== undefined && (row as TradeEntry).fee! > 0 && (
            <div>
              <div className="text-slate-500 uppercase font-semibold mb-1">Fee Paid</div>
              <div className="font-mono text-amber-400">{fmt((row as TradeEntry).fee)}</div>
            </div>
          )}
          {row.timestamp && (
            <div>
              <div className="text-slate-500 uppercase font-semibold mb-1">Time</div>
              <div className="text-slate-300">{fmtDate(row.timestamp)}</div>
            </div>
          )}
          {(row as FundingEntry).note && (
            <div className="col-span-2">
              <div className="text-slate-500 uppercase font-semibold mb-1">Note</div>
              <div className="text-slate-300">{(row as FundingEntry).note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon, title, body, action,
}: {
  icon: LucideIcon
  title: string; body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={40} className="text-slate-600 mb-4" />
      <div className="text-slate-400 font-semibold text-sm mb-2">{title}</div>
      <div className="text-slate-600 text-xs max-w-sm">{body}</div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500
                     text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}