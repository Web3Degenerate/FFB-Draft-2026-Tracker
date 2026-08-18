import { describe, expect, it } from "vitest";
import rawScheduleData from "@/lib/nfl-schedule-data-2026.json";
import rawLeagueModel from "@/lib/nfl-schedule-league-model-2026.json";
import {
  FANTASY_SEASON_WINDOW,
  gradeDistributionWarnings,
  locationRankAdjustment,
  matchupLabel,
  rankSchedules,
  ratingForGame,
  resolvedMatchupForGame,
  SCHEDULE_POSITIONS,
  summarizeSchedule,
  type ScheduleLeagueModel,
  type ScheduleSnapshot,
} from "@/lib/schedules";

const scheduleData = rawScheduleData as unknown as ScheduleSnapshot;
const leagueModel = rawLeagueModel as unknown as ScheduleLeagueModel;

describe("2026 schedule data", () => {
  it("contains every NFL team, 17 games apiece, and six position models", () => {
    expect(scheduleData.teams).toHaveLength(32);
    expect(scheduleData.teams.every((team) => team.games.length === 17)).toBe(true);
    expect(Object.keys(scheduleData.ratings)).toEqual(["QB", "RB", "WR", "TE", "K", "DST"]);
    expect(Object.values(scheduleData.ratings).every((ratings) => Object.keys(ratings).length === 32)).toBe(true);
  });

  it("formats home and away games and leaves Denver's Week 10 as its bye", () => {
    const denver = scheduleData.teams.find((team) => team.abbreviation === "DEN");
    expect(denver).toBeDefined();
    expect(matchupLabel(denver?.games.find((game) => game.week === 1))).toBe("@ KC");
    expect(matchupLabel(denver?.games.find((game) => game.week === 2))).toBe("vs JAX");
    expect(matchupLabel(denver?.games.find((game) => game.week === 10))).toBe("BYE");
  });

  it("ranks schedules by exact average opponent rank, with lower ranks first", () => {
    const selected = scheduleData.teams.filter((team) => ["DEN", "SEA", "MIN", "HOU", "LAR"].includes(team.abbreviation));
    const ranked = rankSchedules(scheduleData, selected, "DST", FANTASY_SEASON_WINDOW, leagueModel);
    expect(ranked).toHaveLength(5);
    expect(ranked[0].averageRank).not.toBeNull();
    expect(ranked[4].averageRank).not.toBeNull();
    expect(ranked[0].averageRank!).toBeLessThanOrEqual(ranked[4].averageRank!);
    expect(ranked.every((summary) => summary.strengthScore !== null && summary.playoffStrength !== null)).toBe(true);
  });

  it("excludes Week 18 from the default fantasy window and averages over actual games, not a phantom bye", () => {
    const denver = scheduleData.teams.find((team) => team.abbreviation === "DEN")!;
    const fantasy = summarizeSchedule(scheduleData, denver, "RB", FANTASY_SEASON_WINDOW, leagueModel);
    const nflSchedule = summarizeSchedule(scheduleData, denver, "RB", { startWeek: 1, endWeek: 18 }, leagueModel);
    expect(fantasy.gamesRated).toBe(16);
    expect(nflSchedule.gamesRated).toBe(17);
    expect(fantasy.byeWeek).toBe(10);
    expect(fantasy.averageRank).not.toBe(0);
    expect(fantasy.averageRank).not.toBe(nflSchedule.averageRank);
  });

  it("sorts an unrated schedule last instead of treating it as the easiest", () => {
    const empty = { ...scheduleData.teams[0], abbreviation: "EMPTY", displayName: "Empty", games: [] };
    const ranked = rankSchedules(scheduleData, [empty, scheduleData.teams[1]], "WR");
    expect(ranked.at(-1)?.team.abbreviation).toBe("EMPTY");
    expect(ranked.at(-1)?.averageRank).toBeNull();
    expect(ranked.at(-1)?.strengthScore).toBeNull();
  });

  it("has a reciprocal opponent entry for every game", () => {
    for (const team of scheduleData.teams) {
      for (const game of team.games) {
        const opponent = scheduleData.teams.find((item) => item.abbreviation === game.opponent);
        const reciprocal = opponent?.games.find((item) => item.week === game.week && item.opponent === team.abbreviation);
        expect(reciprocal, `${team.abbreviation} Week ${game.week} versus ${game.opponent}`).toBeDefined();
        expect(reciprocal?.homeAway).not.toBe(game.homeAway);
      }
    }
  });

  it("has rating coverage for every scheduled opponent and position", () => {
    for (const team of scheduleData.teams) {
      for (const game of team.games) {
        for (const position of SCHEDULE_POSITIONS) {
          expect(scheduleData.ratings[position][game.opponent], `${position} missing ${game.opponent}`).toBeDefined();
        }
      }
    }
  });

  it("keeps grade ordering consistent with exact rank", () => {
    for (const position of SCHEDULE_POSITIONS) {
      const ratings = Object.values(scheduleData.ratings[position]);
      for (const easier of ratings) {
        for (const harder of ratings) {
          if (easier.rank < harder.rank) expect(easier.grade).toBeGreaterThanOrEqual(harder.grade);
        }
      }
    }
  });

  it("flags source grade distributions whose largest bucket exceeds 40 percent", () => {
    const warnings = gradeDistributionWarnings(scheduleData);
    expect(warnings).toContain("K");
    for (const position of SCHEDULE_POSITIONS) {
      const ratings = Object.values(scheduleData.ratings[position]);
      const counts = ratings.reduce<Record<number, number>>((current, rating) => ({ ...current, [rating.grade]: (current[rating.grade] ?? 0) + 1 }), {});
      const compressed = Math.max(...Object.values(counts)) / ratings.length > 0.4;
      expect(warnings.includes(position)).toBe(compressed);
    }
  });

  it("supports a per-week rating override without replacing the preseason baseline", () => {
    const denver = scheduleData.teams.find((team) => team.abbreviation === "DEN")!;
    const game = denver.games.find((item) => item.week === 1)!;
    const original = scheduleData.ratings.QB[game.opponent];
    const snapshot = structuredClone(scheduleData);
    snapshot.ratings.QB[game.opponent] = { ...original, byWeek: { 1: { grade: 5, rank: 1 } } };
    expect(ratingForGame(snapshot, "QB", game)).toEqual({ grade: 5, rank: 1 });
    expect(snapshot.ratings.QB[game.opponent].rank).toBe(original.rank);
  });

  it("applies a small auditable location adjustment and none at neutral sites", () => {
    expect(locationRankAdjustment({ week: 1, opponent: "KC", homeAway: "home", neutralSite: false, date: "" })).toBe(-0.5);
    expect(locationRankAdjustment({ week: 1, opponent: "KC", homeAway: "away", neutralSite: false, date: "" })).toBe(0.5);
    expect(locationRankAdjustment({ week: 1, opponent: "KC", homeAway: "away", neutralSite: true, date: "" })).toBe(0);
  });

  it("contains complete UTH scoring models for QB and D/ST", () => {
    expect(Object.keys(leagueModel.positions.QB ?? {})).toHaveLength(32);
    expect(Object.keys(leagueModel.positions.DST ?? {})).toHaveLength(32);
    const denver = scheduleData.teams.find((team) => team.abbreviation === "DEN")!;
    const game = denver.games.find((item) => item.week === 1)!;
    expect(resolvedMatchupForGame(scheduleData, leagueModel, "DST", game)?.usesLeagueModel).toBe(true);
    expect(resolvedMatchupForGame(scheduleData, leagueModel, "RB", game)?.usesLeagueModel).toBe(false);
  });
});
