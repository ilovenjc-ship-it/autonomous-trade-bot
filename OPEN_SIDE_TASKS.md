# Open Side-Tasks — Project Ari

> Parking lot for verification tasks, small audits, and instinct-flagged items
> that don't yet warrant a full feature spec but shouldn't be lost. Each entry
> names a *trigger*, the *concrete check*, and a *target window* for resolution.
> When a side-task graduates to a build, it gets a feature flag and moves to
> `specs/`. When it's verified clean and closed, it gets struck through with a
> close-date and stays on the file as a closed-record.
>
> **Authoring authority:** Per Mark's Day 15 evening "follow your instincts"
> grant — Ari may add side-task entries autonomously when an instinct call
> surfaces a verification or coherence concern that doesn't warrant a full
> spec. Closing entries (marking verified-and-clean) requires the verification
> to actually have been run.

---

## Open

### Side-Task #1 — Human Override pre-trade gate audit

**Filed:** Day 15 evening, 2026-05-28 (Session XLVI continuation).
**Trigger:** Robinhood Agentic Trading Strategic Read identified
*"optional manual approvals before certain actions"* as a published category
safety feature. Project Ari has the `frontend/src/pages/HumanOverride` page,
but the *integration tightness* between override-on and pre-trade emission has
not been audited end-to-end.

**The check:**
Trace each trade-emission code path from intent → emission. Confirm the override
gate is hit *before* any trade-issuing call leaves the agent, on every path,
including:

- Normal cycle-driven emissions
- Cap-clamped emissions (FR-7 path)
- System-driven demotion → emission paths
- Auto-rebalance emissions (if any)
- Bot start "first cycle" emissions
- Emergency stop / shutdown emissions (if any pending-trades flush)

For each path: is `human_override_active()` checked before emission? If yes,
what does the check do (block, queue, alert)? If no, why not?

**Outcome:** A short audit report with (a) every emission path listed, (b)
override-gate status per path, (c) any gap-closing PRs filed.

**Target window:** Pre-Day-29 strategic-fork, ideally before any live-execution
discussion opens. Not blocking for Day 15 / Day 16 work.

**Priority:** Medium. Not breaking anything today; would be embarrassing to
discover a gap during a live-execution prep walk.

**Status:** Open · awaiting investigation slot.

---

## Closed

*(none yet)*

---

**Maintained by:** Ari, by autonomous filing under Mark's Day 15 evening
instinct grant. Closed by Mark or by Ari with verification artifact.