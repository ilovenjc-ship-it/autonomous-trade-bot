# Human Override Pre-Trade Gate Audit (Pre-Day-29)

**Author:** Architect (sandbox session, Day 16)
**Date:** 2026-05-29 (Friday, Day 16 / D-45)
**Audience:** Mark, Day-29 live-wire committee
**Status:** Findings only. No code changes shipped from this audit.
**Trigger:** Side-Task #1 from the Day 16 working list — Mark asked for an
audit of the Human Override pre-trade gate before Day 29 lifts paper-only
to live-wire eligibility for any strategy.

---

## Executive summary

The Human Override surface is **functionally correct for the paper-trading
era** but carries five gate-bypasses that become operationally meaningful
the moment a single strategy crosses to LIVE. None of the bypasses are
bugs — they are deliberate "human-overrides-the-machine" semantics. The
issue is that **none of them are logged to `audit_service`**, and three of
them **bypass safety floors that would otherwise be enforced** (FR-7
cap-write enforcement, `force_paper_mode`, gate.all_clear). The day a LIVE
strategy exists, those bypasses become live capital exposures the operator
can trigger in two clicks with no forensic record.

**Pre-Day-29 must-fix list (3 items):**

1. **Audit every override action.** Wrap `manual_trade`, `promote_strategy`,
   `demote_strategy`, `emergency_stop`, `resume_trading`, `force_rebalance`,
   `force_promote_check`, and `set_strategy_mode` in `audit_service.record(
   action="human_override:<verb>", category="trading"|"lifecycle", ...)`
   calls. Currently they emit `_push()` events and `alert_service` alerts
   but the persistent audit pipe never sees them.

2. **Honor `force_paper_mode` from the manual-trade path.** Today
   `manual_trade()` in `trading_service.py:233-258` calls `_execute_trade`
   which decides paper-vs-live purely from
   `bittensor_service.connected and wallet_loaded and hotkey`. If the
   operator force-paper-locks the bot and then triggers a manual trade,
   the trade still goes on-chain if the wallet is loaded. This contradicts
   the operator's intent.

3. **Make `_EMERGENCY_HALTED` durable.** Currently a module-level Python
   global in `routers/override.py:36-38`. If the process restarts after
   an emergency stop, the halt is silently lifted. Persist to BotConfig
   (or a dedicated singleton table) and re-hydrate on boot.

**Pre-Day-29 should-fix list (2 items):**

4. **Show the bypass on the UI.** Promote/Demote and Set-Mode silently
   walk strategy modes up/down without any UI affordance saying "this
   bypasses the gate." Add a one-line warning ribbon on the Manual
   Override page when the operator is about to bypass `gate.all_clear =
   false`.

5. **Two-step confirm for LIVE-bound actions.** Promoting from
   APPROVED_FOR_LIVE → LIVE today is a single click. Add a typed-confirm
   step (operator types the strategy name) for any action whose result is
   `mode = LIVE`. Mark approves; this is the standard ChromeOS-grade
   confirmation pattern.

The five findings below detail each bypass with file:line refs.

---

## Methodology

Files reviewed (head-of-tree as of commit `bfc6569c`, Day 16):

- `backend/routers/override.py` — 8 POST endpoints + 1 GET
- `backend/services/trading_service.py` — `manual_trade`, `_execute_trade`
- `backend/services/audit_service.py` — what gets/doesn't get audited
- `backend/services/bittensor_service.py` — wallet/connection state
  (skim only; existing gating well-tested)
- `frontend/src/pages/ManualOverride.tsx` — UI affordances + warnings
- `frontend/src/pages/StrategyMode.tsx` (via `set_strategy_mode`)

Reference doctrine pulled from:

- `MemoryBank/Contemplations/const-6-filter-fleet-as-miners-2026-05-28.md`
  — F-37B FR-7 cap-write enforcement (D-44 architectural answer at the
  capital layer)
- `STATE.md` — Day 8 Five Invariants, FR-7 doctrine, D-45 inscription on
  agent-as-product

---

## Findings

### F-1 · Manual trades bypass FR-7 cap-write enforcement

**Severity:** HIGH (LIVE-mode); LOW (paper-only mode).
**File:** `backend/services/trading_service.py:233-258`.
**Surface:** `POST /api/override/trade`.

