import type { Element, MatchState, PlayerId, Rules } from "./types";

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;
export const HAND_SIZE = 5;
export const FIELD_SLOTS = 5;
export const STARTING_LIFE = 4000;

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  elementBonus: 500,
  playsPerTurn: 2,
  firstTurnPlays: 2,
  wearRatio: 1,
  bannerBonus: 300,
  packBonus: 200,
  rallyBonus: 500,
});

/** DEFAULT_RULES with `overrides` applied, as a new object. Throws for an invalid value. */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules: Rules = {
    ...DEFAULT_RULES,
    // turn 1 has as many plays as any other turn unless the match says otherwise
    firstTurnPlays: overrides.playsPerTurn ?? DEFAULT_RULES.playsPerTurn,
    ...overrides,
  };
  for (const name of ["elementBonus", "bannerBonus", "packBonus", "rallyBonus"] as const) {
    if (!Number.isInteger(rules[name]) || rules[name] < 0) throw new Error(`invalid rule ${name}: ${rules[name]}`);
  }
  // the hand does not refill during a turn, so HAND_SIZE plays is as many as a turn can hold
  if (!Number.isInteger(rules.playsPerTurn) || rules.playsPerTurn < 1 || rules.playsPerTurn > HAND_SIZE) {
    throw new Error(`invalid rule playsPerTurn: ${rules.playsPerTurn}`);
  }
  if (!Number.isInteger(rules.firstTurnPlays) || rules.firstTurnPlays < 1 || rules.firstTurnPlays > rules.playsPerTurn) {
    throw new Error(`invalid rule firstTurnPlays: ${rules.firstTurnPlays}`);
  }
  if (!Number.isFinite(rules.wearRatio) || rules.wearRatio < 0 || rules.wearRatio > 1) {
    throw new Error(`invalid rule wearRatio: ${rules.wearRatio}`);
  }
  return rules;
}

/** Each element beats the one after it; the last beats the first. */
const RING: Element[] = ["flame", "forest", "wind", "earth", "thunder", "water"];

export function beats(a: Element, b: Element): boolean {
  return RING[(RING.indexOf(a) + 1) % RING.length] === b;
}

export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Why `player` may not act right now, or null if they may. */
export function turnError(state: MatchState, player: PlayerId): string | null {
  if (state.result) return "match is over";
  if (state.active !== player) return "not your turn";
  return null;
}

/** PLAY actions the active player may make this turn. Turn 1 is always the first player's. */
export function playsAllowed(state: MatchState): number {
  return state.turn === 1 ? state.rules.firstTurnPlays : state.rules.playsPerTurn;
}
