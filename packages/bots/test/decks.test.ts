import { describe, expect, it } from "vitest";
import { CARDS, createRng, getCard, validateDeck } from "@duel/engine";
import { DECKS, elementDeck, randomDeck, strongestDeck, traitDeck, withDeck } from "../src/decks";
import { greedyBot } from "../src/greedy";

describe("deck builders", () => {
  it("every named deck is valid", () => {
    expect(Object.keys(DECKS)).toEqual(["strongest", "random", "answers", "flame", "forest", "wind", "earth", "thunder", "water"]);
    for (const [name, build] of Object.entries(DECKS)) {
      expect(validateDeck(build(CARDS, createRng(1))), name).toEqual({ ok: true });
    }
  });

  it("strongest is the 10 highest-ATK base cards, 3 copies each", () => {
    const deck = strongestDeck(CARDS, createRng(1));
    expect(new Set(deck).size).toBe(10);
    expect(deck).toContain("cloud-serpent");
    expect(deck).not.toContain("seedling");
  });

  it("random differs by seed", () => {
    expect(randomDeck(CARDS, createRng(1))).not.toEqual(randomDeck(CARDS, createRng(2)));
  });

  it("a trait deck holds 3 copies of every base card with one of the traits, then the strongest others", () => {
    const deck = traitDeck(["venom", "guard", "pierce"])(CARDS, createRng(1));
    const answers = deck.filter((id) => getCard(id).traits.length > 0);
    // 9 base cards with an answer trait x 3
    expect(answers).toHaveLength(27);
    expect(deck.filter((id) => id === "cloud-serpent")).toHaveLength(3);
  });

  it("an element deck holds 3 copies of every base card of that element, then the strongest others", () => {
    const deck = elementDeck("flame")(CARDS, createRng(1));
    const flame = deck.filter((id) => getCard(id).element === "flame");
    // 6 flame base cards x 3
    expect(flame).toHaveLength(18);
    expect(new Set(flame).size).toBe(6);
    const others = [...new Set(deck.filter((id) => getCard(id).element !== "flame"))];
    expect(others).toEqual(["cloud-serpent", "thunder-roc", "bramble-wyrm", "brine-serpent"]);
  });
});

describe("withDeck", () => {
  it("keeps the bot's play, changes its deck and its name", () => {
    const themed = withDeck(greedyBot, "flame", elementDeck("flame"));
    expect(themed.name).toBe("greedy/flame");
    expect(themed.chooseAction).toBe(greedyBot.chooseAction);
    expect(themed.buildDeck(CARDS, createRng(1))).toEqual(elementDeck("flame")(CARDS, createRng(1)));
  });
});
