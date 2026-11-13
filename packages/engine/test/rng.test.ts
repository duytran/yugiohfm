import { describe, expect, it } from "vitest";
import { createRng, shuffle } from "../src/rng";

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("gives different sequences for different seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("int(n) stays inside [0, n)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});

describe("shuffle", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);

  it("keeps every item and does not change the input", () => {
    const out = shuffle(items, createRng(3));
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(items[0]).toBe(0);
    expect(out).not.toEqual(items);
  });

  it("is deterministic for a seed", () => {
    expect(shuffle(items, createRng(9))).toEqual(shuffle(items, createRng(9)));
  });
});
