import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import { smartBot } from "./smart";
import type { Bot } from "./types";
import { wideBot } from "./wide";

export type { Bot } from "./types";
export { randomBot } from "./random";
export { bestPlay, greedyBot, isFavourable, playGain } from "./greedy";
export { wideBot, widePlay } from "./wide";
export { attackScore, smartBot, smartPlay, threat } from "./smart";
export { DECKS, elementDeck, randomDeck, strongestDeck, withDeck, type DeckBuilder } from "./decks";
export { runMatch, type ActionRecord, type MatchOutcome, type RunOptions } from "./runMatch";
export { COMEBACK_DEFICIT, formatSummary, lifeTrack, summarize, type Summary } from "./stats";
export { formatEvent, formatReplay } from "./replay";

/** Bots selectable by name on the command line. Add a new bot here. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
  wide: wideBot,
  smart: smartBot,
};
