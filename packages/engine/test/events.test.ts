import { describe, expect, it } from "vitest";
import { eventsFor } from "../src/events";
import type { GameEvent } from "../src/types";

const hiddenPlay: GameEvent[] = [
  { type: "drew", player: 0, count: 2 },
  { type: "fused", player: 0, a: "ember-fox", b: "moss-boar", result: "twin-fang-chimera" },
  { type: "fusion-failed", player: 0, a: "twin-fang-chimera", b: "seedling" },
  { type: "played", player: 0, slot: 1, cardId: "seedling", position: "defense", faceDown: true, handCards: 3 },
  { type: "position-set", player: 0, slot: 1, position: "attack" },
];

describe("eventsFor", () => {
  it("gives the owner of a face-down play everything", () => {
    expect(eventsFor(hiddenPlay, 0)).toEqual(hiddenPlay);
  });

  it("gives the opponent the play without its card or its fusion steps", () => {
    expect(eventsFor(hiddenPlay, 1)).toEqual([
      { type: "drew", player: 0, count: 2 },
      { type: "played", player: 0, slot: 1, cardId: null, position: "defense", faceDown: true, handCards: 3 },
      { type: "position-set", player: 0, slot: 1, position: "attack" },
    ]);
  });

  it("keeps a face-up play and its fusions for both players", () => {
    const faceUp: GameEvent[] = [
      { type: "fused", player: 0, a: "ember-fox", b: "moss-boar", result: "twin-fang-chimera" },
      { type: "played", player: 0, slot: 1, cardId: "twin-fang-chimera", position: "attack", faceDown: false, handCards: 2 },
    ];
    expect(eventsFor(faceUp, 1)).toEqual(faceUp);
  });

  it("keeps reveals, battles and the end of the match for both players", () => {
    const battle: GameEvent[] = [
      { type: "attacked", player: 1, attackerSlot: 0, target: 1 },
      { type: "revealed", player: 0, slot: 1, cardId: "seedling" },
      { type: "destroyed", player: 0, slot: 1, cardId: "seedling" },
      { type: "match-ended", winner: 1, reason: "life-points" },
    ];
    expect(eventsFor(battle, 0)).toEqual(battle);
    expect(eventsFor(battle, 1)).toEqual(battle);
  });

  it("never changes the list it is given", () => {
    const copy = structuredClone(hiddenPlay);
    eventsFor(hiddenPlay, 1);
    expect(hiddenPlay).toEqual(copy);
  });
});
