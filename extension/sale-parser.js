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

  globalThis.CodexFfbSaleParser = { clean, identity, number, parseSaleRow, readSales };
})();
