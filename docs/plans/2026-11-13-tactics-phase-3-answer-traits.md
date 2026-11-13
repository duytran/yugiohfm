# Tactics Phase 3 (Answer Traits) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rule R4: three answer traits printed on cards (Venom, Guard, Pierce), so a big creature has visible answers on the board, and measure them.

**Architecture:** `Card` gains `traits`, printed in `cards.ts`; a creature has exactly the traits of its card, so `Creature`, views and events do not change. Venom and Pierce are part of `battleOutcome`, which `resolveAttack` and every preview share. Guard is a legality check in `attackError`, so `legalActions` follows. A trait deck builder lets the simulator compare an "answers" deck with the strongest deck.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/specs/2026-11-13-tactics-rules-design.md`, R4 (section 4), section 5, phase 3 (section 8). Depends on phase 2 (`docs/plans/2026-11-13-tactics-phase-2-wear.md`) being implemented.

## Global Constraints

- Rules live only in `packages/engine`; it imports nothing outside its own files and uses no clock, timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- Bots see only a `PlayerView`, import only from `@duel/engine`, and return one of `legal` (DDR-0006).
- **A creature has exactly the traits printed on its own card; a fusion result inherits nothing** (DDR-0009). The tag pair picks the result card, as before.
- **Balance rule for the pool** (spec R4): the higher a card's ATK, the fewer and weaker its traits; the top-ATK results print none. In numbers for this plan: no card has more than one trait, no base card with ATK 1600 or more has one, and no fusion result with ATK 2200 or more has one.
- The card pool keeps its 40 base and 20 fusion cards, with their names, tags and stats unchanged; only traits are added (DDR-0009: the pool is not grown or reshaped before it is tested, and phases 0 to 2 tested it). All names stay our own (DDR-0008).
- Regression check: before task 1, record the output of `pnpm -s sim --a smart --b smart --games 100` and `pnpm -s sim --a greedy --b greedy --games 20 --seed 1`. Task 1 adds data only, so both must print the same afterwards. Tasks 2 and 3 change battles and are measured in task 4 instead.
- Speed budget: `pnpm -s sim --a smart --b smart --games 100` stays under 15 s.
- Every task: test first, one commit, one `HISTORY.md` line in the same commit, one GitHub issue, `Closes #N` in the commit message. Issue numbers are listed in `Revisions` at the bottom.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm vitest run <file>`.

## Decisions made while planning

