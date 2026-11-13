# Tactics Phase 0 (Measurement) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simulator able to judge rule changes: a fast simulator, rule settings chosen per match, effective stats and an attack preview from the engine, decks separate from bots, a wide bot and a smart bot, and the comeback, lead-change and fusion-share measures.

**Architecture:** No duel rule changes in this phase. The engine gains a `Rules` object stored in `MatchState`, a view-only creature type that carries effective ATK and DEF, and one battle-outcome function shared by `resolveAttack` and a new `previewAttack` that works on a `PlayerView`. The bots package gains deck builders, two bots and three statistics, all computed from events the runner already records.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-tactics-rules-design.md` (sections 6 and 8, and `Revisions`), `docs/specs/2026-11-13-face-down-play-design.md` (section 7: the view gets its own creature type from phase 0).

## Global Constraints

- Rules live only in `packages/engine`. It imports nothing outside its own `./` files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002). `property.test.ts` enforces this.
- State is immutable from the caller's side; the same seed and actions always give the same match (DDR-0002).
- Bots see only a `PlayerView`, import only from `@duel/engine` (never `packages/engine/src/...`), use the `rng` argument for randomness, and return one of `legal` (DDR-0006).
- Only the engine works out a creature's current value or a battle result. A bot may score options with numbers the engine gave it (DDR-0010).
- A rule value is a setting the simulator can vary (DDR-0009). This phase adds the mechanism with one setting, `elementBonus`. `playsPerTurn` and `wearRatio` are added in phases 1 and 2 together with their rules.
- No duel rule changes: with default rules, every existing match plays out exactly as before. `pnpm sim --a greedy --b greedy --games 20 --seed 1` must keep printing 20 wins, first-player win rate 60.0%, average turns 9.7, max 17.
- All content is original; add no name from an existing game (DDR-0008).
- Imports inside a package are extensionless. Packages import each other only by name.
- GitHub issues for the nine tasks are created once the owner approves this plan, in a milestone "Tactics phase 0: Measurement"; their numbers replace `#N` below and are listed in a `Revisions` section at the bottom of this file.
- Every task: test first, one commit, one `HISTORY.md` line under `## 2026-11-13` or the current date's heading (create it if missing) in the same commit, one GitHub issue, `Closes #N` in the commit message. Work on a branch per task (`feat/phase0-<topic>`), as in plan 1.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/engine/src/fusion.ts` | modify | `fusePair` remembers results (task 1) |
| `packages/engine/src/types.ts` | modify | `Rules`, `ViewCreature`; `rules` on `MatchState` and `PlayerView` |
| `packages/engine/src/rules.ts` | modify | `DEFAULT_RULES`, `makeRules`; `ELEMENT_BONUS` removed |
| `packages/engine/src/match.ts` | modify | `createMatch` takes rule overrides |
| `packages/engine/src/values.ts` | create | `effectiveStats`: the one place a creature's current ATK and DEF are worked out |
| `packages/engine/src/view.ts` | modify | builds `ViewCreature`s |
| `packages/engine/src/battle.ts` | modify | `battleOutcome`, `previewAttack`; `resolveAttack` uses them |
| `packages/engine/src/play.ts` | modify | `playMaterials` accepts a view field |
| `packages/engine/src/index.ts` | modify | public API |
| `packages/bots/src/decks.ts` | create | deck builders, `DECKS`, `withDeck` |
| `packages/bots/src/wide.ts` | create | the wide bot |
| `packages/bots/src/smart.ts` | create | the smart bot |
| `packages/bots/src/greedy.ts`, `random.ts` | modify | use `decks.ts`, `previewAttack`, view stats |
| `packages/bots/src/runMatch.ts` | modify | `rules` option |
| `packages/bots/src/stats.ts` | modify | `lifeTrack`, comebacks, lead changes, fusion share |
| `packages/bots/src/cli.ts` | modify | `--deck-a`, `--deck-b`, `--element-bonus` |

---

### Task 1: Remember fusion results

Profiling on 2026-11-13 showed about 85% of simulator time inside `fusePair`, which filters and sorts the rule table on every call. It is a pure function of two card ids over constant data, so its answers can be kept. Trial result: 20 greedy-versus-greedy matches went from 9.1 s to 1.0 s with identical output.

**Files:**
- Modify: `packages/engine/src/fusion.ts`
- Test: `packages/engine/test/fusion.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fusePair(a: CardId, b: CardId): FusionStep`, unchanged signature and results.

This is a speed change with no behaviour change, so there is no failing test first. The new test guards the one risk a cache adds: callers sharing an object.

- [ ] **Step 1: Record the time before**

Run: `time pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: about 9 s; output contains `First player win rate: 60.0%` and `Turns: average 9.7, max 17`.

- [ ] **Step 2: Add the guard test**

Add inside `describe("fusePair", ...)` in `packages/engine/test/fusion.test.ts`:

```ts
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
```

Run: `pnpm vitest run packages/engine/test/fusion.test.ts`
Expected: PASS (the current code already behaves this way).

- [ ] **Step 3: Add the cache**

In `packages/engine/src/fusion.ts`, replace the whole `fusePair` function (and its doc comment) with:

```ts
/** Results by "a|b". fusePair is pure over constant card data, so an answer never changes. */
const PAIR_CACHE = new Map<string, { result: CardId; success: boolean }>();

/**
 * Fuse a pair. Success: the lowest-ATK result of any matching rule whose ATK is
 * strictly above both inputs (ties broken by id). Failure: b stands, a is lost.
 */
export function fusePair(a: CardId, b: CardId): FusionStep {
  const key = `${a}|${b}`;
  let found = PAIR_CACHE.get(key);
  if (!found) {
    const cardA = getCard(a);
    const cardB = getCard(b);
    const floor = Math.max(cardA.atk, cardB.atk);
    const candidates = FUSION_RULES.filter((rule) => matches(rule, cardA, cardB))
      .flatMap((rule) => rule.results)
      .map(getCard)
      .filter((c) => c.atk > floor)
      .sort((x, y) => x.atk - y.atk || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const best = candidates[0];
    found = best ? { result: best.id, success: true } : { result: b, success: false };
    PAIR_CACHE.set(key, found);
  }
  return { a, b, result: found.result, success: found.success };
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `time pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: about 1 s; the same `60.0%` and `average 9.7, max 17` lines as step 1.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** fusePair now remembers its results; 20 greedy-vs-greedy matches went from about 9 s to about 1 s with identical output (tactics phase 0, task 1, #N).`

```bash
git add packages/engine/src/fusion.ts packages/engine/test/fusion.test.ts HISTORY.md
git commit -m "perf(engine): remember fusion results

Closes #N"
```

---

### Task 2: Rule settings per match

**Files:**
- Modify: `packages/engine/src/types.ts`, `rules.ts`, `match.ts`, `battle.ts`, `view.ts`, `index.ts`
- Modify: `packages/bots/src/greedy.ts`
- Test: `packages/engine/test/rules.test.ts`, `match.test.ts`, `battle.test.ts`, `view.test.ts`, `helpers.ts`; `packages/bots/test/bots.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type Rules = { elementBonus: number }`
  - `DEFAULT_RULES: Readonly<Rules>` (`{ elementBonus: 500 }`)
  - `makeRules(overrides?: Partial<Rules>): Rules` — throws `Error("invalid rule elementBonus: <value>")` unless a whole number of 0 or more
  - `createMatch(deckA, deckB, seed, rules?: Partial<Rules>): MatchState`
  - `MatchState.rules: Rules`, `PlayerView.rules: Rules`
  - `battleValues(attacker: Card, target: Card, targetPosition: Position, rules: Rules)`
  - `ELEMENT_BONUS` no longer exists.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/rules.test.ts` — change the import line and add a block:

```ts
import { DEFAULT_RULES, beats, makeRules, opponent } from "../src/rules";
```

```ts
describe("makeRules", () => {
  it("defaults to an element bonus of 500", () => {
    expect(makeRules()).toEqual({ elementBonus: 500 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000 });
    expect(DEFAULT_RULES.elementBonus).toBe(500);
  });

  it("returns a new object each time", () => {
    expect(makeRules()).not.toBe(makeRules());
  });

  it("rejects a value that is not a whole number of 0 or more", () => {
    expect(() => makeRules({ elementBonus: -100 })).toThrow("invalid rule elementBonus: -100");
    expect(() => makeRules({ elementBonus: 0.5 })).toThrow("invalid rule elementBonus: 0.5");
    expect(makeRules({ elementBonus: 0 })).toEqual({ elementBonus: 0 });
  });
});
```

`packages/engine/test/match.test.ts` — add inside the `createMatch` describe block (it already imports `createMatch`; add `sampleDeck` to the `./helpers` import if it is not there):

```ts
  it("stores the default rules, or the overrides it was given", () => {
    expect(createMatch(sampleDeck(), sampleDeck(), 1).rules).toEqual({ elementBonus: 500 });
    expect(createMatch(sampleDeck(), sampleDeck(), 1, { elementBonus: 1000 }).rules).toEqual({ elementBonus: 1000 });
  });

  it("throws for an invalid rule value", () => {
    expect(() => createMatch(sampleDeck(), sampleDeck(), 1, { elementBonus: -1 })).toThrow("invalid rule elementBonus: -1");
  });
```

`packages/engine/test/battle.test.ts` — add `import { DEFAULT_RULES } from "../src/rules";`, add `DEFAULT_RULES` as the fourth argument to all five existing `battleValues(...)` calls, and add:

```ts
  it("uses the element bonus from the rules it is given", () => {
    // flame beats forest
    expect(battleValues(getCard("ember-fox"), getCard("moss-boar"), "attack", { elementBonus: 1000 })).toEqual({
      attack: 2200,
      defense: 1300,
    });
  });
```

and inside `describe("resolveAttack against attack position", ...)`:

```ts
  it("uses the match's own element bonus", () => {
    // flame 1200 + 1000 vs forest 1300
    const state = makeState({
      rules: { elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].lifePoints).toBe(3100);
  });
```

`packages/engine/test/view.test.ts` — in the first test's expected object add `rules: { elementBonus: 500 },` after `result: null,`.

Run: `pnpm vitest run packages/engine/test/rules.test.ts`
Expected: FAIL, `makeRules` is not exported.

- [ ] **Step 2: Implement in the engine**

`packages/engine/src/types.ts` — add after the `FusionRule` line:

```ts
/** Rule settings of one match. Chosen in createMatch and never changed afterwards. */
export type Rules = {
  /** ATK and DEF added for one battle to the creature whose element beats the other's */
  elementBonus: number;
};
```

Add `rules: Rules;` to `MatchState` (after `result`) and to `PlayerView` (after `result`).

`packages/engine/src/rules.ts` — change the import to `import type { Element, MatchState, PlayerId, Rules } from "./types";`, delete the line `export const ELEMENT_BONUS = 500;` and add:

```ts
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ elementBonus: 500 });

/** DEFAULT_RULES with `overrides` applied, as a new object. Throws for an invalid value. */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules: Rules = { ...DEFAULT_RULES, ...overrides };
  if (!Number.isInteger(rules.elementBonus) || rules.elementBonus < 0) {
    throw new Error(`invalid rule elementBonus: ${rules.elementBonus}`);
  }
  return rules;
}
```

`packages/engine/src/match.ts` — import `makeRules` from `./rules` and `Rules` from `./types`, then change `createMatch`:

```ts
/** Shuffles both decks, picks who goes first, and starts the first turn. */
export function createMatch(
  deckA: readonly CardId[],
  deckB: readonly CardId[],
  seed: number,
  rules: Partial<Rules> = {},
): MatchState {
  const matchRules = makeRules(rules);
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
    rules: matchRules,
  };
  startTurn(state, []);
  return state;
}
```

`packages/engine/src/battle.ts` — change the imports and `battleValues`:

```ts
import { FIELD_SLOTS, beats, opponent, turnError } from "./rules";
import type { AttackAction, Card, GameEvent, MatchState, PlayerId, Position, Rules } from "./types";

