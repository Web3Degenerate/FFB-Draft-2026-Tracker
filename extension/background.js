/* global chrome */
const DEFAULT_BASE_URL = "http://localhost:3001";
const BADGES = {
  connected: { text: "ON", color: "#238636" },
  unreachable: { text: "!", color: "#b7791f" },
  idle: { text: "", color: "#6b7280" },
};

function normalizeBaseUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_BASE_URL));
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Only local HTTP URLs are allowed.");
    return url.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

async function configuredBaseUrl() {
  const stored = await chrome.storage.sync.get({ appBaseUrl: DEFAULT_BASE_URL });
  return normalizeBaseUrl(stored.appBaseUrl);
}

async function requestJson(path, init = {}, requestedBase) {
  const baseUrl = normalizeBaseUrl(requestedBase || await configuredBaseUrl());
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Auction Room returned ${response.status}`);
  return { body, baseUrl };
}

async function fetchEspnLeague(league) {
  const leagueId = Number(league?.leagueId);
  const seasonId = Number(league?.seasonId);
  if (!leagueId || !seasonId) throw new Error("ESPN league information is missing from the draft URL.");
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mTeam&view=mSettings`;
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  if (!response.ok) throw new Error(`ESPN team lookup returned ${response.status}`);
  const data = await response.json();
  const teams = (data.teams || []).map((team) => ({
    id: Number(team.id),
    name: team.name || [team.location, team.nickname].filter(Boolean).join(" ") || `Team ${team.id}`,
    abbreviation: team.abbrev || `T${team.id}`,
  }));
  if (!teams.length) throw new Error("ESPN returned no league teams.");
  return { leagueName: data.settings?.name, teams };
}

async function setBadge(tabId, state) {
  if (typeof tabId !== "number") return;
  const badge = BADGES[state] || BADGES.idle;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  await chrome.action.setBadgeText({ tabId, text: badge.text });
}

async function saveStatus(status) {
  await chrome.storage.local.set({ relayStatus: { ...status, at: new Date().toISOString() } });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get({ appBaseUrl: DEFAULT_BASE_URL }).then((settings) => chrome.storage.sync.set(settings));
  void chrome.action.setBadgeBackgroundColor({ color: BADGES.idle.color });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    const tabId = sender.tab?.id;
    try {
      if (message?.type === "relay-pulse") {
        const { body, baseUrl } = await requestJson("/api/relay", {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ ...message.payload, transport: "extension" }),
        });
        await setBadge(tabId, "connected");
        await saveStatus({ state: "connected", baseUrl, message: `Connected · ${body.received ?? 0} sales visible`, skipped: body.skipped ?? [] });
        sendResponse(body);
        return;
      }

      if (message?.type === "socket-batch") {
        const { body } = await requestJson("/api/relay/socket", {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify(message.payload),
        });
        sendResponse(body);
        return;
      }

      if (message?.type === "sync-team-names") {
        let espnLeague = {};
        try {
          espnLeague = await fetchEspnLeague(message.payload?.league);
        } catch (error) {
          console.warn("Codex ESPN team lookup will use the Auction Room fallback:", error instanceof Error ? error.message : String(error));
        }
        const { body } = await requestJson("/api/teams/sync", {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ ...message.payload, ...espnLeague }),
        });
        sendResponse(body);
        return;
      }

      if (message?.type === "test-connection") {
        const { baseUrl } = await requestJson("/api/state?stateOnly=1", {}, message.baseUrl);
        sendResponse({ ok: true, baseUrl });
        return;
      }

      if (message?.type === "get-status") {
        const stored = await chrome.storage.local.get({ relayStatus: { state: "idle", message: "Open an ESPN auction draft to connect." } });
        sendResponse({ ...stored.relayStatus, baseUrl: await configuredBaseUrl() });
        return;
      }

      sendResponse({ ok: false, error: "Unknown extension message" });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await setBadge(tabId, "unreachable");
      await saveStatus({ state: "unreachable", baseUrl: await configuredBaseUrl(), message: messageText });
      sendResponse({ ok: false, error: messageText });
    }
  })();
  return true;
});
