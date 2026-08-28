import type { DraftState, Position, TeamSnapshot } from "./types";

export function opponentPositionSpend(state: DraftState, teamId: number, position: Position): number {
  return [...state.keepers, ...state.sales]
    .filter((player) => player.teamId === teamId && player.position === position)
    .reduce((sum, player) => sum + player.amount, 0);
}

export function sortOpponentTeamsByPosition(state: DraftState, teams: TeamSnapshot[], position: Position): TeamSnapshot[] {
  return [...teams].sort((a, b) => {
    const countDifference = a.counts[position] - b.counts[position];
    if (countDifference) return countDifference;
    const spendDifference = opponentPositionSpend(state, a.id, position) - opponentPositionSpend(state, b.id, position);
    if (spendDifference) return spendDifference;
    return a.name.localeCompare(b.name);
  });
}
