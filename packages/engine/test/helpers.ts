import { CARDS } from "../src/cards";
import { DEFAULT_RULES, FIELD_SLOTS, STARTING_LIFE } from "../src/rules";
import type { CardId, Creature, MatchState, PlayerId, PlayerState, Position } from "../src/types";

/** A valid 30-card deck: 3 copies of each of the first 10 base cards. */
export function sampleDeck(): CardId[] {
  const base = CARDS.filter((c) => !c.fusionOnly).slice(0, 10);
  return base.flatMap((c) => [c.id, c.id, c.id]);
}

export function creature(cardId: CardId, position: Position = "attack"): Creature {
  return { cardId, position, hasAttacked: false, wear: 0 };
}

/** A field of FIELD_SLOTS slots with the given creatures at the given slot numbers. */
export function field(slots: Record<number, Creature> = {}): (Creature | null)[] {
  return Array.from({ length: FIELD_SLOTS }, (_, i) => slots[i] ?? null);
}

export function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return { deck: sampleDeck(), hand: [], field: field(), lifePoints: STARTING_LIFE, ...overrides };
}

/** A hand-built state for rule tests. Defaults: player 0 to act, turn 2, nothing played. */
export function makeState(
  overrides: Partial<Omit<MatchState, "players">> & { p0?: Partial<PlayerState>; p1?: Partial<PlayerState> } = {},
): MatchState {
  const { p0, p1, ...rest } = overrides;
  // cloned so a test that mutates the state never changes arrays shared with other tests
  return structuredClone({
    players: [player(p0), player(p1)],
    active: 0 as PlayerId,
    firstPlayer: 0 as PlayerId,
    turn: 2,
    playsUsed: 0,
    result: null,
    rules: { ...DEFAULT_RULES },
    ...rest,
  });
}
