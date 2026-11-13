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

/** The highest current ATK among the opponent's creatures; 0 with none. */
export function threat(view: PlayerView): number {
  return Math.max(0, ...view.opponent.field.map((creature) => (creature ? creature.atk : 0)));
}

type Option = { action: PlayAction; cards: number; atk: number; def: number; cardId: string };

/** The view as it would be with `option` on the field, so the engine can preview its attacks. */
function afterPlay(view: PlayerView, option: Option): PlayerView {
  const field = view.self.field.map((creature, slot) =>
    slot === option.action.slot
      ? {
          hidden: false as const,
          cardId: option.cardId,
          position: option.action.position,
          hasAttacked: false,
          positionChanged: false,
          atk: option.atk,
          def: option.def,
        }
      : creature,
  );
  return { ...view, self: { ...view.self, field } };
}

/** The best score the played creature could get by attacking this turn; 0 if it cannot attack. */
function attackValue(view: PlayerView, option: Option): number {
  if (option.action.position !== "attack" || view.turn === 1) return 0;
  const replaced = view.self.field[option.action.slot];
  if (replaced?.hasAttacked) return 0;
  const after = afterPlay(view, option);
  const targets: (number | "direct")[] = [];
  view.opponent.field.forEach((creature, slot) => {
    if (creature) targets.push(slot);
  });
  if (targets.length === 0) targets.push("direct");
  return Math.max(
    0,
    ...targets.map((target) => attackScore(after, { type: "ATTACK", attackerSlot: option.action.slot, target })),
  );
}

const stronger = (x: Option, y: Option) =>
  x.atk > y.atk || (x.atk === y.atk && (x.def > y.def || (x.def === y.def && x.cards < y.cards)));

/**
 * 1. The play whose creature can make the best attack this turn, by the
 *    engine's preview (so the element bonus counts).
 * 2. Otherwise the strongest creature the threat cannot destroy: attack
 *    position if its ATK holds, else defense position if its DEF holds.
 * 3. Otherwise the highest DEF, in defense position.
 * Empty slots are used while there is one; with a full field it only plays
 * onto a creature when the result is stronger than that creature.
 */
export function smartPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  const all: Option[] = legal
    .filter((action): action is PlayAction => action.type === "PLAY")
    .map((action) => {
      const card = getCard(fuseChain(playMaterials(view.self.field, view.self.hand, action)).result);
      return { action, cards: action.handIndexes.length, atk: card.atk, def: card.def, cardId: card.id };
    });
  const open = all.filter((option) => !view.self.field[option.action.slot]);
  const options =
    open.length > 0 ? open : all.filter((option) => option.atk > view.self.field[option.action.slot]!.atk);
  if (options.length === 0) return null;

  let best: Option | null = null;
  let bestValue = 0;
  for (const option of options) {
    const value = attackValue(view, option);
    if (value > bestValue || (value === bestValue && best !== null && value > 0 && stronger(option, best))) {
      best = option;
      bestValue = value;
    }
  }
  if (best) return best.action;

  const need = threat(view);
  const holding = options.filter((option) => option.action.position === "attack" && option.atk >= need);
  if (holding.length > 0) return holding.reduce((x, y) => (stronger(y, x) ? y : x)).action;
  const walls = options.filter((option) => option.action.position === "defense" && option.def >= need);
  if (walls.length > 0) return walls.reduce((x, y) => (stronger(y, x) ? y : x)).action;

  const defenders = options.filter((option) => option.action.position === "defense");
  if (defenders.length === 0) return options[0]!.action;
  return defenders.reduce((x, y) => (y.def > x.def || (y.def === x.def && y.cards < x.cards) ? y : x)).action;
}

/**
 * How good an attack is, from the engine's preview: damage dealt plus the ATK
 * of a destroyed target, minus damage taken and the ATK of a lost attacker.
 */
export function attackScore(view: PlayerView, action: AttackAction): number {
  const preview = previewAttack(view, action);
  if ("error" in preview) return -Infinity;
  if (preview.damageToOpponent >= view.opponent.lifePoints) return Infinity;
  if (preview.damageToSelf >= view.self.lifePoints) return -Infinity;
  const attacker = view.self.field[action.attackerSlot]!;
  const target = action.target === "direct" ? null : view.opponent.field[action.target]!;
  return (
    preview.damageToOpponent +
    (preview.targetDestroyed && target ? target.atk : 0) -
    preview.damageToSelf -
    (preview.attackerDestroyed ? attacker.atk : 0)
  );
}

/**
 * Looks one attack ahead through the engine's preview, so it follows whatever
 * the battle rules are. Same deck as the greedy and wide bots.
 */
export const smartBot: Bot = {
  name: "smart",
  buildDeck: strongestDeck,

  chooseAction(view, legal) {
    const play = smartPlay(view, legal);
    if (play) return play;

    const need = threat(view);
    const turn = (to: "attack" | "defense") =>
      legal.find((action) => {
        if (action.type !== "SET_POSITION" || action.position !== to) return false;
        const creature = view.self.field[action.slot];
        if (!creature) return false;
        return to === "attack" ? creature.atk > need : creature.atk < need;
      });

    const toAttack = turn("attack");
    if (toAttack) return toAttack;

    let best: AttackAction | null = null;
    let bestScore = 0;
    for (const action of legal) {
      if (action.type !== "ATTACK") continue;
      const score = attackScore(view, action);
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    if (best) return best;

    const toDefense = turn("defense");
    if (toDefense) return toDefense;

    return legal.find((action) => action.type === "END_TURN")!;
  },
};
