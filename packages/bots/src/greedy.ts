import {
  fuseChain,
  getCard,
  playMaterials,
  previewAttack,
  type Action,
  type AttackAction,
  type PlayAction,
  type PlayerView,
} from "@duel/engine";
import { strongestDeck } from "./decks";
import type { Bot } from "./types";

/** ATK gained by a play: the result's ATK minus the ATK of the creature it replaces. */
export function playGain(view: PlayerView, action: PlayAction): number {
  const result = getCard(fuseChain(playMaterials(view.self.field, view.self.hand, action)).result);
  const replaced = view.self.field[action.slot];
  return result.atk - (replaced ? replaced.atk : 0);
}

/** True for a direct attack or a battle the attacker wins outright. */
export function isFavourable(view: PlayerView, action: AttackAction): boolean {
  if (action.target === "direct") return true;
  const preview = previewAttack(view, action);
  return !("error" in preview) && preview.attack > preview.defense;
}

/** The attack-position play with the largest ATK gain (fewest cards on a tie), or null if no play is legal. */
export function bestPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
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

  buildDeck: strongestDeck,

  chooseAction(view, legal) {
    const play = bestPlay(view, legal);
    if (play) return play;
    const attack = legal.find((a): a is AttackAction => a.type === "ATTACK" && isFavourable(view, a));
    if (attack) return attack;
    return legal.find((a) => a.type === "END_TURN")!;
  },
};