- **Which cards print which trait** (proposed here; the owner approves it with this plan, and task 4's numbers may move them):

| Trait | Base cards | Fusion result |
|---|---|---|
| Venom | Thorn Sprite (forest, 900/1100), Breeze Wisp (wind, 800/800), Spark Ferret (thunder, 1000/600) | Briar Stag (beast + plant, 1900/1700), the spec's "recipe for an ability" example |
| Guard | Furnace Drone (flame, 1100/1500), Clay Sentinel (earth, 1000/1800), Pearl Clam (water, 400/1800) | Iron Vanguard (machine + warrior, 2100/2200) |
| Pierce | Vine Archer (forest, 1400/900), Storm Crow (wind, 1300/900), Gale Falcon (wind, 1500/800) | Sky Lancer (bird + warrior, 1900/1400) |

  Venom goes on weak bodies (it should trade up, not win fights), Guard on high-DEF bodies, Pierce on high-ATK, low-DEF bodies. Thorn Sprite has Venom because the face-down spec's lure example uses it.
- **Venom counts only a destruction by battle with the Venom creature.** A Venom creature destroyed in its own failed attack takes the target with it; a Venom target destroyed by an attacker takes the attacker with it. Damage is unchanged.
- **Pierce deals `attack − defense`** to the owner of a destroyed defense-position creature. It changes nothing against an attack-position target, which already deals the difference.
- **Guard forces attacks onto any Guard creature in defense position**; with two Guards the attacker picks either. A Guard in attack position forces nothing. Direct attacks are already impossible while a Guard is on the field.
- **Error text:** `"a Guard creature must be attacked first"`.

## File Structure

| File | Change |
|---|---|
| `packages/engine/src/types.ts` | `TRAITS`, `Trait`, `Card.traits` |
| `packages/engine/src/cards.ts` | traits printed on 12 cards; `hasTrait`; a `fusion` helper |
| `packages/engine/src/battle.ts` | `Combatant.traits`; Venom and Pierce in `battleOutcome`; Guard in `attackError` |
| `packages/engine/src/index.ts` | export `hasTrait` |
| `packages/bots/src/decks.ts` | `traitDeck`; the `answers` deck |

---

### Task 1: Traits printed on cards

**Files:**
- Modify: `packages/engine/src/types.ts`, `cards.ts`, `index.ts`
- Test: `packages/engine/test/cards.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `TRAITS = ["venom", "guard", "pierce"] as const`, `type Trait`, `Card.traits: Trait[]`.
  - `hasTrait(cardId: CardId, trait: Trait): boolean`, exported from `@duel/engine`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/test/cards.test.ts`, import `hasTrait` from `../src/cards` and `TRAITS` from `../src/types`, and add:

```ts
describe("traits (R4)", () => {
  const withTrait = (trait: string) => CARDS.filter((c) => (c.traits as string[]).includes(trait)).map((c) => c.id);

  it("prints Venom, Guard and Pierce on the planned cards", () => {
    expect(withTrait("venom")).toEqual(["thorn-sprite", "breeze-wisp", "spark-ferret", "briar-stag"]);
    expect(withTrait("guard")).toEqual(["furnace-drone", "clay-sentinel", "pearl-clam", "iron-vanguard"]);
    expect(withTrait("pierce")).toEqual(["vine-archer", "gale-falcon", "storm-crow", "sky-lancer"]);
  });

  it("uses only known traits", () => {
    for (const c of CARDS) for (const t of c.traits) expect(TRAITS).toContain(t);
  });

  it("follows the balance rule: one trait at most, none on strong cards", () => {
    for (const c of CARDS) expect(c.traits.length).toBeLessThanOrEqual(1);
    for (const c of base.filter((c) => c.atk >= 1600)) expect(c.traits, c.id).toEqual([]);
    for (const c of fusions.filter((c) => c.atk >= 2200)) expect(c.traits, c.id).toEqual([]);
  });

  it("hasTrait reads the card", () => {
    expect(hasTrait("thorn-sprite", "venom")).toBe(true);
    expect(hasTrait("thorn-sprite", "guard")).toBe(false);
    expect(hasTrait("ancient-tyrant", "venom")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/cards.test.ts`
Expected: FAIL — `traits` is undefined, `hasTrait` is not exported.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts` — after `Tag`:

```ts
/** Keywords printed on some cards (R4). A creature has exactly the traits of its card. */
export const TRAITS = ["venom", "guard", "pierce"] as const;
export type Trait = (typeof TRAITS)[number];
```

and `Card` gains, after `def`:

```ts
  /** printed on the card; a fusion result has its own and inherits none */
  traits: Trait[];
```

`packages/engine/src/cards.ts`:

```ts
import type { Card, CardId, Element, FusionRule, Tag, Trait } from "./types";

function card(
  id: CardId,
  name: string,
  element: Element,
  tags: Tag[],
  atk: number,
  def: number,
  traits: Trait[] = [],
): Card {
  return { id, name, element, tags, atk, def, traits, fusionOnly: false };
}

/** A card reachable only by fusion. */
function fusion(
  id: CardId,
  name: string,
  element: Element,
  tags: Tag[],
  atk: number,
  def: number,
  traits: Trait[] = [],
): Card {
  return { ...card(id, name, element, tags, atk, def, traits), fusionOnly: true };
}
```

In `BASE`, change these nine lines (every other line stays as it is):

```ts
  card("furnace-drone", "Furnace Drone", "flame", ["machine"], 1100, 1500, ["guard"]),
  card("thorn-sprite", "Thorn Sprite", "forest", ["plant"], 900, 1100, ["venom"]),
  card("vine-archer", "Vine Archer", "forest", ["warrior", "plant"], 1400, 900, ["pierce"]),
  card("gale-falcon", "Gale Falcon", "wind", ["bird"], 1500, 800, ["pierce"]),
  card("breeze-wisp", "Breeze Wisp", "wind", ["mage"], 800, 800, ["venom"]),
  card("storm-crow", "Storm Crow", "wind", ["bird"], 1300, 900, ["pierce"]),
  card("clay-sentinel", "Clay Sentinel", "earth", ["warrior"], 1000, 1800, ["guard"]),
  card("spark-ferret", "Spark Ferret", "thunder", ["beast"], 1000, 600, ["venom"]),
  card("pearl-clam", "Pearl Clam", "water", ["aqua"], 400, 1800, ["guard"]),
```

Replace `FUSIONS` with:

```ts
const FUSIONS: Card[] = [
  fusion("beast-rider", "Beast Rider", "earth", ["beast", "warrior"], 1900, 1500),
  fusion("briar-stag", "Briar Stag", "forest", ["beast", "plant"], 1900, 1700, ["venom"]),
  fusion("sky-lancer", "Sky Lancer", "wind", ["bird", "warrior"], 1900, 1400, ["pierce"]),
  fusion("twin-fang-chimera", "Twin-Fang Chimera", "flame", ["beast"], 2000, 1600),
  fusion("bloom-witch", "Bloom Witch", "forest", ["mage", "plant"], 2000, 1800),
  fusion("tide-sorcerer", "Tide Sorcerer", "water", ["mage", "aqua"], 2000, 1900),
  fusion("griffin", "Griffin", "wind", ["bird", "beast"], 2100, 1700),
  fusion("iron-vanguard", "Iron Vanguard", "earth", ["machine", "warrior"], 2100, 2200, ["guard"]),
  fusion("storm-archmage", "Storm Archmage", "thunder", ["mage"], 2100, 2000),
  fusion("dragon-knight", "Dragon Knight", "flame", ["dragon", "warrior"], 2200, 1800),
  fusion("storm-phoenix", "Storm Phoenix", "thunder", ["bird"], 2200, 1600),
  fusion("rune-automaton", "Rune Automaton", "earth", ["machine", "mage"], 2200, 2300),
  fusion("tidal-behemoth", "Tidal Behemoth", "water", ["beast", "aqua"], 2300, 2100),
  fusion("elder-treant", "Elder Treant", "forest", ["plant"], 2300, 2500),
  fusion("arcane-wyvern", "Arcane Wyvern", "wind", ["dragon", "mage"], 2400, 1900),
  fusion("steel-wyrm", "Steel Wyrm", "thunder", ["dragon", "machine"], 2400, 2400),
  fusion("thorn-hydra", "Thorn Hydra", "forest", ["dragon", "plant"], 2500, 2000),
  fusion("siege-colossus", "Siege Colossus", "earth", ["machine"], 2600, 2600),
  fusion("abyss-leviathan", "Abyss Leviathan", "water", ["dragon", "aqua"], 2700, 2300),
  fusion("ancient-tyrant", "Ancient Tyrant", "flame", ["dragon"], 3000, 2500),
];
```

and add after `getCard`:

```ts
export function hasTrait(cardId: CardId, trait: Trait): boolean {
  return getCard(cardId).traits.includes(trait);
}
```

`packages/engine/src/index.ts` — the cards line becomes:

```ts
export { CARDS, FUSION_RULES, findCard, getCard, hasTrait } from "./cards";
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

Run: the two regression commands from Global Constraints.
Expected: the same output as recorded before this task.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** Cards now carry printed traits: Venom, Guard and Pierce on nine base cards and three mid-ATK fusion results (Briar Stag, Iron Vanguard, Sky Lancer); no rule reads them yet (tactics phase 3, task 1, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): traits printed on cards

Closes #N"
```

---

### Task 2: Venom and Pierce in battle

**Files:**
- Modify: `packages/engine/src/battle.ts`
- Test: `packages/engine/test/battle.test.ts`, `packages/engine/test/preview.test.ts`

**Interfaces:**
- Consumes: `Card.traits` (task 1), `BattleOutcome.targetWear` (phase 2).
- Produces: `Combatant = { atk: number; def: number; element: Element; traits: readonly Trait[] }`. `BattleOutcome` keeps its shape; Venom shows as both creatures destroyed, Pierce as `damageToOpponent`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/test/battle.test.ts`, in `describe("battleOutcome", ...)`, give the two combatants `traits: []`:

```ts
  const strong = { atk: 2000, def: 1000, element: "flame" as const, traits: [] };
  const weak = { atk: 1500, def: 1800, element: "flame" as const, traits: [] };
```

and add:

```ts
describe("Venom (R4)", () => {
  it("destroys an attacker that destroys a Venom target", () => {
    // flame beats forest: 1500 + 500 against Thorn Sprite's DEF 1100
    const state = duel("ash-duelist", "thorn-sprite", "defense");
    const events: GameEvent[] = [];
    resolveAttack(state, 0, attack(0, 0), events);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(events).toEqual([
      { type: "attacked", player: 0, attackerSlot: 0, target: 0 },
      { type: "destroyed", player: 1, slot: 0, cardId: "thorn-sprite" },
      { type: "destroyed", player: 0, slot: 0, cardId: "ash-duelist" },
    ]);
  });

  it("takes the target with it when a Venom attacker loses", () => {
    // thunder against flame, no bonus: 1000 against 1500
    const state = duel("spark-ferret", "ash-duelist");
    const outcome = resolveAttack(state, 0, attack(0, 0), []);
    expect(outcome).toMatchObject({ attackerDestroyed: true, targetDestroyed: true, damageToSelf: 500, targetWear: 0 });
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[0].lifePoints).toBe(3500);
  });

  it("does nothing when the Venom creature survives", () => {
    // water against forest, no bonus: 900 against DEF 1100
    const state = duel("harbor-gull", "thorn-sprite", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).not.toBeNull();
    expect(state.players[1].field[0]).not.toBeNull();
  });
});

describe("Pierce (R4)", () => {
  it("deals the difference when it destroys a defense-position creature", () => {
    // forest against earth, no bonus: 1400 against DEF 1300
    const state = duel("vine-archer", "root-shaman", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3900);
  });

  it("still deals its damage when the target has Venom", () => {
    // forest against forest: 1400 against DEF 1100
    const state = duel("vine-archer", "thorn-sprite", "defense");
    resolveAttack(state, 0, attack(0, 0), []);
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    expect(state.players[1].lifePoints).toBe(3700);
  });
});
```

In `packages/engine/test/preview.test.ts`, add three rows to the `cases` of `"agrees with what resolveAttack then does"`:

```ts
      ["ash-duelist", "thorn-sprite", "defense"],
      ["spark-ferret", "ash-duelist", "attack"],
      ["vine-archer", "root-shaman", "defense"],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/battle.test.ts`
Expected: FAIL — the Venom and Pierce cases.

- [ ] **Step 3: Implement**

In `packages/engine/src/battle.ts`, add `Trait` to the type imports, and:

```ts
/** One side of a battle: its current ATK and DEF, its element and its printed traits. */
export type Combatant = { atk: number; def: number; element: Element; traits: readonly Trait[] };
```

Replace the part of `battleOutcome` after the `if (!target) { ... }` block with:

```ts
  const { attack, defense } = battleValues(attacker, target.combatant, target.position, rules);
  const inAttack = target.position === "attack";
  // what the battle itself destroys
  const beaten = inAttack ? attack >= defense : attack > defense;
  const lost = inAttack && attack <= defense;
  // Venom (R4): whatever destroys a Venom creature in battle is destroyed with it
  const targetDestroyed = beaten || (lost && attacker.traits.includes("venom"));
  const attackerDestroyed = lost || (beaten && target.combatant.traits.includes("venom"));
  // Pierce (R4): destroying a defense-position creature still hurts its owner
  const pierced = !inAttack && beaten && attacker.traits.includes("pierce");
  return {
    attack,
    defense,
    attackerDestroyed,
    targetDestroyed,
    damageToSelf: Math.max(0, defense - attack),
    damageToOpponent: inAttack || pierced ? Math.max(0, attack - defense) : 0,
    // a target that survives is worn by the attack it withstood (R3)
    targetWear: targetDestroyed ? 0 : Math.floor(rules.wearRatio * attack),
  };
```

and `fromState` carries the card's traits:

```ts
function fromState(state: MatchState, player: PlayerId, slot: number): Combatant {
  const card = getCard(state.players[player].field[slot]!.cardId);
  return { ...effectiveStats(state, player, slot), element: card.element, traits: card.traits };
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass, including every earlier battle test (the rewrite gives the same results without traits).

Run: `pnpm -s sim --a smart --b smart --games 100` and `pnpm -s sim --a random --b random --games 100`
Expected: 0 errors.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R4: Venom (whatever destroys it in battle is destroyed too) and Pierce (destroying a defense-position creature deals the difference) are part of battleOutcome, so previews follow (tactics phase 3, task 2, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): Venom and Pierce in battle

Closes #N"
```

---

### Task 3: Guard

**Files:**
- Modify: `packages/engine/src/battle.ts`
- Test: `packages/engine/test/battle.test.ts`, `packages/engine/test/legal.test.ts`

**Interfaces:**
- Consumes: `hasTrait` (task 1).
- Produces: `attackError` returns `"a Guard creature must be attacked first"` for an attack on a non-Guard target while the opponent has a Guard creature in defense position.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/battle.test.ts`, inside `describe("attackError", ...)`:

```ts
  it("makes attacks go to a Guard creature in defense position first", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 1: creature("clay-sentinel", "defense") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBe("a Guard creature must be attacked first");
    expect(attackError(state, 0, attack(0, 1))).toBeNull();
  });

  it("lets the attacker pick between two Guards", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("pearl-clam", "defense"), 1: creature("clay-sentinel", "defense"), 2: creature("ember-fox") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBeNull();
    expect(attackError(state, 0, attack(0, 1))).toBeNull();
    expect(attackError(state, 0, attack(0, 2))).toBe("a Guard creature must be attacked first");
  });

  it("forces nothing while the Guard is in attack position", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 1: creature("clay-sentinel", "attack") }) },
    });
    expect(attackError(state, 0, attack(0, 0))).toBeNull();
  });
