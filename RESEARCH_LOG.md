# RESEARCH LOG — reviewed & parked

A lightweight index of articles, videos, products, threads, and SDKs that
have been reviewed but **did not warrant a dedicated entry in STATE.md**.
Items here are "reviewed → parked → revisitable." If a parked item later
becomes actionable, it graduates to a STATE.md research entry.

The full review for each item lives in the chat transcript on the date
shown — this file is the index, not the report.

| Date | Item | Source | Verdict | Revisit when |
|---|---|---|---|---|
| 2026-05-26 | **Zyfai — Personal Yield Agent (TypeScript SDK)** | [zyf.ai](https://www.zyf.ai/) · [`@zyfai/sdk`](https://www.npmjs.com/package/@zyfai/sdk) v0.2.36 | Direct value **zero**, pattern value **medium**. EVM stablecoin yield aggregator (Arbitrum / Base / Plasma · USDC / USDT) — different chain, different asset class, paid API, zero Bittensor / TAO / alpha mention. Patterns worth borrowing later: (a) two-level user strategy abstraction (`conservative` ↔ `aggressive`); (b) session-key delegated execution (ERC-7579 / Safe7579 / SmartSession); (c) first-class agent-control SDK methods (`pauseAgent()`, `enableSplitting(n)`, `withdrawFunds()`). | Productization-tier conversation — when the App is self-sustainable and a managed-Ari SDK / public API surface needs to be designed for third-party operators. The shape of their SDK methods is a fast template; their session-key delegation is the closest EVM analog to whatever Substrate-side primitive we'd need for third-party τ delegation. |
| 2026-05-26 | **Mamo — DeFi savings agent (Moonwell consumer app)** | [mamo.bot](https://mamo.bot/) · [docs.mamo.bot](https://docs.mamo.bot/) · [`moonwell-fi/mamo-contracts`](https://github.com/moonwell-fi/mamo-contracts) · [Halborn audits](https://www.halborn.com/audits/moonwell/) | Direct value **zero**, pattern value **high**. Structurally Moonwell's consumer app (Luke Youngblood as core contributor; contracts repo lives under `moonwell-fi`; audits filed under halborn.com/audits/**moonwell**/). 28-contract on-chain footprint, Base / Optimism, USDC/cbBTC vaults. Six patterns worth borrowing: (1) **per-user Strategy contracts** — each user gets their own deployed contract, the on-chain analog of per-user hotkey delegation on Bittensor; (2) **PauseGuardian vs Multisig role separation** — fast pause role (single-purpose, hot, can only halt) decoupled from slow upgrade-authority role (cold, multisig, can change code) — prevents the "the key that can pause is also the key that can rug" failure mode; (3) **asymmetric capability split** — backend can rebalance into whitelisted strategies but cannot withdraw to arbitrary addresses, so a hot-key compromise can't exfiltrate; (4) **$5 auto-compound threshold** — gas-aware action gating, action only fires when expected economic benefit exceeds expected execution cost (direct mirror of the slippage / fee floor logic in `execution_guard.py`); (5) **on-chain Chainlink Slippage Checker** — oracle-enforced execution bounds at the contract layer, not just the agent layer (the on-chain version of our pre-flight gate); (6) **risk-disclosure doc pattern** — docs explicitly enumerate what can fail (oracle deviation, vault insolvency, stablecoin depeg, smart-contract bug) before describing what the product does. Tokenomics also Const-doctrine-shaped: zero VC, no day-1 unlocks, ecosystem-aligned airdrop, locked LP, 24-month linear vest, 6-month team cliff. **One anti-pattern flagged**: their "highest available rate" single-objective optimizer is the wrong shape for prediction-contested outputs (alpha emission) — single-optimizer is correct for contested-by-pricing inputs (stablecoin yield) but collapses to mode-chasing when the target is a forecast. Reinforces why the 7/12 supermajority gate exists on our side. | Productization tier — when we need to design (a) tokenomics for a public token / fair launch, (b) on-chain footprint of any user-funds-touching contracts, and (c) risk-disclosure docs for a public-facing product. Mamo's contract topology + role-separation diagram is a fast reference template; their docs-as-disclosure pattern is the right shape for any public risk surface we publish. Anti-pattern (single-optimizer) goes into `ANTI_PATTERNS.md` if/when that file is created — flagged here for now. |

---

## Filing conventions

- **Date** is the date of review.
- **Item** is the name with a one-line subtitle if needed.
- **Source** is the canonical URL(s) — primary site, repo, package, paper.
- **Verdict** captures direct relevance + pattern relevance separately, with the why.
- **Revisit when** names a concrete trigger condition, not a date.

If a row's "Revisit when" condition fires, that's the cue to either:
- Open a new chat and re-review it against the then-current state of the project, or
- Promote it to a STATE.md research entry with full context.

Items that turn out to be actively misleading or anti-pattern get filed
into `ANTI_PATTERNS.md` instead, not here.