import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

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

    const receivedAt = new Date().toISOString();
    const lines = frames.map((frame) => JSON.stringify({ receivedAt, league: payload.league ?? null, frame })).join("\n") + "\n";
    const operation = archiveQueue.then(async () => {
      await mkdir(path.dirname(archivePath), { recursive: true });
      await appendFile(archivePath, lines, "utf8");
    });
    archiveQueue = operation.catch(() => undefined);
    await operation;

    return NextResponse.json({ ok: true, archived: frames.length }, { headers: cors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Socket archive failed" }, { status: 400, headers: cors });
  }
}
