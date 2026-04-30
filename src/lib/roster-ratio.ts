export const RATIO_THRESHOLD = 13;
const WARNING_FRACTION = 0.85;

export type RatioStatus = "none" | "ok" | "warning" | "breach";

export interface RatioResult {
  status: RatioStatus;
  ratio: number | null;
  message: string;
}

/** Format ratio to 1 decimal place, dropping trailing ".0" (e.g. 10 → "10", 10.5 → "10.5"). */
function fmt(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  return String(rounded);
}

export function computeRatio(staffCount: number, childrenCount: number): RatioResult {
  if (childrenCount === 0) return { status: "none", ratio: null, message: "No children — no coverage needed" };
  if (staffCount === 0) return { status: "breach", ratio: Infinity, message: "No staff rostered" };
  const ratio = childrenCount / staffCount;
  if (ratio > RATIO_THRESHOLD) return { status: "breach", ratio, message: `${fmt(ratio)}:1 exceeds 1:${RATIO_THRESHOLD}` };
  if (ratio > RATIO_THRESHOLD * WARNING_FRACTION) return { status: "warning", ratio, message: `${fmt(ratio)}:1 near limit` };
  return { status: "ok", ratio, message: `${fmt(ratio)}:1 within limit` };
}