`manual_trade()` calls `_execute_trade()` directly with no consultation of
the per-strategy or daily cap. F-37B's FR-7 (`do_not_deploy(f*≤0)` clamp,
shipped on D-44, commit `fd6f5922`) is the architectural floor for
autonomous trades — the manual-trade path goes around it.

Once a strategy is LIVE, an operator clicking "Manual BUY 5 τ" with
no per-strategy cap consultation can deploy capital at sizes that the
autonomous engine would have refused. This is by definition an override —
but it is also by definition the kind of action that should be persisted
to the audit pipe so a forensic reader can answer "who deployed 5 τ at
14:32 EDT and what was the cap at the time?"

**Recommendation (pre-Day-29):**
- Pass through FR-7 as an **opt-out**, not an opt-in. The override path
  consults the cap by default; the operator can pass
  `force_bypass_cap=true` (with a typed-confirm in the UI) to exceed it.
- Audit every manual trade with before/after = `{cap_at_time, requested,
  bypass_used}` so the forensic reader has the full picture.

---

### F-2 · Manual trades ignore `force_paper_mode`

**Severity:** HIGH (LIVE-mode); MEDIUM (paper-only mode).
**File:** `backend/services/trading_service.py:202-216`.
**Surface:** `POST /api/override/trade`.

`_execute_trade()` decides paper-vs-live with:

```python
if bittensor_service.connected and bittensor_service.wallet_loaded and hotkey:
    # on-chain stake/unstake
else:
    # simulation
```

There is no consultation of `BotConfig.force_paper_mode`. If the operator
has explicitly locked the bot to paper mode (the Day-16-#14 Stop-Bot
dialog literal source of truth), and then triggers a manual trade, the
trade still goes on-chain whenever the wallet is loaded. This contradicts
the operator's stated intent.

**Recommendation (pre-Day-29):**
- Add a check at the top of `_execute_trade()` that consults
  `BotConfig.force_paper_mode`. If true, skip the bittensor_service call
  and simulate, regardless of wallet state.
- Mirror in the UI: when `force_paper_mode = true`, the Manual Trade
  button should explicitly say "Manual BUY (paper)" — not let the
  operator click believing they're going on-chain.

---

### F-3 · Promote/demote/set-mode have no audit_service hooks

**Severity:** HIGH (any mode).
**File:** `backend/routers/override.py:186-401` (4 endpoints).
**Surfaces:** `POST /api/override/promote/{name}`, `/demote/{name}`,
`/set-mode/{name}`, `/force-promote-check`.

These endpoints mutate `Strategy.mode`, which is the single most
operationally consequential field in the system (it gates which strategies
can deploy real capital). Today they:

1. Update the DB column.
2. Push to `_push()` (in-memory event list, max 100 entries).
3. Fire an `alert_service.system_alert` (mark-as-read flow, not durable).

What they do NOT do: call `audit_service.record(action="human_override:
promote_strategy", category="lifecycle", before={mode: "APPROVED_FOR_LIVE"},
after={mode: "LIVE"}, ...)`. The audit pipe — the durable JSONL on the
Railway volume that survives deploys, the forensic record that tracks
risk-config changes — is the appropriate destination for these mutations.
Currently it never sees them.

This is the cleanest single fix in the audit. Each endpoint is 5 lines of
code that wraps `await db.commit()` in an audit record call.

**Recommendation (pre-Day-29):**
- Implement the wrappers. Use `category="lifecycle"` for mode changes
  and `category="trading"` for manual trades. `actor="operator"` is the
  right default; if the API ever distinguishes operators by API key the
  actor string can carry that.

---

### F-4 · `_EMERGENCY_HALTED` is not durable

**Severity:** HIGH.
**File:** `backend/routers/override.py:36-38, 274-340`.
**Surface:** `POST /api/override/emergency-stop`, `POST /api/override/resume`.

`_EMERGENCY_HALTED` is a module-level Python global. When the operator
hits Emergency Stop, the global flips to True and `manual_trade()` raises
HTTP 503 from then on.

The flag is **process-local**. If the Railway container restarts (deploy,
crash, eviction), the flag resets to False on next boot — silently
lifting the halt. The operator would have no signal that the halt is
gone unless they remembered to check the override status endpoint.

**Recommendation (pre-Day-29):**
- Persist the halt to `BotConfig.emergency_halted: bool` (or a dedicated
  `system_state` singleton table). Hydrate on boot.
