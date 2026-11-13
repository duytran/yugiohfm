# Protocol and Server Implementation Plan (revised for the tactics engine)

> **Supersedes** `docs/plans/2026-11-12-protocol-and-server.md`. Same four tasks and issues (#17 to #20); the code is updated for the engine as it stands after tactics phases 0 to 5 (R1 to R6). What changed is listed in "Changes from the 2026-11-12 plan" below.

> **For agentic workers:** Implement this plan task-by-task, in order — one fresh subagent per task (recommended) or inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared message protocol and the authoritative game server: guest identity, public lobby, private invite rooms, ready check, matches judged by the engine, chess clocks, reconnect, rematch and room cleanup.

**Architecture:** `@duel/protocol` defines every message once (zod schemas for client messages, TypeScript types for server messages). In `apps/server`, a `Hub` class holds connections, players, rooms and the lobby with no network code, and a `Room` class runs one room's lifecycle, match and clocks by calling the engine. A thin `ws` adapter is the only file that knows about sockets. Time is injected, so every timeout is tested with a fake clock.

**Tech Stack:** Node 22, TypeScript, zod 4, ws 8, Vitest, tsx.

**Spec:** `docs/specs/2026-11-12-online-card-duel-design.md` sections 6, 7 and the server part of 9.

**This is plan 2 of 3.** It requires plan 1 (`docs/plans/2026-11-12-engine-and-bots.md`) and tactics phases 0 to 5 to be implemented: it uses the engine's `createMatch`, `applyAction`, `applyTimeout`, `actionError`, `validateDeck`, `viewFor`, `eventsFor`, `viewAfterPlay`, `previewAttack` and types.

All code in this plan was run in a scratch git worktree on `main` at `dc89cea` (tactics phases 0 to 5 merged) on 2026-11-13: the protocol and server tests pass (42 and 53), the whole suite passes, `tsc` is clean, and the server starts. zod 4.6.7, ws 8.22.2, @types/ws 8.18.2.

## Global Constraints

- Node 22, pnpm workspaces, TypeScript with `strict: true`. Imports inside a package are extensionless.
- Packages import each other only through their names (`@duel/engine`, `@duel/protocol`), never through deep paths.
- Never re-implement a rule (legality, fusion result, battle outcome, winner) outside `packages/engine`; call the engine (DDR-0001, DDR-0003).
- The game is original. Never add a name, card, artwork or text taken from an existing game (DDR-0008).
- After every task, append one line to `HISTORY.md` and include it in the task's commit (see `CLAUDE.md`).
- Package names: `@duel/protocol`, `@duel/server`.
- The server is authoritative. Match messages to a player are built only from `viewFor(state, thatPlayer)` and `eventsFor(events, thatPlayer)`; `MatchState`, deck orders, the opponent's hand and the card of an opponent's face-down creature never leave the server (DDR-0003).
- Previews come from the engine, answered only to the asking player and worked out from that player's own view: `viewAfterPlay` for a play, `previewAttack` for an attack. The server checks the action with `actionError` first and works out no value itself (DDR-0010).
- No multiplayer framework, database or auth library. Only `ws` and `zod` (DDR-0004, DDR-0005).
- Players are identified by a client token (16 to 64 characters), never by socket or nickname. A token is never sent to another client (DDR-0005).
- Only `apps/server/src/wsServer.ts` and `main.ts` touch sockets, `process` or real time. Everything else gets time from the injected `Clock` (DDR-0007).
- Values from the spec: nickname 1 to 16 characters; time controls 5, 10, 15 minutes; a waiting room whose only player is offline is deleted after 60 seconds; a finished room is deleted after 10 idle minutes.
- The WebSocket endpoint is `ws://<host>:<port>/ws`, default port 8787 (`PORT` overrides).

## Decisions made while planning

These refine the spec; the spec has been updated to match.

- `welcome` carries `roomCode`, the room the player is still seated in, so a reloaded browser can return to its match.
- `match.view` carries `clocks: { remainingMs: [p0, p1], running: PlayerId | null }`, the banks at the moment of sending. The client counts down from when it received the message, so client and server clocks never need to agree.
- A player may choose a deck and press ready while still alone in the room; the match starts when two ready players are seated.
- Leaving a running match is a surrender.
- When a room is deleted while someone is still seated (idle or abandoned), they get `room.closed { code, reason }`.
- A newer connection with the same token closes the older one with WebSocket close code 4000; plan 3's client stops reconnecting on that code.
- Room codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L).
- `match.preview` previews a PLAY or an ATTACK (owner's decision, 2026-11-13: the attack forecast is a server round trip, DDR-0010). The reply carries `preview: { kind: "play"; field } | { kind: "attack"; outcome } | { kind: "error"; error }`. A play preview gives the asking player's whole field after the play, so a Banner or Pack bonus the play creates shows up on its neighbours too.
- A preview of an illegal action is answered with the engine's reason (`actionError`), not with an `error` message, so the client can show it next to the choice. A preview of an attack on a face-down creature answers `"the target is face-down"`.
- Online matches use the engine's `DEFAULT_RULES`. A change of default (for example `firstTurnPlays`) reaches online play with no server change.

## Changes from the 2026-11-12 plan

Revised against the engine after tactics phases 0 to 5 (owner, 2026-11-13). Tasks 2 and 4 are unchanged. In tasks 1 and 3:

- **Protocol (task 1):** `PLAY` gains optional `faceDown`; new action `REVEAL { slot }`; `match.preview` takes a PLAY or an ATTACK (`previewActionSchema`, `PreviewAction`); the server's `match.preview` reply carries `preview: Preview` instead of `card`/`error`. 8 new protocol tests (42 in all).
- **Room (task 3):** `broadcastMatch` sends `eventsFor(events, seat)` to each player instead of one raw list (DDR-0003); `preview` uses `actionError`, then `viewAfterPlay` or `previewAttack` on the player's own view instead of `previewPlay` on the state (DDR-0010).
- **Tests (task 3):** the play preview test now checks engine values; new tests: an attack preview that the real attack then follows; a face-down play shows the opponent only the position in the view and the events; a hidden target cannot be previewed; `REVEAL` reaches both players. 18 match tests (was 14).

## File Structure

```
packages/protocol/
  package.json
  src/client.ts           zod schemas for every client message, parseClientMessage
  src/server.ts           types of every server message
  src/index.ts            public API
  test/protocol.test.ts
apps/server/
  package.json            scripts: dev (tsx watch), start
  src/clock.ts            Clock interface and the real clock
  src/banks.ts            chess-clock time banks, pure functions
  src/room.ts             Room: seats, lifecycle, match, clocks, cleanup timers
  src/hub.ts              Hub: connections, hello, players, lobby, routing to rooms
  src/wsServer.ts         ws adapter, room codes, default dependencies
  src/main.ts             entry point
  test/harness.ts         FakeClock, TestClient, setup()
  test/banks.test.ts
  test/rooms.test.ts      hello, lobby, create, join, leave, ready check
  test/match.test.ts      actions, preview, surrender, clock, whole match, rematch, idle cleanup
  test/reconnect.test.ts  disconnect, reconnect, replaced connection, abandoned room
  test/ws.test.ts         two real WebSocket clients
```

---

### Task 1: Message protocol

**Files:**
- Create: `packages/protocol/src/client.ts`
- Create: `packages/protocol/src/server.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/protocol.test.ts`

**Interfaces:**
- Consumes: from `@duel/engine`: the types `Action`, `BattleOutcome`, `GameEvent`, `PlayerId`, `PlayerView`, `ViewCreature`.
- Produces: `parseClientMessage(raw: string): ParseResult` (never throws; errors read `"not valid JSON"` or `"<field path>: <zod message>"`), the schemas `clientMessageSchema`, `actionSchema`, `playActionSchema`, `attackActionSchema`, `previewActionSchema`, `MINUTES = [5, 10, 15]`, and the types `ClientMessage`, `Minutes`, `Visibility`, `PreviewAction`, `Preview`, `ServerMessage`, `RoomSummary`, `RoomInfo`, `SeatInfo`, `RoomStatus`, `Clocks`, `ErrorCode`, `RoomClosedReason`.

- [ ] **Step 0: Create the package and install zod**

`packages/protocol/package.json`

```json
{
  "name": "@duel/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@duel/engine": "workspace:*",
    "zod": "^4.6.7"
  }
}
```

Run: `pnpm install && pnpm --filter @duel/protocol add zod`
Expected: `zod` appears under `dependencies` in `packages/protocol/package.json` (version 4.x).

- [ ] **Step 1: Write the failing tests**

`packages/protocol/test/protocol.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { Action } from "@duel/engine";
import { parseClientMessage, type ClientMessage } from "../src/index";

const TOKEN = "a".repeat(32);
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe("parseClientMessage", () => {
  it.each<ClientMessage>([
    { type: "hello", token: TOKEN, nickname: "Duy" },
    { type: "lobby.subscribe" },
    { type: "lobby.unsubscribe" },
    { type: "room.create", visibility: "public", minutes: 10 },
    { type: "room.join", code: "ABC123" },
    { type: "room.leave" },
    { type: "room.ready", deck: ["ember-fox"] },
    { type: "room.unready" },
    { type: "room.rematch" },
    { type: "match.action", action: { type: "PLAY", handIndexes: [0, 2], slot: 1, position: "defense" } },
    { type: "match.action", action: { type: "PLAY", handIndexes: [3], slot: 1, position: "defense", faceDown: true } },
    { type: "match.action", action: { type: "REVEAL", slot: 2 } },
    { type: "match.action", action: { type: "SET_POSITION", slot: 4, position: "attack" } },
    { type: "match.action", action: { type: "ATTACK", attackerSlot: 0, target: "direct" } },
    { type: "match.action", action: { type: "ATTACK", attackerSlot: 0, target: 3 } },
    { type: "match.action", action: { type: "END_TURN" } },
    { type: "match.action", action: { type: "SURRENDER" } },
    { type: "match.preview", action: { type: "PLAY", handIndexes: [1], slot: 0, position: "attack" } },
    { type: "match.preview", action: { type: "PLAY", handIndexes: [1], slot: 0, position: "defense", faceDown: true } },
    { type: "match.preview", action: { type: "ATTACK", attackerSlot: 1, target: 3 } },
    { type: "match.preview", action: { type: "ATTACK", attackerSlot: 1, target: "direct" } },
  ])("accepts $type", (message) => {
    expect(parse(message)).toEqual({ ok: true, message });
  });

  it("trims the nickname and the room code", () => {
    expect(parse({ type: "hello", token: TOKEN, nickname: "  Duy  " })).toEqual({
      ok: true,
      message: { type: "hello", token: TOKEN, nickname: "Duy" },
    });
    expect(parse({ type: "room.join", code: " abc " })).toMatchObject({ ok: true, message: { code: "abc" } });
  });

  it("drops unknown fields", () => {
    expect(parse({ type: "room.leave", extra: 1 })).toEqual({ ok: true, message: { type: "room.leave" } });
  });

  it("rejects text that is not JSON", () => {
    expect(parseClientMessage("{nope")).toEqual({ ok: false, error: "not valid JSON" });
  });

  it.each([
    [{ type: "dance" }],
    [{}],
    [{ type: "hello", token: "short", nickname: "Duy" }],
    [{ type: "hello", token: TOKEN, nickname: "   " }],
    [{ type: "hello", token: TOKEN, nickname: "x".repeat(17) }],
    [{ type: "room.create", visibility: "public", minutes: 7 }],
    [{ type: "room.create", visibility: "secret", minutes: 5 }],
    [{ type: "room.ready", deck: "ember-fox" }],
    [{ type: "match.action", action: { type: "PLAY", handIndexes: [], slot: 0, position: "attack" } }],
    [{ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 5, position: "attack" } }],
    [{ type: "match.action", action: { type: "PLAY", handIndexes: [1.5], slot: 0, position: "attack" } }],
    [{ type: "match.action", action: { type: "ATTACK", attackerSlot: 0, target: "face" } }],
    [{ type: "match.preview", action: { type: "END_TURN" } }],
    [{ type: "match.preview", action: { type: "REVEAL", slot: 0 } }],
    [{ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack", faceDown: "yes" } }],
    [{ type: "match.action", action: { type: "REVEAL", slot: 5 } }],
  ])("rejects %j", (value) => {
    const result = parse(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("names the field that is wrong", () => {
    expect(parse({ type: "room.create", visibility: "public", minutes: 7 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^minutes: /),
    });
  });

  it("produces actions the engine accepts as its own type", () => {
    const result = parse({ type: "match.action", action: { type: "END_TURN" } });
    if (!result.ok || result.message.type !== "match.action") throw new Error("expected an action");
    const action: Action = result.message.action;
    expect(action).toEqual({ type: "END_TURN" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/protocol/test/protocol.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/index`.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/client.ts`

```ts
import { z } from "zod";

const position = z.enum(["attack", "defense"]);
const slot = z.number().int().min(0).max(4);

export const playActionSchema = z.object({
  type: z.literal("PLAY"),
  handIndexes: z.array(z.number().int().min(0).max(4)).min(1).max(5),
  slot,
  position,
  /** R6: absent means face-up */
  faceDown: z.boolean().optional(),
});

export const attackActionSchema = z.object({
  type: z.literal("ATTACK"),
  attackerSlot: slot,
  target: z.union([slot, z.literal("direct")]),
});

export const actionSchema = z.discriminatedUnion("type", [
  playActionSchema,
  z.object({ type: z.literal("SET_POSITION"), slot, position }),
  attackActionSchema,
  z.object({ type: z.literal("REVEAL"), slot }),
  z.object({ type: z.literal("END_TURN") }),
  z.object({ type: z.literal("SURRENDER") }),
]);

/** The actions the server previews: what a play would leave, what an attack would do (DDR-0010). */
export const previewActionSchema = z.discriminatedUnion("type", [playActionSchema, attackActionSchema]);
export type PreviewAction = z.infer<typeof previewActionSchema>;

export const MINUTES = [5, 10, 15] as const;
export type Minutes = (typeof MINUTES)[number];
export type Visibility = "public" | "private";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    token: z.string().min(16).max(64),
    nickname: z.string().trim().min(1).max(16),
  }),
  z.object({ type: z.literal("lobby.subscribe") }),
  z.object({ type: z.literal("lobby.unsubscribe") }),
  z.object({
    type: z.literal("room.create"),
    visibility: z.enum(["public", "private"]),
    minutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  }),
  z.object({ type: z.literal("room.join"), code: z.string().trim().min(1).max(12) }),
  z.object({ type: z.literal("room.leave") }),
  z.object({ type: z.literal("room.ready"), deck: z.array(z.string().max(64)).max(60) }),
  z.object({ type: z.literal("room.unready") }),
  z.object({ type: z.literal("room.rematch") }),
  z.object({ type: z.literal("match.action"), action: actionSchema }),
  z.object({ type: z.literal("match.preview"), action: previewActionSchema }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

/** Parses one raw WebSocket frame from a client. Never throws. */
export function parseClientMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const result = clientMessageSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `${where}${issue?.message ?? "invalid message"}` };
  }
  return { ok: true, message: result.data };
}
```

`packages/protocol/src/server.ts`

```ts
import type { BattleOutcome, GameEvent, PlayerId, PlayerView, ViewCreature } from "@duel/engine";
import type { Minutes, PreviewAction, Visibility } from "./client";

