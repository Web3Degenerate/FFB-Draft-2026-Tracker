"use client";

import { ArrowLeft, ArrowsClockwise, Check, Crown, FloppyDisk, MagnifyingGlass, Trash, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FantasyIndexRank } from "@/app/components/fantasy-index-rank";
import { teamSnapshots } from "@/lib/auction";
import { teamDisplayName } from "@/lib/teams";
import type { DashboardPayload, DraftState } from "@/lib/types";

type Notice = { kind: "success" | "error"; text: string } | null;
const money = (value: number) => `$${Math.round(value)}`;
const positionClass = (position: string) => `pos pos-${position.toLowerCase()}`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
}

export default function KeepersPage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [teamId, setTeamId] = useState(0);
  const [playerId, setPlayerId] = useState(0);
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState(5);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [keeperPriceDrafts, setKeeperPriceDrafts] = useState<Record<string, number>>({});
  const [teamAliasDrafts, setTeamAliasDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await jsonFetch<DashboardPayload>("/api/state");
      setPayload(data);
      setTeamId((current) => current || data.state.config.myTeamId);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load keepers" });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const state = payload?.state;
  const players = useMemo(() => payload?.players ?? [], [payload?.players]);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const teams = useMemo(() => state ? teamSnapshots(state) : [], [state]);
  const selectedPlayer = players.find((player) => player.id === playerId);
  const soldPlayerIds = useMemo(() => new Set(state?.sales.map((sale) => sale.playerId) ?? []), [state?.sales]);
  const keeperPlayerIds = useMemo(() => new Set(state?.keepers.map((keeper) => keeper.playerId) ?? []), [state?.keepers]);
  const selectedPlayerIsSold = selectedPlayer ? soldPlayerIds.has(selectedPlayer.id) : false;
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || playerId) return [];
    return players
      .filter((player) => !keeperPlayerIds.has(player.id))
      .filter((player) => `${player.name} ${player.nflTeam} ${player.position} ${state?.tierOverrides[String(player.id)] ?? player.tier}`.toLowerCase().includes(normalized))
      .sort((a, b) => a.overallRank - b.overallRank)
      .slice(0, 8);
  }, [keeperPlayerIds, playerId, players, query, state?.tierOverrides]);

  const action = async (body: object) => {
    setSaving(true);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Keeper update failed" });
      return false;
    } finally { setSaving(false); }
  };

  const addKeeper = async () => {
    if (!selectedPlayer) { setNotice({ kind: "error", text: "Choose a player first." }); return; }
    if (selectedPlayerIsSold) { setNotice({ kind: "error", text: `${selectedPlayer.name} is in the completed auction. Reset Auction Room results before assigning keepers.` }); return; }
    if (await action({ type: "add-keeper", playerId: selectedPlayer.id, teamId, amount: Number(price) })) {
      setNotice({ kind: "success", text: `${selectedPlayer.name} added as a ${money(price)} keeper.` });
      setPlayerId(0);
      setQuery("");
      setPrice(5);
    }
  };

  const updateKeeperPrice = async (keeperId: string, playerName: string, currentAmount: number) => {
    const amount = keeperPriceDrafts[keeperId] ?? currentAmount;
    if (await action({ type: "update-keeper-price", keeperId, amount })) {
      setKeeperPriceDrafts((current) => { const next = { ...current }; delete next[keeperId]; return next; });
      setNotice({ kind: "success", text: `${playerName}'s keeper price updated to ${money(amount)}.` });
    }
  };

  const updateTeamAlias = async (targetTeamId: number, teamName: string, currentAlias: string) => {
    const alias = (teamAliasDrafts[targetTeamId] ?? currentAlias).trim();
    if (await action({ type: "set-team-alias", teamId: targetTeamId, alias })) {
      setTeamAliasDrafts((current) => { const next = { ...current }; delete next[targetTeamId]; return next; });
      setNotice({ kind: "success", text: alias ? `${teamDisplayName({ name: teamName, alias })} saved.` : `${teamName}'s personal nickname was cleared.` });
    }
  };

  const syncTeamNames = async () => {
    setSaving(true);
    try {
      const result = await jsonFetch<{ state: DraftState; changed: Array<{ id: number; from: string; to: string }> }>("/api/teams/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setNotice({ kind: "success", text: result.changed.length ? `${result.changed.length} ESPN team name${result.changed.length === 1 ? "" : "s"} updated.` : "Team names already match ESPN." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not refresh ESPN team names" });
    } finally { setSaving(false); }
  };

  if (!state) return <main className="management-shell"><div className="management-loading">Loading keeper manager…</div></main>;
  const committed = state.keepers.reduce((sum, keeper) => sum + keeper.amount, 0);

  return <main className="management-shell">
    <header className="management-header">
      <div><nav className="management-nav-links"><Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link><Link href="/schedules" className="back-link">Schedules</Link></nav><span className="eyebrow">PRE-DRAFT SETUP</span><h1>Keeper Manager</h1><p>Assign up to two keepers per team. Their prices immediately reduce auction budgets and the players leave the draft pool.</p></div>
      <div className="management-header-tools"><button className="sync-teams-button" disabled={saving} onClick={() => void syncTeamNames()}><ArrowsClockwise /> Sync ESPN names</button><div className="management-summary"><span><strong>{state.keepers.length}</strong><small>keepers</small></span><span><strong>{money(committed)}</strong><small>committed</small></span><span><strong>{state.teams.filter((team) => state.keepers.some((keeper) => keeper.teamId === team.id)).length}</strong><small>teams set</small></span></div></div>
    </header>

    <section className="keeper-builder panel">
      <div className="panel-header"><div><span className="eyebrow">ADD KEEPER</span><h2>Reserve a player</h2></div><Crown /></div>
      <div className="keeper-form">
        <label><span>Team</span><select value={teamId} onChange={(event) => setTeamId(Number(event.target.value))}>{teams.map((team) => <option key={team.id} value={team.id}>{teamDisplayName(team)} · {team.keeperCount}/2 kept</option>)}</select></label>
        <label className="keeper-search"><span>Player</span><div><MagnifyingGlass /><input value={query} placeholder="Search every ESPN player" onChange={(event) => { setQuery(event.target.value); setPlayerId(0); }} /></div>{suggestions.length > 0 && <div className="keeper-suggestions">{suggestions.map((player) => { const sold = soldPlayerIds.has(player.id); return <button key={player.id} onClick={() => { setPlayerId(player.id); setQuery(player.name); }}><span className={positionClass(player.position)}>{player.position}</span><span><strong>{player.name}</strong><small>{player.nflTeam} · {state.tierOverrides[String(player.id)] ?? player.tier}{sold ? " · SOLD IN CURRENT AUCTION" : " · AVAILABLE"}<FantasyIndexRank rank={player.fantasyIndexRank} /></small></span></button>; })}</div>}</label>
        <label><span>Keeper price</span><input type="number" min={0} max={200} value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label>
        <button className="primary keeper-add" disabled={saving || !selectedPlayer || selectedPlayerIsSold} onClick={addKeeper}><Check weight="bold" /> Add keeper</button>
      </div>
      {selectedPlayerIsSold ? <p className="form-note form-warning"><Warning weight="fill" /> {selectedPlayer?.name} was sold in the current auction. Use Auction Room’s reset button before assigning this keeper.</p> : <p className="form-note">Search includes the full ESPN player universe. Resetting Auction Room clears auction sales but preserves every keeper below.</p>}
    </section>

    <section className="keeper-team-grid">
      {teams.map((team) => {
        const keepers = state.keepers.filter((keeper) => keeper.teamId === team.id);
        return <article className={`keeper-team-card ${team.id === state.config.myTeamId ? "mine" : ""}`} key={team.id}>
          <header><div><strong>{teamDisplayName(team)}</strong><small>ESPN TEAM · {team.id === state.config.myTeamId ? "YOUR TEAM" : team.abbreviation}</small></div><span>{keepers.length}/2</span></header>
          <div className="team-alias-editor"><label><span>Your nickname</span><input aria-label={`${teamDisplayName(team)} personal nickname`} maxLength={24} placeholder="Bass, George…" value={teamAliasDrafts[team.id] ?? team.alias ?? ""} onChange={(event) => setTeamAliasDrafts((current) => ({ ...current, [team.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void updateTeamAlias(team.id, team.name, team.alias ?? ""); }} /></label><button aria-label={`Save ${teamDisplayName(team)} personal nickname`} title="Save personal nickname" disabled={saving || (teamAliasDrafts[team.id] ?? team.alias ?? "").trim() === (team.alias ?? "")} onClick={() => void updateTeamAlias(team.id, team.name, team.alias ?? "")}><FloppyDisk /></button></div>
          <div className="keeper-card-budget"><span><small>Draft budget</small><strong>{money(team.startingBudget)}</strong></span><span><small>Budget left</small><strong>{money(team.budgetLeft)}</strong></span><span><small>Max bid</small><strong>{money(team.maxBid)}</strong></span><span><small>Open spots</small><strong>{team.spotsLeft}</strong></span></div>
          <div className="keeper-list">{keepers.length ? keepers.map((keeper) => { const editedPrice = keeperPriceDrafts[keeper.id] ?? keeper.amount; return <div className="keeper-row" key={keeper.id}><span className={positionClass(keeper.position)}>{keeper.position}</span><span><strong>{keeper.playerName}</strong><small>Keeper price<FantasyIndexRank rank={playerById.get(keeper.playerId)?.fantasyIndexRank} /></small></span><label className="keeper-price-input"><span>$</span><input aria-label={`${keeper.playerName} keeper price`} type="number" min={0} max={200} value={editedPrice} onChange={(event) => setKeeperPriceDrafts((current) => ({ ...current, [keeper.id]: Number(event.target.value) }))} onKeyDown={(event) => { if (event.key === "Enter") void updateKeeperPrice(keeper.id, keeper.playerName, keeper.amount); }} /></label><button className="keeper-save-price" aria-label={`Save ${keeper.playerName} keeper price`} title="Save keeper price" disabled={saving || editedPrice === keeper.amount} onClick={() => void updateKeeperPrice(keeper.id, keeper.playerName, keeper.amount)}><FloppyDisk /></button><button aria-label={`Remove ${keeper.playerName}`} title="Remove keeper" disabled={saving} onClick={async () => { if (await action({ type: "remove-keeper", keeperId: keeper.id })) setNotice({ kind: "success", text: `${keeper.playerName} returned to the player pool.` }); }}><Trash /></button></div>; }) : <div className="keeper-empty">No keepers assigned</div>}</div>
        </article>;
      })}
    </section>
    {notice && <div className={`toast ${notice.kind}`}>{notice.kind === "success" ? <Check /> : <Warning />}{notice.text}</div>}
  </main>;
}
