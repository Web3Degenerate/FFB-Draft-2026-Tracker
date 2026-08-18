import { POSITIONS, type Position } from "@/lib/types";

export const SCHEDULE_POSITIONS: readonly Position[] = POSITIONS.filter((position): position is Position => position !== "ALL");
export type SchedulePosition = Position;

export const FANTASY_SEASON_WINDOW = { startWeek: 1, endWeek: 17 } as const;
export const PLAYOFF_WINDOW = { startWeek: 15, endWeek: 17 } as const;
export const HOME_FIELD_RANK_ADJUSTMENT = 0.5;

export type ScheduleWindow = { startWeek: number; endWeek: number };

export type ScheduleGame = {
  week: number;
  opponent: string;
  homeAway: "home" | "away";
  neutralSite: boolean;
  date: string;
};

export type ScheduleTeam = {
  id: number;
  abbreviation: string;
  displayName: string;
  shortName: string;
  color: string;
  logo: string;
  games: ScheduleGame[];
};

export type MatchupRatingValue = { grade: number; rank: number };
export type MatchupRating = MatchupRatingValue & {
  byWeek?: Partial<Record<number, MatchupRatingValue>>;
};

export type ScheduleSnapshot = {
  season: number;
  generatedAt: string;
  sources: {
    schedules: string;
    officialSchedule: string;
    matchupRatings: Record<SchedulePosition, string>;
  };
  methodology: Record<SchedulePosition, string>;
  teams: ScheduleTeam[];
  ratings: Record<SchedulePosition, Record<string, MatchupRating>>;
};

export type LeagueModelOpponent = {
  rank: number;
  score: number;
  baselineRank: number;
  [metric: string]: number;
};

export type ScheduleLeagueModel = {
  season: number;
  generatedAt: string;
  methodology: Partial<Record<SchedulePosition, string>>;
  positions: Partial<Record<SchedulePosition, Record<string, LeagueModelOpponent>>>;
};

export type ResolvedMatchup = MatchupRatingValue & {
  baselineRank: number;
  modelRank: number;
  locationAdjustment: number;
  effectiveRank: number;
  usesLeagueModel: boolean;
};

export type ScheduleTeamSummary = {
  team: ScheduleTeam;
  averageRank: number | null;
  strengthScore: number | null;
  playoffStrength: number | null;
  favorableWeeks: number;
  toughWeeks: number;
  gamesRated: number;
  byeWeek: number | null;
};

export function normalizeNflAbbreviation(value: string): string {
  return ({ JAC: "JAX", LA: "LAR", WSH: "WAS" } as Record<string, string>)[value] ?? value;
}

export function matchupLabel(game: ScheduleGame | undefined): string {
  if (!game) return "BYE";
  return `${game.homeAway === "home" ? "vs" : "@"} ${game.opponent}`;
}

export function ratingForGame(snapshot: ScheduleSnapshot, position: SchedulePosition, game: ScheduleGame | undefined): MatchupRatingValue | null {
  if (!game) return null;
  const rating = snapshot.ratings[position]?.[game.opponent];
  if (!rating) return null;
  return rating.byWeek?.[game.week] ?? { grade: rating.grade, rank: rating.rank };
}

export function locationRankAdjustment(game: ScheduleGame): number {
  if (game.neutralSite) return 0;
  return game.homeAway === "home" ? -HOME_FIELD_RANK_ADJUSTMENT : HOME_FIELD_RANK_ADJUSTMENT;
}

export function resolvedMatchupForGame(
  snapshot: ScheduleSnapshot,
  leagueModel: ScheduleLeagueModel | null,
  position: SchedulePosition,
  game: ScheduleGame | undefined,
): ResolvedMatchup | null {
  const rating = ratingForGame(snapshot, position, game);
  if (!game || !rating) return null;
  const model = leagueModel?.positions[position]?.[game.opponent];
  const modelRank = model?.rank ?? rating.rank;
  const adjustment = locationRankAdjustment(game);
  return {
    ...rating,
    baselineRank: rating.rank,
    modelRank,
    locationAdjustment: adjustment,
    effectiveRank: Math.max(1, Math.min(32, modelRank + adjustment)),
    usesLeagueModel: Boolean(model),
  };
}

