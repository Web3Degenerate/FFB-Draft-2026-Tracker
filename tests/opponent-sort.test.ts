import { describe, expect, it } from "vitest";
import { teamSnapshots } from "@/lib/auction";
import { opponentPositionSpend, sortOpponentTeamsByPosition } from "@/lib/opponent-sort";
import type { DraftState, Sale } from "@/lib/types";

const sale = (id: string, teamId: number, playerId: number, amount: number): Sale => ({
  id,
  teamId,
  playerId,
  playerName: `RB ${playerId}`,
  position: "RB",
  amount,
  source: "manual",
  createdAt: "2026-08-16T00:00:00Z",
});

const state: DraftState = {
  config: { leagueId: 1, seasonId: 2026, myTeamId: 99, budget: 200, rosterSize: 14, leagueName: "Test" },
  teams: [
    { id: 1, name: "No Running Backs", abbreviation: "ZERO" },
    { id: 2, name: "One Expensive Back", abbreviation: "HIGH" },
    { id: 3, name: "One Cheap Back", abbreviation: "LOW" },
    { id: 4, name: "Two Running Backs", abbreviation: "TWO" },
  ],
  sales: [sale("s1", 2, 21, 35), sale("s2", 3, 31, 12), sale("s3", 4, 41, 8), sale("s4", 4, 42, 19)],
  keepers: [], nomination: null, tierOverrides: {}, tierOrders: {}, watchList: [], watchListOrders: {},
  relay: { connected: false, lastSeenAt: null, message: "Manual" }, updatedAt: "2026-08-16T00:00:00Z",
};

describe("opponent position sorting", () => {
  it("sorts by rostered position count and then position spend", () => {
    expect(sortOpponentTeamsByPosition(state, teamSnapshots(state), "RB").map((team) => team.id)).toEqual([1, 3, 2, 4]);
  });

  it("totals keeper and auction spending only at the selected position", () => {
    const withKeeper: DraftState = {
      ...state,
      keepers: [
        { id: "k1", teamId: 4, playerId: 43, playerName: "Keeper RB", position: "RB", amount: 11, createdAt: "2026-08-01T00:00:00Z" },
        { id: "k2", teamId: 4, playerId: 44, playerName: "Keeper WR", position: "WR", amount: 14, createdAt: "2026-08-01T00:00:00Z" },
      ],
    };
    expect(opponentPositionSpend(withKeeper, 4, "RB")).toBe(38);
    expect(opponentPositionSpend(withKeeper, 4, "WR")).toBe(14);
  });
});
