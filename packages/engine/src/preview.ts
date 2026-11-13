import { resolveAttack, type BattleOutcome } from "./battle";
import { playError, resolvePlay } from "./play";
import { opponent } from "./rules";
import type {
  AttackAction,
  Creature,
  HiddenCreature,
  MatchState,
  PlayAction,
  PlayerState,
  PlayerView,
  ViewCreature,
} from "./types";
import { viewFor } from "./view";

/** Stands in for a card the viewer cannot see. The rules never read a face-down creature's card outside its own battle. */
const HIDDEN_CARD = "";

function hiddenCreature(creature: HiddenCreature): Creature {
  return { cardId: HIDDEN_CARD, position: creature.position, hasAttacked: false, wear: 0, faceDown: true };
}

function toCreature(creature: ViewCreature | HiddenCreature | null): Creature | null {
  if (!creature) return null;
  if (creature.hidden) return hiddenCreature(creature);
  return {
    cardId: creature.cardId,
    position: creature.position,
    hasAttacked: creature.hasAttacked,
    wear: creature.wear,
    faceDown: creature.faceDown,
  };
}

/**
 * A MatchState holding what `view` shows, for previews only. The zones the
 * viewer cannot see (the opponent's hand, both decks) are empty: no battle
 * reads them.
 */
export function stateFromView(view: PlayerView): MatchState {
  const self: PlayerState = {
    deck: [],
    hand: [...view.self.hand],
    field: view.self.field.map(toCreature),
    lifePoints: view.self.lifePoints,
  };
  const other: PlayerState = {
    deck: [],
    hand: [],
    field: view.opponent.field.map(toCreature),
    lifePoints: view.opponent.lifePoints,
  };
  return {
    players: view.you === 0 ? [self, other] : [other, self],
    active: view.active,
    firstPlayer: view.firstPlayer,
    turn: view.turn,
    playsUsed: view.playsUsed,
    result: view.result,
    rules: { ...view.rules },
  };
}

/**
 * What a series of attacks by the viewer would do, one after the other. It
 * runs the same code as a real attack, on a copy rebuilt from the view, so a
 * preview never disagrees with the match: each attack sees the creatures the
 * earlier ones destroyed, their wear and their damage. It checks only that the
 * creatures exist; whether an attack is legal now is for legalActions.
 */
export function previewAttacks(
  view: PlayerView,
  attacks: readonly AttackAction[],
): BattleOutcome[] | { error: string; index: number } {
  const state = stateFromView(view);
  const me = view.you;
  const enemy = opponent(me);
  const outcomes: BattleOutcome[] = [];
  for (const [index, action] of attacks.entries()) {
    if (state.result) return { error: "the match is over", index };
    if (!state.players[me].field[action.attackerSlot]) return { error: "no creature in that slot", index };
    if (action.target !== "direct" && !state.players[enemy].field[action.target]) {
      return { error: "no creature in the target slot", index };
    }
    if (action.target !== "direct" && state.players[enemy].field[action.target]!.cardId === HIDDEN_CARD) {
      return { error: "the target is face-down", index };
    }
    outcomes.push(resolveAttack(state, me, action, []));
  }
  return outcomes;
}

/** What one attack would do, worked out from a view. See previewAttacks. */
export function previewAttack(view: PlayerView, action: AttackAction): BattleOutcome | { error: string } {
  const result = previewAttacks(view, [action]);
  return "error" in result ? { error: result.error } : result[0]!;
}

/**
 * The view the viewer would have after `action`, worked out by the real play
 * code on a copy rebuilt from the view, or why the play is illegal. Counts the
 * viewer cannot rebuild (decks, the opponent's hand) are kept from `view`.
 */
export function viewAfterPlay(view: PlayerView, action: PlayAction): PlayerView | { error: string } {
  const state = stateFromView(view);
  const error = playError(state, view.you, action);
  if (error) return { error };
  resolvePlay(state, view.you, action, []);
  const after = viewFor(state, view.you);
  return {
    ...after,
    self: { ...after.self, deckCount: view.self.deckCount },
    opponent: { ...after.opponent, handCount: view.opponent.handCount, deckCount: view.opponent.deckCount },
  };
}
