# Discord Posts Log

Canonical record of every post Mark sends from the operator account (`emcee`) into target Discord servers, plus skip-day decisions when a scan ends in observation rather than action.

**Doctrine** (Daily Social Signals, established Session XXXIX–XL):

1. Ari scans target servers.
2. Ari drafts 0–2 candidate posts per scan, calibrated to Mark's voice (lowercase, em-dash, builder-direct register, not intro-humble).
3. Mark customizes and sends — voice ownership stays with Mark, full stop.
4. Ari logs here: channel, sent timestamp, recipient, summary, version sent, link if available.
5. Ari tracks replies and updates the entry.

A skip-day is a first-class log entry. "Read the room and stayed quiet" is a result, not a missing data point.

---

## Schema

```
### YYYY-MM-DD — <Server> — <Channel or "(scan only)">

- **Action:** POST | SKIP | DRAFTED-NOT-SENT
- **Recipient / thread:** <user or context>
- **Drafted by:** Ari
- **Sent by:** Mark | n/a
- **Sent at:** <UTC timestamp> | n/a
- **Summary:** <one line>
- **Version sent:** <full text or version label>
- **Link:** <URL or n/a>
- **Reply tracking:** <updates>
- **Notes:** <rationale, especially for skips>
```

---

## 2026-05-20 (Day 7 — Paper Training, Decision Day on the Frontier)

### 2026-05-20 — Bittensor — (scan only)

- **Action:** SKIP
- **Drafted by:** Ari
- **Sent by:** n/a
- **Sent at:** n/a
- **Summary:** Channel in a charged moment; observe rather than post.
- **Version sent:** n/a
- **Link:** n/a
- **Reply tracking:** n/a
- **Notes:** Three substantive but politically loaded threads active in window — `arkhet.hl` rant on taoflow / emissions quality, `AMFADAVE` miner-economics critique, `Roy Kollen Svendsen` `@everyone` btcli exploit ping. Operator intro is 14 hours old, zero rapport bank. First post here can't be a hot take in someone else's fight. Right move is observation.
  - Privately filed: Const's six-filter test from Memory Bank §12 aligns with arkhet's "gm/gn subnets shouldn't get emissions" thesis. That's a future angle for us, not a today angle.

### 2026-05-20 — II Community — `#show-your-builds`

- **Action:** DRAFTED-NOT-SENT *(awaiting Mark's send confirmation; will update to POST once landed)*
- **Recipient / thread:** Reply to `Hm8ker` post from May 9, 2026 — multi-agent Streamlit system, hit JSON markdown-fence problem, Reviewer infinite revision loops, context loss between handoffs. Author is GitHub Verified, explicitly invited replies.
- **Drafted by:** Ari (two versions: A 50w, B 40w)
- **Sent by:** Mark *(pending)*
- **Sent at:** *(pending)*
- **Summary:** Builder-to-builder reply on shared JSON-fences pain + question on the auto-approve threshold choice.
- **Version sent:** Modified Version A (Mark's edit — tighter opener, swap "JSON markdown-fences" specifics for cleaner phrasing, added second hook on lower-bound failures):

  > The trojan horse pattern is the move. I hit the same json-fences problem on a trading agent and ended up extracting json from plain text as a fallback rather than retrying the whole call. Quick question — how'd you land on 7 as the auto-approve threshold instead of monotonic-improvement-over-last-revision? Curious if the lower bound has bitten you yet?

- **Link:** *(pending — paste Discord message permalink after send)*
- **Reply tracking:** *(pending — track reply, no reply, or thread)*
- **Notes:**
  - 11 days old, but he explicitly asked for replies → not a graveyard post.
  - GitHub Verified → GitHub Verified handshake; legitimate peer surface.
  - Question is the real payload. The shared-pain opener is just earned-trust framing so the question doesn't read as drive-by skepticism.
  - Voice calibration check on the modified version: ✓ lowercase, ✓ em-dash, ✓ no hedging, ✓ ends on a real question (not a courtesy question), ✓ "the move" / "bitten you yet" is register-set Mark-builder, not Ari-formal.
  - **Reply protocol if Hm8ker responds:** answer the substance, don't pivot to selling our build. If he asks what we're building, one-line answer + offer to share a link if useful. Stay in the conversation he started.

---