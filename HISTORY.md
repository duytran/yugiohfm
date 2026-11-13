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
- **[decision]** Owner answered "ok" to the five face-down questions, read as accepting every proposal: a surviving target is turned face-up; Guard is off and Rally on while face-down; never back to face-down, but a play onto a hidden creature may stay hidden; a free `REVEAL` action; a hidden creature's position is public. The same "ok" confirmed that effective stats arrive inside the view (DDR-0010).
- **[docs]** Marked `docs/specs/2026-11-13-face-down-play-design.md` approved. Edited DDR-0003: before, it said never put one player's information in a `GameEvent` because events go to both players; now events are filtered per player by the engine's `eventsFor`, because face-down play needs events that differ per player. Edited DDR-0010: before, it banned any arithmetic on stats outside the engine; narrowed to working out current values and battle results, so bots may still score options.
- **[docs]** Wrote `docs/plans/2026-11-13-tactics-phase-0-measurement.md`: nine tasks (fusion cache, rules per match, view creatures with effective stats, battle outcome and `previewAttack`, deck builders and simulator flags, wide bot, smart bot, comeback/lead-change/fusion-share measures, baseline run). A profile showed about 85% of simulator time in `fusePair`; a trial cache took 20 matches from 9.1 s to 1.0 s with identical output (trial code not kept). Not approved; no issues created yet.
- **[decision]** Owner approved `docs/plans/2026-11-13-tactics-phase-0-measurement.md` and asked for it to be implemented.
- **[chore]** Created the milestone "Tactics phase 0: Measurement", the label `tactics-phase-0` and issues #41 to #49, one per plan task; listed them in the plan's `Revisions`. Work is on the branch `feat/tactics-phase-0`, one commit per task.

