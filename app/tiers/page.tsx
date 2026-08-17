"use client";

import { ArrowCounterClockwise, ArrowLeft, Check, DotsSixVertical, Eye, FloppyDisk, PencilSimple, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FantasyIndexRank } from "@/app/components/fantasy-index-rank";
import { effectivePlayerTier, sortPlayersByTierOrder } from "@/lib/tier-order";
import type { DashboardPayload, DraftState, Player, Position } from "@/lib/types";

type Notice = { kind: "success" | "error"; text: string } | null;
const EDITABLE_POSITIONS: Position[] = ["RB", "WR", "QB", "TE", "K", "DST"];
const positionClass = (position: string) => `pos pos-${position.toLowerCase()}`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
}

export default function TierEditorPage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [position, setPosition] = useState<Position>("RB");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState(0);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<number[]>([]);
  const [draggingPlayerId, setDraggingPlayerId] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try { setPayload(await jsonFetch<DashboardPayload>("/api/state")); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load tiers" }); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const state = payload?.state;
  const players = useMemo(() => payload?.players ?? [], [payload?.players]);
  const effectiveTier = useCallback((player: Player) => state ? effectivePlayerTier(state, player) : player.tier, [state]);
  const filtered = useMemo(() => {
    if (!state) return [];
    const positionPlayers = players.filter((player) => player.position === position);
    if (editingTier) {
      const tierPlayers = new Map(positionPlayers.filter((player) => effectiveTier(player) === editingTier).map((player) => [player.id, player]));
      return orderDraft.flatMap((playerId) => tierPlayers.get(playerId) ?? []);
    }
    const normalized = query.trim().toLowerCase();
    return sortPlayersByTierOrder(positionPlayers.filter((player) => !normalized || `${player.name} ${player.nflTeam} ${effectiveTier(player)}`.toLowerCase().includes(normalized)), state);
  }, [editingTier, effectiveTier, orderDraft, players, position, query, state]);
  const tierCounts = useMemo(() => {
    const counts = new Map<string, number>();
    players.filter((player) => player.position === position).forEach((player) => counts.set(effectiveTier(player), (counts.get(effectiveTier(player)) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => Number(a[0].match(/\d+/)?.[0] ?? 999) - Number(b[0].match(/\d+/)?.[0] ?? 999));
  }, [effectiveTier, players, position]);

  const beginOrderEdit = (tier: string) => {
    if (!state) return;
    const ordered = sortPlayersByTierOrder(players.filter((player) => player.position === position && effectiveTier(player) === tier), state);
    setEditingTier(tier);
    setOrderDraft(ordered.map((player) => player.id));
    setDraggingPlayerId(0);
    setQuery("");
  };

  const cancelOrderEdit = () => {
    setEditingTier(null);
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

  const saveTierOrder = async () => {
    if (!editingTier) return;
    setSavingOrder(true);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "set-tier-order", tier: editingTier, playerIds: orderDraft }) });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setNotice({ kind: "success", text: `${editingTier} order saved and locked.` });
      cancelOrderEdit();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save tier order" });
    } finally { setSavingOrder(false); }
  };

  const saveTier = async (player: Player, tier: string) => {
    setSavingId(player.id);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "set-tier", playerId: player.id, tier }) });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setDrafts((current) => { const next = { ...current }; delete next[player.id]; return next; });
      setNotice({ kind: "success", text: tier.trim() ? `${player.name} moved to ${tier.trim().toUpperCase()}.` : `${player.name} restored to the calculated tier.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Tier update failed" });
    } finally { setSavingId(0); }
  };

  const setWatchListPlayer = async (player: Player, included: boolean) => {
    setSavingId(player.id);
    try {
      const result = await jsonFetch<{ state: DraftState }>("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "set-watch-list-player", playerId: player.id, included }) });
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setNotice({ kind: "success", text: included ? `${player.name} added to your Watch List.` : `${player.name} removed from your Watch List.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Watch List update failed" });
    } finally { setSavingId(0); }
  };

  if (!state) return <main className="management-shell"><div className="management-loading">Loading tier editor…</div></main>;
  const sold = new Set(state.sales.map((sale) => sale.playerId));
  const kept = new Set(state.keepers.map((keeper) => keeper.playerId));

  return <main className="management-shell">
    <header className="management-header">
      <div><nav className="management-nav-links"><Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link><Link href="/watch-list" className="back-link"><Eye /> Watch List</Link></nav><span className="eyebrow">PLAYER CLASSIFICATION</span><h1>Tier Editor</h1><p>Override calculated tiers, set the order inside each tier, and choose players for your persistent Watch List.</p></div>
      <div className="management-summary"><span><strong>{state.watchList.length}</strong><small>watched</small></span><span><strong>{Object.keys(state.tierOverrides).length}</strong><small>overrides</small></span><span><strong>{tierCounts.length}</strong><small>{position} tiers</small></span></div>
    </header>

    <section className="tier-editor-panel panel">
      <div className="tier-editor-toolbar"><div className="segmented">{EDITABLE_POSITIONS.map((item) => <button key={item} disabled={Boolean(editingTier)} className={item === position ? "selected" : ""} onClick={() => { setPosition(item); setQuery(""); }}>{item}</button>)}</div><input value={editingTier ? `Editing ${editingTier} order` : query} disabled={Boolean(editingTier)} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${position} players or tiers`} /></div>
      <div className="tier-count-strip">{tierCounts.map(([tier, count]) => <div className={`tier-count-card ${editingTier === tier ? "editing" : ""}`} key={tier}><button className="tier-filter-button" disabled={Boolean(editingTier)} onClick={() => setQuery(tier)}><strong>{tier}</strong><small>{count} players</small></button><button className="tier-order-edit-button" disabled={Boolean(editingTier)} onClick={() => beginOrderEdit(tier)}><PencilSimple /> Edit order</button></div>)}</div>
      {editingTier && <div className="tier-order-mode"><DotsSixVertical /><div><strong>Editing {editingTier} order</strong><small>Drag players into your preferred order, then save to lock the list again.</small></div><button className="tier-order-cancel" disabled={savingOrder} onClick={cancelOrderEdit}><X /> Cancel</button><button className="tier-order-save" disabled={savingOrder} onClick={() => void saveTierOrder()}><FloppyDisk /> Save order</button></div>}
      <div className="tier-editor-table-wrap"><table className="tier-editor-table"><thead><tr><th>{editingTier ? "DRAG" : "RK"}</th><th>PLAYER</th><th>CALCULATED</th><th>MANUAL TIER</th><th>WATCH</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((player, orderIndex) => {
        const override = state.tierOverrides[String(player.id)];
        const draft = drafts[player.id] ?? effectiveTier(player);
        const status = kept.has(player.id) ? "KEEPER" : sold.has(player.id) ? "SOLD" : "AVAILABLE";
        const watched = state.watchList.includes(player.id);
        return <tr className={`${editingTier ? "tier-order-row" : ""} ${draggingPlayerId === player.id ? "dragging" : ""}`} draggable={Boolean(editingTier)} key={player.id} onDragStart={(event) => { if (!editingTier) return; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(player.id)); setDraggingPlayerId(player.id); }} onDragEnter={() => { if (editingTier) moveOrderPlayer(draggingPlayerId, player.id); }} onDragOver={(event) => { if (editingTier) event.preventDefault(); }} onDrop={(event) => { if (!editingTier) return; event.preventDefault(); setDraggingPlayerId(0); }} onDragEnd={() => setDraggingPlayerId(0)}><td className="rank">{editingTier ? <span className="tier-drag-handle"><DotsSixVertical />{orderIndex + 1}</span> : player.positionRank}</td><td><div className="player-cell"><span className={positionClass(player.position)}>{player.position}</span><span><strong>{player.name}</strong><small>{player.nflTeam}<FantasyIndexRank rank={player.fantasyIndexRank} /></small></span></div></td><td><span className="calculated-tier">{player.tier}</span></td><td><input disabled={Boolean(editingTier)} className={override ? "tier-input overridden" : "tier-input"} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [player.id]: event.target.value.toUpperCase() }))} onKeyDown={(event) => { if (event.key === "Enter") void saveTier(player, draft); }} /></td><td><label className="watch-checkbox"><input type="checkbox" checked={watched} disabled={Boolean(editingTier) || savingId === player.id} onChange={(event) => void setWatchListPlayer(player, event.target.checked)} /><span aria-hidden><Check weight="bold" /></span><small>{watched ? "Watching" : "Add"}</small></label></td><td><span className={`player-status status-${status.toLowerCase()}`}>{status}</span></td><td><div className="tier-actions"><button aria-label={`Save ${player.name} tier`} title="Save tier" disabled={Boolean(editingTier) || savingId === player.id || draft === effectiveTier(player)} onClick={() => void saveTier(player, draft)}><FloppyDisk /></button><button aria-label={`Restore ${player.name} calculated tier`} title="Use calculated tier" disabled={Boolean(editingTier) || savingId === player.id || !override} onClick={() => void saveTier(player, "")}><ArrowCounterClockwise /></button></div></td></tr>;
      })}</tbody></table>{!filtered.length && <div className="keeper-empty">No players match this search.</div>}</div>
    </section>
    {notice && <div className={`toast ${notice.kind}`}>{notice.kind === "success" ? <Check /> : <Warning />}{notice.text}</div>}
  </main>;
}
