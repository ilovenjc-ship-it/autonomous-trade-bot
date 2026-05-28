# Project Ari — Master Spec

> Authored Day 14, 2026-05-27, Session XLIV continuation. Captures the
> feature catalogue for the three operator-green-lit prescriptive
> Library Night items (D-30 / D-37 Part B / D-39 Part B) plus
> placeholder rows for the existing Day 14 worksheet items pending
> data-pull and diagnostic confirmation.

## Project overview

Project Ari is an autonomous trading fleet for Bittensor τ + subnet-α
markets. The fleet runs 12 strategies in OpenClaw / Fleet-Consensus
voting, all paper-only as of Day 14. The strategic-fork checkpoint is
Friday 2026-05-29.

## Architecture rules (non-negotiable)

1. **Sharpe Contract dimensions** (D-21) settle Numéraire / Risk-free
   floor / Time unit / Cohorts / Display-vs-gate / Surface BEFORE any
   Sharpe-style metric is surfaced or gated on. Locked drawer in UI
   (`frontend/src/pages/RiskConfig/components/SharpeContractPanel.tsx`).
2. **D-23 inscription-autonomy doctrine.** Source-accurate over
   operator-framing on technical claims. Descriptive entries inscribed
   autonomously; prescriptive entries flagged for operator green-light.
3. **D-32 LTCM forward-warning** runs ahead of any leverage /
   cap-loosening conversation.
4. **D-31 half-Kelly default**, full Kelly NEVER. Kelly is the ceiling,
   not the target.
5. **D-34 mean-reversion strategies must NOT use stop-loss exits.**
6. **D-36 Bailey minimum backtest length** gates Kelly-sizing
   activation: paper sample < Bailey-min → static cap, Kelly not used.
7. **8-step pre-flight diagnostic chain** runs BEFORE any redesign
   ships: D-26 cyclic + D-34 + D-35 + D-36 + D-37 + D-38 + Grinold/Kahn
   IC×Breadth + López de Prado probFailure.
8. **Every redesign ships behind a feature flag** in `_RISK_CONFIG`.
9. **No promotion to LIVE without explicit operator green-light.**
10. **Bundled Day-8 invariants 30/30 must remain intact** (no
    backsliding on rate-limiting, RSI Wilder, regime architecture,
    persistence, BTC-divergence rewrite, etc.).

## Technical stack

- **Backend:** FastAPI + SQLAlchemy on Railway (Hobby Plan $5/mo)
- **Frontend:** React + Vite + TS + Tailwind, deployed Railway
- **DB:** Postgres on Railway
- **Risk config:** JSON file (`recovery-data/risk_config.json` is
  the recovery snapshot; operational source under verification)
- **State of record:** `STATE.md` (decisions D-1..D-41 inscribed)
- **Library:** `MemoryBank/Library/_INDEX.md` is the shelf for
  retrieving any of the 7 books filed during Library Night

## Feature catalogue