/**
 * The two numbers a battle compares, element bonus included: the attacker's ATK
 * against the target's ATK (attack position) or DEF (defense position).
 */
export function battleValues(
  attacker: Card,
  target: Card,
  targetPosition: Position,
  rules: Rules,
): { attack: number; defense: number } {
  const attack = attacker.atk + (beats(attacker.element, target.element) ? rules.elementBonus : 0);
  const base = targetPosition === "attack" ? target.atk : target.def;
  const defense = base + (beats(target.element, attacker.element) ? rules.elementBonus : 0);
  return { attack, defense };
}
```

In `resolveAttack`, pass the rules:

```ts
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position, draft.rules);
```

`packages/engine/src/view.ts` — add `rules: state.rules,` after `result: state.result,`.

`packages/engine/src/index.ts` — in the `./rules` export list replace `ELEMENT_BONUS,` with `DEFAULT_RULES,` and add `makeRules,` (keep the list alphabetical).

`packages/engine/test/helpers.ts` — import `DEFAULT_RULES` with the other `../src/rules` names and add `rules: { ...DEFAULT_RULES },` after `result: null,` in `makeState`.

- [ ] **Step 3: Update the greedy bot and its test**

`packages/bots/src/greedy.ts`, in `isFavourable`:

```ts
  const { attack, defense } = battleValues(getCard(attacker.cardId), getCard(target.cardId), target.position, view.rules);
```

`packages/bots/test/bots.test.ts`, in the `view()` helper add `rules: { elementBonus: 500 },` after `result: null,`.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: `First player win rate: 60.0%`, `Turns: average 9.7, max 17`.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Rule settings are now a Rules object stored in each match (createMatch takes overrides; views carry it); ELEMENT_BONUS became DEFAULT_RULES.elementBonus so one simulator run can compare values (tactics phase 0, task 2, DDR-0009, #N).`

```bash
git add packages/engine packages/bots HISTORY.md
git commit -m "feat(engine): rule settings per match

Closes #N"
```

---

### Task 3: View creatures with effective stats

**Files:**
- Create: `packages/engine/src/values.ts`
- Modify: `packages/engine/src/types.ts`, `view.ts`, `play.ts`
- Modify: `packages/bots/src/greedy.ts`
- Test: create `packages/engine/test/values.test.ts`; modify `packages/engine/test/view.test.ts`, `packages/bots/test/bots.test.ts`

**Interfaces:**
- Consumes: `MatchState.rules` (task 2).
- Produces:
  - `effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number }` in `values.ts`, not part of the public API. Throws `Error("no creature in slot <n>")` for an empty slot. Today it returns the printed values; later phases add synergy and wear here and nowhere else.
  - `type ViewCreature = { hidden: false; cardId: CardId; position: Position; hasAttacked: boolean; positionChanged: boolean; atk: number; def: number }`
  - `PlayerView.self.field` and `PlayerView.opponent.field` are `(ViewCreature | null)[]`.
  - `playMaterials(ownField: readonly ({ cardId: CardId } | null)[], hand, action)`.

`hidden: false` is there so that phase 5 can add a hidden variant to the union without changing the visible one.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/test/values.test.ts`:

```ts
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
```

`packages/engine/test/view.test.ts` — replace the two `field: field({ ... })` lines inside the first test's **expected** object:

```ts
        field: [
          null,
          { hidden: false, cardId: "cinder-whelp", position: "attack", hasAttacked: false, positionChanged: false, atk: 1400, def: 1000 },
          null,
          null,
          null,
        ],
```

```ts
        field: [
          { hidden: false, cardId: "stone-ram", position: "defense", hasAttacked: false, positionChanged: false, atk: 1400, def: 1500 },
          null,
          null,
          null,
          null,
        ],
```

Run: `pnpm vitest run packages/engine/test/values.test.ts packages/engine/test/view.test.ts`
Expected: FAIL, `../src/values` does not exist.

- [ ] **Step 2: Implement**

Create `packages/engine/src/values.ts`:

```ts
import { getCard } from "./cards";
import type { MatchState, PlayerId } from "./types";

/**
 * The current ATK and DEF of the creature in `slot`, before the element bonus
 * of a particular battle. This is the only place those values are worked out
 * (DDR-0010): views, battles and previews all read it. Today it is the printed
 * value; synergy and wear are added here.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const creature = state.players[player].field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  return { atk: card.atk, def: card.def };
}
```

`packages/engine/src/types.ts` — add after `Creature`:

```ts
/**
 * A creature as a player sees it. `atk` and `def` are its current values,
 * worked out by the engine; consumers never calculate them (DDR-0010).
 */
export type ViewCreature = {
  hidden: false;
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  positionChanged: boolean;
  atk: number;
  def: number;
};
```

and in `PlayerView` change both `field: (Creature | null)[]` to `field: (ViewCreature | null)[]`.

Replace `packages/engine/src/view.ts`:

```ts
import { opponent } from "./rules";
import type { MatchState, PlayerId, PlayerView, ViewCreature } from "./types";
import { effectiveStats } from "./values";

function viewField(state: MatchState, player: PlayerId): (ViewCreature | null)[] {
  return state.players[player].field.map((creature, slot) =>
    creature ? { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) } : null,
  );
}

/**
 * What `player` is allowed to know. The opponent's hand and both deck orders are
 * reduced to counts. Creatures carry their current ATK and DEF. The result
 * shares nothing with `state`.
 */
export function viewFor(state: MatchState, player: PlayerId): PlayerView {
  const me = state.players[player];
  const other = opponent(player);
  const them = state.players[other];
  return structuredClone({
    you: player,
    active: state.active,
    firstPlayer: state.firstPlayer,
    turn: state.turn,
    hasPlayed: state.hasPlayed,
    result: state.result,
    rules: state.rules,
    self: { hand: me.hand, deckCount: me.deck.length, field: viewField(state, player), lifePoints: me.lifePoints },
    opponent: {
      handCount: them.hand.length,
      deckCount: them.deck.length,
      field: viewField(state, other),
      lifePoints: them.lifePoints,
    },
  });
}
```

`packages/engine/src/play.ts` — in `playMaterials` change the first parameter's type, and drop `Creature` from the type import if nothing else uses it:

```ts
  ownField: readonly ({ cardId: CardId } | null)[],
```

- [ ] **Step 3: Update the greedy bot and its test**

`packages/bots/src/greedy.ts`, `playGain` — read the replaced creature's value from the view:

```ts
  return result.atk - (replaced ? replaced.atk : 0);
