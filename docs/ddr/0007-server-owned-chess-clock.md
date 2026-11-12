# DDR-0007: The chess clock is owned by the server and kept out of the engine

> **Status:** Accepted · **Last updated:** 2026-11-12
> Each player has a time bank that runs only on their turn; the server measures it with an injected clock and tells the engine when a player has timed out.

## Context

Rooms use a chess-style time control (5, 10 or 15 minutes per player) chosen by the room creator. The engine must stay free of time APIs ([DDR-0001](0001-engine-independent-of-gui-and-network.md)), and clients cannot be trusted to report elapsed time.

## Decision

The server records when each turn starts, subtracts the elapsed time from the active player's bank when the turn ends, and schedules a timer for the moment the bank reaches zero. When it fires, the server calls `applyTimeout(state, player)`. Clients only render a countdown from the banks and turn-start timestamp in each `match.view`. The server's `now` and timer functions are injected.

## Rationale

**Decided on:** fairness, engine purity, testability of time-dependent behaviour.

- **Rejected: a fixed timer per turn** — simpler, but match length is unpredictable and it does not match the chess-room idea.
- **Rejected: no clock** — a player who walks away stalls the room forever.
- **Rejected: time tracked inside the engine** — breaks determinism and makes bot simulation depend on wall-clock time.
- **Rejected: clients report their own elapsed time** — forgeable.

## Constraints & Rules

- **Always** measure time on the server, through the injected clock, never `Date.now()` directly in room code.
- **Always** end a timed-out match through `applyTimeout`.
- **Always** keep a disconnected player's clock running on their turn.
- **Never** pass time or timestamps into `applyAction`.
- **Never** trust a time value sent by a client.

## Implementation

No code exists yet. `applyTimeout` is plan 1, task 8. Clock behaviour is in spec section 7.4.

## Consequences

- **Positive:** timeouts are testable with fake time; simulations have no clock at all.
- **Negative / trade-off:** network latency is charged to the player whose turn it is — **mitigated by** nothing in version one; accepted.
- **Known gap:** server clock not implemented; no increment or delay per move.

## Compliance

Plan 2 must include a server test that advances fake time past a bank and expects a `timeout` result. The engine independence test forbids time APIs in the engine.

## Revisit when

Players report losing on time because of lag (add per-move increment or lag compensation), or time controls beyond three fixed options are wanted.

## Related

- [DDR-0004](0004-hand-written-websocket-rooms.md) — the rooms that own the clocks.
