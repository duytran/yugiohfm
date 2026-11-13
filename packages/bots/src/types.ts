import type { Action, Card, CardId, PlayerView, Rng } from "@duel/engine";

export type Bot = {
  name: string;
  /** Must return a deck that passes validateDeck. `cards` is the whole pool. */
  buildDeck(cards: readonly Card[], rng: Rng): CardId[];
  /** Must return one of `legal`. Sees only what a human player would see. */
  chooseAction(view: PlayerView, legal: readonly Action[], rng: Rng): Action;
};
