# Tactics rules: design proposal

> **Date:** 2026-11-13 · **Status:** approved by the owner on 2026-11-13
> (direction and rules; the numbers are settings chosen by simulator runs).
> Binding rules: DDR-0009, DDR-0010. See `Revisions` at the bottom.
> Builds on `2026-11-12-online-card-duel-design.md` (section 4, duel rules) and
> on the engine as described in `2026-11-13-engine-high-level-design.md`.

## 1. The problem

The owner's experience of the genre, and of our own rules so far: **the whole
game is "fuse the biggest creature, then win"**. The only thing that stops a
big creature is a removal spell, and version one has no spells.

The simulator agrees. Under the current rules (2026-11-13, `pnpm sim`):

| Matchup | Games | Average turns | Longest | Ended by |
|---|---|---|---|---|
| greedy vs greedy | 60 | 9.5 | 20 | life points, 100% |
| greedy vs random | 300 | 4.8 | 13 | greedy won 100% |

- Matches are already short (about five turns each). **Speed is not the gap.**
- The greedy bot's whole plan is "make the highest-ATK creature". One fusion
  result was played 821 times in 300 matches. **One simple plan dominates.**

## 2. Why the biggest creature always wins

Four rules combine. Each one is harmless alone.

```
 (a) Higher number always wins          battle is a plain ATK comparison
 (b) Fusion only goes up                result ATK > both materials
 (c) Cards are free                     hand refills to 5 every turn, so
                                        spending 3 cards on one fusion costs
                                        nothing next turn
 (d) Small creatures have no answer     element bonus is +500; a typical gap
                                        between a fusion and a base card is
                                        1000 or more

 result:   fuse as tall as possible  -->  nothing on the board can beat it
           --> opponent must fuse taller, or lose --> one-dimensional game
```

A tactical game needs the opposite: **every strong move must have an answer
that is on the board, visible, and costs the answering player something.**

## 3. Design goals

The owner's statement of what makes the genre exciting (2026-11-13): cards that
complement one another beat raw power, and a player can snatch victory from the
brink of defeat. Goals 1 and 2 come straight from that.

1. **Combination beats raw stats.** No card is the best on its own. Strength
   comes from cards that help each other, so a deck built around a theme beats
   a pile of the highest numbers. Every player already has the full card pool,
   so power can never be bought; this goal keeps it from being *drafted* too.
2. **Comebacks are possible, and earned.** The player who is behind must have
   real lines to win, created by their own combination, not handed out by an
   automatic bonus for losing.
3. **Tall versus wide is a real choice.** One big creature and several small
   ones should each beat the other in some situations.
4. **Answers and synergy live on creatures**, not in a new card type. Version
   one stays "creatures only" (spec section 2).
5. **Everything stays public and deterministic.** No hidden information is
   added here (DDR-0003), no randomness (DDR-0002). Face-down play is a
   separate, later spec.
6. **Small engine changes, each one measurable** with the simulator before the
   next is added.
7. **Matches stay about as long as now**: 8 to 14 turns between good players.

### Pillars we keep

- **Draw up to 5 every turn.** It is the game's comeback engine: a player with
  an empty field still starts the turn with five cards. It also keeps the hand,
  the one hidden zone, full of possible surprise combinations.
- **The first player cannot attack on turn 1.**
- **Full card pool for everyone.**

## 4. Proposed rules

Listed in the order I recommend trying them. Each is independent unless noted.

### R1. Free position changes until the creature attacks

*Now:* one position change per creature per turn, none after attacking.
*Proposed:* any number of changes; none after the creature attacked.

- Removes the `positionChanged` flag from `Creature`.
- A `PLAY` onto a creature that already attacked **keeps its position** (this
  closes the hole found in review: attack, then fuse onto it in defense).
- Cost: small. Tactical gain: small, but turns become more flexible and the
  rule is simpler to explain.

### R2. Two plays per turn

*Now:* one `PLAY` per turn (`hasPlayed`).
*Proposed:* `PLAYS_PER_TURN = 2`; `hasPlayed` becomes a counter `playsUsed`.

This is what makes "wide" possible at all. With the hand still refilling to 5,
a turn becomes a real split:

```
 5 cards in hand, 2 plays:
   tall:   fuse 3  +  fuse 2      -> two strong creatures, hand empty
   mixed:  fuse 3  +  play 1      -> one big, one small, 1 card kept
   wide:   play 1  +  play 1      -> two small, 3 cards kept for next turn
```

The owner's original idea was unlimited plays. That stays in the experiment
(section 6) as a third setting, so the numbers decide.

### R3. Wear: ganging up on a big creature

*Now:* each battle is independent. A 3000 creature beats any number of 1500s.
*Proposed:* a creature that **survives** a battle is worn down for the rest of
the turn. Its ATK and DEF are lowered by `WEAR_RATIO` x the attack value it
just withstood. Wear is cleared from every creature at the end of the turn.

Worked example with `WEAR_RATIO = 1`, target in attack position:

```
 Opponent: Titan 3000 ATK          You: A 1400, B 1300, C 1500

 A attacks: 1400 < 3000   A destroyed, you take 1600     Titan now 1600
 B attacks: 1300 < 1600   B destroyed, you take  300     Titan now  300
 C attacks: 1500 >  300   Titan destroyed, they take 1200

 You paid 2 creatures and 1900 life points to kill a three-card fusion
 and deal 1200. Expensive, but possible. Before, it was impossible.
```

This is the central change. It gives small creatures an answer to a big one,
makes the wide board from R2 matter, and makes the big creature's owner think
about protecting it (defense position, a second creature, R4 Guard).

- State: `Creature.wear: number`. Events: a new public `worn` event.
- `battleValues` subtracts wear (never below 0).
- **A failed attack still costs life points** (owner's decision, 2026-11-13:
  every decision carries a cost). The attacker's owner takes the normal battle
  damage, worked out against the target's current, worn value.
- Tunable: `WEAR_RATIO` (try 0.5 and 1).

