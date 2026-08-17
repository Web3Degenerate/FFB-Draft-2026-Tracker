import { describe, expect, it } from "vitest";
import { mergeFantasyIndexRankings, type FantasyIndexSnapshot } from "@/lib/fantasy-index";
import type { Player } from "@/lib/types";

const players: Player[] = [
  { id: 1, name: "Derrick Henry", position: "RB", nflTeam: "BAL", projectedPoints: 200, espnKeeperValue: 40, overallRank: 10, positionRank: 5, tier: "RB1" },
  { id: 2, name: "Ka'imi Fairbairn", position: "K", nflTeam: "HOU", projectedPoints: 130, espnKeeperValue: 1, overallRank: 200, positionRank: 2, tier: "K1" },
  { id: 3, name: "Ravens D/ST", position: "DST", nflTeam: "BAL", projectedPoints: 120, espnKeeperValue: 2, overallRank: 180, positionRank: 4, tier: "DST1" },
  { id: 4, name: "Fallback Player", position: "WR", nflTeam: "FA", projectedPoints: 99, espnKeeperValue: 1, overallRank: 999, positionRank: 100, tier: "WR9" },
];

const snapshot: FantasyIndexSnapshot = {
  sourceUrl: "https://fantasyindex.com/members/rankings/1425/68208",
  retrievedAt: "2026-08-15T00:00:00.000Z",
  rankings: [
    { name: "Derrick Henry", position: "RB", team: "BAL", positionalRank: 7, projectedPoints: 251.4 },
    { name: "Kaimi Fairbairn", position: "PK", team: "HOU", positionalRank: 3, projectedPoints: 154.2 },
    { name: "Baltimore", position: "ST", team: "BAL", positionalRank: 2, projectedPoints: 181.8 },
  ],
};

describe("Fantasy Index ranking merge", () => {
  it("replaces projections and adds FI positional ranks across position labels", () => {
    const merged = mergeFantasyIndexRankings(players, snapshot);
    expect(merged[0]).toMatchObject({ projectedPoints: 251.4, fantasyIndexRank: 7, projectionSource: "fantasy-index" });
    expect(merged[1]).toMatchObject({ projectedPoints: 154.2, fantasyIndexRank: 3, projectionSource: "fantasy-index" });
    expect(merged[2]).toMatchObject({ projectedPoints: 181.8, fantasyIndexRank: 2, projectionSource: "fantasy-index" });
  });

  it("keeps ESPN projections when Fantasy Index has no matching player", () => {
    expect(mergeFantasyIndexRankings(players, snapshot)[3]).toEqual(players[3]);
  });
});
