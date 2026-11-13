# Tactics Phase 5 (Face-down Play) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rule R6, face-down play, for deception only: a `PLAY` may put a creature face-down, the opponent sees only that it is there and its position, battle reveals it, a free `REVEAL` turns it face-up, and views and events never leak it. Then measure it, which completes the tactics rules before plans 2 and 3 are revised.

**Architecture:** `Creature` gains `faceDown`. Play, battle and synergy rules read it in the engine (tasks 1 and 2). Hiding is a view concern: `viewFor` turns an opponent's face-down creature into a `HiddenCreature`, and a new `eventsFor` filters each player's events (task 3). Previews rebuild a state from a view; a hidden creature becomes a placeholder that the rules never read, and a preview of an attack on it returns an error. The bots learn to probe a hidden creature and to lure with a face-down Venom creature (task 4).

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-face-down-play-design.md` (F1 to F11, sections 4 and 5), `docs/specs/2026-11-13-tactics-rules-design.md` R6. Depends on phases 2 to 4 being implemented.

## Global Constraints

- Rules live only in `packages/engine`; it imports nothing outside its own files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- **The engine decides what each player may see** (DDR-0003): views come from `viewFor`, events for a player from `eventsFor`. The rule for what is hidden lives in the engine, not in the server or the bots.
- Bots see only a `PlayerView`, import only from `@duel/engine`, and return one of `legal` (DDR-0006). A bot never learns a hidden card except by the engine revealing it.
- **Face-down gives no advantage beyond deception** (DDR-0009): a face-down creature gives and receives no Banner or Pack bonus, does not count for Pack, and a face-down Guard forces nothing (F4). Rally applies (F5). In battle it uses its real values, element and battle traits.
- Only the engine works out current values (DDR-0010). A view carries `atk` and `def` for visible creatures and nothing for hidden ones.
- The simulator keeps the full event list (unfiltered), so statistics and replays stay complete.
- Regression check: before task 1, record `pnpm -s sim --a greedy --b greedy --games 20 --seed 1` and `pnpm -s sim --a smart --b smart --games 100`. The greedy and smart bots never choose a face-down play until task 4, so tasks 1 to 3 must reproduce both outputs exactly.
- Speed budget: `legalActions` lists both faces of every play (about 6,500 `PLAY` candidates for a five-card hand). `pnpm -s sim --a smart --b smart --games 100` must stay under 30 s; if it does not, task 1 makes `legalActions` build the face-down variant only for plays whose face-up twin passed `actionError` (the only face-specific check is F6), and says so in its commit.
- Every task: test first, one commit, one `HISTORY.md` line in the same commit, one GitHub issue, `Closes #N` in the commit message. Issue numbers are listed in `Revisions` at the bottom.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## Decisions made while planning

- **`PlayAction.faceDown` is optional; absent means face-up.** Every existing play, bot and test keeps working. `legalActions` lists a face-up play without the field and its face-down twin with `faceDown: true`.
- **The `played` event always carries `faceDown` and `handCards`** (the number of hand cards used, which the opponent may see). `cardId` becomes `CardId | null`; it is `null` only in the opponent's copy of a face-down play, from `eventsFor`.
- **A face-up `PLAY` onto your own face-down creature turns the result face-up**; its fusion events are then public, like any face-up play. A face-down `PLAY` onto a face-up creature is rejected: `"a face-up creature stays face-up"` (F6).
- **`REVEAL` errors:** `"no creature in that slot"`, `"creature is already face-up"`, `"invalid slot"`, plus the usual turn errors.
- **Order inside an attack** (face-down spec, section 5): `attacked`, `revealed` (hidden attacker), the battle is worked out, `revealed` (hidden target), `destroyed`, `worn`, `damage`. A hidden attacker is revealed before the battle is worked out, so it fights with its Banner and Pack bonuses; a hidden target is revealed after, so it fights without them.
- **Previews:** an attack on a hidden creature returns `{ error: "the target is face-down" }`. Hidden creatures still block direct attacks and take part in no synergy, so every other preview is exact.
- **Bot policy** (face-down spec, section 5: "probe with its weakest attacker"):
  - greedy and wide: with no favourable known attack, they attack a hidden creature with their weakest attacker;
  - smart: the same, but only while it has at least two creatures, so it never sends its only creature into a possible lure;
  - smart lures: when its chosen play puts a Venom creature in defense position, it plays it face-down;
  - no bot uses `REVEAL` except the random bot, which picks any legal action.

## File Structure

| File | Change |
|---|---|
| `packages/engine/src/types.ts` | `Creature.faceDown`, `ViewCreature.faceDown`, `HiddenCreature`, `PlayAction.faceDown`, `RevealAction`, `played` and `revealed` events |
| `packages/engine/src/play.ts` | F1, F6, F7; the `played` event |
| `packages/engine/src/match.ts` | `reveal` helper |
| `packages/engine/src/actions.ts` | `REVEAL` |
| `packages/engine/src/legal.ts` | face-down twins; `REVEAL` candidates |
| `packages/engine/src/battle.ts` | reveal steps; Guard ignores hidden creatures |
| `packages/engine/src/values.ts` | hidden creatures take no part in Banner and Pack |
| `packages/engine/src/view.ts` | `HiddenCreature` for an opponent's face-down creature |
| `packages/engine/src/events.ts` (new) | `eventsFor` |
| `packages/engine/src/preview.ts` | hidden placeholder; error for a hidden target |
| `packages/bots/src/probe.ts` (new) | `probe` |
| `packages/bots/src/greedy.ts`, `wide.ts`, `smart.ts` | probe; lure; face-up plays only in ranking |
| `packages/bots/src/replay.ts`, `stats.ts` | new and changed events |

---

### Task 1: Face-down plays and `REVEAL`

