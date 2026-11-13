import { describe, expect, it } from "vitest";
import { greedyBot } from "../src/greedy";
import { randomBot } from "../src/random";
import { runMatch } from "../src/runMatch";
import type { Bot } from "../src/types";

describe("runMatch", () => {
  it("plays a whole match to a result", () => {
    const outcome = runMatch(greedyBot, randomBot, 1);
    expect(outcome.status).toBe("finished");
    expect(outcome.bots).toEqual(["greedy", "random"]);
    expect(outcome.seed).toBe(1);
    expect(outcome.turns).toBeGreaterThan(1);
    expect(outcome.actions.length).toBeGreaterThan(0);
    expect(outcome.events.at(-1)?.type).toBe("match-ended");
  });

  it("is deterministic for a seed", () => {
    expect(runMatch(randomBot, randomBot, 42)).toEqual(runMatch(randomBot, randomBot, 42));
  });

  it("gives different matches for different seeds", () => {
    expect(runMatch(randomBot, randomBot, 1).actions).not.toEqual(runMatch(randomBot, randomBot, 2).actions);
  });

  it("finishes 20 greedy-vs-random and 20 greedy-vs-greedy matches without an error", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(runMatch(greedyBot, randomBot, seed).status).toBe("finished");
      expect(runMatch(greedyBot, greedyBot, seed).status).toBe("finished");
    }
  });

  it("reports an illegal action as an error outcome instead of throwing", () => {
    const cheater: Bot = {
      ...randomBot,
      name: "cheater",
      chooseAction: () => ({ type: "ATTACK", attackerSlot: 0, target: "direct" }),
    };
    const outcome = runMatch(cheater, cheater, 1);
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") expect(outcome.error).toMatch(/^cheater chose an illegal action: /);
  });

  it("reports an invalid deck as an error outcome", () => {
    const lazy: Bot = { ...randomBot, name: "lazy", buildDeck: () => [] };
    const outcome = runMatch(lazy, randomBot, 1);
    expect(outcome).toMatchObject({
      status: "error",
      error: "lazy built an invalid deck: deck must have exactly 30 cards, got 0",
      firstPlayer: undefined,
    });
  });

  it("passes rule overrides to the match", () => {
    const seen: unknown[] = [];
    const spy: Bot = {
      ...randomBot,
      name: "spy",
      chooseAction(view, legal, rng) {
        seen.push(view.rules);
        return randomBot.chooseAction(view, legal, rng);
      },
    };
    expect(runMatch(spy, spy, 1, { rules: { elementBonus: 1000 } }).status).toBe("finished");
    expect(seen[0]).toEqual({ elementBonus: 1000 });
    seen.length = 0;
    runMatch(spy, spy, 1);
    expect(seen[0]).toEqual({ elementBonus: 500 });
  });

  it("stops at maxTurns when nobody ever finishes", () => {
    const passer: Bot = { ...randomBot, name: "passer", chooseAction: () => ({ type: "END_TURN" }) };
    const outcome = runMatch(passer, passer, 1, { maxTurns: 10 });
    expect(outcome).toMatchObject({ status: "error", error: "no result after 10 turns", turns: 11 });
  });
});
