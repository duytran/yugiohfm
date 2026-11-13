import { describe, expect, it } from "vitest";
import { applyAction } from "../src/actions";
import { legalActions, orderedSelections } from "../src/legal";
import { DEFAULT_RULES } from "../src/rules";
import type { Action } from "../src/types";
import { creature, field, hidden, makeState } from "./helpers";

const count = (actions: Action[], type: Action["type"]) => actions.filter((a) => a.type === type).length;

describe("orderedSelections", () => {
  it("lists subsets in every order", () => {
    expect(orderedSelections(0)).toEqual([]);
    expect(orderedSelections(1)).toEqual([[0]]);
    expect(orderedSelections(2)).toEqual([[0], [0, 1], [1], [1, 0]]);
  });

  it("gives 325 selections for a hand of 5", () => {
    // 5 + 20 + 60 + 120 + 120
    expect(orderedSelections(5)).toHaveLength(325);
  });
});

describe("legalActions", () => {
  it("lists only attacks on a Guard in defense position while there is one", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 3: creature("clay-sentinel", "defense") }) },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: 3 },
    ]);
  });

  it("is empty for the player who is not on turn", () => {
    expect(legalActions(makeState(), 1)).toEqual([]);
  });

  it("is empty when the match is over", () => {
    expect(legalActions(makeState({ result: { winner: 0, reason: "surrender" } }), 0)).toEqual([]);
  });

  it("never lists SURRENDER and always lists END_TURN", () => {
    const actions = legalActions(makeState({ p0: { hand: ["ember-fox"] } }), 0);
    expect(count(actions, "SURRENDER")).toBe(0);
    expect(count(actions, "END_TURN")).toBe(1);
  });

  it("lists every play: selections x 5 slots x 2 positions x 2 faces", () => {
    const one = legalActions(makeState({ p0: { hand: ["ember-fox"] } }), 0);
    expect(count(one, "PLAY")).toBe(20);
    const two = legalActions(makeState({ p0: { hand: ["ember-fox", "seedling"] } }), 0);
    expect(count(two, "PLAY")).toBe(80);
  });

  it("lists no play on turn 1 once firstTurnPlays are used", () => {
    const state = makeState({ turn: 1, playsUsed: 1, rules: { ...DEFAULT_RULES, firstTurnPlays: 1 }, p0: { hand: ["ember-fox"] } });
    expect(legalActions(state, 0).filter((a) => a.type === "PLAY")).toEqual([]);
  });

  it("lists plays until the turn's plays are used up", () => {
    const oneLeft = legalActions(makeState({ playsUsed: 1, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(oneLeft, "PLAY")).toBe(20);
    const noneLeft = legalActions(makeState({ playsUsed: 2, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(noneLeft, "PLAY")).toBe(0);
  });

  it("lists a position change for every creature that has not attacked", () => {
    const state = makeState({
      p0: {
        field: field({
          0: creature("ember-fox"),
          1: { ...creature("moss-boar"), hasAttacked: true },
          3: creature("pearl-clam", "defense"),
        }),
      },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "SET_POSITION")).toEqual([
      { type: "SET_POSITION", slot: 0, position: "defense" },
      { type: "SET_POSITION", slot: 3, position: "attack" },
    ]);
  });

  it("lists a play onto a creature that already attacked only in that creature's position", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const state = makeState({ p0: { hand: ["ember-fox"], field: field({ 0: attacked }) } });
    const plays = legalActions(state, 0).filter((a) => a.type === "PLAY");
    // empty slots 1-4: 4 x 2 positions x 2 faces; slot 0: attack position, face-up only
    expect(plays).toHaveLength(17);
    expect(plays).not.toContainEqual({ type: "PLAY", handIndexes: [0], slot: 0, position: "defense" });
  });

  it("lists a face-down twin for every play, and none onto a face-up creature", () => {
    const state = makeState({ p0: { hand: ["ember-fox"], field: field({ 0: creature("moss-boar") }) } });
    const plays = legalActions(state, 0).filter((a) => a.type === "PLAY");
    expect(plays).toContainEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "defense", faceDown: true });
    expect(plays).not.toContainEqual({ type: "PLAY", handIndexes: [0], slot: 0, position: "attack", faceDown: true });
  });

  it("lists REVEAL for each own face-down creature", () => {
    const state = makeState({ p0: { field: field({ 1: hidden("thorn-sprite"), 2: creature("ember-fox") }) } });
    expect(legalActions(state, 0).filter((a) => a.type === "REVEAL")).toEqual([{ type: "REVEAL", slot: 1 }]);
  });

  it("lists an attack on each enemy creature for each ready attacker", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox"), 1: creature("pearl-clam", "defense") }) },
      p1: { field: field({ 2: creature("moss-boar"), 4: creature("seedling", "defense") }) },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: 2 },
      { type: "ATTACK", attackerSlot: 0, target: 4 },
    ]);
  });

  it("lists only direct attacks when the opponent's field is empty", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ember-fox"), 3: creature("moss-boar") }) } });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: "direct" },
      { type: "ATTACK", attackerSlot: 3, target: "direct" },
    ]);
  });

  it("lists no attack on the first turn of the match", () => {
    const state = makeState({ turn: 1, p0: { field: field({ 0: creature("ember-fox") }) } });
    expect(count(legalActions(state, 0), "ATTACK")).toBe(0);
  });

  it("lists only actions that applyAction accepts", () => {
    const state = makeState({
      p0: { hand: ["ember-fox", "ash-duelist", "seedling"], field: field({ 0: creature("moss-boar") }) },
      p1: { field: field({ 1: creature("stone-ram") }) },
    });
    const actions = legalActions(state, 0);
    expect(actions.length).toBeGreaterThan(100);
    for (const action of actions) expect(applyAction(state, 0, action).ok).toBe(true);
  });
});
