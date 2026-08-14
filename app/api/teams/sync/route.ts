import { NextRequest, NextResponse } from "next/server";
import { fetchLeague } from "@/lib/espn";
import { getState, mutateState } from "@/lib/store";
import { mergeEspnTeamNames } from "@/lib/teams";
import type { LeagueTeam } from "@/lib/types";

export const runtime = "nodejs";

type SyncPayload = {
  league?: { leagueId?: number; seasonId?: number; myTeamId?: number };
  leagueName?: string;
  teams?: LeagueTeam[];
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    const payload = (text ? JSON.parse(text) : {}) as SyncPayload;
    const current = await getState();
    const requestedLeagueId = Number(payload.league?.leagueId || current.config.leagueId);
    const requestedSeasonId = Number(payload.league?.seasonId || current.config.seasonId);
    if (requestedLeagueId !== current.config.leagueId || requestedSeasonId !== current.config.seasonId) {
      return NextResponse.json({
        error: "Auction Room is still switching to this ESPN league. Team names will retry automatically.",
        code: "LEAGUE_NOT_READY",
      }, { status: 409, headers: cors });
    }

    const suppliedTeams = (payload.teams ?? []).flatMap((team) => {
      const id = Number(team.id);
      const name = String(team.name ?? "").trim();
      if (!Number.isInteger(id) || !name) return [];
      return [{ id, name, abbreviation: String(team.abbreviation || `T${id}`).trim(), alias: "" }];
    });
    const league = suppliedTeams.length
      ? { name: String(payload.leagueName || current.config.leagueName), teams: suppliedTeams }
      : await fetchLeague(current.config);
    const changed = current.teams.flatMap((team) => {
      const incoming = league.teams.find((item) => item.id === team.id);
      if (!incoming || (incoming.name === team.name && incoming.abbreviation === team.abbreviation)) return [];
      return [{ id: team.id, from: team.name, to: incoming.name }];
    });
    const state = await mutateState((draft) => {
      if (draft.config.leagueId !== requestedLeagueId || draft.config.seasonId !== requestedSeasonId) {
        throw new Error("League changed while ESPN team names were loading. Try again.");
      }
      draft.config.leagueName = league.name;
      draft.teams = mergeEspnTeamNames(draft.teams, league.teams);
    });
    return NextResponse.json({ ok: true, changed, state }, { headers: cors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team sync failed" }, { status: 400, headers: cors });
  }
}
