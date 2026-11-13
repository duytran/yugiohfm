import { opponent } from "./rules";
import type { HiddenCreature, MatchState, PlayerId, PlayerView, ViewCreature } from "./types";
import { effectiveStats } from "./values";

function ownField(state: MatchState, player: PlayerId): (ViewCreature | null)[] {
  return state.players[player].field.map((creature, slot) =>
    creature ? { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) } : null,
  );
}

/** The opponent's field: a face-down creature shows only its position (R6, F2). */
function enemyField(state: MatchState, player: PlayerId): (ViewCreature | HiddenCreature | null)[] {
  return state.players[player].field.map((creature, slot) => {
    if (!creature) return null;
    if (creature.faceDown) return { hidden: true as const, position: creature.position };
    return { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) };
  });
}

/**
 * What `player` is allowed to know. The opponent's hand and both deck orders are
 * reduced to counts, and the opponent's face-down creatures show only a position. Creatures carry their current ATK and DEF. The result
 * shares nothing with `state`.
 */
export function viewFor(state: MatchState, player: PlayerId): PlayerView {
  const me = state.players[player];
  const other = opponent(player);
  const them = state.players[other];
  return structuredClone({
    you: player,
    active: state.active,
    firstPlayer: state.firstPlayer,
    turn: state.turn,
    playsUsed: state.playsUsed,
    result: state.result,
    rules: state.rules,
    self: { hand: me.hand, deckCount: me.deck.length, field: ownField(state, player), lifePoints: me.lifePoints },
    opponent: {
      handCount: them.hand.length,
      deckCount: them.deck.length,
      field: enemyField(state, other),
      lifePoints: them.lifePoints,
    },
  });
}
