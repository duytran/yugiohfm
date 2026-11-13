import { describe, expect, it } from "vitest";
import { attackError, battleOutcome, battleValues, previewAttack, resolveAttack } from "../src/battle";
import { getCard } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import type { AttackAction, GameEvent, MatchState } from "../src/types";
import { viewFor } from "../src/view";
import { creature, field, makeState } from "./helpers";

function attack(attackerSlot: number, target: number | "direct"): AttackAction {
  return { type: "ATTACK", attackerSlot, target };
}

/** Player 0 has `mine` in slot 0, player 1 has `theirs` in slot 0. */
function duel(mine: string, theirs: string, theirPosition: "attack" | "defense" = "attack"): MatchState {
  return makeState({
    p0: { field: field({ 0: creature(mine) }) },
    p1: { field: field({ 0: creature(theirs, theirPosition) }) },
  });
}

describe("battleValues", () => {
  it("uses plain ATK against ATK with no element advantage", () => {
    // flame vs flame
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "attack", DEFAULT_RULES)).toEqual({ attack: 1500, defense: 1200 });
  });

  it("uses DEF for a target in defense position", () => {
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "defense", DEFAULT_RULES)).toEqual({ attack: 1500, defense: 800 });
  });

  it("gives the attacker +500 when its element beats the target's", () => {
    // flame beats forest
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack", DEFAULT_RULES)).toEqual({ attack: 1700, defense: 1300 });
  });

  it("gives the target +500 when its element beats the attacker's", () => {
    // water beats flame
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "attack", DEFAULT_RULES)).toEqual({ attack: 1200, defense: 1700 });
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "defense", DEFAULT_RULES)).toEqual({ attack: 1200, defense: 1900 });
  });
});

describe("battleValues with other rules", () => {
  it("uses the element bonus from the rules it is given", () => {
    // flame beats forest
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack", { elementBonus: 1000 })).toEqual({
      attack: 2200,
      defense: 1300,
    });
  });
});

describe("attackError", () => {
  it("accepts an attack on an enemy creature", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 0, attack(0, 0))).toBeNull();
  });

  it("rejects attacks on the first turn of the match", () => {
    const state = { ...duel("ash-duelist", "ember-fox"), turn: 1 };
    expect(attackError(state, 0, attack(0, 0))).toBe("the first player cannot attack on the first turn");
  });

  it("allows the second player to attack on turn 2", () => {
    const state = makeState({
      active: 1,
      turn: 2,
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("ash-duelist") }) },
    });
    expect(attackError(state, 1, attack(0, 0))).toBeNull();
  });

  it("rejects the player who is not on turn", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 1, attack(0, 0))).toBe("not your turn");
  });

  it("rejects an empty or invalid attacker slot", () => {
    const state = duel("ash-duelist", "ember-fox");
    expect(attackError(state, 0, attack(1, 0))).toBe("no creature in that slot");
    expect(attackError(state, 0, attack(7, 0))).toBe("invalid attacker slot");
  });

  it("rejects an attacker in defense position", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist", "defense") }) },
      p1: { field: field({ 0: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("creature is in defense position");
  });

  it("rejects a creature that already attacked", () => {
    const state = makeState({
      p0: { field: field({ 0: { ...creature("ash-duelist"), hasAttacked: true } }) },
      p1: { field: field({ 0: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("creature already attacked this turn");
  });

  it("rejects an empty or invalid target slot", () => {
    const state = duel("ash-duelist", "ember-fox");
    expect(attackError(state, 0, attack(0, 3))).toBe("no creature in the target slot");
    expect(attackError(state, 0, attack(0, 9))).toBe("invalid target slot");
  });

  it("allows a direct attack only when the opponent's field is empty", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 0, attack(0, "direct"))).toBe(
      "cannot attack directly while the opponent has creatures",
    );
    const open = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    expect(attackError(open, 0, attack(0, "direct"))).toBeNull();
  });
});

describe("resolveAttack against attack position", () => {
  it("destroys the weaker target and damages its owner by the difference", () => {
    const state = duel("ash-duelist", "ember-fox"); // 1500 vs 1200
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3700);
    expect(state.players[0].field[0]?.hasAttacked).toBe(true);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 1, slot: 0, cardId: "ember-fox" },
      { type: "damage", player: 1, amount: 300 },
    ]);
  });

  it("destroys the weaker attacker and damages the attacking player", () => {
    const state = duel("ember-fox", "ash-duelist"); // 1200 vs 1500
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(3700);
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("destroys both on equal values with no damage", () => {
    const state = duel("ash-duelist", "burrow-drake"); // flame 1500 vs earth 1500, no advantage
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(4000);
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("applies the element bonus before comparing", () => {
    const state = duel("ember-fox", "moss-boar"); // flame 1200+500 vs forest 1300
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3600);
  });
});

describe("resolveAttack with other rules", () => {
  it("uses the match's own element bonus", () => {
    // flame 1200 + 1000 vs forest 1300
    const state = makeState({
      rules: { elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].lifePoints).toBe(3100);
  });
});

describe("resolveAttack against defense position", () => {
  it("destroys the target with no damage when ATK is higher", () => {
    const state = duel("ash-duelist", "ember-fox", "defense"); // 1500 vs DEF 800
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("damages the attacking player and destroys nothing when ATK is lower", () => {
    const state = duel("ember-fox", "furnace-drone", "defense"); // 1200 vs DEF 1500
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).not.toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(3700);
  });

  it("does nothing on equal values", () => {
    const state = duel("ash-duelist", "furnace-drone", "defense"); // 1500 vs DEF 1500
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]?.hasAttacked).toBe(true);
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(4000);
    expect(events).toEqual([{ type: "attacked", player: 0, attackerSlot: 0, target: 0 }]);
  });
});

describe("resolveAttack direct", () => {
  it("deals the attacker's ATK to the opponent", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    resolveAttack(state, 0, attack(0, "direct"), []);
    expect(state.players[1].lifePoints).toBe(2500);
  });

  it("ends the match when life points reach zero, never going negative", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) }, p1: { lifePoints: 1000 } });
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, "direct"), events);
    expect(state.players[1].lifePoints).toBe(0);
    expect(state.result).toEqual({ winner: 0, reason: "life-points" });
    expect(events.at(-1)).toEqual({ type: "match-ended", winner: 0, reason: "life-points" });
  });

  it("lets the attacking player lose by their own failed attack", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox") }), lifePoints: 300 },
      p1: { field: field({ 0: creature("ash-duelist") }) },
    });
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.result).toEqual({ winner: 1, reason: "life-points" });
  });
});

