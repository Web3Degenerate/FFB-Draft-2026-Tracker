import type { Position } from "./types";

type PositionCounts = Record<Position, number>;

export type WhoNeedsMarker = {
  count: number;
  tone: "need" | "surplus";
};

export function whoNeedsMarker(counts: PositionCounts, position: Position): WhoNeedsMarker | null {
  const count = counts[position] ?? 0;
  if (position === "RB" || position === "WR") {
    if (count < 2) return { count, tone: "need" };
    if (count >= 3) return { count, tone: "surplus" };
    return null;
  }
  return count === 0 ? { count, tone: "need" } : null;
}

export function rosterSlotPosition(slotKey: string): Position | null {
  if (slotKey === "QB") return "QB";
  if (slotKey.startsWith("RB")) return "RB";
  if (slotKey.startsWith("WR")) return "WR";
  if (slotKey === "TE") return "TE";
  if (slotKey === "K") return "K";
  if (slotKey === "DST") return "DST";
  return null;
}
