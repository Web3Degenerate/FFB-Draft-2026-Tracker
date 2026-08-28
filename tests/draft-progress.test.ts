import { describe, expect, it } from "vitest";
import { liveAuctionPickNumber } from "@/lib/draft-progress";

describe("live auction pick number", () => {
  it("starts after every saved keeper and advances with completed sales", () => {
    expect(liveAuctionPickNumber({ keepers: Array(22).fill({}), sales: [] })).toBe(23);
    expect(liveAuctionPickNumber({ keepers: Array(22).fill({}), sales: Array(11).fill({}) })).toBe(34);
  });
});