export type RoomStatus = "waiting" | "ready-check" | "playing" | "finished";

/** One public room waiting for an opponent, as listed in the lobby. */
export type RoomSummary = { code: string; host: string; minutes: Minutes };

export type SeatInfo = { nickname: string; connected: boolean; ready: boolean; wantsRematch: boolean };

export type RoomInfo = {
  code: string;
  visibility: Visibility;
  minutes: Minutes;
  status: RoomStatus;
  /** index = engine PlayerId */
  seats: [SeatInfo | null, SeatInfo | null];
  /** the recipient's own seat */
  you: PlayerId;
};

export type Clocks = {
  /** each player's bank at the moment the message was sent */
  remainingMs: [number, number];
  /** whose bank is running down, or null when no clock runs */
  running: PlayerId | null;
};

/**
 * The engine's answer to a preview (DDR-0010). A play gives the asking player's
 * own field after the play, with every value worked out by the engine, so a
 * Banner or Pack bonus the play creates is shown; an attack gives the battle's
 * outcome; an illegal or unpreviewable action gives the reason.
 */
export type Preview =
  | { kind: "play"; field: (ViewCreature | null)[] }
  | { kind: "attack"; outcome: BattleOutcome }
  | { kind: "error"; error: string };

export type ErrorCode =
  | "bad-message"
  | "not-hello"
  | "already-in-room"
  | "room-not-found"
  | "room-full"
  | "not-in-room"
  | "wrong-status"
  | "invalid-deck"
  | "illegal-action";

export type RoomClosedReason = "abandoned" | "idle";

export type ServerMessage =
  | { type: "welcome"; nickname: string; roomCode: string | null }
  | { type: "lobby.rooms"; rooms: RoomSummary[] }
  | { type: "room.state"; room: RoomInfo }
  | { type: "room.closed"; code: string; reason: RoomClosedReason }
  /** `events` are already filtered for the recipient by the engine's eventsFor (DDR-0003) */
  | { type: "match.view"; view: PlayerView; events: GameEvent[]; clocks: Clocks }
  | { type: "match.preview"; action: PreviewAction; preview: Preview }
  | { type: "error"; code: ErrorCode; message: string };
```

`packages/protocol/src/index.ts`

```ts
export {
  MINUTES,
  actionSchema,
  attackActionSchema,
  clientMessageSchema,
  parseClientMessage,
  playActionSchema,
  previewActionSchema,
  type ClientMessage,
  type Minutes,
  type ParseResult,
  type PreviewAction,
  type Visibility,
} from "./client";
export type {
  Clocks,
  ErrorCode,
  Preview,
  RoomClosedReason,
  RoomInfo,
  RoomStatus,
  RoomSummary,
  SeatInfo,
  ServerMessage,
} from "./server";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/protocol/test/protocol.test.ts`
Expected: PASS, 42 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the protocol package: zod schemas for client messages and types for server messages (plan 2, task 1, #17).
```

```bash
git add pnpm-lock.yaml packages/protocol/package.json packages/protocol/src/client.ts packages/protocol/src/server.ts packages/protocol/src/index.ts packages/protocol/test/protocol.test.ts HISTORY.md
git commit -m "feat(protocol): client message schemas and server message types

Closes #17"
```

### Task 2: Server clock and time banks

**Files:**
- Create: `apps/server/src/clock.ts`
- Create: `apps/server/src/banks.ts`
- Test: `apps/server/test/banks.test.ts`

**Interfaces:**
- Consumes: `PlayerId` from `@duel/engine`.
- Produces: `type TimerHandle = { cancel(): void }`, `type Clock = { now(): number; setTimer(ms: number, fn: () => void): TimerHandle }`, `systemClock: Clock`; `type Banks = { remainingMs: [number, number]; turnStartedAt: number }`, `startBanks(minutes, now): Banks`, `remainingAt(banks, active, now): [number, number]`, `chargeTurn(banks, active, now): Banks`, `msUntilFlag(banks, active, now): number`.

