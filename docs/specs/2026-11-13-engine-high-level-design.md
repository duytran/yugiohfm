# Rules engine: high-level design

> **Date:** 2026-11-13 · **Status:** describes the code as implemented in plan 1
> (`packages/engine`). Companion to the approved design
> `2026-11-12-online-card-duel-design.md`; if they disagree, the code and this
> file are newer. Binding rules: DDR-0001, DDR-0002, DDR-0003, DDR-0006.

## 1. What the engine is

A pure rules library. It is a state machine over plain data: give it a
`MatchState`, a player and an `Action`, and it gives back either a new state plus
the events that happened, or an error string. It has no clock, no randomness
other than a seeded generator, no I/O and no dependencies.

```
                +-----------------------------------------+
                |              @duel/engine               |
                |   (pure functions over plain data)      |
                +-----------------------------------------+
                   ^            ^              ^
                   | calls      | calls        | calls
            +------+---+  +-----+-----+  +-----+------+
            |   bots   |  |  server   |  |   client   |
            | (done)   |  | (plan 2)  |  | (plan 3)   |
            +----------+  +-----------+  +------------+
            plays whole   judges real    previews plays,
            matches       matches, owns  draws a PlayerView
            headlessly    clock+network
```

Because the engine knows nothing about its callers, the same code judges an
online match, drives a bot simulation and powers a UI preview.

## 2. Module map

Everything the outside world may use is exported from `src/index.ts`. Modules
that mutate a draft (`startTurn`, `endMatch`, `resolvePlay`, `resolveAttack`)
are deliberately **not** exported (DDR-0001).

```
 index.ts  (public API)
    |
    +-- types.ts   data shapes only: Card, MatchState, Action, GameEvent, PlayerView
    +-- rules.ts   constants (DECK_SIZE 30, HAND_SIZE 5, FIELD_SLOTS 5, LP 4000,
    |              ELEMENT_BONUS 500), beats(), opponent(), turnError()
    +-- rng.ts     createRng(seed) [mulberry32], shuffle()
    +-- cards.ts   CARDS (60-card pool), FUSION_RULES, getCard/findCard
    +-- deck.ts    validateDeck()
    +-- fusion.ts  fusePair(), fuseChain()
    +-- match.ts   createMatch(), startTurn(), endMatch()      [internal helpers]
    +-- play.ts    playError(), previewPlay(), resolvePlay()   [resolve = internal]
    +-- battle.ts  attackError(), battleValues(), resolveAttack()[resolve = internal]
    +-- actions.ts actionError(), applyAction(), applyTimeout()
    +-- legal.ts   legalActions()
    +-- view.ts    viewFor()
```

Dependency direction (arrows = "imports"), no cycles:

```
 types, rules, rng  <--  cards  <--  deck, fusion
                           ^            ^
                           |            |
              match <------+----- play --+
                ^            battle
                |              ^
                +------ actions ------> legal
                          view
```

## 3. The core idea: validate, clone, mutate the clone

Every change to a match goes through one function, `applyAction`. It never
touches the state you pass in (DDR-0002).

```
 applyAction(state, player, action)
        |
        v
 +----------------+   error string   +-------------------------+
 | actionError()  |----------------->| { ok:false, error }     |
 | (pure check)   |                  | state untouched         |
 +-------+--------+                  +-------------------------+
         | null (legal)
         v
 +----------------+
 | structuredClone|  draft = copy of state
 +-------+--------+
         v
 +----------------+   switch on action.type
 | resolve*       |   PLAY -> resolvePlay    ATTACK -> resolveAttack
 | mutates draft  |   SET_POSITION, END_TURN, SURRENDER handled inline
 | pushes events  |
 +-------+--------+
         v
 { ok:true, state: draft, events: GameEvent[] }
```

Consequences: a rejected action cannot corrupt a live match; a match is fully
reproducible from `(deckA, deckB, seed, action list)`; the checker
(`actionError`) is the single source of truth that `legalActions` also uses.

