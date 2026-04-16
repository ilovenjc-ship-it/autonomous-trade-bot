# MASTER STATE BRIEF
## TAO Autonomous Trading Bot
**Last updated:** April 16, 2025  
**Status:** LIVE — real on-chain trading armed, first tx_hash pending  
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
Frontend:   React + Vite + TailwindCSS  →  port 3002
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

### D-08 — No paid APIs
**Decision:** Free tiers only — Finney public RPC + CoinGecko free.  
**Why:** At current wallet scale (0.000451 τ), paid infrastructure would dwarf the portfolio value. Revisit when balance grows.

---

## 5. CURRENT STATE
*(Update this section at the end of every session)*

### 5a. System Status
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_balance     :  0.000450917 τ
wallet_address     :  5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L
Finney block       :  #7,977,756 (as of April 16)
NightWatch         :  Running — PID 63675
```

### 5b. Trading Status
```
Total trades logged  :  2,856
Real trades (tx_hash):  0  ← first one is pending (next LIVE signal + OpenClaw pass)
Paper trades         :  2,856
Trade period         :  April 12–16, 2025
```

### 5c. Live Strategies (7 armed, executing real trades)
| Strategy | Focus |
|----------|-------|
| Yield Maximizer | Highest emission-rate subnets |
| Emission Momentum | Accelerating emission curves |
| Balanced Risk | Equal-weight top-tier subnets |
| Liquidity Hunter | High-depth alpha pools |
| dTAO Flow Momentum | Institutional stake inflows |
| Contrarian Flow | Fading overcrowded subnets |
| Momentum Cascade | Multi-subnet momentum breaks |

### 5d. The Fleet (12 bots total)
5 additional bots are on PAPER status — not yet promoted to LIVE.

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
| First real `tx_hash` | Autonomous | Gate is open — next LIVE signal + OpenClaw → it fires |
| Manual trade panel | Medium | "Can the human trade too?" — one button away |
| Real αTAO positions in Wallet | Medium | Live staked balance per subnet from chain |
| Agent Fleet bugs | Low | Toggle no-refetch, Promote CTA, demotion indicator |
| PDF sections: Strategies, Trades | Low | Additional report sections not yet written |

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

*STATE.md is a living document. It is updated at the end of every session.  
The code lives on GitHub. The memory lives here.  
The Archives hold the full record.*

**— TAO Trading Bot, April 16, 2025**