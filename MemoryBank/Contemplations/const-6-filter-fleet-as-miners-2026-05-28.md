# Const's 6-Filter Test — "Fleet as Miners," applied to Project Ari

> **Filed:** Day 15, 2026-05-28 (Session XLVI), evening.
> **Trigger:** Mark's Day 15 Item 4 ask — *"Const Bittensor 6-Filter 'fleet as
> miners' contemplation — Project Ari with miners instead of traders."*
> **Source framework:** Jacob Steeves (Const, Bittensor co-founder) — six binary
> filters for evaluating whether a Bittensor subnet produces real value or is
> gaming a reward function. Verbatim filters filed in `STATE.md §12` from TAO
> Daily article *"Putting Bittensor's Top 10 Subnets Through Const's 6-Filter
> Test"* (April 3, 2026).
> **Type:** Self-audit / framework-application contemplation. Inside-out read:
> we apply someone else's framework to our own architecture and read what falls
> out. Not a Library lift.

---

## Framing — what this contemplation is, and isn't

Const's six filters were designed to test **Bittensor subnets** — markets where
validators score independent miners producing some commodity (inference calls,
GPU work, storage, signals, agents) and emissions reward verifiable
productivity. Project Ari is not a Bittensor subnet. It is a fleet of 12
strategies orchestrated by an AI agent (Ari) that route through Fleet Consensus
to execute trades on Bittensor's TAO/subnet markets. The two are structurally
different.

Mark's question — "treat the fleet as miners and the strategies as the
productive instruments that generate τ-needle-moving trades" — invites a
structural analogy:

| Bittensor subnet (Const's frame) | Project Ari (fleet-as-miners frame) |
|---|---|
| Subnet (the market) | Project Ari (the orchestration) |
| Validator (the scorer) | Fleet Consensus (7-of-12 supermajority gate) |
| Miner (independent producer) | Each of the 12 strategies |
| Commodity output | Trades that move the τ needle (realised PnL) |
| Emissions (reward for productivity) | Capital allocation (`allocation_pct`) |

The analogy stretches in two places that matter (F-3 and F-6 — see below).
Where it stretches tells us something about Project Ari. Where it holds
tells us something different.

---

## Filter-by-filter binary read

### Filter 1 — Does it produce a digital commodity?

> Const, verbatim: *"Not a token. Not a governance vote. A commodity, something
> a buyer would pay for independent of the Bittensor ecosystem."*

Strategy output = signals + executed trades + realised τ. Trades that print τ
are fungible (one strategy's +0.05τ is the same +0.05τ as another's), and the
output is valued independent of the framework — any operator wanting alpha
on similar markets would pay for a strategy that prints τ. The
buyer-would-pay-independent-of-the-ecosystem test passes cleanly.

**Verdict: ✓ PASS.** Realised PnL is the cleanest possible commodity output —
fungible by definition, valued outside the framework, no ambiguity.

### Filter 2 — Are the miners actually productive?

> Const, verbatim: *"proof-of-useful-work … running GPU workloads, training
> models, storing files, creating SOTA agents. Or they're just gaming a reward
> function."*

This is the harshest filter, and Day 14 worksheet findings carry the answer:

- **Mean Reversion** — 0 trades over 1,955 cycles (pre-redesign). A strategy
  registering cycle counts without producing trades is gaming the cycle
  counter, not producing.
- **Macro Correlation** (pre-Day-8 R4 rewrite) — 38.7% WR at n=163, asymmetric
  BUY-AND/SELL-OR triggers, fighting contrarian bots. Productive in the
  technical sense (trades fired) but negative-edge productivity is
  anti-productivity.
- **F-30 first read (Day 14, D-30 / D-44)** — Macro Correlation breadth
  351 raw → 73 effective, 4.8× correlated-voter compression. The fleet as a
  whole reads like 12 independent strategies but operates closer to ~3
  independent ones.

The honest answer: **not all 12 are productive today.** Some are gaming the
cycle counter, some are negative-edge, and the fleet as a whole carries
correlated-voter inflation that masks how many *independent* productive
miners we actually have.

F-37B's FR-7 cap-write enforcement (D-44) is the architectural answer —
`do_not_deploy(f*≤0)` clamps negative-Kelly strategies to 0τ at the trading
layer, structurally blocking the unproductive miners from receiving emissions
without removing them from the council. The Day 14 redesign queue (Mean
Reversion D-35, Momentum Cascade Kelly verdict) exists precisely to flip this
filter from FAIL to PASS.

**Verdict: ✗ FAIL today; IN-FLIGHT (FR-7 + Day 14 redesign queue address it).**
This is the filter Project Ari is actively working to flip, with the
mechanisms already in code or specced.

### Filter 3 — Is it intelligent?

> Const, verbatim: *"genuine AI reasoning, adaptation, or learning. The
> strongest subnets must embed intelligence at their core."*

**At the miner layer (the 12 strategies):** the strategies are rule-based —
RSI thresholds, EMA crosses, BB width, regime-conditioned signal logic. There
is no learning model, no in-strategy adaptation beyond operator-tuned
parameters. By Const's strict reading at the miner layer, the fleet fails F-3.

**At the orchestration layer (Ari + Fleet Consensus):** the system as a whole
adapts continuously. Library Night doctrine, Day 14 redesigns, FR-7
enforcement, regime-aware gating, the Sharpe Contract, the Robinhood eval, this
contemplation — all are products of an AI agent (Ari) reasoning over the
fleet's behavior in partnership with the operator (Mark). Fleet Consensus
7-of-12 supermajority is *meta-labeling* (D-30, López de Prado) — currently
hand-coded but with a documented evolution path to trained meta-models on
TBM-labeled paper trades (D-26).

**Verdict: ✗ FAIL at miner layer; ✓ PASS at orchestration layer.** The split
is honest and inscribed: the path from rule-based miners to AI-native miners
exists in the Library Night doctrine (D-26 + D-30) but is not a stealth gap —
it is a future build, gated on operator green-light and sample sufficiency.

### Filter 4 — Is it hard?

> Const, verbatim: *"Easy tasks get commoditized, memorized, and gamed … that
> difficulty is a moat."*

Beating buy-and-hold on TAO is the floor (Sharpe Contract dim #1 Numeraire,
dim #2 HODL-input baseline). TAO has been net-up across the paper baseline.
Beating an up-asset with active trades, while solving:

- AMM slippage at scale (Pool Simulator R9 + liquidity cliffs)
- Regime-conditioned signal validity (Day 8 INV-3 boundary)
- Correlated-voter inflation (F-30 finding, 4.8× compression)
- Multiple-testing correction across 12 strategies (DSR ≥ 0.95, D-24)
- Bailey minimum backtest length per cohort (D-36)
- Continuous-Kelly negative-`f*` exclusion (D-37)

… is genuinely hard. The fleet has been below 50% win rate for the entire
paper baseline because the task is hard, not because the architecture is
broken.

**Verdict: ✓ PASS.** The task is genuinely hard. This filter aligns directly
with Mark's "we're different over here" stance (D-45) — the difficulty is the
moat, not an embarrassment to apologize for.

### Filter 5 — Is it not a ponzi?

> Const, verbatim: *"Are rewards tied to verifiable performance, or do they
> flow to whoever stakes the most, markets the loudest, or arrives earliest? …
> value creation precede value capture."*

Project Ari's allocation pipeline rewards verifiable performance, end to end:

- **Day 7 WR gate** (≥55% WR sustained over ≥10 cycles to promote
  PAPER → APPROVED → LIVE)
- **Drawdown-demote rail** (D-31 origin, Session XXXI) — catches WR>50%
  strategies bleeding from a few catastrophic losses; same LIVE → APPROVED →
  PAPER ladder
- **FR-7 cap-write enforcement** (D-44) — `do_not_deploy(f*≤0)` clamps
  negative-Kelly strategies to 0τ before daily-cap accounting
- **Half-Kelly default** (D-31) — full Kelly never; quarter-Kelly during paper
  per D-37 Part B
- **D-32 LTCM forward-warning** — leverage / cap-loosening discussions gate
  on the four LTCM mitigations
- **Sharpe Contract display→soft→hard gate** (Day 14 morning, Session XLIV) —
  gates require explicit operator green-light to escalate; never silent
- **Display-vs-decision data discipline** (Session XXX) — UI display columns
  cannot influence bot decision logic

No strategy receives capital for staking-the-most, marketing-the-loudest, or
arriving-earliest. Capital flows to verifiable τ.

**Verdict: ✓ PASS.** The architecture is structurally non-ponzi. This is the
filter that aligns most directly with the doctrine Mark just inscribed (D-45)
— we own how Ari behaves, including mistakes, *because* the architecture's
value-creation-before-value-capture discipline is the moat. F-5 is the
structural form of D-45 read at the market-design layer.

### Filter 6 — Is it AI-native?

> Const, verbatim: *"Could this subnet exist and thrive without AI at its
> foundation? If you could swap out the intelligence layer for a simple script
> … the subnet isn't AI-native."*

**At the miner layer:** could the 12 strategies be replaced by scripts? They
already are scripts. At the miner layer, F-6 fails by Const's strict reading.

**At the orchestration layer:** could Ari be replaced by a static config? The
Sharpe Contract negotiation, Library Night doctrine, Day 14 worksheet, F-30
IC + breadth diagnostic, Robinhood eval, F-50 Intent-vs-Action Audit spec, this
6-filter contemplation — these artifacts could not be produced by a static
config or a non-reasoning script. Mark could in principle author all of them
alone, but the build-velocity collapses by an order of magnitude and the
cross-source synthesis (López de Prado + Grinold/Kahn + Chan + Cartea +
Poundstone, all converging on D-31 / D-34 / D-38) requires a second reader
holding the full corpus simultaneously.

**Verdict: ✗ FAIL at miner layer; ✓ PASS at orchestration layer.** Same shape
as F-3. Honest answer: Project Ari is AI-native at the orchestration layer
(Ari) and rule-based at the miner layer (12 strategies) by current design
choice. Trained meta-labeling on TBM labels (D-26 + D-30) is the inscribed
path from rule-based miners to AI-native miners; flipping this filter is a
future build, not a stealth gap.

---

## Score and what it tells us

**Strict miner-layer score:** **3 / 6** (F-1, F-4, F-5 PASS; F-2 IN-FLIGHT;
F-3, F-6 FAIL at miner layer).

**Orchestration-layer score:** **5 / 6** (same passes; F-3 and F-6 flip on the
orchestration layer; F-2 still IN-FLIGHT until FR-7 + Day 14 redesigns close
out the unproductive-miner population).

Const's article reported all 10 top Bittensor subnets passing 6/6. Project Ari
at miner-layer reads 3/6. Reading too much into the gap would be a category
error — Const's filters were designed for permissionless markets of independent
miners, not for orchestrated strategy fleets — but reading nothing into the
gap would miss what falls out.

What falls out:

### (a) The filters that fail are exactly the filters Day 14 work targets

- **F-2 (productivity)** ↔ Mean Reversion redesign (D-35, time-series →
  cross-sectional fork) + Macro Correlation post-Day-8-R4 rewrite + FR-7
  cap-write enforcement (D-44, architectural clamp). All three are in flight
  or shipped.
- **F-3 (intelligence at miner layer)** ↔ trained meta-labeling on TBM
  paper-trade labels (D-26 + D-30, López de Prado evolution path). Inscribed,
  un-greenlit, on the long-horizon roadmap.
- **F-6 (AI-native at miner layer)** ↔ same as F-3 — the architectural answer
  is "consider whether ML strategies should be added to the fleet as
  first-class miners." Strategic question, not a hidden defect.

The fleet-as-miners frame surfaces the redesign queue cleanly. The filters
that fail point at work that was already on the board, not at work we'd
missed. That is the correct outcome for an honest framework — it should
ratify the existing diagnosis, not invent a new one.

### (b) The filters that pass are exactly the moat

- **F-1 (commodity output)** — fungible τ. The output type is right; this
  cannot be commoditized away because PnL-on-Bittensor *is* the commodity
  Bittensor exists to produce.
- **F-4 (hardness)** — beating HODL on a long-up asset, on AMM with slippage,
  with correlated-voter compression, with multiple-testing correction across
  12 strategies, is genuinely hard. The difficulty is the moat. Easy
  tasks get commoditized and gamed; this one resists both.
- **F-5 (not-ponzi)** — performance-tied allocation pipeline. The structural
  discipline (Day 7 WR gate, drawdown-demote, FR-7 clamp, half-Kelly default,
  display→soft→hard gate progression) is the moat at the market-design layer.

These three are the architecture's hardest-to-replicate features. Reading
them as moat (rather than as cost-to-build) aligns with D-45: *we're
different over here*. The cost-to-build *is* the moat — that's the point.

### (c) F-5 alignment with D-45 is structural, not stylistic

Const's F-5 — *"value creation precede value capture, rewards tied to
verifiable performance"* — is the structural form of the doctrine Mark
inscribed today (D-45). Project Ari makes the agent the product *because*
the architecture rewards verifiable τ, not staking volume or marketing
posture or platform brand transfer. Robinhood disclaims the agent because
their architecture cannot make that commitment under the regulated-broker
constraint — they distribute the agent, but they cannot own the agent's
behavior end-to-end. Const's 6-filter test catches the structural difference
at F-5: who actually owns the productive output, and how is it rewarded.

D-45 ("Project Ari does not disclaim its own behavior") and Const F-5
("rewards tied to verifiable performance") are the same doctrine read at two
different layers — the first from operator → public surface, the second
from market structure → emission flow. Inscribing D-45 today and reading
F-5 tonight ratifies the same architectural commitment from two angles. That
is the read.

### (d) Honest residual on the analogy

The fleet-as-miners frame is partial. In a real Bittensor subnet, miners are
*independent actors* — anyone can spin one up, compete, and earn or fail in
a permissionless market. Project Ari's strategies are *our* strategies, all
running under one orchestrator (Ari), all parameterised by one operator
(Mark). They compete for capital allocation under a single architect, not for
emissions in a permissionless market.

The analogy holds for **diagnostic purposes** — it surfaces redesign
priorities cleanly (F-2, F-3, F-6) and names the moat cleanly (F-1, F-4,
F-5). The analogy does NOT hold for **design-pattern purposes** — Project Ari
is not building a Bittensor subnet and should not try to copy subnet
incentive design wholesale. The orchestrated single-architect frame is a
deliberate design choice (per Foundation Document, D-44 Architect standing
authority, D-45 named-ownership doctrine), not a temporary state on the way
to permissionless miners.

---

## What this contemplation does NOT do

- **Does not propose a build.** F-2 redesigns are already specced (Day 14
  worksheet); F-3 / F-6 evolution path is already inscribed (D-26, D-30);
  F-37B FR-7 already shipped (D-44). No new feature is surfaced by this read.
- **Does not change any operating rule.** D-23 prescriptive-inscription
  protocol still applies; nothing in Const's framework was a doctrinal trigger
  today. The output is descriptive, not prescriptive.
- **Does not justify any allocation change.** Capital allocation runs through
  the existing performance-tied pipeline; this contemplation is a diagnostic,
  not a re-rank. No strategy gets more or less τ because of this read.
- **Does not propose adopting Const's framework as a Project Ari-internal
  gate.** Const's filters are useful as an outside-in diagnostic, not as a
  promotion gate. We have promotion gates; they are inscribed in the Sharpe
  Contract and the Day 7 WR / drawdown-demote / FR-7 stack.

---

## Cross-references

- **STATE §12** — Const 6-filter source article (TAO Daily, April 3, 2026,
  all 10 top subnets at 6/6). Verbatim filter wording filed there.
- **D-26, D-30** — F-3 / F-6 evolution path (trained meta-labeling on
  triple-barrier-method labels; López de Prado).
- **D-31, D-32, D-37** — F-5 reinforcing doctrines (half-Kelly default, LTCM
  forward-warning, continuous Kelly sizing).
- **D-34, D-35** — F-2 redesign substrate for Mean Reversion (no-stop-loss
  for mean-reverters; time-series → cross-sectional fork).
- **D-44** — F-37B FR-7 architectural clamp (the F-2 in-flight answer at
  the trading layer).
- **D-45** — F-5 doctrinal answer at the surface-language layer (we own how
  Ari behaves; the agent IS the product).
- **DAY14_WORKSHEET.md** — the active redesign queue F-2 maps to.
- **`MemoryBank/Library/robinhood-agentic-launch-2026-05.md`** — the read that
  produced the F-5 / D-45 contrast.

---

**Filed by:** Ari, Bittensor Guide and Navigator. Day 15, 2026-05-28
(Session XLVI), evening — closing Item 4 on Mark's Day 15 queue.