# DDR-0008: All game content is original

> **Status:** Accepted · **Last updated:** 2026-11-12
> The game borrows genre mechanics only; every card, name, creature, artwork and text is our own.

## Context

The project is inspired by a classic console card-duel game, and the owner was explicit that it is not a clone or a reverse-engineering effort. Mechanics such as fusing cards, attack and defense positions and element advantage are genre conventions; specific cards, characters and art belong to their owners.

## Decision

We design our own card pool, element ring, fusion table, numbers and visuals. Nothing is copied or extracted from an existing game.

## Rationale

**Decided on:** the owner's intent, freedom to change rules for online play, avoiding other people's intellectual property.

- **Rejected: recreating an existing game's card list and fusion table** — not the goal, and it would tie balance to a single-player design that does not suit online duels.
- **Rejected: using existing card art or names as placeholders** — placeholders tend to ship; generated element-and-tag art is enough.

## Constraints & Rules

- **Always** invent card names and stats, and keep them in `packages/engine/src/cards.ts`.
- **Always** use generated placeholder art (element colour plus tag icon) until original art exists.
- **Never** add a card name, character, artwork, sound, text or data table taken from an existing game.
- **Never** name the project, a package, or a card after an existing game or its characters.

## Implementation

No code exists yet. The original 60-card pool and 20 fusion rules are in plan 1, task 2.

## Consequences

- **Positive:** rules and cards can change freely in response to simulation results.
- **Negative / trade-off:** balance must be found from scratch — **mitigated by** the bot simulator ([DDR-0006](0006-bots-play-through-the-public-api.md)).
- **Known gap:** the working directory is still named `yugiohfm`; the root package is named `card-duel`. The game has no final title.

## Compliance

Review check on any change to `cards.ts` or to art assets.

## Revisit when

No known trigger.

## Related

- Spec section 1: `docs/specs/2026-11-12-online-card-duel-design.md`.
