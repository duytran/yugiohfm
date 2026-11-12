# DDR-0005: Players are guests and all server state is in memory

> **Status:** Accepted · **Last updated:** 2026-11-12
> No accounts and no database: a browser-generated token plus a nickname identifies a player; rooms and matches live in server memory.

## Context

Every card is available to every player, so there is no collection, currency or progress to store. Version one has no ratings or match history. The only thing identity is needed for is recognising a player who reconnects to their room.

## Decision

The client generates a random token, keeps it in `localStorage`, and sends it with a nickname in `hello`. The server keys players by token and holds rooms and matches in memory. Decks are saved in the browser.

## Rationale

**Decided on:** time to a playable online match, no operational burden, nothing worth persisting yet.

- **Rejected: accounts with a database** — needed only for collections, ratings or history, none of which exist in version one.
- **Rejected: an earned card collection** — would require accounts and a reward economy before online play is fun.
- **Rejected: identity by socket connection** — a dropped connection would lose the player's seat mid-match.

## Constraints & Rules

- **Always** identify a player by their token, never by socket or nickname.
- **Always** let a new connection with the same token replace the old one.
- **Never** send a player's token to any other client.
- **Never** add a database, ORM or auth library without changing this DDR first.
- **Never** assume state survives a server restart.

## Implementation

No code exists yet. See spec sections 7.1 and 7.5.

## Consequences

- **Positive:** nothing to deploy but one Node process; joining takes a nickname.
- **Negative / trade-off:** a restart ends every match, and a token copied from `localStorage` impersonates that guest — **mitigated by** nothing; accepted because there is nothing of value attached to a guest.
- **Known gap:** not implemented.

## Compliance

Review check: no persistence dependency in any `package.json`. A server test covers reconnecting with the same token mid-match.

## Revisit when

Ratings, match history, friends, or earned cards are added, or the server must keep matches across deploys.

## Related

- [DDR-0004](0004-hand-written-websocket-rooms.md) — the rooms these identities sit in.
