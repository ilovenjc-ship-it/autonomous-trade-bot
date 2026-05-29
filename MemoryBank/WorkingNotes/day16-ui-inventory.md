# Day 16 UI/UX Inventory — 2026-05-29 (Friday)

**Source:** Mark's two-paste re-confirmation after Day 15→16 context reboot.
**Purpose:** Survive future context reboots. This file is the source of truth for Day 16's UI work.
**Status legend:** 🔴 not started · 🟡 in progress · 🟢 shipped · ⚪ deferred

---

## Locked answers (Day 16 morning)

- **Lion vs Lioness:** **Lion** — locked. Confirmed by Mark (Day 16 morning, two-paste re-confirmation): *"Lion is locked - confirmed."* Overrides the inventory's "marinate on it" phrasing.
- **Audit Trail Reset:** **Read A** — option to reset/clear *while preserving the record/history* (audit log keeps a permanent paper trail; the operator-visible "active queue" is what clears).
- **Side-menu subtitle scope:** Item #1 says remove the subtitle "ARI" under "ARI Observation Lens". Side menu only — does **not** affect masthead.
- **Billboard cadence:** **9 seconds per slide** (Mark's favorite number).
- **Billboard controls:** auto-rotate + dots + **pause-on-current-slide** affordance.
- **Billboard placement:** **Inside the Chat Window** (default). If chat needs the height, reduce chat height and create a separate Billboard section below.
- **Billboard messages list:** received Day 16 morning, curated to 14 picks across 4 movements (see `day16-billboard-curation.md`).

---

## The 14-item list

| # | Surface | Item | File(s) | Status | Notes |
|---|---------|------|---------|--------|-------|
| 1 | Side Menu | Remove subtitle "ARI" under "ARI Observation Lens" | `frontend/src/components/Layout.tsx` ~L524-527 | 🟢 | Shipped — orb is the identity |
| 2 | Dashboard | Make Ari more prominent — Lion logo placement | `frontend/src/components/Layout.tsx`, `frontend/src/components/LionMark.tsx` | 🟢 | **Shipped as side-menu orb** — v6 inline SVG (see `lion-sigil-provenance.md`). Dashboard hero-band placement parked |
| 3 | Whale Flow | Subnet 0 detail page does not load when selected | `frontend/src/components/WhaleFlowDetailModal.tsx`, `frontend/src/pages/SubnetDetail.tsx` | 🟢 | Falsy-zero bug fixed |
| 4 | (Header) | Date color (Top Right) doesn't match Time color | `frontend/src/components/Layout.tsx` (header) | 🟢 | Shipped (cosmetic) |
| 5 | Live Indicators | TAO F&G field is blank | `frontend/src/components/?` (Bottom Right of page) | 🟢 | Shipped — Ari's Fear & Greed Index replaces gated TAO.app upstream |
| 6 | Ari page | Remove Red Dot from Top Line | `frontend/src/components/Layout.tsx` ~L1031 (HAL-eye dot) | 🟢 | Shipped — masthead red dot removed; mini HAL eye next to "Online" pill |
| 7 | Ari page | Replace Green Dot with Pink Brain | `frontend/src/pages/IIAgent.tsx` | 🟢 | Pink-brain swap (a) shipped, later softened pink-400 → pink-300 |
| 8 | Ari page | Change "Chat with Ari" → "Ari is On-line"; keep green ONLINE pill | `frontend/src/pages/IIAgent.tsx` | 🟢 | Shipped — "Ari · Online" with green liveness |
| 9 | Ari page | Relocate "Run Analysis" button — top-of-page → its own dropdown section between Chat Window and Agent Observation Log; pressing it opens Fleet Health Monitor section | `frontend/src/pages/IIAgent.tsx` | 🟢 | Shipped — biggest structural change on the page |
| 10 | Ari page | Inside Chat Window: change Green Brain → Pink Brain | `frontend/src/pages/IIAgent.tsx` | 🟢 | Pink-brain swap (b) shipped, later softened pink-400 → pink-300 |
| 11 | Ari page | Inside Chat Window: build Ari's Billboard (rotating message slideshow) | `frontend/src/pages/IIAgent.tsx` (new component) | 🟢 | Shipped — 14 curated messages, 9s cadence, dots, pause-on-slide |
| 12 | Fleet Consensus | Relocate "Running - Cycle" section to very top, above "How Fleet Consensus Works" | `frontend/src/pages/FleetConsensus.tsx` | 🟢 | Shipped — section reordered |
| 13 | Audit Trail | Add reset/clear option that preserves history (Read A) | `frontend/src/pages/AuditTrail.tsx` + backend route | 🟢 | Shipped — soft-reset preserves history |
| 14 | Human Override | Stop Bot wrong-mode message: shows "Live Mode" when actually in Paper Mode | `frontend/src/components/Layout.tsx:296` (`force_paper_mode ?? true` ignoring `liveCount===0` guard) | 🟢 | Shipped — guard now respected |
| **+15** | Fleet / Strategies | Add post-D-44 cohort line (cohort = trades after D-44 inscription `fd6f5922`) | `frontend/src/pages/AgentFleet.tsx`, `frontend/src/pages/Strategies.tsx` | 🟢 | Shipped — cohort line live on both pages |

---

## Side-tasks (parked, not in the 14)

- **Side-Task #1:** Human Override pre-trade gate audit (pre-Day-29). 🟢 Write-up shipped (`override-pretrade-gate-audit.md`). Three open committee questions still pending: F-1 three-state spec, F-5 typed-confirm token (`ARM_LIVE`), Day-29 dress rehearsal. See `day16-close-out.md`.
- **Side-Task #2:** Fleet-as-miners PDF for Archives (from `MemoryBank/Contemplations/const-6-filter-fleet-as-miners-2026-05-28.md`). 🟢 Shipped via ReportLab.
- **Strategic-fork checkpoint report:** ✅ DONE this morning — recommended HOLD/extend OBSERVE through Wed Jun 3.

---

## Day 16 close-out

All 15 numbered items shipped. Lion sigil arc resulted in an
original hand-drawn SVG mark (v6) — provenance preserved in
`lion-sigil-provenance.md` for eventual trademark filing.

See `day16-close-out.md` for the full ship summary and what
rolls forward.

---

## Execution order (Architect's plan, Day 16)

1. **Bug batch** (single commit): #14 + #3 + #5 — three high-priority bugs, root cause fixes only, ship together.
2. **Billboard build** (#11): biggest UX win, single commit. Depends on curated message list (in hand).
3. **Pink-brain swap pair** (#7 + #10): paired, single commit.
4. **Ari-page structural** (#8 + #9): copy change + Run Analysis relocation; can pair with #6 (red dot remove).
5. **Cosmetic batch** (#1 + #4): one commit, low risk.
6. **Section reordering** (#12 Fleet Consensus): single commit.
7. **Audit Trail reset** (#13): backend endpoint + UI; biggest single item by effort.
8. **Dashboard Lion logo** (#2): wait for iconography (image_search / generate_image pass).
9. **Post-D-44 cohort line** (#15): backend cohort filter + UI legend.
10. **Side-tasks #1 (override audit) and #2 (fleet-as-miners PDF)**: parallel, end-of-day if time.