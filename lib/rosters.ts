import type { DraftState, Keeper, Position, Sale } from "./types";

export const ROSTER_SLOTS = [
  { key: "QB", label: "QB" },
  { key: "RB1", label: "RB" },
  { key: "RB2", label: "RB" },
  { key: "WR1", label: "WR" },
  { key: "WR2", label: "WR" },
  { key: "TE", label: "TE" },
  { key: "FLEX", label: "FLEX" },
  { key: "DST", label: "D/ST" },
  { key: "K", label: "K" },
  { key: "BENCH1", label: "BENCH 1" },
  { key: "BENCH2", label: "BENCH 2" },
  { key: "BENCH3", label: "BENCH 3" },
  { key: "BENCH4", label: "BENCH 4" },
  { key: "BENCH5", label: "BENCH 5" },
] as const;

export type RosterSlotKey = (typeof ROSTER_SLOTS)[number]["key"];
export type RosterEntry = {
  id: string;
  playerId: number;
  playerName: string;
  position: Position;
  amount: number;
  isKeeper: boolean;
};

export type AssignedRosterSlot = (typeof ROSTER_SLOTS)[number] & { player: RosterEntry | null };

function rosterEntry(player: Keeper | Sale, isKeeper: boolean): RosterEntry {
  return {
    id: player.id,
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    amount: player.amount,
    isKeeper,
  };
}

export function assignTeamRoster(state: DraftState, teamId: number): AssignedRosterSlot[] {
  const roster = [
    ...state.keepers.filter((player) => player.teamId === teamId).map((player) => rosterEntry(player, true)),
    ...state.sales.filter((player) => player.teamId === teamId).map((player) => rosterEntry(player, false)),
  ];
  const assigned = new Set<string>();
  const slots = new Map<RosterSlotKey, RosterEntry>();

  const take = (slot: RosterSlotKey, positions: Position[]) => {
    const player = roster.find((entry) => !assigned.has(entry.id) && positions.includes(entry.position));
    if (!player) return;
    assigned.add(player.id);
    slots.set(slot, player);
  };

  take("QB", ["QB"]);
  take("RB1", ["RB"]);
  take("RB2", ["RB"]);
  take("WR1", ["WR"]);
  take("WR2", ["WR"]);
  take("TE", ["TE"]);
  take("FLEX", ["RB", "WR", "TE"]);
  take("DST", ["DST"]);
  take("K", ["K"]);

  (["BENCH1", "BENCH2", "BENCH3", "BENCH4", "BENCH5"] as RosterSlotKey[]).forEach((slot) => {
    const player = roster.find((entry) => !assigned.has(entry.id));
    if (!player) return;
    assigned.add(player.id);
    slots.set(slot, player);
  });

  return ROSTER_SLOTS.map((slot) => ({ ...slot, player: slots.get(slot.key) ?? null }));
}
