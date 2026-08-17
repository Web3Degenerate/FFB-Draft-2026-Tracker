(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const identity = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const number = (value) => Number(String(value || "").replace(/[^0-9]/g, ""));

  function parseSaleRow(row) {
    const rowText = clean(row.innerText || row.textContent);
    const priceText = clean((row.querySelector(".pick-info") || row).textContent);
    const priceMatch = priceText.match(/\$(\d+)\s*-\s*(.+)$/s);
    const fallbackPlayer = rowText.match(/^(.+?)\s*\/\s*([A-Z]{2,3})\s+(QB|RB|WR|TE|K|D\/ST|DST)/);
    const playerName = clean(row.querySelector(".playerinfo__playername")?.textContent || fallbackPlayer?.[1]);
    const rawPosition = clean(row.querySelector(".playerinfo__playerpos")?.textContent || fallbackPlayer?.[3]).toUpperCase();
    if (!priceMatch || !playerName || !rawPosition) return null;
    const image = row.querySelector('img[src*="full/"]');
    const idMatch = image?.getAttribute("src")?.match(/full\/(\d+)\.png/);
    return {
      playerId: idMatch ? Number(idMatch[1]) : undefined,
      playerName,
      position: rawPosition === "D/ST" ? "DST" : rawPosition,
      teamName: clean(priceMatch[2]),
      amount: Number(priceMatch[1]),
    };
  }

  function readSales(root = document) {
    return [...root.querySelectorAll("li.pick-message__container")].map(parseSaleRow).filter(Boolean);
  }

  function parseAuctionValueRow(row, priceIndex) {
    const name = clean(row.querySelector(".playerinfo__playername")?.textContent);
    if (!name) return null;
    const cells = [...row.children];
    const priceText = priceIndex >= 0 ? clean(cells[priceIndex]?.textContent) : "";
    const priceMatch = priceText.match(/^\$(\d+)$/);
    if (!priceMatch) return null;
    const image = row.querySelector('img[src*="full/"]');
    const idMatch = image?.getAttribute("src")?.match(/full\/(\d+)\.png/);
    return {
      playerId: idMatch ? Number(idMatch[1]) : undefined,
      playerName: name,
      amount: Number(priceMatch[1]),
    };
  }

  function readAuctionValues(root = document) {
    const values = new Map();
    [...root.querySelectorAll("table")].forEach((table) => {
      const headerRows = [...table.querySelectorAll("thead tr")];
      const header = headerRows.at(-1);
      if (!header) return;
      const headers = [...header.children].map((cell) => clean(cell.textContent).toLowerCase());
      const priceIndex = headers.findIndex((label) => label === "$" || label === "value" || label === "auction value");
      if (priceIndex < 0) return;
      table.querySelectorAll("tbody tr").forEach((row) => {
        const value = parseAuctionValueRow(row, priceIndex);
        if (!value) return;
        values.set(value.playerId ? `id:${value.playerId}` : `name:${identity(value.playerName)}`, value);
      });
    });
    return [...values.values()];
  }

  globalThis.CodexFfbSaleParser = { clean, identity, number, parseSaleRow, readSales, parseAuctionValueRow, readAuctionValues };
})();
