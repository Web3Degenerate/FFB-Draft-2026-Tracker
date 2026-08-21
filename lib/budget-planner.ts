import { assignTeamRoster, ROSTER_SLOTS, type RosterSlotKey } from "./rosters";
import type { BudgetPlanner, DraftState } from "./types";

export const DEFAULT_OPEN_SLOT_AMOUNT = 1;

const SLOT_KEYS = new Set<string>(ROSTER_SLOTS.map((slot) => slot.key));

const PLANNER_LABELS: Record<RosterSlotKey, string> = {
  QB: "QB",
  RB1: "RB1",
  RB2: "RB2",
  WR1: "WR1",
  WR2: "WR2",
  TE: "TE",
  FLEX: "FLEX",
  DST: "D/ST",
  K: "K",
  BENCH1: "B1",
  BENCH2: "B2",
  BENCH3: "B3",
  BENCH4: "B4",
  BENCH5: "B5",
};

export type BudgetPlannerRow = {
  key: RosterSlotKey;
  label: string;
  playerName: string;
  amount: number;
  locked: boolean;
  isKeeper: boolean;
};

export function budgetPlannerRows(state: DraftState, planner: BudgetPlanner = state.budgetPlanner ?? {}): BudgetPlannerRow[] {
  return assignTeamRoster(state, state.config.myTeamId).map((slot) => {
    const planned = planner[slot.key];
    return {
      key: slot.key,
      label: PLANNER_LABELS[slot.key],
      playerName: slot.player?.playerName ?? planned?.note ?? "",
      amount: slot.player?.amount ?? planned?.amount ?? DEFAULT_OPEN_SLOT_AMOUNT,
      locked: Boolean(slot.player),
      isKeeper: Boolean(slot.player?.isKeeper),
    };
  });
}

export function budgetPlannerSummary(state: DraftState, planner: BudgetPlanner = state.budgetPlanner ?? {}) {
  const rows = budgetPlannerRows(state, planner);
  const allocated = rows.reduce((total, row) => total + row.amount, 0);
  return { rows, allocated, remaining: state.config.budget - allocated };
}

export function parseBudgetPlanner(value: unknown): BudgetPlanner {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Budget plan must be an object.");
  const planner: BudgetPlanner = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (!SLOT_KEYS.has(key)) throw new Error("Budget plan contains an unknown roster slot.");
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Budget plan entry is invalid.");
    const note = (entry as { note?: unknown }).note;
    const amount = (entry as { amount?: unknown }).amount;
    if (typeof note !== "string" || note.length > 60) throw new Error("Player notes must be 60 characters or fewer.");
    if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > 999) throw new Error("Planned amounts must be whole dollars from $0 to $999.");
    planner[key] = { note: note.trim(), amount: amount as number };
  });
  return planner;
}
