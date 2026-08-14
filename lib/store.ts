import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftConfig, DraftState, Player } from "./types";
import { fetchLeague, fetchPlayers } from "./espn";
import { carryTeamAliases } from "./teams";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "draft-state.json");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");
const PLAYER_CACHE_VERSION = 2;
type PlayerCache = { version: number; leagueId: number; seasonId: number; players: Player[] };
let mutationQueue: Promise<unknown> = Promise.resolve();

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

export async function getState(): Promise<DraftState> {
  const existing = await readJson<DraftState>(STATE_PATH);
  if (existing) return {
    ...existing,
    teams: existing.teams.map((team) => ({ ...team, alias: team.alias ?? "" })),
    keepers: existing.keepers ?? [],
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
    relay: { connected: false, lastSeenAt: null, message: "Manual mode ready", source: null },
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
    if (existing?.version === PLAYER_CACHE_VERSION && existing.leagueId === state.config.leagueId && existing.seasonId === state.config.seasonId && existing.players.length) return existing.players;
  }
  const state = await getState();
  const players = await fetchPlayers(state.config);
  await atomicWrite(PLAYERS_PATH, { version: PLAYER_CACHE_VERSION, leagueId: state.config.leagueId, seasonId: state.config.seasonId, players } satisfies PlayerCache);
  return players;
}

export async function replaceLeague(config: DraftConfig): Promise<{ state: DraftState; players: Player[] }> {
  const current = await getState();
  const league = await fetchLeague(config);
  const players = await fetchPlayers({ ...config, leagueName: league.name, budget: league.budget, rosterSize: league.rosterSize });
  const teamIds = new Set(league.teams.map((team) => team.id));
  const playerIds = new Set(players.map((player) => player.id));
  const state: DraftState = {
    config: { ...config, leagueName: league.name, budget: league.budget, rosterSize: league.rosterSize },
    teams: carryTeamAliases(current.teams, league.teams),
    sales: [],
    keepers: current.keepers.filter((keeper) => teamIds.has(keeper.teamId) && playerIds.has(keeper.playerId)),
    nomination: null,
    tierOverrides: Object.fromEntries(Object.entries(current.tierOverrides).filter(([playerId]) => playerIds.has(Number(playerId)))),
    relay: { connected: false, lastSeenAt: null, message: "Manual mode ready", source: null },
    updatedAt: new Date().toISOString(),
  };
  await atomicWrite(STATE_PATH, state);
  await atomicWrite(PLAYERS_PATH, { version: PLAYER_CACHE_VERSION, leagueId: state.config.leagueId, seasonId: state.config.seasonId, players } satisfies PlayerCache);
  return { state, players };
}
