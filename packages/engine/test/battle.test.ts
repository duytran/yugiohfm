import { describe, expect, it } from "vitest";
import { attackError, battleOutcome, battleValues, resolveAttack } from "../src/battle";
import { getCard } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import type { AttackAction, GameEvent, MatchState } from "../src/types";
import { effectiveStats } from "../src/values";
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
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack", { ...DEFAULT_RULES, elementBonus: 1000 })).toEqual({
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

  it("makes attacks go to a Guard creature in defense position first", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 1: creature("clay-sentinel", "defense") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("a Guard creature must be attacked first");
    expect(attackError(state, 0, attack(0, 1))).toBeNull();
  });

  it("lets the attacker pick between two Guards", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("pearl-clam", "defense"), 1: creature("clay-sentinel", "defense"), 2: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBeNull();
    expect(attackError(state, 0, attack(0, 1))).toBeNull();
    expect(attackError(state, 0, attack(0, 2))).toBe("a Guard creature must be attacked first");
  });

  it("forces nothing while the Guard is in attack position", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 1: creature("clay-sentinel", "attack") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBeNull();
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
      rules: { ...DEFAULT_RULES, elementBonus: 1000 },
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

  it("destroys nothing on equal values, but wears the target (R3)", () => {
    const state = duel("ash-duelist", "furnace-drone", "defense"); // 1500 vs DEF 1500
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]?.hasAttacked).toBe(true);
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(4000);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "worn", player: 1, slot: 0, amount: 1500 },
    ]);
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
  const strong = { atk: 2000, def: 1000, element: "flame" as const, traits: [] };
  const weak = { atk: 1500, def: 1800, element: "flame" as const, traits: [] };

  it("against attack position: the lower value is destroyed and its owner takes the difference", () => {
    expect(battleOutcome(strong, { combatant: weak, position: "attack" }, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 1500,
      attackerDestroyed: false,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 500,
      targetWear: 0,
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
      targetWear: 0,
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
      targetWear: 0,
    });
  });
});

describe("wear (R3)", () => {
  /** Player 1's Ancient Tyrant (flame 3000/2500) against three flame attackers: no element bonus anywhere. */
  function titan(wearRatio = 1): MatchState {
    return makeState({
      rules: { ...DEFAULT_RULES, wearRatio },
      p0: { field: field({ 0: creature("cinder-whelp"), 1: creature("pyre-adept"), 2: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ancient-tyrant") }) },
    });
  }

  it("wears a surviving target down by the attack value it withstood", () => {
    const state = titan();
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events); // 1400 against 3000
    expect(state.players[1].field[0]?.wear).toBe(1400);
    expect(effectiveStats(state, 1, 0)).toEqual({ atk: 1600, def: 1100 });
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 0, slot: 0, cardId: "cinder-whelp" },
      { type: "worn", player: 1, slot: 0, amount: 1400 },
      { type: "damage", player: 0, amount: 1600 },
    ]);
  });

  it("lets three small creatures bring down a big one (the spec's worked example)", () => {
    const state = titan();
    resolveAttack(state, 0, attack(0, 0), []); // 1400 vs 3000: you take 1600, Titan now 1600
    resolveAttack(state, 0, attack(1, 0), []); // 1300 vs 1600: you take 300, Titan now 300
    resolveAttack(state, 0, attack(2, 0), []); // 1500 vs 300: Titan destroyed, they take 1200
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(2100);
    expect(state.players[1].lifePoints).toBe(2800);
  });

  it("wears a target in defense position that holds", () => {
    const state = duel("ember-fox", "furnace-drone", "defense"); // 1200 vs DEF 1500
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(effectiveStats(state, 1, 0)).toEqual({ atk: 0, def: 300 });
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "worn", player: 1, slot: 0, amount: 1200 },
      { type: "damage", player: 0, amount: 300 },
    ]);
  });

  it("never wears the attacker", () => {
    const state = duel("ember-fox", "furnace-drone", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]?.wear).toBe(0);
  });

  it("uses the match's wear ratio", () => {
    const half = titan(0.5);
    resolveAttack(half, 0, attack(1, 0), []); // 1300 x 0.5
    expect(half.players[1].field[0]?.wear).toBe(650);
    const none = titan(0);
    const events: GameEvent[] = [];
    resolveAttack(none, 0, attack(1, 0), events);
    expect(none.players[1].field[0]?.wear).toBe(0);
    expect(events.some((e) => e.type === "worn")).toBe(false);
  });

  it("adds the element bonus after wear, so a creature worn to 0 still gets it", () => {
    // forest beats wind: Moss Boar worn to 0 still defends at 0 + 500
    const state = makeState({
      p0: { field: field({ 0: creature("gale-falcon") }) },
      p1: { field: field({ 0: { ...creature("moss-boar"), wear: 1300 } }) },
    });
    const outcome = resolveAttack(state, 0, attack(0, 0), []);
    expect(outcome).toMatchObject({ attack: 1500, defense: 500, targetDestroyed: true, damageToOpponent: 1000 });
  });

  it("returns the outcome it applied", () => {
    const outcome = resolveAttack(titan(), 0, attack(0, 0), []);
    expect(outcome).toEqual({
      attack: 1400,
      defense: 3000,
      attackerDestroyed: true,
      targetDestroyed: false,
      damageToSelf: 1600,
      damageToOpponent: 0,
      targetWear: 1400,
    });
  });
});

describe("Venom (R4)", () => {
  it("destroys an attacker that destroys a Venom target", () => {
    // flame beats forest: 1500 + 500 against Thorn Sprite's DEF 1100
    const state = duel("ash-duelist", "thorn-sprite", "defense");
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 1, slot: 0, cardId: "thorn-sprite" },
      { type: "destroyed", player: 0, slot: 0, cardId: "ash-duelist" },
    ]);
  });

  it("takes the target with it when a Venom attacker loses", () => {
    // thunder against flame, no bonus: 1000 against 1500
    const state = duel("spark-ferret", "ash-duelist");
    const outcome = resolveAttack(state, 0, attack(0, 0), []);
    expect(outcome).toMatchObject({ attackerDestroyed: true, targetDestroyed: true, damageToSelf: 500, targetWear: 0 });
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(3500);
  });

  it("does nothing when the Venom creature survives", () => {
    // water against forest, no bonus: 900 against DEF 1100
    const state = duel("harbor-gull", "thorn-sprite", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).not.toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
  });
});

describe("Pierce (R4)", () => {
  it("deals the difference when it destroys a defense-position creature", () => {
    // forest against earth, no bonus: 1400 against DEF 1300
    const state = duel("vine-archer", "root-shaman", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3900);
  });

  it("still deals its damage when the target has Venom", () => {
    // forest against forest: 1400 against DEF 1100
    const state = duel("vine-archer", "thorn-sprite", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3700);
  });
});

describe("synergy in battle (R5)", () => {
  it("destroying a Banner changes the next battle in the same turn", () => {
    // flame against earth, no bonus. Burrow Drake is 1500 + 300 next to the Iron Digger Banner.
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("iron-digger"), 1: creature("burrow-drake") }) },
    });
    expect(effectiveStats(state, 1, 1).atk).toBe(1800);
    resolveAttack(state, 0, attack(0, 0), []); // 1500 vs 1300: the Banner falls
    expect(effectiveStats(state, 1, 1).atk).toBe(1500);
    const outcome = resolveAttack(state, 0, attack(1, 1), []); // 1500 vs 1500 now
    expect(outcome).toMatchObject({ attackerDestroyed: true, targetDestroyed: true });
  });
});
