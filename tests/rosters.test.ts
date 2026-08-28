import { describe, expect, it } from "vitest";
import { assignTeamRoster } from "@/lib/rosters";
import type { DraftState, Keeper, Sale } from "@/lib/types";

const keeper = (id: string, playerId: number, playerName: string, position: Keeper["position"]): Keeper => ({
  id, playerId, playerName, position, teamId: 2, amount: 12, createdAt: "2026-08-01T00:00:00Z",
});
const sale = (id: string, playerId: number, playerName: string, position: Sale["position"]): Sale => ({
  id, playerId, playerName, position, teamId: 2, amount: 8, source: "manual", createdAt: "2026-08-02T00:00:00Z",
});

const state: DraftState = {
  config: { leagueId: 1, seasonId: 2026, myTeamId: 1, budget: 200, rosterSize: 14, leagueName: "Test" },
  teams: [{ id: 1, name: "Mine", abbreviation: "ME" }, { id: 2, name: "Opponent", abbreviation: "OPP" }],
  keepers: [], sales: [], nomination: null, tierOverrides: {}, tierOrders: {}, watchList: [], watchListOrders: {},
  relay: { connected: false, lastSeenAt: null, message: "Manual" }, updatedAt: "2026-01-01T00:00:00Z",
};

describe("opponent roster assignment", () => {
  it("places keepers into their natural starting slots", () => {
    const slots = assignTeamRoster({ ...state, keepers: [keeper("k1", 1, "Keeper Runner", "RB"), keeper("k2", 2, "Keeper Catcher", "WR")] }, 2);
    expect(slots.find((slot) => slot.key === "RB1")?.player).toMatchObject({ playerName: "Keeper Runner", isKeeper: true });
    expect(slots.find((slot) => slot.key === "WR1")?.player).toMatchObject({ playerName: "Keeper Catcher", isKeeper: true });
  });

  it("fills starters, flex, and then bench in roster order", () => {
    const sales = [
      sale("s1", 1, "QB One", "QB"), sale("s2", 2, "RB One", "RB"), sale("s3", 3, "RB Two", "RB"),
      sale("s4", 4, "RB Flex", "RB"), sale("s5", 5, "WR One", "WR"), sale("s6", 6, "WR Two", "WR"),
      sale("s7", 7, "WR Bench", "WR"), sale("s8", 8, "TE One", "TE"), sale("s9", 9, "Defense", "DST"),
      sale("s10", 10, "Kicker", "K"),
    ];
    const slots = assignTeamRoster({ ...state, sales }, 2);
    expect(slots.find((slot) => slot.key === "FLEX")?.player?.playerName).toBe("RB Flex");
    expect(slots.find((slot) => slot.key === "BENCH1")?.player?.playerName).toBe("WR Bench");
    expect(slots.find((slot) => slot.key === "DST")?.player?.playerName).toBe("Defense");
  });
});
