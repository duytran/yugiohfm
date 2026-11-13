import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, beats, makeRules, opponent } from "../src/rules";
import { ELEMENTS } from "../src/types";

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
  it("defaults to an element bonus of 500", () => {
    expect(makeRules()).toEqual({ elementBonus: 500 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000 });
    expect(DEFAULT_RULES.elementBonus).toBe(500);
  });

  it("returns a new object each time", () => {
    expect(makeRules()).not.toBe(makeRules());
  });

  it("rejects a value that is not a whole number of 0 or more", () => {
    expect(() => makeRules({ elementBonus: -100 })).toThrow("invalid rule elementBonus: -100");
    expect(() => makeRules({ elementBonus: 0.5 })).toThrow("invalid rule elementBonus: 0.5");
    expect(makeRules({ elementBonus: 0 })).toEqual({ elementBonus: 0 });
  });
});
