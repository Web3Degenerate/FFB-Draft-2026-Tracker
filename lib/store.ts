import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftConfig, DraftState, Player } from "./types";
import { fetchLeague, fetchPlayers } from "./espn";
import { mergeFantasyIndexRankings, type FantasyIndexSnapshot } from "./fantasy-index";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "draft-state.json");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");
const FANTASY_INDEX_PATH = path.join(DATA_DIR, "fantasy-index-rankings.json");
const ESPN_AUCTION_VALUES_PATH = path.join(DATA_DIR, "espn-auction-values.json");
const PLAYER_CACHE_VERSION = 3;
type CachedPlayer = Omit<Player, "espnKeeperValue"> & { espnKeeperValue?: number; espnValue?: number };
type PlayerCache = { version: number; leagueId: number; seasonId: number; players: CachedPlayer[] };
type EspnAuctionValuesSnapshot = {
  version: 1;
  leagueId: number;
  seasonId: number;
  updatedAt: string;
  values: Array<{ playerId: number; playerName: string; amount: number }>;
};
let mutationQueue: Promise<unknown> = Promise.resolve();
let auctionValueQueue: Promise<unknown> = Promise.resolve();

export const DEFAULT_CONFIG: DraftConfig = {
  leagueId: 1041576461,
  seasonId: 2026,
  myTeamId: 15,
  budget: 200,
  rosterSize: 14,
  leagueName: "ESPN Mock Auction",
};

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function withFantasyIndex(players: Player[]): Promise<Player[]> {
  return mergeFantasyIndexRankings(players, await readJson<FantasyIndexSnapshot>(FANTASY_INDEX_PATH));
}

function upgradeCachedPlayers(players: CachedPlayer[]): Player[] {
  return players.map(({ espnValue, ...player }) => ({
    ...player,
    espnKeeperValue: Math.max(1, Math.round(player.espnKeeperValue ?? espnValue ?? 1)),
  }));
}

async function withEspnAuctionValues(players: Player[], config: DraftConfig): Promise<Player[]> {
  const snapshot = await readJson<EspnAuctionValuesSnapshot>(ESPN_AUCTION_VALUES_PATH);
  if (!snapshot || snapshot.leagueId !== config.leagueId || snapshot.seasonId !== config.seasonId) return players;
  const values = new Map(snapshot.values.map((value) => [value.playerId, value.amount]));
  return players.map((player) => {
    const espnAuctionValue = values.get(player.id);
    return espnAuctionValue === undefined ? player : { ...player, espnAuctionValue };
  });
}

async function withPlayerSources(players: Player[], config: DraftConfig): Promise<Player[]> {
  return withFantasyIndex(await withEspnAuctionValues(players, config));
}

export async function getState(): Promise<DraftState> {
  const existing = await readJson<DraftState>(STATE_PATH);
  if (existing) return {
    ...existing,
    teams: existing.teams.map((team) => ({ ...team, alias: team.alias ?? "" })),
    keepers: existing.keepers ?? [],
    tierOrders: existing.tierOrders ?? {},
    watchList: existing.watchList ?? [],
    watchListOrders: existing.watchListOrders ?? {},
    relay: { ...existing.relay, draftLeagueId: existing.relay.draftLeagueId ?? null, draftTeamOrder: existing.relay.draftTeamOrder ?? [], draftTeamAliases: existing.relay.draftTeamAliases ?? {}, draftTeamNames: existing.relay.draftTeamNames ?? {} },
  };
  const league = await fetchLeague(DEFAULT_CONFIG);
  const now = new Date().toISOString();
  const state: DraftState = {
    config: { ...DEFAULT_CONFIG, leagueName: league.name, budget: league.budget, rosterSize: league.rosterSize },
    teams: league.teams.map((team) => ({ ...team, alias: "" })),
    sales: [],
    keepers: [],
    nomination: null,
    tierOverrides: {},
    tierOrders: {},
    watchList: [],
    watchListOrders: {},
    relay: { connected: false, lastSeenAt: null, message: "Manual mode ready", source: null, draftLeagueId: null, draftTeamOrder: [], draftTeamAliases: {}, draftTeamNames: {} },
    updatedAt: now,
  };
  await atomicWrite(STATE_PATH, state);
  return state;
}

export async function saveState(state: DraftState): Promise<DraftState> {
  const updated = { ...state, updatedAt: new Date().toISOString() };
  await atomicWrite(STATE_PATH, updated);
  return updated;
}

