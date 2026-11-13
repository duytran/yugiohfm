import { opponent } from "./rules";
import type { MatchState, PlayerId, PlayerView } from "./types";

/**
 * What `player` is allowed to know. The opponent's hand and both deck orders are
 * reduced to counts. The result shares nothing with `state`.
 */
export function viewFor(state: MatchState, player: PlayerId): PlayerView {
  const me = state.players[player];
  const them = state.players[opponent(player)];
  return structuredClone({
    you: player,
    active: state.active,
    firstPlayer: state.firstPlayer,
    turn: state.turn,
    hasPlayed: state.hasPlayed,
    result: state.result,
    self: { hand: me.hand, deckCount: me.deck.length, field: me.field, lifePoints: me.lifePoints },
    opponent: {
      handCount: them.hand.length,
      deckCount: them.deck.length,
      field: them.field,
      lifePoints: them.lifePoints,
    },
  });
}