## 4. Match lifecycle

```
 createMatch(deckA, deckB, seed)
   validateDeck x2 (throws if invalid)
   rng = createRng(seed); shuffle A; shuffle B; first = rng.int(2)
   turn = 1, active = first, LP 4000 each
   startTurn()  -> draw up to 5
        |
        v
 +------------------- one turn (active player) -------------------+
 |  PLAY (at most once)      SET_POSITION (once per creature)     |
 |  ATTACK (once per creature, not on turn 1)                     |
 |  actions may come in any order, until...                       |
 |  END_TURN --> active = other, turn += 1, startTurn()           |
 +-----------------------------------------------------------------+
        |
        v   (any time)
 result = { winner, reason }   reason: life-points | deck-out
                                       | surrender | timeout
```

`startTurn` clears the per-turn flags (`hasPlayed`, each creature's
`hasAttacked` and `positionChanged`), then refills the hand to 5. If the deck
cannot supply the cards, the player who must draw loses (`deck-out`).

### State shape (what is stored)

```
 MatchState
 +-- players[0], players[1]  : PlayerState
 |     +-- deck   CardId[]      (index 0 = top)
 |     +-- hand   CardId[]
 |     +-- field  (Creature|null)[5]   Creature = { cardId, position,
 |     |                                  hasAttacked, positionChanged }
 |     +-- lifePoints
 +-- active, firstPlayer, turn, hasPlayed
 +-- result : { winner, reason } | null
```

Cards are stored by id only; stats come from the static card table, so state
stays small and `structuredClone` stays cheap.

## 5. The five actions

| Action | Effect | Main limits |
|---|---|---|
| `PLAY {handIndexes, slot, position}` | fuse chosen hand cards (plus the creature already in the slot) and put the result in the slot | once per turn; at least 1 card; no duplicate/invalid index |
| `SET_POSITION {slot, position}` | flip attack / defense | creature exists, has not attacked, not already changed this turn, actually changes |
| `ATTACK {attackerSlot, target}` | battle a slot, or `"direct"` | not on turn 1; attacker in attack position, not yet attacked; direct only if enemy field is empty |
| `END_TURN` | pass; opponent becomes active and draws | active player only |
| `SURRENDER` | opponent wins | either player, any time the match is live |

### 5.1 Fusion (in `PLAY`)

Materials are ordered: the creature already in the slot (if any) first, then the
chosen hand cards in the order given. They are folded left to right.

```
 materials: [ m0, m1, m2 ]

 step 1: fusePair(m0, m1) -> r1
 step 2: fusePair(r1, m2) -> r2        r2 is what lands on the field

 fusePair(a, b):
   candidates = results of FUSION_RULES whose tag pair (a.tag, b.tag) matches
                (either order) AND whose ATK > max(a.atk, b.atk)
   success -> lowest-ATK candidate (ties broken by id)      event: fused
   failure -> b stands, a is lost                           event: fusion-failed
```

A creature fused onto an existing one keeps `hasAttacked`, so fusing cannot give
a second attack in the same turn. `previewPlay` runs the same fold without
changing anything; the client uses it for the "fusion preview" and shares the
exact code with the server.

### 5.2 Battle (in `ATTACK`)

Element ring (each beats the next): flame -> forest -> wind -> earth -> thunder
-> water -> flame. The winner of the matchup gets +500.

```
 attack  = attacker.atk + (attacker beats target  ? 500 : 0)
 defense = (target in attack pos ? target.atk : target.def)
           + (target beats attacker ? 500 : 0)

 target in ATTACK position            target in DEFENSE position
 -------------------------            --------------------------
 attack > defense:                    attack > defense:
   target destroyed                     target destroyed (no damage)
   target's owner takes the diff      attack < defense:
 attack < defense:                      attacker's owner takes the diff
   attacker destroyed                 equal: nothing happens
   attacker's owner takes the diff
 equal: both destroyed, no damage

 direct attack: target's owner takes attacker's raw ATK (no element bonus)
```

