import { describe, expect, it } from "vitest";
import { applyAction, applyTimeout } from "../src/actions";
import type { Action, MatchState } from "../src/types";
import { creature, field, hidden, makeState } from "./helpers";

const HAND = ["ember-fox", "ash-duelist", "cinder-whelp", "furnace-drone", "pearl-clam"];

function ok(state: MatchState, player: 0 | 1, action: Action) {
  const result = applyAction(state, player, action);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe("applyAction", () => {
  it("never changes the state it was given", () => {
    const state = makeState({ p0: { hand: HAND } });
    const before = structuredClone(state);
    ok(state, 0, { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
    ok(state, 0, { type: "END_TURN" });
    applyAction(state, 0, { type: "ATTACK", attackerSlot: 0, target: 0 });
    expect(state).toEqual(before);
  });

  it("returns an error and no state for an illegal action", () => {
    const state = makeState({ p0: { hand: HAND } });
    expect(applyAction(state, 1, { type: "END_TURN" })).toEqual({ ok: false, error: "not your turn" });
  });

  it("rejects an unknown action type", () => {
    const state = makeState();
    expect(applyAction(state, 0, { type: "DANCE" } as unknown as Action)).toEqual({
      ok: false,
      error: "unknown action",
    });
  });

  it("applies PLAY, twice in a turn and no more", () => {
    const state = makeState({ p0: { hand: HAND } });
    const first = ok(state, 0, { type: "PLAY", handIndexes: [0], slot: 4, position: "attack" });
    expect(first.state.players[0].field[4]?.cardId).toBe("ember-fox");
    expect(first.state.playsUsed).toBe(1);
    const second = ok(first.state, 0, { type: "PLAY", handIndexes: [0], slot: 3, position: "attack" });
    expect(second.state.players[0].field[3]?.cardId).toBe("ash-duelist");
    expect(second.state.playsUsed).toBe(2);
    expect(applyAction(second.state, 0, { type: "PLAY", handIndexes: [0], slot: 2, position: "attack" })).toEqual({
      ok: false,
      error: "no plays left this turn",
    });
  });

  it("applies ATTACK", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    const result = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" });
    expect(result.state.players[1].lifePoints).toBe(2500);
  });
});

describe("SET_POSITION", () => {
  const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
  const toDefense: Action = { type: "SET_POSITION", slot: 0, position: "defense" };

  it("changes the position and reports it", () => {
    const result = ok(state, 0, toDefense);
    expect(result.state.players[0].field[0]).toMatchObject({ position: "defense" });
    expect(result.events).toEqual([{ type: "position-set", player: 0, slot: 0, position: "defense" }]);
  });

  it("allows any number of changes before the creature attacks", () => {
    const toAttack: Action = { type: "SET_POSITION", slot: 0, position: "attack" };
    let next = ok(state, 0, toDefense).state;
    next = ok(next, 0, toAttack).state;
    next = ok(next, 0, toDefense).state;
    expect(next.players[0].field[0]?.position).toBe("defense");
  });

  it("rejects a change after the creature attacked", () => {
    const attacked = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).state;
    expect(applyAction(attacked, 0, toDefense)).toEqual({ ok: false, error: "creature already attacked this turn" });
  });

  it("rejects the same position, an empty slot, and an invalid slot", () => {
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 0, position: "attack" })).toEqual({
      ok: false,
      error: "creature is already in that position",
    });
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 1, position: "defense" })).toEqual({
      ok: false,
      error: "no creature in that slot",
    });
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 8, position: "defense" })).toEqual({
      ok: false,
      error: "invalid slot",
    });
  });

  it("stops a creature moved to defense from attacking", () => {
    const defending = ok(state, 0, toDefense).state;
    expect(applyAction(defending, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toEqual({
      ok: false,
      error: "creature is in defense position",
    });
  });
});

