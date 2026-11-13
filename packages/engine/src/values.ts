import { getCard } from "./cards";
import type { MatchState, PlayerId } from "./types";

/**
 * The current ATK and DEF of the creature in `slot`, before the element bonus
 * of a particular battle. This is the only place those values are worked out
 * (DDR-0010): views, battles and previews all read it. Today it is the printed
 * value; synergy and wear are added here.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const creature = state.players[player].field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  return { atk: card.atk, def: card.def };
}
