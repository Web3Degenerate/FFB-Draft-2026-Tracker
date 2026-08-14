import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

type ParsedSale = { playerId?: number; playerName: string; position: string; teamName: string; amount: number };
type Parser = { readSales(root: Document): ParsedSale[] };

const context: Record<string, unknown> = {};
vm.runInNewContext(readFileSync(new URL("../extension/sale-parser.js", import.meta.url), "utf8"), context);
const parser = (context.CodexFfbSaleParser as Parser);

function fixture({ id, name, nflTeam = "HOU", position, amount, winner = "Draft Team" }: { id: number; name: string; nflTeam?: string; position: string; amount: number; winner?: string }) {
  return `<ul><li class="pick-message__container"><img src="https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png"><span class="playerinfo__playername">${name}</span> / <span>${nflTeam}</span> <span class="playerinfo__playerpos">${position}</span><div class="pick-info">$${amount}<span> - ${winner}</span></div></li></ul>`;
}

function parse(html: string) {
  const dom = new JSDOM(html);
  return parser.readSales(dom.window.document)[0];
}

describe("ESPN extension sale parser", () => {
  it("parses a one-dollar sale", () => {
    expect(parse(fixture({ id: 1, name: "Alec Pierce", position: "WR", amount: 1 }))).toMatchObject({ playerId: 1, amount: 1, position: "WR" });
  });

  it("parses a three-digit sale", () => {
    expect(parse(fixture({ id: 2, name: "Christian McCaffrey", position: "RB", amount: 123 }))).toMatchObject({ amount: 123, teamName: "Draft Team" });
  });

  it("normalizes D/ST to DST", () => {
    expect(parse(fixture({ id: 3, name: "Texans D/ST", position: "D/ST", amount: 2 }))).toMatchObject({ playerName: "Texans D/ST", position: "DST" });
  });

  it("preserves apostrophes in player names", () => {
    expect(parse(fixture({ id: 4, name: "De'Von Achane", position: "RB", amount: 62 }))).toMatchObject({ playerName: "De'Von Achane" });
  });

  it("preserves suffixed player names", () => {
    expect(parse(fixture({ id: 5, name: "Brian Robinson Jr.", position: "RB", amount: 8 }))).toMatchObject({ playerName: "Brian Robinson Jr." });
  });
});
