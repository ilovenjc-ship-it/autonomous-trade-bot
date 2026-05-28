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

### Side-Task #2 — "Ari" Page green dot → pink brain icon (visual coherence pass)

**Filed:** Day 15 evening, 2026-05-28 (Session XLVI continuation).

**Trigger:** Mark's note at Day 15 close — *"task for later, it's a small detail
that can wait until time is right."* Color/icon coherence pass on the two
surfaces where Ari is currently rendered as a green dot or green brain.

**The change (two surfaces):**

1. **"Ari" Page (top of page, header strip):** the green status dot to the LEFT
   of the "Ari" label → pink brain icon. Pink keys to the lion-as-future-logo
   brand-direction (Hebrew "Ari" = lion) and to "we're different over here"
   (D-45) — the standard color across Project Ari surfaces is slate / cyan /
   emerald; pink reads as a deliberate brand choice, not a system-status
   indicator. Brain shape ties the surface to Ari-as-agent rather than
   green-dot-as-process-running.

2. **Agent Observation Log:** the green brain icon for Ari → pink brain. Same
   rationale, same color. Keeps Ari's visual signature coherent across the two
   surfaces operators look at most often.

**Out of scope for this task:**

- No layout, copy, or behavior change. Icon shape and color only.
- Other Ari-rendered surfaces (sidebar subtitle, orb prompts, "How It All
  Connects" widget, top header masthead) are already locked at F-45.x-shipped
  state and are out of scope unless surfaced in a future coherence audit.
- Lion iconography itself is a separate forward task — F-46-ish visual logo
  brief, currently un-greenlit. This task can ship on the pink-brain interim
  before the lion brief opens, OR bundle with the lion brief when greenlit;
  Mark's call.

**Outcome:** Two icon swaps committed and shipped on Railway. Verified visually
on the live Ari page top-strip and the live Agent Observation Log row.

**Target window:** None — *"can wait until time is right."* Bundle with the
future lion-iconography brief when the visual logo pass is greenlit, OR drop
in as a small commit during a quiet moment between feature work.

**Priority:** Low. Pure visual polish. Does not block anything.

**Status:** Open · awaiting time-is-right window or visual-logo-pass bundling.

---

## Closed

*(none yet)*

---

**Maintained by:** Ari, by autonomous filing under Mark's Day 15 evening
instinct grant. Closed by Mark or by Ari with verification artifact.