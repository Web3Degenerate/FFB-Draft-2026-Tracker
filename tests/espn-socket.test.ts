import { describe, expect, it } from "vitest";
import { parseEspnSocketEvents } from "@/lib/espn-socket";

describe("ESPN live socket parser", () => {
  it("reads nomination, full bid, and sold messages in arrival order", () => {
    expect(parseEspnSocketEvents([{ dataType: "text", data: [
      "NOMINATION 4 25000",
      "BID 17 4258173 40 25000 10241",
      "SOLD 17 4258173 7 40 0",
    ].join("\n") }])).toEqual([
      { type: "nomination", teamId: 4 },
      { type: "bid", teamId: 17, playerId: 4258173, amount: 40 },
      { type: "sold", teamId: 17, playerId: 4258173, amount: 40 },
    ]);
  });

  it("ignores acknowledgements, clocks, malformed values, and binary frames", () => {
    expect(parseEspnSocketEvents([
      { dataType: "text", data: "BID 4258173 40\nCLOCK 2 10491 4 4258173 39\nSOLD nope 1 2 3 0" },
      { dataType: "binary", data: "BID 17 4258173 40 25000 10241" },
    ])).toEqual([]);
  });
});
