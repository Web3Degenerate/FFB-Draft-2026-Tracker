import { describe, expect, it } from "vitest";
import { leagueSwitchBlockReason } from "@/lib/league-switch";
import type { DraftState } from "@/lib/types";

const clean = { sales: [], keepers: [], teams: [{ id: 1, name: "Team 1", abbreviation: "T1", alias: "" }] };

describe("league switch protection", () => {
  it("allows a clean room to connect to another ESPN league", () => {
    expect(leagueSwitchBlockReason(clean)).toBeNull();
  });

  it("protects auction sales from an automatic league replacement", () => {
    expect(leagueSwitchBlockReason({ ...clean, sales: [{ id: "sale" }] as unknown as DraftState["sales"] })).toContain("auction sale");
  });

  it("protects keepers from cross-league team ID collisions", () => {
    expect(leagueSwitchBlockReason({ ...clean, keepers: [{ id: "keeper" }] as unknown as DraftState["keepers"] })).toContain("keeper");
  });

  it("protects personal team nicknames even before keepers are entered", () => {
    expect(leagueSwitchBlockReason({ ...clean, teams: [{ ...clean.teams[0], alias: "Bass" }] })).toContain("nickname");
  });
});
