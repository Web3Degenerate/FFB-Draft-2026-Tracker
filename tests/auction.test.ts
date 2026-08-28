import { describe, expect, it } from "vitest";
import { assertValidKeeper, assertValidKeeperPrice, assertValidSale, availablePlayers, calculateInflation, calculateMarketMultiplier, clearAuctionResults, teamSnapshots, tierSnapshots } from "@/lib/auction";
import type { DraftState, Player } from "@/lib/types";

const players: Player[] = [
  { id: 1, name: "Alpha Back", position: "RB", nflTeam: "HOU", projectedPoints: 260, espnKeeperValue: 55, overallRank: 1, positionRank: 1, tier: "RB1" },
  { id: 2, name: "Beta Back", position: "RB", nflTeam: "KC", projectedPoints: 240, espnKeeperValue: 48, overallRank: 2, positionRank: 2, tier: "RB1" },
];

const state: DraftState = {
  config: { leagueId: 1, seasonId: 2026, myTeamId: 1, budget: 200, rosterSize: 14, leagueName: "Test" },
  teams: [{ id: 1, name: "One", abbreviation: "ONE" }, { id: 2, name: "Two", abbreviation: "TWO" }],
  sales: [], keepers: [], nomination: null, tierOverrides: {}, tierOrders: {}, watchList: [], watchListOrders: {},
  relay: { connected: false, lastSeenAt: null, message: "Manual" }, updatedAt: "2026-01-01T00:00:00Z",
};

describe("auction math", () => {
  it("reserves one dollar for every roster spot after the current purchase", () => {
    expect(teamSnapshots(state)[0].maxBid).toBe(187);
  });

  it("reports a $60 max bid with $69 left and ten open roster spots", () => {
    const ebby = {
      ...state,
      teams: [{ id: 1, name: "Ebby Splendic", abbreviation: "EBB" }],
      sales: [40, 35, 30, 26].map((amount, index) => ({
        id: `sale-${index}`,
        playerId: 100 + index,
        playerName: `Player ${index}`,
        position: "WR" as const,
        teamId: 1,
        amount,
        source: "manual" as const,
        createdAt: "2026-01-01T00:00:00Z",
      })),
    };
    expect(teamSnapshots(ebby)[0]).toMatchObject({ budgetLeft: 69, spotsLeft: 10, maxBid: 60 });
  });

  it("uses ESPN's individualized draft budget for traded auction dollars", () => {
    const traded = {
      ...state,
      relay: { ...state.relay, draftTeamBudgets: { "1": 215, "2": 185 } },
    };
    expect(teamSnapshots(traded)).toMatchObject([
      { id: 1, startingBudget: 215, budgetLeft: 215, maxBid: 202 },
      { id: 2, startingBudget: 185, budgetLeft: 185, maxBid: 172 },
    ]);
  });

  it("rejects a sale above the team's legal max bid", () => {
    expect(assertValidSale(state, players[0], 1, 188)).toMatch(/at most \$187/);
  });

  it("rejects a zero-dollar auction purchase", () => {
    expect(assertValidSale(state, players[0], 1, 0)).toMatch(/at least \$1/);
  });

  it("marks a two-player tier tight when two teams need the position", () => {
    expect(tierSnapshots(state, players)[0]).toMatchObject({ playersLeft: 2, teamsNeeding: 2, pressure: "TIGHT" });
  });

  it("returns a finite positive inflation multiplier", () => {
    expect(calculateInflation(state, players)).toBeCloseTo(1);
    expect(Number.isFinite(calculateInflation(state, players))).toBe(true);
    expect(calculateMarketMultiplier(state, players)).toBeGreaterThan(0);
  });

  it("counts keeper price and roster slot before the auction", () => {
    const withKeeper = { ...state, keepers: [{ id: "keeper-1", playerId: 1, playerName: "Alpha Back", position: "RB" as const, teamId: 1, amount: 25, createdAt: "2026-01-01T00:00:00Z" }] };
    expect(teamSnapshots(withKeeper)[0]).toMatchObject({ spent: 25, budgetLeft: 175, rosterCount: 1, keeperCount: 1, spotsLeft: 13, maxBid: 163 });
    expect(availablePlayers(withKeeper, players).map((player) => player.id)).toEqual([2]);
  });

  it("enforces a maximum of two keepers per team", () => {
    const withTwo = { ...state, keepers: [
      { id: "keeper-1", playerId: 10, playerName: "One", position: "RB" as const, teamId: 1, amount: 10, createdAt: "2026-01-01T00:00:00Z" },
      { id: "keeper-2", playerId: 11, playerName: "Two", position: "WR" as const, teamId: 1, amount: 10, createdAt: "2026-01-01T00:00:00Z" },
    ] };
    expect(assertValidKeeper(withTwo, players[0], 1, 20)).toMatch(/already has two keepers/);
  });

  it("allows keeper prices to change without removing the player", () => {
    const withKeeper = { ...state, keepers: [{ id: "keeper-1", playerId: 1, playerName: "Alpha Back", position: "RB" as const, teamId: 1, amount: 25, createdAt: "2026-01-01T00:00:00Z" }] };
    expect(assertValidKeeperPrice(withKeeper, "keeper-1", 30)).toBeNull();
    expect(assertValidKeeperPrice(withKeeper, "keeper-1", 187)).toBeNull();
    expect(assertValidKeeperPrice(withKeeper, "keeper-1", 188)).toMatch(/at most \$187/);
    expect(assertValidKeeperPrice(withKeeper, "keeper-1", -1)).toMatch(/at least \$0/);
  });

  it("preserves keepers and tier overrides when auction results are reset", () => {
    const draft: DraftState = {
      ...state,
      keepers: [{ id: "keeper-1", playerId: 1, playerName: "Alpha Back", position: "RB", teamId: 1, amount: 25, createdAt: "2026-01-01T00:00:00Z" }],
      sales: [{ id: "sale-1", playerId: 2, playerName: "Beta Back", position: "RB", teamId: 2, amount: 30, source: "manual", createdAt: "2026-01-01T00:00:00Z" }],
      tierOverrides: { "1": "RB2" },
      tierOrders: { RB2: [1] },
      watchList: [1, 2],
      benchTargets: [2],
      nomination: { playerId: 2, source: "manual" },
    };
    clearAuctionResults(draft);
    expect(draft.sales).toEqual([]);
    expect(draft.nomination).toBeNull();
    expect(draft.keepers).toHaveLength(1);
    expect(draft.tierOverrides).toEqual({ "1": "RB2" });
    expect(draft.tierOrders).toEqual({ RB2: [1] });
    expect(draft.watchList).toEqual([1, 2]);
    expect(draft.benchTargets).toEqual([2]);
    expect(draft.relay.draftTeamBudgets).toBeUndefined();
  });
});
