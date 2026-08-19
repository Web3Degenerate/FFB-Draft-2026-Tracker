import { NextResponse } from "next/server";
import { loadPlayerDataCaches, mergePlayerProfiles } from "@/lib/player-data";
import { getLocalPlayerDataBase } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ players, watchList }, { caches, meta }] = await Promise.all([
      getLocalPlayerDataBase(),
      loadPlayerDataCaches(),
    ]);
    return NextResponse.json({ profiles: mergePlayerProfiles(players, caches), watchList, meta });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load local player research" }, { status: 500 });
  }
}
