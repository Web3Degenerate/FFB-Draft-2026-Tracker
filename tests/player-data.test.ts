import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveTeamEnvironments, extractFantasyProsEcr, impliedTeamTotals, mergePlayerProfiles,
  normalizePlayerName, pearsonCorrelation, uniqueNamePositionMatch,
} from "../lib/player-data";
import type { PlayerIdRecord } from "../lib/player-data-types";
import type { Player } from "../lib/types";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "player-data");
const fixture = async <T>(name: string) => JSON.parse(await readFile(path.join(FIXTURE_DIR, name), "utf8")) as T;

describe("player data ingest invariants", () => {
  it("resolves all required external IDs for at least 95% of the real top-200 skill-player fixture", async () => {
    const players = await fixture<Player[]>("players-top-200.json");
    const ids = await fixture<Record<string, PlayerIdRecord>>("player-ids-top-200.json");
    const covered = players.filter((player) => {
      const record = ids[player.id];
      return record?.sleeperId && record?.gsisId && record?.fantasyProsId;
    });
    expect(covered.length / players.length).toBeGreaterThanOrEqual(0.95);
  });

  it("confirms nflverse's home-favorite spread is positively correlated with home scoring margin", async () => {
    const games = await fixture<Array<{ spreadLine: number; homeScore: number; awayScore: number }>>("vegas-2025-sign.json");
    const correlation = pearsonCorrelation(games.map((game) => game.spreadLine), games.map((game) => game.homeScore - game.awayScore));
    expect(games.length).toBeGreaterThan(250);
    expect(correlation).toBeGreaterThan(0);
  });

  it("derives implied totals that sum back to the posted total", () => {
    const totals = impliedTeamTotals(44.5, 3.5);
    expect(totals.home).toBe(24);
    expect(totals.away).toBe(20.5);
    expect(totals.home + totals.away).toBeCloseTo(44.5, 2);
  });

  it("derives exactly one 2026 bye for all 32 teams and agrees with sampled FFC byes", async () => {
    const schedule = await fixture<{ games: Array<{ week: number; homeTeam: string; awayTeam: string; totalLine?: number; spreadLine?: number }> }>("vegas-2026.json");
    const teams = [...new Set(schedule.games.flatMap((game) => [game.homeTeam, game.awayTeam]))];
    const environments = deriveTeamEnvironments(schedule.games, teams);
    expect(teams).toHaveLength(32);
    expect(Object.values(environments).every((team) => team.byeWeek !== undefined)).toBe(true);
    const samples = await fixture<Array<{ team: string; bye: number }>>("ffc-byes.json");
    expect(samples.length).toBeGreaterThanOrEqual(4);
    samples.forEach((sample) => expect(environments[sample.team].byeWeek).toBe(sample.bye));
  });

  it("produces a total profile when every external source is absent", () => {
    const player: Player = {
      id: 99, name: "Future Rookie", position: "RB", nflTeam: "FA", projectedPoints: 0,
      espnKeeperValue: 1, overallRank: 999, positionRank: 99, tier: "RB9",
    };
    const [profile] = mergePlayerProfiles([player], {});
    expect(profile.name).toBe("Future Rookie");
    expect(profile.ids).toEqual({ espnId: 99 });
    expect(profile.sourcesMissing).toContain("2025 NFL usage");
    expect(profile.usage2025).toBeUndefined();
  });

  it("normalizes punctuation, suffixes, and diacritics while refusing ambiguous matches", () => {
    const candidates = [
      { name: "Ja'Marr Chase", position: "WR", id: 1 },
      { name: "James Cook", position: "RB", id: 2 },
      { name: "Amon-Ra St. Brown", position: "WR", id: 3 },
      { name: "José Núñez Jr.", position: "TE", id: 4 },
    ];
    expect(uniqueNamePositionMatch(candidates, "Ja’Marr Chase", "WR")?.id).toBe(1);
    expect(uniqueNamePositionMatch(candidates, "James Cook III", "RB")?.id).toBe(2);
    expect(uniqueNamePositionMatch(candidates, "Amon Ra St Brown", "WR")?.id).toBe(3);
    expect(normalizePlayerName("José Núñez Jr.")).toBe("jose nunez");
    expect(uniqueNamePositionMatch([...candidates, { name: "James Cook Sr.", position: "RB", id: 5 }], "James Cook III", "RB")).toBeUndefined();
  });

  it("extracts all 503 players from the saved FantasyPros HTML fixture", async () => {
    const html = await readFile(path.join(FIXTURE_DIR, "fantasypros-ecr.html"), "utf8");
    const ecr = extractFantasyProsEcr(html) as { players: unknown[] };
    expect(ecr.players).toHaveLength(503);
  });
});
