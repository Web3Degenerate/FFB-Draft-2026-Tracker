import { describe, expect, it } from "vitest";
import { carryTeamAliases, mapDraftTeamsById, mergeEspnTeamNames, teamDisplayName } from "@/lib/teams";

describe("team identity", () => {
  it("puts the personal nickname before the ESPN team name", () => {
    expect(teamDisplayName({ name: "Goff My Lawn", alias: "Bass" })).toBe("Bass — Goff My Lawn");
    expect(teamDisplayName({ name: "Goff My Lawn" })).toBe("Goff My Lawn");
  });

  it("updates ESPN names by team ID without losing personal nicknames", () => {
    const teams = mergeEspnTeamNames(
      [{ id: 15, name: "Old ESPN Name", abbreviation: "OLD", alias: "Bass" }],
      [{ id: 15, name: "New ESPN Name", abbreviation: "NEW" }],
    );
    expect(teams).toEqual([{ id: 15, name: "New ESPN Name", abbreviation: "NEW", alias: "Bass" }]);
  });

  it("carries personal nicknames into a refreshed league team list", () => {
    const teams = carryTeamAliases(
      [{ id: 1, name: "One", abbreviation: "ONE", alias: "George" }],
      [{ id: 1, name: "Renamed", abbreviation: "REN" }, { id: 2, name: "Two", abbreviation: "TWO" }],
    );
    expect(teams).toEqual([
      { id: 1, name: "Renamed", abbreviation: "REN", alias: "George" },
      { id: 2, name: "Two", abbreviation: "TWO", alias: "" },
    ]);
  });

  it("maps a mock draft's renamed teams to configured teams by ESPN team ID", () => {
    const mapping = mapDraftTeamsById(
      [
        { id: 15, name: "Mr Rogers' Naberless Naberhood", abbreviation: "RIP", alias: "ME" },
        { id: 16, name: "Blockbuster Promking", abbreviation: "BS$$", alias: "Bouds" },
      ],
      [
        { id: 15, name: "Everyone Loves The Drake", abbreviation: "ELD" },
        { id: 99, name: "Unrelated Team", abbreviation: "NOPE" },
      ],
    );

    expect(mapping.aliases).toEqual({ everyonelovesthedrake: 15 });
    expect(mapping.names).toEqual({ "15": "Everyone Loves The Drake" });
    expect(mapping.changed).toEqual([{
      id: 15,
      from: "Mr Rogers' Naberless Naberhood",
      to: "Everyone Loves The Drake",
    }]);
  });
});
