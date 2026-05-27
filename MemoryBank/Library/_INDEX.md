# Library — Project Ari

Reference shelf. Books, papers, and long-form artifacts that have been read against
Project Ari's current shape, with **lifts** (concrete things to apply) and
**counterfactuals** (places the source argues against something we do).

Filing protocol (per book/paper, one file in this directory):

- **Title · Author · Year · Format** — header
- **Why it matters to Ari** — one paragraph, anchored to current code/spec
- **Lifts** — adoption candidates. Each: concept name → relevance → implementation hint → page refs
- **Counterfactuals** — where the source disagrees with us. Resolve or note explicitly
- **Validations** — where the source endorses something we already do (citation ammo)
- **Skip list** — what's covered but not relevant (so future Ari knows it was read, not missed)
- **Vocabulary added to STATE.md §3** — list of terms (if any) cross-linked

**Inscription authority (per D-23, 2026-05-27):** When a Library entry surfaces a
vocabulary term or counterfactual that warrants STATE.md inscription AND the
rationale is filed alongside the proposal (trigger named, source cited, scope
defined), Ari may inscribe to §3 (vocabulary) and §4 (decision log) directly,
without operator pre-approval. Descriptive inscription is autonomous;
prescriptive inscription (anything that changes how Project Ari operates in
code or doctrine) still requires operator green-light. Filed counterfactuals
that exist as forward-warnings (e.g., D-21, D-22) are descriptive — they catalog
what a source said and when it would apply, without changing current behavior.

---

## Shelf

| File | Title | Author(s) | Year | Pages | Read date | Status |
|------|-------|-----------|------|-------|-----------|--------|
| `learn-algorithmic-trading.md` | Learn Algorithmic Trading | Donadio & Ghosh (Packt) | 2019 | 378 | 2026-05-27 | filed |
| `algorithmic-trading-handbook-nurp.md` | The Algorithmic Trading Handbook | Esat Shehu (Nurp LLC) | 2023 | 90 | 2026-05-27 | filed (verdict: no) |
| `advances-in-financial-machine-learning.md` | Advances in Financial Machine Learning | Marcos López de Prado (Wiley) | 2018 | 393 | 2026-05-27 | filed (verdict: yes — strongly worth) |
| _(queued)_ | Active Portfolio Management | Grinold & Kahn (McGraw-Hill, 2nd ed) | 2000 | 621 | — | received, queued for Fleet-Consensus-off-Uniform work |
| _(queued)_ | Fortune's Formula | William Poundstone (summary edition) | — | 94 | — | received (abridged/summary version, not full ~400pp original); queued for Day 14 Item 3 Kelly check |
| _(blocked)_ | ALGORITHMIC AND HIGH-FREQUENCY TRADING | Cartea / Jaimungal / Penalva | 2015 | 6 | — | **upload incomplete — only TOC pages received, not the book itself; needs re-source** |
| _(blocked)_ | Quantitative Trading | Ernie Chan (Wiley) | 2009 | 203 | — | **upload is image-based scan; pypdf extracts zero text; needs OCR pass or text-PDF re-source** |