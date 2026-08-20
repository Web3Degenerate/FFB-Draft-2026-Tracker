import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

type ParsedSale = { playerId?: number; playerName: string; position: string; teamName: string; amount: number };
type AuctionValue = { playerId?: number; playerName: string; amount: number };
type Parser = { readSales(root: Document): ParsedSale[]; readAuctionValues(root: Document): AuctionValue[]; readLeadingBid(root: Document): { teamName: string; amount: number } | null; readDraftTeams(root: Document): Array<{ slot: number; teamName: string }> };

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

  it("reads ESPN estimated prices from the Players table dollar column", () => {
    const dom = new JSDOM(`
      <table>
        <thead><tr><th>Player</th><th>Pos</th><th>$</th><th>Proj</th></tr></thead>
        <tbody><tr>
          <td><img src="https://a.espncdn.com/i/headshots/nfl/players/full/4241389.png"><span class="playerinfo__playername">CeeDee Lamb</span></td>
          <td>WR</td><td>$64</td><td>287.4</td>
        </tr></tbody>
      </table>
    `);
    expect(parser.readAuctionValues(dom.window.document)).toEqual([{ playerId: 4241389, playerName: "CeeDee Lamb", amount: 64 }]);
  });

  it("does not mistake a completed-picks bid column for player estimates", () => {
    const dom = new JSDOM(`
      <table><thead><tr><th>Player</th><th>Bid</th></tr></thead><tbody><tr>
        <td><span class="playerinfo__playername">CeeDee Lamb</span></td><td>$64</td>
      </tr></tbody></table>
    `);
    expect(parser.readAuctionValues(dom.window.document)).toEqual([]);
  });

  it("reads the visible leading bidder from ESPN's team strip", () => {
    const dom = new JSDOM(`
      <div data-testid="auction-pick" title="Team One"><div class="team-name">1. Team One</div><div class="bid-amount" style="opacity: 0">$null</div></div>
      <div data-testid="auction-pick" title="Team Two"><div class="team-name">2. Team Two</div><div class="bid-amount" style="opacity: 1">$4</div></div>
    `);
    expect(parser.readLeadingBid(dom.window.document)).toEqual({ teamName: "Team Two", amount: 4 });
    expect(parser.readDraftTeams(dom.window.document)).toEqual([{ slot: 1, teamName: "Team One" }, { slot: 2, teamName: "Team Two" }]);
  });
});
