import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  InjuryProfile, MarketProfile, PlayerDataCaches, PlayerDataMeta, PlayerIdRecord,
  PlayerProfile, TeamEnvironment, Usage2025,
} from "./player-data-types";
import type { Player, Position } from "./types";

type CacheEnvelope<T> = { fetchedAt?: string } & T;
type VegasGame = {
  week: number; homeTeam: string; awayTeam: string;
  totalLine?: number; spreadLine?: number;
  homeScore?: number; awayScore?: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const SUFFIX_RE = /\b(jr|sr|ii|iii|iv)\b/g;

export function normalizePlayerName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueNamePositionMatch<T extends { name: string; position: string }>(
  candidates: T[], name: string, position: string,
): T | undefined {
  const normalized = normalizePlayerName(name);
  const normalizedPosition = position === "DEF" ? "DST" : position === "PK" ? "K" : position;
  const matches = candidates.filter((candidate) =>
    normalizePlayerName(candidate.name) === normalized && candidate.position === normalizedPosition,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function impliedTeamTotals(totalLine: number, spreadLine: number) {
  return {
    home: totalLine / 2 + spreadLine / 2,
    away: totalLine / 2 - spreadLine / 2,
  };
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return Number.NaN;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  xs.forEach((x, index) => {
    const dx = x - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  });
  return numerator / Math.sqrt(denominatorX * denominatorY);
}

export function deriveTeamEnvironments(games: VegasGame[], teams: string[]): Record<string, TeamEnvironment> {
  const result: Record<string, TeamEnvironment> = {};
  teams.forEach((team) => {
    const teamGames = games.filter((game) => game.homeTeam === team || game.awayTeam === team);
    const weeks = new Set(teamGames.map((game) => game.week));
    const byeWeeks = Array.from({ length: 18 }, (_, index) => index + 1).filter((week) => !weeks.has(week));
    const lines = teamGames.flatMap((game) => {
      if (game.totalLine === undefined || game.spreadLine === undefined) return [];
      const totals = impliedTeamTotals(game.totalLine, game.spreadLine);
      const home = game.homeTeam === team;
      return [{ week: game.week, own: home ? totals.home : totals.away, opponent: home ? totals.away : totals.home }];
    });
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
    result[team] = {
      nflTeam: team,
      byeWeek: byeWeeks.length === 1 ? byeWeeks[0] : undefined,
      impliedTotalMean: mean(lines.map((line) => line.own)),
      impliedTotalPlayoffs: mean(lines.filter((line) => line.week >= 15 && line.week <= 17).map((line) => line.own)),
      gamesWithLines: lines.length,
      opponentDifficultyMean: mean(lines.map((line) => line.opponent)),
    };
  });
  return result;
}

export function extractFantasyProsEcr(html: string): Record<string, unknown> {
  const marker = html.search(/var\s+ecrData\s*=\s*/);
  if (marker < 0) throw new Error("FantasyPros ecrData payload was not found");
  const source = html.slice(marker).replace(/^var\s+ecrData\s*=\s*/, "");
  const start = source.indexOf("{");
  if (start < 0) throw new Error("FantasyPros ecrData object was not found");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1)) as Record<string, unknown>;
    }
  }
  throw new Error("FantasyPros ecrData payload was incomplete");
}

const numberValue = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const stringValue = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

function buildInjury(sleeper?: Record<string, unknown>, history?: Record<string, unknown>): InjuryProfile | undefined {
  if (!sleeper && !history) return undefined;
  const injury: InjuryProfile = {
    sleeperStatus: stringValue(sleeper?.injuryStatus),
    bodyPart: stringValue(sleeper?.injuryBodyPart) ?? stringValue(history?.primaryInjury),
    injuryNotes: stringValue(sleeper?.injuryNotes),
    sleeperPracticeParticipation: stringValue(sleeper?.practiceParticipation),
    reportStatus: stringValue(history?.reportStatus),
    practiceStatus: stringValue(history?.practiceStatus),
    reportWeek: numberValue(history?.week),
    weeksOnReport2025: numberValue(history?.weeksOnReport2025),
  };
  return Object.values(injury).some((value) => value !== undefined) ? injury : undefined;
}

