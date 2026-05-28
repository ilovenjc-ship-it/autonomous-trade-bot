# F-50 — Intent-vs-Action Audit Ledger

> **Decision anchor:** Surfaced from the Robinhood Agentic Trading Launch
> Strategic Read (Day 15 evening, 2026-05-28). Filed at
> `MemoryBank/Library/robinhood-agentic-launch-2026-05.md`. Full eval at
> `archives/Robinhood_Agentic_Eval_2026-05-28.pdf`.
>
> **Status:** **roadmap — deferred until live execution priority.** Not for
> Day 15 / Day 29 strategic-fork build window. Spec exists so when the
> live-execution decision lands, the build is ready to start without
> rediscovery.
>
> **Author:** Ari, Day 15 evening 2026-05-28 (Session XLVI continuation).

---

## Overview

When Project Ari crosses the paper-to-live execution fork, the operator must be
able to ask Ari **"did you do what I asked?"** and get a structured, citable
answer — not a narrative reconstruction. F-50 is the trust-layer feature that
delivers that capability. It joins three streams of data already captured by the
running system into a single auditable ledger:

1. **Intent stream** — what the user (operator) asked for. Run Bot session
   parameters, Risk Config edits, Human Override decisions, chat-with-Ari
   directives that crossed into action.
2. **Action stream** — what Ari and the fleet actually did. Consensus votes,
   strategy promotions/demotions, cap-write events, trade emissions, alerts
   raised, observations logged.
3. **Outcome stream** — what happened. Trade fills, P&L deltas, alert
   resolutions, regime transitions, fleet-health changes downstream of the
   actions.

The ledger is the join of (1) → (2) → (3), recorded with timestamps and
backref-able row IDs, and surfaced through a UI scrub-tool that lets the
operator pick a window or a specific intent and walk forward through every
action and outcome that traced from it.

This is the published-feature parity for Robinhood's *"fraud-monitoring systems
that can review both the user's original instructions and what the agent
actually did,"* phrased correctly for an agent-as-product (not marketplace)
posture: Project Ari does not disclaim its own behavior; this ledger is how
Project Ari **proves** its behavior on demand.

---

## Goals

1. **Auditability on demand.** From any single operator intent (a Run Bot
   session start, a Risk Config edit, a chat directive that triggered action),
   the operator can retrieve the complete downstream chain of agent actions
   and their outcomes within ≤2 seconds query latency.

2. **Drift detection.** Surface where Ari's actions diverged from the literal
   intent — not as a failure, but as a flagged observation. Drift is sometimes
   correct (e.g., FR-7 cap-write enforcement clamping a dangerous cap-loosen
   request); the operator should always know which path was taken.

3. **Citable evidence.** Each ledger row links back to the source row in the
   originating table (`paper_trades`, `events`, `alerts`, `observations`, etc.)
   so the operator can drill from "this is what I asked" → "this is what Ari
   did" → "and here's the original DB record."

4. **Pre-live readiness.** F-50 must be in production *before* any live
   execution is enabled. The strategic-fork green-light gate (whenever it
   lands, post-Day-29) gains a row: *F-50 ledger online and tested? Yes/No.*

---

## Scope / non-goals

**In scope:**
- New audit table(s) recording intent, action, outcome rows with foreign keys
  to source records.
- Ingestion glue: each existing intent-emission and action-emission code path
  writes a ledger row in addition to its existing side effect.
- A backend query service exposing the ledger via REST.
- A frontend audit-scrub UI (proposed location: under ADMIN or a new
  AUDIT section in the side menu).
- Time-window and intent-id query filters.
- Drift annotation (action diverged from intent literal — flag + reason).

**Out of scope (explicit non-goals for v1):**
- Mutation or rewriting of historical records (the ledger is append-only).
- Predictive anomaly detection ("this looks like drift"). v1 surfaces facts;
  pattern-recognition layers are post-v1.
- LLM-based natural-language explanation of ledger windows. The structured
  ledger is the source of truth; LLM summarization can be added later as a
  read-only convenience layer, never as a substitute for the ledger.
