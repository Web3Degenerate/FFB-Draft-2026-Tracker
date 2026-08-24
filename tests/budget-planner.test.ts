import { describe, expect, it } from "vitest";
import { budgetPlannerSummary, marketBidToBeatOpponents, parseBudgetPlanner } from "@/lib/budget-planner";
import type { DraftState } from "@/lib/types";

const state: DraftState = {
  config: { leagueId: 1, seasonId: 2026, myTeamId: 1, budget: 200, rosterSize: 14, leagueName: "Test" },
  teams: [{ id: 1, name: "Mine", abbreviation: "ME" }],
  keepers: [{ id: "k1", playerId: 1, playerName: "Kept Runner", position: "RB", teamId: 1, amount: 43, createdAt: "2026-08-01T00:00:00Z" }],
  sales: [{ id: "s1", playerId: 2, playerName: "Drafted QB", position: "QB", teamId: 1, amount: 18, source: "manual", createdAt: "2026-08-02T00:00:00Z" }],
  nomination: null,
  tierOverrides: {},
  tierOrders: {},
  watchList: [],
  watchListOrders: {},
  budgetPlanner: { QB: { note: "Old idea", amount: 35 }, RB1: { note: "Another idea", amount: 20 }, WR1: { note: "Target WR", amount: 50 } },
  relay: { connected: false, lastSeenAt: null, message: "Manual" },
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("live budget planner", () => {
  it("locks actual roster values over saved planning entries", () => {
    const summary = budgetPlannerSummary(state);
    expect(summary.rows.find((row) => row.key === "QB")).toMatchObject({ playerName: "Drafted QB", amount: 18, locked: true });
    expect(summary.rows.find((row) => row.key === "RB1")).toMatchObject({ playerName: "Kept Runner", amount: 43, locked: true, isKeeper: true });
    expect(summary.rows.find((row) => row.key === "WR1")).toMatchObject({ playerName: "Target WR", amount: 50, locked: false });
  });

  it("reserves one dollar for every untouched open roster slot", () => {
    const summary = budgetPlannerSummary({ ...state, keepers: [], sales: [], budgetPlanner: {} });
    expect(summary.allocated).toBe(14);
    expect(summary.remaining).toBe(186);
  });

  it("reports a negative remainder when the plan is over budget", () => {
    const summary = budgetPlannerSummary({ ...state, keepers: [], sales: [], budgetPlanner: { QB: { note: "Premium QB", amount: 200 } } });
    expect(summary.allocated).toBe(213);
    expect(summary.remaining).toBe(-13);
  });

  it("calculates the largest single-slot bid while preserving every other allocation", () => {
    const summary = budgetPlannerSummary(state);
    expect(summary).toMatchObject({ allocated: 122, remaining: 78, maxBid: 128 });
    expect(summary.maxBidBySlot.BENCH5).toBe(79);
  });

  it("calculates the dollar needed to beat the highest opponent max bid", () => {
    const withOpponent: DraftState = {
      ...state,
      teams: [...state.teams, { id: 2, name: "Opponent", abbreviation: "OPP" }],
    };
    expect(marketBidToBeatOpponents(withOpponent)).toEqual({ opponentMaxBid: 187, winningBid: 188 });
  });

  it("accepts only known slots and whole-dollar values", () => {
    expect(parseBudgetPlanner({ WR1: { note: "Target", amount: 38 } })).toEqual({ WR1: { note: "Target", amount: 38 } });
    expect(parseBudgetPlanner({ BENCH5: { note: "Target", amount: 1, marketLocked: true } })).toEqual({ BENCH5: { note: "Target", amount: 1, marketLocked: true } });
    expect(() => parseBudgetPlanner({ OTHER: { note: "Target", amount: 38 } })).toThrow(/unknown roster slot/i);
    expect(() => parseBudgetPlanner({ WR1: { note: "Target", amount: 2.5 } })).toThrow(/whole dollars/i);
    expect(() => parseBudgetPlanner({ WR1: { note: "Target", amount: 38, marketLocked: true } })).toThrow(/only the B5/i);
  });
});
