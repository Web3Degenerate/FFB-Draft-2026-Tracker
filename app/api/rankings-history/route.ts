import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { FantasyIndexHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const file = path.join(process.cwd(), "data", "fantasy-index-history.json");
    const history = JSON.parse(await readFile(file, "utf8")) as FantasyIndexHistory;
    return NextResponse.json(history);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return NextResponse.json(
      { error: missing ? "Historical Fantasy Index rankings have not been imported." : "Unable to load Fantasy Index rankings history." },
      { status: missing ? 404 : 500 },
    );
  }
}
