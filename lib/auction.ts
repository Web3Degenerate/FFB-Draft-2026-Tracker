import type { DraftState, Player, Position, TeamSnapshot, TierSnapshot } from "./types";
import { teamDisplayName } from "./teams";

export const STARTER_TARGETS: Record<Position, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DST: 1,
};

const emptyCounts = (): Record<Position, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 });

export function teamSnapshots(state: DraftState): TeamSnapshot[] {
  return state.teams.map((team) => {
    const sales = state.sales.filter((sale) => sale.teamId === team.id);
    const keepers = state.keepers.filter((keeper) => keeper.teamId === team.id);
    const roster = [...keepers, ...sales];
    const spent = roster.reduce((sum, player) => sum + player.amount, 0);
    const counts = emptyCounts();
    roster.forEach((player) => { counts[player.position] += 1; });
    const rosterCount = roster.length;
    const spotsLeft = Math.max(0, state.config.rosterSize - rosterCount);
    const startingBudget = state.relay.draftTeamBudgets?.[String(team.id)] ?? state.config.budget;
    const budgetLeft = startingBudget - spent;
    const maxBid = spotsLeft > 0 ? Math.max(0, budgetLeft - Math.max(0, spotsLeft - 1)) : 0;
    const needs = (Object.keys(STARTER_TARGETS) as Position[]).filter((position) => counts[position] < STARTER_TARGETS[position]);
    const skillStarters = Math.min(counts.RB, 2) + Math.min(counts.WR, 2) + Math.min(counts.TE, 1);
    if (skillStarters >= 5 && skillStarters < 6) {
      (["RB", "WR", "TE"] as Position[]).forEach((position) => {
        if (!needs.includes(position)) needs.push(position);
      });
    }
    return { ...team, startingBudget, spent, budgetLeft, rosterCount, keeperCount: keepers.length, spotsLeft, maxBid, counts, needs };
  });
}

export function availablePlayers(state: DraftState, players: Player[]): Player[] {
  const unavailable = new Set([...state.sales.map((sale) => sale.playerId), ...state.keepers.map((keeper) => keeper.playerId)]);
  return players
    .filter((player) => !unavailable.has(player.id))
    .map((player) => ({ ...player, tier: state.tierOverrides[String(player.id)] ?? player.tier }));
}

export function calculateInflation(state: DraftState, players: Player[]): number {
  const teams = teamSnapshots(state);
  const premiumCash = teams.reduce((sum, team) => sum + Math.max(0, team.budgetLeft - team.spotsLeft), 0);
  const premiumValue = availablePlayers(state, players).reduce((sum, player) => sum + Math.max(0, player.espnKeeperValue - 1), 0);
  if (premiumValue <= 0) return 1;
  const initialPremiumCash = teams.reduce((sum, team) => sum + Math.max(0, team.startingBudget - state.config.rosterSize), 0);
  const initialPremiumValue = players.reduce((sum, player) => sum + Math.max(0, player.espnKeeperValue - 1), 0);
  const initialRatio = initialPremiumValue > 0 ? initialPremiumCash / initialPremiumValue : 1;
  return (premiumCash / premiumValue) / initialRatio;
}

export function calculateMarketMultiplier(state: DraftState, players: Player[]): number {
  const teams = teamSnapshots(state);
  const premiumCash = teams.reduce((sum, team) => sum + Math.max(0, team.budgetLeft - team.spotsLeft), 0);
  const premiumValue = availablePlayers(state, players).reduce((sum, player) => sum + Math.max(0, player.espnKeeperValue - 1), 0);
  return premiumValue > 0 ? premiumCash / premiumValue : 1;
}

