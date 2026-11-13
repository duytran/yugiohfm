# DDR-0009: Duel rules reward combination over raw stats, and are accepted by simulation

> **Status:** Accepted · **Last updated:** 2026-11-13
> The rules must let cards that help each other beat the biggest number, and let a losing player earn a comeback. A rule or value is accepted only when the simulator meets the targets.

## Context

Under the plan 1 rules the whole game was "fuse the biggest creature, then win": battle is a plain ATK comparison, fusion only goes up, the hand refills for free and small creatures have no answer. Greedy versus greedy ended in 9.5 turns with one plan dominating. The owner wants the opposite feel: highly volatile matches decided by calculation.

## Decision

The duel rules follow `docs/specs/2026-11-13-tactics-rules-design.md`, approved by the owner on 2026-11-13: free position changes (R1), two plays per turn (R2), wear from ganging up (R3), answer traits (R4), synergy traits and slot adjacency (R5), and face-down play for deception (R6, own spec). The direction is fixed; the numbers (`PLAYS_PER_TURN`, `FIRST_TURN_PLAYS`, `WEAR_RATIO`, `ELEMENT_BONUS`, trait bonuses) are settings chosen by simulator runs against the targets in section 6 of that spec.

## Rationale

**Decided on:** combination beats raw power; comebacks are possible and earned; every strong move has a visible answer that costs something; small, measurable engine changes.

- **Rejected: spell, equip and trap cards as the answer to big creatures** — a new card type is out of scope for version one; traits put the answer on a body that can itself be attacked.
- **Rejected: draw a fixed number instead of refilling to 5** — it would make fusion cost cards, but refilling is the comeback engine.
- **Rejected: an automatic bonus for the player who is behind** — a comeback must be earned; Rally is the deck-building version.
- **Rejected: fusion inheriting traits from its materials** — the owner keeps fusion's principle that the tag pair picks the result card and the result card decides.
- **Rejected: unlimited plays per turn as the default** — with a free refill it removes the hand decision; kept only as an experiment setting.
- **Rejected: tuning by feel** — the engine is deterministic and has bots, so numbers decide.

## Constraints & Rules

- **Always** keep these pillars: draw up to 5 every turn; the first player cannot attack on turn 1; the full card pool for everyone.
- **Always** put answers and synergy on creatures; the game stays creatures only.
- **Always** give a creature exactly the traits printed on its own card; a fusion result inherits nothing.
- **Always** work out synergy, element and wear values at the moment they are needed; never store a bonus on a creature. Order: base value, plus synergy, minus wear, never below 0, which is the current value a view shows; a battle adds the element bonus on top of it (owner, 2026-11-13), so every battle is "shown value + bonus".
- **Always** make a new rule value a setting the simulator can vary, and judge it against the targets before accepting it.
- **Never** add randomness after the shuffle (DDR-0002); swings come from interactions a player can calculate.
- **Never** add a bonus that a player gets automatically for being behind.
- **Never** give face-down play any advantage beyond deception: a face-down creature gives and receives no Banner or Pack bonus.
- **Never** grow or reshape the card pool to fit a theme before the current 40 base cards have been tested in the simulator (owner, 2026-11-13).

## Implementation

R1 (free position changes), R2 (`playsPerTurn`), R3 (wear, `wearRatio`, plus `firstTurnPlays`) R4 (Venom, Guard, Pierce, printed in `cards.ts`, decided in `battle.ts`) R5 (Banner, Pack, Rally, worked out in `values.ts`) and R6 (face-down play; `events.ts`, `view.ts`) are implemented in `packages/engine/src/actions.ts`, `play.ts`, `rules.ts`, `battle.ts`, `values.ts`, `match.ts`, `cards.ts` and `preview.ts`. All of R1 to R6 are implemented; their plans are `docs/plans/2026-11-13-tactics-phase-2-wear.md`, `...-phase-3-answer-traits.md`, `...-phase-4-synergy.md` and `...-phase-5-face-down.md`, each task with a GitHub issue.

## Consequences

- **Positive:** tall, wide and answer strategies each beat one of the others; a themed deck can beat a pile of the highest numbers.
- **Negative / trade-off:** about half the engine files and most battle tests change, and plans 2 and 3 no longer match the engine — **mitigated by** revising plans 2 and 3 once, after the engine shape is implemented and before plan 2 starts.
- **Negative / trade-off:** more candidates for `legalActions` (two plays, face-down) slow the simulator — **mitigated by** the faster simulator in phase 0.
- **Known gap:** R1 to R6 are all implemented, and the full rule set meets 2 of the 8 targets (deck-out, and the flame deck against the strongest deck; the first-player rate is 44.0% at first-turn plays 1, just under its band); matches last 4.8 turns, tall beats wide 100%, fusions are about 90% of plays. R6 changes no number because no benchmark bot plays face-down. See the phase 5 results in the tactics spec. R5 as printed has almost no effect (flame wins 54.6% with all synergy bonuses at 0 and 55.6% with them on; the synergy deck wins 22.6% against the strongest deck) because themed decks fuse their synergy cards away; see the phase 4 results in the tactics spec. R4 as printed moved no headline measure and the answers deck loses to the strongest deck 75% to 78% (traits are lost when a card is fused); see the phase 3 results in the tactics spec. With wear 1 and 1 first-turn play the first-player rate (45.8%) and deck-out (0%) are inside their targets, but wide still wins 0%, comebacks are 2.4% to 7.8%, lead changes 0.5 to 1.3 and the fusion share about 90%; see the tactics spec, `Revisions`, 2026-11-13 phase 1 and phase 2 results. No value has been accepted by a simulator run yet. Each element or tag covers at most 21 of 30 deck cards, so a deck cannot be single-theme with today's pool.

## Compliance

Phase 0 adds the measurements: tall versus wide win rate, average turns, first-player win rate, deck-out share, fusion share, themed versus highest-ATK deck, comebacks and lead changes. A rule set that misses the targets is not accepted. Review check: no stored bonus fields on `Creature` other than `wear`.

## Revisit when

A simulator run shows the targets cannot be met with creature traits alone, or the tested pool proves unable to support themed decks.

## Related

- `docs/specs/2026-11-13-tactics-rules-design.md`, `docs/specs/2026-11-13-face-down-play-design.md`.
- [DDR-0002](0002-immutable-state-and-seeded-randomness.md), [DDR-0003](0003-authoritative-server-per-player-views.md), [DDR-0008](0008-original-game-content.md), [DDR-0010](0010-engine-determines-effective-stats.md).
