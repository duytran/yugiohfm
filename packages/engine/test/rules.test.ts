import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, beats, makeRules, opponent, playsAllowed } from "../src/rules";
import { ELEMENTS } from "../src/types";
import { makeState } from "./helpers";

describe("beats", () => {
  it("follows the ring flame > forest > wind > earth > thunder > water > flame", () => {
    expect(beats("flame", "forest")).toBe(true);
    expect(beats("forest", "wind")).toBe(true);
    expect(beats("wind", "earth")).toBe(true);
    expect(beats("earth", "thunder")).toBe(true);
    expect(beats("thunder", "water")).toBe(true);
    expect(beats("water", "flame")).toBe(true);
  });

  it("every element beats exactly one other and never itself", () => {
    for (const a of ELEMENTS) {
      expect(ELEMENTS.filter((b) => beats(a, b))).toHaveLength(1);
      expect(beats(a, a)).toBe(false);
    }
  });

  it("is not symmetric", () => {
    expect(beats("forest", "flame")).toBe(false);
  });
});

describe("opponent", () => {
  it("swaps 0 and 1", () => {
    expect(opponent(0)).toBe(1);
    expect(opponent(1)).toBe(0);
  });
});

describe("makeRules", () => {
  it("defaults to an element bonus of 500, 2 plays per turn and a wear ratio of 1", () => {
    expect(makeRules()).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
    expect(makeRules({ playsPerTurn: 1 })).toEqual({ elementBonus: 500, playsPerTurn: 1, firstTurnPlays: 1, wearRatio: 1 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
  });

  it("applies a wear ratio override", () => {
    expect(makeRules({ wearRatio: 0.5 })).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 0.5 });
  });

  it("rejects a wear ratio outside 0 to 1", () => {
    expect(() => makeRules({ wearRatio: -0.5 })).toThrow("invalid rule wearRatio: -0.5");
    expect(() => makeRules({ wearRatio: 1.5 })).toThrow("invalid rule wearRatio: 1.5");
    expect(() => makeRules({ wearRatio: Number.NaN })).toThrow("invalid rule wearRatio: NaN");
    expect(makeRules({ wearRatio: 0 }).wearRatio).toBe(0);
  });

  it("gives turn 1 as many plays as any turn unless told otherwise", () => {
    expect(makeRules({ playsPerTurn: 5 }).firstTurnPlays).toBe(5);
    expect(makeRules({ playsPerTurn: 5, firstTurnPlays: 1 }).firstTurnPlays).toBe(1);
  });

  it("rejects first-turn plays outside 1 to playsPerTurn", () => {
    expect(() => makeRules({ firstTurnPlays: 0 })).toThrow("invalid rule firstTurnPlays: 0");
    expect(() => makeRules({ firstTurnPlays: 3 })).toThrow("invalid rule firstTurnPlays: 3");
    expect(() => makeRules({ firstTurnPlays: 1.5 })).toThrow("invalid rule firstTurnPlays: 1.5");
  });

  it("returns a new object each time", () => {
    expect(makeRules()).not.toBe(makeRules());
  });

  it("rejects an element bonus that is not a whole number of 0 or more", () => {
    expect(() => makeRules({ elementBonus: -100 })).toThrow("invalid rule elementBonus: -100");
    expect(() => makeRules({ elementBonus: 0.5 })).toThrow("invalid rule elementBonus: 0.5");
    expect(makeRules({ elementBonus: 0 }).elementBonus).toBe(0);
  });

  it("rejects plays per turn outside 1 to 5", () => {
    expect(() => makeRules({ playsPerTurn: 0 })).toThrow("invalid rule playsPerTurn: 0");
    expect(() => makeRules({ playsPerTurn: 6 })).toThrow("invalid rule playsPerTurn: 6");
    expect(() => makeRules({ playsPerTurn: 1.5 })).toThrow("invalid rule playsPerTurn: 1.5");
    expect(makeRules({ playsPerTurn: 5 }).playsPerTurn).toBe(5);
  });
});

describe("playsAllowed", () => {
  it("is firstTurnPlays on turn 1 and playsPerTurn after", () => {
    const rules = { ...DEFAULT_RULES, playsPerTurn: 2, firstTurnPlays: 1 };
    expect(playsAllowed(makeState({ turn: 1, rules }))).toBe(1);
    expect(playsAllowed(makeState({ turn: 2, rules }))).toBe(2);
  });
});
