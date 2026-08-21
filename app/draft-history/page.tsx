import type { Metadata } from "next";
import draftHistoryJson from "@/lib/draft-history-data.json";
import type { DraftHistoryData } from "@/lib/draft-history";
import DraftHistoryClient from "./draft-history-client";

export const metadata: Metadata = {
  title: "Draft History · Auction Room",
  description: "Sortable 2023–2025 league keeper and auction results",
};

export default function DraftHistoryPage() {
  return <DraftHistoryClient data={draftHistoryJson as DraftHistoryData} />;
}
