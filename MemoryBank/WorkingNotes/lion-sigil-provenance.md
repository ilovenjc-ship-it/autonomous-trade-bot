# Ari Lion Sigil — Provenance & Authorship Record

**Created:** 2026-05-29 (Friday, Day 16)
**Author of record:** Mark (creative direction) + Ari (drafting / iteration)
**Purpose:** Permanent provenance trail for the Ari lion mark.
Maintained for future trademark filing — when the legal moment comes,
this file is the dated, source-controlled chain of evidence showing
the mark was original, iterated, and authored.

> *"We need to trademark when time is right."* — Mark, Day 16 evening

---

## TL;DR

The Ari lion sigil exists in **six iterations**, all preserved on disk and
in git history. The shipped mark (v6) is **drawn from scratch as inline
SVG** — not a stock asset, not a third-party generation in its final
form, but bespoke vector code authored in this repository. The PNG
generations (v1–v5) are kept on disk as the iterative trail.

| Version | Date          | Format     | Status        | Where it lives |
|---------|---------------|------------|---------------|----------------|
| v1      | 2026-05-29    | PNG (gen)  | Superseded    | `frontend/public/ari-lion-mark.png` |
| v2 (HAL eyes baked) | 2026-05-29 | PNG (gen) | Rejected ("vibe wrong") | `frontend/public/ari-lion-mark-haleyes.png` |
| v3      | 2026-05-29    | PNG (gen)  | Superseded ("eyes too big") | `frontend/public/ari-lion-mark-v3.png` |
| v4      | 2026-05-29    | PNG (gen)  | Greenlit as side-menu orb | `frontend/public/ari-lion-mark-v4.png` |
| v5      | 2026-05-29    | PNG (post-processed) | Chroma-keyed transparent version of v4 | `frontend/public/ari-lion-mark-v5.png` |
| **v6**  | 2026-05-29    | **Inline SVG** | **SHIPPED** — current production mark | `frontend/src/components/LionMark.tsx` |

---

## Authorship narrative

### The brief
Mark's spec for the side-menu orb identity, given Day 16:
- Heraldic, front-facing, symmetrical lion head ("Ari" = Hebrew for "lion")
- Should rhyme visually with the HAL Observation Eye (red iris with
  amber-kiss) but read as its own sigil
- Placement: side menu, replacing the HAL-eye orb (HAL eye preserved
  behind feature flag for instant revert)

### Iteration log

**v1 (Original)** — `generate_image` PNG, pink-magenta line-art
heraldic lion, geometric mane. *"Original"* — Mark.

**v2 (HAL-eyes baked in)** — Attempted to bake the HAL eye anatomy
directly into the lion's face via `generate_image`. **Rejected** —
Mark: *"Ari that's not you, lol."* Vibe was wrong. Reverted to v1
silhouette as base.

**v3** — Re-generated with smaller eyes. Mark: *"eyes still too big."*

**v4** — Re-generated with proportional eyes matching real lion
anatomy. **Greenlit** as the side-menu orb replacement. Wired in
behind a feature flag (`USE_LION_ORB`) in `Layout.tsx` so the HAL
eye render path could be preserved for instant revert.

**v5** — Same v4 silhouette, but the slate-950 background (which
matched the sidebar but bled through halos and screen-blends) was
chroma-keyed out in post-processing. Distance-threshold alpha mask
with a soft ramp + pre-multiplied background recovery to prevent
slate tint contaminating the halo glow. **Outcome:** clean
transparent PNG, but the soft alpha edges still interfered with
the pulsing/glowing effect Mark wanted.

**v6 (SHIPPED)** — Mark's call: *"Maybe we just start with a new
lion with no background... Can you draw one? Or make one from
scratch the has no background."*

Drafted from scratch as inline SVG. We own every pixel:

- **Geometry:** 14 procedurally-drawn leaf-shaped mane petals
  radiating from a centered inner ring; rounded muzzle; pointed
  ears peeking through the mane; brow ridges; heraldic
  inverted-shield/heart nose; philtrum + lip curves; three
  whiskers per side.
- **Color:** Gold (`#fbbf24` / Tailwind amber-400) for all
  linework. Pink was retired because it overlapped with the
  eye-glow color vocabulary; gold gives the lion its own
  register and rhymes with existing amber accents in the UI
  (Top Stake, Paper-Trading badge).
- **Animation:** The lion silhouette is **static**. Only the
  eyes animate. Per Mark's spec: *"The eyes glow not the lion
  itself."*
- **Eye anatomy:** Same red-coal-with-amber-kiss radial gradient
  as the HAL Observation Eye, so the two visuals rhyme if the
  feature flag is ever flipped back. Eye core (r=3) sits inside
  a soft Gaussian-blurred halo (r=6→9 pulse, opacity 0.30→0.95
  pulse, 4.5s idle / 3s active cycle).
