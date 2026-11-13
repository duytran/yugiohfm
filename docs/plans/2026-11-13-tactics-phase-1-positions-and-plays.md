# Tactics Phase 1 (Positions and Plays) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rules R1 (free position changes until a creature attacks) and R2 (a set number of plays per turn, 2 by default) and measure them against the phase 0 baseline.

**Architecture:** R1 removes the `positionChanged` flag and adds one legality check to `PLAY`. R2 turns the `hasPlayed` flag into a `playsUsed` counter compared with a new rule setting, `rules.playsPerTurn`. Both go through `actionError`, so `legalActions` follows without its own logic. The simulator gets a `--plays` flag and a cap on actions per match.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-tactics-rules-design.md`, R1 and R2 (section 4), experiment settings (section 6), phase 1 (section 8).

## Global Constraints

- Rules live only in `packages/engine`; it imports nothing outside its own files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- Bots see only a `PlayerView`, import only from `@duel/engine`, and return one of `legal` (DDR-0006).
- A rule value is a setting the simulator can vary, and is accepted only by simulator results (DDR-0009). `playsPerTurn` defaults to 2, the value the spec proposes; task 3 measures 1, 2 and 5 so the owner can confirm or change the default.
- Pillars that must not change: draw up to 5 every turn; the first player cannot attack on turn 1 (DDR-0009).
- The hand does not refill during a turn, so 5 plays (`HAND_SIZE`) is the most a turn can hold. `playsPerTurn: 5` is the spec's "unlimited" setting.
- Regression check: with one play per turn the greedy bot never changes a position, so `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --plays 1` must print `First player win rate: 60.0%` and `Turns: average 9.7, max 17`, as before this plan. (After task 1 and before the `--plays` flag exists, the same command without `--plays` must print it.)
- All content is original (DDR-0008). Imports inside a package are extensionless; packages import each other only by name.
- Every task: test first, one commit, one `HISTORY.md` line in the same commit, one GitHub issue, `Closes #N` in the commit message. Issues are created once the owner approves this plan; their numbers go in a `Revisions` section at the bottom.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## Decisions made while planning

