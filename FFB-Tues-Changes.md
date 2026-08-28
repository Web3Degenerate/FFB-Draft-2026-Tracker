# FFB Tuesday Changes — `/player-data` Research Page

**Target:** ESPN auction draft, Saturday 2026-08-22. League `753679918`, 12 teams, $200, 14 roster spots, 2 keepers/team.
**Scope of this document:** build a new `/player-data` page backed by free third-party data. Nothing in this document changes the Auction Room, keepers, tiers, or watch list.

---

## 0. Non-negotiables — read before writing code

### 0.1 Mock draft data is NOT a price signal. Do not use it.

`data/espn-socket-frames.ndjson` contains ~1,300 `SOLD` events from ESPN mock/practice drafts. **These are worthless for pricing and must not be used to build, calibrate, or validate any valuation model.** Reasons:

- Mock rooms contain abandoned and autodraft teams. Measured spend was $1,863–$2,311 of the available $2,400 per draft. The real league spends $2,367–$2,395 every year. The mock market is not clearing.
- Mocks have **no keepers**. This league removes ~19 players at below-market keeper prices before the auction opens, which changes both the available pool and the money chasing it. A mock draft is a structurally different market.
- Mock participants are anonymous strangers with nothing at stake. This league is 12 known managers with three years of observable, repeated behavior.

**The only valid price signal for this league is `espn_draft_data_2023_2025.json`** — the actual 2023, 2024, and 2025 auction results, with real prices paid by the real managers who will be in the room on Saturday. Any future pricing work uses that file and nothing else.

The socket frames remain useful for exactly one thing: **live draft-day capture** (`SOLD` / `BID` / `NOMINATION` frames are exact, keyed by ESPN team ID and player ID). That is a separate work item and out of scope here.

### 0.2 Everything on this page is *research*, not valuation

`/player-data` shows external, factual inputs — usage, injury, depth chart, market ADP, expert consensus, Vegas game environment. It must not display a dollar value, a suggested bid, or any derived "worth." Pricing belongs to the Auction Room and comes from league history only.

### 0.3 Draft-day reliability

The draft is Saturday. Every source below must be **fetched ahead of time and cached to disk**. The page reads only from local JSON. If a fetch fails, the page renders from the last good cache with a visible staleness timestamp. **No network call may happen during a page render.**

---

## 1. Verified data sources

Every URL below was fetched and parsed successfully on 2026-08-17. Sizes and row counts are actual.

| # | Source | URL | Auth | Size | Join key |
|---|---|---|---|---|---|
| 1 | **ID crosswalk** | `https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv` | none | 2.6 MB / 12,473 rows | `espn_id` |
| 2 | **Sleeper players** | `https://api.sleeper.app/v1/players/nfl` | none | 14.6 MB / 12,221 | `sleeper_id` |
| 3 | **Sleeper trending** | `https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=200` | none | small | `sleeper_id` |
| 4 | **nflverse 2025 stats** | `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_2025.csv` | none | 882 KB / 2,021 | `player_id` = `gsis_id` |
| 5 | **nflverse snap counts** | `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv` | none | 2.4 MB / 26,613 | `pfr_player_id` = `pfr_id` |
| 6 | **nflverse injuries** | `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv` | none | 695 KB / 6,069 | `gsis_id` |
| 7 | **nflverse schedule + Vegas** | `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv` | none | 2.2 MB / 7,549 | `team` abbrev |
| 8 | **FFC ADP** | `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026&position=all` | none | small | name + position |
| 9 | **FantasyPros ECR** | `https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php` | none | 814 KB HTML | `player_id` = `fantasypros_id` |
| 10 | **nflverse depth charts** *(optional)* | `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2025.csv` | none | **52 MB** / 554,216 | `espn_id` (direct) |

### 1.1 Things that do NOT work — do not waste time on them

- **FFC has no auction endpoint.** `adp/auction-ppr`, `adp/auction` and `auction/ppr` all return `{"status":"Error","errors":["Invalid format"]}` or an HTML 404. FFC provides **ADP only**.
- **Sleeper's `espn_id` field is unreliable** — it is `null` for many active players including Jahmyr Gibbs. Never join Sleeper to ESPN directly. Always route through the crosswalk (source 1).
- **FantasyPros auction values are JS-rendered.** `auction-values/calculator.php` has no extractable JSON payload. Only the **ECR rankings** page (source 9) is statically parseable. Do not attempt to scrape FP auction values.
- **`ff_playerids.csv` is not in nflverse-data** (404). The crosswalk lives in the `dynastyprocess/data` repo — source 1 above.
- The Odds API and similar keyed odds services are **not needed**. Source 7 carries Vegas lines with no key.

