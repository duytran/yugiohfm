# CLAUDE.md

## Project

An original browser card-duel game with online play in chess-style match rooms
(lobby, invite links, chess clock). It borrows genre mechanics only; all cards,
names and art are our own. It is also a learning project: the rules engine is
independent of the GUI and network so bots can play-test it headlessly.

**Status:** design and planning only. No code exists yet.

## Read first

| File | What it is |
|---|---|
| `docs/specs/2026-11-12-online-card-duel-design.md` | The approved design. |
| `docs/plans/2026-11-12-engine-and-bots.md` | Plan 1 of 3: rules engine and bots. |
| `docs/plans/2026-11-12-protocol-and-server.md` | Plan 2 of 3: protocol and game server. |
| `docs/plans/2026-11-12-browser-client.md` | Plan 3 of 3: browser client. |
| `docs/ddr/` | Design decision records. Read the ones that cover the area you are about to change; their "Constraints & Rules" are binding. |
| `HISTORY.md` | Log of every action on the project. |

## Rules

### Keep HISTORY.md up to date

After every action (a decision, a document, a code change, a fix, a config
change), append one line to `HISTORY.md` under today's date, creating the
`## YYYY-MM-DD` heading if it is missing. Use the format at the top of that
file. Put the line in the same commit as the change. Never rewrite or delete
old entries; add a new line that corrects them.

### Follow the design decision records

- Rules live only in `packages/engine`; it imports nothing and uses no clock,
  timer, `Math.random`, DOM or network API (DDR-0001, DDR-0002).
- The server is authoritative and sends only per-player views (DDR-0003).
- No multiplayer framework, database or auth library without changing the
  relevant DDR first (DDR-0004, DDR-0005).
- Bots see only a `PlayerView` and use `@duel/engine`'s public API (DDR-0006).
- The chess clock belongs to the server, not the engine (DDR-0007).
- All game content is original; never add names, cards or art from an existing
  game (DDR-0008).

When a decision changes, edit its DDR in place and log the change in
`HISTORY.md`.

### Working style

- Do not write code until the owner asks for it; planning comes first.
- Implement plans task by task, test first, one commit per task.

## Commands

Available once plan 1, task 1 is implemented:

- `pnpm test` runs every test.
- `pnpm typecheck` runs `tsc --noEmit`.
- `pnpm vitest run <file>` runs one test file.
- `pnpm sim --a greedy --b random --games 100` runs bot matches (after plan 1, task 14).
- `pnpm dev` starts the server on :8787 (after plan 2) and the client on :5173 (after plan 3).
