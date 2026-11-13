import { FUSION_RULES, getCard } from "./cards";
import type { Card, CardId } from "./types";

export type FusionStep = { a: CardId; b: CardId; result: CardId; success: boolean };

function matches(rule: { a: string; b: string }, x: Card, y: Card): boolean {
  const has = (card: Card, tag: string) => (card.tags as string[]).includes(tag);
  return (has(x, rule.a) && has(y, rule.b)) || (has(x, rule.b) && has(y, rule.a));
}

/** Results by "a|b". fusePair is pure over constant card data, so an answer never changes. */
const PAIR_CACHE = new Map<string, { result: CardId; success: boolean }>();

/**
 * Fuse a pair. Success: the lowest-ATK result of any matching rule whose ATK is
 * strictly above both inputs (ties broken by id). Failure: b stands, a is lost.
 */
export function fusePair(a: CardId, b: CardId): FusionStep {
  const key = `${a}|${b}`;
  let found = PAIR_CACHE.get(key);
  if (!found) {
    const cardA = getCard(a);
    const cardB = getCard(b);
    const floor = Math.max(cardA.atk, cardB.atk);
    const candidates = FUSION_RULES.filter((rule) => matches(rule, cardA, cardB))
      .flatMap((rule) => rule.results)
      .map(getCard)
      .filter((c) => c.atk > floor)
      .sort((x, y) => x.atk - y.atk || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const best = candidates[0];
    found = best ? { result: best.id, success: true } : { result: b, success: false };
    PAIR_CACHE.set(key, found);
  }
  return { a, b, result: found.result, success: found.success };
}

/** Fuse materials left to right. One material means no steps and itself as the result. */
export function fuseChain(materials: readonly CardId[]): { result: CardId; steps: FusionStep[] } {
  if (materials.length === 0) throw new Error("fuseChain needs at least one material");
  const steps: FusionStep[] = [];
  let current = materials[0]!;
  for (const next of materials.slice(1)) {
    const step = fusePair(current, next);
    steps.push(step);
    current = step.result;
  }
  return { result: current, steps };
}
