import { getCard } from "./cards";
import { endMatch } from "./match";
import { FIELD_SLOTS, beats, opponent, turnError } from "./rules";
import type {
  AttackAction,
  Element,
  GameEvent,
  MatchState,
  PlayerId,
  Position,
  Rules,
} from "./types";
import { effectiveStats } from "./values";

/** One side of a battle: its current ATK and DEF, and its element. */
export type Combatant = { atk: number; def: number; element: Element };

/** What an attack does. "Self" is the attacking player. */
export type BattleOutcome = {
  attack: number;
  defense: number;
  attackerDestroyed: boolean;
  targetDestroyed: boolean;
  damageToSelf: number;
  damageToOpponent: number;
  /** ATK and DEF the target loses for the rest of the turn; 0 if it is destroyed or for a direct attack */
  targetWear: number;
};

/**
 * The two numbers a battle compares, element bonus included: the attacker's ATK
 * against the target's ATK (attack position) or DEF (defense position).
 */
export function battleValues(
  attacker: Combatant,
  target: Combatant,
  targetPosition: Position,
  rules: Rules,
): { attack: number; defense: number } {
  const attack = attacker.atk + (beats(attacker.element, target.element) ? rules.elementBonus : 0);
  const base = targetPosition === "attack" ? target.atk : target.def;
  const defense = base + (beats(target.element, attacker.element) ? rules.elementBonus : 0);
  return { attack, defense };
}

/** The whole result of one attack. `target` null means a direct attack. Changes nothing. */
export function battleOutcome(
  attacker: Combatant,
  target: { combatant: Combatant; position: Position } | null,
  rules: Rules,
): BattleOutcome {
  if (!target) {
    return {
      attack: attacker.atk,
      defense: 0,
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 0,
      damageToOpponent: attacker.atk,
      targetWear: 0,
    };
  }
  const { attack, defense } = battleValues(attacker, target.combatant, target.position, rules);
  const damageToSelf = Math.max(0, defense - attack);
  // a target that survives is worn by the attack it withstood (R3)
  const wearIfSurvives = Math.floor(rules.wearRatio * attack);
  if (target.position === "attack") {
    const targetDestroyed = attack >= defense;
    return {
      attack,
      defense,
      attackerDestroyed: attack <= defense,
      targetDestroyed,
      damageToSelf,
      damageToOpponent: Math.max(0, attack - defense),
      targetWear: targetDestroyed ? 0 : wearIfSurvives,
    };
  }
  const targetDestroyed = attack > defense;
  return {
    attack,
    defense,
    attackerDestroyed: false,
    targetDestroyed,
    damageToSelf,
    damageToOpponent: 0,
    targetWear: targetDestroyed ? 0 : wearIfSurvives,
  };
}

export function attackError(state: MatchState, player: PlayerId, action: AttackAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (state.turn === 1) return "the first player cannot attack on the first turn";

  const { attackerSlot, target } = action;
  if (!Number.isInteger(attackerSlot) || attackerSlot < 0 || attackerSlot >= FIELD_SLOTS) return "invalid attacker slot";
  const attacker = state.players[player].field[attackerSlot];
  if (!attacker) return "no creature in that slot";
  if (attacker.position !== "attack") return "creature is in defense position";
  if (attacker.hasAttacked) return "creature already attacked this turn";

  const enemyField = state.players[opponent(player)].field;
  if (target === "direct") {
    return enemyField.some((c) => c !== null) ? "cannot attack directly while the opponent has creatures" : null;
  }
  if (!Number.isInteger(target) || target < 0 || target >= FIELD_SLOTS) return "invalid target slot";
  if (!enemyField[target]) return "no creature in the target slot";
  return null;
}

/** Mutates `draft`: lowers life points and ends the match at zero. */
function dealDamage(draft: MatchState, player: PlayerId, amount: number, events: GameEvent[]): void {
  const target = draft.players[player];
  target.lifePoints = Math.max(0, target.lifePoints - amount);
  events.push({ type: "damage", player, amount });
  if (target.lifePoints === 0) endMatch(draft, opponent(player), "life-points", events);
}

function destroy(draft: MatchState, player: PlayerId, slot: number, events: GameEvent[]): void {
  const creature = draft.players[player].field[slot];
  if (!creature) return;
  draft.players[player].field[slot] = null;
  events.push({ type: "destroyed", player, slot, cardId: creature.cardId });
}

function fromState(state: MatchState, player: PlayerId, slot: number): Combatant {
  const creature = state.players[player].field[slot]!;
  return { ...effectiveStats(state, player, slot), element: getCard(creature.cardId).element };
}

/** Mutates `draft` and returns what happened. The caller must have checked attackError first. */
export function resolveAttack(
  draft: MatchState,
  player: PlayerId,
  action: AttackAction,
  events: GameEvent[],
): BattleOutcome {
  const enemy = opponent(player);
  const target =
    action.target === "direct"
      ? null
      : {
          combatant: fromState(draft, enemy, action.target),
          position: draft.players[enemy].field[action.target]!.position,
        };
  const outcome = battleOutcome(fromState(draft, player, action.attackerSlot), target, draft.rules);

  draft.players[player].field[action.attackerSlot]!.hasAttacked = true;
  events.push({ type: "attacked", player, attackerSlot: action.attackerSlot, target: action.target });

  if (action.target !== "direct" && outcome.targetDestroyed) destroy(draft, enemy, action.target, events);
  if (outcome.attackerDestroyed) destroy(draft, player, action.attackerSlot, events);
  if (action.target !== "direct" && outcome.targetWear > 0) {
    draft.players[enemy].field[action.target]!.wear += outcome.targetWear;
    events.push({ type: "worn", player: enemy, slot: action.target, amount: outcome.targetWear });
  }
  if (outcome.damageToOpponent > 0) dealDamage(draft, enemy, outcome.damageToOpponent, events);
  if (outcome.damageToSelf > 0) dealDamage(draft, player, outcome.damageToSelf, events);
  return outcome;
}
