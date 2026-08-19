"use client";

import {
  ArrowLeft, ChartBar, ClockCounterClockwise, FirstAid, MagnifyingGlass,
  SlidersHorizontal, TrendUp, Warning, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerDataPayload, PlayerProfile } from "@/lib/player-data-types";
import type { Position } from "@/lib/types";

type Metric = {
  section: string;
  label: string;
  title: string;
  value: (profile: PlayerProfile) => number | string | undefined;
  format?: "number" | "decimal" | "percent" | "epa" | "rank";
  better?: "high" | "low";
};

const POSITION_FILTERS: Array<"ALL" | Position> = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];
const positionClass = (position: string) => `pos pos-${position.toLowerCase()}`;
const METRICS: Metric[] = [
  { section: "Identity", label: "Age", title: "Player age reported by Sleeper.", value: (p) => p.age, better: "low" },
  { section: "Identity", label: "Experience", title: "Completed NFL seasons reported by Sleeper.", value: (p) => p.yearsExp },
  { section: "Identity", label: "Bye", title: "2026 bye week derived from the NFL schedule.", value: (p) => p.team?.byeWeek },
  { section: "Identity", label: "Depth order", title: "Current depth-chart order reported by Sleeper.", value: (p) => p.depthChartOrder, better: "low" },
  { section: "Market", label: "FFC ADP", title: "Average draft position in 12-team PPR drafts at Fantasy Football Calculator.", value: (p) => p.market?.ffcAdp, format: "decimal", better: "low" },
  { section: "Market", label: "FFC range", title: "Lowest-to-highest pick observed by FFC.", value: (p) => p.market?.ffcHigh !== undefined && p.market?.ffcLow !== undefined ? `${p.market.ffcHigh}–${p.market.ffcLow}` : undefined },
  { section: "Market", label: "FFC std dev", title: "Standard deviation of FFC draft position; lower means the market agrees more.", value: (p) => p.market?.ffcStdev, format: "decimal", better: "low" },
  { section: "Market", label: "FP ECR", title: "FantasyPros expert consensus overall rank.", value: (p) => p.market?.fpEcr, format: "rank", better: "low" },
  { section: "Market", label: "FP range", title: "Best-to-worst rank among the FantasyPros experts in the consensus.", value: (p) => p.market?.fpRankMin !== undefined && p.market?.fpRankMax !== undefined ? `${p.market.fpRankMin}–${p.market.fpRankMax}` : undefined },
  { section: "Market", label: "FP tier", title: "FantasyPros consensus tier.", value: (p) => p.market?.fpTier, better: "low" },
  { section: "Market", label: "Ownership", title: "Average rostered percentage reported by FantasyPros.", value: (p) => p.market?.fpOwnedAvg, format: "percent", better: "high" },
  { section: "2025 Usage", label: "Games", title: "NFL regular-season games played in 2025.", value: (p) => p.usage2025?.games, better: "high" },
  { section: "2025 Usage", label: "Targets", title: "2025 regular-season receiving targets.", value: (p) => p.usage2025?.targets, better: "high" },
  { section: "2025 Usage", label: "Target share", title: "Share of team pass attempts directed at the player.", value: (p) => p.usage2025?.targetShare, format: "percent", better: "high" },
  { section: "2025 Usage", label: "Air-yard share", title: "Share of the team's intended receiving air yards.", value: (p) => p.usage2025?.airYardsShare, format: "percent", better: "high" },
  { section: "2025 Usage", label: "WOPR", title: "Weighted Opportunity Rating combines target share and air-yard share.", value: (p) => p.usage2025?.wopr, format: "decimal", better: "high" },
  { section: "2025 Usage", label: "RACR", title: "Receiver Air Conversion Ratio: receiving yards divided by air yards.", value: (p) => p.usage2025?.racr, format: "decimal", better: "high" },
  { section: "2025 Usage", label: "Carries", title: "2025 regular-season rushing attempts.", value: (p) => p.usage2025?.carries, better: "high" },
  { section: "2025 Usage", label: "Rush yards", title: "2025 regular-season rushing yards.", value: (p) => p.usage2025?.rushingYards, better: "high" },
  { section: "2025 Usage", label: "Pass attempts", title: "2025 regular-season passing attempts.", value: (p) => p.usage2025?.attempts, better: "high" },
  { section: "2025 Usage", label: "Passing EPA", title: "Expected Points Added on 2025 passing plays.", value: (p) => p.usage2025?.passingEpa, format: "epa", better: "high" },
  { section: "2025 Usage", label: "Rushing EPA", title: "Expected Points Added on 2025 rushing plays.", value: (p) => p.usage2025?.rushingEpa, format: "epa", better: "high" },
  { section: "2025 Usage", label: "Snap share", title: "Mean 2025 offensive snap percentage in games played.", value: (p) => p.usage2025?.snapPctMean, format: "percent", better: "high" },
  { section: "2025 Usage", label: "Last-4 snaps", title: "Mean offensive snap percentage over the player's final four 2025 games.", value: (p) => p.usage2025?.snapPctLast4, format: "percent", better: "high" },
  { section: "Team", label: "Implied points", title: "Mean 2026 implied team total across games with posted Vegas lines.", value: (p) => p.team?.impliedTotalMean, format: "decimal", better: "high" },
  { section: "Team", label: "Playoff implied", title: "Mean implied team total for Weeks 15–17 when lines are available.", value: (p) => p.team?.impliedTotalPlayoffs, format: "decimal", better: "high" },
  { section: "Team", label: "Opponent implied", title: "Mean opposing-team implied total across games with lines; lower suggests friendlier game environments.", value: (p) => p.team?.opponentDifficultyMean, format: "decimal", better: "low" },
  { section: "Team", label: "Games with lines", title: "Number of 2026 games included in the Vegas averages.", value: (p) => p.team?.gamesWithLines, better: "high" },
];

