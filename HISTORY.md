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
- **[code]** Added match statistics, replay output and the `pnpm sim` command (plan 1, task 14, #16).
- **[docs]** Updated the status and commands in `CLAUDE.md`: plan 1 is implemented, so `pnpm test`, `pnpm typecheck` and `pnpm sim` all work (#16).

## 2026-11-13

- **[docs]** Wrote `docs/specs/2026-11-13-engine-high-level-design.md`: how the implemented engine works (module map, apply-action flow, fusion, battle, views, legal actions) with ASCII diagrams, plus four open questions.
- **[docs]** Wrote the draft proposal `docs/specs/2026-11-13-tactics-rules-design.md`: why the biggest fusion always wins (sim: greedy vs greedy averages 9.5 turns, one plan dominates) and four proposed rules (free position changes, two plays per turn, wear from ganging up, creature traits). Not approved; no decision recorded yet.
- **[docs]** Revised the draft `docs/specs/2026-11-13-tactics-rules-design.md` after the owner stated the goals (cards that complement each other beat raw power; comebacks from the brink). Added those two goals and the kept pillars (draw up to 5), changed fusion from losing traits to inheriting the last material's traits, added synergy traits R5 (Banner adjacency, Pack, Rally), rejected fixed draws and automatic losing bonuses, added themed-deck and comeback targets. Before, the draft only covered counters to big creatures.
- **[decision]** Tactics direction agreed by the owner: combination over raw stats, earned comebacks, trait inheritance through fusion, and slot adjacency. Still a draft spec; no DDR until a phase is approved.
- **[decision]** Owner settled four open questions of the tactics draft: a failed gang-up attack still costs life points; a fused creature has the traits printed on its result card (type + type picks the result, nothing is inherited); Banner and Pack count a shared tag or element; face-down play is part of the game for deception and gets its own spec.
- **[docs]** Updated `docs/specs/2026-11-13-tactics-rules-design.md` to match. Before, R4 said a fused creature inherits the last material's traits and fusion results print none; changed because the owner wants fusion to keep its existing type + type principle. Also added R6 (face-down direction) and `ELEMENT_BONUS` as an experiment setting.
- **[decision]** Owner settled three more points of the tactics draft: a face-down creature turns face-up when it attacks; plans 2 and 3 are revised for face-down play before plan 2 is implemented (not extended afterwards); matches should feel highly volatile and be decided by calculation.
- **[docs]** Updated `docs/specs/2026-11-13-tactics-rules-design.md`: reveal rule in R6, first-run simulator values (2 plays, wear ratio 1, element bonus 1000), comeback target raised from 15-30% to 20-35%, a lead-change target, and a next-steps section.
- **[decision]** Owner on face-down play: its only purpose is deception or luring an attack, with no other advantage; a face-down creature gives and receives no Banner or Pack bonus. Updated R6 of `docs/specs/2026-11-13-tactics-rules-design.md`. Before, R6 said being attacked does not turn a creature face-up; it now says the battle reveals it, as a reading of "no other advantage" that the owner still has to confirm.
- **[docs]** Reviewed plans 1 to 3 and the plan 1 code against the tactics draft. Findings: the engine architecture holds; rule settings must be per match; `battleValues` must work on view data; the view needs its own creature type; events need per-player filtering; decks must be separable from bots; plan 2 breaks only in `broadcastMatch`; plan 3 needs the most rework.
- **[decision]** Owner approved `docs/specs/2026-11-13-tactics-rules-design.md`. Wrote `docs/ddr/0009-tactics-combination-over-raw-stats.md`. Before, the spec was a draft with no DDR.
- **[decision]** Plans 2 and 3 are revised once, after the engine shape for the tactics rules is implemented, and before plan 2 starts. Before, the tactics spec said to revise them right after the face-down spec; changed to avoid revising them twice against types that do not exist yet.
- **[decision]** The card pool stays at 40 base cards until it has been tested in the simulator; themed decks are two-theme for now (recorded in DDR-0009).
- **[decision]** The engine determines effective ATK and DEF and the view carries them; the client never calculates. Wrote `docs/ddr/0010-engine-determines-effective-stats.md`.
- **[docs]** Updated `docs/specs/2026-11-13-tactics-rules-design.md` (status approved, `Revisions` with the new order and four phase 0 items), added a `Revisions` entry to `docs/specs/2026-11-12-online-card-duel-design.md`, and added the new specs and DDR-0009, DDR-0010 to `CLAUDE.md`.
- **[docs]** Wrote the draft `docs/specs/2026-11-13-face-down-play-design.md`: rules F1 to F11, what each player sees, a view-only creature type, per-player event filtering (`eventsFor`) and five open questions. Not approved.
