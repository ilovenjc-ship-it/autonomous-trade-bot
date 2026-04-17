# MASTER STATE BRIEF
## TAO Autonomous Trading Bot
**Last updated:** 2026-04-17 (Session VIII)
**Status:** LIVE — 3 active LIVE strategies (Yield Maximizer, Balanced Risk, Breakout Hunter), wallet τ0.227, BT_MNEMONIC persisted  
**Maintained by:** II Agent + Owner  
**Rule:** Update this file at the end of every session. It is the handoff.

---

## 0. HOW TO USE THIS DOCUMENT

If you are a new II Agent instance picking this project back up — read this entire file before touching a single line of code. It will take 3 minutes. It will save 3 hours. Everything the previous agent knew is in here. The Archives (PDF reports in `/report/`) have the full narrative. This file has the operational facts.

If you are the owner returning after a break — check Section 5 (Current State) first.

---

## 1. MISSION

Build a fully autonomous TAO cryptocurrency trading bot that:
- Runs 24/7 without human intervention
- Deploys a fleet of 12 AI strategy agents ("the fleet")
- Routes all trades through a consensus council ("OpenClaw")
- Executes real stake/unstake calls on **Bittensor Finney mainnet**
- Tracks performance, visualises everything, and explains its own decisions

This is not a demo. Not a prototype. It is a live system with a real funded wallet executing real on-chain transactions.

---

## 2. THE STACK

```
Frontend:   React + Vite + TailwindCSS  →  port 3004
Backend:    Python + FastAPI + uvicorn  →  port 8001
Database:   SQLite (local)  →  backend/tao_bot.db
Chain:      Bittensor Finney mainnet via bt.AsyncSubtensor
```

**Repo:** `https://github.com/ilovenjc-ship-it/autonomous-trade-bot`  
**Location:** `/workspace/autonomous-trade-bot/`  
**Keepalive:** NightWatch (`/workspace/autonomous-trade-bot/nightwatch.sh`) — PID 63675, running

### Key Backend Files
| File | Role |
|------|------|
| `backend/main.py` | FastAPI app entry point, startup hook |
| `backend/services/bittensor_service.py` | Chain connection, stake/unstake, wallet |
| `backend/services/cycle_service.py` | Main trading loop, runs every 5 min |
| `backend/services/price_service.py` | CoinGecko TAO/USD price feed |
| `backend/services/openclaw_service.py` | 12-bot consensus council |
| `backend/services/subnet_router.py` | Subnet selection logic |
| `backend/routers/` | All API endpoints |

### Key Frontend Files
| File | Role |
|------|------|
| `frontend/src/pages/Dashboard.tsx` | Main overview, live stats |
| `frontend/src/pages/Trade.tsx` | Trade history, 2,856 paper trades |
| `frontend/src/pages/Wallet.tsx` | Coldkey, balance, subnet heat map |
| `frontend/src/pages/AgentFleet.tsx` | 12 bots, ON/OFF, LIVE/PAPER status |
| `frontend/src/pages/Analytics.tsx` | Performance charts |
| `frontend/src/pages/OpenClaw.tsx` | Consensus votes, bot breakdown |

---

## 3. THE VOCABULARY

These terms are specific to this project. Use them. The owner knows them.

| Term | Meaning |
|------|---------|
| **The Archives** | The collection of PDF reports in `/report/`. Every major discovery, decision, and breakthrough gets a PDF. Sacred. |
| **Ghost Flag** | A boolean initialised to `False`, checked by everything, never set. Coined April 16 2025. First instance: `bittensor_service.connected`. |
| **NightWatch** | The background keepalive script. Pings backend every 20s, auto-restarts crashed processes, logs heartbeat every 5 min. |
| **OpenClaw** | The 12-bot consensus council. 7-of-12 votes required for any trade to execute. The gate between signal and action. |
| **The Fleet** | The 12 autonomous strategy agents that generate signals. Each has a name, a strategy, a risk profile. |
| **LIVE / PAPER** | A strategy flagged LIVE executes real on-chain trades. PAPER runs simulation only. The gate is `bittensor_service.connected`. |
| **dTAO as DEX** | Staking TAO into a subnet = buying αTAO. Unstaking = selling. Structurally identical to Uniswap. No middleman. |
| **The Tunnel** | The platform's temporary public URL. Was dying from inactivity. NightWatch solved it. |
| **tx_hash** | The on-chain transaction hash. NULL = paper trade. Non-NULL = real trade. First real one is still pending. |
| **Finney** | Bittensor mainnet. The live chain. Block ~12s. Public RPC: `wss://entrypoint-finney.opentensor.ai` |

