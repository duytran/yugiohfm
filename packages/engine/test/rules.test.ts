import { describe, expect, it } from "vitest";
import { beats, opponent } from "../src/rules";
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
