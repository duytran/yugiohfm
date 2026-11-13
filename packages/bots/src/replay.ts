import { getCard, type GameEvent } from "@duel/engine";
import type { MatchOutcome } from "./runMatch";

const name = (id: string) => getCard(id).name;

export function formatEvent(event: GameEvent, bots: readonly [string, string]): string {
  const who = (player: 0 | 1) => `${bots[player]}(P${player})`;
  switch (event.type) {
    case "drew":
      return `${who(event.player)} drew ${event.count}`;
    case "fused":
      return `${who(event.player)} fused ${name(event.a)} + ${name(event.b)} -> ${name(event.result)}`;
    case "fusion-failed":
      return `${who(event.player)} failed to fuse ${name(event.a)} + ${name(event.b)}; ${name(event.b)} stands`;
    case "played":
      return `${who(event.player)} played ${event.cardId ? name(event.cardId) : `a face-down card (${event.handCards} from hand)`} in slot ${
        event.slot
      } (${event.position}${event.faceDown ? ", face-down" : ""})`;
    case "revealed":
      return `  ${who(event.player)} revealed ${name(event.cardId)} in slot ${event.slot}`;
    case "position-set":
      return `${who(event.player)} set slot ${event.slot} to ${event.position}`;
    case "attacked":
      return `${who(event.player)} attacked with slot ${event.attackerSlot} -> ${
        event.target === "direct" ? "direct" : `slot ${event.target}`
      }`;
    case "destroyed":
      return `  ${who(event.player)} lost ${name(event.cardId)} (slot ${event.slot})`;
    case "worn":
      return `  ${who(event.player)} slot ${event.slot} worn by ${event.amount}`;
    case "damage":
      return `  ${who(event.player)} took ${event.amount} damage`;
    case "turn-ended":
      return `${who(event.player)} ended the turn`;
    case "match-ended":
      return `Match over: ${who(event.winner)} wins by ${event.reason}`;
  }
}

export function formatReplay(outcome: MatchOutcome): string {
  const lines = [
    `Seed ${outcome.seed}: ${outcome.bots[0]}(P0) vs ${outcome.bots[1]}(P1), P${outcome.firstPlayer} moves first`,
    ...outcome.events.map((event) => formatEvent(event, outcome.bots)),
  ];
  if (outcome.status === "error") lines.push(`ERROR: ${outcome.error}`);
  return lines.join("\n");
}
