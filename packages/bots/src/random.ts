import { randomDeck } from "./decks";
import type { Bot } from "./types";

/** Random valid deck, uniformly random legal action. The baseline every bot should beat. */
export const randomBot: Bot = {
  name: "random",
  buildDeck: randomDeck,
  chooseAction(_view, legal, rng) {
    return legal[rng.int(legal.length)]!;
  },
};
