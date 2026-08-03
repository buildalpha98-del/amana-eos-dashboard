import { z } from "zod";

const HHMM = /^\d{2}:\d{2}$/;

/**
 * A price within a room.
 *
 * Rooms don't have one price. A centre charges differently for the full
 * session and a short one, and the short session is a different window
 * of the same room — so a tier carries its own optional start/end rather
 * than being a bare number hanging off the room.
 *
 * Money in CENTS. Session fees get multiplied by attendance and compared
 * against CCS, and floats and money don't mix.
 */
export const feeTierSchema = z.object({
  /** Stable across edits so reordering doesn't rewrite the wrong row. */
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  start: z.string().regex(HHMM).optional(),
  end: z.string().regex(HHMM).optional(),
  amountCents: z.number().int().min(0).max(1_000_00),
});
export type FeeTier = z.infer<typeof feeTierSchema>;

const roomSchema = z.object({
  /**
   * What this centre calls the room — "Rise and Shine", "Amana
   * Afternoons". The KEY (bsc/asc/vc) stays fixed: it's written into
   * every Booking, attendance record and fortnight pattern in the
   * system. Only the label a human reads is per-service.
   */
  label: z.string().trim().min(1).max(60).optional(),
  start: z.string().regex(HHMM),
  end: z.string().regex(HHMM),
  fees: z.array(feeTierSchema).max(12).optional(),
});

// ── sessionTimes ────────────────────────────────────────────
export const sessionTimesSchema = z
  .object({
    bsc: roomSchema.optional(),
    asc: roomSchema.optional(),
    vc: roomSchema.optional(),
  })
  .partial();
export type SessionTimes = z.infer<typeof sessionTimesSchema>;
export type SessionKey = "bsc" | "asc" | "vc";

/**
 * What a room is called and when it runs before anyone configures it.
 *
 * These are Amana's names, not generic ones: staff and parents say "Rise
 * and Shine", never "BSC". A service can override any of them.
 */
export const DEFAULT_ROOMS: Record<
  SessionKey,
  { label: string; start: string; end: string }
> = {
  bsc: { label: "Rise and Shine", start: "06:30", end: "09:00" },
  asc: { label: "Amana Afternoons", start: "15:00", end: "18:30" },
  vc: { label: "Holiday Quest", start: "07:00", end: "18:00" },
};

export const SESSION_KEYS: SessionKey[] = ["bsc", "asc", "vc"];

/** "06:30" → "6:30am". Blank input gives blank output, not "NaN". */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm || !HHMM.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** The room's name for this service, falling back to the Amana default. */
export function roomLabel(
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): string {
  return sessionTimes?.[key]?.label?.trim() || DEFAULT_ROOMS[key].label;
}

/** "Rise and Shine (6:30am – 9:00am)" — the form parents read it in. */
export function roomLabelWithTimes(
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): string {
  const room = sessionTimes?.[key];
  const start = formatTime(room?.start ?? DEFAULT_ROOMS[key].start);
  const end = formatTime(room?.end ?? DEFAULT_ROOMS[key].end);
  const name = roomLabel(sessionTimes, key);
  return start && end ? `${name} (${start} – ${end})` : name;
}

/** Fee tiers configured for a room, cheapest first. */
export function roomFees(
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): FeeTier[] {
  const fees = sessionTimes?.[key]?.fees ?? [];
  return [...fees].sort((a, b) => a.amountCents - b.amountCents);
}

// ── casualBookingSettings ───────────────────────────────────
const dayEnum = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const sessionSettingSchema = z.object({
  enabled: z.boolean(),
  fee: z.number().nonnegative(),
  spots: z.number().int().nonnegative(),
  cutOffHours: z.number().int().nonnegative(),
  days: z.array(dayEnum),
});
export const casualBookingSettingsSchema = z.object({
  bsc: sessionSettingSchema.optional(),
  asc: sessionSettingSchema.optional(),
  vc: sessionSettingSchema.optional(),
});
export type CasualBookingSettings = z.infer<typeof casualBookingSettingsSchema>;

// ── Child.bookingPrefs.fortnightPattern ─────────────────────
const daysByTypeSchema = z.object({
  bsc: z.array(dayEnum).optional(),
  asc: z.array(dayEnum).optional(),
  vc: z.array(dayEnum).optional(),
});
export const fortnightPatternSchema = z.object({
  week1: daysByTypeSchema,
  week2: daysByTypeSchema,
});
export type FortnightPattern = z.infer<typeof fortnightPatternSchema>;

// The broader bookingPrefs may have other keys (legacy); use .passthrough()
// when parsing a complete bookingPrefs blob so we don't drop unknown fields.
export const bookingPrefsSchema = z
  .object({
    fortnightPattern: fortnightPatternSchema.optional(),
  })
  .passthrough();
export type BookingPrefs = z.infer<typeof bookingPrefsSchema>;
