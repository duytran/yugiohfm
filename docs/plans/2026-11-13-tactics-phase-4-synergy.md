# Tactics Phase 4 (Synergy) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rule R5: synergy traits (Banner, Pack, Rally) that make a creature's value depend on the cards around it, teach the smart bot to build a formation, and measure themed decks against the strongest deck.

**Architecture:** The three traits join `TRAITS` and are printed on cards; their bonuses are rule settings. `effectiveStats` adds them, from the whole field and both life totals, before wear. Because views, battles and previews already read `effectiveStats` (phase 2), everything follows from that one function, including "destroying a Banner mid-turn changes the next battle". A new `viewAfterPlay` gives bots the board after a play, worked out by the real play code, so the smart bot can choose a slot by the formation it builds.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-tactics-rules-design.md`, R5 (section 4), goals 1 and 2 (section 3), section 6 (the synergy values and the themed-deck and comeback targets), phase 4 (section 8). Depends on phases 2 and 3 being implemented.

## Global Constraints

- Rules live only in `packages/engine`; it imports nothing outside its own files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- Bots see only a `PlayerView`, import only from `@duel/engine`, and return one of `legal` (DDR-0006). Only the engine works out current values (DDR-0010); the smart bot reads them from `viewAfterPlay`, it never adds bonuses itself.
- **Bonuses are derived, never stored** (DDR-0009): worked out from the field at the moment they are needed. No new field on `Creature`.
- **Order of a value** (owner's decision, 2026-11-13): printed value, plus synergy, minus wear, never below 0; a battle adds the element bonus on top.
- **"Shares a tag or the element" counts once per creature**, even when both match (owner's decision, 2026-11-13).
- **No automatic bonus for being behind** (DDR-0009): Rally works only on cards that print it.
- First-run values (spec section 6): Banner +300, Pack +200 per creature, Rally +500. They are rule settings the simulator can vary.
- Card pool: only traits are added; names, tags and stats stay. Balance rule from phase 3: at most one trait per card, none on base cards with ATK 1600 or more or on fusion results with ATK 2200 or more.
- Regression check: before task 1, record `pnpm -s sim --a greedy --b greedy --games 20 --seed 1` and `pnpm -s sim --a smart --b smart --games 100`. After task 1 (data and settings only) both must print the same. After task 2, `--banner 0 --pack 0 --rally 0` must reproduce the greedy line (the greedy bot does not change). The smart bot changes in task 3, so its numbers are compared in task 4 instead.
- Speed budget: `pnpm -s sim --a smart --b smart --games 100` stays under 15 s.
- Every task: test first, one commit, one `HISTORY.md` line in the same commit, one GitHub issue, `Closes #N` in the commit message. Issue numbers are listed in `Revisions` at the bottom.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## Decisions made while planning

- **Which cards print which synergy trait** (proposed here; the owner approves it with this plan):

| Trait | Base cards | Fusion result |
|---|---|---|
| Banner | Flare Hawk (flame), Canopy Owl (forest), Zephyr Monk (wind), Iron Digger (earth), Tesla Turret (thunder), Reef Guard (water) | Bloom Witch (mage + plant, 2000/1800) |
| Pack | Dust Jackal (wind beast), Stone Ram (earth beast), Tide Otter (water beast aqua), Kelp Lurker (water plant aqua) | Twin-Fang Chimera (beast + beast, 2000/1600) |
| Rally | Kite Glider (wind), Grove Sage (forest), Pebble Tortoise (earth), Harbor Gull (water) | none |

  One Banner per element, so every element deck can build a formation. Pack sits on beasts and aqua cards, so a tag-themed deck has a payoff. Rally goes on low-ATK or high-DEF bodies. Cards whose numbers existing tests assert (Ember Fox, Moss Boar, Seedling, Static Drakeling, Pyre Adept and others) are left without a synergy trait, so earlier tests keep their meaning.
