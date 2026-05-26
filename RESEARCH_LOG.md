# RESEARCH LOG — reviewed & parked

A lightweight index of articles, videos, products, threads, and SDKs that
have been reviewed but **did not warrant a dedicated entry in STATE.md**.
Items here are "reviewed → parked → revisitable." If a parked item later
becomes actionable, it graduates to a STATE.md research entry.

The full review for each item lives in the chat transcript on the date
shown — this file is the index, not the report.

| Date | Item | Source | Verdict | Revisit when |
|---|---|---|---|---|
| 2026-05-26 | **Zyfai — Personal Yield Agent (TypeScript SDK)** | [zyf.ai](https://www.zyf.ai/) · [`@zyfai/sdk`](https://www.npmjs.com/package/@zyfai/sdk) v0.2.36 | Direct value **zero**, pattern value **medium**. EVM stablecoin yield aggregator (Arbitrum / Base / Plasma · USDC / USDT) — different chain, different asset class, paid API, zero Bittensor / TAO / alpha mention. Patterns worth borrowing later: (a) two-level user strategy abstraction (`conservative` ↔ `aggressive`); (b) session-key delegated execution (ERC-7579 / Safe7579 / SmartSession); (c) first-class agent-control SDK methods (`pauseAgent()`, `enableSplitting(n)`, `withdrawFunds()`). | Productization-tier conversation — when the App is self-sustainable and a "managed TaoBot" SDK / public API surface needs to be designed. The shape of their SDK methods is a fast template; their session-key delegation is the closest EVM analog to whatever Substrate-side primitive we'd need for third-party τ delegation. |

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