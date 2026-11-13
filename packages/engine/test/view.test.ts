import { describe, expect, it } from "vitest";
import { viewFor } from "../src/view";
import { creature, field, hidden, makeState } from "./helpers";

const state = makeState({
  active: 1,
  turn: 4,
  playsUsed: 1,
  p0: {
    hand: ["ember-fox", "ash-duelist"],
    deck: ["seedling", "moss-boar", "pearl-clam"],
    field: field({ 1: creature("cinder-whelp") }),
    lifePoints: 3200,
  },
  p1: {
    hand: ["mist-oracle", "storm-crow", "reef-guard"],
    deck: ["grove-sage", "harbor-gull"],
    field: field({ 0: creature("stone-ram", "defense") }),
    lifePoints: 1500,
  },
});

describe("viewFor", () => {
  it("shows a player their own hand and the public state", () => {
    expect(viewFor(state, 0)).toEqual({
      you: 0,
      active: 1,
      firstPlayer: 0,
      turn: 4,
      playsUsed: 1,
      result: null,
      rules: { elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1, bannerBonus: 300, packBonus: 200, rallyBonus: 500 },
      self: {
        hand: ["ember-fox", "ash-duelist"],
        deckCount: 3,
        field: [
          null,
          { hidden: false, cardId: "cinder-whelp", position: "attack", hasAttacked: false, wear: 0, faceDown: false, atk: 1400, def: 1000 },
          null,
          null,
          null,
        ],
        lifePoints: 3200,
      },
      opponent: {
        handCount: 3,
        deckCount: 2,
        field: [
          { hidden: false, cardId: "stone-ram", position: "defense", hasAttacked: false, wear: 0, faceDown: false, atk: 1400, def: 1500 },
          null,
          null,
          null,
          null,
        ],
        lifePoints: 1500,
      },
    });
  });

  it("shows a worn creature's lowered values and its wear", () => {
    const worn = makeState({ p1: { field: field({ 0: { ...creature("stone-ram"), wear: 400 } }) } });
    expect(viewFor(worn, 0).opponent.field[0]).toEqual({
      hidden: false,
      cardId: "stone-ram",
      position: "attack",
      hasAttacked: false,
      wear: 400,
      faceDown: false,
      atk: 1000,
      def: 1100,
    });
  });

  it("shows the opponent only the position of a face-down creature, and the owner everything", () => {
    const state = makeState({ p1: { field: field({ 2: hidden("thorn-sprite") }) } });
    expect(viewFor(state, 0).opponent.field[2]).toEqual({ hidden: true, position: "defense" });
    expect(viewFor(state, 1).self.field[2]).toEqual({
      hidden: false,
      cardId: "thorn-sprite",
      position: "defense",
      hasAttacked: false,
      wear: 0,
      faceDown: true,
      atk: 900,
      def: 1100,
    });
  });

  it("swaps sides for the other player", () => {
    const view = viewFor(state, 1);
    expect(view.you).toBe(1);
    expect(view.self.hand).toEqual(["mist-oracle", "storm-crow", "reef-guard"]);
    expect(view.opponent.handCount).toBe(2);
  });

  it("contains no card from the opponent's hand or from either deck", () => {
    const text = JSON.stringify(viewFor(state, 0));
    for (const hidden of ["mist-oracle", "storm-crow", "reef-guard", "grove-sage", "harbor-gull", "seedling", "moss-boar", "pearl-clam"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("shares no objects with the state", () => {
    const view = viewFor(state, 0);
    view.self.hand.push("seedling");
    view.self.field[1]!.position = "defense";
    view.opponent.field[0] = null;
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[0].field[1]?.position).toBe("attack");
    expect(state.players[1].field[0]).not.toBeNull();
  });

  it("includes the result once the match is over", () => {
    const over = makeState({ result: { winner: 1, reason: "timeout" } });
    expect(viewFor(over, 0).result).toEqual({ winner: 1, reason: "timeout" });
  });

  it("shows values with synergy", () => {
    const formed = makeState({ p0: { field: field({ 0: creature("burrow-drake"), 1: creature("iron-digger") }) } });
    expect(viewFor(formed, 1).opponent.field[0]).toMatchObject({ atk: 1800, def: 1700 });
  });
});
