import { describe, expect, it } from "vitest";
import { isCompleteWatchListOrder, sortWatchListPlayers } from "@/lib/watch-list-order";
import type { Player } from "@/lib/types";

const players: Player[] = [
  { id: 1, name: "First", position: "RB", nflTeam: "A", projectedPoints: 1, espnKeeperValue: 1, overallRank: 1, positionRank: 1, tier: "RB1" },
  { id: 2, name: "Second", position: "RB", nflTeam: "B", projectedPoints: 1, espnKeeperValue: 1, overallRank: 2, positionRank: 2, tier: "RB1" },
  { id: 3, name: "Receiver", position: "WR", nflTeam: "C", projectedPoints: 1, espnKeeperValue: 1, overallRank: 3, positionRank: 1, tier: "WR1" },
];

describe("Watch List ordering", () => {
  const state = { tierOverrides: {}, tierOrders: {}, watchList: [1, 2, 3], watchListOrders: { RB: [2, 1] } };

  it("applies the saved order for one positional column", () => {
    expect(sortWatchListPlayers(players, state, "RB").map((player) => player.id)).toEqual([2, 1]);
  });

  it("requires every watched player in the column exactly once", () => {
    expect(isCompleteWatchListOrder(state, players, "RB", [2, 1])).toBe(true);
    expect(isCompleteWatchListOrder(state, players, "RB", [2, 2])).toBe(false);
    expect(isCompleteWatchListOrder(state, players, "RB", [2])).toBe(false);
  });
});
