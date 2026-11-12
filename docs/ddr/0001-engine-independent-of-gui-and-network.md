# DDR-0001: The rules engine is independent of the GUI and the network

> **Status:** Accepted · **Last updated:** 2026-11-12
> All duel rules live in `packages/engine` as pure functions; it knows nothing about screens, sockets, or time.

## Context

The game needs the same rules in three places: the server (to judge online matches), the browser (to show cards and previews), and headless bots (to play-test). The owner's stated learning goal is an engine that can be driven without any GUI.

## Decision

We keep every rule in `@duel/engine`, a package with no dependencies that exposes pure functions over plain data. The server, the client and the bots are separate consumers of its public API.

## Rationale

**Decided on:** testability without a browser, the ability to run thousands of bot matches, one source of truth for rules, learning value.

- **Rejected: rules inside the server's room code** — bots and tests would need a running server and sockets; rules could not be reused in the client.
- **Rejected: rules inside React components or a client store** — the server could not judge matches, so clients could cheat, and simulation would need a browser.
- **Rejected: a game framework (boardgame.io)** — the framework owns the game loop and state shape, which hides the part the owner wants to learn and fights the chess clock.

## Constraints & Rules

- **Always** put a rule change in `packages/engine/src`, with a unit test in `packages/engine/test`.
- **Always** import the engine from other packages through `@duel/engine` (its `src/index.ts`).
- **Never** import anything except `./` files inside `packages/engine/src`.
- **Never** use `Date`, timers, `Math.random`, DOM, network or `process` APIs in the engine.
- **Never** re-implement a rule (legality, fusion result, battle outcome) in the server, client or a bot; call the engine.
- **Never** export a draft-mutating function (`startTurn`, `endMatch`, `resolvePlay`, `resolveAttack`) from the engine's index.

## Implementation

No code exists yet. The intended shape is in `docs/plans/2026-11-12-engine-and-bots.md`: the public API is task 11 (`packages/engine/src/index.ts`), and the three consumers call `createMatch`, `applyAction`, `legalActions`, `viewFor`.

## Consequences

- **Positive:** rules are testable in milliseconds; bots and replays come almost free; client and server cannot disagree about a rule.
- **Negative / trade-off:** every interaction needs an explicit action and event type, which is more ceremony than mutating state from a click handler — **mitigated by** keeping the action set small (five actions).
- **Known gap:** nothing is implemented; this DDR describes the plan.

## Compliance

`packages/engine/test/property.test.ts` ("engine independence") fails if any engine source file imports a non-`./` module or mentions a banned API.

## Revisit when

A rule genuinely needs wall-clock time or outside data inside a turn (for example timed effects), which cannot be expressed as an action the server sends.

## Related

- [DDR-0002](0002-immutable-state-and-seeded-randomness.md) — how the engine stays deterministic.
- [DDR-0006](0006-bots-play-through-the-public-api.md) — the consumer this decision was made for.
- Spec section 3 and 4: `docs/specs/2026-11-12-online-card-duel-design.md`.
