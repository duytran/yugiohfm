import { getCard } from "./cards";
import { opponent } from "./rules";
import type { Card, MatchState, PlayerId } from "./types";

/** True when two cards share a tag or their element. Counts once even when both match (R5). */
export function sharesTheme(a: Card, b: Card): boolean {
  return a.element === b.element || a.tags.some((tag) => b.tags.includes(tag));
}

/**
 * The current ATK and DEF of the creature in `slot`: printed value, plus
 * synergy (Banner, Pack, Rally), minus wear, never below 0. A battle adds the
 * element bonus on top (DDR-0009). Worked out from the board each time it is
 * read, never stored. This is the only place those values are worked out
 * (DDR-0010): views, battles and previews all read it.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const own = state.players[player];
  const creature = own.field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  const { rules } = state;

  let bonus = 0;
  // R6: a face-down creature gives and receives no Banner or Pack bonus and does not count for Pack
  if (!creature.faceDown) {
    for (const next of [slot - 1, slot + 1]) {
      const neighbour = own.field[next];
      if (!neighbour || neighbour.faceDown) continue;
      const banner = getCard(neighbour.cardId);
      if (banner.traits.includes("banner") && sharesTheme(card, banner)) bonus += rules.bannerBonus;
    }
    if (card.traits.includes("pack")) {
      const kin = own.field.filter(
        (other, i) => other && !other.faceDown && i !== slot && sharesTheme(card, getCard(other.cardId)),
      ).length;
      bonus += kin * rules.packBonus;
    }
  }
  // Rally depends only on life points, which are public (F5)
  if (card.traits.includes("rally") && own.lifePoints < state.players[opponent(player)].lifePoints) {
    bonus += rules.rallyBonus;
  }

  return {
    atk: Math.max(0, card.atk + bonus - creature.wear),
    def: Math.max(0, card.def + bonus - creature.wear),
  };
}
