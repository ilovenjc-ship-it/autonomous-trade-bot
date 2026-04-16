# MASTER STATE BRIEF
## TAO Autonomous Trading Bot
**Last updated:** 2026-04-16 (Session VII)
**Status:** LIVE — wallet loaded (5DjztH…4Evs), balance 0.227 TAO, bot running cycle 18, BT_MNEMONIC persisted to /app/.user_env.sh  
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

---

## 5. CURRENT STATE
*(Update this section at the end of every session)*

### 5a. System Status — Session VII (2026-04-16)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅  (mnemonic sourced from BT_MNEMONIC env var)
wallet_address     :  5DjztHVxtm4v8jtYvT1DGHzHT3DGbvnCQqzgRQLLr3Ft4Evs
wallet_balance     :  0.227τ (~$55) — clean, funded, zero history
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
  - Confirmed wallet address (5DjztH…4Evs) is correct — Sessions VI+VII aligned
  - Fixed React error #185 (hydration root) — frontend now error-free
  - BT_MNEMONIC written to /app/.user_env.sh — persists across sandbox resets
  - RECOVERY.md created — cold clone → fully armed in under 10 minutes
  - STATE.md updated with mid-session checkpoint protocol (Section 11)
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
Total trades logged  :  3,816+
Real trades (tx_hash):  26  (first 26 = old unknown wallet, now irrelevant)
Paper trades         :  3,790+
New wallet real trades:  0  ← first real tx_hash on clean wallet is next

SESSION VI ACTIONS (April 16, evening):
  - Discovered 5GgR...e7L wallet had $9k staking history — not a clean bot wallet
  - Paused all trading, wiped mnemonic
  - Built POST /api/wallet/generate endpoint — generates fresh BIP39 wallet
  - Rebuilt Wallet page: "Generate New Wallet" tab (primary) + "Restore Existing" tab
  - Restored 5DjztH...4Evs — zero history, 0.227τ funded, clean slate (Session VI STATE.md had wrong address — was capturing generate_wallet() output, not the user-restored address)
  - Armed yield_maximizer (77.4% win rate) as sole LIVE strategy
  - overall_mode: LIVE ✅ — all 4 gates passing on clean wallet
```

### 5d. All Strategies (all PAPER_ONLY)
| Strategy | Mode | Win Rate |
|----------|------|----------|
| momentum_cascade | PAPER_ONLY | 59.6% |
| dtao_flow_momentum | PAPER_ONLY | 65.2% |
| liquidity_hunter | PAPER_ONLY | 64.5% |
| emission_momentum | PAPER_ONLY | 72.7% |
| balanced_risk | PAPER_ONLY | 68.0% |
| mean_reversion | PAPER_ONLY | 39.4% |
| volatility_arb | PAPER_ONLY | 55.2% |
| sentiment_surge | PAPER_ONLY | 45.6% |
| macro_correlation | PAPER_ONLY | 51.1% |
| breakout_hunter | PAPER_ONLY | 58.2% |
| yield_maximizer | PAPER_ONLY | 77.4% |
| contrarian_flow | PAPER_ONLY | 60.2% |

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
| First real tx_hash on clean wallet | Autonomous | Yield Maximizer armed, 0.227τ balance, next OpenClaw signal fires it |
| Real αTAO positions in Wallet | Medium | Live staked balance per subnet from chain |
| Manual trade panel | Medium | One button to fire a test trade to confirm full chain end-to-end |
| Agent Fleet bugs | Low | Toggle no-refetch, Promote CTA, demotion indicator |
| PDF: Session VII brief | Low | Mnemonic persistence, RECOVERY.md, React #185 fix — Archives entry |
| Push to GitHub | High | `git push` — current HEAD is d6c86cf, needs Session VII commit pushed |

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