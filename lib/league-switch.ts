import type { DraftState } from "@/lib/types";

type LeagueSwitchState = Pick<DraftState, "sales" | "keepers" | "teams">;

export function leagueSwitchBlockReason(state: LeagueSwitchState): string | null {
  if (state.sales.length) return `${state.sales.length} auction sale${state.sales.length === 1 ? " is" : "s are"} recorded`;
  if (state.keepers.length) return `${state.keepers.length} keeper${state.keepers.length === 1 ? " is" : "s are"} configured`;
  const aliases = state.teams.filter((team) => team.alias?.trim()).length;
  if (aliases) return `${aliases} team nickname${aliases === 1 ? " is" : "s are"} configured`;
  return null;
}
