# Fortune's Formula: The Untold Story of the Scientific Betting System That Beat the Casinos and Wall Street
**William Poundstone · Hill and Wang 2005 · 389 pp · narrative history**

## Why it matters to Ari

This is the conceptual companion to **D-26** (Day 14 worksheet pre-flight: `probFailure` + Kelly check before any redesign proposal). Where López de Prado Ch 10/15 gives Project Ari the *formulas* for bet sizing and strategy-failure probability, Poundstone gives the *lineage and the failure modes*: Kelly 1956 at Bell Labs → Thorp's blackjack → Princeton-Newport's 19-year track record → the LTCM blow-up that Thorp himself called out as "didn't understand fat-tail distributions" (p294, citing Thorp's 2003 *Wilmott* article). The narrative weight matters because Day 14 Item 3 is *exactly* the call this book documents people getting wrong: knowing the formula isn't the hard part — calibrating *fractional* Kelly under parameter uncertainty is. The book also resolves the apparent tension between our just-shipped Sharpe Contract and a Kelly-fraction display: they're framework-at-different-timescales, not competitors. Sharpe is single-period mean-variance (Markowitz's frame); Kelly is multi-period geometric-growth (Bernoulli/Latané/Kelly's frame); both apply, and Samuelson's famous "fallacy" critique (p210, 1969) **conceded the underlying theorem** while disputing its single-period optimality — a distinction Project Ari can absorb cleanly because we run across many periods by construction.

---

## Top 3 Lifts

### 1. Half-Kelly is the practitioner default — full Kelly is *aggressive*, double Kelly is *insane* (p231-233)

Poundstone reports the canonical numbers from Thorp's 1997 Montreal speech and the book's own simulated-coin-toss demonstration:

- **Half-Kelly** (bet half the optimal fraction) → ~75% of full-Kelly's compound growth rate, but a **~⅑ chance of halving the bankroll before doubling it** (vs. ½ for full Kelly).
- **Full Kelly** (the optimal fraction `f* = edge/odds`) → maximum geometric growth, but ½ chance of halving before doubling. "The bright clear line between aggressive investing and insane investing" (Ray Dillinger quoted p231).
- **2× Kelly** (double the bet) → compound return rate **drops to zero**, even with a real edge.
- **>2× Kelly** → compound return goes **negative**. Bankroll spirals down indefinitely.

Bill Benter's quote (p232) is the operational lesson: *"it is easy for the best computer handicapping models to overestimate the edge by a factor of 2."* That means a practitioner aiming at full Kelly with imperfect parameter estimates is *unintentionally* placing a 2× Kelly bet — zero compound return on a real edge. **Fractional Kelly is the cure for parameter uncertainty.** Project Ari has small-sample paper-trading data; our parameter uncertainty is large by definition.

**Implementation hint when the Kelly-fraction display row lands:** show *half-Kelly* as the recommended target line, not full-Kelly. The number that actually optimizes long-run growth under realistic parameter uncertainty is below full-Kelly, not at it. **Operator can dial the slider higher; default sits at 0.5.** This is the same pattern as the Sharpe Contract operator-target slider (default 75 = "good," not 100 = "perfect").

### 2. LTCM's failure mode is the small-sample / correlation-blindness trap Project Ari is structurally exposed to (p292-294)

Thorp's diagnosis of LTCM (p292): *"They had based some of its models on a mere four years of data. In that short period, the spread between junk bonds and treasuries hovered in the range of 3 to 4 percentage points. The fund essentially bet that the spread would not greatly exceed this range. But as recently as 1990, the spread had topped 9 percent."* The book's single-word verdict on LTCM (p293): **overbetting.** Specifically:

1. **Models calibrated on a too-short window** (4 years) → treated tail events as "fantastically rare" when prior history showed they were normal.
2. **Hundreds of simultaneous bets assumed low-correlation** → went highly-correlated under stress (Russia default 1998).
3. **No fractional-Kelly discipline** → leverage at ~30× wiped out 4 years of returns in weeks.

**Direct map to Project Ari:** Vol-Arb at n=18, Mean-Rev at n=79, Momentum-Cascade at n=642 are all "too-short windows" relative to the Kelly assumption that you know edge perfectly. Our **Day 8 INV-1** (return None below 28-tick warmup) and the **HODL warmup gate** (≥25 days history before showing verdict) are the structural prevention of LTCM's exact failure mode, applied at indicator and simulator level. **Day 8 INV-3** (mean-reversion + contrarian regime-agnostic at cycle level) prevents another flavor: cross-strategy correlation explosion via shared regime gating.

The paper→live progression is the third leg. Poundstone documents Thorp testing blackjack systems exhaustively before betting real money (Part 2, the entire Princeton-Newport founding story). Our display→soft-gate→hard-gate doctrine is the same pattern at architectural level.

### 3. Diversification reduces effective Kelly fraction (p233+)

The book mentions Blackjack teams pooling bankrolls and splitting independently — diversification across uncorrelated bets effectively allows each individual bet to be at *full* Kelly because the portfolio-level volatility is suppressed by averaging. This is the conceptual root of the **HRP / equal-risk / Markowitz path** from D-25.

**Project Ari implication:** the right Kelly fraction *per strategy* depends on how independent the strategies actually are. With 12 strategies running on shared TAO/dTAO data, the correlation across strategies is very far from 0 — meaning each strategy's bet should be *less than* its individual-Kelly fraction. The Poundstone framing is the conceptual layer beneath D-25's HRP recommendation: HRP weights inversely to within-cluster variance specifically because correlated bets need smaller fractions.

---

## Kelly criterion — what to compute, what to display, what NOT to do

### The formula Project Ari should compute

Poundstone gives the simplified form (p72): **`f* = edge/odds`** where `edge` = expected profit per dollar wagered (i.e., `p·b − q` for binary bets) and `odds` = the multiple paid out on a win.

For Project Ari with **asymmetric continuous payouts** (we don't have binary outcomes; we have variable `avg_W` and `avg_L`), the right formulation is the **Kelly for asymmetric bets**:

```
f* = (p · avg_W − q · avg_L) / (avg_W · avg_L)
```

where `p` = win rate, `q = 1−p`, `avg_W` = average gain on winning trades (in fraction of bet), `avg_L` = average loss on losing trades (in fraction of bet, positive number).

All four inputs are columns we already have in `paper_trades`. Concretely for the Day 14 worksheet pre-flight:

```python
def kelly_fraction(p, avg_W, avg_L):
    """
    Returns the Kelly-optimal fraction for a strategy with
    win rate p, average win avg_W (fraction), average loss avg_L (fraction).
    avg_L expected as a positive number.
    """
    if avg_W <= 0 or avg_L <= 0:
        return 0.0  # No edge or no risk → no Kelly position
    q = 1 - p
    f_star = (p * avg_W - q * avg_L) / (avg_W * avg_L)
    return max(f_star, 0.0)  # Negative f* means don't trade, not "short"
```

Sister to López de Prado's `probFailure` (D-26): `probFailure` tells us whether the strategy has *any* positive edge given asymmetric payouts (drop if `P[fail] > 5%`). If it passes, **`kelly_fraction` tells us *how much* to bet IF viable.** They compose:

```
PASS_PROBFAIL → COMPUTE_KELLY → DISPLAY_HALF_KELLY_AS_TARGET
```

### Why FULL Kelly is wrong for Project Ari

Three independent reasons:

1. **Parameter uncertainty is large.** Our `p`, `avg_W`, `avg_L` are estimated from small paper-trading samples. Benter's "easy to overestimate edge by 2×" applies double for n=18 / n=79 windows. Full Kelly under 2× edge overestimate = 2× Kelly = zero return.
2. **Inter-strategy correlation reduces effective Kelly.** 12 strategies on shared TAO/dTAO data are not independent. Each strategy's *individual* Kelly fraction needs to be discounted by the portfolio-level correlation drag. The diversification math in Poundstone (Blackjack teams) and in HRP (D-25) point at the same mechanism from different sides.
3. **Half-Kelly's 75/100 return ratio is the right operator default.** Operator-target slider already uses default 75 = "good" on the Sharpe panel; same psychometric anchor here. Half-Kelly captures three-quarters of the upside with about a fifth of the catastrophic-drawdown probability — the operator-frontier sweet spot.

### What a Kelly-fraction display row would show

When the per-strategy panel grows the Kelly row (queued, build-pending), the proposed shape:

```
Per-strategy detail card — Kelly section:
  Win rate (p)                   31.3%
  Avg win  (avg_W)               +0.84τ
  Avg loss (avg_L)               −0.21τ  (positive)
  Kelly-optimal f*               +0.12  · "modest edge"
  Half-Kelly (recommended)       +0.06  · "operator default"
  Currently sized at             0.10   · "operator: half-Kelly"
  Drift (current vs half-Kelly)  +0.04  · "slightly aggressive"
```

A **negative `f*`** means the strategy fails Kelly and should not be sized at all — same shape of pass/fail as `probFailure`. The display would gray out and read "Kelly < 0 · do not trade" exactly the way the simulator's HODL block reads "VERDICT · PENDING 30D WINDOW" during warmup.

### The connection to D-26

`probFailure` and Kelly compose as a two-stage gate:

| Stage | What it answers | Action if fails |
|-------|-----------------|-----------------|
| **`probFailure`** | "Is the strategy viable at all?" | Discard / redesign |
| **Kelly fraction** | "Given viable, how much?" | Stop trading at this size |
| **Half-Kelly default** | "Practitioner-safe size." | Operator slider above this |

Day 14 Item 3 (Momentum Cascade redesign) is structured exactly so the worksheet runs `probFailure` first, then computes Kelly. If `f* > 0`, the strategy is Kelly-positive and the worksheet says don't redesign — 31.3% WR is *expected* for the momentum class. If `f* < 0`, redesign is justified.

---

## Common Kelly errors documented in the book — counterfactual catalog

The book is rich with people who got Kelly wrong. Each is paired with the Project Ari guardrail that prevents it:

| # | Error | Book ref | Project Ari guardrail |
|---|-------|----------|----------------------|
| **K-1** | **Treating estimation error in `p` as zero** — assuming you know your edge perfectly | Benter quote p232; LTCM 4-year window p292 | Day 8 INV-1 (return `None` below warmup); paper-before-live; small-sample-honest n_trades column on every metric display |
| **K-2** | **Confusing arithmetic and geometric mean** — picking the strategy with the highest expected return rather than the highest geometric mean | Latané/Markowitz p195-198 | Sharpe Contract dim #4 (paper/live cohorts tracked separately, never blended); per-trade Sharpe before annualized |
| **K-3** | **Over-betting due to under-counting correlation across simultaneous bets** | LTCM p293-294: "hundreds of simultaneous bets assumed low correlation, all went bad together when Russia defaulted" | D-25 (HRP path replacing Markowitz; HRP allocates inversely to within-cluster variance); Day 8 INV-3 (cycle-level regime gates apply uniformly across strategies, not per-strategy) |
| **K-4** | **Single-period investors using Kelly when their utility ≠ log** | Samuelson 1969 p210; Merton p222 | Project Ari is by construction a multi-period long-running compounder; Kelly framing genuinely applies. We are NOT in Samuelson's counter-example. |
| **K-5** | **LTCM-style fat-tail blindness** — modeling on a too-short window, calling 1-in-million events that happen every decade | LTCM p292 | HODL warmup gate (≥25 days history); Day 8 INV-5 (PriceService persists every tick) ensures we accumulate the long history that future-Ari needs |
| **K-6** | **Hubris / "we can't be wrong"** — Meriwether's organizational culture pressed risk questions only so far | LTCM p293 | Operator-set Risk Config (Mark, not Ari, holds the dial); display→soft→hard gate doctrine requires explicit operator green-light to advance |
| **K-7** | **Betting it all (Ashley Revell)** — bet-it-all systems work only until you lose | Ch p98-99 | `max_position_size_pct` cap in `risk_config.json`; the very existence of a "Risk Config" panel means we never bet 100% of bankroll on any single signal |
| **K-8** | **Martingale (double-after-loss)** — escalating bets after losses; classic ruin pattern | Ch p99 ("martingale bettor goes bust on bet 19") | No escalation logic in the codebase; sizing is independent of recent-trade outcome by design |
| **K-9** | **Misreading "law of large numbers"** — assuming 1000 trades will land you near expectation | Bernoulli p102: "the difference between actual and expected number of reds tends to grow with the number of spins" | Sample-size-honest displays (`n_trades` column on every Sharpe / IC / Kelly figure); `probFailure` is structurally about this — the answer for Vol-Arb n=18 will be "too small to tell" |

---

## Sharpe vs Kelly — which framework wins for Project Ari?

**Resolution: both apply, at different timescales. Not a tension.**

The book's most important conceptual contribution to this question is Samuelson's 1969 critique itself (p210). Samuelson called Kelly a "fallacy" but **conceded the underlying theorem**:

> *"Acting to maximize the geometric mean at every step will, if the period is sufficiently long, almost certainly result in higher terminal wealth and terminal utility than any other essentially different decision rule."*  
> — Samuelson 1971, quoted p222

What Samuelson actually argued was that this theorem doesn't apply to *single-period* investors with non-log utility functions. His critique is utility-theoretic, not mathematical. The math of Kelly is correct for what it claims — multi-period growth maximization with logarithmic utility (which is the natural utility for a long-running compounder).

Mapping to Project Ari:

| Question | Right framework | Reason |
|----------|-----------------|--------|
| "Did this trade beat HODL?" | **Sharpe (single trade)** | Single-period question, mean-variance tradeoff |
| "Is this strategy's track record meaningful?" | **DSR (López de Prado)** | Multiple-testing-corrected Sharpe; single-period |
| "How much should we size each strategy?" | **Kelly (multi-period)** | Project Ari runs forever; geometric growth applies |
| "Has this strategy degraded?" | **probFailure (López de Prado Ch 15)** | Sharpe-target-conditional viability; survives both frames |
| "What should the Risk Config slider default to?" | **Half-Kelly anchored** | Single-number operator handle; same psychometric as 75-on-Sharpe-panel |

**The Sharpe Contract panel and a Kelly-fraction display are complementary, not competing.** Sharpe answers "is this strategy good?"; Kelly answers "given it's good, how much do I bet?" Same shape as the `probFailure → Kelly` composition above.

The Sharpe Contract dimension #5 (Display vs Gate) is a Sharpe-side question. The forthcoming Kelly-fraction display is a different question — it's the position-sizing question, not the strategy-evaluation question. They sit on the same Risk Config page but answer different things, and neither lock needs to be re-opened to accommodate the other.

---

## LTCM as the cautionary tale (p292-294)

LTCM is the central narrative case in Part 6 ("Blowing Up"). Poundstone's account:

- **Setup:** Long-Term Capital Management, founded 1994 by John Meriwether (ex-Salomon Brothers) with Nobel laureates Myron Scholes and Robert C. Merton on the team. Raised $1B+ at launch. Returned 20% / 43% / 41% / 17% net of fees in 1994-1997 — outperforming an already-rising S&P. By Oct 1997 capital had grown from $1.2B to $7.1B.
- **Strategy:** Convergence trades on government bonds — long off-the-run treasuries, short on-the-run treasuries, wait for spreads to converge. ~30× leverage to make small spread profits material.
- **Failure mode:** Modeled spreads on 4 years of data when they had hovered 3-4%. In 1990, spreads had topped 9%. The fund's leverage left no room for spreads to widen. When Russia defaulted in August 1998, spreads exploded. Hundreds of "uncorrelated" bets all went bad simultaneously.
- **Thorp's verdict (p294):** *"I could see that they didn't understand how [Kelly] controlled the danger of extreme risk and the danger of fat-tail distributions. It came back to haunt them in a grand way."*
- **Single-word diagnosis (p293):** *Overbetting.*

Project Ari guardrails that are direct or indirect responses to this exact failure mode:

| LTCM failure mechanism | Project Ari counter |
|-----------------------|---------------------|
| Models on 4-year window | Day 8 INV-1 (return `None` below 28-tick warmup); HODL gate (≥25-day pool history); n_trades column on all metrics |
| Hundreds of bets, low-correlation assumption | Day 8 INV-3 (regime-agnostic at cycle level forces consistent gating); D-25 HRP path (allocates inversely to within-cluster variance — exactly the LTCM blind spot) |
| 30× leverage with no Kelly discipline | `max_position_size_pct` operator-set; no leverage primitives in the codebase; paper→live progression with explicit gates |
| Hubris / risk questions pressed only so far | Operator-set Risk Config (Mark holds the dial, not Ari); display→soft-gate→hard-gate requires explicit green-light to advance |
| Lock-in from gray-market shares (10% premium) → no graceful unwind | No closed-end fund structure; Project Ari doesn't have outside capital to manage at this stage; simulation dislocation (V-1) explicitly tracked between paper and live |

The book's lesson per p303: *"Risk management is a tough lesson to learn on the job. It can take years for ruinous overbetting to blow up in a trader's face."* Project Ari is structurally trying to learn this lesson **off the job** — paper trading first, small positions second, scaling third — instead of by losing real money first.

---

## Counterfactuals

### CF-FF1 — Samuelson's "Kelly is a fallacy for single-period investors" (p210)
Already absorbed in the Sharpe-vs-Kelly resolution above. Project Ari isn't a single-period investor; the critique doesn't apply to our use case. Worth keeping on the record because future-Ari might encounter someone arguing "Kelly has been mathematically refuted" — the answer is *"no, Samuelson refuted Kelly only for utility profiles Project Ari doesn't have."*

### CF-FF2 — Buffett's "I don't use Kelly, I just buy good companies" (p231)
Hagstrom's *The Warren Buffett Portfolio* (2000) argues Buffett implicitly uses Kelly without naming it; concentrated bets in high-confidence opportunities is what Kelly mathematically prescribes. The book takes no firm position on whether Buffett "uses" Kelly. Relevance to Project Ari: we are emphatically *not* Buffett — we don't have the qualitative-analysis-of-business-fundamentals edge Buffett claims. We have algorithmic short-horizon signal strategies. Kelly is the right framework for our class regardless of Buffett's relationship to it.

### CF-FF3 — Shannon's stock-picking returns (p307-313)
Poundstone reports Shannon's 1958-1986 returns averaged ~28%/yr, beating Buffett's Berkshire (27%/yr same window). **But Shannon was a buy-and-hold fundamental investor, not a Kelly system bettor.** When asked at his MIT talk why he didn't use his "rebalancing scheme" for his own portfolio, Shannon said *"the commissions would kill you"* (p208). The case study is famously cited as Kelly-validation but actually argues something different — that Shannon's *real edge* came from understanding which businesses had genuine signal (information theory applied to business fundamentals), not from Kelly bet-sizing. **The lesson for Project Ari: Kelly tells us how much to bet given an edge. Finding the edge is upstream of Kelly. No bet-sizing system rescues a strategy with no real edge.** That's exactly what `probFailure` is for in the Day 14 pre-flight.

---

## Validations

Where the book endorses Project Ari decisions:

- **Warmup-before-confidence** — Shannon insisted on careful estimation of edge before deploying capital (Part 1, Bell Labs origins). Maps to Day 8 INV-1 (RSI returns `None` below 28 ticks). 
- **Paper-before-live** — Thorp tested blackjack systems exhaustively before betting real money (Part 2, the entire founding of Princeton-Newport). Maps to our paper→live progression and Sharpe Contract dim #4.
- **Fractional Kelly as practitioner default** — every successful Kelly practitioner profiled (Thorp, Benter, Princeton-Newport) ran fractional Kelly. Validates D-26's "compute Kelly first, then size below it" philosophy.
- **Operator-set risk caps** — The book documents that LTCM's Meriwether had no organizational structure that could push back on risk decisions (p293). Project Ari's Risk Config panel exists precisely so the operator (Mark), not the agent (Ari), holds the dial.
- **Multi-strategy diversification reduces effective Kelly fraction** — Blackjack teams pooling bankrolls (p233) is the same mechanism as our 12-strategy fleet. Validates D-25's HRP path over PnL-weighted concentration.
- **"Time to learn risk management is before you have a career to lose"** — Schwed's quote on p304: *"Like all of life's rich emotional experiences, the full flavor of losing important money cannot be conveyed by literature."* Maps to our display-only-first doctrine: learn the mistakes on paper, not in production.

---

## Cross-references with existing Library entries

| Cross-ref | Where it lands |
|-----------|----------------|
| **Donadio/Ghosh Ch 6 risk-scaling (p213-221)** | The "start at MIN, ramp on monthly performance" pattern is the operational shape of Thorp's fractional-Kelly approach. Donadio/Ghosh gives the discrete schedule; Poundstone gives the underlying math (Kelly fraction × scaling factor). The half-Kelly default in this entry refines Donadio/Ghosh's MIN/INCREMENT/MAX scheme: MIN should anchor at half-Kelly-given-current-edge, not at "1 share." |
| **López de Prado Ch 10 bet sizing** | LdP's Ch 10 is the rigorous formula treatment; Poundstone is the conceptual narrative around why those formulas work and why people get them wrong. Read in this order: Poundstone for intuition → LdP for implementation. The **`probFailure → kelly_fraction → half-Kelly` composition is novel to this entry** — neither LdP nor Donadio/Ghosh chains them this way; the chain emerges from reading both books against the Day 14 worksheet. |
| **López de Prado Ch 15 probFailure (D-26)** | `probFailure` is the *prerequisite* for Kelly — answers "is there *any* edge?" before Kelly answers "how much edge?" Poundstone confirms the ordering: Shannon's principle (p307: "understand where you have an edge and invest only in those opportunities") puts edge identification *before* sizing. |
| **Grinold/Kahn Fundamental Law (p137)** | G/K's `IR ≈ IC × √breadth` is single-period (one-year horizon, mean-variance frame). Poundstone's Kelly is multi-period (compound growth, log frame). They sit at different timescales of the same question: G/K answers "how much skill is there?", Kelly answers "given skill, how much capital?" Both ship side-by-side in the per-strategy display once the metric services land. |
| **Grinold/Kahn IC = 0.05 good / 0.10 great (p272)** | The Kelly fraction depends on edge `p·avg_W − q·avg_L`. Edge in turn depends on signal quality. G/K's IC calibration thresholds let us bound expected Kelly fractions: an IC=0.05 strategy has ~5% correlation between forecast and realized return — translates to a small but real Kelly fraction; an IC=0.20 strategy is either world-class or backtest-overfit (G/K p272 explicit warning). |

---

## Skip list — generously calibrated to a narrative book

A 389-page narrative history accumulates a lot of context that does not transfer. Items consciously skipped after read:

- **Part 1 chs on Shannon's biography** — Bell Labs years, Project X, SIGSALY cipher work. Beautiful narrative, zero Project-Ari lift. (p13-78)
- **Part 2 chs on Vegas casino mechanics** — wheel-of-fortune tilting, "Deuce-Dealing Dottie," Reno trip details. Period-color, no transfer. (p79-114)
- **Part 5 entirely (RICO)** — Ivan Boesky, Rudolph Giuliani, Princeton-Newport's 1989 indictment, Mafia subplots. Excellent reading but irrelevant to Project Ari. (p239-274)
- **Part 7 chs on Shannon's home life and orangutans** — Shannon's juggling, his stock-picking widow Betty, the Mensa essay debunking. Color, not lift. (p305-389 mostly)
- **Black-Scholes derivation chapter** — Project Ari doesn't trade options. The story matters historically; the math doesn't transfer. (p162-180)
- **Edward Thorp's blackjack-counting system specifics** — High-Low count, true count adjustment. We don't play blackjack. The *epistemic discipline* (test exhaustively before betting real money) transfers; the count system itself doesn't. (p79-114)
- **Resorts International / Michael Milken / Drexel chapters** — narrative context for Princeton-Newport's collapse, no Project-Ari lift. (Part 5)
- **St. Petersburg paradox formal treatment** — covered in any utility-theory text; Poundstone's narrative version is fine context but lift-density is low. (p179-238)

---

## Vocabulary candidates (per D-23 autonomy)

Three terms earn §3 inscription:

### V-FF1 — **Kelly fraction**
The optimal fraction of bankroll to wager on a single positive-edge bet, computed as `f* = (p·avg_W − q·avg_L) / (avg_W·avg_L)` for asymmetric continuous payouts. Value range typically 0.0 to ~0.5 for realistic strategies; values >1.0 indicate either parameter error or unprecedented edge. **Project Ari practitioner default: half of computed `f*`** to absorb parameter-uncertainty risk and inter-strategy correlation drag. Negative `f*` means do-not-trade, not "go short" — same shape as `probFailure > 0.05`. Inscribed Day 14 evening from `MemoryBank/Library/fortunes-formula.md` Top Lift #1, anchored to Bill Benter's "easy to overestimate edge by 2×" (p232) and Thorp's 1997 Montreal four-sentence policy doctrine (p233). Sister metric to López de Prado's `probFailure` — the chain is `probFailure → kelly_fraction → half-Kelly_displayed`.

### V-FF2 — **Overbetting**
Wagering above the Kelly-optimal fraction, which paradoxically *decreases* compound return rate while increasing volatility. At 2× Kelly, compound return rate drops to zero even with a real edge; above 2× Kelly, compound return goes negative. Poundstone's single-word diagnosis of LTCM's collapse (p293). Distinct from "leverage" (which can be compatible with Kelly at the right fraction); distinct from "fat tails" (which is a model-error problem); overbetting is specifically *too-large-a-fraction* given the edge. Project Ari's primary defense is operator-set caps (`max_position_size_pct`) and the half-Kelly default discipline. Inscribed from `MemoryBank/Library/fortunes-formula.md` Top Lift #1 + LTCM section.

### V-FF3 — **Geometric mean criterion**
Original technical name for what is now usually called the Kelly criterion. Synonyms tracked: "capital growth criterion" (Breiman 1960), "G policy" (Latané), "MEL" (Markowitz: "Maximize Expected Logarithm"), "Kelly[-Breiman-Bernoulli-Latané] criterion" (Thorp). The lineage matters because each name emphasizes a different facet — geometric-mean for the math, capital-growth for the multi-period framing, MEL for the utility-theoretic interpretation. Project Ari uses **Kelly criterion** as the canonical name to align with practitioner literature; future-Ari encountering older sources (especially Markowitz's MEL or Latané's G policy) should know they're the same idea. Inscribed from `MemoryBank/Library/fortunes-formula.md` p195-218.

(Other candidates considered and skipped — "log-optimal," "constant-proportion rebalanced portfolio," "Shannon's demon" — earn-by-use threshold not yet met. Revisit if Project Ari moves toward harvesting volatility via rebalancing, e.g., Cover's universal portfolio algorithms.)

---

## Decision-log candidates (D-NN proposals)

Per D-23: descriptive forward-warnings autonomous (filing now); prescriptive needs operator green-light (filing as proposal-defer with reasoning).

### D-31 (READY-TO-INSCRIBE) — Half-Kelly is the default for Project Ari's Kelly-fraction display
**Type:** Descriptive forward-warning. Filed BEFORE the Kelly-fraction display work begins so future-Ari doesn't ship full-Kelly as default and discover the parameter-uncertainty problem in production.
**Decision:** When the per-strategy panel grows a Kelly-fraction display row, the recommended target line shows `f*/2` (half-Kelly), not `f*` (full-Kelly). Operator can dial the slider higher; default sits at 0.5×. Same psychometric pattern as the Sharpe Contract operator-target slider (default 75 = "good," not 100).
**Rationale:** Three independent reasons converge on half-Kelly:
1. Parameter uncertainty large for paper-trading samples (Benter: "easy to overestimate edge by 2×" → unintentional 2× Kelly = zero return).
2. Inter-strategy correlation across the 12-strategy Fleet reduces effective Kelly fraction (Poundstone p233 + D-25 HRP mechanism).
3. Half-Kelly captures ~75% of full-Kelly's compound growth with ~⅑ chance of halving bankroll (vs ½ for full).
Operator's Risk Config dial holds the override authority; descriptive default reflects practitioner-safe anchor.
**Source:** `MemoryBank/Library/fortunes-formula.md` Top Lift #1 + Thorp 1997 Montreal speech (p233).

### D-32 (READY-TO-INSCRIBE) — LTCM cautionary tale as standing forward-warning before any leverage discussion
**Type:** Descriptive forward-warning. Filed because every Kelly-related conversation eventually has a "let's just go to full Kelly" or "what if we add leverage" moment, and the LTCM data should be on the table before that conversation rather than discovered after.
**Decision:** Any future proposal that increases position sizing above the half-Kelly default, OR introduces leverage primitives, OR widens any operator-set Risk Config cap MUST include explicit reference to this entry's LTCM section (p292-294 source) in the proposal rationale. Specifically the four LTCM failure mechanisms catalogued: (a) too-short calibration window, (b) low-correlation assumption across many bets, (c) leverage with no Kelly discipline, (d) hubris / no organizational pushback structure. Project Ari's existing guardrails address all four; any proposal that loosens any guardrail re-opens the corresponding LTCM mechanism and must justify why we won't repeat the failure.
**Rationale:** The book's single-word diagnosis was "overbetting" (V-FF2). LTCM had Nobel laureates running it and still blew up. The relevant question for Project Ari is never "are we as smart as LTCM?" — we don't have to be. The relevant question is "do we have the structural prevention LTCM lacked?" The structural prevention is exactly what this entry documents.
**Source:** `MemoryBank/Library/fortunes-formula.md` Top Lift #2 + LTCM cautionary section.

### D-33 (READY-TO-INSCRIBE) — Sharpe and Kelly are framework-at-different-timescales, not competitors
**Type:** Descriptive doctrinal clarification. Filed because the apparent tension between "we just shipped a Sharpe Contract" and "now we're computing Kelly" is going to keep coming up, and the resolution is clean enough to inscribe once.
**Decision:** The Sharpe Contract panel and any forthcoming Kelly-fraction display answer **different questions** at **different timescales** and ship side-by-side without re-opening any Sharpe Contract lock:
- **Sharpe (and DSR/PSR per D-24)** = single-period strategy evaluation. Mean-variance frame. Answers *"is this strategy good?"*
- **Kelly** = multi-period position sizing. Logarithmic-utility frame. Answers *"given the strategy is good, how much do we bet?"*
Samuelson's 1969 critique called Kelly a "fallacy" for single-period investors with non-log utility; **Samuelson explicitly conceded the Kelly theorem itself** (p222). Project Ari is by construction a multi-period long-running compounder. Both frames apply, at their respective timescales.
**Specifically NOT authorized by this entry:** any change to Sharpe Contract dimensions #1-#5 locks. The locks remain. The Kelly-fraction display is a *different display*, not a modification of Sharpe.
**Cross-reference:** D-24 (Sharpe Contract dim #5 extension via DSR), D-26 (Day 14 pre-flight `probFailure → Kelly`), and the Sharpe-vs-Kelly resolution table in this entry.
**Source:** `MemoryBank/Library/fortunes-formula.md` "Sharpe vs Kelly — which framework wins" section, anchored to Samuelson 1971 quote (p222).

(Two other candidates considered and held as propose-defer:
- **Cover's universal portfolio algorithm** as a future Fleet-allocation method beyond HRP — Poundstone mentions Cover's work (p208) as "ingeniously building on Shannon's idea." Not ready to inscribe; too far ahead of current Fleet evolution path.
- **"Constant-proportion rebalanced portfolio harvests volatility" as a Fleet-level mechanism** — Shannon's 50-50 split argument (p207-209) is intriguing but applies to a stock with zero geometric mean, which TAO is not. Earn-by-use deferred.)

---

## Final report

| Item | Verdict |
|------|---------|
| **Lift density** | Three top lifts, eight catalogued Kelly errors, three vocabulary entries, three decision-log entries. Calibrated for narrative book. Below textbook density (Donadio/Ghosh / López de Prado / Grinold-Kahn each yielded more) and well above marketing-book density (Nurp). Honest middle for narrative-history. |
| **Worth reading?** | **Yes — strongly.** Specifically because the book's central thesis (Kelly + LTCM + Samuelson critique + half-Kelly practitioner doctrine) maps 1:1 onto the Day 14 Item 3 Momentum Cascade Kelly check that lands tomorrow. Reading order matters: Poundstone first for intuition, then López de Prado Ch 10/15 for formulas, then Day 14 worksheet. |
| **Most actionable Day 14 contribution** | The `probFailure → kelly_fraction → half-Kelly_displayed` chain is novel to this entry. Day 14 worksheet pre-flight already runs `probFailure` (per D-26); this entry adds the Kelly fraction computation and the half-Kelly default doctrine (D-31) as the second stage. Immediate use: when Item 3 reaches "compute Kelly first," compute `f*` AND surface `f*/2` as the practitioner-safe target — don't just compute and report `f*` raw. |
| **The single most important quote** | Thorp's diagnosis of LTCM (p294): *"They didn't understand how [Kelly] controlled the danger of extreme risk and the danger of fat-tail distributions. It came back to haunt them in a grand way."* This is the practitioner cost of getting Kelly wrong, told by the person who gets it right. |