**Files:**
- Modify: `packages/engine/src/types.ts`, `play.ts`, `match.ts`, `actions.ts`, `legal.ts`, `preview.ts`
- Modify: `packages/bots/src/replay.ts`, `stats.ts`
- Test: `packages/engine/test/helpers.ts`, `play.test.ts`, `actions.test.ts`, `legal.test.ts`, `view.test.ts`; `packages/bots/test/stats.test.ts`, `bots.test.ts`, `wide.test.ts`, `smart.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Creature.faceDown: boolean`; `ViewCreature.faceDown: boolean`.
  - `PlayAction.faceDown?: boolean`; `RevealAction = { type: "REVEAL"; slot: number }` in `Action`.
  - Events: `played` is `{ type: "played"; player; slot; cardId: CardId | null; position; faceDown: boolean; handCards: number }`; new `{ type: "revealed"; player: PlayerId; slot: number; cardId: CardId }`.
  - `reveal(draft: MatchState, player: PlayerId, slot: number, events: GameEvent[]): void` in `match.ts` (engine-internal).
  - `revealError(state, player, action: RevealAction): string | null` in `actions.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/helpers.ts`:

```ts
export function creature(cardId: CardId, position: Position = "attack"): Creature {
  return { cardId, position, hasAttacked: false, wear: 0, faceDown: false };
}

export function hidden(cardId: CardId, position: Position = "defense"): Creature {
  return { ...creature(cardId, position), faceDown: true };
}
```

`packages/engine/test/play.test.ts`:

- `play()` gains a face parameter:

```ts
function play(handIndexes: number[], slot = 0, position: PlayAction["position"] = "attack", faceDown?: boolean): PlayAction {
  return faceDown === undefined ? { type: "PLAY", handIndexes, slot, position } : { type: "PLAY", handIndexes, slot, position, faceDown };
}
```

- the two `played` events become `{ type: "played", player: 0, slot: 2, cardId: "ash-duelist", position: "defense", faceDown: false, handCards: 1 }` and `{ type: "played", player: 0, slot: 0, cardId: "dragon-knight", position: "attack", faceDown: false, handCards: 3 }`;
- add (importing `hidden` from `./helpers`):

```ts
describe("face-down plays (R6)", () => {
  it("puts a creature face-down in either position (F1)", () => {
    for (const position of ["attack", "defense"] as const) {
      const state = makeState({ p0: { hand: HAND } });
      const events: GameEvent[] = [];
      resolvePlay(state, 0, play([0], 1, position, true), events);
      expect(state.players[0].field[1]).toEqual(hidden("ember-fox", position));
      expect(events).toEqual([{ type: "played", player: 0, slot: 1, cardId: "ember-fox", position, faceDown: true, handCards: 1 }]);
    }
  });

  it("never turns a face-up creature face-down (F6)", () => {
    const state = makeState({ p0: { hand: HAND, field: field({ 0: creature("moss-boar") }) } });
    expect(playError(state, 0, play([0], 0, "attack", true))).toBe("a face-up creature stays face-up");
    expect(playError(state, 0, play([0], 0, "attack", false))).toBeNull();
  });

  it("lets a play onto your own face-down creature stay face-down, or turn it face-up (F7)", () => {
    const down = makeState({ p0: { hand: HAND, field: field({ 0: hidden("moss-boar") }) } });
    resolvePlay(down, 0, play([1], 0, "defense", true), []);
    expect(down.players[0].field[0]?.faceDown).toBe(true);
    const up = makeState({ p0: { hand: HAND, field: field({ 0: hidden("moss-boar") }) } });
    resolvePlay(up, 0, play([1], 0, "defense"), []);
    expect(up.players[0].field[0]?.faceDown).toBe(false);
  });

  it("rejects a face that is not a boolean", () => {
    const state = makeState({ p0: { hand: HAND } });
    expect(playError(state, 0, { ...play([0]), faceDown: "yes" as unknown as boolean })).toBe("invalid face");
  });
});
```

`packages/engine/test/actions.test.ts` — import `hidden` from `./helpers`, and add:

```ts
describe("REVEAL", () => {
  const state = makeState({ p0: { field: field({ 0: hidden("thorn-sprite"), 1: creature("ember-fox") }) } });

  it("turns your own face-down creature face-up for free (F8)", () => {
    const result = ok(state, 0, { type: "REVEAL", slot: 0 });
    expect(result.state.players[0].field[0]?.faceDown).toBe(false);
    expect(result.state.playsUsed).toBe(0);
    expect(result.events).toEqual([{ type: "revealed", player: 0, slot: 0, cardId: "thorn-sprite" }]);
  });

  it("rejects an empty slot, a face-up creature, a bad slot and the wrong turn", () => {
    expect(applyAction(state, 0, { type: "REVEAL", slot: 3 })).toEqual({ ok: false, error: "no creature in that slot" });
    expect(applyAction(state, 0, { type: "REVEAL", slot: 1 })).toEqual({ ok: false, error: "creature is already face-up" });
    expect(applyAction(state, 0, { type: "REVEAL", slot: 7 })).toEqual({ ok: false, error: "invalid slot" });
    expect(applyAction(state, 1, { type: "REVEAL", slot: 0 })).toEqual({ ok: false, error: "not your turn" });
  });

  it("does not reveal on a position change (F10)", () => {
    const result = ok(state, 0, { type: "SET_POSITION", slot: 0, position: "attack" });
    expect(result.state.players[0].field[0]?.faceDown).toBe(true);
  });
});
```

`packages/engine/test/legal.test.ts` — every play now has a face-down twin, so in `"lists every play"` the counts become `20` and `80`, in `"lists plays until the turn's plays are used up"` `20` and `0`, and in `"lists a play onto a creature that already attacked only in that creature's position"` the count becomes `17` with the comment `// empty slots 1-4: 4 x 2 positions x 2 faces; slot 0: attack position, face-up only`. Add (importing `hidden`):

```ts
  it("lists a face-down twin for every play, and none onto a face-up creature", () => {
    const state = makeState({ p0: { hand: ["ember-fox"], field: field({ 0: creature("moss-boar") }) } });
    const plays = legalActions(state, 0).filter((a) => a.type === "PLAY");
    expect(plays).toContainEqual({ type: "PLAY", handIndexes: [0], slot: 1, position: "defense", faceDown: true });
    expect(plays).not.toContainEqual({ type: "PLAY", handIndexes: [0], slot: 0, position: "attack", faceDown: true });
  });

  it("lists REVEAL for each own face-down creature", () => {
    const state = makeState({ p0: { field: field({ 1: hidden("thorn-sprite"), 2: creature("ember-fox") }) } });
    expect(legalActions(state, 0).filter((a) => a.type === "REVEAL")).toEqual([{ type: "REVEAL", slot: 1 }]);
  });
```