- **Banners stack.** A creature between two Banners that both share a theme with it gets both bonuses. A Banner can benefit from another Banner next to it.
- **Pack counts the other creatures on its owner's field** (not itself, not the opponent's), each once.
- **Rally compares life points at the moment the value is read**, so a battle that changes the life totals changes the next battle.
- **The smart bot ranks plays by the total current ATK of its own field after the play** (before: the ATK of the played creature only). Without synergy the two rankings agree on empty slots; on a full field they can differ, so the smart bot's numbers are not a regression check after task 3.
- **Many plays give the same card in the same place.** The smart bot previews each (result card, slot, position) once, using the play with the fewest hand cards, to stay inside the speed budget.
- New deck builders: `tagDeck(tag)` and a `synergy` deck (`traitDeck(["banner", "pack"])` from phase 3: 10 base cards x 3 = 30).

## File Structure

| File | Change |
|---|---|
| `packages/engine/src/types.ts` | `TRAITS` gains `banner`, `pack`, `rally`; `Rules` gains three bonuses |
| `packages/engine/src/rules.ts` | defaults and checks |
| `packages/engine/src/cards.ts` | traits printed on 16 more cards |
| `packages/engine/src/values.ts` | synergy in `effectiveStats`; `sharesTheme` |
| `packages/engine/src/preview.ts` | `viewAfterPlay` |
| `packages/engine/src/index.ts` | exports |
| `packages/bots/src/smart.ts` | plays ranked by the board after the play |
| `packages/bots/src/decks.ts`, `cli.ts` | `tagDeck`, `synergy` deck; `--banner`, `--pack`, `--rally` |

---

### Task 1: Synergy traits on cards, and their bonuses as settings

**Files:**
- Modify: `packages/engine/src/types.ts`, `rules.ts`, `cards.ts`
- Modify: `packages/bots/src/cli.ts`
- Test: `packages/engine/test/cards.test.ts`, `rules.test.ts`, `view.test.ts`; `packages/bots/test/runMatch.test.ts`

**Interfaces:**
- Consumes: `Trait`, `card`, `fusion` (phase 3).
- Produces:
  - `TRAITS = ["venom", "guard", "pierce", "banner", "pack", "rally"] as const`.
  - `Rules.bannerBonus` (300), `Rules.packBonus` (200), `Rules.rallyBonus` (500); `makeRules` throws `invalid rule <name>: <v>` unless a whole number of 0 or more.
  - `pnpm sim --banner <n> --pack <n> --rally <n>`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/cards.test.ts`, inside `describe("traits (R4)", ...)`:

```ts
  it("prints Banner, Pack and Rally on the planned cards (R5)", () => {
    expect(withTrait("banner")).toEqual([
      "flare-hawk",
      "canopy-owl",
      "zephyr-monk",
      "iron-digger",
      "tesla-turret",
      "reef-guard",
      "bloom-witch",
    ]);
    expect(withTrait("pack")).toEqual(["dust-jackal", "stone-ram", "tide-otter", "kelp-lurker", "twin-fang-chimera"]);
    expect(withTrait("rally")).toEqual(["grove-sage", "kite-glider", "pebble-tortoise", "harbor-gull"]);
  });

  it("gives every element exactly one Banner base card", () => {
    for (const e of ELEMENTS) {
      expect(base.filter((c) => c.element === e && c.traits.includes("banner")), e).toHaveLength(1);
    }
  });
```

`packages/engine/test/rules.test.ts` — every expected rules object gains `bannerBonus: 300, packBonus: 200, rallyBonus: 500`, and add:

```ts
  it("rejects synergy bonuses that are not whole numbers of 0 or more", () => {
    expect(() => makeRules({ bannerBonus: -1 })).toThrow("invalid rule bannerBonus: -1");
    expect(() => makeRules({ packBonus: 0.5 })).toThrow("invalid rule packBonus: 0.5");
    expect(() => makeRules({ rallyBonus: -500 })).toThrow("invalid rule rallyBonus: -500");
    expect(makeRules({ bannerBonus: 0, packBonus: 0, rallyBonus: 0 })).toMatchObject({ bannerBonus: 0, packBonus: 0, rallyBonus: 0 });
  });
