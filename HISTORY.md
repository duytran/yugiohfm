# History

A running log of every action taken on this project, oldest first. Add a line
after each action, in the same commit as the change it describes.

Format: `- **[type]** what was done, and why if it is not obvious.`
Types: `decision`, `docs`, `code`, `test`, `fix`, `chore`.

## 2026-11-12

- **[decision]** Project goal set: an original online card-duel game with chess-style match rooms; not a clone or reverse-engineering of an existing game.
- **[decision]** Platform: web browser.
- **[decision]** Room entry: public lobby list plus private invite links.
- **[decision]** Card access: full pool for everyone, guest play, no accounts or database.
- **[decision]** Time limit: chess clock per player, chosen by the room creator.
- **[decision]** Rules scope for version one: creatures, fusion and element advantage; no spell, equip or trap cards.
- **[decision]** Architecture: own WebSocket server with a shared rules engine, no multiplayer framework.
- **[docs]** Wrote the design spec `docs/specs/2026-11-12-online-card-duel-design.md`.
- **[decision]** Added a learning goal: the rules engine is independent of the GUI so bots can play-test headlessly.
- **[docs]** Added bots, `legalActions` and the `pnpm sim` simulator to the spec.
- **[decision]** No code yet: write the plan and the design decision records first.
- **[decision]** Split the work into three plans: (1) engine and bots, (2) protocol and server, (3) client. Plans 2 and 3 are written after the previous one is implemented.
- **[docs]** Wrote plan 1, `docs/plans/2026-11-12-engine-and-bots.md` (14 tasks). Its code was run in a scratch folder outside the repo first: 164 tests pass.
- **[docs]** Synced the spec with details fixed during planning: package names, a fused-onto creature keeps its attacked state, `createMatch` throws on an invalid deck, the `position set` event, the greedy bot's rule.
- **[docs]** Wrote design decision records `docs/ddr/0001` to `0008`.
- **[docs]** Added `HISTORY.md` and `CLAUDE.md`.
- **[decision]** Write plans 2 and 3 now instead of after plan 1 is implemented.
- **[docs]** Wrote plan 2, `docs/plans/2026-11-12-protocol-and-server.md` (4 tasks). Its code was run in scratch on top of plan 1: 49 server and 34 protocol tests pass.
- **[docs]** Wrote plan 3, `docs/plans/2026-11-12-browser-client.md` (4 tasks). Its code was run in scratch: 59 client tests pass, the build succeeds, and two headless Chrome players finished a match through the real server.
- **[fix]** Found while testing plan 3 in the browser: the clock briefly showed more time than the bank (10:01). The countdown now ignores display ticks older than the message.
- **[decision]** Planning details now in the spec: `welcome` carries the seated room, clocks are sent as remaining banks plus which one runs, ready is allowed while alone, leaving a running match is a surrender, `room.closed` message, close code 4000 for a replaced connection, 6-character room codes, a built-in starter deck.
- **[docs]** Updated DDR-0003, 0004, 0005 and 0007 to point at the planned files and tests.
- **[docs]** Updated plan 1's header to link plans 2 and 3.
- **[chore]** Pushed the first spec commit as `main` on GitHub and opened a pull request with the rest of the design, plans and DDRs.
- **[docs]** Expanded the history rule in `CLAUDE.md`, adapted from another project: a where-things-go table, the four steps for every change, and "never lose the past" (DDRs edited in place with the old text noted in the log, specs and plans as dated snapshots, `HISTORY.md` append-only). Before, it was one short paragraph.
- **[chore]** Created GitHub milestones "Plan 1: Engine and bots", "Plan 2: Protocol and server" and "Plan 3: Browser client" and 22 issues, #3 to #24, one per plan task, each linking its plan section.
- **[decision]** Always have a GitHub issue before starting to implement; added to the working style in `CLAUDE.md`.
- **[code]** Set up the pnpm workspace; added engine types, seeded RNG and rule constants (plan 1, task 1, #3).
- **[code]** Added the 60-card pool and the fusion rule table (plan 1, task 2, #4).
- **[code]** Added deck validation and the engine test helpers (plan 1, task 3, #5).
- **[code]** Added fusion of pairs and chains (plan 1, task 4, #6).
- **[code]** Added match creation, drawing and deck-out (plan 1, task 5, #7).
- **[code]** Added the PLAY action with fusion onto the field and preview (plan 1, task 6, #8).
- **[code]** Added the ATTACK action, element bonus and life-point win (plan 1, task 7, #9).
- **[code]** Added applyAction with SET_POSITION, END_TURN, SURRENDER and applyTimeout (plan 1, task 8, #10).
- **[code]** Added viewFor, which hides the opponent hand and both deck orders (plan 1, task 9, #11).
- **[code]** Added legalActions (plan 1, task 10, #12).
- **[code]** Added the engine public API, a 200-match random property test and the independence check (plan 1, task 11, #13).
- **[code]** Added the bots package with the Bot interface, a random bot and a greedy bot (plan 1, task 12, #14).
- **[code]** Added runMatch, which plays a whole match with no GUI, server or clock (plan 1, task 13, #15).
