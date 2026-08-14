import type { LeagueTeam } from "./types";

export function teamDisplayName(team: Pick<LeagueTeam, "name" | "alias">): string {
  return team.alias ? `${team.alias} — ${team.name}` : team.name;
}

export function mergeEspnTeamNames(current: LeagueTeam[], incoming: LeagueTeam[]): LeagueTeam[] {
  const incomingById = new Map(incoming.map((team) => [team.id, team]));
  return current.map((team) => {
    const espnTeam = incomingById.get(team.id);
    if (!espnTeam) return { ...team, alias: team.alias ?? "" };
    return {
      ...team,
      name: espnTeam.name,
      abbreviation: espnTeam.abbreviation,
      alias: team.alias ?? "",
    };
  });
}

export function carryTeamAliases(current: LeagueTeam[], incoming: LeagueTeam[]): LeagueTeam[] {
  const aliasById = new Map(current.map((team) => [team.id, team.alias ?? ""]));
  return incoming.map((team) => ({ ...team, alias: aliasById.get(team.id) ?? "" }));
}