- **A `PLAY` onto a creature that already attacked must name that creature's position; any other position is rejected** with `"a creature that already attacked keeps its position"`. The spec says such a play "keeps its position". Rejecting, not silently ignoring the chosen position, keeps "what you asked for is what happens" and stops `legalActions` listing two actions with the same effect.
- **`playsPerTurn` must be a whole number from 1 to 5.**
- **`runMatch` stops a match after `maxActions` actions (default 10,000)** with an error outcome. With free position changes a bot can toggle a creature forever inside one turn, and `maxTurns` never triggers.
- **Plans 2 and 3 are not touched.** They still name `hasPlayed`; they are revised once, after the engine shape is done (owner's decision, 2026-11-13).

## File Structure

| File | Change |
|---|---|
| `packages/engine/src/types.ts` | `positionChanged` removed; `Rules.playsPerTurn`; `hasPlayed` becomes `playsUsed` |
| `packages/engine/src/actions.ts` | `SET_POSITION` no longer limited to once |
| `packages/engine/src/play.ts` | position check for an attacked creature; plays counter |
| `packages/engine/src/match.ts` | turn start resets `playsUsed` |
| `packages/engine/src/rules.ts` | default and validation of `playsPerTurn` |
| `packages/engine/src/legal.ts`, `view.ts` | follow the renamed field |
| `packages/bots/src/runMatch.ts` | `maxActions` |
| `packages/bots/src/smart.ts` | drops `positionChanged` from its hypothetical creature |
| `packages/bots/src/cli.ts` | `--plays` |

---

### Task 1: R1, free position changes until the creature attacks

**Files:**
- Modify: `packages/engine/src/types.ts`, `actions.ts`, `play.ts`, `match.ts`
- Modify: `packages/bots/src/runMatch.ts`, `smart.ts`
- Test: `packages/engine/test/helpers.ts`, `actions.test.ts`, `play.test.ts`, `match.test.ts`, `legal.test.ts`, `view.test.ts`; `packages/bots/test/bots.test.ts`, `wide.test.ts`, `smart.test.ts`, `runMatch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Creature` and `ViewCreature` no longer have `positionChanged`.
  - `SET_POSITION` is legal any number of times for a creature that has not attacked this turn.
  - `playError` returns `"a creature that already attacked keeps its position"` for a `PLAY` onto such a creature with another position.
  - `RunOptions.maxActions?: number` (default 10,000); the error outcome reads `no result after <n> actions`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/actions.test.ts` — in `describe("SET_POSITION", ...)` replace the first two tests:

```ts
  it("changes the position and reports it", () => {
    const result = ok(state, 0, toDefense);
    expect(result.state.players[0].field[0]).toMatchObject({ position: "defense" });
    expect(result.events).toEqual([{ type: "position-set", player: 0, slot: 0, position: "defense" }]);
  });

  it("allows any number of changes before the creature attacks", () => {
    const toAttack: Action = { type: "SET_POSITION", slot: 0, position: "attack" };
    let next = ok(state, 0, toDefense).state;
    next = ok(next, 0, toAttack).state;
    next = ok(next, 0, toDefense).state;
    expect(next.players[0].field[0]?.position).toBe("defense");
  });
```

`packages/engine/test/play.test.ts` — add inside `describe("playError", ...)`:

```ts
  it("makes a play onto a creature that already attacked keep its position", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const after = makeState({ p0: { hand: HAND, field: field({ 1: attacked }) } });
    expect(playError(after, 0, play([1], 1, "defense"))).toBe("a creature that already attacked keeps its position");
    expect(playError(after, 0, play([1], 1, "attack"))).toBeNull();
  });

  it("lets a play onto a creature that has not attacked choose any position", () => {
    const fresh = makeState({ p0: { hand: HAND, field: field({ 1: creature("moss-boar") }) } });
    expect(playError(fresh, 0, play([1], 1, "defense"))).toBeNull();
    expect(playError(fresh, 0, play([1], 1, "attack"))).toBeNull();
  });
```

`packages/engine/test/legal.test.ts` — replace the test `"lists one position change per creature that may still change"` with:

```ts
  it("lists a position change for every creature that has not attacked", () => {
    const state = makeState({
      p0: {
        field: field({
          0: creature("ember-fox"),
          1: { ...creature("moss-boar"), hasAttacked: true },
          3: creature("pearl-clam", "defense"),
        }),
      },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "SET_POSITION")).toEqual([
      { type: "SET_POSITION", slot: 0, position: "defense" },
      { type: "SET_POSITION", slot: 3, position: "attack" },
    ]);
  });

  it("lists a play onto a creature that already attacked only in that creature's position", () => {
    const attacked = { ...creature("moss-boar"), hasAttacked: true };
    const state = makeState({ p0: { hand: ["ember-fox"], field: field({ 0: attacked }) } });
    const plays = legalActions(state, 0).filter((a) => a.type === "PLAY");
    // 5 slots x 2 positions, minus defense on slot 0
    expect(plays).toHaveLength(9);
    expect(plays).not.toContainEqual({ type: "PLAY", handIndexes: [0], slot: 0, position: "defense" });
  });
```

`packages/engine/test/match.test.ts` — in `"clears the per-turn flags of the active player"` change the first line to:

```ts
    const used = { ...creature("ember-fox"), hasAttacked: true };
