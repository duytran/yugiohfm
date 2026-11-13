# CLAUDE.md

## Project

An original browser card-duel game with online play in chess-style match rooms
(lobby, invite links, chess clock). It borrows genre mechanics only; all cards,
names and art are our own. It is also a learning project: the rules engine is
independent of the GUI and network so bots can play-test it headlessly.

**Status:** plan 1 (engine and bots) is implemented, in `packages/engine` and `packages/bots`. Tactics phase 0 (measurement) is implemented; no tactics rule is implemented yet. Plans 2 and 3 (server, client) are written but not implemented; they will be revised once the tactics rules have changed the engine's shape, before plan 2 starts.

## Read first

| File | What it is |
|---|---|
| `docs/specs/2026-11-12-online-card-duel-design.md` | The approved design. |
| `docs/specs/2026-11-13-engine-high-level-design.md` | How the implemented engine works. |
| `docs/specs/2026-11-13-tactics-rules-design.md` | Approved rule changes: combination over raw stats. |
| `docs/specs/2026-11-13-face-down-play-design.md` | Approved: face-down play, for deception only. |
| `docs/plans/2026-11-12-engine-and-bots.md` | Plan 1 of 3: rules engine and bots. |
| `docs/plans/2026-11-12-protocol-and-server.md` | Plan 2 of 3: protocol and game server. |
| `docs/plans/2026-11-12-browser-client.md` | Plan 3 of 3: browser client. |
| `docs/plans/2026-11-13-tactics-phase-0-measurement.md` | Tactics phase 0: simulator, bots and measures. |
| `docs/ddr/` | Design decision records. Read the ones that cover the area you are about to change; their "Constraints & Rules" are binding. |
| `HISTORY.md` | Log of every action on the project. |

## Rules

### Project history rule

The docs in this repo are the project's memory. Every change must leave a
written trace, committed to git together with the change itself.

#### Where things go

| Path | Holds | File name |
|---|---|---|
| `docs/specs/` | Designs: what we are building and why | `YYYY-MM-DD-<topic>-design.md` |
| `docs/plans/` | Implementation plans made from a spec | `YYYY-MM-DD-<topic>.md` |
| `docs/ddr/` | Design decision records: one decision per file | `NNNN-<topic>.md`, numbered in order |
| `HISTORY.md` (repo root) | The running log of every action | single file |

#### What to do on every change

1. **Log it.** Append one line to `HISTORY.md` under today's date (create the
   `## YYYY-MM-DD` heading if missing), in the format at the top of that file.
   Do this for every action: a decision, a document, a code change, a fix, a
   config change, and edits to docs themselves. Name the doc or DDR involved
   in the line, e.g. `docs/ddr/0007-...` or `DDR-0007`.
2. **Record decisions.** If the change picks between options (stack, data
   model, a rule, a library, a way of working), write a new DDR or edit the one
   it changes. Use the `ddr` skill.
3. **Keep the spec and plans in step.** If the change alters behaviour the spec
   or a plan describes, update them in the same commit.
4. **Commit together.** The history line goes in the same commit as the change.
   A change without its history line is not finished.

#### Never lose the past

- **DDRs state what is true now.** When a decision changes, edit its DDR in
  place, and write in the `HISTORY.md` line what it said before and why it
  changed. Git keeps the old text.
- **Specs and plans are dated snapshots.** For a later redesign, write a new
  dated file and link back to the earlier one. Small corrections go in a
  `Revisions` section at the bottom of the file, with the date.
- **Do not delete specs or plans.** Mark them superseded, with a link to what
  replaced them.
- **`HISTORY.md` is append-only.** Never rewrite or delete old lines; add a new
  line that corrects them.

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
- Duel rules reward combination over raw stats; a rule value is accepted only
  by simulator results (DDR-0009).
- Only the engine works out effective ATK and DEF; views carry them (DDR-0010).

When a decision changes, edit its DDR in place and log the change in
`HISTORY.md`.

### Working style

- Do not write code until the owner asks for it; planning comes first.
- Implement plans task by task, test first, one commit per task.
- Always have a GitHub issue before starting to implement. Every plan task has
  one (#3 to #24 and #41 to #49, grouped in one milestone per plan). Work that has
  no issue gets one first. Say `Closes #N` in the commit or PR.

## Commands

Available now (plan 1):

- `pnpm test` runs every test.
- `pnpm typecheck` runs `tsc --noEmit`.
- `pnpm vitest run <file>` runs one test file.
- `pnpm sim --a smart --b greedy --games 100` runs bot matches. Bots: random, greedy, wide, smart. `--deck-a`/`--deck-b` pick a deck (strongest, random or an element); `--element-bonus` sets that rule.
- `pnpm dev` starts the server on :8787 (after plan 2) and the client on :5173 (after plan 3).
