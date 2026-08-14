# Codex Auction Room

A local-first fantasy football auction assistant for the 2026 UTH Wink league. It tracks every sale, each team’s remaining budget and legal max bid, roster needs, market inflation, and the supply-versus-demand pressure inside each position tier.

## Pre-draft setup

- Open `/keepers` from the **Keepers** header link to assign zero, one, or two keepers to every team and record each keeper price. Keeper prices and roster slots are included in every budget, max-bid, and position-need calculation, and kept players are removed from the auction pool.
- The Keeper Manager also stores an optional personal nickname for every team. Nicknames are keyed to ESPN team IDs, so they survive team-name changes, league refreshes, and Auction Room resets.
- Open `/tiers` from **Tier editor** to override any player’s calculated position tier or restore the calculated default.
- The Auction Room reset clears completed auction sales and the active nomination while preserving keepers, keeper prices, and tier overrides.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first load pulls league teams and the current ESPN player universe, then caches them in `data/`. Draft state is saved after every action.

When moving to another computer, clone the repository and run `npm ci`. To preserve pre-draft keepers, team nicknames, tier overrides, and the cached player pool, privately copy `draft-state.json` and `players.json` into the new checkout's `data/` directory before starting the app. Runtime data and ESPN socket captures are intentionally excluded from GitHub.

The default configuration points to the active 2026 mock auction (`leagueId=1041576461`, `teamId=15`, 12 teams, $200, 14 roster spots). Change `DEFAULT_CONFIG` in `lib/store.ts` when moving to the live league, or use the planned Settings screen.

## Chrome extension (recommended)

The unpacked Chrome extension starts the read-only ESPN relay automatically, survives page reloads, and removes the need to open Developer Tools:

1. Start Auction Room and note its URL (this computer currently uses `http://localhost:3001`).
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the project’s `extension/` directory.
4. Open the extension’s **Settings**, enter the Auction Room URL, and click **Test connection**.
5. Open an ESPN auction draft. The extension badge turns green and reads `ON` when Auction Room is receiving snapshots. It also refreshes ESPN team names when it connects and once per minute while the room remains open.

An amber `!` means the local app is unreachable. Click the extension icon for the last connection message or any sales that need review. The extension is read-only: it only runs on ESPN’s football draft page, cannot place bids, and can only reach localhost plus ESPN’s read-only league API to retrieve current team names. It does not read or store cookie values or credentials.

The DOM snapshot remains the source of truth. In parallel, the extension records the draft socket’s incoming and outgoing frames as newline-delimited JSON in `data/espn-socket-frames.ndjson`. Connection URLs are stored without query strings and ESPN `TOKEN` frames are redacted so session tokens are not archived. Socket frames are not interpreted until a real capture can be reviewed.

## ESPN live relay fallback

ESPN’s live practice room currently returns an empty `draftDetail.picks` array through its REST API. The app therefore includes a small read-only DOM relay as an optional live bridge:

1. Open the running app and click the **Manual mode** status pill.
2. Click **Copy relay**. This copies the complete observer with the app’s actual port embedded; ESPN does not need to fetch or evaluate another script from localhost.
3. Open the signed-in ESPN auction room and its Developer Console, then paste the copied relay. A green `Codex Auction Relay ... connected` message confirms that it started. Version 0.4 sends a complete visible-sale snapshot on every pulse so ESPN UI transitions cannot silently stall the tracker.

The relay reads the league identifiers from the ESPN draft URL, watches completed-sale messages and the active nomination, and excludes the currently bidding player from completed sales. It sends only league, player, winning team, and bid data to the local app. It never reads or stores ESPN credentials and makes no changes on ESPN. Manual entry remains available at all times.

## Architecture and deployment path

- Next.js/React keeps the app ready for Vercel.
- `lib/store.ts` is the persistence boundary. It uses atomic local JSON writes today and can be replaced by a Supabase implementation later.
- `lib/espn.ts` owns ESPN’s unofficial API calls.
- `lib/auction.ts` contains budget, max-bid, roster-demand, inflation, and scarcity calculations.
- Tier assignment uses ESPN PPR auction value cliffs with position-specific caps; RB1 can contain at most 11 players. Per-player tier overrides are already supported by the API.

No usernames, passwords, ESPN cookies, or private credentials are written to this project.

## Checks

```bash
npm test
npm run lint
npm run build
```
