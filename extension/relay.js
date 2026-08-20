/* global chrome */
(() => {
  const VERSION = "0.3.1";
  const parser = globalThis.CodexFfbSaleParser;
  if (!parser) return;

  const socketFrames = [];
  const auctionValues = new Map();
  let socketFlushActive = false;
  let lastTeamSyncAt = 0;

  function leagueFromLocation() {
    const params = new URLSearchParams(window.location.search);
    return {
      leagueId: Number(params.get("leagueId")),
      seasonId: Number(params.get("seasonId")) || new Date().getFullYear(),
      myTeamId: Number(params.get("teamId")),
    };
  }

  function readNomination(leadingBid) {
    const offerNode = [...document.querySelectorAll("body *")]
      .find((node) => node.children.length === 0 && /^Current offer:\s*\$\d+$/i.test(parser.clean(node.textContent)));
    if (!offerNode) return null;
    let card = offerNode.parentElement;
    for (let i = 0; i < 7 && card; i += 1, card = card.parentElement) {
      const name = card.querySelector(".playerinfo__playername");
      const position = card.querySelector(".playerinfo__playerpos");
      if (!name || !position) continue;
      const image = card.querySelector('img[src*="full/"]');
      const idMatch = image?.getAttribute("src")?.match(/full\/(\d+)\.png/);
      return {
        playerId: idMatch ? Number(idMatch[1]) : undefined,
        playerName: parser.clean(name.textContent),
        askingBid: leadingBid?.amount ?? parser.number(offerNode.textContent),
        leadingTeamName: leadingBid?.teamName,
      };
    }
    return null;
  }

  async function pulse() {
    const nomination = readNomination(parser.readLeadingBid());
    const sales = parser.readSales().filter((sale) => parser.identity(sale.playerName) !== parser.identity(nomination?.playerName));
    parser.readAuctionValues().forEach((value) => {
      auctionValues.set(value.playerId ? `id:${value.playerId}` : `name:${parser.identity(value.playerName)}`, value);
    });
    try {
      const result = await chrome.runtime.sendMessage({
        type: "relay-pulse",
        payload: { type: "snapshot", transport: "extension", league: leagueFromLocation(), nomination, sales, auctionValues: [...auctionValues.values()], draftTeams: parser.readDraftTeams() },
      });
      if (result?.skipped?.length) console.warn("Codex Auction Relay skipped sales:", result.skipped);
      if (Date.now() - lastTeamSyncAt >= 60_000) {
        lastTeamSyncAt = Date.now();
        void syncTeamNames();
      }
    } catch (error) {
      console.warn("Codex Auction Relay:", error instanceof Error ? error.message : String(error));
    }
  }

  async function syncTeamNames() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "sync-team-names", payload: { league: leagueFromLocation() } });
      if (!result?.ok) console.warn("Codex team-name sync:", result?.error || "Unknown error");
      else if (result.changed?.length) console.info(`Codex Auction Relay updated ${result.changed.length} ESPN team name(s).`);
    } catch (error) {
      console.warn("Codex team-name sync:", error instanceof Error ? error.message : String(error));
    }
  }

  async function flushSocketFrames() {
    if (socketFlushActive || !socketFrames.length) return;
    socketFlushActive = true;
    const frames = socketFrames.splice(0, 500);
    try {
      await chrome.runtime.sendMessage({ type: "socket-batch", payload: { league: leagueFromLocation(), frames } });
    } catch (error) {
      console.warn("Codex socket archive:", error instanceof Error ? error.message : String(error));
      socketFrames.unshift(...frames);
    } finally {
      socketFlushActive = false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.channel !== "codex-ffb-socket-v1" || !event.data.frame) return;
    socketFrames.push(event.data.frame);
  });

  void pulse();
  window.setInterval(pulse, 1500);
  window.setInterval(flushSocketFrames, 750);
  console.info(`%cCodex Auction Extension ${VERSION} active`, "color:#32d583;font-weight:bold");
})();
