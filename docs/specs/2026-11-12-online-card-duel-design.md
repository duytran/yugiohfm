# Online Card Duel — Design

Date: 2026-11-12
Status: approved design, awaiting spec review

## 1. Goal

An original browser card-duel game whose headline feature is online play in
chess-style match rooms: a player creates a room, an opponent joins from a public
lobby or by invite link, and they duel live with a chess clock.

The game is original: its own cards, creatures, names and visuals. It borrows
genre mechanics only (fusing cards from hand, attack/defense positions, element
advantage).

A secondary goal is learning: every layer (rules, rooms, clock, sync) is written
by hand rather than taken from a multiplayer framework.

A specific learning goal is a rules engine that is fully independent of the GUI
and the network, so that bots can play complete matches headlessly for play-testing
and balancing.

## 2. Scope

### In version one

- Guest play with a nickname (no accounts, no database)
- Public lobby list and private invite-link rooms
- Chess clock per player, time control chosen by the room creator
- Deck builder over the full card pool
- Duel rules: creatures, fusion, positions, element advantage
- Reconnect to a match in progress
- Rematch in the same room
- Headless bots and a simulation command for play-testing (not playable online)

### Not in version one

Playing against a bot in a room, spectators, ratings, chat, card rewards or collections, spell/equip/trap
cards, accounts, persistence across server restarts, deployment setup, mobile layout.

## 3. Architecture

A pnpm TypeScript monorepo.

| Part | Job | Depends on |
|---|---|---|
| `packages/engine` | Duel rules as pure functions. No network, clock, or UI. | nothing |
| `packages/bots` | Bot interface, sample bots, and a headless match runner with a CLI. | engine |
| `packages/protocol` | Client/server message types and zod schemas. | engine types |
| `apps/server` | Node + `ws`: lobby, rooms, clocks, reconnects. Runs the engine. | engine, protocol |
| `apps/client` | React + Vite: screens and duel board. | protocol, engine card data |

Tooling: Node 22, TypeScript (strict), Vitest, plain CSS, React state with
reducers (no state library). `pnpm dev` starts server and client together.

The server is authoritative. Clients send intended actions; the server validates
them through the engine and sends each player a view containing only what that
player may see.

The engine imports nothing from any other part and uses no DOM, network, timer,
or wall-clock API. The GUI, the server, and the bots are three independent
consumers of the same engine API.

Build order: engine, then bots, then protocol and server, then client.

## 4. Rules engine (`packages/engine`)

### 4.1 Cards

About 60 creatures in a data file. Each card:

```ts
type Card = {
  id: string;
  name: string;
  element: Element;      // one of six
  tags: Tag[];           // 1-2 kinds, e.g. "beast", "dragon", "warrior"
  atk: number;
  def: number;
  fusionOnly: boolean;   // true: cannot be put in a deck
};
```

- About 40 base cards (deck-legal), ATK at most 1800.
- About 20 fusion-only cards, ATK from 1900 to 3000.
- Stats are multiples of 100.

Elements form a ring; each beats the next:
Flame → Forest → Wind → Earth → Thunder → Water → Flame.

### 4.2 Decks

A deck is valid when it has exactly 30 cards, no fusion-only cards, and at most
3 copies of any card.

### 4.3 Match setup

`createMatch(deckA, deckB, seed)` shuffles both decks with a seeded RNG, picks the
first player from the seed, sets both players to 4000 life points, and starts the
first player's turn.

### 4.4 Turn

1. **Draw:** the active player draws until they hold 5 cards. If the deck cannot
   supply the cards needed, that player loses.
2. **Actions**, in any order:
   - `PLAY` at most once per turn
   - `SET_POSITION` at most once per creature per turn, not after it attacked
   - `ATTACK` at most once per creature per turn
3. `END_TURN` passes play to the opponent.

`SURRENDER` is legal for either player at any time.

All creatures on the field are face-up. Hidden information is limited to hands
and deck order.

### 4.5 Playing and fusing

`PLAY { handIndexes: number[], slot: 0-4, position: "attack" | "defense" }`

- `handIndexes` lists 1 or more distinct hand cards in the order chosen.
- If the slot is empty, the materials are the hand cards.
- If the slot holds the player's own creature, that creature is the first
  material, followed by the hand cards.
- Materials fuse left to right: the result of each pair becomes the left side of
  the next pair.
