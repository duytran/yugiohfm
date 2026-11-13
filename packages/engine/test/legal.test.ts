import { describe, expect, it } from "vitest";
import { applyAction } from "../src/actions";
import { legalActions, orderedSelections } from "../src/legal";
import type { Action } from "../src/types";
import { creature, field, makeState } from "./helpers";

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

  it("lists every play: selections x 5 slots x 2 positions", () => {
    const one = legalActions(makeState({ p0: { hand: ["ember-fox"] } }), 0);
    expect(count(one, "PLAY")).toBe(10);
    const two = legalActions(makeState({ p0: { hand: ["ember-fox", "seedling"] } }), 0);
    expect(count(two, "PLAY")).toBe(40);
  });

  it("lists no play once a card was played this turn", () => {
    const actions = legalActions(makeState({ hasPlayed: true, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(actions, "PLAY")).toBe(0);
  });

  it("lists one position change per creature that may still change", () => {
    const state = makeState({
      p0: {
        field: field({
          0: creature("ember-fox"),
          1: { ...creature("moss-boar"), hasAttacked: true },
          2: { ...creature("seedling", "defense"), positionChanged: true },
          3: creature("pearl-clam", "defense"),
        }),
      },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "SET_POSITION")).toEqual([
      { type: "SET_POSITION", slot: 0, position: "defense" },
      { type: "SET_POSITION", slot: 3, position: "attack" },
    ]);
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
