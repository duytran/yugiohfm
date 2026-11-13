import { actionError } from "./actions";
import { FIELD_SLOTS, playsAllowed } from "./rules";
import type { Action, MatchState, PlayerId, Position } from "./types";

const POSITIONS: Position[] = ["attack", "defense"];

/** Every non-empty ordered selection of the indexes 0..n-1 (subsets in every order). */
export function orderedSelections(n: number): number[][] {
  const out: number[][] = [];
  const extend = (chosen: number[]): void => {
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      const next = [...chosen, i];
      out.push(next);
      extend(next);
    }
  };
  extend([]);
  return out;
}

/**
 * Every action applyAction would accept from `player` right now, except
 * SURRENDER. Empty for the player who is not on turn and for a finished match.
 * Candidates are generated broadly and filtered through actionError, so this
 * list can never disagree with applyAction.
 */
export function legalActions(state: MatchState, player: PlayerId): Action[] {
  if (state.result || state.active !== player) return [];

  const candidates: Action[] = [];
  // skipping this when no play is left is only a speed-up; the filter below would drop them anyway
  if (state.playsUsed < playsAllowed(state)) {
    for (const handIndexes of orderedSelections(state.players[player].hand.length)) {
      for (let slot = 0; slot < FIELD_SLOTS; slot++) {
        for (const position of POSITIONS) candidates.push({ type: "PLAY", handIndexes, slot, position });
      }
    }
  }
  for (let slot = 0; slot < FIELD_SLOTS; slot++) {
    for (const position of POSITIONS) candidates.push({ type: "SET_POSITION", slot, position });
  }
  for (let attackerSlot = 0; attackerSlot < FIELD_SLOTS; attackerSlot++) {
    candidates.push({ type: "ATTACK", attackerSlot, target: "direct" });
    for (let target = 0; target < FIELD_SLOTS; target++) {
      candidates.push({ type: "ATTACK", attackerSlot, target });
    }
  }
  candidates.push({ type: "END_TURN" });

  return candidates.filter((action) => actionError(state, player, action) === null);
}
