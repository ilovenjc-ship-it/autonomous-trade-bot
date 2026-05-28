# Ari Rebrand + Page-Anchored Chat Surfaces

> Day 15, 2026-05-28 — feature spec for the "next-level" UI/UX build slot
> Mark flagged in the morning brief. **Goal in his words:** *"Make the
> App feel more like Project Ari. Universally rename all instances on
> the App referring to 'II Agent' to 'Ari'. Each page should have,
> included in its architecture (via pre-written descriptions in Ari
> chat), briefly explaining key elements and contents of that page,
> in the form of a question that leads from Ari chat and connects to
> that page."*
>
> Authority: **D-44 standing-authority binding** — Architect proceeds
> on Main Mission UI/UX work backed by D-23→D-43 substrate. This is a
> rename + prompt-pill addition on shipped surfaces; not a new feature
> commit without spec, not prescriptive D-class, not live-trading
> parameter, not irreversible.

---

## Overview

Two interlocking changes:

1. **Naming sweep** — every user-facing instance of "II Agent" becomes
   "Ari" across the app (164 string occurrences across 32 files). Code
   identifiers (variable names, type names, route paths, file paths,
   chunk names, store hooks) are **explicitly out of scope** for this
   pass — they have stable semantics, the rename is invasive, and Mark's
   directive ("on the App") targets visible strings. A second pass to
   rename internal identifiers can follow if Mark wants it; not today.

2. **Page-anchored chat surfaces** — the HAL orb's hover tooltip becomes
   "Chat with Ari", three quick-prompt pills are added to the orb panel,
   the dedicated chat page (`/ii-agent` route, kept for URL stability)
   gets a rotating placeholder that cycles through prompts anchored to
   real pages (Signal Feed, Whale Flow, Strategy Detail, Subnet Detail).
   Each prompt either answers in chat (when data is available) or
   deep-links to the source page (when the natural surface is the page
   itself).

---

## Goals

- **Goal 1 — Brand coherence.** The product is *Project Ari*. The agent
  inside the product should be named *Ari*. The current "II Agent" naming
  is the legacy of a different framing; it makes the product feel like a
  generic "II Agent on Bittensor" instead of the specific named partner
  Mark talks to. Renaming is the cheapest, highest-leverage way to make
  the product feel like itself.
- **Goal 2 — Discoverability of capabilities.** Operators should not need
  to read documentation to discover what they can ask Ari. The rotating
  placeholder + quick-prompt pills surface the answerable questions
  *as the prompt itself*.
- **Goal 3 — Page-as-data-source registry.** Each page that already
  contains live data (Signal Feed, Whale Flow, Strategy Detail, Subnet
  Detail, Audit Trail) should publish its "leading question" through a
  central registry so chat prompts and pages stay in sync. New pages
  added later should be one entry away from being chat-discoverable.

---

## Scope / Non-Goals

### In scope

- All user-facing strings containing "II Agent" → "Ari" (titles, labels,
  placeholders, tooltips, hover-titles, descriptions, comment-references
  visible in the UI, page headings).
- Side-menu nav label.
- HAL orb hover-title (`title=` and `aria-label=`) + panel header label
  + panel placeholder + panel empty-state hint.
- Dedicated chat page (`pages/IIAgent.tsx`) header label + rotating
  placeholder + quick-prompt set.
- New `lib/ariPrompts.ts` registry that exports per-page descriptors
  and a parametric prompt builder.
- Backend keyword routing in `routers/fleet.py /chat` for the new
  prompt types (community sentiment, GitHub activity, whale activity,
  X posts, stake/unstake ratio, recent trades) — each routes to an
  existing service or returns a graceful "I don't have that data yet,
  here's where it lives" response that deep-links to the page.

### Out of scope (today)

- Renaming code identifiers (`IIAgent`, `iiAgentStats`, `setIIAgentStats`,
  `frontend/src/pages/IIAgent.tsx` filename, `/ii-agent` route, store
  hooks, type names, vite chunk names). These are internal — operators
  never see them. A future cleanup pass can rename them; not today.
