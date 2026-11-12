# DDR-0002: Match state is immutable to callers and all randomness is seeded

> **Status:** Accepted · **Last updated:** 2026-11-12
> `applyAction` returns a new state and never changes its input; every random choice comes from `createRng(seed)`.

## Context

Bot simulations must be reproducible so a strange match can be replayed and debugged. The server keeps the current state of many matches and must never have one corrupted by a rejected action. Tests need exact, repeatable outcomes.

## Decision

We treat `MatchState` as immutable outside the engine: `applyAction(state, player, action)` clones, mutates the clone, and returns `{ ok, state, events }` or `{ ok: false, error }`. Shuffling and first-player choice use a seeded generator, so a seed plus an action list fully determines a match.

## Rationale

**Decided on:** reproducibility, safety of the server's stored state, simplicity of the code.

- **Rejected: mutate the state in place** — a half-applied illegal action could corrupt a live match, and tests could leak state into each other.
- **Rejected: an immutability library (Immer)** — states are small, so `structuredClone` per action is fast enough and adds no dependency.
- **Rejected: `Math.random`** — matches could not be replayed, so simulation findings could not be investigated.

## Constraints & Rules

- **Always** validate with the `*Error` function first, then `structuredClone` the state, then mutate only the clone.
- **Always** document an internal helper that mutates with "Mutates `draft`".
- **Always** take randomness from an `Rng` created by `createRng(seed)`; bots receive their `Rng` as a parameter.
- **Never** change a `MatchState`, `PlayerView` or card object received as an argument.
- **Never** call `Math.random` in `packages/engine` or `packages/bots`.
- **Never** return an object from `viewFor` that shares references with the state.

## Implementation

No code exists yet. See plan 1, task 8 (`applyAction` in `packages/engine/src/actions.ts`) and task 1 (`packages/engine/src/rng.ts`).

## Consequences

- **Positive:** any match can be replayed from `(seed, actions)`; rejected actions are free of side effects; tests are deterministic.
- **Negative / trade-off:** one deep clone per action — **mitigated by** small states; unmitigated otherwise and accepted.
- **Known gap:** nothing is implemented yet.

## Compliance

Tests: "never changes the state it was given" (`actions.test.ts`), "replaying the same seed gives the same actions and the same final state" (`property.test.ts`), and the independence test's ban on `Math.random`.

## Revisit when

Profiling shows cloning dominates simulation time, or a search-based bot needs millions of state copies per second.

## Related

- [DDR-0001](0001-engine-independent-of-gui-and-network.md) — the engine this applies to.
