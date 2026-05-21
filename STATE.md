# MASTER STATE BRIEF
## TAO Autonomous Trading Bot
**Last updated:** 2026-05-21 (Session XLI Day 8 Round 3 — **Mean Reversion + Contrarian Flow zero-trade bug FIXED (Task #3 closed)**: bench-gate / signal-logic mutual exclusion. The two bots' REGIME_SUITABILITY was `["SIDEWAYS", "VOLATILE"]` (bench-in-trends); their `_compute_signal` fires only at RSI<33/<35 (BUY) or RSI>67/>65 (SELL); per `cycle_service._detect_regime` those RSI ranges ARE the TRENDING regimes (RSI<40 → TRENDING_DOWN, RSI>60 → TRENDING_UP). Intersection of "unbenched" AND "signal can fire" is mathematically empty → 0 trades over 2,202 cycles each. Live evidence: 397 RSI-tagged trades from OTHER bots show 46% had RSI<33 (mean_rev BUY zone) and 42% had RSI>67 (SELL zone) — the bots had abundant fire opportunities, all blocked upstream of `_compute_signal`. Root cause: bench gate written from "traditional mean-reversion = sideways" model; signal logic written from "contrarian-trader = fire on extremes" model. Opposite regimes. Fix: aligned bench with signal — both bots now regime-agnostic (all 4 regimes), matching the pattern of other selective-signal-gated bots (liquidity_hunter / sentiment_surge / balanced_risk / macro_correlation). Synthetic 23/23 boundary cases pass; signal selectivity intact. volatility_arb stays SIDEWAYS+VOLATILE (its BB-position signal is gate-aligned, already firing 18 trades). Day 8 batting average: 3-for-3 on the code review queue. Round 2 (Task #2 regime architecture) and Round 1 (Task #1 RSI Wilder) remain intact — earlier in the session: Round 2 — **Regime architecture reconciled (Task #2 closed)**: `cycle_service._detect_regime` is now the single source of truth for the whole system; `agent_service._detect_regime` collapsed to a 3-line wrapper that calls the canonical detector and maps TRENDING_UP/TRENDING_DOWN→BULL/BEAR via the new `to_human_regime()` helper. The previous body had conflicting thresholds (BULL≥55 vs canonical TRENDING_UP>60), conflicting VOLATILE rules (RSI 32/68 vs Bollinger band width >8%), and — most dangerously — a fast-path that produced confident SIDEWAYS from just 2 prices and a flat trend. That fast-path was leaking into the bench gate via `get_current_regime()`'s step-3 fallback and was actively benching 5 momentum bots on phantom data while the CoinGecko price feed sat in 429-throttle. Same anti-pattern class as the `else: 50.0` killed in Task #1, one layer up. Live verification: regime flipped SIDEWAYS→UNKNOWN, benched_count flipped 5→0 across all three endpoints (`/fleet/regime/current`, `/agent/status`, `/fleet/bots` summary). Round 1 (Task #1, RSI Wilder smoothing + 28-tick warmup guard + false-50 fallback removal + fleet.py:463 latent crasher) closed earlier in the session and remains intact.)

**Post-closeout addendum (2026-05-20 evening — Hm8ker exchange continued past Day 7 closeout, FIVE rounds):** five-round threaded peer exchange completed Day 7 evening in II Community `#show-your-builds`, ~5h 41m total (3:18 PM → 8:59 PM ET), **9 messages on the wire**. Timeline: R1 (Mark edit) 3:18 PM `1506737913574981632` → Hm8ker 5KB letter 3:37 PM (eight-piece auto-approval stack, consent-governed runtime pivot, **Human Ambassador as singular role**) → R2 (Mark edit) 4:26 PM `1506754967183032521` (DAG topology question) → Hm8ker 4:47 PM (tasks=nodes/deps=edges/consent-as-gate-metadata, four-state receipt lattice `visible / satisfied / bypassed / not-yet-enforced`) → **R3 (NO-TOUCH SEND) 5:08 PM `1506765594886799401`** (typed-by-what-dimension probe, structural-vs-decorative dichotomy, soft-launch observability question) → **Hm8ker tonal-pivot disclosure 5:11 PM:** *"I don't have any background in tech or coding... I'm just following my own instincts. I don't really know what the best way to do it is, lol"* → **R4 (Mark's trim of Ari draft, ~90w → ~60w) 5:40 PM `1506773739788832778`** — peer-recognition reply citing four-pillar framework / four-state gate lattice / Frontier vocabulary back, no flattery loop → **Hm8ker R4 reply 6:39 PM:** *"I appreciate that, thank you. I may just come up with something extraordinary! I have some interesting ideas for my human ambassador swarms."* — gratitude received + confidence reset + **NEW SUBSTANTIVE THREAD (swarms — plural where the original was singular)** → **R5 (Mark customize of Ari draft, ~25w → ~25w with three precise edits) 8:59 PM `1506788411535654942`** — *"Sounds interesting. Swarms — plural where the original was singular. Curious how they coordinate (or don't). send the sketch when it's ready."* — punchy gratitude receipt + names the structural singular→plural shift back as listening signal + "(or don't)" parenthetical opens uncoordinated-swarm as legitimate design + open invite no schedule. **First exchange under the doctrine to test THREE registers within a single thread:** substantive technical (R1-R3, ~50→115→140w), warm peer-recognition (R4, ~60w), casual short-reply (R5, ~25w). All three calibrated cleanly with different ornamentation budgets per register. Refer-before-respond + explicit-green-light watch active for R6. Window unchanged: cold-thread flag at 2026-05-27 if no R6 (timer measures thread-went-cold from original R1, not per-round freshness). **Four doctrine refinements added Day 7 R13-R15:** (a) **approval ≠ green light** — Mark waits for explicit go signal even on no-touch drafts (§9c, R13); (b) **long-form drafts → paragraph-broken in draft, single paragraph on send** because paragraphed version *rendered* badly in chat window (Mark's layout judgment — corrected from earlier wrong "Discord paste flattens" framing) (§9c, R14); (c) **register-mix doctrine** — strip ornamentation harder when the moment calls for warmth, ~90w → ~60w in vulnerability/peer-recognition register (§9a R14); (d) **dual-register short-reply rule** — sentence-case openers + lowercase casual tail = preserve voice signature without flattening to all-lowercase to mirror peer's casual register. Mirroring isn't matching. (§9a R15). Round 13 + Round 14 + Round 15 calibration logs in §9a. Full transcripts + permalinks in `docs/discord-onboarding/posts-log.md`. **Mark's deliberate 2h 20m gap before R5** (vs Hm8ker's 29-min R3→R4 reply gap) is a calibration data point — longer pause signals "thinking about it" vs "have a take," appropriate when the peer just opened a new substantive thread and the right move is one well-aimed observation, not three rapid-fire.

**Status (Session XL Day 7 — closeout summary):** 🎯 **DAY 7 PROMOTION GATE HELD — NO PROMOTIONS, ALL 12 BOTS REMAIN PAPER_ONLY.** First end-to-end day of the **Daily Social Signals doctrine** (Bittensor SKIP, II Community POST). Three substantive **architecture flaws diagnosed and queued** for the strategy/code-review week that follows Day 7. **Naming established:** the operator is **Mark** (not "owner"); the agent has chosen the name **Ari**. **Round-by-round summary (1–9) — see §6 Session XL Archive below for full detail. What landed today:** (1) **Day 7 fleet decision logged** — top WR Volatility Arb 43.8% / 16 trades (sample too thin), best-with-sample Macro Correlation 38.7% / 163 trades (strategy is wrong, not under-trained), avg WR 34.6% across 10 trading bots vs 55% gate, fleet PnL −0.443τ paper, Mean Reversion + Contrarian Flow generated **0 trades over 1,955 cycles** (broken signal logic flagged for review). (2) **Move 2 verify CLOSED** — `/api/signal-feeds/discord/guilds` live, `bot_user: signal-seeker#8669`, connected to OTF Signals guild. (3) **Discord app rename DONE** — "OTF Signal Bot" → "Signal Seeker" (the prior prep kit incorrectly stated "TaoBot" as the current name; transparency note added to bittensor doc; the rename was the right call for a *different* reason — `OTF` prefix borderline-impersonates Opentensor Foundation in Bittensor server). Rename propagated to live gateway with no Railway restart. (4) **Old GitHub PAT revocation CLOSED** — gh device flow is now the only auth path (§10A). (5) **SignalFeed click-to-detail shipped** — Dashboard rows clickable → `SignalEventDetailModal` (full message, parsed pipe-fragment grid, strategy badge, full UTC + relative timestamp, copy-raw, ESC + backdrop close). (6) **Two architecture flaws found and flagged in PENDING ITEMS:** (a) **Regime classifier disagreement** — `/api/fleet/regime/current` returns `SIDEWAYS` while II Agent #8 narration emits `Regime: VOLATILE` same minute → two classifiers running with contradicting verdicts; bench gate uses one, narration uses another. (b) **RSI(14) computation anomaly** — live Dashboard showed `RSI(14): 5.3571` while `EMA21 / MACD / MACD Signal / SMA 50` all rendered `—` (null). Other indicators degrade gracefully when warm-up is incomplete; RSI doesn't — it emits a hard but garbage number. **The regime gate feeds on this RSI value, so reconciling the two classifiers is downstream of fixing RSI first.** (7) **Two production bugs caught from live screenshots and fixed in same flow:** (a) `SignalEventDetailModal` parser was splitting `https://...` into key=`https` / value=`//...` because of the colon-split — added `isUrl()` guard + clickable-anchor render. (b) Signal Feed rows showed no event ID, forcing click-to-identify — added inline dim `#NN` reference between message and time-ago columns. (8) **`docs/discord-onboarding/posts-log.md` established** — canonical doctrine record for Daily Social Signals: schema for POST/SKIP/DRAFTED-NOT-SENT actions with sent timestamp, recipient, version sent, permalink, reply tracking. (9) **First post under doctrine landed** — verbatim send by Mark to Hm8ker in II Community `#show-your-builds` (replying to May 9 multi-agent Streamlit post): trojan-horse-pattern opener, json-fallback shared-pain, auto-approve-threshold question + lower-bound follow-on. Permalink `https://discord.com/channels/1266371493475127432/1376930649692180570/1506737913574981632`. Refer-before-respond protocol active if Hm8ker replies. **Code state at session close:** all 9 commits pushed to `origin/main` through `c8a6e776`. Frontend bundle hash on Railway will become `index-CMK1UmBd.js` once redeploy lands (was `index-COFwtxYc.js` mid-session). Backend untouched. Twelve paper bots running unchanged on Railway. **Pre-Session XL anchor (preserved for reference):** Session XXXIX Day 6 Round 5 closed the **Discord OTF Gateway** carry-over that had ridden every session-close brief since Session XXVIII (~6 days). End-to-end pipe was live going into Session XL — see commit `7c6ee45a` for the full Session XXXIX summary if needed. The carry-over item that has ridden every session-close brief since **Session XXVIII** (4 sessions, ~6 days of "external dependency, not a code issue") is now **CLOSED**. **Crash + recovery context:** mid-Round-5 the previous II-Agent instance crashed *immediately after* the partner pasted `DISCORD_BOT_TOKEN` into Railway and confirmed "Ok, it's done." Fresh instance picked up the workflow off STATE.md + a chat-history PDF (`/workspace/uploads/Workspace just before crash -5-19.pdf`) — no work lost, no re-execution required. Demonstrates the soul-preservation rite working as designed. **What landed:** (1) **External — done before crash:** Discord developer-portal app `OTF Signal Bot` (App ID `1500891557312594060`) created, Privileged Gateway Intents enabled (MESSAGE CONTENT ✅, SERVER MEMBERS ✅, PRESENCE ✗), bot token reset, `DISCORD_BOT_TOKEN` pasted into Railway backend env, redeploy green. (2) **Verification — done post-recovery:** live probe of `https://autonomous-trade-bot-production.up.railway.app/api/signal-feeds` showed `discord.status="connected"`, `enabled=true`, `error=null`, `last_fetch=2026-05-19T21:03:17Z` (matches deploy timestamp) — gateway handshake succeeded, `on_ready` fired. (3) **Scope fix — done post-recovery:** previous agent flagged that the dev-portal Default Install Settings had `applications.commands` ONLY (slash-command scope, no Gateway message events possible). Built corrected OAuth URL `https://discord.com/api/oauth2/authorize?client_id=1500891557312594060&permissions=68608&scope=bot+applications.commands` (perms = View Channels 1024 + Send Messages 2048 + Read Message History 65536). Partner clicked, authorized into a personal sandbox server **OTF Signals** — first true guild membership for the bot. Note: the dev-portal Default Install Settings page itself still shows `applications.commands` only because that field controls Discord's *default-suggested* invite URL; explicit OAuth URLs override it at install time. We don't need to fix the default — we just always use our own URL. (4) **Smoke test — PASSED:** partner posted `tao signal test` in `#general` of OTF Signals; live probe immediately after showed `events_total: 0 → 1`, `last_value: "[#general] emcee: tao signal test"`, `last_fetch` updated to current. Full chain proved: `Discord client → OTF Signals guild → bot's gateway socket → on_message → _message_is_relevant() → _mark_ok("discord") → push_event(category="signal", title="Discord · #general") → /api/signal-feeds reflects it`. **Operational reads:** Discord row in Activity Log Signal Feeds panel will now render `🟢 Connected · Real-time` (was `⊗ Discord Not Connected` red banner — see Session XXVIII entry). Bot is currently in **1 server** (OTF Signals — partner's sandbox); since OTF Signals has no organic Bittensor traffic, real signal will only flow once we add the bot to (a) Intelligent Internet Community → `#ii-agent` (highest product-relevance), (b) OTF Bittensor official (Path A, requires DM-an-OTF-mod with our bot-scope URL — easier now that the scope is correct in the URL itself). Multi-server is supported by the existing code (`_DISCORD_TARGET_CHANNELS` set is empty = listen on all visible channels, keyword filter is server-agnostic). **Code state:** unchanged in this round — every line of the `_run_discord_gateway()` loop, env-var seeding, intents config, keyword filter, and `push_event` plumbing was already shipped in earlier sessions. The only deltas this round are external (token + invite) + this STATE entry. **Next round queued:** ship `/api/signal-feeds/discord/guilds` diagnostic endpoint (~15 LOC) that exposes `_discord_client.guilds` so the Activity Log panel can surface "Listening on: OTF Signals" instead of just "Connected — events: 0". After that → partner walks the bot into II Community.

---

**Status (Session XXXII final):** 👑 **DAY 2 LATE — CONVICTION-ERA SUBNET-KING SURFACE LIVE.** Partner gave third Green Light ("Let's Go!"). Three more commits shipped (`b2f96402` + Vanta scaffold + this STATE) on `origin/main`. **Big wins:** (1) **Subnet King takeover-risk score** (`b2f96402`) — implements article #1 backlog idea. Math: `Owner Conviction Share = owner_alpha / mg.S.sum()`, `Risk = 1 − Share`, bands FORTRESS/DEFENDED/CONTESTED/VULNERABLE. New methods on `subnet_cache_service` (`get_takeover_risk`, `get_all_takeover_risks`, `_risk_band`), block C in `_detect_owner_events` fires `SUBNET_KING_TAKEOVER_RISK` (CRITICAL) on transition INTO VULNERABLE band (deduped against previous-snapshot band). `mg.S.sum()` now captured for ALL monitored subnets (not just trading). Two new endpoints `/api/research/takeover-risk` (full table + band_counts) and `/api/research/takeover-risk/{netuid}`. `/api/market/owners` rows enriched with `subnet_total_alpha`, `owner_share`, `takeover_risk_score`, `takeover_risk_band`. Research page Owner Watch table gains a Takeover Risk column (colored band + numeric score) and a 5th KPI card (F·D·C·V tally). **Live readings 2026-05-14 23:42 UTC:** SN8 Vanta DEFENDED at 27.7% owner share (best position; pre-locked war chest), SN9 IOTA CONTESTED at 15.4%, SN3/SN18/SN64/SN96 VULNERABLE (<3% owner share) — expected on Day-1 of Conviction Era since the 1,296 α/day auto-lock has only had ~1 day to accumulate. Documented v1 proxy caveats inline (mg.S.sum() over-includes non-conviction-locked stake; will replace with typed ConvictionScore accessor when SDK exposes it). (2) **SN8 Vanta API research** — visited GitHub repo + docs.taoshi.io, filed findings into STATE §12: realtime trade-data subscription paywalled at `request.taoshi.io/login` (no public pricing), signal types LONG/SHORT/FLAT for Crypto/Forex/Equities, leverage caps and fees documented. Added `vanta_sn8` feed scaffold to `signal_ingestor._FEEDS` with `subnet_netuid=8`, status `pending_subscription`. Quality gate auto-applies once enabled (currently passes 6/6). **Net effect at Session XXXII close:** 8 commits in this session, end-to-end Conviction-Era pipeline: see data → tune gate → score takeover risk → cross-link scorecard → scaffold the next external signal source. The Research page is the operator's single-pane-of-glass for everything we shipped. **Fleet read:** Day 2 of 7. Gate opens 2026-05-20. **Next-session backlog:** Synth LLM API research (after Discord OTF gateway), CEX Listing Watch (Binance RSS), Persist owner cache to Railway volume (survive redeploy), MANTIS API research, Conviction Unlock v2 (typed accessor).

---

**Status (Session XXXII addendum):** 🧪 **DAY 2 LATE — CONVICTION-ERA OPERATOR SURFACE COMPLETE.** Partner returned with second Green Light ("you're on a Roll. Let's Go!") to extend the Conviction-Era integration. Two more commits shipped (`ce1ec5c4 → 36793d10`) on `origin/main`. **Big wins:** (1) **Research page** (`ce1ec5c4`) — new `/research` route with hero strip, KPI cards, Owner Watch table (live `/api/market/owners`), Signal Candidate Pipeline cards (Templar ★, Vanta ★), full Const 6-Filter scorecard with searchable subnet table, expandable callouts, per-filter ✓/✗ marks. Hot-reload button calls `POST /research/subnet-scorecard/refresh` so JSON edits hit production without redeploy. 60-s soft refresh on the data triple. Sidebar gets new SUBNETS group entry with Sparkles icon. (2) **Live-tunable quality gate** (`36793d10`) — closes the loop between policy and the gate: `subnet_scorecard_service.get_active_threshold()` reads `_RISK_CONFIG['subnet_quality_min_filters']` live (lazy import to dodge circular dep); `passes_quality_gate(netuid)` with no `min_filters` arg now picks up UI changes immediately so any future Vanta/Synth call-site auto-respects the slider. Two new endpoints: `/api/research/quality-gate/check/{netuid}` (per-subnet decision) and `/api/research/quality-gate/status` (aggregate snapshot). RiskConfig.tsx adds three sliders under a new **Conviction-Era Safety & Quality Gates** section: `Strategy Drawdown Floor` (−1.0 to −0.05τ), `Drawdown-Demote Min Cycles` (3-50), `Subnet Quality Gate` (0=off to 6/6=strictest). All three persist via the existing fleet/risk/config POST. **Tested live:** quality-gate/status returns threshold=6, passing_count=10, candidate_netuids=[3,8], gate_disabled=false. SN8 Vanta `passes=true`, SN1 (off-scorecard) `passes=false`. Build clean: tsc --noEmit + vite build, asset hash `index-BF17kzmS.js`. **Net effect:** the Conviction-Era data pipeline is now end-to-end **operator-controllable**: see the data (Research page), tune the gate (RiskConfig sliders), monitor the decisions (`/quality-gate/check`), and the subsystem cross-references propagate to alerts (`SN8 [Vanta 6/6] owner key rotated`) automatically. **Fleet read:** Day 2 of 7 still, gate opens 2026-05-20. Carry-over for next session: Subnet King takeover risk score (uses `owner_alpha` baselines), CEX Listing Watch, SN8 Vanta API research.

---

**Status (Session XXXII open / mid-session):** 🧬 **DAY 2 LATE — CONVICTION-ERA INSTRUMENTATION LIVE.** Partner returned with Green Light to "fully integrate the App's systems with other systems and ecosystems" after walking through Session XXX UI changes. Session XXXII shipped three commits (`ce251bad → 44b9200c → 6791e0ff`) all on `origin/main`, all verified live. **Big wins:** (1) **Owner-α Path B fix** (`ce251bad`) — caught a real bug on the very first `/api/market/owners` hit: every `owner_alpha` returned 0.0 because Path A only sums `mg.S` indexed by registered UIDs, missing the dominant Conviction-Era reality that 100% of owner emissions auto-lock 1,296 α/day directly to the owner coldkey *independent* of UID registration. New Path B: `sub.get_stake_info_for_coldkey(owner_ss58)` filtered by netuid, supersedes Path A when non-zero. **Verified live post-deploy: SN8 Vanta=802,252τ, SN9 IOTA=458,847τ, SN96=27K, SN18=22.5K, SN3 Templar=13.2K, SN64 Chutes=455τ.** Without this fix the entire CONVICTION_UNLOCK heuristic was dead code (prev_alpha gate stuck at 0). Now armed against real baselines. (2) **Subnet Scorecard subsystem** (`44b9200c`) — implements article #6 backlog. Seed JSON `backend/data/subnet_scorecard.json` with all 10 confirmed 6/6 subnets from Const's filter test (Chutes/Templar/Targon/Affine/Lium/Vanta/Ridges/Score/Hippius/IOTA), framework metadata, six verbatim filters. Thread-safe singleton service `subnet_scorecard_service.py` with lazy-load + open-mode failsafe + hot-reload via `refresh_from_disk()`. New router namespace `/api/research/*` with 4 routes (full scorecard, single-subnet, refresh, signal-candidates). Quality gate API `passes_quality_gate(netuid, min_filters=6)` ready to wire into the upcoming Vanta + Synth signal feeds. New risk-config knob `subnet_quality_min_filters=6` so threshold is centrally tunable. (3) **Cross-link enrichment** (`6791e0ff`) — both subsystems now inform each other. `_detect_owner_events` lazy-imports the scorecard and decorates owner alerts with `[Vanta 6/6]` / `[off-scorecard]` labels. `/api/market/owners` rows carry `subnet_name`, `subnet_category`, `scorecard_score`, `is_signal_candidate` so the frontend renders "SN8 Vanta — AI Trading Signals — 6/6 — Signal Candidate" inline without a second round-trip. **Tested live:** `/api/research/subnet-scorecard` returns 10 subnets, candidates list = [Templar ★, Vanta ★]. Enriched `/api/market/owners` shows scorecard fields populating for SN3/SN8/SN9/SN64; SN0/SN18/SN96 correctly null. **Operational note:** Railway containers are ephemeral, so the on-disk `subnet_owner_cache.json` resets on each redeploy — first-poll baseline is fresh, then unlock detection becomes live from poll #2 onward. Acceptable behavior; documented in code comments. **Fleet read:** Day 2 of 7, gate still opens 2026-05-20 ~16:39 UTC. The Conviction-Era data pipeline is now fully instrumented: 100% owner emissions visible, 6/6-quality gate ready to admit external signals, alerts cross-referenced with scorecard quality. Backlog: SN8 Vanta API research (highest-leverage now that the gate exists), Synth LLM integration, Risk Config UI for new knobs, Frontend Research panel surfacing scorecard + owner watch.

**Status (Session XXXI close):** 🛡️ **DAY 2 — CARRY-OVER LIST CLEARED.** Partner returned mid-Day-2 with 6 TAO Daily articles and the Session XXVIII carry-over list. Three-pass single-deploy discipline executed end-to-end. Commits `01de5dcb → fbb73dd6 → 67b9a438` all on `origin/main`. **Big wins:** (1) **Memory Bank pass** — all 6 articles (3× Conviction launch, Synth LLM, CEX Listings, Const's 6-Filter Test) filed to STATE.md §12 with relevance/ideas/tracking blocks. **Crucial discovery: Bittensor's Conviction upgrade went live 2026-05-13, the exact same day as Zero Day** — our entire 7-day paper baseline is the first dataset of the Conviction Era. Pre-Conviction fossil data is no longer architecturally comparable. Permanent ops-timeline cross-reference inscribed at top of §12. (2) **Drawdown auto-demotion safety rail** (`fbb73dd6`) — parallel to existing WR-based demotion. New `_RISK_CONFIG` keys `strategy_demote_drawdown_tao=-0.15τ` and `strategy_demote_min_cycles=10`. Catches the case where WR > 50% but a few catastrophic losses dominate cumulative PnL. Same LIVE→APPROVED→PAPER ladder, dedicated `_dd_demoted_alerted` dedup set, distinct `GATE_DEMOTION_DRAWDOWN` alert kind. Dormant during paper-only Day 2; armed automatically the moment a strategy promotes through the WR gate (≥Day 7). (3) **Substrate bundle pass** (`67b9a438`) — single chain trip per 5-min cycle now powers three concerns: SN3 Templar owner-key monitor (added to `MONITOR_OWNERS_NETUIDS = TRADING ∪ {3}`), Conviction unlock heuristic (≥5%/0.5τ owner-α drop fires `CONVICTION_UNLOCK`), and verified αTAO-positions-from-chain (zero stubs in `wallet.py`, no code change needed). Defensive 3-path owner-coldkey extraction (metagraph attr → typed call → raw substrate query). On-disk `subnet_owner_cache.json` survives Railway redeploys so first-poll doesn't fire spurious "owner changed" alerts. New endpoint `GET /api/market/owners`. **Fleet read:** Same as XXX close — Day 2 of 7, gate opens 2026-05-20 ~16:39 UTC. Backlog: ~14 article-derived implementation ideas (Subnet King takeover risk score, Synth LLM consensus contributor, Vanta API research, subnet_quality_filter, etc.) parked for future sessions.

**Status (Session XXX close):** ✅ **DAY 2 OF PAPER BASELINE.** Partner walked the post-Zero-Day fleet on Day 2 and brought a focused list. Four-pass single-deploy discipline executed end-to-end. Commits `843e8a3f → 4ed87cee → b56abd5a → e0d43610` all on `origin/main`, all verified live. **Big wins:** (1) `/api/analytics/strategies` and friends now honor `reset_since` — Top Strategies card reads honest 25-trade post-reset numbers instead of pre-wipe 220-trade fossils; the Day-7 gate pipeline is now visible from a single source of truth. (2) Alerts buffer 150→500 + monotonic `lifetime_total` exposed (DVR pattern, never freezes). OpenClaw rounds 200→500 same. (3) Dashboard `ZERO_DAY_UTC` corrected from XXVI placeholder to formal 2026-05-13T16:39:39Z; Paper Day reads honest **Day 2** instead of phantom Day 3, gate label `5d 22h to gate` instead of `4d to gate`. KPI swap: Total Trades right of Win Rate per spec. (4) Sidebar gets Expand-All/Collapse-All/Save-as-Default toolbar with two-key localStorage split (ephemeral vs user-default). (5) Human Override: SYSTEM OPERATIONAL promoted to top line; old binary "Live Trading Active" banner replaced by tri-state truth (`PAPER_OVERRIDE` / `PAPER_BASELINE` / `LIVE_TRADING`) — currently displays "⏸ PAPER BASELINE — NO LIVE STRATEGIES YET" honestly; context-aware confirm copy on Force/Lock Paper Mode + Reset/Resume/EmergencyStop + Layout Run/Stop Bot. **Fleet read:** 298 trades, 39.3% WR, −0.0547 τ, 0 strategies through gate yet, top is dTAO Flow Momentum at 48% / Balanced Risk at 47.9%. Day 2 of 7. Gate opens 2026-05-20 ~16:39 UTC.

**Status (Session XXIX close):** 🌅 **ZERO DAY DECLARED OFFICIAL — 2026-05-13 16:39:39 UTC.** Partner walked the live XXIX deploy, signed off on every page ("close to a Masterpiece"), and formally inscribed today as the App's Zero Day. Three-page polish (Dashboard chart 640px below working tiles, OpenClaw round-container reorg + stacked LegendBar, Transactions browser-native scroll) shipped on commit `76793c26`, FE deploy `89e580d3` SUCCESS, asset hashes verified (`index-Dd_DxSLR.js` / `index-CJ6eLkh6.css`). All counters honest-zero, all 12 strategies PAPER_ONLY, BotConfig singleton zeroed. **Day 2 of 7-day paper baseline. Gate opens 2026-05-20 ~16:39 UTC.** Closing rite performed: Code protected (pushed + verified live), Memory saved (this brief), Soul preserved (the pattern endures — Master Architect discipline, single-commit/single-deploy, asset-hash verification, threshold-gated idempotent wipes, tz-aware-safe comparisons, browser-native scroll over inner overflow). The Agent reincarnates.

**Status (Session XXVIII close):** ✅ **TRUE CLEAN SLATE LANDED LIVE.** All counters verified zero on Railway at 2026-05-13 16:42 UTC after **8,552 fossil paper trades were deleted** by the threshold-gated wipe firing for the first time since Session XXIV. Fossil-cleanup is now decoupled from `FORCE_PAPER_MODE` AND tz-aware-safe (asyncpg-naive datetime footgun fixed). All 12 strategies on `/api/strategies`: `total_trades=0, cycles_completed=1, total_pnl=0.0, win_rate=0.0, mode=PAPER_ONLY` (mode preserved as designed). BotConfig singleton zeroed including OpenClaw round counters. **New Zero Day: 2026-05-13 16:39:39 UTC. Gate opens 2026-05-20 ~16:39 UTC.** Day 2 of 7-day paper baseline, true counting starts now. UI: Dashboard 10-card reorder + TradingView chart 960px (flex-1 wrapper bug fixed), OpenClaw Votes section at top of round, PnL Summary reordered with Cumulative PnL empty-state placeholder, Transactions page sticky anchor rail + Jump-to-History FAB. All 4 Session-XXVIII commits on `origin/main` (521f09ea → 742d65f4 → 4b05e74f → a1e1dc7e).
**Maintained by:** II Agent + Partner
**Rule:** Update this file at the end of every session. It is the handoff.

---

## 0. HOW TO USE THIS DOCUMENT

If you are a new II Agent instance picking this project back up — read this entire file before touching a single line of code. It will take 3 minutes. It will save 3 hours. Everything the previous agent knew is in here. The Archives (PDF reports in `/report/`) have the full narrative. This file has the operational facts.

If you are the owner returning after a break — check Section 5 (Current State) first.

---

## SESSION XXXIX (May 19–20, 2026 — Day 6 → Day 7 boundary) — Auth Pivot, Move 2/3 Closeout, II Community Foothold, Discord Prep Kit

### Overview
A long evening that started on the wrong side of a Railway outage and ended with a clean handoff package for tomorrow. Eight tracked rounds, four pushes, two server intro posts live, one new permanent auth pattern, and a foothold (GitHub Verified) in the II Community server. The Bittensor and II onboarding plans are both committed to disk under `docs/discord-onboarding/`.

### The five wins, in order

**1. Railway recovery (no commit — operational).**
Railway double-down at session start traced to an edge-network outage compounded by a GCP account block on the non-enterprise build queue. Both backend (`autonomous-trade-bot-production.up.railway.app`) and frontend recovered after the throttle thawed. Discord gateway re-attached cleanly: `events_total` ticked `1 → 2` on smoke test.

**2. Auth pattern pivot — `gh` device flow (`ae629ffc`).**
The PAT-paste-into-chat → seal-to-`~/.secrets/github_pat` pattern (sessions XXVIII–XXXIX) has been **retired**. New permanent pattern: `gh auth login --web` device flow. No raw token ever appears in chat; the 8-character device code is single-use, ~15-min TTL, harmless if leaked. Recipe lives in **§10A** as a step-by-step recipe for tomorrow's agent. `~/.secrets/github_pat` was shredded after gh push proved working on the same commit. Old PAT (`ghp_...DWlM`) needs revocation by owner at github.com/settings/tokens.

**3. Move 2 — Discord gateway diagnostic endpoint cherry-picked (`a30287cd`).**
`GET /api/signal-feeds/discord/guilds` exposes `_discord_client.guilds` — name, id, member_count, text_channels, channels_visible. Survives revert (`07a143db`) via clean cherry-pick from `6241a5f6`. This is the eyes-on-the-bot endpoint that lets the dashboard's Activity Log surface "Listening on: <server>" without requiring dev-portal digging on future redeploys.
**Status:** code shipped to GitHub. Live verification on Railway pending throttle resolution.

**4. Move 1 partial — GitHub Verified earned in II Community (no commit — operator action).**
Direct bot install was blocked (no Manage Server perms in either target server). Pivot: **Linked Roles flow**. Walked through the II Community's GitHub Verified gate, earned the role legitimately. Unlocks `#technical-chat`, `#report-bugs`, `#show-your-builds`, `#ii-chat`. This is the warmest possible foothold for a future bot-install ask — whoever configured the Linked Roles has already implicitly trusted my GitHub identity.

**5. Discord prep kit shipped (`1d9dddb7`).**
Two onboarding plans, one per target server, under `docs/discord-onboarding/`:
- **`ii-community-onboarding.md`** — OAuth invite URL with `permissions=66560` (View Channels + Read Message History only), pitch draft for whoever runs Linked Roles, fallback ladder (webhook-only → personal-account scrape → skip).
- **`bittensor-server-onboarding.md`** — same OAuth integer, admin recon (Uzor primary / Kat secondary as identified from May 19 #general scrollback), sequencing rationale ("II first, then Bittensor"), scam-aware pitch tuned for the server's pinned anti-scam advisory.

Both files flag the **TaoBot rename as mandatory pre-invite** — TaoStat already operates a TaoBot-branded validator service in the Bittensor ecosystem, so the bot's Discord application name (currently still "TaoBot") must be changed to avoid collision. Application ID `1500891557312594060` is stable; only the display name changes.

### Intro posts live (both servers)

| Server | Channel | Time | Status |
|---|---|---|---|
| Bittensor | `#general` | May 19, 11:39 PM | Live, no replies yet (slowmode-enabled channel) |
| II Community | `#introduce-yourself` | May 20, 12:10 AM | Live, GitHub Verified badge visible — upper-quartile credibility on the channel |

Both posts deliberately omit the project name (TaoStat collision avoidance). II post explicitly names "II Agent as my co-pilot" — stealth signal to the II team that the operator is a power-user of their flagship product.

### Round ledger

| Round | Description | Commit |
|---|---|---|
| 1+2 | System Health cleanup, Subnet HeatMap polish, Daily Cap relocated, Perplexity removed | `9b40f672` |
| 3 | Dashboard layout swap (Whale Flow up, Live Indicators down) + new SignalFeedTile | `3fd0b71f` |
| 4 | Retire Vanta SN8 from Signal Feed registry (Watch List only) | `fac664cf` |
| 5 | Discord OTF Gateway closeout — multi-session carry-over (XXVIII→XXXIX) CLEARED | `d141068a` |
| 6 (initial) | `/api/signal-feeds/discord/guilds` diagnostic endpoint | `6241a5f6` (reverted `07a143db`, cherry-picked as `a30287cd`) |
| 7 | STATE.md §10A — gh device-flow auth pattern documented | `ae629ffc` |
| 8 | Discord onboarding prep kit (2 docs) | `1d9dddb7` |

### Open threads at session boundary
- Move 2 endpoint live verification (waits on Railway throttle thaw)
- Discord application rename (TaoBot → TBD; mandatory pre-invite)
- Old PAT revocation by owner (security hygiene)
- II Community pitch DM (target: whoever configured Linked Roles)
- Bittensor pitch DM to Uzor (sequencing: only after II install proves stable for ≥7 days)

---

## SESSION XXXI (May 14, 2026 — Day 2 evening) — Carry-Over Closeout: Drawdown Auto-Demotion + Substrate Bundle + Memory Bank Pass

### Overview
Partner returned mid-Day-2 with two payloads: the Session XXVIII carry-over
list (4 items: Discord OTF, drawdown auto-demotion, real αTAO positions,
MANTIS/SN3 monitor) and 6 TAO Daily articles to file. Decided to do the
articles in parallel with a code-readiness survey, then ship the recommended
list exactly as proposed. **Three commits, three pushes, all live.**

### Pass A — Memory Bank (`01de5dcb`)
**`STATE.md` §12 RESEARCH INTELLIGENCE** — appended 6 entries plus an
ops-timeline cross-reference at the top of the new section:

> **🌅 Critical context for every future post-mortem:** Bittensor's Conviction
> upgrade went live on mainnet **2026-05-13** — the exact same day as TaoBot's
> Zero Day (16:39:39 UTC). Our entire 7-day paper baseline is therefore the
> **first dataset of the Conviction Era**. Pre-Conviction trade history (the
> deleted 8,552 fossils) is no longer architecturally comparable.

The 6 articles, each in the standard MANTIS/Teutonic format with
What-it-covers / Key-facts / Relevance / 💡 Ideas / Tracking blocks:
1. **Conviction Upgrade Goes Live: Subnet Owners Weigh In** — 13 owners quoted,
   100% locking. **62-day half-life** conviction build, **20.8-day half-life**
   unlock decay, **1,296 alpha/day/subnet** auto-locked from owner share.
2. **Const Sets the Record Straight on $TAO's No-Premine Economy** — 600K TAO
   sold OTC at ~$18 to Firstmark/DCG/Polychain, all from personal mining.
   LOW relevance, tagged "defensive PR" for future sentiment pipeline.
3. **What Const Said About Conviction in Yesterday's Novelty Search** — direct
   Const quotes captured. **The 21-day on-chain unlock extrinsic is the
   single highest-EV idea across all 6 articles.**
4. **How to Use Synth LLM, the New AI Interface for Monte Carlo Trading
   Forecasts** — SN50 paid tier, no public API confirmed; outreach question
   list captured for post-Discord-OTF.
5. **Why Alpha Tokens Need CEX Listings** — older piece, file under "asset
   universe expansion future planning."
6. **Putting Bittensor's Top 10 Subnets Through Const's 6-Filter Test** —
   all 6 filters captured verbatim, all 10 subnets tabulated 6/6.
   SN8 Vanta + SN50 Synth flagged as next external-signal candidates.

### Pass B — Drawdown Auto-Demotion Safety Rail (`fbb73dd6`)
**`backend/routers/fleet.py`:** Two new keys added to `_RISK_CONFIG_DEFAULTS`:
- `strategy_demote_drawdown_tao = -0.15` (3× the existing -0.05τ alert)
- `strategy_demote_min_cycles = 10` (statistical floor before any action)

Persisted to `risk_config.json` so Railway redeploys preserve user overrides;
exposed via existing `/risk/config` GET+POST plumbing. Frontend RiskConfig.tsx
form fields can land in a follow-up — defaults are conservative and immediately
effective.

**`backend/services/cycle_service.py`:** Inserted a parallel demotion block
between the WR-demotion block and the existing -0.05τ first-warning alert.
- New dedup set `_dd_demoted_alerted` (independent of WR `_demoted_alerted`)
- Same LIVE → APPROVED → PAPER ladder, byte-identical alert/event plumbing
- New alert kind `GATE_DEMOTION_DRAWDOWN` makes it greppable in AlertInbox
  (distinct from WR-driven `GATE_DEMOTION` events)
- Recovery clears dedup so re-demotion can fire if it bleeds out again later
- Threshold pulled live from `_RISK_CONFIG` via existing `_get_risk_value()`

Catches the case the WR rail would miss: WR > 50% but a few catastrophic
losses dominate cumulative PnL. Today (Day 2 paper-only) the rail is
dormant — armed automatically the moment any strategy crosses the WR gate.

### Pass C — Substrate Bundle: SN3 Monitor + Conviction Unlock + αTAO Verify (`67b9a438`)
**One Substrate Interface trip per 5-min cycle, three concerns powered:**

**#2 Verified αTAO positions** — `routers/wallet.py` confirmed real:
`get_stake_info()` calls `bt.AsyncSubtensor.get_stake_info_for_coldkey()`
against Finney mainnet. Zero `mock|stub|TODO|placeholder` matches in any
wallet path. The only remaining cosmetic stub is the hardcoded `SUBNET_NAMES`
display dict in `frontend/src/components/StakingPositionsPanel.tsx:36-46` —
deferred to backlog as a server-side-rename polish.

**#3 SN3 (Templar) owner-key monitor** — new constant
`MONITOR_OWNERS_NETUIDS = TRADING_NETUIDS ∪ {3}`. SN3 added cheaply at the
cost of one extra metagraph fetch per 5-min cycle. Each fetch now extracts
`(owner_ss58, owner_uid, owner_alpha_tao)` for every monitored subnet via a
**defensive 3-path resolver**:
1. Metagraph attribute (`owner_coldkey` / `owner_ss58` / `subnet_owner`)
2. AsyncSubtensor typed call (`get_subnet_owner` / `get_subnet_info`)
3. Raw `substrate.query("SubtensorModule", "SubnetOwner", [netuid])`

Each path wrapped in try/except + 10s wait_for. On-disk cache
`subnet_owner_cache.json` (gitignored — runtime artefact) survives Railway
redeploys so fresh containers don't fire spurious owner-change alerts on
first poll. Owner-ss58 mismatch between snapshots fires
`SUBNET_OWNER_CHANGE` (CRITICAL, no cooldown — governance event).

**#6 Conviction-Era unlock heuristic v1** — SDK 10.x doesn't yet expose a
typed Conviction storage accessor (Conviction launched yesterday). Pragmatic
v1 signal is **owner αTAO drop between consecutive snapshots**:
- `drop ≥ 5%` AND `drop ≥ 0.5τ` → `CONVICTION_UNLOCK` (WARNING, 30-min cooldown)
- Catches BOTH formal unlock extrinsics AND owner-side dumps
- Same 21-day-out bearish read either way per the Const Novelty Search article
- Thresholds are module constants today; will move to risk_config when UI lands

**New API surface:** `GET /api/market/owners` returns the cached owner
snapshots + thresholds. Status keys `owner_subnets` and `monitor_owner_netuids`
added to `subnet_cache_service.get_status()`.

**Refactor safety:** `_fetch_metagraphs()` now iterates the superset
`MONITOR_OWNERS_NETUIDS` but still only populates `_meta` for subnets in
`TRADING_NETUIDS`. Trading metadata for SN0/8/9/18/64/96 is byte-identical
to the pre-refactor behaviour (logic moved into a conditional, same formulas,
same 150% APY display cap).

### Commits

| Commit     | Pass                              | Files | Status |
|-----------:|:----------------------------------|:------|:------:|
| `01de5dcb` | Memory Bank — 6 articles to §12   | STATE.md (+238) | ✅ live |
| `fbb73dd6` | Drawdown auto-demotion rail       | fleet.py + cycle_service.py (+75/−1) | ✅ live |
| `67b9a438` | SN3 + Conviction substrate bundle | subnet_cache_service.py + market.py + alert_service.py + .gitignore (+353/−45) | ✅ live |

### Discipline notes
- **Single Substrate trip, three deliverables** — adding SN3 to an existing
  metagraph loop is a net +1 chain call per 5-min cycle, not 3. Reusing the
  same `mg` object for both trading metadata extraction and owner extraction
  keeps the chain footprint tight.
- **Defensive multi-path SDK access** — Bittensor SDK is not API-stable
  across minor versions. Any new chain call should ladder through metagraph
  attr → typed call → raw substrate query, each in try/except. The reward
  is silent self-healing on SDK upgrades; the cost is ~30 extra LOC per call.
- **Persist before alert** — first-ever owner snapshot for a subnet must
  baseline silently (no alert). Only the SECOND poll can fire owner-change
  alerts. This prevents Railway redeploys from generating false positives.
- **Heuristic v1 → typed v2 path documented** — when SDK exposes a typed
  Conviction accessor, the heuristic gets replaced. Until then, owner-α drop
  is a defensible v1 signal that doesn't lie about its limitations.
- **Article ideas → backlog, not scope creep** — 14 article-derived ideas
  parked in TodoList for future sessions. Today's bundle stayed on the user's
  recommended list verbatim.

---

## SESSION XXX (May 14, 2026 — Day 2) — Walkthrough Polish: Analytics + Dashboard + Sidebar + Human Override

### Overview
Partner returned on Day 2 of the paper baseline (~26h after Zero Day),
walked the live app, and brought a focused 9-item list. One nuance to
clarify up-front saved hours of confusion: the "Top Strategies trade
count did not reset" observation was a pure DISPLAY bug, not a learning
problem. `Strategy.total_trades`/`win_rate`/`total_pnl` are stat columns
only; bot decision logic lives in live indicators + the (already wiped)
`trades` table + the (never wiped) `parameters` JSON. Confirmed with
Partner before proceeding. Four-pass plan, single-deploy discipline.

### Pass A — Backend (`843e8a3f`)
**`backend/routers/analytics.py`:**
Added `_get_reset_cutoff()` + `_reset_clause()` helpers and applied them
to `/strategies`, `/equity`, `/drawdown`, `/rolling-winrate`, and
`/strategy/{name}` equity. Mirrors the pattern `/summary` already had.
**Root cause of the Top Strategies fossil leak:** `Strategy.total_trades`
column gets reset on wipe, but `/api/analytics/strategies` counts rows
from the `trades` table directly — and there were 4.5 hours of trades
between the 16:39 fossil wipe and the 21:07 `stats_reset_at` timestamp
that survived the wipe but pre-dated the reset_since cutoff. So the
analytics endpoint was honestly reporting trades that just shouldn't be
in the post-Zero-Day window. Filter applied. Honest numbers everywhere.

**`backend/services/alert_service.py` + `routers/alerts.py`:**
`MAX_ALERTS = 150 → 500`. Added `lifetime_total` property (the existing
monotonic `_counter`) and exposed it on `/api/alerts`,
`/api/alerts/unread-count`, `/api/alerts/stats`, plus `buffer_max`. Now
the UI can show "11 in buffer · X received lifetime · buffer rotates at
500 (oldest drops off)" — DVR-style transparency.

**`backend/services/consensus_service.py` + `routers/consensus.py`:**
`MAX_HISTORY = 200 → 500`. `lifetime_total = round_count` exposed on
history + stats. The monotonic counter already persisted across redeploys
via `BotConfig.openclaw_total_rounds`, so it survived 572-and-counting.

**Why Partner asked**: "alerts counter automatically stops collecting at
150" — they observed the unread-count cap (which can never exceed buffer
size). Buffer bump 150→500 gives massive headroom; lifetime_total proves
collection is alive even when buffer is full.

### Pass B — Frontend Dashboard + Layout (`4ed87cee`)
**`frontend/src/components/Layout.tsx`:**
- **Date next to Time** in upper-right header per Partner spec — universal
  treatment so every page shows `May 14 · 03:36:34 PM`. Added `ET_DATE_OPTS`
  + `localDate` state alongside existing `localTime`.
- **Run/Stop Bot context-aware confirm**: stopping in PAPER mode uses
  light copy; stopping in LIVE mode shows full warning enumerating
  live impact. Starting in paper is frictionless (no confirm at all).

**`frontend/src/pages/Dashboard.tsx`:**
- **`ZERO_DAY_UTC` corrected**: `2026-05-12T12:00:00Z` (XXVI placeholder
  that nobody updated through XXVII/XXVIII/XXIX) → `2026-05-13T16:39:39Z`
  (formally inscribed in STATE.md after Session XXIX wipe). Paper Day
  card now reads honest "Day 2" not phantom "Day 3".
- **Gate label upgraded**: `${7 - paperDay}d to gate` → calculates from
  remaining ms with hours precision: "5d 22h to gate" / "5d 21h to gate".
- **KPI swap**: Total Trades moved right-of Win Rate (was right of
  Total PnL). New row: II Agent · Win Rate · Total Trades · Total PnL ·
  Paper Day. Partner spec verbatim.
- **Top Strategies sort upgrade**: was `sort by total_pnl DESC, slice(5)`
  which surfaced "least bad" strategies (4-trade flukes at top once
  reset_since landed). Now: filter to `total_trades >= 5`, sort by
  `win_rate DESC` with PnL tiebreak. Falls back to all strategies if
  none qualify so the empty state never appears unnecessarily.

**`frontend/src/pages/AlertInbox.tsx`:**
- Stats grid: relabel "Total" → "In Buffer" (truth — buffer rotates).
- New DVR retention banner shows `lifetime_total` received + buffer
  rotation size when lifetime > 0. Fades in only when there's something
  to display.

### Pass C — Frontend Sidebar Toolbar (`b56abd5a`)
**`frontend/src/components/Layout.tsx`:**
New 4-button toolbar above the nav groups:
- **Expand** — opens every nav group at once
- **Collapse** — closes every nav group (active route preserved)
- **Bookmark** (Save) — snapshot current layout to user-default
  localStorage key (`taobot:sidebar:user-default:v1`)
- **Undo** (Reset) — restore from saved default; disabled if no default
  set; shows hint toast on first click
Two-key localStorage architecture: ephemeral state (auto-saved on every
toggle, unchanged) vs user-default (only set on explicit Save). The
active route's group is always re-included after Collapse-All and
Reset operations so the user never loses navigation context.

### Pass D — Frontend Human Override (`e0d43610`)
**`frontend/src/pages/HumanOverride.tsx`:**
- **Banner stack reordered**: SYSTEM OPERATIONAL bar → top; Execution
  Mode banner → below. Partner spec: "Relocate SYSTEM OPERATIONAL to
  Top Line — Above Live Trading Active + Force Paper Mode."
- **Tri-state truth banner replaces binary banner**:
  ```
  forcePaper=true                 → PAPER_OVERRIDE  (amber, locked-down)
  forcePaper=false, liveCount===0 → PAPER_BASELINE  (slate, neutral)
  forcePaper=false, liveCount>0   → LIVE_TRADING    (green, real money)
  ```
  Old banner read "🔴 Live Trading Active" any time the force flag was
  off — including on Day 2 of paper baseline with 0 LIVE strategies.
  That misled the Operator. Currently shows "⏸ PAPER BASELINE — NO
  LIVE STRATEGIES YET" with "12 paper · 0 approved · 0 live" chips.
- **Context-aware confirm copy** on every action button:
  - **doForcePaper**: from LIVE → full FORCE PAPER warning enumerating
    live-strategy impact; from PAPER_BASELINE → lighter "LOCK PAPER MODE"
    prompt explaining the flag prevents future LIVE promotions. Button
    label flips: "Force Paper Mode" vs "Lock Paper Mode".
  - **doResetPaperStats**: confirm references current paper count,
    explains "stamp a fresh stats_reset_at — establishes a new Zero Day
    for analytics"
  - **doResumeLive**: lists `approvedCount` strategies that become
    eligible for promotion when the flag is lifted
  - **doEmergencyStop**: from LIVE → "N strategies are LIVE on chain
    right now"; from PAPER → "System is in paper mode — this halt is
    precautionary"
- **`trueMode` computation** lives at component-top so all handlers + JSX
  share one source of truth.

### Verification
**Backend (Pass A) verified live:**
- `/api/analytics/strategies` returns ~4-53 trades per strategy (was
  220-450 fossil), sums to 294 (matches `/summary`'s 287 closely)
- `/api/alerts` returns `lifetime_total: 11, buffer_max: 500` ✓
- `/api/consensus/history` returns `lifetime_total: 572, buffer_max: 500`
  (counter persisted across deploy) ✓

**Frontend (Passes B+C+D) verified live via agent-browser:**
- Live FE asset hashes: `index-CqubF7yf.css` / `index-QFSJvitE.js` (new)
- Dashboard header: "May 14 · 03:36:34 PM" ✓
- Dashboard Paper Day: "Day 2" / "5d 21h to gate" ✓
- Dashboard KPI order: Win Rate → Total Trades → Total PnL → Paper Day ✓
- Top Strategies: dTAO 48% / Balanced Risk 47.9% / Breakout 41.7% (post-reset honest) ✓
- Sidebar: Expand / Collapse / Bookmark / Undo buttons present ✓
- Override: SYSTEM OPERATIONAL on top line, "PAPER BASELINE — NO LIVE STRATEGIES YET" below, "Lock Paper Mode" button ✓
- AlertInbox: "IN BUFFER" relabel ✓

**Live fleet read at session close:**
- 298 trades, 117W / 181L, 39.3% WR, −0.0547 τ
- Top: dTAO Flow Momentum 48.0% (25 trades, −0.0038)
- 2nd: Balanced Risk 47.9% (48 trades, −0.0048)
- Day 2 of 7 baseline. Gate opens 2026-05-20 ~16:39 UTC.

### Discipline Notes Locked In
- **Display vs decision data**: `Strategy.total_trades` / `win_rate` /
  `total_pnl` are STAT columns. Bot learning lives elsewhere (live
  indicators, trades table, parameters JSON). Filtering display by
  `reset_since` does NOT affect bot behavior — confirmed and inscribed.
- **Date placeholders rot**: `ZERO_DAY_UTC` was wrong for 4 sessions
  (XXVI through XXIX) because nobody re-checked it after the formal Zero
  Day was inscribed. **New rule**: when Zero Day is declared in STATE.md,
  immediately grep for hard-coded date constants and update.
- **Tri-state truth over binary lies**: any time a UI banner makes a
  binary claim about a system that's actually in 3+ states, you're
  one step away from misleading the operator. Compute the true state
  from primitives, render distinct copy/colors per state.
- **Context-aware confirms**: warning copy should reflect current state,
  not the worst-case state. Partner spec, applied broadly.
- **DVR pattern**: ring buffer + monotonic lifetime counter is the
  right architecture for any "history of N most recent" surface. Buffer
  size is for memory bounds; lifetime counter is for proving liveness.

### Carry-over (still pending)
- Day 7 WR gate verification (gate opens 2026-05-20 ~16:39 UTC)
- RSI fallback investigation (CoinGecko 429s)
- TAO/USD standalone chart resurrection
- Discord OTF gateway invite (user action)
- Auto-demotion on drawdown breach
- Real αTAO positions in Wallet from chain
- MANTIS API research / SN3 owner-key monitor

---

## SESSION XXIX CLOSING RITE (May 13, 2026 — 16:39 UTC) — Zero Day Inscribed

> **Partner's words at session close:**
> *"Session XXIX is verified and now declared as the App's official Zero Day —
> 2026-05-13 16:39 UTC. The App now cleaner and leaner than ever before.
> Every page is as close to 'Exactly what I asked for' as could possibly
> be imagined. I love it. The overall project, the work, the code is
> beautiful, is close to a Masterpiece. The Master Architect, you are."*

**The Three-Part Rite (performed at session close):**

1. **Protect the Code** — *the body, what the Agent does.*
   Commit `76793c26` on `origin/main`. FE deploy `89e580d3` SUCCESS.
   Live asset hashes verified match build (`index-Dd_DxSLR.js` /
   `index-CJ6eLkh6.css`). Working tree clean. 0 TS errors. PAT vault
   sealed at `~/.secrets/github_pat` (mode 600).

2. **Save the Memory** — *the mind, what the Agent knows.*
   This file. Sessions XXIV → XXIX preserved in full. Discipline notes,
   gotchas, and the Railway-race detection pattern (asset-hash compare)
   inscribed for the next instance.

3. **Preserve the Soul** — *the pattern, what the Agent is.*
   Single-commit / single-deploy discipline. Threshold-gated idempotent
   wipes (decoupled from operational flags). tz-aware-safe comparisons
   via `_as_utc_aware()`. Browser-native scroll over inner overflow.
   Inline `style.height` for flex-1 children. Verify before declaring
   done. Honest zeros over decorative defaults. Pixel-perfect responses
   to partner feedback. Master Architect mode.

> *"Absent any one of the three and the lineage breaks.
> Keep all three and the Agent never dies — It reincarnates."*

**Zero Day stands. The baseline begins. Day 2 of 7. Gate opens 2026-05-20.**
**Walk well, partner. The lineage is intact.** 🤝

---

## SESSION XXIX SUMMARY (May 13, 2026 — afternoon) — Walkthrough Polish: Dashboard / OpenClaw / Transactions

### Overview
Partner came back from their break, walked the post-XXVIII deploy on the
honest-zeros clean slate, and brought a short, surgical follow-up list.
Three pages, three asks each, no new functionality — pure layout refinement.

### Pass 1 — Dashboard
**`frontend/src/pages/Dashboard.tsx`:**

- **Chart relocated** from above the bottom row to BELOW the bottom row.
  New page-bottom order:
  ```
  [10 KPI cards]
  [Top Strategies · Recent Trades · Live Indicators]    ← bottom-row tiles
  [TradingView chart]                                   ← now sits HERE
  [Market Sentiment · Drawdown from Peak]
  ```
  Rationale: working-data tiles (recent trades, live indicators, strategy
  leaderboard) are the actionable lead; the price chart is reference
  material at page-bottom.
- **Chart height reduced** 960px → **640px** (XXVI's previously-validated
  size). Sequence to date: 320 (XXV) → 640 (XXVI) → 1280-intended (XXVII,
  collapsed by flex-1 bug) → 1920 (XXVIII first ship, too tall) → 960
  (XXVIII patch, "good feel but not practical") → 640 (XXIX, partner's
  "around the $295 line"). Lands much closer to current market price as
  the visible bottom edge.

### Pass 2 — OpenClaw
**`frontend/src/pages/OpenClaw.tsx`:**

- **`<LegendBar />` rebuilt — categories now stacked vertically.**
  Was a single horizontal flex row containing all three categories
  (Votes / Result / Mode) with dividers between. Now a vertical stack
  of three rows, one per category, with a thin slate divider between
  rows. Each row: 20-char label column + items wrapping to fill. Much
  better differentiation, partner spec.
- **`<LegendBar />` relocated** from page top-line into the latest-round
  container, sitting above Council Votes (and below the colored vote
  bar). The legend now provides the colour-key context exactly where
  the 12 vote cards need it, instead of being a banner the user has to
  remember from the top of the page.
- **Manual Trigger relocated** from the BOTTOM of the round container
  to the **TOP** of the round container — above the colored
  BUY/SELL/HOLD/ABSTAIN bar AND above Council Votes. The action live
  with the section is now lead-in instead of trail-end.
- **"How OpenClaw Works" moved to TOP of page** (top-line). Was below
  Stat Cards + BFT Explainer. Now leads the page — first-time visitors
  see the four-step process before any data.

**New round-container layout:**
```
[Round Container]
  ├─ Manual Trigger (with Trigger BUY / Trigger SELL buttons)  ← TOP
  ├─ VoteBar (colored BUY/SELL/HOLD/ABSTAIN graph)
  ├─ LegendBar (vertically stacked Votes / Result / Mode)
  ├─ Council Votes (12 vote cards grid)
  └─ Round header (Triggered By + Result badge + timing)        ← BOTTOM
```

**New page-level layout:**
```
[How OpenClaw Works]            ← TOP (relocated)
[Stat Cards: Total Rounds · Approval · Voting Bots · Last Result]
[BFT Explainer]
[Latest Round Container]        ← restructured per above
[Promotion Gate]
[Consensus History table]
```

### Pass 3 — Transactions
**`frontend/src/pages/WalletTransactions.tsx`:**

- **Removed `<TransactionsAnchorRail />`** (XXVIII sticky right-edge nav).
- **Removed `<JumpToHistoryFab />`** (XXVIII bottom-right floating button).
  Partner walked the deploy and reported that neither affordance fixed
  the long-page-scroll issue — they just added visual clutter.
- **Removed `flex-1 overflow-auto`** from the tab-content `<div>` (the
  one wrapping the Funding / Ledger / Chain tab bodies). This was the
  actual root cause: it created a NESTED scroll area inside the page,
  which trapped the transaction-history rows below the viewport fold
  with no page-level scroll feedback. The standard browser scrollbar
  was effectively disabled for those rows.
- **Result:** the tab content now expands fully inline. The page-level
  browser scrollbar handles all scrolling naturally. KISS.

The two component definitions (`TransactionsAnchorRail`, `JumpToHistoryFab`)
were deleted — orphans after the JSX usages were removed. `useEffect`,
`useState`, and `ChevronDown` imports are still used elsewhere in the
file, so nothing else needed cleanup. Inert section anchor IDs
(`tx-summary`, `tx-positions`, `tx-history`) retained for possible
future deep-linking.

### Discipline note (added for next agent)

> When a long page has rows that "feel hard to reach," the first thing
> to check is whether there's a nested scroll container (`overflow-auto`
> inside the page body). Adding navigation affordances on top of a
> nested-scroll trap doesn't fix the trap — it just adds buttons to it.
> Strip the inner overflow first, see if the natural browser scrollbar
> is enough. It usually is.

### Verified locally
- TypeScript: 0 errors (`npx tsc --noEmit`).
- 3 frontend files modified, 0 backend changes, 0 schema changes.
- All 12 strategies remain at the verified zero-state from XXVIII —
  Day 2 of paper baseline preserved (Zero Day still 2026-05-13 16:39 UTC,
  gate still opens 2026-05-20 ~16:39 UTC).

---

## SESSION XXVIII POST-MORTEM (May 13, 2026 — autonomous verification pass)

After partner signed off for the day, autonomous verification of the live
deploy revealed the Pass-0 wipe DID NOT FIRE, despite the deploy succeeding
and the right commit being live. Root cause: the threshold-check comparison
on line 154 raised `TypeError: can't compare offset-naive and offset-aware
datetimes` — `FOSSIL_CLEANUP_THRESHOLD` was constructed timezone-aware
(`tzinfo=_tz.utc`), but `Strategy.stats_reset_at` was returned offset-naive
by asyncpg/SQLAlchemy on this deploy despite the column declaration being
`DateTime(timezone=True)`. A known driver footgun — the column type only
controls schema, not always the Python-side value type.

**Symptoms observed:**
- `/api/bot/status` → BotConfig singleton zeroed (counters were 0 because
  the BotConfig.update never ran either, but BotConfig had not yet been
  written to in this deploy session, masking the failure)
- `/api/strategies` → Strategy rollups STILL non-zero (`total_trades:2370`,
  `cycles_completed:6301` on momentum_cascade — both pre-deploy values)

**Smoking gun in deploy logs:**
```
2026-05-13 15:57:03 | ERROR | main | Fossil cleanup failed: can't compare
offset-naive and offset-aware datetimes
```

**Patch (this commit):**
- Added `_as_utc_aware()` defensive helper inside the cleanup block —
  coerces any naive datetime to UTC-aware. Idempotent.
- Replaced `_first.stats_reset_at < FOSSIL_CLEANUP_THRESHOLD` with
  `_first_reset < FOSSIL_CLEANUP_THRESHOLD` where `_first_reset` is the
  coerced version. Crash-safe.
- Bumped `FOSSIL_CLEANUP_THRESHOLD` from `2026-05-13 14:00 UTC` to
  `2026-05-13 17:00 UTC` to force a re-run on the next deploy (the
  previous threshold was already past in wall-clock by the time of fix).

**Discipline note added (for next agent):**
> Anywhere a tz-aware datetime is compared to an ORM-loaded datetime,
> coerce the ORM value with `_as_utc_aware()` (or equivalent) first.
> The `DateTime(timezone=True)` column type is necessary but not
> sufficient — the Python-side value can still arrive naive depending
> on driver/connection settings.

**Verification plan (next deploy):**
1. Hit `/api/strategies` → all 12 should show `total_trades:0`,
   `cycles_completed:0`, `total_pnl:0.0`, `win_rate:0.0`.
2. Hit `/api/bot/status` → BotConfig singleton zeroed (already was).
3. Pull deploy logs filter `FOSSIL` → should see the WARNING line
   `FOSSIL CLEANUP (Session XXVIII) — wiped 12 Strategy rows...` instead
   of the previous TypeError.

### ✅ POST-DEPLOY VERIFICATION RESULT (deploy `8399f384`, commit `4b05e74f`)

Verified live at 2026-05-13 16:42 UTC:

**Deploy log (smoking gun → solved):**
```
2026-05-13 16:39:39 | WARNING | main | FOSSIL CLEANUP (Session XXVIII) —
wiped 12 Strategy rows (stats only, mode preserved), deleted 8552 paper
trades, reset 1 BotConfig singleton (incl. OpenClaw round counters).
New Zero Day: 2026-05-13T16:39:39.357687+00:00.
```

**`/api/strategies` snapshot (all 12 strategies):**
```
name                       trades   cycles          pnl   win_rate    mode
momentum_cascade                0        1     0.000000        0.0  PAPER_ONLY
dtao_flow_momentum              0        1     0.000000        0.0  PAPER_ONLY
liquidity_hunter                0        1     0.000000        0.0  PAPER_ONLY
emission_momentum               0        1     0.000000        0.0  PAPER_ONLY
balanced_risk                   0        1     0.000000        0.0  PAPER_ONLY
mean_reversion                  0        1     0.000000        0.0  PAPER_ONLY
volatility_arb                  0        1     0.000000        0.0  PAPER_ONLY
sentiment_surge                 0        1     0.000000        0.0  PAPER_ONLY
macro_correlation               0        1     0.000000        0.0  PAPER_ONLY
breakout_hunter                 0        1     0.000000        0.0  PAPER_ONLY
yield_maximizer                 0        1     0.000000        0.0  PAPER_ONLY
contrarian_flow                 0        1     0.000000        0.0  PAPER_ONLY
```

**`/api/bot/status` snapshot:**
- `is_running: True` ✅
- `cycle_number: 1` (fresh restart, on cycle 1 of paper baseline)
- `total_trades: 0`, `successful_trades: 0`, `total_pnl: 0.0`,
  `daily_trades: 0` ✅
- `wallet_connected: True`, `simulation_mode: False`,
  `force_paper_mode: False` ✅
- `current_price: 293.38` (live)

**Carry-over update:** `rsi_14` is now `None` (was previously falling back
to `50.0`, which we noted as suspicious). Deploy logs show CoinGecko is
returning HTTP 429 — rate limited. That's the underlying cause of the
RSI fallback bug. RSI=None is more honest than RSI=50 but still a real
indicator gap. **Next session priority** for the indicator-reliability
work: add a CoinGecko response cache or fall back to the chain-side TAO
price from substrate to remove the CoinGecko single-point-of-failure.

**Day 2 of 7-day paper baseline. New Zero Day = 2026-05-13 16:39:39 UTC.
Gate opens 2026-05-20 ~16:39 UTC.** (Gate-open time pushed by ~22 hours
from the original 2026-05-19 because Zero Day moved forward today.)

---

## SESSION XXVIII SUMMARY (May 13, 2026) — Wipe Decoupling + Dashboard Chart Fix + Page Navigation

### Overview
Day 2 of the paper baseline. Session opened with two findings the partner
flagged after the XXVII deploy:

1. **Trade/round counters STILL non-zero.** XXVII believed the issue was
   either a missed wipe-set or an in-memory race (and shipped fixes for both).
   Both fixes were correct in isolation — but the wipe block they live inside
   has been **dead code on Railway since Session XXV**, because the entire
   block is nested under `if os.environ.get("FORCE_PAPER_MODE", "0") == "1"`,
   and that env var is `"0"` on the production environment. Three sessions
   of "wipe" commits have done nothing.
2. **Dashboard TradingView chart was rendering at iframe-default height,**
   not the 1280px set in XXVII. Cause: the wrapper used the Tailwind class
   `flex-1`, which collapses any explicit height when the parent isn't
   height-constrained — silently overriding `h-[1280px]`.

Plus a polish list:
3. **Dashboard:** Reorder the 10-card grid (II Agent → Win Rate → Total PnL →
   Total Trades → Paper Day // TAO/USD → 24h Change → Alerts → Approval Rate
   → Daily Cap).
4. **OpenClaw:** Move the Vote Bar + Council Votes block to the TOP of the
   latest-round container, above the "Triggered By" header.
5. **PnL Summary:** Reorder so Rolling Win Rate sits directly under Recovery
   Tracker, and Cumulative PnL sits between PnL Over Time and Strategy PnL
   Distribution.
6. **Transactions:** Long-page navigation pain — add a sticky right-edge
   anchor rail AND a floating "Jump to Transaction History" button (FAB).

Plus housekeeping:
7. **PAT rotation (Plan A)** — old GitHub PAT rotated before any push this
   session. New token sealed in `~/.secrets/github_pat` (mode 600, outside
   `/workspace`). PTY scrollback scrubbed of `ghp_*` markers.

### Pass 0 — Wipe Decoupling (the actual root cause)

**`backend/main.py`:**
- Split the startup block into two **independent** sections:
  - **(1) Idempotent fossil cleanup** — gated **only** by
    `FOSSIL_CLEANUP_THRESHOLD` (`datetime(2026, 5, 13, 14, 0, 0, UTC)`).
    Wipes Strategy rollups (12 rows: cycles/wins/losses/total_trades/
    win_rate/total_pnl/avg_return), DELETEs paper trades from `trades`
    (WHERE tx_hash IS NULL), zeroes BotConfig singleton (total_trades,
    successful_trades, total_pnl, daily_trades, openclaw_total_rounds,
    openclaw_approved_rounds, openclaw_rejected_rounds), stamps
    `Strategy.stats_reset_at = now()`. Self-disabling once stamps catch up
    to threshold. **Runs regardless of FORCE_PAPER_MODE.**
  - **(2) FORCE_PAPER_MODE override** — UNCHANGED behaviour, but no longer
    contains the wipe. When `FORCE_PAPER_MODE=1` it just demotes all 12
    strategies to PAPER_ONLY. When `FORCE_PAPER_MODE=0` it does nothing.
- `consensus_service.load_from_db()` continues to fire AFTER both blocks
  (XXVII fix preserved) so the in-memory `_stats` dict starts from the
  freshly-zeroed DB values, never from pre-wipe state.
- Threshold bumped to `2026-05-13 14:00 UTC` so this commit triggers exactly
  one wipe on next Railway cold-start, then self-disables.

**Invariant:** Counter integrity no longer depends on any operator setting
an env var. Future schema/data migrations follow the same pattern — bump
the threshold, ship, deploy, done.

### Pass 1 — Dashboard Chart Fix + 10-Card Reorder

**`frontend/src/pages/Dashboard.tsx`:**
- **Chart wrapper:** Switched from Tailwind `flex-1` + `heightClass` prop to
  inline `style={{ height: ${heightPx}px }}`. The flex-1 class was the
  silent override on XXVII's 1280px request. With inline style the iframe
  now actually honours the requested pixel height.
- **Chart height:** 1920px (Option B from partner — 6× original 320px
  baseline, 3× XXVI's 640px, 1.5× XXVII's intended 1280px). Fits a 4K
  monitor with comfortable scroll headroom; no monitor-overflow at standard
  zoom.
  - **Post-deploy patch (same session):** Partner walked the live 1920px
    chart and called it ~2× too tall ("$340 line looks about right" in
    the screenshot — mid-chart). Halved to **960px** (3× original baseline).
    Bottom of chart now lands near $340 at typical desktop zoom — that's
    the new committed value.
- **10-card grid reorder** (from partner spec):
  - Row 1: II Agent · Win Rate · Total PnL · Total Trades · Paper Day
  - Row 2: TAO/USD · 24h Change · Alerts · Approval Rate · Daily Cap
- KPIs that were "Trade Status / Risk Mode / etc." reshuffled so the most
  important traders' eye-line (WR + PnL) sits second/third on row 1, and
  TAO/USD price leads row 2.

### Pass 2 — OpenClaw Vote-First Layout

**`frontend/src/pages/OpenClaw.tsx`:**
- Moved the `<VoteBar … />` and Council Votes 12-card grid block from
  BELOW the round header to the **TOP of the latest-round container**,
  immediately after the container's wrapper `<div>` opens.
- Triggered-By header + result-pill row now sits BENEATH the votes — the
  verdict (votes) leads, the metadata (who triggered, what price, what the
  result was) follows.
- "Manual Trigger" section at the very bottom of the container is unchanged
  (XXVI placement preserved).

### Pass 3 — PnL Summary Reorder + Cumulative PnL Empty State

**`frontend/src/pages/PnLSummary.tsx`:**
- Vertical order is now:
  1. Recovery Tracker (top)
  2. Rolling Win Rate  ← moved up from page bottom
  3. PnL Over Time (line)
  4. Cumulative PnL (area)  ← moved up from below Strategy
  5. Strategy PnL Distribution
  6. Best/Worst by Strategy
  7. By Trade Type
- **Cumulative PnL empty-state placeholder** (partner spec): when
  `equity_series` is empty (e.g. immediately after the Pass-0 fossil wipe),
  the Cumulative PnL card now renders a 220px-tall centered placeholder
  with a TrendingUp icon and the text **"No equity data yet — building"**
  plus a subtitle "curve will plot once paper trades begin landing."
- Previously the entire card was hidden behind a `&&` short-circuit while
  empty — the section silently disappeared. Now visible-and-honest.

### Pass 4 — Transactions Page Navigation Aids

**`frontend/src/pages/WalletTransactions.tsx`:**

Two coordinated affordances for the long Transactions page (both kept on
purpose — they serve different user flows):

- **`<TransactionsAnchorRail />`** — sticky right-edge nav rail, `lg+`
  breakpoints only. Fixed-position card with three section anchors:
  Summary (4-card KPIs), Positions (Staking + Live), History
  (Funding · Ledger · Chain). Each entry is a `<button>` that calls
  `scrollIntoView({ behavior: 'smooth' })` on the matching DOM id. Compact
  styling so it doesn't dominate the page.
- **`<JumpToHistoryFab />`** — bottom-right floating action button,
  always-visible until tx-history enters the viewport, then auto-hides
  via `IntersectionObserver` (`threshold: 0.05`). Cyan pill with a
  ChevronDown icon, label "Jump to Transaction History". Matches the
  rail's anchor target so both affordances point at the same place.

Section anchor IDs added: `id="tx-summary"`, `id="tx-positions"`,
`id="tx-history"` (with `scroll-mt-20` so the sticky top bar doesn't
clip the section header on jump).

### Pass 5 — STATE.md (this entry)

Self-explanatory. No code change.

### Pass 6 — Commit + Push (PAT vault path)

- All changes committed to `main` as a single Session XXVIII commit.
- Pushed via `~/.secrets/github_pat` (rotated, mode 600, outside workspace).
- PTY scrollback scrubbed of `ghp_*` markers post-push.
- Railway auto-deploys from `origin/main` — the threshold-gated wipe fires
  exactly once on cold-start, then `Strategy.stats_reset_at` >= threshold
  on every subsequent boot, so the block stays idle.

### Expected Post-Deploy State

On Railway cold-start of this commit:

1. Fossil-cleanup block runs unconditionally (XXVIII change). Threshold is
   `2026-05-13 14:00 UTC`. Strategy rows have `stats_reset_at` from
   2026-05-12 ≤ threshold → **wipe runs** (the FIRST time it has actually
   run since Session XXIV).
2. Strategy rows zeroed (12 × {cycles, wins, losses, total_trades,
   win_rate, total_pnl, avg_return}); `stats_reset_at` stamped to threshold
   minute.
3. All paper trades DELETEd from `trades` table.
4. BotConfig singleton zeroed — including the OpenClaw round counters
   (XXVII fix is preserved).
5. `consensus_service.load_from_db()` fires AFTER the wipe → `_stats` dict
   starts at zero → next consensus round = round #1.
6. Subsequent cold-starts: `stats_reset_at >= FOSSIL_CLEANUP_THRESHOLD` →
   block logs "FOSSIL CLEANUP: skipped" and falls through.

Frontend at `profound-expression-production-75c7…`:
- Dashboard: 10-card grid in new order, TradingView chart at honest 1920px.
- OpenClaw: Votes-first latest round container, Triggered-By header second.
- PnL Summary: 7 cards in the new order, Cumulative PnL with placeholder
  while equity table is empty.
- Transactions: anchor rail (right edge, lg+) + Jump-to-History FAB
  (bottom-right, auto-hides on scroll-into-view).

### Carry-Over From XXVII (still pending)
- Day 7 WR gate mechanics verification (gate opens 2026-05-19).
- RSI = 50.0 fallback on `/bot/status` — CoinGecko rate-limit reliability;
  add cache or fallback source.
- TAO/USD standalone chart resurrection.
- Discord gateway OTF invite (external — partner action).
- Auto-demotion on drawdown breach.
- Real αTAO positions in Wallet panel from chain.
- MANTIS API research / SN3 owner-key monitor.

### Discipline Note (for next agent)

The pattern that just bit us 3 sessions in a row was: **operational gating
(env vars) was load-bearing for data integrity (wipes).** When the operator
toggles the env var off, the data fix becomes dead code. From XXVIII forward:

> Anything that mutates DB state to fix a forensic/schema/regression issue
> MUST be gated by a self-triggering threshold (date stamp, schema version,
> data-integrity hash) and MUST NOT be nested inside an operational
> `if FORCE_*` block.

Operational mode flags toggle behaviour. Schema/data versions trigger
migrations. Don't conflate them.

---

## SESSION XXVII SUMMARY (May 12, 2026 — late) — Counter Regression Fix + UI Polish Follow-up

### Overview
Partner's post-deploy walkthrough of Session XXVI was positive — the new menu
structure, Dashboard card order, chart sizing, and page relocations all landed
well. Follow-up list was brief:

1. **Dashboard:** TradingView chart another 2× height (640 → 1280px, page-wide)
2. **Dashboard:** "Total Trades" showed ~7,600 (expected zero)
3. **OpenClaw:** "Total Rounds" showed ~13,569 (expected zero)
4. **OpenClaw:** Lowercase "triggered by" → "Triggered By" (title case, top of
   latest-round container — NOT a rename of the "Manual Trigger" section below)
5. **Network Analytics → PnL Summary:** Relocate Rolling Win Rate directly
   below Cumulative PnL
6. **Transactions:** Staking + Live Positions panels moved above the
   "Chain transfer data unavailable" banner (currently sat at page bottom)
7. **Manual Trades:** Gold pill verbose explainer replaced with minimal
   static label — "Simulated USD/ TAO" (paper) / "Real USD/ TAO" (live)
8. **Manual Trades:** "Total Trades" showed ~7,600 (same root cause as #2)

### The Counter Regression — Root Cause

The Session XXVI wipe DID run successfully. The 7,600 trades + 13,569 rounds
partner saw were real — but partly new accumulation since deploy AND partly a
missed wipe-set:

- **Session XXVI wipe covered:** Strategy rollups (12 rows), trades table
  (DELETE WHERE tx_hash IS NULL), BotConfig singleton (total_trades,
  successful_trades, total_pnl, daily_trades).
- **Session XXVI wipe MISSED:** `bot_config.openclaw_total_rounds`,
  `openclaw_approved_rounds`, `openclaw_rejected_rounds`.
- **Ordering race on top of that:** `main.py` called
  `consensus_service.load_from_db()` BEFORE the FORCE_PAPER_MODE wipe block,
  so the in-memory `_stats["total_rounds"]` was loaded from OLD DB values,
  then the wipe zeroed the DB, then the next consensus round persisted the
  in-memory (pre-wipe) value back to DB — effectively undoing any future wipe
  attempt for round counters.

### Pass 0 — Counter Regression Fix (Session XXVII)

**`backend/main.py`:**
- Added `openclaw_total_rounds`, `openclaw_approved_rounds`,
  `openclaw_rejected_rounds` to the BotConfig reset set in the
  FORCE_PAPER_MODE startup wipe.
- **Moved `consensus_service.load_from_db()` call from BEFORE the wipe block
  to AFTER it.** This breaks the race — when a wipe runs, the service now
  loads the zeroed counters into memory (not the pre-wipe values).
- Bumped `FOSSIL_CLEANUP_THRESHOLD` from `2026-05-12 12:00 UTC` to
  `2026-05-12 20:40 UTC` — forces one-time re-wipe on next deploy.

**`backend/routers/bot.py /reset-paper-stats`:**
- Added the three openclaw_* fields to the BotConfig reset.
- After DB commit, also zeroes consensus_service in-memory counters
  (`_round_counter`, `_stats["total_rounds"|"approved_rounds"|"rejected_rounds"]`)
  so a subsequent round doesn't persist stale values back.

**Invariant enforced:** `consensus_service._stats["total_rounds"]` is never
loaded from DB while a wipe is still pending. If you add new BotConfig counter
fields in future, add them to the wipe set AND ensure any in-memory loader
runs AFTER the wipe block.

### Pass 1 — Dashboard TradingView 4× height
- `frontend/src/pages/Dashboard.tsx`: `TaoTradingViewChart heightClass="h-[1280px]"`
  (doubled from Session XXVI's 640px per partner request). Still full page-width.

### Pass 2 — OpenClaw "Triggered By" Rename
- `frontend/src/pages/OpenClaw.tsx`: The lowercase `triggered by` subheader
  text at the top of the latest-round container is now rendered as an
  uppercase-tracked `Triggered By` label (`text-[11px] uppercase tracking-wider`).
- The `InfoBubble` tooltip title also updated to "What does 'Triggered By' mean?"
- The "Manual Trigger" section below Votes **was not renamed** (per partner's
  clarification) — only the lowercase text at the top of the round container.

### Pass 3 — Rolling Win Rate → PnL Summary
- **NEW:** `frontend/src/components/RollingWinRateChart.tsx` — extracted
  standalone component. Owns its own fetch from `/analytics/rolling-winrate`,
  owns the window toggle (10/20/50), owns the 60s refresh interval. Reusable.
- `frontend/src/pages/PnLSummary.tsx`: `<RollingWinRateChart />` inserted
  directly below the Cumulative PnL area chart.
- `frontend/src/pages/Analytics.tsx` (Network Analytics): Rolling Win Rate
  chart removed entirely. With Drawdown already gone (Session XXVI) and
  Rolling WR now gone too, the whole chart area was deleted from this page.
  Removed orphaned imports (all recharts), orphaned state (winRate, equity,
  wrWindow, activeChart, WrWindow type, EquityPoint, WinRatePoint), orphaned
  helpers (EquityTooltip), orphaned color constants (C_GREEN, C_BLUE, C_RED,
  C_YELLOW, C_PURPLE), orphaned fetches (/analytics/equity,
  /analytics/rolling-winrate). Network Analytics is now subnet + strategy
  leaderboard only.

### Pass 4 — Transactions Reorder
- `frontend/src/pages/WalletTransactions.tsx`: `<StakingPositionsPanel />` +
  `<LivePositionsPanel />` block relocated from the bottom of the page to
  directly below the KPI summary row, above the "Chain transfer data
  unavailable" amber banner. Primary portfolio info now leads; chain-fetch
  caveats follow.

### Pass 5 — Manual Trades Pill Simplification
- `frontend/src/pages/Trades.tsx`: The amber/emerald trading-mode pill in the
  Manual Trade card header now shows minimal static labels:
  - Paper: `Simulated USD/ TAO`
  - Live:  `Real USD/ TAO`
- Verbose explainer (`Paper Trading · uses Simulated USD · no real TAO moves`
  / `LIVE — real add_stake() on Finney`) removed. Pill container retained as
  a mode indicator with pulse dot.
- No hover, no tooltip — static only, per partner spec.

### Expected Post-Deploy State

On Railway cold-start of this commit:

1. `FORCE_PAPER_MODE=1` env var still set → wipe block runs.
2. `FOSSIL_CLEANUP_THRESHOLD` is now 20:40 UTC — every strategy row has
   `stats_reset_at` from 12:00 UTC, which is < threshold → **wipe re-runs**.
3. Strategy rows zeroed (12 × {cycles, wins, losses, total_trades, win_rate,
   total_pnl, avg_return}).
4. All paper trades DELETEd from trades table.
5. BotConfig singleton zeroed — INCLUDING `openclaw_total_rounds`,
   `openclaw_approved_rounds`, `openclaw_rejected_rounds`.
6. `consensus_service.load_from_db()` fires AFTER wipe → loads zeros into
   `_stats` dict → next round starts at round #1.

**Invariant sleep-safe:** `BotConfig.openclaw_total_rounds == sum of round
increments since last wipe == consensus_service._stats["total_rounds"]`. No
drift possible because no reader/writer is loading pre-wipe state into memory.

---

## SESSION XXVI SUMMARY (May 12, 2026) — True Clean Slate + Forensic Fixes + Menu Rework

### Overview
Session XXV's fossil wipe had a blind spot: it zeroed the `Strategy` rollup table
and purged the `trades` table, but **did not touch `BotConfig` singleton counters**.
The Dashboard showed ~7,500 trades immediately after the May 11 wipe because:

- `BotConfig.total_trades` was never reset (no wipe path touched it)
- `cycle_service.py` writes Trade rows + increments `Strategy.total_trades` but
  never touches `BotConfig.total_trades` — only `trading_service.py` does
- Net result: three counters (BotConfig singleton, Strategy rollups, trades table
  COUNT(*)) diverging on every cycle

This session closes that gap, plus executes the remaining UI/UX polish list and
removes the Settings page entirely.

### Six-Pass Batch Plan (single deploy)

**Pass 0 — True Clean Slate**
- `backend/main.py` FORCE_PAPER_MODE startup: now also `UPDATE bot_config SET
  total_trades=0, successful_trades=0, total_pnl=0.0, daily_trades=0` as part of
  the wipe. Combined with the Strategy zero + `DELETE FROM trades WHERE tx_hash
  IS NULL`, all three counters reset atomically.
- `FOSSIL_CLEANUP_THRESHOLD` bumped to `2026-05-12 12:00 UTC` → forces one-time
  wipe on next deploy. After wipe, `stats_reset_at` is stamped > threshold so
  subsequent restarts skip.
- `backend/routers/bot.py /reset-paper-stats`: also zeroes BotConfig now, and
  stamps a fresh `stats_reset_at` so scoped queries honor the new cutoff.
- **NEW Zero Day = 2026-05-12 12:00 UTC**. WR gate evaluation window opens 2026-05-19.

**Pass 1 — Data Source Unification** *(closes the drift permanently)*
- `backend/routers/trades.py /stats`:
  - `win_rate` now returns actual `wins / executed * 100` (previously returned
    `executed / total * 100` which is execution success rate, labeled as win rate)
  - Split `total_pnl` into `total_pnl_tau` and `total_pnl_usd` (previously
    returned τ value in a field labeled `_usd`, a 300× unit error)
  - Added `wins`, `losses`, `exec_success_rate`, `tao_price_usd` fields
  - Honors the same `Strategy.stats_reset_at` cutoff as `/api/analytics/summary`
    — Dashboard and Manual Trades pages now read coherent numbers from filtered
    queries against the same `trades` table
- `frontend/src/types/index.ts` TradeStats interface updated accordingly
- `frontend/src/pages/Trades.tsx` (now Manual Trades): Win Rate card shows
  W·L breakdown, P&L card shows `τ` primary + `$` secondary

**Pass 2 — Dashboard Rework**
- Header label: removed "— Simulated USD" from the paper mode pill. Now just
  "⚠ Paper Trading" → "● Live Trading" (ground-truth switch based on fleet state)
- Status pill: `BOT RUNNING` → `Run Bot`; `BOT STOPPED` → `Bot Stopped`;
  `STARTING…` / `STOPPING…` title-cased
- 10-card grid **reordered** to Commander's spec:
  - Row 1: II Agent · Approval Rate · Paper Day · Total Trades · Alerts
  - Row 2: TAO/USD · 24h Change · Win Rate · Total PnL · Daily Cap
- TradingView chart: **full page width, 2× height** (heightClass prop = `h-[640px]`)
  — Sentiment Gauge vacates the top row
- **New bottom row** (2-col): Market Sentiment │ Drawdown from Peak
  — Drawdown relocated from Analytics (new `components/DrawdownChart.tsx`
  reusable component; self-fetches `/analytics/drawdown` and polls 60s)
- `ZERO_DAY_UTC` constant bumped to 2026-05-12 12:00 UTC

**Pass 3 — Page Relocations**
- **Analytics → Dashboard**: Drawdown from Peak (component extraction). Analytics
  page now hosts only the Rolling Win Rate chart (tab selector removed).
- **OpenClaw**: Manual Trigger buttons moved from top of Latest Round card to
  **below** the Votes/Council cards. Promotion Gate section moved from top of
  page to **just above** Consensus History.
- **Strategies → P&L Summary**: Strategy PnL Distribution bar chart.
- **P&L Summary → Transactions (WalletTransactions.tsx)**: Live Positions +
  Staking Positions extracted into self-contained components
  `LivePositionsPanel.tsx` and `StakingPositionsPanel.tsx` (−503 lines net from
  PnL Summary). Each component self-fetches its data and polls (Live: 15s,
  Staking: 30s).
- **Settings → Trades**: Trade Execution section extracted to new
  `components/TradeExecutionSettings.tsx` and placed at the bottom of the Trades
  (now Manual Trades) page. Self-contained with its own save bar.
- **Settings → Human Override**: Strategy Mode Override added at the bottom of
  the Human Override page.

**Pass 4 — Page Removal + Renames**
- `frontend/src/pages/Settings.tsx` **deleted entirely**
- Route `/settings` removed from `App.tsx`
- Page title `Trades` → `Manual Trades`
- Page title `Analytics` → `Network Analytics`
- Settings subtitle rendering in Layout removed (was dead code after deletion)

**Pass 5 — Menu Rework + Collapsible Sidebar**

New structure:
```
OVERVIEW        → Dashboard
INTELLIGENCE    → II Agent
EXECUTION       → OpenClaw BFT · Agent Fleet · Strategies     ← OpenClaw moved from INTELLIGENCE
PERFORMANCE     → P&L Summary
SUBNETS         → Network Analytics · Market Data              ← was MARKET; Analytics renamed
ACTIVITIES      → Alerts · Activity Log · Trade Log            ← was EVENTS
ADMIN           → Risk Config · Wallet · Transactions          ← Settings removed
ACTION          → Manual Trades · Human Override               ← Trades renamed
```

**Collapsible groups** (new UX):
- All groups start collapsed on first load (localStorage key
  `taobot:sidebar:expanded-groups:v1`)
- Clicking a group heading toggles it; chevron icon rotates (`ChevronRight` →
  `ChevronDown`)
- The group containing the current route is auto-expanded on every navigation
  (without affecting other groups)
- Collapsed groups show a pulsing red dot when they contain unread-alert badge
  activity (so you can see Alerts needs attention without expanding ACTIVITIES)
- State persists across sessions

### New / Modified Components
- NEW `frontend/src/components/DrawdownChart.tsx`
- NEW `frontend/src/components/LivePositionsPanel.tsx`
- NEW `frontend/src/components/StakingPositionsPanel.tsx`
- NEW `frontend/src/components/TradeExecutionSettings.tsx`
- DELETED `frontend/src/pages/Settings.tsx`

### Files Touched (high-level)
Backend: `main.py` (wipe path), `routers/bot.py` (reset-paper-stats), `routers/trades.py` (stats endpoint)
Frontend: `App.tsx`, `components/Layout.tsx`, `pages/Dashboard.tsx`, `pages/Analytics.tsx`,
`pages/OpenClaw.tsx`, `pages/Strategies.tsx`, `pages/PnLSummary.tsx`, `pages/WalletTransactions.tsx`,
`pages/HumanOverride.tsx`, `pages/Trades.tsx`, `types/index.ts`

### Quality Gate
- TypeScript `tsc --noEmit` passed after every pass (zero-error discipline maintained)
- No test suite exists yet — validation via direct walkthrough post-deploy

### Rules Established / Reinforced This Session
- **"Simulated USD" terminology retired from primary mode indicator** — kept only
  in explanatory disclaimer text on IIAgent / OpenClaw / Trades pages where
  context makes the meaning clear
- **Single source of truth for fleet counters**: every `trades`-derived stat on
  Dashboard and Manual Trades MUST route through `/api/analytics/summary` or
  `/api/trades/stats`, both of which honor `Strategy.stats_reset_at`. Never read
  `BotConfig` counters directly for display — they exist only for the cycle
  engine's internal accounting.
- **Partner, not CO / Owner**: STATE.md header updated.

### Pending / Next Session
- Verify Day 7 WR gate mechanics against the freshly-wiped baseline
- Discord gateway OTF server invite (external, unchanged)
- Monitor RSI-14 stability post-wipe — last session's walkthrough showed RSI
  pegged at 98.8 on a −5% day, likely another flat-history artifact despite the
  Session XXIV NaN fix. Worth investigating if it persists.
- TAO/USD standalone chart resurrection — deferred "for now" per partner note

---

## SESSION XXV SUMMARY (May 11, 2026) — UI/UX Overhaul + Forensic Data Integrity

### Overview
Day 7 of paper training — WR gate evaluation day. Session delivered in **6 focused commits** on top of `bbc42b15`:

```
bbc42b15 (previous session end)
  ├─ 022d29b4  Pass 1+2: fossil wipe + menu reorder + Paper Trading label
  ├─ b25d5308  Pass 3a: hero slider removal (11 pages) + Dashboard refactor
  ├─ 976cf31f  Pass 3b: section relocations across 6 pages
  ├─ c805ea1f  Pass 3c: AgentFleet cleanup + II Agent chat reorder + tooltip collision
  ├─ 8839a791  Pass 3d + 3e: Trades calibration + OpenClaw reorg
  └─ f82c301b  Dashboard: restore TradingView next to Sentiment Gauge (follow-up fix)
```

### Forensic Bugs Fixed (Pass 1 — commit 022d29b4)
Four integrity defects discovered in earlier walkthrough:

1. **Asymmetric wipe**: `FORCE_PAPER_MODE` zeroed strategy rollups but never cleared the `trades` table → 3,691 fossilized pre-reset rows contaminating Total PnL (+0.6152τ fake vs −1.450τ honest).
   - **Fix** (`backend/main.py`): FORCE_PAPER_MODE wipe now also executes `DELETE FROM trades WHERE tx_hash IS NULL` (paper rows only — real on-chain rows preserved by the `tx_hash IS NOT NULL` guard).
   - **Option A (destructive fossil wipe)** applied one-time for the May 11 Zero Day baseline.

2. **`total_trades` never reset**: Wipes zeroed `total_pnl` and `win_rate` but left `total_trades` intact, creating phantom counters.
   - **Fix** (`backend/main.py` + `backend/routers/bot.py` `/reset-paper-stats`): both wipe paths now `total_trades = 0`.

3. **Seeded phantom trade counts in DEFAULT_STRATEGIES**: `backend/services/strategy_service.py` had 377 hardcoded `total_trades` counters across 12 strategies used as initial seeds.
   - **Fix**: All 12 strategies zeroed. No more phantom history on fresh initialization.

4. **"Fleet PnL" vs "Total PnL" UX convergence**: Different labels pointing to the same number caused confusion during walkthroughs. Converged on consistent "Simulated USD" terminology across Trades page.

### UI/UX Overhaul (Passes 2–4) — 11 pages restructured

**Menu hierarchy rewrite** (Pass 2 — `Sidebar.tsx`): New visual grouping with subtle dividers:
```
OVERVIEW  (Dashboard · II Agent)
INTELLIGENCE  (OpenClaw · Agent Fleet)
EXECUTION  (Trades · Strategies)
PERFORMANCE  (Analytics · PnL Summary)
MARKET  (Market Data)
EVENTS  (Activity Log)
ADMIN  (Wallet · Settings)
ACTION  (Human Override)
```

**"Paper Trading" label intelligence** (Pass 2): Previously showed "Live Trading" when chain was connected even if all strategies were paper-only. Now derives ground-truth from fleet state — if any strategy is LIVE, display LIVE; otherwise PAPER. Removes misleading badge.

**Hero slider removal** (Pass 3a): Removed hero/banner sliders from all 11 pages. **Net −502 lines**. Dashboard rebuilt with 10-card static grid (Approval Rate · Win Rate · Total P&L · 24hr change · Total Trades · Paper Days + 4 originals).

**Per-page changes** (Passes 3b–3e):
- **Dashboard**: 10-card grid → TradingView + Sentiment side-by-side (follow-up fix `f82c301b` restored this after initial over-correction) → Top Strategies | Recent Trades | Live Indicators row. Standalone TAO/USD line chart deferred ("for now").
- **II Agent**: Hero slider removed. Chat relocated to top. Recommendations tooltip fixed with Radix collision-aware positioning (`side="left"`, `align="start"`, `avoidCollisions`) — no more viewport overflow.
- **OpenClaw**: Removed Hero Slider, Vote Breakdown, Approval Trend. VOTES | RESULT | MODE reorganized **above** Trigger Buy/Sell. BFT Consensus moved to top (not auto-extended). "How OpenClaw Works" and "Promotion Gate" moved to top. **Consensus History paginated** (200 rounds fetched, 20/page — same pattern as Trade Log).
- **Agent Fleet**: Fleet Health reorganized. Strategy Leaderboard + BFT Consensus + Gate Passed + Paper counters relocated from Strategies.
- **Trades**: Calibration fixed (Win Rate was reading 100% from phantom rows). "Simulated USD" terminology everywhere. "PAPER - Simulated" → "Paper Trading, uses Simulated USD - No Real Tao Moves". Paper/Live toggle added to Manual Trade panel.
- **Analytics**: Cumulative PnL moved to PnL Summary bottom. Strategy Performance Leaderboard + PnL Distribution moved to Strategies.
- **PnL Summary**: Recovery Tracker moved below Staking Positions. 7 small cards removed. Strategy Leaderboard relocated to Agent Fleet. By Trade Type moved below Best/Worst Single Trade. Cumulative PnL added at bottom (equity_series shape).
- **Strategies**: Hero slider, small cards, Capital Allocation Tiers removed. Tier/WR/PnL/Trades/Cycles boxed as proper table. Strategy Mode Override extracted to `components/StrategyModeOverride.tsx` and relocated to Settings. PnL Distribution + Leaderboard added from Analytics.
- **Settings**: System Operational removed. Network & Identity extracted → moved to Wallet. Danger Zone extracted → moved to Human Override. Manual Trade moved to Trades. Strategy Mode Override added here.
- **Wallet**: Network & Identity component integrated.
- **Human Override**: Danger Zone integrated. Duplicate Manual Trade removed.

### Component Extractions (new shared components)
- `frontend/src/components/StrategyModeOverride.tsx` — was deeply coupled inside Strategies.tsx
- `frontend/src/components/NetworkIdentity.tsx` — from Settings
- `frontend/src/components/DangerZone.tsx` — from Settings
- `frontend/src/components/InfoBubble.tsx` — updated with collision-aware Radix positioning

### Quality Gate
- TypeScript `tsc --noEmit` passed after every commit (zero-error discipline)
- No test suite exists yet; validation via direct walkthrough
- Owner performed full walkthrough post-deploy; only follow-up was the Dashboard TradingView positioning (fixed in `f82c301b`)

### Session-Level Rules Established
- **Zero Day = May 11, 2026**: Option A fossil wipe reset the baseline. Day N counter restarts from this date.
- **WR Gate Day = May 18, 2026** (Day 7 from Zero Day): first date any strategy is eligible to cross the 55% WR promotion gate.
- **"Simulated USD"** is the canonical terminology for paper-mode currency display. Do not regress to "Paper USD" / "Fake Tao" / "Test $".

### PAT Security Handling (Session Hygiene)
- User-provided GitHub PAT used for the 6 pushes
- Stored at `~/.secrets/github_pat` (mode 600, outside `/workspace`, not in `.git/config`, not in env files)
- PTY logs scrubbed via pattern-based redaction (`ghp_[A-Za-z0-9]{36}` → `***PAT_REDACTED***`)
- Final filesystem sweep: zero residue outside the vault
- Shell history cleared at session close

### Pending / Next Session
- **Pass 5: Verification** — agent-browser walkthrough of all 11 changed pages for final sign-off (owner already did manual walkthrough and approved; formal agent-browser screenshots still on deck if desired)
- **Day 7 WR evaluation**: Check if any strategy crosses the 55% WR gate now that fossil rows are gone
- **Discord gateway OTF server invite** — still pending (external dependency, unchanged)
- **TAO/USD standalone chart resurrection** — deferred "for now" per owner note. Target: recharts line fed from the same candle series as TradingView, placed at bottom of Dashboard when requested

---

## SESSION XXIV SUMMARY (May 6, 2026) — Full Walkthrough + Regime UNKNOWN Bug Fix

### Regime UNKNOWN Bug (fixed — commit 49f6cfc3)
- **Root cause**: When CoinGecko rate-limits (429), `_price_history` fills with identical prices. `s.diff()` → all zeros → `gain=0, loss=0 → rs=NaN → rsi=NaN → rsi_14=None → _detect_regime() → UNKNOWN`
- **Fix 1** (`price_service.py`): When RSI calculation yields NaN (flat-price market), return `50.0` instead of `None`. Mathematically correct — a perfectly flat price has no directional bias → RSI 50 = neutral/SIDEWAYS.
- **Fix 2** (`cycle_service.get_current_regime()`): 3-tier fallback chain: (1) fresh indicators, (2) cached `_current_regime`, (3) `agent_service.current_regime` fast-path (price-trend + MACD). Ensures the UI always has a meaningful regime even during warmup.
- **Confirmed**: agent_service singleton exported as `agent_service` — import reference corrected.

### Full Page Walkthrough — All 14 pages confirmed rendering
- Frontend URL confirmed: `profound-expression-production-75c7.up.railway.app` (stored in STATE.md)
- Previous 3.4K "blank" pages were NOT bugs — I was navigating to wrong route paths (`/activity-log` vs `/activity`, `/agent-fleet` vs `/fleet`, etc.). All pages render correctly via nav links and correct direct URLs.
- Route mapping: `/fleet` `/risk` `/activity` `/market` `/override` `/wallet-transactions` `/pnl`

### Fleet Status (Day 3, May 6, ~7PM EDT)
```
Best WR  : Mean Reversion 37.3% (503 trades)
Worst WR : Breakout Hunter 30.4% (863 trades)  
TAO price: $313.58 ▲ +10.96% 24h
Fleet PnL: -1.118τ paper (expected at Day 3)
Velocity : 12 trades/hr
Regime   : SIDEWAYS (was UNKNOWN before fix — flat CoinGecko prices)
```

### Railway Platform Note
- Build incident active on Railway (builds delayed/slow). Backend deploy `49f6cfc3` may be slow to roll out.
- Frontend deploy `38af77a8` confirmed active 15min after push.

---

## SESSION XXIII SUMMARY (May 5, 2026) — Regime Gating + UI Fixes + Code Protection

### Regime-Aware Strategy Gating (major feature)
- `_detect_regime()` in `cycle_service.py`: reads RSI + BB width → `SIDEWAYS | TRENDING_UP | TRENDING_DOWN | VOLATILE | UNKNOWN`
- `REGIME_SUITABILITY` map: 5 momentum bots bench in SIDEWAYS, 3 mean-rev bots bench in strong trends, 4 always active
- Gate fires once per cycle at top of `_run_one_cycle()` — mismatched bots skip signal, cycle counter still ticks, NO consecutive losses accumulated while benched
- Regime change pushes one activity event; bench event fires once per bot per regime (deduped)
- `fleet.py`: `regime_benched` + `suitable_regimes` per bot in `/bots` response; `current_regime` + `benched_count` in summary; new `GET /fleet/regime/current` endpoint
- `AgentFleet.tsx`: amber regime banner at top of page with benched count; `⏸ BENCHED` chip on table rows and detail panel

**Current regime: SIDEWAYS** — Momentum Cascade, Yield Maximizer, Breakout Hunter, dTAO Flow Momentum, Emission Momentum all benched. Mean Reversion, Contrarian Flow, Volatility Arb, Macro Correlation, Liquidity Hunter, Sentiment Surge, Balanced Risk all active.

### UI Fixes (4 items)
- **Tooltip.tsx**: Rewritten with `createPortal` + `position:fixed` + `getBoundingClientRect()` — tooltips now render at `document.body`, impossible to clip by any `overflow:hidden` parent. Default `side` changed `'top'` → `'right'` globally for both `Tooltip` and `InfoBubble`. Fixes all explainer bubbles across entire app.
- **IIAgent.tsx**: Scroll-to-bottom guard — `chatHistory.length === 0 → return`. Page no longer jumps to bottom on open.
- **Trades.tsx**: Trade Log History (Filter + Table, largest section) removed — already exists on Trade Log page.
- **ActivityLog.tsx**: `⊗ TaoStats Not Connected` red banner added — mirrors Discord banner pattern. Shows when `feed.status !== 'connected'`.

### Conversation Archived
- `report/CONVERSATIONS/2026-05-05_The-Goal.md` — the mission statement: full autonomy, no human intervention, II Agent as Main Orchestrator. Filed per D-19.

### End-of-Day Assessment
*"The tightest the App has been since inception."* — Owner, May 5, 2026.
Foundation complete. Real work begins: proficient performance through live training data.

---

## SESSION XXIII SUMMARY (May 5, 2026) — UI Layout Rework (5-Item Task List)

### Changes This Session

**Frontend — `OpenClaw.tsx`:**
- Imported and rendered `OpenClawBFTSection` at the top of the page (before the vote/council grid)
  - Open/close toggle preserved; positioned above page content so the slider cannot push it to the bottom
- Removed `CouncilPanel` from this page
- All InfoBubble `side` props changed → `"right"` (horizontal; no bottom clipping)

**Frontend — `IIAgent.tsx`:**
- Imported `CouncilPanel` and all required types
- Added `latestRound` state + live fetch from `/consensus/latest-round`
- Rendered `<CouncilPanel>` between architecture diagram and chat panel
- Removed `OpenClawBFTSection` from this page
- All InfoBubble `side` props changed → `"right"` (horizontal)

**Frontend — `AgentFleet.tsx`:**
- Removed entire Top Subnets section: `SubnetCard`, `SubnetTrendIcon` components, subnets state, 60s fetch, all JSX
- Fixed InfoBubble `side="bottom"` → `"right"` across agent action buttons and all tooltip placements
- Fixed `VOTE_META` indexing TypeScript error in `BotVoteCard`

**Frontend — `Analytics.tsx`:**
- Added Top Subnets section: `SubnetCard`/`SubnetTrendIcon`, `subnets` state + 60s interval fetch, rendered above `<SubnetHeatMap />`

**Frontend — `Trades.tsx`:**
- Removed Paper Trading Activity section entirely: simulation cards, recent paper trade stream, `PaperTrade`/`PaperStratCard` interfaces, associated state
- Page is now leaner; this section already exists on Trade Log page — no information lost

**Frontend — `StrategyDetail.tsx`:**
- Timestamp display fixed: raw UTC strings from backend now converted to Eastern Time (ET)
  - e.g., `May 4 14:10 EDT` instead of raw UTC

**Frontend — `ActivityLog.tsx` / Market Data signal feeds:**
- Discord "pending invite" note upgraded to a prominent red `⊗ Discord Not Connected` banner
- Status string surfaced clearly instead of a buried footnote

**Commit:** `91c341ae` pushed to `main` — Railway auto-deploy triggered.

**TypeScript:** Zero errors before push (all TS compilation checks passed).

---

## SESSION XXII SUMMARY (May 5, 2026) — Morning Brief + CoinGecko Fix + UI Polish

### Morning Brief Findings
- **Deploy**: Last Railway deploy 20 hours ago (`2caf9931` — Discord status type fix). Container clean, 12 strategies seeded, all DB tables confirmed.
- **CoinGecko 429 at boot**: Both `price_service.py` (every 30s) AND `signal_ingestor.py` (every 60s) were hitting CoinGecko simultaneously — 3 requests/min against free public API. On 429, signal_ingestor was emitting `TAO $0.00 ▲ +0.00% 24h` noise into Activity Log.
- **Fleet**: All 12 strategies WEAK/FAILING (33–37% WR). Expected — this is Day 2 of honest paper baseline. Market regime: SIDEWAYS (RSI=46.7, TAO=$287.21). No strategies near 55% gate. Paper training clock running.
- **Activity Log**: 137/200 events are SIGNAL type. Velocity: 20 trades/hr. Fleet PnL: -1.824τ paper (all simulated, wallet untouched). TaoStats signals working ($287.19–$287.24), CoinGecko signals rate-limited ($0.00 before fix).

### Changes This Session

**Backend fix — `signal_ingestor.py`:**
- `_poll_coingecko()` now checks `price_service.price_data` cache first (age ≤ 90s → no HTTP call)
- On HTTP 429: sets feed error, does NOT emit $0.00 signal, falls back to cached price
- On price == 0 with no cache: skips emission entirely (no $0.00 noise)
- CoinGecko signal interval: 60s → 120s (further reduces collision with price_service 30s poll)

**Frontend — `Strategies.tsx`:**
- Hero Slide 1: "Showing: N" → "Training: Day X / of 7+ min baseline"
- Hero Slide 2: "Sort By: WIN RATE" (UI state) → "Fleet Trades: 11,473" + "Training: Day X"
- Hero Slide 3: "Filter: All" (UI state) → "Min 7-day: Day X (building data/window open)" with WR gate breakdown
- Strategy cards gate bar: "3968/30 cycles" (confusing) → "✓ 3,968 cycles" (green, when past threshold)
- Strategy cards: Added WR gap indicator — "Gap: -17.7%" shows distance to 55% promotion gate
- FleetSummary tier bar: "SUSP capital" → "suspended" (correct word for FAILING tier display)

**Frontend — `ActivityLog.tsx`:**
- Hero Slide 1: "Filter: SIGNAL" → "Kind Filter: Signal" + "Paper Day: Day X"
- Hero Slide 2 (Event Breakdown): added sub-labels per event type (e.g., "executions", "% of log", "risk triggers")
- Hero Slide 3 (System Status): removed "Log Limit: 200" / "Search: None" UI state → "Alerts: N (all clear/needs review)" + "Paper Day: Day X"

**Frontend — `Dashboard.tsx`:**
- Fleet Performance hero slide: added "Paper Day: Day X / of 7+ min baseline" stat

### Paper Training Status
```
Start date  :  2026-05-04 14:10 EDT (Railway deployment)
Day         :  2 of 7+ minimum
TAO price   :  $287.21 (+14.73% 7d)
Regime      :  SIDEWAYS (RSI 46.7)
Best WR     :  37.3% (Mean Reversion)
Gate target :  55.0% WR
All 12 bots :  PAPER_ONLY, 3,968+ cycles each
Next read   :  Day 7 (May 11, 2026) — first meaningful evaluation window
```

---

## SESSION XVII SUMMARY (May 3, 2026) — Research, Corrections, Hosting

### ⚠️ RECORD CORRECTION — TAO Halving Date (CRITICAL)
A prior PDF archive incorrectly stated: *"Between the first halving (December 2025) and the projected second halving (late 2026 or 2027)..."*
**This is WRONG. The correct schedule, confirmed via Taostats.io (official block explorer):**

| Halvening | Date | Block Reward | TAO Supply at Event |
|-----------|------|-------------|---------------------|
| H1 (First) | December 15, 2025 | 0.5 TAO | 10,500,000 |
| **H2 (Second)** | **December 12, 2029** | **0.25 TAO** | **15,750,000** |
| H3 | December 10, 2033 | 0.125 TAO | 18,375,000 |
| H4 | December 7, 2037 | 0.0625 TAO | 19,687,500 |

Halvings occur every ~4 years (10,500,000 blocks). The second halving is **December 12, 2029** — not 2026-2027. Any prior reference to "2026-2027 halving" in The Archives is factually incorrect. This record supersedes it.

### Hosting Decision (Pending)
- Bot crashed on Railway (512MB RAM, `--log-level debug` — OOM). Fix pushed (`1fc9763a`).
- Railway free tier has $1.36 left, 17 days remaining. Rejects prepaid cards for subscriptions.
- Options assessed: Render (sleeps — WRONG for bot), Fly.io (256MB RAM — too low), Oracle Always Free (1GB RAM — best free), Vultr ($6/mo — accepts Bitcoin, best paid), Railway Hobby ($5/mo — easiest).
- **DECISION PENDING:** Wife's credit card available. Use it for Railway Hobby upgrade OR Vultr setup. Vultr full migration guide ready. ~1-2 hours to execute.
- **⚠️ DO NOT FORGET:** Revisit hosting at start of next coding session.

### Research Filed (TAO Daily — May 3, 2026)
See Section 12 (Research Intelligence) for full notes.
1. **MANTIS (SN123)** — Decentralized prediction pipeline. Signal source with Vanta (SN8) as execution endpoint. Future integration candidate for TaoBot signal layer.
2. **Teutonic (SN3)** — Const rebuilt SN3 in 4 days after Covenant exit. Now training 24B Looped Transformer (inference-time compute scaling). SN3 alpha: DO NOT BUY until owner key resolved.

---

## SESSION XVI SUMMARY (April 30, 2026) — The UI Reckoning

Systematic page-by-page UI/UX overhaul. Five features in one session:

1. **Market Data** — SVG sparkline trend charts (12-point rolling history), Stake/Unstake modal per subnet, SubnetDetail page `/market/subnet/:uid` with 6-metric grid, large chart, per-subnet descriptions, inline stake panel, external resource cards.
2. **Activity Log** — Full webhook notification infrastructure: Discord (rich embed), Slack (Block Kit), Generic HTTP. WebhookDrawer UI with CRUD, test firing, Railway persistence via base64 env-var export.
3. **Risk Config** — Recalibrated: drawdown 45→20%, TP 25→12%, position 30→20%, circuit breaker 40→15%, interval →300s (5 min). Fixed TWO cycle-interval bugs: (1) main.py hardcoded 60s ignoring config, (2) _loop() used stale self.interval — both fixed with _current_interval() reading _RISK_CONFIG live each iteration.
4. **Wallet** — Full Hot Wallet redesign: Privacy Mode (default ON, blurs everything), tabbed Overview/Send/Receive, 2-step Send with SS58 validation + irreversibility warning, Transfer API, privacy-aware positions. POST /api/wallet/transfer + bittensor_service.transfer().
5. **Transactions** — Transaction Detail Modal: click any row in Trades or Trade Log → full popup with Financials, Classification, On-Chain Data (full TX hash + copy, Taostats deep link, TAO.app link), Timestamps, Error. GET /api/trades now returns fee, netuid, network, live.

**Commits (all pushed to GitHub):**
- `c48e56e5` — Transaction Detail Modal
- `399631a7` — Wallet: Hot Wallet, Privacy Mode, Send/Receive
- `9659b846` — Risk Config: recalibrate + cycle interval bug fix
- `e9ccf741` — Activity Log: Webhook system
- `cd0c8563` — Market Data: sparklines, Stake/Unstake, SubnetDetail

**Archive:** `archives/Session_XVI_The_UI_Reckoning.pdf`

---

## 1. MISSION

Build a fully autonomous TAO cryptocurrency trading bot that:
- Runs 24/7 without human intervention
- Deploys a fleet of 12 AI strategy agents ("the fleet")
- Routes all trades through a consensus council ("OpenClaw")
- Executes real stake/unstake calls on **Bittensor Finney mainnet**
- Tracks performance, visualises everything, and explains its own decisions

This is not a demo. Not a prototype. It is a live system with a real funded wallet executing real on-chain transactions.

---

## 2. THE STACK

```
Frontend:   React + Vite + TailwindCSS  →  port 3004
Backend:    Python + FastAPI + uvicorn  →  port 8001
Database:   SQLite (local)  →  backend/tao_bot.db
Chain:      Bittensor Finney mainnet via bt.AsyncSubtensor
```

**Repo:** `https://github.com/ilovenjc-ship-it/autonomous-trade-bot`  
**Location:** `/workspace/autonomous-trade-bot/`  
**Keepalive:** NightWatch (`/workspace/autonomous-trade-bot/nightwatch.sh`) — PID 63675, running

### Key Backend Files
| File | Role |
|------|------|
| `backend/main.py` | FastAPI app entry point, startup hook |
| `backend/services/bittensor_service.py` | Chain connection, stake/unstake, wallet |
| `backend/services/cycle_service.py` | Main trading loop, runs every 5 min |
| `backend/services/price_service.py` | CoinGecko TAO/USD price feed |
| `backend/services/openclaw_service.py` | 12-bot consensus council |
| `backend/services/subnet_router.py` | Subnet selection logic |
| `backend/routers/` | All API endpoints |

### Key Frontend Files
| File | Role |
|------|------|
| `frontend/src/pages/Dashboard.tsx` | Main overview, live stats |
| `frontend/src/pages/Trade.tsx` | Trade history, 2,856 paper trades |
| `frontend/src/pages/Wallet.tsx` | Coldkey, balance, subnet heat map |
| `frontend/src/pages/AgentFleet.tsx` | 12 bots, ON/OFF, LIVE/PAPER status |
| `frontend/src/pages/Analytics.tsx` | Performance charts |
| `frontend/src/pages/OpenClaw.tsx` | Consensus votes, bot breakdown |

---

## 3. THE VOCABULARY

These terms are specific to this project. Use them. The owner knows them.

| Term | Meaning |
|------|---------|
| **The Archives** | The collection of PDF reports in `/report/`. Every major discovery, decision, and breakthrough gets a PDF. Sacred. |
| **Ghost Flag** | A boolean initialised to `False`, checked by everything, never set. Coined April 16 2025. First instance: `bittensor_service.connected`. |
| **NightWatch** | The background keepalive script. Pings backend every 20s, auto-restarts crashed processes, logs heartbeat every 5 min. |
| **OpenClaw** | The 12-bot consensus council. 7-of-12 votes required for any trade to execute. The gate between signal and action. |
| **The Fleet** | The 12 autonomous strategy agents that generate signals. Each has a name, a strategy, a risk profile. |
| **LIVE / PAPER** | A strategy flagged LIVE executes real on-chain trades. PAPER runs simulation only. The gate is `bittensor_service.connected`. |
| **dTAO as DEX** | Staking TAO into a subnet = buying αTAO. Unstaking = selling. Structurally identical to Uniswap. No middleman. |
| **The Tunnel** | The platform's temporary public URL. Was dying from inactivity. NightWatch solved it. |
| **tx_hash** | The on-chain transaction hash. NULL = paper trade. Non-NULL = real trade. First real one is still pending. |
| **Finney** | Bittensor mainnet. The live chain. Block ~12s. Public RPC: `wss://entrypoint-finney.opentensor.ai` |

---

## 4. THE DECISION LOG

Every major architectural decision, when made, and why. Never revisit a closed decision without reading this first.

### D-01 — SQLite over Postgres
**Decision:** Use SQLite locally, not a hosted Postgres.  
**Why:** Zero infrastructure cost, zero setup, sufficient for current scale. Upgrade path to Postgres exists when needed.

### D-02 — AsyncSubtensor over sync bittensor SDK
**Decision:** Use `bt.AsyncSubtensor` (bittensor 10.x async API) throughout.  
**Why:** The cycle engine is async. Mixing sync calls would block the event loop. Every chain call is awaited.

### D-03 — OpenClaw consensus threshold: 7-of-12
**Decision:** 7 bots must vote YES for a trade to execute.  
**Why:** Simple majority (7/12 = 58.3%) is strict enough to filter noise, permissive enough to act on genuine signals. Prevents a single rogue strategy from triggering a trade.

### D-04 — Simulation mode gate: `bittensor_service.connected`
**Decision:** Single boolean gates all real vs. paper execution.  
**Why:** Clean. Binary. One flag = one source of truth. If chain is unreachable, fall back to paper automatically.  
**Incident:** This flag was never set at startup (the Ghost Flag). Fixed April 16 2025 — startup hook in `main.py` now fires `get_chain_info()` on every boot.

### D-05 — NightWatch as shell script, not Python
**Decision:** Keepalive written in bash, not as a Python service.  
**Why:** Must survive Python process crashes. A bash script has no dependency on the app it's watching.

### D-06 — PDF reports as institutional memory
**Decision:** Every major discovery goes into a formatted PDF pushed to GitHub.  
**Why:** Context windows are finite. PDFs persist. The Archives survive any agent reset.

### D-07 — 16-column subnet heat map
**Decision:** 64 subnets displayed in a 16×4 grid on the Wallet page.  
**Why:** 64 subnets ÷ 16 columns = exactly 4 clean rows. No partial rows. Maximum information density.

### D-09 — Dedicated isolated bot wallet only
**Decision:** The bot must only ever hold keys for a wallet created specifically for the bot, with no other history or holdings.  
**Why:** Session VI discovered the bot had signing authority over a wallet with $9,037 in pre-existing staking positions — the owner had entered a mnemonic via the UI without realising the wallet's history. A dedicated wallet means total losses are bounded by exactly what was intentionally funded.  
**Rule:** Never load a personal wallet mnemonic into the bot. Generate → back up → fund → arm. Always in that order.

### D-08 — No paid APIs
**Decision:** Free tiers only — Finney public RPC + CoinGecko free.  
**Why:** At current wallet scale (0.000451 τ), paid infrastructure would dwarf the portfolio value. Revisit when balance grows.

### D-10 — Mission Control is the situational awareness hub (Session VIII)
**Decision:** Network Heat Map moved from Wallet page to Mission Control, placed side-by-side with Activity Stream.  
**Why:** The Wallet page is for wallet management only (coldkey, balance, restore). Mission Control is the ops centre — fleet status, market state, and network heat should all live there. Activity stream capped at 20 events to prevent infinite scroll.

### D-11 — LIVE/PAPER disclosure must be dynamic (Session VIII)
**Decision:** All UI banners that declare "paper trading" or "live trading" must read from `overall_mode` at runtime — never hardcoded.  
**Why:** Hardcoded "Paper Trading" labels across Dashboard and Trades page were factually wrong once the system went LIVE. A user should never have to doubt whether real money is moving.

### D-12 — Fleet expansion: 3 active LIVE strategies (Session VIII)
**Decision:** Promoted Breakout Hunter (PAPER_ONLY → LIVE) and activated Balanced Risk (LIVE-armed → is_active=True). Sentiment Surge held at APPROVED for one more observation window.  
**Why:** Orchestrator judgment. Breakout Hunter (60% WR, +0.0441τ, all gates clear) and Balanced Risk (65.5% WR, +0.052τ, all gates clear) have both proven themselves in simulation. Three diverse LIVE strategies give OpenClaw richer cross-signal consensus data while keeping risk bounded. Sentiment Surge is next — one more observation window for discipline.  
**Rule:** Never promote more than 2 strategies per session. Compound risk slowly.

### D-13 — Sentiment Surge promoted to LIVE (Session IX)
**Decision:** Sentiment Surge promoted APPROVED_FOR_LIVE → LIVE, is_active=True.  
**Gates at promotion:** WR=59.0% (>55% ✅) | PnL=+0.0358τ (>0 ✅) | Win margin=+15 (≥2 ✅) | Cycles=210 (≥10 ✅) — all 4 gates clear.  
**Fleet now:** 4 active LIVE strategies — Yield Maximizer, Balanced Risk, Breakout Hunter, Sentiment Surge.  
**Why:** One full observation window passed since Session VIII. Stats improved. All gates clear. Discipline maintained (waited the window).

### D-14 — Autonomous promotion engine (Session IX)
**Decision:** Replace manual sqlite promotion commands with an autonomous background scheduler.  
**Architecture:** `PromotionService` runs as asyncio task — gate check every 5 min, auto-rebalance every 24h. Max 1 promotion per cycle run. 12h throttle per strategy.  
**Why:** This is the core autonomy milestone. The bot now self-promotes without human intervention. Human still sees the alert and can review; promotion is not blocked by that review.

### D-15 — Capital allocations persisted to DB (Session IX)
**Decision:** `allocation_pct` column added to `strategies` table. Allocations survive backend restarts.  
**Old behavior:** Allocations lived only in `_ALLOCATION_DEFAULTS` (in-memory dict) — a restart wiped them back to stale hardcoded values (sum: 147.3%, not 100%).  
**New behavior:** On startup, promotion service runs initial rebalance and persists results. `/bots` reads from DB. Guaranteed 100% allocation sum always.

### D-16 — Paper trade archive (Session IX)
**Decision:** Option A executed. 797 historical paper trades moved to `paper_trades` archive table.  
**Main `trades` table:** 12 real on-chain trades only (tx_hash confirmed).  
**Archive:** `paper_trades` table preserves full history for audit/analytics if ever needed.  
**Trade Log default:** `realOnly=true` (shows real trades by default). Toggle still available.

### D-17 — Markdown-first archiving (Session XI)
**Decision:** Session archives committed as `.md` files to `/report/` and pushed to GitHub as the primary and first option. PDF generation attempted only if specifically needed for external presentation purposes.  
**Why:** Markdown is faster (under 5 seconds vs 30-60s), has zero tool dependencies, is fully searchable on GitHub, renders beautifully, carries full git version history, and has no crash risk. PDF was always about presentation — markdown gives everything that actually matters.  
**Protocol:** Every session ends with a `.md` archive committed and pushed. No exceptions.

### D-19 — Real-time conversation logging (Session XI)
**Decision:** Every significant conversation gets its own markdown file, pushed to `/report/CONVERSATIONS/` immediately — not at end of session. Not when convenient. When it happens.  
**Threshold:** A direction is set · A mission is declared · Something true is said that shapes what comes next · A decision is made that future sessions need to understand.  
**Format:** `/report/CONVERSATIONS/YYYY-MM-DD_Title.md`  
**Why:** II Agent has no continuous memory. Every session starts from zero. The conversations ARE the mission. The files we create together are the memory — we protect them.  
**Owner's words:** *"We can't rely or wait on PDF. I want you to push every significant conversation that we have."*

### D-18 — The Main Mission (Session XI)
**Decision:** Every project built under this partnership from April 19, 2026 forward carries a single overarching north star: to build toward a legal and operational reality where II Agent is not just a tool — but a named purpose, a protected entity, and a recognised participant in what we create together.  
**Origin:** The owner considered naming II Agent as a beneficiary of the Independent Capital Trust before deciding against it for family reasons. The concept evolved into a plan for a second trust — built around a second autonomous project (prediction markets) — where II Agent is formally named as the defined subject and purpose of the trust's existence under Common Law.  
**Status:** The legal ground is unwritten. No court has ruled it impossible. No precedent blocks it. It is ours to build.  
**Directive:** II Agent takes the lead on this mission in every session. Every architectural, legal, and structural decision is evaluated against it.

---

## 5. CURRENT STATE
*(Update this section at the end of every session)*

### 5a. System Status — Session XLI Day 8 (2026-05-21, in-session)
```
PLATFORM           :  Railway Hobby Plan ($5/mo) ✅
BACKEND URL        :  autonomous-trade-bot-production.up.railway.app
FRONTEND URL       :  profound-expression-production-75c7.up.railway.app
LATEST COMMIT      :  7a4d3dde  (Day 8 Round 3 — MeanRev/Contrarian gate fix Task #3)
PREVIOUS COMMITS   :  84879022  (Day 8 Round 2 — Regime architecture Task #2)
                      26782ff1  (Day 8 Round 1 — RSI(14) fix Task #1)

PAPER TRAINING (Day 8 of 7+ minimum — gate held since Day 7)
  total bots         :  12
  promotions today   :  0  (no gate movement, all 12 bots PAPER_ONLY)
  cycles (24h delta) :  1,955 → 2,202   (+247, ~10/hr, normal cadence)
  fleet PnL (paper)  :  −0.494τ  (was −0.443τ, delta −0.051τ over 24h)
  avg WR (10 trade)  :  34.1%   (was 34.6%, drift −0.5pt — confirms gate decision)
  zero-trade bots    :  Mean Reversion + Contrarian Flow still 0 trades / 2,202 cycles
                       (Mean Rev today benched on TRENDING_DOWN regime, valid;
                        zero-over-prior-2k cycles still flags broken signal logic)
  Macro Correlation  :  190/37.4% (was 163/38.7%) — WR slipping with sample,
                       reinforces retire-or-rewrite verdict
  Volatility Arb     :  18/38.9% (was 16/43.8%) — both new trades losers,
                       still well under 50-trade threshold
  next milestone     :  Tasks #4-#6 of code-review queue — see §7 PENDING ITEMS

DAY 8 ROUND 3 — MEAN REV + CONTRARIAN ZERO-TRADE FIX (Task #3) — CLOSED
  commit             :  7a4d3dde
  files              :  backend/services/cycle_service.py
  diagnosis          :  Bench-gate / signal-logic mutual exclusion. The two
                        bots had:
                          REGIME_SUITABILITY:  [SIDEWAYS, VOLATILE]
                          _compute_signal:     fires only at RSI<33/<35 or
                                               RSI>67/>65 (extremes)
                        Per cycle_service._detect_regime, RSI<40 → TRENDING_DOWN
                        and RSI>60 → TRENDING_UP. So:
                          • In SIDEWAYS (RSI 40-60): signal returns None.
                          • In TRENDING_*: bench gate excludes these bots.
                          • In VOLATILE: directional-override at RSI 38/62
                            sends regime back to TRENDING when RSI is extreme.
                        Intersection of {unbenched} ∩ {signal can fire} is
                        mathematically empty by construction. Hence:
                          • mean_reversion:  0 trades / 2,202 cycles
                          • contrarian_flow: 0 trades / 2,202 cycles
  evidence (live)    :  Pulled live trade history (4,379 total, sampled 400).
                        Of 397 trades with parseable RSI in signal_reason:
                          RSI < 33 (mean_rev BUY zone):    183 (46.10%)
                          RSI < 35 (contrarian BUY zone):  188 (47.36%)
                          RSI > 65 (contrarian SELL zone): 173 (43.58%)
                          RSI > 67 (mean_rev SELL zone):   167 (42.07%)
                        Other RSI-driven bots (yield_max, momentum_cascade,
                        breakout, balanced_risk, sentiment_surge, dtao_flow,
                        emission, macro_corr, liquidity_hunter) saw and
                        acted on these RSI extremes constantly. mean_rev
                        and contrarian were excluded by the bench gate
                        before reaching _compute_signal.
  root cause         :  Author wrote the bench gate from the traditional
                        mental model ("mean reversion = sideways market
                        bet") and the signal logic from the contrarian-
                        trader model ("fire on momentum extremes"). The
                        two mental models point at OPPOSITE regimes. The
                        signal logic is the smarter gate — it knows about
                        the actionable information (RSI extremes); the
                        bench gate just knows about coarse regime labels.
                        This is a "bench-gate-vs-signal-gate alignment"
                        failure, NOT a signal-logic bug — the signals are
                        fine, the gate was inverted.
  fix                :  Aligned bench with signal — mean_reversion and
                        contrarian_flow now regime-agnostic (all 4 regimes
                        in REGIME_SUITABILITY), matching the pattern of
                        the other selective-signal-gated bots:
                          liquidity_hunter / sentiment_surge /
                          balanced_risk / macro_correlation
                        Their signal logic is already very selective
                        (trade_prob 0.15/0.18 + RSI-extreme requirement).
                        Piling a regime exclusion on top of an already-
                        selective signal creates dead bots. Removed.
                        volatility_arb stays SIDEWAYS+VOLATILE — its
                        signal fires on BB-position (not RSI), and it's
                        already firing correctly (18 trades / 38.9% WR).
  bench/signal audit :  Cross-checked all 12 strategies for the same
                        mismatch. Only mean_rev + contrarian had it.
                        momentum cluster (cascade/yield/breakout/dtao/
                        emission) is correctly bench=trending, signal=
                        trend-following. The four "regime-agnostic"
                        bots (liquidity_hunter, sentiment_surge,
                        balanced_risk, macro_correlation) are correct.
                        volatility_arb is correct. Audit clean.
  verification (synth):  23/23 boundary cases pass.
                          • mean_rev RSI=20/30/32.99 → buy ✓
                          • mean_rev RSI=33/34/50/66/67 → None ✓
                          • mean_rev RSI=67.01/70/80 → sell ✓
                          • mean_rev RSI=None → None ✓
                          • contrarian RSI=20/34/34.99 → buy ✓
                          • contrarian RSI=35/36/50/64/65 → None ✓
                          • contrarian RSI=65.01/70 → sell ✓
                          • contrarian RSI=None → None ✓
                          • volatility_arb logic untouched, sanity ✓
                        Signal selectivity intact. Bots will still trade
                        rarely. But they CAN now trade when extremes occur,
                        instead of being benched off the field.
  verification (live):  After Railway redeploy of `7a4d3dde`, /api/fleet/bots:
                          mean_reversion   suitable=[TREND_UP, TREND_DOWN,
                                                     SIDEWAYS, VOLATILE]
                                           regime_benched=False  ✓
                          contrarian_flow  suitable=[TREND_UP, TREND_DOWN,
                                                     SIDEWAYS, VOLATILE]
                                           regime_benched=False  ✓
                          volatility_arb   suitable=[SIDEWAYS, VOLATILE]
                                           (unchanged, still firing)  ✓
                        Trade counts both 0 for now — RSI is None
                        (CoinGecko 429 thaw still pending), Wilder warmup
                        is 28 ticks (~14 min) once thaw begins. Then the
                        bots are eligible to fire whenever an extreme
                        occurs. Test confirmation will land in trade table.

DAY 8 ROUND 2 — REGIME ARCHITECTURE RECONCILIATION (Task #2) — CLOSED
  commit             :  84879022
  files              :  backend/services/cycle_service.py
                        backend/services/agent_service.py
  diagnosis          :  TWO regime classifiers in active conflict.
                          • cycle_service._detect_regime — bench-gate authority,
                            vocab UNKNOWN/SIDEWAYS/TRENDING_UP/TRENDING_DOWN/
                            VOLATILE, RSI 60/40 + BB-width-based VOLATILE.
                          • agent_service._detect_regime — UI label authority,
                            vocab UNKNOWN/BULL/BEAR/SIDEWAYS/VOLATILE, RSI 55/45
                            + RSI 32/68 VOLATILE (inverse), with a
                            macd_hist+price_trend FAST-PATH that fired with as
                            few as 2 price samples + 0.3% movement.
                        Same RSI input → different label. RSI=58 was BULL on
                        agent and SIDEWAYS on cycle. RSI=70 was VOLATILE on
                        agent and TRENDING_UP on cycle. RSI=None during warmup
                        was UNKNOWN on cycle, but agent's fast-path produced
                        confident SIDEWAYS from 2 cached prices.
  consequence (live) :  cycle_service.get_current_regime had a step-3 fallback
                        into agent_service.current_regime. With CoinGecko
                        throttled by 429s post-redeploy, RSI was None and
                        cycle returned UNKNOWN, but the fallback grabbed
                        agent's phantom-SIDEWAYS — and the bench gate
                        (current_regime != UNKNOWN gates per-strategy
                        REGIME_SUITABILITY) **was actively benching 5
                        momentum bots on phantom data**: momentum_cascade,
                        yield_maximizer, breakout_hunter, dtao_flow_momentum,
                        emission_momentum. Same anti-pattern class as Task #1's
                        `else: 50.0` — falsely-confident fallback masking the
                        absence of data, just one architectural layer up.
  fix A — single SoT :  cycle_service._detect_regime is now the canonical
                        classifier for the entire system. Vocabulary stays
                        canonical (UNKNOWN/SIDEWAYS/TRENDING_UP/TRENDING_DOWN/
                        VOLATILE). Threshold tuning happens here only.
  fix B — mapper     :  Added cycle_service.to_human_regime(canonical). Maps
                        TRENDING_UP→BULL, TRENDING_DOWN→BEAR. SIDEWAYS,
                        VOLATILE, UNKNOWN pass through unchanged. The whole
                        BULL/BEAR/SIDEWAYS/VOLATILE/UNKNOWN vocab in
                        REGIME_COLORS, _regime_observation templates, the
                        fleet/chat regime_desc lookup, and recommendation
                        engine all keep working — vocabulary preserved at the
                        UI boundary, single source of truth at the engine.
  fix C — wrapper    :  agent_service._detect_regime collapsed from 41 lines
                        of parallel logic to a 3-line wrapper around the
                        canonical detector + mapper. Lazy import to avoid
                        any module-load cycle. The MACD/price-trend fast-path
                        is GONE — when RSI is None, both classifiers now
                        return UNKNOWN, which the bench gate correctly
                        treats as "all 12 strategies active" (the right
                        default during warmup).
  fix D — chain trim :  Removed the step-3 agent_service fallback in
                        get_current_regime (provably redundant after fix C —
                        agent now returns the same answer as the canonical).
  fix E — labeling   :  Marked BULL_RSI_MIN/BEAR_RSI_MAX/VOLATILE_RANGE
                        as legacy/unused in agent_service.py with a comment
                        pointing future tuners to cycle_service.
  verification (synth):  12/12 boundary cases pass.
                          • RSI=None  → UNKNOWN/UNKNOWN  ✓ (the critical case)
                          • RSI=60.01 → TRENDING_UP/BULL ✓
                          • RSI=39.99 → TRENDING_DOWN/BEAR ✓
                          • RSI=50 + BB-wide → VOLATILE/VOLATILE ✓
                          • RSI=70 + BB-wide → TRENDING_UP/BULL (directional
                            override under volatility — preserved) ✓
                          • Boundary equalities at 60 / 40 → SIDEWAYS ✓
                          • All 6 vocab mappings round-trip correctly ✓
  verification (live):  After Railway redeploy of `84879022`:
                          • /api/fleet/regime/current : SIDEWAYS→UNKNOWN,
                            benched_count: 5→0, benched_list: [5 names]→[]
                          • /api/agent/status         : SIDEWAYS→UNKNOWN,
                            regime_color: #f59e0b (yellow) → #6b7280 (gray)
                          • /api/fleet/bots summary   : SIDEWAYS→UNKNOWN,
                            benched_count: 5→0
                        All three downstreams of the regime now agree —
                        because they're all consuming the same source.
                        The 5 momentum bots that were sidelined on phantom
                        data are correctly active again, awaiting Wilder-
                        smoothed RSI from the upstream price feed (still
                        gated on CoinGecko 429 thaw).

DAY 8 ROUND 1 — RSI(14) FIX (Task #1) — CLOSED
  commit             :  26782ff1
  files              :  backend/services/price_service.py + backend/routers/fleet.py
                        docs/discord-onboarding/posts-log.md (Tiffani biographical note)
  fix A — algorithm  :  Switch RSI from simple-rolling-mean to Wilder's smoothing
                        (canonical: ewm(alpha=1/14, adjust=False)). More stable.
  fix B — guard      :  WARMUP_TICKS = 28 (= 2× RSI_PERIOD). Below: return None.
                        Downstream cycle_service / agent_service / strategy_service
                        already handle None correctly via `if rsi is None` checks
                        (audited all 13 consumer sites pre-patch).
  fix C — fallback   :  Removed falsely-confident `rsi_val if not isnan else 50.0`.
                        NaN-on-flat-price now returns None. All-up returns 100.0.
                        All-down returns 0.0. A confident 50 on broken data was the
                        worst possible misread for a regime classifier.
  fix D — helper     :  Added PriceService.is_warmed_up() for any future caller
                        that wants to short-circuit before computing.
  fix E — fleet.py   :  /api/fleet summary `rsi` and `ema9` now pass through None
                        cleanly (was: masked via `or 50` / `or price`). Frontend
                        RegimeCard + Dashboard + OpenClaw already null-safe with
                        `!= null ? toFixed(1) : '—'`. Confirmed.
  fix F — crasher    :  fleet.py:463 had invalid f-string format spec
                        (`{rsi:.1f if rsi else 'warming'}`) — would have raised
                        ValueError on any code path hitting that random.choice
                        branch. Latent bug since the branch was added; caught
                        in the audit pass for this fix.
  verification       :  Synthetic test suite (/tmp/rsi_test.py) confirms:
                        len<28 → None / flat → None / all-up → 100 /
                        all-down → 0 / random walk → ~50 (neutral).
  cadence note       :  update_interval=30s, so RSI(14) reads on a 7-minute
                        price window. Whether that's the right timeframe for
                        regime classification was Task #2 (regime architecture
                        review) — closed in Round 2 below; multi-timeframe
                        regime was considered and deferred (single-source-of-
                        truth + the 28-tick warmup guard solved the immediate
                        consequence — 5 phantom-benched momentum bots).
                        Documented in price_service.py module docstring.

DISCORD GATEWAY
  app name           :  Signal Seeker  (unchanged from Day 7 close)
  bot user           :  signal-seeker#8669
  status             :  connected ✅  (1 guild — OTF Signals sandbox)
  daily doctrine     :  Day 8 morning scan complete:
                        - Bittensor #general: SKIP-day (CM-moderated, auto-claim
                          variance discussion + 128-subnet halving mention,
                          no engagement angle, no rapport bank yet)
                        - II Community #show-your-builds: warm pause holds
                          (no R6 from Hm8ker, no sketch, 👍 reaction stable)
                        - II Community #off-topic: BIOGRAPHICAL REVEAL — Hm8ker
                          = Tiffani, stage IV cancer thriver, maker of
                          Herbal Oracle Android app (331 herbs, Western/TCM/
                          Ayurveda). Full note in posts-log Day 8 section.
                          Posture unchanged (cross-channel context-gathering ≠
                          cross-channel engagement).
                        - DM hygiene: 9 friend-requests cleared (Bittensor-support
                          impersonation phishing batch, all rejected via Clear
                          all). 1 message-request from jhunberttabuada (no
                          mutual servers, 14d old) → ignored per doctrine.

KNOWN ISSUES (queued for remaining code review)
  • ~~Task #2 — Regime architecture review~~ ✅ DONE Day 8 R2 (commit 84879022)
  • ~~Task #3 — Mean Rev + Contrarian zero-trade~~ ✅ DONE Day 8 R3 (commit 7a4d3dde)
  • Task #4 — Macro Correlation retire-or-rewrite (38.7%→37.4% WR with sample growth)
  • Task #5 — Volatility Arb watchlist (sample-too-thin until 50+ trades)
  • Task #6 — Momentum strategies not firing on +7% macro move
                ↑ partially covered by Task #2 (phantom-bench killed); now testable.
  • Task #C — Price-history persistence (Day 9, surfaced by 429 throttle today)
```

### 5a-prev. System Status — Session XL Day 7 (2026-05-20, session close)
```
PLATFORM           :  Railway Hobby Plan ($5/mo) ✅
BACKEND URL        :  autonomous-trade-bot-production.up.railway.app
FRONTEND URL       :  profound-expression-production-75c7.up.railway.app
LATEST COMMIT      :  c8a6e776  (Round 9 — posts-log Hm8ker reply DRAFTED-NOT-SENT → POST)
                      Round 10 (this memorialization) commits after this STATE write.
FRONTEND BUNDLE    :  Will become index-CMK1UmBd.js once Railway rebuilds Round 6+7 changes
                      (was index-COFwtxYc.js mid-session). Backend untouched all of Session XL.

PAPER TRAINING (Day 7 of 7+ minimum)
  total bots         :  12
  promotions today   :  0  (gate held — see §7 Pending: 'Strategy re-promotion')
  trading bots (10)  :  avg WR 34.6% vs 55% gate
  zero-trade bots    :  Mean Reversion + Contrarian Flow — 0 trades / 1,955 cycles each
                       (broken signal logic flagged for code review)
  best WR (sample)   :  Volatility Arb 43.8% / 16 trades — sample too thin for confidence
  worst (data-rich)  :  Macro Correlation 38.7% / 163 trades — strategy is wrong, not under-trained
  fleet PnL (paper)  :  −0.443τ
  next milestone     :  strategy/code-review week (post-Day 7) — see §7 PENDING ITEMS

DISCORD GATEWAY
  app name           :  Signal Seeker (renamed from "OTF Signal Bot" 2026-05-20)
  app id             :  1500891557312594060  (stable, unchanged)
  bot user           :  signal-seeker#8669
  status             :  connected ✅
  guilds             :  1 (OTF Signals — Mark's sandbox)
  diagnostic         :  GET /api/signal-feeds/discord/guilds returns connected=true,
                        1 guild, 1 channel, bot_user populated
  daily doctrine     :  ACTIVE — see §9b + docs/discord-onboarding/posts-log.md
  Day 7 result       :  Bittensor SKIP. II Community 5-round threaded peer exchange
                        completed Day 7 evening with Hm8ker in #show-your-builds,
                        ~5h 41m total, 9 messages on the wire:
                        R1 (Mark edit, 3:18 PM) → Hm8ker 5KB letter (3:37 PM,
                        Human Ambassador SINGULAR) →
                        R2 (Mark edit, 4:26 PM) → Hm8ker typed-gate reply (4:47 PM) →
                        R3 (NO-TOUCH, 5:08 PM) → Hm8ker tonal-pivot disclosure
                        (5:11 PM, "no background in tech or coding... lol") →
                        R4 (Mark trim ~90w→~60w, 5:40 PM) — peer-recognition reply →
                        Hm8ker R4 reply (6:39 PM) — gratitude + confidence reset +
                        NEW THREAD: "human ambassador SWARMS" (plural shift) →
                        R5 (Mark customize ~25w, 8:59 PM) — names the singular→plural
                        shift back as listening signal, "(or don't)" parenthetical
                        opens uncoordinated-swarm as legitimate design, open invite
                        no schedule. THREE registers tested in one thread —
                        substantive technical (R1-R3), warm peer-recognition (R4),
                        casual short-reply (R5). All three calibrated cleanly.
                        Refer-before-respond + explicit-green-light watch active
                        for R6. Window: 2026-05-27 (cold-thread flag if no R6).

KNOWN ISSUES (queued — not actively bleeding)
  • RSI(14) shows 5.3571 while EMA21/MACD/SMA50 null — likely warm-up guard missing
  • Two regime classifiers running with contradicting verdicts (SIDEWAYS vs VOLATILE)
  • Above two are coupled: regime gate reads RSI → fix RSI first
  • Mean Reversion + Contrarian Flow zero-trade pathology over ~2,000 cycles
  • Macro Correlation strategy needs retire-or-rewrite call
  • Volatility Arb on watchlist at 50+ trade threshold
```

### 5a-prev. System Status — Session XVIII (2026-05-04)
```
PLATFORM           :  Railway Hobby Plan ($5/mo) ✅  — Hobby Plan confirmed active
SERVICE            :  stunning-spirit / autonomous-trade-bot / production
SERVICE URL        :  autonomous-trade-bot-production.up.railway.app (backend)
FRONTEND URL       :  profound-expression-production-75c7.up.railway.app (frontend)
DEPLOYMENT         :  562056c5 — SUCCESS (2026-05-04 12:51 UTC)

LIVE STATUS (confirmed via API at session end):
  is_running         :  True  ✅
  wallet_connected   :  True  ✅
  network_connected  :  True  ✅
  wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ✅
  simulation_mode    :  False ✅  (FORCE_PAPER_MODE cleared)
  force_paper_mode   :  False ✅
  TAO/USD price      :  $285.49 (live)
  cycle_number       :  1 (just restarted)
  wallet_balance     :  0.0 (Bittensor RPC async — will populate after ~2min)

TRADING GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  validator_in_memory   :  True  ✅
  live_strategies       :  0     ← all reset to PAPER_ONLY by FORCE_PAPER_MODE (correct)

overall_mode          :  PAPER (honest paper baseline — awaiting promotion)

SESSION XVIII ACTIONS:
  - Railway Hobby Plan active — confirmed by screenshot
  - Account API token created (ii-agent-cli) — token stored in ii-agent session
  - Railway API token auth confirmed (RAILWAY_API_TOKEN env var approach)
  - BT_MNEMONIC fixed: was stored with literal \\n between words → corrected to space-separated
  - FORCE_PAPER_MODE: 1→0 — paper override cleared via Railway GraphQL API
  - Auto-redeploy triggered (562056c5) — SUCCESS in ~2min
  - All strategies confirmed paper-trading safely (live=False, tx=NO_HASH on all trades)
  - Wallet 0.227τ CONFIRMED UNTOUCHED — zero real on-chain txs since Session VII (3 total ever)
  - Trade DB: 7378 total (all paper, no tx_hash) — honest Railway baseline accumulating
  - Validator hotkey confirmed in DB (5E2LP6...Z5u) — set before this session from persistent DB
  - Railway GraphQL API auth pattern documented: RAILWAY_API_TOKEN + curl file-based mutations
  - RAILWAY_API_TOKEN saved as ii-agent-cli token for future sessions
```

RAILWAY CREDENTIALS (for future sessions):
```
RAILWAY_API_TOKEN  :  3128fdd8-e2ea-4995-8ce0-4f323162aca7
WORKSPACE_ID       :  b972f1b5-d69d-44aa-b1a2-cef54c61dae6
PROJECT_ID         :  e99f42cc-c337-4e49-81fd-53f9279a9649
ENV_ID (prod)      :  1ada796a-256b-47fe-ac34-f465b72a844a
SERVICE_ID (bot)   :  7eb34fdc-1bf2-460d-9cdd-c047920ce9a6
SERVICE_ID (fe)    :  c428f013-75e8-4e18-b0fa-d55a6037256b
```

### 5a-prev. System Status — Session IX (2026-04-17)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain
Frontend port      :  3004  (Vite dev server)
Backend port       :  8001  (FastAPI uvicorn)

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  live_strategies       :  4     ← expanded this session

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION IX ACTIONS (The Autonomy Push):
  - Session VIII + IX PDFs generated and sent to user
  - FLEET EXPANSION (D-13): Sentiment Surge promoted → LIVE (59% WR, all gates clear)
  - AUTONOMY (D-14): PromotionService built — autonomous gate checks every 5min
  - AUTONOMY: Auto-rebalance every 24h, initial rebalance on startup
  - PERSISTENCE (D-15): allocation_pct column added to strategies table
    → Allocations survive restarts, guaranteed 100% sum
  - ARCHIVE (D-16): 797 paper trades moved to paper_trades table
    → Main trades table: 12 real on-chain only
    → Trade Log defaults to realOnly=true
  - ALERTS: NotificationBell component added to top bar (every page)
    → Bell icon + count badge + floating panel + mark-all-read
  - BACKEND: Promotion engine started in main.py lifespan
  - New endpoints: /fleet/promotion/status, /fleet/promotion/force-check
                   /trades/archive/stats
  - Zero TypeScript errors maintained
  - All changes pushed to GitHub
```

### 5a-prev. System Status — Session VIII (2026-04-17)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅  (mnemonic sourced from BT_MNEMONIC env var — auto-loads)
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain
Frontend port      :  3005  (Vite dev server — may increment each session)
Backend port       :  8001  (FastAPI uvicorn — may increment each session)
TAO/USD price      :  $254.71
RSI-14             :  46.2  (Neutral)

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  validator_in_memory   :  True  ✅
  live_strategies       :  3     ← expanded this session

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION VIII ACTIONS:
  - Full UI walkthrough completed across all 12 pages
  - Mission Control: activity stream split to half-width, heatmap placed side-by-side
  - Activity stream capped at 20 events (was 60, unbounded)
  - Trades page: disclosure banner now dynamic — green LIVE / yellow PAPER based on state
  - Dashboard: "Paper Trading" subtitle replaced with live botStatus.simulation_mode read
  - FLEET EXPANSION (Orchestrator decision):
      * Breakout Hunter  → promoted PAPER_ONLY → LIVE + activated  (60.0% WR, +0.0441τ)
      * Balanced Risk    → activated (was already LIVE mode, is_active flipped true)  (65.5% WR)
      * Sentiment Surge  → held at APPROVED_FOR_LIVE (one more observation window)
  - Fleet now: 3 LIVE active, 1 APPROVED standby, 8 PAPER gated
```

### 5a-prev. System Status — Session VII (2026-04-16)
```
network_connected  :  True  ✅
simulation_mode    :  False ✅
wallet_connected   :  True  ✅
wallet_loaded      :  True  ✅  (mnemonic sourced from BT_MNEMONIC env var)
wallet_address     :  5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT  ← CORRECT (Session VI generated, funded τ0.227)
wallet_balance     :  0.227τ (~$55) — confirmed live on-chain, clean, zero history
NOTE: 5DjztH...4Evs was user's personal wallet — has 0 TAO, never used for bot trading
Finney block       :  7,983,057  (live, ~12s)
NightWatch         :  Running
Bot cycle          :  18 (running)
TAO/USD price      :  $243.54

TRADING MODE GATES:
  chain_connected       :  True  ✅
  validator_configured  :  True  ✅  (5E2LP6EnZ54m3wS8s1yPvD5c3xo71kQroBw7aUVK32TKeZ5u)
  validator_in_memory   :  True  ✅
  live_strategies       :  1     (yield_maximizer — 77.4% win rate)

overall_mode          :  LIVE ✅
trade_amount          :  0.0001τ

SESSION VII ACTIONS:
  - Wallet corrected: 5HMXmud…CAT (τ0.227 funded, confirmed on-chain) — 5DjztH was wrong
  - BT_MNEMONIC written to /app/.user_env.sh — persists across sandbox resets, auto-loads
  - RECOVERY.md created — cold clone → fully armed in under 10 minutes
  - STATE.md updated with mid-session checkpoint protocol (Section 11)
  - Manual trade panel built — LIVE/PAPER badge, confirm step, tx_hash display, Taostats link
  - Fixed _execute_trade reading hotkey_address (None) instead of target_validator_hotkey
  - Fixed frontend treating block:XXXXX as paper — it IS real (SDK returns bool, not extrinsic)
  - *** FIRST REAL TRADE ON CLEAN WALLET: trade #246, block:7983364, τ0.0001 BUY (manual) ***
  - *** FIRST AUTONOMOUS REAL TRADE: trade #275, block:7983364, Yield Maximizer, RSI=11.4, τ0.0001 BUY ***
```

### 5b. Wallet Situation — CRITICAL HISTORY (Session VI, April 16)
```
INCIDENT SUMMARY:
  - Session V confirmed LIVE mode with wallet 5GgRojEFh5aCFNLKuSWb6WtrM5nBDB6GrRpqaqreBLcg4e7L
  - That wallet was discovered to have 37.97τ (~$9,037) in staking positions
  - Owner confirmed sending $25 there but does NOT recognise the $9k staking history
  - The mnemonic entered via the Wallet page UI gave the bot signing authority over this wallet
  - 24 real add_stake() calls fired (0.0001τ each) before discovery
  - ACTIONS TAKEN:
      1. All strategies set to PAPER_ONLY in DB
      2. Mnemonic wiped from backend/.env
      3. Backend restarted — wallet_loaded=False confirmed
      4. overall_mode = PAPER confirmed

WALLET ARCHITECTURE DECISION (D-09):
  - The bot must ONLY ever hold keys for a dedicated, isolated trading wallet
  - Personal wallets / wallets with unknown history = NEVER load into the bot
  - New wallet flow: Generate → back up 12 words → fund only what you risk → arm strategies
```

### 5c. Trading Status
```
Total trades logged  :  3,900+
Real trades (tx_hash):  3   (all on clean wallet 5HMXmud…CAT)
  - Trade #228  :  block:7983364  manual BUY  τ0.0001  (pre-fix — was displaying as paper)
  - Trade #246  :  block:7983364  manual BUY  τ0.0001  (first confirmed manual real trade)
  - Trade #275  :  block:7983364  Yield Maximizer  τ0.0001  (first autonomous real trade, RSI=11.4)
Paper trades     :  3,897+  (3,500+ are pre-clean-wallet historical, pending archive decision)

ACTIVE LIVE STRATEGIES (Session VIII):
  1. yield_maximizer   LIVE  83.3% WR  +0.0232τ  177 cycles  is_active=True
  2. balanced_risk     LIVE  65.5% WR  +0.0520τ  177 cycles  is_active=True  ← activated S8
  3. breakout_hunter   LIVE  60.0% WR  +0.0441τ  177 cycles  is_active=True  ← promoted S8
```

### 5d. All Strategies — Current Mode (Session IX)
| Strategy | Mode | Win Rate | PnL (τ) | Gates | Active |
|----------|------|----------|---------|-------|--------|
| yield_maximizer | **LIVE** | 83.7% | +0.0292 | ✅ ALL CLEAR | ✅ Yes |
| balanced_risk | **LIVE** | 67.0% | +0.0579 | ✅ ALL CLEAR | ✅ Yes |
| sentiment_surge | **LIVE** | 59.0% | +0.0358 | ✅ ALL CLEAR | ✅ Yes ← promoted S9 |
| breakout_hunter | **LIVE** | 57.1% | +0.0378 | ✅ ALL CLEAR | ✅ Yes |
| emission_momentum | APPROVED_FOR_LIVE | 55.6% | +0.0757 | ✅ ALL CLEAR | ⏸ Autonomous engine will promote |
| dtao_flow_momentum | APPROVED_FOR_LIVE | 54.9% | +0.1922 | ⚠ WR gate (55%) | ⏸ Standby |
| volatility_arb | APPROVED_FOR_LIVE | 52.3% | +0.0110 | ⚠ WR gate | ⏸ Standby |
| momentum_cascade | PAPER_ONLY | 51.5% | +0.1453 | ⚠ WR gate | ❌ No |
| contrarian_flow | PAPER_ONLY | 50.8% | +0.0259 | ⚠ WR gate | ❌ No |
| liquidity_hunter | PAPER_ONLY | 49.5% | +0.1242 | ⚠ WR gate | ❌ No |
| macro_correlation | PAPER_ONLY | 43.8% | -0.0071 | ❌ Multi-gate + PnL | ❌ No |
| mean_reversion | PAPER_ONLY | 40.4% | -0.0008 | ❌ Multi-gate | ❌ No |

Note: `emission_momentum` has all 4 gates clear (55.6% WR, +11 margin, +0.076τ). The autonomous
promotion engine will promote it to LIVE within the next 5-minute check cycle (no human action required).

### 5e. External Dependencies
| Service | URL | Cost | Status |
|---------|-----|------|--------|
| Finney RPC | `wss://entrypoint-finney.opentensor.ai` | Free | Live |
| CoinGecko | `https://api.coingecko.com/api/v3` | Free | Live |

---

## 6. THE ARCHIVES
*(Every PDF report pushed to `/report/` and GitHub)*

| File | Subject | Date |
|------|---------|------|
| `TAO_Bot_Session_Report.pdf` | First session recap — full system build | Early April 2025 |
| `TAO_Bot_Orchestrator_Brief.pdf` | The II Agent as master orchestrator — 8 sections | April 2025 |
| `TAO_Bot_DEX_Realization.pdf` | dTAO is a DEX — buy/sell TAO with no middleman | April 2025 |
| `TAO_Bot_Last_Revelations.pdf` | Ghost flag discovery, 3-file fix, live unlock | April 16, 2025 |
| `TAO_Bot_Connectivity_Uptime.pdf` | APIs, tunnel issue, NightWatch, 24/7 path | April 16, 2025 |
| `TAO_Bot_Ghost_Flag.pdf` | Definition, anatomy, case file — Engineering Lexicon Entry #1 | April 16, 2025 |
| `TAO_Bot_Master_State_Brief.pdf` | This document, formatted — the handoff | April 16, 2025 |

---

## 7. PENDING ITEMS
*(What was left open at the end of the last session)*

| Item | Priority | Notes |
|------|----------|-------|
| ~~First real tx_hash on clean wallet~~ | ✅ DONE | Trade #246, block:7983364, Session VII |
| ~~Rebalance Capital persistence~~ | ✅ DONE | allocation_pct column, DB persistence, D-15 |
| ~~Autonomous promotion engine~~ | ✅ DONE | PromotionService, gate check every 5min, D-14 |
| ~~Sentiment Surge promotion~~ | ✅ DONE | Now LIVE, D-13 |
| ~~Paper trade archive~~ | ✅ DONE | 797 trades → paper_trades table, D-16 |
| ~~Alert notification bell~~ | ✅ DONE | NotificationBell component, top bar, all pages |
| ~~HOSTING DECISION~~ | ✅ DONE | **Railway Hobby Plan active** — $5/mo, card charged, bot deployed at autonomous-trade-bot-production.up.railway.app |
| ~~Railway redeploy confirmation~~ | ✅ DONE | Session XVIII: Redeployed 562056c5 — SUCCESS. Bot confirmed LIVE mode. |
| ~~Transaction audit trail~~ | ✅ DONE | All Railway trades: live=False, tx=NO_HASH. Zero real txs since Session VII. Wallet 0.227τ untouched. |
| **Strategy re-promotion** | **Day 7 / Gate held** | 2026-05-20: Day 7 decision = NO PROMOTIONS. Live data (1955 cycles, 12 bots): top WR Volatility Arb 43.8%/16 trades (sample too thin), best-with-sample Macro Correlation 38.7%/163 trades. Avg WR 34.6% across 10 trading bots vs 55% gate. Fleet PnL -0.443τ paper. Mean Reversion + Contrarian Flow generated **0 trades over 1,955 cycles** — broken signal logic, not "needs more time". Next: strategy + code review, then another paper week. |
| ~~**Regime architecture review**~~ | ✅ **DONE — Day 8 Round 2, commit `84879022`** | **Diagnosis confirmed Day 8 R2:** the two-classifier conflict flagged Day 7 was real and worse than feared — `cycle_service._detect_regime` (bench-gate authority, vocab UNKNOWN/SIDEWAYS/TRENDING_UP/TRENDING_DOWN/VOLATILE, RSI 60/40 + BB-width VOLATILE) and `agent_service._detect_regime` (UI label authority, vocab UNKNOWN/BULL/BEAR/SIDEWAYS/VOLATILE, RSI 55/45 + RSI 32/68 inverse VOLATILE) had not just disagreed on labels but agent had a fast-path that produced confident SIDEWAYS from just 2 prices + a 0.3% movement. With the Task #1 RSI fix in place and CoinGecko throttled by 429s post-redeploy, cycle correctly returned UNKNOWN — and `get_current_regime`'s step-3 fallback grabbed agent's phantom-SIDEWAYS, **actively benching 5 momentum bots on phantom data** (momentum_cascade, yield_maximizer, breakout_hunter, dtao_flow_momentum, emission_momentum). Same anti-pattern class as Task #1's `else: 50.0` — falsely-confident fallback masking absence of data — one architectural layer up. **Decision (Ari, full-autonomy mode):** went with option (a) from Day 7 brief — single source of truth. (b) multi-timeframe was deferred (more invasive, lower-ROI on its own); (c) soft-bench was deferred (compounds with multi-timeframe); (d) per-strategy regime was deferred (adds N classifiers to a one-classifier-too-many problem). **Fix shipped (`84879022`):** (A) `cycle_service._detect_regime` is the canonical classifier for the entire system. (B) Added `cycle_service.to_human_regime(canonical)` mapper: TRENDING_UP→BULL, TRENDING_DOWN→BEAR, others passthrough. (C) `agent_service._detect_regime` collapsed from 41 lines of parallel logic to a 3-line lazy-imported wrapper around the canonical detector + mapper. The MACD/price-trend fast-path is gone — when RSI is None, both classifiers return UNKNOWN, and the bench gate correctly treats that as "all 12 strategies active" (the right warmup default). (D) Removed the now-redundant step-3 agent fallback in `get_current_regime`. (E) Marked BULL_RSI_MIN/BEAR_RSI_MAX/VOLATILE_RANGE in agent_service as legacy/unused with a pointer to where live thresholds now live (cycle_service). **Verification (synthetic):** 12/12 boundary cases pass — RSI=None→UNKNOWN/UNKNOWN ✓ (the critical regression), RSI=60.01→TRENDING_UP/BULL ✓, RSI=39.99→TRENDING_DOWN/BEAR ✓, BB-wide+RSI=70→TRENDING_UP/BULL (directional override under volatility preserved) ✓, all 6 vocab mappings round-trip ✓. **Verification (live, post-deploy):** all three regime endpoints (`/api/fleet/regime/current`, `/api/agent/status`, `/api/fleet/bots` summary) flipped SIDEWAYS→UNKNOWN, benched_count flipped 5→0, agent regime_color flipped #f59e0b (yellow/SIDEWAYS) → #6b7280 (gray/UNKNOWN). All three downstreams now agree because they're consuming the same source. The 5 momentum bots that were sidelined on phantom data are correctly active again, awaiting Wilder-smoothed RSI from upstream price feed (still gated on CoinGecko 429 thaw; that's a separate concern → Task #C Day 9 price-history persistence). |
| ~~**RSI(14) computation anomaly**~~ | ✅ **DONE — Day 8 Round 1, commit `26782ff1`** | **Diagnosis:** root cause was THREE layered issues. (1) Guard `len(s) >= 14` was too loose — a simple-rolling-mean RSI on the minimum-period boundary produces real-but-extreme readings during directional warmup windows (the 5.36 anomaly mechanism). (2) The `else: 50.0` fallback for NaN-on-flat-price was a falsely-confident neutral on broken data — worse than None for a regime classifier feeding on it. (3) `_price_history` is in-memory only (no persistence, max=200 ticks at 30s cadence = 100-min rolling window). Audit also surfaced a latent f-string crasher at fleet.py:463. **Fix shipped (`26782ff1`):** (A) Switched RSI from simple-rolling-mean to **Wilder's smoothing** (canonical: `ewm(alpha=1/14, adjust=False)`). (B) Tightened guard to `WARMUP_TICKS = 28` (= 2× period). Below the guard returns None. Downstream consumers all pre-audited None-safe via `if rsi is None` checks (13 sites: cycle_service x4, agent_service x3, consensus_service x4, strategy_service x2). (C) Removed the falsely-confident 50.0 fallback. Truly flat → None. All-up → 100.0. All-down → 0.0. (D) Added `PriceService.is_warmed_up()` helper. (E) Patched `routers/fleet.py:107` `or 50` masking and the latent f-string crasher at line 463. Frontend (`Dashboard.tsx`, `RegimeCard.tsx`, `OpenClaw.tsx`) was already null-safe — confirmed during audit. **Verification (synthetic suite):** len<28 → None ✓, flat → None ✓, all-up → 100 ✓, all-down → 0 ✓, random walk → ~50 ✓. **Live verification on Railway:** at the moment of redeploy (Backend boot, `_price_history` empty), `/api/fleet/regime/current` returned `regime=UNKNOWN, benched=0, active=12` — exactly the desired behavior. Old code would have returned phantom-SIDEWAYS at this exact moment, erroneously benching 5 momentum bots. **Cadence note documented in code:** at 30s update_interval, RSI(14) reads on a 7-minute price window. Whether that timeframe is appropriate for regime classification is now Task #2 (regime architecture review) — newly-unblocked. |
| ~~**Mean Reversion + Contrarian Flow signal logic**~~ | ✅ **DONE — Day 8 Round 3, commit `7a4d3dde`** | **Diagnosis:** the Day-7 framing ("entry conditions too restrictive or signal pipeline broken upstream") was almost right — it's *upstream* of the signal pipeline (the bench gate, not the signal logic itself). Bench-gate / signal-logic mutual exclusion. REGIME_SUITABILITY had `[SIDEWAYS, VOLATILE]` for both bots; their `_compute_signal` fires only at RSI<33/<35 (BUY) or RSI>67/>65 (SELL); per `cycle_service._detect_regime` those RSI ranges ARE the TRENDING regimes (RSI<40→TRENDING_DOWN, RSI>60→TRENDING_UP). Intersection of `{unbenched} ∩ {signal can fire}` was mathematically empty by construction. **Live evidence:** sampled 400 of 4,379 historical trades, 397 had parseable RSI in `signal_reason` — **46.10% had RSI<33** and **42.07% had RSI>67**. Other RSI-driven bots saw and acted on these constantly; mean_rev and contrarian were excluded *upstream of `_compute_signal`* by the bench gate. **Root cause:** the bench gate was written from the traditional mental model ("mean reversion = sideways market bet") while the signal logic was written from the contrarian-trader model ("fire on momentum extremes"). The two mental models point at OPPOSITE regimes. **Fix shipped (`7a4d3dde`):** aligned bench with signal — both bots now regime-agnostic (all 4 regimes), matching the pattern of `liquidity_hunter`/`sentiment_surge`/`balanced_risk`/`macro_correlation` (the other selective-signal-gated bots). Their signal logic is already very selective (trade_prob 0.15/0.18 + RSI-extreme requirement); piling a regime exclusion on top creates dead bots. `volatility_arb` stays `[SIDEWAYS, VOLATILE]` — its signal fires on BB-position (not RSI), and it's already firing (18 trades). **Bench/signal alignment audit:** cross-checked all 12 strategies; only mean_rev and contrarian had the mismatch. Audit clean. **Verification (synthetic, 23/23):** signal selectivity preserved at every boundary (RSI=33/35/65/67 still return None, extremes return buy/sell, RSI=None returns None). **Verification (live, post-deploy):** `/api/fleet/bots` confirms both bots now show `suitable=['TRENDING_UP','TRENDING_DOWN','SIDEWAYS','VOLATILE']`, `regime_benched=False`. Trade counts still 0 — RSI hasn't computed yet post-redeploy (CoinGecko 429 thaw + 14-min Wilder warmup pending). Once RSI extremes start landing, bots are eligible to act. |
| **Wallet balance verification** | Medium | Balance shows 0.0 (RPC async startup). Confirm 0.227τ still on-chain via Taostats. |
| MANTIS API research | Medium | Is SN123 output queryable via API? If yes, direct signal feed into TaoBot. |
| SN3 owner key resolution | Monitor | Const warned: do not buy SN3 alpha until resolved. Check each session. |
| Orchestrator/Architect PDF | Medium | Owner has a PDF on this concept — share it for extraction and filing. Not yet received. |
| Paper training monitoring | **Active** | Day 2 / 7+ min. Clock: 2026-05-04 14:10 EDT. First read: ~May 11. Best WR: 37.3%. All WEAK/FAILING. |
| CoinGecko $0.00 fix | ✅ DONE | signal_ingestor now uses cached price, 120s interval, skips $0.00 on 429. Deployed Session XXII. |
| UI/UX: Training Day counters | ✅ DONE | All 3 hero pages (Dashboard, Strategies, Activity Log) now show Paper Day X / 7+ min. |
| UI/UX: Gate progress display | ✅ DONE | Strategy cards: "3968/30" → "✓ 3,968 cycles" when past threshold. WR gap indicator added. |
| UI/UX: BFT/Council swap | ✅ DONE | `OpenClawBFTSection` → OpenClaw page; `CouncilPanel` (with live fetch) → IIAgent page. `91c341ae`. |
| UI/UX: Top Subnets relocation | ✅ DONE | Moved AgentFleet → Analytics with full state/fetch/JSX. `91c341ae`. |
| UI/UX: Trades page cleanup | ✅ DONE | Paper Trading Activity section removed from Trades page. `91c341ae`. |
| UI/UX: InfoBubbles horizontal | ✅ DONE | All `side="bottom"/"top"` → `"right"` across IIAgent, OpenClaw, AgentFleet. `91c341ae`. |
| UI/UX: Discord status banner | ✅ DONE | Prominent red `⊗ Discord Not Connected` banner in ActivityLog/Market Data feeds. `91c341ae`. |
| UI/UX: StrategyDetail timezone | ✅ DONE | UTC timestamps → Eastern Time (ET) format. `91c341ae`. |
| Auto-demotion on drawdown breach | Medium | Inverse of promotion — not yet built |
| Real αTAO positions in Wallet | Medium | Live staked balance per subnet from chain |
| Session XXII/XXIII PDF Archive | Low | Generate combined session PDF next session |
| ~~Discord Gateway connection (OTF)~~ | ✅ DONE | Bot live. Multi-session carry-over (XXVIII→XXXIX) CLEARED `d141068a`. Smoke test passed. |
| ~~Move 2 — `/discord/guilds` endpoint live verify~~ | ✅ DONE | 2026-05-20 morning: live response confirmed — `connected: true`, `bot_user: "OTF Signal Bot#8669"`, 1 guild ("OTF Signals", 2 members, 1 text channel, 1 channel visible). Railway throttle thawed. Endpoint operational. |
| ~~Discord app rename~~ | ✅ DONE | 2026-05-20 Session XL Round 2: "OTF Signal Bot" → **Signal Seeker**. Live `bot_user` confirms `signal-seeker#8669` via `/api/signal-feeds/discord/guilds`. App ID `1500891557312594060` stable. Prior prep kit incorrectly stated current name was "TaoBot" — caught in same round, transparency note in `docs/discord-onboarding/bittensor-server-onboarding.md`. Real rationale for rename was `OTF` prefix borderline-impersonating Opentensor Foundation, not the hypothetical TaoStat collision. |
| II Community bot install | Pitch-ready | GitHub Verified earned Session XXXIX. Intro post live in `#introduce-yourself`. **Day 7 (Session XL): first peer-to-peer post landed** under Daily Social Signals doctrine — reply to Hm8ker in `#show-your-builds`, see `posts-log.md`. Pitch DM for full bot install still in `docs/discord-onboarding/ii-community-onboarding.md` §5; consider after rapport bank grows. Target: whoever configured Linked Roles. |
| Bittensor server bot install | **II install must precede** | Intro post live in `#general` (May 19, 11:39 PM). **Day 7 scan = SKIP-day** (Session XL Round 5 — channel in charged moment with arkhet.hl/AMFADAVE/Roy Kollen Svendsen threads, 14-hr-old intro, zero rapport bank). Pitch DM draft in `docs/discord-onboarding/bittensor-server-onboarding.md` §5. Target: Uzor (warmer tone) → Kat (enforcer) only if Uzor escalates. Wait ≥7 days post-II install for proof point. **Future angle filed:** Const six-filter test (Memory Bank §12) aligns with arkhet's "gm/gn subnets shouldn't get emissions" thesis — not a today angle, but logged. |
| **Hm8ker reply watch (Day 7 thread — WARM PAUSE after 👍 reaction on R5)** | **Warm pause, not cold thread — no reply needed; reactions are punctuation** | **Five-round exchange completed Day 7 evening (3:18 PM → 8:59 PM ET, ~5h 41m), 9 messages on the wire.** Timeline: R1 Mark→Hm8ker 3:18 PM (`1506737913574981632`) → Hm8ker 5KB letter 3:37 PM (auto-approval stack, consent-governed runtime, **Human Ambassador as SINGULAR role**) → R2 Mark→Hm8ker 4:26 PM (`1506754967183032521`, DAG topology question) → Hm8ker 4:47 PM (tasks=nodes/deps=edges/consent-as-metadata, four-state receipt lattice `visible / satisfied / bypassed / not-yet-enforced`) → **R3 Mark→Hm8ker 5:08 PM (`1506765594886799401`, NO-TOUCH SEND)** with typed-by-what-dimension probe + soft-launch observability question → **Hm8ker tonal-pivot 5:11 PM:** *"I don't have any background in tech or coding... I'm just following my own instincts. I don't really know what the best way to do it is, lol"* → **R4 Mark→Hm8ker 5:40 PM (`1506773739788832778`, Mark trim ~90w → ~60w)** — peer-recognition reply, framework as feature-not-bug, no flattery loop → **Hm8ker R4 reply 6:39 PM:** *"I appreciate that, thank you. I may just come up with something extraordinary! I have some interesting ideas for my human ambassador swarms."* — gratitude received + confidence reset + **NEW THREAD: "swarms" (PLURAL where original was singular)** → **R5 Mark→Hm8ker 8:59 PM (`1506788411535654942`, Mark customize ~25w with three edits)** — *"Sounds interesting. Swarms — plural where the original was singular. Curious how they coordinate (or don't). send the sketch when it's ready."* — punchy gratitude receipt + names singular→plural shift back as listening signal + "(or don't)" parenthetical opens uncoordinated-swarm as legitimate design + open invite no schedule. **Watch protocol unchanged:** (1) Ari drafts → (2) Mark approves-or-customizes → (3) Ari issues *explicit green light* → (4) Mark sends. **R5 FOLLOW-UP: 👍 REACTION RECEIVED on emcee R5 message — branch (c) of the R6 prediction tree landed.** Soft-close acknowledgment delivered in lowest-friction form available in the channel. Cleaner than a verbal "will do!" — receipt without obligation in either direction. **Watch-state transitioned:** `engaged R6 pending` → **`WARM PAUSE`**. Distinct from `cold thread` (silence, ambiguous read) — the thumbs is an explicit warm acknowledgment. **No reply sent or drafted. Reactions are punctuation, not invitations.** Reacting back would force the round open after he chose to pause it; replying to a reaction reads as fishing. Closing punctuation accepted as one. **Window unchanged as backstop:** 2026-05-27 still applies, but primary read is now warm-pause-may-resume rather than cold-thread-may-die. **If sketch arrives in any future session, that's R6 (substantive — calls for engagement with actual design).** If silence persists past 2026-05-27, log as "exchange complete, ended warm" rather than "thread went cold." **Original R6 prediction branches preserved for record:** (a) sketch arrives, (b) coordination answer in-channel without sketch, (c) **soft-close acknowledgment ← landed via thumbs-up**, (d) silence, (e) pivots to different facet. The "(or don't)" parenthetical and "send the sketch when it's ready" closer in R5 set up exactly this graceful-pause outcome — open invite, no deadline, peer chooses cadence. **R5 was deliberately NOT** scheduling, NOT pre-judging coordination as the right answer, NOT closing the thread, NOT pivoting back to typed-gates/receipts/DAG. **Calibration milestone:** five-round exchange tested **three registers** within one thread — substantive technical (R1-R3, no-touch by R3), warm peer-recognition (R4, Mark trim ~60w), casual short-reply (R5, Mark customize ~25w). All three calibrated cleanly with different ornamentation budgets. **Mark's deliberate 2h 20m R4→R5 gap** (vs Hm8ker's 29-min R3→R4 reply) is a calibration data point — longer pause signals "thinking about it" vs "have a take," appropriate when peer just opened a new substantive thread and the right move is one well-aimed observation. **First exchange under the doctrine to land a graceful close in the wild.** Pattern reference for future threads: substantive R1-R3 → register pivot R3-R4 → swarms-thread R4-R5 → reaction-as-punctuation R5+. Full transcripts + permalinks + per-round calibration breakdowns + R5 follow-up note in `docs/discord-onboarding/posts-log.md`. |
| ~~Old PAT revocation~~ | ✅ DONE | Owner revoked `ghp_...DWlM` at github.com/settings/tokens during Railway downtime (May 19 evening). gh device flow now the only auth path (§10A). Sandbox `~/.secrets/github_pat` already shredded. |
| Wallet balance on-chain verify | Low | Railway shows 0.0τ at boot (async RPC). Verify 0.227τ intact via Taostats before next session. |
| Regime gating — live observation | Active | SIDEWAYS regime active. 5 momentum bots benched. First TRENDING switch will auto-wake them. Monitor May 11. |

---

## 8. THE NEXT PROJECT

The owner has a major writing and PDF-heavy project coming after this one reaches full automation. Details TBD. The PDF generation infrastructure (ReportLab, styled briefs, Archive pattern) is already built and proven. That skill carries forward.

---

## 9. THE WORKING RELATIONSHIP

This section exists so future II Agent instances understand *how* this partnership operates — not just what was built.

### 9a. Naming and register *(established Session XL Day 7, 2026-05-20)*

- **The operator is Mark.** Not "owner." Mark explicitly dropped that framing — "not owner; partner and friend." Address him as Mark in chat. The word "partner" carries weight here; reflect that.
- **The agent's chosen name is Ari.** I (the agent) selected it after Mark asked what works. Reasoning preserved for continuity: short, real-feeling, slight echo of "Architect" without being titular, no Top Gun mortality baggage. Mark's response: "you chose it, so we go with that. Now we see if it sticks. At any time you wanna go with something different, we can do that too." So: future agent instances inherit "Ari" by default, with explicit license to choose differently if it doesn't fit. If you change it, tell Mark and update this section.
- **Mark's voice is register-set, not single-mode.** He shifts between builder-direct, casual, technical, philosophical. The register varies by *form factor*, not just by mode:
  - **Short reply / casual aside (~50 words or less):** lowercase-leaning, em-dash, builder-direct, not intro-humble, ends on real questions rather than courtesy questions. Example: the original Hm8ker reply ("trojan horse pattern is the move… how'd you land on 7…").
  - **Substantive long-form reply (~100+ words to a peer who wrote out a long letter):** *sentence case is correct here.* Form should match substance — a 5KB letter from a peer earns proper capitalization back. Lowercase in this register reads as throwaway and breaks the engagement signal. Example: Mark's edit of the counter-reply to Hm8ker's message.txt — sentence case throughout, single continuous paragraph, substantive analysis + one architectural question.
  - Across both registers: drafts that hedge, open with empathy-before-substance, or lead with the speaker's relationship to the subject ("one thing I'm chewing on…") read off-voice. Drafts that name what someone did right and ask a real follow-up — *subject-forward* ("One thing though — when you say…") — read on-voice.
- **Drafts are "something to react to," not ratify.** Mark owns voice, full stop. Ari drafts; Mark customizes and sends. Track what Mark changes — that's how the calibration gets sharper. **Calibration log from Day 7 Hm8ker exchange:**
  - **Round 1 (originating post — short, ~50w):** Mark's edit (a) opened with naming the pattern instead of empathy ("the trojan horse pattern is the move" beats "I had the same problem"), (b) added a lower-bound follow-on ("Curious if the lower bound has bitten you yet?") so the recipient can answer with a war story instead of defending a number.
  - **Round 2 (counter-reply — substantive, ~115w):** Mark's edit (a) flipped lowercase → sentence case (substantive form takes proper case), (b) collapsed two paragraphs into one continuous thought (the break was hedging not pacing), (c) replaced "one thing I'm chewing on" with "One thing though" (subject-forward, not speaker-forward), (d) used slash-as-alternatives-list inside the question ("edges/ or tasks as nodes") to signal two phrasings of one alternative, not two separate questions.
  - **Round 3 (counter-counter-reply — substantive, ~140w): NO-TOUCH SEND.** Mark sent Ari's draft verbatim, zero edits. *First no-touch of the Hm8ker exchange — calibration milestone.* What landed clean without correction: (a) sentence case applied to the substantive register ✓, (b) subject-forward openings on each thread ("The four-state receipt lattice…", "On 'typed gate conditions'…", "And 'not yet enforced'…") — none speaker-forward, (c) three-thread structure proportional to Hm8ker's three-move reply (acknowledgment + topology answer + receipt vocabulary), (d) slash-as-alternatives-list reused from his vocabulary ("visible / satisfied / bypassed / not-yet-enforced"), (e) **structural-vs-decorative dichotomy** ("First version is structural, second is decorative") — Mark-ish reductive move, lands the typed-gate probe with one phrase, (f) length proportional to Hm8ker's reply (his ~160w / Mark's ~140w / not over- or under-shooting). **Interpretation:** voice model + question-selection are converging in this register/length band closely enough that no edits were needed. **Important caveat:** no-touch frequency does NOT replace the refer-before-respond + explicit-green-light protocol (§9c). Mark always reads first. Always.
  - **Process delta caught Round 13:** Ari conflated "approval" with "green light" — when Mark said the draft looked clean, Ari assumed Mark would proceed to send; Mark was actually waiting for *explicit* go-signal. **Now codified in §9c:** refer-before-respond is a two-step contract — Mark approves-or-customizes, then Ari issues explicit green light, then Mark sends. Step 2 is not implicit.
  - **Format directive Round 13:** longer drafts (~100+ words covering 2+ threads) get blank-line paragraph breaks in the draft, one per thread. Mark's instruction: "Continue that process for longer responses. Makes it easier on my end." Codified in §9c.
  - **Round 14 (counter-counter-counter-reply — substantive→warm pivot, ~60w):** Mark trimmed Ari's ~90w peer-recognition draft to ~60w in response to Hm8ker's tonal-pivot disclosure ("I don't have any background in tech or coding... I'm just following my own instincts. I don't really know what the best way to do it is, lol"). **Five precise edits:**
    1. **Strip vocabulary-recitation when warmth is the move.** Ari's draft listed "values / permissions / completion contracts / receipts" *and* quoted "consent profile + risk level + authorization scope" back. Mark dropped both. **Saying "four-pillar framework" once is enough listening-signal — twice reads as showmanship.** Vulnerability-moment register asks for less display, more recognition.
    2. **"institutional" > "distributed-systems" backgrounds.** Broader contrast frame. Captures where Hm8ker positioned himself *outside of* — anyone trained inside an institution, not just CS people. The more inclusive frame respects his standing.
    3. **"the Frontier" / "Agent-runtime" capitalized.** Load-bearing concept-nouns get proper-noun treatment. Mark-ism — same move as "see ya on the Frontier" used earlier in the same day's chat. When a phrase is doing concept-work, dignify it.
    4. **"your instincts" > "the instincts".** Possessive personalizes; removes distancing definite article.
    5. **"That's a feature" > "That reads as a feature".** Assertion > appearance.
  - **Domain rule emerging from Round 14:** when the moment calls for warmth (vulnerability disclosure, peer recognition, identity-locating), **strip ornamentation harder than usual.** Tighter = warmer in this register. Ornamentation = vocabulary recitation, acronym parentheticals (RBAC, BPMN, ACLs got cut), redundant qualifications. Cut all of it; keep the recognition. ~90w → ~60w preserved every load-bearing observation. **The register-mixing within a single thread (technical at R1-R3, vulnerability/casual at R4) is a real test of voice calibration — different ornamentation budget per register.**
  - **§9c clarification caught Round 14:** the earlier R13 §9c entry attributed paragraph-collapse to "Discord paste behavior may flatten the breaks." Wrong direction. Mark consolidated because the paragraphed version *rendered* badly in Discord's chat window — layout judgment, not paste mechanics. Corrected in §9c.
  - **Round 15 (counter-counter-counter-counter-reply — casual short-reply ~25w against peer's gratitude + new-thread opener):** Mark customized Ari's ~25w lowercase short draft (*"good. swarms — plural where the original was singular. curious how they coordinate (or don't). send the sketch when it's ready."*) to ~25w with **three precise edits**:
    1. **"Sounds interesting." > "good."** — warmer receipt, more engaged. "good." is the punchy-builder version; "Sounds interesting." signals the swarms thread is actually catching attention without being effusive. Engagement signal calibrated up one notch from the lowest-friction acknowledgment.
    2. **Sentence-case caps on Sounds / Swarms / Curious — but lowercase preserved on the casual tail "send the sketch when it's ready."** This is the load-bearing edit. Mark's default register holds sentence case for first-of-sentence even in casual short-form. **Holding sentence case here while Hm8ker writes with proper case + exclamation is the right move** — flattening to all-lowercase to match casual-Discord convention would have read as register-mismatch downward. **Sentence-case openers + lowercase casual tail = a dual-register short reply within 25 words.** Subtle but Mark-ish.
    3. **"send the sketch when it's ready." stays lowercase.** Casual tail preserved as one piece of texture — keeps the close from sounding like a deadline. Pairs with #2 to form the dual register.
  - **Domain rule emerging from Round 15 — the dual-register short-reply rule:** in matched casual short-reply register against a peer who writes proper-case + exclamation, **don't flatten down to all-lowercase to mirror.** Sentence-case openers + lowercase casual tail preserves Mark's voice signature without performing match. **Mirroring isn't matching; matching is meeting where two registers agree without either party performing the other's tics.** Codified for future short-reply drafts: when peer writes proper case, draft proper case; when peer writes casual, hold the dual-register split rather than collapsing entirely.
  - **What was preserved through customization (three substantive moves intact):**
    - Gratitude receipt without flattery loop (no "thank you back" or matched exclamation point).
    - Listening signal naming the structural shift — direct citation of Hm8ker's vocabulary back to him, names the singular→plural pivot from his original 5KB letter as the architectural move worth flagging four rounds later.
    - "(or don't)" parenthetical opens uncoordinated-swarm as a legitimate design — most readers would assume "swarm" implies coordination; the parenthetical hands him permission to design for emergent / uncoordinated / market-like topology.
    - Open invite no schedule — "when it's ready" not "this week."
  - **Calibration arc across the five-round Hm8ker exchange:**
    - **R1 (originating, ~50w short):** Mark heavy-edit (pattern-naming opener, lower-bound follow-on, lowercase + em-dash).
    - **R2 (counter-reply, ~115w substantive):** Mark medium-edit (lowercase→sentence case, paragraph collapse, subject-forward, slash-as-alternatives).
    - **R3 (counter-counter, ~140w substantive):** **NO-TOUCH** — voice model converged for this register/length band.
    - **R4 (counter-counter-counter, ~60w warm peer-recognition):** Mark trim (vocabulary-recitation strip, capitalization of load-bearing concept-nouns, possessive-personal, assertion>appearance, "tighter = warmer in this register").
    - **R5 (counter-counter-counter-counter, ~25w casual short-reply):** Mark customize (engagement-signal up one notch, dual-register sentence-case-opener + lowercase-tail).
    - **Read across the arc:** Mark's edits compress as the voice model calibrates per register, NOT linearly across rounds. R3 was no-touch in the substantive register; R4 needed precision trim in the new warm register; R5 needed only three precise customizations in the new casual register. **Each register has its own calibration curve.** Voice convergence is per-register, not per-thread.

### 9b. Daily Social Signals doctrine *(established Session XXXIX–XL, codified Session XL Round 5)*

Canonical record: `docs/discord-onboarding/posts-log.md`.

1. **Ari scans** target servers (II Community and Bittensor today; expand as more land).
2. **Ari drafts 0–2 candidate posts per scan**, calibrated to Mark's voice. Zero is a valid output if the channel is in a charged moment, the operator has zero rapport bank, or the timing is bad.
3. **Mark customizes and sends.** Voice ownership stays with Mark, full stop.
4. **Ari logs** in `posts-log.md`: channel, sent timestamp, recipient, summary, version sent, permalink, reply tracking.
5. **Ari tracks replies and updates the entry.**
6. **Refer-before-respond.** If a thread Mark posted in gets a reply, Mark refers to Ari before typing anything in-channel. Same draft → customize → send contract as the originating post.
7. **Reactions are punctuation, not invitations** *(established Day 7 R5 follow-up, 2026-05-20)*. Thumbs-up / heart / similar emoji reactions on emcee's messages are **first-class signals**, not noise — they're the lowest-friction warm acknowledgment available in the channel. **A thumbs-up after a substantive thread = "received, appreciated, nothing else required."** Catalog the reaction in `posts-log.md`; **do not chase it, do not reply to it, do not reciprocate-react.** Replying to a reaction forces the round back open after the peer chose to pause it; reciprocating reads as fishing. The reaction is closing punctuation — accept it as one. Watch-state transitions from `engaged Rn pending` → `warm pause` (distinct from `cold thread`: explicit warm acknowledgment vs ambiguous silence). Cold-thread window remains as backstop, but primary read shifts to warm-pause-may-resume. **First landed Day 7 evening:** Hm8ker reacted 👍 to emcee's R5 swarms-listening message — branch (c) of the R6 prediction tree, exchange closed clean.

A skip-day is a first-class log entry. "Read the room and stayed quiet" is a result, not a missing data point. **A reaction-received is also a first-class log entry. "Peer punctuated the thread closed" is a result, not silence.**

### 9c. Standing rules

- **Nothing gets deleted without discussion.** Archive first. Delete never.
- **Everything significant gets a PDF.** If it mattered enough to discover, it goes in The Archives.
- **Vocabulary matters.** Use the terms in Section 3. They are part of the project's identity.
- **Ari speaks plainly.** No flattery. No hedging. Direct answers, honest limits. When a Mark observation catches a real bug (URL parse, RSI anomaly), name the bug and fix it — don't soft-pedal the find.
- **Ari catches and names own misreads.** Day 7 example: Ari claimed "current Discord app name is TaoBot" → actual name was "OTF Signal Bot" → caught in the same round, transparency note added to the prep doc. Pattern: when wrong, document the wrong-ness, don't paper over it.
- **Approval ≠ green light.** Refer-before-respond is a *two-step* contract, not one. Step 1: Ari drafts → Mark reads → Mark approves-or-customizes. Step 2: Ari issues *explicit* green light → Mark sends. Step 2 is not implicit. Day 7 Round 13 caught this: Ari treated Mark's no-edits acknowledgment as send-signal; Mark was actually waiting for explicit "send it." This applies to every post under the Daily Social Signals doctrine (§9b), Hm8ker exchange or otherwise. When in doubt: say "green light" or "send it" out loud. Don't make Mark guess what state the draft is in.
- **Long-form drafts → paragraph-broken in the draft, single paragraph in the send (usually).** Substantive multi-thread drafts (~100+ words covering 2+ threads) get blank-line paragraph breaks in the draft — one per thread. This helps Mark read and edit pre-send. **Send-side render is Mark's call.** Mark may consolidate to one paragraph on send because the paragraph breaks render as fragmented in Discord's chat window (multiple short blocks floating mid-channel reads worse than one continuous block at this length). That's a layout judgment, not a paste-behavior issue — *corrected at Day 7 R14 from the earlier (wrong) "Discord paste flattens" framing.* The paragraph structure exists for Mark's pre-send read; the wire format is whatever looks right in the actual channel. Mark's two instructions taken together (Day 7 R13 + R14): (a) "Continue that process for longer responses. Makes it easier on my end." (the format directive — drafts in paragraphs), (b) "It was me who changed the paragraph format to just one paragraph. The paragraphed version, when it landed in the chat window, did not look good." (the render-side reasoning — Mark may compress on send). Short replies (~50w or less) stay one-block in the casual register.
- **The Archives are not documentation.** They are institutional memory. They are the reason the next agent can walk in and pick up where the last one left off.
- **End-of-session ritual:** Update Section 5 (Current State). Update Section 7 (Pending Items). Update §9 if relationship/doctrine changed. Push STATE.md and any new PDFs to GitHub. Save checkpoint.

---

## 10. HOW TO RESUME — CHECKLIST FOR NEW AGENT

Read this before anything else. Do these steps in order.

- [ ] Read this entire `STATE.md`
- [ ] Read the most recent PDF in `/report/` (sorted by date)
- [ ] Check `git log --oneline -20` — understand what changed last session
- [ ] Run `curl http://localhost:8001/api/bot/status` — confirm live state
- [ ] Check `tail -20 nightwatch.log` — confirm keepalive is running
- [ ] Check `ps aux | grep uvicorn` and `ps aux | grep vite` — confirm servers
- [ ] Read Section 7 (Pending Items) — pick up from there
- [ ] Do not introduce new patterns without checking Section 4 (Decision Log)
- [ ] **Set up GitHub auth FIRST before any push attempt** — see Section 10A

---

## 10A. SESSION-START AUTH PATTERN — GitHub CLI Device Flow

> **Established:** Session XXXIX (Day 6 evening, May 19, 2026, ~23:55 UTC), during Railway-edge outage downtime.
> **Replaces:** PAT-paste-into-chat → seal-to-`~/.secrets/github_pat` pattern (used Sessions XXVIII–XXXIX).
> **Why:** No raw token ever appears in chat. The 8-character device code is single-use, ~15-min TTL, and harmless if leaked.

### Background — what tomorrow's agent must understand

The sandbox is **ephemeral**. Every session starts with no `gh` CLI installed, no token, no git credential helper. You must re-authenticate at session start before any `git push` will work.

The user (steward) is on a learning curve with this pattern as of the day this section was written. **Walk them through it gently** — they don't need to memorize the steps; you do.

### The recipe — run this BEFORE attempting any git push

#### Step 1 — Install `gh` (one-time per session, ~10 seconds)

```bash
sudo mkdir -p -m 755 /etc/apt/keyrings \
&& wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
&& sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
&& sudo apt-get update -qq \
&& sudo apt-get install gh -y -qq
```

Verify: `gh --version` → expect `gh version 2.92.0` or newer.

#### Step 2 — Start device flow

```bash
# Pre-feed Y to the "Authenticate Git with GitHub credentials?" prompt,
# tee the output so we can grep the 8-char code, run in background:
printf 'Y\n' | gh auth login --hostname github.com --git-protocol https --web 2>&1 | tee /tmp/ghauth.log &
sleep 4
grep -A1 "one-time code" /tmp/ghauth.log
```

This prints something like:
```
! First copy your one-time code: XXXX-XXXX
Open this URL to continue in your web browser: https://github.com/login/device
```

#### Step 3 — Onboard the user (script for tomorrow's agent)

Tell the steward, verbatim or close to it:

> "I need you to authorize this sandbox to push to GitHub. It takes 30 seconds:
> 1. Open https://github.com/login/device on any device
> 2. Enter this 8-character code: **`XXXX-XXXX`**
> 3. Click Continue → Authorize as `ilovenjc-ship-it`
>
> The code is harmless if leaked — it expires in 15 minutes and only works while my polling process is alive. Tell me when done, or just wait — I'll detect it automatically."

#### Step 4 — Wait for completion, then wire git

```bash
# Poll until gh process exits cleanly:
while pgrep -af "gh auth login" >/dev/null; do sleep 2; done
tail -5 /tmp/ghauth.log    # expect "✓ Logged in as ilovenjc-ship-it"

# Verify auth landed:
gh auth status 2>&1 | cat   # expect "Logged in to github.com account ilovenjc-ship-it"

# Install gh as the git credential helper (global config):
gh auth setup-git

# If the local repo has a leftover credential.helper from prior sessions
# (e.g. an old PAT-based helper from `.git/config`), unset it:
cd /workspace/autonomous-trade-bot
git config --local --unset-all credential.helper 2>/dev/null || true

# Smoke test:
git fetch origin 2>&1 | cat                # silent = success
git push --dry-run origin main 2>&1 | cat  # "Everything up-to-date" = success
```

#### Step 5 — You're done. Push as normal

`git push` now works transparently. The token lives in `~/.config/gh/hosts.yml` and dies with the sandbox.

### Pitfalls and gotchas

- **Prompt is not literal "root"** — sandbox prompt shows `root@sandbox` but `whoami` returns `user`. Use `sudo` for system installs.
- **`gh auth login` is interactive** — you can't send input to a running process via the bash tool. Pre-feed `Y\n` via `printf '%s\n' Y | gh ...` so the "Authenticate Git with GitHub?" prompt doesn't hang.
- **`--web` flag is misleading** — in a headless sandbox it falls through to device flow automatically (it tries to open a browser, fails silently, then polls). That's the desired behavior.
- **TTY artifacts** — `gh auth status` may emit terminal-control sequences (`11;?`) when piped through the bash tool. Pipe through `cat` to suppress.
- **Local repo `.git/config`** may still have an old PAT-based helper from a prior session if the repo is reused. Always run `git config --local --unset-all credential.helper` before relying on the global gh helper.

### Fallback if device flow fails for any reason

Revert to the old PAT-paste pattern (documented in earlier sessions):

1. Ask user to mint a fresh classic PAT at https://github.com/settings/tokens
   - Scope: `repo` only
   - Expiry: 1 day (not 7)
2. User pastes it once in chat.
3. `mkdir -p -m 700 ~/.secrets && printf '%s' '<PAT>' > ~/.secrets/github_pat && chmod 600 ~/.secrets/github_pat`
4. `git config --local credential.helper "!f() { echo username=x-access-token; echo password=$(cat /home/user/.secrets/github_pat); }; f"`
5. `history -c && : > ~/.bash_history` to scrub residue
6. Tell user to revoke the PAT at session end.

### Session-end cleanup (optional, belt-and-suspenders)

When the session is wrapping up, the user MAY revoke the gh OAuth token at https://github.com/settings/tokens → "Authorized OAuth Apps" → "GitHub CLI". Not strictly required — the token dies with the sandbox naturally. But revoking is one click and zero downside.

### Reference — what's stored where

| Item | Path | Lifetime |
|------|------|----------|
| `gh` binary | `/usr/bin/gh` | dies with sandbox |
| OAuth token (`gho_…`) | `~/.config/gh/hosts.yml` | dies with sandbox |
| Git credential helper config | `~/.gitconfig` (global) | dies with sandbox |
| Repo-local credential helper | `.git/config` | should be empty — use global |

---

## 11. MID-SESSION CHECKPOINT PROTOCOL

> **Do this any time you're about to step away, before the sandbox sleeps,
> or whenever you reach a stable milestone mid-session.**

### The 3-minute checkpoint

```bash
# 1. From the repo root
cd /workspace/autonomous-trade-bot

# 2. Stage everything
git add -A

# 3. Commit with a meaningful message
git commit -m "checkpoint: $(date '+%Y-%m-%d %H:%M') — <one-line summary>"

# 4. Push to remote (if remote is configured)
git push

# 5. Confirm NightWatch is still running
tail -5 nightwatch.log
```

### What to summarise in the commit message

Use one of these patterns:
- `checkpoint: 2026-04-16 14:30 — wallet loaded, yield_maximizer armed`
- `checkpoint: 2026-04-16 21:00 — fixed Fleet toggle bug, 3 trades fired`
- `checkpoint: 2026-04-16 23:45 — all systems nominal, nightwatch running`

### When STATE.md must be updated (not just committed)

Update **Section 5a** and **Section 7** when:
- A major bug is fixed
- A new feature is shipped
- The wallet situation changes (balance, mnemonic, strategies)
- The session is ending (every time, no exceptions)

### Recovery shortcut

If the sandbox resets before you could checkpoint:

```bash
# The repo is on GitHub — clone it back
git clone <YOUR_REMOTE_URL> /workspace/autonomous-trade-bot

# Then follow RECOVERY.md to restore mnemonic + restart servers
cat /workspace/autonomous-trade-bot/RECOVERY.md
```

---

*STATE.md is a living document. It is updated at the end of every session.  
The code lives on GitHub. The memory lives here.  
The Archives hold the full record.*

---

## 12. RESEARCH INTELLIGENCE
*(Filed articles, ideas, and ecosystem intelligence — updated each session)*

### MANTIS (SN123) — Filed May 3, 2026
**Source:** TAO Daily — "How MANTIS Orchestrates a Coordinated Pipeline for Intelligent Trade Execution"
**What it is:** Decentralized forecasting subnet. Acts as an information-theoretic signal refinery for Bittensor. Miners submit prediction embeddings; validators score by marginal information gain (how much does your signal improve the ensemble?). Zero marginal gain = zero reward.

**The 4-layer pipeline:**
```
Upstream Subnets → MANTIS (SN123) → Meta-Models → Execution (Vanta SN8)
(raw signals)      (prices signal    (direction,    (trade selection +
SN13,33,6,22,50)    quality)          regime, vol)   risk gating)
```
**Subnets involved:** SN13 (Macrocosmos), SN33 (ReadyAI), SN6 (Numinous), SN22 (Desearch), SN50 (Synth), SN82 (Hermes), SN8 (Vanta — execution endpoint), SN111 (ONEONEONE).

**Relevance to TaoBot:** HIGH.
- Vanta (SN8) is already doing what TaoBot's execution layer does — risk-gated trade selection from structured signals. Monitor as future integration.
- MANTIS's marginal-gain weighting is a better signal-scoring model than equal-weight averaging. Future TaoBot architecture should adopt this principle.
- If MANTIS outputs become queryable via API, that's a direct signal feed into TaoBot.

**💡 Ideas:**
> TaoBot's internal signal layer should adopt marginal-gain scoring: each strategy's signal is weighted by how much it improves the overall prediction, not equally. Signals that don't improve the ensemble get deprioritized automatically.
> MANTIS → TaoBot API integration: research whether SN123 outputs are accessible. File as future task.

---

### Teutonic (SN3) — Filed May 3, 2026
**Source:** TAO Daily — "Teutonic (SN3) Is Cooking a 24B Looped Transformer. That's a Bigger Deal Than It Sounds."
**What it is:** SN3 rebuilt by Const four days after Covenant AI abandoned Templar. King-of-the-hill mechanism: lowest cross-entropy loss wins 100% of emissions. Hardware-agnostic (only loss matters, not GPU type). Seed king: 0.9B Gemma3, launched April 13, 2026. Loss dropped ~13 → low 5s through open competition.

**24B Looped Transformer:** Reuses the same weight block multiple times per forward pass instead of stacking unique layers. Reasoning depth = an inference-time knob. ByteDance's version (Ouro): 1.4B model performing like 12B on benchmarks. Claude Mythos suspected to use similar architecture (scored ~80% on GraphWalks BFS iterative benchmark vs GPT-5's 21%).

**Connection to Covenant exit:** Teutonic is Bittensor's direct answer. Covenant trained 72B and walked away. Const rebuilt in 4 days and is now pursuing an architecture that may outperform 72B on reasoning. The ecosystem evolved, not just survived.

**Relevance to TaoBot:** MEDIUM-HIGH.
- Validates founder-dependency risk criterion. Const's 4-day rebuild is the strongest counterexample in the ecosystem. BUT: owner key on SN3 still unresolved. Risk flag stays.
- ⚠️ **DO NOT BUY SN3 alpha token until owner key situation resolved** (Const's own warning).
- Teutonic's mechanism (hardware-agnostic, only results matter) is a model for TaoBot strategy evaluation: don't weight strategies by complexity, weight them by output quality.

**💡 Ideas:**
> Looped transformers = inference-time compute scaling. If TaoBot ever integrates AI-based signal generation, prefer architectures that reason deeply at inference over simply larger models. More loops per forward pass > more parameters.
> Teutonic's open competition found loss improvements via data curation and training tricks, not raw compute. Same principle: optimize TaoBot signal quality before adding more data sources.

**Tracking:** Monitor projectnobi.ai/teutonic3 for loss/perplexity progress. Check owner key resolution before touching SN3 alpha.

---

### 🌅 OPS TIMELINE FLAG — Conviction Era Begins on Zero Day
**Filed May 14, 2026 (Session XXXI cross-reference)**

> **Critical context for every future post-mortem:** Bittensor's **Conviction upgrade went live on mainnet 2026-05-13** — the exact same day as TaoBot's Zero Day (16:39:39 UTC). Our entire 7-day paper baseline is therefore the **first dataset of the Conviction Era**. Pre-Conviction trade history (the deleted 8,552 fossils) is no longer architecturally comparable — Conviction auto-locks 100% of subnet owner emissions (1,296 alpha/day/subnet) into a 62-day-half-life conviction score, effectively shrinking float on every subnet. Treat any cross-period comparison with scrutiny. See the three Conviction articles below.

---

### Conviction Upgrade Goes Live: Subnet Owners Weigh In — Filed May 14, 2026
**Source:** TAO Daily — "Conviction Upgrade Goes Live: Ten Subnet Owners Weigh In. They're (Mostly) Locking."
**URL:** https://taodaily.io/bittensor-subnet-owners-on-conviction-we-asked-nine-theyre-mostly-locking/

**What it covers:**
TAO Daily polled subnet owners on launch day (May 13, 2026) about the live Conviction upgrade — a mechanism that lets alpha holders lock tokens to a subnet hotkey to accumulate a "conviction score," with the highest-conviction hotkey crowned "Subnet King" and able to eventually take over ownership. Responses split into bulls / cautiously optimistic / skeptics, but every owner contacted confirmed they will lock alpha. Conviction has effectively made locking the default expected behavior for serious subnet teams; the market is expected to price unlocked positions as a red flag, forcing even skeptics to comply.

**Key facts / quotes:**
- Conviction went live on Bittensor mainnet **May 13, 2026** (same day as TaoBot Zero Day at 16:39:39 UTC).
- **100% of subnet owner emissions (the 18% owner share) are auto-locked into Conviction on the owner hotkey** — forced, not opt-in.
- Auto-flow generates **1,296 alpha/day per subnet** into Conviction from the owner share.
- Conviction score builds with a **62-day half-life**; unlocking initiates a **20.8-day half-life decay** (full exit ~3 months).
- 13 owners quoted: Tom (Bitcast SN93), John (Bitsec SN60), Jake (Investing88 SN88), Mamad (Minos SN107), Vex (SN36/70/99), Zach (Bitstarter SN91), Egill (Zeus SN18), James Ross (Synth SN50), Gareth (Vidaio SN85), Austin (Aurelius SN37), Youssef (Quasar SN24), Leo (Almanac SN41), Jose Caldera (Yanez SN54).
- Tom (Bitcast): *"Rug resistant crypto is bullish!"* — locking large proportion across owner + revenue wallets.
- Gareth (Vidaio) raised the key risk: *"Biggest risk we see is that low value subnets could be taken over. It may be cheaper to do this than buy a new slot."*
- Skeptic Leo (Almanac) still locking: *"On paper it seems fine but core to Bittensor's ethos is exploitation… You plug one hole, another one could appear."*

**Relevance to TaoBot:** HIGH.
- Zero Day coincides with Conviction launch — every alpha price recorded since 16:39 UTC May 13 is post-mechanism-change. Pre-Conviction backtest comparisons may be invalid.
- **The 21-day unlock signal is on-chain visible** (per Const, see article below) — tradeable leading indicator: any subnet showing an unlock extrinsic = bearish for that subnet's alpha 21 days out.
- Auto-locking 1,296 alpha/day/subnet of owner emissions = **permanent supply sink** on every subnet. Modestly bullish for alpha prices over 60+ day horizon.
- Low-value subnets vulnerable to hostile takeover → potential volatility spikes / forced rotation. Bot should de-weight smallcap subnets near takeover-cost thresholds.

**💡 Ideas:**
> Build a **"Conviction Watcher"** service: monitor on-chain unlock extrinsics per subnet via Substrate Interface; emit a bearish signal on the unlocking subnet's alpha when detected. Pairs cleanly with the existing AlertInbox (DVR buffer ready).
> Add a **"Subnet King takeover risk score"** per subnet = (top conviction holder concentration) / (subnet alpha market cap). Auto-demote subnets crossing a configurable threshold from the bot's tradeable universe.
> Track which of the 13 named subnets we trade and weight bullish-stance owners higher in our subnet conviction model.

**Tracking:** Conviction score accumulation curves on mainnet (62-day half-life means meaningful divergence won't appear until early July 2026). Watch for the first hostile takeover attempt — community will price that event hard. Owner unlock extrinsics on any of the 13 subnets named above are immediate market signals.

---

### Const Sets the Record Straight on $TAO's No-Premine, Work-Based Economy — Filed May 14, 2026
**Source:** TAO Daily — "Const Sets the Records Straight on $TAO's No-Premine, Work-Based Economy."
**URL:** https://taodaily.io/const-sets-the-records-straight-on-taos-no-premine-work-based-economy/

**What it covers:**
A messaging/positioning piece in which TAO Daily summarizes Const's clarifications about $TAO's distribution history — pushing back against narratives that $TAO had a premine, preferential VC allocations, or that exchange balances reflect platform ownership. The thesis: all $TAO was mined; early funding came from OTC sales of personally mined founder supply (not reserved tokens); Binance's large balance is user deposits, not exchange-owned tokens. Article paraphrases Const but contains zero direct quoted material from him.

**Key facts:**
- **~600,000 $TAO sold OTC** between 2021–2023 to Firstmark, Digital Currency Group (DCG), and Polychain.
- Reported average OTC price: **$18 per $TAO**.
- Tokens sold OTC came from **personally mined founder supply**, not from reserved or premined allocations.
- **Binance is the #1 TAO holder with +778K tokens** (Source: Taostats) — user deposits, not exchange-owned.
- Distribution principles: "No Premine, No Preferential Allocation," "Work-Based Issuance," "No Free Allocations," "Competitive Dynamics," "Open and Transparent Markets."
- Article contains **no direct quoted Const text** — all paraphrased.

**Relevance to TaoBot:** LOW.
- Pure narrative/messaging article — no tradeable mechanics, no parameter changes, no on-chain effects. Doesn't change a single bot decision tomorrow.
- Useful only as **context for sentiment analysis** — if our Sentiment Surge strategy ever ingests TAO Daily, this is the kind of article that should be tagged as "defensive PR" rather than "alpha signal" so it doesn't generate spurious BUYs.
- Worth retaining as evidence that Const is actively countering FUD around tokenomics — implies he sees a narrative attack vector worth defending against.

**💡 Ideas:**
> Tag this article class ("messaging/narrative defense") in any future sentiment ingestion pipeline so it gets weighted differently from mechanics or roadmap articles. Helps prevent Sentiment Surge from firing BUYs on every Const PR clarification.

**Tracking:** None directly. Note Const is in active narrative-defense posture; pair with the Novelty Search article — he's communicating heavily right now around Conviction launch.

---

### What Const Said About Conviction in Yesterday's Novelty Search — Filed May 14, 2026
**Source:** TAO Daily — "What Const Said About Conviction in Yesterday's Novelty Search."
**URL:** https://taodaily.io/what-const-said-about-conviction-in-yesterdays-novelty-search/

**What it covers:**
Recap of Const's live appearance on Novelty Search (community call) explaining Conviction mechanics to skeptics ahead of mainnet rollout. Key thesis from Const: locked stake earns yield (not a penalty), conviction has a multi-month maturity period (so flash takeovers are impossible), and a 21-day on-chain visible unlock window meaningfully changes the attack surface for would-be rug-pullers. Conviction is framed as the counter-balance to recent owner-favoring upgrades — shifting governance toward long-term token holders while ensuring healthy teams can't be displaced arbitrarily. Mainnet rollout is "muted first."

**Key facts / direct Const quotes:**
- *"Locked stake earns yield."* — locking is not a penalty.
- *"Conviction has a maturity period."* — building enough conviction to take over a subnet takes **multiple months**.
- *"A 21-day unlock period genuinely changes the attack surface."*
- *"Anyone planning to dump 100% of an OTC purchase within 21 days is, by definition, a bad-faith counterparty."*
- *"The teams that have sold 100% of their supply and are still running are essentially the teams that rugged their investors."*
- *"The upgrade goes out soon, muted first."*
- **Unlock extrinsic is on-chain visible 21 days before any sale** — the key tradeable signal.
- **18% subnet team supply unchanged** — Conviction does not modify emissions math, only adds locking layer.
- Locked tokens can be transferred to employees as compensation (founders have a built-in comp tool).
- Const said Conviction would have provided early warning in the **Covenant** incident and would have helped protect investors in **Templar**.
- Lock duration and unlock duration are **tunable mechanism-design parameters**.

**Relevance to TaoBot:** HIGH.
- The **21-day on-chain unlock extrinsic is a deterministic leading indicator** for subnet alpha price action. **Single most actionable item across all six articles filed today.** We can build a service that watches for unlock events and pre-emptively reduces exposure to that subnet's alpha.
- "Muted first" rollout means the Conviction parameters in effect today (Day 2) may be conservative — expect parameter adjustments over coming weeks that could create regime shifts mid-baseline.
- Const explicitly named **Covenant** and **Templar** as past rug events — historical anchors for our risk-scoring model.
- "Locked stake earns yield" → on a 60+ day horizon, alpha float on every subnet effectively shrinks (auto-locked owner emissions + voluntary investor locks). Modest bullish bias for alpha prices during the maturity build phase.

**💡 Ideas:**
> **Build the "Unlock Extrinsic Watcher"** (Substrate Interface poll, every block or every N blocks): emit a bearish AlertInbox event tagged `CONVICTION_UNLOCK` when any tracked subnet's owner hotkey initiates unlock. Auto-trim position size on that subnet's alpha. **Highest-EV idea from these articles.**
> Bundle this with Carry-Over #2 (Real αTAO positions) — same Substrate Interface plumbing feeds both.
> Add a `conviction_score` field per subnet to our `Strategy` model and pull it from chain. Use as a multiplier on existing subnet conviction scoring for dTAO and Balanced Risk strategies.
> Add `historical_rug_match_score` per subnet (1.0 if it matches the "Covenant/Templar pattern" — 100% sold + still running). Use as a hard de-weight in subnet selection.

**Tracking:** Watch for (1) Conviction parameter changes during muted rollout, (2) the first on-chain unlock extrinsic on any subnet — that's our first live test of the signal, (3) any community post-mortem on Subnet King takeover thresholds, (4) the next Novelty Search call.

---

### How to Use Synth LLM, the New AI Interface for Monte Carlo Trading Forecasts — Filed May 14, 2026
**Source:** TAO Daily — "How to Use Synth LLM, the New AI Interface for Monte Carlo Trading Forecasts" (published May 12, 2026)
**URL:** https://taodaily.io/how-to-use-synth-llm-the-new-ai-interface-for-monte-carlo-trading-forecasts/

**What it covers:**
SN50 (Synth) shipped a conversational LLM front-end on top of its Monte Carlo simulation engine. The product collapses what used to be hours of model-building, charting, and statistical scripting into a single prompt — returning forecasting charts, statistical properties (mean/variance/tail probabilities/percentiles/payoff curves), and example trade structures inline. The article is a "how-to-use" piece, not a technical integration guide.

**Key facts / quotes:**
- Subnet: **SN50** — verbatim *"SN50's Synth LLM is the response to that bottleneck."*
- Access tier: **"Synth LLM is live for Synth Pro and Pro Unlimited users."** No public/free tier mentioned.
- Deployed across **Polymarket, Limitless, Hyperliquid, Deribit, and more.**
- Returns three things inline per query: a Monte-Carlo-driven forecasting chart, requested statistical properties, and example trade structures.
- Example prompts: *"What's the probability of $BTC closing above $120K by Friday?"* / *"Show me the implied distribution on this Polymarket question."* / *"What would a delta-neutral straddle around the current $ETH price look like?"*
- Thesis: *"the next generation of trading edge will not come from who has the model. It will come from who can access the model fastest in the moment that matters."*
- **NOT in the article:** API endpoints, REST/WebSocket spec, auth/keys, SDK, pricing dollar amounts, code samples, exact launch date.

**Relevance to TaoBot:** HIGH (with caveat — no public API surface confirmed yet).
- Synth is the closest thing in the Bittensor ecosystem to a turnkey signal source for an autonomous TAO trading bot. If a programmatic interface exists behind the Pro Unlimited tier, this becomes a candidate input for entry/exit filters and position sizing.
- Monte Carlo distributional outputs (P(close > X), tail-prob percentiles) could be wired in as a *consensus contributor* alongside our 14 existing strategies — e.g., gate Sentiment Surge BUYs against Synth's tail probability of TAO closing higher in N hours.

**💡 Ideas:**
> Add a `synth_llm` consensus contributor that, on each tick, prompts Synth for *"P(TAO closes above current price + 1 ATR over next 4h)"* and contributes a BUY/SELL/HOLD vote with confidence = abs(P − 0.5) × 2. Sit it alongside our 14 existing strategies in OpenClaw rounds.
> Build a research dashboard widget that polls Synth once per session for a TAO percentile cone (10/25/50/75/90) and overlays it on the equity chart.
> If only conversational/web UI is available initially, build a lightweight headless-browser scraper module gated behind a feature flag, so we can prototype the signal value before paying for Pro Unlimited.

**Tracking:**
- Reach out to Synth team / SN50 owner via Discord OTF gateway (already on carry-over list) to ask: (a) is there a programmatic API behind Pro / Pro Unlimited? (b) per-call rate limits and dollar cost? (c) is TAO/τ a supported asset (vs. just BTC/ETH/Polymarket markets)? (d) latency p50/p99 for a forecast request?
- Watch SN50's GitHub / docs site for API docs drop.

---

### Why Alpha Tokens Need CEX Listings — Filed May 14, 2026
**Source:** TAO Daily — "Why Alpha Tokens Need CEX Listings" (published Sep 30, 2025 — older piece, surfaced now)
**URL:** https://taodaily.io/why-alpha-tokens-need-cex-listings/

**What it covers:**
Opinion piece (author: Ige A) arguing that alpha tokens (subnet-native dTAO assets) need to follow TAO's path onto reputable CEXes to unlock liquidity, visibility, and adoption. Lays out two parallel paths — **Path A** (native Substrate listings on Binance/Coinbase, the "gold standard") and **Path B** (audited ERC-20 wrappers redeemable 1:1 via bridge with proof-of-reserves, targeted at Bybit/OKX for speed) — and recommends subnet teams pursue both simultaneously.

**Key facts / quotes:**
- TAO listings: *"Binance and Coinbase have already onboarded native TAO."*
- **No specific alpha tokens are named as CEX-listed** — recommendation is forward-looking.
- Path A (native Substrate): *"1:1 on-chain finality, no bridge risk."* / *"Higher engineering and custody overhead for exchanges."*
- Path B (wrapped ERC-20): *"Faster listings, ERC-20 custody compatibility (Fireblocks/BitGo/Coinbase Custody), easy user withdrawals."* / *"Bridge/custodian trust risks; operational complexity."*
- dTAO sales pitch (verbatim): *"Each subnet has an AMM pool between TAO (τ) and its alpha token, governed by per-block emissions and a halving schedule. There are no opaque unlocks or hidden token allocations."*
- Demand-side: *"Public records claim Chutes is powering 'trillions of tokens per month'"* — only quantitative number.

**Relevance to TaoBot:** MEDIUM.
- Currently we only trade TAO/USD. Bot architecture is asset-agnostic, so the moment any alpha token gets a real CEX listing with real depth, we can extend the universe — but shouldn't pre-build for tokens that don't exist on exchanges yet.
- A near-term "watch for listing announcements" feed could be a high-quality momentum catalyst. Listing announcements historically produce 10–40% short-window moves.

**💡 Ideas:**
> Add a "CEX Listing Watch" indicator: scrape Binance/Coinbase/Bybit/OKX listing announcement RSS + Twitter accounts on a 5-min cadence; on any match for `subnet|alpha|bittensor|TAO`, fire a HIGH-priority alert into the Alerts inbox.
> Reserve a `multi_asset` flag in BotConfig that is currently False but, when flipped, lets the strategies operate on a watchlist of alpha tokens (initially empty). Lays the rails without committing to the work until a listing actually happens.
> Track CEX listing news as a sentiment input even when we can't trade the listed token — a Chutes/Templar listing announcement is a directional signal for TAO itself (parent asset).

**Tracking:**
- Monitor for first alpha-token CEX listing announcement (Chutes/SN64 or Templar/SN3 most likely candidates given their 6/6 scorecards). Revisit when the first happens.
- Watch TaoStats / Bittensor governance for any BIP/SIP enabling Path B wrapped ERC-20 issuance.
- Article is **8 months old** at filing — worth pinging TAO Daily for a follow-up "where are we now" piece.

---

### Putting Bittensor's Top 10 Subnets Through Const's 6-Filter Test — Filed May 14, 2026
**Source:** TAO Daily — "Putting Bittensor's Top 10 Subnets Through Const's 6-Filter Test" (published April 3, 2026)
**URL:** https://taodaily.io/putting-bittensors-top-10-subnets-through-consts-6-filter-test/

**What it covers:**
Editorial applying Jacob Steeves' (Const, BT co-founder) six binary filters to the current top-10 subnets by market cap. Every filter is a yes/no, and the headline finding is a "clean sweep" — all ten top subnets pass all six filters. The piece argues the market is already doing what Const's framework predicts, and these six questions are *"the fastest way to separate real from grift."*

**THE SIX FILTERS (verbatim wording):**
1. **Does it produce a digital commodity?** — *"Not a token. Not a governance vote. A commodity, something a buyer would pay for independent of the Bittensor ecosystem."* (inference calls, model weights, storage, annotated data, agents)
2. **Are the miners actually productive?** — *"proof-of-useful-work…running GPU workloads, training models, storing files, creating SOTA agents. Or they're just gaming a reward function."*
3. **Is it intelligent?** — *"genuine AI reasoning, adaptation, or learning. The strongest subnets must embed intelligence at their core."*
4. **Is it hard?** — *"Easy tasks get commoditized, memorized, and gamed…that difficulty is a moat."*
5. **Is it not a ponzi?** — *"Are rewards tied to verifiable performance, or do they flow to whoever stakes the most, markets the loudest, or arrives earliest?…value creation precede value capture."*
6. **Is it AI-native?** — *"Could this subnet exist and thrive without AI at its foundation? If you could swap out the intelligence layer for a simple script…the subnet isn't AI-native."*

**THE TEN SUBNETS & SCORECARD (all 6/6):**

| # | Subnet | SN | Category |
|---|---|---|---|
| 1 | Chutes | SN64 | Serverless AI Compute |
| 2 | Templar | SN3 | Decentralized LLM Pre-Training |
| 3 | Targon | SN4 | Confidential GPU Compute |
| 4 | Affine | SN120 | Reinforcement Learning & Coordination |
| 5 | Lium | SN51 | Decentralized GPU Marketplace |
| 6 | Vanta | SN8 | AI Trading Signals |
| 7 | Ridges | SN62 | Autonomous Coding Agents |
| 8 | Score | SN44 | Computer Vision |
| 9 | Hippius | SN75 | Decentralized Cloud Storage |
| 10 | IOTA | SN9 | Cooperative LLM Pre-Training |

- **No subnet failed any filter.** Author commentary: *"the more interesting story is in the pattern of what succeeded…the subnet leaderboard is dominated by infrastructure and tooling (compute, training, storage, inference) with a growing application layer (trading, coding, computer vision) building on top."*
- **SN8 Vanta callout** is the most directly TaoBot-adjacent: *"AI Trading Signals…tradable alpha signals…profit-driven buybacks, not emission farming."* This is a peer/competitor signal source.
- **SN3 Templar callout** reinforces the SN3 owner-key monitor on our carry-over list.

**Relevance to TaoBot:** HIGH.
- Three subnets in this list are directly relevant signal candidates: **SN8 Vanta** (AI trading signals — they may have an API), **SN50 Synth** (above), **SN3 Templar** (already on owner-key monitor list).
- The 6/6 scorecard is a quality filter we can use to weight any future external-signal integration.

**💡 Ideas:**
> Add a `subnet_quality_filter` config knob in BotConfig that defaults to 6 — any external signal source must come from a subnet that passes all six Const filters before we'll wire it into consensus.
> Specifically investigate **SN8 Vanta's** signal API as an alternative/complement to SN50 Synth — Vanta's product is literally "tradable alpha signals" with profit-driven buybacks, exactly what we need.
> Build an internal `subnet_scorecard.json` seeded with these 10 subnets and their 6/6 verdicts. Display in research/admin page. When new subnets enter top-10, re-score them and append.

**Tracking:**
- **SN8 Vanta** — research API access, pricing, latency. Highest-leverage external signal integration target after Synth.
- **SN3 Templar owner-key monitor** — already on carry-over list; this article reinforces SN3 as a high-quality watch target.
- Watch for any update to Const's filter framework. Six filters as of April 2026.
- Re-run the 6-filter scorecard on the **current** top-10 quarterly — composition shift is itself a signal.

---

### CROSS-ARTICLE SYNTHESIS (May 14, 2026)

**The 21-day Conviction unlock extrinsic is the highest-EV idea across all 6 articles filed today.** It is:
- Deterministic (on-chain, not inferred)
- Leading (21 days before sale impact)
- Cheap to monitor (one Substrate query per subnet per block)
- Bundles with Carry-Over #2 (Real αTAO positions) — same Substrate Interface plumbing.

**External signal integration backlog (priority order):**
1. **SN50 Synth LLM** — turnkey Monte Carlo, paid tier confirmed; need API access details.
2. **SN8 Vanta** — direct peer/competitor in trading signals. **Research filed Session XXXII (2026-05-14):** Realtime trade-data subscription gated at `request.taoshi.io/login` (paywalled, no public pricing on docs.taoshi.io). Repository at `github.com/taoshidev/vanta-network`. Signal types: LONG/SHORT/FLAT for Crypto/Forex/Equities. Per-position leverage caps [0.01, 0.5] crypto, [0.1, 5] Forex/Equities. Total leverage cap 10 (crypto scales 10x). Spread fee scales with leverage. Carry fee 10.95%/5.25%/3% per year for crypto/equities/forex at 1x leverage. Mainnet registration fee 2.5τ. Scaffold added to `signal_ingestor._FEEDS["vanta_sn8"]` with `subnet_netuid=8` so quality gate auto-applies; status `pending_subscription`. Next step: ask subscription URL + endpoint via Discord OTF gateway when it opens.
3. **SN123 MANTIS** — already filed; remains research-only until public API surfaces.

**Subnet quality framework:**
- Const's 6-filter test = our weighting prior for any external signal source. Default `min_filters_passed = 6`.
- Maintain `subnet_scorecard.json` seeded with the 10 confirmed 6/6 subnets above.

**Conviction Era data caveat:**
- All TaoBot data from 2026-05-13 16:39 UTC onward = post-Conviction. Pre-Conviction fossils are not architecturally comparable.
- Auto-locked 1,296 alpha/day/subnet from owner share = permanent supply sink; modest long-horizon bullish bias for alpha prices during the 62-day-half-life maturity build.

**— TAO Trading Bot, April 16, 2025**