export function tierSnapshots(state: DraftState, players: Player[]): TierSnapshot[] {
  const teams = teamSnapshots(state).filter((team) => team.spotsLeft > 0);
  const groups = new Map<string, Player[]>();
  availablePlayers(state, players).forEach((player) => {
    const key = `${player.position}:${player.tier}`;
    groups.set(key, [...(groups.get(key) ?? []), player]);
  });
  return [...groups.entries()].map(([, group]) => {
    const first = group[0];
    const benchmark = Math.max(1, Math.round(group.reduce((sum, p) => sum + p.espnKeeperValue, 0) / group.length));
    const teamsNeeding = teams.filter((team) => team.needs.includes(first.position)).length;
    const teamsCanAfford = teams.filter((team) => team.maxBid >= benchmark).length;
    const effectiveDemand = Math.min(teamsNeeding, teamsCanAfford);
    let pressure: TierSnapshot["pressure"] = "CALM";
    if (group.length === 1 && effectiveDemand >= 2) pressure = "LAST CALL";
    else if (group.length <= effectiveDemand) pressure = "TIGHT";
    else if (group.length <= effectiveDemand + 2) pressure = "WATCH";
    return { tier: first.tier, position: first.position, playersLeft: group.length, teamsNeeding, teamsCanAfford, benchmark, pressure };
  }).sort((a, b) => {
    const posOrder = ["RB", "WR", "QB", "TE", "DST", "K"];
    const aTier = Number(a.tier.match(/\d+/)?.[0] ?? 999);
    const bTier = Number(b.tier.match(/\d+/)?.[0] ?? 999);
    return aTier - bTier || posOrder.indexOf(a.position) - posOrder.indexOf(b.position);
  });
}

export function assertValidSale(state: DraftState, player: Player, teamId: number, amount: number): string | null {
  const team = teamSnapshots(state).find((item) => item.id === teamId);
  if (!team) return "Choose a valid team.";
  if (state.sales.some((sale) => sale.playerId === player.id)) return `${player.name} has already been sold.`;
  if (state.keepers.some((keeper) => keeper.playerId === player.id)) return `${player.name} is already assigned as a keeper.`;
  if (!Number.isInteger(amount) || amount < 1) return "Winning bid must be a whole dollar of at least $1.";
  if (team.spotsLeft < 1) return `${teamDisplayName(team)} has no roster spots left.`;
  if (amount > team.maxBid) return `${teamDisplayName(team)} can bid at most $${team.maxBid}.`;
  return null;
}

export function assertValidKeeper(state: DraftState, player: Player, teamId: number, amount: number): string | null {
  const team = teamSnapshots(state).find((item) => item.id === teamId);
  if (!team) return "Choose a valid team.";
  if (state.sales.some((sale) => sale.playerId === player.id)) return `${player.name} has already been sold.`;
  if (state.keepers.some((keeper) => keeper.playerId === player.id)) return `${player.name} is already assigned as a keeper.`;
  if (team.keeperCount >= 2) return `${teamDisplayName(team)} already has two keepers.`;
  if (!Number.isInteger(amount) || amount < 0) return "Keeper price must be a whole dollar of at least $0.";
  if (team.spotsLeft < 1) return `${teamDisplayName(team)} has no roster spots left.`;
  if (amount > team.maxBid) return `${teamDisplayName(team)} can spend at most $${team.maxBid} while reserving $1 for each remaining roster spot.`;
  return null;
}

export function assertValidKeeperPrice(state: DraftState, keeperId: string, amount: number): string | null {
  const keeper = state.keepers.find((item) => item.id === keeperId);
  if (!keeper) return "Keeper not found.";
  if (!Number.isInteger(amount) || amount < 0) return "Keeper price must be a whole dollar of at least $0.";
  const team = teamSnapshots(state).find((item) => item.id === keeper.teamId);
  if (!team) return "Keeper team not found.";
  const availableIncrease = Math.max(0, team.budgetLeft - team.spotsLeft);
  const maximumPrice = keeper.amount + availableIncrease;
  if (amount > maximumPrice) return `${teamDisplayName(team)} can set this keeper price to at most $${maximumPrice} while reserving $1 for every open roster spot.`;
  return null;
}

export function clearAuctionResults(state: DraftState): void {
  state.sales = [];
  state.nomination = null;
  state.relay = { connected: false, lastSeenAt: null, message: "Manual mode ready", source: null };
}
