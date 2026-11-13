import { DECK_SIZE, MAX_COPIES, type CardId } from "@duel/engine";
import type { Bot } from "./types";

/** Random valid deck, uniformly random legal action. The baseline every bot should beat. */
export const randomBot: Bot = {
  name: "random",

  buildDeck(cards, rng) {
    const pool = cards.filter((c) => !c.fusionOnly);
    const copies = new Map<CardId, number>();
    const deck: CardId[] = [];
    while (deck.length < DECK_SIZE) {
      const id = pool[rng.int(pool.length)]!.id;
      const count = copies.get(id) ?? 0;
      if (count >= MAX_COPIES) continue;
      copies.set(id, count + 1);
      deck.push(id);
    }
    return deck;
  },

  chooseAction(_view, legal, rng) {
    return legal[rng.int(legal.length)]!;
  },
};
