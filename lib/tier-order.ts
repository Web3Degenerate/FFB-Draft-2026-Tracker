import type { Player } from "./types";

type TierOrderingState = {
  tierOverrides: Record<string, string>;
  tierOrders?: Record<string, number[]>;
};

export function effectivePlayerTier(state: TierOrderingState, player: Player): string {
  return state.tierOverrides[String(player.id)] ?? player.tier;
}

export function sortPlayersByTierOrder(players: Player[], state: TierOrderingState): Player[] {
  const orderIndexes = new Map<string, Map<number, number>>();
  Object.entries(state.tierOrders ?? {}).forEach(([tier, playerIds]) => {
    orderIndexes.set(tier, new Map(playerIds.map((playerId, index) => [playerId, index])));
  });

  return [...players].sort((a, b) => {
    const aTier = effectivePlayerTier(state, a);
    const bTier = effectivePlayerTier(state, b);
    if (aTier === bTier) {
      const order = orderIndexes.get(aTier);
      const aIndex = order?.get(a.id);
      const bIndex = order?.get(b.id);
      if (aIndex !== undefined || bIndex !== undefined) {
        if (aIndex === undefined) return 1;
        if (bIndex === undefined) return -1;
        if (aIndex !== bIndex) return aIndex - bIndex;
      }
    }
    return a.positionRank - b.positionRank || a.overallRank - b.overallRank;
  });
}

export function isCompleteTierOrder(state: TierOrderingState, players: Player[], tier: string, playerIds: number[]): boolean {
  const expected = players.filter((player) => effectivePlayerTier(state, player) === tier).map((player) => player.id);
  if (expected.length !== playerIds.length || new Set(playerIds).size !== playerIds.length) return false;
  const submitted = new Set(playerIds);
  return expected.every((playerId) => submitted.has(playerId));
}