`packages/engine/test/view.test.ts` — the expected creatures gain `faceDown: false` (after `wear`).

Bot tests — the `on` helpers in `bots.test.ts`, `wide.test.ts` and `smart.test.ts` gain `faceDown: false`; the four `played` events in `stats.test.ts` gain `faceDown: false, handCards: 1` (statistics do not read `handCards`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — no `faceDown`, no `REVEAL`, the old `played` shape.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`:

```ts
export type Creature = {
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  /** ATK and DEF lost to battles survived this turn (R3); cleared at the start of every turn */
  wear: number;
  /** R6: the opponent sees only that a creature is here and its position */
  faceDown: boolean;
};
```

`ViewCreature` gains `faceDown: boolean;` after `wear`.

```ts
/** Face-up unless `faceDown` is true (R6). */
export type PlayAction = { type: "PLAY"; handIndexes: number[]; slot: number; position: Position; faceDown?: boolean };
export type RevealAction = { type: "REVEAL"; slot: number };
export type Action = PlayAction | SetPositionAction | AttackAction | RevealAction | EndTurnAction | SurrenderAction;
```

In `GameEvent`, `played` becomes and `revealed` is added:

```ts
  /** cardId is null only in the opponent's copy of a face-down play (eventsFor) */
  | { type: "played"; player: PlayerId; slot: number; cardId: CardId | null; position: Position; faceDown: boolean; handCards: number }
  | { type: "revealed"; player: PlayerId; slot: number; cardId: CardId }
```

`packages/engine/src/match.ts` — add:

```ts
/** Mutates `draft`: turns a face-down creature face-up and tells both players what it is. */
export function reveal(draft: MatchState, player: PlayerId, slot: number, events: GameEvent[]): void {
  const creature = draft.players[player].field[slot];
  if (!creature?.faceDown) return;
  creature.faceDown = false;
  events.push({ type: "revealed", player, slot, cardId: creature.cardId });
}
```

`packages/engine/src/play.ts`:

- `playShapeError` gains, after the position check:

```ts
  if (action.faceDown !== undefined && typeof action.faceDown !== "boolean") return "invalid face";
```

- `playError` gains, after the "already attacked" check:

```ts
  // F6: once face-up, always face-up
  if (action.faceDown && onField && !onField.faceDown) return "a face-up creature stays face-up";
```

- in `resolvePlay`, the creature and the event:

```ts
  const faceDown = action.faceDown ?? false;
  me.field[action.slot] = {
    cardId: chain.result,
    position: action.position,
    // a creature that already attacked cannot attack again by being fused onto
    hasAttacked: previous?.hasAttacked ?? false,
    // a play never heals wear
    wear: previous?.wear ?? 0,
    faceDown,
  };
  draft.playsUsed += 1;
  events.push({
    type: "played",
    player,
    slot: action.slot,
    cardId: chain.result,
    position: action.position,
    faceDown,
    handCards: action.handIndexes.length,
  });
```

`packages/engine/src/actions.ts` — import `reveal` from `./match` and `RevealAction` as a type; add:

```ts
export function revealError(state: MatchState, player: PlayerId, action: RevealAction): string | null {
  const turn = turnError(state, player);
  if (turn) return turn;
  if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= FIELD_SLOTS) return "invalid slot";
  const creature = state.players[player].field[action.slot];
  if (!creature) return "no creature in that slot";
  if (!creature.faceDown) return "creature is already face-up";
  return null;
}
```

In `actionError`: `case "REVEAL": return revealError(state, player, action);`. In `applyAction`: `case "REVEAL": reveal(draft, player, action.slot, events); break;`.

`packages/engine/src/legal.ts` — the play loop pushes both faces, and `REVEAL` candidates follow the position changes:

```ts
        for (const position of POSITIONS) {
          candidates.push({ type: "PLAY", handIndexes, slot, position });
          candidates.push({ type: "PLAY", handIndexes, slot, position, faceDown: true });
        }
```

```ts
  for (let slot = 0; slot < FIELD_SLOTS; slot++) candidates.push({ type: "REVEAL", slot });
```

`packages/engine/src/preview.ts` — `toCreature` copies the face: add `faceDown: creature.faceDown` to the object it returns.

`packages/bots/src/replay.ts`:

```ts
    case "played":
      return `${who(event.player)} played ${event.cardId ? name(event.cardId) : `a face-down card (${event.handCards} from hand)`} in slot ${
        event.slot
      } (${event.position}${event.faceDown ? ", face-down" : ""})`;
    case "revealed":
      return `  ${who(event.player)} revealed ${name(event.cardId)} in slot ${event.slot}`;