```

`packages/bots/test/bots.test.ts` — add `getCard` to the `@duel/engine` import and replace the `on` helper:

```ts
const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  hidden: false as const,
  cardId,
  position,
  hasAttacked: false,
  positionChanged: false,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Views now have their own creature type, ViewCreature, carrying effective ATK and DEF from the new engine function effectiveStats (printed values for now) (tactics phase 0, task 3, DDR-0010, #N).`

```bash
git add packages/engine packages/bots HISTORY.md
git commit -m "feat(engine): view creatures carry effective stats

Closes #N"
```

---

### Task 4: One battle outcome for attacks and previews

**Files:**
- Modify: `packages/engine/src/battle.ts`, `index.ts`
- Modify: `packages/bots/src/greedy.ts`
- Test: `packages/engine/test/battle.test.ts`

**Interfaces:**
- Consumes: `effectiveStats` (task 3), `ViewCreature`, `Rules`.
- Produces, exported from `@duel/engine`:
  - `type BattleOutcome = { attack: number; defense: number; attackerDestroyed: boolean; targetDestroyed: boolean; damageToSelf: number; damageToOpponent: number }` — "self" is the attacking player.
  - `previewAttack(view: PlayerView, action: AttackAction): BattleOutcome | { error: string }` — what the attack would do. It checks only that both creatures exist (`"no creature in that slot"`, `"no creature in the target slot"`); whether the attack is legal right now is `legalActions`' job.
- Produces, internal to `battle.ts`:
  - `type Combatant = { atk: number; def: number; element: Element }`
  - `battleValues(attacker: Combatant, target: Combatant, targetPosition: Position, rules: Rules)`
  - `battleOutcome(attacker: Combatant, target: { combatant: Combatant; position: Position } | null, rules: Rules): BattleOutcome` — `null` is a direct attack.
- `battleValues` is removed from the public API; bots use `previewAttack`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/test/battle.test.ts` change the imports to:

```ts
import { attackError, battleOutcome, battleValues, previewAttack, resolveAttack } from "../src/battle";
import { getCard } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import type { AttackAction, GameEvent, MatchState } from "../src/types";
import { viewFor } from "../src/view";
import { creature, field, makeState } from "./helpers";
```

and add:

```ts
describe("battleOutcome", () => {
  const strong = { atk: 2000, def: 1000, element: "flame" as const };
  const weak = { atk: 1500, def: 1800, element: "flame" as const };

  it("against attack position: the lower value is destroyed and its owner takes the difference", () => {
    expect(battleOutcome(strong, { combatant: weak, position: "attack" }, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 1500,
      attackerDestroyed: false,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 500,
    });
    expect(battleOutcome(weak, { combatant: strong, position: "attack" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: true,
      targetDestroyed: false,
      damageToSelf: 500,
      damageToOpponent: 0,
    });
  });

  it("against attack position: equal values destroy both with no damage", () => {
    expect(battleOutcome(strong, { combatant: strong, position: "attack" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: true,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 0,
    });
  });

  it("against defense position: no damage to the defender, and the attacker is never destroyed", () => {
    expect(battleOutcome(strong, { combatant: weak, position: "defense" }, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 1800,
      attackerDestroyed: false,
      targetDestroyed: true,
      damageToSelf: 0,
      damageToOpponent: 0,
    });
    expect(battleOutcome(weak, { combatant: weak, position: "defense" }, DEFAULT_RULES)).toMatchObject({
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 300,
      damageToOpponent: 0,
    });
  });

  it("direct: the attacker's value goes to the opponent", () => {
    expect(battleOutcome(strong, null, DEFAULT_RULES)).toEqual({
      attack: 2000,
      defense: 0,
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 0,
      damageToOpponent: 2000,
    });
  });
});

describe("previewAttack", () => {
  it("reads the creatures' values from the view, not from the cards", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(0, 0))).toMatchObject({ attack: 1200, defense: 1500, attackerDestroyed: true });
    view.self.field[0]!.atk = 1900;
    expect(previewAttack(view, attack(0, 0))).toMatchObject({ attack: 1900, defense: 1500, targetDestroyed: true });
    expect(previewAttack(view, attack(0, "direct"))).toMatchObject({ damageToOpponent: 1900 });
  });

  it("uses the view's rules for the element bonus", () => {
    const state = makeState({
      rules: { elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 2200, defense: 1300 });
  });

  it("returns an error when a creature is missing", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(3, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(9, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(0, 2))).toEqual({ error: "no creature in the target slot" });
  });

  it("agrees with what resolveAttack then does", () => {
    const cases: [string, string, "attack" | "defense"][] = [
      ["ash-duelist", "ember-fox", "attack"],
      ["ember-fox", "ash-duelist", "attack"],
      ["ash-duelist", "burrow-drake", "attack"],
      ["ember-fox", "moss-boar", "attack"],
      ["ash-duelist", "ember-fox", "defense"],
      ["ember-fox", "furnace-drone", "defense"],
      ["ash-duelist", "furnace-drone", "defense"],
    ];
    for (const [mine, theirs, position] of cases) {
      const state = duel(mine, theirs, position);
      const preview = previewAttack(viewFor(state, 0), attack(0, 0));
      if ("error" in preview) throw new Error(preview.error);
      resolveAttack(state, 0, attack(0, 0), []);
      expect(state.players[0].field[0] === null, `${mine} -> ${theirs}`).toBe(preview.attackerDestroyed);
      expect(state.players[1].field[0] === null, `${mine} -> ${theirs}`).toBe(preview.targetDestroyed);
      expect(4000 - state.players[0].lifePoints).toBe(preview.damageToSelf);
      expect(4000 - state.players[1].lifePoints).toBe(preview.damageToOpponent);
    }
  });
});
```

Run: `pnpm vitest run packages/engine/test/battle.test.ts`
Expected: FAIL, `battleOutcome` is not exported.

- [ ] **Step 2: Implement in `packages/engine/src/battle.ts`**

Replace the imports and `battleValues`, and add the new functions before `attackError`:

```ts
import { getCard } from "./cards";
import { endMatch } from "./match";
import { FIELD_SLOTS, beats, opponent, turnError } from "./rules";
import type {
  AttackAction,
  Element,
  GameEvent,
  MatchState,
  PlayerId,
  PlayerView,
  Position,
  Rules,
  ViewCreature,
} from "./types";
import { effectiveStats } from "./values";

/** One side of a battle: its current ATK and DEF, and its element. */
export type Combatant = { atk: number; def: number; element: Element };

/** What an attack does. "Self" is the attacking player. */
export type BattleOutcome = {
  attack: number;
  defense: number;
  attackerDestroyed: boolean;
  targetDestroyed: boolean;
  damageToSelf: number;
  damageToOpponent: number;
};

/**
 * The two numbers a battle compares, element bonus included: the attacker's ATK
 * against the target's ATK (attack position) or DEF (defense position).
 */
export function battleValues(
  attacker: Combatant,
  target: Combatant,
  targetPosition: Position,
  rules: Rules,
): { attack: number; defense: number } {
  const attack = attacker.atk + (beats(attacker.element, target.element) ? rules.elementBonus : 0);
  const base = targetPosition === "attack" ? target.atk : target.def;
  const defense = base + (beats(target.element, attacker.element) ? rules.elementBonus : 0);
  return { attack, defense };
}

/** The whole result of one attack. `target` null means a direct attack. Changes nothing. */
export function battleOutcome(
  attacker: Combatant,
  target: { combatant: Combatant; position: Position } | null,
  rules: Rules,
): BattleOutcome {
  if (!target) {
    return {
      attack: attacker.atk,
      defense: 0,
      attackerDestroyed: false,
      targetDestroyed: false,
      damageToSelf: 0,
      damageToOpponent: attacker.atk,
    };
  }
  const { attack, defense } = battleValues(attacker, target.combatant, target.position, rules);
  const damageToSelf = Math.max(0, defense - attack);
  if (target.position === "attack") {
    return {
      attack,
      defense,
      attackerDestroyed: attack <= defense,
      targetDestroyed: attack >= defense,
      damageToSelf,
      damageToOpponent: Math.max(0, attack - defense),
    };
  }
  return { attack, defense, attackerDestroyed: false, targetDestroyed: attack > defense, damageToSelf, damageToOpponent: 0 };
}

function fromView(creature: ViewCreature): Combatant {
  return { atk: creature.atk, def: creature.def, element: getCard(creature.cardId).element };
}

/**
 * What `action` would do, worked out from a view. It checks only that the
 * creatures exist; whether the attack is legal now is for legalActions.
 */
export function previewAttack(view: PlayerView, action: AttackAction): BattleOutcome | { error: string } {
  const attacker = view.self.field[action.attackerSlot];
  if (!attacker) return { error: "no creature in that slot" };
  if (action.target === "direct") return battleOutcome(fromView(attacker), null, view.rules);
  const target = view.opponent.field[action.target];
  if (!target) return { error: "no creature in the target slot" };
  return battleOutcome(fromView(attacker), { combatant: fromView(target), position: target.position }, view.rules);
}
```

Leave `attackError`, `dealDamage` and `destroy` as they are. Replace `resolveAttack` with:

```ts
function fromState(state: MatchState, player: PlayerId, slot: number): Combatant {
  const creature = state.players[player].field[slot]!;
  return { ...effectiveStats(state, player, slot), element: getCard(creature.cardId).element };
}