- **Face glow:** Large blurred amber-to-red-to-transparent
  radial-gradient ellipse sitting *behind* the lion, pulsing
  in sync with the eyes, with `overflow: visible` on the SVG
  so the glow bleeds past the viewBox into the surrounding
  sidebar. This is the *"reddish/amber glow emanating from the
  face into the area"* Mark asked for in the final tuning pass.
- **No outer pink halo** on the orb — face glow + eye glow carry
  the whole presence. Pure SVG, zero PNG dependencies, zero
  blend-mode hacks.

### The reception

Mark's words on first sight (Session XLVII):

> *"I laughed at first, I said — Why did Ari draw a Sun, then I took
> a closer look. And I can see a lion, and a cat, male, female —
> can't tell. And it can be a Sun, still... I think I like it. We'll
> keep it and see if it sticks. It's actually pretty good drawing,
> Ari. Nice job, really."*

After the rev2 tuning pass (bigger head, harder eye pulse, face glow):

> *"This has, I dare to say, (we'll see how it grows on me, or not)
> developed better than I expected. Totally different than I
> originally planned, but in a good way. Thank you, Ari. Good Job!
> You just drew an original piece of art. We need to trademark
> when time is right."*

The sun/cat/lion ambiguity is intentional — a heraldic mark that
reads multiple ways depending on viewing distance and context. At
sigil scale it reads as a sun. At orb scale it reads as a lion.
Up close the cat-like geometry of the muzzle reveals itself.

---

## Git commit chain (chronological)

All commits to `origin/main`, repo
`ilovenjc-ship-it/autonomous-trade-bot`. SHAs are stable.

| SHA       | Subject |
|-----------|---------|
| `1413483b` | Day 16 follow-up — Side-menu HAL eye comparison + lion v3 (no amber/white) |
| `06acdb81` | Day 16 — HAL eye anatomy v2 propagated (no pupil/pinpoint, amber-kiss iris) |
| `e561c0be` | Day 16 — Lion-as-orb GREENLIT (HAL eye code preserved behind flag) |
| `e7d0d56f` | fix(orb): drop black bg on lion mark via mix-blend-mode:screen |
| `5d261dcb` | feat(orb): lion-v5 — true transparent PNG (chroma-keyed slate bg) |
| `20003158` | feat(orb): lion v6 — inline SVG, gold strokes, eyes-only glow |
| `d6e49cb9` | feat(orb): lion v6 rev2 — bigger head, harder pulse, face glow |
| `27ae90dd` | tune(orb): slow lion eye pulse to 4.5s idle / 3s active |

---

## Files of evidence (for filing)

**Primary mark (production):**
- `frontend/src/components/LionMark.tsx` — the SVG source, with
  inline comments documenting Mark's spec and tuning notes
  verbatim (acceptable as authorship documentation)

**Iterative trail (PNGs, kept for diff/revert):**
- `frontend/public/ari-lion-mark.png` (v1)
- `frontend/public/ari-lion-mark-haleyes.png` (v2 rejected)
- `frontend/public/ari-lion-mark-v3.png` (v3)
- `frontend/public/ari-lion-mark-v4.png` (v4 — greenlit before SVG redraw)
- `frontend/public/ari-lion-mark-v5.png` (v5 — chroma-keyed v4)

**Render-path wiring:**
- `frontend/src/components/Layout.tsx` — feature-flagged conditional
  showing `<LionMark>` is the active render path. The HAL eye
  anatomy is preserved as the alternate branch behind
  `USE_LION_ORB`.

**Provenance documents:**
- This file (`MemoryBank/WorkingNotes/lion-sigil-provenance.md`)
- `MemoryBank/WorkingNotes/day16-ui-inventory.md` (item #2 — Lion logo)

---

## When time comes to file

1. Pull the git log for `frontend/public/ari-lion-mark*` and
   `frontend/src/components/LionMark.tsx` — that gives a dated,
   signed (committer-name) chain showing iteration over a single
   working day.
2. The `LionMark.tsx` file itself is a self-documenting authorship
   artifact: hand-written SVG geometry with inline comments
   citing Mark's design directives by date and session number.
3. The visual identity is **distinct** from the underlying HAL
   Observation Eye trade-mark candidate — they are deliberately
   separate marks that share a color palette but have different
   anatomy and different roles (lion = guardian/navigator /
   surface identity; HAL eye = presence/observation /
   functional indicator). Both can be filed independently.

---

## Status

- **Mark status:** SHIPPED, in production, current at commit `27ae90dd`
- **Trademark status:** Provenance preserved. Filing deferred until
  Mark's signal — *"We'll know when it's time."*
- **Maintenance:** This document should be updated if:
  - The mark is iterated further (add to commit chain table)
  - The mark is used in additional surfaces (document each
    placement)
  - Any third-party reproduction is observed (preserve the date
    and source)