# DDR-0003: The server is authoritative and sends each player only their own view

> **Status:** Accepted · **Last updated:** 2026-11-13
> Clients send intended actions; the server runs the engine and replies with a per-player view that omits hidden information.

## Context

Online duels have hidden information: each hand and the order of each deck. A browser client can be inspected or modified by its user, so anything sent to it must be assumed visible and anything it sends must be assumed forgeable.

## Decision

We keep the only real `MatchState` on the server. A client message carries an action; the server applies it with `applyAction` and sends each player `viewFor(state, player)` plus the events that player may see, filtered by the engine's `eventsFor(events, player)`. The full state never leaves the server.

## Rationale

**Decided on:** resistance to cheating, a single source of truth, simple clients.

- **Rejected: clients run the engine and exchange actions (lockstep)** — both clients would hold the full state, including the opponent's hand and deck order.
- **Rejected: client is trusted to report results** — trivial to forge.
- **Rejected: send full state and hide it in the UI** — hidden cards are readable in the network tab.

## Constraints & Rules

- **Always** check an incoming action through the engine on the server before changing anything.
- **Always** build outgoing match messages from `viewFor`; send a player only their own view.
- **Never** send `MatchState`, a deck order, or the opponent's hand contents to a client.
- **Always** pass events through the engine's `eventsFor(events, player)` before sending them; never send the raw event list. What is hidden is a game rule, so the filter lives in the engine (face-down play).
- **Never** send a player the card id, element, traits or stats of an opponent's face-down creature, in a view or in an event.
- **Never** let the client decide legality, fusion results, battle outcomes or the winner; it only displays.

## Implementation

`viewFor` (`packages/engine/src/view.ts`) hides an opponent's hand, both decks and an opponent's face-down creatures (shown as `{ hidden: true, position }`). `eventsFor` (`packages/engine/src/events.ts`) filters a face-down play's card and fusion steps out of the opponent's events; a property test checks that nothing leaks over 200 random matches. The server code does not exist yet. In the revised plan 2 (`docs/plans/2026-11-13-protocol-and-server.md`, task 3) `Room.broadcastMatch` sends each player `viewFor` and `eventsFor` for their seat, `Room.sendEverythingTo` sends `viewFor` on reconnect, and previews run on the asking player's own view. The client renders only `match.view` (revised plan 3).

## Consequences

- **Positive:** modified clients cannot see hidden cards or make illegal moves.
- **Negative / trade-off:** every action costs a round trip before the board updates — **mitigated by** small messages and `match.preview` for fusion previews; no client-side prediction in version one, accepted.
- **Known gap:** the server and client are not implemented (plans 2 and 3). The engine side is done: `viewFor` and `eventsFor` exist. The revised plan 2 sends `eventsFor(events, player)` to each player and tests that a face-down play reaches the opponent with no card.

## Compliance

`view.test.ts` asserts the serialised view contains no card from the opponent's hand or either deck. `apps/server/test/match.test.ts` ("sends each player a view without the opponent's hand") checks what the server actually sends.

## Revisit when

Latency makes the board feel sluggish enough to justify client-side prediction, or spectators are added (they need a third kind of view).

## Related

- [DDR-0001](0001-engine-independent-of-gui-and-network.md) — the engine the server runs.
- [DDR-0004](0004-hand-written-websocket-rooms.md) — the transport.