export function strengthScoreFromAverageRank(averageRank: number | null): number | null {
  if (averageRank === null || !Number.isFinite(averageRank)) return null;
  return Math.max(0, Math.min(100, 100 - ((averageRank - 1) / 31) * 100));
}

export function rankThresholds(snapshot: ScheduleSnapshot, position: SchedulePosition): { favorable: number; tough: number } {
  const ranks = Object.values(snapshot.ratings[position]).map((rating) => rating.rank).sort((a, b) => a - b);
  if (!ranks.length) return { favorable: 0, tough: Number.POSITIVE_INFINITY };
  return {
    favorable: ranks[Math.ceil(ranks.length / 3) - 1],
    tough: ranks[Math.floor((ranks.length * 2) / 3)],
  };
}

export function byeWeekForTeam(team: ScheduleTeam, maximumWeek = 18): number | null {
  const played = new Set(team.games.map((game) => game.week));
  for (let week = 1; week <= maximumWeek; week += 1) {
    if (!played.has(week)) return week;
  }
  return null;
}

function windowSummary(
  snapshot: ScheduleSnapshot,
  team: ScheduleTeam,
  position: SchedulePosition,
  window: ScheduleWindow,
  leagueModel: ScheduleLeagueModel | null,
) {
  const thresholds = rankThresholds(snapshot, position);
  const ranks = team.games
    .filter((game) => game.week >= window.startWeek && game.week <= window.endWeek)
    .flatMap((game) => resolvedMatchupForGame(snapshot, leagueModel, position, game)?.effectiveRank ?? []);
  const averageRank = ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null;
  return {
    averageRank,
    strengthScore: strengthScoreFromAverageRank(averageRank),
    favorableWeeks: ranks.filter((rank) => rank <= thresholds.favorable).length,
    toughWeeks: ranks.filter((rank) => rank >= thresholds.tough).length,
    gamesRated: ranks.length,
  };
}

export function summarizeSchedule(
  snapshot: ScheduleSnapshot,
  team: ScheduleTeam,
  position: SchedulePosition,
  window: ScheduleWindow = FANTASY_SEASON_WINDOW,
  leagueModel: ScheduleLeagueModel | null = null,
): ScheduleTeamSummary {
  const selected = windowSummary(snapshot, team, position, window, leagueModel);
  const playoffs = windowSummary(snapshot, team, position, PLAYOFF_WINDOW, leagueModel);
  return {
    team,
    ...selected,
    playoffStrength: playoffs.strengthScore,
    byeWeek: byeWeekForTeam(team, Math.max(...snapshot.teams.flatMap((item) => item.games.map((game) => game.week)))),
  };
}

export function rankSchedules(
  snapshot: ScheduleSnapshot,
  teams: ScheduleTeam[],
  position: SchedulePosition,
  window: ScheduleWindow = FANTASY_SEASON_WINDOW,
  leagueModel: ScheduleLeagueModel | null = null,
): ScheduleTeamSummary[] {
  return teams.map((team) => summarizeSchedule(snapshot, team, position, window, leagueModel)).sort((a, b) =>
    (a.averageRank ?? Number.POSITIVE_INFINITY) - (b.averageRank ?? Number.POSITIVE_INFINITY)
    || b.favorableWeeks - a.favorableWeeks
    || a.toughWeeks - b.toughWeeks
    || a.team.displayName.localeCompare(b.team.displayName),
  );
}

export function gradeDistributionWarnings(snapshot: ScheduleSnapshot, maximumBucketShare = 0.4): SchedulePosition[] {
  return SCHEDULE_POSITIONS.filter((position) => {
    const ratings = Object.values(snapshot.ratings[position]);
    const counts = new Map<number, number>();
    ratings.forEach((rating) => counts.set(rating.grade, (counts.get(rating.grade) ?? 0) + 1));
    return Math.max(...counts.values()) / ratings.length > maximumBucketShare;
  });
}