---

## 2. The ID crosswalk is the linchpin

The app keys everything on ESPN player IDs. Every external source uses a different ID. `db_playerids.csv` resolves all of them.

Verified coverage against the current `data/players.json`:

- **250 / 250** (100%) of the top-250 skill players matched by `espn_id`
- All 250 carried a `sleeper_id`, a `gsis_id`, **and** a `fantasypros_id`
- 2025 usage-stat coverage: 179/200 top skill players (misses are 2026 rookies — correct and expected)
- Snap-count coverage: 180/200 (same reason)

Relevant columns: `espn_id, sleeper_id, gsis_id, pfr_id, fantasypros_id, name, merge_name, position, team, age, draft_year, draft_round, draft_ovr, height, weight, college, db_season`.

Example row: `Jahmyr Gibbs → espn_id 4429795, sleeper_id 9221, gsis_id 00-0039139, pfr_id GibbJa01, fantasypros_id 22968`.

**Build the crosswalk first and assert its hit rate in a test.** If ESPN→crosswalk coverage of the top 200 skill players drops below 95%, fail the ingest loudly rather than rendering a page full of blanks.

Name-based fallback (for FFC, which has no usable ID): normalize with the same routine already in `lib/fantasy-index.ts` — NFKD normalize, strip diacritics and punctuation, lowercase, strip `jr|sr|ii|iii|iv` — then match on `position + normalized name`. Accept a match only when it is unique. Record every unmatched player in the ingest report; never silently drop.

---

## 3. Architecture

Follow the existing conventions in this repo: a fetch script writes JSON to `data/`, a `lib/` module owns pure transforms, an API route serves it, the page is a client component. `lib/store.ts` remains the persistence boundary.

```
scripts/fetch-player-data.mjs     ← NEW. Run manually, pre-draft. All network I/O lives here.
        │
        ├─ data/player-ids.json           (crosswalk, ESPN-id keyed, trimmed)
        ├─ data/sleeper-players.json      (trimmed to rostered-relevant fields)
        ├─ data/nflverse-usage.json       (2025 season stats + snap share)
        ├─ data/nflverse-injuries.json    (latest report per player)
        ├─ data/vegas-schedule.json       (2026 games, byes, implied team totals)
        ├─ data/ffc-adp.json              (12-team PPR ADP)
        ├─ data/fantasypros-ecr.json      (ECR, tier, expert spread)
        └─ data/player-data-meta.json     (per-source fetchedAt, row counts, unmatched list)
        │
lib/player-data.ts                ← NEW. Pure. Loads caches, joins on ESPN id, derives metrics.
lib/player-data-types.ts          ← NEW.
        │
app/api/player-data/route.ts      ← NEW. GET. Serves the merged profile set. No network.
app/player-data/page.tsx          ← NEW. Search one player, or compare up to 4.
```

**Do not** wire any of this into `lib/auction.ts`, `lib/tiers.ts`, or the Auction Room player board. `/player-data` is additive and isolated. Add the nav link alongside the existing Keepers / Tier editor / Watch list links.

Add to `.gitignore`: the new `data/*.json` caches, consistent with how runtime data is already excluded.

Add an npm script: `"fetch:player-data": "node scripts/fetch-player-data.mjs"`.

---

## 4. Ingestion script spec (`scripts/fetch-player-data.mjs`)

Plain Node ESM, no new dependencies. Use built-in `fetch`. Write with the same atomic temp-file-then-rename pattern as `atomicWrite` in `lib/store.ts`.

General rules:
- Each source fetches independently. **One source failing must not abort the others** — record the failure in `player-data-meta.json` and keep the previous cache for that source.
- 30s timeout per request, 2 retries with backoff.
- Log a summary table at the end: source, rows in, rows matched to ESPN ids, rows unmatched.
- Trim aggressively before writing. Sleeper's raw payload is 14.6 MB for 12,221 players; we only care about the ~1,026 in `players.json`. Filter to ESPN-known players before writing to disk.

### 4.1 Crosswalk → `data/player-ids.json`
Parse CSV. Keep rows with a non-empty `espn_id`. When `espn_id` collides, prefer the row with the highest `db_season`. Output keyed by ESPN id.

