import { opponent } from "./rules";
import type { MatchState, PlayerId, PlayerView, ViewCreature } from "./types";
import { effectiveStats } from "./values";

function viewField(state: MatchState, player: PlayerId): (ViewCreature | null)[] {
  return state.players[player].field.map((creature, slot) =>
    creature ? { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) } : null,
  );
}

/**
 * What `player` is allowed to know. The opponent's hand and both deck orders are
 * reduced to counts. Creatures carry their current ATK and DEF. The result
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
    self: { hand: me.hand, deckCount: me.deck.length, field: viewField(state, player), lifePoints: me.lifePoints },
    opponent: {
      handCount: them.hand.length,
      deckCount: them.deck.length,
      field: viewField(state, other),
      lifePoints: them.lifePoints,
    },
  });
}
