# Opponent Modeling Plan

**Status:** planning. Written 2026-08-20, before the 2026 draft.
**Goal:** turn 2023–2025 draft history + Fantasy Index rankings into usable
reads on the other 11 managers.

---

## 0. What we actually have (verified, not assumed)

| Source | Location | State |
|---|---|---|
| FI rankings 2023/2024/2025 | `data/fantasy-index-history.json` | ✅ 392 players/yr — `overallRank`, `positionalRank`, `projectedPoints`, `team`, `bye` |
| Draft results 2024, 2025 | `../FFB-2026-Model/data/raw/espn/{2024,2025}/mDraftDetail.json` | ✅ 168 picks/yr, every pick has `bidAmount`, `keeper`, `overallPickNumber`, `nominatingTeamId` |
| Draft results **2023** | — | ❌ **missing.** No `data/raw/espn/2023/` |
| Player id → name/pos | `kona_player_info_*.json` per year | ✅ ~1,100 entries/yr |
| Manager identity | `mTeam.json` → `owners[]` GUID | ✅ stable across years |

### Two findings that change the plan

**1. Manager identity must key on owner GUID, not team ID or name.**
Team names churn every year — "Let James COOK" was team 15 in 2024 and the name
moved to team 14 by 2025. Owner GUIDs are stable and, once checked, **no manager
actually changed team slots**. Keying on name would silently scramble two
managers' histories. Key on GUID, then verify the mapping by hand once.

**2. Team 9 changed hands between 2024 and 2025.**
Owner `D586FD0A…` (2024) → `75D19F1B…` (2025, 2026). That manager has **2 drafts
of history, not 3**. Every per-manager output must carry its own sample count.

### Sample size — read this before believing any output

- 145 non-keeper picks in 2024, 146 in 2025 → **~12 auction buys per manager per year**
- With 2023 recovered: **~36 auction buys per manager, total, ever**
- Spread across 6 positions that is ~6 observations per manager per position

**This supports a handful of manager-level traits. It does not support a
predictive model, and it will not support "manager X always takes a TE in the
$20 range."** Anything estimated per-manager-per-position will be noise wearing
a number's clothing. The plan below is built around that constraint, and §4 is
the gate that enforces it.

---

## 1. Phase 0 — build one tidy pick table

Everything downstream depends on this. One row per pick, all years:

```
year, owner_guid, manager_label, team_id, overall_pick, nominating_owner_guid,
player_id, player_name, position, is_keeper, price,
fi_overall_rank, fi_positional_rank, fi_projected_points,
budget_total, roster_size, dollars_spent_before, dollars_left_after, slots_left_after
```

Work items:
1. Fetch 2023 (`mDraftDetail`, `mTeam`, `kona_player_info`) into `data/raw/espn/2023/`.
   Same ESPN endpoints as 2024/2025 — see `reference/ESPN_API_NOTES.md`.
2. Join picks → FI rankings **by name**, normalized (suffixes, punctuation,
   `D/ST` naming). ESPN and FI player IDs do not share a namespace.
   **Report the match rate per year and eyeball the misses** — a silent 15% miss
   rate concentrated in one position would bend every curve that follows.
3. Derive `dollars_spent_before` / `slots_left_after` by replaying picks in
   `overallPickNumber` order per team. This is what makes pacing analysis possible.
4. Emit `data/draft-history.json` (or parquet in the Python project).

Unmatched players and keepers both stay in the table, flagged — they're needed
for budget context even when excluded from price fitting.

---

## 2. Phase 1 — the market baseline

FI gives **rank**, not dollars. We need an expected price to measure anyone
against.

**Use the league's own price curve, fit per year.** Not an external AAV source.
The room's own spending *is* the market view for that room, and fitting per year
automatically absorbs that season's inflation, budget, and keeper effects.

- Fit `log(price) ~ s(fi_overall_rank)` per year, with position as a factor.
  Log space matters: auction prices are multiplicative. A $2 miss on a $5 player
  is a 40% overpay; on a $60 player it's noise. Residuals must be ratios
  ("paid 1.35× market"), not dollar differences.
- Isotonic or a smoothed monotone fit beats a polynomial here — price should
  never increase with worse rank, and n is small.

**Exclusions from the fit:**
- **Keepers.** Contractually discounted, not market transactions. Keep them in
  the budget model, drop them from the price curve and from overpay stats.
- **$1 endgame buys.** The last roster slots are forced and everyone pays $1.
  They will dominate the row count and carry no signal. Model separately or drop.

Output per non-keeper pick: `price_ratio = actual / expected`.

---

## 3. Phase 2 — manager traits

Ordered by how likely they are to survive contact with the sample size.

