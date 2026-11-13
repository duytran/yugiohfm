import {
  DECK_SIZE,
  MAX_COPIES,
  battleValues,
  fuseChain,
  getCard,
  playMaterials,
  type Action,
  type AttackAction,
  type CardId,
  type PlayAction,
  type PlayerView,
} from "@duel/engine";
import type { Bot } from "./types";

/** ATK gained by a play: the result's ATK minus the ATK of the creature it replaces. */
export function playGain(view: PlayerView, action: PlayAction): number {
  const result = getCard(fuseChain(playMaterials(view.self.field, view.self.hand, action)).result);
  const replaced = view.self.field[action.slot];
  return result.atk - (replaced ? getCard(replaced.cardId).atk : 0);
}

/** True for a direct attack or a battle the attacker wins outright. */
export function isFavourable(view: PlayerView, action: AttackAction): boolean {
  if (action.target === "direct") return true;
  const attacker = view.self.field[action.attackerSlot];
  const target = view.opponent.field[action.target];
  if (!attacker || !target) return false;
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position, view.rules);
  return attack > defense;
}

function bestPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  let best: PlayAction | null = null;
  let bestGain = -Infinity;
  for (const action of legal) {
    if (action.type !== "PLAY" || action.position !== "attack") continue;
    const gain = playGain(view, action);
    const better =
      gain > bestGain || (gain === bestGain && best !== null && action.handIndexes.length < best.handIndexes.length);
    if (better) {
      best = action;
      bestGain = gain;
    }
  }
  return best;
}

/**
 * Strongest 30-card deck; every turn makes the play with the largest ATK gain
 * (fewest cards on a tie), then every favourable attack, then ends the turn.
 * It always plays when it can, so its matches always move toward deck-out.
 */
export const greedyBot: Bot = {
  name: "greedy",

  buildDeck(cards) {
    const strongest = cards
      .filter((c) => !c.fusionOnly)
      .sort((x, y) => y.atk - x.atk || (x.id < y.id ? -1 : 1))
      .slice(0, DECK_SIZE / MAX_COPIES);
    const deck: CardId[] = [];
    for (const c of strongest) for (let i = 0; i < MAX_COPIES; i++) deck.push(c.id);
    return deck;
  },

  chooseAction(view, legal) {
    const play = bestPlay(view, legal);
    if (play) return play;
    const attack = legal.find((a): a is AttackAction => a.type === "ATTACK" && isFavourable(view, a));
    if (attack) return attack;
    return legal.find((a) => a.type === "END_TURN")!;
  },
};
