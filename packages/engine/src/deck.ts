import { findCard } from "./cards";
import { DECK_SIZE, MAX_COPIES } from "./rules";
import type { CardId } from "./types";

export type DeckCheck = { ok: true } | { ok: false; error: string };

export function validateDeck(cardIds: readonly CardId[]): DeckCheck {
  if (cardIds.length !== DECK_SIZE) {
    return { ok: false, error: `deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}` };
  }
  const copies = new Map<CardId, number>();
  for (const id of cardIds) {
    const card = findCard(id);
    if (!card) return { ok: false, error: `unknown card: ${id}` };
    if (card.fusionOnly) return { ok: false, error: `fusion-only card not allowed in a deck: ${id}` };
    const count = (copies.get(id) ?? 0) + 1;
    if (count > MAX_COPIES) return { ok: false, error: `more than ${MAX_COPIES} copies of ${id}` };
    copies.set(id, count);
  }
  return { ok: true };
}
