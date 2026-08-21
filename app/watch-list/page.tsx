"use client";

import { ArrowLeft, Check, DotsSixVertical, FloppyDisk, PencilSimple, SlidersHorizontal, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FantasyIndexRank } from "@/app/components/fantasy-index-rank";
import { STARTER_TARGETS, teamSnapshots } from "@/lib/auction";
import { opponentPositionSpend, sortOpponentTeamsByPosition } from "@/lib/opponent-sort";
import { assignTeamRoster } from "@/lib/rosters";
import { playoffScheduleStrengthForPlayer } from "@/lib/schedule-strength";
import { teamDisplayName } from "@/lib/teams";
import { rosterSlotPosition, whoNeedsMarker } from "@/lib/watch-list-needs";
import { sortWatchListPlayers } from "@/lib/watch-list-order";
import type { DashboardPayload, DraftState, Player, Position } from "@/lib/types";

const WATCH_GROUPS: Array<{ position: Position; label: string }> = [
  { position: "RB", label: "Running Backs" },
  { position: "WR", label: "Wide Receivers" },
  { position: "QB", label: "Quarterbacks" },
  { position: "TE", label: "Tight Ends" },
  { position: "DST", label: "D/ST" },
  { position: "K", label: "Kickers" },
];
const OPPONENT_SORT_POSITIONS: Position[] = ["RB", "WR", "QB", "TE", "K", "DST"];

const money = (value: number) => `$${Math.round(value)}`;
const positionLabel = (position: Position) => position === "DST" ? "D/ST" : position;
const positionClass = (position: string) => `pos pos-${position.toLowerCase()}`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
}

