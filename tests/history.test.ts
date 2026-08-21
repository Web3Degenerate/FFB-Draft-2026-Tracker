import { describe, expect, it } from "vitest";
import { filterAndSortHistoricalRankings, type HistoricalRanking } from "../lib/history";

const rankings: HistoricalRanking[] = [
  { overallRank: 2, positionalRank: 1, position: "WR", team: "MIN", name: "Justin Jefferson", bye: 13, projectedPoints: 250.5 },
  { overallRank: 1, positionalRank: 1, position: "RB", team: "SF", name: "Christian McCaffrey", bye: 9, projectedPoints: 310.2 },
  { overallRank: null, positionalRank: 40, position: "ST", team: "ARI", name: "Arizona", bye: 14, projectedPoints: 58.47 },
];

describe("Fantasy Index history table", () => {
  it("filters using displayed position labels", () => {
    expect(filterAndSortHistoricalRankings(rankings, { position: "D/ST" }, { column: "overallRank", direction: "asc" }).map((row) => row.team)).toEqual(["ARI"]);
  });

  it("sorts numeric columns and leaves missing overall ranks at the bottom", () => {
    expect(filterAndSortHistoricalRankings(rankings, {}, { column: "overallRank", direction: "desc" }).map((row) => row.name)).toEqual([
      "Justin Jefferson",
      "Christian McCaffrey",
      "Arizona",
    ]);
  });
});
