# Rules Engine and Bots Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GUI-independent duel rules engine and a headless bot simulator, so complete matches can be play-tested from the command line before any server or screen exists.

**Architecture:** A pnpm TypeScript workspace with two packages. `@duel/engine` holds the rules as pure functions over immutable state with seeded randomness. `@duel/bots` consumes only the engine's public API to run bot-vs-bot matches and print statistics.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-12-online-card-duel-design.md` (sections 3, 4, 5 and the engine and bot parts of 9).

**This is plan 1 of 3.** The spec covers three subsystems that each produce working software on their own:

| Plan | Covers | Status |
|---|---|---|
| 1 (this file) | `packages/engine`, `packages/bots` | ready |
| 2 | `packages/protocol`, `apps/server` (lobby, rooms, clock, reconnect): `docs/plans/2026-11-12-protocol-and-server.md` | ready, needs plan 1 |
| 3 | `apps/client` (React screens and duel board): `docs/plans/2026-11-12-browser-client.md` | ready, needs plans 1 and 2 |

If play-testing with the bots changes a rule or an engine type, update plans 2 and 3 before implementing them.

All code in this plan was run in a scratch workspace before the plan was written: 164 tests pass, `tsc` is clean, and the simulator runs (TypeScript 7.0.2, Vitest 5.1.0, tsx 4.23.15, pnpm 11.10.0, Node 22.22.0).

## Global Constraints

- Node 22, pnpm workspaces, TypeScript with `strict: true`.
- Package names are `@duel/engine` and `@duel/bots`.
- `packages/engine/src` imports only its own files (`./...`). No `Date`, timers, `Math.random`, DOM, network or `process` API. Task 11 adds a test that enforces this.
- `packages/bots` imports the engine only through `@duel/engine` (its `src/index.ts`), never through a deep path.
- All randomness comes from `createRng(seed)`. The same seed and the same actions must always give the same match.
- `applyAction` never changes the state it is given. Functions documented as "Mutates `draft`" are internal and are only called on a clone.
- The game is original. Never add a card name, creature, character, artwork or text taken from an existing game.
- Rule values, copied from the spec: deck of exactly 30 cards, at most 3 copies, hand of 5, 5 field slots, 4000 life points, element bonus +500, base ATK at most 1800, fusion-only ATK 1900 to 3000, stats in multiples of 100.
- Element ring: Flame → Forest → Wind → Earth → Thunder → Water → Flame (each beats the next).
- Imports inside a package are extensionless (`./types`), matching `moduleResolution: "Bundler"`.
- After every task, append one line to `HISTORY.md` and include it in the task's commit (see `CLAUDE.md`).
- Do not create `apps/` or `packages/protocol` in this plan.

## File Structure

```
package.json              root scripts: test, typecheck, sim
pnpm-workspace.yaml       workspace globs, esbuild build approval
tsconfig.json             one strict config for every package
vitest.config.ts          finds packages/*/test/**/*.test.ts
.gitignore
packages/engine/
  package.json
  src/types.ts            every shared type: Card, MatchState, Action, GameEvent, PlayerView
  src/rng.ts              seeded random numbers and shuffle
  src/rules.ts            rule constants, element ring, turn check
  src/cards.ts            the 60 cards, the fusion rule table, lookup
  src/deck.ts             deck validation
  src/fusion.ts           fuse a pair, fuse a chain
  src/match.ts            create a match, start a turn (draw, deck-out), end a match
  src/play.ts             PLAY: validation, materials, preview, resolution
  src/battle.ts           ATTACK: validation, battle maths, resolution
  src/actions.ts          applyAction dispatcher, SET_POSITION, END_TURN, SURRENDER, applyTimeout
  src/view.ts             per-player view with hidden information removed
  src/legal.ts            enumerate legal actions
  src/index.ts            the public API
  test/helpers.ts         builders for hand-made states
  test/*.test.ts          one test file per source file, plus property.test.ts
packages/bots/
  package.json
  src/types.ts            the Bot interface
  src/random.ts           random bot
  src/greedy.ts           greedy bot
  src/runMatch.ts         headless match loop
  src/stats.ts            summary statistics and their text format
  src/replay.ts           event log as text
  src/index.ts            public API and the bot registry
  src/cli.ts              `pnpm sim`
  test/*.test.ts
```

---

### Task 1: Workspace, shared types, seeded randomness, rule constants

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/engine/package.json`
- Create: `packages/engine/src/types.ts`, `packages/engine/src/rng.ts`, `packages/engine/src/rules.ts`
- Test: `packages/engine/test/rng.test.ts`, `packages/engine/test/rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Commands `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.
  - From `types.ts`: `ELEMENTS`, `Element`, `TAGS`, `Tag`, `CardId`, `Card`, `FusionRule`, `PlayerId` (`0 | 1`), `Position`, `Creature`, `PlayerState`, `EndReason`, `MatchResult`, `MatchState`, `PlayAction`, `SetPositionAction`, `AttackAction`, `EndTurnAction`, `SurrenderAction`, `Action`, `GameEvent`, `ApplyResult`, `PlayerView`.
  - From `rng.ts`: `type Rng = { next(): number; int(n: number): number }`, `createRng(seed: number): Rng`, `shuffle<T>(items: readonly T[], rng: Rng): T[]`.
  - From `rules.ts`: `DECK_SIZE = 30`, `MAX_COPIES = 3`, `HAND_SIZE = 5`, `FIELD_SLOTS = 5`, `STARTING_LIFE = 4000`, `ELEMENT_BONUS = 500`, `beats(a: Element, b: Element): boolean`, `opponent(player: PlayerId): PlayerId`, `turnError(state: MatchState, player: PlayerId): string | null` (returns `"match is over"`, `"not your turn"`, or `null`).

- [ ] **Step 1: Create the workspace files**

`package.json`

```json
{
  "name": "card-duel",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "apps/*"
allowBuilds:
  esbuild: true
```

`allowBuilds` lets pnpm run esbuild's install script, which Vitest and tsx need. The `apps/*` glob is for plans 2 and 3; it is harmless while the folder does not exist.

`tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["packages/*/src", "packages/*/test"]
}
```

`vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
  },
});
```

`.gitignore`

```gitignore
node_modules/
dist/
*.log
```

`packages/engine/package.json`

```json
{
  "name": "@duel/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts"
}
```

- [ ] **Step 2: Install the tools**

Run: `pnpm add -D -w typescript vitest tsx @types/node`
Expected: the four packages are added to `devDependencies` in the root `package.json`, and `pnpm-lock.yaml` and `node_modules/` appear. If pnpm prints `Ignored build scripts: esbuild`, check `allowBuilds` in `pnpm-workspace.yaml` and run `pnpm install` again.

- [ ] **Step 3: Write the shared types**

Types have no behaviour, so they have no test of their own; the typecheck and every later test exercise them.

`packages/engine/src/types.ts`

```ts
export const ELEMENTS = ["flame", "forest", "wind", "earth", "thunder", "water"] as const;
export type Element = (typeof ELEMENTS)[number];

export const TAGS = ["beast", "dragon", "warrior", "mage", "plant", "machine", "aqua", "bird"] as const;
export type Tag = (typeof TAGS)[number];

export type CardId = string;

export type Card = {
  id: CardId;
  name: string;
  element: Element;
  tags: Tag[];
  atk: number;
  def: number;
  /** true: reachable only by fusion, never legal in a deck */
  fusionOnly: boolean;
};

export type FusionRule = { a: Tag; b: Tag; results: CardId[] };

export type PlayerId = 0 | 1;
export type Position = "attack" | "defense";

export type Creature = {
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  positionChanged: boolean;
};

export type PlayerState = {
  /** top of the deck is index 0 */
  deck: CardId[];
  hand: CardId[];
  /** always FIELD_SLOTS entries; null is an empty slot */
  field: (Creature | null)[];
  lifePoints: number;
};

export type EndReason = "life-points" | "deck-out" | "surrender" | "timeout";
export type MatchResult = { winner: PlayerId; reason: EndReason };

export type MatchState = {
  players: [PlayerState, PlayerState];
  active: PlayerId;
  firstPlayer: PlayerId;
  /** 1 on the first turn of the match, +1 on every END_TURN */
  turn: number;
  /** whether the active player has used their PLAY this turn */
  hasPlayed: boolean;
  result: MatchResult | null;
};

export type PlayAction = { type: "PLAY"; handIndexes: number[]; slot: number; position: Position };
export type SetPositionAction = { type: "SET_POSITION"; slot: number; position: Position };
export type AttackAction = { type: "ATTACK"; attackerSlot: number; target: number | "direct" };
export type EndTurnAction = { type: "END_TURN" };
export type SurrenderAction = { type: "SURRENDER" };
export type Action = PlayAction | SetPositionAction | AttackAction | EndTurnAction | SurrenderAction;

export type GameEvent =
  | { type: "drew"; player: PlayerId; count: number }
  | { type: "fused"; player: PlayerId; a: CardId; b: CardId; result: CardId }
  | { type: "fusion-failed"; player: PlayerId; a: CardId; b: CardId }
  | { type: "played"; player: PlayerId; slot: number; cardId: CardId; position: Position }
  | { type: "position-set"; player: PlayerId; slot: number; position: Position }
  | { type: "attacked"; player: PlayerId; attackerSlot: number; target: number | "direct" }
  | { type: "destroyed"; player: PlayerId; slot: number; cardId: CardId }
  | { type: "damage"; player: PlayerId; amount: number }
  | { type: "turn-ended"; player: PlayerId }
  | { type: "match-ended"; winner: PlayerId; reason: EndReason };

export type ApplyResult =
  | { ok: true; state: MatchState; events: GameEvent[] }
  | { ok: false; error: string };

