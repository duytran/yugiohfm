# Browser Client Implementation Plan (revised for the tactics engine)

> **Supersedes** `docs/plans/2026-11-12-browser-client.md`. Same four tasks and issues (#21 to #24); the code is updated for the engine after tactics phases 0 to 5 (R1 to R6) and for the revised plan 2 (`docs/plans/2026-11-13-protocol-and-server.md`). What changed is listed in "Changes from the 2026-11-12 plan" below.

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser game: nickname entry, lobby, deck builder, room with invite link and ready check, and the duel board with fusion preview, chess clocks, event log, result and rematch.

**Architecture:** A React + Vite app in `apps/client`. Everything with logic is a plain TypeScript module with unit tests: storage, deck editing, routes, event text, clock display, play selection, the reconnecting connection, and a reducer that turns server messages into app state. React components only render that state and send messages; the client holds no rules (DDR-0003).

**Tech Stack:** React 19, Vite 8, @vitejs/plugin-react 6, TypeScript, Vitest. No router, state or UI library.

**Spec:** `docs/specs/2026-11-12-online-card-duel-design.md` section 8 and the client part of 9.

**This is plan 3 of 3.** It requires plan 1, tactics phases 0 to 5 and the revised plan 2 (`docs/plans/2026-11-13-protocol-and-server.md`) to be implemented.

All code in this plan was run in a scratch git worktree on `main` at `dc89cea` with the revised plan 2 on 2026-11-13: 67 client tests pass, the whole suite passes (479), both typechecks are clean and `vite build` succeeds. Two headless Chrome players then played through the real server and Vite: create a room, join by invite link, ready, a face-down play with its preview ("Result: Quarry Golem (1600/1700)"), the opponent seeing only a face-down card and the log line "Opponent played a face-down card (1 from hand)", Reveal, end turn, a face-up play, aiming an attack and reading the forecast ("1600 against 2100; the target survives, worn down by 1600; you lose your creature; 500 damage to you"), the attack doing exactly that, and a reload mid-match that rejoins, with no console errors. The 2026-11-12 run also covered surrender, rematch and the deck builder; that code is unchanged.

## Global Constraints

- Node 22, pnpm workspaces, TypeScript with `strict: true`. Imports inside a package are extensionless.
- Packages import each other only through their names (`@duel/engine`, `@duel/protocol`), never through deep paths.
- Never re-implement a rule (legality, fusion result, battle outcome, winner) outside `packages/engine`; call the engine (DDR-0001, DDR-0003).
- The game is original. Never add a name, card, artwork or text taken from an existing game (DDR-0008).
- After every task, append one line to `HISTORY.md` and include it in the task's commit (see `CLAUDE.md`).
- Package name `@duel/client`. Routes: `/`, `/decks`, `/room/<code>`.
- The client never decides legality, fusion results, battle outcomes or time-outs. It shows what `match.view` says, asks the server for previews of plays and attacks (`match.preview`), and shows server errors.
- A creature on the field shows the `atk` and `def` its view carries (synergy and wear included); printed values are shown only for cards in hand and in the deck builder. The client works out no value (DDR-0010). An opponent's face-down creature shows only its position.
- The plays left this turn come from the engine's `playsAllowed(view)`, never from the rule itself.

## Changes from the 2026-11-12 plan

Revised against the engine after tactics phases 0 to 5 (owner, 2026-11-13). Task 1 is unchanged.

- **Task 2:** `describeEvent` words a face-down play (the opponent's copy has no card), `revealed` and `worn`; `Selection` gains `faceDown` and `setFaceDown`; new `duel/forecast.ts` (`describeOutcome`) words an attack forecast from the engine's numbers; the engine's `playsAllowed` accepts a view (a type-only change) so the client can show the plays left. 35 client tests (was 27) and one engine test.
- **Task 3:** the reducer keeps `preview: { action: PreviewAction; preview: Preview }`; the test view has `playsUsed` and `rules` instead of `hasPlayed`.
- **Task 4:** `CardFace` takes the view's `stats` and a `faceDown` badge; new `HiddenFace` for an opponent's face-down creature; `DuelScreen` has a face-down checkbox, a Reveal button, "plays n/m", and aims an attack before confirming it, with the forecast in between; a click on a creature in a field slot no longer counts twice (in the 2026-11-12 plan the card and its slot both toggled the focus, so a creature could not be selected); an empty inline favicon keeps the console free of a 404. The manual check gains the face-down, Reveal and forecast items.
- The client connects to `/ws` on its own host. In development Vite proxies `/ws` to `ws://localhost:8787`.
- Browser storage keys: `duel.token`, `duel.nickname`, `duel.decks`. All storage goes through the `KeyValueStore` interface so it can be faked in tests and survive blocked storage.
- Card art is a placeholder: element colour plus one icon per tag.
- Component files are verified by `pnpm typecheck`, `vite build` and the manual two-tab check in task 4; logic lives in tested modules, not in components.

## File Structure

```
apps/client/
  package.json            scripts: dev (vite), build
  tsconfig.json           extends the root config, adds DOM and JSX
  vite.config.ts          React plugin, /ws proxy
  index.html
  src/storage.ts          token, nickname, saved decks
  src/decks.ts            deck editing and the starter deck
  src/route.ts            URL path to route
  src/eventText.ts        GameEvent to a log line
  src/duel/clock.ts       clock formatting and live countdown
  src/duel/selection.ts   building a PLAY from clicks
  src/net/connection.ts   WebSocket with hello and reconnect
  src/state/reducer.ts    server messages to app state
  src/state/useServer.ts  React hook around Connection and the reducer
  src/browser.ts          real localStorage, ids, socket URL
  src/usePath.ts          History API routing hook
  src/main.tsx, src/App.tsx
  src/components/CardFace.tsx, ClockView.tsx
  src/screens/HomeScreen.tsx, LobbyScreen.tsx, DeckBuilderScreen.tsx, RoomScreen.tsx, DuelScreen.tsx
  src/styles.css
  test/*.test.ts          one per logic module
```

---

### Task 1: Client package, storage, deck editing, routes

**Files:**
- Create: `apps/client/src/storage.ts`
- Create: `apps/client/src/decks.ts`
- Create: `apps/client/src/route.ts`
- Test: `apps/client/test/storage.test.ts`
- Test: `apps/client/test/decks.test.ts`
- Test: `apps/client/test/route.test.ts`

**Interfaces:**
- Consumes: from `@duel/engine`: `CARDS`, `DECK_SIZE`, `MAX_COPIES`, `findCard`, `validateDeck`, `CardId`.
- Produces: `type KeyValueStore = { getItem(key): string | null; setItem(key, value): void }`, `type SavedDeck = { id: string; name: string; cards: CardId[] }`, `loadToken(store, makeToken: () => string): string`, `loadNickname(store): string | null`, `saveNickname(store, nickname)`, `loadDecks(store): SavedDeck[]`, `saveDecks(store, decks)`, `playableDecks(decks): SavedDeck[]`; `countOf(cards, id)`, `addCard(cards, id): { cards } | { error }`, `removeCard(cards, id)`, `groupDeck(cards): { id; count }[]`, `starterDeck(): CardId[]`; `type Route`, `parseRoute(pathname): Route`, `roomPath(code): string`.

- [ ] **Step 0: Create the package, install React and Vite, add the client typecheck**

`apps/client/package.json`

```json
{
  "name": "@duel/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@duel/engine": "workspace:*",
    "@duel/protocol": "workspace:*"
  }
}
```

Run: `pnpm install && pnpm --filter @duel/client add react react-dom && pnpm --filter @duel/client add -D vite @vitejs/plugin-react @types/react @types/react-dom`
Expected: React 19.x under `dependencies`; Vite 8.x, @vitejs/plugin-react 6.x and the React types under `devDependencies`.

`apps/client/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "jsx": "react-jsx"
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

In the root `package.json`, change the `typecheck` script so it also checks the client with its DOM and JSX settings:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p apps/client",
```

- [ ] **Step 1: Write the failing tests**

`apps/client/test/storage.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { loadDecks, loadNickname, loadToken, playableDecks, saveDecks, saveNickname, type KeyValueStore } from "../src/storage";
import { starterDeck } from "../src/decks";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("token", () => {
  it("is created once and then reused", () => {
    const store = memoryStore();
    const first = loadToken(store, () => "t".repeat(32));
    const second = loadToken(store, () => "other-token-value-xx");
    expect(first).toBe("t".repeat(32));
    expect(second).toBe(first);
  });

  it("replaces a stored token that is too short", () => {
    const store = memoryStore({ "duel.token": "short" });
    expect(loadToken(store, () => "n".repeat(32))).toBe("n".repeat(32));
  });
});

describe("nickname", () => {
  it("round-trips trimmed, and is null when blank", () => {
    const store = memoryStore();
    expect(loadNickname(store)).toBeNull();
    saveNickname(store, "  Duy ");
    expect(loadNickname(store)).toBe("Duy");
    saveNickname(store, "   ");
    expect(loadNickname(store)).toBeNull();
  });
});

describe("decks", () => {
  it("round-trips saved decks", () => {
    const store = memoryStore();
    const decks = [{ id: "d1", name: "Fire", cards: ["ember-fox"] }];
    saveDecks(store, decks);
    expect(loadDecks(store)).toEqual(decks);
  });

  it("returns no decks for corrupt or foreign data", () => {
    expect(loadDecks(memoryStore({ "duel.decks": "{oops" }))).toEqual([]);
    expect(loadDecks(memoryStore({ "duel.decks": '{"a":1}' }))).toEqual([]);
    expect(loadDecks(memoryStore({ "duel.decks": '[{"id":"x"},{"id":"d","name":"ok","cards":[]}]' }))).toEqual([
      { id: "d", name: "ok", cards: [] },
    ]);
  });

  it("offers only decks the engine accepts", () => {
    const good = { id: "a", name: "Good", cards: starterDeck() };
    const bad = { id: "b", name: "Short", cards: ["ember-fox"] };
    expect(playableDecks([good, bad])).toEqual([good]);
  });
});
```

`apps/client/test/decks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { validateDeck } from "@duel/engine";
import { addCard, countOf, groupDeck, removeCard, starterDeck } from "../src/decks";

describe("deck editing", () => {
  it("adds a card without changing the input", () => {
    const before = ["ember-fox"];
    expect(addCard(before, "ember-fox")).toEqual({ cards: ["ember-fox", "ember-fox"] });
    expect(before).toEqual(["ember-fox"]);
  });

  it("refuses a fourth copy, a fusion-only card, an unknown card and a 31st card", () => {
    expect(addCard(["ember-fox", "ember-fox", "ember-fox"], "ember-fox")).toEqual({ error: "at most 3 copies of Ember Fox" });
    expect(addCard([], "ancient-tyrant")).toEqual({ error: "Ancient Tyrant can only be made by fusion" });
    expect(addCard([], "nope")).toEqual({ error: "unknown card: nope" });
    expect(addCard(starterDeck(), "seedling")).toEqual({ error: "a deck holds 30 cards" });
  });

  it("removes one copy", () => {
    expect(removeCard(["ember-fox", "seedling", "ember-fox"], "ember-fox")).toEqual(["ember-fox", "seedling"]);
    expect(removeCard(["seedling"], "ember-fox")).toEqual(["seedling"]);
  });

  it("counts and groups in pool order", () => {
    const cards = ["seedling", "ember-fox", "seedling"];
    expect(countOf(cards, "seedling")).toBe(2);
    expect(groupDeck(cards)).toEqual([
      { id: "ember-fox", count: 1 },
      { id: "seedling", count: 2 },
    ]);
  });

  it("has a valid starter deck", () => {
    expect(validateDeck(starterDeck())).toEqual({ ok: true });
  });
});
```

`apps/client/test/route.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseRoute, roomPath } from "../src/route";

describe("parseRoute", () => {
  it.each([
    ["/", { name: "home" }],
    ["/decks", { name: "decks" }],
    ["/room/abc234", { name: "room", code: "ABC234" }],
    ["/room/ABC234/", { name: "room", code: "ABC234" }],
    ["/room/", { name: "unknown" }],
    ["/room/a-b", { name: "unknown" }],
    ["/elsewhere", { name: "unknown" }],
  ])("%s", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });

  it("builds room paths", () => {
    expect(roomPath("ABC234")).toBe("/room/ABC234");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/client/test/storage.test.ts apps/client/test/decks.test.ts apps/client/test/route.test.ts`
Expected: FAIL. Vitest cannot resolve the modules under test because their source files do not exist yet.

- [ ] **Step 3: Write the implementation**

`apps/client/src/storage.ts`

```ts
import { validateDeck, type CardId } from "@duel/engine";

/** The subset of the browser's localStorage this app uses. Injected for tests. */
export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const TOKEN_KEY = "duel.token";
const NICKNAME_KEY = "duel.nickname";
const DECKS_KEY = "duel.decks";

export type SavedDeck = { id: string; name: string; cards: CardId[] };

/** The player's secret identity; created once per browser. */
export function loadToken(store: KeyValueStore, makeToken: () => string): string {
  const existing = store.getItem(TOKEN_KEY);
  if (existing && existing.length >= 16) return existing;
  const token = makeToken();
  store.setItem(TOKEN_KEY, token);
  return token;
}

export function loadNickname(store: KeyValueStore): string | null {
  const name = store.getItem(NICKNAME_KEY)?.trim();
  return name ? name : null;
}

export function saveNickname(store: KeyValueStore, nickname: string): void {
  store.setItem(NICKNAME_KEY, nickname.trim());
}

/** Saved decks; anything unreadable is skipped rather than crashing the app. */
export function loadDecks(store: KeyValueStore): SavedDeck[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(DECKS_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is SavedDeck =>
      typeof d === "object" &&
      d !== null &&
      typeof d.id === "string" &&
      typeof d.name === "string" &&
      Array.isArray(d.cards) &&
      d.cards.every((c: unknown) => typeof c === "string"),
  );
}

export function saveDecks(store: KeyValueStore, decks: readonly SavedDeck[]): void {
  store.setItem(DECKS_KEY, JSON.stringify(decks));
}

/** Saved decks that the engine accepts, for the ready screen. */
export function playableDecks(decks: readonly SavedDeck[]): SavedDeck[] {
  return decks.filter((d) => validateDeck(d.cards).ok);
}
```

`apps/client/src/decks.ts`

```ts
import { CARDS, DECK_SIZE, MAX_COPIES, findCard, type CardId } from "@duel/engine";

export function countOf(cards: readonly CardId[], id: CardId): number {
  return cards.filter((c) => c === id).length;
}

/** Adds one copy, or says why it cannot. Never changes the input. */
export function addCard(cards: readonly CardId[], id: CardId): { cards: CardId[] } | { error: string } {
  const card = findCard(id);
  if (!card) return { error: `unknown card: ${id}` };
  if (card.fusionOnly) return { error: `${card.name} can only be made by fusion` };
  if (cards.length >= DECK_SIZE) return { error: `a deck holds ${DECK_SIZE} cards` };
  if (countOf(cards, id) >= MAX_COPIES) return { error: `at most ${MAX_COPIES} copies of ${card.name}` };
  return { cards: [...cards, id] };
}

/** Removes one copy (the last one added). */
export function removeCard(cards: readonly CardId[], id: CardId): CardId[] {
  const index = cards.lastIndexOf(id);
  return index === -1 ? [...cards] : [...cards.slice(0, index), ...cards.slice(index + 1)];
}

/** Each card once with its count, in pool order. */
export function groupDeck(cards: readonly CardId[]): { id: CardId; count: number }[] {
  return CARDS.filter((c) => cards.includes(c.id)).map((c) => ({ id: c.id, count: countOf(cards, c.id) }));
}

/** A ready-made deck so a new player can start at once: 3 of each of the 10 strongest base cards. */
export function starterDeck(): CardId[] {
  return CARDS.filter((c) => !c.fusionOnly)
    .sort((x, y) => y.atk - x.atk || (x.id < y.id ? -1 : 1))
    .slice(0, DECK_SIZE / MAX_COPIES)
    .flatMap((c) => Array.from({ length: MAX_COPIES }, () => c.id));
}
```

`apps/client/src/route.ts`

```ts
export type Route = { name: "home" } | { name: "decks" } | { name: "room"; code: string } | { name: "unknown" };

export function parseRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { name: "home" };
  if (pathname === "/decks") return { name: "decks" };
  const room = /^\/room\/([A-Za-z0-9]{1,12})\/?$/.exec(pathname);
  if (room) return { name: "room", code: room[1]!.toUpperCase() };
  return { name: "unknown" };
}

export function roomPath(code: string): string {
  return `/room/${code}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/client/test/storage.test.ts apps/client/test/decks.test.ts apps/client/test/route.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the client package with storage, deck editing and route parsing (plan 3, task 1, #21).
```

```bash
git add package.json pnpm-lock.yaml apps/client/package.json apps/client/tsconfig.json apps/client/src/storage.ts apps/client/src/decks.ts apps/client/src/route.ts apps/client/test/storage.test.ts apps/client/test/decks.test.ts apps/client/test/route.test.ts HISTORY.md
git commit -m "feat(client): package, storage, deck editing and routes

Closes #21"
```

### Task 2: Event text, clock display, play selection

**Files:**
- Create: `apps/client/src/eventText.ts`
- Create: `apps/client/src/duel/clock.ts`
- Create: `apps/client/src/duel/selection.ts`
- Create: `apps/client/src/duel/forecast.ts`
- Modify: `packages/engine/src/rules.ts` (`playsAllowed` accepts a view)
- Test: `apps/client/test/eventText.test.ts`
- Test: `apps/client/test/clock.test.ts`
- Test: `apps/client/test/selection.test.ts`
- Test: `apps/client/test/forecast.test.ts`
- Test: `packages/engine/test/rules.test.ts`

**Interfaces:**
- Consumes: from `@duel/engine`: `getCard`, `AttackAction`, `BattleOutcome`, `GameEvent`, `PlayerId`, `PlayAction`, `Position`; from `@duel/protocol`: `Clocks`.
- Produces: `describeEvent(event: GameEvent, you: PlayerId): string`; `formatClock(ms): string`, `liveRemaining(clocks: Clocks, receivedAt: number, now: number): [number, number]`; `type Selection = { handIndexes: number[]; slot: number | null; position: Position; faceDown: boolean }`, `EMPTY_SELECTION`, `toggleHand(selection, index)`, `chooseSlot(selection, slot)`, `setPosition(selection, position)`, `setFaceDown(selection, faceDown)`, `toAction(selection): PlayAction | null`; `describeOutcome(action: AttackAction, outcome: BattleOutcome): string`; engine: `playsAllowed(state: Pick<MatchState, "turn" | "rules">): number`.

- [ ] **Step 1: Write the failing tests**

`apps/client/test/eventText.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { GameEvent } from "@duel/engine";
import { describeEvent } from "../src/eventText";

describe("describeEvent", () => {
  it.each<[GameEvent, string]>([
    [{ type: "drew", player: 0, count: 1 }, "You drew 1 card"],
    [{ type: "drew", player: 1, count: 3 }, "Opponent drew 3 cards"],
    [{ type: "fused", player: 0, a: "ember-fox", b: "ash-duelist", result: "beast-rider" }, "You fused Ember Fox + Ash Duelist into Beast Rider"],
    [{ type: "fusion-failed", player: 1, a: "furnace-drone", b: "pearl-clam" }, "Opponent tried Furnace Drone + Pearl Clam: no fusion, Pearl Clam stays"],
    [{ type: "played", player: 0, slot: 2, cardId: "ember-fox", position: "defense", faceDown: false, handCards: 1 }, "You played Ember Fox in defense position"],
    [{ type: "played", player: 0, slot: 1, cardId: "thorn-sprite", position: "defense", faceDown: true, handCards: 1 }, "You played Thorn Sprite face-down in defense position"],
    [{ type: "played", player: 1, slot: 1, cardId: null, position: "defense", faceDown: true, handCards: 2 }, "Opponent played a face-down card (2 from hand) in defense position"],
    [{ type: "revealed", player: 1, slot: 1, cardId: "thorn-sprite" }, "Opponent's Thorn Sprite in slot 2 was revealed"],
    [{ type: "worn", player: 0, slot: 0, amount: 1200 }, "Your creature in slot 1 was worn down by 1200"],
    [{ type: "position-set", player: 1, slot: 0, position: "attack" }, "Opponent switched slot 1 to attack"],
    [{ type: "attacked", player: 0, attackerSlot: 1, target: "direct" }, "You attacked directly with slot 2"],
    [{ type: "attacked", player: 1, attackerSlot: 0, target: 4 }, "Opponent attacked slot 5 with slot 1"],
    [{ type: "destroyed", player: 0, slot: 0, cardId: "seedling" }, "Your Seedling was destroyed"],
    [{ type: "destroyed", player: 1, slot: 0, cardId: "seedling" }, "Opponent's Seedling was destroyed"],
    [{ type: "damage", player: 1, amount: 300 }, "Opponent took 300 damage"],
    [{ type: "turn-ended", player: 0 }, "You ended the turn"],
    [{ type: "match-ended", winner: 0, reason: "timeout" }, "You win (timeout)"],
    [{ type: "match-ended", winner: 1, reason: "deck-out" }, "You lose (deck-out)"],
  ])("%j", (event, text) => {
    expect(describeEvent(event, 0)).toBe(text);
  });
});
```

`apps/client/test/clock.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatClock, liveRemaining } from "../src/duel/clock";

describe("formatClock", () => {
  it.each([
    [300_000, "5:00"],
    [245_000, "4:05"],
    [59_001, "1:00"],
    [1, "0:01"],
    [0, "0:00"],
    [-50, "0:00"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("liveRemaining", () => {
  it("counts down only the running bank, from when the message arrived", () => {
    expect(liveRemaining({ remainingMs: [100_000, 50_000], running: 1 }, 1_000, 11_000)).toEqual([100_000, 40_000]);
  });

  it("never adds time when the display tick is older than the message", () => {
    expect(liveRemaining({ remainingMs: [600_000, 600_000], running: 1 }, 10_000, 9_900)).toEqual([600_000, 600_000]);
  });

  it("stops at zero and does nothing when no clock runs", () => {
    expect(liveRemaining({ remainingMs: [1_000, 2_000], running: 0 }, 0, 5_000)).toEqual([0, 2_000]);
    expect(liveRemaining({ remainingMs: [1_000, 2_000], running: null }, 0, 5_000)).toEqual([1_000, 2_000]);
  });
});
```

`apps/client/test/selection.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, chooseSlot, setFaceDown, setPosition, toAction, toggleHand } from "../src/duel/selection";

describe("play selection", () => {
  it("keeps hand cards in the order they were clicked", () => {
    const s = toggleHand(toggleHand(toggleHand(EMPTY_SELECTION, 3), 0), 4);
    expect(s.handIndexes).toEqual([3, 0, 4]);
  });

  it("unselects a card clicked twice, keeping the others' order", () => {
    const s = toggleHand(toggleHand(toggleHand(EMPTY_SELECTION, 3), 0), 3);
    expect(s.handIndexes).toEqual([0]);
  });

  it("toggles the target slot", () => {
    expect(chooseSlot(EMPTY_SELECTION, 2).slot).toBe(2);
    expect(chooseSlot(chooseSlot(EMPTY_SELECTION, 2), 2).slot).toBeNull();
    expect(chooseSlot(chooseSlot(EMPTY_SELECTION, 2), 4).slot).toBe(4);
  });

  it("builds a PLAY only with a card and a slot", () => {
    expect(toAction(EMPTY_SELECTION)).toBeNull();
    expect(toAction(toggleHand(EMPTY_SELECTION, 1))).toBeNull();
    expect(toAction(chooseSlot(EMPTY_SELECTION, 1))).toBeNull();
    const ready = setPosition(chooseSlot(toggleHand(toggleHand(EMPTY_SELECTION, 2), 0), 4), "defense");
    expect(toAction(ready)).toEqual({ type: "PLAY", handIndexes: [2, 0], slot: 4, position: "defense" });
  });

  it("adds faceDown only to a face-down play (R6)", () => {
    const ready = chooseSlot(toggleHand(EMPTY_SELECTION, 1), 0);
    expect(toAction(setFaceDown(ready, true))).toEqual({ type: "PLAY", handIndexes: [1], slot: 0, position: "attack", faceDown: true });
    expect(toAction(setFaceDown(setFaceDown(ready, true), false))).not.toHaveProperty("faceDown");
  });
});
```

`apps/client/test/forecast.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { AttackAction, BattleOutcome } from "@duel/engine";
import { describeOutcome } from "../src/duel/forecast";

const at = (target: number | "direct"): AttackAction => ({ type: "ATTACK", attackerSlot: 0, target });
const outcome = (o: Partial<BattleOutcome>): BattleOutcome => ({
  attack: 0,
  defense: 0,
  attackerDestroyed: false,
  targetDestroyed: false,
  damageToSelf: 0,
  damageToOpponent: 0,
  targetWear: 0,
  ...o,
});

describe("describeOutcome", () => {
  it("words a direct attack", () => {
    expect(describeOutcome(at("direct"), outcome({ attack: 1500, damageToOpponent: 1500 }))).toBe("Direct attack: 1500 damage");
  });

  it("words a win, with damage", () => {
    expect(describeOutcome(at(2), outcome({ attack: 2000, defense: 1200, targetDestroyed: true, damageToOpponent: 800 }))).toBe(
      "2000 against 1200; destroys the target; 800 damage to the opponent",
    );
  });

  it("words a Venom trade and a survivor that is worn down", () => {
    expect(describeOutcome(at(1), outcome({ attack: 3500, defense: 1100, targetDestroyed: true, attackerDestroyed: true }))).toBe(
      "3500 against 1100; destroys the target; you lose your creature",
    );
    expect(describeOutcome(at(1), outcome({ attack: 1200, defense: 1500, targetWear: 1200, damageToSelf: 300 }))).toBe(
      "1200 against 1500; the target survives, worn down by 1200; 300 damage to you",
    );
  });
});
```

In `packages/engine/test/rules.test.ts`, import `viewFor` from `../src/view` and add to `describe("playsAllowed", ...)`:

```ts
  it("reads a view as well as a state", () => {
    const rules = { ...DEFAULT_RULES, playsPerTurn: 2, firstTurnPlays: 1 };
    expect(playsAllowed(viewFor(makeState({ turn: 1, rules }), 0))).toBe(1);
    expect(playsAllowed(viewFor(makeState({ turn: 4, rules }), 0))).toBe(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/client/test/eventText.test.ts apps/client/test/clock.test.ts apps/client/test/selection.test.ts apps/client/test/forecast.test.ts && pnpm typecheck`
Expected: FAIL. Vitest cannot resolve the modules under test because their source files do not exist yet, and `tsc` rejects a `PlayerView` passed to `playsAllowed`.

- [ ] **Step 3: Write the implementation**

`apps/client/src/eventText.ts`

```ts
import { getCard, type GameEvent, type PlayerId } from "@duel/engine";

const name = (id: string) => getCard(id).name;

/** One line for the duel log, from the point of view of player `you`. */
export function describeEvent(event: GameEvent, you: PlayerId): string {
  const who = (player: PlayerId) => (player === you ? "You" : "Opponent");
  const whose = (player: PlayerId) => (player === you ? "Your" : "Opponent's");
  switch (event.type) {
    case "drew":
      return `${who(event.player)} drew ${event.count} card${event.count === 1 ? "" : "s"}`;
    case "fused":
      return `${who(event.player)} fused ${name(event.a)} + ${name(event.b)} into ${name(event.result)}`;
    case "fusion-failed":
      return `${who(event.player)} tried ${name(event.a)} + ${name(event.b)}: no fusion, ${name(event.b)} stays`;
    case "played": {
      // the opponent's copy of a face-down play has no card (eventsFor)
      const what = event.cardId ? name(event.cardId) : `a face-down card (${event.handCards} from hand)`;
      const face = event.cardId && event.faceDown ? " face-down" : "";
      return `${who(event.player)} played ${what}${face} in ${event.position} position`;
    }
    case "revealed":
      return `${whose(event.player)} ${name(event.cardId)} in slot ${event.slot + 1} was revealed`;
    case "position-set":
      return `${who(event.player)} switched slot ${event.slot + 1} to ${event.position}`;
    case "attacked":
      return event.target === "direct"
        ? `${who(event.player)} attacked directly with slot ${event.attackerSlot + 1}`
        : `${who(event.player)} attacked slot ${event.target + 1} with slot ${event.attackerSlot + 1}`;
    case "destroyed":
      return `${whose(event.player)} ${name(event.cardId)} was destroyed`;
    case "worn":
      return `${whose(event.player)} creature in slot ${event.slot + 1} was worn down by ${event.amount}`;
    case "damage":
      return `${who(event.player)} took ${event.amount} damage`;
    case "turn-ended":
      return `${who(event.player)} ended the turn`;
    case "match-ended":
      return `${event.winner === you ? "You win" : "You lose"} (${event.reason})`;
  }
}
```

`apps/client/src/duel/clock.ts`

```ts
import type { Clocks } from "@duel/protocol";

/** "4:05" for 245_000 ms. Rounds up so a bank shows 0:00 only when it is empty. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Both banks as of `now`, counting down the running one from when the message
 * arrived. Display only: the server decides when time is up.
 */
export function liveRemaining(clocks: Clocks, receivedAt: number, now: number): [number, number] {
  const out: [number, number] = [...clocks.remainingMs];
  // a display tick taken just before the message arrived must not add time
  const elapsed = Math.max(0, now - receivedAt);
  if (clocks.running !== null) out[clocks.running] = Math.max(0, out[clocks.running] - elapsed);
  return out;
}
```

`apps/client/src/duel/selection.ts`

```ts
import type { PlayAction, Position } from "@duel/engine";

/** What the player has picked so far for a PLAY. */
export type Selection = { handIndexes: number[]; slot: number | null; position: Position; faceDown: boolean };

export const EMPTY_SELECTION: Selection = { handIndexes: [], slot: null, position: "attack", faceDown: false };

/** Adds a hand card to the end of the fusion order, or removes it if already chosen. */
export function toggleHand(selection: Selection, index: number): Selection {
  const chosen = selection.handIndexes.includes(index);
  return {
    ...selection,
    handIndexes: chosen ? selection.handIndexes.filter((i) => i !== index) : [...selection.handIndexes, index],
  };
}

export function chooseSlot(selection: Selection, slot: number): Selection {
  return { ...selection, slot: selection.slot === slot ? null : slot };
}

export function setPosition(selection: Selection, position: Position): Selection {
  return { ...selection, position };
}

/** R6: play the result face-down. Whether that is legal (never onto a face-up creature) is for the server. */
export function setFaceDown(selection: Selection, faceDown: boolean): Selection {
  return { ...selection, faceDown };
}

/** The PLAY to send, once at least one card and a slot are chosen. A face-up play leaves `faceDown` out. */
export function toAction(selection: Selection): PlayAction | null {
  if (selection.handIndexes.length === 0 || selection.slot === null) return null;
  const play: PlayAction = { type: "PLAY", handIndexes: [...selection.handIndexes], slot: selection.slot, position: selection.position };
  return selection.faceDown ? { ...play, faceDown: true } : play;
}
```

`apps/client/src/duel/forecast.ts`

```ts
import type { AttackAction, BattleOutcome } from "@duel/engine";

/**
 * One line for an attack forecast, from the outcome the engine previewed on the
 * server. It only puts the engine's numbers into words; it works nothing out
 * (DDR-0010).
 */
export function describeOutcome(action: AttackAction, outcome: BattleOutcome): string {
  if (action.target === "direct") return `Direct attack: ${outcome.damageToOpponent} damage`;
  const parts = [`${outcome.attack} against ${outcome.defense}`];
  if (outcome.targetDestroyed) parts.push("destroys the target");
  else if (outcome.targetWear > 0) parts.push(`the target survives, worn down by ${outcome.targetWear}`);
  else parts.push("the target survives");
  if (outcome.attackerDestroyed) parts.push("you lose your creature");
  if (outcome.damageToOpponent > 0) parts.push(`${outcome.damageToOpponent} damage to the opponent`);
  if (outcome.damageToSelf > 0) parts.push(`${outcome.damageToSelf} damage to you`);
  return parts.join("; ");
}
```

In `packages/engine/src/rules.ts`, widen `playsAllowed` so it reads a view too (the body is unchanged):

```ts
/**
 * PLAY actions the active player may make this turn. Turn 1 is always the first
 * player's. Takes a MatchState or a PlayerView, so a client can show the plays
 * left without knowing the rule.
 */
export function playsAllowed(state: Pick<MatchState, "turn" | "rules">): number {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/client/test/eventText.test.ts apps/client/test/clock.test.ts apps/client/test/selection.test.ts apps/client/test/forecast.test.ts packages/engine/test/rules.test.ts`
Expected: PASS, 51 tests (35 client, 16 engine).

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added event log text (face-down plays, reveals, wear), clock display, play selection with face-down, and attack forecast wording; the engine's playsAllowed accepts a view (plan 3, task 2, DDR-0010, #22).
```

```bash
git add apps/client/src/eventText.ts apps/client/src/duel/clock.ts apps/client/src/duel/selection.ts apps/client/src/duel/forecast.ts apps/client/test/eventText.test.ts apps/client/test/clock.test.ts apps/client/test/selection.test.ts apps/client/test/forecast.test.ts packages/engine/src/rules.ts packages/engine/test/rules.test.ts HISTORY.md
git commit -m "feat(client): event text, clock display and play selection

Closes #22"
```

### Task 3: Connection and app state

**Files:**
- Create: `apps/client/src/net/connection.ts`
- Create: `apps/client/src/state/reducer.ts`
- Test: `apps/client/test/connection.test.ts`
- Test: `apps/client/test/reducer.test.ts`

**Interfaces:**
- Consumes: `describeEvent` (task 2); from `@duel/protocol`: `ClientMessage`, `ServerMessage`, `Clocks`, `Preview`, `PreviewAction`, `RoomInfo`, `RoomSummary`; from `@duel/engine`: `PlayerView`.
- Produces: `class Connection { constructor(options: ConnectionOptions); start(); stop(); send(message: ClientMessage): boolean }`, `type ConnectionStatus = "connecting" | "online" | "offline" | "replaced"`, `type CreateSocket`, `REPLACED_CODE = 4000`, `createBrowserSocket: CreateSocket`; `type AppState`, `type AppEvent`, `type MatchSnapshot = { view; clocks; receivedAt }`, `initialState`, `reducer(state, event): AppState`, `LOG_LIMIT = 200`.

- [ ] **Step 1: Write the failing tests**

`apps/client/test/connection.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@duel/protocol";
import { Connection, REPLACED_CODE, type ConnectionStatus, type SocketHandlers } from "../src/net/connection";

class FakeSocket {
  sent: string[] = [];
  closed = false;
  constructor(readonly handlers: SocketHandlers) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: ConnectionStatus[] = [];
  const received: ServerMessage[] = [];
  const scheduled: { ms: number; fn: () => void; cancelled: boolean }[] = [];
  const connection = new Connection({
    url: "ws://test/ws",
    createSocket: (_url, handlers) => {
      const socket = new FakeSocket(handlers);
      sockets.push(socket);
      return socket;
    },
    hello: () => ({ type: "hello", token: "t".repeat(32), nickname: "duy" }),
    onMessage: (m) => received.push(m),
    onStatus: (s) => statuses.push(s),
    schedule: (ms, fn) => {
      const entry = { ms, fn, cancelled: false };
      scheduled.push(entry);
      return () => void (entry.cancelled = true);
    },
  });
  return { connection, sockets, statuses, received, scheduled };
}

describe("Connection", () => {
  it("says hello as soon as the socket opens", () => {
    const { connection, sockets, statuses } = setup();
    connection.start();
    expect(statuses).toEqual(["connecting"]);
    sockets[0]!.handlers.open();
    expect(sockets[0]!.sent).toEqual([JSON.stringify({ type: "hello", token: "t".repeat(32), nickname: "duy" })]);
    expect(statuses).toEqual(["connecting", "online"]);
  });

  it("drops messages while offline and sends them once online", () => {
    const { connection, sockets } = setup();
    connection.start();
    expect(connection.send({ type: "lobby.subscribe" })).toBe(false);
    sockets[0]!.handlers.open();
    expect(connection.send({ type: "lobby.subscribe" })).toBe(true);
    expect(sockets[0]!.sent.at(-1)).toBe('{"type":"lobby.subscribe"}');
  });

  it("passes parsed server messages on and ignores garbage", () => {
    const { connection, sockets, received } = setup();
    connection.start();
    sockets[0]!.handlers.message('{"type":"lobby.rooms","rooms":[]}');
    sockets[0]!.handlers.message("{nope");
    expect(received).toEqual([{ type: "lobby.rooms", rooms: [] }]);
  });

  it("reconnects with growing delays and says hello again", () => {
    const { connection, sockets, statuses, scheduled } = setup();
    connection.start();
    sockets[0]!.handlers.close(1006);
    expect(statuses.at(-1)).toBe("offline");
    expect(scheduled.map((s) => s.ms)).toEqual([500]);
    scheduled[0]!.fn();
    sockets[1]!.handlers.close(1006);
    scheduled[1]!.fn();
    expect(scheduled.map((s) => s.ms)).toEqual([500, 1000]);
    sockets[2]!.handlers.open();
    expect(sockets[2]!.sent[0]).toContain('"type":"hello"');
    sockets[2]!.handlers.close(1006);
    expect(scheduled.at(-1)!.ms).toBe(500);
  });

  it("stops for good when another tab replaces it", () => {
    const { connection, sockets, statuses, scheduled } = setup();
    connection.start();
    sockets[0]!.handlers.open();
    sockets[0]!.handlers.close(REPLACED_CODE);
    expect(statuses.at(-1)).toBe("replaced");
    expect(scheduled).toEqual([]);
  });

  it("does not reconnect after stop", () => {
    const { connection, sockets, scheduled } = setup();
    connection.start();
    sockets[0]!.handlers.open();
    connection.stop();
    expect(sockets[0]!.closed).toBe(true);
    sockets[0]!.handlers.close(1000);
    expect(scheduled).toEqual([]);
    expect(connection.send({ type: "lobby.subscribe" })).toBe(false);
  });
});
```

`apps/client/test/reducer.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type PlayerView } from "@duel/engine";
import type { RoomInfo, ServerMessage } from "@duel/protocol";
import { initialState, reducer, type AppState } from "../src/state/reducer";

const server = (state: AppState, message: ServerMessage, now = 0) => reducer(state, { type: "server", message, now });

const room = (code = "ROOM1"): RoomInfo => ({
  code,
  visibility: "public",
  minutes: 5,
  status: "playing",
  seats: [null, null],
  you: 0,
});

const view = (result: PlayerView["result"] = null): PlayerView => ({
  you: 0,
  active: 0,
  firstPlayer: 0,
  turn: 1,
  playsUsed: 0,
  result,
  rules: { ...DEFAULT_RULES },
  self: { hand: [], deckCount: 25, field: [null, null, null, null, null], lifePoints: 4000 },
  opponent: { handCount: 0, deckCount: 30, field: [null, null, null, null, null], lifePoints: 4000 },
});

const clocks = { remainingMs: [1, 1] as [number, number], running: 0 as const };

describe("reducer", () => {
  it("counts welcomes and remembers the seated room", () => {
    const s = server(server(initialState, { type: "welcome", nickname: "a", roomCode: null }), {
      type: "welcome",
      nickname: "a",
      roomCode: "ROOM1",
    });
    expect(s.welcomes).toBe(2);
    expect(s.welcomeRoom).toBe("ROOM1");
  });

  it("tracks connection status and the lobby", () => {
    const s = server(reducer(initialState, { type: "status", status: "online" }), {
      type: "lobby.rooms",
      rooms: [{ code: "X", host: "a", minutes: 5 }],
    });
    expect(s.status).toBe("online");
    expect(s.lobby).toHaveLength(1);
  });

  it("keeps the match when the same room updates, and drops it for a different room", () => {
    let s = server(initialState, { type: "room.state", room: room() });
    s = server(s, { type: "match.view", view: view(), events: [{ type: "drew", player: 0, count: 5 }], clocks }, 42);
    s = server(s, { type: "room.state", room: room() });
    expect(s.match?.receivedAt).toBe(42);
    expect(s.log).toEqual(["You drew 5 cards"]);
    s = server(s, { type: "room.state", room: room("ROOM2") });
    expect(s.match).toBeNull();
    expect(s.log).toEqual([]);
  });

  it("appends event lines and clears a stale preview", () => {
    let s = server(initialState, {
      type: "match.preview",
      action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" },
      preview: { kind: "error", error: "x" },
    });
    expect(s.preview?.preview).toEqual({ kind: "error", error: "x" });
    s = server(s, { type: "match.view", view: view(), events: [{ type: "turn-ended", player: 1 }], clocks });
    expect(s.preview).toBeNull();
    expect(s.log).toEqual(["Opponent ended the turn"]);
  });

  it("starts a fresh log on a rematch", () => {
    let s = server(initialState, { type: "match.view", view: view({ winner: 0, reason: "surrender" }), events: [{ type: "turn-ended", player: 0 }], clocks });
    s = server(s, { type: "match.view", view: view(), events: [], clocks });
    expect(s.log).toEqual([]);
  });

  it("shows server errors and clears them on dismiss", () => {
    const s = server(initialState, { type: "error", code: "room-full", message: "this room is full" });
    expect(s.error).toBe("this room is full");
    expect(reducer(s, { type: "dismiss" }).error).toBeNull();
  });

  it("forgets the room when it closes or when we leave", () => {
    let s = server(initialState, { type: "room.state", room: room() });
    s = server(s, { type: "room.closed", code: "ROOM1", reason: "idle" });
    expect(s.room).toBeNull();
    expect(s.notice).toBe("The room closed after 10 idle minutes.");
    s = server(s, { type: "room.state", room: room() });
    expect(reducer(s, { type: "left-room" }).room).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/client/test/connection.test.ts apps/client/test/reducer.test.ts`
Expected: FAIL. Vitest cannot resolve the modules under test because their source files do not exist yet.

- [ ] **Step 3: Write the implementation**

`apps/client/src/net/connection.ts`

```ts
import type { ClientMessage, ServerMessage } from "@duel/protocol";

export type SocketHandlers = {
  open(): void;
  message(data: string): void;
  close(code: number): void;
};
export type Socket = { send(data: string): void; close(): void };
export type CreateSocket = (url: string, handlers: SocketHandlers) => Socket;

/** "replaced": another tab took over this player; we must not fight it. */
export type ConnectionStatus = "connecting" | "online" | "offline" | "replaced";

export type ConnectionOptions = {
  url: string;
  createSocket: CreateSocket;
  /** The hello to send on every (re)connect. */
  hello(): ClientMessage;
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
  /** Runs fn after ms; returns a cancel function. Injected for tests. */
  schedule?(ms: number, fn: () => void): () => void;
};

/** Close code the server uses when a newer connection with the same token arrives. */
export const REPLACED_CODE = 4000;
const BACKOFF_MS = [500, 1000, 2000, 4000, 5000];

/** One WebSocket to the game server that says hello on open and reconnects with backoff. */
export class Connection {
  private socket: Socket | null = null;
  private online = false;
  private stopped = false;
  private attempts = 0;
  private cancelRetry: (() => void) | null = null;
  private readonly schedule: (ms: number, fn: () => void) => () => void;

  constructor(private readonly options: ConnectionOptions) {
    this.schedule =
      options.schedule ??
      ((ms, fn) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      });
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.cancelRetry?.();
    this.socket?.close();
    this.socket = null;
    this.online = false;
  }

  /** Sends if online; returns false (and drops the message) otherwise. */
  send(message: ClientMessage): boolean {
    if (!this.online || !this.socket) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    this.options.onStatus("connecting");
    const socket = this.options.createSocket(this.options.url, {
      open: () => {
        if (socket !== this.socket) return;
        this.online = true;
        this.attempts = 0;
        socket.send(JSON.stringify(this.options.hello()));
        this.options.onStatus("online");
      },
      message: (data) => {
        if (socket !== this.socket) return;
        let parsed: ServerMessage;
        try {
          parsed = JSON.parse(data) as ServerMessage;
        } catch {
          return;
        }
        this.options.onMessage(parsed);
      },
      close: (code) => {
        if (socket !== this.socket) return;
        this.online = false;
        this.socket = null;
        if (this.stopped) return;
        if (code === REPLACED_CODE) {
          this.options.onStatus("replaced");
          return;
        }
        this.options.onStatus("offline");
        const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)]!;
        this.attempts += 1;
        this.cancelRetry = this.schedule(delay, () => this.open());
      },
    });
    this.socket = socket;
  }
}

/** The real browser WebSocket behind the Socket interface. */
export const createBrowserSocket: CreateSocket = (url, handlers) => {
  const ws = new WebSocket(url);
  ws.onopen = () => handlers.open();
  ws.onmessage = (event) => handlers.message(String(event.data));
  ws.onclose = (event) => handlers.close(event.code);
  return { send: (data) => ws.send(data), close: () => ws.close() };
};
```

`apps/client/src/state/reducer.ts`

```ts
import type { PlayerView } from "@duel/engine";
import type { Clocks, Preview, PreviewAction, RoomInfo, RoomSummary, ServerMessage } from "@duel/protocol";
import { describeEvent } from "../eventText";
import type { ConnectionStatus } from "../net/connection";

export const LOG_LIMIT = 200;

export type MatchSnapshot = { view: PlayerView; clocks: Clocks; receivedAt: number };

export type AppState = {
  status: ConnectionStatus;
  /** increases on every welcome, so effects can react to each (re)connect */
  welcomes: number;
  /** the room the server says we are seated in, from the last welcome */
  welcomeRoom: string | null;
  lobby: RoomSummary[];
  room: RoomInfo | null;
  match: MatchSnapshot | null;
  /** newest last */
  log: string[];
  /** the engine's answer to the last preview asked for; screens use it only while it matches their pending action */
  preview: { action: PreviewAction; preview: Preview } | null;
  error: string | null;
  notice: string | null;
};

export const initialState: AppState = {
  status: "connecting",
  welcomes: 0,
  welcomeRoom: null,
  lobby: [],
  room: null,
  match: null,
  log: [],
  preview: null,
  error: null,
  notice: null,
};

export type AppEvent =
  | { type: "server"; message: ServerMessage; now: number }
  | { type: "status"; status: ConnectionStatus }
  | { type: "left-room" }
  | { type: "local-error"; message: string }
  | { type: "dismiss" };

function withLog(log: string[], lines: string[]): string[] {
  return [...log, ...lines].slice(-LOG_LIMIT);
}

export function reducer(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "status":
      return { ...state, status: event.status };
    case "left-room":
      return { ...state, room: null, match: null, log: [], preview: null, welcomeRoom: null };
    case "local-error":
      return { ...state, error: event.message };
    case "dismiss":
      return { ...state, error: null, notice: null };
    case "server":
      return onServer(state, event.message, event.now);
  }
}

function onServer(state: AppState, message: ServerMessage, now: number): AppState {
  switch (message.type) {
    case "welcome":
      return { ...state, welcomes: state.welcomes + 1, welcomeRoom: message.roomCode };
    case "lobby.rooms":
      return { ...state, lobby: message.rooms };
    case "room.state": {
      const sameRoom = state.room?.code === message.room.code;
      return sameRoom
        ? { ...state, room: message.room }
        : { ...state, room: message.room, match: null, log: [], preview: null };
    }
    case "room.closed":
      return {
        ...state,
        room: null,
        match: null,
        log: [],
        preview: null,
        welcomeRoom: null,
        notice: message.reason === "idle" ? "The room closed after 10 idle minutes." : "The room was closed.",
      };
    case "match.view": {
      const { view, events, clocks } = message;
      // a rematch starts a fresh match: drop the old log
      const newMatch = state.match !== null && state.match.view.result !== null && view.result === null;
      const log = withLog(newMatch ? [] : state.log, events.map((e) => describeEvent(e, view.you)));
      return { ...state, match: { view, clocks, receivedAt: now }, log, preview: null };
    }
    case "match.preview":
      return { ...state, preview: { action: message.action, preview: message.preview } };
    case "error":
      return { ...state, error: message.message };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/client/test/connection.test.ts apps/client/test/reducer.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the reconnecting server connection and the app state reducer (plan 3, task 3, #23).
```

```bash
git add apps/client/src/net/connection.ts apps/client/src/state/reducer.ts apps/client/test/connection.test.ts apps/client/test/reducer.test.ts HISTORY.md
git commit -m "feat(client): reconnecting connection and app state reducer

Closes #23"
```

### Task 4: Screens and the two-tab check

**Files:**
- Create: `apps/client/index.html`
- Create: `apps/client/vite.config.ts`
- Create: `apps/client/src/main.tsx`
- Create: `apps/client/src/browser.ts`
- Create: `apps/client/src/usePath.ts`
- Create: `apps/client/src/state/useServer.ts`
- Create: `apps/client/src/App.tsx`
- Create: `apps/client/src/components/CardFace.tsx`
- Create: `apps/client/src/components/ClockView.tsx`
- Create: `apps/client/src/screens/HomeScreen.tsx`
- Create: `apps/client/src/screens/LobbyScreen.tsx`
- Create: `apps/client/src/screens/RoomScreen.tsx`
- Create: `apps/client/src/screens/DuelScreen.tsx`
- Create: `apps/client/src/screens/DeckBuilderScreen.tsx`
- Create: `apps/client/src/styles.css`
- Modify: `package.json` (root `dev` script)

**Interfaces:**
- Consumes: everything from tasks 1 to 3; `CARDS`, `DECK_SIZE`, `ELEMENTS`, `TAGS`, `getCard`, `validateDeck` and types from `@duel/engine`; `MINUTES` and message types from `@duel/protocol`.
- Produces: the playable app at `http://localhost:5173`, and `pnpm dev` starting server and client together.

These files are rendering and wiring only. They have no unit tests; `pnpm typecheck`, `vite build` and the manual check in step 5 verify them. If a component starts to need logic, move the logic to a tested module first.

How the pieces fit:

- `App` asks for a nickname (`HomeScreen`) until one is stored, then renders `Online`, which owns the `useServer` connection.
- On every `welcome`, `Online` sends `room.join` for the room the server says we are seated in, or else the room in the URL. That is how a reload or a dropped connection returns to the match.
- When the server puts us in a room, the URL follows (`/room/<code>`); when the room is gone, it returns to `/`.
- `RoomScreen` shows the ready check (invite link, seats, deck choice) until a match exists, then `DuelScreen`.
- `DuelScreen` builds a PLAY from clicks with `selection.ts` (with a face-down checkbox), asks the server for a preview whenever the PLAY changes, and resets all choices whenever a new `match.view` arrives. Clicking one of your creatures focuses it; clicking an enemy creature (or "Aim directly") aims the attack, the server's forecast appears, and "Attack" confirms it. A focused face-down creature of yours has a "Reveal" button. Hand cards are active while `view.playsUsed < playsAllowed(view)`.
- Field creatures show the view's `atk`/`def` (`CardFace` `stats`); an opponent's face-down creature is a `HiddenFace` showing only its position.

- [ ] **Step 1: Write the entry files and wiring**

`apps/client/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Card Duel</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/client/vite.config.ts`

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // the game server runs separately on 8787 (pnpm --filter @duel/server dev)
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});
```

`apps/client/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/client/src/browser.ts`

```ts
import type { KeyValueStore } from "./storage";

/** localStorage, or an in-memory stand-in when the browser blocks it. */
export const browserStore: KeyValueStore = (() => {
  try {
    const probe = "duel.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
  }
})();

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function socketUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}
```

`apps/client/src/usePath.ts`

```ts
import { useCallback, useEffect, useState } from "react";

/** The current URL path, and a navigate function that uses the History API. */
export function usePath(): [string, (to: string) => void] {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  return [path, navigate];
}
```

`apps/client/src/state/useServer.ts`

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage } from "@duel/protocol";
import { browserStore, newId, socketUrl } from "../browser";
import { Connection, createBrowserSocket } from "../net/connection";
import { loadToken } from "../storage";
import { initialState, reducer } from "./reducer";

/** The live connection to the game server and everything it has told us. */
export function useServer(nickname: string) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const token = loadToken(browserStore, newId);
    const conn = new Connection({
      url: socketUrl(),
      createSocket: createBrowserSocket,
      hello: () => ({ type: "hello", token, nickname }),
      onMessage: (message) => dispatch({ type: "server", message, now: Date.now() }),
      onStatus: (status) => dispatch({ type: "status", status }),
    });
    connection.current = conn;
    conn.start();
    return () => conn.stop();
  }, [nickname]);

  const send = useCallback((message: ClientMessage) => {
    if (!connection.current?.send(message)) dispatch({ type: "local-error", message: "Not connected to the server." });
  }, []);

  const leaveRoom = useCallback(() => {
    connection.current?.send({ type: "room.leave" });
    dispatch({ type: "left-room" });
  }, []);

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  return { state, send, leaveRoom, dismiss };
}

export type Server = ReturnType<typeof useServer>;
```

`apps/client/src/App.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { browserStore } from "./browser";
import { parseRoute, roomPath, type Route } from "./route";
import { DeckBuilderScreen } from "./screens/DeckBuilderScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { useServer } from "./state/useServer";
import { loadNickname, saveNickname } from "./storage";
import { usePath } from "./usePath";

export function App() {
  const [nickname, setNickname] = useState(() => loadNickname(browserStore));
  const [path, navigate] = usePath();
  const route = parseRoute(path);

  if (!nickname) {
    return (
      <HomeScreen
        onSave={(name) => {
          saveNickname(browserStore, name);
          setNickname(loadNickname(browserStore));
        }}
      />
    );
  }
  return <Online nickname={nickname} route={route} navigate={navigate} onRename={() => setNickname(null)} />;
}

type OnlineProps = { nickname: string; route: Route; navigate(to: string): void; onRename(): void };

function Online({ nickname, route, navigate, onRename }: OnlineProps) {
  const server = useServer(nickname);
  const { state, send } = server;
  const roomCode = state.room?.code ?? null;
  const routeCode = route.name === "room" ? route.code : null;

  // On every (re)connect: go back to the room we are seated in, or join the one in the URL.
  useEffect(() => {
    if (state.welcomes === 0) return;
    const code = state.welcomeRoom ?? routeCode;
    if (code) send({ type: "room.join", code });
  }, [state.welcomes]); // only on a new welcome, not when the route changes

  // Follow the room we are in; go home when it is gone.
  const previousRoom = useRef<string | null>(null);
  useEffect(() => {
    if (roomCode && routeCode !== roomCode) navigate(roomPath(roomCode));
    if (!roomCode && previousRoom.current && routeCode === previousRoom.current) navigate("/");
    previousRoom.current = roomCode;
  }, [roomCode]); // only when the room changes

  const leave = () => {
    server.leaveRoom();
    navigate("/");
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate(roomCode ? roomPath(roomCode) : "/")}>
          Card Duel
        </button>
        <nav>
          {!roomCode && (
            <>
              <button className="link" onClick={() => navigate("/")}>Lobby</button>
              <button className="link" onClick={() => navigate("/decks")}>Decks</button>
            </>
          )}
        </nav>
        <div className="who">
          <span className={`dot ${state.status}`} title={state.status} />
          {nickname}
          {!roomCode && (
            <button className="link small" onClick={onRename}>change</button>
          )}
        </div>
      </header>

      {state.status === "offline" && <div className="banner warn">Connection lost. Reconnecting…</div>}
      {state.status === "replaced" && (
        <div className="banner warn">This game is open in another tab. Close this one or reload to play here.</div>
      )}
      {(state.error ?? state.notice) && (
        <div className="banner error" role="alert">
          <span>{state.error ?? state.notice}</span>
          <button className="link" onClick={server.dismiss} aria-label="Dismiss">✕</button>
        </div>
      )}

      <main>
        {route.name === "decks" ? (
          <DeckBuilderScreen />
        ) : route.name === "room" ? (
          <RoomScreen code={route.code} server={server} onLeave={leave} onBack={() => navigate("/")} />
        ) : (
          <LobbyScreen server={server} onDecks={() => navigate("/decks")} />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Write the components and screens**

`apps/client/src/components/CardFace.tsx`

```tsx
import { getCard, type CardId, type Position, type Tag } from "@duel/engine";

const TAG_ICONS: Record<Tag, string> = {
  beast: "🐾",
  dragon: "🐉",
  warrior: "⚔️",
  mage: "✨",
  plant: "🌿",
  machine: "⚙️",
  aqua: "💧",
  bird: "🪶",
};

type Props = {
  cardId: CardId;
  position?: Position;
  /** on the field: the current values from the view (DDR-0010); in hand or a deck the printed ones are shown */
  stats?: { atk: number; def: number };
  /** your own creature that the opponent cannot see (R6) */
  faceDown?: boolean;
  /** 1-based fusion order badge */
  order?: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
};

/** Placeholder art: element colour plus tag icons. */
export function CardFace({ cardId, position, stats, faceDown, order, selected, dimmed, onClick }: Props) {
  const card = getCard(cardId);
  const { atk, def } = stats ?? card;
  const classes = [
    "card",
    `el-${card.element}`,
    selected && "selected",
    dimmed && "dimmed",
    position === "defense" && "defense",
    faceDown && "face-down",
  ];
  return (
    <button type="button" className={classes.filter(Boolean).join(" ")} onClick={onClick} disabled={!onClick}>
      {order !== undefined && <span className="order">{order}</span>}
      <span className="art" aria-hidden>{card.tags.map((t) => TAG_ICONS[t]).join("")}</span>
      <span className="name">{card.name}</span>
      <span className="meta">{card.element} · {card.tags.join("/")}</span>
      <span className="stats">
        <b className={position === "defense" ? "faint" : ""}>{atk}</b> / <b className={position === "attack" ? "faint" : ""}>{def}</b>
      </span>
      {position && <span className="pos">{position === "attack" ? "ATK" : "DEF"}</span>}
      {faceDown && <span className="badge">face-down</span>}
    </button>
  );
}

type HiddenProps = { position: Position; selected?: boolean; onClick?: () => void };

/** An opponent's face-down creature: the view gives only its position (R6, F2). */
export function HiddenFace({ position, selected, onClick }: HiddenProps) {
  const classes = ["card", "hidden-card", selected && "selected", position === "defense" && "defense"];
  return (
    <button type="button" className={classes.filter(Boolean).join(" ")} onClick={onClick} disabled={!onClick}>
      <span className="art" aria-hidden>?</span>
      <span className="name">Face-down</span>
      <span className="pos">{position === "attack" ? "ATK" : "DEF"}</span>
    </button>
  );
}
```

`apps/client/src/components/ClockView.tsx`

```tsx
import { useEffect, useState } from "react";
import type { PlayerId } from "@duel/engine";
import type { Clocks } from "@duel/protocol";
import { formatClock, liveRemaining } from "../duel/clock";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ClockView({ clocks, receivedAt, player }: { clocks: Clocks; receivedAt: number; player: PlayerId }) {
  const now = useNow(250);
  const ms = liveRemaining(clocks, receivedAt, now)[player];
  const running = clocks.running === player;
  return <span className={`clock ${running ? "running" : ""} ${ms < 30_000 ? "low" : ""}`}>{formatClock(ms)}</span>;
}
```

`apps/client/src/screens/HomeScreen.tsx`

```tsx
import { useState, type FormEvent } from "react";

export function HomeScreen({ onSave }: { onSave(nickname: string): void }) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSave(trimmed);
  };
  return (
    <div className="home">
      <h1>Card Duel</h1>
      <p className="muted">Fuse creatures, outplay your opponent, beat the clock.</p>
      <form onSubmit={submit} className="panel stack">
        <label htmlFor="nickname">Your nickname</label>
        <input id="nickname" value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!trimmed}>Play</button>
      </form>
    </div>
  );
}
```

`apps/client/src/screens/LobbyScreen.tsx`

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { MINUTES, type Minutes, type Visibility } from "@duel/protocol";
import type { Server } from "../state/useServer";

export function LobbyScreen({ server, onDecks }: { server: Server; onDecks(): void }) {
  const { state, send } = server;
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [minutes, setMinutes] = useState<Minutes>(10);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (state.welcomes === 0) return;
    send({ type: "lobby.subscribe" });
    return () => send({ type: "lobby.unsubscribe" });
  }, [state.welcomes, send]);

  const join = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) send({ type: "room.join", code: code.trim() });
  };

  return (
    <div className="lobby">
      <section className="panel">
        <h2>Open rooms</h2>
        {state.lobby.length === 0 ? (
          <p className="muted">No open rooms. Create one and share the link.</p>
        ) : (
          <ul className="rooms">
            {state.lobby.map((room) => (
              <li key={room.code}>
                <span className="host">{room.host}</span>
                <span className="muted">{room.minutes} min</span>
                <button onClick={() => send({ type: "room.join", code: room.code })}>Join</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Create a room</h2>
        <div className="row">
          {(["public", "private"] as const).map((v) => (
            <label key={v} className="choice">
              <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
              {v === "public" ? "Public (listed)" : "Private (link only)"}
            </label>
          ))}
        </div>
        <label>
          Time per player{" "}
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as Minutes)}>
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => send({ type: "room.create", visibility, minutes })}>
          Create room
        </button>
      </section>

      <section className="panel stack">
        <h2>Join by code</h2>
        <form onSubmit={join} className="row">
          <input value={code} maxLength={12} placeholder="ABC234" onChange={(e) => setCode(e.target.value)} />
          <button disabled={!code.trim()}>Join</button>
        </form>
        <button className="link" onClick={onDecks}>Build a deck →</button>
      </section>
    </div>
  );
}
```

`apps/client/src/screens/RoomScreen.tsx`

```tsx
import { useMemo, useState } from "react";
import { browserStore } from "../browser";
import { starterDeck } from "../decks";
import { roomPath } from "../route";
import type { Server } from "../state/useServer";
import { loadDecks, playableDecks } from "../storage";
import { DuelScreen } from "./DuelScreen";

type Props = { code: string; server: Server; onLeave(): void; onBack(): void };

export function RoomScreen({ code, server, onLeave, onBack }: Props) {
  const { state } = server;
  const room = state.room;

  if (!room || room.code !== code) {
    return (
      <div className="panel stack narrow">
        <h2>Room {code}</h2>
        <p className="muted">{state.status === "online" ? "Joining…" : "Waiting for the connection…"}</p>
        <button onClick={onBack}>Back to lobby</button>
      </div>
    );
  }

  if ((room.status === "playing" || room.status === "finished") && state.match) {
    return <DuelScreen room={room} server={server} onLeave={onLeave} />;
  }

  return <ReadyCheck server={server} onLeave={onLeave} />;
}

function ReadyCheck({ server, onLeave }: { server: Server; onLeave(): void }) {
  const { state, send } = server;
  const room = state.room!;
  const decks = useMemo(
    () => [{ id: "starter", name: "Starter deck", cards: starterDeck() }, ...playableDecks(loadDecks(browserStore))],
    [],
  );
  const [deckId, setDeckId] = useState(decks[0]!.id);
  const [copied, setCopied] = useState(false);
  const me = room.seats[room.you];
  const link = `${window.location.origin}${roomPath(room.code)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="ready-check">
      <section className="panel stack">
        <h2>Room {room.code}</h2>
        <p className="muted">
          {room.visibility === "public" ? "Listed in the lobby" : "Private"} · {room.minutes} minutes per player
        </p>
        <div className="row">
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <button onClick={copy}>{copied ? "Copied" : "Copy invite link"}</button>
        </div>
      </section>

      <section className="panel">
        <h2>Players</h2>
        <ul className="seats">
          {room.seats.map((seat, i) => (
            <li key={i}>
              {seat ? (
                <>
                  <span className={`dot ${seat.connected ? "online" : "offline"}`} />
                  <span>{seat.nickname}{i === room.you ? " (you)" : ""}</span>
                  <span className={seat.ready ? "tag ok" : "tag"}>{seat.ready ? "ready" : "choosing deck"}</span>
                </>
              ) : (
                <span className="muted">Waiting for an opponent…</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack">
        <h2>Your deck</h2>
        <select value={deckId} disabled={me?.ready} onChange={(e) => setDeckId(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {me?.ready ? (
          <button onClick={() => send({ type: "room.unready" })}>Change deck</button>
        ) : (
          <button className="primary" onClick={() => send({ type: "room.ready", deck: decks.find((d) => d.id === deckId)!.cards })}>
            Ready
          </button>
        )}
        <button className="link danger" onClick={onLeave}>Leave room</button>
      </section>
    </div>
  );
}
```

`apps/client/src/screens/DuelScreen.tsx`

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { getCard, playsAllowed, type AttackAction, type HiddenCreature, type ViewCreature } from "@duel/engine";
import type { PreviewAction, RoomInfo } from "@duel/protocol";
import { CardFace, HiddenFace } from "../components/CardFace";
import { ClockView } from "../components/ClockView";
import { describeOutcome } from "../duel/forecast";
import { EMPTY_SELECTION, chooseSlot, setFaceDown, setPosition, toAction, toggleHand } from "../duel/selection";
import type { Server } from "../state/useServer";

type Props = { room: RoomInfo; server: Server; onLeave(): void };

export function DuelScreen({ room, server, onLeave }: Props) {
  const { state, send } = server;
  const { view, clocks, receivedAt } = state.match!;
  const you = view.you;
  const them = you === 0 ? 1 : 0;
  const myTurn = view.active === you && !view.result;
  const opponentName = room.seats[them]?.nickname ?? "Opponent";

  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [focus, setFocus] = useState<number | null>(null);
  /** the attack being aimed: the engine forecasts it before the player confirms */
  const [aim, setAim] = useState<AttackAction["target"] | null>(null);

  // every new view from the server starts the player's choices again
  useEffect(() => {
    setSelection(EMPTY_SELECTION);
    setFocus(null);
    setAim(null);
  }, [receivedAt]);

  // the engine counts the plays this turn allows; the client never applies the rule itself
  const canPlay = myTurn && view.playsUsed < playsAllowed(view);
  const action = toAction(selection);
  const attack: AttackAction | null = focus !== null && aim !== null ? { type: "ATTACK", attackerSlot: focus, target: aim } : null;
  const pending: PreviewAction | null = action ?? attack;
  const pendingKey = pending ? JSON.stringify(pending) : null;
  useEffect(() => {
    if (pending && myTurn) send({ type: "match.preview", action: pending });
  }, [pendingKey, myTurn]); // pendingKey stands for pending, which is a new object every render
  const preview = state.preview && pendingKey === JSON.stringify(state.preview.action) ? state.preview.preview : null;

  const clickHand = (index: number) => {
    if (!canPlay) return;
    setFocus(null);
    setAim(null);
    setSelection((s) => toggleHand(s, index));
  };

  const clickOwnSlot = (slot: number) => {
    if (!myTurn) return;
    if (selection.handIndexes.length > 0) return setSelection((s) => chooseSlot(s, slot));
    if (view.self.field[slot]) {
      setAim(null);
      setFocus((f) => (f === slot ? null : slot));
    }
  };

  const clickEnemySlot = (slot: number) => {
    if (!myTurn || focus === null || !view.opponent.field[slot]) return;
    setAim((a) => (a === slot ? null : slot));
  };

  const focused: ViewCreature | null = focus === null ? null : view.self.field[focus] ?? null;
  const enemyEmpty = view.opponent.field.every((c) => c === null);
  const played = preview?.kind === "play" && action ? preview.field[action.slot] : null;

  return (
    <div className="duel">
      <div className="board">
        <PlayerBar
          name={opponentName}
          life={view.opponent.lifePoints}
          deck={view.opponent.deckCount}
          hand={view.opponent.handCount}
          clock={<ClockView clocks={clocks} receivedAt={receivedAt} player={them} />}
          active={view.active === them && !view.result}
          connected={room.seats[them]?.connected ?? false}
        />
        <FieldRow
          field={view.opponent.field}
          onClick={clickEnemySlot}
          focus={typeof aim === "number" ? aim : null}
          targetable={myTurn && focus !== null}
        />
        <div className="divider">
          {view.result ? "Match over" : myTurn ? "Your turn" : `${opponentName}'s turn`} · turn {view.turn}
          {myTurn && ` · plays ${view.playsUsed}/${playsAllowed(view)}`}
        </div>
        <FieldRow
          field={view.self.field}
          onClick={clickOwnSlot}
          focus={focus}
          target={selection.handIndexes.length > 0 ? selection.slot : null}
          choosingSlot={myTurn && selection.handIndexes.length > 0}
        />
        <PlayerBar
          name="You"
          life={view.self.lifePoints}
          deck={view.self.deckCount}
          clock={<ClockView clocks={clocks} receivedAt={receivedAt} player={you} />}
          active={myTurn}
          connected
        />
        <div className="hand">
          {view.self.hand.map((cardId, i) => {
            const order = selection.handIndexes.indexOf(i);
            return (
              <CardFace
                key={`${i}-${cardId}`}
                cardId={cardId}
                order={order === -1 ? undefined : order + 1}
                selected={order !== -1}
                dimmed={!canPlay}
                onClick={canPlay ? () => clickHand(i) : undefined}
              />
            );
          })}
        </div>
      </div>

      <aside className="side">
        <section className="panel stack">
          {!myTurn && !view.result && <p className="muted">Waiting for {opponentName}…</p>}
          {myTurn && selection.handIndexes.length > 0 && (
            <>
              <p className="muted">
                {selection.slot === null
                  ? "Choose a slot on your field (a creature there fuses first)."
                  : `Slot ${selection.slot + 1}. Cards fuse in the numbered order.`}
              </p>
              <div className="row">
                {(["attack", "defense"] as const).map((p) => (
                  <label key={p} className="choice">
                    <input type="radio" checked={selection.position === p} onChange={() => setSelection((s) => setPosition(s, p))} />
                    {p}
                  </label>
                ))}
                <label className="choice">
                  <input type="checkbox" checked={selection.faceDown} onChange={(e) => setSelection((s) => setFaceDown(s, e.target.checked))} />
                  face-down
                </label>
              </div>
              {played && (
                <p>
                  Result: <b>{getCard(played.cardId).name}</b> ({played.atk}/{played.def})
                </p>
              )}
              {preview?.kind === "error" && <p className="error-text">{preview.error}</p>}
              <div className="row">
                <button className="primary" disabled={!action} onClick={() => action && send({ type: "match.action", action })}>Play</button>
                <button onClick={() => setSelection(EMPTY_SELECTION)}>Clear</button>
              </div>
            </>
          )}
          {myTurn && focused && focus !== null && (
            <>
              <p>
                <b>{getCard(focused.cardId).name}</b>
                {focused.faceDown && " (face-down)"} selected.{" "}
                {focused.position === "attack" && !focused.hasAttacked && !enemyEmpty && aim === null && "Click an enemy creature to aim at it."}
              </p>
              {attack && preview?.kind === "attack" && <p>{describeOutcome(attack, preview.outcome)}</p>}
              {attack && preview?.kind === "error" && <p className="error-text">{preview.error}</p>}
              <div className="row">
                {focused.position === "attack" && enemyEmpty && aim === null && (
                  <button onClick={() => setAim("direct")}>Aim directly</button>
                )}
                {attack && (
                  <button className="primary" disabled={preview?.kind !== "attack"} onClick={() => send({ type: "match.action", action: attack })}>
                    Attack
                  </button>
                )}
                {focused.faceDown && (
                  <button onClick={() => send({ type: "match.action", action: { type: "REVEAL", slot: focus } })}>Reveal</button>
                )}
                <button
                  onClick={() =>
                    send({
                      type: "match.action",
                      action: { type: "SET_POSITION", slot: focus, position: focused.position === "attack" ? "defense" : "attack" },
                    })
                  }
                >
                  Switch to {focused.position === "attack" ? "defense" : "attack"}
                </button>
              </div>
            </>
          )}
          {myTurn && (
            <button className="primary" onClick={() => send({ type: "match.action", action: { type: "END_TURN" } })}>
              End turn
            </button>
          )}
          {!view.result && (
            <button
              className="link danger"
              onClick={() => window.confirm("Surrender this match?") && send({ type: "match.action", action: { type: "SURRENDER" } })}
            >
              Surrender
            </button>
          )}
        </section>

        <section className="panel log">
          <h3>Log</h3>
          <ol>
            {state.log.slice(-40).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </aside>

      {view.result && (
        <div className="overlay">
          <div className="panel stack result">
            <h2>{view.result.winner === you ? "You win!" : "You lose"}</h2>
            <p className="muted">by {view.result.reason}</p>
            {room.seats[them] ? (
              room.seats[you]?.wantsRematch ? (
                <p className="muted">Waiting for {opponentName} to accept…</p>
              ) : (
                <button className="primary" onClick={() => send({ type: "room.rematch" })}>
                  {room.seats[them]?.wantsRematch ? "Accept rematch" : "Rematch"}
                </button>
              )
            ) : (
              <p className="muted">{opponentName} left.</p>
            )}
            <button onClick={onLeave}>Back to lobby</button>
          </div>
        </div>
      )}
    </div>
  );
}

type BarProps = { name: string; life: number; deck: number; hand?: number; clock: ReactNode; active: boolean; connected: boolean };

function PlayerBar({ name, life, deck, hand, clock, active, connected }: BarProps) {
  return (
    <div className={`player-bar ${active ? "active" : ""}`}>
      <span className="name">
        <span className={`dot ${connected ? "online" : "offline"}`} /> {name}
      </span>
      <span className="life">♥ {life}</span>
      <span className="muted">deck {deck}</span>
      {hand !== undefined && <span className="muted">hand {hand}</span>}
      {clock}
    </div>
  );
}

type FieldProps = {
  field: (ViewCreature | HiddenCreature | null)[];
  onClick(slot: number): void;
  focus?: number | null;
  target?: number | null;
  targetable?: boolean;
  choosingSlot?: boolean;
};

function FieldRow({ field, onClick, focus = null, target = null, targetable = false, choosingSlot = false }: FieldProps) {
  return (
    <div className="field">
      {field.map((creature, slot) => {
        const classes = ["slot", slot === target && "target", choosingSlot && "choosable", targetable && creature && "targetable"];
        return (
          // a card handles its own click; the slot only handles clicks while it is empty, or one click would count twice
          <div key={slot} className={classes.filter(Boolean).join(" ")} onClick={creature ? undefined : () => onClick(slot)}>
            {creature?.hidden ? (
              <HiddenFace position={creature.position} selected={slot === focus} onClick={() => onClick(slot)} />
            ) : creature ? (
              <CardFace
                cardId={creature.cardId}
                position={creature.position}
                stats={creature}
                faceDown={creature.faceDown}
                selected={slot === focus}
                dimmed={creature.hasAttacked}
                onClick={() => onClick(slot)}
              />
            ) : (
              <span className="empty">{slot + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

`apps/client/src/screens/DeckBuilderScreen.tsx`

```tsx
import { useState } from "react";
import { CARDS, DECK_SIZE, ELEMENTS, TAGS, getCard, validateDeck, type CardId, type Element, type Tag } from "@duel/engine";
import { browserStore, newId } from "../browser";
import { CardFace } from "../components/CardFace";
import { addCard, countOf, groupDeck, removeCard, starterDeck } from "../decks";
import { loadDecks, saveDecks, type SavedDeck } from "../storage";

const POOL = CARDS.filter((c) => !c.fusionOnly);

export function DeckBuilderScreen() {
  const [decks, setDecks] = useState<SavedDeck[]>(() => loadDecks(browserStore));
  const [editing, setEditing] = useState<SavedDeck>(() => ({ id: newId(), name: "New deck", cards: [] }));
  const [element, setElement] = useState<Element | "all">("all");
  const [tag, setTag] = useState<Tag | "all">("all");
  const [message, setMessage] = useState<string | null>(null);

  const check = validateDeck(editing.cards);
  const pool = POOL.filter((c) => (element === "all" || c.element === element) && (tag === "all" || c.tags.includes(tag)));

  const add = (id: CardId) => {
    const result = addCard(editing.cards, id);
    if ("error" in result) return setMessage(result.error);
    setMessage(null);
    setEditing({ ...editing, cards: result.cards });
  };

  const persist = (next: SavedDeck[]) => {
    saveDecks(browserStore, next);
    setDecks(next);
  };

  const save = () => {
    const name = editing.name.trim() || "Untitled deck";
    const saved = { ...editing, name };
    persist(decks.some((d) => d.id === saved.id) ? decks.map((d) => (d.id === saved.id ? saved : d)) : [...decks, saved]);
    setEditing(saved);
    setMessage("Saved.");
  };

  const remove = () => {
    persist(decks.filter((d) => d.id !== editing.id));
    setEditing({ id: newId(), name: "New deck", cards: [] });
    setMessage("Deleted.");
  };

  return (
    <div className="deck-builder">
      <section className="panel stack">
        <h2>Saved decks</h2>
        {decks.length === 0 && <p className="muted">None yet.</p>}
        <ul className="deck-list">
          {decks.map((d) => (
            <li key={d.id}>
              <button className={`link ${d.id === editing.id ? "current" : ""}`} onClick={() => setEditing(d)}>
                {d.name} <span className="muted">({d.cards.length}/{DECK_SIZE})</span>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => setEditing({ id: newId(), name: "New deck", cards: [] })}>New deck</button>
        <button onClick={() => setEditing({ ...editing, cards: starterDeck() })}>Fill with starter cards</button>
      </section>

      <section className="panel stack pool">
        <div className="row">
          <h2>Cards</h2>
          <select value={element} onChange={(e) => setElement(e.target.value as Element | "all")}>
            <option value="all">All elements</option>
            {ELEMENTS.map((el) => (
              <option key={el} value={el}>{el}</option>
            ))}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value as Tag | "all")}>
            <option value="all">All kinds</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="card-grid">
          {pool.map((c) => (
            <div key={c.id} className="pool-card">
              <CardFace cardId={c.id} onClick={() => add(c.id)} />
              <span className="count">{countOf(editing.cards, c.id)}/3</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <input value={editing.name} maxLength={30} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        <p className={check.ok ? "ok-text" : "muted"}>
          {editing.cards.length}/{DECK_SIZE} cards · {check.ok ? "ready to play" : check.error}
        </p>
        {message && <p className="muted">{message}</p>}
        <ul className="deck-cards">
          {groupDeck(editing.cards).map(({ id, count }) => (
            <li key={id}>
              <span>{count}× {getCard(id).name}</span>
              <button className="link" onClick={() => setEditing({ ...editing, cards: removeCard(editing.cards, id) })} aria-label={`Remove ${getCard(id).name}`}>
                −
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="primary" onClick={save}>Save</button>
          {decks.some((d) => d.id === editing.id) && (
            <button className="link danger" onClick={remove}>Delete</button>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Write the styles**

`apps/client/src/styles.css`

```css
:root {
  --bg: #12141a;
  --panel: #1c1f28;
  --panel-2: #252935;
  --text: #e8e9ee;
  --muted: #9097a8;
  --accent: #f0b429;
  --danger: #ef5d5d;
  --ok: #4cc38a;
  --border: #323746;
  --el-flame: #c2413a;
  --el-forest: #3f8f4a;
  --el-wind: #3aa3a0;
  --el-earth: #8a6a3c;
  --el-thunder: #b9a12a;
  --el-water: #3a6fc2;
  color-scheme: dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
button, input, select { font: inherit; color: inherit; }
button {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); color: #1a1400; border-color: var(--accent); font-weight: 600; }
button.link { background: none; border: none; padding: 0; color: var(--accent); }
button.link.danger { color: var(--danger); }
button.small { font-size: 0.8rem; }
input, select { background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; }

.app { max-width: 1200px; margin: 0 auto; padding: 0 16px 32px; }
.topbar { display: flex; align-items: center; gap: 16px; padding: 12px 0; }
.topbar nav { display: flex; gap: 12px; flex: 1; }
.brand { background: none; border: none; font-size: 1.2rem; font-weight: 700; padding: 0; }
.who { display: flex; align-items: center; gap: 6px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.dot.online { background: var(--ok); }
.dot.offline, .dot.replaced { background: var(--danger); }
.dot.connecting { background: var(--accent); }

.banner { display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
.banner.warn { background: #3a3014; }
.banner.error { background: #3a1a1a; }

.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.panel h2, .panel h3 { margin: 0 0 8px; }
.stack { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.narrow { max-width: 420px; margin: 40px auto; }
.muted { color: var(--muted); }
.ok-text { color: var(--ok); }
.error-text { color: var(--danger); }
.choice { display: flex; gap: 4px; align-items: center; }
.tag { font-size: 0.8rem; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); }
.tag.ok { background: #1e3b2d; color: var(--ok); }

.home { max-width: 360px; margin: 80px auto; text-align: center; }
.home form { text-align: left; }
.home input { width: 100%; }

.lobby, .ready-check { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.rooms, .seats, .deck-list, .deck-cards { list-style: none; margin: 0; padding: 0; width: 100%; }
.rooms li, .seats li, .deck-cards li { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
.rooms .host { flex: 1; font-weight: 600; }
.deck-cards li span { flex: 1; }
.ready-check input[readonly] { flex: 1; min-width: 0; }

.deck-builder { display: grid; grid-template-columns: 220px 1fr 260px; gap: 16px; align-items: start; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; width: 100%; }
.pool-card { position: relative; }
.pool-card .count { position: absolute; top: 4px; right: 6px; font-size: 0.75rem; }
.link.current { font-weight: 700; }

.card {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; min-height: 128px; padding: 6px 8px; text-align: left;
  border-radius: 8px; border: 2px solid transparent;
  background: linear-gradient(160deg, var(--card-el) 0%, var(--panel-2) 85%);
}
.card:disabled { opacity: 1; cursor: default; }
.card .art { font-size: 1.5rem; line-height: 1.4; }
.card .name { font-weight: 700; font-size: 0.85rem; }
.card .meta { font-size: 0.7rem; color: var(--muted); text-transform: capitalize; }
.card .stats { margin-top: auto; font-size: 0.85rem; }
.card .faint { opacity: 0.45; }
.card .pos { position: absolute; top: 6px; right: 6px; font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: #0008; }
.card .order { position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #1a1400; font-weight: 700; display: grid; place-items: center; font-size: 0.8rem; }
.card .badge { position: absolute; bottom: 6px; right: 6px; font-size: 0.6rem; padding: 1px 5px; border-radius: 4px; background: #0008; }
.card.face-down { outline: 2px dashed var(--muted); outline-offset: -4px; }
.card.hidden-card { background: repeating-linear-gradient(45deg, #2a2f3a, #2a2f3a 8px, #232733 8px, #232733 16px); justify-content: center; }
.card.hidden-card .art { font-size: 2rem; opacity: 0.6; }
.card.selected { border-color: var(--accent); }
.card.dimmed { filter: saturate(0.4) brightness(0.8); }
.card.defense { transform: rotate(-4deg); }
.el-flame { --card-el: var(--el-flame); }
.el-forest { --card-el: var(--el-forest); }
.el-wind { --card-el: var(--el-wind); }
.el-earth { --card-el: var(--el-earth); }
.el-thunder { --card-el: var(--el-thunder); }
.el-water { --card-el: var(--el-water); }

.duel { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
.board { display: flex; flex-direction: column; gap: 10px; }
.player-bar { display: flex; gap: 14px; align-items: center; padding: 8px 12px; border-radius: 8px; background: var(--panel); border: 1px solid var(--border); }
.player-bar.active { border-color: var(--accent); }
.player-bar .name { flex: 1; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.player-bar .life { font-weight: 700; }
.clock { font-variant-numeric: tabular-nums; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: var(--panel-2); }
.clock.running { background: var(--accent); color: #1a1400; }
.clock.low.running { background: var(--danger); color: white; }
.field, .hand { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.slot { min-height: 136px; border: 2px dashed var(--border); border-radius: 10px; display: grid; place-items: center; padding: 2px; }
.slot.choosable { border-color: var(--muted); cursor: pointer; }
.slot.target { border-color: var(--accent); border-style: solid; }
.slot.targetable { border-color: var(--danger); border-style: solid; cursor: crosshair; }
.slot .empty { color: var(--border); font-size: 1.5rem; }
.divider { text-align: center; color: var(--muted); font-size: 0.85rem; }
.side { display: flex; flex-direction: column; gap: 16px; }
.log ol { margin: 0; padding-left: 18px; max-height: 320px; overflow-y: auto; font-size: 0.85rem; display: flex; flex-direction: column; gap: 2px; }
.overlay { position: fixed; inset: 0; background: #000a; display: grid; place-items: center; }
.result { min-width: 280px; align-items: center; text-align: center; }

@media (max-width: 900px) {
  .duel, .deck-builder { grid-template-columns: 1fr; }
  .slot { min-height: 110px; }
  .card { min-height: 104px; padding: 4px; }
  .card .meta { display: none; }
}
```

- [ ] **Step 4: Typecheck, test and build**

Run: `pnpm test && pnpm typecheck && pnpm --filter @duel/client build`
Expected: every test passes, `tsc` prints nothing, and Vite prints `✓ built` with an `index.html`, one CSS file and one JS file under `apps/client/dist/` (already ignored by `.gitignore`).

- [ ] **Step 5: Start everything and play a match in two tabs**

In the root `package.json` `scripts`, replace `dev` with:

```json
    "dev": "pnpm --parallel --filter @duel/server --filter @duel/client run dev",
```

Run: `pnpm dev`
Expected: both `duel server listening on ws://localhost:8787/ws` and Vite's `Local:   http://localhost:5173/`.

Open `http://localhost:5173` in a normal window and in a private window (they need different tokens), and check each item:

- [ ] Each window asks for a nickname, then shows the lobby with a green dot next to the name.
- [ ] Window A creates a public room: it shows the invite link and "Waiting for an opponent…". Window B's lobby lists the room within a moment.
- [ ] B joins from the lobby list; both show both players. A private room does not appear in the lobby but can be joined by pasting its link into B.
- [ ] Both choose "Starter deck" and press Ready; both switch to the duel board, and exactly one shows "Your turn" with its clock highlighted and counting down.
- [ ] The player on turn clicks two hand cards (badges 1 and 2), then an empty slot of their own field: the side panel shows "Result: …" from the server. Play puts the result on the field, and the opponent sees it plus log lines.
- [ ] End turn: the turn and the running clock pass to the other window; the first player's clock stops.
- [ ] Reload the window that is not on turn: it comes back to the same match with the same board.
- [ ] The player on turn ticks "face-down" before Play: their own card shows a "face-down" badge; the other window shows a striped "Face-down" card with only ATK/DEF position, and its log says "Opponent played a face-down card (1 from hand)".
- [ ] Click the face-down creature, then Reveal: the other window shows the card, and its log says it was revealed.
- [ ] The divider shows "plays 1/2" after one play; after the turn's plays are used, the hand is dimmed.
- [ ] On turn 2 or later, click your creature, then an enemy creature: the side panel shows the forecast (for example "1600 against 2100; …"); Attack resolves exactly that, and both logs describe it. Clicking an opponent's face-down creature shows "the target is face-down" and Attack stays disabled.
- [ ] Surrender in one window (confirm): both see the result overlay. Rematch in one shows "Waiting for … to accept" there and "Accept rematch" in the other; accepting starts a fresh match at turn 1 with an empty log.
- [ ] Back to lobby in both windows; the room disappears.
- [ ] Decks: build a deck, use "Fill with starter cards", save; it shows "30/30 cards · ready to play" and appears in the deck choice of a new room.
- [ ] Stop the server (Ctrl+C) while a window is open: it shows "Connection lost. Reconnecting…", and recovers when `pnpm dev` runs again.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the client screens: home, lobby, deck builder, room and duel board (face-down play, Reveal, attack forecast, engine values on the field); `pnpm dev` starts server and client (plan 3, task 4, #24).
```

```bash
git add package.json apps/client/index.html apps/client/vite.config.ts apps/client/src/main.tsx apps/client/src/browser.ts apps/client/src/usePath.ts apps/client/src/state/useServer.ts apps/client/src/App.tsx apps/client/src/components/CardFace.tsx apps/client/src/components/ClockView.tsx apps/client/src/screens/HomeScreen.tsx apps/client/src/screens/LobbyScreen.tsx apps/client/src/screens/RoomScreen.tsx apps/client/src/screens/DuelScreen.tsx apps/client/src/screens/DeckBuilderScreen.tsx apps/client/src/styles.css HISTORY.md
git commit -m "feat(client): screens, duel board and dev script

Closes #24"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 8 Screens: Home, Lobby, Deck builder, Room, Duel, Result | 4 |
| 8 Routes `/`, `/decks`, `/room/<code>`; room link without a nickname | 1, 4 |
| 8 Decks saved in the browser | 1, 4 |
| 8 No rules logic in the client; board only from `match.view` | 3, 4 |
| 8 Reconnecting banner and retry | 3, 4 |
| 8 Placeholder card art | 4 |
| 7.1 Token in `localStorage` | 1 |
| 7.4 Client renders the countdown only | 2, 4 |
| 9 Client: manual play in two browser tabs | 4 |
| Face-down spec section 4: what each player sees; `REVEAL`; face-down `PLAY` | 2, 4 |
| DDR-0010: field values from the view; attack forecast from the server | 2, 3, 4 |

## After this plan

Version one from the spec is complete. Natural next steps, each needing its own spec change first: deploying the server, a mobile layout, playing against a bot in a room, spectators.

## Revisions

### 2026-11-13

- Written as a revision of `docs/plans/2026-11-12-browser-client.md` after tactics phases 0 to 5, at the owner's request. Issues #21 to #24 (milestone "Plan 3") are its tasks 1 to 4.
