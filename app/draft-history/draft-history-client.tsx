"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CaretUpDown,
  ClockCounterClockwise,
  CurrencyDollar,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  filterAndSortDraftHistoryEntries,
  type DraftHistoryColumn,
  type DraftHistoryData,
  type DraftHistoryEntry,
  type DraftHistoryFilters,
  type DraftHistorySort,
} from "@/lib/draft-history";
import styles from "./draft-history.module.css";

type Column = {
  key: DraftHistoryColumn;
  label: string;
  numeric?: boolean;
};

const BASE_COLUMNS: Column[] = [
  { key: "number", label: "No.", numeric: true },
  { key: "teamId", label: "Team ID", numeric: true },
  { key: "manager", label: "Manager" },
  { key: "teamName", label: "Team Name" },
  { key: "player", label: "Player" },
  { key: "nflTeam", label: "NFL Team" },
  { key: "position", label: "Pos" },
];

const positionClass = (position: string) => {
  if (position === "QB") return styles.qb;
  if (position === "RB") return styles.rb;
  if (position === "WR") return styles.wr;
  if (position === "TE") return styles.te;
  if (position === "K") return styles.k;
  return styles.dst;
};

function SortIcon({ column, sort }: { column: DraftHistoryColumn; sort: DraftHistorySort }) {
  if (sort.column !== column) return <CaretUpDown aria-hidden />;
  return sort.direction === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />;
}

