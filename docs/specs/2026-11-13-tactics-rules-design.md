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
