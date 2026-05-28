/**
 * Ari prompt + page-descriptor registry — F-45 rebrand build, Day 15.
 *
 * Single source of truth for:
 *   1. Per-page leading questions (PAGE_DESCRIPTORS)
 *   2. The chat-page rotating placeholder cycle (ROTATING_PROMPTS)
 *   3. The HAL-orb quick-prompt pills (ORB_QUICK_PROMPTS)
 *
 * The contract is forward-compatible: future pages register a
 * PageDescriptor entry to become chat-discoverable; future orb pills
 * append an OrbPrompt entry; future placeholder rotations append to
 * ROTATING_PROMPTS. None of these touch backend code — the chat
 * endpoint keyword-routes the resulting query strings.
 *
 * Per the F-45 spec (specs/ari-rebrand/document.md), this registry
 * is intentionally NOT coupled to backend route shapes. A prompt
 * string is just a sentence; the keyword router on the backend
 * recognizes it (or gracefully degrades). That decoupling lets us
 * iterate on prompts without touching Python.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Time-window the operator can attach to a parametric prompt. */
export type PromptWindow = '7d' | '30d' | '1y' | 'all'

export interface PageDescriptor {
  /** Stable id, used by future "Ask Ari about this page" buttons. */
  id: string
  /** Display name as it appears in the side menu. */
  name: string
  /** Route path. */
  route: string
  /** One-sentence description of what the page contains. */
  description: string
  /** Leading question. {subnet} / {window} placeholders may appear. */
  leadingQuestion: string
  /** Optional list of timeframes the page supports. */
  windows?: PromptWindow[]
  /** True if the page IS the answer surface (chat-click navigates). */
  navigateOnly?: boolean
}

/**
 * Orb quick-prompt pill descriptor. The pill builder receives an
 * optional subnet + window and returns the chat-bound query string.
 */
export interface OrbPrompt {
  id: string
  /** Visible pill label (no subnet substitution; that happens in the popover). */
  label: string
  /** Builder: subnet always supplied; window optional. */
  build: (subnet: number, win?: PromptWindow) => string
  needsSubnet: boolean
  needsWindow: boolean
  /** Default window when needsWindow is true. */
  defaultWindow?: PromptWindow
}

// ── Subnet defaults ──────────────────────────────────────────────────────────

/**
 * Subnets actively monitored by Ari (per SubnetHeatMap). When an orb
 * pill needs a subnet selector, these surface first; the full list of
 * registered subnets is available in MarketData state.
 */
export const ARI_ACTIVE_SUBNETS = [1, 8, 9, 18, 64, 96] as const

/** All subnets the operator can choose from (full registry to come from API). */
export const ALL_SUBNET_IDS_FALLBACK = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  // Non-exhaustive seed list. The orb popover should hydrate from
  // /api/market/subnets when available; this list is the offline
  // fallback so the popover renders something even before that
  // request resolves.
] as const

// ── Page descriptors ─────────────────────────────────────────────────────────

/**
 * Each registered page contributes a leading question that Ari can
 * surface as a prompt. {subnet} and {window} are substituted at
 * prompt-build time.
 */
