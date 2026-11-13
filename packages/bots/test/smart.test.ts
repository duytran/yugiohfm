import { describe, expect, it } from "vitest";
import { createRng, getCard, type Action, type PlayerView } from "@duel/engine";
import { greedyBot } from "../src/greedy";
import { runMatch } from "../src/runMatch";
import { attackScore, smartBot, smartPlay, threat } from "../src/smart";

const EMPTY_FIELD = [null, null, null, null, null];

function view(overrides: {
  hand?: string[];
  mine?: PlayerView["self"]["field"];
  theirs?: PlayerView["opponent"]["field"];
  myLife?: number;
  theirLife?: number;
}): PlayerView {
  return {
    you: 0,
    active: 0,
    firstPlayer: 0,
    turn: 2,
    hasPlayed: false,
    result: null,
    rules: { elementBonus: 500 },
    self: { hand: overrides.hand ?? [], deckCount: 20, field: overrides.mine ?? EMPTY_FIELD, lifePoints: overrides.myLife ?? 4000 },
    opponent: { handCount: 5, deckCount: 20, field: overrides.theirs ?? EMPTY_FIELD, lifePoints: overrides.theirLife ?? 4000 },
  };
}

const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  hidden: false as const,
  cardId,
  position,
  hasAttacked: false,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});

const END: Action = { type: "END_TURN" };
const rng = createRng(1);

describe("threat", () => {
  it("is the opponent's highest ATK, or 0 with no creatures", () => {
    expect(threat(view({}))).toBe(0);
    expect(threat(view({ theirs: [on("ember-fox"), on("ash-duelist", "defense"), null, null, null] }))).toBe(1500);
  });
});

describe("smartPlay", () => {
  it("makes the play whose attack is worth most, element bonus included", () => {
    // into moss-boar (forest 1300): ash-duelist (flame) hits for 1500 + 500, more than Beast Rider's 1900
    const v = view({ hand: ["ember-fox", "ash-duelist"], theirs: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "defense" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "attack" });
  });

  it("fuses when only a fusion beats the threat", () => {
    // threat: thunder-roc 1700. ember-fox + ash-duelist -> Beast Rider (earth 1900, and earth beats thunder).
    const v = view({ hand: ["ember-fox", "ash-duelist"], theirs: [on("thunder-roc"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
  });

  it("stays in attack position with a creature the threat cannot destroy", () => {
    // threat: ash-duelist 1500. burrow-drake is 1500 / 1400: it ties in attack, but would fall in defense.
    const v = view({ hand: ["burrow-drake"], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0], slot: 0, position: "attack" });
  });

  it("defends with its highest DEF when nothing holds against the threat", () => {
    // threat: ancient-tyrant 3000. furnace-drone has DEF 1500; ember-fox then furnace-drone fails to fuse.
    const v = view({ hand: ["ember-fox", "furnace-drone"], theirs: [on("ancient-tyrant"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "defense" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "defense" });
  });

  it("uses an empty slot rather than fusing onto its own creature", () => {
    const v = view({ hand: ["ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, // would fuse into Beast Rider
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "attack" });
  });

  it("with a full field, never replaces a creature with something weaker", () => {
    const full = [on("ash-duelist"), on("ash-duelist"), on("ash-duelist"), on("ash-duelist"), on("ash-duelist")];
    // seedling onto ash-duelist: no rule, so seedling (600) would stand where 1500 was
    const v = view({ hand: ["seedling"], mine: full });
    expect(smartPlay(v, [{ type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, END])).toBeNull();
  });

  it("is null when no play is legal", () => {
    expect(smartPlay(view({}), [END])).toBeNull();
  });
});

describe("attackScore", () => {
  const mine = [on("ash-duelist"), null, null, null, null];

  it("adds the damage dealt and the ATK of a destroyed target", () => {
    // 1500 vs ember-fox 1200: 300 damage + 1200
    const v = view({ mine, theirs: [on("ember-fox"), on("seedling"), null, null, null] });
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(1500);
    // flame beats forest: 2000 vs seedling 600: 1400 damage + 600
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 1 })).toBe(2000);
  });

  it("subtracts its own losses", () => {
    // 1500 into cloud-serpent 1700: 200 damage to itself and the attacker (1500) is lost
    const v = view({ mine, theirs: [on("cloud-serpent"), null, null, null, null] });
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(-1700);
  });

  it("is infinite for a winning blow and minus infinite for a losing one", () => {
    const win = view({ mine, theirLife: 1500 });
    expect(attackScore(win, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toBe(Infinity);
    const lose = view({ mine, theirs: [on("cloud-serpent"), null, null, null, null], myLife: 200 });
    expect(attackScore(lose, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(-Infinity);
  });
});

describe("smartBot.chooseAction", () => {
  it("makes the best-scoring attack", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), on("seedling"), null, null, null] });
    const legal: Action[] = [
      { type: "ATTACK", attackerSlot: 0, target: 0 },
      { type: "ATTACK", attackerSlot: 0, target: 1 },
      END,
    ];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 1 });
  });

  it("turns a strong defender to attack before attacking", () => {
    const v = view({ mine: [on("ash-duelist", "defense"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "SET_POSITION", slot: 0, position: "attack" }, END];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "SET_POSITION", slot: 0, position: "attack" });
  });

  it("turns a weak attacker to defense instead of making a losing attack", () => {
    const v = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [
      { type: "ATTACK", attackerSlot: 0, target: 0 },
      { type: "SET_POSITION", slot: 0, position: "defense" },
      END,
    ];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "SET_POSITION", slot: 0, position: "defense" });
  });

  it("ends the turn when nothing is worth doing", () => {
    const v = view({ mine: [on("ember-fox", "defense"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [{ type: "SET_POSITION", slot: 0, position: "attack" }, END];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual(END);
  });

  it("finishes 10 matches against the greedy bot without an error", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(runMatch(smartBot, greedyBot, seed).status).toBe("finished");
    }
  });
});
