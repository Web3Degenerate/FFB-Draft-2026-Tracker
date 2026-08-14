import { NextRequest, NextResponse } from "next/server";
import { assertValidSale } from "@/lib/auction";
import { fetchCompletedPicks } from "@/lib/espn";
import { getPlayers, getState, mutateState } from "@/lib/store";
import type { Player, Sale } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function syncRestPicks(players: Player[]) {
  const current = await getState();
  try {
    const picks = await fetchCompletedPicks(current.config);
    const fresh = picks.filter((pick) => !current.sales.some((sale) => sale.playerId === pick.playerId));
    if (!fresh.length) return current;
    return mutateState((state) => {
      fresh.forEach((pick) => {
        const player = players.find((item) => item.id === pick.playerId);
        if (!player || state.sales.some((sale) => sale.playerId === player.id)) return;
        if (assertValidSale(state, player, pick.teamId, pick.amount)) return;
        const sale: Sale = {
          id: crypto.randomUUID(), playerId: player.id, playerName: player.name, position: player.position,
          teamId: pick.teamId, amount: pick.amount, source: "espn-rest", createdAt: new Date().toISOString(),
        };
        state.sales.push(sale);
        if (state.nomination?.playerId === player.id) state.nomination = null;
      });
    });
  } catch {
    return current;
  }
}

export async function GET(request: NextRequest) {
  try {
    let state = await getState();
    if (request.nextUrl.searchParams.get("stateOnly") === "1") return NextResponse.json({ state });
    const players = await getPlayers();
    state = await syncRestPicks(players);
    return NextResponse.json({ state, players });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load draft room" }, { status: 500 });
  }
}
