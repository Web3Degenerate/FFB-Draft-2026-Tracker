# Opponent Modeling — Results

Run 2026-08-20 on **2024 + 2025 only** (2023 not yet fetched).
Scripts and data in this folder. Companion plan: `../Opponent-Modeling.md`.

## Headline

**No manager-level tendency survived the stability gate. Don't build opponent
modeling into the war room.**

**The league's own price curve did survive, and it's reproducible.** That's the
artifact worth using — it's the baseline for live inflation tracking, which was
already §5a of the plan and now has evidence behind it.

---

## 1. Data quality

| | 2024 | 2025 |
|---|---|---|
| Picks | 168 | 168 |
| Matched to Fantasy Index | **168 (100%)** | **166 (98.8%)** |
| Keepers / auction picks | 23 / 145 | 22 / 146 |
| Auction dollars | $1,863 | $1,910 |
| Budget, roster, scoring | $200, identical lineup, H2H_POINTS | identical |

Match required a city↔nickname map (FI calls them "Denver", ESPN "Broncos D/ST")
and a space-squashing fallback ("DeVon Achane" vs "De'Von Achane"). The two
remaining misses are genuinely outside FI's top 392.

Settings are identical across years, so the two drafts are directly comparable.

---

## 2. The stability gate — what failed

11 managers appear in both years (team 9 changed owner and is excluded).
Spearman ρ between each manager's 2024 and 2025 value, permutation p-values.

| Trait | ρ | p | verdict |
|---|---:|---:|---|
| $1-buy share | +0.33 | 0.32 | no signal |
| Top-3 spend share | +0.26 | 0.43 | no signal |
| Early-spend share | +0.20 | 0.54 | no signal |
| RB spend share | +0.17 | 0.62 | no signal |
| Keepers used | 0.00 | 1.00 | **zero variance** |
| **Aggression (over/underpay)** | **−0.08** | 0.82 | **no signal** |
| WR spend share | −0.33 | 0.33 | no signal |
| QB spend share | −0.46 | 0.16 | no signal |
| TE spend share | −0.54 | 0.09 | no signal |
| Nomination win rate | −0.86 | 0.001 | **artifact — see below** |

**The one "significant" result is not real.** Nomination win rate is a count of
0–4 out of ~12 nominations, with only four distinct values per year. Everyone
who happened to win 2 in 2024 won 0 in 2025, and vice versa — textbook
regression to the mean. The decisive tell is the **sign**: a persistent
behavioural trait must correlate *positively*. A strong negative correlation is
evidence of noise, not of a tendency. Leave-one-out is stable (−0.83 to −0.93)
because the pattern comes from the tie structure, not one outlier.

Under Benjamini-Hochberg across the 10 traits, nothing else clears 0.44.

### Follow-ups that also failed

- **Keepers removed from spend shares** (a known structural confound — keeping
  2 RBs inflates RB share by construction). Best result TE at ρ=0.43, p=0.19.
  Still nothing. Count-based shares instead of dollar shares: same.
- **Aggression under three definitions** — median, mean, and sum of log price
  ratio: ρ = −0.08, +0.10, +0.02. Comprehensively null.

### What this means

These managers are **not predictably different from each other** in any way this
data can measure. Positional spend looks like it's driven by that year's board
and keeper slate, not by manager preference. Nobody is a persistent overpayer.

That's a genuinely useful negative result: it means the effort belongs in
tracking tonight's room, not in profiling opponents.

> Note: every continuing manager kept **exactly 2** in both 2024 and 2025 (only
> team 9, which changed hands, kept fewer). Keeper count has zero variance in
> this window, so it can't carry signal here.

---

## 3. What did survive — the price curve

Fitting `ln(price) ~ ln(FI rank)` on non-keeper picks ≥ $2:

| Year | Intercept | Slope | R² |
|---|---:|---:|---:|
| 2024 | 6.245 | **−0.909** | 0.565 |
| 2025 | 6.179 | **−0.909** | 0.602 |

The slope is **identical to three decimals** across two independent drafts. The
level moved 6%. This room prices players the same way year over year.

### But the log-linear form is dangerous at the top

R² of 0.6 looked fine and hid a serious flaw — the power law overshoots badly
exactly where the money is:

| | model | actual |
|---|---:|---:|
| RB, positional rank 1 | **$247** | $62 |
| WR, rank 2 | $159 | $60 |
| TE, rank 1 | $52 | $25 |

Real auction curves flatten at the top because budgets are finite. **Isotonic
regression** (monotone, non-parametric) fixes this and is better on every
measure:

| Fit 2024 → predict 2025 | median abs error | within ±50% | pool total |
|---|---:|---:|---|
| Log-linear (capped) | 40.3% | 63% | $1,560 vs $1,836 (−15%) |
| **Isotonic** | **33.9%** | 64% | **$1,861 vs $1,836 (+1.4%)** |

**Read this honestly:** it predicts the *shape of the market* and the *total
dollar pool* very well (1.4% off), and individual players only to about ±34%.
It is a sanity anchor for "is this bid sane," not a price oracle.

---

## 4. Deliverable

`watchlist_prices.csv` — expected 2026 auction price for the 42 skill players on
the current watch list, from the isotonic curve fit on 2024+2025 actuals.

Worth noting where it disagrees with ESPN's generic keeper values, because that
gap *is* this league's personality:

| Player | FI pos rank | model | ESPN keeper |
|---|---:|---:|---:|
| Drake Maye | QB2 | $24 | $10 |
| Caleb Williams | QB3 | $24 | $3 |
| Colston Loveland | TE3 | $26 | $13 |
| Tucker Kraft | TE4 | $22 | $2 |

**This room pays up for QBs and TEs relative to generic market values.** That is
a league-level effect and it's stable — unlike anything at the manager level.

Caveat: isotonic produces flat plateaus where data is sparse (four RBs all at
$53). That's the method being honest about not being able to separate them.

---

## 5. Recommendation

1. **Drop Phases 2–4b of the plan.** Manager traits don't replicate. Building
   scouting cards on them would put confident-looking numbers in front of you
   that are indistinguishable from noise — worse than having nothing.
2. **Build the live inflation tracker** (plan §5a). The curve is stable, the
   pool total is predictable to ~1.4%, and it measures tonight's room instead of
   inferring from 24 old data points.
3. **For "who's likely to bid," use budget and roster need only** — which
   `lib/auction.ts` and `lib/opponent-sort.ts` already compute. The history layer
   adds nothing measurable.
4. **Fetching 2023 is now lower priority.** It would take the stability tests
   from one to two. Given how comprehensively null the manager traits are — with
   aggression at ρ≈0 under three definitions — a third year is unlikely to
   rescue them. It would modestly improve the price curve, which is the cheaper
   reason to do it.

## 6. Caveats

- **One stability test.** Two years gives a single 2024→2025 comparison on 11
  managers. A trait would have to be strong to show up. Absence of evidence here
  is weaker than evidence of absence — but ρ≈0 on aggression across three
  definitions is about as close to a real null as this sample can produce.
- ~9 contested buys per manager per year is a thin base for any per-manager number.
- K and D/ST are excluded throughout: FI gives them no overall rank and they're
  forced $1–3 buys.
- The watch-list table is joined against the **practice** league state
  (`leagueId 753679918`), so statuses are from that mock, not the real draft.
  The prices depend only on FI rank and are unaffected.
