import { NextRequest, NextResponse } from "next/server";
import { assertValidKeeper, assertValidKeeperPrice, assertValidSale, clearAuctionResults } from "@/lib/auction";
import { getPlayers, mutateState } from "@/lib/store";
import { isCompleteTierOrder } from "@/lib/tier-order";
import { isCompleteWatchListOrder } from "@/lib/watch-list-order";
import type { Keeper, Sale } from "@/lib/types";
import type { Position } from "@/lib/types";

export const runtime = "nodejs";
const VALID_POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DST"]);

type Action =
  | { type: "nominate"; playerId: number }
  | { type: "clear-nomination" }
  | { type: "sell"; playerId: number; teamId: number; amount: number }
  | { type: "undo" }
  | { type: "set-tier"; playerId: number; tier: string }
  | { type: "set-tier-order"; tier: string; playerIds: number[] }
  | { type: "set-watch-list-player"; playerId: number; included: boolean }
  | { type: "set-watch-list-order"; position: Position; playerIds: number[] }
  | { type: "add-keeper"; playerId: number; teamId: number; amount: number }
  | { type: "update-keeper-price"; keeperId: string; amount: number }
  | { type: "remove-keeper"; keeperId: string }
  | { type: "set-team-alias"; teamId: number; alias: string }
  | { type: "reset" };

export async function POST(request: NextRequest) {
  try {
    const action = await request.json() as Action;
    const players = await getPlayers();
    const state = await mutateState((draft) => {
      if (action.type === "nominate") {
        const player = players.find((item) => item.id === action.playerId);
        if (!player) throw new Error("Player not found.");
        draft.nomination = { playerId: player.id, source: "manual" };
      } else if (action.type === "clear-nomination") {
        draft.nomination = null;
      } else if (action.type === "sell") {
        const player = players.find((item) => item.id === action.playerId);
        if (!player) throw new Error("Player not found.");
        const issue = assertValidSale(draft, player, Number(action.teamId), Number(action.amount));
        if (issue) throw new Error(issue);
        const sale: Sale = {
          id: crypto.randomUUID(), playerId: player.id, playerName: player.name, position: player.position,
          teamId: Number(action.teamId), amount: Number(action.amount), source: "manual", createdAt: new Date().toISOString(),
        };
        draft.sales.push(sale);
        draft.nomination = null;
      } else if (action.type === "undo") {
        draft.sales.pop();
      } else if (action.type === "set-tier") {
        const player = players.find((item) => item.id === action.playerId);
        if (!player) throw new Error("Player not found.");
        const tier = action.tier.trim().toUpperCase();
        if (!tier) delete draft.tierOverrides[String(action.playerId)];
        else if (!tier.startsWith(player.position)) throw new Error(`${player.name}'s tier must begin with ${player.position}.`);
        else draft.tierOverrides[String(action.playerId)] = tier;
      } else if (action.type === "set-tier-order") {
        const tier = String(action.tier ?? "").trim().toUpperCase();
        const playerIds = Array.isArray(action.playerIds) ? action.playerIds.map(Number) : [];
        if (!tier || !playerIds.every(Number.isInteger) || !isCompleteTierOrder(draft, players, tier, playerIds)) throw new Error("Tier order must include every player in that tier exactly once.");
        draft.tierOrders[tier] = playerIds;
      } else if (action.type === "set-watch-list-player") {
        const player = players.find((item) => item.id === action.playerId);
        if (!player) throw new Error("Player not found.");
        const watchList = new Set(draft.watchList ?? []);
        if (action.included) watchList.add(player.id);
        else watchList.delete(player.id);
        draft.watchList = [...watchList];
        if (!action.included) Object.keys(draft.watchListOrders).forEach((position) => { draft.watchListOrders[position as Position] = draft.watchListOrders[position as Position]?.filter((playerId) => playerId !== player.id); });
      } else if (action.type === "set-watch-list-order") {
        const position = String(action.position ?? "").toUpperCase() as Position;
        const playerIds = Array.isArray(action.playerIds) ? action.playerIds.map(Number) : [];
        if (!VALID_POSITIONS.has(position) || !playerIds.every(Number.isInteger) || !isCompleteWatchListOrder(draft, players, position, playerIds)) throw new Error("Watch List order must include every watched player in that position exactly once.");
        draft.watchListOrders[position] = playerIds;
      } else if (action.type === "add-keeper") {
        const player = players.find((item) => item.id === action.playerId);
        if (!player) throw new Error("Player not found.");
        const issue = assertValidKeeper(draft, player, Number(action.teamId), Number(action.amount));
        if (issue) throw new Error(issue);
        const keeper: Keeper = {
          id: crypto.randomUUID(), playerId: player.id, playerName: player.name, position: player.position,
          teamId: Number(action.teamId), amount: Number(action.amount), createdAt: new Date().toISOString(),
        };
        draft.keepers.push(keeper);
        if (draft.nomination?.playerId === player.id) draft.nomination = null;
      } else if (action.type === "update-keeper-price") {
        const issue = assertValidKeeperPrice(draft, action.keeperId, Number(action.amount));
        if (issue) throw new Error(issue);
        const keeper = draft.keepers.find((item) => item.id === action.keeperId);
        if (!keeper) throw new Error("Keeper not found.");
        keeper.amount = Number(action.amount);
      } else if (action.type === "remove-keeper") {
        const index = draft.keepers.findIndex((keeper) => keeper.id === action.keeperId);
        if (index < 0) throw new Error("Keeper not found.");
        draft.keepers.splice(index, 1);
      } else if (action.type === "set-team-alias") {
        const team = draft.teams.find((item) => item.id === Number(action.teamId));
        if (!team) throw new Error("Team not found.");
        const alias = String(action.alias ?? "").trim();
        if (alias.length > 24) throw new Error("Team nickname must be 24 characters or fewer.");
        team.alias = alias;
      } else if (action.type === "reset") {
        clearAuctionResults(draft);
      }
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: 400 });
  }
}
