/**
 * Meal slots, in the order a day runs. ONE list for the menu editor, the
 * print view, the parent widgets and the API (2026-10-12).
 *
 * OSHC serves breakfast (Rise and Shine Club), afternoon tea and a late
 * snack; morning tea and lunch only on vacation-care days. The editor shows
 * the OSHC three by default and the other two once a week uses them.
 */
export const MEAL_SLOTS = [
  "breakfast",
  "morning_tea",
  "lunch",
  "afternoon_tea",
  "late_snack",
] as const;

export type MealSlotKey = (typeof MEAL_SLOTS)[number];

export const OSHC_SLOTS: readonly MealSlotKey[] = ["breakfast", "afternoon_tea", "late_snack"];

export const MEAL_SLOT_LABELS: Record<MealSlotKey, string> = {
  breakfast: "Breakfast",
  morning_tea: "Morning tea",
  lunch: "Lunch",
  afternoon_tea: "Afternoon tea",
  late_snack: "Late snack",
};

/** The OSHC slots plus any other slot this week actually uses, in day order. */
export function slotsInUse(items: { slot: string; description?: string | null }[]): MealSlotKey[] {
  const used = new Set(items.filter((i) => i.description?.trim()).map((i) => i.slot));
  return MEAL_SLOTS.filter((s) => OSHC_SLOTS.includes(s) || used.has(s));
}
