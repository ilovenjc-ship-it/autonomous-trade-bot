# Whale Flow — Phase 1

**Sprint:** Session XXXVII
**Status:** in-progress → done on first push
**Owner:** II Agent
**Cost replaced:** TaoStats Standard tier ($50/mo, $600/yr)

## Overview

Per-subnet feed of large stake / unstake events, surfaced on the
SubnetDetail page as a right-rail panel. Mirrors the "Whale Activity"
panel that Talisman shows in their Earn → Subnet view (Mav screenshot,
2026-05-17), and adds intelligence Talisman does not: ping-pong
detection, repeat-offender flagging, and Conviction-Era owner overlay.

## Goals

1. Replace the TaoStats Standard tier value proposition ($50/mo) with a
   free integration on the **TaoStats `/api/delegation/v1` endpoint**.
2. Surface whale flow as actionable signal in the operator UI:
   - Per-subnet, last 1D / 1W / 1M
   - Net flow indicator (gross_in vs gross_out)
   - Top-N events with truncated SS58, direction, τ + USD, validator,
     time-ago
3. Make the data accessible to the chat agent (`II Agent` page) so
   "any whales loading SN1 today?" routes to a real answer.

## Non-Goals (Phase 1)

- Real-time RPC subscription. We poll every 5 min; sub-minute alerts
  are Phase 2.
- Twitter / Discord whale-watch feeds. Out of scope.
- Validator-side rollup (which validators are receiving whale flow).
  Reserved for Phase 2 once Phase 1 ships clean.

## Data Source

**Endpoint:** `GET https://api.taostats.io/api/delegation/v1`
**Auth:** `Authorization: <TAOSTATS_API_KEY>` (already in env, free tier)
**Cadence:** poll every 300s
**Filters used per call:**
- `action=all`
- `amount_min=100000000000` (= 100 τ in rao; default whale threshold)
- `order=timestamp_desc`
- `limit=200`
- (no netuid filter — single global poll, fan-out to per-subnet views)

Each event payload provides everything we need:
- `id` (dedup key)
- `block_number`, `timestamp`
- `action` ∈ {`DELEGATE`, `UNDELEGATE`}
- `nominator.ss58` (the staker / "whale")
- `delegate.ss58` (validator hotkey)
- `amount` (rao, TAO terms)
- `alpha` (rao, alpha terms)
- `usd` (pre-computed USD value at block time)
- `netuid`, `extrinsic_id`

## Architecture

```
TaoStats /api/delegation/v1
        │
        ▼
WhaleFlowService           (singleton, mirrors CexListingService)
   ├── ring buffer (cap 5000 events, ~ 1 month at observed cadence)
   ├── disk cache (whale_flow_cache.json, survives restarts)
   ├── system_health heartbeat
   └── threshold-crossing alerts → alert_service.push_alert
        │
        ▼
    Routers
   ├── GET /api/whale-flow                          (all events, paginated)
   ├── GET /api/whale-flow/{netuid}                 (per-subnet feed)
   └── GET /api/whale-flow/{netuid}/summary?window  (1d|1w|1m roll-up)
        │
        ▼
   Frontend
   ├── components/WhaleActivityPanel.tsx            (right-rail)
   └── pages/SubnetDetail.tsx                       (consumer)
```

## API Contracts

### `GET /api/whale-flow`

Query params:
- `netuid` *(int, optional)* — filter by subnet
- `window` *(`1d` | `1w` | `1m`, default `1w`)* — rolling window
- `limit` *(int, 1–200, default 50)* — events returned
- `min_tao` *(float, optional)* — override default 100 τ floor

Response:
```json
{
  "events": [
    {
      "id": "finney-1-...-6925136-101",
      "block_number": 6925136,
      "timestamp": "2025-11-20T16:44:36Z",
      "ts_unix": 1763657076,
      "action": "DELEGATE",
      "nominator_ss58": "5EHJyeLM…HdLUbP",
      "nominator_full": "5EHJyeLMcUPjRU6D2a4sqzrQgSj7dLFxYKX7UQ82Z7HdLUbP",
      "delegate_ss58":  "5E2LP6En…32TKeZ5u",
      "amount_tao": 2.585,
      "amount_usd": 797.87,
      "netuid": 87,
      "extrinsic_id": "6925136-0022"
    }
  ],
  "total": 6,
  "window": "1w",
  "fetched_at": "2026-05-17T19:30:00Z"
}
```

### `GET /api/whale-flow/{netuid}/summary?window=1w`

```json
{
  "netuid": 1,
  "window": "1w",
  "gross_in_tao":   2191.0,
  "gross_out_tao":  2191.0,
  "net_flow_tao":      0.0,
  "gross_in_usd":  516758.98,
  "gross_out_usd": 516758.98,
  "unique_addresses": 4,
  "event_count": 6,
  "top_inflows":  [...],
  "top_outflows": [...]
}
```

## UI / UX

`WhaleActivityPanel` matches the Talisman screenshot's spatial pattern:

- **Header:** "Whale Activity" + 1D / 1W / 1M segmented toggle
- **Net flow bar:** gross_out (red) / gross_in (green) split, with τ
  totals on each end. If perfectly balanced (Talisman's screenshot
  shows 2,191 ↔ 2,191 — likely same actor splitting wallets), render a
  subtle "balanced flow" badge to flag the pattern.
- **Event rows:** `avatar | head6…tail6 | timeago` on left, `±τ amount`
  + `$usd` on right. Direction uses red `−` for UNDELEGATE, green `+`
  for DELEGATE.
- **Empty state:** "No whales active in the last {window}" with a
  threshold hint.

## Edge Cases

- **TAOSTATS_API_KEY missing** → service marks itself `configured=false`,
  panel renders a setup CTA (do not surface as red error).
- **TaoStats 429 rate-limit** → log, hold last-good cache, `stale=true`
  on next snapshot. Free-tier budget at 5-min cadence: ~288 calls/day,
  well within published limits.
- **netuid not in any event** → `events: []`, `event_count: 0`.
- **Same address in/out within seconds (ping-pong)** → both events
  surfaced; client tags pairs as `is_pingpong=true` when amounts match
  within 1% within a 60s window. Phase 1 surfaces the flag; doesn't
  hide events.

## Acceptance Criteria

- [ ] `GET /api/whale-flow?netuid=1&window=1w` returns ≥ 1 event when
  the past week saw a stake ≥ 100 τ on subnet 1.
- [ ] WhaleActivityPanel renders on SubnetDetail without scroll-jank
  on 1366×768.
- [ ] `system_health` registry shows `whale_flow` green within 5 min of
  boot.
- [ ] Free-tier API budget verified: 24h log shows ≤ 320 outbound
  TaoStats calls.
- [ ] No console errors / red squiggles in built bundle.

## Implementation Notes

- Singleton + async lock pattern, mirroring `CexListingService`.
- Disk cache path resolution mirrors `whale_service` (DATA_DIR override
  for Railway volume).
- Address truncation: `head6…tail6` (Talisman convention), full SS58
  retained in payload for chat agent / future drill-down.

## Status / Open Questions

- **Threshold default:** 100 τ. Per-subnet adaptive thresholds (top 5%
  of stake events on that subnet) tabled for Phase 2.
- **Scope:** all subnets in v1. Free-tier budget covers it.
- **Alert routing:** Phase 1 fires `WHALE_FLOW_INFLOW` /
  `WHALE_FLOW_OUTFLOW` at level INFO when a single event > 500 τ
  ($135K+) hits. CRITICAL escalation reserved for Phase 2.