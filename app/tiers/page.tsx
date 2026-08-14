"use client";

import { ArrowCounterClockwise, ArrowLeft, Check, FloppyDisk, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const effectiveTier = useCallback((player: Player) => state?.tierOverrides[String(player.id)] ?? player.tier, [state?.tierOverrides]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return players.filter((player) => player.position === position && (!normalized || `${player.name} ${player.nflTeam} ${effectiveTier(player)}`.toLowerCase().includes(normalized))).sort((a, b) => a.positionRank - b.positionRank);
  }, [effectiveTier, players, position, query]);
  const tierCounts = useMemo(() => {
    const counts = new Map<string, number>();
    players.filter((player) => player.position === position).forEach((player) => counts.set(effectiveTier(player), (counts.get(effectiveTier(player)) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => Number(a[0].match(/\d+/)?.[0] ?? 999) - Number(b[0].match(/\d+/)?.[0] ?? 999));
  }, [effectiveTier, players, position]);

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

  if (!state) return <main className="management-shell"><div className="management-loading">Loading tier editor…</div></main>;
  const sold = new Set(state.sales.map((sale) => sale.playerId));
  const kept = new Set(state.keepers.map((keeper) => keeper.playerId));

  return <main className="management-shell">
    <header className="management-header">
      <div><Link href="/" className="back-link"><ArrowLeft /> Auction Room</Link><span className="eyebrow">PLAYER CLASSIFICATION</span><h1>Tier Editor</h1><p>Override any calculated position tier. Manual tiers persist when the auction board is reset.</p></div>
      <div className="management-summary"><span><strong>{Object.keys(state.tierOverrides).length}</strong><small>overrides</small></span><span><strong>{players.length}</strong><small>players</small></span><span><strong>{tierCounts.length}</strong><small>{position} tiers</small></span></div>
    </header>

    <section className="tier-editor-panel panel">
      <div className="tier-editor-toolbar"><div className="segmented">{EDITABLE_POSITIONS.map((item) => <button key={item} className={item === position ? "selected" : ""} onClick={() => { setPosition(item); setQuery(""); }}>{item}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${position} players or tiers`} /></div>
      <div className="tier-count-strip">{tierCounts.map(([tier, count]) => <button key={tier} onClick={() => setQuery(tier)}><strong>{tier}</strong><small>{count} players</small></button>)}</div>
      <div className="tier-editor-table-wrap"><table className="tier-editor-table"><thead><tr><th>RK</th><th>PLAYER</th><th>CALCULATED</th><th>MANUAL TIER</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((player) => {
        const override = state.tierOverrides[String(player.id)];
        const draft = drafts[player.id] ?? effectiveTier(player);
        const status = kept.has(player.id) ? "KEEPER" : sold.has(player.id) ? "SOLD" : "AVAILABLE";
        return <tr key={player.id}><td className="rank">{player.positionRank}</td><td><div className="player-cell"><span className={positionClass(player.position)}>{player.position}</span><span><strong>{player.name}</strong><small>{player.nflTeam}</small></span></div></td><td><span className="calculated-tier">{player.tier}</span></td><td><input className={override ? "tier-input overridden" : "tier-input"} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [player.id]: event.target.value.toUpperCase() }))} onKeyDown={(event) => { if (event.key === "Enter") void saveTier(player, draft); }} /></td><td><span className={`player-status status-${status.toLowerCase()}`}>{status}</span></td><td><div className="tier-actions"><button aria-label={`Save ${player.name} tier`} title="Save tier" disabled={savingId === player.id || draft === effectiveTier(player)} onClick={() => void saveTier(player, draft)}><FloppyDisk /></button><button aria-label={`Restore ${player.name} calculated tier`} title="Use calculated tier" disabled={savingId === player.id || !override} onClick={() => void saveTier(player, "")}><ArrowCounterClockwise /></button></div></td></tr>;
      })}</tbody></table>{!filtered.length && <div className="keeper-empty">No players match this search.</div>}</div>
    </section>
    {notice && <div className={`toast ${notice.kind}`}>{notice.kind === "success" ? <Check /> : <Warning />}{notice.text}</div>}
  </main>;
}