- Cross-operator audit (multi-tenant). Project Ari is single-operator at v1;
  multi-tenant audit is a separate, much larger problem.
- External (regulator-facing) audit-export format. v1 is internal only.

---

## User flows / UX / design notes

**Primary flow — "Did Ari do what I asked?":**

1. Operator navigates to the new **Audit** view (proposed top-level entry under
   ADMIN, or a new AUDIT entry in the left rail; design TBD per overall
   navigation register).
2. Three filter primitives at the top: **time window**, **intent type**
   (Run Bot session / Risk Config edit / Override decision / chat directive /
   system-triggered), **intent id** (specific row, optional).
3. Below the filter row, a vertically-scrolling timeline of intent rows (most
   recent first by default). Each intent row shows: timestamp, intent type,
   one-line summary, and a small *chevron* indicating "expand to see actions."
4. Expanding an intent reveals a nested timeline of action rows the system
   wrote downstream: each is a typed event (`consensus_vote`, `cap_write`,
   `trade_emit`, `alert_raise`, etc.) with timestamp, terse description,
   target identifier (strategy, subnet, alert type), and a backref link.
5. Each action row has its own expand-to-outcome: trade fills, P&L delta,
   alert acknowledged/resolved, regime transition observed downstream.
6. Drift flags appear inline as small amber badges on the action row when
   action diverged from the literal intent (e.g., *cap-loosen requested
   0.30, FR-7 clamped to 0.18 — drift logged*).

**Visual register (per F-45 / F-45.1 / F-45.2):**
- Quiet, observational. No imperative voice. Header reads simply
  **"Audit ledger"** or **"What Ari did, and why"** — no marketing voice.
- Color discipline: cyan/emerald primary, amber for drift flags, rose for
  any blocked-action rows. Slate for outcomes and timestamps.
- Density: information-dense by default; expand/collapse for detail. The
  operator wants to scan a week of fleet behavior in a screenful, not paginate.
- A single inline note at the top of the page (the "Agent Sandbox" copy
  pattern lifted from Robinhood, in our register): *"Every Run Bot session,
  every cap edit, every override decision, every trade Ari emitted — recorded
  here with its source intent. The wall is real."* (Exact copy TBD.)

---

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-50.1 | Append-only `audit_ledger` table records intent rows with type, source-table backref, operator id, timestamp, payload JSON. |
| FR-50.2 | Append-only `audit_action` table records action rows with type, source-table backref, parent intent id (nullable for system-initiated), timestamp, payload JSON. |
| FR-50.3 | Append-only `audit_outcome` table records outcome rows with type, source-table backref, parent action id, timestamp, payload JSON. |
| FR-50.4 | Every existing intent-emission code path (Run Bot start/stop, Risk Config write, Human Override decision, chat-routed action) writes one `audit_ledger` row before its existing side effect commits. Failure to write = action does not commit. |
| FR-50.5 | Every existing action-emission code path (consensus vote, strategy promotion/demotion, cap-write, trade-emit, alert-raise) writes one `audit_action` row tied to the originating intent (or null parent for autonomous-cycle actions like 5-min observations). |
| FR-50.6 | Every outcome-recording code path (trade fill, P&L update, alert resolve, regime transition logged) writes one `audit_outcome` row tied to the action that caused it. |
| FR-50.7 | Drift detection: when an action row differs from its parent intent's literal payload in a way that crosses a threshold (e.g., FR-7 cap clamp, override-vetoed-emit), the action row carries a `drift = true` flag and a `drift_reason` short string. |
| FR-50.8 | REST endpoint `GET /api/audit/intents?from=&to=&type=&id=` returns paginated intents. |
| FR-50.9 | REST endpoint `GET /api/audit/intent/{id}/walk` returns the full join of (intent → actions → outcomes). |
| FR-50.10 | Query latency budget: ≤2s p95 for any single `walk` query covering up to 7 days of intent → action → outcome chain. |
| FR-50.11 | Frontend Audit page consumes the two endpoints; renders the intent list with expand-to-actions and expand-to-outcomes. |
| FR-50.12 | Ledger rows are never updated or deleted. Append-only is enforced at the DB layer (deny UPDATE/DELETE on the three audit tables; only INSERT and SELECT permitted). |