```

`packages/bots/src/stats.ts` — in `summarize`, count a played card only when its id is known:

```ts
      if (event.type === "played") {
        if (event.cardId) played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
```

(the rest of that block is unchanged).

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass. The property test's random matches now play face-down and `REVEAL` too.

Run: the two regression commands from Global Constraints.
Expected: the same output as recorded before this task.

Run: `time pnpm -s sim --a smart --b smart --games 100`
Expected: under 30 s (see Global Constraints if not).

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R6: PLAY may be face-down (F1, F6, F7), new free REVEAL action (F8); played events carry faceDown and handCards, new revealed event; legalActions lists both faces (tactics phase 5, task 1, docs/specs/2026-11-13-face-down-play-design.md, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): face-down plays and REVEAL

Closes #N"
```

---

### Task 2: Face-down creatures in battle and synergy

**Files:**
- Modify: `packages/engine/src/battle.ts`, `values.ts`
- Test: `packages/engine/test/battle.test.ts`, `values.test.ts`

**Interfaces:**
- Consumes: `Creature.faceDown`, `reveal` (task 1).
- Produces: no new names. `resolveAttack` reveals; `attackError` ignores hidden Guards; `effectiveStats` gives hidden creatures no Banner or Pack part.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/battle.test.ts` (import `hidden` from `./helpers`):

```ts
describe("face-down creatures in battle (R6)", () => {
  it("reveals a hidden attacker before the battle", () => {
    const state = makeState({ p0: { field: field({ 0: hidden("ash-duelist", "attack") }) }, p1: { field: field({ 0: creature("ember-fox") }) } });
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]?.faceDown).toBe(false);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "revealed", player: 0, slot: 0, cardId: "ash-duelist" },
      { type: "destroyed", player: 1, slot: 0, cardId: "ember-fox" },
      { type: "damage", player: 1, amount: 300 },
    ]);
  });

  it("reveals a hidden target that survives (F3)", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ember-fox") }) }, p1: { field: field({ 0: hidden("furnace-drone") }) } });
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[1].field[0]?.faceDown).toBe(false);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "revealed", player: 1, slot: 0, cardId: "furnace-drone" },
      { type: "worn", player: 1, slot: 0, amount: 1200 },
      { type: "damage", player: 0, amount: 300 },
    ]);
  });

  it("springs the lure: a hidden Venom creature takes its attacker with it", () => {
    // the face-down spec's example: flame 3000 + 500 against Thorn Sprite's DEF 1100
    const state = makeState({ p0: { field: field({ 0: creature("ancient-tyrant") }) }, p1: { field: field({ 0: hidden("thorn-sprite") }) } });
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "revealed", player: 1, slot: 0, cardId: "thorn-sprite" },
      { type: "destroyed", player: 1, slot: 0, cardId: "thorn-sprite" },
      { type: "destroyed", player: 0, slot: 0, cardId: "ancient-tyrant" },
    ]);
  });

  it("blocks direct attacks while hidden (F9)", () => {
    const state = makeState({ p0: { field: field({ 0: creature("ash-duelist") }) }, p1: { field: field({ 2: hidden("seedling") }) } });
    expect(attackError(state, 0, attack(0, "direct"))).toBe("cannot attack directly while the opponent has creatures");
  });

  it("a hidden Guard forces nothing (F4)", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 1: hidden("clay-sentinel") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBeNull();
  });

  it("a hidden target fights without the Banner beside it; a revealed attacker fights with it", () => {
    // earth Banner next to Burrow Drake on each side; flame attacker against earth, no element bonus
    const target = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("iron-digger"), 1: hidden("burrow-drake", "attack") }) },
    });
    expect(resolveAttack(target, 0, attack(0, 1), [])).toMatchObject({ attack: 1500, defense: 1500 });

    const attacker = makeState({
      p0: { field: field({ 0: creature("iron-digger"), 1: hidden("burrow-drake", "attack") }) },
      p1: { field: field({ 0: creature("ash-duelist") }) },
    });
    expect(resolveAttack(attacker, 0, attack(1, 0), [])).toMatchObject({ attack: 1800, defense: 1500 });
  });
});
```

`packages/engine/test/values.test.ts` (import `hidden`):

```ts
describe("face-down creatures and synergy (R6)", () => {
  it("a hidden Banner gives nothing, and a hidden creature receives no Banner", () => {
    const hiddenBanner = makeState({ p0: { field: field({ 0: creature("burrow-drake"), 1: hidden("iron-digger") }) } });
    expect(effectiveStats(hiddenBanner, 0, 0)).toEqual({ atk: 1500, def: 1400 });
    const hiddenNeighbour = makeState({ p0: { field: field({ 0: hidden("burrow-drake"), 1: creature("iron-digger") }) } });
    expect(effectiveStats(hiddenNeighbour, 0, 0)).toEqual({ atk: 1500, def: 1400 });
  });

  it("a hidden creature neither counts for Pack nor gets Pack", () => {
    const state = makeState({ p0: { field: field({ 0: creature("dust-jackal"), 2: hidden("gale-falcon"), 4: hidden("dust-jackal") }) } });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1100, def: 900 });
    expect(effectiveStats(state, 0, 4)).toEqual({ atk: 1100, def: 900 });
  });

  it("Rally still applies while hidden (F5)", () => {
    const state = makeState({ p0: { field: field({ 0: hidden("pebble-tortoise") }), lifePoints: 1000 } });
    expect(effectiveStats(state, 0, 0)).toEqual({ atk: 1000, def: 2200 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/battle.test.ts packages/engine/test/values.test.ts`
Expected: FAIL — no reveal steps; hidden creatures still give and get synergy; a hidden Guard still forces attacks.

- [ ] **Step 3: Implement**

`packages/engine/src/values.ts` — in `effectiveStats`, the Banner and Pack parts become:

```ts
  let bonus = 0;
  // R6: a face-down creature gives and receives no Banner or Pack bonus and does not count for Pack
  if (!creature.faceDown) {
    for (const next of [slot - 1, slot + 1]) {
      const neighbour = own.field[next];
      if (!neighbour || neighbour.faceDown) continue;
      const banner = getCard(neighbour.cardId);
      if (banner.traits.includes("banner") && sharesTheme(card, banner)) bonus += rules.bannerBonus;
    }
    if (card.traits.includes("pack")) {
      const kin = own.field.filter(
        (other, i) => other && !other.faceDown && i !== slot && sharesTheme(card, getCard(other.cardId)),
      ).length;
      bonus += kin * rules.packBonus;
    }
  }
  // Rally depends only on life points, which are public (F5)
  if (card.traits.includes("rally") && own.lifePoints < state.players[opponent(player)].lifePoints) {
    bonus += rules.rallyBonus;
  }
```

(`neighbour.faceDown` is checked before `getCard`, so a hidden creature's card is never read here. Task 3 relies on this.)

`packages/engine/src/battle.ts`:

- import `reveal` with `endMatch` from `./match`;
- in `attackError`, the Guard filter skips hidden creatures:

```ts
  const guards = enemyField.flatMap((creature, slot) =>
    creature && !creature.faceDown && creature.position === "defense" && hasTrait(creature.cardId, "guard") ? [slot] : [],
  );
```

- `resolveAttack` becomes:

```ts
export function resolveAttack(
  draft: MatchState,
  player: PlayerId,
  action: AttackAction,
  events: GameEvent[],
): BattleOutcome {
  const enemy = opponent(player);
  events.push({ type: "attacked", player, attackerSlot: action.attackerSlot, target: action.target });
  // a hidden attacker turns face-up before the battle, so it fights with its formation (R6)
  reveal(draft, player, action.attackerSlot, events);

  const target =
    action.target === "direct"
      ? null
      : {
          combatant: fromState(draft, enemy, action.target),
          position: draft.players[enemy].field[action.target]!.position,
        };
  const outcome = battleOutcome(fromState(draft, player, action.attackerSlot), target, draft.rules);
  draft.players[player].field[action.attackerSlot]!.hasAttacked = true;

  // a hidden target is turned face-up by the battle, whether it survives or not (F3)
  if (action.target !== "direct") reveal(draft, enemy, action.target, events);
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

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass; the earlier battle event tests keep their order (no reveal happens for face-up creatures).

Run: the two regression commands from Global Constraints.
Expected: unchanged.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R6 in battle: a hidden attacker is revealed before the battle, a hidden target after it (F3); a hidden Guard forces nothing (F4); hidden creatures give and get no Banner or Pack bonus, Rally still applies (F5) (tactics phase 5, task 2, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): face-down creatures in battle and synergy

Closes #N"
```

---

### Task 3: Hidden views and `eventsFor`

**Files:**
- Create: `packages/engine/src/events.ts`, `packages/engine/test/events.test.ts`
- Modify: `packages/engine/src/types.ts`, `view.ts`, `preview.ts`, `index.ts`
- Modify: `packages/bots/src/smart.ts`
- Test: `packages/engine/test/view.test.ts`, `preview.test.ts`, `property.test.ts`

**Interfaces:**
- Consumes: tasks 1 and 2.
- Produces:
  - `HiddenCreature = { hidden: true; position: Position }`; `PlayerView.opponent.field: (ViewCreature | HiddenCreature | null)[]`. `PlayerView.self.field` stays `(ViewCreature | null)[]`.
  - `eventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[]` — exported from `@duel/engine`.
  - `previewAttack`/`previewAttacks` return `{ error: "the target is face-down" }` for a hidden target.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/view.test.ts` (import `hidden`):

```ts
  it("shows the opponent only the position of a face-down creature, and the owner everything", () => {
    const state = makeState({ p1: { field: field({ 2: hidden("thorn-sprite") }) } });
    expect(viewFor(state, 0).opponent.field[2]).toEqual({ hidden: true, position: "defense" });
    expect(viewFor(state, 1).self.field[2]).toEqual({
      hidden: false,
      cardId: "thorn-sprite",
      position: "defense",
      hasAttacked: false,
      wear: 0,
      faceDown: true,
      atk: 900,
      def: 1100,
    });
  });
```

Create `packages/engine/test/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventsFor } from "../src/events";
import type { GameEvent } from "../src/types";

const hiddenPlay: GameEvent[] = [
  { type: "drew", player: 0, count: 2 },
  { type: "fused", player: 0, a: "ember-fox", b: "moss-boar", result: "twin-fang-chimera" },
  { type: "fusion-failed", player: 0, a: "twin-fang-chimera", b: "seedling" },
  { type: "played", player: 0, slot: 1, cardId: "seedling", position: "defense", faceDown: true, handCards: 3 },
  { type: "position-set", player: 0, slot: 1, position: "attack" },
];

describe("eventsFor", () => {
  it("gives the owner of a face-down play everything", () => {
    expect(eventsFor(hiddenPlay, 0)).toEqual(hiddenPlay);
  });

  it("gives the opponent the play without its card or its fusion steps", () => {
    expect(eventsFor(hiddenPlay, 1)).toEqual([
      { type: "drew", player: 0, count: 2 },
      { type: "played", player: 0, slot: 1, cardId: null, position: "defense", faceDown: true, handCards: 3 },
      { type: "position-set", player: 0, slot: 1, position: "attack" },
    ]);
  });

  it("keeps a face-up play and its fusions for both players", () => {
    const faceUp: GameEvent[] = [
      { type: "fused", player: 0, a: "ember-fox", b: "moss-boar", result: "twin-fang-chimera" },
      { type: "played", player: 0, slot: 1, cardId: "twin-fang-chimera", position: "attack", faceDown: false, handCards: 2 },
    ];
    expect(eventsFor(faceUp, 1)).toEqual(faceUp);
  });

  it("keeps reveals, battles and the end of the match for both players", () => {
    const battle: GameEvent[] = [
      { type: "attacked", player: 1, attackerSlot: 0, target: 1 },
      { type: "revealed", player: 0, slot: 1, cardId: "seedling" },
      { type: "destroyed", player: 0, slot: 1, cardId: "seedling" },
      { type: "match-ended", winner: 1, reason: "life-points" },
    ];
    expect(eventsFor(battle, 0)).toEqual(battle);
    expect(eventsFor(battle, 1)).toEqual(battle);
  });

  it("never changes the list it is given", () => {
    const copy = structuredClone(hiddenPlay);
    eventsFor(hiddenPlay, 1);
    expect(hiddenPlay).toEqual(copy);
  });
});
```

`packages/engine/test/preview.test.ts` (import `hidden`):

```ts
describe("previews and hidden creatures", () => {
  const state = makeState({
    p0: { field: field({ 0: creature("ash-duelist"), 1: creature("ember-fox") }) },
    p1: { field: field({ 0: creature("seedling"), 1: hidden("thorn-sprite") }) },
  });

  it("cannot preview an attack on a hidden creature", () => {
    expect(previewAttack(viewFor(state, 0), attack(0, 1))).toEqual({ error: "the target is face-down" });
  });

  it("previews the visible creatures exactly, with the hidden one still on the board", () => {
    expect(previewAttack(viewFor(state, 0), attack(0, 0))).toEqual(resolveAttack(structuredClone(state), 0, attack(0, 0), []));
  });
});
```

`packages/engine/test/property.test.ts` — import `eventsFor`, `opponent` and `viewFor` from `../src/index`, collect the events in `playRandomMatch` (`const result = applyAction(...)` already exists), and after `checkInvariants(state);` add `checkHidden(state, result.events);` with:

```ts
/** No player ever sees the card of an opponent's face-down creature. */
function checkHidden(state: MatchState, events: GameEvent[]): void {
  for (const viewer of [0, 1] as const) {
    const them = opponent(viewer);
    const view = viewFor(state, viewer);
    state.players[them].field.forEach((creature, slot) => {
      if (creature?.faceDown) expect(view.opponent.field[slot]).toEqual({ hidden: true, position: creature.position });
    });
    const seen = eventsFor(events, viewer);
    seen.forEach((event, i) => {
      if (event.type === "played" && event.player === them && event.faceDown) {
        expect(event.cardId).toBeNull();
        const before = seen[i - 1];
        expect(before?.type === "fused" || before?.type === "fusion-failed" ? before.player : null).not.toBe(them);
      }
    });
  }
}
```

(Add `type GameEvent` to the type imports.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — the opponent's view shows hidden cards; no `eventsFor`; previews read the hidden card.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`:

```ts
/** An opponent's face-down creature as a player sees it: only that it is there, and its position (F2). */
export type HiddenCreature = { hidden: true; position: Position };
```

and in `PlayerView`, `opponent` becomes:

```ts
  opponent: { handCount: number; deckCount: number; field: (ViewCreature | HiddenCreature | null)[]; lifePoints: number };
```

`packages/engine/src/view.ts`:

```ts
import { opponent } from "./rules";
import type { HiddenCreature, MatchState, PlayerId, PlayerView, ViewCreature } from "./types";
import { effectiveStats } from "./values";

function ownField(state: MatchState, player: PlayerId): (ViewCreature | null)[] {
  return state.players[player].field.map((creature, slot) =>
    creature ? { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) } : null,
  );
}

/** The opponent's field: a face-down creature shows only its position (R6, F2). */
function enemyField(state: MatchState, player: PlayerId): (ViewCreature | HiddenCreature | null)[] {
  return state.players[player].field.map((creature, slot) => {
    if (!creature) return null;
    if (creature.faceDown) return { hidden: true as const, position: creature.position };
    return { hidden: false as const, ...creature, ...effectiveStats(state, player, slot) };
  });
}
```

and in `viewFor`, `self.field` uses `ownField(state, player)` and `opponent.field` uses `enemyField(state, other)`. Update its doc comment: "The opponent's hand, both deck orders and the opponent's face-down creatures are hidden."

Create `packages/engine/src/events.ts`:

```ts
import type { GameEvent, PlayerId } from "./types";

/** The play a fusion step belongs to: the next `played` event, past other steps of the same play. */
function playOf(events: readonly GameEvent[], index: number): GameEvent | null {
  for (let i = index + 1; i < events.length; i++) {
    const event = events[i]!;
    if (event.type === "played") return event;
    if (event.type !== "fused" && event.type !== "fusion-failed") return null;
  }
  return null;
}

/**
 * The events `viewer` may see (DDR-0003). The opponent of a face-down play
 * learns the slot, the position and how many hand cards were used, but not
 * the card, and none of its fusion steps. Everything else goes to both players.
 * The full list stays with the server and the simulator.
 */
export function eventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  const seen: GameEvent[] = [];
  events.forEach((event, i) => {
    const theirs = "player" in event && event.player !== viewer;
    if (theirs && (event.type === "fused" || event.type === "fusion-failed")) {
      const play = playOf(events, i);
      if (play?.type === "played" && play.faceDown) return;
    }
    if (theirs && event.type === "played" && event.faceDown) {
      seen.push({ ...event, cardId: null });
      return;
    }
    seen.push(event);
  });
  return seen;
}
```

`packages/engine/src/preview.ts`:

- import `HiddenCreature` as a type and add:

```ts
/** Stands in for a card the viewer cannot see. The rules never read a face-down creature's card outside its own battle. */
const HIDDEN_CARD = "";

function hiddenCreature(creature: HiddenCreature): Creature {
  return { cardId: HIDDEN_CARD, position: creature.position, hasAttacked: false, wear: 0, faceDown: true };
}
```

- `toCreature` takes `ViewCreature | HiddenCreature | null` and returns `hiddenCreature(creature)` when `creature.hidden`;
- in `previewAttacks`, after the "no creature in the target slot" check:

```ts
    if (action.target !== "direct" && state.players[enemy].field[action.target]!.cardId === HIDDEN_CARD) {
      return { error: "the target is face-down", index };
    }
```

`packages/engine/src/index.ts`:

```ts
export { eventsFor } from "./events";
```

`packages/bots/src/smart.ts` — read only visible creatures of the opponent:

```ts
export function threat(view: PlayerView): number {
  return Math.max(0, ...view.opponent.field.map((creature) => (creature && !creature.hidden ? creature.atk : 0)));
}
```

and in `planScore`:

```ts
    const target = action.target === "direct" ? null : view.opponent.field[action.target];
    if (preview.targetDestroyed && target && !target.hidden) value += target.atk;
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass, including the property test's hidden-information check over 200 random matches.

Run: the two regression commands from Global Constraints.
Expected: unchanged.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R6 hiding: views show an opponent's face-down creature as HiddenCreature (position only), new eventsFor filters a face-down play's card and fusion steps from the opponent, previews refuse a hidden target; a property test checks nothing leaks (tactics phase 5, task 3, DDR-0003, DDR-0010, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): hidden views and eventsFor

Closes #N"
```

---

### Task 4: Bots probe hidden creatures and lure with Venom

**Files:**
- Create: `packages/bots/src/probe.ts`
- Modify: `packages/bots/src/greedy.ts`, `wide.ts`, `smart.ts`, `index.ts`
- Test: `packages/bots/test/bots.test.ts`, `smart.test.ts`

**Interfaces:**
- Consumes: `HiddenCreature`, `hasTrait`, the face-down twins in `legal` (tasks 1 to 3).
- Produces:
  - `probe(view: PlayerView, legal: readonly Action[]): AttackAction | null` — exported.
  - `faceDownTwin(play: PlayAction, legal: readonly Action[]): PlayAction | null` — exported from `smart.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/bots/test/bots.test.ts` — import `probe` from `../src/probe`, and add:

```ts
describe("probe", () => {
  it("attacks a hidden creature with the weakest attacker that may", () => {
    const v = view({
      mine: [on("ash-duelist"), on("ember-fox"), null, null, null],
      theirs: [{ hidden: true, position: "defense" }, null, null, null, null],
    });
    const legal: Action[] = [
      { type: "ATTACK", attackerSlot: 0, target: 0 },
      { type: "ATTACK", attackerSlot: 1, target: 0 },
      { type: "END_TURN" },
    ];
    expect(probe(v, legal)).toEqual({ type: "ATTACK", attackerSlot: 1, target: 0 });
  });

  it("is null with no hidden target", () => {
    const v = view({ mine: [on("ash-duelist"), null, null, null, null], theirs: [on("seedling"), null, null, null, null] });
    expect(probe(v, [{ type: "ATTACK", attackerSlot: 0, target: 0 }])).toBeNull();
  });
});

describe("greedyBot and hidden creatures", () => {
  it("probes when no known attack is favourable", () => {
    const v = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [{ hidden: true, position: "defense" }, null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, { type: "END_TURN" }];
    expect(greedyBot.chooseAction(v, legal, createRng(1))).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });
  });
});
```

`packages/bots/test/smart.test.ts` — import `faceDownTwin` too, and add:

```ts
describe("smartBot and face-down play", () => {
  it("plays a Venom creature it puts in defense face-down, as a lure", () => {
    const play: Action = { type: "PLAY", handIndexes: [0], slot: 0, position: "defense" };
    const twin: Action = { ...play, faceDown: true };
    expect(faceDownTwin(play, [play, twin, END])).toEqual(twin);
  });

  it("chooses the face-down twin when its play is a Venom creature in defense", () => {
    // a 3000 threat: Thorn Sprite cannot hold in attack position, so it goes to defense
    const v = view({ hand: ["thorn-sprite"], theirs: [on("ancient-tyrant"), null, null, null, null] });
    const legal: Action[] = [
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
      { type: "PLAY", handIndexes: [0], slot: 0, position: "attack", faceDown: true },
      { type: "PLAY", handIndexes: [0], slot: 0, position: "defense" },
      { type: "PLAY", handIndexes: [0], slot: 0, position: "defense", faceDown: true },
      END,
    ];
    expect(smartBot.chooseAction(v, legal, rng)).toEqual({
      type: "PLAY",
      handIndexes: [0],
      slot: 0,
      position: "defense",
      faceDown: true,
    });
  });

  it("probes only while it has another creature", () => {
    const alone = view({ mine: [on("ember-fox"), null, null, null, null], theirs: [{ hidden: true, position: "defense" }, null, null, null, null] });
    const legal: Action[] = [{ type: "ATTACK", attackerSlot: 0, target: 0 }, END];
    expect(smartBot.chooseAction(alone, legal, rng)).toEqual(END);
    const two = view({
      mine: [on("ember-fox"), on("ash-duelist", "defense"), null, null, null],
      theirs: [{ hidden: true, position: "defense" }, null, null, null, null],
    });
    expect(smartBot.chooseAction(two, legal, rng)).toEqual({ type: "ATTACK", attackerSlot: 0, target: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/bots/test`
Expected: FAIL — no `probe`, no `faceDownTwin`; greedy and smart end the turn instead of probing.

- [ ] **Step 3: Implement**

Create `packages/bots/src/probe.ts`:

```ts
import type { Action, AttackAction, PlayerView } from "@duel/engine";

/**
 * An attack on one of the opponent's face-down creatures by the weakest
 * creature that may make it, or null. A hidden target cannot be previewed, so
 * a bot sends its cheapest attacker to find out what it is.
 */
export function probe(view: PlayerView, legal: readonly Action[]): AttackAction | null {
  const atk = (action: AttackAction) => view.self.field[action.attackerSlot]!.atk;
  let best: AttackAction | null = null;
  for (const action of legal) {
    if (action.type !== "ATTACK" || action.target === "direct") continue;
    if (!view.opponent.field[action.target]?.hidden) continue;
    if (!best || atk(action) < atk(best)) best = action;
  }
  return best;
}
```

`packages/bots/src/greedy.ts`:

- `bestPlay` skips face-down plays: `if (action.type !== "PLAY" || action.position !== "attack" || action.faceDown) continue;`
- in `chooseAction`, between the attack and `END_TURN`:

```ts
    const look = probe(view, legal);
    if (look) return look;
```

(import `probe` from `./probe`).

`packages/bots/src/wide.ts`:

- `widePlay` skips face-down plays: `if (action.type !== "PLAY" || action.position !== "attack" || action.handIndexes.length !== 1 || action.faceDown) continue;`
- in `chooseAction`, the same two probe lines before `END_TURN` (import `probe`).

`packages/bots/src/smart.ts` — add `hasTrait` to the `@duel/engine` import, import `probe` from `./probe`, and:

- in `playOptions`, rank face-up plays only: `if (action.type !== "PLAY" || action.faceDown) continue;`
- add:

```ts
/** The face-down version of `play` if it is legal, else null. */
export function faceDownTwin(play: PlayAction, legal: readonly Action[]): PlayAction | null {
  const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return (
    legal.find(
      (action): action is PlayAction =>
        action.type === "PLAY" &&
        action.faceDown === true &&
        action.slot === play.slot &&
        action.position === play.position &&
        same(action.handIndexes, play.handIndexes),
    ) ?? null
  );
}
```

- in `smartBot.chooseAction`, the play step becomes:

```ts
    const play = smartPlay(view, legal);
    if (play) {
      // a Venom creature in defense is worth more unseen: the lure (R6)
      const result = fuseChain(playMaterials(view.self.field, view.self.hand, play)).result;
      if (play.position === "defense" && hasTrait(result, "venom")) return faceDownTwin(play, legal) ?? play;
      return play;
    }
```

- and, after `const attack = bestAttack(view, legal); if (attack) return attack;`:

```ts
    // never send its only creature into a possible lure
    const creatures = view.self.field.filter((creature) => creature !== null).length;
    const look = creatures >= 2 ? probe(view, legal) : null;
    if (look) return look;
```

`packages/bots/src/index.ts` — add `export { probe } from "./probe";` and `faceDownTwin` to the smart export line.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: `time pnpm -s sim --a smart --b smart --games 100`, `pnpm -s sim --a smart --b greedy --games 100`, `pnpm -s sim --a random --b random --games 100`
Expected: 0 errors; smart under 30 s.

Run: `pnpm -s sim --a smart --b greedy --replay 3 | grep -E "face-down|revealed" | head`
Expected: at least one face-down play and one reveal in the replay (if seed 3 has none, try seeds 4 to 10 and note which one does in the commit message).

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Bots and face-down play: greedy, wide and smart probe a hidden creature with their weakest attacker (smart only while it has two creatures); smart plays a Venom creature it puts in defense face-down as a lure (tactics phase 5, task 4, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(bots): probe hidden creatures, lure with Venom

Closes #N"
```

---

### Task 5: Measure, and bring the docs in step

**Files:**
- Modify: `docs/specs/2026-11-13-face-down-play-design.md`, `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-12-online-card-duel-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0003-authoritative-server-per-player-views.md`, `docs/ddr/0009-tactics-combination-over-raw-stats.md`, `docs/ddr/0010-engine-determines-effective-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the phase 5 results, all tactics rules R1 to R6 implemented, and the hand-off to the revision of plans 2 and 3.

- [ ] **Step 1: Run the comparison**

With the current defaults and `--games 500`:

```bash
pnpm -s sim --a smart --b smart --games 500
pnpm -s sim --a greedy --b wide --games 500
pnpm -s sim --a smart --b wide --games 500
pnpm -s sim --a smart --b greedy --games 500
pnpm -s sim --a smart --b smart --deck-a answers --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a synergy --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a beast --deck-b strongest --games 500
```

Also time `pnpm -s sim --a smart --b smart --games 100` for the record.

Expected: 0 errors in every run.

- [ ] **Step 2: Record it**

- `docs/specs/2026-11-13-tactics-rules-design.md`, `Revisions`: a section `### <today's date>: phase 5 results (R6) and the full rule set` with the runs (same columns as before), the section 6 target table with one column per phase (baseline, 1, 2, 3, 4, 5), which targets the full rule set meets, the settings the numbers favour as a recommendation for the owner, and the simulator time. Note that R1 to R6 are now all implemented, so step 3 of the 2026-11-13 next steps (revise plans 2 and 3) can start.
- `docs/specs/2026-11-13-face-down-play-design.md`, `Revisions`: implemented; the planning decisions (optional `faceDown`; `played` carries `faceDown` and `handCards`; a face-up play onto a hidden creature turns it face-up; previews refuse a hidden target; the bot policies).

- [ ] **Step 3: Bring the other docs in step**

- `docs/specs/2026-11-12-online-card-duel-design.md`, `Revisions`: section 4.4 no longer says "All creatures on the field are face-up"; `PLAY` may be face-down, `REVEAL` is a free action, and the reveal rules (F1 to F11) apply.
- `docs/specs/2026-11-13-engine-high-level-design.md`, `Revisions`: `Creature.faceDown`, `HiddenCreature`, `RevealAction`, the `revealed` event and the new `played` shape, `eventsFor`, the reveal steps in `resolveAttack`, the hidden placeholder in previews.
- `docs/ddr/0003-authoritative-server-per-player-views.md`: Implementation names `eventsFor` in `packages/engine/src/events.ts`; set `Last updated`.
- `docs/ddr/0009-tactics-combination-over-raw-stats.md`: Implementation says R1 to R6 are implemented; the known gap gets the full-rule-set numbers; set `Last updated`.
- `docs/ddr/0010-engine-determines-effective-stats.md`: the known gap no longer lists hidden creatures; the compliance check ("effective values absent for hidden ones") is now tested in `view.test.ts`; set `Last updated`.
- `CLAUDE.md`: Status: "Tactics phases 0 to 5 are implemented (R1 to R6). Next: revise plans 2 and 3 against the real engine types, then implement them."; add this plan and phases 2 to 4 to the "Read first" table if they are not there yet.

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 4: Commit**

Append to `HISTORY.md`:
`- **[docs]** Recorded the phase 5 results and the full rule set (R1 to R6) in docs/specs/2026-11-13-tactics-rules-design.md; brought the face-down spec, the approved spec's Revisions, the engine high-level design, DDR-0003, DDR-0009, DDR-0010 and CLAUDE.md in step; plans 2 and 3 can now be revised (tactics phase 5, task 5, #N).`

```bash
git add docs CLAUDE.md HISTORY.md
git commit -m "docs: phase 5 results; all tactics rules implemented

Closes #N"
```

---

## Spec coverage

| Face-down spec item | Task |
|---|---|
| F1 `PLAY` has `faceDown`, any position | 1 |
| F2 a hidden creature's position is public | 3 (`HiddenCreature`) |
| F3 a creature that survives being attacked is face-up | 2 |
| F4 Guard does nothing while face-down | 2 |
| F5 Rally applies while face-down | 2 |
| F6 once face-up, always face-up | 1 |
| F7 a play onto your own hidden creature may stay hidden | 1 |
| F8 free `REVEAL` | 1 |
| F9 a hidden creature blocks direct attacks | 2 (a test; already true) |
| F10 `SET_POSITION` does not reveal | 1 (a test) |
| F11 wear applies normally | 2 (no special case) |
| Section 2: revealed before attacking; real values, element and battle traits when attacked; no Banner or Pack | 2 |
| Section 4: what each player sees | 3 |
| Section 5: `VisibleCreature`/`HiddenCreature` view types | 3 (`ViewCreature` keeps its name and gains `faceDown`) |
| Section 5: `eventsFor` and the event table, the order inside an attack | 1, 2, 3 |
| Section 5: `legalActions` lists both faces | 1 |
| Section 5: bots choose without the card; probe policy | 3, 4 |
| Section 6: DDR-0003, the approved spec, plans 2 and 3 | 5 (plans 2 and 3 are the next step, not this plan) |

## Not in this plan

- Revising plans 2 and 3. They come next, against the types this plan leaves (spec `Revisions`, 2026-11-13: "Revise plans 2 and 3 against the real types, then implement them").
- Tuning defaults, traits or bonuses. Each phase's results recommend; the owner decides.
- A smart policy for `REVEAL` (for example, revealing a hidden Banner before attacking). The random bot exercises it in tests and simulations.

## Revisions

### 2026-11-13

- Written at the owner's request with phases 2 to 4, so all tactics rules are done before plans 2 and 3.
- Issues (milestone "Tactics phase 5: Face-down play"): task 1 is #68, task 2 #69, task 3 #70, task 4 #71, task 5 #72. Read `#N` in a task as that task's issue. Implement on one branch per phase, one commit per task.