- The final card is placed in the slot in the chosen position.

Fusing a pair (A, B):

- Fusion rules are a table of `{ a: Tag, b: Tag, results: CardId[] }`, matched in
  either order against the tags of A and B.
- Among all results of matching rules, choose the card with the lowest ATK that is
  strictly greater than the ATK of both A and B. Ties break by card id.
- If there is no such card, the fusion fails: A is discarded and B stands in its
  place.

`previewPlay(state, player, action)` returns the card that would result, so the
client can show it before the player confirms.

### 4.6 Battle

`ATTACK { attackerSlot, target: slot | "direct" }`

- The attacker must be in attack position.
- The first player cannot attack on the first turn of the match.
- A creature may attack on the turn it was played.
- `"direct"` is legal only when the opponent has no creatures; damage equals the
  attacker's ATK.
- Element advantage: if one creature's element beats the other's, it gets +500 ATK
  and +500 DEF for this battle only.

Against a target in attack position (compare ATK to ATK):

- Higher wins: the loser is destroyed and its owner takes the difference.
- Equal: both are destroyed, no damage.

Against a target in defense position (compare attacker ATK to target DEF):

- ATK higher: target destroyed, no damage.
- ATK lower: nothing destroyed, the attacker's owner takes the difference.
- Equal: nothing happens.

### 4.7 Ending

A match ends when a player reaches 0 life points, cannot draw, surrenders, or is
flagged on time by the server (`applyTimeout(state, player)`).

### 4.8 API

```ts
createMatch(deckA, deckB, seed): MatchState
applyAction(state, player, action): { ok: true, state, events } | { ok: false, error }
previewPlay(state, player, action): Card | { error }
applyTimeout(state, player): { state, events }
viewFor(state, player): PlayerView   // own hand; opponent hand size; both fields,
                                     // life points, deck sizes; turn; result
validateDeck(cardIds): { ok: true } | { ok: false, error }
legalActions(state, player): Action[]   // every action applyAction would accept now
```

`legalActions` returns an empty list for the player who is not on turn, except
that `SURRENDER` is never listed (it is always legal and never useful to a bot).
For `PLAY` it enumerates every ordered selection of hand cards, target slot and
position. Every action it returns must be accepted by `applyAction`, and every
action `applyAction` accepts (other than `SURRENDER`) must be in the list.

State is immutable from the caller's side. `events` (drew, played, fused, fusion
failed, attacked, destroyed, damage, turn ended, match ended) drive the client's
event log and animations. The same seed and action list always produce the same
match.

## 5. Bots and simulation (`packages/bots`)

### 5.1 Bot interface

```ts
type Bot = {
  name: string;
  buildDeck(cards: Card[], rng: Rng): CardId[];
  chooseAction(view: PlayerView, legal: Action[], rng: Rng): Action;
};
```

A bot sees only its `PlayerView`, the same information a human player gets, so it
cannot cheat by reading the opponent's hand or deck order. It must return one of
the `legal` actions. Bots receive a seeded RNG and must not use `Math.random`, so
simulations are reproducible.

### 5.2 Sample bots

- `random`: a random valid deck; picks a uniformly random legal action.
- `greedy`: plays the highest-ATK result available, attacks whenever the battle
  is favourable or the opponent's field is empty, otherwise ends the turn.

New bots are added as one file each implementing `Bot`.

### 5.3 Match runner

`runMatch(botA, botB, seed, { maxTurns })` builds both decks, creates the match
and loops: compute `legalActions`, ask the bot on turn, `applyAction`. It returns
the winner, the reason, the turn count and the full action list. An illegal
action from a bot, or reaching `maxTurns` (default 200), ends the match as an
error result rather than throwing. There is no clock in simulation.

### 5.4 CLI

`pnpm sim --a greedy --b random --games 1000 --seed 1` runs matches with seeds
`seed`, `seed+1`, ... alternating which bot is passed first, and prints: wins per
bot, win rate of the player who moved first, average and maximum turns, wins by
reason (life points, deck-out), error count, and the cards most often played and
most often produced by fusion. `--replay <seed>` prints the event log of a single
match.

## 6. Protocol (`packages/protocol`)

JSON messages over one WebSocket, each `{ type, ...payload }`, validated with zod
on the server.