Damage sets `lifePoints = max(0, lp - amount)` and ends the match at 0
(`life-points`). Everything that happens is appended to the `events` list.

## 6. Events: how callers learn what happened

`applyAction` returns the new state **and** an ordered `GameEvent[]`
(`drew`, `fused`, `fusion-failed`, `played`, `position-set`, `attacked`,
`destroyed`, `damage`, `turn-ended`, `match-ended`). The state says where we are;
events say how we got there. The client uses them for the log and animation,
and the bot runner for replays and statistics. The engine itself never reads
events back.

## 7. Hidden information: `viewFor`

The server holds the full `MatchState`. Each player only ever receives a
`PlayerView` (DDR-0003).

```
            full MatchState (server only)
   +-------------------------------------------+
   | p0: deck[..] hand[..] field lp            |
   | p1: deck[..] hand[..] field lp            |
   +-------------------------------------------+
         | viewFor(state, 0)        | viewFor(state, 1)
         v                          v
 +------------------------+  +------------------------+
 | self.hand   (cards)    |  | self.hand   (cards)    |
 | self.deckCount (number)|  | self.deckCount (number)|
 | opponent.handCount     |  | opponent.handCount     |
 | opponent.deckCount     |  | opponent.deckCount     |
 | both fields, both LP   |  | both fields, both LP   |
 +------------------------+  +------------------------+
```

Fields are public; hands are private; deck order is private to everyone. The
view is a `structuredClone`, so it shares no references with the state.

## 8. `legalActions` and bots

`legalActions(state, player)` generates every candidate action broadly (all
ordered subsets of the hand x 5 slots x 2 positions, all position flips, all
attacks, `END_TURN`) and **filters through `actionError`**. It therefore cannot
disagree with `applyAction`. It leaves out `SURRENDER` and returns `[]` for the
non-active player or a finished match.

```
 bot loop (packages/bots, DDR-0006)

   state --viewFor--> PlayerView --> bot.choose(view, legal, rng) --> Action
     ^                                                                 |
     +------------------------- applyAction <--------------------------+
```

The simulator `runMatch` repeats this until `state.result` is set. Bots see
only a `PlayerView` and use the public API, exactly like a remote client.

## 9. What the engine deliberately does not do

- **No clock.** The server owns the chess clock (DDR-0007). When a clock hits
  zero the server calls `applyTimeout(state, player)`, which ends the match with
  reason `timeout`. An already finished match is returned unchanged.
- **No identities, rooms or networking.** `PlayerId` is just `0 | 1`.
- **No hidden-information filtering of events.** Events carry card ids (for
  example `fused`, `played`), so the server must decide what each player may see
  before sending them; `viewFor` only covers the state. See open question 1.

## 10. Open questions worth discussing

1. **Event privacy.** `drew` carries only a count, but `fusion-failed` and
   `fused` expose the hand cards used. Those cards leave the hand when played,
   so they become public on the field. Is this fine, or should some events be
   redacted per player in plan 2?
2. **Draw-up-to-5 rule.** Cards leaving the hand refill next turn, not
   immediately. This favours fusing many cards in one `PLAY`. Is that the
   balance we want? The `pnpm sim` stats can answer this.
3. **Surrender by the non-active player.** Allowed by the code. Intended?
4. **Action list growth.** `legalActions` enumerates ordered hand subsets
   (up to 325 for a 5-card hand) x 10; fine now, but would need pruning if the
   hand size or richer actions grow.

## Revisions

### 2026-11-13: after tactics phase 0

Changed by `docs/plans/2026-11-13-tactics-phase-0-measurement.md`. No duel rule
changed. The sections above describe the engine before these changes.

- **Rules per match.** `MatchState.rules` and `PlayerView.rules` hold a `Rules`
  object (`{ elementBonus }`). `createMatch(deckA, deckB, seed, rules?)` takes
  overrides; `DEFAULT_RULES` and `makeRules` replace the `ELEMENT_BONUS`
  constant.