### 4.2 Sleeper → `data/sleeper-players.json`
Fetch the full player map, then keep only entries whose `sleeper_id` appears in the crosswalk for a player in `players.json`. Retain: `injury_status`, `injury_body_part`, `injury_notes`, `practice_participation`, `status`, `depth_chart_position`, `depth_chart_order`, `age`, `years_exp`, `search_rank`, `team`, `number`.

Separately fetch trending adds and store a `trendingAddCount` per player. This is a hype/news signal — label it as such in the UI, not as a projection.

### 4.3 nflverse usage → `data/nflverse-usage.json`
From `stats_player_reg_2025.csv`, keyed by `gsis_id`, retain: `games`, `targets`, `receptions`, `receiving_yards`, `receiving_tds`, `receiving_air_yards`, `receiving_yards_after_catch`, `receiving_first_downs`, `target_share`, `air_yards_share`, `wopr`, `racr`, `receiving_epa`, `carries`, `rushing_yards`, `rushing_tds`, `rushing_first_downs`, `rushing_epa`, `attempts`, `completions`, `passing_yards`, `passing_tds`, `passing_interceptions`, `passing_epa`, `passing_cpoe`, `pacr`.

From `snap_counts_2025.csv`, keyed by `pfr_player_id`, aggregate the regular season: total offensive snaps, mean `offense_pct`, and `offense_pct` over the **last 4 games played** (late-season role is the better signal for next year — surface both).

**These are 2025 actuals, not 2026 projections.** Label the section "2025 Usage" everywhere. Its job is to tell you whether last year's fantasy points came from real opportunity or from touchdown luck.

### 4.4 Injuries → `data/nflverse-injuries.json`
Keyed by `gsis_id`. Take the most recent week's row per player. Retain `report_primary_injury`, `report_status`, `practice_status`, `week`. Treat Sleeper's `injury_status` as the fresher of the two and show it first; nflverse gives the historical pattern (a player with eight weeks of "Limited" practice reports is a different risk than one clean report).

### 4.5 Vegas + schedule → `data/vegas-schedule.json`
From `games.csv`, filter `season == 2026`. There are 272 games across 32 teams and 18 weeks; **112 currently carry `spread_line` and `total_line`** (lines are posted for early weeks only — this is expected, and it will improve if you re-run the fetch closer to Saturday).

Derive per team:
- **Bye week** — the week in 1..18 where the team appears in no game. Exact, no guessing.
- **Implied team total per game** — `total_line / 2 ± spread_line / 2`.
- **Season mean implied total** across games that have lines. This is the headline "offensive environment" number.
- **Weeks 15–17 mean implied total** — fantasy playoff schedule strength.
- **Opponent-difficulty proxy** — mean implied total allowed by each opponent.

⚠️ **Verify the spread sign convention before trusting it.** nflverse documents `spread_line` as positive when the home team is favored. Confirm this empirically: take completed 2025 games, compute `home_score - away_score`, and check the correlation against `spread_line`. Assert it in a test. If the sign is inverted, every implied total is wrong in a way that looks plausible.

Sanity check: `2026_01_NE_SEA`, `total_line 44.5`, `spread_line 3.5` → SEA 24.0, NE 20.5, summing to 44.5.

**Season win totals** are not in this file and require a keyed odds API. Skip them. Mean implied team total is a strictly better fantasy input anyway.

### 4.6 FFC ADP → `data/ffc-adp.json`
Query string exactly: `?teams=12&year=2026&position=all`. Response carries `meta.total_drafts` (6,809 as of 2026-08-18) and per player: `adp`, `adp_formatted`, `times_drafted`, `high`, `low`, `stdev`, `bye`, `position`, `team`.

`stdev` is the valuable column — it measures how much the market disagrees about a player. Use FFC's `bye` only as a cross-check against the schedule-derived bye; if they disagree, trust the schedule and log it.

Match by normalized name + position. Log unmatched.

### 4.7 FantasyPros ECR → `data/fantasypros-ecr.json`
Fetch the cheatsheets page with a browser `User-Agent`. Extract the embedded JSON:

```js
const match = html.match(/var ecrData\s*=\s*(\{.*?\});\s*\n/s);
const ecr = JSON.parse(match[1]);   // ecr.players → 503 entries
```

