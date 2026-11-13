import { describe, expect, it } from "vitest";
import { CARDS, FUSION_RULES, findCard, getCard } from "../src/cards";
import { ELEMENTS, TAGS } from "../src/types";

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