export function mutateState(mutator: (state: DraftState) => void | Promise<void>): Promise<DraftState> {
  const operation = mutationQueue.then(async () => {
    const state = await getState();
    await mutator(state);
    return saveState(state);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function getPlayers(force = false): Promise<Player[]> {
  if (!force) {
    const existing = await readJson<PlayerCache>(PLAYERS_PATH);
    const state = await getState();
    if (existing && existing.leagueId === state.config.leagueId && existing.seasonId === state.config.seasonId && existing.players.length) {
      const players = upgradeCachedPlayers(existing.players);
      if (existing.version !== PLAYER_CACHE_VERSION) {
        await atomicWrite(PLAYERS_PATH, { version: PLAYER_CACHE_VERSION, leagueId: state.config.leagueId, seasonId: state.config.seasonId, players } satisfies PlayerCache);
      }
      return withPlayerSources(players, state.config);
    }
  }
  const state = await getState();
  const players = await fetchPlayers(state.config);
  await atomicWrite(PLAYERS_PATH, { version: PLAYER_CACHE_VERSION, leagueId: state.config.leagueId, seasonId: state.config.seasonId, players } satisfies PlayerCache);
  return withPlayerSources(players, state.config);
}

/** Read-only draft-day research input. This deliberately never falls back to ESPN. */
export async function getLocalPlayerDataBase(): Promise<{ players: Player[]; watchList: number[] }> {
  const [state, existing] = await Promise.all([
    readJson<DraftState>(STATE_PATH),
    readJson<PlayerCache>(PLAYERS_PATH),
  ]);
  if (!state) throw new Error("Local draft state is missing. Open the Auction Room once before using Player Data.");
  if (!existing?.players.length) throw new Error("Local player cache is missing. Refresh the Auction Room before using Player Data.");
  if (existing.leagueId !== state.config.leagueId || existing.seasonId !== state.config.seasonId) {
    throw new Error("Local player cache does not match the active league and season.");
  }
  return {
    players: await withPlayerSources(upgradeCachedPlayers(existing.players), state.config),
    watchList: state.watchList ?? [],
  };
}

export function saveEspnAuctionValues(config: DraftConfig, incoming: Array<{ playerId: number; playerName: string; amount: number }>): Promise<number> {
  const operation = auctionValueQueue.then(async () => {
    const current = await readJson<EspnAuctionValuesSnapshot>(ESPN_AUCTION_VALUES_PATH);
    const sameLeague = current?.leagueId === config.leagueId && current.seasonId === config.seasonId;
    const values = new Map<number, { playerId: number; playerName: string; amount: number }>(
      (sameLeague ? current.values : []).map((value) => [value.playerId, value]),
    );
    let changed = 0;
    incoming.forEach((value) => {
      const prior = values.get(value.playerId);
      if (!prior || prior.amount !== value.amount || prior.playerName !== value.playerName) changed += 1;
      values.set(value.playerId, value);
    });
    if (changed > 0 || !sameLeague) {
      await atomicWrite(ESPN_AUCTION_VALUES_PATH, {
        version: 1,
        leagueId: config.leagueId,
        seasonId: config.seasonId,
        updatedAt: new Date().toISOString(),
        values: [...values.values()].sort((a, b) => a.playerName.localeCompare(b.playerName)),
      } satisfies EspnAuctionValuesSnapshot);
    }
    return changed;
  });
  auctionValueQueue = operation.catch(() => undefined);
  return operation;
}

export async function replaceLeague(config: DraftConfig): Promise<{ state: DraftState; players: Player[] }> {
  const current = await getState();
  const league = await fetchLeague(config);
  const players = await fetchPlayers({ ...config, leagueName: league.name, budget: league.budget, rosterSize: league.rosterSize });
  const playerIds = new Set(players.map((player) => player.id));
  const state: DraftState = {
    config: { ...config, leagueName: league.name, budget: league.budget, rosterSize: league.rosterSize },
    teams: league.teams.map((team) => ({ ...team, alias: "" })),
    sales: [],
    keepers: [],
    nomination: null,
    tierOverrides: Object.fromEntries(Object.entries(current.tierOverrides).filter(([playerId]) => playerIds.has(Number(playerId)))),
    tierOrders: Object.fromEntries(Object.entries(current.tierOrders ?? {}).map(([tier, orderedIds]) => [tier, orderedIds.filter((playerId) => playerIds.has(playerId))])),
    watchList: (current.watchList ?? []).filter((playerId) => playerIds.has(playerId)),
    watchListOrders: Object.fromEntries(Object.entries(current.watchListOrders ?? {}).map(([position, orderedIds]) => [position, orderedIds.filter((playerId) => playerIds.has(playerId))])),
    relay: { connected: false, lastSeenAt: null, message: "Manual mode ready", source: null, draftLeagueId: null, draftTeamOrder: [], draftTeamAliases: {}, draftTeamNames: {} },
    updatedAt: new Date().toISOString(),
  };
  await atomicWrite(STATE_PATH, state);
  await atomicWrite(PLAYERS_PATH, { version: PLAYER_CACHE_VERSION, leagueId: state.config.leagueId, seasonId: state.config.seasonId, players } satisfies PlayerCache);
  return { state, players: await withPlayerSources(players, state.config) };
}
