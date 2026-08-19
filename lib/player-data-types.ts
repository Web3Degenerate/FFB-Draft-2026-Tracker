import type { Player, Position } from "./types";

export type PlayerExternalIds = {
  espnId: number;
  sleeperId?: string;
  gsisId?: string;
  pfrId?: string;
  fantasyProsId?: string;
};

export type Usage2025 = {
  games?: number;
  targets?: number;
  targetShare?: number;
  airYardsShare?: number;
  wopr?: number;
  racr?: number;
  receptions?: number;
  receivingYards?: number;
  receivingTds?: number;
  receivingAirYards?: number;
  receivingYardsAfterCatch?: number;
  receivingFirstDowns?: number;
  receivingEpa?: number;
  carries?: number;
  rushingYards?: number;
  rushingTds?: number;
  rushingFirstDowns?: number;
  rushingEpa?: number;
  attempts?: number;
  completions?: number;
  passingYards?: number;
  passingTds?: number;
  passingInterceptions?: number;
  passingEpa?: number;
  passingCpoe?: number;
  pacr?: number;
  snapsTotal?: number;
  snapPctMean?: number;
  snapPctLast4?: number;
};

export type InjuryProfile = {
  sleeperStatus?: string;
  bodyPart?: string;
  injuryNotes?: string;
  sleeperPracticeParticipation?: string;
  reportStatus?: string;
  practiceStatus?: string;
  reportWeek?: number;
  weeksOnReport2025?: number;
};

export type MarketProfile = {
  ffcAdp?: number;
  ffcAdpFormatted?: string;
  ffcStdev?: number;
  ffcHigh?: number;
  ffcLow?: number;
  ffcTimesDrafted?: number;
  fpEcr?: number;
  fpPosRank?: string;
  fpTier?: number;
  fpRankMin?: number;
  fpRankMax?: number;
  fpRankStd?: number;
  fpOwnedAvg?: number;
  sleeperTrendingAdds?: number;
};

export type TeamEnvironment = {
  nflTeam: string;
  byeWeek?: number;
  impliedTotalMean?: number;
  impliedTotalPlayoffs?: number;
  gamesWithLines?: number;
  opponentDifficultyMean?: number;
};

export type PlayerProfile = Pick<Player,
  "id" | "name" | "position" | "nflTeam" | "espnKeeperValue" | "overallRank" |
  "positionRank" | "tier" | "fantasyIndexRank" | "projectedPoints"
> & {
  ids: PlayerExternalIds;
  usage2025?: Usage2025;
  injury?: InjuryProfile;
  market?: MarketProfile;
  team?: TeamEnvironment;
  depthChartPosition?: string;
  depthChartOrder?: number;
  age?: number;
  yearsExp?: number;
  sourcesMissing: string[];
};

export type SourceFreshness = {
  source: string;
  status: "ok" | "stale" | "failed";
  fetchedAt?: string;
  rowsIn?: number;
  rowsMatched?: number;
  rowsUnmatched?: number;
  error?: string;
};

export type PlayerDataMeta = {
  version: 1;
  updatedAt: string;
  sources: SourceFreshness[];
  unmatched?: Record<string, string[]>;
};

export type PlayerDataPayload = {
  profiles: PlayerProfile[];
  watchList: number[];
  meta: PlayerDataMeta;
};

export type PlayerIdRecord = PlayerExternalIds & {
  name?: string;
  position?: Position;
  team?: string;
  dbSeason?: number;
};

export type PlayerDataCaches = {
  ids?: Record<string, PlayerIdRecord>;
  sleeper?: Record<string, Record<string, unknown>>;
  usage?: Record<string, Usage2025>;
  injuries?: Record<string, Record<string, unknown>>;
  teams?: Record<string, TeamEnvironment>;
  ffc?: Record<string, Record<string, unknown>>;
  fantasyPros?: Record<string, Record<string, unknown>>;
};