function buildMarket(sleeper?: Record<string, unknown>, ffc?: Record<string, unknown>, fp?: Record<string, unknown>): MarketProfile | undefined {
  if (!sleeper && !ffc && !fp) return undefined;
  const market: MarketProfile = {
    ffcAdp: numberValue(ffc?.adp), ffcAdpFormatted: stringValue(ffc?.adpFormatted),
    ffcStdev: numberValue(ffc?.stdev), ffcHigh: numberValue(ffc?.high), ffcLow: numberValue(ffc?.low),
    ffcTimesDrafted: numberValue(ffc?.timesDrafted),
    fpEcr: numberValue(fp?.rankEcr), fpPosRank: stringValue(fp?.posRank), fpTier: numberValue(fp?.tier),
    fpRankMin: numberValue(fp?.rankMin), fpRankMax: numberValue(fp?.rankMax), fpRankStd: numberValue(fp?.rankStd),
    fpOwnedAvg: numberValue(fp?.ownedAvg), sleeperTrendingAdds: numberValue(sleeper?.trendingAddCount),
  };
  return Object.values(market).some((value) => value !== undefined) ? market : undefined;
}

export function mergePlayerProfiles(players: Player[], caches: PlayerDataCaches): PlayerProfile[] {
  return players.map((player) => {
    const key = String(player.id);
    const ids: PlayerIdRecord = caches.ids?.[key] ?? { espnId: player.id };
    const sleeper = caches.sleeper?.[key];
    const usage = caches.usage?.[key] as Usage2025 | undefined;
    const history = caches.injuries?.[key];
    const ffc = caches.ffc?.[key];
    const fp = caches.fantasyPros?.[key];
    const sourcesMissing: string[] = [];
    if (!caches.ids?.[key]) sourcesMissing.push("ID crosswalk");
    if (!sleeper) sourcesMissing.push("Sleeper player data");
    if (!usage) sourcesMissing.push("2025 NFL usage");
    if (!history) sourcesMissing.push("2025 injury reports");
    if (!ffc) sourcesMissing.push("FFC ADP");
    if (!fp) sourcesMissing.push("FantasyPros ECR");
    if (!caches.teams?.[player.nflTeam]) sourcesMissing.push("Vegas team environment");
    return {
      id: player.id, name: player.name, position: player.position, nflTeam: player.nflTeam,
      espnKeeperValue: player.espnKeeperValue, overallRank: player.overallRank,
      positionRank: player.positionRank, tier: player.tier,
      fantasyIndexRank: player.fantasyIndexRank, projectedPoints: player.projectedPoints,
      ids,
      usage2025: usage,
      injury: buildInjury(sleeper, history),
      market: buildMarket(sleeper, ffc, fp),
      team: caches.teams?.[player.nflTeam],
      depthChartPosition: stringValue(sleeper?.depthChartPosition),
      depthChartOrder: numberValue(sleeper?.depthChartOrder),
      age: numberValue(sleeper?.age), yearsExp: numberValue(sleeper?.yearsExp),
      sourcesMissing,
    };
  });
}

async function readCache<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadPlayerDataCaches(): Promise<{ caches: PlayerDataCaches; meta: PlayerDataMeta }> {
  const [ids, sleeper, usage, injuries, vegas, ffc, fantasyPros, meta] = await Promise.all([
    readCache<CacheEnvelope<{ players: Record<string, PlayerIdRecord> }>>("player-ids.json"),
    readCache<CacheEnvelope<{ players: Record<string, Record<string, unknown>> }>>("sleeper-players.json"),
    readCache<CacheEnvelope<{ players: Record<string, Usage2025> }>>("nflverse-usage.json"),
    readCache<CacheEnvelope<{ players: Record<string, Record<string, unknown>> }>>("nflverse-injuries.json"),
    readCache<CacheEnvelope<{ teams: Record<string, TeamEnvironment> }>>("vegas-schedule.json"),
    readCache<CacheEnvelope<{ players: Record<string, Record<string, unknown>> }>>("ffc-adp.json"),
    readCache<CacheEnvelope<{ players: Record<string, Record<string, unknown>> }>>("fantasypros-ecr.json"),
    readCache<PlayerDataMeta>("player-data-meta.json"),
  ]);
  return {
    caches: {
      ids: ids?.players, sleeper: sleeper?.players, usage: usage?.players, injuries: injuries?.players,
      teams: vegas?.teams, ffc: ffc?.players, fantasyPros: fantasyPros?.players,
    },
    meta: meta ?? { version: 1, updatedAt: new Date(0).toISOString(), sources: [] },
  };
}

export function isSkillPosition(position: Position): boolean {
  return position === "QB" || position === "RB" || position === "WR" || position === "TE";
}
