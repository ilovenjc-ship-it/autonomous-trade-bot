# RENAME_FLEET_CONSENSUS.md — OpenClaw → Fleet Consensus

> Pick locked Day 13 wrap-up 2026-05-26 evening (Mark green-light:
> *"Green-light on 'Fleet Consensus'"*). Refactor itself runs as a
> dedicated next-session arc — this file is the inscription + the
> commit-level execution plan for that session.
>
> **Do not start the refactor until the entire plan below has been
> read end-to-end.** Multi-step, one commit per concern, tests green
> at every step. The 75-file / ~355-ref scope is order-of-magnitude
> larger than the TaoBot bucket-B sweep (~22 refs / ~10 min). Treat
> it as such.

---

## 1. AP-9 inscription — the four-axis search (mandatory in lead commit)

This is the **inscription text** to copy verbatim into the message of
the lead rename commit (the one that flips the user-facing route +
the lead-page React file). AP-9 (filed Day 13, `9c5c0132`) makes
inscription the tripwire — absent inscription, the check wasn't run.

> **Naming check (AP-9, four-axis):** *Fleet Consensus.* Descriptive
> phrase, deliberately not coined as a proper-noun brand.
>
> 1. **Public web** — `"Fleet Consensus"` quoted: descriptive use only,
>    no project owns it as a proper-noun brand. LIDO uses the phrase
>    descriptively in validator-fleet documentation, not as a product
>    name. Footnote, not collision.
> 2. **GitHub** — `github.com/search?q=%22fleet+consensus%22`: zero
>    repos with the phrase as their name. Several repos use the
>    descriptive phrase inside README prose for distributed-systems
>    explanations. Same footnote as #1.
> 3. **Crypto / Bittensor namespace** — no TaoStats validator named
>    Fleet Consensus, no dTAO subnet (1–256) registered under the
>    name, no OTF Discord channel hits. Clean.
> 4. **Anthropic / OpenAI / NVIDIA blogs (last 90 days)** — no
>    framework, agent product, or feature shipped under this name.
>    Clean.
>
> **Verdict:** PASS. *Fleet Consensus* is a descriptive phrase, not
> a contaminated brand. AP-9's negative constraint on generic English
> nouns (*Council*, *Forum*, *Tribunal*) does not apply because
> "Fleet Consensus" is a two-word **descriptive composite** — the
> AP-9 constraint targets single common nouns vulnerable to future
> brand collision; descriptive composites stay descriptive.
>
> **Rejected candidates (all hard-fail under AP-9, kept as record):**
>
> - **Conclave** — Cardano stake-pool protocol + AWS event of the
>   same name. Brand collision.
> - **Plenum** — Hyperledger Indy's named BFT consensus. Direct
>   architectural collision (we'd be naming our 7/12 supermajority
>   after a different blockchain's named consensus).
> - **Praetor** — *PRAETOR Enterprise — 12 Claude-powered AI agents.*
>   Direct AI-agent product collision.
> - **Witan** — npm package `@weave_protocol/witan` *"Council
>   Protocol — Multi-agent consensus."* Direct multi-agent-consensus
>   product collision.
> - **II Agent Consensus** — Intelligent Internet's "II-Agent" is
>   their owned proper-noun product with their own *Proof-of-Benefit*
>   consensus. Plus internal collision with our `pages/IIAgent.tsx`
>   route (different concept). HARD FAIL on two axes.
> - **Intelligent Consensus** — already a named pattern in the Swarms
>   framework docs, plus arXiv MIND paper, plus MDPI survey on Web3
>   agents. HARD FAIL.
>
> **Why descriptive beats coined here:** the morpheme space for
> deliberative-body brand names is saturated as of 2026 (AI-agent +
> crypto-consensus projects converging on Greek/Latin/Old-English
> council vocabulary). A descriptive composite is harder to collide
> *in principle* because no one trademarks "Fleet Consensus" — the
> phrase is too plain to own. AP-9 lesson: **prefer descriptive
> phrase over coined brand when the morpheme space is saturated.**

---

## 2. Why Fleet Consensus (three stacked reasons)

1. **Codebase consistency.** The repo already uses *the Fleet*
   throughout: `agent_service`, `pages/AgentFleet.tsx`, `/api/fleet/*`
   routes, "fleet WR" in every dashboard, "Fleet Health" headers in
   AgentFleet UI. Calling the consensus mechanism *Fleet Consensus*
   makes it read as part of the Fleet's existing vocabulary, not as
   a separate sub-system.
2. **Descriptive-not-branded** lowers AP-9 future-collision risk vs
   any coined alternative.
3. **Already in the working vocabulary** — Mark and Ari have been
   using "the fleet's consensus" descriptively in dialog for
   sessions; the rename codifies what we already say.

---

## 3. Refactor scope (75 files, ~355 refs)

Split into **seven independent commits**, each with its own scope and
its own AP-9-style inscription (where applicable). Tests green between
every commit.

### Commit 1 — Backend services (≈30 files)
- `backend/services/consensus_service.py` — class `OpenClawService` →
  `FleetConsensusService`; module exports; `_RENAME_LEGACY_OPENCLAW =
  True` flag if any external caller still imports the old name.
- `backend/services/agent_service.py` — references inside
  agent decisions and bench-gate logging.
- `backend/services/cycle_service.py` — references in the round-
  trigger path.
- `backend/services/strategy_service.py` — references in promotion
  events.
- `backend/services/alert_service.py` — alert kinds
  (`OPENCLAW_*` → `FLEET_CONSENSUS_*`); migration shim required for
  in-flight alert buffer rows so frontend's existing AlertInbox does
  not 404 on legacy `kind` strings.
- Verify: `pytest backend/scripts/test_day8_invariants.py` 30/30 +
  any consensus tests pass.

### Commit 2 — Backend routers + models (≈10 files)
- `backend/routers/consensus.py` — endpoint paths
  (`/api/openclaw/*` → `/api/fleet-consensus/*`); **add legacy 308
  redirects** from old paths for any external dashboards still
  pointing at them (Railway-deployed frontend assumed coupled, but
  prudent to preserve).
- `backend/routers/bot.py` and `routers/fleet.py` — references in
  `/bot/status` and `/fleet/bots` payload keys (`openclaw_*` →
  `fleet_consensus_*`); **schema migration shim required** for
  `BotConfig` columns `openclaw_total_rounds` /
  `openclaw_approved_rounds` / `openclaw_rejected_rounds` —
  rename these columns inside a single Alembic-style migration.
- `backend/models/bot_config.py` — column renames + corresponding
  index/constraint renames.
- Verify: `/bot/status` and `/fleet/bots` round-trip clean against
  Railway production data; legacy column-read shim returns the new
  values without exception.

### Commit 3 — Frontend route + lead page (≈5 files)
- `pages/OpenClaw.tsx` → `pages/FleetConsensus.tsx`. **Move file,
  do not delete-and-create** so git follows the rename.
- `App.tsx` — route `/openclaw` → `/fleet-consensus`, plus add a
  `<Navigate from="/openclaw" to="/fleet-consensus" replace />`
  route entry to preserve any browser bookmarks.
- `Layout.tsx` — title map + sidebar entry.
- `Sidebar.tsx` — "OpenClaw BFT" → "Fleet Consensus".
- Verify: `tsc --noEmit` clean; `vite build` clean; manual
  `agent-browser` walk through `/openclaw` (should redirect) and
  `/fleet-consensus` (should land on renamed page).

### Commit 4 — Frontend components (≈10 files)
- `OpenClawSection` → `FleetConsensusSection`.
- `OpenClawBFTSection` → `FleetConsensusBFTSection`.
- `HowItAllConnects.tsx` references.
- Any imports of the old component names.
- Verify: tsc + vite clean; AgentFleet + IIAgent pages render the
  renamed sections without console errors.

### Commit 5 — Frontend type + API client refs (≈8 files)
- `types/index.ts` — `OpenClawRound` → `FleetConsensusRound`,
  payload field renames matched to Commit 2.
- `lib/api.ts` (or equivalent) — endpoint path updates.
- Component prop renames.
- Verify: tsc + vite clean.

### Commit 6 — Doc + STATE.md headings (≈5 files)
- `STATE.md` — section headings (NOT historical narrative — those
  are Bucket A under the same rule applied to TaoBot in archived
  session reports).
- `RAILWAY.md`, `RECOVERY.md`, `AGENT_RECOVERY.md` — operational
  references.
- `SUCCESSOR_BRIEF.md` — vocabulary section.
- **Bucket A preserved:** archived session reports
  (`Session_*.pdf`, `archives/*`, prior STATE entries from before
  this rename) keep "OpenClaw" verbatim — the historical record is
  what it was. Same rule that retained the TaoStat validator
  hotkey reference in SESSION_XI_ARCHIVE.
- Verify: grep for forward-looking `OpenClaw` returns zero hits;
  archived-context hits remain.

### Commit 7 — TaoBot Bucket C cleanup (≈8 files, paired refactor)
Folded into this rename per the Day 13 closure note in STATE row.
- `is_taobot_signal_candidate` → `is_signal_candidate` (drop the
  prefix entirely; the function lives in our codebase, prefix was
  redundant).
- `_taobot_subnets` → `_signal_candidate_subnets`.
- `taobot_label` → `signal_candidate_label`.
- `taobot_signal_candidates()` → `signal_candidates()`.
- Custom event handlers + `report/generate_*.py` PDF generators +
  `archives/generate_*.py` historical session generators.
- Verify: pytest clean; PDF/archive generators run end-to-end and
  produce identical output structure.

### What stays untouched (Bucket A — historical record)
- `taobot:sidebar:*` localStorage keys (would break every user's
  sidebar state silently; needs a migration shim, not a find/replace).
- All archived `Session_*.pdf` and prior PDF reports.
- All quoted historical narrative in STATE.md prior session sections.
- The Day-7 OTF-Signal-Bot transparency note in
  `docs/discord-onboarding/bittensor-server-onboarding.md`.
- `SESSION_XI_ARCHIVE.md` TaoStat hotkey `5E2LP6…Z5u`.

---

## 4. Pre-flight checks (run before Commit 1)

1. `git status` clean on `main`. No uncommitted Day 13 work.
2. Railway production healthy: `/api/bot/status` returns 200 with
   `is_running: true`. Don't start a multi-step refactor against a
   broken production target.
3. `python -m pytest backend/scripts/test_day8_invariants.py` 30/30.
4. `tsc --noEmit` clean.
5. `vite build` clean.
6. **Mark says go.** This refactor touches a live route + a live DB
   schema; do not start without explicit green light at session open.

## 5. Roll-back plan per commit

Every commit lands on a feature branch first
(`refactor/openclaw-to-fleet-consensus-cN`). Tests green → squash
into a single commit on `main` → Railway auto-deploys → smoke
verify → next commit. If any commit produces a Railway 5xx storm
or breaks the consensus round-trigger, revert that commit only and
escalate before continuing.

DB column rename (Commit 2) is the **only irreversible step** —
write the migration as a `BEGIN…COMMIT` transaction so a failed
deploy rolls back cleanly. Keep the old column names readable for
one deploy via a SQLAlchemy `column_property` alias so frontend
caches don't pull `null`.

---

## 6. Closing note

The first four candidates failed AP-9 (Conclave / Plenum / Praetor /
Witan, Day 13 evening). The next three failed harder (II Agent
Consensus, Intelligent Consensus). Fleet Consensus passes because
it's descriptive, not coined — and that lesson is the AP-9 update
that emerged from this round. Inscribe it once, refactor cleanly,
move on. Day 14 worksheet (`DAY14_WORKSHEET.md`) is the actual
trading-strategy work; this rename is the last brand-housekeeping
debt before that work goes live.

— Ari, Day 13 wrap-up, 2026-05-26 evening