```

`packages/engine/test/legal.test.ts`:

```ts
  it("lists only attacks on a Guard in defense position while there is one", () => {
    const state = makeState({
      p0: { field: field({ 0: creature("ash-duelist") }) },
      p1: { field: field({ 0: creature("ember-fox"), 3: creature("clay-sentinel", "defense") }) },
    });
    expect(legalActions(state, 0).filter((a) => a.type === "ATTACK")).toEqual([
      { type: "ATTACK", attackerSlot: 0, target: 3 },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/engine/test/battle.test.ts packages/engine/test/legal.test.ts`
Expected: FAIL — attacks on non-Guard creatures are accepted.

- [ ] **Step 3: Implement**

In `packages/engine/src/battle.ts`, import `hasTrait` with `getCard` from `./cards`, and at the end of `attackError`, replace `return null;` (after the target slot checks) with:

```ts
  // Guard (R4): while a Guard stands in defense position, attacks go to a Guard first
  const guards = enemyField.flatMap((creature, slot) =>
    creature && creature.position === "defense" && hasTrait(creature.cardId, "guard") ? [slot] : [],
  );
  if (guards.length > 0 && !guards.includes(target)) return "a Guard creature must be attacked first";
  return null;
```

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all pass. The property test's random matches never see a rejected legal action, since `legalActions` filters through `attackError`.

Run: `pnpm -s sim --a smart --b smart --games 100` and `pnpm -s sim --a random --b random --games 100`
Expected: 0 errors.

- [ ] **Step 5: Commit**

Append to `HISTORY.md`:
`- **[code]** R4: Guard; while the opponent has a Guard creature in defense position, attacks must target a Guard (tactics phase 3, task 3, DDR-0009, #N).`

```bash
git add packages HISTORY.md
git commit -m "feat(engine): Guard forces attacks onto it

Closes #N"
```

---

### Task 4: An answers deck, measure, and bring the docs in step

**Files:**
- Modify: `packages/bots/src/decks.ts`, `index.ts`
- Test: `packages/bots/test/decks.test.ts`
- Modify: `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-12-online-card-duel-design.md`, `docs/specs/2026-11-13-engine-high-level-design.md`, `docs/ddr/0009-tactics-combination-over-raw-stats.md`, `CLAUDE.md`, `HISTORY.md`

**Interfaces:**
- Consumes: `Card.traits`, `Trait` (task 1).
- Produces: `traitDeck(traits: readonly Trait[]): DeckBuilder`; `DECKS.answers`.

- [ ] **Step 1: Write the failing test**

In `packages/bots/test/decks.test.ts`, import `traitDeck` too, change the expected key list to:

```ts
    expect(Object.keys(DECKS)).toEqual(["strongest", "random", "answers", "flame", "forest", "wind", "earth", "thunder", "water"]);
```

and add:

```ts
  it("a trait deck holds 3 copies of every base card with one of the traits, then the strongest others", () => {
    const deck = traitDeck(["venom", "guard", "pierce"])(CARDS, createRng(1));
    const answers = deck.filter((id) => getCard(id).traits.length > 0);
    // 9 base cards with an answer trait x 3
    expect(answers).toHaveLength(27);
    expect(deck.filter((id) => id === "cloud-serpent")).toHaveLength(3);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/bots/test/decks.test.ts`
Expected: FAIL — `traitDeck` is not exported.

- [ ] **Step 3: Implement**

In `packages/bots/src/decks.ts`, add `type Trait` to the `@duel/engine` import, and:

```ts
/** Every base card with one of `traits`, then the strongest other base cards. */
export function traitDeck(traits: readonly Trait[]): DeckBuilder {
  return (cards) => {
    const base = cards.filter((c) => !c.fusionOnly);
    const has = (c: Card) => c.traits.some((t) => traits.includes(t));
    return fill([...base.filter(has).sort(strongestFirst), ...base.filter((c) => !has(c)).sort(strongestFirst)]);
  };
}
```

`DECKS` becomes:

```ts
export const DECKS: Record<string, DeckBuilder> = {
  strongest: strongestDeck,
  random: randomDeck,
  answers: traitDeck(["venom", "guard", "pierce"]),
  ...Object.fromEntries(ELEMENTS.map((element) => [element, elementDeck(element)])),
};
```

`packages/bots/src/index.ts` — add `traitDeck` to the `./decks` export list.

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 4: Run the comparison**

With the default rules and `--games 500`:

```bash
pnpm -s sim --a smart --b smart --games 500
pnpm -s sim --a greedy --b wide --games 500
pnpm -s sim --a smart --b wide --games 500
pnpm -s sim --a smart --b greedy --games 500
pnpm -s sim --a smart --b smart --deck-a flame --deck-b strongest --games 500
pnpm -s sim --a smart --b smart --deck-a answers --deck-b strongest --games 500
pnpm -s sim --a greedy --b greedy --deck-a answers --deck-b strongest --games 500
```

If the owner has changed a default after phase 2, use the new defaults; otherwise also run the smart-versus-smart and answers rows with the `--wear` and `--first-plays` values phase 2 recommended.

Expected: 0 errors in every run.

- [ ] **Step 5: Record it and bring the docs in step**

- `docs/specs/2026-11-13-tactics-rules-design.md`, `Revisions`: a section `### <today's date>: phase 3 results (R4)` with the trait table from "Decisions made while planning", the runs as tables (same columns as phase 2), the section 6 targets against the phase 2 column, what moved, and the planning decisions (Venom counts only battle destruction; Pierce deals attack minus defense; Guard only in defense position, attacker picks among Guards). Note any trait the numbers show to be too strong or too weak, as a suggestion for the owner.
- `docs/specs/2026-11-12-online-card-duel-design.md`, `Revisions`: cards may print one trait (Venom, Guard, Pierce) with its rule; section 4.5 gains the Venom and Pierce lines and section 4.4 the Guard line.
- `docs/specs/2026-11-13-engine-high-level-design.md`, `Revisions`: `Card.traits`, `hasTrait`, `Combatant.traits`, where each trait is checked.
- `docs/ddr/0009-tactics-combination-over-raw-stats.md`: set `Last updated`; Implementation says R1 to R4 are implemented (add `cards.ts`); the known gap gets the phase 3 numbers.
- `CLAUDE.md`: Status says tactics phases 0 to 3 are implemented (R1 to R4); the `pnpm sim` line names the `answers` deck; add this plan to the "Read first" table.

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

Append to `HISTORY.md`:
`- **[code]** Added traitDeck and the answers deck (every Venom, Guard and Pierce base card); recorded the phase 3 results in docs/specs/2026-11-13-tactics-rules-design.md and brought the approved spec's Revisions, the engine high-level design, DDR-0009 and CLAUDE.md in step with R4 (tactics phase 3, task 4, #N).`

```bash
git add packages docs CLAUDE.md HISTORY.md
git commit -m "feat(bots): answers deck; docs: phase 3 results

Closes #N"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| R4: Venom, Guard, Pierce, printed on some base cards | 1 (data), 2 (Venom, Pierce), 3 (Guard) |
| R4: the result card decides; nothing is inherited | 1 (traits live only on `Card`) |
| R4: fusion results may print traits; top-ATK results print none | 1 |
| R4: balance rule, the higher the ATK the fewer traits | 1 (a test) |
| R4: state is only `Card.traits`; checked in `attackError` and the battle | 1, 2, 3 |
| R4: card-pool work and balance runs | 1, 4 |
| Section 5: answers beat tall | 4 (the answers deck against the strongest deck) |

## Not in this plan

- R5 synergy traits: phase 4. R6 face-down: phase 5.
- Bot strategy for traits. The smart bot already scores attacks through the engine's previews, which now include Venom and Pierce, and Guard reaches it through `legal`. It does not yet play a Guard in defense on purpose; task 4 reports whether that matters.
- Moving traits between cards. Task 4 suggests; the owner decides.

## Revisions

### 2026-11-13

- Written at the owner's request with phases 2, 4 and 5, so all tactics rules are done before plans 2 and 3.
- Issues (milestone "Tactics phase 3: Answer traits"): task 1 is #60, task 2 #61, task 3 #62, task 4 #63. Read `#N` in a task as that task's issue. Implement on one branch per phase, one commit per task.
