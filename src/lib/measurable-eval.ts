/**
 * Shared measurable goal evaluation — extracted from the auto-measurables
 * cron (2026-08-08) so the marketing-measurables cron applies identical
 * on-track semantics. Both auto-feed crons import this; keep it the single
 * source of truth for goal-direction maths.
 */
export function evaluateOnTrack(
  value: number,
  goalValue: number,
  goalDirection: string,
): boolean {
  switch (goalDirection) {
    case "above":
      return value >= goalValue;
    case "below":
      return value <= goalValue;
    case "exact":
      return Math.abs(value - goalValue) <= goalValue * 0.05; // 5% tolerance
    default:
      return value >= goalValue;
  }
}