/** Mutates `draft`. The caller must have checked attackError first. */
export function resolveAttack(draft: MatchState, player: PlayerId, action: AttackAction, events: GameEvent[]): void {
  const enemy = opponent(player);
  const target =
    action.target === "direct"
      ? null
      : {
          combatant: fromState(draft, enemy, action.target),
          position: draft.players[enemy].field[action.target]!.position,
        };
  const outcome = battleOutcome(fromState(draft, player, action.attackerSlot), target, draft.rules);

  draft.players[player].field[action.attackerSlot]!.hasAttacked = true;
  events.push({ type: "attacked", player, attackerSlot: action.attackerSlot, target: action.target });

  if (action.target !== "direct" && outcome.targetDestroyed) destroy(draft, enemy, action.target, events);
  if (outcome.attackerDestroyed) destroy(draft, player, action.attackerSlot, events);
  if (outcome.damageToOpponent > 0) dealDamage(draft, enemy, outcome.damageToOpponent, events);
  if (outcome.damageToSelf > 0) dealDamage(draft, player, outcome.damageToSelf, events);
}
```

The order of `destroyed` and `damage` events is the same as before, so the existing event-order tests keep passing. The existing `battleValues` tests pass a `Card`, which has `atk`, `def` and `element`, so they need no change.

- [ ] **Step 3: Public API and the greedy bot**

`packages/engine/src/index.ts` — replace `export { battleValues } from "./battle";` with:

```ts
export { previewAttack, type BattleOutcome } from "./battle";
```

`packages/bots/src/greedy.ts` — in the `@duel/engine` import replace `battleValues,` with `previewAttack,`, and replace `isFavourable`:

```ts
/** True for a direct attack or a battle the attacker wins outright. */
export function isFavourable(view: PlayerView, action: AttackAction): boolean {
  if (action.target === "direct") return true;
  const preview = previewAttack(view, action);
  return !("error" in preview) && preview.attack > preview.defense;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: `First player win rate: 60.0%`, `Turns: average 9.7, max 17`.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Added battleOutcome, shared by resolveAttack and the new public previewAttack(view, action); a direct attack now goes through effectiveStats; battleValues left the public API and the greedy bot uses previewAttack (tactics phase 0, task 4, DDR-0010, #N).`

```bash
git add packages/engine packages/bots HISTORY.md
git commit -m "feat(engine): battle outcome and attack preview on a view

Closes #N"
```

---

### Task 5: Decks separate from bots, and simulator settings

**Files:**
- Create: `packages/bots/src/decks.ts`
- Modify: `packages/bots/src/greedy.ts`, `random.ts`, `runMatch.ts`, `cli.ts`, `index.ts`
- Test: create `packages/bots/test/decks.test.ts`; modify `packages/bots/test/runMatch.test.ts`

**Interfaces:**
- Consumes: `createMatch(deckA, deckB, seed, rules?)` (task 2).
- Produces, exported from `@duel/bots`:
  - `type DeckBuilder = (cards: readonly Card[], rng: Rng) => CardId[]`
  - `strongestDeck`, `randomDeck`: `DeckBuilder`
  - `elementDeck(element: Element): DeckBuilder` — every base card of the element, three copies each, then the strongest other base cards up to 30.
  - `DECKS: Record<string, DeckBuilder>` with keys `strongest`, `random`, `flame`, `forest`, `wind`, `earth`, `thunder`, `water`.
  - `withDeck(bot: Bot, deckName: string, build: DeckBuilder): Bot` — the same bot, named `<bot>/<deckName>`, using that deck.
  - `RunOptions = { maxTurns?: number; rules?: Partial<Rules> }`
  - CLI flags `--deck-a <name>`, `--deck-b <name>`, `--element-bonus <n>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/bots/test/decks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CARDS, createRng, getCard, validateDeck } from "@duel/engine";
import { DECKS, elementDeck, randomDeck, strongestDeck, withDeck } from "../src/decks";
import { greedyBot } from "../src/greedy";

describe("deck builders", () => {
  it("every named deck is valid", () => {
    expect(Object.keys(DECKS)).toEqual(["strongest", "random", "flame", "forest", "wind", "earth", "thunder", "water"]);
    for (const [name, build] of Object.entries(DECKS)) {
      expect(validateDeck(build(CARDS, createRng(1))), name).toEqual({ ok: true });
    }
  });

  it("strongest is the 10 highest-ATK base cards, 3 copies each", () => {
    const deck = strongestDeck(CARDS, createRng(1));
    expect(new Set(deck).size).toBe(10);
    expect(deck).toContain("cloud-serpent");
    expect(deck).not.toContain("seedling");
  });

  it("random differs by seed", () => {
    expect(randomDeck(CARDS, createRng(1))).not.toEqual(randomDeck(CARDS, createRng(2)));
  });

  it("an element deck holds 3 copies of every base card of that element, then the strongest others", () => {
    const deck = elementDeck("flame")(CARDS, createRng(1));
    const flame = deck.filter((id) => getCard(id).element === "flame");
    // 6 flame base cards x 3
    expect(flame).toHaveLength(18);
    expect(new Set(flame).size).toBe(6);
    const others = [...new Set(deck.filter((id) => getCard(id).element !== "flame"))];
    expect(others).toEqual(["cloud-serpent", "thunder-roc", "bramble-wyrm", "brine-serpent"]);
  });
});

describe("withDeck", () => {
  it("keeps the bot's play, changes its deck and its name", () => {
    const themed = withDeck(greedyBot, "flame", elementDeck("flame"));
    expect(themed.name).toBe("greedy/flame");
    expect(themed.chooseAction).toBe(greedyBot.chooseAction);
    expect(themed.buildDeck(CARDS, createRng(1))).toEqual(elementDeck("flame")(CARDS, createRng(1)));
  });
});
```

Add to `packages/bots/test/runMatch.test.ts`, inside the describe block:

```ts
  it("passes rule overrides to the match", () => {
    const seen: unknown[] = [];
    const spy: Bot = {
      ...randomBot,
      name: "spy",
      chooseAction(view, legal, rng) {
        seen.push(view.rules);
        return randomBot.chooseAction(view, legal, rng);
      },
    };
    expect(runMatch(spy, spy, 1, { rules: { elementBonus: 1000 } }).status).toBe("finished");
    expect(seen[0]).toEqual({ elementBonus: 1000 });
    seen.length = 0;
    runMatch(spy, spy, 1);
    expect(seen[0]).toEqual({ elementBonus: 500 });
  });
```

Run: `pnpm vitest run packages/bots/test/decks.test.ts`
Expected: FAIL, `../src/decks` does not exist.

- [ ] **Step 2: Implement `packages/bots/src/decks.ts`**

```ts
import { DECK_SIZE, ELEMENTS, MAX_COPIES, type Card, type CardId, type Element, type Rng } from "@duel/engine";
import type { Bot } from "./types";

/** Builds a deck from the whole pool. Must return a deck that passes validateDeck. */
export type DeckBuilder = (cards: readonly Card[], rng: Rng) => CardId[];

const strongestFirst = (x: Card, y: Card) => y.atk - x.atk || (x.id < y.id ? -1 : 1);

/** MAX_COPIES of each card in order, until the deck is full. */
function fill(ordered: readonly Card[]): CardId[] {
  const deck: CardId[] = [];
  for (const card of ordered) {
    for (let i = 0; i < MAX_COPIES && deck.length < DECK_SIZE; i++) deck.push(card.id);
  }
  return deck;
}

/** The highest-ATK base cards: the "pile of the biggest numbers" baseline. */
export const strongestDeck: DeckBuilder = (cards) => fill(cards.filter((c) => !c.fusionOnly).sort(strongestFirst));

/** A uniformly random valid deck. */
export const randomDeck: DeckBuilder = (cards, rng) => {
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
};

/** Every base card of one element, then the strongest other base cards. */
export function elementDeck(element: Element): DeckBuilder {
  return (cards) => {
    const base = cards.filter((c) => !c.fusionOnly);
    const themed = base.filter((c) => c.element === element).sort(strongestFirst);
    const rest = base.filter((c) => c.element !== element).sort(strongestFirst);
    return fill([...themed, ...rest]);
  };
}

/** Decks selectable by name on the command line. */
export const DECKS: Record<string, DeckBuilder> = {
  strongest: strongestDeck,
  random: randomDeck,
  ...Object.fromEntries(ELEMENTS.map((element) => [element, elementDeck(element)])),
};

/** The same bot with another deck, named "<bot>/<deck>" so statistics tell them apart. */
export function withDeck(bot: Bot, deckName: string, build: DeckBuilder): Bot {
  return { ...bot, name: `${bot.name}/${deckName}`, buildDeck: build };
}
```

- [ ] **Step 3: Use it in the bots and the runner**

`packages/bots/src/greedy.ts` — add `import { strongestDeck } from "./decks";`, replace the whole `buildDeck(cards) { ... },` method with `buildDeck: strongestDeck,`, and remove `DECK_SIZE`, `MAX_COPIES` and `type CardId` from the `@duel/engine` import.

`packages/bots/src/random.ts` — replace the file:

```ts
import { randomDeck } from "./decks";
import type { Bot } from "./types";

/** Random valid deck, uniformly random legal action. The baseline every bot should beat. */
export const randomBot: Bot = {
  name: "random",
  buildDeck: randomDeck,
  chooseAction(_view, legal, rng) {
    return legal[rng.int(legal.length)]!;
  },
};
```

`packages/bots/src/runMatch.ts` — add `type Rules,` to the `@duel/engine` import, then:

```ts
export type RunOptions = { maxTurns?: number; rules?: Partial<Rules> };
```

```ts
  let state: MatchState = createMatch(decks[0]!, decks[1]!, seed, options.rules);
```

`packages/bots/src/index.ts` — add:

```ts
export { DECKS, elementDeck, randomDeck, strongestDeck, withDeck, type DeckBuilder } from "./decks";
```

- [ ] **Step 4: Command-line flags**

Replace `packages/bots/src/cli.ts`:

```ts
import { parseArgs } from "node:util";
import { BOTS, DECKS, formatReplay, formatSummary, runMatch, summarize, withDeck, type Bot, type MatchOutcome } from "./index";

const USAGE = `Usage: pnpm sim [--a <bot>] [--b <bot>] [--deck-a <deck>] [--deck-b <deck>]
                [--games <n>] [--seed <n>] [--element-bonus <n>] [--replay <seed>]
Bots: ${Object.keys(BOTS).join(", ")}
Decks: ${Object.keys(DECKS).join(", ")} (default: the bot's own deck)`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function wholeNumber(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`--${flag} must be a whole number, got "${text}"`);
  return value;
}

function pickBot(botName: string, deckName: string | undefined): Bot {
  const bot = BOTS[botName] ?? fail(`unknown bot "${botName}"`);
  if (deckName === undefined) return bot;
  return withDeck(bot, deckName, DECKS[deckName] ?? fail(`unknown deck "${deckName}"`));
}

const { values } = parseArgs({
  options: {
    a: { type: "string", default: "greedy" },
    b: { type: "string", default: "random" },
    "deck-a": { type: "string" },
    "deck-b": { type: "string" },
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    "element-bonus": { type: "string" },
    replay: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const botA = pickBot(values.a, values["deck-a"]);
const botB = pickBot(values.b, values["deck-b"]);
const rules =
  values["element-bonus"] === undefined ? {} : { elementBonus: wholeNumber(values["element-bonus"], "element-bonus") };

if (values.replay !== undefined) {
  console.log(formatReplay(runMatch(botA, botB, wholeNumber(values.replay, "replay"), { rules })));
} else {
  const games = wholeNumber(values.games, "games");
  const seed = wholeNumber(values.seed, "seed");
  const outcomes: MatchOutcome[] = [];
  for (let i = 0; i < games; i++) {
    // alternate seats so neither bot is always player 0
    outcomes.push(i % 2 === 0 ? runMatch(botA, botB, seed + i, { rules }) : runMatch(botB, botA, seed + i, { rules }));
  }
  console.log(`${botA.name} vs ${botB.name}, seeds ${seed}..${seed + games - 1}, rules ${JSON.stringify(rules)}\n`);
  console.log(formatSummary(summarize(outcomes)));
}
```

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --deck-a flame --deck-b strongest --games 20`
Expected: a `Wins` table with two rows, `greedy/flame` and `greedy/strongest`, and 0 errors.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --element-bonus 1000`
Expected: the header ends with `rules {"elementBonus":1000}` and 0 errors.

Run: `pnpm -s sim --deck-a nope`
Expected: `unknown deck "nope"` and the usage text, exit code 1.

- [ ] **Step 6: Commit**

Append to `HISTORY.md`:
`- **[code]** Decks are now separate from bots (decks.ts: strongest, random and six element decks; withDeck), runMatch takes rule overrides, and pnpm sim gained --deck-a, --deck-b and --element-bonus, so the same bot can be compared across decks and settings (tactics phase 0, task 5, #N).`

```bash
git add packages/bots HISTORY.md
git commit -m "feat(bots): deck builders and simulator settings

Closes #N"
```

---

### Task 6: The wide bot

The greedy bot is the "tall" baseline: it always makes the biggest fusion. The wide bot fills its field with single cards first, and fuses only when the field is full.

**Files:**
- Create: `packages/bots/src/wide.ts`
- Modify: `packages/bots/src/greedy.ts` (export `bestPlay`), `packages/bots/src/index.ts`
- Test: create `packages/bots/test/wide.test.ts`

**Interfaces:**
- Consumes: `isFavourable(view, action)` and `bestPlay(view, legal): PlayAction | null` from `greedy.ts`; `strongestDeck` (task 5); `ViewCreature` fields (task 3).
- Produces: `wideBot: Bot` (name `"wide"`), `widePlay(view: PlayerView, legal: readonly Action[]): PlayAction | null`; `BOTS.wide`.

- [ ] **Step 1: Write the failing test**

Create `packages/bots/test/wide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng, getCard, type Action, type PlayerView } from "@duel/engine";
import { greedyBot } from "../src/greedy";
import { runMatch } from "../src/runMatch";
import { wideBot, widePlay } from "../src/wide";

const EMPTY_FIELD = [null, null, null, null, null];

function view(overrides: { hand?: string[]; mine?: PlayerView["self"]["field"]; theirs?: PlayerView["opponent"]["field"] }): PlayerView {
  return {
    you: 0,
    active: 0,
    firstPlayer: 0,
    turn: 2,
    hasPlayed: false,
    result: null,
    rules: { elementBonus: 500 },
    self: { hand: overrides.hand ?? [], deckCount: 20, field: overrides.mine ?? EMPTY_FIELD, lifePoints: 4000 },
    opponent: { handCount: 5, deckCount: 20, field: overrides.theirs ?? EMPTY_FIELD, lifePoints: 4000 },
  };
}

const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  hidden: false as const,
  cardId,
  position,
  hasAttacked: false,
  positionChanged: false,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});

describe("widePlay", () => {
  it("puts its strongest single card into an empty slot instead of fusing", () => {
    const v = view({ hand: ["ember-fox", "ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0, 1], slot: 1, position: "attack" }, // would fuse into Beast Rider
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" }, // onto its own creature
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 1, position: "defense" },
      { type: "PLAY", handIndexes: [1], slot: 1, position: "attack" },
      { type: "END_TURN" },
    ];
    expect(widePlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 1, position: "attack" });
  });

  it("fuses like the greedy bot once its field is full", () => {
    const full = [on("moss-boar"), on("seedling"), on("seedling"), on("seedling"), on("seedling")];
    const v = view({ hand: ["ash-duelist"], mine: full });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" }, // seedling + warrior: no rule, 1500 - 600 = 900
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, // moss-boar + warrior -> Beast Rider, 1900 - 1300 = 600
      { type: "END_TURN" },
    ];
    expect(widePlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "attack" });
  });

  it("is null when no play is legal", () => {
    expect(widePlay(view({}), [{ type: "END_TURN" }])).toBeNull();
  });
});

describe("wideBot", () => {
  const rng = createRng(1);

  it("attacks when favourable once it cannot play, and otherwise ends the turn", () => {
    const winning = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(wideBot.chooseAction(winning, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });

    const losing = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    expect(wideBot.chooseAction(losing, legal, rng)).toEqual({ type: "END_TURN" });
  });

  it("finishes 10 matches against the greedy bot without an error", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(runMatch(wideBot, greedyBot, seed).status).toBe("finished");
    }
  });
});
```

Run: `pnpm vitest run packages/bots/test/wide.test.ts`
Expected: FAIL, `../src/wide` does not exist.

- [ ] **Step 2: Implement**

`packages/bots/src/greedy.ts` — change `function bestPlay(` to `export function bestPlay(` and give it a doc comment:

```ts
/** The attack-position play with the largest ATK gain (fewest cards on a tie), or null if no play is legal. */
```

Create `packages/bots/src/wide.ts`:

```ts
import { getCard, type Action, type AttackAction, type PlayAction, type PlayerView } from "@duel/engine";
import { strongestDeck } from "./decks";
import { bestPlay, isFavourable } from "./greedy";
import type { Bot } from "./types";

/**
 * The strongest single hand card into an empty slot, in attack position. With
 * no empty slot it falls back to the greedy bot's best fusion.
 */
export function widePlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  let best: PlayAction | null = null;
  let bestAtk = -1;
  for (const action of legal) {
    if (action.type !== "PLAY" || action.position !== "attack" || action.handIndexes.length !== 1) continue;
    if (view.self.field[action.slot]) continue;
    const atk = getCard(view.self.hand[action.handIndexes[0]!]!).atk;
    if (atk > bestAtk) {
      best = action;
      bestAtk = atk;
    }
  }
  return best ?? bestPlay(view, legal);
}

/**
 * The "wide" baseline: fills the field with single cards before it fuses
 * anything, then makes every favourable attack. Same deck as the greedy bot,
 * so a match between them compares the two plans, not the decks.
 */
export const wideBot: Bot = {
  name: "wide",
  buildDeck: strongestDeck,

  chooseAction(view, legal) {
    const play = widePlay(view, legal);
    if (play) return play;
    const attack = legal.find((a): a is AttackAction => a.type === "ATTACK" && isFavourable(view, a));
    if (attack) return attack;
    return legal.find((a) => a.type === "END_TURN")!;
  },
};
```

`packages/bots/src/index.ts` — add `import { wideBot } from "./wide";`, add `bestPlay` to the greedy export line, add `export { wideBot, widePlay } from "./wide";`, and add `wide: wideBot,` to `BOTS`.

- [ ] **Step 3: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a wide --b greedy --games 50`
Expected: 0 errors. Note the win rates for the commit message; with one play per turn the greedy bot is expected to win most matches.

- [ ] **Step 4: Commit**

Append to `HISTORY.md`:
`- **[code]** Added the wide bot: fills the field with single cards before fusing; the "wide" baseline against the greedy "tall" one (tactics phase 0, task 6, #N).`

```bash
git add packages/bots HISTORY.md
git commit -m "feat(bots): wide bot

Closes #N"
```

---

### Task 7: The smart bot

The smart bot looks one attack ahead with `previewAttack`, so it will understand wear and traits as soon as the engine does, with no change of its own.

How it plays, in this order each time it is asked:

1. **Play.** The threat is the highest current ATK among the opponent's creatures (0 with none). It uses empty slots while it has one; with a full field it plays onto a creature only when the result is stronger than that creature. It plays the fewest cards whose result has a printed ATK above the threat, in attack position (the higher ATK on a tie). If no play beats the threat it plays its highest-DEF result in defense position (the fewest cards on a tie).
2. **Turn to attack** any of its defense-position creatures whose ATK is above the threat.
3. **Attack** with the best-scoring attack, if the score is above 0. Score: damage to the opponent, plus the ATK of a destroyed target, minus damage to itself, minus its own ATK if the attacker is destroyed. A winning blow scores infinity; a blow that would end its own life scores minus infinity.
4. **Turn to defense** any attack-position creature whose ATK is below the threat.
5. End the turn.

The threat never rises during its own turn, so steps 2 and 4 cannot undo each other.

**Files:**
- Create: `packages/bots/src/smart.ts`
- Modify: `packages/bots/src/index.ts`
- Test: create `packages/bots/test/smart.test.ts`

**Interfaces:**
- Consumes: `previewAttack(view, action): BattleOutcome | { error }` (task 4); `fuseChain`, `playMaterials`, `getCard` from `@duel/engine`; `strongestDeck` (task 5).
- Produces: `smartBot: Bot` (name `"smart"`), `threat(view): number`, `smartPlay(view, legal): PlayAction | null`, `attackScore(view, action): number`; `BOTS.smart`.

- [ ] **Step 1: Write the failing test**

Create `packages/bots/test/smart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng, getCard, type Action, type PlayerView } from "@duel/engine";
import { greedyBot } from "../src/greedy";
import { runMatch } from "../src/runMatch";
import { attackScore, smartBot, smartPlay, threat } from "../src/smart";

const EMPTY_FIELD = [null, null, null, null, null];

function view(overrides: {
  hand?: string[];
  mine?: PlayerView["self"]["field"];
  theirs?: PlayerView["opponent"]["field"];
  myLife?: number;
  theirLife?: number;
}): PlayerView {
  return {
    you: 0,
    active: 0,
    firstPlayer: 0,
    turn: 2,
    hasPlayed: false,
    result: null,
    rules: { elementBonus: 500 },
    self: { hand: overrides.hand ?? [], deckCount: 20, field: overrides.mine ?? EMPTY_FIELD, lifePoints: overrides.myLife ?? 4000 },
    opponent: { handCount: 5, deckCount: 20, field: overrides.theirs ?? EMPTY_FIELD, lifePoints: overrides.theirLife ?? 4000 },
  };
}

const on = (cardId: string, position: "attack" | "defense" = "attack") => ({
  hidden: false as const,
  cardId,
  position,
  hasAttacked: false,
  positionChanged: false,
  atk: getCard(cardId).atk,
  def: getCard(cardId).def,
});

const END: Action = { type: "END_TURN" };
const rng = createRng(1);

describe("threat", () => {
  it("is the opponent's highest ATK, or 0 with no creatures", () => {
    expect(threat(view({}))).toBe(0);
    expect(threat(view({ theirs: [on("ember-fox"), on("ash-duelist", "defense"), null, null, null] }))).toBe(1500);
  });
});

describe("smartPlay", () => {
  it("plays the fewest cards that beat the threat", () => {
    // threat: moss-boar 1300. ash-duelist alone (1500) is enough; the fusion (1900) wastes a card.
    const v = view({ hand: ["ember-fox", "ash-duelist"], theirs: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "defense" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "attack" });
  });

  it("fuses when only a fusion beats the threat", () => {
    // threat: cloud-serpent 1700. ember-fox + ash-duelist -> Beast Rider 1900.
    const v = view({ hand: ["ember-fox", "ash-duelist"], theirs: [on("cloud-serpent"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0, 1], slot: 0, position: "attack" });
  });

  it("defends with its highest DEF when nothing beats the threat", () => {
    // threat: ancient-tyrant 3000. furnace-drone has DEF 1500; ember-fox then furnace-drone fails to fuse.
    const v = view({ hand: ["ember-fox", "furnace-drone"], theirs: [on("ancient-tyrant"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0, 1], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [1], slot: 0, position: "defense" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "defense" });
  });

  it("uses an empty slot rather than fusing onto its own creature", () => {
    const v = view({ hand: ["ash-duelist"], mine: [on("moss-boar"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, // would fuse into Beast Rider
      { type: "PLAY", handIndexes: [0], slot: 1, position: "attack" },
      END,
    ];
    expect(smartPlay(v, legal)).toEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "attack" });
  });

  it("with a full field, never replaces a creature with something weaker", () => {
    const full = [on("ash-duelist"), on("ash-duelist"), on("ash-duelist"), on("ash-duelist"), on("ash-duelist")];
    // seedling onto ash-duelist: no rule, so seedling (600) would stand where 1500 was
    const v = view({ hand: ["seedling"], mine: full });
    expect(smartPlay(v, [{ type: "PLAY", handIndexes: [0], slot: 0, position: "attack" }, END])).toBeNull();
  });

  it("is null when no play is legal", () => {
    expect(smartPlay(view({}), [END])).toBeNull();
  });
});

describe("attackScore", () => {
  const mine = [on("ash-duelist"), null, null, null, null];

  it("adds the damage dealt and the ATK of a destroyed target", () => {
    // 1500 vs ember-fox 1200: 300 damage + 1200
    const v = view({ mine, theirs: [on("ember-fox"), on("seedling"), null, null, null] });
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(1500);
    // flame beats forest: 2000 vs seedling 600: 1400 damage + 600
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 1 })).toBe(2000);
  });

  it("subtracts its own losses", () => {
    // 1500 into cloud-serpent 1700: 200 damage to itself and the attacker (1500) is lost
    const v = view({ mine, theirs: [on("cloud-serpent"), null, null, null, null] });
    expect(attackScore(v, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(-1700);
  });

  it("is infinite for a winning blow and minus infinite for a losing one", () => {
    const win = view({ mine, theirLife: 1500 });
    expect(attackScore(win, { type: "ATTACK", attackerSlot: 0, target: "direct" })).toBe(Infinity);
    const lose = view({ mine, theirs: [on("cloud-serpent"), null, null, null, null], myLife: 200 });
    expect(attackScore(lose, { type: "ATTACK", attackerSlot: 0, target: 0 })).toBe(-Infinity);
  });
});

describe("smartBot.chooseAction", () => {
  it("makes the best-scoring attack", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("ember-fox"), on("seedling"), null, null, null] });
    const legal: Action[] = [
      { type: "ATTACK", attackerSlot: 0, target: 0 },
      { type: "ATTACK", attackerSlot: 0, target: 1 },
      END,
    ];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 1 });
  });

  it("turns a strong defender to attack before attacking", () => {
    const v = view({ mine: [on("ash-duelist", "defense"), null, null, null, null], theirs: [on("ember-fox"), null, null, null, null] });
    const legal: Action[] = [{ type: "SET_POSITION", slot: 0, position: "attack" }, END];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "SET_POSITION", slot: 0, position: "attack" });
  });

  it("turns a weak attacker to defense instead of making a losing attack", () => {
    const v = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [
      { type: "ATTACK", attackerSlot: 0, target: 0 },
      { type: "SET_POSITION", slot: 0, position: "defense" },
      END,
    ];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({ type: "SET_POSITION", slot: 0, position: "defense" });
  });

  it("ends the turn when nothing is worth doing", () => {
    const v = view({ mine: [on("ember-fox", "defense"), null, null, null, null], theirs: [on("ash-duelist"), null, null, null, null] });
    const legal: Action[] = [{ type: "SET_POSITION", slot: 0, position: "attack" }, END];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual(END);
  });

  it("finishes 10 matches against the greedy bot without an error", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(runMatch(smartBot, greedyBot, seed).status).toBe("finished");
    }
  });
});
```

Run: `pnpm vitest run packages/bots/test/smart.test.ts`
Expected: FAIL, `../src/smart` does not exist.

- [ ] **Step 2: Implement `packages/bots/src/smart.ts`**

```ts
import {
  fuseChain,
  getCard,
  playMaterials,
  previewAttack,
  type Action,
  type AttackAction,
  type PlayAction,
  type PlayerView,
} from "@duel/engine";
import { strongestDeck } from "./decks";
import type { Bot } from "./types";

/** The highest current ATK among the opponent's creatures; 0 with none. */
export function threat(view: PlayerView): number {
  return Math.max(0, ...view.opponent.field.map((creature) => (creature ? creature.atk : 0)));
}

/**
 * Enough, not the most: the fewest cards whose result beats the threat, in
 * attack position. If nothing can, the highest DEF in defense position.
 * Empty slots are used while there is one; with a full field it only plays
 * onto a creature when the result is stronger than that creature.
 */
export function smartPlay(view: PlayerView, legal: readonly Action[]): PlayAction | null {
  const all = legal
    .filter((action): action is PlayAction => action.type === "PLAY")
    .map((action) => ({
      action,
      cards: action.handIndexes.length,
      card: getCard(fuseChain(playMaterials(view.self.field, view.self.hand, action)).result),
    }));
  const open = all.filter((option) => !view.self.field[option.action.slot]);
  // with a full field, only a play that leaves the slot stronger than it was
  const options = open.length > 0 ? open : all.filter((option) => option.card.atk > view.self.field[option.action.slot]!.atk);
  const need = threat(view);

  const winners = options.filter((option) => option.action.position === "attack" && option.card.atk > need);
  if (winners.length > 0) {
    return winners.reduce((best, option) =>
      option.cards < best.cards || (option.cards === best.cards && option.card.atk > best.card.atk) ? option : best,
    ).action;
  }

  const defenders = options.filter((option) => option.action.position === "defense");
  if (defenders.length > 0) {
    return defenders.reduce((best, option) =>
      option.card.def > best.card.def || (option.card.def === best.card.def && option.cards < best.cards) ? option : best,
    ).action;
  }
  return options[0]?.action ?? null;
}

/**
 * How good an attack is, from the engine's preview: damage dealt plus the ATK
 * of a destroyed target, minus damage taken and the ATK of a lost attacker.
 */
export function attackScore(view: PlayerView, action: AttackAction): number {
  const preview = previewAttack(view, action);
  if ("error" in preview) return -Infinity;
  if (preview.damageToOpponent >= view.opponent.lifePoints) return Infinity;
  if (preview.damageToSelf >= view.self.lifePoints) return -Infinity;
  const attacker = view.self.field[action.attackerSlot]!;
  const target = action.target === "direct" ? null : view.opponent.field[action.target]!;
  return (
    preview.damageToOpponent +
    (preview.targetDestroyed && target ? target.atk : 0) -
    preview.damageToSelf -
    (preview.attackerDestroyed ? attacker.atk : 0)
  );
}

/**
 * Looks one attack ahead through the engine's preview, so it follows whatever
 * the battle rules are. Same deck as the greedy and wide bots.
 */
export const smartBot: Bot = {
  name: "smart",
  buildDeck: strongestDeck,

  chooseAction(view, legal) {
    const play = smartPlay(view, legal);
    if (play) return play;

    const need = threat(view);
    const turn = (to: "attack" | "defense") =>
      legal.find((action) => {
        if (action.type !== "SET_POSITION" || action.position !== to) return false;
        const creature = view.self.field[action.slot];
        if (!creature) return false;
        return to === "attack" ? creature.atk > need : creature.atk < need;
      });

    const toAttack = turn("attack");
    if (toAttack) return toAttack;

    let best: AttackAction | null = null;
    let bestScore = 0;
    for (const action of legal) {
      if (action.type !== "ATTACK") continue;
      const score = attackScore(view, action);
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    if (best) return best;

    const toDefense = turn("defense");
    if (toDefense) return toDefense;

    return legal.find((action) => action.type === "END_TURN")!;
  },
};
```

`packages/bots/src/index.ts` — add `import { smartBot } from "./smart";`, add `export { attackScore, smartBot, smartPlay, threat } from "./smart";`, and add `smart: smartBot,` to `BOTS`.

- [ ] **Step 3: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a smart --b greedy --games 50` and `pnpm -s sim --a smart --b random --games 50`
Expected: 0 errors in both. Against `random` the smart bot should win nearly every match; if it does not, stop and report before committing. Note both win rates for the commit message.

- [ ] **Step 4: Commit**

Append to `HISTORY.md`:
`- **[code]** Added the smart bot: plays the fewest cards that beat the opponent's strongest creature, scores every attack with the engine's previewAttack, and manages positions (tactics phase 0, task 7, #N).`

```bash
git add packages/bots HISTORY.md
git commit -m "feat(bots): smart bot with one-attack lookahead

Closes #N"
```

---

### Task 8: Comeback, lead-change and fusion-share measures

All three are computed from events `runMatch` already records. No engine change.

**Files:**
- Modify: `packages/bots/src/stats.ts`, `packages/bots/src/index.ts`
- Test: `packages/bots/test/stats.test.ts`

**Interfaces:**
- Consumes: `MatchOutcome.events`; `STARTING_LIFE` from `@duel/engine`.
- Produces:
  - `COMEBACK_DEFICIT = 2000`
  - `lifeTrack(events: readonly GameEvent[]): { leadChanges: number; worstDeficit: [number, number] }` — `worstDeficit[p]` is the most life points player `p` was ever behind by (0 if never behind). A lead change is the lead passing from one player to the other; a tie in between does not count on its own.
  - `Summary` gains `comebackRate: number` (share of finished games whose winner was at some point `COMEBACK_DEFICIT` or more behind), `averageLeadChanges: number` (finished games), `fusionShare: number` (share of plays that included at least one successful fusion, all games).

- [ ] **Step 1: Write the failing tests**

In `packages/bots/test/stats.test.ts` change the stats import to:

```ts
import { formatSummary, lifeTrack, summarize } from "../src/stats";
```

and add:

```ts
describe("lifeTrack", () => {
  it("counts lead changes and the worst deficit of each player", () => {
    const track = lifeTrack([
      { type: "damage", player: 0, amount: 2500 }, // 1500 vs 4000: player 1 leads
      { type: "turn-ended", player: 1 },
      { type: "damage", player: 1, amount: 3000 }, // 1500 vs 1000: player 0 leads
      { type: "damage", player: 1, amount: 1000 }, // 1500 vs 0
    ]);
    expect(track).toEqual({ leadChanges: 1, worstDeficit: [2500, 1500] });
  });

  it("does not count a tie as a lead change", () => {
    const track = lifeTrack([
      { type: "damage", player: 0, amount: 500 }, // player 1 leads
      { type: "damage", player: 1, amount: 500 }, // tied
      { type: "damage", player: 0, amount: 500 }, // player 1 leads again
    ]);
    expect(track.leadChanges).toBe(0);
  });

  it("is all zeros with no damage", () => {
    expect(lifeTrack([])).toEqual({ leadChanges: 0, worstDeficit: [0, 0] });
  });
});

describe("summarize: tactics measures", () => {
  const comeback: MatchOutcome = {
    seed: 7,
    actions: [],
    bots: ["smart", "greedy"],
    status: "finished",
    winner: 0,
    reason: "life-points",
    firstPlayer: 1,
    turns: 12,
    events: [
      { type: "damage", player: 0, amount: 2500 },
      { type: "damage", player: 1, amount: 3000 },
      { type: "damage", player: 1, amount: 1000 },
    ],
  };

  it("measures comebacks and lead changes over finished games", () => {
    const summary = summarize([...outcomes, comeback]);
    // finished games: the two in `outcomes` (no damage events) and the comeback
    expect(summary.comebackRate).toBeCloseTo(1 / 3);
    expect(summary.averageLeadChanges).toBeCloseTo(1 / 3);
  });

  it("measures the share of plays that fused", () => {
    // `outcomes` has 3 plays; one of them follows a successful fusion
    expect(summarize(outcomes).fusionShare).toBeCloseTo(1 / 3);
  });

  it("does not count a failed fusion as a fusion play", () => {
    const failed: MatchOutcome = {
      ...comeback,
      events: [
        { type: "fusion-failed", player: 0, a: "furnace-drone", b: "pearl-clam" },
        { type: "played", player: 0, slot: 0, cardId: "pearl-clam", position: "attack" },
      ],
    };
    expect(summarize([failed]).fusionShare).toBe(0);
  });

  it("is zero for no games", () => {
    expect(summarize([])).toMatchObject({ comebackRate: 0, averageLeadChanges: 0, fusionShare: 0 });
  });

  it("prints the three measures", () => {
    const text = formatSummary(summarize([...outcomes, comeback]));
    expect(text).toContain("Comebacks (winner was 2000+ behind): 33.3%");
    expect(text).toContain("Lead changes: average 0.3");
    expect(text).toContain("Fusion share of plays: 33.3%");
  });
});
```

Run: `pnpm vitest run packages/bots/test/stats.test.ts`
Expected: FAIL, `lifeTrack` is not exported.

- [ ] **Step 2: Implement in `packages/bots/src/stats.ts`**

Change the engine import and add the new export above `summarize`:

```ts
import { STARTING_LIFE, getCard, type CardId, type EndReason, type GameEvent } from "@duel/engine";
```

```ts
/** A winner who was at least this many life points behind made a comeback. */
export const COMEBACK_DEFICIT = 2000;

/**
 * Replays the damage events of a match. `worstDeficit[p]` is the most life
 * points player p was ever behind by. A lead change is the lead passing from
 * one player to the other; a tie in between does not count on its own.
 */
export function lifeTrack(events: readonly GameEvent[]): { leadChanges: number; worstDeficit: [number, number] } {
  const life: [number, number] = [STARTING_LIFE, STARTING_LIFE];
  const worstDeficit: [number, number] = [0, 0];
  let leader: 0 | 1 | null = null;
  let leadChanges = 0;
  for (const event of events) {
    if (event.type !== "damage") continue;
    life[event.player] = Math.max(0, life[event.player] - event.amount);
    worstDeficit[0] = Math.max(worstDeficit[0], life[1] - life[0]);
    worstDeficit[1] = Math.max(worstDeficit[1], life[0] - life[1]);
    if (life[0] === life[1]) continue;
    const now = life[0] > life[1] ? 0 : 1;
    if (leader !== null && now !== leader) leadChanges += 1;
    leader = now;
  }
  return { leadChanges, worstDeficit };
}
```

Add to the `Summary` type:

```ts
  /** share of finished games whose winner was COMEBACK_DEFICIT or more behind at some point, 0..1 */
  comebackRate: number;
  /** lead changes per finished game */
  averageLeadChanges: number;
  /** share of plays that included at least one successful fusion, 0..1 */
  fusionShare: number;
```

In `summarize`, add counters next to the existing ones:

```ts
  let comebacks = 0;
  let leadChanges = 0;
  let plays = 0;
  let fusionPlays = 0;
```

Replace the inner `for (const event of outcome.events)` loop with:

```ts
    let fusedInThisPlay = false;
    for (const event of outcome.events) {
      if (event.type === "fused") {
        fused.set(event.result, (fused.get(event.result) ?? 0) + 1);
        fusedInThisPlay = true;
      }
      if (event.type === "played") {
        played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
        plays += 1;
        if (fusedInThisPlay) fusionPlays += 1;
        fusedInThisPlay = false;
      }
    }
```

After `maxTurns = Math.max(maxTurns, outcome.turns);` add:

```ts
    const track = lifeTrack(outcome.events);
    leadChanges += track.leadChanges;
    if (track.worstDeficit[outcome.winner] >= COMEBACK_DEFICIT) comebacks += 1;
```

Add to the returned object:

```ts
    comebackRate: finished === 0 ? 0 : comebacks / finished,
    averageLeadChanges: finished === 0 ? 0 : leadChanges / finished,
    fusionShare: plays === 0 ? 0 : fusionPlays / plays,
```

In `formatSummary`, in the `lines.push(` call that prints the first-player and turns lines, add three lines after the `Turns:` line:

```ts
    `Comebacks (winner was ${COMEBACK_DEFICIT}+ behind): ${(100 * summary.comebackRate).toFixed(1)}%`,
    `Lead changes: average ${summary.averageLeadChanges.toFixed(1)}`,
    `Fusion share of plays: ${(100 * summary.fusionShare).toFixed(1)}%`,
```

`packages/bots/src/index.ts` — change the stats export line to:

```ts
export { COMEBACK_DEFICIT, formatSummary, lifeTrack, summarize, type Summary } from "./stats";
```

- [ ] **Step 3: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: the old lines unchanged (`60.0%`, `average 9.7, max 17`) plus the three new lines.

- [ ] **Step 4: Commit**

Append to `HISTORY.md`:
`- **[code]** pnpm sim now reports comebacks (winner was 2000+ life points behind), lead changes per match and the fusion share of plays, all computed from recorded events (tactics phase 0, task 8, #N).`

```bash
git add packages/bots HISTORY.md
git commit -m "feat(bots): comeback, lead-change and fusion-share measures

Closes #N"
```

---

### Task 9: Baseline run and docs

The numbers every later phase is compared against, and the docs brought in step with the code.

**Files:**
- Modify: `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0006-bots-play-through-the-public-api.md`, `docs/ddr/0010-engine-determines-effective-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the baseline table in the tactics spec.

- [ ] **Step 1: Run the baseline**

Run each command and keep the output:

```bash
pnpm -s sim --a greedy --b greedy --games 500
pnpm -s sim --a smart --b smart --games 500
pnpm -s sim --a greedy --b wide --games 500
pnpm -s sim --a smart --b greedy --games 500
pnpm -s sim --a smart --b smart --deck-a flame --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --games 500 --element-bonus 1000
```

Expected: 0 errors in each.

- [ ] **Step 2: Record it in the tactics spec**

In `docs/specs/2026-11-13-tactics-rules-design.md`, add under `## Revisions` a section `### <today's date>: phase 0 baseline (rules of plan 1, element bonus 500 unless noted)` with one table row per command above and these columns, each value copied from the command's output: matchup; win rate of the first-named bot; first-player win rate; average turns; deck-out share; comebacks; lead changes; fusion share. Below the table, one line for each target of section 6 that the baseline already meets or misses.

- [ ] **Step 3: Bring the other docs in step**

- `docs/specs/2026-11-13-engine-high-level-design.md`: add a `## Revisions` section at the bottom with today's date, listing: `Rules` in `MatchState` and `PlayerView`; `ViewCreature` with effective stats from `values.ts`; `battleOutcome` shared by `resolveAttack` and the public `previewAttack`; `battleValues` no longer public; `fusePair` remembers its results.
- `docs/ddr/0006-bots-play-through-the-public-api.md`: set `Last updated` to today; in Implementation list the real files (`types.ts`, `runMatch.ts`, `decks.ts`, `greedy.ts`, `wide.ts`, `smart.ts`, `stats.ts`, `cli.ts`) in place of "No code exists yet"; in Consequences replace the "about 0.1 s per greedy match" trade-off with the measured time per match from step 1 and remove "not implemented" from the known gap.
- `docs/ddr/0010-engine-determines-effective-stats.md`: set `Last updated` to today; rewrite Implementation to name `packages/engine/src/values.ts` (`effectiveStats`), `view.ts` (`ViewCreature`) and `battle.ts` (`battleOutcome`, `previewAttack`); change the known gap to "effective values equal printed values until wear and synergy are implemented; no hidden creatures yet".
- `CLAUDE.md`: under Commands, replace the `pnpm sim` line with:
  `- \`pnpm sim --a smart --b greedy --games 100\` runs bot matches. Bots: random, greedy, wide, smart. \`--deck-a\`/\`--deck-b\` pick a deck (strongest, random or an element); \`--element-bonus\` sets that rule.`
  and add to Status: "Tactics phase 0 (measurement) is implemented."

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Append to `HISTORY.md`:
`- **[docs]** Recorded the phase 0 baseline in docs/specs/2026-11-13-tactics-rules-design.md and updated the engine high-level design, DDR-0006, DDR-0010 and CLAUDE.md to match the code (tactics phase 0, task 9, #N).`

```bash
git add docs CLAUDE.md HISTORY.md
git commit -m "docs: phase 0 baseline and docs in step with the code

Closes #N"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Tactics spec 6.1: a wide bot | 6 |
| Tactics spec 6.1: a smart bot that looks one attack ahead | 7 (through `previewAttack`, task 4) |
| Tactics spec 6.2: settings one build can compare | 2, 5 (`elementBonus` now; `playsPerTurn` in phase 1, `wearRatio` in phase 2) |
| Tactics spec 6.3: a faster simulator | 1 |
| Tactics spec 6: per-turn life record for comebacks and lead changes | 8 (from damage events, finer than per turn) |
| Tactics spec 6: fusion share of plays | 8 |
| Revisions: rules object per match | 2 |
| Revisions: decks separate from bots | 5 |
| Revisions: attack preview on view data | 4 |
| Revisions and DDR-0010: effective stats from the engine, in the view; direct attack uses them | 3, 4 |
| Face-down spec 7: the view has its own creature type from phase 0 | 3 |
| First baseline against the section 6 targets | 9 |

## Not in this plan

- Any duel rule change (R1 to R6). Phase 1 (R1 and R2) is the next plan.
- `eventsFor`, hidden creatures, `REVEAL`: phase 5.
- Trait-themed decks: there are no traits until phase 3. The element decks stand in for "a themed deck" until then.

## Revisions

### 2026-11-13

- Approved by the owner. Issues: task 1 is #41, task 2 #42, task 3 #43, task 4 #44, task 5 #45, task 6 #46, task 7 #47, task 8 #48, task 9 #49 (milestone "Tactics phase 0: Measurement"). Read `#N` in a task as that task's issue.
- Implemented on one branch, `feat/tactics-phase-0`, one commit per task, instead of a branch per task: the tasks build on each other and none is merged in between.
- **Task 7 changed during implementation.** The smart bot's play choice as written above ("the fewest cards whose result beats the threat, else the highest DEF in defense") lost to the greedy bot 23 to 77 over 100 matches. Two causes, seen in replays: saving cards buys nothing because the hand refills to 5, and it set a creature that merely tied the threat to defense, where it was destroyed. The implemented choice (`packages/bots/src/smart.ts`, `smartPlay`) is: (1) the play whose creature can make the best attack this turn, scored with `previewAttack` on the view as it would be after the play, so the element bonus counts; (2) otherwise the strongest creature the threat cannot destroy, in attack position if its ATK holds, else in defense if its DEF holds; (3) otherwise the highest DEF in defense. Result: 145 of 200 against greedy (seeds 1 to 200) and 133 of 200 (seeds 1000 to 1199), 200 of 200 against wide and random. The task's test file changed to match (three tests reworded, one added); the code and tests in the task text above are the first version and are kept as written.

