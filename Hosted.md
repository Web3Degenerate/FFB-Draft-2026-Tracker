# Hosted Mirror Plan

**Status:** not implemented — parked for later.
**Written:** 2026-08-20. Draft night was Sat 2026-08-22, 20:30.

The goal: view the war room on a second laptop when a second monitor isn't
available, without disturbing the local app that the ESPN browser extension
feeds. Only one browser can be logged into the ESPN auction at a time, so the
extension is permanently pinned to the main laptop.

---

## 1. Architecture — local stays authoritative, remote is a read-only mirror

```
ESPN draft page ──(extension)──> laptop 1: local app ──> data/*.json   [authoritative]
                                          │
                                          └──(fire-and-forget push)──> Vercel + Upstash
                                                                              │
                                                              laptop 2 ───────┘  read-only
```

Laptop 1 behaves exactly as it does today: extension posts to `localhost:3001`,
state is written to `data/draft-state.json`. The push to the mirror is a side
effect that is allowed to fail silently.

### Why this shape

Every mutation in the app already funnels through a single function. `/api/action`,
`/api/relay`, and `/api/teams/sync` all call `mutateState()`, which ends in
`saveState()` (`lib/store.ts`). **One hook in `saveState` mirrors everything**,
with zero changes to any route handler.

### Why not the alternatives

| Approach | Verdict |
|---|---|
| Vercel + Supabase Postgres | Rejected. `lib/store.ts` is 100% `node:fs`; serverless means a full persistence rewrite. Modeling tables for what is a single JSON document is the most work for the least benefit. |
| Vercel + KV as the *primary* store | Rejected. Concurrent lambdas break the serialization guarantee of the in-process `mutationQueue`; needs compare-and-set plumbing. Also kills the `espn-socket-frames.ndjson` append archive. |
| Fly/Railway/Render + volume, 1 instance | Viable — `store.ts` works nearly unchanged. Rejected only on setup time (Docker, volumes). Revisit if the mirror ever needs to accept writes. |
| Tailscale / LAN to laptop 1 | Simplest of all, zero code. Chosen for draft night. Loses the laptop-1-dies failover, which is the mirror's real value. |

---

## 2. Implementation

### 2a. Local push hook — `lib/store.ts`

