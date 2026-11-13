import type { GameEvent, PlayerId } from "./types";

/** The play a fusion step belongs to: the next `played` event, past other steps of the same play. */
function playOf(events: readonly GameEvent[], index: number): GameEvent | null {
  for (let i = index + 1; i < events.length; i++) {
    const event = events[i]!;
    if (event.type === "played") return event;
    if (event.type !== "fused" && event.type !== "fusion-failed") return null;
  }
  return null;
}

/**
 * The events `viewer` may see (DDR-0003). The opponent of a face-down play
 * learns the slot, the position and how many hand cards were used, but not
 * the card, and none of its fusion steps. Everything else goes to both players.
 * The full list stays with the server and the simulator.
 */
export function eventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  const seen: GameEvent[] = [];
  events.forEach((event, i) => {
    const theirs = "player" in event && event.player !== viewer;
    if (theirs && (event.type === "fused" || event.type === "fusion-failed")) {
      const play = playOf(events, i);
      if (play?.type === "played" && play.faceDown) return;
    }
    if (theirs && event.type === "played" && event.faceDown) {
      seen.push({ ...event, cardId: null });
      return;
    }
    seen.push(event);
  });
  return seen;
}