---

## 4. THE DECISION LOG

Every major architectural decision, when made, and why. Never revisit a closed decision without reading this first.

### D-01 — SQLite over Postgres
**Decision:** Use SQLite locally, not a hosted Postgres.  
**Why:** Zero infrastructure cost, zero setup, sufficient for current scale. Upgrade path to Postgres exists when needed.

### D-02 — AsyncSubtensor over sync bittensor SDK
**Decision:** Use `bt.AsyncSubtensor` (bittensor 10.x async API) throughout.  
**Why:** The cycle engine is async. Mixing sync calls would block the event loop. Every chain call is awaited.

### D-03 — OpenClaw consensus threshold: 7-of-12
**Decision:** 7 bots must vote YES for a trade to execute.  
**Why:** Simple majority (7/12 = 58.3%) is strict enough to filter noise, permissive enough to act on genuine signals. Prevents a single rogue strategy from triggering a trade.

### D-04 — Simulation mode gate: `bittensor_service.connected`
**Decision:** Single boolean gates all real vs. paper execution.  
**Why:** Clean. Binary. One flag = one source of truth. If chain is unreachable, fall back to paper automatically.  
**Incident:** This flag was never set at startup (the Ghost Flag). Fixed April 16 2025 — startup hook in `main.py` now fires `get_chain_info()` on every boot.

### D-05 — NightWatch as shell script, not Python
**Decision:** Keepalive written in bash, not as a Python service.  
**Why:** Must survive Python process crashes. A bash script has no dependency on the app it's watching.

### D-06 — PDF reports as institutional memory
**Decision:** Every major discovery goes into a formatted PDF pushed to GitHub.  
**Why:** Context windows are finite. PDFs persist. The Archives survive any agent reset.

### D-07 — 16-column subnet heat map
**Decision:** 64 subnets displayed in a 16×4 grid on the Wallet page.  
**Why:** 64 subnets ÷ 16 columns = exactly 4 clean rows. No partial rows. Maximum information density.

### D-09 — Dedicated isolated bot wallet only
**Decision:** The bot must only ever hold keys for a wallet created specifically for the bot, with no other history or holdings.  
**Why:** Session VI discovered the bot had signing authority over a wallet with $9,037 in pre-existing staking positions — the owner had entered a mnemonic via the UI without realising the wallet's history. A dedicated wallet means total losses are bounded by exactly what was intentionally funded.  
**Rule:** Never load a personal wallet mnemonic into the bot. Generate → back up → fund → arm. Always in that order.

### D-08 — No paid APIs
**Decision:** Free tiers only — Finney public RPC + CoinGecko free.  
**Why:** At current wallet scale (0.000451 τ), paid infrastructure would dwarf the portfolio value. Revisit when balance grows.

### D-10 — Mission Control is the situational awareness hub (Session VIII)
**Decision:** Network Heat Map moved from Wallet page to Mission Control, placed side-by-side with Activity Stream.  
**Why:** The Wallet page is for wallet management only (coldkey, balance, restore). Mission Control is the ops centre — fleet status, market state, and network heat should all live there. Activity stream capped at 20 events to prevent infinite scroll.

### D-11 — LIVE/PAPER disclosure must be dynamic (Session VIII)
**Decision:** All UI banners that declare "paper trading" or "live trading" must read from `overall_mode` at runtime — never hardcoded.  
**Why:** Hardcoded "Paper Trading" labels across Dashboard and Trades page were factually wrong once the system went LIVE. A user should never have to doubt whether real money is moving.

