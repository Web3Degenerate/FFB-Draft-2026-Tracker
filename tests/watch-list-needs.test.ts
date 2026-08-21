import { describe, expect, it } from "vitest";
import { rosterSlotPosition, whoNeedsMarker } from "@/lib/watch-list-needs";
import type { Position } from "@/lib/types";

const counts = (overrides: Partial<Record<Position, number>> = {}): Record<Position, number> => ({
  QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, ...overrides,
});

describe("Watch List team needs", () => {
  it("marks zero and one RB or WR as needs", () => {
    expect(whoNeedsMarker(counts({ RB: 0 }), "RB")).toEqual({ count: 0, tone: "need" });
    expect(whoNeedsMarker(counts({ WR: 1 }), "WR")).toEqual({ count: 1, tone: "need" });
  });

  it("hides two RB or WR and marks three or more as surplus", () => {
    expect(whoNeedsMarker(counts({ RB: 2 }), "RB")).toBeNull();
    expect(whoNeedsMarker(counts({ WR: 3 }), "WR")).toEqual({ count: 3, tone: "surplus" });
  });

  it("only marks zero for single-starter positions", () => {
    (["QB", "TE", "K", "DST"] as Position[]).forEach((position) => {
      expect(whoNeedsMarker(counts(), position)).toEqual({ count: 0, tone: "need" });
      expect(whoNeedsMarker(counts({ [position]: 1 }), position)).toBeNull();
    });
  });

  it("maps only position-specific roster slots to colors", () => {
    expect(rosterSlotPosition("QB")).toBe("QB");
    expect(rosterSlotPosition("RB2")).toBe("RB");
    expect(rosterSlotPosition("WR1")).toBe("WR");
    expect(rosterSlotPosition("TE")).toBe("TE");
    expect(rosterSlotPosition("DST")).toBe("DST");
    expect(rosterSlotPosition("K")).toBe("K");
    expect(rosterSlotPosition("FLEX")).toBeNull();
    expect(rosterSlotPosition("BENCH1")).toBeNull();
  });
});
