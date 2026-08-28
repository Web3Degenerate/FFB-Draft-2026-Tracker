import { readFile } from "node:fs/promises";
import path from "node:path";
import { ArrowLeft, Warning } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { FantasyIndexHistory } from "@/lib/history";
import RankingsHistoryClient from "./rankings-history-client";

export const dynamic = "force-dynamic";

async function readHistory(): Promise<FantasyIndexHistory | null> {
  try {
    const file = path.join(process.cwd(), "data", "fantasy-index-history.json");
    return JSON.parse(await readFile(file, "utf8")) as FantasyIndexHistory;
  } catch {
    return null;
  }
}

export default async function RankingsHistoryPage() {
  const history = await readHistory();
  if (history) return <RankingsHistoryClient history={history} />;
  return <main className="loading-screen"><Warning size={36} /><h1>Couldn’t open Rankings History</h1><p>Historical Fantasy Index rankings have not been imported.</p><Link className="back-link" href="/"><ArrowLeft /> Auction Room</Link></main>;
}
