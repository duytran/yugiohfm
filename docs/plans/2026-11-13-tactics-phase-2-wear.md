# Tactics Phase 2 (Wear) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rule R3 (wear: a creature that survives a battle is weaker for the rest of the turn), give previews the real battle code so bots can plan a gang-up, add the `firstTurnPlays` setting for the first-player edge, and measure all of it against phase 1.

**Architecture:** `Creature` gains `wear`, which `effectiveStats` subtracts. `battleOutcome` reports the wear a surviving target takes, and `resolveAttack` applies it, emits a public `worn` event and returns the outcome. Turn start clears wear on both sides. Previews move to a new file, `preview.ts`: it rebuilds a `MatchState` from a `PlayerView` and runs `resolveAttack` itself, so a preview of one attack or a series can never disagree with the match. The smart bot plans gang-ups with that series preview. `firstTurnPlays` is one more rule setting, read through a new `playsAllowed(state)`.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-tactics-rules-design.md`, R3 (section 4), experiment settings (section 6), phase 2 (section 8), the phase 1 results in its `Revisions`.

## Global Constraints

- Rules live only in `packages/engine`; it imports nothing outside its own files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- Bots see only a `PlayerView`, import only from `@duel/engine`, and return one of `legal` (DDR-0006).
- Only the engine works out current ATK and DEF and battle results; bots may score options (DDR-0010).
- A rule value is a setting the simulator can vary, and is accepted only by simulator results (DDR-0009). `wearRatio` defaults to 1 (the spec's first-run value); `firstTurnPlays` defaults to `playsPerTurn`, so it changes nothing until the owner picks a value.
- **Order of a battle value (owner's decision, 2026-11-13):** base value, plus synergy, minus wear, never below 0. That is the current value the view shows. The element bonus is added in battle on top of it. (DDR-0009 is edited to say this in the same commit as this plan.)
- **A failed attack still costs life points** (owner's decision, 2026-11-13): the attacker's owner takes normal battle damage against the target's current, worn value.
- Pillars that must not change: draw up to 5 every turn; the first player cannot attack on turn 1 (DDR-0009).
- Regression check: with `--wear 0` and no `--first-plays`, every task must reproduce the phase 1 numbers exactly:
  - `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --wear 0` prints `First player win rate: 40.0%` and `Turns: average 5.9, max 8`.
  - `pnpm -s sim --a smart --b smart --games 100 --wear 0` prints `First player win rate: 59.0%` and `Turns: average 7.0, max 14`.
- Speed budget: `pnpm -s sim --a smart --b smart --games 100` took 3.4 s before this plan. It must stay under 15 s.
- All content is original (DDR-0008). Imports inside a package are extensionless; packages import each other only by name.
- Every task: test first, one commit, one `HISTORY.md` line in the same commit, one GitHub issue, `Closes #N` in the commit message. Issue numbers are listed in `Revisions` at the bottom.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## Decisions made while planning

- **Only the target is worn.** The spec says a creature is worn by "the attack value it just withstood". The attacker withstands nothing: an attacker that bounces off a defense-position target takes damage but no wear.
- **The withstood value is the battle's attack value, element bonus included**, and the wear is that value times `wearRatio`, rounded down.
- **Wear is cleared from both fields at the start of every turn.** Wear is only ever put on the defending side, during the attacker's turn, so a creature's owner never acts while it is worn.
- **A `PLAY` onto a worn creature keeps its wear**, like `hasAttacked`, so a play can never heal. By the rule above this cannot happen today; the line keeps it true if that changes.
- **`wearRatio` must be a number from 0 to 1.** The spec compares 0, 0.5 and 1.
- **`firstTurnPlays` must be a whole number from 1 to `playsPerTurn`.** It applies on turn 1 only, which is always the first player's.
- **Previews run the real battle code.** `previewAttack` used to compare the view's numbers with its own arithmetic. It now builds a `MatchState` from the view and calls `resolveAttack` on it. The view's numbers come from the same `effectiveStats`, so nothing changes for today's callers, and a series preview needs wear, destruction and (in phase 4) synergy to follow each attack, which only the real code does. A test that edited a view's `atk` to steer the preview is replaced.
- **The smart bot plans gang-ups of up to 3 attacks on one target**: up to two of its weakest creatures wear the target down, then one finisher destroys it. It looks at finishers strongest first, which picks the weakest wearer when two plans score the same. It only replaces the best single attack with a plan that scores strictly higher, so with `wearRatio: 0` it plays exactly as before.

## File Structure

| File | Change |
|---|---|
| `packages/engine/src/types.ts` | `Creature.wear`, `ViewCreature.wear`, `Rules.wearRatio`, `Rules.firstTurnPlays`, `worn` event |
| `packages/engine/src/rules.ts` | defaults and checks for both settings; `playsAllowed` |
| `packages/engine/src/values.ts` | `effectiveStats` subtracts wear |
| `packages/engine/src/battle.ts` | `BattleOutcome.targetWear`; `resolveAttack` applies wear and returns the outcome; `previewAttack` moves out |
| `packages/engine/src/preview.ts` (new) | `stateFromView`, `previewAttacks`, `previewAttack` |
| `packages/engine/src/match.ts` | turn start clears wear |
| `packages/engine/src/play.ts`, `legal.ts` | keep wear on a play; plays allowed per turn |
| `packages/engine/src/index.ts` | exports |
| `packages/bots/src/smart.ts` | `planScore`, `bestAttack` (gang-ups) |
| `packages/bots/src/cli.ts`, `replay.ts` | `--wear`, `--first-plays`; the `worn` event |

---

### Task 1: Wear in the engine