describe("battleOutcome", () => {
  const strong = { atk: 2000, def: 1000, element: "flame" as const };
  const weak = { atk: 1500, def: 1800, element: "flame" as const };

  it("against attack position: the lower value is destroyed and its owner takes the difference", () => {
    expect(battleOutcome(strong, { combatant: weak, position: "attack" }, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 1500,
      attackerDestroyed: false,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 500,
    });
    expect(battleOutcome(weak, { combatant: strong, position: "attack" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: true,
      targetDestroyed: false,
      damageToSelf: 500,
      damageToOpponent: 0,
    });
  });

  it("against attack position: equal values destroy both with no damage", () => {
    expect(battleOutcome(strong, { combatant: strong, position: "attack" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: true,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 0,
    });
  });

  it("against defense position: no damage to the defender, and the attacker is never destroyed", () => {
    expect(battleOutcome(strong, { combatant: weak, position: "defense" }, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 1800,
      attackerDestroyed: false,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 0,
    });
    expect(battleOutcome(weak, { combatant: weak, position: "defense" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 300,
      damageToOpponent: 0,
    });
  });

  it("direct: the attacker's value goes to the opponent", () => {
    expect(battleOutcome(strong, null, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 0,
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 0,
      damageToOpponent: 2000,
    });
  });
});

describe("previewAttack", () => {
  it("reads the creatures' values from the view, not from the cards", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(0, 0))).toMatchObject({ attack: 1200, defense: 1500, attackerDestroyed: true });
    view.self.field[0]!.atk = 1900;
    expect(previewAttack(view, attack(0, 0))).toMatchObject({ attack: 1900, defense: 1500, targetDestroyed: true });
    expect(previewAttack(view, attack(0, "direct"))).toMatchObject({ damageToOpponent: 1900 });
  });

  it("uses the view's rules for the element bonus", () => {
    const state = makeState({
      rules: { elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 2200, defense: 1300 });
  });

  it("returns an error when a creature is missing", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(3, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(9, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(0, 2))).toEqual({ error: "no creature in the target slot" });
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
    ];
    for (const [mine, theirs, position] of cases) {
      const state = duel(mine, theirs, position);
      const preview = previewAttack(viewFor(state, 0), attack(0, 0));
      if ("error" in preview) throw new Error(preview.error);
      resolveAttack(state, 0, attack(0, 0), []);
      expect(state.players[0].field[0] === null, `${mine} -> ${theirs}`).toBe(preview.attackerDestroyed);
      expect(state.players[1].field[0] === null, `${mine} -> ${theirs}`).toBe(preview.targetDestroyed);
      expect(4000 - state.players[0].lifePoints).toBe(preview.damageToSelf);
      expect(4000 - state.players[1].lifePoints).toBe(preview.damageToOpponent);
    }
  });
});