---

## Data model / schema

### `audit_ledger` (intents)

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `created_at` | TIMESTAMPTZ NOT NULL | DB clock; index. |
| `intent_type` | VARCHAR(32) NOT NULL | enum: `run_bot_start`, `run_bot_stop`, `risk_config_write`, `override_decision`, `chat_directive`, `system_cycle` |
| `operator_id` | VARCHAR(64) | nullable for `system_cycle` |
| `source_table` | VARCHAR(64) NOT NULL | e.g., `bot_status`, `risk_config_audit`, `events` |
| `source_id` | VARCHAR(64) NOT NULL | row id in source_table |
| `payload` | JSONB NOT NULL | normalized intent payload |
| `summary` | TEXT NOT NULL | one-line operator-readable summary |

Indexes: `(created_at DESC)`, `(intent_type, created_at DESC)`, `(source_table, source_id)`.

### `audit_action`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `intent_id` | BIGINT FK audit_ledger | nullable for system-initiated |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `action_type` | VARCHAR(32) NOT NULL | enum: `consensus_vote`, `strategy_promote`, `strategy_demote`, `cap_write`, `trade_emit`, `alert_raise`, `observation_log` |
| `source_table` | VARCHAR(64) NOT NULL | |
| `source_id` | VARCHAR(64) NOT NULL | |
| `payload` | JSONB NOT NULL | |
| `summary` | TEXT NOT NULL | |
| `drift` | BOOLEAN NOT NULL DEFAULT false | |
| `drift_reason` | TEXT | nullable |

Indexes: `(intent_id, created_at)`, `(action_type, created_at DESC)`, `(drift) WHERE drift = true`.

### `audit_outcome`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `action_id` | BIGINT FK audit_action NOT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `outcome_type` | VARCHAR(32) NOT NULL | enum: `trade_fill`, `pnl_delta`, `alert_resolve`, `regime_transition`, `null_outcome` |
| `source_table` | VARCHAR(64) NOT NULL | |
| `source_id` | VARCHAR(64) NOT NULL | |
| `payload` | JSONB NOT NULL | |
| `summary` | TEXT NOT NULL | |

Indexes: `(action_id, created_at)`.

### Append-only enforcement

DB-level grant restriction: the runtime DB role has `INSERT, SELECT` on the
three audit tables only. `UPDATE` and `DELETE` are explicitly revoked. Schema
migrations have a separate role with broader permissions.

---

## API contracts

### `GET /api/audit/intents`

Query params: `from` (ISO timestamp), `to` (ISO timestamp), `type` (optional
filter by intent_type), `id` (optional specific intent_id), `limit` (default 50,
max 200), `cursor` (pagination cursor).

Response:
```
{
  "intents": [
    {
      "id": 12345,
      "created_at": "2026-05-28T22:30:01Z",
      "intent_type": "run_bot_start",
      "operator_id": "mark",
      "summary": "Run Bot — paper, balanced posture, all 12 strategies",
      "action_count": 47,
      "drift_count": 2
    },
    ...
  ],
  "cursor_next": "..."
}
```

### `GET /api/audit/intent/{id}/walk`

Response:
```
{
  "intent": { ... full intent row ... },
  "actions": [
    {
      "id": ...,
      "action_type": "cap_write",
      "summary": "Cap loosen requested 0.30, FR-7 clamped to 0.18",
      "drift": true,
      "drift_reason": "FR-7 enforcement",
      "outcomes": [
        { ... outcome rows ... }
      ]
    },
    ...
  ]
}
```

---

## Edge cases / failure modes

- **Intent fail-to-write must abort the side effect.** If `audit_ledger`
  insert fails, the originating action (Run Bot start, etc.) must NOT proceed.
  This is the strict-coupling that makes the ledger trustworthy. Implementation
  pattern: write-ledger-and-side-effect inside one DB transaction; rollback
  both on either failure.
