export type HistoricalPosition = "QB" | "RB" | "WR" | "TE" | "PK" | "ST";

export type HistoricalRanking = {
  overallRank: number | null;
  positionalRank: number;
  position: HistoricalPosition;
  team: string;
  name: string;
  bye: number;
  projectedPoints: number;
};

export type HistoricalSeason = {
  year: number;
  sourceUrl: string;
  retrievedAt: string;
  projectionsUpdatedAt: string;
  rankings: HistoricalRanking[];
};

export type FantasyIndexHistory = {
  version: 1;
  generatedAt: string;
  seasons: HistoricalSeason[];
};

export type HistoryColumn = keyof Pick<
  HistoricalRanking,
  "overallRank" | "positionalRank" | "position" | "team" | "name" | "bye" | "projectedPoints"
>;

export type HistoryFilters = Partial<Record<HistoryColumn, string>>;
export type HistorySort = { column: HistoryColumn; direction: "asc" | "desc" };

const displayValue = (ranking: HistoricalRanking, column: HistoryColumn): string => {
  const value = ranking[column];
  if (value === null) return "";
  if (column === "position") return value === "PK" ? "K" : value === "ST" ? "D/ST" : String(value);
  return String(value);
};

export function filterAndSortHistoricalRankings(
  rankings: HistoricalRanking[],
  filters: HistoryFilters,
  sort: HistorySort,
): HistoricalRanking[] {
  const activeFilters = Object.entries(filters).filter((entry): entry is [HistoryColumn, string] => Boolean(entry[1]?.trim()));
  return rankings
    .filter((ranking) => activeFilters.every(([column, query]) => displayValue(ranking, column).toLowerCase().includes(query.trim().toLowerCase())))
    .sort((left, right) => {
      const leftValue = left[sort.column];
      const rightValue = right[sort.column];
      if (leftValue === null && rightValue === null) return left.name.localeCompare(right.name);
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      return (sort.direction === "asc" ? comparison : -comparison) || left.name.localeCompare(right.name);
    });
}