export default function WatchListPage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [orderDraft, setOrderDraft] = useState<number[]>([]);
  const [draggingPlayerId, setDraggingPlayerId] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);
  const [opponentSortPosition, setOpponentSortPosition] = useState<Position>("RB");
  const [whoNeedsPosition, setWhoNeedsPosition] = useState<Position | null>(null);

  const load = useCallback(async () => {
    try {
      setPayload(await jsonFetch<DashboardPayload>("/api/state"));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the Watch List");
    }
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
      } catch { /* retain the last usable board while the next pulse retries */ }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [ready]);

  const state = payload?.state;
  const players = useMemo(() => payload?.players ?? [], [payload?.players]);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const watchedPlayers = useMemo(() => {
    if (!state) return [];
    const selected = new Set(state.watchList);
    return players.filter((player) => selected.has(player.id));
  }, [players, state]);
  const draftTeams = useMemo(() => {
    if (!state) return [];
    const order = new Map((state.relay.draftTeamOrder ?? []).map((teamId, index) => [teamId, index]));
    return teamSnapshots(state).sort((a, b) => (order.get(a.id) ?? 1000 + a.id) - (order.get(b.id) ?? 1000 + b.id));
  }, [state]);
  const opponentTeams = useMemo(() => {
    if (!state) return [];
    const opponents = draftTeams.filter((team) => team.id !== state.config.myTeamId);
    return sortOpponentTeamsByPosition(state, opponents, opponentSortPosition);
  }, [draftTeams, opponentSortPosition, state]);

  const beginOrderEdit = (position: Position) => {
    if (!state) return;
    setEditingPosition(position);
    setOrderDraft(sortWatchListPlayers(watchedPlayers, state, position).map((player) => player.id));
    setDraggingPlayerId(0);
  };

  const cancelOrderEdit = () => {
    setEditingPosition(null);
    setOrderDraft([]);
    setDraggingPlayerId(0);
  };

  const moveOrderPlayer = (movingPlayerId: number, targetPlayerId: number) => {
    if (!movingPlayerId || movingPlayerId === targetPlayerId) return;
    setOrderDraft((current) => {
      const from = current.indexOf(movingPlayerId);
      const to = current.indexOf(targetPlayerId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, movingPlayerId);
      return next;
    });
  };

  const saveOrder = async () => {
    if (!editingPosition) return;
    setSavingOrder(true);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "set-watch-list-order", position: editingPosition, playerIds: orderDraft }) });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setNotice({ kind: "success", text: `${positionLabel(editingPosition)} Watch List order saved.` });
      cancelOrderEdit();
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Could not save Watch List order" });
    } finally { setSavingOrder(false); }
  };

  if (error) return <main className="loading-screen"><Warning size={36} /><h1>Couldn’t open the Watch List</h1><p>{error}</p><button className="primary" onClick={load}>Try again</button></main>;
  if (!state) return <main className="loading-screen"><div className="football-loader">W</div><p>Loading your Watch List…</p></main>;

  const saleByPlayer = new Map(state.sales.map((sale) => [sale.playerId, sale]));
  const keeperByPlayer = new Map(state.keepers.map((keeper) => [keeper.playerId, keeper]));

  const playerStatus = (player: Player) => {
    const keeper = keeperByPlayer.get(player.id);
    const sale = saleByPlayer.get(player.id);
    const rostered = keeper ?? sale;
    if (!rostered) return { label: "Available", className: "available" };
    const team = state.teams.find((item) => item.id === rostered.teamId);
    return {
      label: `${keeper ? "Keeper" : "Sold"} · ${team ? teamDisplayName(team) : "Unknown team"}`,
      className: keeper ? "keeper" : "sold",
    };
  };

  return <main className="watch-shell">
    <header className="watch-header">
      <nav className="management-nav-links"><Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link><Link href="/tiers" className="back-link"><SlidersHorizontal /> Tier Editor</Link><Link href="/player-data" className="back-link">Player Data</Link><Link href="/schedules" className="back-link">Schedules</Link></nav>
      <div className="who-needs-bar" role="group" aria-label="Show which teams need a position">
        <strong>Who Needs:</strong>
        <div>{OPPONENT_SORT_POSITIONS.map((item) => <button aria-pressed={whoNeedsPosition === item} className={whoNeedsPosition === item ? "selected" : ""} key={item} onClick={() => setWhoNeedsPosition((current) => current === item ? null : item)}><span className={positionClass(item)}>{positionLabel(item)}</span></button>)}</div>
        <p>{whoNeedsPosition ? `Showing ${positionLabel(whoNeedsPosition)} roster counts` : "Select a position to mark team needs"}</p>
      </div>
      <div className="watch-team-strip-shell" aria-label="Live team budgets and bidding limits">
        <div className="watch-team-strip" role="list">
          {draftTeams.map((team, index) => {
            const isLeading = state.nomination?.leadingTeamId === team.id && state.nomination.askingBid !== undefined;
            const draftTeamName = state.relay.draftTeamNames?.[String(team.id)] || team.name;
            const needMarker = whoNeedsPosition ? whoNeedsMarker(team.counts, whoNeedsPosition) : null;
            return <article className={`watch-team-card ${team.id === state.config.myTeamId ? "mine" : ""} ${isLeading ? "leading" : ""}`} role="listitem" key={team.id}>
              <div className="watch-team-card-name"><span>{index + 1}.</span><strong title={draftTeamName}>{draftTeamName}</strong>{isLeading && <em title="Current highest bidder">LEADS {money(state.nomination?.askingBid ?? 0)}</em>}</div>
              {whoNeedsPosition && <div className="watch-team-need-slot">{needMarker && <b className={`watch-team-need-${needMarker.tone}`}>{needMarker.count} {positionLabel(whoNeedsPosition)}</b>}</div>}
              <div className="watch-team-card-metrics">
                <span><small>Budget</small><strong>{money(team.budgetLeft)}</strong></span>
                <span><small>Max bid</small><strong>{money(team.maxBid)}</strong></span>
                <span><small>Open</small><strong>{team.spotsLeft}</strong></span>
              </div>
            </article>;
          })}
        </div>
      </div>
    </header>

    <section className="watch-board panel">
      <div className="watch-board-heading"><div><span className="eyebrow">YOUR TARGETS</span><h2>Positional Watch List</h2></div><Link href="/tiers">Edit selections</Link></div>
      <div className="watch-columns">
        {WATCH_GROUPS.map((group) => {
          const savedPlayers = sortWatchListPlayers(watchedPlayers, state, group.position);
          const playerMap = new Map(savedPlayers.map((player) => [player.id, player]));
          const isEditing = editingPosition === group.position;
          const groupPlayers = isEditing ? orderDraft.flatMap((playerId) => playerMap.get(playerId) ?? []) : savedPlayers;
          return <article className="watch-column" key={group.position}>
            <header><span className={positionClass(group.position)}>{positionLabel(group.position)}</span><div><strong>{group.label}</strong><small>{groupPlayers.length} selected</small></div><div className="watch-order-controls">{isEditing ? <><button aria-label={`Cancel ${group.label} order`} title="Cancel order changes" disabled={savingOrder} onClick={cancelOrderEdit}><X /></button><button className="save" aria-label={`Save ${group.label} order`} title="Save order" disabled={savingOrder} onClick={() => void saveOrder()}><FloppyDisk /></button></> : <button className="edit" disabled={Boolean(editingPosition) || !groupPlayers.length} onClick={() => beginOrderEdit(group.position)}><PencilSimple /> Order</button>}</div></header>
            <div className="watch-player-list">
              {groupPlayers.map((player, orderIndex) => {
                const status = playerStatus(player);
                const tier = state.tierOverrides[String(player.id)] ?? player.tier;
                const drafted = status.className !== "available";
                const playoffStrength = playoffScheduleStrengthForPlayer(player);
                return <div className={`watch-player watch-player-${status.className} ${drafted ? "watch-player-drafted" : ""} ${isEditing ? "watch-player-order-editing" : ""} ${draggingPlayerId === player.id ? "dragging" : ""}`} draggable={isEditing} key={player.id} onDragStart={(event) => { if (!isEditing) return; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(player.id)); setDraggingPlayerId(player.id); }} onDragEnter={() => { if (isEditing) moveOrderPlayer(draggingPlayerId, player.id); }} onDragOver={(event) => { if (isEditing) event.preventDefault(); }} onDrop={(event) => { if (!isEditing) return; event.preventDefault(); setDraggingPlayerId(0); }} onDragEnd={() => setDraggingPlayerId(0)}>
                  {isEditing && <div className="watch-player-drag-handle"><DotsSixVertical /><span>{orderIndex + 1}</span></div>}
                  {drafted ? <div className="watch-player-drafted-line"><strong className="watch-player-drafted-name">{player.name}</strong><FantasyIndexRank rank={player.fantasyIndexRank} /></div> : <><div><strong>{player.name}</strong><small>{player.nflTeam} · {tier} · ESPN Auction {player.espnAuctionValue === undefined ? "—" : money(player.espnAuctionValue)} · ESPN Keeper {money(player.espnKeeperValue)} · Playoffs <b className="watch-playoff-strength">{playoffStrength === null ? "—" : Math.round(playoffStrength)}</b><FantasyIndexRank rank={player.fantasyIndexRank} /></small></div><span>{status.label}</span></>}
                </div>;
              })}
              {!groupPlayers.length && <div className="watch-empty"><Check /><span>Select {positionLabel(group.position)} players in the Tier Editor</span></div>}
            </div>
          </article>;
        })}
      </div>
    </section>

    <section className="opponent-board">
      <div className="opponent-board-heading"><div><span className="eyebrow">OPPONENT ROSTERS</span><h2>{opponentTeams.length} teams at a glance</h2></div><p>Keepers are locked here and can only be changed from the Keeper Manager.</p></div>
      <div className="opponent-sort-bar" role="group" aria-label="Sort opponent rosters by position">
        <strong>Sort by:</strong>
        <div>{OPPONENT_SORT_POSITIONS.map((item) => <button aria-pressed={opponentSortPosition === item} className={opponentSortPosition === item ? "selected" : ""} key={item} onClick={() => setOpponentSortPosition(item)}><span className={positionClass(item)}>{positionLabel(item)}</span></button>)}</div>
        <p>Fewest {positionLabel(opponentSortPosition)}s first · lower {positionLabel(opponentSortPosition)} spending breaks ties</p>
      </div>
      <div className="opponent-roster-list">
        {opponentTeams.map((team) => {
          const slots = assignTeamRoster(state, team.id);
          const positionCount = team.counts[opponentSortPosition];
          const positionSpend = opponentPositionSpend(state, team.id, opponentSortPosition);
          const starterOpen = Math.max(0, STARTER_TARGETS[opponentSortPosition] - positionCount);
          const rbPaid = opponentPositionSpend(state, team.id, "RB");
          const wrPaid = opponentPositionSpend(state, team.id, "WR");
          return <article className="opponent-roster" key={team.id}>
            <header className="opponent-team-summary">
              <div><strong>{teamDisplayName(team)}</strong><small>{team.rosterCount}/{state.config.rosterSize} filled{team.keeperCount ? ` · ${team.keeperCount} keeper${team.keeperCount === 1 ? "" : "s"}` : ""}</small><em className={starterOpen ? "needs-position" : "position-filled"}>{positionCount} {positionLabel(opponentSortPosition)} · {money(positionSpend)} spent · {starterOpen ? `${starterOpen} starter slot${starterOpen === 1 ? "" : "s"} open` : "starter filled"}</em></div>
              <span><small>Salary</small><strong>{money(team.budgetLeft)}</strong></span>
              <span><small>Max bid</small><strong>{money(team.maxBid)}</strong></span>
              <span><small>RB paid</small><strong>{money(rbPaid)}</strong></span>
              <span><small>WR paid</small><strong>{money(wrPaid)}</strong></span>
            </header>
            <div className="roster-scroll"><div className="roster-slot-grid">
              {slots.map((slot) => {
                const slotPosition = rosterSlotPosition(slot.key);
                return <div className={`roster-slot ${slot.player ? "has-player" : ""} ${slot.player?.isKeeper ? "keeper" : ""} ${slotPosition ? `roster-slot-position-${slotPosition.toLowerCase()}` : ""} ${!slot.player && slotPosition ? `roster-slot-empty-${slotPosition.toLowerCase()}` : ""}`} key={slot.key}>
                <strong title={slot.player?.playerName}>{slot.player?.playerName ?? "Open"}</strong>
                <span>{slot.label}</span>
                <small>{slot.player ? <>{positionLabel(slot.player.position)} · {slot.player.isKeeper ? "KEEPER" : money(slot.player.amount)}<FantasyIndexRank rank={playerById.get(slot.player.playerId)?.fantasyIndexRank} variant="badge" /></> : "Available slot"}</small>
              </div>})}
            </div></div>
          </article>;
        })}
      </div>
    </section>
    {notice && <div className={`toast ${notice.kind}`}>{notice.kind === "success" ? <Check /> : <Warning />}{notice.text}</div>}
  </main>;
}
