import { getCard } from "./cards";
import { fuseChain } from "./fusion";
import { FIELD_SLOTS, turnError } from "./rules";
import type { Card, CardId, GameEvent, MatchState, PlayAction, PlayerId } from "./types";

/** Why this PLAY is illegal for a player holding `hand`, or null if it is legal. */
export function playShapeError(handSize: number, action: PlayAction): string | null {
  const { handIndexes, slot, position } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SLOTS) return "invalid slot";
  if (position !== "attack" && position !== "defense") return "invalid position";
  if (handIndexes.length === 0) return "play at least one card";
  if (new Set(handIndexes).size !== handIndexes.length) return "duplicate hand index";
  for (const index of handIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= handSize) return "invalid hand index";
  }
  return null;
}

/**
 * The fusion materials of a PLAY, in order: the creature already in the slot
 * (if any), then the chosen hand cards. Works on a view as well as a state.
 */
export function playMaterials(
  ownField: readonly ({ cardId: CardId } | null)[],
  hand: readonly CardId[],
  action: PlayAction,
): CardId[] {
  const onField = ownField[action.slot];
  const fromHand = action.handIndexes.map((index) => hand[index]!);
  return onField ? [onField.cardId, ...fromHand] : fromHand;
}

export function playError(state: MatchState, player: PlayerId, action: PlayAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (state.playsUsed >= state.rules.playsPerTurn) return "no plays left this turn";
  const shape = playShapeError(state.players[player].hand.length, action);
  if (shape) return shape;
  // fusing onto a creature that attacked must not move it out of harm's way
  const onField = state.players[player].field[action.slot];
  if (onField?.hasAttacked && onField.position !== action.position) {
    return "a creature that already attacked keeps its position";
  }
  return null;
}

/** The card a PLAY would put on the field, without changing anything. */
export function previewPlay(state: MatchState, player: PlayerId, action: PlayAction): Card | { error: string } {
  const error = playError(state, player, action);
  if (error) return { error };
  const me = state.players[player];
  return getCard(fuseChain(playMaterials(me.field, me.hand, action)).result);
}

/** Mutates `draft`. The caller must have checked playError first. */
export function resolvePlay(draft: MatchState, player: PlayerId, action: PlayAction, events: GameEvent[]): void {
  const me = draft.players[player];
  const previous = me.field[action.slot] ?? null;
  const chain = fuseChain(playMaterials(me.field, me.hand, action));

  // remove from the highest index down so earlier indexes stay valid
  for (const index of [...action.handIndexes].sort((x, y) => y - x)) me.hand.splice(index, 1);

  for (const step of chain.steps) {
    events.push(
      step.success
        ? { type: "fused", player, a: step.a, b: step.b, result: step.result }
        : { type: "fusion-failed", player, a: step.a, b: step.b },
    );
  }

  me.field[action.slot] = {
    cardId: chain.result,
    position: action.position,
    // a creature that already attacked cannot attack again by being fused onto
    hasAttacked: previous?.hasAttacked ?? false,
    // a play never heals wear
    wear: previous?.wear ?? 0,
  };
  draft.playsUsed += 1;
  events.push({ type: "played", player, slot: action.slot, cardId: chain.result, position: action.position });
}
