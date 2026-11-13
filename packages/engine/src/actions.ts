import { attackError, resolveAttack } from "./battle";
import { endMatch, startTurn } from "./match";
import { playError, resolvePlay } from "./play";
import { FIELD_SLOTS, opponent, turnError } from "./rules";
import type { Action, ApplyResult, GameEvent, MatchState, PlayerId, SetPositionAction } from "./types";

export function setPositionError(state: MatchState, player: PlayerId, action: SetPositionAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  const { slot, position } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SLOTS) return "invalid slot";
  if (position !== "attack" && position !== "defense") return "invalid position";
  const creature = state.players[player].field[slot];
  if (!creature) return "no creature in that slot";
  if (creature.hasAttacked) return "creature already attacked this turn";
  if (creature.position === position) return "creature is already in that position";
  return null;
}

/** Why `action` is illegal for `player` right now, or null if it is legal. */
export function actionError(state: MatchState, player: PlayerId, action: Action): string | null {
  switch (action.type) {
    case "SURRENDER":
      return state.result ? "match is over" : null;
    case "END_TURN":
      return turnError(state, player);
    case "PLAY":
      return playError(state, player, action);
    case "SET_POSITION":
      return setPositionError(state, player, action);
    case "ATTACK":
      return attackError(state, player, action);
    default:
      return "unknown action";
  }
}

/**
 * The only way to advance a match. Never changes `state`: on success it returns
 * a new state plus the events that happened; on failure, the reason.
 */
export function applyAction(state: MatchState, player: PlayerId, action: Action): ApplyResult {
  const error = actionError(state, player, action);
  if (error) return { ok: false, error };

  const draft = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case "SURRENDER":
      endMatch(draft, opponent(player), "surrender", events);
      break;
    case "END_TURN":
      events.push({ type: "turn-ended", player });
      draft.active = opponent(player);
      draft.turn += 1;
      startTurn(draft, events);
      break;
    case "PLAY":
      resolvePlay(draft, player, action, events);
      break;
    case "SET_POSITION": {
      const creature = draft.players[player].field[action.slot]!;
      creature.position = action.position;
      events.push({ type: "position-set", player, slot: action.slot, position: action.position });
      break;
    }
    case "ATTACK":
      resolveAttack(draft, player, action, events);
      break;
  }
  return { ok: true, state: draft, events };
}

/** Called by the server when `player`'s clock runs out. A finished match is returned unchanged. */
export function applyTimeout(state: MatchState, player: PlayerId): { state: MatchState; events: GameEvent[] } {
  if (state.result) return { state, events: [] };
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  endMatch(draft, opponent(player), "timeout", events);
  return { state: draft, events };
}
