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

  it("throws for an empty slot", () => {
    expect(() => effectiveStats(state, 0, 0)).toThrow("no creature in slot 0");
  });
});