```ts
function pushMirror(state: DraftState) {
  if (!process.env.MIRROR_URL) return;
  void fetch(`${process.env.MIRROR_URL}/api/mirror`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MIRROR_SECRET}`,
    },
    body: JSON.stringify({ state }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
}
```

Call it at the end of `saveState()`, after the local `atomicWrite` resolves.

**The `void` + `.catch` + timeout is the entire safety story.** If Vercel is
down, slow, or the venue WiFi drops, laptop 1 must not stutter and must not
throw. Worst case the mirror goes stale until the next sale. Do not `await`
this, and do not let it into the response path.

### 2b. Remote — same repo, deployed with `MIRROR_MODE=1`

| File | Change |
|---|---|
| `app/api/mirror/route.ts` | **New.** POST only. Constant-time bearer check against `MIRROR_SECRET`, then write the JSON to Upstash. |
| `lib/store.ts` → `getState()` | Early return reading from Upstash when `MIRROR_MODE` is set. |
| `lib/store.ts` → `getPlayers()` | Same. |
| `app/api/action/route.ts` | Return 403 when `MIRROR_MODE` is set. |
| `app/api/relay/route.ts`, `app/api/relay/socket/route.ts` | Return 403 when `MIRROR_MODE` is set. |
| `app/api/state/route.ts` | Skip `syncRestPicks()` in mirror mode — it calls `mutateState()` and would attempt a write. |

The 403s matter: without them laptop 2 can fork the state, and its edits get
silently clobbered by the next push from laptop 1.

### 2c. Payload split

`data/players.json` is ~248KB and static during a draft.
`data/draft-state.json` is ~8KB and changes constantly.

Do **not** ship players on every mutation. Add two scripts:

- `npm run mirror:seed` — pushes players + state once, before the draft
- `npm run mirror:pull` — writes remote state back down into `data/draft-state.json` (see failover)

The `saveState` hot path then only ever ships the 8KB state.

### 2d. Storage

**Upstash Redis via the Vercel Marketplace.** One click from the Vercel
dashboard, auto-injects the connection env vars, and the REST API is plain
`fetch` — no dependency to add to a project that currently has only three.

Two keys: `ffb:state` and `ffb:players`.

---

## 3. Setup checklist

1. Create the Upstash Redis integration from the Vercel dashboard.
2. Deploy this repo to Vercel. Set `MIRROR_MODE=1` and `MIRROR_SECRET=<random>`.
3. On laptop 1, add `MIRROR_URL` and the same `MIRROR_SECRET` to `.env.local`.
4. Run `npm run mirror:seed`.
5. Open the Vercel URL on laptop 2. Confirm the watch list renders.
6. Record a test sale on laptop 1; confirm laptop 2 reflects it within ~2s.

**Estimated effort: 1–2 hours**, all additive. No local behaviour changes.

> ⚠️ **`data/*.json` is gitignored** (`data/*.json`, `data/*.ndjson`). Nothing in
> `data/` deploys. A fresh remote deploy with no seeding finds no state, falls
> back to `DEFAULT_CONFIG` in `lib/store.ts` — league `1041576461`, "ESPN Mock
> Auction", **not the real league** — and re-fetches players from ESPN. Step 4
> is not optional; it is what protects the watch list, keepers, and tier
> overrides.

---

## 4. Failover — laptop 1 dies mid-draft

The mirror doubles as a live backup:

1. Laptop 2 runs `npm run mirror:pull` to hydrate `data/draft-state.json`.
2. Start the app locally on laptop 2.
3. Log into ESPN there; the extension is already installed.

**Pre-stage tonight:** copy `/data` to laptop 2 and install the unpacked
extension. That reduces recovery to roughly 60 seconds. This prep is worth doing
regardless of which hosting path is chosen.

---

## 5. Latency

Laptop 2 lands **~0.8–1.6s behind** laptop 1.

| Hop | Cost |
|---|---|
| Extension → laptop 1 | ~1ms |
| Local file write | 1–5ms |
| Push → Vercel → Upstash | 30–80ms (off the response path, so invisible to laptop 1) |
| **Laptop 2 poll interval** | **0–1500ms (avg 750)** ← dominates |
| Poll round trip + Redis read | 40–120ms |

The poll interval is the whole story; the network is noise. If the second screen
feels laggy, drop the interval in the page components (currently 1500ms) — do
not reach for a faster host. SSE would be the real fix, and is possible on a
container host but not on Vercel functions.

---

## 6. Risks and gotchas

- **No auth anywhere in the app today.** `/api/action` accepts `reset` and
  `undo`. A public URL without the 403s and a real random `MIRROR_SECRET` means
  anyone with the link can wipe the draft mid-auction.
- **Extension is hard-locked to localhost.** `extension/background.js:12`
  rejects any URL that isn't `http://localhost` or `http://127.0.0.1`, and
  `manifest.json` `host_permissions` matches. This plan does not require
  changing either — the extension keeps talking to laptop 1 — but any future
  "point the extension at the cloud" variant needs both changed plus an
  unpacked-extension reload.
- **The mirror is not an independent instance.** If laptop 1's app is not
  running, the mirror freezes at the last push.
- **Cold starts** on Vercel can add 200–800ms to the first poll after idle.
  Irrelevant during an active draft, noticeable when first opening laptop 2.
- **Venue WiFi.** A hiccup freezes the mirror but leaves laptop 1 fully
  functional. This is the main argument for local-authoritative over
  cloud-authoritative.

---

## 7. Open question

Laptop 2 was scoped as a **read-only second screen**. If it ever needs to record
sales, this design does not cover it — that requires either promoting the mirror
to authoritative (container host + volume, one instance) or a merge strategy.
Read-only is what keeps the whole thing to a 1–2 hour build.