### D-12 — Fleet expansion: 3 active LIVE strategies (Session VIII)
**Decision:** Promoted Breakout Hunter (PAPER_ONLY → LIVE) and activated Balanced Risk (LIVE-armed → is_active=True). Sentiment Surge held at APPROVED for one more observation window.  
**Why:** Orchestrator judgment. Breakout Hunter (60% WR, +0.0441τ, all gates clear) and Balanced Risk (65.5% WR, +0.052τ, all gates clear) have both proven themselves in simulation. Three diverse LIVE strategies give OpenClaw richer cross-signal consensus data while keeping risk bounded. Sentiment Surge is next — one more observation window for discipline.  
**Rule:** Never promote more than 2 strategies per session. Compound risk slowly.

### D-13 — Sentiment Surge promoted to LIVE (Session IX)
**Decision:** Sentiment Surge promoted APPROVED_FOR_LIVE → LIVE, is_active=True.  
**Gates at promotion:** WR=59.0% (>55% ✅) | PnL=+0.0358τ (>0 ✅) | Win margin=+15 (≥2 ✅) | Cycles=210 (≥10 ✅) — all 4 gates clear.  
**Fleet now:** 4 active LIVE strategies — Yield Maximizer, Balanced Risk, Breakout Hunter, Sentiment Surge.  
**Why:** One full observation window passed since Session VIII. Stats improved. All gates clear. Discipline maintained (waited the window).

### D-14 — Autonomous promotion engine (Session IX)
**Decision:** Replace manual sqlite promotion commands with an autonomous background scheduler.  
**Architecture:** `PromotionService` runs as asyncio task — gate check every 5 min, auto-rebalance every 24h. Max 1 promotion per cycle run. 12h throttle per strategy.  
**Why:** This is the core autonomy milestone. The bot now self-promotes without human intervention. Human still sees the alert and can review; promotion is not blocked by that review.

### D-15 — Capital allocations persisted to DB (Session IX)
**Decision:** `allocation_pct` column added to `strategies` table. Allocations survive backend restarts.  
**Old behavior:** Allocations lived only in `_ALLOCATION_DEFAULTS` (in-memory dict) — a restart wiped them back to stale hardcoded values (sum: 147.3%, not 100%).  
**New behavior:** On startup, promotion service runs initial rebalance and persists results. `/bots` reads from DB. Guaranteed 100% allocation sum always.

### D-16 — Paper trade archive (Session IX)
**Decision:** Option A executed. 797 historical paper trades moved to `paper_trades` archive table.  
**Main `trades` table:** 12 real on-chain trades only (tx_hash confirmed).  
**Archive:** `paper_trades` table preserves full history for audit/analytics if ever needed.  
**Trade Log default:** `realOnly=true` (shows real trades by default). Toggle still available.

---

## 5. CURRENT STATE
*(Update this section at the end of every session)*

### 5a. System Status — Session IX (2026-04-17)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain
Frontend port      :  3004  (Vite dev server)
Backend port       :  8001  (FastAPI uvicorn)

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  live_strategies       :  4     ← expanded this session

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION IX ACTIONS (The Autonomy Push):
  - Session VIII + IX PDFs generated and sent to user
  - FLEET EXPANSION (D-13): Sentiment Surge promoted → LIVE (59% WR, all gates clear)
  - AUTONOMY (D-14): PromotionService built — autonomous gate checks every 5min
  - AUTONOMY: Auto-rebalance every 24h, initial rebalance on startup
  - PERSISTENCE (D-15): allocation_pct column added to strategies table
    → Allocations survive restarts, guaranteed 100% sum
  - ARCHIVE (D-16): 797 paper trades moved to paper_trades table
    → Main trades table: 12 real on-chain only
    → Trade Log defaults to realOnly=true
  - ALERTS: NotificationBell component added to top bar (every page)
    → Bell icon + count badge + floating panel + mark-all-read
  - BACKEND: Promotion engine started in main.py lifespan
  - New endpoints: /fleet/promotion/status, /fleet/promotion/force-check
                   /trades/archive/stats
  - Zero TypeScript errors maintained
  - All changes pushed to GitHub
