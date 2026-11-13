# DDR-0006: Bots see only a player view and act only through the engine's public API

> **Status:** Accepted · **Last updated:** 2026-11-13
> A bot is `{ name, buildDeck, chooseAction(view, legal, rng) }`; it gets the same information as a human and must return a legal action.

## Context

Bots exist to play-test and balance the rules headlessly. Their results are only meaningful if a bot plays the same game a human does. They also act as a second, independent consumer that proves the engine is usable without a GUI.

## Decision

Bots live in `packages/bots`. The match runner gives a bot `viewFor(state, player)`, the list from `legalActions`, and a seeded `Rng`; the bot returns one action, which goes through `applyAction`. Bots never receive `MatchState`.

## Rationale

**Decided on:** honest play-test results, reproducible simulations, a low bar for writing a new bot.

- **Rejected: pass the full `MatchState` to bots** — a bot could read the opponent's hand and deck order, making win rates meaningless for balance.
- **Rejected: bots propose arbitrary actions without a legal list** — every bot would re-derive legality, duplicating engine rules.
- **Rejected: bots as online opponents in rooms (version one)** — needs server integration and pacing; out of scope, and not needed for play-testing.

## Constraints & Rules

- **Always** implement a bot as one file in `packages/bots/src` exporting a `Bot`, and register it in `BOTS` in `packages/bots/src/index.ts`.
- **Always** return an element of `legal` from `chooseAction` and a deck that passes `validateDeck` from `buildDeck`.
- **Always** use the `rng` argument for randomness.
- **Never** import from `packages/engine/src/...` in a bot; use `@duel/engine`.
- **Never** give a bot the `MatchState`, and never keep hidden information between calls by other means.
- **Never** throw from `runMatch` for a bot's mistake; report an `error` outcome.

## Implementation

In `packages/bots/src`: `types.ts` (the `Bot` type), `runMatch.ts` (the runner), `decks.ts` (deck builders, and `withDeck` to give a bot another deck), `random.ts`, `greedy.ts`, `wide.ts`, `smart.ts` (the bots), `stats.ts` (summary and measures), `replay.ts`, `cli.ts` (`pnpm sim`). A bot that needs to know what an attack would do calls the engine's `previewAttack(view, action)`.

## Consequences

- **Positive:** `pnpm sim` gives balance data (win rates, first-player advantage, card usage) before any screen exists.
- **Negative / trade-off:** every legal play is enumerated (up to 3250 per turn) — **mitigated by** remembering fusion results in the engine; measured on 2026-11-13 at about 0.02 s per greedy match and 0.03 s per smart match.
- **Known gap:** bots cannot be played against online. The smart bot looks only one attack ahead.

## Compliance

`runMatch.test.ts` asserts an illegal action and an invalid deck come back as error outcomes and that a seed reproduces a match. Review check: `Bot.chooseAction` takes `PlayerView`, not `MatchState`.

## Revisit when

A search-based bot needs to simulate futures (it will need a way to sample hidden information), or bots become online practice opponents.

## Related

- [DDR-0001](0001-engine-independent-of-gui-and-network.md), [DDR-0002](0002-immutable-state-and-seeded-randomness.md).
