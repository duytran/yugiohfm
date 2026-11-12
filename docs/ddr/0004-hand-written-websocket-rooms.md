# DDR-0004: Rooms, lobby and sync are hand-written on `ws`, with no multiplayer framework

> **Status:** Accepted · **Last updated:** 2026-11-12
> The server is plain Node + `ws` with our own room manager, lobby broadcast and JSON protocol validated by zod.

## Context

The headline feature is chess-style match rooms: create a room, list public rooms in a lobby, join by invite link, play live. The project is also a learning project, and the owner chose to understand how rooms and synchronisation work rather than adopt a framework's model.

## Decision

We write the room lifecycle (`waiting` → `ready-check` → `playing` → `finished`), the lobby list, reconnection and message handling ourselves on top of the `ws` library. Messages are JSON `{ type, ...payload }`, with schemas in `packages/protocol` shared by server and client.

## Rationale

**Decided on:** learning value, fit with a per-player-view model and a chess clock, small dependency surface.

- **Rejected: Colyseus** — gives rooms, lobby and reconnect quickly, but teaches the framework rather than the mechanism, and hiding the opponent's hand must go through its state-filtering API.
- **Rejected: boardgame.io** — fastest to a playable match, but the chess clock and a custom lobby fight the framework, and it is lightly maintained.
- **Rejected: Socket.IO** — its rooms and fallbacks are not needed; plain WebSocket is enough for two players per room.

## Constraints & Rules

- **Always** define a message's shape once, as a zod schema in `packages/protocol`, and derive the TypeScript type from it.
- **Always** validate every incoming message on the server before acting on it.
- **Always** reply to a rejected message with an `error { code, message }`; leave all state unchanged.
- **Never** add a multiplayer or game-server framework without changing this DDR first.
- **Never** put rule logic in room code; rooms call the engine ([DDR-0001](0001-engine-independent-of-gui-and-network.md)).

## Implementation

No code exists yet. Plan 2 (`docs/plans/2026-11-12-protocol-and-server.md`): schemas in `packages/protocol/src/client.ts`, the network-free `Hub` in `apps/server/src/hub.ts`, the room lifecycle in `apps/server/src/room.ts`, and the only socket code in `apps/server/src/wsServer.ts`.

## Consequences

- **Positive:** every moving part is understood and testable with two in-process WebSocket clients.
- **Negative / trade-off:** reconnection, cleanup timers and lobby broadcasts are ours to get right — **mitigated by** server integration tests listed in spec section 9.
- **Known gap:** not implemented yet; planned in plan 2.

## Compliance

Review check: `apps/server/package.json` lists no framework beyond `ws` and `zod`. Server integration tests cover create, join, lobby updates, reconnect and cleanup.

## Revisit when

The server must run on more than one process or machine (rooms then need shared state or sticky routing), or matchmaking with ratings is added.

## Related

- [DDR-0003](0003-authoritative-server-per-player-views.md), [DDR-0005](0005-guest-identity-in-memory-state.md), [DDR-0007](0007-server-owned-chess-clock.md).
