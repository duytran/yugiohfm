import { describe, expect, it } from "vitest";
import { CARDS, FUSION_RULES, findCard, getCard, hasTrait } from "../src/cards";
import { ELEMENTS, TAGS, TRAITS } from "../src/types";

const base = CARDS.filter((c) => !c.fusionOnly);
const fusions = CARDS.filter((c) => c.fusionOnly);

describe("card data", () => {
  it("has 40 base cards and 20 fusion-only cards", () => {
    expect(base).toHaveLength(40);
    expect(fusions).toHaveLength(20);
  });

  it("has unique ids", () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it("uses only known elements and 1-2 known tags", () => {
    for (const c of CARDS) {
      expect(ELEMENTS).toContain(c.element);
      expect(c.tags.length).toBeGreaterThanOrEqual(1);
      expect(c.tags.length).toBeLessThanOrEqual(2);
      for (const t of c.tags) expect(TAGS).toContain(t);
    }
  });

  it("uses stats that are positive multiples of 100", () => {
    for (const c of CARDS) {
      expect(c.atk % 100).toBe(0);
      expect(c.def % 100).toBe(0);
      expect(c.atk).toBeGreaterThan(0);
      expect(c.def).toBeGreaterThan(0);
    }
  });

  it("keeps base ATK at most 1800 and fusion ATK within 1900-3000", () => {
    for (const c of base) expect(c.atk).toBeLessThanOrEqual(1800);
    for (const c of fusions) {
      expect(c.atk).toBeGreaterThanOrEqual(1900);
      expect(c.atk).toBeLessThanOrEqual(3000);
    }
  });

  it("covers every element with at least 5 base cards", () => {
    for (const e of ELEMENTS) {
      expect(base.filter((c) => c.element === e).length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("fusion rules", () => {
  it("point only at existing fusion-only cards", () => {
    for (const rule of FUSION_RULES) {
      expect(rule.results.length).toBeGreaterThan(0);
      for (const id of rule.results) expect(findCard(id)?.fusionOnly).toBe(true);
    }
  });

  it("make every fusion-only card reachable", () => {
    const reachable = new Set(FUSION_RULES.flatMap((r) => r.results));
    for (const c of fusions) expect(reachable.has(c.id)).toBe(true);
  });
});

describe("lookup", () => {
  it("getCard returns the card", () => {
    expect(getCard("ember-fox").name).toBe("Ember Fox");
  });

  it("getCard throws on an unknown id and findCard returns undefined", () => {
    expect(() => getCard("nope")).toThrow("unknown card id: nope");
    expect(findCard("nope")).toBeUndefined();
  });
});

describe("traits (R4)", () => {
  const withTrait = (trait: string) => CARDS.filter((c) => (c.traits as string[]).includes(trait)).map((c) => c.id);

  it("prints Venom, Guard and Pierce on the planned cards", () => {
    expect(withTrait("venom")).toEqual(["thorn-sprite", "breeze-wisp", "spark-ferret", "briar-stag"]);
    expect(withTrait("guard")).toEqual(["furnace-drone", "clay-sentinel", "pearl-clam", "iron-vanguard"]);
    expect(withTrait("pierce")).toEqual(["vine-archer", "gale-falcon", "storm-crow", "sky-lancer"]);
  });

  it("uses only known traits", () => {
    for (const c of CARDS) for (const t of c.traits) expect(TRAITS).toContain(t);
  });

  it("follows the balance rule: one trait at most, none on strong cards", () => {
    for (const c of CARDS) expect(c.traits.length).toBeLessThanOrEqual(1);
    for (const c of base.filter((c) => c.atk >= 1600)) expect(c.traits, c.id).toEqual([]);
    for (const c of fusions.filter((c) => c.atk >= 2200)) expect(c.traits, c.id).toEqual([]);
  });

  it("hasTrait reads the card", () => {
    expect(hasTrait("thorn-sprite", "venom")).toBe(true);
    expect(hasTrait("thorn-sprite", "guard")).toBe(false);
    expect(hasTrait("ancient-tyrant", "venom")).toBe(false);
  });
});
