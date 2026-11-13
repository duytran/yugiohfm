import { getCard } from "./cards";
import { endMatch } from "./match";
import { ELEMENT_BONUS, FIELD_SLOTS, beats, opponent, turnError } from "./rules";
import type { AttackAction, Card, GameEvent, MatchState, PlayerId, Position } from "./types";

/**
 * The two numbers a battle compares, element bonus included: the attacker's ATK
 * against the target's ATK (attack position) or DEF (defense position).
 */
export function battleValues(attacker: Card, target: Card, targetPosition: Position): { attack: number; defense: number } {
  const attack = attacker.atk + (beats(attacker.element, target.element) ? ELEMENT_BONUS : 0);
  const base = targetPosition === "attack" ? target.atk : target.def;
  const defense = base + (beats(target.element, attacker.element) ? ELEMENT_BONUS : 0);
  return { attack, defense };
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

/** Mutates `draft`. The caller must have checked attackError first. */
export function resolveAttack(draft: MatchState, player: PlayerId, action: AttackAction, events: GameEvent[]): void {
  const enemy = opponent(player);
  const attacker = draft.players[player].field[action.attackerSlot]!;
  attacker.hasAttacked = true;
  events.push({ type: "attacked", player, attackerSlot: action.attackerSlot, target: action.target });

  if (action.target === "direct") {
    dealDamage(draft, enemy, getCard(attacker.cardId).atk, events);
    return;
  }

  const target = draft.players[enemy].field[action.target]!;
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position);

  if (target.position === "attack") {
    if (attack > defense) {
      destroy(draft, enemy, action.target, events);
      dealDamage(draft, enemy, attack - defense, events);
    } else if (attack < defense) {
      destroy(draft, player, action.attackerSlot, events);
      dealDamage(draft, player, defense - attack, events);
    } else {
      destroy(draft, enemy, action.target, events);
      destroy(draft, player, action.attackerSlot, events);
    }
    return;
  }

  if (attack > defense) destroy(draft, enemy, action.target, events);
  else if (attack < defense) dealDamage(draft, player, defense - attack, events);
}
