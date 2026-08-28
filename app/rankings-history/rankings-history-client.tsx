"use client";

import { ArrowDown, ArrowLeft, ArrowUp, CaretUpDown, ChartLineUp, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  filterAndSortHistoricalRankings,
  type FantasyIndexHistory,
  type HistoricalRanking,
  type HistoryColumn,
  type HistoryFilters,
  type HistorySort,
} from "@/lib/history";

const COLUMNS: Array<{ key: HistoryColumn; label: string; numeric?: boolean }> = [
  { key: "overallRank", label: "Overall", numeric: true },
  { key: "positionalRank", label: "Pos rank", numeric: true },
  { key: "position", label: "Pos" },
  { key: "team", label: "Team" },
  { key: "name", label: "Player" },
  { key: "bye", label: "Bye", numeric: true },
  { key: "projectedPoints", label: "Projected pts", numeric: true },
];

const positionLabel = (position: HistoricalRanking["position"]) => position === "PK" ? "K" : position === "ST" ? "D/ST" : position;
const positionClass = (position: HistoricalRanking["position"]) => `pos pos-${position === "PK" ? "k" : position === "ST" ? "dst" : position.toLowerCase()}`;

function SortIcon({ column, sort }: { column: HistoryColumn; sort: HistorySort }) {
  if (sort.column !== column) return <CaretUpDown aria-hidden />;
  return sort.direction === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />;
}

export default function RankingsHistoryClient({ history }: { history: FantasyIndexHistory }) {
  const [activeYear, setActiveYear] = useState(history.seasons[0]?.year ?? 2025);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [sort, setSort] = useState<HistorySort>({ column: "overallRank", direction: "asc" });

  const season = history.seasons.find(({ year }) => year === activeYear) ?? history.seasons[0];
  const rows = useMemo(
    () => filterAndSortHistoricalRankings(season?.rankings ?? [], filters, sort),
    [filters, season, sort],
  );

  const chooseYear = (year: number) => {
    setActiveYear(year);
    setFilters({});
    setSort({ column: "overallRank", direction: "asc" });
  };
  const changeSort = (column: HistoryColumn) => {
    setSort((current) => current.column === column
      ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
      : { column, direction: "asc" });
  };
  const changeFilter = (column: HistoryColumn, value: string) => setFilters((current) => ({ ...current, [column]: value }));

  if (!season) return <main className="loading-screen"><Warning size={36} /><h1>No historical editions found</h1></main>;

  return (
    <main className="history-shell">
      <header className="history-header">
        <div>
          <nav className="management-nav-links">
            <Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link>
            <Link href="/watch-list" className="back-link">Watch List</Link>
            <Link href="/player-data" className="back-link">Player Data</Link>
          </nav>
          <span className="eyebrow">PAST DRAFT MARKET CONTEXT</span>
          <h1>Fantasy Index Rankings History</h1>
          <p>Season-specific projected rankings preserved as the market benchmark available before each league auction.</p>
        </div>
        <div className="history-edition-card"><ChartLineUp /><span>Selected edition</span><strong>{activeYear}</strong><small>{season.rankings.length} players</small></div>
      </header>

      <section className="history-panel">
        <div className="history-toolbar">
          <div className="history-tabs" role="tablist" aria-label="Fantasy Index season">
            {history.seasons.map(({ year }) => <button role="tab" aria-selected={year === activeYear} className={year === activeYear ? "selected" : ""} onClick={() => chooseYear(year)} key={year}>{year}</button>)}
          </div>
          <div className="history-meta">
            <span>Updated {new Date(season.projectionsUpdatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</span>
            <a href={season.sourceUrl} target="_blank" rel="noreferrer">Fantasy Index source</a>
            <strong>{rows.length} of {season.rankings.length}</strong>
          </div>
        </div>

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>{COLUMNS.map((column) => <th className={column.numeric ? "numeric" : ""} key={column.key}><button onClick={() => changeSort(column.key)}>{column.label}<SortIcon column={column.key} sort={sort} /></button></th>)}</tr>
              <tr className="history-filter-row">{COLUMNS.map((column) => <th key={column.key}>{column.key === "position"
                ? <select aria-label="Filter position" value={filters.position ?? ""} onChange={(event) => changeFilter("position", event.target.value)}><option value="">All</option><option>QB</option><option>RB</option><option>WR</option><option>TE</option><option>K</option><option>D/ST</option></select>
                : <input aria-label={`Filter ${column.label}`} inputMode={column.numeric ? "decimal" : "text"} placeholder="Filter" value={filters[column.key] ?? ""} onChange={(event) => changeFilter(column.key, event.target.value)} />}</th>)}</tr>
            </thead>
            <tbody>{rows.map((ranking) => <tr key={`${ranking.position}-${ranking.team}-${ranking.name}`}>
              <td className="numeric mono">{ranking.overallRank ?? "—"}</td>
              <td className="numeric mono">{ranking.positionalRank}</td>
              <td><span className={positionClass(ranking.position)}>{positionLabel(ranking.position)}</span></td>
              <td className="mono">{ranking.team}</td>
              <td><strong>{ranking.name}</strong></td>
              <td className="numeric mono">{ranking.bye || "—"}</td>
              <td className="numeric mono projected">{ranking.projectedPoints.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
          {!rows.length && <div className="history-empty">No players match the current column filters.</div>}
        </div>
      </section>
    </main>
  );
}
