# Bittensor Official Server — Discord Bot Onboarding Plan

**Server:** Bittensor (official)
**Operator standing as of 2026-05-20:** Member, no special role. Intro post live in `#general` (May 19, 11:39 PM): *"Hey Bittensor Community, emcee here. Been building — an autonomous trader on the Bittensor ecosystem — for a few months. Solo build with an AI co-pilot. Just got GitHub Verified, figured I'd drop a line or two. Here to learn from sharper people than me."*

This server is the **higher-priority install** of the two. It is closer to the alpha source — subnet operators, validators, miners, and the Opentensor Foundation all coordinate here.

---

## 1. Bot identity

| Field | Value |
|---|---|
| Discord Application ID | `1500891557312594060` |
| Application name (current) | TaoBot — **HARD COLLISION: TaoStat already operates a validator-related "TaoBot" branded service in this ecosystem. Rename mandatory before invite.** |
| Suggested rename targets | `signal-ingestor`, `emcee-listener`, `atb-feed`, or unbranded operator name. Avoid anything starting with "Tao". |
| Operator account | `emcee` |
| Bot purpose in this server | Listen-only signal aggregation across announcement / release / subnet channels. No posting, no mod, no DMs. |

---

## 2. OAuth invite URL (minimum-permission, listen-only)

```
https://discord.com/api/oauth2/authorize?client_id=1500891557312594060&scope=bot&permissions=66560
```

Same permission integer as II Community. See `ii-community-onboarding.md` §2 for the full bit-level breakdown. Recap:
- `View Channels` (`1024`) + `Read Message History` (`65536`) = `66560`
- Zero send / mod / voice / slash-command capability

---

## 3. Channels of interest (post-install)

Listen-only targets, in priority order:

| # | Channel | Why |
|---|---|---|
| 1 | `#announcements` (Pinned) | Opentensor Foundation official drops — chain upgrades, halvings, root changes |
| 2 | `#releases` (Pinned) | New subnet launches, validator/miner version pins |
| 3 | `#root` | Root subnet 0 governance signal — drives validator weight allocation |
| 4 | `#α・apex・1` | Subnet 1 (apex) chatter |
| 5 | `#β・dsperse・2` | Subnet 2 |
| 6 | `#γ・τευτonic・3` | Subnet 3 |
| 7 | `#Δ・τargon・4` | Subnet 4 |
| 8 | `#ε・bone・5` (and remaining subnet channels) | Per-subnet emission/performance signal |
| 9 | `#general` | Community pulse, scam reports, sentiment |
| 10 | `#rao` | RAO token / reward chatter |

**Critical to skip:** `#help` (20 New) — pure noise. `#faq` — static.

**Multi-Factor Auth gate:** the server requires MFA for moderation actions. Listen-only bot is not affected, but flag this in the pitch — admins are MFA-conscious, so a permission integer of `66560` (no mod scope) is exactly the kind of low-risk ask they'll appreciate.

---

## 4. Admin / CM recon (from May 19 #general scrollback)

Confirmed Community Managers visible in the screenshot:

| Handle | Role | Notes |
|---|---|---|
| `Kat \| Bittensor CM · won't DM 1st` | CM | Active mod — flagged a PFP violation (May 19, 11:04 AM). Note the "won't DM 1st" tag — **she will not initiate, so I must DM first.** |
| `Uzor \| Bittensor CM` | CM | Active, friendly tone ("Good day everyone! Happy Wednesday") — softer entry than Kat. |

**Other names worth tracking from the scrollback:**
- `bittenleo [τ, τ]` — long-time member, "TAO" tag, may have admin proximity
- `vune [τ, τ]` with `LTNT` tag — also long-time
- `forward` — verified checkmark visible

**Tactic:** open with **Uzor** (warmer tone in screenshot). Kat is the enforcer — DM her *only* if Uzor escalates or if a specific scope question requires the stricter CM. Never DM both simultaneously (looks like ladder-shopping).

