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
  sortDraftHistoryEntries,
  type DraftHistoryColumn,
  type DraftHistoryData,
  type DraftHistoryEntry,
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
  onSort,
  priceLabel,
}: {
  rows: DraftHistoryEntry[];
  sort: DraftHistorySort;
  onSort: (column: DraftHistoryColumn) => void;
  priceLabel: string;
}) {
  const columns: Column[] = [...BASE_COLUMNS, { key: "amount", label: priceLabel, numeric: true }];
  const sortedRows = useMemo(() => sortDraftHistoryEntries(rows, sort), [rows, sort]);

  return (
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
        </thead>
        <tbody>
          {sortedRows.map((entry) => (
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
        </tbody>
      </table>
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
  const season = data.seasons.find(({ year }) => year === activeYear) ?? data.seasons[0];

  if (!season) return null;

  const keeperSpend = season.keepers.reduce((total, entry) => total + entry.amount, 0);
  const auctionSpend = season.auctions.reduce((total, entry) => total + entry.amount, 0);
  const chooseYear = (year: number) => {
    setActiveYear(year);
    setKeeperSort({ column: "number", direction: "asc" });
    setAuctionSort({ column: "number", direction: "asc" });
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
          <p>Keepers and auction purchases from the 2023–2025 league drafts. Select any column header to sort that table.</p>
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
            onSort={(column) => setKeeperSort((current) => nextSort(current, column))}
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
            onSort={(column) => setAuctionSort((current) => nextSort(current, column))}
            priceLabel="Amount"
          />
        </section>
      </div>
    </main>
  );
}
