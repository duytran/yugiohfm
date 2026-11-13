# DDR-0010: The engine determines every effective stat; views carry them

> **Status:** Accepted · **Last updated:** 2026-11-13
> A creature's current ATK and DEF (printed value, synergy, wear) are worked out only in `packages/engine` and delivered inside `PlayerView`. The client, server and bots never calculate them.

## Context

With wear, Banner, Pack and Rally (DDR-0009) a creature's value on the board is no longer the number printed on its card. The board must show the current value, and bots must read it, but the client holds no rules logic (DDR-0001) and bots see only a `PlayerView` (DDR-0006).

## Decision

The engine owns one value calculation. `viewFor` puts each visible creature's effective ATK and DEF into the view. A value that depends on a pairing (the element bonus, the outcome of one attack) comes from an engine preview function. Over the network the server runs the preview on the asking player's own view and answers through `match.preview`, for plays and attacks alike (owner's decision, 2026-11-13). Owner's decision, 2026-11-13: "the engine should be the one to determine them".

## Rationale

**Decided on:** one source of truth for rules (DDR-0001); no hidden information leaking (DDR-0003); the same numbers for a human, a bot and the battle itself.

- **Rejected: the client calculates effective stats from the view** — duplicates rules outside the engine and drifts when a trait changes.
- **Rejected: the client imports and calls the engine's value function itself** — still engine code, but the client would need inputs a view may hide (a face-down neighbour), and every consumer would have to remember to call it.
- **Rejected: store effective values on `Creature` in `MatchState`** — DDR-0009 forbids stored bonuses; they go stale when a Banner is destroyed mid-turn.

## Constraints & Rules

- **Always** take a creature's current ATK or DEF from the engine: from `PlayerView`, or from an engine preview for a specific attack.
- **Always** use the same engine function for the view, for `resolveAttack` (direct attacks included) and for previews.
- **Never** work out a creature's current value or a battle result in `apps/client`, `apps/server`, `packages/protocol` or `packages/bots`. A bot may score its options with numbers the engine gave it.
- **Never** put an effective value in the view for a creature the viewer may not see (an opponent's face-down creature).
- **Never** store an effective value in `MatchState`; it is derived when read.

## Implementation

`packages/engine/src/values.ts` has `effectiveStats(state, player, slot)`, the only place a creature's current ATK and DEF are worked out. `view.ts` puts them on every `ViewCreature`. `battle.ts` builds both sides of a battle from them in `resolveAttack` (direct attacks included). `preview.ts` has the public `previewAttack(view, action)` and `previewAttacks(view, actions)`: they rebuild a `MatchState` from the view (`stateFromView`) and run `resolveAttack` itself, so a preview cannot disagree with the match. `viewAfterPlay(view, action)` gives the board after a play, by the real play code, so the smart bot ranks plays by values the engine worked out. Bots read `atk` and `def` from the view and call the previews. The server (revised plan 2, `Room.previewFor`) answers `match.preview` with `viewAfterPlay` for a play and `previewAttack` for an attack, after `actionError`, on the asking player's own view; the client (revised plan 3) shows field values from the view and words the forecast without working anything out.

## Consequences

- **Positive:** the client stays a pure display; a bot and a human read identical numbers; a rule change touches one function.
- **Negative / trade-off:** `PlayerView` grows and `viewFor` does more work per action — **mitigated by** the phase 0 simulator speed work; accepted otherwise.
- **Negative / trade-off:** an attack forecast in the client needs a round trip to the server — **mitigated by** reusing the `match.preview` pattern: the client aims an attack, the server answers with the engine's `previewAttack` outcome, and the player confirms (revised plans 2 and 3).
- **Known gap:** effective values include synergy and wear; a hidden creature carries none (a `HiddenCreature` has only its position). The server and client are planned (revised plans 2 and 3) but not implemented.

## Compliance

Review check: no element, synergy or wear arithmetic outside `packages/engine`. `view.test.ts` asserts effective values are present for visible creatures and absent for hidden ones.

## Revisit when

Attack forecasts over the network feel too slow in play, or a search bot needs thousands of value lookups per move.

## Related

- [DDR-0001](0001-engine-independent-of-gui-and-network.md), [DDR-0003](0003-authoritative-server-per-player-views.md), [DDR-0006](0006-bots-play-through-the-public-api.md), [DDR-0009](0009-tactics-combination-over-raw-stats.md).
