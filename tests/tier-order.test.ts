import { describe, expect, it } from "vitest";
import { isCompleteTierOrder, sortPlayersByTierOrder } from "@/lib/tier-order";
import type { Player } from "@/lib/types";

const players: Player[] = [
  { id: 1, name: "First", position: "RB", nflTeam: "A", projectedPoints: 1, espnKeeperValue: 1, overallRank: 1, positionRank: 1, tier: "RB1" },
  { id: 2, name: "Second", position: "RB", nflTeam: "B", projectedPoints: 1, espnKeeperValue: 1, overallRank: 2, positionRank: 2, tier: "RB1" },
  { id: 3, name: "Third", position: "RB", nflTeam: "C", projectedPoints: 1, espnKeeperValue: 1, overallRank: 3, positionRank: 3, tier: "RB2" },
];

describe("tier ordering", () => {
  const state = { tierOverrides: {}, tierOrders: { RB1: [2, 1] } };

  it("applies a saved order only within its tier", () => {
    expect(sortPlayersByTierOrder(players, state).map((player) => player.id)).toEqual([2, 1, 3]);
  });

  it("requires every tier player exactly once", () => {
    expect(isCompleteTierOrder(state, players, "RB1", [2, 1])).toBe(true);
    expect(isCompleteTierOrder(state, players, "RB1", [2, 2])).toBe(false);
    expect(isCompleteTierOrder(state, players, "RB1", [2])).toBe(false);
  });
});
