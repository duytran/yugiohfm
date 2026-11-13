import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import type { Bot } from "./types";

export type { Bot } from "./types";
export { randomBot } from "./random";
export { greedyBot, isFavourable, playGain } from "./greedy";
export { runMatch, type ActionRecord, type MatchOutcome, type RunOptions } from "./runMatch";
export { formatSummary, summarize, type Summary } from "./stats";
export { formatEvent, formatReplay } from "./replay";

/** Bots selectable by name on the command line. Add a new bot here. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
};