export const PAGE_DESCRIPTORS: PageDescriptor[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    route: '/',
    description: 'Top-level overview: regime, fleet PnL, win rate, total trades, and the four-stage Ari → Fleet Consensus → 12 Bots → Trades pipeline.',
    leadingQuestion: 'What is the total fleet PnL right now?',
  },
  {
    id: 'ari-chat',
    name: 'Ari',
    route: '/ii-agent',
    description: 'Chat with Ari. Keyword-routed against live fleet, market, and audit data.',
    leadingQuestion: 'Ask Ari anything about the fleet, regime, or strategies.',
  },
  {
    id: 'fleet-consensus',
    name: 'Fleet Consensus',
    route: '/fleet-consensus',
    description: 'The 12-bot voting council with 7/12 supermajority floor. Round history, vote forecasting, BFT explainer.',
    leadingQuestion: 'Forecast: would a BUY signal pass right now?',
  },
  {
    id: 'agent-fleet',
    name: 'Agent Fleet',
    route: '/fleet',
    description: '12 strategy bots with health badges (HOT / HEALTHY / WATCHING / WEAK / WARMING). Click any bot to drill into Strategy Detail.',
    leadingQuestion: 'Which strategies are approved or close to promotion?',
  },
  {
    id: 'strategies',
    name: 'Strategies',
    route: '/strategies',
    description: 'Per-strategy panels with WR, PnL, cycles, gate progress, and the Grinold/Kahn IC × Breadth Fundamental Law decomposition (F-30).',
    leadingQuestion: 'Display recent trades in Subnet {subnet}',
    navigateOnly: false,
  },
  {
    id: 'pnl',
    name: 'P&L Summary',
    route: '/pnl',
    description: 'Realized / unrealized / cumulative PnL across paper and live cohorts, never blended.',
    leadingQuestion: 'What is the total fleet PnL right now?',
  },
  {
    id: 'alerts',
    name: 'Alerts Log',
    route: '/alerts',
    description: 'Real-time alerts: regime shifts, gate promotions, drawdown breaches, consensus votes.',
    leadingQuestion: 'What changed today?',
  },
  {
    id: 'activity-log',
    name: 'Activity Log',
    route: '/activity',
    description: 'Every Ari analysis cycle, every webhook fire, every state transition.',
    leadingQuestion: 'Show me recent edits',
  },
  {
    id: 'trade-log',
    name: 'Trade Log',
    route: '/trade-log',
    description: 'Closed trades with realized PnL, holding period, fill quality, and fleet-consensus snapshot at entry.',
    leadingQuestion: 'Display recent trades in Subnet {subnet}',
  },
  {
    id: 'analytics',
    name: 'Subnet Analytics',
    route: '/analytics',
    description: 'Cross-subnet analytics: emission, stake distribution, validator concentration, owner activity.',
    leadingQuestion: 'Top 5 subnets by score',
  },
  {
    id: 'market-data',
    name: 'Subnet Market Data',
    route: '/market',
    description: 'Live price, market cap, 24h change, pool depth, liquidity, and Ari-monitored highlights for every subnet.',
    leadingQuestion: 'What subnets is the bot trading?',
  },
  {
    id: 'research',
    name: 'Subnet Scorecard',
    route: '/research',
    description: 'Const 6-Filter Test (digital commodity / productive miners / intelligent / hard / not-ponzi / AI-native) plus Owner Watch and Conviction-Era heuristics.',
    leadingQuestion: 'Which subnets pass 6/6 filters?',
  },
  {
    id: 'pre-trade',
    name: 'Subnet Pool Simulator',
    route: '/pre-trade',
    description: 'Constant-product AMM math, slippage curves, ±50% exit scenarios, Almgren-Chriss optimal slicing recommendation (F-39B).',
    leadingQuestion: 'Summarize recent whale activity for Subnet {subnet}',
  },
  {
    id: 'subnet-detail',
    name: 'Subnet Detail',
    route: '/subnet/:netuid',
    description: 'Per-subnet deep dive: header status, monitored badge, validator routing, recent stakers, signal feed slice, whale flow slice.',
    leadingQuestion: 'Describe Subnet {subnet}',
  },
  {
    id: 'risk-config',
    name: 'Risk Config',
    route: '/risk',
    description: 'Risk controls: max drawdown, stop-loss, position size, daily limit, Sharpe Contract, Position Cap Structure (F-37B), feature flags.',
    leadingQuestion: 'What are the current risk controls?',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    route: '/wallet',
    description: "Ari's active trading wallet on Finney mainnet — balance, recent transactions, validator routing.",
    leadingQuestion: "What's the wallet balance?",
  },
  {
    id: 'audit',
    name: 'Audit Trail',
    route: '/audit',
    description: 'Configuration-change history. Every risk-config edit, every flag flip, every operator override is on this trail.',
    leadingQuestion: 'Any risk config changes this week?',
  },
]

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** Build a chat query from a leading question by substituting params. */
export function buildPrompt(
  template: string,
  params: { subnet?: number; window?: PromptWindow },
): string {
  let out = template
  if (params.subnet !== undefined) {
    out = out.replace(/\{subnet\}/g, String(params.subnet))
  }
  if (params.window !== undefined) {
    out = out.replace(/\{window\}/g, params.window)
  }
  // Remove trailing ellipsis if the param was unfilled and the template
  // originally ended with "Subnet…" (graceful degradation).
  return out.replace(/\{subnet\}/g, 'a subnet').replace(/\{window\}/g, '7d')
}

/** Find a descriptor by route path. Useful for "Ask Ari about this page". */
export function findDescriptorByRoute(route: string): PageDescriptor | undefined {
  return PAGE_DESCRIPTORS.find(d => d.route === route)
}

// ── Rotating placeholder for the chat-page input ─────────────────────────────

/**
 * Cycles every ~4s on the chat page input placeholder when the input is
 * unfocused and empty. Six page-anchored prompts plus two legacy
 * fall-throughs for variety.
 */
export const ROTATING_PROMPTS: string[] = [
  "Ask Ari: What's the community sentiment on Subnet 8?",
  "Ask Ari: What's the latest GitHub activity in Subnet 9?",
  "Ask Ari: Summarize recent whale activity for Subnet 18…",
  "Ask Ari: Show recent community X posts from Subnet 64…",
  "Ask Ari: What's the % ratio of Stake/Unstake in Subnet 96?",
  "Ask Ari: Display recent trades in Subnet 8…",
  "Ask Ari: What's the total fleet PnL right now?",
  "Ask Ari: Which strategies are approved or close to promotion?",
]

/** Static fallback for prefers-reduced-motion. */
export const ROTATING_PROMPT_STATIC = 'Ask Ari anything…'

// ── Orb quick-prompt pills (3 mounted in the HAL orb panel) ──────────────────

export const ORB_QUICK_PROMPTS: OrbPrompt[] = [
  {
    id: 'describe-subnet',
    label: 'Describe Subnet',
    build: (subnet) => `Describe Subnet ${subnet}`,
    needsSubnet: true,
    needsWindow: false,
  },
  {
    id: 'social-activity',
    label: 'Social Activity',
    build: (subnet, win) =>
      `Analyze the community sentiment on Subnet ${subnet} over the past ${win ?? '7d'}`,
    needsSubnet: true,
    needsWindow: true,
    defaultWindow: '7d',
  },
  {
    id: 'recent-stakers',
    label: 'Recent Stakers',
    build: (subnet, win) =>
      `Who has been actively staking into Subnet ${subnet} in the last ${win ?? '7d'}?`,
    needsSubnet: true,
    needsWindow: true,
    defaultWindow: '7d',
  },
]

// ── Window options for popovers ──────────────────────────────────────────────

export const WINDOW_OPTIONS: { value: PromptWindow; label: string }[] = [
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
  { value: '1y', label: 'Past year' },
  { value: 'all', label: 'All time' },
]