**Files:**
- Modify: `packages/engine/src/types.ts`, `rules.ts`, `values.ts`, `battle.ts`, `match.ts`, `play.ts`
- Modify: `packages/bots/src/smart.ts`, `cli.ts`, `replay.ts`
- Test: `packages/engine/test/helpers.ts`, `rules.test.ts`, `values.test.ts`, `battle.test.ts`, `match.test.ts`, `view.test.ts`; `packages/bots/test/bots.test.ts`, `wide.test.ts`, `smart.test.ts`, `runMatch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Creature.wear: number`, `ViewCreature.wear: number`.
  - `Rules.wearRatio: number` (default 1, 0 to 1); `makeRules` throws `invalid rule wearRatio: <v>`.
  - `GameEvent` gains `{ type: "worn"; player: PlayerId; slot: number; amount: number }`; `player` owns the worn creature.
  - `BattleOutcome.targetWear: number`: wear the target takes; 0 when it is destroyed or for a direct attack.
  - `resolveAttack(draft, player, action, events): BattleOutcome` (it returned `void`).
  - `pnpm sim --wear <0-1>`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/helpers.ts` — `creature` gains wear:

```ts
export function creature(cardId: CardId, position: Position = "attack"): Creature {
  return { cardId, position, hasAttacked: false, wear: 0 };
}
```

`packages/engine/test/rules.test.ts` — replace the two default tests and add one:

```ts
  it("defaults to an element bonus of 500, 2 plays per turn and a wear ratio of 1", () => {
    expect(makeRules()).toEqual({ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000, playsPerTurn: 2, wearRatio: 1 });
    expect(makeRules({ wearRatio: 0.5 })).toEqual({ elementBonus: 500, playsPerTurn: 2, wearRatio: 0.5 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 });
  });

  it("rejects a wear ratio outside 0 to 1", () => {
    expect(() => makeRules({ wearRatio: -0.5 })).toThrow("invalid rule wearRatio: -0.5");
    expect(() => makeRules({ wearRatio: 1.5 })).toThrow("invalid rule wearRatio: 1.5");
    expect(() => makeRules({ wearRatio: Number.NaN })).toThrow("invalid rule wearRatio: NaN");
    expect(makeRules({ wearRatio: 0 }).wearRatio).toBe(0);
  });
```

`packages/engine/test/values.test.ts` — add:

```ts
  it("subtracts wear from ATK and DEF, never below 0", () => {
    const state = makeState({
      p0: { field: field({ 0: { ...creature("ash-duelist"), wear: 500 }, 1: { ...creature("ember-fox"), wear: 2000 } }) },
    });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1000, def: 600 });
    expect(effectiveStats(state, 0, 1)).toEqual({ atk: 0, def: 0 });
  });
```

`packages/engine/test/battle.test.ts`:

- import `effectiveStats` from `../src/values`;
- in `describe("battleOutcome", ...)`, add `targetWear: 0` to the three `toEqual` objects (destroyed target in attack position, destroyed target in defense position, direct);
- add:

```ts
describe("wear (R3)", () => {
  /** Player 1's Ancient Tyrant (flame 3000/2500) against three flame attackers: no element bonus anywhere. */
  function titan(wearRatio = 1): MatchState {
    return makeState({
      rules: { ...DEFAULT_RULES, wearRatio },
      p0: { field: field({ 0: creature("cinder-whelp"), 1: creature("pyre-adept"), 2: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ancient-tyrant") }) },
    });
  }

  it("wears a surviving target down by the attack value it withstood", () => {
    const state = titan();
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events); // 1400 against 3000
    expect(state.players[1].field[0]?.wear).toBe(1400);
    expect(effectiveStats(state, 1, 0)).toEqual({ atk: 1600, def: 1100 });
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 0, slot: 0, cardId: "cinder-whelp" },
      { type: "worn", player: 1, slot: 0, amount: 1400 },
      { type: "damage", player: 0, amount: 1600 },
    ]);
  });

  it("lets three small creatures bring down a big one (the spec's worked example)", () => {
    const state = titan();
    resolveAttack(state, 0, attack(0, 0), []); // 1400 vs 3000: you take 1600, Titan now 1600
    resolveAttack(state, 0, attack(1, 0), []); // 1300 vs 1600: you take 300, Titan now 300
    resolveAttack(state, 0, attack(2, 0), []); // 1500 vs 300: Titan destroyed, they take 1200
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(2100);
    expect(state.players[1].lifePoints).toBe(2800);
  });

  it("wears a target in defense position that holds", () => {
    const state = duel("ember-fox", "furnace-drone", "defense"); // 1200 vs DEF 1500
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(effectiveStats(state, 1, 0)).toEqual({ atk: 0, def: 300 });
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "worn", player: 1, slot: 0, amount: 1200 },
      { type: "damage", player: 0, amount: 300 },
    ]);
  });

  it("never wears the attacker", () => {
    const state = duel("ember-fox", "furnace-drone", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]?.wear).toBe(0);
  });

  it("uses the match's wear ratio", () => {
    const half = titan(0.5);
    resolveAttack(half, 0, attack(1, 0), []); // 1300 x 0.5
    expect(half.players[1].field[0]?.wear).toBe(650);
    const none = titan(0);
    const events: GameEvent[] = [];
    resolveAttack(none, 0, attack(1, 0), events);
    expect(none.players[1].field[0]?.wear).toBe(0);
    expect(events.some((e) => e.type === "worn")).toBe(false);
  });

  it("adds the element bonus after wear, so a creature worn to 0 still gets it", () => {
    // forest beats wind: Moss Boar worn to 0 still defends at 0 + 500
    const state = makeState({
      p0: { field: field({ 0: creature("gale-falcon") }) },
      p1: { field: field({ 0: { ...creature("moss-boar"), wear: 1300 } }) },
    });
    const outcome = resolveAttack(state, 0, attack(0, 0), []);
    expect(outcome).toMatchObject({ attack: 1500, defense: 500, targetDestroyed: true, damageToOpponent: 1000 });
  });

  it("returns the outcome it applied", () => {
    const outcome = resolveAttack(titan(), 0, attack(0, 0), []);
    expect(outcome).toEqual({
      attack: 1400,
      defense: 3000,
      attackerDestroyed: true,
      targetDestroyed: false,
      damageToSelf: 1600,
      damageToOpponent: 0,
      targetWear: 1400,
    });
  });
});
```

`packages/engine/test/match.test.ts` — add inside the `startTurn` tests (next to `"clears the per-turn flags of the active player"`):

```ts
  it("clears wear from both players' creatures", () => {
    const state = makeState({
      p0: { field: field({ 0: { ...creature("ember-fox"), wear: 500 } }) },
      p1: { field: field({ 2: { ...creature("moss-boar"), wear: 300 } }) },
    });
    const next = applyAction(state, 0, { type: "END_TURN" });
    if (!next.ok) throw new Error(next.error);
    expect(next.state.players[0].field[0]?.wear).toBe(0);
    expect(next.state.players[1].field[2]?.wear).toBe(0);
  });