### R4. Answer traits, printed on cards

A small set of keywords on some base cards. They are the "removal spell",
moved onto a body that can itself be attacked. Start with three:

| Trait | Rule | What it creates |
|---|---|---|
| **Venom** | A creature that destroys this one in battle is destroyed too. | A cheap card that trades with anything. Attacking with your big creature is now a risk you must check. |
| **Guard** | While this is in defense position, the opponent's creatures must attack a Guard creature first. | Protects your big creature from R3 gang-ups and your life points from direct hits. |
| **Pierce** | When this destroys a defense-position creature, the owner takes the difference as damage. | Punishes hiding everything in defense. |

**The result card decides** (owner's decision, 2026-11-13). Fusion keeps its
existing principle: the tag pair picks the result card, and a creature has
exactly the traits printed on its card. Nothing is inherited from materials.

- A base card's trait is lost when the card is fused away, unless the result
  card prints its own. "Keep the trait or fuse it" is a decision.
- Fusion results **may** print traits. A tag pair can then be a recipe for an
  ability, not only for a bigger number:

```
 beast + plant  ->  a mid-ATK result with Venom     (a recipe worth learning)
 dragon + warrior -> a high-ATK result, no trait    (the plain stat route)
```

- Balance rule for the pool: the higher a card's ATK, the fewer and weaker its
  traits. The top-ATK results print none.
- State: only `Card.traits: Trait[]`. Traits are read from the card id, so
  `Creature` and the events need no change. Checked in `attackError` (Guard)
  and `resolveAttack` (Venom, Pierce).
- Cost: medium. Needs card-pool work and balance runs. All names stay our own
  (DDR-0008).

### R5. Synergy traits: cards that help each other

Until now nothing on the field helps anything else. These traits change a
creature's value from the cards around it, so the board is something you build.

| Trait | Rule | What it creates |
|---|---|---|
| **Banner** | Creatures in the slots next to this one that share a tag or the element with it get +300 ATK and DEF. | Slot choice matters for the first time. Destroying the Banner breaks the formation, so it is a target. |
| **Pack** | This creature gets +200 ATK and DEF for each other creature you control that shares a tag or the element with it. | Rewards a themed deck and a wide board; weak alone. |
| **Rally** | This creature gets +500 ATK and DEF while your life points are lower than the opponent's. | A comeback tool you must put in your deck and draw; not an automatic bonus. |

- Slots are 0 to 4; the neighbours of slot `n` are `n-1` and `n+1`.
- Bonuses are **derived**, never stored: they are worked out from the field at
  the moment of each battle, so destroying a Banner mid-turn changes the next
  battle. Order of calculation: base value, plus synergy bonuses, plus the
  element bonus, minus wear, never below 0.
- `battleValues` therefore needs both fields and both life totals, which
  changes its public signature (used by the greedy bot today).
- "Shares a tag or the element" counts once per creature, even when both
  match (owner's decision, 2026-11-13: elements are included). A deck can be
  themed by tag or by element.
- Cost: medium to large. Mostly card-pool design and balance.

**Element bonus as a setting.** The owner's reason for including elements is
that a weaker card with the favourable element should be able to counter a
stronger one. At +500 that rarely happens against a fusion. `ELEMENT_BONUS`
joins the experiment settings in section 6 (500, 750, 1000); no value is
decided here.

How goals 1 and 2 are met:

```
 "Pile of strong cards" deck          Themed deck (say, beasts with a Banner)
 ---------------------------          ---------------------------------------
 1800, 1700, 1700 on the field        1400 [Pack], 1300 [Banner], 1400 [Pack]
 no bonuses                           Pack: 1400 + 2x200 + 300 = 2100 each
                                      the 1300 Banner is the weak point

 Behind on life points? Two plays from a hidden five-card hand can drop a
 Banner next to a Pack creature and add a Rally body in the same turn. The
 opponent sees the pieces only when they land.
```

### R6. Face-down play (direction agreed; own spec to follow)

Owner's decision, 2026-11-13: face-down play belongs in the game with its
usual purpose, deception (and traps, if trap cards are ever added). It is not
designed in this file, but **plan 2 must be designed for it**, because it
changes what a player is allowed to see:

- `PLAY` gains a face-up or face-down choice.
- `PlayerView` must hide the card id, and so the traits and element, of an
  opponent's face-down creature.
- Events go to both players (DDR-0003), so `played`, `fused` and
  `fusion-failed` must not carry the hidden card ids of a face-down play.
- **Purpose** (owner's decision, 2026-11-13): face-down exists only to deceive
  the opponent or lure them into attacking without knowing what the creature
  can do. It gives no other advantage.
- **Reveal rule:** a face-down creature is turned face-up when it **attacks**
  (before the battle), and by the battle when it **is attacked** (after the
  battle is worked out, whether it survives or is destroyed). The lure lasts
  until the opponent commits to the attack, and no longer.
- **Hidden means no synergy** (owner's decision, 2026-11-13). While face-down,
  a creature neither gives nor receives Banner and Pack bonuses, and it does
  not count as a creature for another card's Pack. Playing face-down therefore
  costs the formation its bonus: surprise is paid for with strength.
- **What still works while face-down:** the creature's own card. When it is
  attacked, the battle uses its real ATK or DEF, its element (the element
  bonus applies) and its battle traits, so a face-down Venom creature is the
  classic lure.
- Proposed for the face-down spec, not yet decided: Guard does nothing while
  face-down (forcing attacks onto it would give it away), and Rally applies
  (it depends only on life points, which are public).

A separate spec covers these. Plans 2 and 3 are then revised for it **before**
plan 2 is implemented (owner's decision, 2026-11-13).

### Considered, not proposed now

| Idea | Why not now |
|---|---|
| Unlimited plays per turn | With refill-to-5, playing everything is free, so it removes the hand decision. Kept as an experiment setting only. |
| Draw a fixed number instead of refilling to 5 | Rejected. It would make fusion cost cards, but refill-to-5 is the comeback engine (section 3, pillars). Fusion gets its cost from R3 to R5 instead: a tall creature can be ganged up on, traded with, and out-valued by synergy. |
| An automatic bonus for the player who is behind | Rejected. A comeback must be earned; Rally is the deck-building version of this. |
| Choose the advantage element when playing | Good depth, cheap. Held back only to limit how much changes at once. |
| Fusion inheriting traits from its materials | Rejected by the owner in favour of "the result card decides" (R4), which keeps fusion's existing type + type principle. |
| Spell, equip and trap cards | Out of scope for version one. R4 covers the need. |

## 5. How the pieces fit

```
                 TALL (fusion)
                /             \
     beats small boards     loses to Venom trade,
     one at a time          and to a gang-up (R3)
              /                 \
   WIDE (two plays, R2) ------- ANSWERS (traits, R4)
     beats a lone big creature    Guard stops gang-ups
     by wear (R3)                 Pierce beats turtling
     loses to Guard and to        answers are weak bodies:
     several mid creatures        they lose to plain attacks
```

No corner beats both others. That triangle is the goal. Synergy (R5) and
fusion recipes that print a trait on the result (R4) sit on top of it: they
are how a player builds a corner that is stronger than the sum of its cards.

## 6. How we test it

Rule changes are judged by the simulator, not by feel. Work needed first:

1. **A `wide` bot** that prefers filling the field, and a **`smart` bot** that
   looks one attack ahead (it must understand wear and traits, or the numbers
   mean nothing). The current greedy bot is the "tall" baseline.
2. **Settings as constants** so one build can compare: `PLAYS_PER_TURN`
   (1, 2, unlimited), `WEAR_RATIO` (0, 0.5, 1), `ELEMENT_BONUS`
   (500, 750, 1000).
3. A faster simulator. Greedy versus greedy takes about 0.4 s per match
   today, mostly in `legalActions` plus previews; 1000-match runs need better.

**Feel and first-run values.** The owner wants matches highly volatile, decided
by careful calculation and not by "stronger wins" (2026-11-13). The engine has
no randomness after the shuffle, so the swings must come from interactions a
player can work out: wear, element advantage, synergy and the hidden hand. The
first run therefore starts from the strong end of each setting:

| Setting | First-run value | Compared against |
|---|---|---|
| `PLAYS_PER_TURN` | 2 | 1, unlimited |
| `WEAR_RATIO` | 1 | 0, 0.5 |
| `ELEMENT_BONUS` | 1000 | 500, 750 |
| Banner / Pack / Rally | +300 / +200 / +500 | lower values if one theme dominates |

Targets for a rule set to be accepted:

| Measure | Target |
|---|---|
| tall bot versus wide bot | neither wins more than 60% |
| Average turns (smart versus smart) | 8 to 14 |
| First-player win rate | 45% to 55% |
| Matches ended by deck-out | under 5% |
| Share of plays that are fusions | between 30% and 70% |
| Themed deck versus a deck of the highest-ATK cards (same bot) | themed wins at least 50% |
| Comebacks: matches won by a player who was 2000 or more life points behind | 20% to 35% (raised from 15% to 30% for the volatile feel) |
| Lead changes per match (who has more life points) | at least 2 on average |

The comeback band has two edges on purpose. Below it, an early lead decides
the match; above it, an early lead means nothing and playing well early stops
mattering. The simulator needs a per-turn life-point record to measure this.

## 7. Impact on existing work

- **Engine:** `types.ts` (`Creature.wear`, `Card.traits`, `playsUsed`, new
  event), `rules.ts` (constants), `battle.ts` (`battleValues` takes the fields
  and life totals), `play.ts`, `actions.ts`,
  `match.ts` (clear wear at end of turn), `cards.ts`. `legalActions` needs no
  change because it filters through `actionError`.
- **Bots:** new bots as above; greedy must read wear.
- **Spec:** section 4 of the approved spec gets a `Revisions` entry per
  accepted rule.
- **Plans 2 and 3:** not implemented yet. The server passes engine types
  through, so the protocol should change little; the client board must show
  wear and traits. To be checked when a phase is approved.
- **DDRs:** none change. Each accepted rule gets its own DDR.

## 8. Suggested phases

| Phase | Content | Why this order |
|---|---|---|
| 0 | Wide and smart bots, settings as constants, faster sim | We cannot measure anything without them. |
| 1 | R1 + R2 | Small, and R2 is needed before R3 can matter. |
| 2 | R3 | The central change; tune `WEAR_RATIO`. |
| 3 | R4 | Card-pool work, on top of a stable battle rule. |
| 4 | R5 | The largest balance job; needs R4's trait machinery and the comeback metric. |

Each phase gets GitHub issues and a plan before any code.

## 9. Open questions for the owner

Settled on 2026-11-13:

- The direction: combination over raw stats, earned comebacks, adjacency.
- R3: a failed attack still costs life points.
- R4: the result card decides a fused creature's traits; no inheritance.
- R5: Banner and Pack count a shared tag or a shared element.
- R6: face-down play is part of the game, purely for deception. A face-down
  creature turns face-up when it attacks or once it has been attacked, and
  while hidden it gives and receives no Banner or Pack bonus. It gets its own
  spec, and plans 2 and 3 are revised for it before plan 2 is implemented.
- Feel: highly volatile, decided by calculation. First-run values are in
  section 6.

Still open (for the face-down spec):

1. Confirm the reading that a creature which **survives** being attacked is
   turned face-up by that battle.
2. Guard and Rally on a face-down creature (proposal in R6).
3. May a face-up creature be turned face-down again, and may a `PLAY` onto a
   face-down creature keep it hidden?

## 10. Next steps

1. Owner approves this draft (or a subset of its phases).
2. Write the face-down spec, `docs/specs/<date>-face-down-play-design.md`.
3. Revise plans 2 and 3 for face-down play and the new state and event shapes.
4. Write the plan for phase 0 (bots, settings, faster simulator), with GitHub
   issues, then implement phase by phase.

## Revisions

### 2026-11-13: approved, after a review of the plans and the plan 1 code

- **Approved** by the owner. DDR-0009 records the direction.
- **Next steps reordered** (replaces steps 3 and 4 of section 10). Plans 2 and
  3 are revised once, after the engine shape is implemented, not right after
  the face-down spec. Revising plans full of code against types that do not
  exist yet would mean revising them twice. Plan 2 is still not implemented
  before its revision.
  1. Face-down spec: `2026-11-13-face-down-play-design.md` (approved 2026-11-13).
  2. Phase 0, then the engine shape for R1 to R6 (types, events, views). Card
     values may stay rough.
  3. Revise plans 2 and 3 against the real types, then implement them.
  4. Tune numbers and the card pool with the simulator, alongside step 3.
- **Phase 0 gains four items** found in the review (section 8):
  - Rule settings become a rules object held per match, not module constants,
    so one run can compare settings.
  - `runMatch` takes decks separately from bots. The target "themed deck versus
    highest-ATK deck, same bot" cannot be measured while `Bot.buildDeck` is the
    only source of a deck.
  - An attack preview that works on view data, so a bot can look one attack
    ahead without `MatchState` (DDR-0006).
  - Per-turn life totals, lead changes, comebacks and fusion share, computed
    from the events `runMatch` already records.
- **Effective stats** (corrects section 7, "the client board must show wear and
  traits"): the engine determines them and the view carries them; the client
  only displays (owner's decision, DDR-0010). A direct attack must use the
  effective ATK too; today it reads the printed value.
- **Card pool kept as it is** (owner's decision): the 40 base cards are tested
  first. Known limit: one element or tag covers at most 21 of 30 deck cards,
  so themed decks are two-theme for now.
- **Plan 3's starter deck** ("3 copies of the 10 strongest base cards") works
  against goal 1; it is replaced when plan 3 is revised.

### 2026-11-13: phase 0 baseline

Rules of plan 1 (no tactics rule yet), 500 matches each, seeds 1 to 500,
element bonus 500 unless noted. Produced by `pnpm sim` after
`docs/plans/2026-11-13-tactics-phase-0-measurement.md` was implemented. The
smart, greedy and wide bots all use the "strongest" deck unless a deck is named.

| Matchup | First-named wins | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|---|
| greedy vs greedy | n/a | 55.2% | 9.1 | 0% | 3.0% | 0.9 | 99.9% |
| smart vs smart | n/a | 53.2% | 8.8 | 7.0% | 11.4% | 0.3 | 99.6% |
| greedy (tall) vs wide | 100% | 49.4% | 4.5 | 0% | 0.0% | 0.0 | 55.4% |
| smart vs greedy | 72.8% | 54.2% | 8.8 | 0.4% | 8.8% | 0.2 | 99.6% |
| smart, flame deck vs strongest deck | 46.0% | 47.8% | 8.4 | 3.8% | 9.2% | 0.3 | 99.8% |
| smart vs smart, element bonus 1000 | n/a | 53.4% | 8.3 | 2.8% | 5.2% | 0.6 | 96.4% |
| smart, flame deck vs strongest deck, element bonus 1000 | 50.6% | 50.0% | 7.8 | 1.0% | 6.0% | 0.5 | 96.7% |

Against the targets of section 6 (smart versus smart unless noted):

| Measure | Target | Baseline | |
|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | missed |
| Average turns | 8 to 14 | 8.8 | met |
| First-player win rate | 45% to 55% | 53.2% | met |
| Deck-out | under 5% | 7.0% | missed |
| Fusion share of plays | 30% to 70% | 99.6% | missed |
| Themed deck versus highest-ATK deck | themed at least 50% | 46.0% (flame only) | missed |
| Comebacks | 20% to 35% | 11.4% | missed |
| Lead changes per match | at least 2 | 0.3 | missed |

What the baseline shows:

- The diagnosis of section 2 holds in numbers: the wide plan never wins, and
  nearly every play is a fusion.
- Raising the element bonus to 1000 on its own does not help: it lifts the
  flame deck to 50.6% but lowers comebacks (11.4% to 5.2%).
- Limits of this baseline: only the flame deck was run as "themed", and an
  element deck is a stand-in until traits exist (phase 3). The smart bot looks
  one attack ahead and beats greedy 72.8%; it is not a strong player, so the
  numbers compare rule sets, they do not predict human play.

### 2026-11-13: phase 1 results (R1 and R2)

R1 (free position changes) and R2 (`playsPerTurn`) are implemented. 500 matches
per row, seeds 1 to 500, element bonus 500, "strongest" deck unless a deck is
named. With `--plays 1` every row equals the phase 0 baseline exactly, which
confirms R1 and R2 change nothing when set back to one play. The smart, greedy
and wide bots were not changed; they use a second play simply because it is
legal.

Smart versus smart:

| Plays per turn | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|
| 1 (baseline) | 53.2% | 8.8 | 7.0% | 11.4% | 0.3 | 99.6% |
| 2 (default) | 60.0% | 6.9 | 5.0% | 4.8% | 1.0 | 89.8% |
| 5 (unlimited) | 59.2% | 6.4 | 2.4% | 6.0% | 1.4 | 64.8% |

Other matchups (first-named bot's win rate):

| Matchup | 1 play | 2 plays | 5 plays |
|---|---|---|---|
| greedy (tall) vs wide | 100% | 100% | 87.0% |
| smart vs wide | 100% | 100% | 89.0% |
| smart vs greedy | 72.8% | 82.2% | 82.0% |
| smart, flame deck vs strongest deck | 46.0% | 52.0% | 44.2% |

Against the targets of section 6 (smart versus smart, 2 plays, next to the
baseline):

| Measure | Target | Baseline | 2 plays | |
|---|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | tall 100% | missed |
| Average turns | 8 to 14 | 8.8 | 6.9 | met before, missed now |
| First-player win rate | 45% to 55% | 53.2% | 60.0% | met before, missed now |
| Deck-out | under 5% | 7.0% | 5.0% | missed (not under 5) |
| Fusion share of plays | 30% to 70% | 99.6% | 89.8% | missed |
| Themed (flame) versus strongest deck | themed at least 50% | 46.0% | 52.0% | met |
| Comebacks | 20% to 35% | 11.4% | 4.8% | missed, further away |
| Lead changes per match | at least 2 | 0.3 | 1.0 | missed, closer |

What the numbers say:

- **R2 alone makes the game worse on three measures.** Matches shorten to 6.9
  turns, the first player gains a clear edge (60.0%), and comebacks fall from
  11.4% to 4.8%. Two plays let the player on turn 1 build a board the opponent
  cannot answer, and a winner who is ahead finishes sooner. This is the
  expected shape: the spec says R2 is "needed before R3 can matter" (section 8),
  and wear (R3) is the rule meant to give the player who is behind a way back.
- **Wide is still not a plan.** At 2 plays wide never wins; only at 5 plays does
  it win 11% to 13%. Wear (R3) is what is meant to change this.
- **Lead changes more than triple (0.3 to 1.0)** and the themed flame deck now
  edges the strongest deck (52.0%). The flame result is one deck, one run, and
  at 5 plays it reverses (44.2%), so it is a hint, not a finding.
- **Plays per turn: keep 2 for now.** 5 plays brings the fusion share inside the
  target (64.8%) and cuts deck-out, but it misses the same targets by the same
  margin and removes the hand decision (section 4, "considered, not proposed").
  The default stays at the spec's proposal until R3 is measured; the owner may
  change it.
- **New problem to decide before R3:** the first-player edge (60.0%). The spec
  has no rule for it. A possible fix is fewer plays on turn 1 for the first
  player; this is a suggestion, not a decision.
- A planning decision, recorded in the phase 1 plan: a `PLAY` onto a creature
  that already attacked must keep its position, and any other position is
  rejected.

### 2026-11-13: plans for phases 2 to 5, and two owner decisions

The owner asked for every tactics rule (R3 to R6) to be implemented before
plans 2 and 3. The plans are
`docs/plans/2026-11-13-tactics-phase-2-wear.md`,
`docs/plans/2026-11-13-tactics-phase-3-answer-traits.md`,
`docs/plans/2026-11-13-tactics-phase-4-synergy.md` and
`docs/plans/2026-11-13-tactics-phase-5-face-down.md`.

- **Order of a value** (replaces the order in R5, "base value, plus synergy
  bonuses, plus the element bonus, minus wear"): printed value, plus synergy,
  minus wear, never below 0. That is the current value the view shows; a battle
  adds the element bonus on top of it. The two orders differ only when wear
  brings a creature to 0 or below. The owner chose this one so that every
  battle is "shown value + bonus", which a player can calculate from the board.
- **`firstTurnPlays`** joins the settings of section 6: the plays the first
  player gets on turn 1. Its default equals `playsPerTurn`, so nothing changes
  until the owner picks a value; phase 2 measures 1 against 2. It answers the
  first-player edge found in the phase 1 results (60.0%).
- The phase plans propose which cards print which trait (phase 3 for Venom,
  Guard and Pierce; phase 4 for Banner, Pack and Rally). Only traits are added;
  the 40 base cards keep their names, tags and stats.

### 2026-11-13: phase 2 results (R3)

R3 (wear) and `firstTurnPlays` are implemented. 500 matches per row, seeds 1 to
500, 2 plays per turn, default element bonus, "strongest" deck unless a deck is
named. Rows with `--wear 0` and no `--first-plays` equal the phase 1 "2 plays"
rows exactly, which confirms R3 changes nothing when it is off. 0 errors in
every run.

Smart versus smart:

| Wear ratio | First-turn plays | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|---|
| 0 | 2 (default) | 60.0% | 6.9 | 5.0% | 4.8% | 1.0 | 89.8% |
| 0.5 | 2 | 69.2% | 5.9 | 0% | 6.4% | 1.2 | 89.8% |
| 1 | 2 | 68.0% | 5.3 | 0% | 7.8% | 1.3 | 90.2% |
| 0 | 1 | 38.6% | 6.1 | 3.6% | 7.8% | 0.3 | 90.8% |
| 0.5 | 1 | 44.4% | 5.3 | 0% | 3.2% | 0.4 | 91.0% |
| 1 | 1 | 45.8% | 4.8 | 0% | 2.4% | 0.5 | 91.4% |

Other matchups (first-named bot's win rate), at first-turn plays 2 / 1:

| Matchup | Wear 0 | Wear 0.5 | Wear 1 |
|---|---|---|---|
| greedy (tall) vs wide | 100% / 100% | 100% / 100% | 100% / 100% |
| smart vs wide | 100% / 100% | 100% / 100% | 100% / 100% |
| smart vs greedy | 82.2% / 76.2% | 81.2% / 76.4% | 84.0% / 78.6% |
| smart, flame deck vs strongest deck | 52.0% / 49.8% | 50.4% / 49.6% | 51.2% / 49.2% |

Against the targets of section 6 (smart versus smart):

| Measure | Target | Phase 1 (2 plays) | Phase 2 best | |
|---|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | tall 100% | missed, unchanged |
| Average turns | 8 to 14 | 6.9 | 6.9 (wear 0) / 4.8 (wear 1, first-turn plays 1) | missed, wear shortens matches |
| First-player win rate | 45% to 55% | 60.0% | 45.8% (wear 1, first-turn plays 1) | met only with first-turn plays 1 |
| Deck-out | under 5% | 5.0% | 0% (any wear above 0) | met |
| Fusion share of plays | 30% to 70% | 89.8% | 89.8% | missed, unchanged |
| Themed (flame) versus strongest deck | at least 50% | 52.0% | 50.4% to 52.0% at first-turn plays 2 | met at first-turn plays 2, 49.2% to 49.8% at 1 (noise) |
| Comebacks | 20% to 35% | 4.8% | 7.8% | missed, closer |
| Lead changes per match | at least 2 | 1.0 | 1.3 (wear 1, first-turn plays 2) | missed, closer |

What the numbers say:

- **Wear removes deck-out and nudges comebacks and lead changes up, and
  nothing else.** Any wear above 0 ends every match on life points (deck-out
  0%), because matches get shorter. Comebacks rise from 4.8% to 7.8% and lead
  changes from 1.0 to 1.3, at first-turn plays 2.
- **Wear does not make wide a plan.** Wide still wins 0 of 500 in every run,
  and the fusion share does not move. Those matches last 3.7 turns, so wear has
  no time to matter: the tall bot wins before a gang-up is worth planning. The
  cause is the size of a fusion against single cards, which R4 and R5 address,
  not wear.
- **Wear raises the first-player edge** (60.0% to 68.0% at wear 1) and shortens
  matches (6.9 to 5.3 turns), moving away from the 8-to-14 target. The first
  player builds a worn-proof board first.
- **`firstTurnPlays` 1 fixes the edge.** It brings the first-player win rate to
  38.6% at wear 0, 44.4% at 0.5 and 45.8% at wear 1; only wear 1 is inside the
  45% to 55% band. With wear 0 it overshoots to the second player.
- **Recommendation for the owner** (a recommendation only; the defaults change
  only by the owner's decision, in a later commit): `wearRatio` 1 and
  `firstTurnPlays` 1. It is the only pair inside the first-player band, it
  removes deck-out, and the lead-change and comeback measures stay where phase 3
  to 5 must lift them. The cost is shorter matches (4.8 turns), which phase 3
  to 5 must also address. Wear 0.5 is within 1.4 points of wear 1 on the
  first-player rate and the numbers do not separate it from 1 elsewhere.
- Planning decisions, recorded in the phase 2 plan: only the target is worn;
  the wear is the attack value it withstood, element bonus included, times
  `wearRatio`; wear clears at every turn start; the order of a value is printed
  value, plus synergy, minus wear (never below 0), with the element bonus added
  in battle on top.

### 2026-11-13: phase 3 results (R4)

R4 (Venom, Guard, Pierce) is implemented, with `traitDeck` and the `answers`
deck (every base card that prints a trait, 3 copies each, then the strongest
other base cards). 500 matches per row, seeds 1 to 500, 2 plays per turn,
default element bonus, `wearRatio` 1 (its default). Two settings are run: the
defaults (`firstTurnPlays` 2) and the phase 2 recommendation (`firstTurnPlays`
1). 0 errors in every run.

Traits printed (the plan's proposal, unchanged by the numbers):

| Trait | Base cards | Fusion result |
|---|---|---|
| Venom | Thorn Sprite, Breeze Wisp, Spark Ferret | Briar Stag |
| Guard | Furnace Drone, Clay Sentinel, Pearl Clam | Iron Vanguard |
| Pierce | Vine Archer, Storm Crow, Gale Falcon | Sky Lancer |

Smart versus smart, then other matchups (first-named bot's win rate):

| Run | First-turn plays | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|---|
| smart vs smart, phase 2 (no traits) | 2 | 68.0% | 5.3 | 0% | 7.8% | 1.3 | 90.2% |
| smart vs smart | 2 | 65.8% | 5.2 | 0% | 4.2% | 1.3 | 89.3% |
| smart vs smart, phase 2 (no traits) | 1 | 45.8% | 4.8 | 0% | 2.4% | 0.5 | 91.4% |
| smart vs smart | 1 | 44.2% | 4.8 | 0% | 2.6% | 0.5 | 90.5% |

| Matchup | First-turn plays 2 | First-turn plays 1 |
|---|---|---|
| greedy (tall) vs wide | 100% | 100% |
| smart vs wide | 100% | 100% |
| smart vs greedy | 83.8% | 78.8% |
| smart, flame deck vs strongest deck | 54.6% | 51.8% |
| smart, answers deck vs strongest deck | 22.2% | 24.4% |
| greedy, answers deck vs strongest deck | 22.4% | 21.6% |

Against the targets of section 6 (smart versus smart, first-turn plays 1):

| Measure | Target | Phase 2 | Phase 3 | |
|---|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | tall 100% | missed, unchanged |
| Average turns | 8 to 14 | 4.8 | 4.8 | missed |
| First-player win rate | 45% to 55% | 45.8% | 44.2% | missed by 0.8 points (noise) |
| Deck-out | under 5% | 0% | 0% | met |
| Fusion share of plays | 30% to 70% | 91.4% | 90.5% | missed, unchanged |
| Themed (flame) versus strongest deck | at least 50% | 49.2% | 51.8% | met |
| Comebacks | 20% to 35% | 2.4% | 2.6% | missed |
| Lead changes per match | at least 2 | 0.5 | 0.5 | missed |

What the numbers say:

- **R4 as printed does not change the game.** Every headline measure is within
  noise of phase 2, and the tall bot still beats wide 100%. The answers deck,
  built from the answer cards, loses to the strongest deck 75% to 78% of the
  time with both the smart and the greedy bot. At the defaults, comebacks fall
  from 7.8% to 4.2% (a mild worsening).
- **Why: the traits do not survive a fusion.** A fusion result prints its own
  traits and inherits none (DDR-0009), and 90% of plays are fusions. Every bot
  fuses a trait card into a trait-less result (`fusePair` picks by tag pair),
  so the traits are used for one play and then lost. Only three fusion results
  print one, and the answer cards are weak bodies that the strongest deck
  outgrows.
- **The bots do not play the traits yet.** No bot puts a Guard in defense
  position on purpose or holds back a Venom creature as a lure; Guard only
  bites when a creature happens to sit in defense. The smart bot sees Venom
  and Pierce through the previews, which now include them.
- Suggestions for the owner, not decisions: (1) give the base answer cards
  more reason to stay unfused, or let a fusion keep one trait of an ingredient
  (this reverses the DDR-0009 decision "a fusion result inherits nothing" and
  needs the owner to change it); (2) teach the smart bot to hold Guard and
  Venom creatures; (3) judge R4 again after R5 and R6, which change what a
  board is worth and what a creature can hide.
- Planning decisions, recorded in the phase 3 plan: Venom counts only a
  destruction by battle with the Venom creature; Pierce deals attack minus
  defense when it destroys a defense-position creature; Guard binds only in
  defense position, and the attacker picks among several Guards.

### 2026-11-13: phase 4 results (R5)

R5 (Banner, Pack, Rally), `viewAfterPlay` and the smart bot's formation play are
implemented, with `tagDeck`, the `synergy` deck (every Banner and Pack base card)
and one deck per tag. 500 matches per row, seeds 1 to 500, 2 plays per turn,
`wearRatio` 1, default bonuses (Banner +300, Pack +200, Rally +500), smart bot
on both sides unless noted. Two settings: the defaults (`firstTurnPlays` 2) and
the phase 2 recommendation (`firstTurnPlays` 1). 0 errors in every run. With
`--banner 0 --pack 0 --rally 0` the greedy bot reproduces its phase 3 numbers.

Synergy traits printed (the plan's proposal, unchanged by the numbers):

| Trait | Base cards | Fusion result |
|---|---|---|
| Banner | Flare Hawk, Canopy Owl, Zephyr Monk, Iron Digger, Tesla Turret, Reef Guard (one per element) | Bloom Witch |
| Pack | Dust Jackal, Stone Ram, Tide Otter, Kelp Lurker | Twin-Fang Chimera |
| Rally | Kite Glider, Grove Sage, Pebble Tortoise, Harbor Gull | none |

Smart versus smart (the strongest deck holds no synergy card, so these rows
should match phase 3, and do):

| Run | First-turn plays | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|---|
| phase 3 | 2 | 65.8% | 5.2 | 0% | 4.2% | 1.3 | 89.3% |
| phase 4 | 2 | 66.0% | 5.2 | 0% | 4.2% | 1.3 | 89.3% |
| phase 3 | 1 | 44.2% | 4.8 | 0% | 2.6% | 0.5 | 90.5% |
| phase 4 | 1 | 44.0% | 4.8 | 0% | 2.6% | 0.5 | 90.5% |

Themed deck versus the strongest deck (smart on both sides; the themed deck's
win rate):

| Themed deck | First-turn plays 2 | First-turn plays 1 | Bonuses 500 / 300 (plays 2) | All bonuses 0 (plays 2) |
|---|---|---|---|---|
| flame | 55.6% | 51.8% | | 54.6% |
| water | 49.0% | 54.8% | 49.4% | |
| earth | 45.0% | 36.6% | 46.6% | 43.8% |
| beast (tag) | 25.4% | 20.8% | 29.2% | |
| synergy (Banner and Pack cards) | 22.6% | 14.6% | 22.8% | |
| answers (phase 3 cards) | 21.6% | 24.6% | | |

Other matchups (first-named bot): tall vs wide 100% / 100%, smart vs wide 100% /
100%, smart vs greedy 83.8% / 79.0% (first-turn plays 2 / 1). With Banner 150,
Pack 100, Rally 250, the flame deck wins 55.0% and the synergy deck 21.6%.

Against the targets of section 6 (smart versus smart, first-turn plays 1):

| Measure | Target | Phase 3 | Phase 4 | |
|---|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | tall 100% | missed, unchanged |
| Average turns | 8 to 14 | 4.8 | 4.8 | missed |
| First-player win rate | 45% to 55% | 44.2% | 44.0% | missed by 1 point (noise) |
| Deck-out | under 5% | 0% | 0% | met |
| Fusion share of plays | 30% to 70% | 90.5% | 90.5% | missed, unchanged |
| Themed (flame) versus strongest deck | at least 50% | 51.8% | 51.8% | met for flame and water, missed for earth, tags and synergy |
| Comebacks | 20% to 35% | 2.6% | 2.6% | missed |
| Lead changes per match | at least 2 | 0.5 | 0.5 | missed |

What the numbers say:

- **R5 as printed has almost no effect.** Flame wins 54.6% with every bonus at
  0 and 55.6% with the defaults, earth 43.8% and 45.0%: inside the noise of 500
  matches (about 4 points either way). Raising Banner and Pack to 500 and 300
  moves earth to 46.6% and beast to 29.2%, still short of 50%. No theme
  dominates (the best is 55.6%), so the spec's "lower values if one theme
  dominates" does not apply.
- **The reason is the same as for R4: fusion.** A themed deck plays about 85% to
  93% fusions, and a fusion result has its own traits and mostly none. Banner
  and Pack cards are fused away within a turn or two, so a formation of
  neighbours that share a theme seldom stands on the board. The synergy deck,
  made only of Banner and Pack base cards, is the worst deck measured (22.6%,
  and 14.6% at first-turn plays 1), because its bodies are small and it fuses
  them like any other deck.
- **Comebacks and lead changes did not move.** The strongest deck, which every
  headline measure uses, holds no synergy card, so those rows could not move.
  Rally is the rule meant to help the player who is behind, and it is printed
  only on four small base cards.
- **The smart bot does build formations when it can**: a test shows it placing
  a creature beside a Banner it shares a theme with. It ranks plays by the total
  ATK of its board after the play, which also changes a few fallback choices;
  the smart-against-greedy rows are unchanged within noise (83.8%, was 83.8%).
- Suggestions for the owner, not decisions: (1) decide whether a fusion result
  should keep a trait of one ingredient, which both R4 and R5 need to matter
  and which reverses a DDR-0009 decision; (2) put Banner, Pack or Rally on
  fusion results with ATK up to 2100 (a fusion is what bots play); (3) leave
  the bonus values at +300 / +200 / +500, since neither halving nor raising
  them changes the picture; (4) judge R4 and R5 again after R6, which changes
  what is on the board.
- Planning decisions, recorded in the phase 4 plan: Banners stack; a Pack
  creature counts each other own creature that shares a tag or element once;
  Rally reads life points when the value is read; the smart bot ranks plays by
  its whole board after the play.

### 2026-11-13: phase 5 results (R6) and the full rule set

R6 (face-down play) is implemented, so R1 to R6 are all in the engine. The
engine has `faceDown` on creatures, a free `REVEAL`, `HiddenCreature` views,
`eventsFor`, reveal steps in battle and previews that refuse a hidden target.
The bots learned to probe a hidden creature (greedy, wide; smart only while it
has two creatures) and the smart bot plays a Venom creature it puts in defense
face-down. 500 matches per row, seeds 1 to 500, 2 plays per turn, all defaults,
two settings (`firstTurnPlays` 2 and 1). 0 errors in every run.

Smart versus smart and other matchups (the first-named bot's win rate):

| Run | First-turn plays | First player wins | Avg turns | Deck-out | Comebacks | Lead changes | Fusion share |
|---|---|---|---|---|---|---|---|
| phase 4, smart vs smart | 2 | 66.0% | 5.2 | 0% | 4.2% | 1.3 | 89.3% |
| phase 5, smart vs smart | 2 | 66.0% | 5.2 | 0% | 4.2% | 1.3 | 89.3% |
| phase 4, smart vs smart | 1 | 44.0% | 4.8 | 0% | 2.6% | 0.5 | 90.5% |
| phase 5, smart vs smart | 1 | 44.0% | 4.8 | 0% | 2.6% | 0.5 | 90.5% |

| Matchup | First-turn plays 2 | First-turn plays 1 |
|---|---|---|
| greedy (tall) vs wide | 100% | 100% |
| smart vs wide | 100% | 100% |
| smart vs greedy | 83.8% | 79.0% |
| smart, flame deck vs strongest deck | 55.8% | 51.8% |
| smart, beast deck vs strongest deck | 25.6% | 20.8% |
| smart, synergy deck vs strongest deck | 22.6% | 14.6% |
| smart, answers deck vs strongest deck | 21.4% | 24.6% |

Against the targets of section 6 (smart versus smart, first-turn plays 1), one
column per phase. Phase 0 is the plan 1 rules at 1 play; phases 1 to 5 add one
rule each.

| Measure | Target | Phase 0 | Phase 1 (2 plays) | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|---|---|
| Tall versus wide | neither above 60% | tall 100% | 100% | 100% | 100% | 100% | 100% |
| Average turns | 8 to 14 | 8.8 | 6.9 | 4.8 | 4.8 | 4.8 | 4.8 |
| First-player win rate | 45% to 55% | 53.2% | 60.0% | 45.8% | 44.2% | 44.0% | 44.0% |
| Deck-out | under 5% | 7.0% | 5.0% | 0% | 0% | 0% | 0% |
| Fusion share of plays | 30% to 70% | 99.6% | 89.8% | 91.4% | 90.5% | 90.5% | 90.5% |
| Themed (flame) versus strongest deck | at least 50% | 46.0% | 52.0% | 49.2% | 51.8% | 51.8% | 51.8% |
| Comebacks | 20% to 35% | 11.4% | 4.8% | 2.4% | 2.6% | 2.6% | 2.6% |
| Lead changes per match | at least 2 | 0.3 | 1.0 | 0.5 | 0.5 | 0.5 | 0.5 |

Phase 1 is at the default first-turn plays (2); phases 2 to 5 are at 1, the
phase 2 recommendation, which is why the first-player rate drops.

What the numbers say:

- **R6 changes nothing the simulator can see.** Every phase 5 row equals the
  phase 4 row to the digit. Two bots never play face-down: the greedy, wide
  and smart bots choose face-up plays only, apart from the smart lure, which
  needs a Venom creature in defense and did not occur in 30 answers-deck
  replays. Only the random bot plays face-down; in random against random 500
  matches show 165 to 175 deck-outs (33% to 35%), a bot that is not a
  benchmark. So the numbers measure that R6 breaks nothing, not that it
  works as a rule.
- **What is verified is the machinery**: unit tests for each rule F1 to F11,
  a property test over 200 random matches (the random bot plays face-down and
  reveals) that checks no view and no filtered event shows an opponent's
  face-down card, and 0 errors in every run.
- **The full rule set meets 2 of the 8 targets**: deck-out (0%) and the
  themed flame deck against the strongest deck (51.8% at first-turn plays 1,
  55.8% at 2). The first-player rate is 1 point under its band at first-turn
  plays 1 (44.0%, which 500 matches cannot separate from noise) and 20 points
  over it at 2. It misses the other five by wide margins: tall still beats wide 100%, matches last 4.8 turns, fusions
  are about 90% of plays, comebacks 2.6%, lead changes 0.5.
- **The shared cause**: every rule since phase 3 gives a bonus to something a
  bot fuses away on its first play, and a fusion result inherits no trait
  (DDR-0009). Wear (R3) works as intended on a big creature, but a match ends
  before it matters, because two plays per turn finish a match in 5 turns.
- **Simulator time** for smart against smart, 100 matches: 4.1 s (3.4 s
  before the tactics rules; the budget was 30 s). `legalActions` lists both
  faces of every play, so it has about 13,000 candidates for a five-card hand.
- **Recommendation for the owner** (not decisions): keep the phase 2 pair
  (`wearRatio` 1, `firstTurnPlays` 1); then decide whether a fusion keeps a
  trait of an ingredient (needed for R4 and R5 to matter), whether `playsPerTurn`
  should go back to 1 (matches reach 8.8 turns, the target is 8 to 14), and
  whether a bot should play face-down on purpose, so R6 can be measured. R1 to
  R6 are implemented as written; none of those changes is made here.
- R1 to R6 are all implemented, so step 3 of the 2026-11-13 next steps can
  start: revise plans 2 and 3 against the real engine types, then implement
  them.
