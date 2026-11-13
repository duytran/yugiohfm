import { describe, expect, it } from "vitest";
import { fuseChain, fusePair } from "../src/fusion";

describe("fusePair", () => {
  it("fuses two cards whose tags match a rule", () => {
    // beast + warrior -> Beast Rider (1900)
    expect(fusePair("ember-fox", "ash-duelist")).toEqual({
      a: "ember-fox",
      b: "ash-duelist",
      result: "beast-rider",
      success: true,
    });
  });

  it("matches a rule in either order", () => {
    expect(fusePair("ash-duelist", "ember-fox").result).toBe("beast-rider");
  });

  it("needs both cards to carry the tag for a same-tag rule", () => {
    // dragon + dragon -> Ancient Tyrant
    expect(fusePair("cinder-whelp", "cloud-serpent").result).toBe("ancient-tyrant");
  });

  it("fails when no rule matches: b stands, a is lost", () => {
    // machine + aqua has no rule
    expect(fusePair("furnace-drone", "pearl-clam")).toEqual({
      a: "furnace-drone",
      b: "pearl-clam",
      result: "pearl-clam",
      success: false,
    });
  });

  it("fails when the only result is not stronger than both inputs", () => {
    // beast + warrior -> Beast Rider (1900), but Beast Rider itself is already 1900
    expect(fusePair("beast-rider", "ash-duelist")).toEqual({
      a: "beast-rider",
      b: "ash-duelist",
      result: "ash-duelist",
      success: false,
    });
  });

  it("picks the lowest ATK among several matching rules, ties by id", () => {
    // Vine Archer (warrior, plant) + Moss Boar (beast):
    // beast+warrior -> beast-rider 1900, beast+plant -> briar-stag 1900; "beast-rider" < "briar-stag"
    expect(fusePair("vine-archer", "moss-boar").result).toBe("beast-rider");
  });

  it("skips results that are too weak and takes the next one up", () => {
    // Beast Rider (beast, warrior; 1900) + Bramble Wyrm (dragon, plant; 1600):
    // beast+plant -> briar-stag 1900 (not above 1900), dragon+warrior -> dragon-knight 2200
    expect(fusePair("beast-rider", "bramble-wyrm").result).toBe("dragon-knight");
  });
  it("gives the same answer on every call and a fresh object each time", () => {
    const first = fusePair("ember-fox", "ash-duelist");
    first.result = "seedling";
    first.success = false;
    expect(fusePair("ember-fox", "ash-duelist")).toEqual({
      a: "ember-fox",
      b: "ash-duelist",
      result: "beast-rider",
      success: true,
    });
    expect(fusePair("furnace-drone", "pearl-clam")).toEqual(fusePair("furnace-drone", "pearl-clam"));
  });

  it("still throws for an unknown card id, every time", () => {
    expect(() => fusePair("no-such-card", "ember-fox")).toThrow("unknown card id: no-such-card");
    expect(() => fusePair("no-such-card", "ember-fox")).toThrow("unknown card id: no-such-card");
  });
});

describe("fuseChain", () => {
  it("returns the single material unchanged with no steps", () => {
    expect(fuseChain(["ember-fox"])).toEqual({ result: "ember-fox", steps: [] });
  });

  it("feeds each result into the next pair, left to right", () => {
    // fox + duelist -> beast-rider; beast-rider (warrior) + cinder-whelp (dragon) -> dragon-knight;
    // dragon-knight (dragon) + cloud-serpent (dragon) -> ancient-tyrant
    const chain = fuseChain(["ember-fox", "ash-duelist", "cinder-whelp", "cloud-serpent"]);
    expect(chain.result).toBe("ancient-tyrant");
    expect(chain.steps.map((s) => s.result)).toEqual(["beast-rider", "dragon-knight", "ancient-tyrant"]);
    expect(chain.steps.every((s) => s.success)).toBe(true);
  });

  it("continues after a failed step with the later card", () => {
    // drone + clam fails (clam stands); clam (aqua) + mist-oracle (mage) -> tide-sorcerer
    const chain = fuseChain(["furnace-drone", "pearl-clam", "mist-oracle"]);
    expect(chain.steps.map((s) => s.success)).toEqual([false, true]);
    expect(chain.result).toBe("tide-sorcerer");
  });

  it("throws on an empty list", () => {
    expect(() => fuseChain([])).toThrow("fuseChain needs at least one material");
  });
});