- Code-comment archaeology references ("Session XXXVIII relocated FROM
  II Agent page", "originally lived on the II Agent page", etc.) — these
  are *engineering history* and renaming them rewrites the historical
  record. Left as-is. Comments that are *user-facing tooltips* (the few
  where the comment is also surfaced as text) get renamed.
- Adding new data sources behind the new prompts (e.g., wiring up a
  "GitHub commits per subnet" service if one doesn't exist). When data
  is missing, the prompt returns a graceful response that points to the
  source page.
- Voice-input flow changes (Mic button + "Stop listening" hint already
  works, just gets the brand-name swap).

---

## User Flows / UX / Design Notes

### Flow 1 — Side menu

- Current: nav item with `Brain` icon labelled `II Agent`, sitting under
  the `INTELLIGENCE` group heading.
- New: nav item with `Brain` icon labelled `Ari`, with a small subtitle
  underneath in mono text reading `Architect & Orchestrator`. Subtitle
  styling matches the existing nav-label scale (one level smaller, dim).
- Active state (when on the chat page) keeps the existing emerald accent.

### Flow 2 — HAL orb (bottom-left of sidebar)

- **Hover state (collapsed orb):**
  - Current `title="Talk to II Agent"`. New: `title="Chat with Ari"`.
  - Current `aria-label="Open II Agent chat"`. New: `aria-label="Open
    chat with Ari"`.
- **Open state (chat panel expanded):**
  - Header label `II AGENT` → `ARI`. Subtitle `orchestrator` stays.
  - Empty-state hint `Ask II Agent anything about the fleet…` → `Ask
    Ari anything…`.
  - Input placeholder `Ask II Agent…` → see Flow 3 (rotating).
  - Agent message-bubble badge `II AGENT` → `ARI`.
  - Reset confirm dialog `Reset chat with II Agent?` → `Reset chat
    with Ari?`.
- **New: 3 quick-prompt pills** mounted in the orb panel **between the
  header and the message stream** (currently empty space — first message
  bubble pushes down naturally). Pills are parametric:
  - **Pill 1 — `Describe Subnet ▾`** opens a popover with the same
    subnet selector that already lives on `MarketData.tsx`. On select,
    submits `Describe Subnet {N}` to the chat. Backend routes this to
    `subnet_chat_service.answer()` (already handles "tell me about SN18"
    style queries).
  - **Pill 2 — `Social Activity ▾`** opens a two-step popover (subnet,
    then timeframe: 7d / 30d / 1y). On select, submits `Analyze social
    activity in Subnet {N} over the past {window}`. Backend route: see
    Backend §Routing below.
  - **Pill 3 — `Recent Stakers ▾`** same two-step popover. Submits `Who
    has been actively staking into Subnet {N} in the last {window}?`.
- All three pills surface **only when the orb panel is open**. They are
  visually consistent with the existing emerald-tone pill style on
  `pages/IIAgent.tsx` (`border-emerald-500/30 bg-emerald-500/10` etc),
  but use the orb's red/HAL palette instead — `border-red-500/30
  bg-red-500/10 text-red-300 hover:bg-red-500/20` to match the orb
  context, not the page context.

### Flow 3 — Chat page (`pages/IIAgent.tsx`)

- Page-header card current: `Chat with II Agent · ONLINE · backed by
  live fleet & market data`. New: `Chat with Ari · ONLINE · backed by
  live fleet & market data`.
- Existing static placeholder current: `Ask about PnL, regime,
  strategies, risk controls…`. New: **rotating placeholder** cycling
  every 4 seconds through:
  1. `Ask Ari: What's the community sentiment on Subnet 8?`
  2. `Ask Ari: What's the latest GitHub activity in Subnet 9?`
  3. `Ask Ari: Summarize recent whale activity for Subnet 18…`
  4. `Ask Ari: Show recent community X posts from Subnet 64…`
  5. `Ask Ari: What's the % ratio of Stake/Unstake in Subnet 96?`
  6. `Ask Ari: Display recent trades in Subnet 8…`
  7. `Ask Ari: What's the total fleet PnL right now?` (legacy fallback)
  8. `Ask Ari: Which strategies are approved or close to promotion?`
  Rotation **pauses when the input is focused or has text in it** (so
  it doesn't change under the operator while they're reading).
  Rotation **respects `prefers-reduced-motion`** and falls back to a
  static "Ask Ari anything…" placeholder if the user has reduced
  motion enabled.
- Existing `QUICK_PROMPTS` array is preserved verbatim — the 17
  emoji-prefixed quick-pills (PnL, Top bots, Regime, Gate status,
  Cycles, Risk, Top by score, Top APY, Fortress, Vulnerable, 6/6
  subnets, Bot trading, Forecast BUY/SELL, Audit-trail). They're
  Mark-greenlit work from prior sessions; this build adds, doesn't
  replace.
- New: **a thin "Discover" subsection** added below the QUICK_PROMPTS
  row. It's a 2-row scroller of the page-anchored prompts above
  rendered as deep-link cards: each card shows the prompt text, the
  source page name, and a small `→` arrow. Clicking the card either
  (a) submits the prompt as chat if the backend can answer it, or (b)
  navigates to the source page if the natural answer surface is the
  page itself. Discoverability without bloating the existing pill row.

### Flow 4 — Per-page leading-question strip (out of scope this build,
but the spec records the design)

- Each page registers in `ariPrompts.ts` a leading question + a
  description.
- Future iteration: each page top-banner gains an "Ask Ari about this
  page" button that opens the orb pre-populated with the page's
  registered prompt. **Not built today** — Mark's directive lays the
  pattern, this build lays the registry, future builds wire up the
  buttons. Listed here so the registry contract is forward-compatible.

---

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Every user-visible occurrence of "II Agent" (or "II-Agent" / "iiAgent" rendered as text) MUST render as "Ari" after this build. JSX text, `title=`, `aria-label=`, placeholders, `<p>` text, `<span>` text, `<button>` text, `alt=` attributes are all in scope. |
| FR-2 | Code identifiers (function names, type names, variable names, file paths, route paths, chunk names, store-hook names) MUST NOT change in this build. |
| FR-3 | The side-menu nav item label MUST be "Ari" with a subtitle "Architect & Orchestrator" (or Mark-vetoed alternative). |
| FR-4 | The HAL orb's collapsed-state hover tooltip MUST be "Chat with Ari" via the `title=` attribute. The `aria-label=` MUST be "Open chat with Ari" (collapsed) / "Close chat with Ari" (open). |
| FR-5 | The HAL orb's expanded panel MUST display 3 quick-prompt pills (Describe Subnet, Social Activity, Recent Stakers) with parametric subnet/timeframe selectors. |
| FR-6 | The chat page input placeholder MUST rotate through ≥6 prompts every 4 seconds, pausing on focus or non-empty input. Pause MUST also occur when `prefers-reduced-motion: reduce` is set. |
| FR-7 | A central registry `frontend/src/lib/ariPrompts.ts` MUST exist and export: (a) `PAGE_DESCRIPTORS: PageDescriptor[]` keyed by route, (b) `ROTATING_PROMPTS: string[]` for the placeholder cycle, (c) `ORB_QUICK_PROMPTS: OrbPrompt[]` for the 3 orb pills. |
| FR-8 | Backend `/api/fleet/chat` MUST handle (or gracefully degrade for) the new prompt patterns: `community sentiment`, `github activity`, `whale activity`, `X posts`, `stake/unstake ratio`, `recent trades` — see Backend Routing below. |
| FR-9 | Day 8 invariants 30/30 MUST remain green after the build. No backend service touched outside `routers/fleet.py /chat` keyword section + the in-router prompt strings (e.g., line 341 "Regime is re-evaluated every 5 minutes by II Agent" → "...by Ari"). |
| FR-10 | TypeScript strict-mode compile (`tsc --noEmit`) MUST be clean. No new `any` types in new code. |

---

## Data Model / Schema

### `PageDescriptor` (new TypeScript type, `frontend/src/lib/ariPrompts.ts`)

```ts
export type PromptWindow = '7d' | '30d' | '1y' | 'all'

export interface PageDescriptor {
  /** Stable id, used by Ari chat to refer to the page. */
  id: string
  /** Display name as it appears in the side menu. */
  name: string
  /** Route path (e.g. '/whale-flow', '/strategies/momentum_cascade'). */
  route: string
  /** One-sentence description of what the page contains. */
  description: string
  /**
   * Leading question the page contributes to Ari chat. Subnet-parametric
   * pages use `{subnet}` and timeframe-parametric pages use `{window}`.
   */
  leadingQuestion: string
  /** Optional list of timeframes the page supports. */
  windows?: PromptWindow[]
  /** True if the page's natural answer surface is the page itself
   *  (so chat-click should navigate, not respond inline). */
  navigateOnly?: boolean
}
```

### `OrbPrompt` (new type)

```ts
export interface OrbPrompt {
  id: string
  label: string                          // visible pill text
  icon?: keyof typeof LucideIcons        // optional left-icon
  prompt: (subnet: number, win?: PromptWindow) => string
  needsSubnet: boolean
  needsWindow: boolean
}
```

No database schema changes. No new tables. No migrations.

---

## API Contracts

### Existing — preserved as-is

- `POST /api/fleet/chat` with body `{ message: string }` returns
  `{ response: string }`. Keyword-routed in `routers/fleet.py`. This
  build extends the keyword routing inside the existing handler; it
  does NOT add a new endpoint.
- `GET /api/fleet/chat/history` and `DELETE /api/fleet/chat/history`
  unchanged.

### Backend Routing — new keyword handlers in `chat()`

Inserted before the existing fall-through, after the existing
`subnet_chat_service` route. Each handler runs only when its keyword
matches:

| Keyword pattern | Handler | Source data | Fallback |
|-----------------|---------|-------------|----------|
| `r"community sentiment.*subnet (\d+)"` | Pull last-7d signal events for the netuid from `signal_ingestor` aggregations; return sentiment label + top 3 sources. | `services/signal_ingestor.py` (existing) | "Sentiment data not yet available for SN{N}. Visit the Signal Feed on the Dashboard to track it as it lands." |
| `r"github activity.*subnet (\d+)"` | (No service exists yet) | — | "I don't have a GitHub-activity feed wired up yet for SN{N}. The Subnet Scorecard page tracks ecosystem health metrics that include repo activity in the 'productive miners' filter." |
| `r"whale activity.*subnet (\d+)"` | Hit `/api/whale-flow/{netuid}/summary` internally, summarize top 3 whale tx in 7d. | `routers/whale_flow.py` (existing) | "Whale Flow data is unavailable. Visit /whale-flow to see live Finney RPC trail." |
| `r"X posts.*subnet (\d+)"` or `r"twitter.*subnet (\d+)"` | (X has no free API tier — already documented in `SignalFeedTile.tsx:191`) | — | "X has no free API tier; the Signal Feed page surfaces Reddit RSS as a proxy. Visit Signal Feed to see community discussion for SN{N}." |
| `r"stake.*unstake.*subnet (\d+)"` or `r"stake/unstake.*subnet (\d+)"` | Compute ratio from `whale_flow` events filtered by netuid + 7d window: `unstake_total / stake_total`. | `services/whale_flow_service.py` | "I don't have a stake/unstake breakdown for SN{N} in the requested window. Visit /whale-flow and filter by SN{N}." |
| `r"recent trades.*subnet (\d+)"` | Query `trades` table WHERE `netuid = N` ORDER BY ts DESC LIMIT 5. | `models/trade.py` | "No recent trades on record for SN{N}. Visit /strategies and click any strategy to see per-strategy recent-trade history." |

All six handlers wrap data access in `try/except` and return the
fallback string on any exception — graceful degradation, never crash
the chat endpoint.

---

## Edge Cases / Failure Modes

- **Reduced motion.** Operators with `prefers-reduced-motion: reduce`
  see a static placeholder, not the rotating one. Detected via
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- **Input focus during rotation.** Rotation pauses immediately when
  the input gains focus or contains text. Resumes on blur+empty. This
  is the standard "don't move the carpet under the user" pattern.
- **Subnet selector with no selection.** If an operator clicks an orb
  pill but never picks a subnet, the popover closes and nothing is
  submitted. No partial submissions like "Describe Subnet undefined".
- **Backend keyword false positive.** Existing keyword routing has
  precedence — the new handlers run AFTER `subnet_chat_service` so a
  query like "describe sn18" still goes to the rich subnet_chat path,
  not to a regex-matched fallback. Order matters; tests verify it.
- **Long subnet list in popover.** The orb popover paginates if >10
  subnets; defaults to the 6 actively-monitored subnets first (SN1,
  8, 9, 18, 64, 96 per `SubnetHeatMap.tsx`).
- **Mobile / narrow viewport.** Orb is sidebar-only on desktop; on
  mobile the sidebar is collapsed and the orb is not visible. No
  change to mobile behaviour. The chat page (`/ii-agent` route) does
  render on mobile; the rotating placeholder works there too.
- **Stale registry.** If a page is added later without a matching
  `PageDescriptor` entry, `ariPrompts.ts` exports a runtime warning in
  dev mode (`console.warn` if `route in routes && route not in
  PAGE_DESCRIPTORS`). Production: silent, no breakage.

---

## Acceptance Criteria

This feature is "done" when **all** of the following are true:

1. **Naming sweep verified.** `grep -rn "II Agent\|II-Agent" frontend/
   --include="*.tsx" --include="*.ts"` returns ONLY occurrences inside
   `/* … */` engineering-history comments. Every JSX text node, every
   `title=` attribute, every `aria-label=`, every placeholder, every
   visible `<span>`/`<p>`/`<button>` text shows "Ari" instead of "II
   Agent" in the rendered DOM.
2. **Side menu.** Sidebar shows `Ari` (large) / `Architect &
   Orchestrator` (small mono subtitle) under the `INTELLIGENCE` heading.
3. **Orb hover.** Mousing over the collapsed HAL orb shows the browser
   tooltip "Chat with Ari" (verifiable via `agent-browser` snapshot).
4. **Orb pills.** Opening the orb shows 3 quick-prompt pills above the
   message stream. Each pill opens a popover with subnet selector
   (and timeframe for pills 2 + 3). Selecting submits a real chat
   query that gets a real backend response.
5. **Chat page header.** `pages/IIAgent.tsx` shows `Chat with Ari` in
   the chat-card header.
6. **Rotating placeholder.** With the input unfocused, the placeholder
   text changes every 4 seconds, cycling through ≥6 distinct
   "Ask Ari: …" prompts. Focusing the input freezes it.
7. **Backend chat.** Submitting `Summarize recent whale activity for
   Subnet 18` returns a substantive response (or the documented
   graceful fallback) — not a 500, not the legacy "I'm sorry I don't
   understand that" path.
8. **Test landscape.** 318/318 tests ✓. Day 8 invariants 30/30 ✓.
   `tsc --noEmit` clean. `npm run build` clean.
9. **`agent-browser` smoke walk:** open the deployed app, hover the
   orb (screenshot the tooltip), click the orb (screenshot the panel
   with pills), click a pill (screenshot the popover), submit a
   prompt (screenshot the response), navigate to `/ii-agent`
   (screenshot the page header + rotating placeholder), submit a
   page-anchored prompt (screenshot the response). 6 screenshots
   filed as visual evidence.

---

## Test Plan / Test Cases

### TC-1 — Naming sweep regression
- **Given** the build has shipped
- **When** I `grep -rn "II Agent" frontend/src/ --include="*.tsx"
  --include="*.ts" | grep -v "/\\*\\|^\\s*\\*"`
- **Then** result is empty (only engineering-history block-comments
  retain "II Agent" references)

### TC-2 — Side-menu render
- **Given** the sidebar is rendered
- **When** I locate the `/ii-agent` nav entry
- **Then** the visible text is "Ari" and the subtitle is "Architect
  & Orchestrator"

### TC-3 — Orb hover
- **Given** the HAL orb is collapsed
- **When** I `agent-browser hover` the orb
- **Then** the rendered `title` attribute resolves to "Chat with Ari"

### TC-4 — Orb pill flow
- **Given** the orb panel is open
- **When** I click the "Describe Subnet" pill, then select SN18 from
  the popover
- **Then** the chat input is auto-populated with "Describe Subnet 18"
  AND submitted AND the response appears within 5s

### TC-5 — Rotating placeholder
- **Given** the chat page is open and the input is unfocused and empty
- **When** I observe the placeholder text for 30 seconds
- **Then** I see ≥6 distinct strings, each prefixed with "Ask Ari:"

### TC-6 — Rotation pause on focus
- **Given** the rotating placeholder is cycling
- **When** I click into the input
- **Then** the placeholder freezes on its current value and does not
  change while focused

### TC-7 — Reduced motion
- **Given** OS-level "reduce motion" is enabled
- **When** I open the chat page
- **Then** the placeholder is the static fallback "Ask Ari anything…"
  and does NOT rotate

### TC-8 — Backend new-keyword routing (six tests, one per route)
- **Given** the chat endpoint is up
- **When** I POST `{"message": "Summarize recent whale activity for
  Subnet 18"}`
- **Then** the response is a substantive sentence about whale activity
  on SN18 (or the documented fallback string), not a 500, not legacy
  "I don't understand"

### TC-9 — Day 8 invariants regression
- **Given** the build has shipped
- **When** I run `python backend/scripts/test_day8_invariants.py`
- **Then** 30/30 PASS

### TC-10 — TypeScript strict
- **Given** the build has shipped
- **When** I run `cd frontend && npx tsc --noEmit`
- **Then** exit code 0, no errors

---

## Implementation Notes

### File-touch list (planning, not exhaustive)

**Frontend (renames + new code):**
- `frontend/src/components/Layout.tsx` — side-menu label, orb hover
  title, panel header, panel placeholder, panel empty-state, agent
  message badge, reset confirm, mount 3 orb pills
- `frontend/src/pages/IIAgent.tsx` — header label, rotating placeholder
  hook, "Discover" subsection, prompt-anchored deep-links
- `frontend/src/lib/ariPrompts.ts` — **new file**, central registry
- `frontend/src/components/HowItAllConnects.tsx` — node 1 label
- `frontend/src/components/RegimeCard.tsx` — tooltip text
- `frontend/src/components/SubnetHeatMap.tsx` — "II Agent ✓" badge,
  "Actively monitored by II Agent" → "Actively monitored by Ari",
  green-outline tooltip text
- `frontend/src/pages/Dashboard.tsx` — KPI label "II Agent" → "Ari",
  InfoBubble text, click-target tooltip
- `frontend/src/pages/MarketData.tsx` — "Actively monitored by II
  Agent" → "Actively monitored by Ari", subnet-tile pulse-dot title,
  legend text
- `frontend/src/pages/SubnetDetail.tsx` — header status badge "II
  Agent Active" → "Ari Active", "The II Agent actively coordinates
  stake…" → "Ari actively coordinates stake…", validator-routing copy
- `frontend/src/pages/AgentFleet.tsx` — "Updated every 60s by II Agent
  health-check loop" → "…by Ari health-check loop"
- `frontend/src/pages/AlertInbox.tsx` — "II Agent detects regime
  shifts" → "Ari detects regime shifts"
- `frontend/src/pages/ActivityLog.tsx` — webhook flavor text
- `frontend/src/pages/FleetConsensus.tsx` — sub-text "II Agent cycles"
  → "Ari cycles"
- `frontend/src/pages/Wallet.tsx` — "II Agent's active trading wallet"
  → "Ari's active trading wallet"

**Backend (renames + new keyword routes):**
- `backend/routers/fleet.py` — chat docstring, regime sub-text on line
  341, analysis sub-text on line 433, **new keyword routes** for the
  six new prompts
- `backend/routers/agent.py` — module docstring + endpoint docstring
- `backend/routers/bot.py` — comment-doc on hotkey field
- `backend/routers/market.py` — subnet description strings (lines
  170-171 — these ARE user-visible because they appear in the
  `subnet_chat_service` answer; rename is required)
- `backend/services/agent_service.py` — log strings if user-surfaced;
  most are internal logs (out of scope)
- `backend/services/audit_chat_service.py` — generated narrative text
- `backend/services/subnet_chat_service.py` — generated narrative text
- `backend/services/subnet_router.py` — same
- `backend/services/signal_ingestor.py` — same (only if surfaced)
- `backend/services/webhook_service.py` — webhook bot display name

**Internal (not renamed, not in scope):**
- `frontend/src/App.tsx` `IIAgent` import + Route — internal
- `frontend/src/store/botStore.ts` `iiAgentStats` / `IIAgentPageStats`
  / `setIIAgentStats` — internal
- `frontend/vite.config.ts` chunk name `IIAgent` — internal
- `frontend/src/pages/IIAgent.tsx` filename — internal (module path
  unchanged)
- `/ii-agent` route — internal (URL stability for bookmarks)
- `backend/models/bot_config.py` comment "the II Agent's SS58 hotkey"
  — internal engineering doc
- All `// Session XX(X)V relocated from II Agent page` comments —
  engineering history, preserved

### Build order

1. Write `frontend/src/lib/ariPrompts.ts` (registry, types, stable
   contract — new code, no breakage risk).
2. Add the 6 new keyword routes to `backend/routers/fleet.py /chat`,
   each with try/except + graceful fallback. Verify Day 8 invariants
   still pass.
3. Frontend rename pass (mass `sed`-like replace, file by file, with
   manual review for each — there are a handful of false positives
   in comments that must NOT be renamed).
4. Wire up the orb pills + rotating placeholder hook in `Layout.tsx`
   and `IIAgent.tsx`.
5. `tsc --noEmit` clean, `npm run build` clean.
6. `agent-browser` walk for screenshots.
7. Commit + push (D-44 authority), `save_checkpoint`.

### Anti-patterns to avoid (from STATE.md doctrine)

- **AP-1 (false-confident fallback).** When a new keyword route lacks
  data, the response MUST be honest — "I don't have that data yet,
  here's where it lives" — NOT a fabricated answer. Each fallback
  string is reviewed.
- **AP-2 (silent starvation).** When the registry expects a page and
  the page isn't registered, surface a console warning in dev. Don't
  let chat prompts silently route nowhere.
- **D-23 (boundary discipline).** Internal identifier renames are
  explicitly out of scope. Don't drift into them mid-build.
- **D-44 override clause.** Internal-rename out-of-scope decision is
  documented HERE in the spec. If during build I discover an internal
  identifier whose name is genuinely user-visible, the rename gets
  added to the spec via amendment, not done silently.

---

## Status / Open Questions

| Item | Status | Notes |
|------|--------|-------|
| Name + subtitle | **Proposed: "Ari · Architect & Orchestrator"** | Mark veto window before commit; default proceeds. |
| Internal identifier rename | Out of scope this build | Future cleanup pass available. |
| New backend services for missing data (GitHub activity, X posts) | Out of scope | Graceful fallback with deep-link instead. |
| Per-page "Ask Ari about this page" buttons | Out of scope this build | Registry contract is forward-compatible; future build wires the buttons. |
| Const 6-Filter "fleet as miners" connection | Independent thread | Item #3 of today's queue, separate from this build. |

---

*Spec authored Day 15 morning, 2026-05-28. Inscription discipline:
descriptive (planning artifact, no operational change). D-44 standing
authority covers the build itself. Mark's verbatim brief inscribed at
top of file as the source of truth for goal definition.*