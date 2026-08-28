import { describe, expect, it } from "vitest";
import { inferDraftTeamBudgets } from "@/lib/draft-budgets";
import type { DraftState } from "@/lib/types";

const state: DraftState = {
  config: { leagueId: 1, seasonId: 2026, myTeamId: 1, budget: 200, rosterSize: 14, leagueName: "Test" },
  teams: [{ id: 1, name: "One", abbreviation: "ONE" }],
  keepers: [{ id: "k1", playerId: 10, playerName: "Keeper", position: "RB", teamId: 1, amount: 20, createdAt: "2026-01-01T00:00:00Z" }],
  sales: [{ id: "s1", playerId: 11, playerName: "Sold", position: "WR", teamId: 1, amount: 30, source: "espn-relay", createdAt: "2026-01-01T00:00:00Z" }],
  nomination: null,
  tierOverrides: {}, tierOrders: {}, watchList: [], watchListOrders: {},
  relay: { connected: true, lastSeenAt: null, message: "Connected", draftTeamBudgets: {} },
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ESPN draft budgets", () => {
  it("reconstructs a team's starting budget from remaining cash and tracked spending", () => {
    expect(inferDraftTeamBudgets(state, [{ teamId: 1, remainingBudget: 160 }], [])).toEqual({ "1": 210 });
  });

  it("includes a just-finished sale before the relay has stored it", () => {
    const budgets = inferDraftTeamBudgets(state, [{ teamId: 1, remainingBudget: 145 }], [
      { playerId: 12, playerName: "New Sale", teamId: 1, amount: 15 },
      { playerId: 11, playerName: "Sold", teamId: 1, amount: 30 },
    ]);
    expect(budgets).toEqual({ "1": 210 });
  });

  it("does not lower a previously synchronized starting budget when ESPN's visible history is incomplete", () => {
    const existing = { ...state, relay: { ...state.relay, draftTeamBudgets: { "1": 215 } } };
    expect(inferDraftTeamBudgets(existing, [{ teamId: 1, remainingBudget: 100 }], [])).toEqual({ "1": 215 });
  });
});
