export const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"] as const;
export type Position = Exclude<(typeof POSITIONS)[number], "ALL">;

export type Player = {
  id: number;
  name: string;
  position: Position;
  nflTeam: string;
  projectedPoints: number;
  projectionSource?: "espn" | "fantasy-index";
  fantasyIndexRank?: number;
  espnKeeperValue: number;
  espnAuctionValue?: number;
  overallRank: number;
  positionRank: number;
  tier: string;
};

export type LeagueTeam = {
  id: number;
  name: string;
  abbreviation: string;
  alias?: string;
};

export type SaleSource = "manual" | "espn-relay" | "espn-rest";

export type Sale = {
  id: string;
  playerId: number;
  playerName: string;
  position: Position;
  teamId: number;
  amount: number;
  source: SaleSource;
  createdAt: string;
};

export type Keeper = {
  id: string;
  playerId: number;
  playerName: string;
  position: Position;
  teamId: number;
  amount: number;
  createdAt: string;
};

export type Nomination = {
  playerId: number;
  askingBid?: number;
  nominatingTeamId?: number;
  leadingTeamId?: number;
  source: "manual" | "espn-relay";
} | null;

export type DraftConfig = {
  leagueId: number;
  seasonId: number;
  myTeamId: number;
  budget: number;
  rosterSize: number;
  leagueName: string;
};

export type RelayStatus = {
  connected: boolean;
  lastSeenAt: string | null;
  message: string;
  source?: "extension" | "pasted" | null;
  draftLeagueId?: number | null;
  draftTeamOrder?: number[];
  draftTeamAliases?: Record<string, number>;
  draftTeamNames?: Record<string, string>;
  draftTeamBudgets?: Record<string, number>;
};

export type DraftState = {
  config: DraftConfig;
  teams: LeagueTeam[];
  sales: Sale[];
  keepers: Keeper[];
  nomination: Nomination;
  tierOverrides: Record<string, string>;
  tierOrders: Record<string, number[]>;
  watchList: number[];
  watchListOrders: Partial<Record<Position, number[]>>;
  relay: RelayStatus;
  updatedAt: string;
};

export type TeamSnapshot = LeagueTeam & {
  startingBudget: number;
  spent: number;
  budgetLeft: number;
  rosterCount: number;
  keeperCount: number;
  spotsLeft: number;
  maxBid: number;
  counts: Record<Position, number>;
  needs: Position[];
};

export type TierSnapshot = {
  tier: string;
  position: Position;
  playersLeft: number;
  teamsNeeding: number;
  teamsCanAfford: number;
  benchmark: number;
  pressure: "CALM" | "WATCH" | "TIGHT" | "LAST CALL";
};

export type DashboardPayload = {
  state: DraftState;
  players: Player[];
};
