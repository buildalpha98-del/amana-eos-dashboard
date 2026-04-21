import { z } from "zod";

// ── sessionTimes ────────────────────────────────────────────
export const sessionTimesSchema = z
  .object({
    bsc: z
      .object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .optional(),
    asc: z
      .object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .optional(),
    vc: z
      .object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .optional(),
  })
  .partial();
export type SessionTimes = z.infer<typeof sessionTimesSchema>;

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
