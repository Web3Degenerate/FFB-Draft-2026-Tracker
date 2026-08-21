# Project Change Log

## 2026-08-21

### Draft history page

- Added `/draft-history` with 2025, 2024, and 2023 season tabs.
- Added independently sortable keeper and auction-result tables for every season.
- Extracted the workbook values from `FFB_Auction_Draft_Analysis_2023_2025_sortable_keepers.xlsx` into a tracked, browser-ready JSON snapshot.
- Added accessible sort state, season summaries, ESPN source links, responsive styling, and a navigation link from the Auction Room.
- Added unit coverage for numeric and natural-text sorting.
- Added per-column filters to both Draft History tables, including a position dropdown and clear-filter controls.
- Ignored generated TypeScript build-info files so local verification does not dirty the repository.

### Repository transfer notes

- Safe to push: application source, tests, the derived draft-history JSON, and `/outputs` artifacts.
- Local-only by policy: top-level `/data/*.json`, `/data/*.ndjson`, and `/data/*.zip` files because they include runtime state, socket captures, caches, or licensed subscriber exports.