```

`packages/engine/test/view.test.ts` and `packages/bots/test/runMatch.test.ts` — every expected rules object gains `bannerBonus: 300, packBonus: 200, rallyBonus: 500`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — no synergy traits on cards, no bonus settings.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`:

```ts
/** Keywords printed on some cards: answers (R4) and synergy (R5). A creature has exactly the traits of its card. */
export const TRAITS = ["venom", "guard", "pierce", "banner", "pack", "rally"] as const;
```

and `Rules` gains, after `wearRatio`:

```ts
  /** ATK and DEF a Banner gives each neighbouring creature that shares a tag or its element (R5) */
  bannerBonus: number;
  /** ATK and DEF a Pack creature gets per other own creature sharing a tag or its element (R5) */
  packBonus: number;
  /** ATK and DEF a Rally creature gets while its owner has fewer life points than the opponent (R5) */
  rallyBonus: number;
```

`packages/engine/src/rules.ts`:

```ts
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  elementBonus: 500,
  playsPerTurn: 2,
  firstTurnPlays: 2,
  wearRatio: 1,
  bannerBonus: 300,
  packBonus: 200,
  rallyBonus: 500,
});
```

and in `makeRules`, replace the `elementBonus` check with one loop over every whole-number bonus:

```ts
  for (const name of ["elementBonus", "bannerBonus", "packBonus", "rallyBonus"] as const) {
    if (!Number.isInteger(rules[name]) || rules[name] < 0) throw new Error(`invalid rule ${name}: ${rules[name]}`);
  }
```

`packages/engine/src/cards.ts` — in `BASE`, change these 14 lines (every other line stays):

```ts
  card("flare-hawk", "Flare Hawk", "flame", ["bird"], 1000, 700, ["banner"]),
  card("grove-sage", "Grove Sage", "forest", ["mage"], 1200, 1600, ["rally"]),
  card("canopy-owl", "Canopy Owl", "forest", ["bird"], 1100, 1200, ["banner"]),
  card("zephyr-monk", "Zephyr Monk", "wind", ["warrior"], 1300, 1400, ["banner"]),
  card("kite-glider", "Kite Glider", "wind", ["machine", "bird"], 1200, 1000, ["rally"]),
  card("dust-jackal", "Dust Jackal", "wind", ["beast"], 1100, 900, ["pack"]),
  card("stone-ram", "Stone Ram", "earth", ["beast"], 1400, 1500, ["pack"]),
  card("pebble-tortoise", "Pebble Tortoise", "earth", ["beast"], 500, 1700, ["rally"]),
  card("iron-digger", "Iron Digger", "earth", ["machine"], 1300, 1400, ["banner"]),
  card("tesla-turret", "Tesla Turret", "thunder", ["machine"], 1400, 1600, ["banner"]),
  card("tide-otter", "Tide Otter", "water", ["beast", "aqua"], 1100, 1000, ["pack"]),
  card("reef-guard", "Reef Guard", "water", ["warrior", "aqua"], 1300, 1500, ["banner"]),
  card("kelp-lurker", "Kelp Lurker", "water", ["plant", "aqua"], 1000, 1500, ["pack"]),
  card("harbor-gull", "Harbor Gull", "water", ["bird"], 900, 800, ["rally"]),
```

and in `FUSIONS`:

```ts
  fusion("twin-fang-chimera", "Twin-Fang Chimera", "flame", ["beast"], 2000, 1600, ["pack"]),
  fusion("bloom-witch", "Bloom Witch", "forest", ["mage", "plant"], 2000, 1800, ["banner"]),
```

`packages/bots/src/cli.ts`:

- `USAGE` second line gains `[--banner <n>] [--pack <n>] [--rally <n>]` before `[--replay <seed>]`;
- `parseArgs` options gain `banner: { type: "string" }, pack: { type: "string" }, rally: { type: "string" },`;
- after the `--wear` line:

