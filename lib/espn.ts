import type { DraftConfig, LeagueTeam, Player, Position } from "./types";
import { assignTiers } from "./tiers";

const POSITION_MAP: Record<number, Position | undefined> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };
const NFL_TEAMS: Record<number, string> = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

type EspnPlayer = {
  id: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  draftRanksByRankType?: Record<string, { rank?: number; auctionValue?: number }>;
  stats?: Array<{ id?: string; seasonId?: number; statSourceId?: number; statSplitTypeId?: number; appliedTotal?: number }>;
};

type EspnPlayerEntry = { player?: EspnPlayer } | EspnPlayer;

function playerFromEntry(entry: EspnPlayerEntry): EspnPlayer {
  return "player" in entry && entry.player ? entry.player : entry as EspnPlayer;
}

async function espnJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${new URL(url).pathname}`);
  return response.json() as Promise<T>;
}

export async function fetchLeague(config: DraftConfig): Promise<{ name: string; teams: LeagueTeam[]; budget: number; rosterSize: number }> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${config.seasonId}/segments/0/leagues/${config.leagueId}?view=mTeam&view=mSettings`;
  const data = await espnJson<{ settings?: { name?: string; draftSettings?: { auctionBudget?: number }; rosterSettings?: { lineupSlotCounts?: Record<string, number> } }; teams?: Array<{ id: number; name?: string; location?: string; nickname?: string; abbrev?: string }> }>(url);
  const teams = (data.teams ?? []).map((team) => ({
    id: team.id,
    name: team.name || [team.location, team.nickname].filter(Boolean).join(" ") || `Team ${team.id}`,
    abbreviation: team.abbrev || `T${team.id}`,
  })).sort((a, b) => a.id - b.id);
  const lineupCounts = data.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const rosterSize = Object.entries(lineupCounts).reduce((sum, [slot, count]) => sum + (slot === "21" ? 0 : count), 0);
  return {
    name: data.settings?.name || "ESPN Auction League",
    teams,
    budget: data.settings?.draftSettings?.auctionBudget ?? config.budget,
    rosterSize: rosterSize || config.rosterSize,
  };
}

export async function fetchPlayers(config: DraftConfig): Promise<Player[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${config.seasonId}/segments/0/leagues/${config.leagueId}?view=kona_player_info`;
  const limit = 1200;
  const filter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
      limit,
      offset: 0,
      sortDraftRanks: { sortAsc: true, sortPriority: 1, value: "PPR" },
    },
  };
  const data = await espnJson<{ players?: EspnPlayerEntry[] }>(url, {
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  });
  const raw = (data.players ?? []).map(playerFromEntry);
  const usable = raw.flatMap((player, index) => {
    const position = POSITION_MAP[player.defaultPositionId ?? -1];
    if (!position || !player.fullName) return [];
    const ranks = player.draftRanksByRankType?.PPR ?? player.draftRanksByRankType?.STANDARD ?? {};
    const projection = player.stats?.find((stat) => stat.seasonId === config.seasonId && stat.statSourceId === 1 && stat.statSplitTypeId === 0)?.appliedTotal
      ?? player.stats?.find((stat) => String(stat.id) === `10${config.seasonId}`)?.appliedTotal
      ?? 0;
    return [{
      id: player.id,
      name: player.fullName,
      position,
      nflTeam: NFL_TEAMS[player.proTeamId ?? 0] ?? "FA",
      projectedPoints: Number(projection.toFixed(1)),
      espnKeeperValue: Math.max(1, Math.round(ranks.auctionValue ?? 1)),
      overallRank: ranks.rank ?? index + 1,
    }];
  });
  if (!usable.length) throw new Error("ESPN returned no draftable players.");
  return assignTiers(usable);
}

export async function fetchCompletedPicks(config: DraftConfig): Promise<Array<{ playerId: number; teamId: number; amount: number }>> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${config.seasonId}/segments/0/leagues/${config.leagueId}?view=mDraftDetail`;
  const data = await espnJson<{ draftDetail?: { picks?: Array<{ playerId: number; teamId: number; bidAmount?: number; keeperValue?: number }> } }>(url);
  return (data.draftDetail?.picks ?? []).map((pick) => ({ playerId: pick.playerId, teamId: pick.teamId, amount: pick.bidAmount ?? pick.keeperValue ?? 1 }));
}
