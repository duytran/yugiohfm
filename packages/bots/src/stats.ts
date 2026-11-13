import { getCard, type CardId, type EndReason } from "@duel/engine";
import type { MatchOutcome } from "./runMatch";

export type Summary = {
  games: number;
  errors: number;
  /** wins per bot name */
  wins: Record<string, number>;
  /** share of finished games won by the player who moved first, 0..1 */
  firstPlayerWinRate: number;
  averageTurns: number;
  maxTurns: number;
  byReason: Partial<Record<EndReason, number>>;
  /** card id and count, most frequent first */
  mostPlayed: [CardId, number][];
  mostFused: [CardId, number][];
};

function top(counts: Map<CardId, number>, limit: number): [CardId, number][] {
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, limit);
}

export function summarize(outcomes: readonly MatchOutcome[], topN = 10): Summary {
  const wins: Record<string, number> = {};
  const byReason: Partial<Record<EndReason, number>> = {};
  const played = new Map<CardId, number>();
  const fused = new Map<CardId, number>();
  let errors = 0;
  let finished = 0;
  let firstPlayerWins = 0;
  let totalTurns = 0;
  let maxTurns = 0;

  for (const outcome of outcomes) {
    for (const name of outcome.bots) wins[name] ??= 0;
    for (const event of outcome.events) {
      if (event.type === "played") played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
      if (event.type === "fused") fused.set(event.result, (fused.get(event.result) ?? 0) + 1);
    }
    if (outcome.status === "error") {
      errors += 1;
      continue;
    }
    finished += 1;
    const winnerName = outcome.bots[outcome.winner];
    wins[winnerName] = (wins[winnerName] ?? 0) + 1;
    if (outcome.winner === outcome.firstPlayer) firstPlayerWins += 1;
    byReason[outcome.reason] = (byReason[outcome.reason] ?? 0) + 1;
    totalTurns += outcome.turns;
    maxTurns = Math.max(maxTurns, outcome.turns);
  }

  return {
    games: outcomes.length,
    errors,
    wins,
    firstPlayerWinRate: finished === 0 ? 0 : firstPlayerWins / finished,
    averageTurns: finished === 0 ? 0 : totalTurns / finished,
    maxTurns,
    byReason,
    mostPlayed: top(played, topN),
    mostFused: top(fused, topN),
  };
}

const percent = (part: number, whole: number) => (whole === 0 ? "0.0%" : `${((100 * part) / whole).toFixed(1)}%`);

export function formatSummary(summary: Summary): string {
  const finished = summary.games - summary.errors;
  const lines = [`Games: ${summary.games}  (finished ${finished}, errors ${summary.errors})`, "", "Wins"];
  for (const [name, count] of Object.entries(summary.wins)) {
    lines.push(`  ${name.padEnd(12)} ${String(count).padStart(6)}  ${percent(count, finished)}`);
  }
  lines.push(
    "",
    `First player win rate: ${(100 * summary.firstPlayerWinRate).toFixed(1)}%`,
    `Turns: average ${summary.averageTurns.toFixed(1)}, max ${summary.maxTurns}`,
    "",
    "Wins by reason",
  );
  for (const [reason, count] of Object.entries(summary.byReason)) {
    lines.push(`  ${reason.padEnd(12)} ${String(count).padStart(6)}  ${percent(count, finished)}`);
  }
  for (const [title, rows] of [["Most played", summary.mostPlayed], ["Most fused", summary.mostFused]] as const) {
    lines.push("", title);
    for (const [id, count] of rows) lines.push(`  ${getCard(id).name.padEnd(20)} ${String(count).padStart(6)}`);
  }
  return lines.join("\n");
}
