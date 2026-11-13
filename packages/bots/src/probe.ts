import type { Action, AttackAction, PlayerView } from "@duel/engine";

/**
 * An attack on one of the opponent's face-down creatures by the weakest
 * creature that may make it, or null. A hidden target cannot be previewed, so
 * a bot sends its cheapest attacker to find out what it is.
 */
export function probe(view: PlayerView, legal: readonly Action[]): AttackAction | null {
  const atk = (action: AttackAction) => view.self.field[action.attackerSlot]!.atk;
  let best: AttackAction | null = null;
  for (const action of legal) {
    if (action.type !== "ATTACK" || action.target === "direct") continue;
    if (!view.opponent.field[action.target]?.hidden) continue;
    if (!best || atk(action) < atk(best)) best = action;
  }
  return best;
}
