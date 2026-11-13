# Face-down play: design proposal

> **Date:** 2026-11-13 · **Status:** approved by the owner on 2026-11-13.
> Builds on `2026-11-13-tactics-rules-design.md` (R6), approved the same day.
> Binding rules: DDR-0003 (per-player views), DDR-0009 (face-down is deception
> only), DDR-0010 (the engine determines effective stats).

## 1. Purpose

A player may put a creature on the field face-down. The opponent sees that a
creature is there, but not which one. The only purpose is deception: to bluff,
or to lure an attack into a creature the opponent cannot read. Face-down gives
no other advantage (owner, 2026-11-13).

This is the first rule that hides something on the field. Until now the only
hidden zones were the hands and the deck orders.

## 2. Already settled (from the tactics spec, R6)

- `PLAY` gains a face-up or face-down choice.
- A face-down creature turns face-up when it **attacks**, before the battle.
- A face-down creature that **is attacked** is turned face-up by that battle.
- While face-down, a creature gives and receives no Banner or Pack bonus, and
  does not count for another card's Pack.
- When attacked, it fights with its real ATK or DEF, its element and its battle
  traits (Venom, Pierce).

## 3. Proposed rules

The owner accepted every proposed line on 2026-11-13 (section 8).

| # | Rule | Status |
|---|---|---|
| F1 | `PLAY` has `faceDown: boolean`. Any position may be combined with it. | settled |
| F2 | The **position** of a face-down creature is public. The opponent must know whether an attack meets ATK or DEF, or the attack is a blind guess, not a calculation. | settled |
| F3 | A creature that **survives** being attacked is face-up afterwards. | settled |
| F4 | **Guard** does nothing while face-down. Forcing attacks onto it would give it away. | settled |
| F5 | **Rally** applies while face-down. It depends only on life points, which are public, and the value stays hidden with the card. | settled |
| F6 | **Once face-up, always face-up.** No action turns a creature face-down again. A `PLAY` onto a face-up creature is face-up. | settled |
| F7 | A `PLAY` onto your own face-down creature may stay face-down. The opponent learns only how many hand cards were used. | settled |
| F8 | A new free action `REVEAL { slot }` turns your own creature face-up on your turn. Without it, the only way to get a formation's Banner and Pack bonuses back is to attack. | settled |
| F9 | A face-down creature counts as a creature: it blocks direct attacks and can be the target of any attack. | settled |
| F10 | `SET_POSITION` does not reveal. | settled |
| F11 | Wear applies normally. By the time a creature can be worn it has been attacked, so it is already face-up. | follows from F3 |

### Turn example: the lure

```
 You: 1200 life points, behind.   Opponent: Titan 3000 ATK, attack position.

 Your turn    PLAY Thorn Sprite [Venom] face-down, defense position
              The opponent sees:  [ ?? ]  defense

 Their turn   Titan attacks the hidden card
              -> revealed: Thorn Sprite, DEF 1100
              -> 3000 > 1100, Thorn Sprite destroyed, no damage (defense)
              -> Venom: Titan is destroyed too

 One base card traded for a three-card fusion. The opponent could have
 attacked something else, or sent a small creature in first to look.
```

The counter-play is real: probe with a cheap creature, or ignore the hidden
card. That is the calculation the owner asked for.

## 4. What each player sees

```
                         owner          opponent
 card id, name           yes            no
 element, tags, traits   yes            no
 printed and effective   yes            no
   ATK / DEF
 slot, position          yes            yes   (F2)
 that it is face-down    yes            yes
 hand cards used         yes            count only (hand size is public)
```

No derived value leaks the hidden card, because of rules already decided:

- Hidden creatures give no Banner bonus, so a neighbour's visible effective
  stats do not change when a hidden Banner lands next to it.
- Hidden creatures do not count for Pack, so a visible Pack creature's value
  does not change either.
- A hidden Guard forces nothing (F4), so the list of legal attacks is the same
  whatever the card is.

## 5. Engine shape

### State

`Creature` gains `faceDown: boolean`. `MatchState` holds the truth for both
sides, as now.

### View

`Creature` can no longer be shared between the state and the view. The view
gets its own type:

```ts
type VisibleCreature = {
  hidden: false;
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  faceDown: boolean;      // true only on your own side
  wear: number;
  atk: number;            // effective, from the engine (DDR-0010)
  def: number;
};
type HiddenCreature = { hidden: true; position: Position };

// PlayerView.self.field:     (VisibleCreature | null)[]
// PlayerView.opponent.field: (VisibleCreature | HiddenCreature | null)[]
```

### Events

Today `applyAction` returns one event list and plan 2 sends the same list to
both players. That would leak. The engine gets a new public function:

```ts
eventsFor(events: GameEvent[], player: PlayerId): GameEvent[]
```

The rule about what is hidden is a game rule, so it lives in the engine, not
in the server (DDR-0001).

| Event | Owner of the play sees | Opponent sees |
|---|---|---|
| `played` (face-up) | as now | as now |
| `played` (face-down) | card id, `faceDown: true` | slot, position, `faceDown: true`, card count, no card id |
| `fused`, `fusion-failed` inside a face-down play | as now | removed |
| `revealed { player, slot, cardId }` (new) | yes | yes |
| `destroyed` | as now | as now; a `revealed` event always comes first |
| all others | as now | as now |

Order inside one attack: `attacked`, then `revealed` (if the attacker was
hidden), the battle, then `revealed` (if the target was hidden), then
`destroyed`, `damage`.

The simulator keeps the full list, so statistics and replays stay complete.

### Actions

- `PlayAction` gains `faceDown: boolean`.
- `RevealAction { type: "REVEAL"; slot }` (F8).
- `legalActions` lists both faces of every play. That doubles its `PLAY`
  candidates (about 6,500 for a five-card hand), so the phase 0 speed work
  comes before this.

### Bots

A bot receives `HiddenCreature` entries and must choose without the card. The
greedy bot's `isFavourable` reads the target's card and must be changed. The
smart bot needs a policy for unknown targets (for example, probe with its
weakest attacker).

## 6. Impact on existing work

- **Engine:** `types.ts`, `play.ts` (face choice, F6, F7), `battle.ts` (reveal
  steps, Guard check ignores hidden creatures), `view.ts` (new types, hiding),
  new `eventsFor`, `legal.ts`, tests for every row of the tables above.
- **Approved spec:** section 4.4 says "All creatures on the field are face-up".
  It has a `Revisions` entry pointing here.
- **DDR-0003:** now says events are filtered per player by the engine.
- **Plan 2:** `broadcastMatch` sends `eventsFor(events, seat)`; the zod schema
  for `PLAY` gains `faceDown`. Revised after the engine shape is implemented.
- **Plan 3:** a card back, a face-down toggle in the play selection, text for
  the new events. Revised at the same time.

## 7. Where it sits in the phases

The tactics spec phases are 0 (bots, settings, simulator), 1 (R1, R2), 2 (R3),
3 (R4), 4 (R5). Face-down play is **phase 5**: it needs traits to be worth
hiding, and it is the largest change to views and events. Its shape (section 5)
is decided now so phases 0 to 4 do not build on types that phase 5 must break:
the view gets its own creature type from phase 0.

## 8. Questions settled by the owner (2026-11-13)

1. F3: a creature that survives an attack is turned face-up. Yes.
2. F4 and F5: Guard is off and Rally is on while face-down. Yes.
3. F6 and F7: a creature never goes back to face-down; a play onto your own
   hidden creature may stay hidden. Yes.
4. F8: a free `REVEAL` action on your own turn. Yes.
5. F2: the position of a hidden creature is public. Yes.

No question is open.
