export type EspnSocketEvent =
  | { type: "nomination"; teamId: number }
  | { type: "bid"; teamId: number; playerId: number; amount: number }
  | { type: "sold"; teamId: number; playerId: number; amount: number };

type TextSocketFrame = { dataType: "text" | "binary"; data: string };

function positiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseEspnSocketEvents(frames: TextSocketFrame[]): EspnSocketEvent[] {
  return frames.flatMap((frame) => {
    if (frame.dataType !== "text") return [];
    return frame.data.split(/\r?\n/).flatMap((line): EspnSocketEvent[] => {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "NOMINATION" && parts.length >= 3) {
        const teamId = positiveInteger(parts[1]);
        return teamId === null ? [] : [{ type: "nomination", teamId }];
      }
      if (parts[0] === "BID" && parts.length >= 6) {
        const teamId = positiveInteger(parts[1]);
        const playerId = positiveInteger(parts[2]);
        const amount = positiveInteger(parts[3]);
        return teamId === null || playerId === null || amount === null ? [] : [{ type: "bid", teamId, playerId, amount }];
      }
      if (parts[0] === "SOLD" && parts.length >= 6) {
        const teamId = positiveInteger(parts[1]);
        const playerId = positiveInteger(parts[2]);
        const amount = positiveInteger(parts[4]);
        return teamId === null || playerId === null || amount === null ? [] : [{ type: "sold", teamId, playerId, amount }];
      }
      return [];
    });
  });
}
