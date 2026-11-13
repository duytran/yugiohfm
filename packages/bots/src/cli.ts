import { parseArgs } from "node:util";
import { makeRules, type Rules } from "@duel/engine";
import { BOTS, DECKS, formatReplay, formatSummary, runMatch, summarize, withDeck, type Bot, type MatchOutcome } from "./index";

const USAGE = `Usage: pnpm sim [--a <bot>] [--b <bot>] [--deck-a <deck>] [--deck-b <deck>]
                [--games <n>] [--seed <n>] [--element-bonus <n>] [--plays <1-5>] [--first-plays <n>] [--wear <0-1>] [--replay <seed>]
Bots: ${Object.keys(BOTS).join(", ")}
Decks: ${Object.keys(DECKS).join(", ")} (default: the bot's own deck)`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function wholeNumber(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`--${flag} must be a whole number, got "${text}"`);
  return value;
}

function fraction(text: string, flag: string): number {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) fail(`--${flag} must be a number, got "${text}"`);
  return value;
}

function pickBot(botName: string, deckName: string | undefined): Bot {
  const bot = BOTS[botName] ?? fail(`unknown bot "${botName}"`);
  if (deckName === undefined) return bot;
  return withDeck(bot, deckName, DECKS[deckName] ?? fail(`unknown deck "${deckName}"`));
}

const { values } = parseArgs({
  options: {
    a: { type: "string", default: "greedy" },
    b: { type: "string", default: "random" },
    "deck-a": { type: "string" },
    "deck-b": { type: "string" },
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    "element-bonus": { type: "string" },
    plays: { type: "string" },
    "first-plays": { type: "string" },
    wear: { type: "string" },
    replay: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const botA = pickBot(values.a, values["deck-a"]);
const botB = pickBot(values.b, values["deck-b"]);
const rules: Partial<Rules> = {};
if (values["element-bonus"] !== undefined) rules.elementBonus = wholeNumber(values["element-bonus"], "element-bonus");
if (values.plays !== undefined) rules.playsPerTurn = wholeNumber(values.plays, "plays");
if (values["first-plays"] !== undefined) rules.firstTurnPlays = wholeNumber(values["first-plays"], "first-plays");
if (values.wear !== undefined) rules.wearRatio = fraction(values.wear, "wear");
try {
  makeRules(rules);
} catch (error) {
  fail((error as Error).message);
}

if (values.replay !== undefined) {
  console.log(formatReplay(runMatch(botA, botB, wholeNumber(values.replay, "replay"), { rules })));
} else {
  const games = wholeNumber(values.games, "games");
  const seed = wholeNumber(values.seed, "seed");
  const outcomes: MatchOutcome[] = [];
  for (let i = 0; i < games; i++) {
    // alternate seats so neither bot is always player 0
    outcomes.push(i % 2 === 0 ? runMatch(botA, botB, seed + i, { rules }) : runMatch(botB, botA, seed + i, { rules }));
  }
  console.log(`${botA.name} vs ${botB.name}, seeds ${seed}..${seed + games - 1}, rules ${JSON.stringify(rules)}\n`);
  console.log(formatSummary(summarize(outcomes)));
}