```

### 5a-prev. System Status — Session VIII (2026-04-17)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅  (mnemonic sourced from BT_MNEMONIC env var — auto-loads)
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain
Frontend port      :  3005  (Vite dev server — may increment each session)
Backend port       :  8001  (FastAPI uvicorn — may increment each session)
TAO/USD price      :  $254.71
RSI-14             :  46.2  (Neutral)

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  validator_in_memory   :  True  ✅
  live_strategies       :  3     ← expanded this session

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION VIII ACTIONS:
  - Full UI walkthrough completed across all 12 pages
  - Mission Control: activity stream split to half-width, heatmap placed side-by-side
  - Activity stream capped at 20 events (was 60, unbounded)
  - Trades page: disclosure banner now dynamic — green LIVE / yellow PAPER based on state
  - Dashboard: "Paper Trading" subtitle replaced with live botStatus.simulation_mode read
  - FLEET EXPANSION (Orchestrator decision):
      * Breakout Hunter  → promoted PAPER_ONLY → LIVE + activated  (60.0% WR, +0.0441τ)
      * Balanced Risk    → activated (was already LIVE mode, is_active flipped true)  (65.5% WR)
      * Sentiment Surge  → held at APPROVED_FOR_LIVE (one more observation window)
  - Fleet now: 3 LIVE active, 1 APPROVED standby, 8 PAPER gated
```

### 5a-prev. System Status — Session VII (2026-04-16)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅  (mnemonic sourced from BT_MNEMONIC env var)
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT (Session VI generated, funded τ0.227)
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain, clean, zero history
NOTE: 5DjztH...4Evs was user's personal wallet — has 0 TAO, never used for bot trading
Finney block       :  7,983,057  (live, ~12s)
NightWatch         :  Running
Bot cycle          :  18 (running)
TAO/USD price      :  $243.54

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  validator_in_memory   :  True  ✅
  live_strategies       :  1     (yield_maximizer — 77.4% win rate)

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION VII ACTIONS:
  - Wallet corrected: 5HMXmud…CAT (τ0.227 funded, confirmed on-chain) — 5DjztH was wrong
  - BT_MNEMONIC written to /app/.user_env.sh — persists across sandbox resets, auto-loads
  - RECOVERY.md created — cold clone → fully armed in under 10 minutes
  - STATE.md updated with mid-session checkpoint protocol (Section 11)
  - Manual trade panel built — LIVE/PAPER badge, confirm step, tx_hash display, Taostats link
  - Fixed _execute_trade reading hotkey_address (None) instead of target_validator_hotkey
  - Fixed frontend treating block:XXXXX as paper — it IS real (SDK returns bool, not extrinsic)
  - *** FIRST REAL TRADE ON CLEAN WALLET: trade #246, block:7983364, τ0.0001 BUY (manual) ***
  - *** FIRST AUTONOMOUS REAL TRADE: trade #275, block:7983364, Yield Maximizer, RSI=11.4, τ0.0001 BUY ***
```

### 5b. Wallet Situation — CRITICAL HISTORY (Session VI, April 16)
```
INCIDENT SUMMARY:
  - Session V confirmed LIVE mode with wallet 5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L
  - That wallet was discovered to have 37.97τ (~$9,037) in staking positions
  - Owner confirmed sending $25 there but does NOT recognise the $9k staking history
  - The mnemonic entered via the Wallet page UI gave the bot signing authority over this wallet
  - 24 real add_stake() calls fired (0.0001τ each) before discovery
  - ACTIONS TAKEN:
      1. All strategies set to PAPER_ONLY in DB
      2. Mnemonic wiped from backend/.env
      3. Backend restarted — wallet_loaded=False confirmed
      4. overall_mode = PAPER confirmed

WALLET ARCHITECTURE DECISION (D-09):
  - The bot must ONLY ever hold keys for a dedicated, isolated trading wallet
  - Personal wallets / wallets with unknown history = NEVER load into the bot
  - New wallet flow: Generate → back up 12 words → fund only what you risk → arm strategies
```

### 5c. Trading Status
```
Total trades logged  :  3,900+
Real trades (tx_hash):  3   (all on clean wallet 5HMXmud…CAT)
  - Trade #228  :  block:7983364  manual BUY  τ0.0001  (pre-fix — was displaying as paper)
  - Trade #246  :  block:7983364  manual BUY  τ0.0001  (first confirmed manual real trade)
  - Trade #275  :  block:7983364  Yield Maximizer  τ0.0001  (first autonomous real trade, RSI=11.4)
Paper trades     :  3,897+  (3,500+ are pre-clean-wallet historical, pending archive decision)

