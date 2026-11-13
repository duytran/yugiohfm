import {
  CARDS,
  applyAction,
  createMatch,
  createRng,
  legalActions,
  validateDeck,
  viewFor,
  type Action,
  type EndReason,
  type GameEvent,
  type MatchState,
  type PlayerId,
  type Rules,
} from "@duel/engine";
import type { Bot } from "./types";

export type ActionRecord = { player: PlayerId; action: Action };

type Common = {
  /** botA is player 0, botB is player 1 */
  bots: [string, string];
  seed: number;
  /** undefined only when the match could not be created */
  firstPlayer: PlayerId | undefined;
  turns: number;
  actions: ActionRecord[];
  events: GameEvent[];
};

export type MatchOutcome =
  | (Common & { status: "finished"; winner: PlayerId; reason: EndReason })
  | (Common & { status: "error"; error: string });

export type RunOptions = { maxTurns?: number; maxActions?: number; rules?: Partial<Rules> };

/**
 * Plays one whole match with no GUI, server or clock. Never throws for a bot's
 * mistake: an invalid deck, an illegal action, or hitting maxTurns or maxActions comes back as
 * an "error" outcome.
 */
export function runMatch(botA: Bot, botB: Bot, seed: number, options: RunOptions = {}): MatchOutcome {
  const maxTurns = options.maxTurns ?? 200;
  const maxActions = options.maxActions ?? 10_000;
  const bots: [Bot, Bot] = [botA, botB];
  // one independent, reproducible random stream per bot
  const rngs = [createRng(seed * 2 + 1), createRng(seed * 2 + 2)] as const;
  const common: Common = {
    bots: [botA.name, botB.name],
    seed,
    firstPlayer: undefined,
    turns: 0,
    actions: [],
    events: [],
  };

  const decks = bots.map((bot, i) => bot.buildDeck(CARDS, rngs[i]!));
  for (const [i, deck] of decks.entries()) {
    const check = validateDeck(deck);
    if (!check.ok) return { ...common, status: "error", error: `${bots[i]!.name} built an invalid deck: ${check.error}` };
  }

  let state: MatchState = createMatch(decks[0]!, decks[1]!, seed, options.rules);
  common.firstPlayer = state.firstPlayer;

  while (!state.result) {
    common.turns = state.turn;
    if (state.turn > maxTurns) return { ...common, status: "error", error: `no result after ${maxTurns} turns` };
    if (common.actions.length >= maxActions) {
      return { ...common, status: "error", error: `no result after ${maxActions} actions` };
    }

    const player = state.active;
    const bot = bots[player];
    const legal = legalActions(state, player);
    const action = bot.chooseAction(viewFor(state, player), legal, rngs[player]);
    const result = applyAction(state, player, action);
    if (!result.ok) {
      return { ...common, status: "error", error: `${bot.name} chose an illegal action: ${result.error}` };
    }
    common.actions.push({ player, action });
    common.events.push(...result.events);
    state = result.state;
  }

  return { ...common, status: "finished", winner: state.result.winner, reason: state.result.reason };
}
