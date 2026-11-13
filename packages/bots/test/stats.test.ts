import { describe, expect, it } from "vitest";
import { formatReplay } from "../src/replay";
import type { MatchOutcome } from "../src/runMatch";
import { formatSummary, summarize } from "../src/stats";

const base = { seed: 1, actions: [] };

const outcomes: MatchOutcome[] = [
  {
    ...base,
    bots: ["greedy", "random"],
    status: "finished",
    winner: 0,
    reason: "life-points",
    firstPlayer: 0,
    turns: 10,
    events: [
      { type: "played", player: 0, slot: 0, cardId: "ember-fox", position: "attack" },
      { type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" },
      { type: "played", player: 0, slot: 1, cardId: "beast-rider", position: "attack" },
    ],
  },
  {
    ...base,
    bots: ["random", "greedy"],
    status: "finished",
    winner: 1,
    reason: "deck-out",
    firstPlayer: 0,
    turns: 30,
    events: [{ type: "played", player: 1, slot: 0, cardId: "ember-fox", position: "attack" }],
  },
  { ...base, bots: ["greedy", "random"], status: "error", error: "boom", firstPlayer: 1, turns: 3, events: [] },
];

describe("summarize", () => {
  const summary = summarize(outcomes);

  it("counts games, errors and wins by bot name whatever seat the bot had", () => {
    expect(summary.games).toBe(3);
    expect(summary.errors).toBe(1);
    expect(summary.wins).toEqual({ greedy: 2, random: 0 });
  });

  it("measures first-player wins and turns over finished games only", () => {
    expect(summary.firstPlayerWinRate).toBe(0.5);
    expect(summary.averageTurns).toBe(20);
    expect(summary.maxTurns).toBe(30);
  });

  it("counts wins by reason", () => {
    expect(summary.byReason).toEqual({ "life-points": 1, "deck-out": 1 });
  });

  it("ranks played and fused cards", () => {
    expect(summary.mostPlayed).toEqual([
      ["ember-fox", 2],
      ["beast-rider", 1],
    ]);
    expect(summary.mostFused).toEqual([["beast-rider", 1]]);
  });

  it("handles no games", () => {
    expect(summarize([])).toMatchObject({ games: 0, errors: 0, firstPlayerWinRate: 0, averageTurns: 0, maxTurns: 0 });
  });
});

describe("formatSummary", () => {
  it("prints every section with card names", () => {
    const text = formatSummary(summarize(outcomes));
    expect(text).toContain("Games: 3  (finished 2, errors 1)");
    expect(text).toMatch(/greedy\s+2\s+100\.0%/);
    expect(text).toContain("First player win rate: 50.0%");
    expect(text).toContain("Turns: average 20.0, max 30");
    expect(text).toMatch(/deck-out\s+1\s+50\.0%/);
    expect(text).toMatch(/Ember Fox\s+2/);
    expect(text).toMatch(/Most fused\n\s+Beast Rider\s+1/);
  });
});

describe("formatReplay", () => {
  it("prints one line per event with bot and card names", () => {
    const text = formatReplay(outcomes[0]!);
    expect(text.split("\n")).toEqual([
      "Seed 1: greedy(P0) vs random(P1), P0 moves first",
      "greedy(P0) played Ember Fox in slot 0 (attack)",
      "greedy(P0) fused Ember Fox + Ash Duelist -> Beast Rider",
      "greedy(P0) played Beast Rider in slot 1 (attack)",
    ]);
  });

  it("ends with the error for an error outcome", () => {
    expect(formatReplay(outcomes[2]!).split("\n").at(-1)).toBe("ERROR: boom");
  });
});
