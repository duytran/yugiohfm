import { describe, expect, it } from "vitest";
import { attackError, battleValues, resolveAttack } from "../src/battle";
import { getCard } from "../src/cards";
import type { AttackAction, GameEvent, MatchState } from "../src/types";
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
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "attack")).toEqual({ attack: 1500, defense: 1200 });
  });

  it("uses DEF for a target in defense position", () => {
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "defense")).toEqual({ attack: 1500, defense: 800 });
  });

  it("gives the attacker +500 when its element beats the target's", () => {
    // flame beats forest
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack")).toEqual({ attack: 1700, defense: 1300 });
  });

  it("gives the target +500 when its element beats the attacker's", () => {
    // water beats flame
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "attack")).toEqual({ attack: 1200, defense: 1700 });
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "defense")).toEqual({ attack: 1200, defense: 1900 });
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