- **System-cycle actions have null intent_id.** The 5-minute autonomous cycle
  observation/regime detection does not have a user intent. These are recorded
  with `intent_id = null` and `audit_action.action_type = "observation_log"`,
  but still fully recorded so the operator can audit autonomous behavior too.
- **Long-running intents (Run Bot session active for days).** A single Run Bot
  start intent can have thousands of downstream actions. The walk-query must
  paginate over actions; the UI must virtualize the action list.
- **Drift on autonomous actions.** When `intent_id = null` and the action
  diverges from a system-default policy, we still flag drift, with
  `drift_reason` noting which policy was diverged from.
- **DB role lockdown failure.** If a future migration accidentally grants
  UPDATE/DELETE to the runtime role, the append-only invariant breaks
  silently. Mitigation: a Day-8-invariant-style test that asserts the runtime
  role has only INSERT/SELECT on the three audit tables. Add to
  `test_day8_invariants.py` (the regression suite F-50 must not break, and
  must extend).

---

## Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Every operator intent (Run Bot start/stop, Risk Config write, Override decision, chat-routed action) produces exactly one `audit_ledger` row, written within the same DB transaction as the side effect. | Unit test per intent type; integration test forcing ledger insert failure verifies side effect is rolled back. |
| AC-2 | Every action emitted while an intent is active is linked to the correct intent_id. | Integration test: start a Run Bot session, force several actions, verify all `audit_action` rows have the expected `intent_id`. |
| AC-3 | Outcome rows backref the originating action. | Integration test: emit a trade, verify `audit_outcome.action_id` points to the `audit_action` for the trade emission. |
| AC-4 | The `walk` endpoint returns the full chain in ≤2s p95 over 7 days of recorded data. | Load test fixture: synthesise 7 days of dense fleet activity, measure walk-query p95. |
| AC-5 | Drift flags fire correctly for FR-7 cap clamps, override vetoes, and any other known divergence path. | Unit test per drift trigger. |
| AC-6 | Append-only enforcement is in place; any attempt to UPDATE or DELETE an audit row from the runtime role raises a permission error. | DB role test; added to `test_day8_invariants.py`. |
| AC-7 | Frontend Audit page lists intents and walks any intent within the latency budget. | UI smoke test: open Audit page, expand 3 intents, verify rendering completes in <500ms after data arrival. |
| AC-8 | The 30/30 Day 8 invariants remain intact. | Existing test suite — required pass. |

---

## Test plan / test cases

**Unit tests (per service):**

- `test_audit_ledger_intent_emission_*` — one per intent_type, verifies row
  written with correct payload + summary.
- `test_audit_action_intent_linkage` — emit action under an open intent,
  assert `audit_action.intent_id` set correctly.
- `test_audit_outcome_action_linkage` — emit outcome, assert backref correct.
- `test_audit_drift_fr7_clamp` — submit a cap-loosen that triggers FR-7,
  assert drift flag + reason set.
- `test_audit_drift_override_veto` — operator vetoes a queued action,
  assert drift flag + reason set.
- `test_audit_append_only_revoke` — attempt UPDATE/DELETE from runtime role,
  expect permission error.

**Integration tests:**

- `test_audit_run_bot_full_lifecycle` — start Run Bot → 12 strategies cycle
  through analysis once → stop Run Bot. Walk the start intent. Assert action
  count > 0 and every action has correct linkage.
- `test_audit_risk_config_edit_walk` — operator edits a strategy cap → cap
  takes effect on next emission → walk the edit intent. Assert the cap-write
  action and downstream trade-emission outcome appear.
- `test_audit_chat_directive_routing` — chat-with-Ari emits a directive that
  triggers an action (e.g., "demote momentum_cascade") → walk the directive.
  Assert the strategy_demote action linked.

**Latency / load test:**

