import { describe, expect, it } from "vitest";
import { effectiveStats } from "../src/values";
import { creature, field, makeState } from "./helpers";

describe("effectiveStats", () => {
  const state = makeState({
    p0: { field: field({ 2: creature("ember-fox") }) },
    p1: { field: field({ 0: creature("pearl-clam", "defense") }) },
  });

  it("is the printed ATK and DEF while no rule changes them", () => {
    expect(effectiveStats(state, 0, 2)).toEqual({ atk: 1200, def: 800 });
    expect(effectiveStats(state, 1, 0)).toEqual({ atk: 400, def: 1800 });
  });

  it("subtracts wear from ATK and DEF, never below 0", () => {
    const worn = makeState({
      p0: { field: field({ 0: { ...creature("ash-duelist"), wear: 500 }, 1: { ...creature("ember-fox"), wear: 2000 } }) },
    });
    expect(effectiveStats(worn, 0, 0)).toEqual({ atk: 1000, def: 600 });
    expect(effectiveStats(worn, 0, 1)).toEqual({ atk: 0, def: 0 });
  });

  it("throws for an empty slot", () => {
    expect(() => effectiveStats(state, 0, 0)).toThrow("no creature in slot 0");
  });
});
