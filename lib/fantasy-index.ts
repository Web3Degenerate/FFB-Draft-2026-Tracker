import type { Player, Position } from "./types";

export const FANTASY_INDEX_RANKINGS_URL = "https://fantasyindex.com/members/rankings/1425/68208";

export type FantasyIndexPosition = "QB" | "RB" | "WR" | "TE" | "PK" | "ST";

export type FantasyIndexRanking = {
  name: string;
  position: FantasyIndexPosition;
  team?: string;
  positionalRank: number;
  projectedPoints: number;
};

export type FantasyIndexSnapshot = {
  sourceUrl: string;
  retrievedAt: string;
  projectionsUpdatedAt?: string;
  rankings: FantasyIndexRanking[];
};

const FI_POSITION_MAP: Record<FantasyIndexPosition, Position> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  PK: "K",
  ST: "DST",
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bd\s*\/\s*st\b/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relaxedName(value: string): string {
  return normalizeName(value).replace(/\s+(jr|sr|ii|iii|iv)$/g, "");
}

const rankingKey = (position: Position, name: string) => `${position}:${normalizeName(name)}`;
const relaxedRankingKey = (position: Position, name: string) => `${position}:${relaxedName(name)}`;
const teamKey = (position: Position, team: string) => `${position}:${team.trim().toUpperCase()}`;

export function mergeFantasyIndexRankings(players: Player[], snapshot: FantasyIndexSnapshot | null): Player[] {
  if (!snapshot?.rankings?.length) return players;

  const exact = new Map<string, FantasyIndexRanking>();
  const relaxed = new Map<string, FantasyIndexRanking[]>();
  const byTeam = new Map<string, FantasyIndexRanking>();

  snapshot.rankings.forEach((ranking) => {
    const position = FI_POSITION_MAP[ranking.position];
    if (!position || !Number.isFinite(ranking.positionalRank) || !Number.isFinite(ranking.projectedPoints)) return;
    exact.set(rankingKey(position, ranking.name), ranking);
    const looseKey = relaxedRankingKey(position, ranking.name);
    relaxed.set(looseKey, [...(relaxed.get(looseKey) ?? []), ranking]);
    if (ranking.team) byTeam.set(teamKey(position, ranking.team), ranking);
  });

  return players.map((player) => {
    const exactMatch = exact.get(rankingKey(player.position, player.name));
    const teamMatch = player.position === "DST" ? byTeam.get(teamKey(player.position, player.nflTeam)) : undefined;
    const relaxedMatches = relaxed.get(relaxedRankingKey(player.position, player.name)) ?? [];
    const ranking = exactMatch ?? teamMatch ?? (relaxedMatches.length === 1 ? relaxedMatches[0] : undefined);
    if (!ranking) return player;
    return {
      ...player,
      projectedPoints: ranking.projectedPoints,
      projectionSource: "fantasy-index",
      fantasyIndexRank: ranking.positionalRank,
    };
  });
}
