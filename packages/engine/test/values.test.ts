import { describe, expect, it } from "vitest";
import { getCard } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import { effectiveStats, sharesTheme } from "../src/values";
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

describe("sharesTheme", () => {
  it("is true for a shared tag or a shared element", () => {
    expect(sharesTheme(getCard("burrow-drake"), getCard("iron-digger"))).toBe(true); // earth
    expect(sharesTheme(getCard("ember-fox"), getCard("dust-jackal"))).toBe(true); // beast
    expect(sharesTheme(getCard("ember-fox"), getCard("gale-falcon"))).toBe(false);
  });
});

describe("synergy (R5)", () => {
  it("Banner gives each neighbour that shares a theme +300", () => {
    // earth dragon | earth Banner | wind bird | earth machine (not a neighbour)
    const state = makeState({
      p0: {
        field: field({
          0: creature("burrow-drake"),
          1: creature("iron-digger"),
          2: creature("gale-falcon"),
          3: creature("quarry-golem"),
        }),
      },
    });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1800, def: 1700 });
    expect(effectiveStats(state, 0, 1)).toEqual({ atk: 1300, def: 1400 });
    expect(effectiveStats(state, 0, 2)).toEqual({ atk: 1500, def: 800 });
    expect(effectiveStats(state, 0, 3)).toEqual({ atk: 1600, def: 1700 });
  });

  it("stacks two Banners", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("iron-digger"), 1: creature("burrow-drake"), 2: creature("iron-digger") }) },
    });
    expect(effectiveStats(state, 0, 1)).toEqual({ atk: 2100, def: 2000 });
  });

  it("Pack gets +200 per other own creature that shares a theme, each counted once", () => {
    const state = makeState({
      p0: {
        field: field({
          0: creature("dust-jackal"), // wind beast, Pack
          2: creature("ash-duelist"), // flame warrior: no
          3: creature("gale-falcon"), // wind: yes
          4: creature("dust-jackal"), // wind beast: yes, once
        }),
      },
      p1: { field: field({ 0: creature("ember-fox") }) }, // the opponent's beast does not count
    });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1500, def: 1300 });
  });

  it("Rally gets +500 only while its owner has fewer life points", () => {
    const behind = makeState({ p0: { field: field({ 0: creature("pebble-tortoise") }), lifePoints: 1000 } });
    expect(effectiveStats(behind, 0, 0)).toEqual({ atk: 1000, def: 2200 });
    const level = makeState({ p0: { field: field({ 0: creature("pebble-tortoise") }) } });
    expect(effectiveStats(level, 0, 0)).toEqual({ atk: 500, def: 1700 });
  });

  it("uses the match's bonus settings", () => {
    const state = makeState({
      rules: { ...DEFAULT_RULES, bannerBonus: 0 },
      p0: { field: field({ 0: creature("burrow-drake"), 1: creature("iron-digger") }) },
    });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1500, def: 1400 });
  });

  it("adds synergy before wear, never below 0", () => {
    const state = makeState({
      p0: { field: field({ 0: { ...creature("burrow-drake"), wear: 1700 }, 1: creature("iron-digger") }) },
    });
    // 1500 + 300 - 1700, and 1400 + 300 - 1700
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 100, def: 0 });
  });
});
