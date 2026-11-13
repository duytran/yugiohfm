import { describe, expect, it } from "vitest";
import {
  CARDS,
  createMatch,
  DEFAULT_RULES,
  createRng,
  getCard,
  legalActions,
  validateDeck,
  viewFor,
  type Action,
  type MatchState,
  type PlayerView,
} from "@duel/engine";
import { greedyBot, isFavourable, playGain } from "../src/greedy";
import { randomBot } from "../src/random";

const EMPTY_FIELD = [null, null, null, null, null];

function view(overrides: { hand?: string[]; mine?: PlayerView["self"]["field"]; theirs?: PlayerView["opponent"]["field"] }): PlayerView {
  return {
    you: 0,
    active: 0,
    firstPlayer: 0,
    turn: 2,
    playsUsed: 0,
    result: null,
    rules: { ...DEFAULT_RULES },
    self: { hand: overrides.hand ?? [], deckCount: 20, field: overrides.mine ?? EMPTY_FIELD, lifePoints: 4000 },
    opponent: { handCount: 5, deckCount: 20, field: overrides.theirs ?? EMPTY_FIELD, lifePoints: 4000 },
  };
}

const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  hidden: false as const,
  cardId,
  position,
  hasAttacked: false,
  wear: 0,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});

describe("randomBot", () => {
  it("builds a valid deck, differently for different seeds", () => {
    const a = randomBot.buildDeck(CARDS, createRng(1));
    const b = randomBot.buildDeck(CARDS, createRng(2));
    expect(validateDeck(a)).toEqual({ ok: true });
    expect(validateDeck(b)).toEqual({ ok: true });
    expect(a).not.toEqual(b);
  });

  it("chooses one of the legal actions, reproducibly", () => {
    const deck = randomBot.buildDeck(CARDS, createRng(1));
    const state: MatchState = createMatch(deck, deck, 1);
    const legal = legalActions(state, state.active);
    const first = randomBot.chooseAction(viewFor(state, state.active), legal, createRng(5));
    const again = randomBot.chooseAction(viewFor(state, state.active), legal, createRng(5));
    expect(legal).toContainEqual(first);
    expect(again).toEqual(first);
  });
});

describe("greedyBot deck", () => {
  it("is valid and made of the 10 strongest base cards, 3 copies each", () => {
    const deck = greedyBot.buildDeck(CARDS, createRng(1));
    expect(validateDeck(deck)).toEqual({ ok: true });
    expect(new Set(deck).size).toBe(10);
    expect(deck).toContain("cloud-serpent");
    expect(deck).not.toContain("seedling");
  });
});

describe("playGain", () => {
  it("is the result's ATK for an empty slot", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist"] });
    expect(playGain(v, { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" })).toBe(1500);
    expect(playGain(v, { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" })).toBe(1900);
  });

  it("subtracts the ATK of the creature being replaced", () => {
    const v = view({ hand: ["ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    // moss-boar (1300) + ash-duelist -> beast-rider (1900)
    expect(playGain(v, { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" })).toBe(600);
  });
});

describe("isFavourable", () => {
  it("is true for a direct attack and a winning battle", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    expect(isFavourable(v, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toBe(true);
    expect(isFavourable(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(true);
  });

  it("is false for a losing or drawn battle, element bonus included", () => {
    // ember-fox (flame 1200) into mist-oracle (water 1200, +500 against flame)
    const losing = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("mist-oracle"), null, null, null, null] });
    expect(isFavourable(losing, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(false);
    // ash-duelist 1500 into furnace-drone DEF 1500
    const drawn = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("furnace-drone", "defense"), null, null, null, null] });
    expect(isFavourable(drawn, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(false);
  });
});

describe("greedyBot.chooseAction", () => {
  const rng = createRng(1);

  it("plays the fusion with the largest ATK gain, in attack position", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist", "seedling"] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
  });

  it("uses fewer cards when the gain is equal", () => {
    // seedling then ash-duelist: no rule, ash-duelist stands -> same 1500 as playing it alone
    const v = view({ hand: ["seedling", "ash-duelist"] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "attack" });
  });

  it("attacks when favourable once it cannot play", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });
  });

  it("ends the turn rather than make a losing attack", () => {
    const v = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "END_TURN" });
  });
});