- [ ] **Step 0: Create the package and add it to the typecheck**

`apps/server/package.json`

```json
{
  "name": "@duel/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts"
  },
  "dependencies": {
    "@duel/engine": "workspace:*",
    "@duel/protocol": "workspace:*"
  }
}
```

In the root `tsconfig.json`, change `include` to:

```json
  "include": ["packages/*/src", "packages/*/test", "apps/server/src", "apps/server/test"]
```

Run: `pnpm install`
Expected: `Done`; `apps/server/node_modules/@duel/engine` and `@duel/protocol` link to the packages.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/banks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { chargeTurn, msUntilFlag, remainingAt, startBanks } from "../src/banks";

describe("time banks", () => {
  const banks = startBanks(5, 1_000);

  it("start both players with the same bank", () => {
    expect(banks).toEqual({ remainingMs: [300_000, 300_000], turnStartedAt: 1_000 });
  });

  it("run down only the active player's bank", () => {
    expect(remainingAt(banks, 0, 31_000)).toEqual([270_000, 300_000]);
    expect(remainingAt(banks, 1, 31_000)).toEqual([300_000, 270_000]);
  });

  it("never go below zero", () => {
    expect(remainingAt(banks, 0, 1_000_000)).toEqual([0, 300_000]);
  });

  it("chargeTurn keeps the time used and restarts timing", () => {
    const after = chargeTurn(banks, 0, 11_000);
    expect(after).toEqual({ remainingMs: [290_000, 300_000], turnStartedAt: 11_000 });
    expect(remainingAt(after, 1, 16_000)).toEqual([290_000, 295_000]);
  });

  it("msUntilFlag counts down to zero", () => {
    expect(msUntilFlag(banks, 1, 1_000)).toBe(300_000);
    expect(msUntilFlag(banks, 1, 301_000)).toBe(0);
    expect(msUntilFlag(banks, 1, 400_000)).toBe(0);
  });

  it("does not change its input", () => {
    const before = structuredClone(banks);
    chargeTurn(banks, 0, 50_000);
    remainingAt(banks, 1, 50_000);
    expect(banks).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/server/test/banks.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/banks`.

- [ ] **Step 3: Write the implementation**

`apps/server/src/clock.ts`

```ts
export type TimerHandle = { cancel(): void };

/** Time as the server sees it. Injected so tests can control it. */
export type Clock = {
  now(): number;
  setTimer(ms: number, fn: () => void): TimerHandle;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(ms, fn) {
    const handle = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(handle) };
  },
};
```

`apps/server/src/banks.ts`

```ts
import type { PlayerId } from "@duel/engine";

/** Chess-clock time banks. Pure: every function returns new values. */
export type Banks = {
  /** each player's bank as of turnStartedAt */
  remainingMs: [number, number];
  /** when the active player's bank started running */
  turnStartedAt: number;
};

export function startBanks(minutes: number, now: number): Banks {
  const ms = minutes * 60_000;
  return { remainingMs: [ms, ms], turnStartedAt: now };
}

/** Both banks at `now`, with the active player's elapsed time taken off. Never negative. */
export function remainingAt(banks: Banks, active: PlayerId, now: number): [number, number] {
  const out: [number, number] = [...banks.remainingMs];
  out[active] = Math.max(0, out[active] - (now - banks.turnStartedAt));
  return out;
}

/** Stops the active player's bank at `now` and starts the next turn's timing from `now`. */
export function chargeTurn(banks: Banks, active: PlayerId, now: number): Banks {
  return { remainingMs: remainingAt(banks, active, now), turnStartedAt: now };
}

/** Milliseconds until the active player runs out of time; 0 if already out. */
export function msUntilFlag(banks: Banks, active: PlayerId, now: number): number {
  return remainingAt(banks, active, now)[active];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/server/test/banks.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the server package with an injectable clock and pure chess-clock time banks (plan 2, task 2, #18).
```

```bash
git add pnpm-lock.yaml tsconfig.json apps/server/package.json apps/server/src/clock.ts apps/server/src/banks.ts apps/server/test/banks.test.ts HISTORY.md
git commit -m "feat(server): injectable clock and chess-clock time banks

Closes #18"
```

### Task 3: Rooms and the hub

**Files:**
- Create: `apps/server/src/room.ts`
- Create: `apps/server/src/hub.ts`
- Create: `apps/server/test/harness.ts` (test support)
- Test: `apps/server/test/rooms.test.ts`
- Test: `apps/server/test/match.test.ts`
- Test: `apps/server/test/reconnect.test.ts`

**Interfaces:**
- Consumes: from `@duel/engine`: `actionError`, `applyAction`, `applyTimeout`, `createMatch`, `eventsFor`, `previewAttack`, `validateDeck`, `viewAfterPlay`, `viewFor`, `CARDS` and types; from `@duel/protocol`: `parseClientMessage` and the server message types; `Clock`, `TimerHandle` (task 2); `Banks`, `startBanks`, `remainingAt`, `chargeTurn`, `msUntilFlag` (task 2).
- Produces: `class Hub { constructor(out: Outbound, deps: HubDeps); connect(connId: string): void; receive(connId: string, raw: string): void; disconnect(connId: string): void; roomCount(): number }`, `type Outbound = { send(connId, message: ServerMessage): void; close(connId): void }`, `type HubDeps = { clock: Clock; newCode(): string; newSeed(): number }`; from `room.ts`: `ABANDON_MS = 60_000`, `IDLE_MS = 600_000`, `class Room`, `type RoomHost`, `type RoomError = { code: ErrorCode; message: string }`. Test harness: `FakeClock` (`now`, `setTimer`, `advance(ms)`), `TestClient` (`send`, `sendRaw`, `all(type)`, `last(type)`, `clear()`, `disconnect()`, `messages`, `closed`), `deck()`, `setup()` returning `{ hub, clock, open, connect, startMatch }`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/harness.ts`

```ts
import { CARDS, type CardId } from "@duel/engine";
import type { ClientMessage, ServerMessage } from "@duel/protocol";
import type { Clock, TimerHandle } from "../src/clock";
import { Hub } from "../src/hub";

/** A clock that only moves when the test says so. */
export class FakeClock implements Clock {
  private time = 0;
  private timers: { at: number; fn: () => void; done: boolean }[] = [];

  now(): number {
    return this.time;
  }

  setTimer(ms: number, fn: () => void): TimerHandle {
    const timer = { at: this.time + ms, fn, done: false };
    this.timers.push(timer);
    return { cancel: () => void (timer.done = true) };
  }

  /** Moves time forward, firing every timer that falls due, in order. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => !t.done && t.at <= end).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      this.time = due.at;
      due.done = true;
      due.fn();
    }
    this.time = end;
  }
}

export type Received<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

export class TestClient {
  readonly messages: ServerMessage[] = [];
  closed = false;

  constructor(
    readonly id: string,
    readonly token: string,
    private readonly hub: Hub,
  ) {}

  send(message: ClientMessage): void {
    this.hub.receive(this.id, JSON.stringify(message));
  }

  sendRaw(raw: string): void {
    this.hub.receive(this.id, raw);
  }

  all<T extends ServerMessage["type"]>(type: T): Received<T>[] {
    return this.messages.filter((m): m is Received<T> => m.type === type);
  }

  last<T extends ServerMessage["type"]>(type: T): Received<T> {
    const found = this.all(type).at(-1);
    if (!found) throw new Error(`${this.id} received no ${type}; got ${this.messages.map((m) => m.type).join(", ")}`);
    return found;
  }

  clear(): void {
    this.messages.length = 0;
  }

  disconnect(): void {
    this.hub.disconnect(this.id);
  }
}

/** A valid 30-card deck: 3 copies of each of the first 10 base cards. */
export function deck(): CardId[] {
  return CARDS.filter((c) => !c.fusionOnly)
    .slice(0, 10)
    .flatMap((c) => [c.id, c.id, c.id]);
}

export function setup() {
  const clock = new FakeClock();
  const clients = new Map<string, TestClient>();
  let codes = 0;
  let seeds = 0;
  let connections = 0;
  const hub = new Hub(
    {
      send: (connId, message) => clients.get(connId)?.messages.push(structuredClone(message)),
      close: (connId) => {
        const client = clients.get(connId);
        if (client) client.closed = true;
        hub.disconnect(connId);
      },
    },
    { clock, newCode: () => `ROOM${++codes}`, newSeed: () => ++seeds },
  );

  /** Opens a connection without saying hello. */
  function open(token = `token-anon${connections}-`.padEnd(20, "x")): TestClient {
    const client = new TestClient(`conn${++connections}`, token, hub);
    clients.set(client.id, client);
    hub.connect(client.id);
    return client;
  }

  /** Opens a connection and says hello. Reusing a token is a reconnect. */
  function connect(nickname: string, token = `token-${nickname}-`.padEnd(20, "x")): TestClient {
    const client = open(token);
    client.send({ type: "hello", token, nickname });
    return client;
  }

  /** Two players in one room (ROOM1 for the first call), both ready, match started. */
  function startMatch(minutes: 5 | 10 | 15 = 5) {
    const alice = connect("alice");
    const bob = connect("bob");
    alice.send({ type: "room.create", visibility: "public", minutes });
    const code = alice.last("room.state").room.code;
    bob.send({ type: "room.join", code });
    alice.send({ type: "room.ready", deck: deck() });
    bob.send({ type: "room.ready", deck: deck() });
    const view = alice.last("match.view").view;
    const [onTurn, waiting] = view.active === view.you ? [alice, bob] : [bob, alice];
    return { alice, bob, code, onTurn, waiting };
  }

  return { hub, clock, open, connect, startMatch };
}
```

`apps/server/test/rooms.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { deck, setup } from "./harness";

describe("hello", () => {
  it("welcomes a new player", () => {
    const { connect } = setup();
    const alice = connect("alice");
    expect(alice.messages).toEqual([{ type: "welcome", nickname: "alice", roomCode: null }]);
  });

  it("requires hello before anything else", () => {
    const { open, hub } = setup();
    const stranger = open();
    stranger.send({ type: "room.create", visibility: "public", minutes: 5 });
    expect(stranger.messages).toEqual([{ type: "error", code: "not-hello", message: "send hello first" }]);
    expect(hub.roomCount()).toBe(0);
  });

  it("rejects a second hello on the same connection", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "hello", token: alice.token, nickname: "again" });
    expect(alice.last("error")).toEqual({ type: "error", code: "bad-message", message: "hello was already sent" });
  });

  it("answers a malformed message with bad-message and changes nothing", () => {
    const { connect, hub } = setup();
    const alice = connect("alice");
    alice.sendRaw("{not json");
    alice.sendRaw(JSON.stringify({ type: "room.create", visibility: "public", minutes: 7 }));
    expect(alice.all("error").map((e) => e.code)).toEqual(["bad-message", "bad-message"]);
    expect(hub.roomCount()).toBe(0);
  });
});

describe("lobby", () => {
  it("lists public waiting rooms on subscribe and on every change", () => {
    const { connect } = setup();
    const watcher = connect("watcher");
    watcher.send({ type: "lobby.subscribe" });
    expect(watcher.last("lobby.rooms").rooms).toEqual([]);

    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 10 });
    expect(watcher.last("lobby.rooms").rooms).toEqual([{ code: "ROOM1", host: "alice", minutes: 10 }]);

    const bob = connect("bob");
    bob.send({ type: "room.join", code: "ROOM1" });
    expect(watcher.last("lobby.rooms").rooms).toEqual([]);
  });

  it("never lists private rooms", () => {
    const { connect } = setup();
    const watcher = connect("watcher");
    watcher.send({ type: "lobby.subscribe" });
    connect("alice").send({ type: "room.create", visibility: "private", minutes: 5 });
    expect(watcher.last("lobby.rooms").rooms).toEqual([]);
  });

  it("stops sending after unsubscribe", () => {
    const { connect } = setup();
    const watcher = connect("watcher");
    watcher.send({ type: "lobby.subscribe" });
    watcher.send({ type: "lobby.unsubscribe" });
    watcher.clear();
    connect("alice").send({ type: "room.create", visibility: "public", minutes: 5 });
    expect(watcher.all("lobby.rooms")).toEqual([]);
  });
});

describe("creating and joining", () => {
  it("puts the creator alone in a waiting room", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "private", minutes: 15 });
    expect(alice.last("room.state").room).toEqual({
      code: "ROOM1",
      visibility: "private",
      minutes: 15,
      status: "waiting",
      seats: [{ nickname: "alice", connected: true, ready: false, wantsRematch: false }, null],
      you: 0,
    });
  });

  it("joins by code, ignoring case, and moves to ready-check", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "private", minutes: 5 });
    const bob = connect("bob");
    bob.send({ type: "room.join", code: "room1" });
    const room = bob.last("room.state").room;
    expect(room.status).toBe("ready-check");
    expect(room.you).toBe(1);
    expect(room.seats.map((s) => s?.nickname)).toEqual(["alice", "bob"]);
    expect(alice.last("room.state").room.status).toBe("ready-check");
  });

  it("rejects an unknown code", () => {
    const { connect } = setup();
    const bob = connect("bob");
    bob.send({ type: "room.join", code: "NOPE" });
    expect(bob.last("error")).toEqual({ type: "error", code: "room-not-found", message: "no room NOPE" });
  });

  it("rejects a third player", () => {
    const { connect } = setup();
    connect("alice").send({ type: "room.create", visibility: "public", minutes: 5 });
    connect("bob").send({ type: "room.join", code: "ROOM1" });
    const carol = connect("carol");
    carol.send({ type: "room.join", code: "ROOM1" });
    expect(carol.last("error")).toEqual({ type: "error", code: "room-full", message: "this room is full" });
  });

  it("rejects creating or joining a second room", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    connect("bob").send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.join", code: "ROOM2" });
    expect(alice.all("error").map((e) => e.code)).toEqual(["already-in-room", "already-in-room"]);
  });

  it("rejects room commands from a player who is in no room", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.ready", deck: deck() });
    alice.send({ type: "match.action", action: { type: "END_TURN" } });
    expect(alice.all("error").map((e) => e.code)).toEqual(["not-in-room", "not-in-room"]);
  });
});

describe("leaving", () => {
  it("deletes a room when its last player leaves", () => {
    const { connect, hub } = setup();
    const watcher = connect("watcher");
    watcher.send({ type: "lobby.subscribe" });
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.leave" });
    expect(hub.roomCount()).toBe(0);
    expect(watcher.last("lobby.rooms").rooms).toEqual([]);
  });

  it("returns a ready-check room to waiting and back into the lobby", () => {
    const { connect } = setup();
    const watcher = connect("watcher");
    watcher.send({ type: "lobby.subscribe" });
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    const bob = connect("bob");
    bob.send({ type: "room.join", code: "ROOM1" });
    alice.send({ type: "room.leave" });
    const room = bob.last("room.state").room;
    expect(room.status).toBe("waiting");
    expect(room.seats[0]).toBeNull();
    expect(watcher.last("lobby.rooms").rooms).toEqual([{ code: "ROOM1", host: "bob", minutes: 5 }]);
  });

  it("lets a player who left create a new room", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.leave" });
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    expect(alice.last("room.state").room.code).toBe("ROOM2");
    expect(alice.all("error")).toEqual([]);
  });
});

describe("ready check", () => {
  it("rejects an invalid deck with the engine's reason", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.ready", deck: deck().slice(1) });
    expect(alice.last("error")).toEqual({
      type: "error",
      code: "invalid-deck",
      message: "deck must have exactly 30 cards, got 29",
    });
  });

  it("lets the creator get ready while waiting, and unready again", () => {
    const { connect } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.send({ type: "room.ready", deck: deck() });
    expect(alice.last("room.state").room.seats[0]?.ready).toBe(true);
    alice.send({ type: "room.unready" });
    expect(alice.last("room.state").room.seats[0]?.ready).toBe(false);
  });

  it("starts the match when both are ready, and closes the room to the lobby", () => {
    const { startMatch } = setup();
    const { alice, bob } = startMatch();
    expect(alice.last("room.state").room.status).toBe("playing");
    expect(bob.last("room.state").room.status).toBe("playing");
    expect(alice.last("match.view").view.you).toBe(0);
    expect(bob.last("match.view").view.you).toBe(1);
  });

  it("rejects ready once the match is running", () => {
    const { startMatch } = setup();
    const { alice } = startMatch();
    alice.send({ type: "room.ready", deck: deck() });
    expect(alice.last("error").code).toBe("wrong-status");
  });
});
```

`apps/server/test/match.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { getCard, type AttackAction, type GameEvent, type PlayAction } from "@duel/engine";
import { IDLE_MS } from "../src/room";
import { setup } from "./harness";

describe("running a match", () => {
  it("sends each player a view without the opponent's hand", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const mine = onTurn.last("match.view");
    expect(mine.view.self.hand).toHaveLength(5);
    expect(mine.clocks).toEqual({ remainingMs: [300_000, 300_000], running: mine.view.active });
    const theirs = waiting.last("match.view");
    expect(theirs.view.opponent.handCount).toBe(5);
    expect(JSON.stringify(theirs)).not.toContain(JSON.stringify(mine.view.self.hand));
  });

  it("applies a legal action and sends the events to both players", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 2, position: "defense" } });
    const forWaiting = waiting.last("match.view");
    expect(forWaiting.events.at(-1)).toMatchObject({ type: "played", slot: 2, position: "defense" });
    expect(forWaiting.view.opponent.field[2]).not.toBeNull();
    expect(onTurn.last("match.view").view.self.hand).toHaveLength(4);
  });

  it("rejects an action out of turn and an illegal action, changing nothing", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const before = onTurn.all("match.view").length;
    waiting.send({ type: "match.action", action: { type: "END_TURN" } });
    expect(waiting.last("error")).toEqual({ type: "error", code: "illegal-action", message: "not your turn" });
    onTurn.send({ type: "match.action", action: { type: "ATTACK", attackerSlot: 0, target: "direct" } });
    expect(onTurn.last("error")).toEqual({
      type: "error",
      code: "illegal-action",
      message: "the first player cannot attack on the first turn",
    });
    expect(onTurn.all("match.view")).toHaveLength(before);
  });

  it("previews a play with the engine's values, only to the asking player", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const card = onTurn.last("match.view").view.self.hand[0]!;
    const action: PlayAction = { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" };
    onTurn.send({ type: "match.preview", action });
    const reply = onTurn.last("match.preview");
    expect(reply.action).toEqual(action);
    if (reply.preview.kind !== "play") throw new Error(`expected a play preview, got ${JSON.stringify(reply.preview)}`);
    // alone on the field, with equal life points, a creature has its printed values
    expect(reply.preview.field[0]).toMatchObject({ hidden: false, cardId: card, position: "attack", atk: getCard(card).atk });
    expect(waiting.all("match.preview")).toEqual([]);
    onTurn.send({ type: "match.preview", action: { ...action, handIndexes: [4, 4] } });
    expect(onTurn.last("match.preview").preview).toEqual({ kind: "error", error: "duplicate hand index" });
  });

  it("previews an attack with the engine's outcome, which the attack then follows", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const attack: AttackAction = { type: "ATTACK", attackerSlot: 0, target: 0 };
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" } });
    onTurn.send({ type: "match.preview", action: attack });
    expect(onTurn.last("match.preview").preview).toEqual({
      kind: "error",
      error: "the first player cannot attack on the first turn",
    });
    onTurn.send({ type: "match.action", action: { type: "END_TURN" } });
    waiting.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" } });
    waiting.send({ type: "match.preview", action: attack });
    const reply = waiting.last("match.preview");
    if (reply.preview.kind !== "attack") throw new Error(`expected an attack preview, got ${JSON.stringify(reply.preview)}`);
    const { outcome } = reply.preview;
    const you = waiting.last("match.view").view.you;
    waiting.send({ type: "match.action", action: attack });
    const damage = (events: GameEvent[], player: number) =>
      events.reduce((sum, e) => sum + (e.type === "damage" && e.player === player ? e.amount : 0), 0);
    const events = waiting.last("match.view").events;
    expect(damage(events, you === 0 ? 1 : 0)).toBe(outcome.damageToOpponent);
    expect(damage(events, you)).toBe(outcome.damageToSelf);
    expect(events.some((e) => e.type === "destroyed" && e.player !== you)).toBe(outcome.targetDestroyed);
  });

  it("ends the match on surrender and offers a rematch", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    waiting.send({ type: "match.action", action: { type: "SURRENDER" } });
    expect(onTurn.last("match.view").view.result?.reason).toBe("surrender");
    expect(onTurn.last("room.state").room.status).toBe("finished");
    expect(onTurn.last("match.view").clocks.running).toBeNull();
  });

  it("treats leaving a running match as surrender", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    onTurn.send({ type: "room.leave" });
    const end = waiting.last("match.view").view;
    expect(end.result).toEqual({ winner: end.you, reason: "surrender" });
    const room = waiting.last("room.state").room;
    expect(room.status).toBe("finished");
    expect(room.seats.filter((s) => s !== null)).toHaveLength(1);
  });
});

describe("a whole match", () => {
  it("can be played to the end through the hub", () => {
    const { startMatch } = setup();
    const { alice, bob } = startMatch(15);
    const players = [alice, bob];
    for (let step = 0; step < 300; step++) {
      const view = alice.last("match.view").view;
      if (view.result) break;
      const me = players[view.active]!;
      const mine = me.last("match.view").view;
      const slot = mine.self.field.findIndex((c) => c === null);
      me.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: slot === -1 ? 0 : slot, position: "attack" } });
      for (let attacker = 0; attacker < 5; attacker++) {
        const now = me.last("match.view").view;
        if (now.result) break;
        const target = now.opponent.field.findIndex((c) => c !== null);
        me.send({ type: "match.action", action: { type: "ATTACK", attackerSlot: attacker, target: target === -1 ? "direct" : target } });
      }
      if (!me.last("match.view").view.result) me.send({ type: "match.action", action: { type: "END_TURN" } });
    }
    const end = alice.last("match.view").view;
    expect(end.result).not.toBeNull();
    expect(["life-points", "deck-out"]).toContain(end.result!.reason);
    expect(bob.last("match.view").view.result).toEqual(end.result);
    const codes = new Set([...alice.all("error"), ...bob.all("error")].map((e) => e.code));
    expect([...codes].every((c) => c === "illegal-action")).toBe(true);
  });
});

describe("chess clock", () => {
  it("charges only the active player and switches on END_TURN", () => {
    const { startMatch, clock } = setup();
    const { onTurn, waiting } = startMatch(5);
    const me = onTurn.last("match.view").view.you;
    clock.advance(20_000);
    onTurn.send({ type: "match.action", action: { type: "END_TURN" } });
    const clocks = waiting.last("match.view").clocks;
    expect(clocks.remainingMs[me]).toBe(280_000);
    expect(clocks.remainingMs[me === 0 ? 1 : 0]).toBe(300_000);
    expect(clocks.running).toBe(me === 0 ? 1 : 0);
  });

  it("does not charge time for actions that keep the turn", () => {
    const { startMatch, clock } = setup();
    const { onTurn } = startMatch(5);
    clock.advance(10_000);
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" } });
    const { clocks, view } = onTurn.last("match.view");
    expect(clocks.remainingMs[view.you]).toBe(290_000);
  });

  it("flags the active player when their bank runs out", () => {
    const { startMatch, clock } = setup();
    const { onTurn, waiting } = startMatch(5);
    clock.advance(300_000);
    const end = waiting.last("match.view");
    expect(end.view.result).toEqual({ winner: end.view.you, reason: "timeout" });
    expect(end.clocks.remainingMs[onTurn.last("match.view").view.you]).toBe(0);
    expect(waiting.last("room.state").room.status).toBe("finished");
  });

  it("carries remaining time across turns", () => {
    const { startMatch, clock } = setup();
    const { onTurn, waiting } = startMatch(5);
    clock.advance(200_000);
    onTurn.send({ type: "match.action", action: { type: "END_TURN" } });
    clock.advance(1_000);
    waiting.send({ type: "match.action", action: { type: "END_TURN" } });
    clock.advance(99_999);
    expect(onTurn.last("match.view").view.result).toBeNull();
    clock.advance(1);
    expect(onTurn.last("match.view").view.result?.reason).toBe("timeout");
  });
});

describe("after the match", () => {
  it("starts a new match when both ask for a rematch", () => {
    const { startMatch } = setup();
    const { alice, bob } = startMatch();
    alice.send({ type: "match.action", action: { type: "SURRENDER" } });
    alice.send({ type: "room.rematch" });
    expect(bob.last("room.state").room.seats[0]?.wantsRematch).toBe(true);
    bob.send({ type: "room.rematch" });
    expect(alice.last("room.state").room.status).toBe("playing");
    const view = alice.last("match.view").view;
    expect(view.result).toBeNull();
    expect(view.turn).toBe(1);
  });

  it("rejects a rematch while the match is running", () => {
    const { startMatch } = setup();
    const { alice } = startMatch();
    alice.send({ type: "room.rematch" });
    expect(alice.last("error").code).toBe("wrong-status");
  });

  it("closes a finished room after 10 idle minutes", () => {
    const { startMatch, clock, hub } = setup();
    const { alice, bob } = startMatch();
    alice.send({ type: "match.action", action: { type: "SURRENDER" } });
    clock.advance(IDLE_MS);
    expect(hub.roomCount()).toBe(0);
    expect(bob.last("room.closed")).toEqual({ type: "room.closed", code: "ROOM1", reason: "idle" });
    bob.send({ type: "room.create", visibility: "public", minutes: 5 });
    expect(bob.last("room.state").room.code).toBe("ROOM2");
  });
});

describe("face-down play through the server (R6)", () => {
  it("shows the opponent only the position, in the view and in the events", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const card = onTurn.last("match.view").view.self.hand[0]!;
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 1, position: "defense", faceDown: true } });
    const theirs = waiting.last("match.view");
    expect(theirs.view.opponent.field[1]).toEqual({ hidden: true, position: "defense" });
    expect(theirs.events).toEqual([
      { type: "played", player: onTurn.last("match.view").view.you, slot: 1, cardId: null, position: "defense", faceDown: true, handCards: 1 },
    ]);
    const mine = onTurn.last("match.view");
    expect(mine.view.self.field[1]).toMatchObject({ cardId: card, faceDown: true });
    expect(mine.events.at(-1)).toMatchObject({ type: "played", cardId: card, faceDown: true });
  });

  it("refuses to preview an attack on a hidden creature", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 1, position: "defense", faceDown: true } });
    onTurn.send({ type: "match.action", action: { type: "END_TURN" } });
    waiting.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 0, position: "attack" } });
    waiting.send({ type: "match.preview", action: { type: "ATTACK", attackerSlot: 0, target: 1 } });
    expect(waiting.last("match.preview").preview).toEqual({ kind: "error", error: "the target is face-down" });
  });

  it("reveals on REVEAL, for both players", () => {
    const { startMatch } = setup();
    const { onTurn, waiting } = startMatch();
    const card = onTurn.last("match.view").view.self.hand[0]!;
    onTurn.send({ type: "match.action", action: { type: "PLAY", handIndexes: [0], slot: 1, position: "defense", faceDown: true } });
    onTurn.send({ type: "match.action", action: { type: "REVEAL", slot: 1 } });
    const theirs = waiting.last("match.view");
    expect(theirs.view.opponent.field[1]).toMatchObject({ hidden: false, cardId: card, faceDown: false });
    expect(theirs.events).toEqual([{ type: "revealed", player: onTurn.last("match.view").view.you, slot: 1, cardId: card }]);
  });
});
```

`apps/server/test/reconnect.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ABANDON_MS } from "../src/room";
import { setup } from "./harness";

describe("disconnect and reconnect", () => {
  it("tells the opponent when a player drops", () => {
    const { startMatch } = setup();
    const { alice, bob } = startMatch();
    alice.disconnect();
    expect(bob.last("room.state").room.seats[0]?.connected).toBe(false);
  });

  it("welcomes a returning player with their room, and re-sends the match on join", () => {
    const { startMatch, connect } = setup();
    const { alice, code } = startMatch();
    const before = alice.last("match.view").view;
    alice.disconnect();
    const again = connect("alice", alice.token);
    expect(again.last("welcome")).toEqual({ type: "welcome", nickname: "alice", roomCode: code });
    again.clear();
    again.send({ type: "room.join", code });
    expect(again.last("room.state").room.seats[0]?.connected).toBe(true);
    expect(again.last("match.view").view).toEqual(before);
  });

  it("keeps the clock running while the player on turn is away", () => {
    const { startMatch, clock, connect } = setup();
    const { onTurn, waiting, code } = startMatch(5);
    onTurn.disconnect();
    clock.advance(300_000);
    expect(waiting.last("match.view").view.result?.reason).toBe("timeout");
    const back = connect("returning", onTurn.token);
    back.send({ type: "room.join", code });
    expect(back.last("match.view").view.result?.reason).toBe("timeout");
  });

  it("closes the old connection when the same token connects again", () => {
    const { connect } = setup();
    const first = connect("alice");
    first.send({ type: "room.create", visibility: "public", minutes: 5 });
    const second = connect("alice", first.token);
    expect(first.closed).toBe(true);
    expect(second.last("welcome").roomCode).toBe("ROOM1");
    first.clear();
    second.send({ type: "room.join", code: "ROOM1" });
    expect(first.messages).toEqual([]);
    expect(second.last("room.state").room.seats[0]?.connected).toBe(true);
  });

  it("deletes a waiting room 60 s after its creator drops", () => {
    const { connect, clock, hub } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.disconnect();
    clock.advance(ABANDON_MS - 1);
    expect(hub.roomCount()).toBe(1);
    clock.advance(1);
    expect(hub.roomCount()).toBe(0);
    const back = connect("alice", alice.token);
    expect(back.last("welcome").roomCode).toBeNull();
  });

  it("keeps the waiting room if the creator returns in time", () => {
    const { connect, clock, hub } = setup();
    const alice = connect("alice");
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    alice.disconnect();
    clock.advance(ABANDON_MS / 2);
    connect("alice", alice.token);
    clock.advance(ABANDON_MS);
    expect(hub.roomCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/server/test/rooms.test.ts apps/server/test/match.test.ts apps/server/test/reconnect.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/hub` (imported by the harness) and `../src/room`.

- [ ] **Step 3: Write the implementation**

`Room` owns one room; `Hub` owns everything else and gives each room a `RoomHost` so the room never touches connections directly. Read the class comments: "Mutates" and timer rules from DDR-0002 and DDR-0007 apply.


`apps/server/src/room.ts`

```ts
import {
  actionError,
  applyAction,
  applyTimeout,
  createMatch,
  eventsFor,
  previewAttack,
  validateDeck,
  viewAfterPlay,
  viewFor,
  type Action,
  type CardId,
  type GameEvent,
  type MatchState,
  type PlayerId,
} from "@duel/engine";
import type {
  Clocks,
  ErrorCode,
  Minutes,
  Preview,
  PreviewAction,
  RoomClosedReason,
  RoomInfo,
  RoomStatus,
  RoomSummary,
  ServerMessage,
  Visibility,
} from "@duel/protocol";
import { chargeTurn, msUntilFlag, remainingAt, startBanks, type Banks } from "./banks";
import type { Clock, TimerHandle } from "./clock";

export const ABANDON_MS = 60_000;
export const IDLE_MS = 10 * 60_000;

export type RoomError = { code: ErrorCode; message: string };

/** What a room needs from the hub that owns it. */
export type RoomHost = {
  clock: Clock;
  newSeed(): number;
  /** Delivers to the player's current connection; dropped if they are offline. */
  sendTo(token: string, message: ServerMessage): void;
  isConnected(token: string): boolean;
  /** The room's lobby entry may have changed. */
  changed(room: Room): void;
  /** The room is gone; the hub forgets it and tells anyone still seated. */
  closed(room: Room, reason: RoomClosedReason | "empty"): void;
};

type Seat = { token: string; nickname: string; deck: CardId[] | null; ready: boolean; wantsRematch: boolean };

/**
 * One match room: two seats, a lifecycle, a match and its clocks. Rules come
 * only from the engine; this class decides who may do what and when.
 */
export class Room {
  status: RoomStatus = "waiting";
  private seats: [Seat | null, Seat | null] = [null, null];
  private match: MatchState | null = null;
  private banks: Banks | null = null;
  private flagTimer: TimerHandle | null = null;
  private abandonTimer: TimerHandle | null = null;
  private idleTimer: TimerHandle | null = null;

  constructor(
    readonly code: string,
    readonly visibility: Visibility,
    readonly minutes: Minutes,
    private readonly host: RoomHost,
  ) {}

  seatOf(token: string): PlayerId | null {
    if (this.seats[0]?.token === token) return 0;
    if (this.seats[1]?.token === token) return 1;
    return null;
  }

  isEmpty(): boolean {
    return !this.seats[0] && !this.seats[1];
  }

  tokens(): string[] {
    return this.seats.filter((s): s is Seat => s !== null).map((s) => s.token);
  }

  /** The lobby entry, or null if this room should not be listed. */
  summary(): RoomSummary | null {
    if (this.visibility !== "public" || this.status !== "waiting") return null;
    const host = this.seats[0] ?? this.seats[1];
    return host ? { code: this.code, host: host.nickname, minutes: this.minutes } : null;
  }

  /** Seats a new player, or re-sends everything to a player who is already seated. */
  join(token: string, nickname: string): RoomError | null {
    if (this.seatOf(token) !== null) {
      this.connectionChanged(token);
      return null;
    }
    if (this.status !== "waiting") return { code: "room-full", message: "this room is full" };
    const free: PlayerId = this.seats[0] ? 1 : 0;
    this.seats[free] = { token, nickname, deck: null, ready: false, wantsRematch: false };
    if (this.seats[0] && this.seats[1]) {
      this.status = "ready-check";
      this.cancel("abandonTimer");
    }
    this.broadcastState();
    this.host.changed(this);
    return null;
  }

  leave(token: string): void {
    const seat = this.seatOf(token);
    if (seat === null) return;
    if (this.status === "playing" && this.match) {
      const result = applyAction(this.match, seat, { type: "SURRENDER" });
      if (result.ok) this.afterAction(seat, this.match.active, result.state, result.events);
    }
    this.seats[seat] = null;
    if (this.isEmpty()) {
      this.dispose();
      this.host.closed(this, "empty");
      return;
    }
    if (this.status === "ready-check") this.status = "waiting";
    for (const s of this.seats) if (s) s.wantsRematch = false;
    this.broadcastState();
    this.host.changed(this);
    this.checkAbandoned();
  }

  ready(token: string, deck: CardId[]): RoomError | null {
    const seat = this.seatOf(token);
    if (seat === null) return { code: "not-in-room", message: "you are not in this room" };
    if (this.status !== "waiting" && this.status !== "ready-check") {
      return { code: "wrong-status", message: "decks can only be chosen before the match" };
    }
    const check = validateDeck(deck);
    if (!check.ok) return { code: "invalid-deck", message: check.error };
    const s = this.seats[seat]!;
    s.deck = [...deck];
    s.ready = true;
    this.broadcastState();
    this.maybeStart();
    return null;
  }

  unready(token: string): RoomError | null {
    const seat = this.seatOf(token);
    if (seat === null) return { code: "not-in-room", message: "you are not in this room" };
    if (this.status !== "waiting" && this.status !== "ready-check") {
      return { code: "wrong-status", message: "the match has already started" };
    }
    this.seats[seat]!.ready = false;
    this.broadcastState();
    return null;
  }

  rematch(token: string): RoomError | null {
    const seat = this.seatOf(token);
    if (seat === null) return { code: "not-in-room", message: "you are not in this room" };
    if (this.status !== "finished" || !this.seats[0] || !this.seats[1]) {
      return { code: "wrong-status", message: "a rematch needs a finished match and both players" };
    }
    this.seats[seat]!.wantsRematch = true;
    if (this.seats[0].wantsRematch && this.seats[1].wantsRematch) this.startMatch();
    else this.broadcastState();
    return null;
  }

  act(token: string, action: Action): RoomError | null {
    const seat = this.seatOf(token);
    if (seat === null) return { code: "not-in-room", message: "you are not in this room" };
    if (this.status !== "playing" || !this.match) return { code: "wrong-status", message: "no match is running" };
    if (this.flagIfOutOfTime()) return { code: "illegal-action", message: "match is over" };
    const active = this.match.active;
    const result = applyAction(this.match, seat, action);
    if (!result.ok) return { code: "illegal-action", message: result.error };
    this.afterAction(seat, active, result.state, result.events);
    return null;
  }

  /** Answers only the asking player, from their own view, so a preview never reveals more than the view does. */
  preview(token: string, action: PreviewAction): RoomError | null {
    const seat = this.seatOf(token);
    if (seat === null) return { code: "not-in-room", message: "you are not in this room" };
    if (this.status !== "playing" || !this.match) return { code: "wrong-status", message: "no match is running" };
    this.host.sendTo(token, { type: "match.preview", action, preview: this.previewFor(seat, action) });
    return null;
  }

  /** A seated player connected or disconnected: tell both and manage abandonment. */
  connectionChanged(token: string): void {
    if (this.seatOf(token) === null) return;
    this.checkAbandoned();
    this.sendEverythingTo(token);
    for (const other of this.tokens()) if (other !== token) this.sendStateTo(other);
  }

  /** Cancels every timer. Called when the room is being deleted. */
  dispose(): void {
    this.cancel("flagTimer");
    this.cancel("abandonTimer");
    this.cancel("idleTimer");
  }

  // --- internals ---

  /** The engine's preview of a legal action (DDR-0010); the reason, if it is illegal or cannot be previewed. */
  private previewFor(seat: PlayerId, action: PreviewAction): Preview {
    const error = actionError(this.match!, seat, action);
    if (error) return { kind: "error", error };
    const view = viewFor(this.match!, seat);
    if (action.type === "PLAY") {
      const after = viewAfterPlay(view, action);
      return "error" in after ? { kind: "error", error: after.error } : { kind: "play", field: after.self.field };
    }
    const outcome = previewAttack(view, action);
    return "error" in outcome ? { kind: "error", error: outcome.error } : { kind: "attack", outcome };
  }

  private afterAction(_seat: PlayerId, activeBefore: PlayerId, state: MatchState, events: GameEvent[]): void {
    const now = this.host.clock.now();
    this.match = state;
    if (state.result) {
      this.banks = chargeTurn(this.banks!, activeBefore, now);
      this.finish();
    } else if (state.active !== activeBefore) {
      this.banks = chargeTurn(this.banks!, activeBefore, now);
      this.scheduleFlag();
    }
    this.broadcastMatch(events);
    if (state.result) this.broadcastState();
  }

  private maybeStart(): void {
    if (this.status !== "ready-check") return;
    if (this.seats[0]?.ready && this.seats[1]?.ready) this.startMatch();
  }

  private startMatch(): void {
    const [a, b] = this.seats;
    this.cancel("idleTimer");
    this.match = createMatch(a!.deck!, b!.deck!, this.host.newSeed());
    this.banks = startBanks(this.minutes, this.host.clock.now());
    this.status = "playing";
    for (const s of this.seats) if (s) s.wantsRematch = false;
    this.scheduleFlag();
    this.broadcastState();
    this.broadcastMatch([]);
    this.host.changed(this);
  }

  private finish(): void {
    this.status = "finished";
    this.cancel("flagTimer");
    this.idleTimer = this.host.clock.setTimer(IDLE_MS, () => {
      this.dispose();
      this.host.closed(this, "idle");
    });
  }

  private scheduleFlag(): void {
    this.cancel("flagTimer");
    const ms = msUntilFlag(this.banks!, this.match!.active, this.host.clock.now());
    this.flagTimer = this.host.clock.setTimer(ms, () => this.flagIfOutOfTime());
  }

  /** Ends the match on time if the active player's bank is empty. Returns true if it did. */
  private flagIfOutOfTime(): boolean {
    if (this.status !== "playing" || !this.match || this.match.result) return false;
    const now = this.host.clock.now();
    if (msUntilFlag(this.banks!, this.match.active, now) > 0) return false;
    const active = this.match.active;
    const { state, events } = applyTimeout(this.match, active);
    this.afterAction(active, active, state, events);
    return true;
  }

  /** A waiting room whose only player is offline is deleted after ABANDON_MS. */
  private checkAbandoned(): void {
    const abandoned = this.status === "waiting" && this.tokens().every((t) => !this.host.isConnected(t));
    if (!abandoned) {
      this.cancel("abandonTimer");
      return;
    }
    if (this.abandonTimer) return;
    this.abandonTimer = this.host.clock.setTimer(ABANDON_MS, () => {
      this.dispose();
      this.host.closed(this, "abandoned");
    });
  }

  private cancel(timer: "flagTimer" | "abandonTimer" | "idleTimer"): void {
    this[timer]?.cancel();
    this[timer] = null;
  }

  private info(you: PlayerId): RoomInfo {
    const seat = (s: Seat | null) =>
      s && { nickname: s.nickname, connected: this.host.isConnected(s.token), ready: s.ready, wantsRematch: s.wantsRematch };
    return {
      code: this.code,
      visibility: this.visibility,
      minutes: this.minutes,
      status: this.status,
      seats: [seat(this.seats[0]), seat(this.seats[1])],
      you,
    };
  }

  private clocks(): Clocks {
    const running = this.status === "playing" && this.match && !this.match.result ? this.match.active : null;
    const remainingMs =
      running === null ? ([...this.banks!.remainingMs] as [number, number]) : remainingAt(this.banks!, running, this.host.clock.now());
    return { remainingMs, running };
  }

  private sendStateTo(token: string): void {
    this.host.sendTo(token, { type: "room.state", room: this.info(this.seatOf(token)!) });
  }

  private sendEverythingTo(token: string): void {
    this.sendStateTo(token);
    if (this.match) {
      const seat = this.seatOf(token)!;
      this.host.sendTo(token, { type: "match.view", view: viewFor(this.match, seat), events: [], clocks: this.clocks() });
    }
  }

  private broadcastState(): void {
    for (const token of this.tokens()) this.sendStateTo(token);
  }

  /** Each player gets their own view and only the events they may see (DDR-0003). */
  private broadcastMatch(events: GameEvent[]): void {
    const clocks = this.clocks();
    for (const token of this.tokens()) {
      const seat = this.seatOf(token)!;
      this.host.sendTo(token, {
        type: "match.view",
        view: viewFor(this.match!, seat),
        events: eventsFor(events, seat),
        clocks,
      });
    }
  }
}
```

`apps/server/src/hub.ts`

```ts
import { parseClientMessage, type ClientMessage, type RoomSummary, type ServerMessage } from "@duel/protocol";
import type { Clock } from "./clock";
import { Room, type RoomError, type RoomHost } from "./room";

/** How the hub talks to the transport. Connection ids are opaque strings. */
export type Outbound = {
  send(connId: string, message: ServerMessage): void;
  close(connId: string): void;
};

export type HubDeps = {
  clock: Clock;
  /** a new room code; the hub retries if it is already taken */
  newCode(): string;
  /** a new match seed */
  newSeed(): number;
};

type Connection = { token: string | null; lobby: boolean };
type Player = { nickname: string; connId: string | null; roomCode: string | null };

/**
 * Everything the server knows: connections, players, rooms and the lobby.
 * It has no network code, so tests drive it with plain strings.
 */
export class Hub {
  private readonly connections = new Map<string, Connection>();
  private readonly players = new Map<string, Player>();
  private readonly rooms = new Map<string, Room>();
  private readonly roomHost: RoomHost;

  constructor(
    private readonly out: Outbound,
    private readonly deps: HubDeps,
  ) {
    this.roomHost = {
      clock: deps.clock,
      newSeed: () => deps.newSeed(),
      sendTo: (token, message) => this.sendToPlayer(token, message),
      isConnected: (token) => this.players.get(token)?.connId != null,
      changed: () => this.broadcastLobby(),
      closed: (room, reason) => this.roomClosed(room, reason),
    };
  }

  connect(connId: string): void {
    this.connections.set(connId, { token: null, lobby: false });
  }

  disconnect(connId: string): void {
    const conn = this.connections.get(connId);
    this.connections.delete(connId);
    if (!conn?.token) return;
    const player = this.players.get(conn.token);
    if (!player || player.connId !== connId) return;
    player.connId = null;
    this.roomOf(player)?.connectionChanged(conn.token);
  }

  receive(connId: string, raw: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.error(connId, { code: "bad-message", message: parsed.error });
    const message = parsed.message;
    if (message.type === "hello") return this.hello(connId, conn, message.token, message.nickname);
    if (!conn.token) return this.error(connId, { code: "not-hello", message: "send hello first" });
    const error = this.handle(connId, conn, conn.token, message);
    if (error) this.error(connId, error);
  }

  /** For tests and logging. */
  roomCount(): number {
    return this.rooms.size;
  }

  private hello(connId: string, conn: Connection, token: string, nickname: string): void {
    if (conn.token) return this.error(connId, { code: "bad-message", message: "hello was already sent" });
    conn.token = token;
    const existing = this.players.get(token);
    if (existing?.connId && existing.connId !== connId) {
      // the newest connection wins; the old one is closed and forgotten
      this.connections.delete(existing.connId);
      this.out.close(existing.connId);
    }
    const player: Player = existing ?? { nickname, connId, roomCode: null };
    player.nickname = nickname;
    player.connId = connId;
    this.players.set(token, player);
    this.out.send(connId, { type: "welcome", nickname, roomCode: player.roomCode });
    this.roomOf(player)?.connectionChanged(token);
  }

  private handle(connId: string, conn: Connection, token: string, message: Exclude<ClientMessage, { type: "hello" }>): RoomError | null {
    const player = this.players.get(token)!;
    switch (message.type) {
      case "lobby.subscribe":
        conn.lobby = true;
        this.out.send(connId, { type: "lobby.rooms", rooms: this.lobbyRooms() });
        return null;
      case "lobby.unsubscribe":
        conn.lobby = false;
        return null;
      case "room.create": {
        if (player.roomCode) return { code: "already-in-room", message: "leave your current room first" };
        let code = this.deps.newCode();
        while (this.rooms.has(code)) code = this.deps.newCode();
        const room = new Room(code, message.visibility, message.minutes, this.roomHost);
        this.rooms.set(code, room);
        player.roomCode = code;
        return room.join(token, player.nickname);
      }
      case "room.join": {
        const code = message.code.toUpperCase();
        const room = this.rooms.get(code);
        if (!room) return { code: "room-not-found", message: `no room ${code}` };
        if (player.roomCode && player.roomCode !== code) {
          return { code: "already-in-room", message: "leave your current room first" };
        }
        const error = room.join(token, player.nickname);
        if (!error) player.roomCode = code;
        return error;
      }
    }
    const room = this.roomOf(player);
    if (!room) return { code: "not-in-room", message: "you are not in a room" };
    switch (message.type) {
      case "room.leave":
        player.roomCode = null;
        room.leave(token);
        return null;
      case "room.ready":
        return room.ready(token, message.deck);
      case "room.unready":
        return room.unready(token);
      case "room.rematch":
        return room.rematch(token);
      case "match.action":
        return room.act(token, message.action);
      case "match.preview":
        return room.preview(token, message.action);
    }
  }

  private roomOf(player: Player): Room | undefined {
    return player.roomCode ? this.rooms.get(player.roomCode) : undefined;
  }

  private roomClosed(room: Room, reason: "abandoned" | "idle" | "empty"): void {
    this.rooms.delete(room.code);
    for (const token of room.tokens()) {
      const player = this.players.get(token);
      if (player?.roomCode === room.code) player.roomCode = null;
      if (reason !== "empty") this.sendToPlayer(token, { type: "room.closed", code: room.code, reason });
    }
    this.broadcastLobby();
  }

  private lobbyRooms(): RoomSummary[] {
    return [...this.rooms.values()].map((r) => r.summary()).filter((s): s is RoomSummary => s !== null);
  }

  private broadcastLobby(): void {
    const rooms = this.lobbyRooms();
    for (const [connId, conn] of this.connections) {
      if (conn.lobby) this.out.send(connId, { type: "lobby.rooms", rooms });
    }
  }

  private sendToPlayer(token: string, message: ServerMessage): void {
    const connId = this.players.get(token)?.connId;
    if (connId) this.out.send(connId, message);
  }

  private error(connId: string, error: RoomError): void {
    this.out.send(connId, { type: "error", ...error });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/server/test/rooms.test.ts apps/server/test/match.test.ts apps/server/test/reconnect.test.ts`
Expected: PASS, 44 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 6: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the room lifecycle, lobby, engine-judged matches, chess clock, reconnect, rematch and room cleanup (plan 2, task 3, #19).
```

```bash
git add apps/server/src/room.ts apps/server/src/hub.ts apps/server/test/harness.ts apps/server/test/rooms.test.ts apps/server/test/match.test.ts apps/server/test/reconnect.test.ts HISTORY.md
git commit -m "feat(server): rooms, lobby, matches, clocks and reconnect

Closes #19"
```

### Task 4: WebSocket transport and entry point

**Files:**
- Create: `apps/server/src/wsServer.ts`
- Create: `apps/server/src/main.ts`
- Test: `apps/server/test/ws.test.ts`

**Interfaces:**
- Consumes: `Hub`, `HubDeps` (task 3), `systemClock` (task 2), `deck()` from the test harness, the protocol types.
- Produces: `startServer(options: { port: number; deps?: Partial<HubDeps> }): Promise<RunningServer>` with `RunningServer = { port: number; close(): Promise<void> }` (port 0 picks a free port), `randomRoomCode(length = 6): string`, `defaultDeps: HubDeps`; the commands `pnpm --filter @duel/server dev` and `start`; the root `pnpm dev`.

- [ ] **Step 0: Install ws**

Run: `pnpm --filter @duel/server add ws && pnpm --filter @duel/server add -D @types/ws`
Expected: `ws` 8.x under `dependencies` and `@types/ws` under `devDependencies` in `apps/server/package.json`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/ws.test.ts`

```ts
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@duel/protocol";
import { randomRoomCode, startServer, type RunningServer } from "../src/wsServer";
import { deck } from "./harness";

/** A real WebSocket client that records every message it receives. */
class SocketClient {
  readonly messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static open(port: number): Promise<SocketClient> {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    return new Promise((resolve, reject) => {
      socket.once("open", () => resolve(new SocketClient(socket)));
      socket.once("error", reject);
    });
  }

  send(message: ClientMessage | string): void {
    this.socket.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  /** Resolves with the first message received from now on that matches. */
  async next<T extends ServerMessage["type"]>(
    type: T,
    match: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const start = this.messages.length;
    for (;;) {
      const found = this.messages
        .slice(start)
        .find((m): m is Extract<ServerMessage, { type: T }> => m.type === type && match(m as never));
      if (found) return found;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 2000);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}

let server: RunningServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("WebSocket server", () => {
  it("plays two real clients through create, lobby, join, ready and surrender", async () => {
    server = await startServer({ port: 0, deps: { newCode: () => "ABC234" } });
    const alice = await SocketClient.open(server.port);
    const bob = await SocketClient.open(server.port);

    const welcome = alice.next("welcome");
    alice.send({ type: "hello", token: "a".repeat(32), nickname: "alice" });
    expect(await welcome).toEqual({ type: "welcome", nickname: "alice", roomCode: null });
    const bobWelcome = bob.next("welcome");
    bob.send({ type: "hello", token: "b".repeat(32), nickname: "bob" });
    await bobWelcome;

    const emptyLobby = bob.next("lobby.rooms");
    bob.send({ type: "lobby.subscribe" });
    expect((await emptyLobby).rooms).toEqual([]);

    const listed = bob.next("lobby.rooms", (m) => m.rooms.length === 1);
    alice.send({ type: "room.create", visibility: "public", minutes: 5 });
    expect((await listed).rooms).toEqual([{ code: "ABC234", host: "alice", minutes: 5 }]);

    const readyCheck = alice.next("room.state", (m) => m.room.status === "ready-check");
    bob.send({ type: "room.join", code: "abc234" });
    await readyCheck;

    const aliceView = alice.next("match.view");
    const bobView = bob.next("match.view");
    alice.send({ type: "room.ready", deck: deck() });
    bob.send({ type: "room.ready", deck: deck() });
    const [a, b] = await Promise.all([aliceView, bobView]);
    expect(a.view.you).toBe(0);
    expect(b.view.you).toBe(1);
    expect(a.view.active).toBe(b.view.active);

    const ended = alice.next("match.view", (m) => m.view.result !== null);
    bob.send({ type: "match.action", action: { type: "SURRENDER" } });
    expect((await ended).view.result).toEqual({ winner: 0, reason: "surrender" });

    alice.close();
    bob.close();
  });

  it("answers garbage with an error instead of crashing", async () => {
    server = await startServer({ port: 0 });
    const client = await SocketClient.open(server.port);
    const error = client.next("error");
    client.send("{oops");
    expect(await error).toEqual({ type: "error", code: "bad-message", message: "not valid JSON" });
    client.close();
  });
});

describe("randomRoomCode", () => {
  it("makes 6 unambiguous characters", () => {
    for (let i = 0; i < 100; i++) expect(randomRoomCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/server/test/ws.test.ts`
Expected: FAIL. Vitest cannot resolve `../src/wsServer`.

- [ ] **Step 3: Write the implementation**

`apps/server/src/wsServer.ts`

```ts
import { randomBytes, randomInt } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { systemClock } from "./clock";
import { Hub, type HubDeps } from "./hub";

/** No ambiguous characters (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export const defaultDeps: HubDeps = {
  clock: systemClock,
  newCode: () => randomRoomCode(),
  newSeed: () => randomInt(2 ** 31),
};

export type RunningServer = { port: number; close(): Promise<void> };

/**
 * Serves the hub over WebSocket at ws://host:port/ws. Port 0 picks a free port.
 * This file is the only place that knows about sockets.
 */
export function startServer(options: { port: number; deps?: Partial<HubDeps> }): Promise<RunningServer> {
  const sockets = new Map<string, WebSocket>();
  let nextId = 0;

  const hub = new Hub(
    {
      send(connId, message) {
        const socket = sockets.get(connId);
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      },
      close(connId) {
        sockets.get(connId)?.close(4000, "replaced by a newer connection");
      },
    },
    { ...defaultDeps, ...options.deps },
  );

  const wss = new WebSocketServer({ port: options.port, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (socket) => {
    const connId = `c${++nextId}`;
    sockets.set(connId, socket);
    hub.connect(connId);
    socket.on("message", (data, isBinary) => {
      if (!isBinary) hub.receive(connId, data.toString());
    });
    socket.on("close", () => {
      sockets.delete(connId);
      hub.disconnect(connId);
    });
  });

  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      resolve({
        port: (wss.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
```

`apps/server/src/main.ts`

```ts
import { startServer } from "./wsServer";

const port = Number(process.env.PORT ?? 8787);
const server = await startServer({ port });
console.log(`duel server listening on ws://localhost:${server.port}/ws`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/server/test/ws.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the dev script and start the server**

In the root `package.json` `scripts`, add:

```json
    "dev": "pnpm --filter @duel/server run dev",
```

Run: `pnpm dev`
Expected: `duel server listening on ws://localhost:8787/ws`. Stop it with Ctrl+C. (Plan 3 changes this script to start the client too.)

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every test passes and `tsc` prints nothing.

- [ ] **Step 7: Record and commit**

Append under today's date in `HISTORY.md`:

```markdown
- **[code]** Added the ws transport, the server entry point and a two-client WebSocket test (plan 2, task 4, #20).
```

```bash
git add package.json pnpm-lock.yaml apps/server/package.json apps/server/src/wsServer.ts apps/server/src/main.ts apps/server/test/ws.test.ts HISTORY.md
git commit -m "feat(server): WebSocket transport and entry point

Closes #20"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 6 Protocol | 1 |
| Face-down spec section 5: per-player views and events, `REVEAL`, face-down `PLAY` | 1, 3 |
| DDR-0010: previews and the attack forecast come from the engine | 1, 3 |
| 7.1 Identity | 3 |
| 7.2 Lobby | 3 |
| 7.3 Rooms (lifecycle, visibility, time control, full room, cleanup) | 3 |
| 7.4 Clock | 2, 3 |
| 7.5 Reconnect | 3 |
| 7.6 Errors | 1, 3 |
| 9 Server tests (two real WebSocket clients, fake time) | 3, 4 |
| 8 Client | plan 3 |

## Revisions

### 2026-11-13

- Written as a revision of `docs/plans/2026-11-12-protocol-and-server.md` after tactics phases 0 to 5, at the owner's request. Issues #17 to #20 (milestone "Plan 2") are its tasks 1 to 4.