```

(Import `applyAction` from `../src/actions` if the file does not already.)

`packages/engine/test/view.test.ts` — in the expected objects add `wear: 0` to both creatures, and change `rules` to `{ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 }`. Add:

```ts
  it("shows a worn creature's lowered values and its wear", () => {
    const worn = makeState({ p1: { field: field({ 0: { ...creature("stone-ram"), wear: 400 } }) } });
    expect(viewFor(worn, 0).opponent.field[0]).toEqual({
      hidden: false,
      cardId: "stone-ram",
      position: "attack",
      hasAttacked: false,
      wear: 400,
      atk: 1000,
      def: 1100,
    });
  });
```

Bot tests — in `packages/bots/test/bots.test.ts`, `wide.test.ts` and `smart.test.ts`, the `on` helper gains `wear: 0` after `hasAttacked: false`. In `runMatch.test.ts` the two expected rules become `{ elementBonus: 1000, playsPerTurn: 2, wearRatio: 1 }` and `{ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `wear` missing from creatures and rules, no `worn` event, `resolveAttack` returns undefined, and typecheck errors in the bots for `wear`.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`:

```ts
export type Rules = {
  /** ATK and DEF added for one battle to the creature whose element beats the other's */
  elementBonus: number;
  /** PLAY actions allowed per turn, 1 to HAND_SIZE */
  playsPerTurn: number;
  /** Share of a withstood attack value that a surviving target loses from ATK and DEF until the turn ends (R3), 0 to 1 */
  wearRatio: number;
};

export type Creature = {
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  /** ATK and DEF lost to battles survived this turn (R3); cleared at the start of every turn */
  wear: number;
};

export type ViewCreature = {
  hidden: false;
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  wear: number;
  atk: number;
  def: number;
};
```

and add to `GameEvent`, after `destroyed`:

```ts
  | { type: "worn"; player: PlayerId; slot: number; amount: number }
```

`packages/engine/src/rules.ts`:

```ts
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 });
```

and in `makeRules`, before `return rules;`:

```ts
  if (!Number.isFinite(rules.wearRatio) || rules.wearRatio < 0 || rules.wearRatio > 1) {
    throw new Error(`invalid rule wearRatio: ${rules.wearRatio}`);
  }
```

`packages/engine/src/values.ts` — replace the body's return and update the doc comment:

```ts
/**
 * The current ATK and DEF of the creature in `slot`: printed value minus wear,
 * never below 0. A battle adds the element bonus on top (DDR-0009). This is the
 * only place those values are worked out (DDR-0010): views, battles and
 * previews all read it.
 */
export function effectiveStats(state: MatchState, player: PlayerId, slot: number): { atk: number; def: number } {
  const creature = state.players[player].field[slot];
  if (!creature) throw new Error(`no creature in slot ${slot}`);
  const card = getCard(creature.cardId);
  return { atk: Math.max(0, card.atk - creature.wear), def: Math.max(0, card.def - creature.wear) };
}
```

`packages/engine/src/battle.ts`:

- `BattleOutcome` gains, after `damageToOpponent`:

```ts
  /** ATK and DEF the target loses for the rest of the turn; 0 if it is destroyed or for a direct attack */
  targetWear: number;
```

- `battleOutcome` becomes:

```ts
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
      targetWear: 0,
    };
  }
  const { attack, defense } = battleValues(attacker, target.combatant, target.position, rules);
  const damageToSelf = Math.max(0, defense - attack);
  // a target that survives is worn by the attack it withstood (R3)
  const wearIfSurvives = Math.floor(rules.wearRatio * attack);
  if (target.position === "attack") {
    const targetDestroyed = attack >= defense;
    return {
      attack,
      defense,
      attackerDestroyed: attack <= defense,
      targetDestroyed,
      damageToSelf,
      damageToOpponent: Math.max(0, attack - defense),
      targetWear: targetDestroyed ? 0 : wearIfSurvives,
    };
  }
  const targetDestroyed = attack > defense;
  return {
    attack,
    defense,
    attackerDestroyed: false,
    targetDestroyed,
    damageToSelf,
    damageToOpponent: 0,
    targetWear: targetDestroyed ? 0 : wearIfSurvives,
  };
}
```

- `resolveAttack` returns the outcome and applies wear between destruction and damage:

```ts
/** Mutates `draft` and returns what happened. The caller must have checked attackError first. */
export function resolveAttack(
  draft: MatchState,
  player: PlayerId,
  action: AttackAction,
  events: GameEvent[],
): BattleOutcome {
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
  if (action.target !== "direct" && outcome.targetWear > 0) {
    draft.players[enemy].field[action.target]!.wear += outcome.targetWear;
    events.push({ type: "worn", player: enemy, slot: action.target, amount: outcome.targetWear });
  }
  if (outcome.damageToOpponent > 0) dealDamage(draft, enemy, outcome.damageToOpponent, events);
  if (outcome.damageToSelf > 0) dealDamage(draft, player, outcome.damageToSelf, events);
  return outcome;
}
```

- `fromView` builds a `Combatant` from a `ViewCreature`; it is unchanged in this task.

`packages/engine/src/match.ts` — in `startTurn`, replace the `for (const creature of player.field)` loop:

```ts
  for (const creature of player.field) {
    if (creature) creature.hasAttacked = false;
  }
  // wear lasts for the rest of the turn it was taken in (R3)
  for (const side of draft.players) {
    for (const creature of side.field) {
      if (creature) creature.wear = 0;
    }
  }
```

`packages/engine/src/play.ts` — in `resolvePlay`, the new creature:

```ts
  me.field[action.slot] = {
    cardId: chain.result,
    position: action.position,
    // a creature that already attacked cannot attack again by being fused onto
    hasAttacked: previous?.hasAttacked ?? false,
    // a play never heals wear
    wear: previous?.wear ?? 0,
  };
```

`packages/bots/src/smart.ts` — in `afterPlay`, the hypothetical creature gains `wear: 0,` after `hasAttacked: false,`.

`packages/bots/src/replay.ts` — add a case before `damage`:

```ts
    case "worn":
      return `  ${who(event.player)} slot ${event.slot} worn by ${event.amount}`;