- **Views have their own creature type.** `PlayerView` fields hold
  `ViewCreature` (`hidden: false`, the creature's flags, and `atk` and `def`).
  The values come from `effectiveStats` in the new `values.ts`, the one place a
  creature's current value is worked out (DDR-0010). They equal the printed
  values until wear and synergy exist.
- **One battle outcome.** `battleOutcome` in `battle.ts` returns the whole
  result of an attack. `resolveAttack` applies it, direct attacks included, and
  the new public `previewAttack(view, action)` returns it from a view.
  `battleValues` is no longer public.
- **`fusePair` remembers its results** in a module-level map. It is a pure
  function of two card ids over constant data, so this does not affect
  determinism (DDR-0002).

### 2026-11-13: after tactics phase 1

R1 and R2 (see the tactics spec). The sections above describe the earlier engine.

- `Creature` and `ViewCreature` no longer have `positionChanged`.
  `SET_POSITION` is limited only by `hasAttacked`.
- `playError` rejects a `PLAY` onto a creature that already attacked unless it
  names that creature's position.
- `MatchState.hasPlayed` is now `playsUsed` (a count). A `PLAY` is legal while
  `playsUsed < rules.playsPerTurn`; `Rules` gained `playsPerTurn` (default 2).
- `runMatch` stops after `maxActions` (default 10,000) as well as `maxTurns`.

### 2026-11-13: after tactics phase 2

R3 (see the tactics spec). The sections above describe the earlier engine.

- `Creature` and `ViewCreature` have `wear`, which `effectiveStats` subtracts
  (never below 0). Turn start clears wear on both sides.
- `resolveAttack` applies the wear a surviving target takes, emits a public
  `worn` event and returns its `BattleOutcome`.
- New `preview.ts`: `stateFromView` rebuilds a `MatchState` from a
  `PlayerView`; `previewAttack` and `previewAttacks` (a series, with wear,
  losses and damage carried between attacks) run `resolveAttack` on it.
  `previewAttack` moved out of `battle.ts`.
- `Rules` gained `wearRatio` (0 to 1, default 1) and `firstTurnPlays` (1 to
  `playsPerTurn`, default `playsPerTurn`); `playsAllowed(state)` reads them.
- The smart bot plans gang-ups of up to 3 attacks on one target.

### 2026-11-13: after tactics phase 3

R4 (see the tactics spec). The sections above describe the earlier engine.

- `Card.traits` (`Trait`: venom, guard, pierce), printed in `cards.ts`;
  `hasTrait(cardId, trait)` reads them. `Creature`, views and events do not
  change: a creature's traits are those of its card.
- `Combatant` gained `traits`. Venom and Pierce are decided in `battleOutcome`,
  so `resolveAttack` and every preview share them. Guard is a check in
  `attackError`, so `legalActions` follows.
- `packages/bots`: `traitDeck(traits)` and the `answers` deck.

### 2026-11-13: after tactics phase 4

R5 (see the tactics spec). The sections above describe the earlier engine.

- `TRAITS` has six entries: venom, guard, pierce, banner, pack, rally. `Rules`
  gained `bannerBonus` (300), `packBonus` (200) and `rallyBonus` (500).
- `effectiveStats` now reads the whole own field (neighbours, other creatures)
  and both life totals, and adds Banner, Pack and Rally before wear. Its
  signature is unchanged. `sharesTheme(a, b)` (a shared tag or the element,
  counted once) is in `values.ts` and is not exported from the package.
- `preview.ts` gained `viewAfterPlay(view, action)`: the viewer's view after a
  play, worked out by `playError` and `resolvePlay` on a state rebuilt from the
  view, with the counts the viewer cannot rebuild kept from the input view.
- `packages/bots`: the smart bot ranks plays by the total current ATK of its
  field after the play (from `viewAfterPlay`) and previews each (result card,
  slot, position) once; `tagDeck` and the `synergy` deck.