- **[code]** fusePair now remembers its results; 20 greedy-vs-greedy matches went from about 9 s to about 1 s with identical output (tactics phase 0, task 1, #41).
- **[code]** Rule settings are now a Rules object stored in each match (createMatch takes overrides; views carry it); ELEMENT_BONUS became DEFAULT_RULES.elementBonus so one simulator run can compare values (tactics phase 0, task 2, DDR-0009, #42).
- **[code]** Views now have their own creature type, ViewCreature, carrying effective ATK and DEF from the new engine function effectiveStats (printed values for now) (tactics phase 0, task 3, DDR-0010, #43).
- **[code]** Added battleOutcome, shared by resolveAttack and the new public previewAttack(view, action); a direct attack now goes through effectiveStats; battleValues left the public API and the greedy bot uses previewAttack (tactics phase 0, task 4, DDR-0010, #44).
- **[code]** Decks are now separate from bots (decks.ts: strongest, random and six element decks; withDeck), runMatch takes rule overrides, and pnpm sim gained --deck-a, --deck-b and --element-bonus, so the same bot can be compared across decks and settings (tactics phase 0, task 5, #45).
- **[code]** Added the wide bot: fills the field with single cards before fusing; the "wide" baseline against the greedy "tall" one. Under the current rules it lost 50 of 50 matches to greedy, as expected (tactics phase 0, task 6, #46).
- **[code]** Added the smart bot: scores every attack with the engine previewAttack and manages positions. Its play choice differs from the plan: the planned "fewest cards that beat the threat" lost to greedy 23 of 100, so it now picks the play with the best attack by preview, else a creature the threat cannot destroy; it wins about 70% against greedy. Recorded in the plan Revisions (tactics phase 0, task 7, #47).
- **[code]** pnpm sim now reports comebacks (winner was 2000+ life points behind), lead changes per match and the fusion share of plays, all computed from recorded events; bot names in the wins table are padded to 18 characters so "bot/deck" names line up (tactics phase 0, task 8, #48).
- **[docs]** Recorded the phase 0 baseline in docs/specs/2026-11-13-tactics-rules-design.md (two of eight targets met under the plan 1 rules: turns and first-player rate; tall beats wide 100%, fusion share 99.6%, comebacks 11.4%) and updated the engine high-level design, DDR-0006, DDR-0010 and CLAUDE.md to match the code (tactics phase 0, task 9, #49).
- **[chore]** Pushed `feat/tactics-phase-0` and opened PR #50 to `main` (closes #41 to #49).
- **[docs]** Wrote `docs/plans/2026-11-13-tactics-phase-1-positions-and-plays.md`: three tasks (R1 free position changes, R2 plays per turn as the rule setting `playsPerTurn`, measurement and docs). Planning decisions in it: a PLAY onto a creature that already attacked is rejected unless it keeps that creature's position; `playsPerTurn` is 1 to 5, where 5 stands for unlimited; `runMatch` stops after `maxActions`. Not approved; no issues yet.
- **[decision]** Owner approved `docs/plans/2026-11-13-tactics-phase-1-positions-and-plays.md` after PRs #40 and #50 were merged, and asked for it to be implemented.
- **[chore]** Created the milestone "Tactics phase 1: Positions and plays", the label `tactics-phase-1` and issues #51 to #53, one per plan task; listed them in the plan's `Revisions`. Work is on the branch `feat/tactics-phase-1`.
- **[code]** R1: a creature may change position any number of times until it attacks (positionChanged removed), and a PLAY onto a creature that already attacked must keep its position, which closes the attack-then-fuse-into-defense hole; runMatch now stops after maxActions (tactics phase 1, task 1, #51).
- **[code]** R2: plays per turn is now the rule setting playsPerTurn (default 2, 1 to 5); hasPlayed became the counter playsUsed in the state and the view; pnpm sim gained --plays (tactics phase 1, task 2, #52).
- **[docs]** Recorded the phase 1 results (plays per turn 1, 2 and 5) in docs/specs/2026-11-13-tactics-rules-design.md: R2 alone shortens matches to 6.9 turns, raises the first-player win rate to 60.0% and lowers comebacks from 11.4% to 4.8%, so the default stays at 2 until R3 is measured. Updated the approved spec Revisions, the engine high-level design, DDR-0009 and CLAUDE.md for R1 and R2 (tactics phase 1, task 3, #53).
- **[decision]** Owner: implement every tactics rule (R3 to R6) before plans 2 and 3, and plan all four phases now.
- **[decision]** Owner chose the order of a value: printed value, plus synergy, minus wear, never below 0 (the value the view shows), with the element bonus added in battle on top. Edited DDR-0009 in place; before, it said "base value, plus synergy, plus element bonus, minus wear, never below 0". Changed so every battle is "shown value + bonus", which a player can calculate. Recorded in the Revisions of docs/specs/2026-11-13-tactics-rules-design.md.
- **[decision]** Owner added the rule setting firstTurnPlays (plays on turn 1; default playsPerTurn, so nothing changes until a value is chosen) to answer the 60.0% first-player edge of phase 1. Added to the settings list of DDR-0009 and the tactics spec Revisions.
- **[docs]** Wrote docs/plans/2026-11-13-tactics-phase-2-wear.md (5 tasks: wear, previews that run the real battle code over a series of attacks, smart-bot gang-ups, firstTurnPlays, measurement), docs/plans/2026-11-13-tactics-phase-3-answer-traits.md (4 tasks: traits on cards, Venom and Pierce, Guard, answers deck and measurement), docs/plans/2026-11-13-tactics-phase-4-synergy.md (4 tasks: synergy traits and bonus settings, synergy in effectiveStats, viewAfterPlay and smart formations, themed decks and measurement) and docs/plans/2026-11-13-tactics-phase-5-face-down.md (5 tasks: face-down plays and REVEAL, battle and synergy, hidden views and eventsFor, bot probe and lure, measurement). Each plan lists its planning decisions, including which cards print which trait.
- **[chore]** Created the milestones "Tactics phase 2: Wear" to "Tactics phase 5: Face-down play", the labels tactics-phase-2 to tactics-phase-5 and issues #55 to #72, one per plan task; listed them in each plan's Revisions and in CLAUDE.md.
- **[code]** R3: a creature that survives a battle is worn by the attack value it withstood (times wearRatio, default 1) until the turn ends; new worn event; resolveAttack returns its outcome; pnpm sim gained --wear (tactics phase 2, task 1, DDR-0009, #55).
- **[code]** Previews now rebuild a state from the view and run resolveAttack itself, so they cannot disagree with the match; new previewAttacks previews a series of attacks with wear, losses and damage carried between them (tactics phase 2, task 2, DDR-0010, #56).
- **[code]** The smart bot plans gang-ups: up to 3 attacks on one target (weakest wearers, then a finisher), scored by previewAttacks over the whole series; with wear off it plays exactly as before (tactics phase 2, task 3, #57).
- **[code]** New rule setting firstTurnPlays (plays on turn 1, default playsPerTurn so nothing changes) read through playsAllowed; pnpm sim gained --first-plays, to measure the first-player edge found in phase 1 (tactics phase 2, task 4, #58).
- **[docs]** Recorded the phase 2 results (wear 0, 0.5, 1; first-turn plays 1 and 2) in docs/specs/2026-11-13-tactics-rules-design.md and brought the approved spec's Revisions, the engine high-level design, DDR-0009, DDR-0010 and CLAUDE.md in step with R3 (tactics phase 2, task 5, #59). Recommendation for the owner, not a decision: wearRatio 1 and firstTurnPlays 1.
- **[code]** Cards now carry printed traits: Venom, Guard and Pierce on nine base cards and three mid-ATK fusion results (Briar Stag, Iron Vanguard, Sky Lancer); no rule reads them yet (tactics phase 3, task 1, DDR-0009, #60).
- **[code]** R4: Venom (whatever destroys it in battle is destroyed too) and Pierce (destroying a defense-position creature deals the difference) are part of battleOutcome, so previews follow (tactics phase 3, task 2, DDR-0009, #61).
- **[code]** R4: Guard; while the opponent has a Guard creature in defense position, attacks must target a Guard (tactics phase 3, task 3, DDR-0009, #62).
- **[code]** Added traitDeck and the answers deck (every Venom, Guard and Pierce base card); recorded the phase 3 results in docs/specs/2026-11-13-tactics-rules-design.md (R4 moves no headline measure; the answers deck loses 75% to 78% to the strongest deck because a fusion keeps no trait) and brought the approved spec's Revisions, the engine high-level design, DDR-0009 and CLAUDE.md in step with R4 (tactics phase 3, task 4, #63).
- **[code]** Banner, Pack and Rally printed on 14 base cards and 2 fusion results (one Banner per element); their bonuses are the rule settings bannerBonus 300, packBonus 200, rallyBonus 500; pnpm sim gained --banner, --pack, --rally; no rule reads them yet (tactics phase 4, task 1, DDR-0009, #64).
- **[code]** R5: effectiveStats adds Banner (+300 to sharing neighbours), Pack (+200 per sharing own creature) and Rally (+500 while behind) before wear; views, battles and previews follow, so losing a Banner changes the next battle (tactics phase 4, task 2, DDR-0009, DDR-0010, #65).
- **[code]** New engine function viewAfterPlay (the board after a play, by the real play code); the smart bot ranks plays by its whole board after the play, so it builds Banner and Pack formations (tactics phase 4, task 3, DDR-0010, #66).
- **[code]** Added tagDeck, the synergy deck and one deck per tag; recorded the phase 4 results in docs/specs/2026-11-13-tactics-rules-design.md (R5 has almost no effect: flame wins 54.6% with every bonus at 0 and 55.6% with them on; themed decks fuse their synergy cards away) and brought the approved spec's Revisions, the engine high-level design, DDR-0009, DDR-0010 and CLAUDE.md in step with R5 (tactics phase 4, task 4, #67).