```ts
if (values.banner !== undefined) rules.bannerBonus = wholeNumber(values.banner, "banner");
if (values.pack !== undefined) rules.packBonus = wholeNumber(values.pack, "pack");
if (values.rally !== undefined) rules.rallyBonus = wholeNumber(values.rally, "rally");
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: the two regression commands from Global Constraints.
Expected: the same output as recorded before this task (nothing reads the new traits yet).

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Banner, Pack and Rally printed on 14 base cards and 2 fusion results (one Banner per element); their bonuses are the rule settings bannerBonus 300, packBonus 200, rallyBonus 500; pnpm sim gained --banner, --pack, --rally; no rule reads them yet (tactics phase 4, task 1, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): synergy traits on cards, bonuses as settings

Closes #N"
```

---

### Task 2: Synergy in current values

**Files:**
- Modify: `packages/engine/src/values.ts`
- Test: `packages/engine/test/values.test.ts`, `battle.test.ts`, `view.test.ts`, `preview.test.ts`

**Interfaces:**
- Consumes: the traits and settings of task 1; `Creature.wear` (phase 2).
- Produces:
  - `sharesTheme(a: Card, b: Card): boolean` — exported from `values.ts` (engine-internal; not exported from `index.ts`).
  - `effectiveStats(state, player, slot)` keeps its signature and now adds Banner, Pack and Rally before wear.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/values.test.ts` — import `DEFAULT_RULES` from `../src/rules`, `getCard` from `../src/cards` and `sharesTheme` from `../src/values`, and add:

```ts
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
```

`packages/engine/test/battle.test.ts`:

```ts
describe("synergy in battle (R5)", () => {
  it("destroying a Banner changes the next battle in the same turn", () => {
    // flame against earth, no bonus. Burrow Drake is 1500 + 300 next to the Iron Digger Banner.
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("iron-digger"), 1: creature("burrow-drake") }) },
    });
    expect(effectiveStats(state, 1, 1).atk).toBe(1800);
    resolveAttack(state, 0, attack(0, 0), []); // 1500 vs 1300: the Banner falls
    expect(effectiveStats(state, 1, 1).atk).toBe(1500);
    const outcome = resolveAttack(state, 0, attack(1, 1), []); // 1500 vs 1500 now
    expect(outcome).toMatchObject({ attackerDestroyed: true, targetDestroyed: true });
  });
});
```

`packages/engine/test/view.test.ts`:

```ts
  it("shows values with synergy", () => {
    const formed = makeState({ p0: { field: field({ 0: creature("burrow-drake"), 1: creature("iron-digger") }) } });
    expect(viewFor(formed, 1).opponent.field[0]).toMatchObject({ atk: 1800, def: 1700 });
  });
