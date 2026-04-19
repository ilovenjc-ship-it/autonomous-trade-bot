# Session XII — Fixes #2, #3, #4 Complete
**Date:** April 19, 2026
**Status:** Committed and pushed — `c260937`, `6bb3e85`, `27d7e85`

---

## The Capital Allocation Conversation

### Question that started the session:
> "I know you just said that the trade amounts are small by design but what about the high performers, shouldn't they be allocated more than the minimum amount? Or the under performers?"

### Answer (confirmed correct):
Yes. Flat minimum allocation is capital-inefficient. High performers earning 65%+ win rate get the same capital as a strategy running 48%. That leaves performance on the table.

**The tier model agreed upon:**
| Tier | Win Rate | Multiplier |
|------|----------|------------|
| 🏆 Elite | ≥65% | 3× base |
| ✅ Solid | ≥55% | 1.5× base |
| ⚖️ Neutral | ≥45% | 1× base |
| ⚠️ Weak | ≥35% | 0.5× base |
| ❌ Failing | <35% | Suspended |

Capital from suspended strategies flows up to elite performers automatically.

---

## Fix #2 — Trade Log Empty State
**Commit:** `c260937`
**Problem:** `useState(true)` on the `realOnly` filter was hiding all 815 paper trades on page load.
**Fix:** Changed default to `useState(false)` — all trades show by default, Real Only is opt-in.
**Bonus:** Header subtitle now shows real vs paper breakdown inline (e.g. "⛓ 0 real · ◌ 815 paper").

---

## Fix #3 — Strategies Page Rebuild
**Commit:** `6bb3e85`
**What was wrong:**
- All strategies treated equally — no performance signal
- PnL label ambiguous
- Header subtitle misleading
- No tier visibility

**What was built:**
- **Performance Tier Engine** — `getTier(winRate, totalTrades)` computes tier from live data
- **Capital Multiplier badge** on every card (3× / 1.5× / 1× / 0.5× / SUSPENDED)
- **Elite cards** get gold border glow
- **Tier distribution bar** in fleet summary — shows how many strategies are in each tier
- **Mode badges** clearly visible: ◌ PAPER / ◑ APPROVED / ● LIVE
- **Tier filter** — filter grid to just Elite, just Failing, etc.
- **Sort by Tier** added as new default sort
- **< 5 trades** → treated as NEUTRAL (insufficient sample guard)
- **Header** updated: "Strategy Fleet · performance-weighted capital allocation"
- **Bottom legend split** into two cards: Allocation Tier Key + Promotion Gate

---

## Fix #4 — Human Override Command Panel
**Commit:** `27d7e85`

### Backend: `/api/override/` router (new file: `backend/routers/override.py`)
| Endpoint | Action |
|----------|--------|
| `GET /override/status` | Current halt state + engine health |
| `POST /override/trade` | Manual BUY or SELL — fires into engine |
| `POST /override/promote/{name}` | PAPER → APPROVED → LIVE, instant, bypasses gate |
| `POST /override/demote/{name}` | LIVE → APPROVED → PAPER, instant |
| `POST /override/emergency-stop` | Kills cycle engine + trading engine — hard halt |
| `POST /override/resume` | Lifts halt, restarts cycle engine |
| `POST /override/rebalance` | Force capital rebalance (see note below) |
| `POST /override/force-promote-check` | Run gate check right now |

### Frontend: `HumanOverride.tsx` (new page)
- **System status bar** — live engine health, glows red when halted
- **Emergency Stop** — two-click (browser confirm dialog + button), kills everything
- **Resume Trading** — green, only appears when halted
- **Manual Trade form** — BUY/SELL toggle, amount (τ), optional reason, two-click confirm (stage → execute)
- **Fleet Controls** — Force Rebalance + Force Promotion Gate Check
- **Strategy promotion grid** — all 12 strategies, current mode as step indicators, ↑ UP / ↓ DOWN instant buttons
- **Navigation** — "Human Override" in sidebar, red-tinted, right below Mission Control

### Key design notes:
- Promote/demote writes to DB immediately, persistent across restarts
- Emergency stop is module-level state (`_EMERGENCY_HALTED`) — any trade attempt while halted returns 503
- Manual trade uses existing `trading_service.manual_trade()` — respects paper/live mode
- All actions push to activity stream AND fire alert_service notification

---

## The Force Rebalance Discussion

### User flagged (correctly):
> "The capital rebalance button — I was going to ask about it. Why did it exist? It seemed like it would cause harm to the flow."

### Analysis confirmed:
The Force Rebalance button is **dangerous** because:
1. Rebalance scores strategies by `win_rate × 0.6 + pnl_norm × 0.4`
2. That formula only works when sample size is large enough
3. Triggering at wrong moment (3 lucky wins, mid-streak, early session) = noise dominates signal
4. The 24-hour cadence exists to let variance smooth out
5. Promote/demote individual buttons are MORE powerful and LESS harmful — surgical not sledgehammer

### Decision:
**Remove Force Rebalance from Human Override UI.**
Auto-rebalance only on:
1. ✅ Automatically every 24 hours (cycle engine schedule)
2. ✅ Automatically when a strategy is promoted or demoted
3. ✅ After configurable minimum trade count threshold

**This is Fix #5 scope** — remove the button, wire promote/demote to trigger rebalance in backend.

---

## Hit List Status (end of this conversation chunk)
| # | Fix | Status | Commit |
|----|-----|--------|--------|
| 1 | Real-time Account Balance KPI | ✅ Done | `7131e54` |
| 2 | Trade Log default filter | ✅ Done | `c260937` |
| 3 | Strategies page — tier system | ✅ Done | `6bb3e85` |
| 4 | Human Override command panel | ✅ Done | `27d7e85` |
| 5 | Capital allocation persistence + remove bad rebalance button | 🔜 Next | — |

## Remaining Hit List
6. TAO main chart + subnet mini charts
7. Ticker tape — always visible
8. Monetary Target / Recovery Tracker
9. II Agent Chat window modifications
10. Real αTAO subnet positions in Wallet page