function HistoryTable({
  rows,
  sort,
  filters,
  onSort,
  onFilter,
  onClearFilters,
  priceLabel,
}: {
  rows: DraftHistoryEntry[];
  sort: DraftHistorySort;
  filters: DraftHistoryFilters;
  onSort: (column: DraftHistoryColumn) => void;
  onFilter: (column: DraftHistoryColumn, value: string) => void;
  onClearFilters: () => void;
  priceLabel: string;
}) {
  const columns: Column[] = [...BASE_COLUMNS, { key: "amount", label: priceLabel, numeric: true }];
  const filteredRows = useMemo(() => filterAndSortDraftHistoryEntries(rows, filters, sort), [filters, rows, sort]);
  const positions = useMemo(() => [...new Set(rows.map(({ position }) => position))].sort(), [rows]);
  const hasActiveFilters = Object.values(filters).some((value) => value?.trim());

  return (
    <div className={styles.tableFrame}>
      <div className={styles.tableStatus}>
        <span>Showing <strong>{filteredRows.length}</strong> of {rows.length}</span>
        {hasActiveFilters && <button type="button" onClick={onClearFilters}>Clear filters</button>}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  aria-sort={sort.column === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={column.numeric ? styles.numeric : undefined}
                  key={column.key}
                >
                  <button type="button" onClick={() => onSort(column.key)}>
                    <span>{column.label}</span>
                    <SortIcon column={column.key} sort={sort} />
                  </button>
                </th>
              ))}
            </tr>
            <tr className={styles.filterRow}>
              {columns.map((column) => (
                <th key={column.key}>
                  {column.key === "position" ? (
                    <select
                      aria-label="Filter Pos"
                      value={filters.position ?? ""}
                      onChange={(event) => onFilter("position", event.target.value)}
                    >
                      <option value="">All</option>
                      {positions.map((position) => <option value={position} key={position}>{position}</option>)}
                    </select>
                  ) : (
                    <input
                      aria-label={`Filter ${column.label}`}
                      inputMode={column.numeric ? "numeric" : "text"}
                      placeholder="Filter"
                      value={filters[column.key] ?? ""}
                      onChange={(event) => onFilter(column.key, event.target.value)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((entry) => (
              <tr key={`${entry.number}-${entry.teamId}-${entry.player}`}>
                <td className={`${styles.numeric} ${styles.mono}`}>{entry.number}</td>
                <td className={`${styles.numeric} ${styles.mono}`}>{entry.teamId}</td>
                <td>{entry.manager}</td>
                <td>{entry.teamName}</td>
                <td className={styles.player}>{entry.player}</td>
                <td className={styles.mono}>{entry.nflTeam}</td>
                <td><span className={`${styles.position} ${positionClass(entry.position)}`}>{entry.position}</span></td>
                <td className={`${styles.numeric} ${styles.price}`}>${entry.amount}</td>
              </tr>
            ))}
            {!filteredRows.length && <tr><td className={styles.empty} colSpan={columns.length}>No players match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const nextSort = (current: DraftHistorySort, column: DraftHistoryColumn): DraftHistorySort => current.column === column
  ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
  : { column, direction: "asc" };

export default function DraftHistoryClient({ data }: { data: DraftHistoryData }) {
  const [activeYear, setActiveYear] = useState(data.seasons[0]?.year ?? 2025);
  const [keeperSort, setKeeperSort] = useState<DraftHistorySort>({ column: "number", direction: "asc" });
  const [auctionSort, setAuctionSort] = useState<DraftHistorySort>({ column: "number", direction: "asc" });
  const [keeperFilters, setKeeperFilters] = useState<DraftHistoryFilters>({});
  const [auctionFilters, setAuctionFilters] = useState<DraftHistoryFilters>({});
  const season = data.seasons.find(({ year }) => year === activeYear) ?? data.seasons[0];

  if (!season) return null;

  const keeperSpend = season.keepers.reduce((total, entry) => total + entry.amount, 0);
  const auctionSpend = season.auctions.reduce((total, entry) => total + entry.amount, 0);
  const chooseYear = (year: number) => {
    setActiveYear(year);
    setKeeperSort({ column: "number", direction: "asc" });
    setAuctionSort({ column: "number", direction: "asc" });
    setKeeperFilters({});
    setAuctionFilters({});
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <nav className="management-nav-links">
            <Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link>
            <Link href="/rankings-history" className="back-link">Rankings History</Link>
            <Link href="/watch-list" className="back-link">Watch List</Link>
          </nav>
          <span className="eyebrow">LEAGUE MARKET MEMORY</span>
          <h1>Draft History</h1>
          <p>Keepers and auction purchases from the 2023–2025 league drafts. Sort with the column titles or filter beneath each header.</p>
        </div>
        <div className={styles.yearCard}>
          <ClockCounterClockwise aria-hidden />
          <span>Selected draft</span>
          <strong>{activeYear}</strong>
          <small>{season.keepers.length + season.auctions.length} roster additions</small>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Draft season selection">
        <div className={styles.tabs} role="tablist" aria-label="Draft history season">
          {data.seasons.map(({ year }) => (
            <button
              aria-selected={year === activeYear}
              className={year === activeYear ? styles.selected : undefined}
              key={year}
              onClick={() => chooseYear(year)}
              role="tab"
              type="button"
            >
              {year}
            </button>
          ))}
        </div>
        <div className={styles.toolbarMeta}>
          <span>{season.keepers.length} keepers</span>
          <span>{season.auctions.length} auction purchases</span>
          <a href={season.source} target="_blank" rel="noreferrer">ESPN draft recap</a>
        </div>
      </section>

      <div className={styles.sections}>
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div><UsersThree aria-hidden /><div><span>Protected players</span><h2>Keepers</h2></div></div>
            <div className={styles.summary}><span>{season.keepers.length} players</span><strong>${keeperSpend} paid</strong></div>
          </div>
          <HistoryTable
            rows={season.keepers}
            sort={keeperSort}
            filters={keeperFilters}
            onSort={(column) => setKeeperSort((current) => nextSort(current, column))}
            onFilter={(column, value) => setKeeperFilters((current) => ({ ...current, [column]: value }))}
            onClearFilters={() => setKeeperFilters({})}
            priceLabel="Keeper Cost"
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div><CurrencyDollar aria-hidden /><div><span>Live auction purchases</span><h2>Auction Results</h2></div></div>
            <div className={styles.summary}><span>{season.auctions.length} players</span><strong>${auctionSpend} paid</strong></div>
          </div>
          <HistoryTable
            rows={season.auctions}
            sort={auctionSort}
            filters={auctionFilters}
            onSort={(column) => setAuctionSort((current) => nextSort(current, column))}
            onFilter={(column, value) => setAuctionFilters((current) => ({ ...current, [column]: value }))}
            onClearFilters={() => setAuctionFilters({})}
            priceLabel="Amount"
          />
        </section>
      </div>
    </main>
  );
}
