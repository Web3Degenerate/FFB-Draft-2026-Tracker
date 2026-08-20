import type { DraftState } from "./types";

type DraftBudgetReading = { teamId: number; remainingBudget: number };
type PendingDraftSale = { playerId?: number; playerName: string; teamId: number; amount: number };

function playerKey(player: Pick<PendingDraftSale, "playerId" | "playerName">): string {
  return player.playerId ? `id:${player.playerId}` : `name:${player.playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export function inferDraftTeamBudgets(
  state: DraftState,
  readings: DraftBudgetReading[],
  pendingSales: PendingDraftSale[],
): Record<string, number> {
  const budgets = { ...(state.relay.draftTeamBudgets ?? {}) };

  readings.forEach(({ teamId, remainingBudget }) => {
    if (!Number.isInteger(remainingBudget) || remainingBudget < 0) return;
    const keepers = state.keepers.filter((keeper) => keeper.teamId === teamId);
    const sales = state.sales.filter((sale) => sale.teamId === teamId);
    const knownPlayers = new Set([...keepers, ...sales].map(playerKey));
    const pendingPlayers = new Set<string>();
    const pendingSpend = pendingSales.reduce((sum, sale) => {
      if (sale.teamId !== teamId || !Number.isInteger(sale.amount) || sale.amount < 1) return sum;
      const key = playerKey(sale);
      if (knownPlayers.has(key) || pendingPlayers.has(key)) return sum;
      pendingPlayers.add(key);
      return sum + sale.amount;
    }, 0);
    const knownSpend = [...keepers, ...sales].reduce((sum, player) => sum + player.amount, 0);
    const inferred = remainingBudget + knownSpend + pendingSpend;
    const current = budgets[String(teamId)];
    budgets[String(teamId)] = current === undefined ? inferred : Math.max(current, inferred);
  });

  return budgets;
}