export type PlayerView = {
  you: PlayerId;
  active: PlayerId;
  firstPlayer: PlayerId;
  turn: number;
  hasPlayed: boolean;
  result: MatchResult | null;
  self: { hand: CardId[]; deckCount: number; field: (Creature | null)[]; lifePoints: number };
  opponent: { handCount: number; deckCount: number; field: (Creature | null)[]; lifePoints: number };
};
```

- [ ] **Step 4: Write the failing tests**

`packages/engine/test/rng.test.ts`

```ts
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
```

`packages/engine/test/rules.test.ts`

```ts
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
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/rng.test.ts packages/engine/test/rules.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/rng` and `../src/rules`.

- [ ] **Step 6: Write the implementation**

`packages/engine/src/rng.ts`

```ts
export type Rng = {
  /** float in [0, 1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
};

/** mulberry32: small, fast, deterministic. Same seed, same sequence. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}

/** Fisher-Yates. Returns a new array; the input is not changed. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
```

`packages/engine/src/rules.ts`

```ts
import type { Element, MatchState, PlayerId } from "./types";

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;
export const HAND_SIZE = 5;
export const FIELD_SLOTS = 5;
export const STARTING_LIFE = 4000;
export const ELEMENT_BONUS = 500;

/** Each element beats the one after it; the last beats the first. */
const RING: Element[] = ["flame", "forest", "wind", "earth", "thunder", "water"];

export function beats(a: Element, b: Element): boolean {
  return RING[(RING.indexOf(a) + 1) % RING.length] === b;
}

export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Why `player` may not act right now, or null if they may. */
export function turnError(state: MatchState, player: PlayerId): string | null {
  if (state.result) return "match is over";
  if (state.active !== player) return "not your turn";
  return null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/rng.test.ts packages/engine/test/rules.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: no output.

- [ ] **Step 9: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Set up the pnpm workspace; added engine types, seeded RNG and rule constants (plan 1, task 1).
```

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts .gitignore packages/engine HISTORY.md
git commit -m "feat(engine): workspace, shared types, seeded rng, rule constants"
```

### Task 2: Card pool and fusion rule table

**Files:**
- Create: `packages/engine/src/cards.ts`
- Test: `packages/engine/test/cards.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardId`, `Element`, `FusionRule`, `Tag`, `ELEMENTS`, `TAGS` from `types.ts`.
- Produces: `CARDS: readonly Card[]` (40 base then 20 fusion-only), `FUSION_RULES: readonly FusionRule[]`, `findCard(id: CardId): Card | undefined`, `getCard(id: CardId): Card` (throws `unknown card id: <id>`). Later tests rely on these exact cards: `ember-fox` (flame beast 1200/800), `ash-duelist` (flame warrior 1500/1100), `cinder-whelp` (flame dragon 1400/1000), `furnace-drone` (flame machine 1100/1500), `pearl-clam` (water aqua 400/1800), `moss-boar` (forest beast 1300/1300), `mist-oracle` (water mage 1200/1400), `burrow-drake` (earth dragon 1500/1400), `beast-rider` (fusion 1900), `dragon-knight` (fusion 2200), `ancient-tyrant` (fusion 3000).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/cards.test.ts`

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/cards.test.ts`
Expected: FAIL. Vitest cannot resolve `cards` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/cards.ts`

```ts
import type { Card, CardId, Element, FusionRule, Tag } from "./types";

function card(
  id: CardId,
  name: string,
  element: Element,
  tags: Tag[],
  atk: number,
  def: number,
  fusionOnly = false,
): Card {
  return { id, name, element, tags, atk, def, fusionOnly };
}

const BASE: Card[] = [
  card("ember-fox", "Ember Fox", "flame", ["beast"], 1200, 800),
  card("cinder-whelp", "Cinder Whelp", "flame", ["dragon"], 1400, 1000),
  card("ash-duelist", "Ash Duelist", "flame", ["warrior"], 1500, 1100),
  card("pyre-adept", "Pyre Adept", "flame", ["mage"], 1300, 1200),
  card("furnace-drone", "Furnace Drone", "flame", ["machine"], 1100, 1500),
  card("flare-hawk", "Flare Hawk", "flame", ["bird"], 1000, 700),

  card("moss-boar", "Moss Boar", "forest", ["beast"], 1300, 1300),
  card("thorn-sprite", "Thorn Sprite", "forest", ["plant"], 900, 1100),
  card("vine-archer", "Vine Archer", "forest", ["warrior", "plant"], 1400, 900),
  card("grove-sage", "Grove Sage", "forest", ["mage"], 1200, 1600),
  card("bramble-wyrm", "Bramble Wyrm", "forest", ["dragon", "plant"], 1600, 1200),
  card("seedling", "Seedling", "forest", ["plant"], 600, 900),
  card("canopy-owl", "Canopy Owl", "forest", ["bird"], 1100, 1200),

  card("gale-falcon", "Gale Falcon", "wind", ["bird"], 1500, 800),
  card("zephyr-monk", "Zephyr Monk", "wind", ["warrior"], 1300, 1400),
  card("cloud-serpent", "Cloud Serpent", "wind", ["dragon"], 1700, 1000),
  card("breeze-wisp", "Breeze Wisp", "wind", ["mage"], 800, 800),
  card("kite-glider", "Kite Glider", "wind", ["machine", "bird"], 1200, 1000),
  card("dust-jackal", "Dust Jackal", "wind", ["beast"], 1100, 900),
  card("storm-crow", "Storm Crow", "wind", ["bird"], 1300, 900),

  card("stone-ram", "Stone Ram", "earth", ["beast"], 1400, 1500),
  card("clay-sentinel", "Clay Sentinel", "earth", ["warrior"], 1000, 1800),
  card("quarry-golem", "Quarry Golem", "earth", ["machine"], 1600, 1700),
  card("root-shaman", "Root Shaman", "earth", ["mage", "plant"], 1100, 1300),
  card("burrow-drake", "Burrow Drake", "earth", ["dragon"], 1500, 1400),
  card("pebble-tortoise", "Pebble Tortoise", "earth", ["beast"], 500, 1700),
  card("iron-digger", "Iron Digger", "earth", ["machine"], 1300, 1400),

  card("spark-ferret", "Spark Ferret", "thunder", ["beast"], 1000, 600),
  card("volt-lancer", "Volt Lancer", "thunder", ["warrior"], 1600, 900),
  card("storm-caller", "Storm Caller", "thunder", ["mage"], 1500, 1000),
  card("tesla-turret", "Tesla Turret", "thunder", ["machine"], 1400, 1600),
  card("thunder-roc", "Thunder Roc", "thunder", ["bird"], 1700, 1100),
  card("static-drakeling", "Static Drakeling", "thunder", ["dragon"], 1300, 900),

  card("tide-otter", "Tide Otter", "water", ["beast", "aqua"], 1100, 1000),
  card("reef-guard", "Reef Guard", "water", ["warrior", "aqua"], 1300, 1500),
  card("brine-serpent", "Brine Serpent", "water", ["dragon", "aqua"], 1600, 1300),
  card("mist-oracle", "Mist Oracle", "water", ["mage"], 1200, 1400),
  card("kelp-lurker", "Kelp Lurker", "water", ["plant", "aqua"], 1000, 1500),
  card("harbor-gull", "Harbor Gull", "water", ["bird"], 900, 800),
  card("pearl-clam", "Pearl Clam", "water", ["aqua"], 400, 1800),
];

const FUSIONS: Card[] = [
  card("beast-rider", "Beast Rider", "earth", ["beast", "warrior"], 1900, 1500, true),
  card("briar-stag", "Briar Stag", "forest", ["beast", "plant"], 1900, 1700, true),
  card("sky-lancer", "Sky Lancer", "wind", ["bird", "warrior"], 1900, 1400, true),
  card("twin-fang-chimera", "Twin-Fang Chimera", "flame", ["beast"], 2000, 1600, true),
  card("bloom-witch", "Bloom Witch", "forest", ["mage", "plant"], 2000, 1800, true),
  card("tide-sorcerer", "Tide Sorcerer", "water", ["mage", "aqua"], 2000, 1900, true),
  card("griffin", "Griffin", "wind", ["bird", "beast"], 2100, 1700, true),
  card("iron-vanguard", "Iron Vanguard", "earth", ["machine", "warrior"], 2100, 2200, true),
  card("storm-archmage", "Storm Archmage", "thunder", ["mage"], 2100, 2000, true),
  card("dragon-knight", "Dragon Knight", "flame", ["dragon", "warrior"], 2200, 1800, true),
  card("storm-phoenix", "Storm Phoenix", "thunder", ["bird"], 2200, 1600, true),
  card("rune-automaton", "Rune Automaton", "earth", ["machine", "mage"], 2200, 2300, true),
  card("tidal-behemoth", "Tidal Behemoth", "water", ["beast", "aqua"], 2300, 2100, true),
  card("elder-treant", "Elder Treant", "forest", ["plant"], 2300, 2500, true),
  card("arcane-wyvern", "Arcane Wyvern", "wind", ["dragon", "mage"], 2400, 1900, true),
  card("steel-wyrm", "Steel Wyrm", "thunder", ["dragon", "machine"], 2400, 2400, true),
  card("thorn-hydra", "Thorn Hydra", "forest", ["dragon", "plant"], 2500, 2000, true),
  card("siege-colossus", "Siege Colossus", "earth", ["machine"], 2600, 2600, true),
  card("abyss-leviathan", "Abyss Leviathan", "water", ["dragon", "aqua"], 2700, 2300, true),
  card("ancient-tyrant", "Ancient Tyrant", "flame", ["dragon"], 3000, 2500, true),
];

export const CARDS: readonly Card[] = [...BASE, ...FUSIONS];

export const FUSION_RULES: readonly FusionRule[] = [
  { a: "beast", b: "warrior", results: ["beast-rider"] },
  { a: "beast", b: "plant", results: ["briar-stag"] },
  { a: "bird", b: "warrior", results: ["sky-lancer"] },
  { a: "beast", b: "beast", results: ["twin-fang-chimera"] },
  { a: "mage", b: "plant", results: ["bloom-witch"] },
  { a: "aqua", b: "mage", results: ["tide-sorcerer"] },
  { a: "beast", b: "bird", results: ["griffin"] },
  { a: "machine", b: "warrior", results: ["iron-vanguard"] },
  { a: "mage", b: "mage", results: ["storm-archmage"] },
  { a: "dragon", b: "warrior", results: ["dragon-knight"] },
  { a: "bird", b: "bird", results: ["storm-phoenix"] },
  { a: "machine", b: "mage", results: ["rune-automaton"] },
  { a: "aqua", b: "beast", results: ["tidal-behemoth"] },
  { a: "plant", b: "plant", results: ["elder-treant"] },
  { a: "dragon", b: "mage", results: ["arcane-wyvern"] },
  { a: "dragon", b: "machine", results: ["steel-wyrm"] },
  { a: "dragon", b: "plant", results: ["thorn-hydra"] },
  { a: "machine", b: "machine", results: ["siege-colossus"] },
  { a: "aqua", b: "dragon", results: ["abyss-leviathan"] },
  { a: "dragon", b: "dragon", results: ["ancient-tyrant"] },
];

const BY_ID = new Map<CardId, Card>(CARDS.map((c) => [c.id, c]));

export function findCard(id: CardId): Card | undefined {
  return BY_ID.get(id);
}

/** Use when the id is known to be valid; throws on a programming error. */
export function getCard(id: CardId): Card {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown card id: ${id}`);
  return found;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/cards.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the 60-card pool and the fusion rule table (plan 1, task 2).
```

```bash
git add packages/engine/src/cards.ts packages/engine/test/cards.test.ts HISTORY.md
git commit -m "feat(engine): card pool and fusion rules"
```

### Task 3: Deck validation and test helpers

**Files:**
- Create: `packages/engine/src/deck.ts`
- Create: `packages/engine/test/helpers.ts` (test support)
- Test: `packages/engine/test/deck.test.ts`

**Interfaces:**
- Consumes: `findCard` from `cards.ts`; `DECK_SIZE`, `MAX_COPIES`, `FIELD_SLOTS`, `STARTING_LIFE` from `rules.ts`; `CARDS`.
- Produces: `type DeckCheck = { ok: true } | { ok: false; error: string }`, `validateDeck(cardIds: readonly CardId[]): DeckCheck`. Test helpers in `test/helpers.ts`, used by every later engine test: `sampleDeck(): CardId[]`, `creature(cardId, position = "attack"): Creature`, `field(slots?: Record<number, Creature>): (Creature | null)[]`, `player(overrides?): PlayerState`, `makeState(overrides?: Partial<MatchState without players> & { p0?: Partial<PlayerState>; p1?: Partial<PlayerState> }): MatchState` (defaults: player 0 active, turn 2, nothing played, no result).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/helpers.ts`

```ts
import { CARDS } from "../src/cards";
import { FIELD_SLOTS, STARTING_LIFE } from "../src/rules";
import type { CardId, Creature, MatchState, PlayerId, PlayerState, Position } from "../src/types";

/** A valid 30-card deck: 3 copies of each of the first 10 base cards. */
export function sampleDeck(): CardId[] {
  const base = CARDS.filter((c) => !c.fusionOnly).slice(0, 10);
  return base.flatMap((c) => [c.id, c.id, c.id]);
}

export function creature(cardId: CardId, position: Position = "attack"): Creature {
  return { cardId, position, hasAttacked: false, positionChanged: false };
}

/** A field of FIELD_SLOTS slots with the given creatures at the given slot numbers. */
export function field(slots: Record<number, Creature> = {}): (Creature | null)[] {
  return Array.from({ length: FIELD_SLOTS }, (_, i) => slots[i] ?? null);
}

export function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return { deck: sampleDeck(), hand: [], field: field(), lifePoints: STARTING_LIFE, ...overrides };
}

/** A hand-built state for rule tests. Defaults: player 0 to act, turn 2, nothing played. */
export function makeState(
  overrides: Partial<Omit<MatchState, "players">> & { p0?: Partial<PlayerState>; p1?: Partial<PlayerState> } = {},
): MatchState {
  const { p0, p1, ...rest } = overrides;
  // cloned so a test that mutates the state never changes arrays shared with other tests
  return structuredClone({
    players: [player(p0), player(p1)],
    active: 0 as PlayerId,
    firstPlayer: 0 as PlayerId,
    turn: 2,
    hasPlayed: false,
    result: null,
    ...rest,
  });
}
```

`packages/engine/test/deck.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { validateDeck } from "../src/deck";
import { sampleDeck } from "./helpers";

describe("validateDeck", () => {
  it("accepts 30 deck-legal cards with at most 3 copies each", () => {
    expect(validateDeck(sampleDeck())).toEqual({ ok: true });
  });

  it("rejects a deck that is too small", () => {
    expect(validateDeck(sampleDeck().slice(1))).toEqual({
      ok: false,
      error: "deck must have exactly 30 cards, got 29",
    });
  });

  it("rejects a deck that is too large", () => {
    expect(validateDeck([...sampleDeck(), "seedling"])).toEqual({
      ok: false,
      error: "deck must have exactly 30 cards, got 31",
    });
  });

  it("rejects an unknown card", () => {
    const deck = sampleDeck();
    deck[0] = "not-a-card";
    expect(validateDeck(deck)).toEqual({ ok: false, error: "unknown card: not-a-card" });
  });

  it("rejects a fusion-only card", () => {
    const deck = sampleDeck();
    deck[0] = "ancient-tyrant";
    expect(validateDeck(deck)).toEqual({
      ok: false,
      error: "fusion-only card not allowed in a deck: ancient-tyrant",
    });
  });

  it("rejects a fourth copy", () => {
    const deck = sampleDeck();
    deck[29] = deck[0]!;
    expect(validateDeck(deck)).toEqual({ ok: false, error: "more than 3 copies of ember-fox" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/deck.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/deck`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/deck.ts`

```ts
import { findCard } from "./cards";
import { DECK_SIZE, MAX_COPIES } from "./rules";
import type { CardId } from "./types";

export type DeckCheck = { ok: true } | { ok: false; error: string };

export function validateDeck(cardIds: readonly CardId[]): DeckCheck {
  if (cardIds.length !== DECK_SIZE) {
    return { ok: false, error: `deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}` };
  }
  const copies = new Map<CardId, number>();
  for (const id of cardIds) {
    const card = findCard(id);
    if (!card) return { ok: false, error: `unknown card: ${id}` };
    if (card.fusionOnly) return { ok: false, error: `fusion-only card not allowed in a deck: ${id}` };
    const count = (copies.get(id) ?? 0) + 1;
    if (count > MAX_COPIES) return { ok: false, error: `more than ${MAX_COPIES} copies of ${id}` };
    copies.set(id, count);
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/deck.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added deck validation and the engine test helpers (plan 1, task 3).
```

```bash
git add packages/engine/src/deck.ts packages/engine/test/helpers.ts packages/engine/test/deck.test.ts HISTORY.md
git commit -m "feat(engine): deck validation and test helpers"
```

### Task 4: Fusion

**Files:**
- Create: `packages/engine/src/fusion.ts`
- Test: `packages/engine/test/fusion.test.ts`

**Interfaces:**
- Consumes: `FUSION_RULES`, `getCard` from `cards.ts`.
- Produces: `type FusionStep = { a: CardId; b: CardId; result: CardId; success: boolean }`, `fusePair(a: CardId, b: CardId): FusionStep`, `fuseChain(materials: readonly CardId[]): { result: CardId; steps: FusionStep[] }` (throws on an empty list).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/fusion.test.ts`

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/fusion.test.ts`
Expected: FAIL. Vitest cannot resolve `fusion` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/fusion.ts`

```ts
import { FUSION_RULES, getCard } from "./cards";
import type { Card, CardId } from "./types";

export type FusionStep = { a: CardId; b: CardId; result: CardId; success: boolean };

function matches(rule: { a: string; b: string }, x: Card, y: Card): boolean {
  const has = (card: Card, tag: string) => (card.tags as string[]).includes(tag);
  return (has(x, rule.a) && has(y, rule.b)) || (has(x, rule.b) && has(y, rule.a));
}

/**
 * Fuse a pair. Success: the lowest-ATK result of any matching rule whose ATK is
 * strictly above both inputs (ties broken by id). Failure: b stands, a is lost.
 */
export function fusePair(a: CardId, b: CardId): FusionStep {
  const cardA = getCard(a);
  const cardB = getCard(b);
  const floor = Math.max(cardA.atk, cardB.atk);
  const candidates = FUSION_RULES.filter((rule) => matches(rule, cardA, cardB))
    .flatMap((rule) => rule.results)
    .map(getCard)
    .filter((c) => c.atk > floor)
    .sort((x, y) => x.atk - y.atk || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const best = candidates[0];
  return best ? { a, b, result: best.id, success: true } : { a, b, result: b, success: false };
}

/** Fuse materials left to right. One material means no steps and itself as the result. */
export function fuseChain(materials: readonly CardId[]): { result: CardId; steps: FusionStep[] } {
  if (materials.length === 0) throw new Error("fuseChain needs at least one material");
  const steps: FusionStep[] = [];
  let current = materials[0]!;
  for (const next of materials.slice(1)) {
    const step = fusePair(current, next);
    steps.push(step);
    current = step.result;
  }
  return { result: current, steps };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/fusion.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added fusion of pairs and chains (plan 1, task 4).
```

```bash
git add packages/engine/src/fusion.ts packages/engine/test/fusion.test.ts HISTORY.md
git commit -m "feat(engine): pair and chain fusion"
```

### Task 5: Match setup, drawing and deck-out

**Files:**
- Create: `packages/engine/src/match.ts`
- Test: `packages/engine/test/match.test.ts`

**Interfaces:**
- Consumes: `validateDeck`; `createRng`, `shuffle`; `FIELD_SLOTS`, `HAND_SIZE`, `STARTING_LIFE`, `opponent`; helpers `makeState`, `creature`, `field`, `sampleDeck`.
- Produces: `createMatch(deckA: readonly CardId[], deckB: readonly CardId[], seed: number): MatchState` (throws `invalid deck: <reason>`; the first player's opening draw produces no event), `startTurn(draft: MatchState, events: GameEvent[]): void` (mutates), `endMatch(draft: MatchState, winner: PlayerId, reason: EndReason, events: GameEvent[]): void` (mutates).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/match.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createMatch, startTurn } from "../src/match";
import type { GameEvent } from "../src/types";
import { creature, field, makeState, sampleDeck } from "./helpers";

describe("createMatch", () => {
  it("sets up life points, empty fields, and the first player's opening hand", () => {
    const state = createMatch(sampleDeck(), sampleDeck(), 1);
    const first = state.players[state.firstPlayer];
    const second = state.players[state.firstPlayer === 0 ? 1 : 0];
    expect(state.active).toBe(state.firstPlayer);
    expect(state.turn).toBe(1);
    expect(state.hasPlayed).toBe(false);
    expect(state.result).toBeNull();
    expect(first.hand).toHaveLength(5);
    expect(first.deck).toHaveLength(25);
    expect(second.hand).toHaveLength(0);
    expect(second.deck).toHaveLength(30);
    for (const p of state.players) {
      expect(p.lifePoints).toBe(4000);
      expect(p.field).toEqual([null, null, null, null, null]);
    }
  });

  it("shuffles: the deck order differs from the input but holds the same cards", () => {
    const deck = sampleDeck();
    const state = createMatch(deck, deck, 1);
    const p = state.players[0];
    const all = [...p.hand, ...p.deck];
    expect(all).not.toEqual(deck);
    expect([...all].sort()).toEqual([...deck].sort());
  });

  it("is deterministic for a seed", () => {
    expect(createMatch(sampleDeck(), sampleDeck(), 5)).toEqual(createMatch(sampleDeck(), sampleDeck(), 5));
  });

  it("lets either player go first depending on the seed", () => {
    const firsts = new Set(
      Array.from({ length: 20 }, (_, seed) => createMatch(sampleDeck(), sampleDeck(), seed).firstPlayer),
    );
    expect(firsts).toEqual(new Set([0, 1]));
  });

  it("throws on an invalid deck", () => {
    expect(() => createMatch(sampleDeck().slice(1), sampleDeck(), 1)).toThrow(
      "invalid deck: deck must have exactly 30 cards, got 29",
    );
  });
});

describe("startTurn", () => {
  it("draws only up to 5 cards", () => {
    const state = makeState({ p0: { hand: ["seedling", "seedling", "seedling"] } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[0].deck).toHaveLength(28);
    expect(events).toEqual([{ type: "drew", player: 0, count: 2 }]);
  });

  it("draws from the top of the deck in order", () => {
    const state = makeState({ p0: { hand: [], deck: ["a", "b", "c", "d", "e", "f"] } });
    startTurn(state, []);
    expect(state.players[0].hand).toEqual(["a", "b", "c", "d", "e"]);
    expect(state.players[0].deck).toEqual(["f"]);
  });

  it("draws nothing and emits no event when the hand is full", () => {
    const hand = ["seedling", "seedling", "seedling", "ember-fox", "ember-fox"];
    const state = makeState({ p0: { hand } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.players[0].deck).toHaveLength(30);
    expect(events).toEqual([]);
  });

  it("ends the match by deck-out when the deck cannot fill the hand", () => {
    const state = makeState({ p0: { hand: ["seedling"], deck: ["a", "b", "c"] } });
    const events: GameEvent[] = [];
    startTurn(state, events);
    expect(state.result).toEqual({ winner: 1, reason: "deck-out" });
    expect(events).toEqual([{ type: "match-ended", winner: 1, reason: "deck-out" }]);
    expect(state.players[0].hand).toEqual(["seedling"]);
  });

  it("does not lose with an empty deck when the hand is already full", () => {
    const hand = ["seedling", "seedling", "seedling", "ember-fox", "ember-fox"];
    const state = makeState({ p0: { hand, deck: [] } });
    startTurn(state, []);
    expect(state.result).toBeNull();
  });

  it("clears the per-turn flags of the active player", () => {
    const used = { ...creature("ember-fox"), hasAttacked: true, positionChanged: true };
    const state = makeState({ hasPlayed: true, p0: { field: field({ 0: used }) } });
    startTurn(state, []);
    expect(state.hasPlayed).toBe(false);
    expect(state.players[0].field[0]).toEqual(creature("ember-fox"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/match.test.ts`
Expected: FAIL. Vitest cannot resolve `match` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/match.ts`

```ts
import { validateDeck } from "./deck";
import { createRng, shuffle } from "./rng";
import { FIELD_SLOTS, HAND_SIZE, STARTING_LIFE, opponent } from "./rules";
import type { CardId, GameEvent, MatchState, PlayerId, PlayerState } from "./types";

function newPlayer(deck: CardId[]): PlayerState {
  return {
    deck,
    hand: [],
    field: Array.from({ length: FIELD_SLOTS }, () => null),
    lifePoints: STARTING_LIFE,
  };
}

/** Mutates `draft`: ends the match in favour of `winner`. */
export function endMatch(
  draft: MatchState,
  winner: PlayerId,
  reason: NonNullable<MatchState["result"]>["reason"],
  events: GameEvent[],
): void {
  draft.result = { winner, reason };
  events.push({ type: "match-ended", winner, reason });
}

/**
 * Mutates `draft`: begins the active player's turn. Clears per-turn flags and
 * draws up to HAND_SIZE. A deck that cannot supply the cards loses the match.
 */
export function startTurn(draft: MatchState, events: GameEvent[]): void {
  const player = draft.players[draft.active];
  draft.hasPlayed = false;
  for (const creature of player.field) {
    if (creature) {
      creature.hasAttacked = false;
      creature.positionChanged = false;
    }
  }
  const need = HAND_SIZE - player.hand.length;
  if (need > player.deck.length) {
    endMatch(draft, opponent(draft.active), "deck-out", events);
    return;
  }
  if (need > 0) {
    player.hand.push(...player.deck.splice(0, need));
    events.push({ type: "drew", player: draft.active, count: need });
  }
}

/** Shuffles both decks, picks who goes first, and starts the first turn. */
export function createMatch(deckA: readonly CardId[], deckB: readonly CardId[], seed: number): MatchState {
  for (const deck of [deckA, deckB]) {
    const check = validateDeck(deck);
    if (!check.ok) throw new Error(`invalid deck: ${check.error}`);
  }
  const rng = createRng(seed);
  const shuffledA = shuffle(deckA, rng);
  const shuffledB = shuffle(deckB, rng);
  const first: PlayerId = rng.int(2) === 0 ? 0 : 1;
  const state: MatchState = {
    players: [newPlayer(shuffledA), newPlayer(shuffledB)],
    active: first,
    firstPlayer: first,
    turn: 1,
    hasPlayed: false,
    result: null,
  };
  startTurn(state, []);
  return state;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/match.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added match creation, drawing and deck-out (plan 1, task 5).
```

```bash
git add packages/engine/src/match.ts packages/engine/test/match.test.ts HISTORY.md
git commit -m "feat(engine): match setup, drawing, deck-out"
```

### Task 6: Playing and fusing cards

**Files:**
- Create: `packages/engine/src/play.ts`
- Test: `packages/engine/test/play.test.ts`

**Interfaces:**
- Consumes: `getCard`; `fuseChain`; `FIELD_SLOTS`, `turnError`; helpers `makeState`, `creature`, `field`.
- Produces: `playShapeError(handSize: number, action: PlayAction): string | null`, `playMaterials(ownField: readonly (Creature | null)[], hand: readonly CardId[], action: PlayAction): CardId[]`, `playError(state, player, action: PlayAction): string | null`, `previewPlay(state, player, action: PlayAction): Card | { error: string }`, `resolvePlay(draft, player, action: PlayAction, events): void` (mutates; the caller checks `playError` first).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/play.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { playError, playMaterials, previewPlay, resolvePlay } from "../src/play";
import type { GameEvent, PlayAction } from "../src/types";
import { creature, field, makeState } from "./helpers";

const HAND = ["ember-fox", "ash-duelist", "cinder-whelp", "furnace-drone", "pearl-clam"];

function play(handIndexes: number[], slot = 0, position: PlayAction["position"] = "attack"): PlayAction {
  return { type: "PLAY", handIndexes, slot, position };
}

describe("playError", () => {
  const state = makeState({ p0: { hand: HAND } });

  it("accepts a legal play", () => {
    expect(playError(state, 0, play([0]))).toBeNull();
  });

  it("rejects the player who is not on turn", () => {
    expect(playError(state, 1, play([0]))).toBe("not your turn");
  });

  it("rejects a second play in the same turn", () => {
    expect(playError(makeState({ hasPlayed: true, p0: { hand: HAND } }), 0, play([0]))).toBe(
      "already played a card this turn",
    );
  });

  it("rejects a finished match", () => {
    const over = makeState({ result: { winner: 1, reason: "surrender" }, p0: { hand: HAND } });
    expect(playError(over, 0, play([0]))).toBe("match is over");
  });

  it.each([
    [play([0], -1), "invalid slot"],
    [play([0], 5), "invalid slot"],
    [play([0], 1.5), "invalid slot"],
    [play([]), "play at least one card"],
    [play([0, 0]), "duplicate hand index"],
    [play([5]), "invalid hand index"],
    [play([-1]), "invalid hand index"],
    [{ ...play([0]), position: "sideways" } as unknown as PlayAction, "invalid position"],
  ])("rejects a malformed play %#", (action, error) => {
    expect(playError(state, 0, action)).toBe(error);
  });
});

describe("playMaterials", () => {
  it("uses the hand cards in the chosen order for an empty slot", () => {
    expect(playMaterials(field(), HAND, play([2, 0]))).toEqual(["cinder-whelp", "ember-fox"]);
  });

  it("puts the creature already in the slot first", () => {
    expect(playMaterials(field({ 3: creature("moss-boar") }), HAND, play([1], 3))).toEqual([
      "moss-boar",
      "ash-duelist",
    ]);
  });
});

describe("previewPlay", () => {
  const state = makeState({ p0: { hand: HAND } });

  it("returns the single card when one card is played", () => {
    expect(previewPlay(state, 0, play([0]))).toMatchObject({ id: "ember-fox" });
  });

  it("returns the fusion result", () => {
    expect(previewPlay(state, 0, play([0, 1]))).toMatchObject({ id: "beast-rider", atk: 1900 });
  });

  it("returns an error for an illegal play and never changes the state", () => {
    const before = structuredClone(state);
    expect(previewPlay(state, 0, play([9]))).toEqual({ error: "invalid hand index" });
    previewPlay(state, 0, play([0, 1]));
    expect(state).toEqual(before);
  });
});

describe("resolvePlay", () => {
  it("moves one card from hand to the slot", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([1], 2, "defense"), events);
    expect(state.players[0].hand).toEqual(["ember-fox", "cinder-whelp", "furnace-drone", "pearl-clam"]);
    expect(state.players[0].field[2]).toEqual(creature("ash-duelist", "defense"));
    expect(state.hasPlayed).toBe(true);
    expect(events).toEqual([{ type: "played", player: 0, slot: 2, cardId: "ash-duelist", position: "defense" }]);
  });

  it("fuses several hand cards and removes all of them from the hand", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([0, 1, 2]), events);
    expect(state.players[0].hand).toEqual(["furnace-drone", "pearl-clam"]);
    expect(state.players[0].field[0]).toEqual(creature("dragon-knight"));
    expect(events).toEqual([
      { type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" },
      { type: "fused", player: 0, a: "beast-rider", b: "cinder-whelp", result: "dragon-knight" },
      { type: "played", player: 0, slot: 0, cardId: "dragon-knight", position: "attack" },
    ]);
  });

  it("respects the chosen order, not the hand order", () => {
    const state = makeState({ p0: { hand: HAND } });
    // clam then drone: no rule, so the later card (drone) stands
    resolvePlay(state, 0, play([4, 3]), []);
    expect(state.players[0].field[0]?.cardId).toBe("furnace-drone");
    expect(state.players[0].hand).toEqual(["ember-fox", "ash-duelist", "cinder-whelp"]);
  });

  it("reports a failed fusion", () => {
    const state = makeState({ p0: { hand: HAND } });
    const events: GameEvent[] = [];
    resolvePlay(state, 0, play([3, 4]), events);
    expect(events[0]).toEqual({ type: "fusion-failed", player: 0, a: "furnace-drone", b: "pearl-clam" });
    expect(state.players[0].field[0]?.cardId).toBe("pearl-clam");
  });

  it("fuses onto a creature already in the slot", () => {
    const state = makeState({ p0: { hand: HAND, field: field({ 1: creature("moss-boar", "defense") }) } });
    resolvePlay(state, 0, play([1], 1, "attack"), []);
    expect(state.players[0].field[1]).toEqual(creature("beast-rider", "attack"));
  });

  it("replaces the creature in the slot when the fusion fails", () => {
    const state = makeState({ p0: { hand: HAND, field: field({ 1: creature("pearl-clam") }) } });
    resolvePlay(state, 0, play([3], 1), []);
    expect(state.players[0].field[1]?.cardId).toBe("furnace-drone");
  });

  it("keeps hasAttacked when fusing onto a creature that already attacked", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const state = makeState({ p0: { hand: HAND, field: field({ 1: attacked }) } });
    resolvePlay(state, 0, play([1], 1), []);
    expect(state.players[0].field[1]?.hasAttacked).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/play.test.ts`
Expected: FAIL. Vitest cannot resolve `play` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/play.ts`

```ts
import { getCard } from "./cards";
import { fuseChain } from "./fusion";
import { FIELD_SLOTS, turnError } from "./rules";
import type { Card, CardId, Creature, GameEvent, MatchState, PlayAction, PlayerId } from "./types";

/** Why this PLAY is illegal for a player holding `hand`, or null if it is legal. */
export function playShapeError(handSize: number, action: PlayAction): string | null {
  const { handIndexes, slot, position } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SLOTS) return "invalid slot";
  if (position !== "attack" && position !== "defense") return "invalid position";
  if (handIndexes.length === 0) return "play at least one card";
  if (new Set(handIndexes).size !== handIndexes.length) return "duplicate hand index";
  for (const index of handIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= handSize) return "invalid hand index";
  }
  return null;
}

/**
 * The fusion materials of a PLAY, in order: the creature already in the slot
 * (if any), then the chosen hand cards. Works on a view as well as a state.
 */
export function playMaterials(
  ownField: readonly (Creature | null)[],
  hand: readonly CardId[],
  action: PlayAction,
): CardId[] {
  const onField = ownField[action.slot];
  const fromHand = action.handIndexes.map((index) => hand[index]!);
  return onField ? [onField.cardId, ...fromHand] : fromHand;
}

export function playError(state: MatchState, player: PlayerId, action: PlayAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (state.hasPlayed) return "already played a card this turn";
  return playShapeError(state.players[player].hand.length, action);
}

/** The card a PLAY would put on the field, without changing anything. */
export function previewPlay(state: MatchState, player: PlayerId, action: PlayAction): Card | { error: string } {
  const error = playError(state, player, action);
  if (error) return { error };
  const me = state.players[player];
  return getCard(fuseChain(playMaterials(me.field, me.hand, action)).result);
}

/** Mutates `draft`. The caller must have checked playError first. */
export function resolvePlay(draft: MatchState, player: PlayerId, action: PlayAction, events: GameEvent[]): void {
  const me = draft.players[player];
  const previous = me.field[action.slot] ?? null;
  const chain = fuseChain(playMaterials(me.field, me.hand, action));

  // remove from the highest index down so earlier indexes stay valid
  for (const index of [...action.handIndexes].sort((x, y) => y - x)) me.hand.splice(index, 1);

  for (const step of chain.steps) {
    events.push(
      step.success
        ? { type: "fused", player, a: step.a, b: step.b, result: step.result }
        : { type: "fusion-failed", player, a: step.a, b: step.b },
    );
  }

  me.field[action.slot] = {
    cardId: chain.result,
    position: action.position,
    // a creature that already attacked cannot attack again by being fused onto
    hasAttacked: previous?.hasAttacked ?? false,
    positionChanged: false,
  };
  draft.hasPlayed = true;
  events.push({ type: "played", player, slot: action.slot, cardId: chain.result, position: action.position });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/play.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the PLAY action with fusion onto the field and preview (plan 1, task 6).
```

```bash
git add packages/engine/src/play.ts packages/engine/test/play.test.ts HISTORY.md
git commit -m "feat(engine): play and fuse cards"
```

### Task 7: Battle

**Files:**
- Create: `packages/engine/src/battle.ts`
- Test: `packages/engine/test/battle.test.ts`

**Interfaces:**
- Consumes: `getCard`; `endMatch` from `match.ts`; `ELEMENT_BONUS`, `FIELD_SLOTS`, `beats`, `opponent`, `turnError`; helpers `makeState`, `creature`, `field`.
- Produces: `battleValues(attacker: Card, target: Card, targetPosition: Position): { attack: number; defense: number }`, `attackError(state, player, action: AttackAction): string | null`, `resolveAttack(draft, player, action: AttackAction, events): void` (mutates; the caller checks `attackError` first).

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/battle.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { attackError, battleValues, resolveAttack } from "../src/battle";
import { getCard } from "../src/cards";
import type { AttackAction, GameEvent, MatchState } from "../src/types";
import { creature, field, makeState } from "./helpers";

function attack(attackerSlot: number, target: number | "direct"): AttackAction {
  return { type: "ATTACK", attackerSlot, target };
}

/** Player 0 has `mine` in slot 0, player 1 has `theirs` in slot 0. */
function duel(mine: string, theirs: string, theirPosition: "attack" | "defense" = "attack"): MatchState {
  return makeState({
    p0: { field: field({ 0: creature(mine) }) },
    p1: { field: field({ 0: creature(theirs, theirPosition) }) },
  });
}

describe("battleValues", () => {
  it("uses plain ATK against ATK with no element advantage", () => {
    // flame vs flame
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "attack")).toEqual({ attack: 1500, defense: 1200 });
  });

  it("uses DEF for a target in defense position", () => {
    expect(battleValues(getCard("ash-duelist"), getCard("ember-fox"), "defense")).toEqual({ attack: 1500, defense: 800 });
  });

  it("gives the attacker +500 when its element beats the target's", () => {
    // flame beats forest
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack")).toEqual({ attack: 1700, defense: 1300 });
  });

  it("gives the target +500 when its element beats the attacker's", () => {
    // water beats flame
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "attack")).toEqual({ attack: 1200, defense: 1700 });
    expect(battleValues(getCard("ember-fox"), getCard("mist-oracle"), "defense")).toEqual({ attack: 1200, defense: 1900 });
  });
});

describe("attackError", () => {
  it("accepts an attack on an enemy creature", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 0, attack(0, 0))).toBeNull();
  });

  it("rejects attacks on the first turn of the match", () => {
    const state = { ...duel("ash-duelist", "ember-fox"), turn: 1 };
    expect(attackError(state, 0, attack(0, 0))).toBe("the first player cannot attack on the first turn");
  });

  it("allows the second player to attack on turn 2", () => {
    const state = makeState({
      active: 1,
      turn: 2,
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("ash-duelist") }) },
    });
    expect(attackError(state, 1, attack(0, 0))).toBeNull();
  });

  it("rejects the player who is not on turn", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 1, attack(0, 0))).toBe("not your turn");
  });

  it("rejects an empty or invalid attacker slot", () => {
    const state = duel("ash-duelist", "ember-fox");
    expect(attackError(state, 0, attack(1, 0))).toBe("no creature in that slot");
    expect(attackError(state, 0, attack(7, 0))).toBe("invalid attacker slot");
  });

  it("rejects an attacker in defense position", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist", "defense") }) },
      p1: { field: field({ 0: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("creature is in defense position");
  });

  it("rejects a creature that already attacked", () => {
    const state = makeState({
      p0: { field: field({ 0: { ...creature("ash-duelist"), hasAttacked: true } }) },
      p1: { field: field({ 0: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("creature already attacked this turn");
  });

  it("rejects an empty or invalid target slot", () => {
    const state = duel("ash-duelist", "ember-fox");
    expect(attackError(state, 0, attack(0, 3))).toBe("no creature in the target slot");
    expect(attackError(state, 0, attack(0, 9))).toBe("invalid target slot");
  });

  it("allows a direct attack only when the opponent's field is empty", () => {
    expect(attackError(duel("ash-duelist", "ember-fox"), 0, attack(0, "direct"))).toBe(
      "cannot attack directly while the opponent has creatures",
    );
    const open = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    expect(attackError(open, 0, attack(0, "direct"))).toBeNull();
  });
});

describe("resolveAttack against attack position", () => {
  it("destroys the weaker target and damages its owner by the difference", () => {
    const state = duel("ash-duelist", "ember-fox"); // 1500 vs 1200
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3700);
    expect(state.players[0].field[0]?.hasAttacked).toBe(true);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 1, slot: 0, cardId: "ember-fox" },
      { type: "damage", player: 1, amount: 300 },
    ]);
  });

  it("destroys the weaker attacker and damages the attacking player", () => {
    const state = duel("ember-fox", "ash-duelist"); // 1200 vs 1500
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(3700);
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("destroys both on equal values with no damage", () => {
    const state = duel("ash-duelist", "burrow-drake"); // flame 1500 vs earth 1500, no advantage
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(4000);
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("applies the element bonus before comparing", () => {
    const state = duel("ember-fox", "moss-boar"); // flame 1200+500 vs forest 1300
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3600);
  });
});

describe("resolveAttack against defense position", () => {
  it("destroys the target with no damage when ATK is higher", () => {
    const state = duel("ash-duelist", "ember-fox", "defense"); // 1500 vs DEF 800
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(4000);
  });

  it("damages the attacking player and destroys nothing when ATK is lower", () => {
    const state = duel("ember-fox", "furnace-drone", "defense"); // 1200 vs DEF 1500
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).not.toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(3700);
  });

  it("does nothing on equal values", () => {
    const state = duel("ash-duelist", "furnace-drone", "defense"); // 1500 vs DEF 1500
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]?.hasAttacked).toBe(true);
    expect(state.players[1].field[0]).not.toBeNull();
    expect(state.players[0].lifePoints).toBe(4000);
    expect(events).toEqual([{ type: "attacked", player: 0, attackerSlot: 0, target: 0 }]);
  });
});

describe("resolveAttack direct", () => {
  it("deals the attacker's ATK to the opponent", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    resolveAttack(state, 0, attack(0, "direct"), []);
    expect(state.players[1].lifePoints).toBe(2500);
  });

  it("ends the match when life points reach zero, never going negative", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) }, p1: { lifePoints: 1000 } });
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, "direct"), events);
    expect(state.players[1].lifePoints).toBe(0);
    expect(state.result).toEqual({ winner: 0, reason: "life-points" });
    expect(events.at(-1)).toEqual({ type: "match-ended", winner: 0, reason: "life-points" });
  });

  it("lets the attacking player lose by their own failed attack", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox") }), lifePoints: 300 },
      p1: { field: field({ 0: creature("ash-duelist") }) },
    });
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.result).toEqual({ winner: 1, reason: "life-points" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/battle.test.ts`
Expected: FAIL. Vitest cannot resolve `battle` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/battle.ts`

```ts
import { getCard } from "./cards";
import { endMatch } from "./match";
import { ELEMENT_BONUS, FIELD_SLOTS, beats, opponent, turnError } from "./rules";
import type { AttackAction, Card, GameEvent, MatchState, PlayerId, Position } from "./types";

/**
 * The two numbers a battle compares, element bonus included: the attacker's ATK
 * against the target's ATK (attack position) or DEF (defense position).
 */
export function battleValues(attacker: Card, target: Card, targetPosition: Position): { attack: number; defense: number } {
  const attack = attacker.atk + (beats(attacker.element, target.element) ? ELEMENT_BONUS : 0);
  const base = targetPosition === "attack" ? target.atk : target.def;
  const defense = base + (beats(target.element, attacker.element) ? ELEMENT_BONUS : 0);
  return { attack, defense };
}

export function attackError(state: MatchState, player: PlayerId, action: AttackAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (state.turn === 1) return "the first player cannot attack on the first turn";

  const { attackerSlot, target } = action;
  if (!Number.isInteger(attackerSlot) || attackerSlot < 0 || attackerSlot >= FIELD_SLOTS) return "invalid attacker slot";
  const attacker = state.players[player].field[attackerSlot];
  if (!attacker) return "no creature in that slot";
  if (attacker.position !== "attack") return "creature is in defense position";
  if (attacker.hasAttacked) return "creature already attacked this turn";

  const enemyField = state.players[opponent(player)].field;
  if (target === "direct") {
    return enemyField.some((c) => c !== null) ? "cannot attack directly while the opponent has creatures" : null;
  }
  if (!Number.isInteger(target) || target < 0 || target >= FIELD_SLOTS) return "invalid target slot";
  if (!enemyField[target]) return "no creature in the target slot";
  return null;
}

/** Mutates `draft`: lowers life points and ends the match at zero. */
function dealDamage(draft: MatchState, player: PlayerId, amount: number, events: GameEvent[]): void {
  const target = draft.players[player];
  target.lifePoints = Math.max(0, target.lifePoints - amount);
  events.push({ type: "damage", player, amount });
  if (target.lifePoints === 0) endMatch(draft, opponent(player), "life-points", events);
}

function destroy(draft: MatchState, player: PlayerId, slot: number, events: GameEvent[]): void {
  const creature = draft.players[player].field[slot];
  if (!creature) return;
  draft.players[player].field[slot] = null;
  events.push({ type: "destroyed", player, slot, cardId: creature.cardId });
}

/** Mutates `draft`. The caller must have checked attackError first. */
export function resolveAttack(draft: MatchState, player: PlayerId, action: AttackAction, events: GameEvent[]): void {
  const enemy = opponent(player);
  const attacker = draft.players[player].field[action.attackerSlot]!;
  attacker.hasAttacked = true;
  events.push({ type: "attacked", player, attackerSlot: action.attackerSlot, target: action.target });

  if (action.target === "direct") {
    dealDamage(draft, enemy, getCard(attacker.cardId).atk, events);
    return;
  }

  const target = draft.players[enemy].field[action.target]!;
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position);

  if (target.position === "attack") {
    if (attack > defense) {
      destroy(draft, enemy, action.target, events);
      dealDamage(draft, enemy, attack - defense, events);
    } else if (attack < defense) {
      destroy(draft, player, action.attackerSlot, events);
      dealDamage(draft, player, defense - attack, events);
    } else {
      destroy(draft, enemy, action.target, events);
      destroy(draft, player, action.attackerSlot, events);
    }
    return;
  }

  if (attack > defense) destroy(draft, enemy, action.target, events);
  else if (attack < defense) dealDamage(draft, player, defense - attack, events);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/battle.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the ATTACK action, element bonus and life-point win (plan 1, task 7).
```

```bash
git add packages/engine/src/battle.ts packages/engine/test/battle.test.ts HISTORY.md
git commit -m "feat(engine): battle resolution"
```

### Task 8: The action dispatcher

**Files:**
- Create: `packages/engine/src/actions.ts`
- Test: `packages/engine/test/actions.test.ts`

**Interfaces:**
- Consumes: `attackError`, `resolveAttack`; `endMatch`, `startTurn`; `playError`, `resolvePlay`; `FIELD_SLOTS`, `opponent`, `turnError`; helpers `makeState`, `creature`, `field`.
- Produces: `setPositionError(state, player, action: SetPositionAction): string | null`, `actionError(state: MatchState, player: PlayerId, action: Action): string | null`, `applyAction(state, player, action): ApplyResult`, `applyTimeout(state, player): { state: MatchState; events: GameEvent[] }`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/actions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyAction, applyTimeout } from "../src/actions";
import type { Action, MatchState } from "../src/types";
import { creature, field, makeState } from "./helpers";

const HAND = ["ember-fox", "ash-duelist", "cinder-whelp", "furnace-drone", "pearl-clam"];

function ok(state: MatchState, player: 0 | 1, action: Action) {
  const result = applyAction(state, player, action);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe("applyAction", () => {
  it("never changes the state it was given", () => {
    const state = makeState({ p0: { hand: HAND } });
    const before = structuredClone(state);
    ok(state, 0, { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
    ok(state, 0, { type: "END_TURN" });
    applyAction(state, 0, { type: "ATTACK", attackerSlot: 0, target: 0 });
    expect(state).toEqual(before);
  });

  it("returns an error and no state for an illegal action", () => {
    const state = makeState({ p0: { hand: HAND } });
    expect(applyAction(state, 1, { type: "END_TURN" })).toEqual({ ok: false, error: "not your turn" });
  });

  it("rejects an unknown action type", () => {
    const state = makeState();
    expect(applyAction(state, 0, { type: "DANCE" } as unknown as Action)).toEqual({
      ok: false,
      error: "unknown action",
    });
  });

  it("applies PLAY", () => {
    const state = makeState({ p0: { hand: HAND } });
    const result = ok(state, 0, { type: "PLAY", handIndexes: [0], slot: 4, position: "attack" });
    expect(result.state.players[0].field[4]?.cardId).toBe("ember-fox");
    expect(result.state.hasPlayed).toBe(true);
    expect(applyAction(result.state, 0, { type: "PLAY", handIndexes: [0], slot: 3, position: "attack" })).toEqual({
      ok: false,
      error: "already played a card this turn",
    });
  });

  it("applies ATTACK", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    const result = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" });
    expect(result.state.players[1].lifePoints).toBe(2500);
  });
});

describe("SET_POSITION", () => {
  const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
  const toDefense: Action = { type: "SET_POSITION", slot: 0, position: "defense" };

  it("changes the position and reports it", () => {
    const result = ok(state, 0, toDefense);
    expect(result.state.players[0].field[0]).toMatchObject({ position: "defense", positionChanged: true });
    expect(result.events).toEqual([{ type: "position-set", player: 0, slot: 0, position: "defense" }]);
  });

  it("allows only one change per creature per turn", () => {
    const once = ok(state, 0, toDefense).state;
    expect(applyAction(once, 0, { type: "SET_POSITION", slot: 0, position: "attack" })).toEqual({
      ok: false,
      error: "position already changed this turn",
    });
  });

  it("rejects a change after the creature attacked", () => {
    const attacked = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).state;
    expect(applyAction(attacked, 0, toDefense)).toEqual({ ok: false, error: "creature already attacked this turn" });
  });

  it("rejects the same position, an empty slot, and an invalid slot", () => {
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 0, position: "attack" })).toEqual({
      ok: false,
      error: "creature is already in that position",
    });
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 1, position: "defense" })).toEqual({
      ok: false,
      error: "no creature in that slot",
    });
    expect(applyAction(state, 0, { type: "SET_POSITION", slot: 8, position: "defense" })).toEqual({
      ok: false,
      error: "invalid slot",
    });
  });

  it("stops a creature moved to defense from attacking", () => {
    const defending = ok(state, 0, toDefense).state;
    expect(applyAction(defending, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toEqual({
      ok: false,
      error: "creature is in defense position",
    });
  });
});

describe("END_TURN", () => {
  it("passes the turn, counts it, and draws for the next player", () => {
    const state = makeState({ hasPlayed: true, p1: { hand: ["seedling"] } });
    const result = ok(state, 0, { type: "END_TURN" });
    expect(result.state.active).toBe(1);
    expect(result.state.turn).toBe(3);
    expect(result.state.hasPlayed).toBe(false);
    expect(result.state.players[1].hand).toHaveLength(5);
    expect(result.events).toEqual([
      { type: "turn-ended", player: 0 },
      { type: "drew", player: 1, count: 4 },
    ]);
  });

  it("lets a creature attack again on its owner's next turn", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) } });
    let next = ok(state, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).state;
    next = ok(next, 0, { type: "END_TURN" }).state;
    next = ok(next, 1, { type: "END_TURN" }).state;
    expect(applyAction(next, 0, { type: "ATTACK", attackerSlot: 0, target: "direct" }).ok).toBe(true);
  });

  it("ends the match by deck-out when the next player cannot draw", () => {
    const state = makeState({ p1: { hand: [], deck: ["seedling"] } });
    const result = ok(state, 0, { type: "END_TURN" });
    expect(result.state.result).toEqual({ winner: 0, reason: "deck-out" });
    expect(result.events.at(-1)).toEqual({ type: "match-ended", winner: 0, reason: "deck-out" });
  });
});

describe("SURRENDER", () => {
  it("is legal for the active player", () => {
    const result = ok(makeState(), 0, { type: "SURRENDER" });
    expect(result.state.result).toEqual({ winner: 1, reason: "surrender" });
    expect(result.events).toEqual([{ type: "match-ended", winner: 1, reason: "surrender" }]);
  });

  it("is legal for the player who is not on turn", () => {
    expect(ok(makeState(), 1, { type: "SURRENDER" }).state.result).toEqual({ winner: 0, reason: "surrender" });
  });
});

describe("a finished match", () => {
  const over = makeState({ result: { winner: 0, reason: "life-points" }, p0: { hand: HAND } });

  it.each<Action>([
    { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
    { type: "SET_POSITION", slot: 0, position: "defense" },
    { type: "ATTACK", attackerSlot: 0, target: "direct" },
    { type: "END_TURN" },
    { type: "SURRENDER" },
  ])("rejects $type", (action) => {
    expect(applyAction(over, 0, action)).toEqual({ ok: false, error: "match is over" });
  });
});

describe("applyTimeout", () => {
  it("makes the opponent of the flagged player win", () => {
    const state = makeState();
    const result = applyTimeout(state, 0);
    expect(result.state.result).toEqual({ winner: 1, reason: "timeout" });
    expect(result.events).toEqual([{ type: "match-ended", winner: 1, reason: "timeout" }]);
    expect(state.result).toBeNull();
  });

  it("leaves a finished match unchanged", () => {
    const over = makeState({ result: { winner: 0, reason: "life-points" } });
    expect(applyTimeout(over, 0)).toEqual({ state: over, events: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/actions.test.ts`
Expected: FAIL. Vitest cannot resolve `actions` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/actions.ts`

```ts
import { attackError, resolveAttack } from "./battle";
import { endMatch, startTurn } from "./match";
import { playError, resolvePlay } from "./play";
import { FIELD_SLOTS, opponent, turnError } from "./rules";
import type { Action, ApplyResult, GameEvent, MatchState, PlayerId, SetPositionAction } from "./types";

export function setPositionError(state: MatchState, player: PlayerId, action: SetPositionAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  const { slot, position } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot >= FIELD_SLOTS) return "invalid slot";
  if (position !== "attack" && position !== "defense") return "invalid position";
  const creature = state.players[player].field[slot];
  if (!creature) return "no creature in that slot";
  if (creature.hasAttacked) return "creature already attacked this turn";
  if (creature.positionChanged) return "position already changed this turn";
  if (creature.position === position) return "creature is already in that position";
  return null;
}

/** Why `action` is illegal for `player` right now, or null if it is legal. */
export function actionError(state: MatchState, player: PlayerId, action: Action): string | null {
  switch (action.type) {
    case "SURRENDER":
      return state.result ? "match is over" : null;
    case "END_TURN":
      return turnError(state, player);
    case "PLAY":
      return playError(state, player, action);
    case "SET_POSITION":
      return setPositionError(state, player, action);
    case "ATTACK":
      return attackError(state, player, action);
    default:
      return "unknown action";
  }
}

/**
 * The only way to advance a match. Never changes `state`: on success it returns
 * a new state plus the events that happened; on failure, the reason.
 */
export function applyAction(state: MatchState, player: PlayerId, action: Action): ApplyResult {
  const error = actionError(state, player, action);
  if (error) return { ok: false, error };

  const draft = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case "SURRENDER":
      endMatch(draft, opponent(player), "surrender", events);
      break;
    case "END_TURN":
      events.push({ type: "turn-ended", player });
      draft.active = opponent(player);
      draft.turn += 1;
      startTurn(draft, events);
      break;
    case "PLAY":
      resolvePlay(draft, player, action, events);
      break;
    case "SET_POSITION": {
      const creature = draft.players[player].field[action.slot]!;
      creature.position = action.position;
      creature.positionChanged = true;
      events.push({ type: "position-set", player, slot: action.slot, position: action.position });
      break;
    }
    case "ATTACK":
      resolveAttack(draft, player, action, events);
      break;
  }
  return { ok: true, state: draft, events };
}

/** Called by the server when `player`'s clock runs out. A finished match is returned unchanged. */
export function applyTimeout(state: MatchState, player: PlayerId): { state: MatchState; events: GameEvent[] } {
  if (state.result) return { state, events: [] };
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  endMatch(draft, opponent(player), "timeout", events);
  return { state: draft, events };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/actions.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added applyAction with SET_POSITION, END_TURN, SURRENDER and applyTimeout (plan 1, task 8).
```

```bash
git add packages/engine/src/actions.ts packages/engine/test/actions.test.ts HISTORY.md
git commit -m "feat(engine): applyAction, position changes, turn end, surrender, timeout"
```

### Task 9: Player views

**Files:**
- Create: `packages/engine/src/view.ts`
- Test: `packages/engine/test/view.test.ts`

**Interfaces:**
- Consumes: `opponent`; `MatchState`, `PlayerId`, `PlayerView`; helpers `makeState`, `creature`, `field`.
- Produces: `viewFor(state: MatchState, player: PlayerId): PlayerView`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/view.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { viewFor } from "../src/view";
import { creature, field, makeState } from "./helpers";

const state = makeState({
  active: 1,
  turn: 4,
  hasPlayed: true,
  p0: {
    hand: ["ember-fox", "ash-duelist"],
    deck: ["seedling", "moss-boar", "pearl-clam"],
    field: field({ 1: creature("cinder-whelp") }),
    lifePoints: 3200,
  },
  p1: {
    hand: ["mist-oracle", "storm-crow", "reef-guard"],
    deck: ["grove-sage", "harbor-gull"],
    field: field({ 0: creature("stone-ram", "defense") }),
    lifePoints: 1500,
  },
});

describe("viewFor", () => {
  it("shows a player their own hand and the public state", () => {
    expect(viewFor(state, 0)).toEqual({
      you: 0,
      active: 1,
      firstPlayer: 0,
      turn: 4,
      hasPlayed: true,
      result: null,
      self: {
        hand: ["ember-fox", "ash-duelist"],
        deckCount: 3,
        field: field({ 1: creature("cinder-whelp") }),
        lifePoints: 3200,
      },
      opponent: {
        handCount: 3,
        deckCount: 2,
        field: field({ 0: creature("stone-ram", "defense") }),
        lifePoints: 1500,
      },
    });
  });

  it("swaps sides for the other player", () => {
    const view = viewFor(state, 1);
    expect(view.you).toBe(1);
    expect(view.self.hand).toEqual(["mist-oracle", "storm-crow", "reef-guard"]);
    expect(view.opponent.handCount).toBe(2);
  });

  it("contains no card from the opponent's hand or from either deck", () => {
    const text = JSON.stringify(viewFor(state, 0));
    for (const hidden of ["mist-oracle", "storm-crow", "reef-guard", "grove-sage", "harbor-gull", "seedling", "moss-boar", "pearl-clam"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("shares no objects with the state", () => {
    const view = viewFor(state, 0);
    view.self.hand.push("seedling");
    view.self.field[1]!.position = "defense";
    view.opponent.field[0] = null;
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[0].field[1]?.position).toBe("attack");
    expect(state.players[1].field[0]).not.toBeNull();
  });

  it("includes the result once the match is over", () => {
    const over = makeState({ result: { winner: 1, reason: "timeout" } });
    expect(viewFor(over, 0).result).toEqual({ winner: 1, reason: "timeout" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/view.test.ts`
Expected: FAIL. Vitest cannot resolve `view` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/view.ts`

```ts
import { opponent } from "./rules";
import type { MatchState, PlayerId, PlayerView } from "./types";

/**
 * What `player` is allowed to know. The opponent's hand and both deck orders are
 * reduced to counts. The result shares nothing with `state`.
 */
export function viewFor(state: MatchState, player: PlayerId): PlayerView {
  const me = state.players[player];
  const them = state.players[opponent(player)];
  return structuredClone({
    you: player,
    active: state.active,
    firstPlayer: state.firstPlayer,
    turn: state.turn,
    hasPlayed: state.hasPlayed,
    result: state.result,
    self: { hand: me.hand, deckCount: me.deck.length, field: me.field, lifePoints: me.lifePoints },
    opponent: {
      handCount: them.hand.length,
      deckCount: them.deck.length,
      field: them.field,
      lifePoints: them.lifePoints,
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/view.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added viewFor, which hides the opponent's hand and both deck orders (plan 1, task 9).
```

```bash
git add packages/engine/src/view.ts packages/engine/test/view.test.ts HISTORY.md
git commit -m "feat(engine): per-player views without hidden information"
```

### Task 10: Legal action enumeration

**Files:**
- Create: `packages/engine/src/legal.ts`
- Test: `packages/engine/test/legal.test.ts`

**Interfaces:**
- Consumes: `actionError`, `applyAction` from `actions.ts`; `FIELD_SLOTS`; helpers `makeState`, `creature`, `field`.
- Produces: `orderedSelections(n: number): number[][]`, `legalActions(state: MatchState, player: PlayerId): Action[]`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/legal.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyAction } from "../src/actions";
import { legalActions, orderedSelections } from "../src/legal";
import type { Action } from "../src/types";
import { creature, field, makeState } from "./helpers";

const count = (actions: Action[], type: Action["type"]) => actions.filter((a) => a.type === type).length;

describe("orderedSelections", () => {
  it("lists subsets in every order", () => {
    expect(orderedSelections(0)).toEqual([]);
    expect(orderedSelections(1)).toEqual([[0]]);
    expect(orderedSelections(2)).toEqual([[0], [0, 1], [1], [1, 0]]);
  });

  it("gives 325 selections for a hand of 5", () => {
    // 5 + 20 + 60 + 120 + 120
    expect(orderedSelections(5)).toHaveLength(325);
  });
});

describe("legalActions", () => {
  it("is empty for the player who is not on turn", () => {
    expect(legalActions(makeState(), 1)).toEqual([]);
  });

  it("is empty when the match is over", () => {
    expect(legalActions(makeState({ result: { winner: 0, reason: "surrender" } }), 0)).toEqual([]);
  });

  it("never lists SURRENDER and always lists END_TURN", () => {
    const actions = legalActions(makeState({ p0: { hand: ["ember-fox"] } }), 0);
    expect(count(actions, "SURRENDER")).toBe(0);
    expect(count(actions, "END_TURN")).toBe(1);
  });

  it("lists every play: selections x 5 slots x 2 positions", () => {
    const one = legalActions(makeState({ p0: { hand: ["ember-fox"] } }), 0);
    expect(count(one, "PLAY")).toBe(10);
    const two = legalActions(makeState({ p0: { hand: ["ember-fox", "seedling"] } }), 0);
    expect(count(two, "PLAY")).toBe(40);
  });

  it("lists no play once a card was played this turn", () => {
    const actions = legalActions(makeState({ hasPlayed: true, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(actions, "PLAY")).toBe(0);
  });

  it("lists one position change per creature that may still change", () => {
    const state = makeState({
      p0: {
        field: field({
          0: creature("ember-fox"),
          1: { ...creature("moss-boar"), hasAttacked: true },
          2: { ...creature("seedling", "defense"), positionChanged: true },
          3: creature("pearl-clam", "defense"),
        }),
      },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "SET_POSITION")).toEqual([
      { type: "SET_POSITION", slot: 0, position: "defense" },
      { type: "SET_POSITION", slot: 3, position: "attack" },
    ]);
  });

  it("lists an attack on each enemy creature for each ready attacker", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox"), 1: creature("pearl-clam", "defense") }) },
      p1: { field: field({ 2: creature("moss-boar"), 4: creature("seedling", "defense") }) },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: 2 },
      { type: "ATTACK", attackerSlot: 0, target: 4 },
    ]);
  });

  it("lists only direct attacks when the opponent's field is empty", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ember-fox"), 3: creature("moss-boar") }) } });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: "direct" },
      { type: "ATTACK", attackerSlot: 3, target: "direct" },
    ]);
  });

  it("lists no attack on the first turn of the match", () => {
    const state = makeState({ turn: 1, p0: { field: field({ 0: creature("ember-fox") }) } });
    expect(count(legalActions(state, 0), "ATTACK")).toBe(0);
  });

  it("lists only actions that applyAction accepts", () => {
    const state = makeState({
      p0: { hand: ["ember-fox", "ash-duelist", "seedling"], field: field({ 0: creature("moss-boar") }) },
      p1: { field: field({ 1: creature("stone-ram") }) },
    });
    const actions = legalActions(state, 0);
    expect(actions.length).toBeGreaterThan(100);
    for (const action of actions) expect(applyAction(state, 0, action).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/legal.test.ts`
Expected: FAIL. Vitest cannot resolve `legal` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/legal.ts`

```ts
import { actionError } from "./actions";
import { FIELD_SLOTS } from "./rules";
import type { Action, MatchState, PlayerId, Position } from "./types";

const POSITIONS: Position[] = ["attack", "defense"];

/** Every non-empty ordered selection of the indexes 0..n-1 (subsets in every order). */
export function orderedSelections(n: number): number[][] {
  const out: number[][] = [];
  const extend = (chosen: number[]): void => {
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      const next = [...chosen, i];
      out.push(next);
      extend(next);
    }
  };
  extend([]);
  return out;
}

/**
 * Every action applyAction would accept from `player` right now, except
 * SURRENDER. Empty for the player who is not on turn and for a finished match.
 * Candidates are generated broadly and filtered through actionError, so this
 * list can never disagree with applyAction.
 */
export function legalActions(state: MatchState, player: PlayerId): Action[] {
  if (state.result || state.active !== player) return [];

  const candidates: Action[] = [];
  // skipping this when the play is used up is only a speed-up; the filter below would drop them anyway
  if (!state.hasPlayed) {
    for (const handIndexes of orderedSelections(state.players[player].hand.length)) {
      for (let slot = 0; slot < FIELD_SLOTS; slot++) {
        for (const position of POSITIONS) candidates.push({ type: "PLAY", handIndexes, slot, position });
      }
    }
  }
  for (let slot = 0; slot < FIELD_SLOTS; slot++) {
    for (const position of POSITIONS) candidates.push({ type: "SET_POSITION", slot, position });
  }
  for (let attackerSlot = 0; attackerSlot < FIELD_SLOTS; attackerSlot++) {
    candidates.push({ type: "ATTACK", attackerSlot, target: "direct" });
    for (let target = 0; target < FIELD_SLOTS; target++) {
      candidates.push({ type: "ATTACK", attackerSlot, target });
    }
  }
  candidates.push({ type: "END_TURN" });

  return candidates.filter((action) => actionError(state, player, action) === null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/legal.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added legalActions (plan 1, task 10).
```

```bash
git add packages/engine/src/legal.ts packages/engine/test/legal.test.ts HISTORY.md
git commit -m "feat(engine): legalActions"
```

### Task 11: Public API, random-match property test, independence check

**Files:**
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/test/property.test.ts`

**Interfaces:**
- Consumes: every engine source file from tasks 1 to 10.
- Produces: the `@duel/engine` public API, exactly the names exported by `src/index.ts`: all types, `createRng`, `shuffle`, `Rng`, the rule constants, `beats`, `opponent`, `CARDS`, `FUSION_RULES`, `findCard`, `getCard`, `validateDeck`, `DeckCheck`, `fuseChain`, `fusePair`, `FusionStep`, `createMatch`, `playMaterials`, `previewPlay`, `battleValues`, `actionError`, `applyAction`, `applyTimeout`, `viewFor`, `legalActions`. Internal draft-mutating functions (`startTurn`, `endMatch`, `resolvePlay`, `resolveAttack`) are deliberately not exported.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/property.test.ts`

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARDS,
  FIELD_SLOTS,
  HAND_SIZE,
  STARTING_LIFE,
  applyAction,
  createMatch,
  createRng,
  legalActions,
  validateDeck,
  type Action,
  type CardId,
  type MatchState,
  type Rng,
} from "../src/index";

const BASE = CARDS.filter((c) => !c.fusionOnly);

function randomDeck(rng: Rng): CardId[] {
  const deck: CardId[] = [];
  while (deck.length < 30) {
    const id = BASE[rng.int(BASE.length)]!.id;
    if (deck.filter((c) => c === id).length < 3) deck.push(id);
  }
  return deck;
}

function checkInvariants(state: MatchState): void {
  for (const p of state.players) {
    expect(p.lifePoints).toBeGreaterThanOrEqual(0);
    expect(p.lifePoints).toBeLessThanOrEqual(STARTING_LIFE);
    expect(p.hand.length).toBeLessThanOrEqual(HAND_SIZE);
    expect(p.field).toHaveLength(FIELD_SLOTS);
    const onField = p.field.filter((c) => c !== null).length;
    expect(p.deck.length + p.hand.length + onField).toBeLessThanOrEqual(30);
  }
}

/** Plays a whole match with uniformly random legal actions. */
function playRandomMatch(seed: number): { state: MatchState; actions: Action[] } {
  const rng = createRng(seed);
  let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
  const actions: Action[] = [];
  while (!state.result) {
    const legal = legalActions(state, state.active);
    expect(legal.length).toBeGreaterThan(0);
    const action = legal[rng.int(legal.length)]!;
    const result = applyAction(state, state.active, action);
    if (!result.ok) throw new Error(`legal action rejected: ${result.error} ${JSON.stringify(action)}`);
    state = result.state;
    actions.push(action);
    checkInvariants(state);
    if (actions.length > 5000) throw new Error(`match did not end (seed ${seed})`);
  }
  return { state, actions };
}

describe("random matches", () => {
  it("random decks are valid", () => {
    expect(validateDeck(randomDeck(createRng(1)))).toEqual({ ok: true });
  });

  it("200 random matches all end, keep their invariants, and never reject a legal action", () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = playRandomMatch(seed);
      reasons.add(state.result!.reason);
    }
    expect(reasons.has("deck-out") || reasons.has("life-points")).toBe(true);
  });

  it("replaying the same seed gives the same actions and the same final state", () => {
    expect(playRandomMatch(77)).toEqual(playRandomMatch(77));
  });
});

describe("engine independence", () => {
  const SRC = join(__dirname, "..", "src");
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts"));

  it("imports only its own files", () => {
    for (const file of files) {
      const source = readFileSync(join(SRC, file), "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        expect(match[1]!.startsWith("./"), `${file} imports ${match[1]}`).toBe(true);
      }
    }
  });

  it("uses no clock, timer, randomness, DOM or network API", () => {
    const banned = /\b(Date\b|setTimeout|setInterval|Math\.random|performance\.|window\.|document\.|fetch\(|WebSocket|process\.)/;
    for (const file of files) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect(banned.test(source), `${file} uses a banned API`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/property.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/index`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/index.ts`

```ts
export * from "./types";
export { createRng, shuffle, type Rng } from "./rng";
export {
  DECK_SIZE,
  ELEMENT_BONUS,
  FIELD_SLOTS,
  HAND_SIZE,
  MAX_COPIES,
  STARTING_LIFE,
  beats,
  opponent,
} from "./rules";
export { CARDS, FUSION_RULES, findCard, getCard } from "./cards";
export { validateDeck, type DeckCheck } from "./deck";
export { fuseChain, fusePair, type FusionStep } from "./fusion";
export { createMatch } from "./match";
export { playMaterials, previewPlay } from "./play";
export { battleValues } from "./battle";
export { actionError, applyAction, applyTimeout } from "./actions";
export { viewFor } from "./view";
export { legalActions } from "./legal";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/engine/test/property.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the engine's public API, a 200-match random property test and the independence check (plan 1, task 11).
```

```bash
git add packages/engine/src/index.ts packages/engine/test/property.test.ts HISTORY.md
git commit -m "feat(engine): public API, property test, independence check"
```

### Task 12: Bot interface, random bot, greedy bot

**Files:**
- Create: `packages/bots/package.json`
- Create: `packages/bots/src/types.ts`
- Create: `packages/bots/src/random.ts`
- Create: `packages/bots/src/greedy.ts`
- Test: `packages/bots/test/bots.test.ts`

**Interfaces:**
- Consumes: from `@duel/engine`: `CARDS`, `DECK_SIZE`, `MAX_COPIES`, `battleValues`, `fuseChain`, `getCard`, `playMaterials`, `createMatch`, `createRng`, `legalActions`, `validateDeck`, `viewFor`, and the types `Action`, `AttackAction`, `PlayAction`, `Card`, `CardId`, `PlayerView`, `Rng`, `MatchState`.
- Produces: `type Bot = { name: string; buildDeck(cards: readonly Card[], rng: Rng): CardId[]; chooseAction(view: PlayerView, legal: readonly Action[], rng: Rng): Action }`, `randomBot: Bot`, `greedyBot: Bot`, `playGain(view: PlayerView, action: PlayAction): number`, `isFavourable(view: PlayerView, action: AttackAction): boolean`.

- [ ] **Step 0: Create the package and link it**

`packages/bots/package.json`

```json
{
  "name": "@duel/bots",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@duel/engine": "workspace:*"
  }
}
```

Run: `pnpm install`
Expected: `Done`, and `packages/bots/node_modules/@duel/engine` exists as a link to `packages/engine`.

- [ ] **Step 1: Write the failing tests**

`packages/bots/test/bots.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  CARDS,
  createMatch,
  createRng,
  legalActions,
  validateDeck,
  viewFor,
  type Action,
  type MatchState,
  type PlayerView,
} from "@duel/engine";
import { greedyBot, isFavourable, playGain } from "../src/greedy";
import { randomBot } from "../src/random";

const EMPTY_FIELD = [null, null, null, null, null];

function view(overrides: { hand?: string[]; mine?: PlayerView["self"]["field"]; theirs?: PlayerView["opponent"]["field"] }): PlayerView {
  return {
    you: 0,
    active: 0,
    firstPlayer: 0,
    turn: 2,
    hasPlayed: false,
    result: null,
    self: { hand: overrides.hand ?? [], deckCount: 20, field: overrides.mine ?? EMPTY_FIELD, lifePoints: 4000 },
    opponent: { handCount: 5, deckCount: 20, field: overrides.theirs ?? EMPTY_FIELD, lifePoints: 4000 },
  };
}

const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  cardId,
  position,
  hasAttacked: false,
  positionChanged: false,
});

describe("randomBot", () => {
  it("builds a valid deck, differently for different seeds", () => {
    const a = randomBot.buildDeck(CARDS, createRng(1));
    const b = randomBot.buildDeck(CARDS, createRng(2));
    expect(validateDeck(a)).toEqual({ ok: true });
    expect(validateDeck(b)).toEqual({ ok: true });
    expect(a).not.toEqual(b);
  });

  it("chooses one of the legal actions, reproducibly", () => {
    const deck = randomBot.buildDeck(CARDS, createRng(1));
    const state: MatchState = createMatch(deck, deck, 1);
    const legal = legalActions(state, state.active);
    const first = randomBot.chooseAction(viewFor(state, state.active), legal, createRng(5));
    const again = randomBot.chooseAction(viewFor(state, state.active), legal, createRng(5));
    expect(legal).toContainEqual(first);
    expect(again).toEqual(first);
  });
});

describe("greedyBot deck", () => {
  it("is valid and made of the 10 strongest base cards, 3 copies each", () => {
    const deck = greedyBot.buildDeck(CARDS, createRng(1));
    expect(validateDeck(deck)).toEqual({ ok: true });
    expect(new Set(deck).size).toBe(10);
    expect(deck).toContain("cloud-serpent");
    expect(deck).not.toContain("seedling");
  });
});

describe("playGain", () => {
  it("is the result's ATK for an empty slot", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist"] });
    expect(playGain(v, { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" })).toBe(1500);
    expect(playGain(v, { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" })).toBe(1900);
  });

  it("subtracts the ATK of the creature being replaced", () => {
    const v = view({ hand: ["ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    // moss-boar (1300) + ash-duelist -> beast-rider (1900)
    expect(playGain(v, { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" })).toBe(600);
  });
});

describe("isFavourable", () => {
  it("is true for a direct attack and a winning battle", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    expect(isFavourable(v, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toBe(true);
    expect(isFavourable(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(true);
  });

  it("is false for a losing or drawn battle, element bonus included", () => {
    // ember-fox (flame 1200) into mist-oracle (water 1200, +500 against flame)
    const losing = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("mist-oracle"), null, null, null, null] });
    expect(isFavourable(losing, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(false);
    // ash-duelist 1500 into furnace-drone DEF 1500
    const drawn = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("furnace-drone", "defense"), null, null, null, null] });
    expect(isFavourable(drawn, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(false);
  });
});

describe("greedyBot.chooseAction", () => {
  const rng = createRng(1);

  it("plays the fusion with the largest ATK gain, in attack position", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist", "seedling"] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
  });

  it("uses fewer cards when the gain is equal", () => {
    // seedling then ash-duelist: no rule, ash-duelist stands -> same 1500 as playing it alone
    const v = view({ hand: ["seedling", "ash-duelist"] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "attack" });
  });

  it("attacks when favourable once it cannot play", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });
  });

  it("ends the turn rather than make a losing attack", () => {
    const v = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(greedyBot.chooseAction(v, legal, rng)).toEqual({ type: "END_TURN" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/bots/test/bots.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/greedy` and `../src/random`.

- [ ] **Step 3: Write the implementation**

`packages/bots/src/types.ts`

```ts
import type { Action, Card, CardId, PlayerView, Rng } from "@duel/engine";

export type Bot = {
  name: string;
  /** Must return a deck that passes validateDeck. `cards` is the whole pool. */
  buildDeck(cards: readonly Card[], rng: Rng): CardId[];
  /** Must return one of `legal`. Sees only what a human player would see. */
  chooseAction(view: PlayerView, legal: readonly Action[], rng: Rng): Action;
};
```

`packages/bots/src/random.ts`

```ts
import { DECK_SIZE, MAX_COPIES, type CardId } from "@duel/engine";
import type { Bot } from "./types";

/** Random valid deck, uniformly random legal action. The baseline every bot should beat. */
export const randomBot: Bot = {
  name: "random",

  buildDeck(cards, rng) {
    const pool = cards.filter((c) => !c.fusionOnly);
    const copies = new Map<CardId, number>();
    const deck: CardId[] = [];
    while (deck.length < DECK_SIZE) {
      const id = pool[rng.int(pool.length)]!.id;
      const count = copies.get(id) ?? 0;
      if (count >= MAX_COPIES) continue;
      copies.set(id, count + 1);
      deck.push(id);
    }
    return deck;
  },

  chooseAction(_view, legal, rng) {
    return legal[rng.int(legal.length)]!;
  },
};
```

`packages/bots/src/greedy.ts`

```ts
import {
  DECK_SIZE,
  MAX_COPIES,
  battleValues,
  fuseChain,
  getCard,
  playMaterials,
  type Action,
  type AttackAction,
  type CardId,
  type PlayAction,
  type PlayerView,
} from "@duel/engine";
import type { Bot } from "./types";

/** ATK gained by a play: the result's ATK minus the ATK of the creature it replaces. */
export function playGain(view: PlayerView, action: PlayAction): number {
  const result = getCard(fuseChain(playMaterials(view.self.field, view.self.hand, action)).result);
  const replaced = view.self.field[action.slot];
  return result.atk - (replaced ? getCard(replaced.cardId).atk : 0);
}

/** True for a direct attack or a battle the attacker wins outright. */
export function isFavourable(view: PlayerView, action: AttackAction): boolean {
  if (action.target === "direct") return true;
  const attacker = view.self.field[action.attackerSlot];
  const target = view.opponent.field[action.target];
  if (!attacker || !target) return false;
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position);
  return attack > defense;
}

function bestPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  let best: PlayAction | null = null;
  let bestGain = -Infinity;
  for (const action of legal) {
    if (action.type !== "PLAY" || action.position !== "attack") continue;
    const gain = playGain(view, action);
    const better =
      gain > bestGain || (gain === bestGain && best !== null && action.handIndexes.length < best.handIndexes.length);
    if (better) {
      best = action;
      bestGain = gain;
    }
  }
  return best;
}

/**
 * Strongest 30-card deck; every turn makes the play with the largest ATK gain
 * (fewest cards on a tie), then every favourable attack, then ends the turn.
 * It always plays when it can, so its matches always move toward deck-out.
 */
export const greedyBot: Bot = {
  name: "greedy",

  buildDeck(cards) {
    const strongest = cards
      .filter((c) => !c.fusionOnly)
      .sort((x, y) => y.atk - x.atk || (x.id < y.id ? -1 : 1))
      .slice(0, DECK_SIZE / MAX_COPIES);
    const deck: CardId[] = [];
    for (const c of strongest) for (let i = 0; i < MAX_COPIES; i++) deck.push(c.id);
    return deck;
  },

  chooseAction(view, legal) {
    const play = bestPlay(view, legal);
    if (play) return play;
    const attack = legal.find((a): a is AttackAction => a.type === "ATTACK" && isFavourable(view, a));
    if (attack) return attack;
    return legal.find((a) => a.type === "END_TURN")!;
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/bots/test/bots.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the bots package with the Bot interface, a random bot and a greedy bot (plan 1, task 12).
```

```bash
git add pnpm-lock.yaml packages/bots/package.json packages/bots/src/types.ts packages/bots/src/random.ts packages/bots/src/greedy.ts packages/bots/test/bots.test.ts HISTORY.md
git commit -m "feat(bots): bot interface, random and greedy bots"
```

### Task 13: Headless match runner

**Files:**
- Create: `packages/bots/src/runMatch.ts`
- Test: `packages/bots/test/runMatch.test.ts`

**Interfaces:**
- Consumes: `Bot`, `randomBot`, `greedyBot` from task 12; from `@duel/engine`: `CARDS`, `applyAction`, `createMatch`, `createRng`, `legalActions`, `validateDeck`, `viewFor`.
- Produces: `type ActionRecord = { player: PlayerId; action: Action }`, `type RunOptions = { maxTurns?: number }` (default 200), `runMatch(botA: Bot, botB: Bot, seed: number, options?: RunOptions): MatchOutcome`, where `MatchOutcome` always has `bots: [string, string]` (botA is player 0), `seed`, `firstPlayer: PlayerId | undefined`, `turns`, `actions: ActionRecord[]`, `events: GameEvent[]`, and is either `{ status: "finished"; winner: PlayerId; reason: EndReason }` or `{ status: "error"; error: string }`.

- [ ] **Step 1: Write the failing tests**

`packages/bots/test/runMatch.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { greedyBot } from "../src/greedy";
import { randomBot } from "../src/random";
import { runMatch } from "../src/runMatch";
import type { Bot } from "../src/types";

describe("runMatch", () => {
  it("plays a whole match to a result", () => {
    const outcome = runMatch(greedyBot, randomBot, 1);
    expect(outcome.status).toBe("finished");
    expect(outcome.bots).toEqual(["greedy", "random"]);
    expect(outcome.seed).toBe(1);
    expect(outcome.turns).toBeGreaterThan(1);
    expect(outcome.actions.length).toBeGreaterThan(0);
    expect(outcome.events.at(-1)?.type).toBe("match-ended");
  });

  it("is deterministic for a seed", () => {
    expect(runMatch(randomBot, randomBot, 42)).toEqual(runMatch(randomBot, randomBot, 42));
  });

  it("gives different matches for different seeds", () => {
    expect(runMatch(randomBot, randomBot, 1).actions).not.toEqual(runMatch(randomBot, randomBot, 2).actions);
  });

  it("finishes 20 greedy-vs-random and 20 greedy-vs-greedy matches without an error", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(runMatch(greedyBot, randomBot, seed).status).toBe("finished");
      expect(runMatch(greedyBot, greedyBot, seed).status).toBe("finished");
    }
  });

  it("reports an illegal action as an error outcome instead of throwing", () => {
    const cheater: Bot = {
      ...randomBot,
      name: "cheater",
      chooseAction: () => ({ type: "ATTACK", attackerSlot: 0, target: "direct" }),
    };
    const outcome = runMatch(cheater, cheater, 1);
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") expect(outcome.error).toMatch(/^cheater chose an illegal action: /);
  });

  it("reports an invalid deck as an error outcome", () => {
    const lazy: Bot = { ...randomBot, name: "lazy", buildDeck: () => [] };
    const outcome = runMatch(lazy, randomBot, 1);
    expect(outcome).toMatchObject({
      status: "error",
      error: "lazy built an invalid deck: deck must have exactly 30 cards, got 0",
      firstPlayer: undefined,
    });
  });

  it("stops at maxTurns when nobody ever finishes", () => {
    const passer: Bot = { ...randomBot, name: "passer", chooseAction: () => ({ type: "END_TURN" }) };
    const outcome = runMatch(passer, passer, 1, { maxTurns: 10 });
    expect(outcome).toMatchObject({ status: "error", error: "no result after 10 turns", turns: 11 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/bots/test/runMatch.test.ts`
Expected: FAIL. Vitest cannot resolve `runMatch` because the source file does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/bots/src/runMatch.ts`

```ts
import {
  CARDS,
  applyAction,
  createMatch,
  createRng,
  legalActions,
  validateDeck,
  viewFor,
  type Action,
  type EndReason,
  type GameEvent,
  type MatchState,
  type PlayerId,
} from "@duel/engine";
import type { Bot } from "./types";

export type ActionRecord = { player: PlayerId; action: Action };

type Common = {
  /** botA is player 0, botB is player 1 */
  bots: [string, string];
  seed: number;
  /** undefined only when the match could not be created */
  firstPlayer: PlayerId | undefined;
  turns: number;
  actions: ActionRecord[];
  events: GameEvent[];
};

export type MatchOutcome =
  | (Common & { status: "finished"; winner: PlayerId; reason: EndReason })
  | (Common & { status: "error"; error: string });

export type RunOptions = { maxTurns?: number };

/**
 * Plays one whole match with no GUI, server or clock. Never throws for a bot's
 * mistake: an invalid deck, an illegal action or hitting maxTurns comes back as
 * an "error" outcome.
 */
export function runMatch(botA: Bot, botB: Bot, seed: number, options: RunOptions = {}): MatchOutcome {
  const maxTurns = options.maxTurns ?? 200;
  const bots: [Bot, Bot] = [botA, botB];
  // one independent, reproducible random stream per bot
  const rngs = [createRng(seed * 2 + 1), createRng(seed * 2 + 2)] as const;
  const common: Common = {
    bots: [botA.name, botB.name],
    seed,
    firstPlayer: undefined,
    turns: 0,
    actions: [],
    events: [],
  };

  const decks = bots.map((bot, i) => bot.buildDeck(CARDS, rngs[i]!));
  for (const [i, deck] of decks.entries()) {
    const check = validateDeck(deck);
    if (!check.ok) return { ...common, status: "error", error: `${bots[i]!.name} built an invalid deck: ${check.error}` };
  }

  let state: MatchState = createMatch(decks[0]!, decks[1]!, seed);
  common.firstPlayer = state.firstPlayer;

  while (!state.result) {
    common.turns = state.turn;
    if (state.turn > maxTurns) return { ...common, status: "error", error: `no result after ${maxTurns} turns` };

    const player = state.active;
    const bot = bots[player];
    const legal = legalActions(state, player);
    const action = bot.chooseAction(viewFor(state, player), legal, rngs[player]);
    const result = applyAction(state, player, action);
    if (!result.ok) {
      return { ...common, status: "error", error: `${bot.name} chose an illegal action: ${result.error}` };
    }
    common.actions.push({ player, action });
    common.events.push(...result.events);
    state = result.state;
  }

  return { ...common, status: "finished", winner: state.result.winner, reason: state.result.reason };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/bots/test/runMatch.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added runMatch, which plays a whole match with no GUI, server or clock (plan 1, task 13).
```

```bash
git add packages/bots/src/runMatch.ts packages/bots/test/runMatch.test.ts HISTORY.md
git commit -m "feat(bots): headless match runner"
```

### Task 14: Statistics, replay text and the `pnpm sim` command

**Files:**
- Create: `packages/bots/src/stats.ts`
- Create: `packages/bots/src/replay.ts`
- Create: `packages/bots/src/index.ts`
- Create: `packages/bots/src/cli.ts`
- Test: `packages/bots/test/stats.test.ts`

**Interfaces:**
- Consumes: `runMatch`, `MatchOutcome` from task 13; `randomBot`, `greedyBot`, `Bot` from task 12; `getCard` and the types `CardId`, `EndReason`, `GameEvent` from `@duel/engine`.
- Produces: `summarize(outcomes: readonly MatchOutcome[], topN = 10): Summary`, `formatSummary(summary: Summary): string`, `formatEvent(event: GameEvent, bots: readonly [string, string]): string`, `formatReplay(outcome: MatchOutcome): string`, `BOTS: Record<string, Bot>` (the registry a new bot is added to), and the command `pnpm sim [--a <bot>] [--b <bot>] [--games <n>] [--seed <n>] [--replay <seed>]`.

- [ ] **Step 1: Write the failing tests**

`packages/bots/test/stats.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatReplay } from "../src/replay";
import type { MatchOutcome } from "../src/runMatch";
import { formatSummary, summarize } from "../src/stats";

const base = { seed: 1, actions: [] };

const outcomes: MatchOutcome[] = [
  {
    ...base,
    bots: ["greedy", "random"],
    status: "finished",
    winner: 0,
    reason: "life-points",
    firstPlayer: 0,
    turns: 10,
    events: [
      { type: "played", player: 0, slot: 0, cardId: "ember-fox", position: "attack" },
      { type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" },
      { type: "played", player: 0, slot: 1, cardId: "beast-rider", position: "attack" },
    ],
  },
  {
    ...base,
    bots: ["random", "greedy"],
    status: "finished",
    winner: 1,
    reason: "deck-out",
    firstPlayer: 0,
    turns: 30,
    events: [{ type: "played", player: 1, slot: 0, cardId: "ember-fox", position: "attack" }],
  },
  { ...base, bots: ["greedy", "random"], status: "error", error: "boom", firstPlayer: 1, turns: 3, events: [] },
];

describe("summarize", () => {
  const summary = summarize(outcomes);

  it("counts games, errors and wins by bot name whatever seat the bot had", () => {
    expect(summary.games).toBe(3);
    expect(summary.errors).toBe(1);
    expect(summary.wins).toEqual({ greedy: 2, random: 0 });
  });

  it("measures first-player wins and turns over finished games only", () => {
    expect(summary.firstPlayerWinRate).toBe(0.5);
    expect(summary.averageTurns).toBe(20);
    expect(summary.maxTurns).toBe(30);
  });

  it("counts wins by reason", () => {
    expect(summary.byReason).toEqual({ "life-points": 1, "deck-out": 1 });
  });

  it("ranks played and fused cards", () => {
    expect(summary.mostPlayed).toEqual([
      ["ember-fox", 2],
      ["beast-rider", 1],
    ]);
    expect(summary.mostFused).toEqual([["beast-rider", 1]]);
  });

  it("handles no games", () => {
    expect(summarize([])).toMatchObject({ games: 0, errors: 0, firstPlayerWinRate: 0, averageTurns: 0, maxTurns: 0 });
  });
});

describe("formatSummary", () => {
  it("prints every section with card names", () => {
    const text = formatSummary(summarize(outcomes));
    expect(text).toContain("Games: 3  (finished 2, errors 1)");
    expect(text).toMatch(/greedy\s+2\s+100\.0%/);
    expect(text).toContain("First player win rate: 50.0%");
    expect(text).toContain("Turns: average 20.0, max 30");
    expect(text).toMatch(/deck-out\s+1\s+50\.0%/);
    expect(text).toMatch(/Ember Fox\s+2/);
    expect(text).toMatch(/Most fused\n\s+Beast Rider\s+1/);
  });
});

describe("formatReplay", () => {
  it("prints one line per event with bot and card names", () => {
    const text = formatReplay(outcomes[0]!);
    expect(text.split("\n")).toEqual([
      "Seed 1: greedy(P0) vs random(P1), P0 moves first",
      "greedy(P0) played Ember Fox in slot 0 (attack)",
      "greedy(P0) fused Ember Fox + Ash Duelist -> Beast Rider",
      "greedy(P0) played Beast Rider in slot 1 (attack)",
    ]);
  });

  it("ends with the error for an error outcome", () => {
    expect(formatReplay(outcomes[2]!).split("\n").at(-1)).toBe("ERROR: boom");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/bots/test/stats.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/replay` and `../src/stats`.

- [ ] **Step 3: Write the implementation**

`packages/bots/src/stats.ts`

```ts
import { getCard, type CardId, type EndReason } from "@duel/engine";
import type { MatchOutcome } from "./runMatch";

export type Summary = {
  games: number;
  errors: number;
  /** wins per bot name */
  wins: Record<string, number>;
  /** share of finished games won by the player who moved first, 0..1 */
  firstPlayerWinRate: number;
  averageTurns: number;
  maxTurns: number;
  byReason: Partial<Record<EndReason, number>>;
  /** card id and count, most frequent first */
  mostPlayed: [CardId, number][];
  mostFused: [CardId, number][];
};

function top(counts: Map<CardId, number>, limit: number): [CardId, number][] {
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, limit);
}

export function summarize(outcomes: readonly MatchOutcome[], topN = 10): Summary {
  const wins: Record<string, number> = {};
  const byReason: Partial<Record<EndReason, number>> = {};
  const played = new Map<CardId, number>();
  const fused = new Map<CardId, number>();
  let errors = 0;
  let finished = 0;
  let firstPlayerWins = 0;
  let totalTurns = 0;
  let maxTurns = 0;

  for (const outcome of outcomes) {
    for (const name of outcome.bots) wins[name] ??= 0;
    for (const event of outcome.events) {
      if (event.type === "played") played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
      if (event.type === "fused") fused.set(event.result, (fused.get(event.result) ?? 0) + 1);
    }
    if (outcome.status === "error") {
      errors += 1;
      continue;
    }
    finished += 1;
    const winnerName = outcome.bots[outcome.winner];
    wins[winnerName] = (wins[winnerName] ?? 0) + 1;
    if (outcome.winner === outcome.firstPlayer) firstPlayerWins += 1;
    byReason[outcome.reason] = (byReason[outcome.reason] ?? 0) + 1;
    totalTurns += outcome.turns;
    maxTurns = Math.max(maxTurns, outcome.turns);
  }

  return {
    games: outcomes.length,
    errors,
    wins,
    firstPlayerWinRate: finished === 0 ? 0 : firstPlayerWins / finished,
    averageTurns: finished === 0 ? 0 : totalTurns / finished,
    maxTurns,
    byReason,
    mostPlayed: top(played, topN),
    mostFused: top(fused, topN),
  };
}

const percent = (part: number, whole: number) => (whole === 0 ? "0.0%" : `${((100 * part) / whole).toFixed(1)}%`);

export function formatSummary(summary: Summary): string {
  const finished = summary.games - summary.errors;
  const lines = [`Games: ${summary.games}  (finished ${finished}, errors ${summary.errors})`, "", "Wins"];
  for (const [name, count] of Object.entries(summary.wins)) {
    lines.push(`  ${name.padEnd(12)} ${String(count).padStart(6)}  ${percent(count, finished)}`);
  }
  lines.push(
    "",
    `First player win rate: ${(100 * summary.firstPlayerWinRate).toFixed(1)}%`,
    `Turns: average ${summary.averageTurns.toFixed(1)}, max ${summary.maxTurns}`,
    "",
    "Wins by reason",
  );
  for (const [reason, count] of Object.entries(summary.byReason)) {
    lines.push(`  ${reason.padEnd(12)} ${String(count).padStart(6)}  ${percent(count, finished)}`);
  }
  for (const [title, rows] of [["Most played", summary.mostPlayed], ["Most fused", summary.mostFused]] as const) {
    lines.push("", title);
    for (const [id, count] of rows) lines.push(`  ${getCard(id).name.padEnd(20)} ${String(count).padStart(6)}`);
  }
  return lines.join("\n");
}
```

`packages/bots/src/replay.ts`

```ts
import { getCard, type GameEvent } from "@duel/engine";
import type { MatchOutcome } from "./runMatch";

const name = (id: string) => getCard(id).name;

export function formatEvent(event: GameEvent, bots: readonly [string, string]): string {
  const who = (player: 0 | 1) => `${bots[player]}(P${player})`;
  switch (event.type) {
    case "drew":
      return `${who(event.player)} drew ${event.count}`;
    case "fused":
      return `${who(event.player)} fused ${name(event.a)} + ${name(event.b)} -> ${name(event.result)}`;
    case "fusion-failed":
      return `${who(event.player)} failed to fuse ${name(event.a)} + ${name(event.b)}; ${name(event.b)} stands`;
    case "played":
      return `${who(event.player)} played ${name(event.cardId)} in slot ${event.slot} (${event.position})`;
    case "position-set":
      return `${who(event.player)} set slot ${event.slot} to ${event.position}`;
    case "attacked":
      return `${who(event.player)} attacked with slot ${event.attackerSlot} -> ${
        event.target === "direct" ? "direct" : `slot ${event.target}`
      }`;
    case "destroyed":
      return `  ${who(event.player)} lost ${name(event.cardId)} (slot ${event.slot})`;
    case "damage":
      return `  ${who(event.player)} took ${event.amount} damage`;
    case "turn-ended":
      return `${who(event.player)} ended the turn`;
    case "match-ended":
      return `Match over: ${who(event.winner)} wins by ${event.reason}`;
  }
}

export function formatReplay(outcome: MatchOutcome): string {
  const lines = [
    `Seed ${outcome.seed}: ${outcome.bots[0]}(P0) vs ${outcome.bots[1]}(P1), P${outcome.firstPlayer} moves first`,
    ...outcome.events.map((event) => formatEvent(event, outcome.bots)),
  ];
  if (outcome.status === "error") lines.push(`ERROR: ${outcome.error}`);
  return lines.join("\n");
}
```

`packages/bots/src/index.ts`

```ts
import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import type { Bot } from "./types";

export type { Bot } from "./types";
export { randomBot } from "./random";
export { greedyBot, isFavourable, playGain } from "./greedy";
export { runMatch, type ActionRecord, type MatchOutcome, type RunOptions } from "./runMatch";
export { formatSummary, summarize, type Summary } from "./stats";
export { formatEvent, formatReplay } from "./replay";

/** Bots selectable by name on the command line. Add a new bot here. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
};
```

`packages/bots/src/cli.ts`

```ts
import { parseArgs } from "node:util";
import { BOTS, formatReplay, formatSummary, runMatch, summarize, type MatchOutcome } from "./index";

const USAGE = `Usage: pnpm sim [--a <bot>] [--b <bot>] [--games <n>] [--seed <n>] [--replay <seed>]
Bots: ${Object.keys(BOTS).join(", ")}`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function wholeNumber(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`--${flag} must be a whole number, got "${text}"`);
  return value;
}

const { values } = parseArgs({
  options: {
    a: { type: "string", default: "greedy" },
    b: { type: "string", default: "random" },
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    replay: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const botA = BOTS[values.a] ?? fail(`unknown bot "${values.a}"`);
const botB = BOTS[values.b] ?? fail(`unknown bot "${values.b}"`);

if (values.replay !== undefined) {
  console.log(formatReplay(runMatch(botA, botB, wholeNumber(values.replay, "replay"))));
} else {
  const games = wholeNumber(values.games, "games");
  const seed = wholeNumber(values.seed, "seed");
  const outcomes: MatchOutcome[] = [];
  for (let i = 0; i < games; i++) {
    // alternate seats so neither bot is always player 0
    outcomes.push(i % 2 === 0 ? runMatch(botA, botB, seed + i) : runMatch(botB, botA, seed + i));
  }
  console.log(`${botA.name} vs ${botB.name}, seeds ${seed}..${seed + games - 1}\n`);
  console.log(formatSummary(summarize(outcomes)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/bots/test/stats.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the `sim` script and run the simulator**

In the root `package.json`, add `sim` to `scripts`:

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "sim": "tsx packages/bots/src/cli.ts"
  },
```

The CLI has no unit test because it only parses arguments and prints; check it by running it.

Run: `pnpm sim --a greedy --b random --games 20 --seed 1`
Expected: output that starts like this (the numbers are deterministic for these seeds):

```
greedy vs random, seeds 1..20

Games: 20  (finished 20, errors 0)

Wins
  greedy           20  100.0%
  random            0  0.0%

First player win rate: 45.0%
Turns: average 4.5, max 6

Wins by reason
  life-points      20  100.0%
```

followed by `Most played` and `Most fused` lists of card names.

Run: `pnpm sim --replay 3`
Expected: a first line `Seed 3: greedy(P0) vs random(P1), P1 moves first`, then one line per event, ending with `Match over: greedy(P0) wins by life-points`.

Run: `pnpm sim --a nope`
Expected: `unknown bot "nope"`, the usage text, and exit code 1.

Speed: a greedy match takes about 0.1 s because the bot scores every possible play, so 1000 games take about two minutes.

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 15 test files and 164 tests pass; `tsc` prints nothing.

- [ ] **Step 7: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added match statistics, replay output and the `pnpm sim` command (plan 1, task 14).
```

```bash
git add package.json packages/bots/src/stats.ts packages/bots/src/replay.ts packages/bots/src/index.ts packages/bots/src/cli.ts packages/bots/test/stats.test.ts HISTORY.md
git commit -m "feat(bots): statistics, replay and the sim command"
```

---

## After this plan

- Use `pnpm sim` to play-test. The first runs already show a balance problem worth looking at before the server is built: Ancient Tyrant is the most played card by a wide margin, and greedy-vs-random matches end in under five turns on average.
- Write a new bot by adding one file in `packages/bots/src/` that exports a `Bot`, and registering it in `BOTS` in `packages/bots/src/index.ts`.
- Then implement plan 2, `docs/plans/2026-11-12-protocol-and-server.md`.

## Spec coverage

| Spec section | Task |
|---|---|
| 3 Architecture (workspace, engine independence) | 1, 11 |
| 4.1 Cards | 2 |
| 4.2 Decks | 3 |
| 4.3 Match setup | 5 |
| 4.4 Turn (draw, action limits, end turn, surrender) | 5, 6, 7, 8 |
| 4.5 Playing and fusing, `previewPlay` | 4, 6 |
| 4.6 Battle | 7 |
| 4.7 Ending (life points, deck-out, surrender, timeout) | 5, 7, 8 |
| 4.8 API, `legalActions`, events, determinism | 8, 9, 10, 11 |
| 5.1 Bot interface | 12 |
| 5.2 Sample bots | 12 |
| 5.3 Match runner | 13 |
| 5.4 CLI | 14 |
| 9 Testing: engine, property, bots | every task; 11; 12 to 14 |
| 6, 7, 8 Protocol, server, client | plans 2 and 3 |