```

`packages/engine/test/helpers.ts` — change `creature`:

```ts
export function creature(cardId: CardId, position: Position = "attack"): Creature {
  return { cardId, position, hasAttacked: false };
}
```

`packages/engine/test/view.test.ts` — remove `positionChanged: false, ` from the two expected creature lines.

`packages/bots/test/bots.test.ts`, `wide.test.ts`, `smart.test.ts` — remove the line `  positionChanged: false,` from the `on` helper in each.

`packages/bots/test/runMatch.test.ts` — add inside the describe block:

```ts
  it("stops at maxActions when a bot never ends its turn", () => {
    // plays once, then turns its creature back and forth forever
    const toggler: Bot = {
      ...randomBot,
      name: "toggler",
      chooseAction: (_view, legal) =>
        legal.find((a) => a.type === "PLAY") ?? legal.find((a) => a.type === "SET_POSITION") ?? legal[0]!,
    };
    const outcome = runMatch(toggler, toggler, 1, { maxActions: 50 });
    expect(outcome).toMatchObject({ status: "error", error: "no result after 50 actions", turns: 1 });
    expect(outcome.actions).toHaveLength(50);
  });
```

Run: `pnpm vitest run packages/engine/test/actions.test.ts packages/engine/test/play.test.ts`
Expected: FAIL (`position already changed this turn`; the new `playError` test gets `null`).

- [ ] **Step 2: Implement in the engine**

`packages/engine/src/types.ts` — delete the line `positionChanged: boolean;` from `Creature` and from `ViewCreature`.

`packages/engine/src/actions.ts` — in `setPositionError` delete the line

```ts
  if (creature.positionChanged) return "position already changed this turn";
```

and in `applyAction`, case `"SET_POSITION"`, delete the line `creature.positionChanged = true;`.

`packages/engine/src/match.ts` — in `startTurn` replace the loop over the field:

```ts
  for (const creature of player.field) {
    if (creature) creature.hasAttacked = false;
  }
```

`packages/engine/src/play.ts` — replace `playError`:

```ts
export function playError(state: MatchState, player: PlayerId, action: PlayAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (state.hasPlayed) return "already played a card this turn";
  const shape = playShapeError(state.players[player].hand.length, action);
  if (shape) return shape;
  // fusing onto a creature that attacked must not move it out of harm's way
  const onField = state.players[player].field[action.slot];
  if (onField?.hasAttacked && onField.position !== action.position) {
    return "a creature that already attacked keeps its position";
  }
  return null;
}
```

and in `resolvePlay` delete the line `positionChanged: false,`.

- [ ] **Step 3: Implement in the bots package**

`packages/bots/src/smart.ts` — in `afterPlay` delete the line `positionChanged: false,`.

`packages/bots/src/runMatch.ts` — change `RunOptions`, the doc comment's last sentence and the loop:

```ts
export type RunOptions = { maxTurns?: number; maxActions?: number; rules?: Partial<Rules> };
```

```ts
 * mistake: an invalid deck, an illegal action, or hitting maxTurns or maxActions
 * comes back as an "error" outcome.
```

```ts
  const maxTurns = options.maxTurns ?? 200;
  const maxActions = options.maxActions ?? 10_000;
```

and directly after the `maxTurns` check inside the `while` loop:

```ts
    if (common.actions.length >= maxActions) {
      return { ...common, status: "error", error: `no result after ${maxActions} actions` };
    }
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1`
Expected: `First player win rate: 60.0%`, `Turns: average 9.7, max 17`.

Run: `pnpm -s sim --a smart --b greedy --games 100` and `pnpm -s sim --a random --b random --games 100`
Expected: 0 errors in both.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R1: a creature may change position any number of times until it attacks (positionChanged removed), and a PLAY onto a creature that already attacked must keep its position, which closes the attack-then-fuse-into-defense hole; runMatch now stops after maxActions (tactics phase 1, task 1, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): free position changes until a creature attacks

Closes #N"
```

---

### Task 2: R2, plays per turn

**Files:**
- Modify: `packages/engine/src/types.ts`, `rules.ts`, `match.ts`, `play.ts`, `legal.ts`, `view.ts`
- Modify: `packages/bots/src/cli.ts`
- Test: `packages/engine/test/helpers.ts`, `rules.test.ts`, `match.test.ts`, `play.test.ts`, `actions.test.ts`, `legal.test.ts`, `view.test.ts`, `battle.test.ts`; `packages/bots/test/bots.test.ts`, `wide.test.ts`, `smart.test.ts`, `runMatch.test.ts`

