import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { assertValidSale } from "@/lib/auction";
import { parseEspnSocketEvents } from "@/lib/espn-socket";
import { getPlayers, getState, mutateState } from "@/lib/store";
import type { Sale } from "@/lib/types";

export const runtime = "nodejs";

type SocketFrame = {
  timestamp: string;
  channel: "websocket" | "eventsource";
  direction: "incoming" | "outgoing";
  endpoint: string;
  dataType: "text" | "binary";
  data: string;
};

type SocketPayload = {
  league?: { leagueId: number; seasonId: number; myTeamId: number };
  frames?: SocketFrame[];
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const archivePath = path.join(process.cwd(), "data", "espn-socket-frames.ndjson");
let archiveQueue: Promise<unknown> = Promise.resolve();

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

function safeFrames(payload: SocketPayload) {
  return (payload.frames ?? []).slice(0, 500).filter((frame) =>
    frame
    && (frame.channel === "websocket" || frame.channel === "eventsource")
    && (frame.direction === "incoming" || frame.direction === "outgoing")
    && (frame.dataType === "text" || frame.dataType === "binary")
    && typeof frame.data === "string"
    && frame.data.length <= 1_000_000,
  ).map((frame) => ({
    ...frame,
    data: frame.dataType === "text" ? frame.data.replace(/^TOKEN\s+\S+/gm, "TOKEN [REDACTED]") : frame.data,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const payload = JSON.parse(await request.text()) as SocketPayload;
    const frames = safeFrames(payload);
    if (!frames.length) return NextResponse.json({ ok: true, archived: 0 }, { headers: cors });

    const current = await getState();
    const incomingLeagueId = Number(payload.league?.leagueId || 0);
    const selectedLeagueId = current.relay.draftLeagueId ?? current.config.leagueId;
    if (incomingLeagueId && incomingLeagueId !== selectedLeagueId) {
      return NextResponse.json({ error: `Ignoring socket frames from ESPN draft league ${incomingLeagueId}; the app is listening to ${selectedLeagueId}.` }, { status: 409, headers: cors });
    }

    const receivedAt = new Date().toISOString();
    const lines = frames.map((frame) => JSON.stringify({ receivedAt, league: payload.league ?? null, frame })).join("\n") + "\n";
    const operation = archiveQueue.then(async () => {
      await mkdir(path.dirname(archivePath), { recursive: true });
      await appendFile(archivePath, lines, "utf8");
    });
    archiveQueue = operation.catch(() => undefined);
    await operation;

    const events = parseEspnSocketEvents(frames);
    let bidsApplied = 0;
    let salesApplied = 0;
    const skipped: Array<{ playerId: number; reason: string }> = [];
    if (events.some((event) => event.type === "bid" || event.type === "sold")) {
      const players = await getPlayers();
      const playerById = new Map(players.map((player) => [player.id, player]));
      await mutateState((state) => {
        events.forEach((event) => {
          if (event.type === "nomination") return;
          const player = playerById.get(event.playerId);
          const team = state.teams.find((item) => item.id === event.teamId);
          if (!player || !team) {
            skipped.push({ playerId: event.playerId, reason: !player ? "Player was not found" : `Team ${event.teamId} was not found` });
            return;
          }
          if (event.type === "bid") {
            if (state.sales.some((sale) => sale.playerId === player.id) || state.keepers.some((keeper) => keeper.playerId === player.id)) return;
            state.nomination = { playerId: player.id, askingBid: event.amount, leadingTeamId: team.id, source: "espn-relay" };
            bidsApplied += 1;
            return;
          }
          if (state.sales.some((sale) => sale.playerId === player.id)) {
            if (state.nomination?.playerId === player.id) state.nomination = null;
            return;
          }
          const issue = assertValidSale(state, player, team.id, event.amount);
          if (issue) {
            skipped.push({ playerId: player.id, reason: issue });
            return;
          }
          const sale: Sale = {
            id: crypto.randomUUID(),
            playerId: player.id,
            playerName: player.name,
            position: player.position,
            teamId: team.id,
            amount: event.amount,
            source: "espn-relay",
            createdAt: new Date().toISOString(),
          };
          state.sales.push(sale);
          if (state.nomination?.playerId === player.id) state.nomination = null;
          salesApplied += 1;
        });
      });
    }

    return NextResponse.json({ ok: true, archived: frames.length, bidsApplied, salesApplied, skipped }, { headers: cors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Socket archive failed" }, { status: 400, headers: cors });
  }
}
