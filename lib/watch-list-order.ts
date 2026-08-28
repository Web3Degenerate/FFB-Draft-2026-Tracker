import { sortPlayersByTierOrder } from "./tier-order";
import type { Player, Position } from "./types";

type WatchListOrderingState = {
  tierOverrides: Record<string, string>;
  tierOrders?: Record<string, number[]>;
  watchList: number[];
  watchListOrders?: Partial<Record<Position, number[]>>;
};

export function sortWatchListPlayers(players: Player[], state: WatchListOrderingState, position: Position): Player[] {
  const fallback = sortPlayersByTierOrder(players.filter((player) => player.position === position), state);
  const fallbackIndex = new Map(fallback.map((player, index) => [player.id, index]));
  const savedIndex = new Map((state.watchListOrders?.[position] ?? []).map((playerId, index) => [playerId, index]));
  return [...fallback].sort((a, b) => {
    const aSaved = savedIndex.get(a.id);
    const bSaved = savedIndex.get(b.id);
    if (aSaved !== undefined || bSaved !== undefined) {
      if (aSaved === undefined) return 1;
      if (bSaved === undefined) return -1;
      return aSaved - bSaved;
    }
    return (fallbackIndex.get(a.id) ?? 0) - (fallbackIndex.get(b.id) ?? 0);
  });
}

export function isCompleteWatchListOrder(state: WatchListOrderingState, players: Player[], position: Position, playerIds: number[]): boolean {
  const watched = new Set(state.watchList);
  const expected = players.filter((player) => player.position === position && watched.has(player.id)).map((player) => player.id);
  if (expected.length !== playerIds.length || new Set(playerIds).size !== playerIds.length) return false;
  const submitted = new Set(playerIds);
  return expected.every((playerId) => submitted.has(playerId));
}
