import { describe, expect, it } from "vitest";
import { validateDeck } from "../src/deck";
import { sampleDeck } from "./helpers";

describe("validateDeck", () => {
  it("accepts 30 deck-legal cards with at most 3 copies each", () => {
    expect(validateDeck(sampleDeck())).toEqual({ ok: true });
  });

  it("rejects a deck that is too small", () => {
    expect(validateDeck(sampleDeck().slice(1))).toEqual({
      ok: false,
      error: "deck must have exactly 30 cards, got 29",
    });
  });

  it("rejects a deck that is too large", () => {
    expect(validateDeck([...sampleDeck(), "seedling"])).toEqual({
      ok: false,
      error: "deck must have exactly 30 cards, got 31",
    });
  });

  it("rejects an unknown card", () => {
    const deck = sampleDeck();
    deck[0] = "not-a-card";
    expect(validateDeck(deck)).toEqual({ ok: false, error: "unknown card: not-a-card" });
  });

  it("rejects a fusion-only card", () => {
    const deck = sampleDeck();
    deck[0] = "ancient-tyrant";
    expect(validateDeck(deck)).toEqual({
      ok: false,
      error: "fusion-only card not allowed in a deck: ancient-tyrant",
    });
  });

  it("rejects a fourth copy", () => {
    const deck = sampleDeck();
    deck[29] = deck[0]!;
    expect(validateDeck(deck)).toEqual({ ok: false, error: "more than 3 copies of ember-fox" });
  });
});
