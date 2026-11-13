import { validateDeck } from "./deck";
import { createRng, shuffle } from "./rng";
import { FIELD_SLOTS, HAND_SIZE, STARTING_LIFE, opponent } from "./rules";
import type { CardId, GameEvent, MatchState, PlayerId, PlayerState } from "./types";

function newPlayer(deck: CardId[]): PlayerState {
  return {
    deck,
    hand: [],
    field: Array.from({ length: FIELD_SLOTS }, () => null),
    lifePoints: STARTING_LIFE,
  };
}

/** Mutates `draft`: ends the match in favour of `winner`. */
export function endMatch(
  draft: MatchState,
  winner: PlayerId,
  reason: NonNullable<MatchState["result"]>["reason"],
  events: GameEvent[],
): void {
  draft.result = { winner, reason };
  events.push({ type: "match-ended", winner, reason });
}

/**
 * Mutates `draft`: begins the active player's turn. Clears per-turn flags and
 * draws up to HAND_SIZE. A deck that cannot supply the cards loses the match.
 */
export function startTurn(draft: MatchState, events: GameEvent[]): void {
  const player = draft.players[draft.active];
  draft.hasPlayed = false;
  for (const creature of player.field) {
    if (creature) {
      creature.hasAttacked = false;
      creature.positionChanged = false;
    }
  }
  const need = HAND_SIZE - player.hand.length;
  if (need > player.deck.length) {
    endMatch(draft, opponent(draft.active), "deck-out", events);
    return;
  }
  if (need > 0) {
    player.hand.push(...player.deck.splice(0, need));
    events.push({ type: "drew", player: draft.active, count: need });
  }
}

/** Shuffles both decks, picks who goes first, and starts the first turn. */
export function createMatch(deckA: readonly CardId[], deckB: readonly CardId[], seed: number): MatchState {
  for (const deck of [deckA, deckB]) {
    const check = validateDeck(deck);
    if (!check.ok) throw new Error(`invalid deck: ${check.error}`);
  }
  const rng = createRng(seed);
  const shuffledA = shuffle(deckA, rng);
  const shuffledB = shuffle(deckB, rng);
  const first: PlayerId = rng.int(2) === 0 ? 0 : 1;
  const state: MatchState = {
    players: [newPlayer(shuffledA), newPlayer(shuffledB)],
    active: first,
    firstPlayer: first,
    turn: 1,
    hasPlayed: false,
    result: null,
  };
  startTurn(state, []);
  return state;
}