```

`packages/bots/src/cli.ts`:

- `USAGE` second line: `[--games <n>] [--seed <n>] [--element-bonus <n>] [--plays <1-5>] [--wear <0-1>] [--replay <seed>]`
- add a parser below `wholeNumber`:

```ts
function fraction(text: string, flag: string): number {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) fail(`--${flag} must be a number, got "${text}"`);
  return value;
}
```

- in `parseArgs` options: `wear: { type: "string" },`
- after the `--plays` line: `if (values.wear !== undefined) rules.wearRatio = fraction(values.wear, "wear");`

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --wear 0`
Expected: `First player win rate: 40.0%`, `Turns: average 5.9, max 8` (regression check).

Run: `pnpm -s sim --a smart --b smart --games 100 --wear 0`
Expected: `First player win rate: 59.0%`, `Turns: average 7.0, max 14`.

Run: `pnpm -s sim --a smart --b smart --games 50` and `pnpm -s sim --a random --b random --games 50`
Expected: 0 errors.

Run: `pnpm -s sim --wear 2`
Expected: `invalid rule wearRatio: 2` and the usage text.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R3: a creature that survives a battle is worn by the attack value it withstood (times wearRatio, default 1) until the turn ends; new worn event; resolveAttack returns its outcome; pnpm sim gained --wear (tactics phase 2, task 1, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): wear from surviving a battle

Closes #N"
```

---

### Task 2: Previews run the real battle code, one attack or a series

**Files:**
- Create: `packages/engine/src/preview.ts`, `packages/engine/test/preview.test.ts`
- Modify: `packages/engine/src/battle.ts`, `index.ts`
- Modify: `packages/engine/test/battle.test.ts` (the `previewAttack` block moves out)

**Interfaces:**
- Consumes: `resolveAttack(...): BattleOutcome` and `BattleOutcome.targetWear` (task 1).
- Produces:
  - `stateFromView(view: PlayerView): MatchState` — internal to the engine (not exported from `index.ts`).
  - `previewAttacks(view: PlayerView, attacks: readonly AttackAction[]): BattleOutcome[] | { error: string; index: number }` — exported.
  - `previewAttack(view, action): BattleOutcome | { error: string }` — same signature as before, now in `preview.ts`.

- [ ] **Step 1: Write the failing tests**

Delete the whole `describe("previewAttack", ...)` block from `packages/engine/test/battle.test.ts`, and drop `previewAttack` and `viewFor` from its imports if nothing else uses them.

Create `packages/engine/test/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAttack } from "../src/battle";
import { previewAttack, previewAttacks, stateFromView } from "../src/preview";
import { DEFAULT_RULES } from "../src/rules";
import type { AttackAction, MatchState } from "../src/types";
import { viewFor } from "../src/view";
import { creature, field, makeState } from "./helpers";

function attack(attackerSlot: number, target: number | "direct"): AttackAction {
  return { type: "ATTACK", attackerSlot, target };
}

function duel(mine: string, theirs: string, theirPosition: "attack" | "defense" = "attack"): MatchState {
  return makeState({
    p0: { field: field({ 0: creature(mine) }) },
    p1: { field: field({ 0: creature(theirs, theirPosition) }) },
  });
}

describe("stateFromView", () => {
  it("rebuilds the fields, life points and rules the view shows, for either seat", () => {
    const state = makeState({
      active: 1,
      p0: { field: field({ 1: { ...creature("stone-ram"), wear: 300 } }), lifePoints: 2500 },
      p1: { hand: ["ember-fox"], field: field({ 0: creature("moss-boar", "defense") }) },
    });
    const rebuilt = stateFromView(viewFor(state, 1));
    expect(rebuilt.players[0].field).toEqual(state.players[0].field);
    expect(rebuilt.players[1].field).toEqual(state.players[1].field);
    expect(rebuilt.players[1].hand).toEqual(["ember-fox"]);
    expect(rebuilt.players[0].hand).toEqual([]);
    expect(rebuilt.players[0].lifePoints).toBe(2500);
    expect(rebuilt.rules).toEqual(state.rules);
    expect(rebuilt.active).toBe(1);
  });
});

describe("previewAttack", () => {
  it("uses the view's rules for the element bonus", () => {
    const state = makeState({
      rules: { ...DEFAULT_RULES, elementBonus: 1000 },
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: creature("moss-boar") }) },
    });
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 2200, defense: 1300 });
  });

  it("sees wear already on the board", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ember-fox") }) },
      p1: { field: field({ 0: { ...creature("ash-duelist"), wear: 500 } }) },
    });
    // 1200 against 1500 - 500
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toMatchObject({ attack: 1200, defense: 1000, targetDestroyed: true });
  });

  it("returns an error when a creature is missing", () => {
    const view = viewFor(duel("ember-fox", "ash-duelist"), 0);
    expect(previewAttack(view, attack(3, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(9, 0))).toEqual({ error: "no creature in that slot" });
    expect(previewAttack(view, attack(0, 2))).toEqual({ error: "no creature in the target slot" });
  });

  it("never changes the view", () => {
    const view = viewFor(duel("ash-duelist", "ember-fox"), 0);
    const before = structuredClone(view);
    previewAttack(view, attack(0, 0));
    expect(view).toEqual(before);
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
      expect(resolveAttack(state, 0, attack(0, 0), []), `${mine} -> ${theirs}`).toEqual(preview);
    }
  });
});