```

`packages/engine/test/preview.test.ts`, in `describe("previewAttacks", ...)`:

```ts
  it("follows a Banner's loss from one attack to the next", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("iron-digger"), 1: creature("burrow-drake") }) },
    });
    const result = previewAttacks(viewFor(state, 0), [attack(0, 0), attack(1, 1)]);
    if ("error" in result) throw new Error(result.error);
    expect(result[1]).toMatchObject({ attack: 1500, defense: 1500 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — the synergy cases; `sharesTheme` is not exported.

- [ ] **Step 3: Implement**

Replace `packages/engine/src/values.ts` with:

```ts
import { getCard } from "./cards";
import { opponent } from "./rules";
import type { Card, MatchState, PlayerId } from "./types";

/** True when two cards share a tag or their element. Counts once even when both match (R5). */
export function sharesTheme(a: Card, b: Card): boolean {
  return a.element === b.element || a.tags.some((tag) => b.tags.includes(tag));
}

/**
 * The current ATK and DEF of the creature in `slot`: printed value, plus
 * synergy (Banner, Pack, Rally), minus wear, never below 0. A battle adds the
 * element bonus on top (DDR-0009). Worked out from the board each time it is
 * read, never stored. This is the only place those values are worked out
 * (DDR-0010): views, battles and previews all read it.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const own = state.players[player];
  const creature = own.field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  const { rules } = state;

  let bonus = 0;
  for (const next of [slot - 1, slot + 1]) {
    const neighbour = own.field[next];
    if (!neighbour) continue;
    const banner = getCard(neighbour.cardId);
    if (banner.traits.includes("banner") && sharesTheme(card, banner)) bonus += rules.bannerBonus;
  }
  if (card.traits.includes("pack")) {
    const kin = own.field.filter((other, i) => other && i !== slot && sharesTheme(card, getCard(other.cardId))).length;
    bonus += kin * rules.packBonus;
  }
  if (card.traits.includes("rally") && own.lifePoints < state.players[opponent(player)].lifePoints) {
    bonus += rules.rallyBonus;
  }

  return {
    atk: Math.max(0, card.atk + bonus - creature.wear),
    def: Math.max(0, card.def + bonus - creature.wear),
  };
}
```

(`own.field[-1]` and `own.field[5]` are `undefined`, which the `continue` handles.)

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --banner 0 --pack 0 --rally 0`
Expected: the greedy line recorded before task 1.

Run: `pnpm -s sim --a smart --b smart --games 100` and `pnpm -s sim --a random --b random --games 100`
Expected: 0 errors; smart under 15 s.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R5: effectiveStats adds Banner (+300 to sharing neighbours), Pack (+200 per sharing own creature) and Rally (+500 while behind) before wear; views, battles and previews follow, so losing a Banner changes the next battle (tactics phase 4, task 2, DDR-0009, DDR-0010, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): synergy in current values

Closes #N"
```

---

### Task 3: `viewAfterPlay`, and the smart bot builds formations

**Files:**
- Modify: `packages/engine/src/preview.ts`, `index.ts`
- Modify: `packages/bots/src/smart.ts`
- Test: `packages/engine/test/preview.test.ts`, `packages/bots/test/smart.test.ts`

**Interfaces:**
- Consumes: `stateFromView` (phase 2), `playError`, `resolvePlay`, `viewFor`.
- Produces:
  - `viewAfterPlay(view: PlayerView, action: PlayAction): PlayerView | { error: string }` — exported from `@duel/engine`.
  - `smartPlay(view, legal)` keeps its signature; it ranks options by the board after the play.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/preview.test.ts` — import `viewAfterPlay` too, and add:

```ts
describe("viewAfterPlay", () => {
  const state = makeState({
    p0: { hand: ["burrow-drake", "ember-fox"], field: field({ 1: creature("iron-digger") }) },
    p1: { hand: ["seedling", "seedling"], field: field({ 0: creature("ember-fox") }) },
  });

  it("shows the board after the play, with the values the engine works out", () => {
    const after = viewAfterPlay(viewFor(state, 0), { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" });
    if ("error" in after) throw new Error(after.error);
    expect(after.self.field[0]).toMatchObject({ cardId: "burrow-drake", atk: 1800, def: 1700 });
    expect(after.self.hand).toEqual(["ember-fox"]);
    expect(after.playsUsed).toBe(1);
  });

  it("keeps the counts the viewer cannot rebuild", () => {
    const before = viewFor(state, 0);
    const after = viewAfterPlay(before, { type: "PLAY", handIndexes: [1], slot: 3, position: "defense" });
    if ("error" in after) throw new Error(after.error);
    expect(after.opponent.handCount).toBe(before.opponent.handCount);
    expect(after.opponent.deckCount).toBe(before.opponent.deckCount);
    expect(after.self.deckCount).toBe(before.self.deckCount);
  });

  it("returns why an illegal play is illegal, and never changes the view", () => {
    const before = viewFor(state, 0);
    const copy = structuredClone(before);
    expect(viewAfterPlay(before, { type: "PLAY", handIndexes: [7], slot: 0, position: "attack" })).toEqual({
      error: "invalid hand index",
    });
    expect(before).toEqual(copy);
  });
});
```

`packages/bots/test/smart.test.ts`:

```ts
describe("smartPlay with synergy", () => {
  it("puts a creature next to the Banner it shares a theme with", () => {
    // turn 1, no threat: the best board is Burrow Drake beside the earth Banner
    const v = { ...view({ hand: ["burrow-drake"], mine: [null, on("iron-digger"), null, null, null] }), turn: 1 };
    const legal = [3, 0, 4, 2].map((slot): Action => ({ type: "PLAY", handIndexes: [0], slot, position: "attack" }));
    expect(smartPlay(v, [...legal, END])).toMatchObject({ slot: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/preview.test.ts packages/bots/test/smart.test.ts`
Expected: FAIL — `viewAfterPlay` is not exported; the smart bot picks slot 3, the first slot it is offered, because it ranks by the played card's printed ATK.

- [ ] **Step 3: Implement**

`packages/engine/src/preview.ts` — import `playError`, `resolvePlay` from `./play`, `viewFor` from `./view`, and `PlayAction` as a type, then add:

```ts
/**
 * The view the viewer would have after `action`, worked out by the real play
 * code on a copy rebuilt from the view, or why the play is illegal. Counts the
 * viewer cannot rebuild (decks, the opponent's hand) are kept from `view`.
 */
export function viewAfterPlay(view: PlayerView, action: PlayAction): PlayerView | { error: string } {
  const state = stateFromView(view);
  const error = playError(state, view.you, action);
  if (error) return { error };
  resolvePlay(state, view.you, action, []);
  const after = viewFor(state, view.you);
  return {
    ...after,
    self: { ...after.self, deckCount: view.self.deckCount },
    opponent: { ...after.opponent, handCount: view.opponent.handCount, deckCount: view.opponent.deckCount },
  };
}
```

`packages/engine/src/index.ts` — the preview line becomes:

```ts
export { previewAttack, previewAttacks, viewAfterPlay } from "./preview";
```

`packages/bots/src/smart.ts` — add `viewAfterPlay` to the `@duel/engine` import, delete `afterPlay`, and replace `Option`, `attackValue`, `stronger` and the first lines of `smartPlay` with:

```ts
type Option = { action: PlayAction; cards: number; after: PlayerView; atk: number; def: number; board: number };

/** The total current ATK of the viewer's creatures. */
function boardAtk(view: PlayerView): number {
  return view.self.field.reduce((sum, creature) => sum + (creature ? creature.atk : 0), 0);
}

/**
 * Every legal play with the board it leaves, from the engine. Plays that put
 * the same card in the same place are previewed once, with the fewest cards.
 */
function playOptions(view: PlayerView, legal: readonly Action[]): Option[] {
  const cheapest = new Map<string, PlayAction>();
  for (const action of legal) {
    if (action.type !== "PLAY") continue;
    const result = fuseChain(playMaterials(view.self.field, view.self.hand, action)).result;
    const key = `${result}|${action.slot}|${action.position}`;
    const kept = cheapest.get(key);
    if (!kept || action.handIndexes.length < kept.handIndexes.length) cheapest.set(key, action);
  }
  return [...cheapest.values()].flatMap((action) => {
    const after = viewAfterPlay(view, action);
    if ("error" in after) return [];
    const placed = after.self.field[action.slot]!;
    return [{ action, cards: action.handIndexes.length, after, atk: placed.atk, def: placed.def, board: boardAtk(after) }];
  });
}

/** The best score the played creature could get by attacking this turn; 0 if it cannot attack. */
function attackValue(view: PlayerView, option: Option): number {
  if (option.action.position !== "attack" || view.turn === 1) return 0;
  if (view.self.field[option.action.slot]?.hasAttacked) return 0;
  const targets: (number | "direct")[] = [];
  view.opponent.field.forEach((creature, slot) => {
    if (creature) targets.push(slot);
  });
  if (targets.length === 0) targets.push("direct");
  return Math.max(
    0,
    ...targets.map((target) => attackScore(option.after, { type: "ATTACK", attackerSlot: option.action.slot, target })),
  );
}

const stronger = (x: Option, y: Option) =>
  x.board > y.board ||
  (x.board === y.board && (x.atk > y.atk || (x.atk === y.atk && (x.def > y.def || (x.def === y.def && x.cards < y.cards)))));
```

and in `smartPlay`, the opening lines become:

```ts
export function smartPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  const all = playOptions(view, legal);
  const open = all.filter((option) => !view.self.field[option.action.slot]);
  const options =
    open.length > 0 ? open : all.filter((option) => option.atk > view.self.field[option.action.slot]!.atk);
  if (options.length === 0) return null;
```

(the rest of `smartPlay` is unchanged). Update its doc comment: "2. Otherwise the strongest board the threat cannot break: ..." and "Options are ranked by the total current ATK of the bot's field after the play, from the engine, so a slot next to a Banner or a Pack partner counts."

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `time pnpm -s sim --a smart --b smart --games 100`
Expected: 0 errors, under 15 s.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** New engine function viewAfterPlay (the board after a play, by the real play code); the smart bot ranks plays by its whole board after the play, so it builds Banner and Pack formations (tactics phase 4, task 3, DDR-0010, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat: viewAfterPlay; smart bot builds formations

Closes #N"
```

---

### Task 4: Themed decks, measure, and bring the docs in step

**Files:**
- Modify: `packages/bots/src/decks.ts`, `index.ts`
- Test: `packages/bots/test/decks.test.ts`
- Modify: `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-12-online-card-duel-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0009-tactics-combination-over-raw-stats.md`, `docs/ddr/0010-engine-determines-effective-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: `traitDeck` (phase 3), `TAGS`.
- Produces: `tagDeck(tag: Tag): DeckBuilder`; `DECKS.synergy` and one deck per tag.

- [ ] **Step 1: Write the failing test**

`packages/bots/test/decks.test.ts` — import `tagDeck` too; the expected key list becomes:

```ts
    expect(Object.keys(DECKS)).toEqual([
      "strongest",
      "random",
      "answers",
      "synergy",
      "flame",
      "forest",
      "wind",
      "earth",
      "thunder",
      "water",
      "beast",
      "dragon",
      "warrior",
      "mage",
      "plant",
      "machine",
      "aqua",
      "bird",
    ]);
```

and add:

```ts
  it("a tag deck holds 3 copies of every base card with that tag, then the strongest others", () => {
    const deck = tagDeck("beast")(CARDS, createRng(1));
    const beasts = deck.filter((id) => getCard(id).tags.includes("beast"));
    // 7 beast base cards x 3
    expect(beasts).toHaveLength(21);
  });

  it("the synergy deck is every Banner and Pack base card", () => {
    const deck = DECKS.synergy!(CARDS, createRng(1));
    expect(new Set(deck).size).toBe(10);
    for (const id of deck) expect(getCard(id).traits.some((t) => t === "banner" || t === "pack")).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/bots/test/decks.test.ts`
Expected: FAIL — `tagDeck` is not exported.

- [ ] **Step 3: Implement**

`packages/bots/src/decks.ts` — add `TAGS` and `type Tag` to the `@duel/engine` import, and:

```ts
/** Every base card with `tag`, then the strongest other base cards. */
export function tagDeck(tag: Tag): DeckBuilder {
  return (cards) => {
    const base = cards.filter((c) => !c.fusionOnly);
    const themed = base.filter((c) => c.tags.includes(tag)).sort(strongestFirst);
    const rest = base.filter((c) => !c.tags.includes(tag)).sort(strongestFirst);
    return fill([...themed, ...rest]);
  };
}
```

`DECKS` becomes:

```ts
export const DECKS: Record<string, DeckBuilder> = {
  strongest: strongestDeck,
  random: randomDeck,
  answers: traitDeck(["venom", "guard", "pierce"]),
  synergy: traitDeck(["banner", "pack"]),
  ...Object.fromEntries(ELEMENTS.map((element) => [element, elementDeck(element)])),
  ...Object.fromEntries(TAGS.map((tag) => [tag, tagDeck(tag)])),
};
```

`packages/bots/src/index.ts` — add `tagDeck` to the `./decks` export list.

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 4: Run the comparison**

With the default rules (or the owner's current defaults) and `--games 500`:

```bash
pnpm -s sim --a smart --b smart --games 500
pnpm -s sim --a greedy --b wide --games 500
pnpm -s sim --a smart --b wide --games 500
pnpm -s sim --a smart --b greedy --games 500
pnpm -s sim --a smart --b smart --deck-a answers --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a synergy --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a beast --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a earth --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a water --deck-b strongest --games 500
```

Then, if one themed deck wins more than 65% against the strongest deck, repeat its row with `--banner 150 --pack 100 --rally 250` (the spec: "lower values if one theme dominates"). If no themed deck reaches 50%, repeat the synergy and beast rows with `--banner 500 --pack 300`.

Expected: 0 errors in every run.

- [ ] **Step 5: Record it and bring the docs in step**

- `docs/specs/2026-11-13-tactics-rules-design.md`, `Revisions`: a section `### <today's date>: phase 4 results (R5)` with the synergy trait table, the runs as tables (same columns as before), the section 6 target table with the phase 3 column and the phase 4 column (the themed-deck target is now measured with real themes), what moved, the bonus values the numbers favour as a recommendation, and the planning decisions (Banners stack; Pack counts own creatures once each; Rally reads life points when the value is read; the smart bot ranks plays by its whole board).
- `docs/specs/2026-11-12-online-card-duel-design.md`, `Revisions`: Banner, Pack and Rally with their rules; a creature's shown value includes them.
- `docs/specs/2026-11-13-engine-high-level-design.md`, `Revisions`: `effectiveStats` now reads the whole field and both life totals; `sharesTheme`; `viewAfterPlay`; the six traits.
- `docs/ddr/0009-tactics-combination-over-raw-stats.md`: set `Last updated`; Implementation says R1 to R5 are implemented; the known gap gets the phase 4 numbers and whether the themed-deck target is met.
- `docs/ddr/0010-engine-determines-effective-stats.md`: Implementation names `viewAfterPlay`; the known gap says only hidden creatures are missing.
- `CLAUDE.md`: Status says tactics phases 0 to 4 are implemented (R1 to R5); the `pnpm sim` line names the `synergy` and tag decks and `--banner`, `--pack`, `--rally`; add this plan to the "Read first" table.

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

Append to `HISTORY.md`:
`- **[code]** Added tagDeck, the synergy deck and one deck per tag; recorded the phase 4 results in docs/specs/2026-11-13-tactics-rules-design.md and brought the approved spec's Revisions, the engine high-level design, DDR-0009, DDR-0010 and CLAUDE.md in step with R5 (tactics phase 4, task 4, #N).`

```bash
git add packages docs CLAUDE.md HISTORY.md
git commit -m "feat(bots): themed decks; docs: phase 4 results

Closes #N"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| R5: Banner, Pack, Rally rules | 2 |
| R5: slots 0 to 4, neighbours `n-1` and `n+1` | 2 |
| R5: bonuses derived at the moment of each battle; losing a Banner changes the next battle | 2 (a test) |
| R5: order base, synergy, (element), wear, never below 0 | 2 (with the owner's 2026-11-13 order) |
| R5: a shared tag or element counts once | 2 (a test) |
| R5: battle values need both fields and both life totals | 2 (inside `effectiveStats`; no public signature changes, because previews rebuild a state since phase 2) |
| R5: card-pool design and balance | 1, 4 |
| Section 6: +300 / +200 / +500, lower if one theme dominates | 1 (settings), 4 (runs) |
| Section 6: themed deck against the highest-ATK deck; comebacks | 4 |
| Goal 1 and the smart bot reading synergy | 3 |

## Not in this plan

- R6 face-down play: phase 5 (`2026-11-13-tactics-phase-5-face-down.md`). Its rule "a face-down creature gives and receives no Banner or Pack bonus" is added there, in `effectiveStats`.
- Changing a default value or moving a trait. Task 4 recommends; the owner decides.
- The greedy and wide bots stay "tall" and "wide" baselines that ignore synergy.

## Revisions

### 2026-11-13

- Written at the owner's request with phases 2, 3 and 5, so all tactics rules are done before plans 2 and 3.
- Issues (milestone "Tactics phase 4: Synergy"): task 1 is #64, task 2 #65, task 3 #66, task 4 #67. Read `#N` in a task as that task's issue. Implement on one branch per phase, one commit per task.
