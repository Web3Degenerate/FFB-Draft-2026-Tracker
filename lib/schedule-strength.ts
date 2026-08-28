import rawScheduleData from "@/lib/nfl-schedule-data-2026.json";
import rawLeagueModel from "@/lib/nfl-schedule-league-model-2026.json";
import {
  normalizeNflAbbreviation,
  PLAYOFF_WINDOW,
  summarizeSchedule,
  type ScheduleLeagueModel,
  type ScheduleSnapshot,
  type ScheduleWindow,
} from "@/lib/schedules";
import type { Player, Position } from "@/lib/types";

const snapshot = rawScheduleData as unknown as ScheduleSnapshot;
const leagueModel = rawLeagueModel as unknown as ScheduleLeagueModel;

export function teamScheduleStrength(nflTeam: string, position: Position, window: ScheduleWindow = PLAYOFF_WINDOW): number | null {
  const abbreviation = normalizeNflAbbreviation(nflTeam);
  const team = snapshot.teams.find((item) => item.abbreviation === abbreviation);
  if (!team) return null;
  return summarizeSchedule(snapshot, team, position, window, leagueModel).strengthScore;
}

export function playoffScheduleStrengthForPlayer(player: Player): number | null {
  return teamScheduleStrength(player.nflTeam, player.position, PLAYOFF_WINDOW);
}
