import {
  fuseChain,
  getCard,
  playMaterials,
  previewAttacks,
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
          wear: 0,
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
 * How good a series of attacks is, from the engine's preview of the whole
 * series: damage dealt plus the ATK of destroyed targets, minus damage taken
 * and the ATK of lost attackers. Values are read from the view before the
 * series, so wearing a target down earns nothing until it is destroyed.
 * Infinity if it wins the match, -Infinity if it loses it or cannot be previewed.
 */
export function planScore(view: PlayerView, plan: readonly AttackAction[]): number {
  const previews = previewAttacks(view, plan);
  if ("error" in previews) return -Infinity;
  let dealt = 0;
  let taken = 0;
  let value = 0;
  previews.forEach((preview, i) => {
    const action = plan[i]!;
    dealt += preview.damageToOpponent;
    taken += preview.damageToSelf;
    if (preview.targetDestroyed && action.target !== "direct") value += view.opponent.field[action.target]!.atk;
    if (preview.attackerDestroyed) value -= view.self.field[action.attackerSlot]!.atk;
  });
  if (dealt >= view.opponent.lifePoints) return Infinity;
  if (taken >= view.self.lifePoints) return -Infinity;
  return dealt - taken + value;
}

/** How good one attack is; see planScore. */
export function attackScore(view: PlayerView, action: AttackAction): number {
  return planScore(view, [action]);
}

/** Most attacks on one target the bot plans together: wearers, then a finisher (R3). */
export const GANG_SIZE = 3;

/**
 * The attack to make now, or null if none scores above 0. Every legal attack
 * is a plan of its own. For each target, it also plans gang-ups: one finisher
 * (strongest first) after 1 to GANG_SIZE - 1 of the weakest other attackers,
 * where every attack but the last leaves the target standing and the last
 * destroys it. A plan replaces the best so far only when it scores strictly
 * higher, so with wear off the bot attacks exactly as it did before. Only the
 * plan's first attack is returned; the bot asks again after it.
 */
export function bestAttack(view: PlayerView, legal: readonly Action[]): AttackAction | null {
  const attacks = legal.filter((action): action is AttackAction => action.type === "ATTACK");
  let best: AttackAction | null = null;
  let bestScore = 0;
  for (const action of attacks) {
    const score = attackScore(view, action);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }

  const atkOf = (action: AttackAction) => view.self.field[action.attackerSlot]!.atk;
  const targets = new Set(attacks.flatMap((action) => (action.target === "direct" ? [] : [action.target])));
  for (const target of targets) {
    const onTarget = attacks.filter((action) => action.target === target);
    const weakestFirst = [...onTarget].sort((x, y) => atkOf(x) - atkOf(y));
    const strongestFirst = [...weakestFirst].reverse();
    for (const finisher of strongestFirst) {
      const others = weakestFirst.filter((action) => action !== finisher);
      for (let wearers = 1; wearers < GANG_SIZE && wearers <= others.length; wearers++) {
        const plan = [...others.slice(0, wearers), finisher];
        const previews = previewAttacks(view, plan);
        if ("error" in previews) continue;
        const wearsThenFinishes = previews.every((preview, i) => preview.targetDestroyed === (i === plan.length - 1));
        if (!wearsThenFinishes) continue;
        const score = planScore(view, plan);
        if (score > bestScore) {
          best = plan[0]!;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

/**
 * Looks ahead through the engine's previews, one attack or a gang-up of up to
 * GANG_SIZE attacks, so it follows whatever the battle rules are. Same deck as
 * the greedy and wide bots.
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

    const attack = bestAttack(view, legal);
    if (attack) return attack;

    const toDefense = turn("defense");
    if (toDefense) return toDefense;

    return legal.find((action) => action.type === "END_TURN")!;
  },
};
