import { DECK_SIZE, ELEMENTS, MAX_COPIES, type Card, type CardId, type Element, type Rng, type Trait } from "@duel/engine";
import type { Bot } from "./types";

/** Builds a deck from the whole pool. Must return a deck that passes validateDeck. */
export type DeckBuilder = (cards: readonly Card[], rng: Rng) => CardId[];

const strongestFirst = (x: Card, y: Card) => y.atk - x.atk || (x.id < y.id ? -1 : 1);

/** MAX_COPIES of each card in order, until the deck is full. */
function fill(ordered: readonly Card[]): CardId[] {
  const deck: CardId[] = [];
  for (const card of ordered) {
    for (let i = 0; i < MAX_COPIES && deck.length < DECK_SIZE; i++) deck.push(card.id);
  }
  return deck;
}

/** The highest-ATK base cards: the "pile of the biggest numbers" baseline. */
export const strongestDeck: DeckBuilder = (cards) => fill(cards.filter((c) => !c.fusionOnly).sort(strongestFirst));

/** A uniformly random valid deck. */
export const randomDeck: DeckBuilder = (cards, rng) => {
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
};

/** Every base card of one element, then the strongest other base cards. */
export function elementDeck(element: Element): DeckBuilder {
  return (cards) => {
    const base = cards.filter((c) => !c.fusionOnly);
    const themed = base.filter((c) => c.element === element).sort(strongestFirst);
    const rest = base.filter((c) => c.element !== element).sort(strongestFirst);
    return fill([...themed, ...rest]);
  };
}

/** Every base card with one of `traits`, then the strongest other base cards. */
export function traitDeck(traits: readonly Trait[]): DeckBuilder {
  return (cards) => {
    const base = cards.filter((c) => !c.fusionOnly);
    const has = (c: Card) => c.traits.some((t) => traits.includes(t));
    return fill([...base.filter(has).sort(strongestFirst), ...base.filter((c) => !has(c)).sort(strongestFirst)]);
  };
}

/** Decks selectable by name on the command line. */
export const DECKS: Record<string, DeckBuilder> = {
  strongest: strongestDeck,
  random: randomDeck,
  answers: traitDeck(["venom", "guard", "pierce"]),
  ...Object.fromEntries(ELEMENTS.map((element) => [element, elementDeck(element)])),
};

/** The same bot with another deck, named "<bot>/<deck>" so statistics tell them apart. */
export function withDeck(bot: Bot, deckName: string, build: DeckBuilder): Bot {
  return { ...bot, name: `${bot.name}/${deckName}`, buildDeck: build };
}
