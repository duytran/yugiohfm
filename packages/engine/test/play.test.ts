import { describe, expect, it } from "vitest";
import { playError, playMaterials, previewPlay, resolvePlay } from "../src/play";
import type { GameEvent, PlayAction } from "../src/types";
import { creature, field, makeState } from "./helpers";

const HAND = ["ember-fox", "ash-duelist", "cinder-whelp", "furnace-drone", "pearl-clam"];

function play(handIndexes: number[], slot = 0, position: PlayAction["position"] = "attack"): PlayAction {
  return { type: "PLAY", handIndexes, slot, position };
}

describe("playError", () => {
  const state = makeState({ p0: { hand: HAND } });

  it("accepts a legal play", () => {
    expect(playError(state, 0, play([0]))).toBeNull();
  });

  it("rejects the player who is not on turn", () => {
    expect(playError(state, 1, play([0]))).toBe("not your turn");
  });

  it("rejects a second play in the same turn", () => {
    expect(playError(makeState({ hasPlayed: true, p0: { hand: HAND } }), 0, play([0]))).toBe(
      "already played a card this turn",
    );
  });

  it("makes a play onto a creature that already attacked keep its position", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const after = makeState({ p0: { hand: HAND, field: field({ 1: attacked }) } });
    expect(playError(after, 0, play([1], 1, "defense"))).toBe("a creature that already attacked keeps its position");
    expect(playError(after, 0, play([1], 1, "attack"))).toBeNull();
  });

  it("lets a play onto a creature that has not attacked choose any position", () => {
    const fresh = makeState({ p0: { hand: HAND, field: field({ 1: creature("moss-boar") }) } });
    expect(playError(fresh, 0, play([1], 1, "defense"))).toBeNull();
    expect(playError(fresh, 0, play([1], 1, "attack"))).toBeNull();
  });

  it("rejects a finished match", () => {
    const over = makeState({ result: { winner: 1, reason: "surrender" }, p0: { hand: HAND } });
    expect(playError(over, 0, play([0]))).toBe("match is over");
  });

  it.each([
    [play([0], -1), "invalid slot"],
    [play([0], 5), "invalid slot"],
    [play([0], 1.5), "invalid slot"],
    [play([]), "play at least one card"],
    [play([0, 0]), "duplicate hand index"],
    [play([5]), "invalid hand index"],
    [play([-1]), "invalid hand index"],
    [{ ...play([0]), position: "sideways" } as unknown as PlayAction, "invalid position"],
  ])("rejects a malformed play %#", (action, error) => {
    expect(playError(state, 0, action)).toBe(error);
  });
});

describe("playMaterials", () => {
  it("uses the hand cards in the chosen order for an empty slot", () => {
    expect(playMaterials(field(), HAND, play([2, 0]))).toEqual(["cinder-whelp", "ember-fox"]);
  });

  it("puts the creature already in the slot first", () => {
    expect(playMaterials(field({ 3: creature("moss-boar") }), HAND, play([1], 3))).toEqual([
      "moss-boar",
      "ash-duelist",
    ]);
  });
});

describe("previewPlay", () => {
  const state = makeState({ p0: { hand: HAND } });

  it("returns the single card when one card is played", () => {
    expect(previewPlay(state, 0, play([0]))).toMatchObject({ id: "ember-fox" });
  });

  it("returns the fusion result", () => {
    expect(previewPlay(state, 0, play([0, 1]))).toMatchObject({ id: "beast-rider", atk: 1900 });
  });

  it("returns an error for an illegal play and never changes the state", () => {
    const before = structuredClone(state);
    expect(previewPlay(state, 0, play([9]))).toEqual({ error: "invalid hand index" });
    previewPlay(state, 0, play([0, 1]));
    expect(state).toEqual(before);
  });
});

describe("resolvePlay", () => {
  it("moves one card from hand to the slot", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([1], 2, "defense"), events);
    expect(state.players[0].hand).toEqual(["ember-fox", "cinder-whelp", "furnace-drone", "pearl-clam"]);
    expect(state.players[0].field[2]).toEqual(creature("ash-duelist", "defense"));
    expect(state.hasPlayed).toBe(true);
    expect(events).toEqual([{ type: "played", player: 0, slot: 2, cardId: "ash-duelist", position: "defense" }]);
  });

  it("fuses several hand cards and removes all of them from the hand", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([0, 1, 2]), events);
    expect(state.players[0].hand).toEqual(["furnace-drone", "pearl-clam"]);
    expect(state.players[0].field[0]).toEqual(creature("dragon-knight"));
    expect(events).toEqual([
      { type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" },
      { type: "fused", player: 0, a: "beast-rider", b: "cinder-whelp", result: "dragon-knight" },
      { type: "played", player: 0, slot: 0, cardId: "dragon-knight", position: "attack" },
    ]);
  });

  it("respects the chosen order, not the hand order", () => {
    const state = makeState({ p0: { hand: HAND } });
    // clam then drone: no rule, so the later card (drone) stands
    resolvePlay(state, 0, play([4, 3]), []);
    expect(state.players[0].field[0]?.cardId).toBe("furnace-drone");
    expect(state.players[0].hand).toEqual(["ember-fox", "ash-duelist", "cinder-whelp"]);
  });

  it("reports a failed fusion", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([3, 4]), events);
    expect(events[0]).toEqual({ type: "fusion-failed", player: 0, a: "furnace-drone", b: "pearl-clam" });
    expect(state.players[0].field[0]?.cardId).toBe("pearl-clam");
  });

  it("fuses onto a creature already in the slot", () => {
    const state = makeState({ p0: { hand: HAND, field: field({ 1: creature("moss-boar", "defense") }) } });
    resolvePlay(state, 0, play([1], 1, "attack"), []);
    expect(state.players[0].field[1]).toEqual(creature("beast-rider", "attack"));
  });

  it("replaces the creature in the slot when the fusion fails", () => {
    const state = makeState({ p0: { hand: HAND, field: field({ 1: creature("pearl-clam") }) } });
    resolvePlay(state, 0, play([3], 1), []);
    expect(state.players[0].field[1]?.cardId).toBe("furnace-drone");
  });

  it("keeps hasAttacked when fusing onto a creature that already attacked", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const state = makeState({ p0: { hand: HAND, field: field({ 1: attacked }) } });
    resolvePlay(state, 0, play([1], 1), []);
    expect(state.players[0].field[1]?.hasAttacked).toBe(true);
  });
});