Client to server: `hello { token, nickname }`, `lobby.subscribe`,
`lobby.unsubscribe`, `room.create { visibility, minutes }`, `room.join { code }`,
`room.leave`, `room.ready { deck }`, `room.unready`, `match.action { action }`,
`match.preview { action }`, `room.rematch`.

Server to client: `welcome`, `lobby.rooms { rooms }`, `room.state { room }`,
`match.view { view, events, clocks }`, `match.preview { card }`,
`error { code, message }`.

## 7. Server (`apps/server`)

### 7.1 Identity

The client generates a random token, stores it in `localStorage`, and sends it
with a nickname (1-16 characters) in `hello`. The token identifies the player
across reconnects. It is never sent to other players.

### 7.2 Lobby

Subscribed clients receive the list of public rooms in `waiting` status (code,
creator nickname, time control) whenever it changes.

### 7.3 Rooms

Options at creation: visibility (`public` | `private`) and time control (5, 10, or
15 minutes per player). Each room has a short random code and is reachable at
`/room/<code>`. Private rooms never appear in the lobby.

Lifecycle:

- `waiting`: creator alone. Deleted if the creator is disconnected for 60 seconds.
- `ready-check`: two players present. Each submits a deck (validated by the
  engine) and marks ready. A player leaving returns the room to `waiting`.
- `playing`: a match is running. Nobody else can join.
- `finished`: result shown. If both players send `room.rematch`, a new match
  starts with the same options and a new seed. Deleted when both leave or after
  10 idle minutes.

A third player trying to join a full room gets an error.

### 7.4 Clock

Each player has a time bank in milliseconds. The server records when the current
turn started; when the turn ends, elapsed time is subtracted from that player's
bank. A timer is scheduled for the moment the active player's bank reaches zero;
when it fires, the server calls `applyTimeout` and ends the match. Every
`match.view` carries both banks and the server timestamp of the turn start;
clients only render a countdown.

### 7.5 Reconnect

On disconnect the match continues and the player's clock keeps running on their
turn. A `hello` with the same token followed by `room.join` on the same code
re-attaches the socket and re-sends the current room state and match view. A new
connection with the same token replaces the old one.

### 7.6 Errors

- Message fails schema validation: dropped, `error` returned.
- Action illegal per the engine, or sent out of turn: `error` to that player,
  state unchanged.
- Unknown room code, full room, invalid deck: `error` with a specific code.

All room and match state is held in memory and lost on restart.

## 8. Client (`apps/client`)

| Screen | Contents |
|---|---|
| Home | Nickname entry |
| Lobby | Public room list, create-room form (visibility, time control), deck builder link |
| Deck builder | Card pool with element and tag filters, current deck, validity status; decks saved in `localStorage` |
| Room | Invite link, both players, deck choice, ready button |
| Duel | Both fields (5 slots each), own hand, opponent hand count, life points, deck counts, both clocks, fusion preview before confirming a play, event log, surrender |
| Result | Winner and reason, rematch and leave buttons |

Routes: `/`, `/decks`, `/room/<code>`. Opening a room link without a nickname
asks for one, then joins.

The client holds no rules logic beyond card data for display; every board state
comes from `match.view`. A dropped socket shows a reconnecting banner and retries.

Card art is a generated placeholder: element colour and an icon per tag.

## 9. Testing

- **Engine:** Vitest unit tests for deck validation, drawing and deck-out, every
  play and fusion case (success, failure, chain, onto a field creature), every
  battle outcome including element bonus and equal values, action limits per
  turn, all win conditions, `viewFor` hiding the opponent's hand and deck order,
  and determinism for a fixed seed.
- **Engine property test:** many random-bot matches across seeds; every action
  from `legalActions` is accepted, every match terminates, and life points, hand
  sizes and card counts stay within their invariants.
- **Bots:** `runMatch` is deterministic for a fixed seed, reports an illegal bot
  action as an error result, and stops at `maxTurns`.
- **Server:** integration tests with two real WebSocket clients against an
  in-process server: create and join (public and by code), lobby updates, ready
  check with an invalid deck, a full short match, illegal and out-of-turn
  actions, timeout (with injected fake time), reconnect mid-match, rematch, and
  room cleanup.
- **Client:** manual play in two browser tabs.

The server takes its clock and timer functions as injected dependencies so tests
can control time.
