import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARDS,
  FIELD_SLOTS,
  HAND_SIZE,
  STARTING_LIFE,
  applyAction,
  createMatch,
  createRng,
  eventsFor,
  legalActions,
  opponent,
  validateDeck,
  viewFor,
  type Action,
  type CardId,
  type GameEvent,
  type MatchState,
  type Rng,
} from "../src/index";

const BASE = CARDS.filter((c) => !c.fusionOnly);

function randomDeck(rng: Rng): CardId[] {
  const deck: CardId[] = [];
  while (deck.length < 30) {
    const id = BASE[rng.int(BASE.length)]!.id;
    if (deck.filter((c) => c === id).length < 3) deck.push(id);
  }
  return deck;
}

function checkInvariants(state: MatchState): void {
  for (const p of state.players) {
    expect(p.lifePoints).toBeGreaterThanOrEqual(0);
    expect(p.lifePoints).toBeLessThanOrEqual(STARTING_LIFE);
    expect(p.hand.length).toBeLessThanOrEqual(HAND_SIZE);
    expect(p.field).toHaveLength(FIELD_SLOTS);
    const onField = p.field.filter((c) => c !== null).length;
    expect(p.deck.length + p.hand.length + onField).toBeLessThanOrEqual(30);
  }
}

/** No player ever sees the card of an opponent's face-down creature. */
function checkHidden(state: MatchState, events: GameEvent[]): void {
  for (const viewer of [0, 1] as const) {
    const them = opponent(viewer);
    const view = viewFor(state, viewer);
    state.players[them].field.forEach((creature, slot) => {
      if (creature?.faceDown) expect(view.opponent.field[slot]).toEqual({ hidden: true, position: creature.position });
    });
    const seen = eventsFor(events, viewer);
    seen.forEach((event, i) => {
      if (event.type === "played" && event.player === them && event.faceDown) {
        expect(event.cardId).toBeNull();
        const before = seen[i - 1];
        expect(before?.type === "fused" || before?.type === "fusion-failed" ? before.player : null).not.toBe(them);
      }
    });
  }
}

/** Plays a whole match with uniformly random legal actions. */
function playRandomMatch(seed: number): { state: MatchState; actions: Action[] } {
  const rng = createRng(seed);
  let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
  const actions: Action[] = [];
  while (!state.result) {
    const legal = legalActions(state, state.active);
    expect(legal.length).toBeGreaterThan(0);
    const action = legal[rng.int(legal.length)]!;
    const result = applyAction(state, state.active, action);
    if (!result.ok) throw new Error(`legal action rejected: ${result.error} ${JSON.stringify(action)}`);
    state = result.state;
    actions.push(action);
    checkInvariants(state);
    checkHidden(state, result.events);
    if (actions.length > 5000) throw new Error(`match did not end (seed ${seed})`);
  }
  return { state, actions };
}

describe("random matches", () => {
  it("random decks are valid", () => {
    expect(validateDeck(randomDeck(createRng(1)))).toEqual({ ok: true });
  });

  it("200 random matches all end, keep their invariants, and never reject a legal action", () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = playRandomMatch(seed);
      reasons.add(state.result!.reason);
    }
    expect(reasons.has("deck-out") || reasons.has("life-points")).toBe(true);
    // 200 matches with the hidden-information check on every action take about 5 s
  }, 60_000);

  it("replaying the same seed gives the same actions and the same final state", () => {
    expect(playRandomMatch(77)).toEqual(playRandomMatch(77));
  });
});

describe("engine independence", () => {
  const SRC = join(__dirname, "..", "src");
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts"));

  it("imports only its own files", () => {
    for (const file of files) {
      const source = readFileSync(join(SRC, file), "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        expect(match[1]!.startsWith("./"), `${file} imports ${match[1]}`).toBe(true);
      }
    }
  });

  it("uses no clock, timer, randomness, DOM or network API", () => {
    const banned = /\b(Date\b|setTimeout|setInterval|Math\.random|performance\.|window\.|document\.|fetch\(|WebSocket|process\.)/;
    for (const file of files) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect(banned.test(source), `${file} uses a banned API`).toBe(false);
    }
  });
});