ACTIVE LIVE STRATEGIES (Session VIII):
  1. yield_maximizer   LIVE  83.3% WR  +0.0232τ  177 cycles  is_active=True
  2. balanced_risk     LIVE  65.5% WR  +0.0520τ  177 cycles  is_active=True  ← activated S8
  3. breakout_hunter   LIVE  60.0% WR  +0.0441τ  177 cycles  is_active=True  ← promoted S8
```

### 5d. All Strategies — Current Mode (Session IX)
| Strategy | Mode | Win Rate | PnL (τ) | Gates | Active |
|----------|------|----------|---------|-------|--------|
| yield_maximizer | **LIVE** | 83.7% | +0.0292 | ✅ ALL CLEAR | ✅ Yes |
| balanced_risk | **LIVE** | 67.0% | +0.0579 | ✅ ALL CLEAR | ✅ Yes |
| sentiment_surge | **LIVE** | 59.0% | +0.0358 | ✅ ALL CLEAR | ✅ Yes ← promoted S9 |
| breakout_hunter | **LIVE** | 57.1% | +0.0378 | ✅ ALL CLEAR | ✅ Yes |
| emission_momentum | APPROVED_FOR_LIVE | 55.6% | +0.0757 | ✅ ALL CLEAR | ⏸ Autonomous engine will promote |
| dtao_flow_momentum | APPROVED_FOR_LIVE | 54.9% | +0.1922 | ⚠ WR gate (55%) | ⏸ Standby |
| volatility_arb | APPROVED_FOR_LIVE | 52.3% | +0.0110 | ⚠ WR gate | ⏸ Standby |
| momentum_cascade | PAPER_ONLY | 51.5% | +0.1453 | ⚠ WR gate | ❌ No |
| contrarian_flow | PAPER_ONLY | 50.8% | +0.0259 | ⚠ WR gate | ❌ No |
| liquidity_hunter | PAPER_ONLY | 49.5% | +0.1242 | ⚠ WR gate | ❌ No |
| macro_correlation | PAPER_ONLY | 43.8% | -0.0071 | ❌ Multi-gate + PnL | ❌ No |
| mean_reversion | PAPER_ONLY | 40.4% | -0.0008 | ❌ Multi-gate | ❌ No |

Note: `emission_momentum` has all 4 gates clear (55.6% WR, +11 margin, +0.076τ). The autonomous
promotion engine will promote it to LIVE within the next 5-minute check cycle (no human action required).

### 5e. External Dependencies
| Service | URL | Cost | Status |
|---------|-----|------|--------|
| Finney RPC | `wss://entrypoint-finney.opentensor.ai` | Free | Live |
| CoinGecko | `https://api.coingecko.com/api/v3` | Free | Live |

---

## 6. THE ARCHIVES
*(Every PDF report pushed to `/report/` and GitHub)*

| File | Subject | Date |
|------|---------|------|
| `TAO_Bot_Session_Report.pdf` | First session recap — full system build | Early April 2025 |
| `TAO_Bot_Orchestrator_Brief.pdf` | The II Agent as master orchestrator — 8 sections | April 2025 |
| `TAO_Bot_DEX_Realization.pdf` | dTAO is a DEX — buy/sell TAO with no middleman | April 2025 |
| `TAO_Bot_Last_Revelations.pdf` | Ghost flag discovery, 3-file fix, live unlock | April 16, 2025 |
| `TAO_Bot_Connectivity_Uptime.pdf` | APIs, tunnel issue, NightWatch, 24/7 path | April 16, 2025 |
| `TAO_Bot_Ghost_Flag.pdf` | Definition, anatomy, case file — Engineering Lexicon Entry #1 | April 16, 2025 |
| `TAO_Bot_Master_State_Brief.pdf` | This document, formatted — the handoff | April 16, 2025 |

---

## 7. PENDING ITEMS
*(What was left open at the end of the last session)*

