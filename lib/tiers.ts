import type { Player, Position } from "./types";

const TIER_CAP: Record<Position, number> = { QB: 6, RB: 11, WR: 12, TE: 5, K: 8, DST: 8 };
const TIER_FLOOR: Record<Position, number> = { QB: 3, RB: 4, WR: 4, TE: 3, K: 4, DST: 4 };

export function assignTiers(players: Omit<Player, "positionRank" | "tier">[]): Player[] {
  const output: Player[] = [];
  const positions: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
  for (const position of positions) {
    const group = players
      .filter((player) => player.position === position)
      .sort((a, b) => b.espnKeeperValue - a.espnKeeperValue || b.projectedPoints - a.projectedPoints || a.overallRank - b.overallRank);
    let tier = 1;
    let inTier = 0;
    group.forEach((player, index) => {
      const prior = group[index - 1];
      const valueCliff = prior && inTier >= TIER_FLOOR[position] && prior.espnKeeperValue - player.espnKeeperValue >= 4;
      if (inTier >= TIER_CAP[position] || valueCliff) {
        tier += 1;
        inTier = 0;
      }
      output.push({ ...player, positionRank: index + 1, tier: `${position}${tier}` });
      inTier += 1;
    });
  }
  return output.sort((a, b) => a.overallRank - b.overallRank || b.espnKeeperValue - a.espnKeeperValue);
}
