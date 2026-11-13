import { describe, expect, it } from "vitest";
import { createMatch, startTurn } from "../src/match";
import type { GameEvent } from "../src/types";
import { creature, field, makeState, sampleDeck } from "./helpers";

describe("createMatch", () => {
  it("sets up life points, empty fields, and the first player's opening hand", () => {
    const state = createMatch(sampleDeck(), sampleDeck(), 1);
    const first = state.players[state.firstPlayer];
    const second = state.players[state.firstPlayer === 0 ? 1 : 0];
    expect(state.active).toBe(state.firstPlayer);
    expect(state.turn).toBe(1);
    expect(state.playsUsed).toBe(0);
    expect(state.result).toBeNull();
    expect(first.hand).toHaveLength(5);
    expect(first.deck).toHaveLength(25);
    expect(second.hand).toHaveLength(0);
    expect(second.deck).toHaveLength(30);
    for (const p of state.players) {
      expect(p.lifePoints).toBe(4000);
      expect(p.field).toEqual([null, null, null, null, null]);
    }
  });

  it("stores the default rules, or the overrides it was given", () => {
    expect(createMatch(sampleDeck(), sampleDeck(), 1).rules).toEqual({ elementBonus: 500, playsPerTurn: 2 });
    expect(createMatch(sampleDeck(), sampleDeck(), 1, { elementBonus: 1000, playsPerTurn: 1 }).rules).toEqual({
      elementBonus: 1000,
      playsPerTurn: 1,
    });
  });

  it("throws for an invalid rule value", () => {
    expect(() => createMatch(sampleDeck(), sampleDeck(), 1, { elementBonus: -1 })).toThrow("invalid rule elementBonus: -1");
  });

  it("shuffles: the deck order differs from the input but holds the same cards", () => {
    const deck = sampleDeck();
    const state = createMatch(deck, deck, 1);
    const p = state.players[0];
    const all = [...p.hand, ...p.deck];
    expect(all).not.toEqual(deck);
    expect([...all].sort()).toEqual([...deck].sort());
  });

  it("is deterministic for a seed", () => {
    expect(createMatch(sampleDeck(), sampleDeck(), 5)).toEqual(createMatch(sampleDeck(), sampleDeck(), 5));
  });

  it("lets either player go first depending on the seed", () => {
    const firsts = new Set(
      Array.from({ length: 20 }, (_, seed) => createMatch(sampleDeck(), sampleDeck(), seed).firstPlayer),
    );
    expect(firsts).toEqual(new Set([0, 1]));
  });

  it("throws on an invalid deck", () => {
    expect(() => createMatch(sampleDeck().slice(1), sampleDeck(), 1)).toThrow(
      "invalid deck: deck must have exactly 30 cards, got 29",
    );
  });
});

describe("startTurn", () => {
  it("draws only up to 5 cards", () => {
    const state = makeState({ p0: { hand: ["seedling", "seedling", "seedling"] } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[0].deck).toHaveLength(28);
    expect(events).toEqual([{ type: "drew", player: 0, count: 2 }]);
  });

  it("draws from the top of the deck in order", () => {
    const state = makeState({ p0: { hand: [], deck: ["a", "b", "c", "d", "e", "f"] } });
    startTurn(state, []);
    expect(state.players[0].hand).toEqual(["a", "b", "c", "d", "e"]);
    expect(state.players[0].deck).toEqual(["f"]);
  });

  it("draws nothing and emits no event when the hand is full", () => {
    const hand = ["seedling", "seedling", "seedling", "ember-fox", "ember-fox"];
    const state = makeState({ p0: { hand } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.players[0].deck).toHaveLength(30);
    expect(events).toEqual([]);
  });

  it("ends the match by deck-out when the deck cannot fill the hand", () => {
    const state = makeState({ p0: { hand: ["seedling"], deck: ["a", "b", "c"] } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.result).toEqual({ winner: 1, reason: "deck-out" });
    expect(events).toEqual([{ type: "match-ended", winner: 1, reason: "deck-out" }]);
    expect(state.players[0].hand).toEqual(["seedling"]);
  });

  it("does not lose with an empty deck when the hand is already full", () => {
    const hand = ["seedling", "seedling", "seedling", "ember-fox", "ember-fox"];
    const state = makeState({ p0: { hand, deck: [] } });
    startTurn(state, []);
    expect(state.result).toBeNull();
  });

  it("clears the per-turn flags of the active player", () => {
    const used = { ...creature("ember-fox"), hasAttacked: true };
    const state = makeState({ playsUsed: 2, p0: { field: field({ 0: used }) } });
    startTurn(state, []);
    expect(state.playsUsed).toBe(0);
    expect(state.players[0].field[0]).toEqual(creature("ember-fox"));
  });
});
