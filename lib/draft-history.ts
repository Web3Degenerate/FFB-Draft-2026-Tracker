export type DraftHistoryEntry = {
  number: number;
  teamId: number;
  manager: string;
  teamName: string;
  player: string;
  nflTeam: string;
  position: string;
  amount: number;
};

export type DraftHistorySeason = {
  year: number;
  source: string;
  keepers: DraftHistoryEntry[];
  auctions: DraftHistoryEntry[];
};

export type DraftHistoryData = {
  sourceWorkbook: string;
  seasons: DraftHistorySeason[];
};

export type DraftHistoryColumn = keyof DraftHistoryEntry;
export type DraftHistorySort = {
  column: DraftHistoryColumn;
  direction: "asc" | "desc";
};
export type DraftHistoryFilters = Partial<Record<DraftHistoryColumn, string>>;

const displayValue = (entry: DraftHistoryEntry, column: DraftHistoryColumn) => String(entry[column]);

export function sortDraftHistoryEntries(
  entries: DraftHistoryEntry[],
  sort: DraftHistorySort,
): DraftHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const leftValue = left[sort.column];
    const rightValue = right[sort.column];
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });

    return (sort.direction === "asc" ? comparison : -comparison) || left.number - right.number;
  });
}

export function filterAndSortDraftHistoryEntries(
  entries: DraftHistoryEntry[],
  filters: DraftHistoryFilters,
  sort: DraftHistorySort,
): DraftHistoryEntry[] {
  const activeFilters = Object.entries(filters).filter(
    (entry): entry is [DraftHistoryColumn, string] => Boolean(entry[1]?.trim()),
  );
  const filtered = entries.filter((entry) => activeFilters.every(([column, query]) =>
    displayValue(entry, column).toLowerCase().includes(query.trim().toLowerCase()),
  ));

  return sortDraftHistoryEntries(filtered, sort);
}
