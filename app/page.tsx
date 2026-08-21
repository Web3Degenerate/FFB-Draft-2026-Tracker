"use client";

import {
  ArrowCounterClockwise, ArrowsClockwise, Broadcast, CaretDown, Check, CurrencyDollar,
  Gauge, MagnifyingGlass, SlidersHorizontal, Target, Trash, UsersThree, Warning, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FantasyIndexRank } from "@/app/components/fantasy-index-rank";
import { availablePlayers, calculateInflation, calculateMarketMultiplier, teamSnapshots, tierSnapshots } from "@/lib/auction";
import { playoffScheduleStrengthForPlayer } from "@/lib/schedule-strength";
import { teamDisplayName } from "@/lib/teams";
import { sortPlayersByTierOrder } from "@/lib/tier-order";
import type { DashboardPayload, DraftState, Player, TeamSnapshot } from "@/lib/types";
import { POSITIONS } from "@/lib/types";

type Toast = { kind: "success" | "error"; text: string } | null;

const money = (value: number) => `$${Math.round(value)}`;
const auctionMoney = (player: Player) => player.espnAuctionValue === undefined ? "—" : money(player.espnAuctionValue);
const positionClass = (position: string) => `pos pos-${position.toLowerCase()}`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
}

function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className={`stat-card ${accent ? "accent" : ""}`}>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

function TeamBadges({ team }: { team: TeamSnapshot }) {
  return (
    <div className="needs-list">
      {team.needs.length ? team.needs.map((position) => <span className={positionClass(position)} key={position}>{position}</span>) : <span className="filled">Starters set</span>}
    </div>
  );
}

