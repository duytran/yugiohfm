import { getCard, type Action, type AttackAction, type PlayAction, type PlayerView } from "@duel/engine";
import { strongestDeck } from "./decks";
import { bestPlay, isFavourable } from "./greedy";
import { probe } from "./probe";
import type { Bot } from "./types";

/**
 * The strongest single hand card into an empty slot, in attack position. With
 * no empty slot it falls back to the greedy bot's best fusion.
 */
export function widePlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  let best: PlayAction | null = null;
  let bestAtk = -1;
  for (const action of legal) {
    if (action.type !== "PLAY" || action.position !== "attack" || action.handIndexes.length !== 1 || action.faceDown) continue;
    if (view.self.field[action.slot]) continue;
    const atk = getCard(view.self.hand[action.handIndexes[0]!]!).atk;
    if (atk > bestAtk) {
      best = action;
      bestAtk = atk;
    }
  }
  return best ?? bestPlay(view, legal);
}

/**
 * The "wide" baseline: fills the field with single cards before it fuses
 * anything, then makes every favourable attack. Same deck as the greedy bot,
 * so a match between them compares the two plans, not the decks.
 */
export const wideBot: Bot = {
  name: "wide",
  buildDeck: strongestDeck,

  chooseAction(view, legal) {
    const play = widePlay(view, legal);
    if (play) return play;
    const attack = legal.find((a): a is AttackAction => a.type === "ATTACK" && isFavourable(view, a));
    if (attack) return attack;
    const look = probe(view, legal);
    if (look) return look;
    return legal.find((a) => a.type === "END_TURN")!;
  },
};