- Have the cycle_engine consult this flag too (currently the halt
  enforcement is local to `routers/override.py`; nothing prevents
  `cycle_service` from firing trades during a halt because the halt
  flag is in the wrong layer).
- Audit the halt + resume actions through `audit_service` (links to F-3).

---

### F-5 · No two-step confirm for LIVE-bound actions

**Severity:** MEDIUM (process safety, not code).
**File:** `frontend/src/pages/ManualOverride.tsx` (and StrategyMode UIs).
**Surface:** UI buttons that flip mode to LIVE.

Today, promoting `APPROVED_FOR_LIVE` → `LIVE` for any strategy is a
single click. The UI shows the new mode with a green pill but the
gesture itself is no different than promoting `PAPER_ONLY` →
`APPROVED_FOR_LIVE` (a much smaller stakes change).

**Recommendation (pre-Day-29):**
- Wrap any mode-flip whose result is `LIVE` in a typed-confirm dialog.
  The operator types the strategy name (or a short phrase: "GO LIVE")
  to confirm. This is standard for irreversible-effect destructive
  actions; promoting to LIVE is operationally analogous to a
  "delete production database" gesture.
- Same treatment for `force_bypass_cap` on manual trades (see F-1).

---

## Coverage map

What is currently audited (pre-Day-16):

| Action                    | audit_service hook? | UI surface           |
| ------------------------- | ------------------- | -------------------- |
| `risk_config_update`      | ✅ Yes              | Risk Config page     |
| `bot_lifecycle` (boot)    | ✅ Partial          | Bot Start/Stop       |
| `consensus_threshold`     | ✅ Yes              | Risk Config          |
| `subnet_owner_change`     | ✅ Yes (system)     | Activities log       |
| `cex_listing_detected`    | ✅ Yes (system)     | Activities log       |
| `strategy_mode_change`    | ❌ **NO**           | Manual Override (F-3)|
| `human_override:trade`    | ❌ **NO**           | Manual Override (F-1)|
| `human_override:halt`     | ❌ **NO**           | Emergency Stop (F-4) |
| `human_override:resume`   | ❌ **NO**           | Resume Trading (F-4) |
| `human_override:rebalance`| ❌ **NO**           | Force Rebalance      |

Five of ten override-surface actions are not in the audit pipe.

---

## Pre-Day-29 action plan (recommended)

If we assume the current Day-16 paper-training trajectory holds (Mark
extending OBSERVE through Wed Jun 3 per this morning's checkpoint),
Day-29 is roughly **2 weeks out**. That gives runway for:

**Week 1 (Days 16-22) — fix the silent bypasses:**
- F-3 (audit hooks on every override endpoint) — 1 day
- F-2 (`force_paper_mode` consulted in `_execute_trade`) — 0.5 day
- F-4 (durable emergency halt) — 1 day

**Week 2 (Days 23-29) — fix the consent gestures:**
- F-1 (cap consultation as opt-out, with bypass flag) — 1 day
- F-5 (typed-confirm for LIVE-bound actions) — 1 day
- Day-29 dress rehearsal: simulate a full promote-to-LIVE for one
  strategy, watch the audit trail, confirm tombstones land. — 0.5 day

Total estimated effort: **5 engineering days**, ample slack.

---

## Notes for the live-wire committee

- This audit is non-prescriptive on **which** strategy goes LIVE first.
  That is a separate decision (the strategic-fork band 33–36% Fleet WR
  thinking from Day 15 / D-44 inscription).
- This audit does NOT cover the autonomous trade path — that is gated
  by FR-7 (D-44, shipped) + the consensus pipeline + per-strategy
  Strategy.mode. Those gates are correct as far as I read them today.
- This audit specifically flags the **operator's own ability to bypass
  the safety floors**. The system is safe from itself; the next
  question is whether it's safe from us, in two clicks, with no record.

---

## Sign-off

Open questions for Mark / live-wire committee:

1. F-1 framing — "cap consultation as opt-out": agree, or should the
   cap be **hard-enforced** even on the manual path (no bypass at all)?
2. F-5 framing — typed-confirm phrase: strategy name vs. fixed phrase
   ("GO LIVE")?
3. Day-29 dress rehearsal: do we want a dry-run on Day 28 with one
   real strategy, or only after the audit hooks land?