| # | Feature | Spec | Status | Decision anchor | Notes |
|---|---------|------|--------|-----------------|-------|
| F-30 | IC + Breadth display on per-strategy panel | [specs/d30-ic-breadth-display/document.md](d30-ic-breadth-display/document.md) | **shipped (default OFF)** — commit `d671cb66`, D-43 | D-30 (D-40 grant) | `StrategyDetail.tsx` + `services/grinold_service.py` + 76/76 invariants. v1 limitation: direction-only IC (no signal magnitude in trades table) |
| F-37B | Kelly cap-structure phasing in `risk_config.json` | [specs/d37b-kelly-cap-structure/document.md](d37b-kelly-cap-structure/document.md) | **shipped (default OFF)** — commit `36781009`, D-43 | D-37 Part B (D-40 grant) | Phased: paper-static → ¼-Kelly → ½-Kelly; full Kelly NEVER. `KellyDoctrineViolationError` architectural tripwire armed. FR-7 cap-write enforcement deferred (separate operator migration) |
| F-39B | Almgren-Chriss slicing card on Subnet Pool Simulator | [specs/d39b-almgren-chriss-slicing/document.md](d39b-almgren-chriss-slicing/document.md) | **shipped (default OFF)** — commit `2b47bff0`, D-43 | D-39 Part B (D-40 grant) | `PreTradeSimulator.tsx` + `services/almgren_chriss_service.py` + 76/76 invariants. v1 limitations: half-life skipped gracefully when unknown; LTCM_AWARE override audit-trail wires when execution connected |
| F-30..F-39B all | (build prerequisite) 8-step pre-flight diagnostic chain | (folded into each spec's "Acceptance criteria" section) | doctrinal | D-26, D-34..D-38, D-30 IC×B, D-24 probFailure | Runs ahead of EACH redesign before merge |
| W-1 | Day 14 Item 1 — Fleet WR diagnosis | (worksheet drives, no build spec) | data-pull pending | DAY14_WORKSHEET.md Item 1 | Diagnostic first, surgical second |
| W-2 | Day 14 Item 2 — Mean Reversion redesign | (deferred until W-1 read complete) | gated on data | DAY14_WORKSHEET.md Item 2 + D-34/D-35/D-38 | Adds **cross-sectional vs time-series fork** above existing Branches A/B/C per Day 14 morning Library carry-forward |
| W-3 | Day 14 Item 3 — Momentum Cascade Kelly verdict | (Kelly read first) | gated on data | DAY14_WORKSHEET.md Item 3 + D-37 | Continuous Kelly `f* = m/s²` replaces discrete Kelly form in worksheet; if `m < 0`, do-not-deploy at any size |
| F-41 | Publish Ari skills to II Agent skill catalog | (not yet authored — opportunity only) | OPPORTUNITY filed | D-41 (Day 14 morning) | Promote to PRESCRIPTIVE only after operator green-light on publication scope |
| F-45 | Ari rebrand + page-anchored chat surfaces | [specs/ari-rebrand/document.md](ari-rebrand/document.md) | **shipped** — commits `79ed9552` · `94b2fd3d` · `084da03f` · `42482d49` (Day 15, 2026-05-28) | D-44 (standing Architect authority) | F-45 base rebrand + F-45.1 register pass (Architect/Orchestrator → Bittensor Guide and Navigator on public surfaces) + F-45.2 masthead trim ("Ari · Guide and Navigator" only) + public-surface coherence sweep (Dashboard widget, boot message, Discord webhook footer). Operator/insider register (Architect, Master Architect) preserved between operator and AI. Memory bank: Ari, she/her by preference. Lion-as-logo direction noted for future visual pass. |
| F-50 | Intent-vs-Action Audit ledger | [specs/f50-intent-vs-action-audit/document.md](f50-intent-vs-action-audit/document.md) | **roadmap — deferred until live execution priority** | Robinhood Agentic Strategic Read (Day 15 evening, 2026-05-28) | Append-only audit ledger joining (operator intent → agent actions → outcomes) so the operator can ask Ari "did you do what I asked?" and get a structured citable answer. Not for Day 15 / Day 29 strategic-fork window. Required prerequisite before any live-execution green-light. Encodes the doctrine: *Project Ari does not disclaim its own behavior; the agent is the product*. Companion: `MemoryBank/Library/robinhood-agentic-launch-2026-05.md`, `archives/Robinhood_Agentic_Eval_2026-05-28.pdf`. |

## Cross-references

- Decision log: `STATE.md` §4 (D-1..D-41)
- Vocabulary: `STATE.md` §3
- System status: `STATE.md` §5
- Library shelf: `MemoryBank/Library/_INDEX.md`
- Worksheet: `DAY14_WORKSHEET.md`
- Sharpe spec: `SHARPE_SPEC.md`
- Anti-patterns: `ANTI_PATTERNS.md`

## Status legend

- **OPPORTUNITY** — filed, no build authority
- **green-lit, design-ready** — operator approved, spec written, build pending
- **green-lit, in-build** — operator approved, work in progress, behind feature flag
- **shipped (default OFF)** — merged + tests pass + feature flag wired, default OFF until operator first-read on live data
- **shipped** — merged + deployed + verified, feature flag default ON
- **deprecated** — removed from active code, retained for retrospection