**Interfaces:**
- Consumes: `Rules`, `makeRules`, `DEFAULT_RULES` (phase 0).
- Produces:
  - `Rules = { elementBonus: number; playsPerTurn: number }`; `DEFAULT_RULES` is `{ elementBonus: 500, playsPerTurn: 2 }`.
  - `makeRules` throws `Error("invalid rule playsPerTurn: <value>")` unless a whole number from 1 to 5.
  - `MatchState.playsUsed: number` and `PlayerView.playsUsed: number` replace `hasPlayed`.
  - `playError` returns `"no plays left this turn"` when `playsUsed >= rules.playsPerTurn`.
  - CLI flag `--plays <n>`.

- [ ] **Step 1: Update the test helpers and write the failing tests**

`packages/engine/test/helpers.ts` — in `makeState` replace `hasPlayed: false,` with `playsUsed: 0,`.

`packages/engine/test/rules.test.ts` — replace the `makeRules` describe block:

```ts
describe("makeRules", () => {
  it("defaults to an element bonus of 500 and 2 plays per turn", () => {
    expect(makeRules()).toEqual({ elementBonus: 500, playsPerTurn: 2 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000, playsPerTurn: 2 });
    expect(makeRules({ playsPerTurn: 1 })).toEqual({ elementBonus: 500, playsPerTurn: 1 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2 });
  });

  it("returns a new object each time", () => {
    expect(makeRules()).not.toBe(makeRules());
  });

  it("rejects an element bonus that is not a whole number of 0 or more", () => {
    expect(() => makeRules({ elementBonus: -100 })).toThrow("invalid rule elementBonus: -100");
    expect(() => makeRules({ elementBonus: 0.5 })).toThrow("invalid rule elementBonus: 0.5");
    expect(makeRules({ elementBonus: 0 }).elementBonus).toBe(0);
  });

  it("rejects plays per turn outside 1 to 5", () => {
    expect(() => makeRules({ playsPerTurn: 0 })).toThrow("invalid rule playsPerTurn: 0");
    expect(() => makeRules({ playsPerTurn: 6 })).toThrow("invalid rule playsPerTurn: 6");
    expect(() => makeRules({ playsPerTurn: 1.5 })).toThrow("invalid rule playsPerTurn: 1.5");
    expect(makeRules({ playsPerTurn: 5 }).playsPerTurn).toBe(5);
  });
});
```

`packages/engine/test/match.test.ts`:
- in the first test replace `expect(state.hasPlayed).toBe(false);` with `expect(state.playsUsed).toBe(0);`
- replace the test `"stores the default rules, or the overrides it was given"` with:

```ts
  it("stores the default rules, or the overrides it was given", () => {
    expect(createMatch(sampleDeck(), sampleDeck(), 1).rules).toEqual({ elementBonus: 500, playsPerTurn: 2 });
    expect(createMatch(sampleDeck(), sampleDeck(), 1, { elementBonus: 1000, playsPerTurn: 1 }).rules).toEqual({
      elementBonus: 1000,
      playsPerTurn: 1,
    });
  });
```

- in `"clears the per-turn flags of the active player"` replace `makeState({ hasPlayed: true, ` with `makeState({ playsUsed: 2, ` and `expect(state.hasPlayed).toBe(false);` with `expect(state.playsUsed).toBe(0);`

`packages/engine/test/play.test.ts`:
- add `import { DEFAULT_RULES } from "../src/rules";`
- replace the test `"rejects a second play in the same turn"` with:

```ts
  it("rejects a play when the turn's plays are used up", () => {
    expect(playError(makeState({ playsUsed: 1, p0: { hand: HAND } }), 0, play([0]))).toBeNull();
    expect(playError(makeState({ playsUsed: 2, p0: { hand: HAND } }), 0, play([0]))).toBe("no plays left this turn");
  });

  it("takes the number of plays from the match's rules", () => {
    const onePlay = makeState({ rules: { ...DEFAULT_RULES, playsPerTurn: 1 }, playsUsed: 1, p0: { hand: HAND } });
    expect(playError(onePlay, 0, play([0]))).toBe("no plays left this turn");
    const fivePlays = makeState({ rules: { ...DEFAULT_RULES, playsPerTurn: 5 }, playsUsed: 4, p0: { hand: HAND } });
    expect(playError(fivePlays, 0, play([0]))).toBeNull();
  });
```

