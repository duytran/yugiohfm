import { parseArgs } from "node:util";
import { BOTS, formatReplay, formatSummary, runMatch, summarize, type MatchOutcome } from "./index";

const USAGE = `Usage: pnpm sim [--a <bot>] [--b <bot>] [--games <n>] [--seed <n>] [--replay <seed>]
Bots: ${Object.keys(BOTS).join(", ")}`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function wholeNumber(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`--${flag} must be a whole number, got "${text}"`);
  return value;
}

const { values } = parseArgs({
  options: {
    a: { type: "string", default: "greedy" },
    b: { type: "string", default: "random" },
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    replay: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const botA = BOTS[values.a] ?? fail(`unknown bot "${values.a}"`);
const botB = BOTS[values.b] ?? fail(`unknown bot "${values.b}"`);

if (values.replay !== undefined) {
  console.log(formatReplay(runMatch(botA, botB, wholeNumber(values.replay, "replay"))));
} else {
  const games = wholeNumber(values.games, "games");
  const seed = wholeNumber(values.seed, "seed");
  const outcomes: MatchOutcome[] = [];
  for (let i = 0; i < games; i++) {
    // alternate seats so neither bot is always player 0
    outcomes.push(i % 2 === 0 ? runMatch(botA, botB, seed + i) : runMatch(botB, botA, seed + i));
  }
  console.log(`${botA.name} vs ${botB.name}, seeds ${seed}..${seed + games - 1}\n`);
  console.log(formatSummary(summarize(outcomes)));
}