describe("previewAttacks", () => {
  const titan = () =>
    makeState({
      p0: { field: field({ 0: creature("cinder-whelp"), 1: creature("pyre-adept"), 2: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ancient-tyrant") }) },
    });

  it("lets each attack see the wear, losses and damage of the ones before it", () => {
    const result = previewAttacks(viewFor(titan(), 0), [attack(0, 0), attack(1, 0), attack(2, 0)]);
    if ("error" in result) throw new Error(result.error);
    expect(result.map((o) => [o.attack, o.defense, o.targetDestroyed])).toEqual([
      [1400, 3000, false],
      [1300, 1600, false],
      [1500, 300, true],
    ]);
    expect(result[2]!.damageToOpponent).toBe(1200);
  });

  it("names the first attack that cannot be previewed", () => {
    // the first attack destroys the attacker in slot 0, so it cannot attack again
    expect(previewAttacks(viewFor(titan(), 0), [attack(0, 0), attack(0, 0)])).toEqual({
      error: "no creature in that slot",
      index: 1,
    });
  });

  it("stops after an attack that ends the match", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ember-fox") }) }, p1: { lifePoints: 1000 } });
    expect(previewAttacks(viewFor(state, 0), [attack(0, "direct"), attack(1, "direct")])).toEqual({
      error: "the match is over",
      index: 1,
    });
  });

  it("returns an empty list for no attacks", () => {
    expect(previewAttacks(viewFor(titan(), 0), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/preview.test.ts`
Expected: FAIL — cannot find `../src/preview`.

- [ ] **Step 3: Implement**

Create `packages/engine/src/preview.ts`:

```ts
import { resolveAttack, type BattleOutcome } from "./battle";
import { opponent } from "./rules";
import type { AttackAction, Creature, MatchState, PlayerState, PlayerView, ViewCreature } from "./types";

function toCreature(creature: ViewCreature | null): Creature | null {
  if (!creature) return null;
  return { cardId: creature.cardId, position: creature.position, hasAttacked: creature.hasAttacked, wear: creature.wear };
}

/**
 * A MatchState holding what `view` shows, for previews only. The zones the
 * viewer cannot see (the opponent's hand, both decks) are empty: no battle
 * reads them.
 */
export function stateFromView(view: PlayerView): MatchState {
  const self: PlayerState = {
    deck: [],
    hand: [...view.self.hand],
    field: view.self.field.map(toCreature),
    lifePoints: view.self.lifePoints,
  };
  const other: PlayerState = {
    deck: [],
    hand: [],
    field: view.opponent.field.map(toCreature),
    lifePoints: view.opponent.lifePoints,
  };
  return {
    players: view.you === 0 ? [self, other] : [other, self],
    active: view.active,
    firstPlayer: view.firstPlayer,
    turn: view.turn,
    playsUsed: view.playsUsed,
    result: view.result,
    rules: { ...view.rules },
  };
}

/**
 * What a series of attacks by the viewer would do, one after the other. It
 * runs the same code as a real attack, on a copy rebuilt from the view, so a
 * preview never disagrees with the match: each attack sees the creatures the
 * earlier ones destroyed, their wear and their damage. It checks only that the
 * creatures exist; whether an attack is legal now is for legalActions.
 */
export function previewAttacks(
  view: PlayerView,
  attacks: readonly AttackAction[],
): BattleOutcome[] | { error: string; index: number } {
  const state = stateFromView(view);
  const me = view.you;
  const enemy = opponent(me);
  const outcomes: BattleOutcome[] = [];
  for (const [index, action] of attacks.entries()) {
    if (state.result) return { error: "the match is over", index };
    if (!state.players[me].field[action.attackerSlot]) return { error: "no creature in that slot", index };
    if (action.target !== "direct" && !state.players[enemy].field[action.target]) {
      return { error: "no creature in the target slot", index };
    }
    outcomes.push(resolveAttack(state, me, action, []));
  }
  return outcomes;
}

/** What one attack would do, worked out from a view. See previewAttacks. */
export function previewAttack(view: PlayerView, action: AttackAction): BattleOutcome | { error: string } {
  const result = previewAttacks(view, [action]);
  return "error" in result ? { error: result.error } : result[0]!;
}
```

`packages/engine/src/battle.ts` — delete `fromView` and `previewAttack`, and drop `PlayerView` and `ViewCreature` from its type imports.

`packages/engine/src/index.ts` — replace the battle export line:

```ts
export { type BattleOutcome } from "./battle";
export { previewAttack, previewAttacks } from "./preview";
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass. The bots still import `previewAttack` from `@duel/engine` and need no change.

Run: `pnpm -s sim --a smart --b smart --games 100 --wear 0` and `pnpm -s sim --a greedy --b greedy --games 20 --seed 1 --wear 0`
Expected: the regression numbers in Global Constraints.

Run: `time pnpm -s sim --a smart --b smart --games 100`
Expected: under 15 s.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Previews now rebuild a state from the view and run resolveAttack itself, so they cannot disagree with the match; new previewAttacks previews a series of attacks with wear, losses and damage carried between them (tactics phase 2, task 2, DDR-0010, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): previews run the real battle code, one attack or a series

Closes #N"
```

---

### Task 3: The smart bot plans gang-ups

**Files:**
- Modify: `packages/bots/src/smart.ts`, `index.ts`
- Test: `packages/bots/test/smart.test.ts`

**Interfaces:**
- Consumes: `previewAttacks` (task 2).
- Produces:
  - `planScore(view: PlayerView, plan: readonly AttackAction[]): number` — exported.
  - `attackScore(view, action)` stays, as `planScore(view, [action])`.
  - `GANG_SIZE = 3` and `bestAttack(view: PlayerView, legal: readonly Action[]): AttackAction | null` — exported.

- [ ] **Step 1: Write the failing tests**

In `packages/bots/test/smart.test.ts`, extend the import to `import { GANG_SIZE, attackScore, bestAttack, planScore, smartBot, smartPlay, threat } from "../src/smart";` and add:

```ts
describe("planScore", () => {
  it("adds up a series of attacks the engine previews one after the other", () => {
    // thunder against thunder, no element bonus. Steel Wyrm 2400.
    const v = view({ mine: [on("static-drakeling"), on("thunder-roc"), null, null, null], theirs: [on("steel-wyrm"), null, null, null, null] });
    const wear: AttackAction = { type: "ATTACK", attackerSlot: 0, target: 0 };
    const finish: AttackAction = { type: "ATTACK", attackerSlot: 1, target: 0 };
    // 1300 vs 2400: lose 1300 and take 1100, Wyrm now 1100. 1700 vs 1100: win 2400 and deal 600.
    expect(planScore(v, [wear, finish])).toBe(-1300 - 1100 + 2400 + 600);
    expect(planScore(v, [finish])).toBe(attackScore(v, finish));
  });

  it("is Infinity when the series deals lethal damage and -Infinity when it cannot be previewed", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirLife: 1000 });
    expect(planScore(v, [{ type: "ATTACK", attackerSlot: 0, target: "direct" }])).toBe(Infinity);
    expect(planScore(v, [{ type: "ATTACK", attackerSlot: 3, target: "direct" }])).toBe(-Infinity);
  });
});

describe("bestAttack", () => {
  const steel = () =>
    view({ mine: [on("static-drakeling"), on("thunder-roc"), null, null, null], theirs: [on("steel-wyrm"), null, null, null, null] });
  const attacks: Action[] = [
    { type: "ATTACK", attackerSlot: 0, target: 0 },
    { type: "ATTACK", attackerSlot: 1, target: 0 },
    END,
  ];

  it("starts a gang-up with its weakest creature when no single attack pays", () => {
    expect(GANG_SIZE).toBe(3);
    expect(bestAttack(steel(), attacks)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });
  });

  it("does not gang up when wear is off", () => {
    const v = { ...steel(), rules: { ...DEFAULT_RULES, wearRatio: 0 } };
    expect(bestAttack(v, attacks)).toBeNull();
  });

  it("prefers a single attack that pays over a gang-up that pays less", () => {
    const v = view({ mine: [on("static-drakeling"), on("thunder-roc"), null, null, null], theirs: [on("storm-caller"), null, null, null, null] });
    // Thunder Roc 1700 beats Storm Caller 1500 alone
    expect(bestAttack(v, attacks)).toEqual({ type: "ATTACK", attackerSlot: 1, target: 0 });
  });
});
```

(Add `type AttackAction` to the `@duel/engine` import of the test file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/bots/test/smart.test.ts`
Expected: FAIL — `planScore`, `bestAttack` and `GANG_SIZE` are not exported.

- [ ] **Step 3: Implement**

In `packages/bots/src/smart.ts`, import `previewAttacks` instead of `previewAttack` from `@duel/engine`, and replace `attackScore` with:

```ts
/**
 * How good a series of attacks is, from the engine's preview of the whole
 * series: damage dealt plus the ATK of destroyed targets, minus damage taken
 * and the ATK of lost attackers. Values are read from the view before the
 * series, so wearing a target down earns nothing until it is destroyed.
 * Infinity if it wins the match, -Infinity if it loses it or cannot be previewed.
 */
export function planScore(view: PlayerView, plan: readonly AttackAction[]): number {
  const previews = previewAttacks(view, plan);
  if ("error" in previews) return -Infinity;
  let dealt = 0;
  let taken = 0;
  let value = 0;
  previews.forEach((preview, i) => {
    const action = plan[i]!;
    dealt += preview.damageToOpponent;
    taken += preview.damageToSelf;
    if (preview.targetDestroyed && action.target !== "direct") value += view.opponent.field[action.target]!.atk;
    if (preview.attackerDestroyed) value -= view.self.field[action.attackerSlot]!.atk;
  });
  if (dealt >= view.opponent.lifePoints) return Infinity;
  if (taken >= view.self.lifePoints) return -Infinity;
  return dealt - taken + value;
}

/** How good one attack is; see planScore. */
export function attackScore(view: PlayerView, action: AttackAction): number {
  return planScore(view, [action]);
}

/** Most attacks on one target the bot plans together: wearers, then a finisher (R3). */
export const GANG_SIZE = 3;

/**
 * The attack to make now, or null if none scores above 0. Every legal attack
 * is a plan of its own. For each target, it also plans gang-ups: one finisher
 * (strongest first) after 1 to GANG_SIZE - 1 of the weakest other attackers,
 * where every attack but the last leaves the target standing and the last
 * destroys it. A plan replaces the best so far only when it scores strictly
 * higher, so with wear off the bot attacks exactly as it did before. Only the
 * plan's first attack is returned; the bot asks again after it.
 */
export function bestAttack(view: PlayerView, legal: readonly Action[]): AttackAction | null {
  const attacks = legal.filter((action): action is AttackAction => action.type === "ATTACK");
  let best: AttackAction | null = null;
  let bestScore = 0;
  for (const action of attacks) {
    const score = attackScore(view, action);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }

  const atkOf = (action: AttackAction) => view.self.field[action.attackerSlot]!.atk;
  const targets = new Set(attacks.flatMap((action) => (action.target === "direct" ? [] : [action.target])));
  for (const target of targets) {
    const onTarget = attacks.filter((action) => action.target === target);
    const weakestFirst = [...onTarget].sort((x, y) => atkOf(x) - atkOf(y));
    const strongestFirst = [...weakestFirst].reverse();
    for (const finisher of strongestFirst) {
      const others = weakestFirst.filter((action) => action !== finisher);
      for (let wearers = 1; wearers < GANG_SIZE && wearers <= others.length; wearers++) {
        const plan = [...others.slice(0, wearers), finisher];
        const previews = previewAttacks(view, plan);
        if ("error" in previews) continue;
        const wearsThenFinishes = previews.every((preview, i) => preview.targetDestroyed === (i === plan.length - 1));
        if (!wearsThenFinishes) continue;
        const score = planScore(view, plan);
        if (score > bestScore) {
          best = plan[0]!;
          bestScore = score;
        }
      }
    }
  }
  return best;
}
```

In `smartBot.chooseAction`, replace the `let best ... if (best) return best;` attack loop with:

```ts
    const attack = bestAttack(view, legal);
    if (attack) return attack;
```

Update the `smartBot` doc comment to: "Looks ahead through the engine's previews, one attack or a gang-up of up to GANG_SIZE attacks, so it follows whatever the battle rules are."

`packages/bots/src/index.ts` — the smart export line becomes:

```ts
export { GANG_SIZE, attackScore, bestAttack, planScore, smartBot, smartPlay, threat } from "./smart";
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a smart --b smart --games 100 --wear 0`
Expected: `First player win rate: 59.0%`, `Turns: average 7.0, max 14` (unchanged with wear off).

Run: `time pnpm -s sim --a smart --b smart --games 100`
Expected: 0 errors, under 15 s.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** The smart bot plans gang-ups: up to 3 attacks on one target (weakest wearers, then a finisher), scored by previewAttacks over the whole series; with wear off it plays exactly as before (tactics phase 2, task 3, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(bots): smart bot plans gang-ups with the series preview

Closes #N"
```

---

### Task 4: `firstTurnPlays`, a setting for the first-player edge

**Files:**
- Modify: `packages/engine/src/types.ts`, `rules.ts`, `play.ts`, `legal.ts`, `index.ts`
- Modify: `packages/bots/src/cli.ts`
- Test: `packages/engine/test/rules.test.ts`, `play.test.ts`, `legal.test.ts`, `view.test.ts`; `packages/bots/test/runMatch.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks besides `Rules`.
- Produces:
  - `Rules.firstTurnPlays: number`; `makeRules` defaults it to the match's `playsPerTurn` and throws `invalid rule firstTurnPlays: <v>` outside 1 to `playsPerTurn`.
  - `playsAllowed(state: MatchState): number` — exported from `rules.ts` and `index.ts`.
  - `pnpm sim --first-plays <n>`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/rules.test.ts` — every expected rules object gains `firstTurnPlays`; the defaults test and overrides test become:

```ts
  it("defaults to an element bonus of 500, 2 plays per turn (also on turn 1) and a wear ratio of 1", () => {
    expect(makeRules()).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
  });

  it("applies overrides without changing the defaults", () => {
    expect(makeRules({ elementBonus: 1000 })).toEqual({ elementBonus: 1000, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
    expect(makeRules({ wearRatio: 0.5 })).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 0.5 });
    expect(DEFAULT_RULES).toEqual({ elementBonus: 500, playsPerTurn: 2, firstTurnPlays: 2, wearRatio: 1 });
  });

  it("gives turn 1 as many plays as any turn unless told otherwise", () => {
    expect(makeRules({ playsPerTurn: 5 }).firstTurnPlays).toBe(5);
    expect(makeRules({ playsPerTurn: 5, firstTurnPlays: 1 }).firstTurnPlays).toBe(1);
  });

  it("rejects first-turn plays outside 1 to playsPerTurn", () => {
    expect(() => makeRules({ firstTurnPlays: 0 })).toThrow("invalid rule firstTurnPlays: 0");
    expect(() => makeRules({ firstTurnPlays: 3 })).toThrow("invalid rule firstTurnPlays: 3");
    expect(() => makeRules({ firstTurnPlays: 1.5 })).toThrow("invalid rule firstTurnPlays: 1.5");
  });
```

and add, importing `playsAllowed` from `../src/rules` and `makeState` from `./helpers`:

```ts
describe("playsAllowed", () => {
  it("is firstTurnPlays on turn 1 and playsPerTurn after", () => {
    const rules = { ...DEFAULT_RULES, playsPerTurn: 2, firstTurnPlays: 1 };
    expect(playsAllowed(makeState({ turn: 1, rules }))).toBe(1);
    expect(playsAllowed(makeState({ turn: 2, rules }))).toBe(2);
  });
});
```

`packages/engine/test/play.test.ts` — inside `describe("playError", ...)`:

```ts
  it("limits turn 1 to firstTurnPlays", () => {
    const rules = { ...DEFAULT_RULES, firstTurnPlays: 1 };
    expect(playError(makeState({ turn: 1, rules, playsUsed: 1, p0: { hand: HAND } }), 0, play([0]))).toBe(
      "no plays left this turn",
    );
    expect(playError(makeState({ turn: 2, rules, playsUsed: 1, p0: { hand: HAND } }), 0, play([0]))).toBeNull();
  });
```

`packages/engine/test/legal.test.ts`:

```ts
  it("lists no play on turn 1 once firstTurnPlays are used", () => {
    const state = makeState({ turn: 1, playsUsed: 1, rules: { ...DEFAULT_RULES, firstTurnPlays: 1 }, p0: { hand: ["ember-fox"] } });
    expect(legalActions(state, 0).filter((a) => a.type === "PLAY")).toEqual([]);
  });
```

(Import `DEFAULT_RULES` from `../src/rules`.)

`packages/engine/test/view.test.ts` and `packages/bots/test/runMatch.test.ts` — every expected rules object gains `firstTurnPlays: 2` after `playsPerTurn: 2`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — no `firstTurnPlays`, no `playsAllowed`.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts` — `Rules` gains, after `playsPerTurn`:

```ts
  /** PLAY actions allowed on turn 1, which is always the first player's; 1 to playsPerTurn */
  firstTurnPlays: number;
```

`packages/engine/src/rules.ts`:

```ts
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  elementBonus: 500,
  playsPerTurn: 2,
  firstTurnPlays: 2,
  wearRatio: 1,
});

/** DEFAULT_RULES with `overrides` applied, as a new object. Throws for an invalid value. */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules: Rules = {
    ...DEFAULT_RULES,
    // turn 1 has as many plays as any other turn unless the match says otherwise
    firstTurnPlays: overrides.playsPerTurn ?? DEFAULT_RULES.playsPerTurn,
    ...overrides,
  };
  if (!Number.isInteger(rules.elementBonus) || rules.elementBonus < 0) {
    throw new Error(`invalid rule elementBonus: ${rules.elementBonus}`);
  }
  // the hand does not refill during a turn, so HAND_SIZE plays is as many as a turn can hold
  if (!Number.isInteger(rules.playsPerTurn) || rules.playsPerTurn < 1 || rules.playsPerTurn > HAND_SIZE) {
    throw new Error(`invalid rule playsPerTurn: ${rules.playsPerTurn}`);
  }
  if (!Number.isInteger(rules.firstTurnPlays) || rules.firstTurnPlays < 1 || rules.firstTurnPlays > rules.playsPerTurn) {
    throw new Error(`invalid rule firstTurnPlays: ${rules.firstTurnPlays}`);
  }
  if (!Number.isFinite(rules.wearRatio) || rules.wearRatio < 0 || rules.wearRatio > 1) {
    throw new Error(`invalid rule wearRatio: ${rules.wearRatio}`);
  }
  return rules;
}

/** PLAY actions the active player may make this turn. Turn 1 is always the first player's. */
export function playsAllowed(state: MatchState): number {
  return state.turn === 1 ? state.rules.firstTurnPlays : state.rules.playsPerTurn;
}
```

`packages/engine/src/play.ts` — import `playsAllowed` from `./rules`; in `playError` replace the plays line with:

```ts
  if (state.playsUsed >= playsAllowed(state)) return "no plays left this turn";
```

`packages/engine/src/legal.ts` — import `playsAllowed` from `./rules`; replace `if (state.playsUsed < state.rules.playsPerTurn) {` with:

```ts
  if (state.playsUsed < playsAllowed(state)) {
```

`packages/engine/src/index.ts` — add `playsAllowed` to the `./rules` export list.

`packages/bots/src/cli.ts`:

- `USAGE` second line: `[--games <n>] [--seed <n>] [--element-bonus <n>] [--plays <1-5>] [--first-plays <n>] [--wear <0-1>] [--replay <seed>]`
- in `parseArgs` options: `"first-plays": { type: "string" },`
- after the `--plays` line: `if (values["first-plays"] !== undefined) rules.firstTurnPlays = wholeNumber(values["first-plays"], "first-plays");`

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `pnpm -s sim --a smart --b smart --games 100 --wear 0`
Expected: the regression numbers (the default changes nothing).

Run: `pnpm -s sim --a smart --b smart --games 100 --first-plays 1`
Expected: 0 errors.

Run: `pnpm -s sim --first-plays 3`
Expected: `invalid rule firstTurnPlays: 3` and the usage text.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** New rule setting firstTurnPlays (plays on turn 1, default playsPerTurn so nothing changes) read through playsAllowed; pnpm sim gained --first-plays, to measure the first-player edge found in phase 1 (tactics phase 2, task 4, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): firstTurnPlays rule setting

Closes #N"
```

---

### Task 5: Measure, and bring the docs in step

**Files:**
- Modify: `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-12-online-card-duel-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0009-tactics-combination-over-raw-stats.md`, `docs/ddr/0010-engine-determines-effective-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: `--wear`, `--first-plays` (tasks 1, 4), the phase 0 measures.
- Produces: the phase 2 results table and a recommendation for `wearRatio` and `firstTurnPlays`.

- [ ] **Step 1: Run the comparison**

For each `--wear` value 0, 0.5 and 1, with `--games 500`:

```bash
pnpm -s sim --a smart --b smart --wear <w> --games 500
pnpm -s sim --a greedy --b wide --wear <w> --games 500
pnpm -s sim --a smart --b wide --wear <w> --games 500
pnpm -s sim --a smart --b greedy --wear <w> --games 500
pnpm -s sim --a smart --b smart --deck-a flame --deck-b strongest --wear <w> --games 500
```

Then the same five with `--wear 1 --first-plays 1`, and with the wear value the numbers favour plus `--first-plays 1` if that is not 1.

Expected: 0 errors in every run. `--wear 0` rows equal the phase 1 rows at 2 plays.

- [ ] **Step 2: Record it in the tactics spec**

In `docs/specs/2026-11-13-tactics-rules-design.md`, add under `## Revisions` a section `### <today's date>: phase 2 results (R3)` holding:

- smart versus smart: one row per run (wear 0, 0.5, 1; each first-plays value run), with columns first-player win rate, average turns, deck-out share, comebacks, lead changes, fusion share;
- other matchups: win rate of the first-named bot per run;
- the section 6 target table with the phase 1 column and the best phase 2 column;
- what moved and what did not; the `wearRatio` and `firstTurnPlays` values the numbers favour, as a recommendation for the owner (the defaults change only by the owner's decision, in a later commit);
- the planning decisions: only the target is worn; the withstood value includes the element bonus; wear clears at every turn start; the new order of a battle value (wear first, element bonus on top).

- [ ] **Step 3: Bring the other docs in step**

- `docs/specs/2026-11-12-online-card-duel-design.md`, `Revisions`: section 4.5 gains "a target that survives a battle is worn: its ATK and DEF drop by `wearRatio` x the attack value until the turn ends"; section 4.4 gains "`firstTurnPlays` plays on turn 1".
- `docs/specs/2026-11-13-engine-high-level-design.md`, `Revisions`: `Creature.wear`, the `worn` event, `resolveAttack` returns its outcome, the new `preview.ts` (`stateFromView`, `previewAttacks`), `playsAllowed`, `Rules.wearRatio` and `Rules.firstTurnPlays`.
- `docs/ddr/0009-tactics-combination-over-raw-stats.md`: set `Last updated`; Implementation says R1 to R3 are implemented (add `battle.ts`, `values.ts`, `match.ts`, `preview.ts`); the known gap gets the phase 2 numbers.
- `docs/ddr/0010-engine-determines-effective-stats.md`: Implementation names `preview.ts` and says previews rebuild a state from the view and run the real resolution; the known gap drops "until wear ... implemented".
- `CLAUDE.md`: Status: "Tactics phases 0 to 2 are implemented (R1 to R3)"; the `pnpm sim` line gains "`--wear` and `--first-plays`"; add this plan to the "Read first" table.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Append to `HISTORY.md`:
`- **[docs]** Recorded the phase 2 results (wear 0, 0.5, 1; first-turn plays 1 and 2) in docs/specs/2026-11-13-tactics-rules-design.md and brought the approved spec's Revisions, the engine high-level design, DDR-0009, DDR-0010 and CLAUDE.md in step with R3 (tactics phase 2, task 5, #N).`

```bash
git add docs CLAUDE.md HISTORY.md
git commit -m "docs: phase 2 results and docs in step with the code

Closes #N"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| R3: a creature that survives a battle is worn by `WEAR_RATIO` x the attack value, for the rest of the turn | 1 |
| R3: wear cleared from every creature at the end of the turn | 1 (at the start of the next turn, which is the same moment) |
| R3: `Creature.wear`; a new public `worn` event | 1 |
| R3: battle values subtract wear, never below 0 | 1 (in `effectiveStats`, before the element bonus: owner's decision) |
| R3: a failed attack still costs life points, against the worn value | 1 |
| R3: tunable `WEAR_RATIO` (0.5 and 1) | 1 (`--wear`), 5 |
| Section 6: the smart bot must understand wear | 2, 3 |
| Phase 1 results: the first-player edge | 4 (setting), 5 (measured) |
| DDR-0010: previews from view data only | 2 |

## Not in this plan

- R4 to R6: phases 3 to 5 have their own plans (`2026-11-13-tactics-phase-3-answer-traits.md`, `...-phase-4-synergy.md`, `...-phase-5-face-down.md`).
- Changing a default value. Task 5 recommends; the owner decides.
- The greedy and wide bots: they read the view's current values and `previewAttack`, so they see wear without changes. They stay simple baselines.
- Plans 2 and 3: revised once, after phase 5.

## Revisions

### 2026-11-13

- Written at the owner's request, with phases 3 to 5, so all tactics rules are done before plans 2 and 3. Two owner decisions made while writing: wear comes off before the element bonus, and a `firstTurnPlays` setting is added.
- Issues (milestone "Tactics phase 2: Wear"): task 1 is #55, task 2 #56, task 3 #57, task 4 #58, task 5 #59. Read `#N` in a task as that task's issue. Implement on one branch per phase, one commit per task.