describe("END_TURN", () => {
  it("passes the turn, counts it, and draws for the next player", () => {
    const state = makeState({ playsUsed: 2, p1: { hand: ["seedling"] } });
    const result = ok(state, 0, { type: "END_TURN" });
    expect(result.state.active).toBe(1);
    expect(result.state.turn).toBe(3);
    expect(result.state.playsUsed).toBe(0);
    expect(result.state.players[1].hand).toHaveLength(5);
    expect(result.events).toEqual([
      { type: "turn-ended", player: 0 },
      { type: "drew", player: 1, count: 4 },
    ]);
  });

  it("lets a creature attack again on its owner's next turn", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    let next = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).state;
    next = ok(next, 0, { type: "END_TURN" }).state;
    next = ok(next, 1, { type: "END_TURN" }).state;
    expect(applyAction(next, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).ok).toBe(true);
  });

  it("ends the match by deck-out when the next player cannot draw", () => {
    const state = makeState({ p1: { hand: [], deck: ["seedling"] } });
    const result = ok(state, 0, { type: "END_TURN" });
    expect(result.state.result).toEqual({ winner: 0, reason: "deck-out" });
    expect(result.events.at(-1)).toEqual({ type: "match-ended", winner: 0, reason: "deck-out" });
  });
});

describe("SURRENDER", () => {
  it("is legal for the active player", () => {
    const result = ok(makeState(), 0, { type: "SURRENDER" });
    expect(result.state.result).toEqual({ winner: 1, reason: "surrender" });
    expect(result.events).toEqual([{ type: "match-ended", winner: 1, reason: "surrender" }]);
  });

  it("is legal for the player who is not on turn", () => {
    expect(ok(makeState(), 1, { type: "SURRENDER" }).state.result).toEqual({ winner: 0, reason: "surrender" });
  });
});

describe("a finished match", () => {
  const over = makeState({ result: { winner: 0, reason: "life-points" }, p0: { hand: HAND } });

  it.each<Action>([
    { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
    { type: "SET_POSITION", slot: 0, position: "defense" },
    { type: "ATTACK", attackerSlot: 0, target: "direct" },
    { type: "END_TURN" },
    { type: "SURRENDER" },
  ])("rejects $type", (action) => {
    expect(applyAction(over, 0, action)).toEqual({ ok: false, error: "match is over" });
  });
});

describe("applyTimeout", () => {
  it("makes the opponent of the flagged player win", () => {
    const state = makeState();
    const result = applyTimeout(state, 0);
    expect(result.state.result).toEqual({ winner: 1, reason: "timeout" });
    expect(result.events).toEqual([{ type: "match-ended", winner: 1, reason: "timeout" }]);
    expect(state.result).toBeNull();
  });

  it("leaves a finished match unchanged", () => {
    const over = makeState({ result: { winner: 0, reason: "life-points" } });
    expect(applyTimeout(over, 0)).toEqual({ state: over, events: [] });
  });
});

describe("REVEAL", () => {
  const state = makeState({ p0: { field: field({ 0: hidden("thorn-sprite"), 1: creature("ember-fox") }) } });

  it("turns your own face-down creature face-up for free (F8)", () => {
    const result = ok(state, 0, { type: "REVEAL", slot: 0 });
    expect(result.state.players[0].field[0]?.faceDown).toBe(false);
    expect(result.state.playsUsed).toBe(0);
    expect(result.events).toEqual([{ type: "revealed", player: 0, slot: 0, cardId: "thorn-sprite" }]);
  });

  it("rejects an empty slot, a face-up creature, a bad slot and the wrong turn", () => {
    expect(applyAction(state, 0, { type: "REVEAL", slot: 3 })).toEqual({ ok: false, error: "no creature in that slot" });
    expect(applyAction(state, 0, { type: "REVEAL", slot: 1 })).toEqual({ ok: false, error: "creature is already face-up" });
    expect(applyAction(state, 0, { type: "REVEAL", slot: 7 })).toEqual({ ok: false, error: "invalid slot" });
    expect(applyAction(state, 1, { type: "REVEAL", slot: 0 })).toEqual({ ok: false, error: "not your turn" });
  });

  it("does not reveal on a position change (F10)", () => {
    const result = ok(state, 0, { type: "SET_POSITION", slot: 0, position: "attack" });
    expect(result.state.players[0].field[0]?.faceDown).toBe(true);
  });
});