- in `"moves one card from hand to the slot"` replace `expect(state.hasPlayed).toBe(true);` with `expect(state.playsUsed).toBe(1);`

`packages/engine/test/actions.test.ts`:
- replace the test `"applies PLAY"` with:

```ts
  it("applies PLAY, twice in a turn and no more", () => {
    const state = makeState({ p0: { hand: HAND } });
    const first = ok(state, 0, { type: "PLAY", handIndexes: [0], slot: 4, position: "attack" });
    expect(first.state.players[0].field[4]?.cardId).toBe("ember-fox");
    expect(first.state.playsUsed).toBe(1);
    const second = ok(first.state, 0, { type: "PLAY", handIndexes: [0], slot: 3, position: "attack" });
    expect(second.state.players[0].field[3]?.cardId).toBe("ash-duelist");
    expect(second.state.playsUsed).toBe(2);
    expect(applyAction(second.state, 0, { type: "PLAY", handIndexes: [0], slot: 2, position: "attack" })).toEqual({
      ok: false,
      error: "no plays left this turn",
    });
  });
```

- in `"passes the turn, counts it, and draws for the next player"` replace `makeState({ hasPlayed: true, ` with `makeState({ playsUsed: 2, ` and `expect(result.state.hasPlayed).toBe(false);` with `expect(result.state.playsUsed).toBe(0);`

`packages/engine/test/legal.test.ts` — replace the test `"lists no play once a card was played this turn"` with:

```ts
  it("lists plays until the turn's plays are used up", () => {
    const oneLeft = legalActions(makeState({ playsUsed: 1, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(oneLeft, "PLAY")).toBe(10);
    const noneLeft = legalActions(makeState({ playsUsed: 2, p0: { hand: ["ember-fox"] } }), 0);
    expect(count(noneLeft, "PLAY")).toBe(0);
  });
```

`packages/engine/test/view.test.ts` — replace both `hasPlayed: true,` with `playsUsed: 1,` and the expected `rules: { elementBonus: 500 },` with `rules: { elementBonus: 500, playsPerTurn: 2 },`.

`packages/engine/test/battle.test.ts` — the rules objects must now be complete. Replace each of the three `{ elementBonus: 1000 }` (one argument to `battleValues`, two `rules:` in `makeState`) with `{ ...DEFAULT_RULES, elementBonus: 1000 }`.

`packages/bots/test/bots.test.ts`, `wide.test.ts`, `smart.test.ts` — in each `view()` helper replace `hasPlayed: false,` with `playsUsed: 0,` and `rules: { elementBonus: 500 },` with `rules: { ...DEFAULT_RULES },`; add `DEFAULT_RULES` to each file's `@duel/engine` import.

`packages/bots/test/runMatch.test.ts` — in `"passes rule overrides to the match"` replace the two expectations with:

```ts
    expect(seen[0]).toEqual({ elementBonus: 1000, playsPerTurn: 2 });
```

```ts
    expect(seen[0]).toEqual({ elementBonus: 500, playsPerTurn: 2 });
```

Run: `pnpm vitest run packages/engine/test/rules.test.ts`
Expected: FAIL (`playsPerTurn` missing from the result).

- [ ] **Step 2: Implement in the engine**

`packages/engine/src/types.ts`:

```ts
/** Rule settings of one match. Chosen in createMatch and never changed afterwards. */
export type Rules = {
  /** ATK and DEF added for one battle to the creature whose element beats the other's */
  elementBonus: number;
  /** PLAY actions allowed per turn, 1 to HAND_SIZE */
  playsPerTurn: number;
};
```

