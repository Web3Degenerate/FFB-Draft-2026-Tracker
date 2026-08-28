(() => {
  const INJECTED_BASE = "__CODEX_FFB_BASE__";
  const config = document.getElementById("codex-ffb-relay-config");
  const base = INJECTED_BASE.startsWith("http") ? INJECTED_BASE : (config?.getAttribute("content") || "http://localhost:3000");
  const ENDPOINT = `${base}/api/relay`;
  const VERSION = "0.4.1";
  const existingMarker = document.getElementById("codex-ffb-relay-running");
  if (existingMarker?.getAttribute("content") === VERSION) {
    console.info("Codex Auction Relay is already running.");
    return;
  }
  const marker = existingMarker || document.createElement("meta");
  marker.id = "codex-ffb-relay-running";
  marker.setAttribute("content", VERSION);
  if (!existingMarker) document.head.appendChild(marker);

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const identity = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const number = (value) => Number(String(value || "").replace(/[^0-9]/g, ""));
  const send = (payload) => fetch(ENDPOINT, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Local app returned ${response.status}`);
    if (body.skipped?.length) console.warn("Codex Auction Relay skipped sales:", body.skipped);
  }).catch((error) => console.warn("Codex Auction Relay:", error.message));

  function readSales() {
    return [...document.querySelectorAll("li.pick-message__container")].flatMap((row) => {
      const rowText = clean(row.innerText);
      const priceText = clean((row.querySelector(".pick-info") || row).textContent);
      const priceMatch = priceText.match(/\$(\d+)\s*-\s*(.+)$/s);
      const fallbackPlayer = rowText.match(/^(.+?)\s*\/\s*([A-Z]{2,3})\s+(QB|RB|WR|TE|K|D\/ST|DST)/);
      const playerName = clean(row.querySelector(".playerinfo__playername")?.textContent || fallbackPlayer?.[1]);
      const rawPosition = clean(row.querySelector(".playerinfo__playerpos")?.textContent || fallbackPlayer?.[3]).toUpperCase();
      if (!priceMatch || !playerName || !rawPosition) return [];
      const image = row.querySelector('img[src*="full/"]');
      const idMatch = image?.getAttribute("src")?.match(/full\/(\d+)\.png/);
      return [{
        playerId: idMatch ? Number(idMatch[1]) : undefined,
        playerName,
        position: rawPosition === "D/ST" ? "DST" : rawPosition,
        teamName: clean(priceMatch[2]),
        amount: Number(priceMatch[1]),
      }];
    });
  }

  function readLeadingBid() {
    return [...document.querySelectorAll('[data-testid="auction-pick"]')].flatMap((card) => {
      const bid = card.querySelector(".bid-amount");
      if (!bid || bid.style?.opacity === "0" || bid.hidden || bid.getAttribute("aria-hidden") === "true") return [];
      const amount = number(bid.textContent);
      const numberedName = clean(card.querySelector(".team-name")?.textContent);
      const teamName = clean(card.getAttribute("title") || numberedName.replace(/^\d+\.\s*/, ""));
      return amount > 0 && teamName ? [{ teamName, amount }] : [];
    })[0] ?? null;
  }

  function readDraftTeams() {
    return [...document.querySelectorAll('[data-testid="auction-pick"]')].flatMap((card, index) => {
      const numberedName = clean(card.querySelector(".team-name")?.textContent);
      const slot = Number(numberedName.match(/^(\d+)\./)?.[1]) || index + 1;
      const teamName = clean(card.getAttribute("title") || numberedName.replace(/^\d+\.\s*/, ""));
      return teamName ? [{ slot, teamName }] : [];
    }).sort((a, b) => a.slot - b.slot);
  }

  function readNomination() {
    const offerNode = [...document.querySelectorAll("body *")]
      .find((node) => node.children.length === 0 && /^Current offer:\s*\$\d+$/i.test(clean(node.textContent)));
    if (!offerNode) return null;
    let card = offerNode.parentElement;
    for (let i = 0; i < 7 && card; i += 1, card = card.parentElement) {
      const name = card.querySelector(".playerinfo__playername");
      const pos = card.querySelector(".playerinfo__playerpos");
      if (!name || !pos) continue;
      const image = card.querySelector('img[src*="full/"]');
      const idMatch = image?.getAttribute("src")?.match(/full\/(\d+)\.png/);
      const leadingBid = readLeadingBid();
      return { playerId: idMatch ? Number(idMatch[1]) : undefined, playerName: clean(name.textContent), askingBid: leadingBid?.amount ?? number(offerNode.textContent), leadingTeamName: leadingBid?.teamName };
    }
    return null;
  }

  const pulse = () => {
    if (marker.getAttribute("content") !== VERSION) return;
    const params = new URLSearchParams(window.location.search);
    const nomination = readNomination();
    const sales = readSales().filter((sale) => identity(sale.playerName) !== identity(nomination?.playerName));
    const payload = {
      type: "snapshot",
      transport: "pasted",
      league: {
        leagueId: Number(params.get("leagueId")),
        seasonId: Number(params.get("seasonId")) || new Date().getFullYear(),
        myTeamId: Number(params.get("teamId")),
      },
      nomination,
      sales,
      draftTeams: readDraftTeams(),
    };
    send(payload);
  };
  pulse();
  window.setInterval(pulse, 1500);
  console.info(`%cCodex Auction Relay ${VERSION} connected`, "color:#32d583;font-weight:bold", ENDPOINT);
})();
