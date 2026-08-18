"use client";

import { ArrowLeft, CaretDown, Plus, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import rawScheduleData from "@/lib/nfl-schedule-data-2026.json";
import rawLeagueModel from "@/lib/nfl-schedule-league-model-2026.json";
import {
  FANTASY_SEASON_WINDOW,
  gradeDistributionWarnings,
  matchupLabel,
  PLAYOFF_WINDOW,
  rankSchedules,
  resolvedMatchupForGame,
  SCHEDULE_POSITIONS,
  summarizeSchedule,
  type ScheduleLeagueModel,
  type SchedulePosition,
  type ScheduleSnapshot,
  type ScheduleTeam,
  type ScheduleWindow,
} from "@/lib/schedules";

const scheduleData = rawScheduleData as unknown as ScheduleSnapshot;
const leagueModel = rawLeagueModel as unknown as ScheduleLeagueModel;
const DEFAULT_TEAMS = ["DEN", "SEA", "MIN", "HOU", "LAR"];
const MAXIMUM_WEEK = Math.max(...scheduleData.teams.flatMap((team) => team.games.map((game) => game.week)));
const GRADE_LABELS: Record<number, string> = { 5: "Smash", 4: "Favorable", 3: "Neutral", 2: "Difficult", 1: "Avoid" };
const GRADE_WARNINGS = gradeDistributionWarnings(scheduleData);

type WindowPreset = "fantasy" | "playoffs" | "early" | "nfl" | "custom";
const WINDOW_PRESETS: Array<{ id: Exclude<WindowPreset, "custom">; label: string; window: ScheduleWindow }> = [
  { id: "fantasy", label: "Fantasy season", window: FANTASY_SEASON_WINDOW },
  { id: "playoffs", label: "Playoffs", window: PLAYOFF_WINDOW },
  { id: "early", label: "Weeks 1–4", window: { startWeek: 1, endWeek: 4 } },
  { id: "nfl", label: "NFL schedule", window: { startWeek: 1, endWeek: MAXIMUM_WEEK } },
];

function teamFor(abbreviation: string): ScheduleTeam | undefined {
  return scheduleData.teams.find((team) => team.abbreviation === abbreviation);
}

function strength(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

export default function SchedulesPage() {
  const [selectedAbbreviations, setSelectedAbbreviations] = useState(DEFAULT_TEAMS);
  const [position, setPosition] = useState<SchedulePosition>("DST");
  const [sortMode, setSortMode] = useState<"difficulty" | "selected">("difficulty");
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("fantasy");
  const [startWeek, setStartWeek] = useState<number>(FANTASY_SEASON_WINDOW.startWeek);
  const [endWeek, setEndWeek] = useState<number>(FANTASY_SEASON_WINDOW.endWeek);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedTeams = useMemo(
    () => selectedAbbreviations.flatMap((abbreviation) => teamFor(abbreviation) ?? []),
    [selectedAbbreviations],
  );
  const scoringWindow = useMemo(() => ({ startWeek, endWeek }), [endWeek, startWeek]);
  const rankedSchedules = useMemo(
    () => rankSchedules(scheduleData, selectedTeams, position, scoringWindow, leagueModel),
    [position, scoringWindow, selectedTeams],
  );
  const summaryByTeam = useMemo(
    () => new Map(rankedSchedules.map((summary) => [summary.team.abbreviation, summary])),
    [rankedSchedules],
  );
  const displayedTeams = sortMode === "difficulty" ? rankedSchedules.map((summary) => summary.team) : selectedTeams;
  const availableTeams = scheduleData.teams.filter((team) => !selectedAbbreviations.includes(team.abbreviation));
  const visibleWeeks = Array.from({ length: endWeek - startWeek + 1 }, (_, index) => startWeek + index);
  const windowLabel = `Weeks ${startWeek}–${endWeek}`;
  const modelMethodology = leagueModel.methodology[position];
  const seasonStart = Math.min(...scheduleData.teams.flatMap((team) => team.games.map((game) => new Date(game.date).getTime())));
  const snapshotAgeDays = currentTime === null ? 0 : Math.floor((currentTime - new Date(scheduleData.generatedAt).getTime()) / 86_400_000);
  const staleInSeason = currentTime !== null && currentTime >= seasonStart && snapshotAgeDays >= 7;

  const addTeam = (abbreviation: string) => {
    if (!abbreviation || selectedAbbreviations.includes(abbreviation)) return;
    setSelectedAbbreviations((current) => [...current, abbreviation]);
  };
  const removeTeam = (abbreviation: string) => setSelectedAbbreviations((current) => current.filter((item) => item !== abbreviation));
  const choosePreset = (id: WindowPreset) => {
    setWindowPreset(id);
    const preset = WINDOW_PRESETS.find((item) => item.id === id);
    if (preset) {
      setStartWeek(preset.window.startWeek);
      setEndWeek(preset.window.endWeek);
    }
  };
  const setCustomStart = (week: number) => {
    setWindowPreset("custom");
    setStartWeek(Math.min(week, endWeek));
  };
  const setCustomEnd = (week: number) => {
    setWindowPreset("custom");
    setEndWeek(Math.max(week, startWeek));
  };

  return (
    <main className="schedule-shell">
      <header className="schedule-header">
        <div>
          <nav className="management-nav-links">
            <Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link>
            <Link href="/watch-list" className="back-link">Watch List</Link>
          </nav>
          <span className="eyebrow">2026 REGULAR SEASON</span>
          <h1>NFL Schedule Lab</h1>
          <p>Compare exact opponent strength for any fantasy window. Cell colours retain the simple 1–5 baseline; schedule rankings use the more precise 1–32 opponent rank.</p>
        </div>
        <div className="schedule-season-card">
          <strong>{scheduleData.season}</strong>
          <span>{scheduleData.teams.length} teams · {MAXIMUM_WEEK} weeks</span>
          <small>Updated {new Date(scheduleData.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</small>
        </div>
      </header>

      <section className={`schedule-baseline-note ${staleInSeason ? "stale" : ""}`}>
        {staleInSeason && <Warning weight="fill" />}
        <div><strong>{modelMethodology ? "UTH scoring-adjusted preseason baseline" : "FantasyPros preseason baseline"}</strong><p>{modelMethodology ?? scheduleData.methodology[position]} {staleInSeason ? `It is ${snapshotAgeDays} days old during the season; refresh before using it for a lineup decision.` : "Weekly injuries and role changes are not yet reflected."}</p></div>
      </section>

      <section className="schedule-controls panel" aria-label="Schedule comparison controls">
        <div className="schedule-control-block schedule-team-control">
          <span className="schedule-control-label">1 · Choose NFL teams</span>
          <div className="schedule-team-picker">
            <div><Plus aria-hidden /><select aria-label="Add an NFL team" value="" disabled={!availableTeams.length} onChange={(event) => addTeam(event.target.value)}><option value="">Add a team…</option>{availableTeams.map((team) => <option key={team.abbreviation} value={team.abbreviation}>{team.displayName}</option>)}</select><CaretDown aria-hidden /></div>
            <button type="button" onClick={() => setSelectedAbbreviations(scheduleData.teams.map((team) => team.abbreviation))}>All {scheduleData.teams.length}</button>
            <button type="button" onClick={() => setSelectedAbbreviations(DEFAULT_TEAMS)}>Reset five</button>
            <button type="button" disabled={!selectedAbbreviations.length} onClick={() => setSelectedAbbreviations([])}>Clear</button>
          </div>
          <div className="schedule-selected-teams">
            {selectedTeams.map((team) => <button type="button" key={team.abbreviation} onClick={() => removeTeam(team.abbreviation)} title={`Remove ${team.displayName}`}><span style={{ backgroundColor: team.color }}>{team.abbreviation}</span>{team.displayName}<X aria-hidden /></button>)}
            {!selectedTeams.length && <p>Choose at least one team to load its schedule.</p>}
          </div>
        </div>

        <div className="schedule-control-block schedule-position-control">
          <span className="schedule-control-label">2 · Choose fantasy position</span>
          <div className="schedule-position-picker" role="group" aria-label="Fantasy position">
            {SCHEDULE_POSITIONS.map((item) => <button type="button" className={item === position ? "selected" : ""} aria-pressed={item === position} key={item} onClick={() => setPosition(item)}>{item}</button>)}
          </div>
          <p>{modelMethodology ? "UTH league scoring adjustment active" : "Generic preseason opponent baseline"} · lower opponent rank is easier.</p>
        </div>

        <div className="schedule-control-block schedule-window-control">
          <span className="schedule-control-label">3 · Choose scoring window</span>
          <div className="schedule-window-presets" role="group" aria-label="Schedule scoring window">
            {WINDOW_PRESETS.map((preset) => <button type="button" className={windowPreset === preset.id ? "selected" : ""} key={preset.id} onClick={() => choosePreset(preset.id)}>{preset.label}<small>{preset.window.startWeek}–{preset.window.endWeek}</small></button>)}
          </div>
          <div className={`schedule-custom-window ${windowPreset === "custom" ? "selected" : ""}`}><span>Custom</span><label>From<select aria-label="Custom start week" value={startWeek} onChange={(event) => setCustomStart(Number(event.target.value))}>{Array.from({ length: MAXIMUM_WEEK }, (_, index) => index + 1).map((week) => <option key={week}>{week}</option>)}</select></label><label>To<select aria-label="Custom end week" value={endWeek} onChange={(event) => setCustomEnd(Number(event.target.value))}>{Array.from({ length: MAXIMUM_WEEK }, (_, index) => index + 1).map((week) => <option key={week}>{week}</option>)}</select></label></div>
        </div>
      </section>

      {GRADE_WARNINGS.includes(position) && <div className="schedule-compression-note"><Warning />The {position} colour grades are compressed at the source. Exact rank—not colour—is used for every ranking and strength score.</div>}

      {selectedTeams.length > 0 ? <>
        <section className="schedule-ranking-section">
          <div className="schedule-section-heading">
            <div><span className="eyebrow">SELECTED TEAM RANKING · {windowLabel.toUpperCase()}</span><h2>Best {position} schedules</h2></div>
            <div className="schedule-sort-picker" role="group" aria-label="Schedule column order"><button type="button" className={sortMode === "difficulty" ? "selected" : ""} onClick={() => setSortMode("difficulty")}>Ranked order</button><button type="button" className={sortMode === "selected" ? "selected" : ""} onClick={() => setSortMode("selected")}>Selection order</button></div>
          </div>
          <div className="schedule-rankings">
            {rankedSchedules.map((summary, index) => <article className="schedule-ranking-card" key={summary.team.abbreviation}>
              <span className="schedule-rank-number">#{index + 1}</span>
              <span className="schedule-team-mark" style={{ backgroundColor: summary.team.color }}>{summary.team.abbreviation}</span>
              <div><strong>{summary.team.displayName}</strong><small className={summary.byeWeek && summary.byeWeek >= 13 ? "late-bye" : ""}>Bye W{summary.byeWeek}{summary.byeWeek && summary.byeWeek >= 13 ? " · LATE" : ""}</small></div>
              <span title={`Average adjusted opponent rank ${summary.averageRank?.toFixed(2) ?? "unrated"}`}><strong>{strength(summary.strengthScore)}</strong><small>{windowLabel}</small></span>
              <span><strong>{strength(summary.playoffStrength)}</strong><small>W15–17</small></span>
              <span><strong>{summary.favorableWeeks}</strong><small>top tercile</small></span>
              <span><strong>{summary.toughWeeks}</strong><small>bottom tercile</small></span>
            </article>)}
          </div>
        </section>

        <section className="schedule-table-panel panel">
          <div className="schedule-table-heading">
            <div><span className="eyebrow">WEEK-BY-WEEK · {windowLabel.toUpperCase()}</span><h2>{position} matchup comparison</h2></div>
            <div className="schedule-legend" aria-label="Difficulty grade legend">{[5, 4, 3, 2, 1].map((grade) => <span key={grade} className={`grade-${grade}`}><i />{grade} {GRADE_LABELS[grade]}</span>)}</div>
          </div>
          <div className="schedule-table-wrap">
            <table className="schedule-table">
              <thead><tr><th>WK</th>{displayedTeams.map((team) => { const summary = summaryByTeam.get(team.abbreviation) ?? summarizeSchedule(scheduleData, team, position, scoringWindow, leagueModel); return <th key={team.abbreviation}><span style={{ borderColor: team.color }}>{team.abbreviation}</span><small>{strength(summary.strengthScore)} strength</small></th>; })}</tr></thead>
              <tbody>{visibleWeeks.map((week) => {
                const weekly = displayedTeams.map((team) => { const game = team.games.find((item) => item.week === week); return { team, game, matchup: resolvedMatchupForGame(scheduleData, leagueModel, position, game) }; });
                const bestRank = Math.min(...weekly.flatMap((item) => item.matchup?.effectiveRank ?? []));
                return <tr key={week}><th>{week}</th>{weekly.map(({ team, game, matchup }) => <td key={team.abbreviation}>{game && matchup ? <div className={`schedule-matchup-cell grade-${matchup.grade} ${displayedTeams.length > 1 && matchup.effectiveRank === bestRank ? "best" : ""}`} title={`${team.displayName} ${matchupLabel(game)} · FantasyPros #${matchup.baselineRank}${matchup.usesLeagueModel ? ` · UTH model #${matchup.modelRank}` : ""} · ${game.neutralSite ? "neutral site, no adjustment" : `${game.homeAway} adjustment ${matchup.locationAdjustment > 0 ? "+" : ""}${matchup.locationAdjustment}`} · effective #${matchup.effectiveRank.toFixed(1)}`}><span>{matchupLabel(game)}{game.neutralSite ? <sup>N</sup> : null}</span><strong>{matchup.grade}<small>/5</small></strong><em>{matchup.usesLeagueModel ? "UTH" : "OPP"} #{matchup.effectiveRank.toFixed(1)}</em></div> : <div className="schedule-matchup-cell schedule-bye"><span>BYE</span><em>no game</em></div>}</td>)}</tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      </> : <section className="schedule-empty panel"><strong>No schedules selected</strong><p>Add a team above to begin comparing the 2026 season.</p></section>}

      <footer className="schedule-methodology">
        <div><strong>How ranking works</strong><p>Strength is normalized to 0–100 from exact opponent rank; 100 is easiest. Home games receive a documented −0.5 rank adjustment, road games +0.5, and neutral sites zero. Grade colours remain the unadjusted FantasyPros baseline. {modelMethodology ?? "This position is not yet adjusted for UTH scoring."}</p></div>
        <div><strong>Data sources</strong><p><a href={scheduleData.sources.officialSchedule} target="_blank" rel="noreferrer">NFL schedule</a> · <a href={scheduleData.sources.schedules} target="_blank" rel="noreferrer">ESPN schedules</a> · <a href={scheduleData.sources.matchupRatings[position]} target="_blank" rel="noreferrer">FantasyPros {position} matchups</a>{modelMethodology ? " · nflverse 2024–25 play-by-play" : ""}</p></div>
      </footer>
    </main>
  );
}
