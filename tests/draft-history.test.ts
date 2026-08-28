import { describe, expect, it } from "vitest";
import { filterAndSortDraftHistoryEntries, sortDraftHistoryEntries, type DraftHistoryEntry } from "../lib/draft-history";

const rows: DraftHistoryEntry[] = [
  { number: 3, teamId: 7, manager: "Zoe", teamName: "Team 10", player: "Player C", nflTeam: "MIN", position: "WR", amount: 12 },
  { number: 1, teamId: 4, manager: "amy", teamName: "Team 2", player: "Player A", nflTeam: "SF", position: "RB", amount: 42 },
  { number: 2, teamId: 5, manager: "Brett", teamName: "Team 1", player: "Player B", nflTeam: "BUF", position: "QB", amount: 12 },
];

describe("draft history sorting", () => {
  it("sorts numeric prices descending and retains original order for ties", () => {
    expect(sortDraftHistoryEntries(rows, { column: "amount", direction: "desc" }).map(({ number }) => number)).toEqual([1, 2, 3]);
  });

  it("sorts text case-insensitively with natural numeric ordering", () => {
    expect(sortDraftHistoryEntries(rows, { column: "teamName", direction: "asc" }).map(({ teamName }) => teamName)).toEqual([
      "Team 1",
      "Team 2",
      "Team 10",
    ]);
  });

  it("filters by position before applying the selected sort", () => {
    expect(filterAndSortDraftHistoryEntries(rows, { position: "RB" }, { column: "amount", direction: "desc" })).toEqual([rows[1]]);
  });

  it("combines filters across columns case-insensitively", () => {
    expect(filterAndSortDraftHistoryEntries(rows, { manager: "BRE", amount: "12" }, { column: "number", direction: "asc" })).toEqual([rows[2]]);
  });
});
