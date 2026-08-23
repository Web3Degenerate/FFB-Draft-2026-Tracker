type PickProgressState = { keepers: readonly unknown[]; sales: readonly unknown[] };

export function liveAuctionPickNumber(state: PickProgressState): number {
  return state.keepers.length + state.sales.length + 1;
}
