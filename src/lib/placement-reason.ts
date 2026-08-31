/**
 * Why a child sits at a particular service.
 *
 * A child enrolled at two centres has two Child rows. Without a reason
 * on the second one it reads as a duplicate — someone tidies it away, or
 * a coordinator counts them in a ratio they were never meant to be in.
 * "Bilal Ahmed (Holiday Quest)" answers the question on sight.
 *
 * Null means ordinary term care, which is the overwhelming majority, so
 * it stays unlabelled rather than adding noise to every roll.
 */

export const PLACEMENT_REASONS = [
  {
    value: "holiday_quest",
    label: "Holiday Quest",
    hint: "Vacation care at this centre only",
  },
  {
    value: "sibling_campus",
    label: "Sibling campus",
    hint: "Attends here because a sibling does",
  },
  { value: "casual", label: "Casual", hint: "Occasional, not a regular booking" },
  {
    value: "transferring",
    label: "Transferring",
    hint: "Moving here; still finishing at the other centre",
  },
  { value: "other", label: "Other", hint: "" },
] as const;

export type PlacementReason = (typeof PLACEMENT_REASONS)[number]["value"];

const LABELS = new Map(PLACEMENT_REASONS.map((r) => [r.value, r.label]));

/** Human label, or null for ordinary term care. */
export function placementReasonLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return LABELS.get(value as PlacementReason) ?? value;
}

/** "Amana OSHC Taqwa (Holiday Quest)" — the form staff read it in. */
export function serviceWithReason(
  serviceName: string | null | undefined,
  reason: string | null | undefined,
): string {
  const label = placementReasonLabel(reason);
  if (!serviceName) return label ? `(${label})` : "";
  return label ? `${serviceName} (${label})` : serviceName;
}

export function isPlacementReason(v: unknown): v is PlacementReason {
  return typeof v === "string" && LABELS.has(v as PlacementReason);
}