export default function Home() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [bid, setBid] = useState(1);
  const [winner, setWinner] = useState(0);
  const [showRelay, setShowRelay] = useState(false);
  const [draftLeagueIdInput, setDraftLeagueIdInput] = useState("");
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clock, setClock] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await jsonFetch<DashboardPayload>("/api/state");
      setPayload(data);
      setWinner(data.state.config.myTeamId);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the room");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const ready = Boolean(payload);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await jsonFetch<DashboardPayload>("/api/state?stateOnly=1&includePlayers=1");
        setPayload(result);
      } catch { /* keep the last usable snapshot */ }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [ready]);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") { setSearch(""); setShowRelay(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const state = payload?.state;
  const players = useMemo(() => payload?.players ?? [], [payload?.players]);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const available = useMemo(() => state ? availablePlayers(state, players) : [], [state, players]);
  const teams = useMemo(() => state ? teamSnapshots(state) : [], [state]);
  const tiers = useMemo(() => state ? tierSnapshots(state, players) : [], [state, players]);
  const inflation = useMemo(() => state ? calculateInflation(state, players) : 1, [state, players]);
  const marketMultiplier = useMemo(() => state ? calculateMarketMultiplier(state, players) : 1, [state, players]);
  const myTeam = teams.find((team) => team.id === state?.config.myTeamId);
  const nominee = available.find((player) => player.id === state?.nomination?.playerId) ?? null;
  const selectedTier = nominee ? tiers.find((tier) => tier.tier === nominee.tier) : null;
  const relayFresh = state?.relay.lastSeenAt ? clock - new Date(state.relay.lastSeenAt).getTime() < 6000 : false;
  const relayLabel = relayFresh ? (state?.relay.source === "extension" ? "Extension connected" : "ESPN connected") : "Manual mode";
  const nomineeId = nominee?.id ?? 0;
  const askingBid = state?.nomination?.askingBid;

  useEffect(() => {
    if (!nomineeId) return;
    const timer = window.setTimeout(() => {
      const player = players.find((item) => item.id === nomineeId);
      setBid(askingBid ?? player?.espnAuctionValue ?? player?.espnKeeperValue ?? 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [askingBid, nomineeId, players]);

  const tierNames = useMemo(() => ["ALL", ...new Set(available.filter((player) => position === "ALL" || player.position === position).map((player) => player.tier))], [available, position]);
  const visiblePlayers = useMemo(() => {
    if (!state) return [];
    const query = search.trim().toLowerCase();
    return sortPlayersByTierOrder(available
      .filter((player) => position === "ALL" || player.position === position)
      .filter((player) => tierFilter === "ALL" || player.tier === tierFilter)
      .filter((player) => !query || `${player.name} ${player.nflTeam} ${player.position} ${player.tier}`.toLowerCase().includes(query)), state)
      .slice(0, 160);
  }, [available, position, tierFilter, search, state]);
  const searchSuggestions = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.trim().toLowerCase();
    return available.filter((player) => `${player.name} ${player.nflTeam} ${player.position}`.toLowerCase().includes(query)).slice(0, 7);
  }, [available, search]);

  const action = async (body: object, success?: string) => {
    setSubmitting(true);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      if (success) setToast({ kind: "success", text: success });
    } catch (cause) {
      setToast({ kind: "error", text: cause instanceof Error ? cause.message : "Action failed" });
    } finally { setSubmitting(false); }
  };

  const nominate = (player: Player) => {
    setSearch("");
    setBid(Math.max(1, player.espnAuctionValue ?? player.espnKeeperValue));
    action({ type: "nominate", playerId: player.id });
  };

  const sell = async () => {
    if (!nominee) return;
    await action({ type: "sell", playerId: nominee.id, teamId: winner, amount: Number(bid) }, `${nominee.name} recorded for ${money(bid)}`);
  };

  const resetDraft = async () => {
    const confirmed = window.confirm(
      "Reset the auction results?\n\nThis clears every auction sale and the current nomination. Keeper players, keeper prices, and tier assignments are preserved and will still count against team rosters and budgets.\n\nClose the finished ESPN draft tab first, or its relay may import the old draft again.",
    );
    if (!confirmed) return;
    await action({ type: "reset" }, "Draft board reset");
  };

  const saveDraftLeagueId = async () => {
    const value = draftLeagueIdInput.trim();
    if (value && !/^\d+$/.test(value)) {
      setToast({ kind: "error", text: "Enter the numeric leagueId from the ESPN draft URL." });
      return;
    }
    const leagueId = value ? Number(value) : null;
    if (leagueId !== null && (!Number.isSafeInteger(leagueId) || leagueId <= 0)) {
      setToast({ kind: "error", text: "Enter a valid ESPN league ID." });
      return;
    }
    await action(
      { type: "set-relay-league", leagueId },
      leagueId ? `Listening for ESPN draft league ${leagueId}` : "ESPN draft league filter cleared",
    );
  };

  if (loading) return <main className="loading-screen"><div className="football-loader">W</div><p>Loading the auction room…</p></main>;
  if (error || !state) return <main className="loading-screen"><Warning size={36} /><h1>Couldn’t open the war room</h1><p>{error}</p><button className="primary" onClick={load}>Try again</button></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">W</div>
          <div><h1>Auction Room</h1><p>{state.config.leagueName} · {state.config.seasonId}</p></div>
        </div>
        <div className="header-actions">
          <nav className="manager-nav"><Link href="/keepers">Keepers</Link><Link href="/tiers">Tier editor</Link><Link href="/watch-list">Watch list</Link><Link href="/player-data">Player data</Link><Link href="/schedules">Schedules</Link><Link href="/rankings-history">Rankings history</Link><Link href="/draft-history">Draft history</Link></nav>
          <button className={`relay-pill ${relayFresh ? "live" : ""}`} onClick={() => { setDraftLeagueIdInput(state.relay.draftLeagueId ? String(state.relay.draftLeagueId) : ""); setShowRelay(true); }}>
            <Broadcast weight="fill" /> {relayLabel}
          </button>
          <button className="icon-button" aria-label="Undo last sale" title="Undo last sale" disabled={!state.sales.length || submitting} onClick={() => action({ type: "undo" }, "Last sale undone")}><ArrowCounterClockwise /></button>
          <button className="icon-button danger" aria-label="Reset draft board" title="Reset draft board" disabled={submitting} onClick={resetDraft}><Trash /></button>
          <button className="icon-button" aria-label="Refresh" title="Refresh player data" onClick={load}><ArrowsClockwise /></button>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="YOUR BANK" value={money(myTeam?.budgetLeft ?? 0)} detail={`${myTeam?.spotsLeft ?? 0} roster spots open`} accent />
        <StatCard label="MAX BID" value={money(myTeam?.maxBid ?? 0)} detail={`reserves $1 × ${Math.max(0, (myTeam?.spotsLeft ?? 0) - 1)}`} />
        <StatCard label="STARTER NEEDS" value={myTeam?.needs.length ? myTeam.needs.join(" · ") : "SET"} detail={`${myTeam?.rosterCount ?? 0} of ${state.config.rosterSize} players`} />
        <StatCard label="ROOM INFLATION" value={`${inflation.toFixed(2)}×`} detail={inflation > 1.08 ? "Dollars chasing scarce value" : inflation < 0.92 ? "Value is getting cheaper" : "Market near baseline"} />
      </section>

      <div className="workspace-grid">
        <section className="main-column">
          <div className={`nomination-card ${nominee ? "active" : ""}`}>
            {nominee ? (
              <>
                <div className="nominee-identity">
                  <span className="eyebrow"><Target weight="fill" /> ON THE BLOCK {state.nomination?.source === "espn-relay" && <em>LIVE</em>}</span>
                  <div className="nominee-row">
                    <span className={positionClass(nominee.position)}>{nominee.position}</span>
                    <div><h2>{nominee.name}</h2><p>{nominee.nflTeam} · {nominee.tier} · #{nominee.positionRank} {nominee.position}<FantasyIndexRank rank={nominee.fantasyIndexRank} /></p></div>
                  </div>
                </div>
                <div className="nominee-market">
                  <div><span>ESPN Auction $</span><strong>{auctionMoney(nominee)}</strong></div>
                  <div><span>ESPN Keeper $</span><strong>{money(nominee.espnKeeperValue)}</strong></div>
                  <div><span>Projection</span><strong>{nominee.projectedPoints.toFixed(1)}</strong></div>
                  <div className={selectedTier?.pressure === "LAST CALL" || selectedTier?.pressure === "TIGHT" ? "danger" : ""}>
                    <span>{nominee.tier} supply</span><strong>{selectedTier?.playersLeft ?? "—"} left</strong>
                  </div>
                  <div><span>Teams needing</span><strong>{selectedTier?.teamsNeeding ?? "—"}</strong></div>
                </div>
                <div className="sale-controls">
                  <label><span>Winning team</span><select value={winner} onChange={(event) => setWinner(Number(event.target.value))}>{teams.map((team) => <option key={team.id} value={team.id}>{teamDisplayName(team)} · max {money(team.maxBid)}</option>)}</select><CaretDown /></label>
                  <label className="bid-field"><span>Winning bid</span><div><CurrencyDollar /><input type="number" min={1} value={bid} onChange={(event) => setBid(Number(event.target.value))} /></div></label>
                  <button className="primary record-button" disabled={submitting} onClick={sell}><Check weight="bold" /> Record sale</button>
                  <button className="clear-button" aria-label="Clear nomination" onClick={() => action({ type: "clear-nomination" })}><X /></button>
                </div>
              </>
            ) : (
              <div className="nomination-empty">
                <div className="empty-icon"><Target /></div>
                <div><span className="eyebrow">NEXT NOMINATION</span><h2>Who’s on the block?</h2><p>Search any ESPN player below. Most players are one click away.</p></div>
              </div>
            )}
          </div>

          <div className="panel players-panel">
            <div className="panel-header board-header">
              <div><span className="eyebrow">PLAYER BOARD</span><h2>{available.length} players available</h2></div>
              <div className="search-wrap">
                <MagnifyingGlass />
                <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player, team or tier" />
                <kbd>/</kbd>
                {searchSuggestions.length > 0 && (
                  <div className="suggestions">
                    {searchSuggestions.map((player) => <button key={player.id} onClick={() => nominate(player)}><span className={positionClass(player.position)}>{player.position}</span><span><strong>{player.name}</strong><small>{player.nflTeam} · {player.tier}<FantasyIndexRank rank={player.fantasyIndexRank} /></small></span><b title={`ESPN Keeper ${money(player.espnKeeperValue)}`}>{auctionMoney(player)}</b></button>)}
                  </div>
                )}
              </div>
            </div>
            <div className="filters-row">
              <div className="segmented">{POSITIONS.map((item) => <button className={position === item ? "selected" : ""} key={item} onClick={() => { setPosition(item); setTierFilter("ALL"); }}>{item}</button>)}</div>
              <label className="tier-select"><SlidersHorizontal /><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}>{tierNames.map((tier) => <option key={tier}>{tier === "ALL" ? "All tiers" : tier}</option>)}</select><CaretDown /></label>
            </div>
            <div className="player-table-wrap">
              <table className="player-table">
                <thead><tr><th>RK</th><th>PLAYER</th><th>TIER</th><th>PROJ</th><th>W15–17</th><th>ESPN AUCTION $</th><th>ESPN KEEPER $</th><th>MARKET $</th><th /></tr></thead>
                <tbody>{visiblePlayers.map((player) => {
                  const snapshot = tiers.find((tier) => tier.tier === player.tier);
                  const playoffStrength = playoffScheduleStrengthForPlayer(player);
                  return <tr key={player.id} onDoubleClick={() => nominate(player)}>
                    <td className="rank">{player.positionRank}</td>
                    <td><div className="player-cell"><span className={positionClass(player.position)}>{player.position}</span><span><strong>{player.name}</strong><small>{player.nflTeam}<FantasyIndexRank rank={player.fantasyIndexRank} /></small></span></div></td>
                    <td><span className={`tier-chip pressure-${snapshot?.pressure.toLowerCase().replace(" ", "-")}`}>{player.tier}<small>{snapshot?.playersLeft} left</small></span></td>
                    <td className="mono">{player.projectedPoints.toFixed(1)}</td>
                    <td><span className="schedule-strength-badge" title={`${player.position} playoff schedule strength, Weeks 15–17`}>{playoffStrength === null ? "—" : Math.round(playoffStrength)}</span></td>
                    <td className="mono auction-value">{auctionMoney(player)}</td>
                    <td className="mono keeper-value">{money(player.espnKeeperValue)}</td>
                    <td className="mono market-value">{money(1 + Math.max(0, player.espnKeeperValue - 1) * marketMultiplier)}</td>
                    <td><button className="nominate-button" onClick={() => nominate(player)}>Nominate</button></td>
                  </tr>;
                })}</tbody>
              </table>
              {!visiblePlayers.length && <Empty>No available players match these filters.</Empty>}
            </div>
          </div>
        </section>

        <aside className="side-column">
          <div className="panel tier-panel">
            <div className="panel-header"><div><span className="eyebrow">TIER PRESSURE</span><h2>Scarcity radar</h2></div><Gauge /></div>
            <div className="tier-list">
              {tiers.filter((tier) => ["RB", "WR", "QB", "TE"].includes(tier.position)).slice(0, 14).map((tier) => (
                <button key={tier.tier} className={`tier-row pressure-${tier.pressure.toLowerCase().replace(" ", "-")}`} onClick={() => { setPosition(tier.position); setTierFilter(tier.tier); }}>
                  <span className={positionClass(tier.position)}>{tier.tier}</span>
                  <span className="tier-numbers"><strong>{tier.playersLeft}</strong><small>left</small></span>
                  <span className="tier-demand"><UsersThree /> {tier.teamsNeeding} need</span>
                  <span className="pressure-label">{tier.pressure}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel teams-panel">
            <div className="panel-header"><div><span className="eyebrow">ROOM INTELLIGENCE</span><h2>Opponent needs</h2></div><button className="text-button" onClick={() => setShowAllTeams((value) => !value)}>{showAllTeams ? "Collapse" : "All 12"}</button></div>
            <div className="teams-list">
              {(showAllTeams ? teams : teams.slice().sort((a, b) => b.maxBid - a.maxBid).slice(0, 6)).map((team) => (
                <div key={team.id} className={`team-row ${team.id === state.config.myTeamId ? "mine" : ""}`}>
                  <div className="team-name"><strong>{teamDisplayName(team)}</strong><small>{team.rosterCount}/{state.config.rosterSize} rostered {team.keeperCount ? `· ${team.keeperCount} kept` : ""} {team.id === state.config.myTeamId && "· YOU"}</small></div>
                  <TeamBadges team={team} />
                  <div className="team-money"><strong>{money(team.budgetLeft)}</strong><small>max {money(team.maxBid)}</small></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel recent-panel">
            <div className="panel-header"><div><span className="eyebrow">DRAFT LOG</span><h2>Recent sales</h2></div><span className="sale-count">{state.sales.length}</span></div>
            <div className="recent-list">
              {state.sales.length ? state.sales.slice().reverse().slice(0, 8).map((sale) => {
                const team = state.teams.find((item) => item.id === sale.teamId);
                const salePlayer = playerById.get(sale.playerId);
                return <div className="recent-row" key={sale.id}><span className={positionClass(sale.position)}>{sale.position}</span><span><strong>{sale.playerName}</strong><small>{team ? teamDisplayName(team) : "Unknown team"}<FantasyIndexRank rank={salePlayer?.fantasyIndexRank} /></small></span><b>{money(sale.amount)}</b></div>;
              }) : <Empty>Sales appear here as the draft moves.</Empty>}
            </div>
          </div>
        </aside>
      </div>

      {showRelay && <div className="modal-backdrop" onMouseDown={() => setShowRelay(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowRelay(false)}><X /></button>
        <div className="modal-icon"><Broadcast weight="fill" /></div><span className="eyebrow">OPTIONAL LIVE LINK</span><h2>Connect the open ESPN draft</h2>
        <p>The relay only reads the visible nomination and completed-sale messages in your signed-in ESPN tab. It sends no credentials and changes nothing on ESPN.</p>
        <div className="relay-league-setting">
          <label htmlFor="draft-league-id"><span>ESPN draft league ID <em>optional</em></span><small>Paste the <code>leagueId</code> from the ESPN draft URL.</small></label>
          <div><input id="draft-league-id" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 1447096059" value={draftLeagueIdInput} onChange={(event) => setDraftLeagueIdInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveDraftLeagueId(); }} /><button disabled={submitting} onClick={() => void saveDraftLeagueId()}>Save</button></div>
          <p>{state.relay.draftLeagueId ? <>Only ESPN draft <strong>{state.relay.draftLeagueId}</strong> can feed this room.</> : <>No draft league is selected. Manual entry still works, and protected league data will not be replaced.</>} Your league <strong>{state.config.leagueId}</strong> and its {state.keepers.length} keepers stay unchanged.</p>
        </div>
        <ol><li>Keep this app running in this browser.</li><li>Open ESPN’s draft tab and its Developer Console.</li><li>Paste the copied relay below and press Return.</li></ol>
        <div className="code-box"><code>Self-contained relay—no ESPN-side fetch</code><button onClick={async () => { try { const origin = window.location.origin; const source = await fetch("/espn-relay.js", { cache: "no-store" }).then((response) => response.text()); await navigator.clipboard.writeText(source.replaceAll("__CODEX_FFB_BASE__", origin)); setToast({ kind: "success", text: "Complete relay copied" }); } catch { setToast({ kind: "error", text: "Could not copy relay" }); } }} >Copy relay</button></div>
        <div className={`relay-status ${relayFresh ? "live" : ""}`}><span />{relayFresh ? "Connected and listening" : "Waiting for ESPN tab"}</div>
        <p className="privacy-note">Always copy the relay from this screen—it embeds the app’s actual port and does not fetch code from inside ESPN. Manual entry remains available if ESPN changes its page.</p>
      </div></div>}

      {toast && <div className={`toast ${toast.kind}`}>{toast.kind === "success" ? <Check weight="bold" /> : <Warning weight="fill" />}{toast.text}</div>}
    </main>
  );
}
