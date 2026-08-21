# Project Change Log

## 2026-08-21

### Draft history page

- Added `/draft-history` with 2025, 2024, and 2023 season tabs.
- Added independently sortable keeper and auction-result tables for every season.
- Extracted the workbook values from `FFB_Auction_Draft_Analysis_2023_2025_sortable_keepers.xlsx` into a tracked, browser-ready JSON snapshot.
- Added accessible sort state, season summaries, ESPN source links, responsive styling, and a navigation link from the Auction Room.
- Added unit coverage for numeric and natural-text sorting.
- Added per-column filters to both Draft History tables, including a position dropdown and clear-filter controls.
- Expanded the Auction Results table viewport to show substantially more purchases before internal scrolling.
- Ignored generated TypeScript build-info files so local verification does not dirty the repository.

### Watch List live budget calculator

- Added a compact 14-slot roster calculator between the live team strip and the Positional Watch List.
- Wired drafted players and keepers to the live roster state so their names and paid amounts replace planning entries and become read-only automatically.
- Added editable player notes and whole-dollar allocations for open slots, with a $1 default reserve for every unfilled roster spot.
- Added allocated, remaining, and red over-budget summaries against the league budget, plus persistent saved plans.
- Added server-side validation and unit coverage for locked values, default reserves, over-budget math, and planner input validation.

### Repository transfer notes

- Safe to push: application source, tests, the derived draft-history JSON, and `/outputs` artifacts.
- Local-only by policy: top-level `/data/*.json`, `/data/*.ndjson`, and `/data/*.zip` files because they include runtime state, socket captures, caches, or licensed subscriber exports.