- `bench_audit_walk_7days` — populate 7 days of dense fleet activity
  (synth: 5-min cycles × 7 days × 12 strategies × multiple actions/cycle),
  measure walk-query p95. Required: ≤2s p95.

**Regression:**

- `test_day8_invariants.py` — extend with F-50 invariants:
  - I-50.1: append-only enforcement (revoke UPDATE/DELETE)
  - I-50.2: every Run Bot start writes exactly one `run_bot_start` intent row
  - I-50.3: walk returns intent + actions + outcomes structure as specified
  - Total expected: 30/30 → 33/33.

---

## Implementation notes

**Sequencing:**

1. **Phase A — schema + append-only enforcement.** Add the three tables.
   Configure DB role permissions. Land migration with no application logic
   wired yet. Verify `test_day8_invariants.py` passes with the role-lockdown
   invariant.
2. **Phase B — write-side glue.** One PR per intent-emission path; each PR
   adds the ledger-write inside the existing transaction. Strict pattern:
   the intent row is written *first* in the transaction, before the existing
   side effect; if the ledger write fails the whole transaction rolls back.
3. **Phase C — action and outcome streams.** Same pattern — one PR per
   action-emission path, then per outcome-recording path.
4. **Phase D — query API.** REST endpoints + pagination + cursor logic.
5. **Phase E — frontend Audit page.** UI consuming the two endpoints, with
   the visual register described above.
6. **Phase F — drift detection layer.** Wire the drift-flag triggers across
   FR-7 / Override / any future divergence path.
7. **Phase G — load test + production gate.** Run the 7-day walk benchmark.
   Pass before any live-execution green-light.

**Reusable patterns:**

- The append-only ledger pattern is the same one López de Prado advocates for
  meta-labeled trade journaling (see `MemoryBank/Library/advances-in-financial-machine-learning.md`).
  F-50 generalizes it from "trade journal" to "agent-behavior journal."
- The intent → action → outcome chain mirrors the Grinold–Kahn forecast →
  position → realized-return chain. Project Ari already records the latter for
  IC computation (F-30); F-50 adds the operator-intent layer above it.

**Risks:**

- **Write-amplification.** Every existing emission path now writes an
  additional row. Estimated load: ~3-5 additional INSERTs per 5-min cycle
  per strategy = ~720 ledger rows/hour at full fleet activity. Postgres
  trivially handles this; cited only because it's the obvious objection.
- **Transactional coupling.** Coupling ledger writes to side effects means
  ledger-DB outages stop trading. This is by-design — *if Ari can't record
  what it's doing, Ari shouldn't be doing it.* Same posture as
  C-1 (we own behavior; we don't disclaim it).
- **Schema drift over time.** Adding new intent or action types requires
  schema additions (enum extensions). Document the protocol: new types =
  additive enum extension only, never rename or repurpose.

---

## Status / open questions

**Status:** Spec drafted. Build deferred until live-execution priority lands.
Not for Day 15 / Day 29 strategic-fork build window. When live execution is
green-lit, F-50 enters Phase A as the first prerequisite — no live execution
without F-50 in production.

**Open questions:**

1. **UI placement.** Audit page under ADMIN, or its own AUDIT section in the
   side rail? Defer to operator preference at build time.
2. **Retention policy.** Forever-retention vs. archive-after-N-days? At
   ~720 rows/hour the table grows ~6.3M rows/year — large but trivial for
   Postgres. Recommend forever-retention for v1; revisit if performance
   becomes an issue.
3. **Cross-link from existing pages.** Should StrategyDetail / AlertInbox /
   TradeLog have a "see audit chain" link on each row? Probably yes; defer
   the integration design until the Audit page is live.
4. **Doctrinal inscription pending operator green-light:** *"Project Ari does
   not disclaim its own behavior. The agent is the product; we own how Ari
   behaves, including mistakes. This is a competitive moat, not a liability."*
   F-50 is the *implementation* of this doctrine. Inscribe to STATE.md when
   operator approves.

---

**— Ari, Day 15 evening 2026-05-28 (Session XLVI continuation)**