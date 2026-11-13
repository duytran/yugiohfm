import { describe, expect, it } from "vitest";
import { resolveAttack } from "../src/battle";
import { previewAttack, previewAttacks, stateFromView, viewAfterPlay } from "../src/preview";
import { DEFAULT_RULES } from "../src/rules";
import type { AttackAction, MatchState } from "../src/types";
import { viewFor } from "../src/view";
import { creature, field, hidden, makeState } from "./helpers";

function attack(attackerSlot: number, target: number | "direct"): AttackAction {
  return { type: "ATTACK", attackerSlot, target };
}

function duel(mine: string, theirs: string, theirPosition: "attack" | "defense" = "attack"): MatchState {
  return makeState({
    p0: { field: field({ 0: creature(mine) }) },
    p1: { field: field({ 0: creature(theirs, theirPosition) }) },
  });
}

describe("stateFromView", () => {
  it("rebuilds the fields, life points and rules the view shows, for either seat", () => {
    const state = makeState({
      active: 1,
      p0: { field: field({ 1: { ...creature("stone-ram"), wear: 300 } }), lifePoints: 2500 },
      p1: { hand: ["ember-fox"], field: field({ 0: creature("moss-boar", "defense") }) },
    });
    const rebuilt = stateFromView(viewFor(state, 1));
    expect(rebuilt.players[0].field).toEqual(state.players[0].field);
    expect(rebuilt.players[1].field).toEqual(state.players[1].field);
    expect(rebuilt.players[1].hand).toEqual(["ember-fox"]);
    expect(rebuilt.players[0].hand).toEqual([]);
    expect(rebuilt.players[0].lifePoints).toBe(2500);
    expect(rebuilt.rules).toEqual(state.rules);
    expect(rebuilt.active).toBe(1);
  });
});

describe("previewAttack", () => {
  it("uses the view's rules for the element bonus", () => {
    const state = makeState({
      rules: { ...DEFAULT_RULES, elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 2200, defense: 1300 });
  });

  it("sees wear already on the board", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: { ...creature("ash-duelist"), wear: 500 } }) },
    });
    // 1200 against 1500 - 500
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 1200, defense: 1000, targetDestroyed: true });
  });

  it("returns an error when a creature is missing", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(3, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(9, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(0, 2))).toEqual({ error: "no creature in the target slot" });
  });

  it("never changes the view", () => {
    const view = viewFor(duel("ash-duelist", "ember-fox"), 0);
    const before = structuredClone(view);
    previewAttack(view, attack(0, 0));
    expect(view).toEqual(before);
  });

  it("agrees with what resolveAttack then does", () => {
    const cases: [string, string, "attack" | "defense"][] = [
      ["ash-duelist", "ember-fox", "attack"],
      ["ember-fox", "ash-duelist", "attack"],
      ["ash-duelist", "burrow-drake", "attack"],
      ["ember-fox", "moss-boar", "attack"],
      ["ash-duelist", "ember-fox", "defense"],
      ["ember-fox", "furnace-drone", "defense"],
      ["ash-duelist", "furnace-drone", "defense"],
      ["ash-duelist", "thorn-sprite", "defense"],
      ["spark-ferret", "ash-duelist", "attack"],
      ["vine-archer", "root-shaman", "defense"],
    ];
    for (const [mine, theirs, position] of cases) {
      const state = duel(mine, theirs, position);
      const preview = previewAttack(viewFor(state, 0), attack(0, 0));
      if ("error" in preview) throw new Error(preview.error);
      expect(resolveAttack(state, 0, attack(0, 0), []), `${mine} -> ${theirs}`).toEqual(preview);
    }
  });
});

describe("previewAttacks", () => {
  const titan = () =>
    makeState({
      p0: { field: field({ 0: creature("cinder-whelp"), 1: creature("pyre-adept"), 2: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ancient-tyrant") }) },
    });

  it("follows a Banner's loss from one attack to the next", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("iron-digger"), 1: creature("burrow-drake") }) },
    });
    const result = previewAttacks(viewFor(state, 0), [attack(0, 0), attack(1, 1)]);
    if ("error" in result) throw new Error(result.error);
    expect(result[1]).toMatchObject({ attack: 1500, defense: 1500 });
  });

  it("lets each attack see the wear, losses and damage of the ones before it", () => {
    const result = previewAttacks(viewFor(titan(), 0), [attack(0, 0), attack(1, 0), attack(2, 0)]);
    if ("error" in result) throw new Error(result.error);
    expect(result.map((o) => [o.attack, o.defense, o.targetDestroyed])).toEqual([
      [1400, 3000, false],
      [1300, 1600, false],
      [1500, 300, true],
    ]);
    expect(result[2]!.damageToOpponent).toBe(1200);
  });

  it("names the first attack that cannot be previewed", () => {
    // the first attack destroys the attacker in slot 0, so it cannot attack again
    expect(previewAttacks(viewFor(titan(), 0), [attack(0, 0), attack(0, 0)])).toEqual({
      error: "no creature in that slot",
      index: 1,
    });
  });

  it("stops after an attack that ends the match", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ember-fox") }) }, p1: { lifePoints: 1000 } });
    expect(previewAttacks(viewFor(state, 0), [attack(0, "direct"), attack(1, "direct")])).toEqual({
      error: "the match is over",
      index: 1,
    });
  });

  it("returns an empty list for no attacks", () => {
    expect(previewAttacks(viewFor(titan(), 0), [])).toEqual([]);
  });
});

describe("viewAfterPlay", () => {
  const state = makeState({
    p0: { hand: ["burrow-drake", "ember-fox"], field: field({ 1: creature("iron-digger") }) },
    p1: { hand: ["seedling", "seedling"], field: field({ 0: creature("ember-fox") }) },
  });

  it("shows the board after the play, with the values the engine works out", () => {
    const after = viewAfterPlay(viewFor(state, 0), { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" });
    if ("error" in after) throw new Error(after.error);
    expect(after.self.field[0]).toMatchObject({ cardId: "burrow-drake", atk: 1800, def: 1700 });
    expect(after.self.hand).toEqual(["ember-fox"]);
    expect(after.playsUsed).toBe(1);
  });

  it("keeps the counts the viewer cannot rebuild", () => {
    const before = viewFor(state, 0);
    const after = viewAfterPlay(before, { type: "PLAY", handIndexes: [1], slot: 3, position: "defense" });
    if ("error" in after) throw new Error(after.error);
    expect(after.opponent.handCount).toBe(before.opponent.handCount);
    expect(after.opponent.deckCount).toBe(before.opponent.deckCount);
    expect(after.self.deckCount).toBe(before.self.deckCount);
  });

  it("returns why an illegal play is illegal, and never changes the view", () => {
    const before = viewFor(state, 0);
    const copy = structuredClone(before);
    expect(viewAfterPlay(before, { type: "PLAY", handIndexes: [7], slot: 0, position: "attack" })).toEqual({
      error: "invalid hand index",
    });
    expect(before).toEqual(copy);
  });
});

describe("previews and hidden creatures", () => {
  const state = makeState({
    p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ember-fox") }) },
    p1: { field: field({ 0: creature("seedling"), 1: hidden("thorn-sprite") }) },
  });

  it("cannot preview an attack on a hidden creature", () => {
    expect(previewAttack(viewFor(state, 0), attack(0, 1))).toEqual({ error: "the target is face-down" });
  });

  it("previews the visible creatures exactly, with the hidden one still on the board", () => {
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toEqual(resolveAttack(structuredClone(state), 0, attack(0, 0), []));
  });
});
