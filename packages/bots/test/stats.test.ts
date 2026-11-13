import { describe, expect, it } from "vitest";
import { formatReplay } from "../src/replay";
import type { MatchOutcome } from "../src/runMatch";
import { formatSummary, lifeTrack, summarize } from "../src/stats";

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
      { type: "played", player: 0, slot: 0, cardId: "ember-fox", position: "attack", faceDown: false, handCards: 1 },
      { type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" },
      { type: "played", player: 0, slot: 1, cardId: "beast-rider", position: "attack", faceDown: false, handCards: 1 },
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
    events: [{ type: "played", player: 1, slot: 0, cardId: "ember-fox", position: "attack", faceDown: false, handCards: 1 }],
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

describe("lifeTrack", () => {
  it("counts lead changes and the worst deficit of each player", () => {
    const track = lifeTrack([
      { type: "damage", player: 0, amount: 2500 }, // 1500 vs 4000: player 1 leads
      { type: "turn-ended", player: 1 },
      { type: "damage", player: 1, amount: 3000 }, // 1500 vs 1000: player 0 leads
      { type: "damage", player: 1, amount: 1000 }, // 1500 vs 0
    ]);
    expect(track).toEqual({ leadChanges: 1, worstDeficit: [2500, 1500] });
  });

  it("does not count a tie as a lead change", () => {
    const track = lifeTrack([
      { type: "damage", player: 0, amount: 500 }, // player 1 leads
      { type: "damage", player: 1, amount: 500 }, // tied
      { type: "damage", player: 0, amount: 500 }, // player 1 leads again
    ]);
    expect(track.leadChanges).toBe(0);
  });

  it("is all zeros with no damage", () => {
    expect(lifeTrack([])).toEqual({ leadChanges: 0, worstDeficit: [0, 0] });
  });
});

describe("summarize: tactics measures", () => {
  const comeback: MatchOutcome = {
    seed: 7,
    actions: [],
    bots: ["smart", "greedy"],
    status: "finished",
    winner: 0,
    reason: "life-points",
    firstPlayer: 1,
    turns: 12,
    events: [
      { type: "damage", player: 0, amount: 2500 },
      { type: "damage", player: 1, amount: 3000 },
      { type: "damage", player: 1, amount: 1000 },
    ],
  };

  it("measures comebacks and lead changes over finished games", () => {
    const summary = summarize([...outcomes, comeback]);
    // finished games: the two in `outcomes` (no damage events) and the comeback
    expect(summary.comebackRate).toBeCloseTo(1 / 3);
    expect(summary.averageLeadChanges).toBeCloseTo(1 / 3);
  });

  it("measures the share of plays that fused", () => {
    // `outcomes` has 3 plays; one of them follows a successful fusion
    expect(summarize(outcomes).fusionShare).toBeCloseTo(1 / 3);
  });

  it("does not count a failed fusion as a fusion play", () => {
    const failed: MatchOutcome = {
      ...comeback,
      events: [
        { type: "fusion-failed", player: 0, a: "furnace-drone", b: "pearl-clam" },
        { type: "played", player: 0, slot: 0, cardId: "pearl-clam", position: "attack", faceDown: false, handCards: 1 },
      ],
    };
    expect(summarize([failed]).fusionShare).toBe(0);
  });

  it("is zero for no games", () => {
    expect(summarize([])).toMatchObject({ comebackRate: 0, averageLeadChanges: 0, fusionShare: 0 });
  });

  it("prints the three measures", () => {
    const text = formatSummary(summarize([...outcomes, comeback]));
    expect(text).toContain("Comebacks (winner was 2000+ behind): 33.3%");
    expect(text).toContain("Lead changes: average 0.3");
    expect(text).toContain("Fusion share of plays: 33.3%");
  });
});
