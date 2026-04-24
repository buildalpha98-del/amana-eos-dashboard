/**
 * Red / Amber / Green threshold calculator for cockpit KPI tiles.
 *
 *   current >= target         → green
 *   floor <= current < target → amber
 *   current < floor           → red
 *
 * When `inverse` is true (metric should stay LOW — e.g. stale avatar count),
 * the comparison is flipped.
 */

export type RagStatus = "green" | "amber" | "red";

export type RagInput = {
  current: number;
  target: number;
  floor: number;
  inverse?: boolean;
};

export type RagMetric = {
  current: number;
  target: number;
  floor: number;
  status: RagStatus;
};

export function computeRag({ current, target, floor, inverse = false }: RagInput): RagStatus {
  if (inverse) {
    if (current <= target) return "green";
    if (current <= floor) return "amber";
    return "red";
  }
  if (current >= target) return "green";
  if (current >= floor) return "amber";
  return "red";
}

export function buildRagMetric(input: RagInput): RagMetric {
  return {
    current: input.current,
    target: input.target,
    floor: input.floor,
    status: computeRag(input),
  };
}