In `MatchState` replace the `hasPlayed` field and its comment with:

```ts
  /** PLAY actions the active player has made this turn */
  playsUsed: number;
```

In `PlayerView` replace `hasPlayed: boolean;` with `playsUsed: number;`.

`packages/engine/src/rules.ts` — replace `DEFAULT_RULES` and `makeRules` (they must come after `HAND_SIZE`, which they do):

```ts
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ elementBonus: 500, playsPerTurn: 2 });

/** DEFAULT_RULES with `overrides` applied, as a new object. Throws for an invalid value. */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules: Rules = { ...DEFAULT_RULES, ...overrides };
  if (!Number.isInteger(rules.elementBonus) || rules.elementBonus < 0) {
    throw new Error(`invalid rule elementBonus: ${rules.elementBonus}`);
  }
  // the hand does not refill during a turn, so HAND_SIZE plays is as many as a turn can hold
  if (!Number.isInteger(rules.playsPerTurn) || rules.playsPerTurn < 1 || rules.playsPerTurn > HAND_SIZE) {
    throw new Error(`invalid rule playsPerTurn: ${rules.playsPerTurn}`);
  }
  return rules;
}
```

`packages/engine/src/match.ts` — in `startTurn` replace `draft.hasPlayed = false;` with `draft.playsUsed = 0;`; in `createMatch` replace `hasPlayed: false,` with `playsUsed: 0,`.

`packages/engine/src/play.ts` — in `playError` replace the `hasPlayed` line with:

```ts
  if (state.playsUsed >= state.rules.playsPerTurn) return "no plays left this turn";
```

and in `resolvePlay` replace `draft.hasPlayed = true;` with `draft.playsUsed += 1;`.

`packages/engine/src/legal.ts` — replace the comment and condition:

```ts
  // skipping this when no play is left is only a speed-up; the filter below would drop them anyway
  if (state.playsUsed < state.rules.playsPerTurn) {
```

`packages/engine/src/view.ts` — replace `hasPlayed: state.hasPlayed,` with `playsUsed: state.playsUsed,`.

- [ ] **Step 3: The `--plays` flag**

In `packages/bots/src/cli.ts`:

- add at the top: `import { makeRules, type Rules } from "@duel/engine";`
- in `USAGE` replace `[--element-bonus <n>]` with `[--element-bonus <n>] [--plays <1-5>]`
- add to the `parseArgs` options: `plays: { type: "string" },`
- replace the `const rules = ...` statement with:

```ts
const rules: Partial<Rules> = {};
if (values["element-bonus"] !== undefined) rules.elementBonus = wholeNumber(values["element-bonus"], "element-bonus");
if (values.plays !== undefined) rules.playsPerTurn = wholeNumber(values.plays, "plays");
try {
  makeRules(rules);
} catch (error) {
  fail((error as Error).message);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --plays 1`
Expected: `First player win rate: 60.0%`, `Turns: average 9.7, max 17` (the regression check).

Run: `pnpm -s sim --a smart --b smart --games 50`, the same with `--plays 5`, and `pnpm -s sim --a random --b random --games 50`
Expected: 0 errors in each.

Run: `pnpm -s sim --plays 6`
Expected: `invalid rule playsPerTurn: 6` and the usage text.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R2: plays per turn is now the rule setting playsPerTurn (default 2, 1 to 5); hasPlayed became the counter playsUsed in the state and the view; pnpm sim gained --plays (tactics phase 1, task 2, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): plays per turn as a rule setting

Closes #N"
```

---

### Task 3: Measure, and bring the docs in step

**Files:**
- Modify: `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-12-online-card-duel-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0009-tactics-combination-over-raw-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: `--plays` (task 2), the measures of phase 0.
- Produces: the phase 1 results table.

- [ ] **Step 1: Run the comparison**

For each of `--plays 1`, `--plays 2`, `--plays 5`, run with `--games 500`:

```bash
pnpm -s sim --a smart --b smart --plays <n> --games 500
pnpm -s sim --a greedy --b wide --plays <n> --games 500
pnpm -s sim --a smart --b wide --plays <n> --games 500
pnpm -s sim --a smart --b greedy --plays <n> --games 500
pnpm -s sim --a smart --b smart --deck-a flame --deck-b strongest --plays <n> --games 500
```

Expected: 0 errors in each of the 15 runs.

- [ ] **Step 2: Record it in the tactics spec**

In `docs/specs/2026-11-13-tactics-rules-design.md`, add under `## Revisions` a section `### <today's date>: phase 1 results (R1 and R2)` holding:

- one table per matchup with a row for each plays value and the columns: win rate of the first-named bot; first-player win rate; average turns; deck-out share; comebacks; lead changes; fusion share (values copied from the output);
- the section 6 target table again, with the smart-versus-smart numbers at 2 plays next to the phase 0 baseline;
- two or three lines on what moved and what did not, and which plays value the numbers favour;
- the planning decision: a `PLAY` onto a creature that already attacked must keep its position, and any other position is rejected.

- [ ] **Step 3: Bring the other docs in step**

- `docs/specs/2026-11-12-online-card-duel-design.md`, `Revisions`: add an entry with today's date: section 4.4 now reads "`PLAY` at most `playsPerTurn` times per turn (2 by default)" and "`SET_POSITION` any number of times for a creature that has not attacked this turn"; section 4.5 gains "a `PLAY` onto a creature that already attacked must keep that creature's position".
- `docs/specs/2026-11-13-engine-high-level-design.md`, `Revisions`: add an entry: `positionChanged` is gone; `hasPlayed` is `playsUsed`; `Rules` has `playsPerTurn`.
- `docs/ddr/0009-tactics-combination-over-raw-stats.md`: set `Last updated`; in Implementation say R1 and R2 are implemented (`actions.ts`, `play.ts`, `rules.ts`) and R3 to R6 are not; in the known gap, replace "nothing is implemented" with what the phase 1 numbers show.
- `CLAUDE.md`: Status gains "Tactics phase 1 (R1 free position changes, R2 plays per turn) is implemented."; the `pnpm sim` line gains "`--plays` sets plays per turn"; add this plan to the "Read first" table.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Append to `HISTORY.md`:
`- **[docs]** Recorded the phase 1 results (plays per turn 1, 2 and 5) in docs/specs/2026-11-13-tactics-rules-design.md and updated the approved spec's Revisions, the engine high-level design, DDR-0009 and CLAUDE.md for R1 and R2 (tactics phase 1, task 3, #N).`

```bash
git add docs CLAUDE.md HISTORY.md
git commit -m "docs: phase 1 results and docs in step with the code

Closes #N"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| R1: any number of position changes; none after the creature attacked | 1 |
| R1: removes the `positionChanged` flag | 1 |
| R1: a `PLAY` onto a creature that already attacked keeps its position | 1 (as a rejection; see "Decisions made while planning") |
| R2: `PLAYS_PER_TURN = 2`; `hasPlayed` becomes a counter `playsUsed` | 2 |
| R2 and section 6: compare 1, 2 and unlimited plays | 2 (`--plays`), 3 (the runs; 5 is unlimited) |
| Section 8, phase 1: R1 + R2 | 1, 2 |
| DDR-0009: a value is accepted by simulator results | 3 |

## Not in this plan

- R3 (wear) and later rules. Phase 2 is the next plan.
- Any change to the bots' strategy. The greedy, wide and smart bots already ask again while a play is legal, so they use a second play without changes. If task 3 shows a bot wasting its second play, that is noted in the results, not fixed here.
- Plans 2 and 3.

## Revisions

### 2026-11-13

- Approved by the owner after the phase 0 PR (#50) and the docs PR (#40) were merged. Issues: task 1 is #51, task 2 #52, task 3 #53 (milestone "Tactics phase 1: Positions and plays"). Read `#N` in a task as that task's issue.
- Implemented on one branch, `feat/tactics-phase-1`, one commit per task.

