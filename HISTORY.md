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
