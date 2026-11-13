import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, createRng, getCard, type Action, type PlayerView } from "@duel/engine";
import { greedyBot } from "../src/greedy";
import { runMatch } from "../src/runMatch";
import { wideBot, widePlay } from "../src/wide";

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
  faceDown: false,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});

describe("widePlay", () => {
  it("puts its strongest single card into an empty slot instead of fusing", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0, 1], slot: 1, position: "attack" }, // would fuse into Beast Rider
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" }, // onto its own creature
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 1, position: "defense" },
      { type: "PLAY", handIndexes: [1], slot: 1, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(widePlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 1, position: "attack" });
  });

  it("fuses like the greedy bot once its field is full", () => {
    const full = [on("moss-boar"), on("seedling"), on("seedling"), on("seedling"), on("seedling")];
    const v = view({ hand: ["ash-duelist"], mine: full });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" }, // seedling + warrior: no rule, 1500 - 600 = 900
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, // moss-boar + warrior -> Beast Rider, 1900 - 1300 = 600
      { type: "END_TURN" },
    ];
    expect(widePlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "attack" });
  });

  it("is null when no play is legal", () => {
    expect(widePlay(view({}), [{ type: "END_TURN" }])).toBeNull();
  });
});

describe("wideBot", () => {
  const rng = createRng(1);

  it("attacks when favourable once it cannot play, and otherwise ends the turn", () => {
    const winning = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(wideBot.chooseAction(winning, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });

    const losing = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    expect(wideBot.chooseAction(losing, legal, rng)).toEqual({ type: "END_TURN" });
  });

  it("finishes 10 matches against the greedy bot without an error", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(runMatch(wideBot, greedyBot, seed).status).toBe("finished");
    }
  });
});
