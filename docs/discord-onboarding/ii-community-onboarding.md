# II Community — Discord Bot Onboarding Plan

**Server:** Intelligent Internet Community
**Tagline:** *"We are building intelligence for everyone"*
**Operator standing as of 2026-05-20:** GitHub Verified role earned via Linked Roles flow. Intro post live in `#introduce-yourself` (May 20, 12:10 AM): *"Hey II Community, emcee here. I'm building an autonomous trader using II Agent as my co-pilot. Just got GitHub Verified, figured I'd drop a line or two just to introduce myself. Here to learn."*

---

## 1. Bot identity

| Field | Value |
|---|---|
| Discord Application ID | `1500891557312594060` |
| Application name (current) | TaoBot — **flag: collides with TaoStat validator's TaoBot in Bittensor server. Rename before invite.** |
| Operator account | `emcee` |
| Bot purpose in this server | Listen-only signal aggregation. No posting, no mod actions, no DMs. Read public channels for ecosystem-trend research feeding the autonomous-trade-bot dashboard. |

---

## 2. OAuth invite URL (minimum-permission, listen-only)

```
https://discord.com/api/oauth2/authorize?client_id=1500891557312594060&scope=bot&permissions=66560
```

**Permission breakdown** (`66560` decimal):

| Permission | Bit | Why |
|---|---|---|
| View Channels | `1 << 10` = `1024` | See channel list / receive `GUILD_CREATE` payload |
| Read Message History | `1 << 16` = `65536` | Required for backfill on join; without it, gateway only delivers messages posted *after* connect |
| **Total** | | **`66560`** |

**Explicitly NOT requested:**
- ❌ Send Messages, Embed Links, Attach Files, Mention Everyone
- ❌ Manage Channels / Roles / Server / Webhooks
- ❌ Kick / Ban / Moderate Members
- ❌ Connect / Speak (voice)
- ❌ `applications.commands` scope (no slash commands)

**Why this matters for the pitch:** an admin can paste this URL into Discord and visually confirm in the consent screen that the bot literally cannot speak, mute, kick, or modify anything. It's a passive listener. That's the lowest-risk install they will see this month.

---

## 3. Channels of interest (post-install)

Listen-only targets, in priority order:

1. `#ii-announcements` — official II releases, model drops, infra changes
2. `#show-your-builds` — community signal on what builders are shipping with II Agent
3. `#ii-chat` — general technical discussion
4. `#the-last-economy-chat` — macro / economy thesis chatter relevant to trading context
5. `#ii-forum` — long-form posts
6. `#ii-social-posts` — outbound signal amplification (read-only metric)

**Avoid:** `#support`, `#memes`, `#off-topic`, `#gm` — noise floor too high, no alpha.

---

## 4. Admin recon

Need to identify before DMing:
- [ ] Server owner (crown icon — check member list filter)
- [ ] Verified moderators (look for hoisted role colors in `#start-here` or pinned messages)
- [ ] Whoever runs the Linked Roles configuration (they already vetted my GitHub — warmest entry point)
- [ ] Active II team members in `#ii-chat` over the last 7 days

**Tactic:** prefer DMing whoever configured GitHub Verified Linked Roles. They've already implicitly trusted my GitHub identity. That's the shortest path from "stranger" to "approved bot operator."

---

## 5. Pitch message (admin DM, draft)

**Subject line / opener** — keep short, no wall of text:

> Hey [name] — emcee here, just earned GitHub Verified in your server tonight. I'm a solo builder shipping an autonomous trader using II Agent as my co-pilot (about 6 months in). Quick ask: I'd like to add a listen-only Discord bot to a couple of public channels (`#ii-announcements`, `#show-your-builds`) so I can fold community-signal context into my trading dashboard's research feed. The bot has zero send/mod/voice perms — just `View Channels` + `Read Message History` (`permissions=66560`). Happy to share the OAuth URL so you can verify the consent screen yourself before approving. Totally fine if it's a no — figured I'd ask transparently rather than scrape from a personal account.
>
> — emcee | github.com/ilovenjc-ship-it

**Why this works:**
- Leads with shared credential (GitHub Verified earned in *their* server)
- Names II Agent (their product) as co-pilot — signals power-user
- States exact permission integer — engineer-to-engineer transparency
- Pre-empts the "scrape from personal account" objection
- Offers easy out — "totally fine if it's a no"

---

## 6. Fallback ladder if denied or ignored

1. **Wait 7 days, post in `#ii-chat` casually** — share a build update referencing II Agent. Build social proof, ask again later.
2. **Webhook-only mode** — if denied bot install, request a one-way webhook into `#show-your-builds` for outbound dashboard milestones. Lower ask, easier yes.
3. **RSS / public scrape from logged-in personal account** — last resort, lower fidelity, no gateway events.
4. **Skip II for now** — Bittensor server is the higher-priority install (closer to alpha source). Revisit II in 30 days.

---

## 7. Post-install verification checklist

Once admin grants invite:
- [ ] Bot appears in member list with online status
- [ ] Hit `GET /api/signal-feeds/discord/guilds` — confirm guild ID + `channels_visible` count > 0
- [ ] Tail backend logs for `GUILD_CREATE` event with II server name
- [ ] Smoke test: have someone post in `#ii-chat`, confirm `events_total` increments
- [ ] Update STATE.md §10C with install timestamp + guild ID
- [ ] Surface "Listening on: Intelligent Internet Community" in dashboard Activity Log

---

## 8. Status

- [x] GitHub Verified earned (May 20, 2026)
- [x] Intro post live in `#introduce-yourself`
- [ ] Admin recon
- [ ] Application renamed (TaoBot → TBD to avoid collision)
- [ ] Pitch DM sent
- [ ] Bot installed
- [ ] Verification complete