Per player retain: `player_id` (this **is** `fantasypros_id` — verified: Ja'Marr Chase = 19788, matching the crosswalk), `rank_ecr`, `rank_min`, `rank_max`, `rank_ave`, `rank_std`, `pos_rank`, `tier`, `player_owned_avg`, `player_bye_week`. Also capture `ecr.last_updated` and `ecr.total_experts` for the staleness display.

`rank_min` / `rank_max` / `rank_std` are the point of this source: **expert disagreement is a risk measure.** A player ranked 20th with a min of 8 and max of 45 is a fundamentally different asset from one ranked 20th with a min of 18 and max of 23. Surface the spread, not just the consensus rank.

This is HTML scraping and is the most fragile source here. It must fail soft: if the regex misses, log it, keep the prior cache, and let the rest of the page render.

---

## 5. Types (`lib/player-data-types.ts`)

Mirror the existing style in `lib/types.ts` — plain exported `type` aliases, no classes. Every external field is optional; the page must render correctly for a rookie with no 2025 data.

```ts
export type PlayerExternalIds = {
  espnId: number; sleeperId?: string; gsisId?: string;
  pfrId?: string; fantasyProsId?: string;
};

export type Usage2025 = {
  games?: number;
  targets?: number; targetShare?: number; airYardsShare?: number; wopr?: number; racr?: number;
  receptions?: number; receivingYards?: number; receivingTds?: number; receivingEpa?: number;
  carries?: number; rushingYards?: number; rushingTds?: number; rushingEpa?: number;
  attempts?: number; passingYards?: number; passingTds?: number; passingEpa?: number; passingCpoe?: number;
  snapsTotal?: number; snapPctMean?: number; snapPctLast4?: number;
};

export type InjuryProfile = {
  sleeperStatus?: string; bodyPart?: string;
  reportStatus?: string; practiceStatus?: string; reportWeek?: number;
  weeksOnReport2025?: number;
};

export type MarketProfile = {
  ffcAdp?: number; ffcAdpFormatted?: string; ffcStdev?: number;
  ffcHigh?: number; ffcLow?: number; ffcTimesDrafted?: number;
  fpEcr?: number; fpPosRank?: string; fpTier?: number;
  fpRankMin?: number; fpRankMax?: number; fpRankStd?: number;
  fpOwnedAvg?: number;
  sleeperTrendingAdds?: number;
};

export type TeamEnvironment = {
  nflTeam: string;
  byeWeek?: number;
  impliedTotalMean?: number;
  impliedTotalPlayoffs?: number;   // weeks 15-17
  gamesWithLines?: number;         // denominator honesty
  opponentDifficultyMean?: number;
};

export type PlayerProfile = {
  // identity, from the existing Player type
  id: number; name: string; position: Position; nflTeam: string;
  espnKeeperValue: number; overallRank: number; positionRank: number; tier: string;
  fantasyIndexRank?: number; projectedPoints: number;
  // external
  ids: PlayerExternalIds;
  usage2025?: Usage2025;
  injury?: InjuryProfile;
  market?: MarketProfile;
  team?: TeamEnvironment;
  depthChartOrder?: number;
  age?: number; yearsExp?: number;
  sourcesMissing: string[];        // drives the "no data" UI, never a silent blank
};
```

---

## 6. Page spec (`app/player-data/page.tsx`)

Reuse the visual language already established in `app/watch-list/page.tsx` and `app/globals.css` — `panel`, `eyebrow`, `pos pos-*` chips, the existing toast. Do not introduce a new design system or new dependencies.

### 6.1 Layout

**Header** — back-links to Auction Room / Tier Editor / Watch List (match `management-nav-links`). Title "Player Data". A staleness strip listing each source and its `fetchedAt`, red if older than 48h. A "how to refresh" hint naming the npm script.

**Search bar** — same interaction as the Auction Room board: `/` focuses, type-ahead over all players, Escape clears. Selecting a player adds it to the comparison set.

**Two modes, driven by how many players are selected:**

**Single-player mode (1 selected)** — a full profile in stacked panels:

1. *Identity* — name, position chip, NFL team, age, years exp, bye week, depth-chart order, current injury status as a prominent badge.
2. *Market* — FFC ADP with high/low/stdev rendered as a range bar; FantasyPros ECR with min/max/std as a second range bar; FP tier; ownership %; Sleeper trending adds. Two range bars stacked make consensus-vs-disagreement legible at a glance.
3. *2025 Usage* — position-aware. WR/TE: targets, target share, air yards share, WOPR, RACR, receiving EPA, snap %. RB: carries, targets, rush EPA, snap %, snap % last 4. QB: attempts, passing EPA, CPOE, rushing yards. Label the panel "2025 actuals — not a 2026 projection."
4. *Team environment* — mean implied team total, playoff-weeks implied total, opponent difficulty, bye week, and `gamesWithLines` so a number built on 3 games doesn't read like one built on 17.
5. *Injury history* — 2025 report timeline: weeks appearing on the report, primary injury, practice participation pattern.
6. *Missing data* — explicit list of sources with no row for this player. A rookie should clearly read "no 2025 NFL usage — rookie," never a wall of zeroes.

**Compare mode (2–4 selected)** — one column per player, one row per metric, same section ordering as single mode. Highlight the best value per row with a subtle accent (respecting metric direction: lower is better for ADP and ECR, higher for target share). Column headers carry a remove button. Keep it a plain table with `overflow-x: auto`.

### 6.2 Interaction details

- Selection state lives in the URL query (`?players=4429795,4362628`) so a comparison is linkable and survives reload.
- Position filter and a "watch list only" toggle on the search, sourced from the existing `state.watchList`.
- No polling. This is a reference page, not a live board — fetch once on mount.
- Numbers format consistently: percentages to 1 decimal, EPA to 2, ADP to 1. Reuse the existing `money`/`mono` conventions where applicable.
- Every metric label gets a `title` tooltip with a one-line plain-English definition. WOPR and RACR are meaningless without one.

---

## 7. Tests (`tests/player-data.test.ts`)

Follow the existing vitest conventions in `tests/`.

1. **Crosswalk coverage** — given the real `data/players.json`, at least 95% of the top-200 skill players resolve to a `sleeper_id`, `gsis_id`, and `fantasypros_id`. Fail loudly below that.
2. **Vegas sign convention** — using completed 2025 games from `games.csv`, assert that `spread_line` correlates positively with `home_score - away_score`. This is the test that stops a silently inverted implied-total column.
3. **Implied totals** — for a fixture game, home + away implied totals equal `total_line` within a cent.
4. **Bye weeks** — every one of the 32 teams resolves to exactly one bye week in 2026, and it matches FFC's `bye` for a sample of players.
5. **Merge is total** — a player present in `players.json` but absent from every external source still produces a valid `PlayerProfile` with a populated `sourcesMissing` array and no thrown error.
6. **Name matching** — the FFC normalized-name matcher correctly handles `Ja'Marr Chase`, `James Cook III`, `Amon-Ra St. Brown`, and refuses to match ambiguous duplicates.
7. **FP extraction** — given a saved HTML fixture, the `ecrData` regex extracts 503 players. Commit the fixture so the test does not depend on the network.

All tests read from committed fixtures, not live URLs. CI and draft-morning runs must not require internet.

---

## 8. Build order

Ship in this sequence; each step is independently useful and independently verifiable.

1. `scripts/fetch-player-data.mjs` — crosswalk only. Print the coverage table. **Confirm ≥95% before continuing.**
2. Add Vegas/schedule ingest (byes + implied totals). Write the sign-convention test *before* trusting the output.
3. Add nflverse usage + snaps.
4. Add Sleeper (injury, depth chart, age, trending).
5. Add FFC ADP.
6. Add FantasyPros ECR. Fail-soft from the start.
7. `lib/player-data.ts` + types + the merge tests.
8. `app/api/player-data/route.ts`.
9. `/player-data` page — single-player mode first.
10. Compare mode.
11. Nav links from the Auction Room, Tier Editor, and Watch List headers.

**If time runs short, cut in this order:** compare mode → FantasyPros → Sleeper trending → snap counts. Keep crosswalk, Vegas/byes, usage, injury, and FFC ADP. Those five carry most of the value.

---

## 9. Acceptance criteria

- `npm run fetch:player-data` completes with every source reporting a row count, and survives any single source being unreachable.
- `npm test` and `npm run lint` pass.
- `/player-data` renders with the network disconnected, from cache alone.
- Searching "Gibbs" surfaces Jahmyr Gibbs with: sleeper_id 9221, gsis_id 00-0039139, 2025 usage present, DET bye week, DET mean implied total, FFC ADP ≈1.8, and an FP ECR.
- Selecting a 2026 rookie renders a complete page with an explicit "no 2025 NFL data" state and zero console errors.
- Comparing 4 players fits on screen with horizontal scroll confined to the table.
- No page in the app other than `/player-data` changes behavior.

---

## 10. Explicitly out of scope

- Any change to pricing, tiers, inflation, max-bid, or the Auction Room board.
- Any use of mock-draft socket data (see §0.1).
- Live socket parsing for draft day — separate work item, do not start it here.
- Season win totals, keyed odds APIs, FantasyPros auction values, paid data of any kind.
- Writing external data back into `data/players.json` or `data/draft-state.json`. `/player-data` is read-only with respect to existing app state.