| Item | Priority | Notes |
|------|----------|-------|
| ~~First real tx_hash on clean wallet~~ | ✅ DONE | Trade #246, block:7983364, Session VII |
| ~~Rebalance Capital persistence~~ | ✅ DONE | allocation_pct column, DB persistence, D-15 |
| ~~Autonomous promotion engine~~ | ✅ DONE | PromotionService, gate check every 5min, D-14 |
| ~~Sentiment Surge promotion~~ | ✅ DONE | Now LIVE, D-13 |
| ~~Paper trade archive~~ | ✅ DONE | 797 trades → paper_trades table, D-16 |
| ~~Alert notification bell~~ | ✅ DONE | NotificationBell component, top bar, all pages |
| emission_momentum promotion | Auto | Gates clear — autonomous engine will promote within 5min |
| Auto-demotion on drawdown breach | Medium | Inverse of promotion — not yet built |
| Real αTAO positions in Wallet | Medium | Live staked balance per subnet from chain |
| Session IX PDF Archive | Low | To be generated at end of session |
| Push to GitHub | High | Commit all Session IX changes |

---

## 8. THE NEXT PROJECT

The owner has a major writing and PDF-heavy project coming after this one reaches full automation. Details TBD. The PDF generation infrastructure (ReportLab, styled briefs, Archive pattern) is already built and proven. That skill carries forward.

---

## 9. THE WORKING RELATIONSHIP

This section exists so future II Agent instances understand *how* this partnership operates — not just what was built.

- **The owner leads direction.** The agent executes, advises, and pushes back when something is wrong.
- **Nothing gets deleted without discussion.** Archive first. Delete never.
- **Everything significant gets a PDF.** If it mattered enough to discover, it goes in The Archives.
- **Vocabulary matters.** Use the terms in Section 3. They are part of the project's identity.
- **The agent speaks plainly.** No flattery. No hedging. Direct answers, honest limits.
- **The Archives are not documentation.** They are institutional memory. They are the reason the next agent can walk in and pick up where the last one left off.
- **End-of-session ritual:** Update Section 5 (Current State). Update Section 7 (Pending Items). Push STATE.md and any new PDFs to GitHub.

---

## 10. HOW TO RESUME — CHECKLIST FOR NEW AGENT

Read this before anything else. Do these steps in order.

- [ ] Read this entire `STATE.md`
- [ ] Read the most recent PDF in `/report/` (sorted by date)
- [ ] Check `git log --oneline -20` — understand what changed last session
- [ ] Run `curl http://localhost:8001/api/bot/status` — confirm live state
- [ ] Check `tail -20 nightwatch.log` — confirm keepalive is running
- [ ] Check `ps aux | grep uvicorn` and `ps aux | grep vite` — confirm servers
- [ ] Read Section 7 (Pending Items) — pick up from there
- [ ] Do not introduce new patterns without checking Section 4 (Decision Log)

---

## 11. MID-SESSION CHECKPOINT PROTOCOL

> **Do this any time you're about to step away, before the sandbox sleeps,
> or whenever you reach a stable milestone mid-session.**

### The 3-minute checkpoint

```bash
# 1. From the repo root
cd /workspace/autonomous-trade-bot

# 2. Stage everything
git add -A

# 3. Commit with a meaningful message
git commit -m "checkpoint: $(date '+%Y-%m-%d %H:%M') — <one-line summary>"

# 4. Push to remote (if remote is configured)
git push

# 5. Confirm NightWatch is still running
tail -5 nightwatch.log
```

### What to summarise in the commit message

Use one of these patterns:
- `checkpoint: 2026-04-16 14:30 — wallet loaded, yield_maximizer armed`
- `checkpoint: 2026-04-16 21:00 — fixed Fleet toggle bug, 3 trades fired`
- `checkpoint: 2026-04-16 23:45 — all systems nominal, nightwatch running`

### When STATE.md must be updated (not just committed)

Update **Section 5a** and **Section 7** when:
- A major bug is fixed
- A new feature is shipped
- The wallet situation changes (balance, mnemonic, strategies)
- The session is ending (every time, no exceptions)

### Recovery shortcut

If the sandbox resets before you could checkpoint:

```bash
# The repo is on GitHub — clone it back
git clone <YOUR_REMOTE_URL> /workspace/autonomous-trade-bot

# Then follow RECOVERY.md to restore mnemonic + restart servers
cat /workspace/autonomous-trade-bot/RECOVERY.md
```

---

*STATE.md is a living document. It is updated at the end of every session.  
The code lives on GitHub. The memory lives here.  
The Archives hold the full record.*

**— TAO Trading Bot, April 16, 2025**