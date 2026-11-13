import { getCard } from "./cards";
import type { MatchState, PlayerId } from "./types";

/**
 * The current ATK and DEF of the creature in `slot`: printed value minus wear,
 * never below 0. A battle adds the element bonus on top (DDR-0009). This is the
 * only place those values are worked out (DDR-0010): views, battles and
 * previews all read it.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const creature = state.players[player].field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  return { atk: Math.max(0, card.atk - creature.wear), def: Math.max(0, card.def - creature.wear) };
}
