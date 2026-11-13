import type { Element, MatchState, PlayerId, Rules } from "./types";

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;
export const HAND_SIZE = 5;
export const FIELD_SLOTS = 5;
export const STARTING_LIFE = 4000;

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ elementBonus: 500, playsPerTurn: 2, wearRatio: 1 });

/** DEFAULT_RULES with `overrides` applied, as a new object. Throws for an invalid value. */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules: Rules = { ...DEFAULT_RULES, ...overrides };
  if (!Number.isInteger(rules.elementBonus) || rules.elementBonus < 0) {
    throw new Error(`invalid rule elementBonus: ${rules.elementBonus}`);
  }
  // the hand does not refill during a turn, so HAND_SIZE plays is as many as a turn can hold
  if (!Number.isInteger(rules.playsPerTurn) || rules.playsPerTurn < 1 || rules.playsPerTurn > HAND_SIZE) {
    throw new Error(`invalid rule playsPerTurn: ${rules.playsPerTurn}`);
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