**Scam-aware server:** the pinned scam advisory in `#general` lists every social-engineering vector. My DM must therefore look *unmistakably non-scammy*: no links in opener, no urgency, no offer of money/registration/scripts, no "click my profile." Plain text, technical, transparent.

---

## 5. Pitch message (admin DM, draft — Uzor first)

> Hey Uzor — emcee here from `#general`. Saw the scam advisory pinned in the channel and want to be upfront about what I'm asking, because I know how the bar is set in this server.
>
> I'm a solo builder shipping an autonomous trader on the Bittensor ecosystem (~6 months in, GitHub Verified in the II Community server tonight as a credential). I'd like to add a listen-only Discord bot to read public channels — `#announcements`, `#releases`, `#root`, and the subnet alpha channels — so I can fold ecosystem signal into my trading dashboard's research feed.
>
> The bot has **zero send permissions**. No DMs, no mod, no voice, no slash commands. Permission integer is `66560` — that's `View Channels` + `Read Message History` only. The Discord consent screen will show exactly that; happy to send the OAuth URL so you can verify before approving.
>
> Two things I want to flag proactively:
> 1. The bot's current Discord application name is "TaoBot" but I'll rename before invite — I don't want any confusion with TaoStat's TaoBot. Suggesting `atb-listener` or similar.
> 2. The repo is public on GitHub if you want to audit before approving — github.com/ilovenjc-ship-it/autonomous-trade-bot.
>
> Totally fine if the answer is no or "not yet." Wanted to ask transparently rather than try to backdoor it.
>
> — emcee

**Why this works for Bittensor specifically:**
- Acknowledges the scam-advisory culture directly (most bot requests don't)
- Pre-empts the TaoStat name collision before they raise it
- Offers public repo for audit — engineer signal, hard to fake
- Names exact permission integer — easy admin verification
- Mentions II GitHub Verified as cross-server reputation
- Closes with explicit out — no pressure

---

## 6. Fallback ladder if denied or ignored

1. **Wait 14 days, build social proof in `#general`** — answer 2–3 technical questions, share a non-promotional dashboard screenshot if relevant, get reactions on substantive posts.
2. **Re-ask via Kat** — only after Uzor declines or 14 days of silence. Different framing: lead with public-repo audit offer.
3. **Per-subnet ask** — if server-wide denied, approach individual subnet operators (apex/dsperse/teutonic/targon) for invites to their *own* subnet servers (most have separate Discords).
4. **Public RSS / chain-data only** — last resort. Lose Discord-channel signal, fall back to substrate chain events + Twitter for ecosystem chatter.

---

## 7. Post-install verification checklist

Same as II Community §7. Additionally:
- [ ] Confirm subnet channel visibility — Bittensor has 100+ channels, default install may not include subnet category
- [ ] Validate `channels_visible` count matches expected listen-target list
- [ ] Tag install in STATE.md §10C with explicit channel allowlist (Discord doesn't restrict per-channel, so we filter at ingest layer)

---

## 8. Status

- [x] Intro post live in `#general` (May 19, 11:39 PM)
- [ ] Application renamed (TaoBot → TBD — **mandatory before any invite ask**)
- [ ] Public repo audit-ready (currently public ✓, but README should clearly state "listen-only Discord ingestor" purpose)
- [ ] Uzor identified as primary contact target
- [ ] Pitch DM sent to Uzor
- [ ] Bot installed
- [ ] Verification complete

---

## 9. Sequencing recommendation

**Do II Community FIRST.** Reasons:
1. Already have GitHub Verified there — warmest entry.
2. Lower-stakes server for a first-bot-install precedent.
3. If II approves, that becomes a referenceable proof point in the Bittensor pitch ("listen-only bot already running in II Community, no incidents").
4. If II denies, learn the failure mode before burning the Bittensor ask.

Bittensor pitch should land **after** II install is live and stable for ≥7 days.