| # | Trait | How | Robustness |
|---|---|---|---|
| 1 | **Positional spend share** | % of budget by position, keepers included | 🟢 pools all picks — most stable |
| 2 | **Aggression** | median `price_ratio` across all buys | 🟢 pools all picks |
| 3 | **Concentration** | Gini / top-3-spend share → stars-and-scrubs vs balanced | 🟢 |
| 4 | **Pacing** | % budget spent by pick 40 / 80 / 120 | 🟡 |
| 5 | **Nomination style** | do they nominate players they end up buying, or drain others? `nominating_owner_guid` vs winner | 🟡 rare data, worth mining |
| 6 | **Keeper surplus** | keeper price vs FI market value | 🟡 |
| 7 | ~~Per-position aggression~~ | | 🔴 ~6 obs/manager/position — do not ship |

**Confounds to condition on, or the numbers lie:**
- **Budget remaining.** "Never buys RBs late" may just mean "was broke." Every
  trait needs an affordability filter.
- **Availability.** You can only buy who's been nominated and is unsold.
- **Positional scarcity by year.** The 2024 RB class ≠ the 2025 RB class; that's
  why the curve is fit per year.
- **Keeper slate.** A manager keeping an elite RB has different needs by construction.

---

## 4. Phase 3 — the validation gate ⛔

**Nothing reaches the war room until it passes this.**

For each trait: compute it per manager in year N, correlate against the same
trait in year N+1, across the 12 managers.

- 2 years available → one test (2024 → 2025)
- 3 years → two tests (2023 → 2024, 2024 → 2025)

If a trait doesn't correlate year-over-year, it isn't a manager tendency — it's
last year's noise, and using it at the table is worse than using nothing.

Be realistic about what this test can prove: with n=12 managers, the correlation
estimate is itself noisy. A trait needs to be *strong* to show up at all. Expect
traits 1–3 to survive and most of the rest not to. Report the correlation and
the sample count next to every number that ships, and let weak traits die.

---

## 5. Phase 4 — what actually reaches the table

### 5a. The highest-value piece needs no history at all

**Live inflation tracking.** Compare tonight's prices against the market curve
*as the draft happens*. It answers the question that actually costs money:
*is the room hot or cold right now, and what will my remaining targets go for?*

This is more predictive than any historical manager trait, because it measures
tonight's room instead of inferring from 24 old data points. It reuses the
Phase 1 curve fitted on 2026 FI ranks, and needs none of Phases 2–4.

**If only one thing gets built, build this.**

### 5b. Scouting cards (pre-draft, static)

One card per opponent: positional spend shares, aggression multiplier,
concentration, nomination style — each with its sample count and stability
score. A printed sheet is fine; this doesn't need to be in the app.

### 5c. Live "who's likely to bid" (needs 5a + 5b)

For the current nominee, rank opponents by: has budget × needs the position ×
historically pays up. Slots into the existing opponent cards on the Watch List.

Note that **budget and roster need alone** — which the app already computes in
`lib/auction.ts` and `lib/opponent-sort.ts` — probably carry most of the
predictive weight here. History is the smaller term. Build the cheap part first
and check whether the history layer adds anything measurable.

---

## 6. Sequencing and effort

| Phase | Effort | Blocked by |
|---|---|---|
| 0 — pick table | ~half day | fetching 2023 |
| 1 — market curve | ~2–3 hrs | Phase 0 |
| 2 — traits | ~3–4 hrs | Phase 1 |
| 3 — validation gate | ~2 hrs | Phase 2 |
| 4a — live inflation | ~half day | Phase 1 only |
| 4b/4c — cards, live bidder model | ~half day | Phase 3 passing |

**This is not a pre-draft build.** Phases 0–3 are a genuine analysis project and
should not be rushed into the war room the day before a draft. Phase 4a is the
exception — it's independent of all the history work and could be built on its
own if there's appetite before Saturday.

---

## 7. Open questions

1. **Is 2023 worth fetching?** It takes one manager from 2 → 3 drafts and the
   rest from 2 → 3. It roughly halves the noise on every trait and is what makes
   the §4 gate meaningful (two stability tests instead of one). Recommend yes.
2. **Scoring/roster settings stable 2023→2026?** `mSettings.json` per year will
   say. If PPR or roster shape changed, spend shares aren't comparable across
   years without adjustment.
3. **Did keeper rules change?** Keeper count is stable (23 in 2024, 22 in 2025)
   but the pricing rule matters for trait 6.
4. **Manager GUID → real name mapping.** Needed once, by hand, so the scouting
   cards say "Dave" and not `{F027753B…}`. This is also the checkpoint where the
   identity mapping gets human-verified before anything is built on it.
