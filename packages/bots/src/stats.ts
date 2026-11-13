import { STARTING_LIFE, getCard, type CardId, type EndReason, type GameEvent } from "@duel/engine";
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
  /** share of finished games whose winner was COMEBACK_DEFICIT or more behind at some point, 0..1 */
  comebackRate: number;
  /** lead changes per finished game */
  averageLeadChanges: number;
  /** share of plays that included at least one successful fusion, 0..1 */
  fusionShare: number;
};

function top(counts: Map<CardId, number>, limit: number): [CardId, number][] {
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, limit);
}

/** A winner who was at least this many life points behind made a comeback. */
export const COMEBACK_DEFICIT = 2000;

/**
 * Replays the damage events of a match. `worstDeficit[p]` is the most life
 * points player p was ever behind by. A lead change is the lead passing from
 * one player to the other; a tie in between does not count on its own.
 */
export function lifeTrack(events: readonly GameEvent[]): { leadChanges: number; worstDeficit: [number, number] } {
  const life: [number, number] = [STARTING_LIFE, STARTING_LIFE];
  const worstDeficit: [number, number] = [0, 0];
  let leader: 0 | 1 | null = null;
  let leadChanges = 0;
  for (const event of events) {
    if (event.type !== "damage") continue;
    life[event.player] = Math.max(0, life[event.player] - event.amount);
    worstDeficit[0] = Math.max(worstDeficit[0], life[1] - life[0]);
    worstDeficit[1] = Math.max(worstDeficit[1], life[0] - life[1]);
    if (life[0] === life[1]) continue;
    const now = life[0] > life[1] ? 0 : 1;
    if (leader !== null && now !== leader) leadChanges += 1;
    leader = now;
  }
  return { leadChanges, worstDeficit };
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
  let comebacks = 0;
  let leadChanges = 0;
  let plays = 0;
  let fusionPlays = 0;

  for (const outcome of outcomes) {
    for (const name of outcome.bots) wins[name] ??= 0;
    let fusedInThisPlay = false;
    for (const event of outcome.events) {
      if (event.type === "fused") {
        fused.set(event.result, (fused.get(event.result) ?? 0) + 1);
        fusedInThisPlay = true;
      }
      if (event.type === "played") {
        played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
        plays += 1;
        if (fusedInThisPlay) fusionPlays += 1;
        fusedInThisPlay = false;
      }
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
    const track = lifeTrack(outcome.events);
    leadChanges += track.leadChanges;
    if (track.worstDeficit[outcome.winner] >= COMEBACK_DEFICIT) comebacks += 1;
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
    comebackRate: finished === 0 ? 0 : comebacks / finished,
    averageLeadChanges: finished === 0 ? 0 : leadChanges / finished,
    fusionShare: plays === 0 ? 0 : fusionPlays / plays,
  };
}

const percent = (part: number, whole: number) => (whole === 0 ? "0.0%" : `${((100 * part) / whole).toFixed(1)}%`);

export function formatSummary(summary: Summary): string {
  const finished = summary.games - summary.errors;
  const lines = [`Games: ${summary.games}  (finished ${finished}, errors ${summary.errors})`, "", "Wins"];
  for (const [name, count] of Object.entries(summary.wins)) {
    lines.push(`  ${name.padEnd(18)} ${String(count).padStart(6)}  ${percent(count, finished)}`);
  }
  lines.push(
    "",
    `First player win rate: ${(100 * summary.firstPlayerWinRate).toFixed(1)}%`,
    `Turns: average ${summary.averageTurns.toFixed(1)}, max ${summary.maxTurns}`,
    `Comebacks (winner was ${COMEBACK_DEFICIT}+ behind): ${(100 * summary.comebackRate).toFixed(1)}%`,
    `Lead changes: average ${summary.averageLeadChanges.toFixed(1)}`,
    `Fusion share of plays: ${(100 * summary.fusionShare).toFixed(1)}%`,
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
