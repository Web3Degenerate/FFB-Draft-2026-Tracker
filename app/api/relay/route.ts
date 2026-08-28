import { NextRequest, NextResponse } from "next/server";
import { assertValidSale } from "@/lib/auction";
import { inferDraftTeamBudgets } from "@/lib/draft-budgets";
import { leagueSwitchBlockReason } from "@/lib/league-switch";
import { getPlayers, getState, mutateState, replaceLeague, saveEspnAuctionValues } from "@/lib/store";
import type { Position, Sale } from "@/lib/types";

export const runtime = "nodejs";

type RelayPayload = {
  type: "heartbeat" | "snapshot";
  transport?: "extension" | "pasted";
  league?: { leagueId: number; seasonId: number; myTeamId: number };
  nomination?: { playerId?: number; playerName?: string; askingBid?: number; leadingTeamName?: string } | null;
  sales?: Array<{ playerId?: number; playerName: string; position?: Position; teamName: string; amount: number }>;
  auctionValues?: Array<{ playerId?: number; playerName: string; amount: number }>;
  draftTeams?: Array<{ slot: number; teamName: string; remainingBudget?: number }>;
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }

function resolveTeam(teams: Awaited<ReturnType<typeof getState>>["teams"], incomingName: string, aliases: Record<string, number> = {}) {
  const normalizedIncoming = normalize(incomingName);
  const aliased = teams.find((team) => team.id === aliases[normalizedIncoming]);
  if (aliased) return { team: aliased };
  const exact = teams.filter((team) => normalize(team.name) === normalizedIncoming);
  if (exact.length === 1) return { team: exact[0] };
  const fuzzy = teams.filter((team) => normalizedIncoming.includes(normalize(team.name)) || normalize(team.name).includes(normalizedIncoming));
  if (fuzzy.length === 1) return { team: fuzzy[0] };
  if (fuzzy.length > 1) return { issue: `Team '${incomingName}' ambiguously matched ${fuzzy.map((team) => `'${team.name}'`).join(", ")}` };
  return { issue: `Team '${incomingName}' was not found` };
}

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    const payload = JSON.parse(text) as RelayPayload;
    const current = await getState();
    let players;
    const incomingLeagueId = Number(payload.league?.leagueId || 0);
    const draftLeagueId = current.relay.draftLeagueId ?? null;
    if (draftLeagueId && incomingLeagueId && incomingLeagueId !== draftLeagueId) {
      return NextResponse.json({
        error: `The app is set to listen to ESPN draft league ${draftLeagueId}, but this tab is league ${incomingLeagueId}. Enter ${incomingLeagueId} in Auction Room's live-link panel before using this tab.`,
        code: "LEAGUE_MISMATCH",
      }, { status: 409, headers: cors });
    }
    if (!draftLeagueId && incomingLeagueId && incomingLeagueId !== current.config.leagueId) {
      const protectedSetup = leagueSwitchBlockReason(current);
      if (protectedSetup) {
        return NextResponse.json({
          error: `The app is tracking league ${current.config.leagueId}, where ${protectedSetup}. It will not automatically replace that setup with league ${incomingLeagueId}. Enter ${incomingLeagueId} in Auction Room's live-link panel to use it without replacing your setup.`,
          code: "LEAGUE_MISMATCH",
        }, { status: 409, headers: cors });
      }
      const replacement = await replaceLeague({
        ...current.config,
        leagueId: incomingLeagueId,
        seasonId: payload.league?.seasonId || current.config.seasonId,
        myTeamId: payload.league?.myTeamId || current.config.myTeamId,
      });
      players = replacement.players;
    } else {
      players = await getPlayers();
    }
    const resolvedAuctionValues = (payload.auctionValues ?? []).flatMap((incoming) => {
      const player = players.find((item) => item.id === incoming.playerId)
        ?? players.find((item) => normalize(item.name) === normalize(incoming.playerName));
      const amount = Number(incoming.amount);
      if (!player || !Number.isInteger(amount) || amount < 0 || amount > 200) return [];
      return [{ playerId: player.id, playerName: player.name, amount }];
    });
    const auctionValuesChanged = resolvedAuctionValues.length
      ? await saveEspnAuctionValues((await getState()).config, resolvedAuctionValues)
      : 0;
    let imported = 0;
    const skipped: Array<{ player: string; reason: string }> = [];
    const saved = await mutateState((state) => {
      const visibleSales = payload.sales?.length ?? 0;
      const shouldUpdateVisibleCount = visibleSales > 0 || state.sales.length === 0;
      const source = payload.transport === "extension" ? "extension" : "pasted";
      const sourceLabel = source === "extension" ? "ESPN extension" : "ESPN pasted relay";
      state.relay = {
        connected: true,
        lastSeenAt: new Date().toISOString(),
        message: payload.type === "snapshot" && shouldUpdateVisibleCount
          ? `${sourceLabel} connected · ${visibleSales} sales visible`
          : state.relay.message,
        source,
        draftLeagueId: state.relay.draftLeagueId ?? null,
        draftTeamOrder: state.relay.draftTeamOrder ?? [],
        draftTeamAliases: state.relay.draftTeamAliases ?? {},
        draftTeamNames: state.relay.draftTeamNames ?? {},
        draftTeamBudgets: state.relay.draftTeamBudgets ?? {},
      };
      const incomingDraftTeams = (payload.draftTeams ?? []).slice().sort((a, b) => Number(a.slot) - Number(b.slot));
      const draftTeamMatches = incomingDraftTeams.map((incoming) => ({
        incoming,
        teamId: resolveTeam(state.teams, String(incoming.teamName ?? ""), state.relay.draftTeamAliases).team?.id,
      }));
      const matchedTeamIds = new Set(draftTeamMatches.flatMap((match) => match.teamId ?? []));
      const unmatched = draftTeamMatches.filter((match) => match.teamId === undefined);
      const unmatchedConfiguredTeams = state.teams.filter((team) => !matchedTeamIds.has(team.id));
      if (unmatched.length === 1 && unmatchedConfiguredTeams.length === 1) unmatched[0].teamId = unmatchedConfiguredTeams[0].id;
      const uniqueDraftOrder = [...new Set(draftTeamMatches.flatMap((match) => match.teamId ?? []))];
      if (uniqueDraftOrder.length) {
        state.relay.draftTeamOrder = uniqueDraftOrder;
        state.relay.draftTeamAliases = {
          ...state.relay.draftTeamAliases,
          ...Object.fromEntries(draftTeamMatches.flatMap((match) => match.teamId === undefined
            ? []
            : [[normalize(String(match.incoming.teamName ?? "")), match.teamId]])),
        };
        state.relay.draftTeamNames = {
          ...state.relay.draftTeamNames,
          ...Object.fromEntries(draftTeamMatches.flatMap((match) => match.teamId === undefined
            ? []
            : [[String(match.teamId), String(match.incoming.teamName ?? "").trim()]])),
        };
      }
      const incomingSales = (payload.sales ?? []).map((incoming) => {
        const player = players.find((item) => item.id === incoming.playerId)
          ?? players.find((item) => normalize(item.name) === normalize(incoming.playerName));
        const teamMatch = resolveTeam(state.teams, incoming.teamName, state.relay.draftTeamAliases);
        return { incoming, player, teamMatch, team: teamMatch.team };
      });
      state.relay.draftTeamBudgets = inferDraftTeamBudgets(
        state,
        draftTeamMatches.flatMap(({ incoming, teamId }) => {
          const remainingBudget = Number(incoming.remainingBudget);
          return teamId !== undefined && Number.isInteger(remainingBudget) && remainingBudget >= 0
            ? [{ teamId, remainingBudget }]
            : [];
        }),
        incomingSales.flatMap(({ incoming, player, team }) => team ? [{
          playerId: player?.id ?? incoming.playerId,
          playerName: player?.name ?? incoming.playerName,
          teamId: team.id,
          amount: Number(incoming.amount),
        }] : []),
      );
      for (const { incoming, player, teamMatch, team } of incomingSales) {
        if (!player) {
          skipped.push({ player: incoming.playerName, reason: "Player was not found in the ESPN universe" });
          continue;
        }
        if (!team) {
          skipped.push({ player: incoming.playerName, reason: teamMatch.issue ?? `Team '${incoming.teamName}' was not found` });
          continue;
        }
        if (state.sales.some((sale) => sale.playerId === player.id)) continue;
        const issue = assertValidSale(state, player, team.id, Number(incoming.amount));
        if (issue) {
          skipped.push({ player: incoming.playerName, reason: issue });
          continue;
        }
        const sale: Sale = {
          id: crypto.randomUUID(), playerId: player.id, playerName: player.name, position: player.position,
          teamId: team.id, amount: Number(incoming.amount), source: "espn-relay", createdAt: new Date().toISOString(),
        };
        state.sales.push(sale);
        imported += 1;
      }
      if (payload.nomination) {
        const player = players.find((item) => item.id === payload.nomination?.playerId)
          ?? players.find((item) => normalize(item.name) === normalize(payload.nomination?.playerName ?? ""));
        const leadingTeam = payload.nomination.leadingTeamName
          ? resolveTeam(state.teams, payload.nomination.leadingTeamName, state.relay.draftTeamAliases).team
          : undefined;
        if (player && !state.sales.some((sale) => sale.playerId === player.id)) {
          const preserveKnownLeader = !payload.nomination.leadingTeamName
            && state.nomination?.playerId === player.id
            && state.nomination.askingBid === payload.nomination.askingBid;
          state.nomination = {
            playerId: player.id,
            askingBid: payload.nomination.askingBid,
            leadingTeamId: leadingTeam?.id ?? (preserveKnownLeader ? state.nomination?.leadingTeamId : undefined),
            source: "espn-relay",
          };
        }
      }
    });
    return NextResponse.json({
      ok: true,
      sales: saved.sales.length,
      received: payload.sales?.length ?? 0,
      imported,
      skipped,
      auctionValuesReceived: resolvedAuctionValues.length,
      auctionValuesChanged,
    }, { headers: cors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Relay failed" }, { status: 400, headers: cors });
  }
}