function formatMetric(value: number | string | undefined, format: Metric["format"] = "number") {
  if (value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (format === "percent") return `${(value * (value <= 1 ? 100 : 1)).toFixed(1)}%`;
  if (format === "epa") return value.toFixed(2);
  if (format === "decimal") return value.toFixed(1);
  if (format === "rank") return `#${value}`;
  return value.toLocaleString();
}

function RangeBar({ label, value, high, low, stdev, title }: { label: string; value?: number; high?: number; low?: number; stdev?: number; title: string }) {
  const min = high === undefined || low === undefined ? 0 : Math.min(high, low);
  const max = high === undefined || low === undefined ? 0 : Math.max(high, low);
  const point = value === undefined || max === min ? 50 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return <div className="research-range" title={title}>
    <div className="research-range-head"><span>{label}</span><strong>{value === undefined ? "—" : value.toFixed(1)}</strong></div>
    {high !== undefined && low !== undefined ? <><div className="research-range-track"><i style={{ left: `${point}%` }} /></div><div className="research-range-labels"><span>Best {min}</span><span>Worst {max}</span></div></> : <div className="research-no-range">No market range available</div>}
    {stdev !== undefined && <small>Standard deviation {stdev.toFixed(1)}</small>}
  </div>;
}

function DataTiles({ metrics, profile }: { metrics: Metric[]; profile: PlayerProfile }) {
  return <div className="research-tiles">{metrics.map((metric) => <div className="research-tile" title={metric.title} key={metric.label}><span>{metric.label}</span><strong>{formatMetric(metric.value(profile), metric.format)}</strong></div>)}</div>;
}

function SingleProfile({ profile }: { profile: PlayerProfile }) {
  const injuryStatus = profile.injury?.sleeperStatus ?? profile.injury?.reportStatus;
  const usageMetrics = METRICS.filter((metric) => metric.section === "2025 Usage" && (
    profile.position === "QB" ? ["Games", "Pass attempts", "Passing EPA", "Rushing EPA", "Rush yards", "Snap share", "Last-4 snaps"].includes(metric.label)
      : profile.position === "RB" ? ["Games", "Carries", "Rush yards", "Targets", "Target share", "Rushing EPA", "Snap share", "Last-4 snaps"].includes(metric.label)
        : ["Games", "Targets", "Target share", "Air-yard share", "WOPR", "RACR", "Snap share", "Last-4 snaps"].includes(metric.label)
  ));
  return <div className="research-profile-grid">
    <section className="panel research-identity">
      <div><span className={positionClass(profile.position)}>{profile.position === "DST" ? "D/ST" : profile.position}</span><span className="eyebrow">PLAYER PROFILE</span><h2>{profile.name}</h2><p>{profile.nflTeam} · {profile.tier} · position rank {profile.positionRank}</p></div>
      <div className={`injury-badge ${injuryStatus ? "alert" : "clean"}`}><FirstAid />{injuryStatus ?? "No current injury designation"}</div>
      <DataTiles profile={profile} metrics={METRICS.filter((metric) => metric.section === "Identity")} />
    </section>

    <section className="panel research-section">
      <header><div><span className="eyebrow">MARKET CONSENSUS</span><h2>Draft range and disagreement</h2></div><TrendUp /></header>
      <div className="research-ranges">
        <RangeBar label="FFC ADP" value={profile.market?.ffcAdp} high={profile.market?.ffcHigh} low={profile.market?.ffcLow} stdev={profile.market?.ffcStdev} title="12-team PPR average draft position and observed range." />
        <RangeBar label="FantasyPros ECR" value={profile.market?.fpEcr} high={profile.market?.fpRankMin} low={profile.market?.fpRankMax} stdev={profile.market?.fpRankStd} title="Expert consensus rank and the best-to-worst expert range." />
      </div>
      <DataTiles profile={profile} metrics={METRICS.filter((metric) => metric.section === "Market" && ["FP tier", "Ownership"].includes(metric.label))} />
      <p className="research-footnote">FFC samples {profile.market?.ffcTimesDrafted?.toLocaleString() ?? "an unavailable number of"} selections. Sleeper trending adds: {profile.market?.sleeperTrendingAdds?.toLocaleString() ?? "—"}. These are market signals, not valuations.</p>
    </section>

    <section className="panel research-section">
      <header><div><span className="eyebrow">2025 USAGE</span><h2>2025 actuals — not a 2026 projection</h2></div><ChartBar /></header>
      {profile.usage2025 ? <DataTiles profile={profile} metrics={usageMetrics} /> : <div className="research-empty"><strong>No 2025 NFL usage</strong><span>{profile.yearsExp === 0 ? "Rookie — no prior NFL regular-season data is expected." : "No matching nflverse usage row was available."}</span></div>}
    </section>

    <section className="panel research-section">
      <header><div><span className="eyebrow">TEAM ENVIRONMENT</span><h2>{profile.nflTeam} schedule and Vegas context</h2></div><ClockCounterClockwise /></header>
      <DataTiles profile={profile} metrics={METRICS.filter((metric) => metric.section === "Team")} />
      <p className="research-footnote">Averages use only games with posted lines. They will become more complete as additional 2026 lines are published.</p>
    </section>

    <section className="panel research-section">
      <header><div><span className="eyebrow">INJURY HISTORY</span><h2>Current status and 2025 reports</h2></div><FirstAid /></header>
      <div className="research-tiles">
        <div className="research-tile"><span>Current</span><strong>{injuryStatus ?? "Clear"}</strong></div>
        <div className="research-tile"><span>Body part</span><strong>{profile.injury?.bodyPart ?? "—"}</strong></div>
        <div className="research-tile"><span>2025 report weeks</span><strong>{profile.injury?.weeksOnReport2025 ?? "—"}</strong></div>
        <div className="research-tile"><span>Latest practice</span><strong>{profile.injury?.sleeperPracticeParticipation ?? profile.injury?.practiceStatus ?? "—"}</strong></div>
      </div>
      {profile.injury?.injuryNotes && <p className="research-footnote">{profile.injury.injuryNotes}</p>}
    </section>

    <section className="panel research-section missing-panel">
      <header><div><span className="eyebrow">DATA COVERAGE</span><h2>Missing sources</h2></div><Warning /></header>
      {profile.sourcesMissing.length ? <ul>{profile.sourcesMissing.map((source) => <li key={source}>{source}{source === "2025 NFL usage" && profile.yearsExp === 0 ? " — expected for a rookie" : ""}</li>)}</ul> : <p className="research-footnote">All configured sources matched this player.</p>}
    </section>
  </div>;
}

function CompareTable({ profiles, remove }: { profiles: PlayerProfile[]; remove: (id: number) => void }) {
  return <div className="panel research-compare-wrap"><table className="research-compare"><thead><tr><th>Metric</th>{profiles.map((profile) => <th key={profile.id}><div><span className={positionClass(profile.position)}>{profile.position}</span><strong>{profile.name}</strong><small>{profile.nflTeam}</small><button aria-label={`Remove ${profile.name}`} onClick={() => remove(profile.id)}><X /></button></div></th>)}</tr></thead><tbody>
    {METRICS.flatMap((metric, metricIndex) => {
      const values = profiles.map((profile) => metric.value(profile));
      const numeric = values.filter((value): value is number => typeof value === "number");
      const best = numeric.length && metric.better ? (metric.better === "high" ? Math.max(...numeric) : Math.min(...numeric)) : undefined;
      const sectionRow = metricIndex === 0 || METRICS[metricIndex - 1].section !== metric.section ? <tr className="research-section-row" key={`${metric.section}-section`}><th colSpan={profiles.length + 1}>{metric.section}</th></tr> : null;
      return [sectionRow, <tr key={`${metric.section}-${metric.label}`}><th title={metric.title}>{metric.label}</th>{values.map((value, index) => <td className={typeof value === "number" && value === best ? "best" : ""} key={profiles[index].id}>{formatMetric(value, metric.format)}</td>)}</tr>];
    })}
  </tbody></table></div>;
}

export default function PlayerDataPage() {
  const [payload, setPayload] = useState<PlayerDataPayload | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<"ALL" | Position>("ALL");
  const [watchOnly, setWatchOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/player-data", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load player research");
      setPayload(body as PlayerDataPayload);
      setLoadedAt(Date.now());
      const ids = new URL(window.location.href).searchParams.get("players")?.split(",").map(Number).filter(Number.isFinite).slice(0, 4) ?? [];
      setSelectedIds(ids);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load player research"); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") setQuery("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const updateSelection = (ids: number[]) => {
    const next = [...new Set(ids)].slice(0, 4);
    setSelectedIds(next);
    const url = new URL(window.location.href);
    if (next.length) url.searchParams.set("players", next.join(",")); else url.searchParams.delete("players");
    window.history.replaceState({}, "", url);
  };
  const profiles = useMemo(() => payload?.profiles ?? [], [payload]);
  const selected = useMemo(() => selectedIds.flatMap((id) => profiles.find((profile) => profile.id === id) ?? []), [profiles, selectedIds]);
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const normalized = query.trim().toLowerCase();
    const watch = new Set(payload?.watchList ?? []);
    return profiles.filter((profile) =>
      !selectedIds.includes(profile.id) && (position === "ALL" || profile.position === position) &&
      (!watchOnly || watch.has(profile.id)) && `${profile.name} ${profile.nflTeam} ${profile.position}`.toLowerCase().includes(normalized),
    ).sort((a, b) => a.overallRank - b.overallRank).slice(0, 10);
  }, [payload?.watchList, position, profiles, query, selectedIds, watchOnly]);

  if (error) return <main className="loading-screen"><Warning size={36} /><h1>Couldn’t open Player Data</h1><p>{error}</p><button className="primary" onClick={load}>Try again</button></main>;
  if (!payload) return <main className="loading-screen"><div className="football-loader">P</div><p>Loading local player research…</p></main>;

  return <main className="research-shell">
    <header className="research-header">
      <nav className="management-nav-links"><Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link><Link href="/tiers" className="back-link"><SlidersHorizontal /> Tier Editor</Link><Link href="/watch-list" className="back-link">Watch List</Link></nav>
      <span className="eyebrow">OFFLINE DRAFT RESEARCH</span><h1>Player Data</h1><p>Usage, injury, market consensus, and team environment. Research inputs only—no price or suggested bid.</p>
    </header>

    <section className="research-freshness" aria-label="Data freshness">
      {payload.meta.sources.map((source) => {
        const age = source.fetchedAt ? loadedAt - new Date(source.fetchedAt).getTime() : Infinity;
        const stale = source.status !== "ok" || age > 48 * 60 * 60 * 1000;
        return <div className={stale ? "stale" : "fresh"} key={source.source}><span>{source.source}</span><strong>{source.fetchedAt ? new Date(source.fetchedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No cache"}</strong></div>;
      })}
      <p>Refresh before the draft with <code>npm run fetch:player-data</code>.</p>
    </section>

    <section className="panel research-controls">
      <div className="research-search">
        <MagnifyingGlass /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={selected.length >= 4 ? "Remove a player to add another" : "Search every ESPN player…"} disabled={selected.length >= 4} /><kbd>/</kbd>
        {suggestions.length > 0 && <div className="suggestions">{suggestions.map((profile) => <button key={profile.id} onClick={() => { updateSelection([...selectedIds, profile.id]); setQuery(""); }}><span className={positionClass(profile.position)}>{profile.position}</span><span><strong>{profile.name}</strong><small>{profile.nflTeam} · {profile.tier}</small></span><b>#{profile.overallRank}</b></button>)}</div>}
      </div>
      <div className="research-filter-row"><div className="segmented">{POSITION_FILTERS.map((item) => <button className={position === item ? "selected" : ""} onClick={() => setPosition(item)} key={item}>{item === "DST" ? "D/ST" : item}</button>)}</div><label className="research-toggle"><input type="checkbox" checked={watchOnly} onChange={(event) => setWatchOnly(event.target.checked)} /> Watch list only</label></div>
      {selected.length > 0 && <div className="research-selected">{selected.map((profile) => <button key={profile.id} onClick={() => updateSelection(selectedIds.filter((id) => id !== profile.id))}><span className={positionClass(profile.position)}>{profile.position}</span>{profile.name}<X /></button>)}</div>}
    </section>

    {selected.length === 0 ? <section className="panel research-welcome"><MagnifyingGlass /><h2>Search for a player to begin</h2><p>Add one player for a complete profile or up to four for a side-by-side comparison. Your selection is saved in the URL.</p></section>
      : selected.length === 1 ? <SingleProfile profile={selected[0]} />
        : <CompareTable profiles={selected} remove={(id) => updateSelection(selectedIds.filter((selectedId) => selectedId !== id))} />}
  </main>;
}
