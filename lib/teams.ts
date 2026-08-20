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

function normalizeTeamName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapDraftTeamsById(configuredTeams: LeagueTeam[], draftTeams: LeagueTeam[]) {
  const configuredById = new Map(configuredTeams.map((team) => [team.id, team]));
  const compatibleTeams = draftTeams.flatMap((incoming) => {
    const configured = configuredById.get(incoming.id);
    return configured ? [{ incoming, configured }] : [];
  });

  return {
    aliases: Object.fromEntries(compatibleTeams.map(({ incoming, configured }) => [normalizeTeamName(incoming.name), configured.id])),
    names: Object.fromEntries(compatibleTeams.map(({ incoming, configured }) => [String(configured.id), incoming.name])),
    changed: compatibleTeams
      .filter(({ incoming, configured }) => incoming.name !== configured.name)
      .map(({ incoming, configured }) => ({ id: configured.id, from: configured.name, to: incoming.name })),
  };
}
