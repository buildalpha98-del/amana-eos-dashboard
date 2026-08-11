import { z } from "zod";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";

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
  /**
   * What a CASUAL booking at this fee costs, when it differs from the
   * regular rate. Most centres charge more for a casual day because the
   * place wasn't committed to.
   */
  casualAmountCents: z.number().int().min(0).max(1_000_00).optional(),
  /**
   * The staff-discounted rate. Kept beside the others rather than as a
   * separate fee so a rate rise moves one row, not three.
   */
  staffAmountCents: z.number().int().min(0).max(1_000_00).optional(),
  /**
   * Retired without being deleted.
   *
   * Deleting a fee tier is destructive in a way that isn't obvious: a
   * scheduled rate change references it by id, the casual booking
   * settings may point at it, and a family disputing an invoice needs
   * the rate that was in force to still be readable. Archiving keeps all
   * of that intact and takes the fee off the list you work from.
   */
  archived: z.boolean().optional(),
  /**
   * When the fee was first added, ISO date. Optional because every fee
   * created before this field existed has no honest answer — showing a
   * back-filled "today" would be a lie about when the rate started.
   */
  addedAt: z.string().optional(),
  /**
   * Who last touched it, and when. The question that arrives when a
   * family disputes an invoice is "who put this rate up" — `ServiceFeeChange`
   * answers it for SCHEDULED changes, and this answers it for the ones
   * typed straight into the matrix.
   */
  updatedAt: z.string().optional(),
  updatedByName: z.string().max(120).optional(),
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
  /**
   * How many children this room can hold at once. Optional because most
   * centres run one number for the whole service — but a room that
   * carries its own capacity can be checked against approved places and
   * against the educators its ratio demands (see room-configuration.ts).
   */
  capacity: z.number().int().min(0).max(500).optional(),
  /**
   * Minimum educator:child ratio for this room, "1:15" style. Omitted
   * means the service (or federal) default applies — a room should not
   * silently carry a looser ratio than the service it sits in.
   */
  ratio: z
    .string()
    .regex(/^\d+:\d+$/, "Ratio looks like 1:15")
    .optional(),
  /** What this room is for, in a line. Shown to staff, not families. */
  description: z.string().trim().max(200).optional(),
  /**
   * Age range this room takes, in YEARS. School-age care talks in school
   * years, not months — "5 and up", not "72M+". Both optional: most OSHC
   * rooms take the whole school.
   */
  minAgeYears: z.number().int().min(0).max(18).optional(),
  maxAgeYears: z.number().int().min(0).max(18).optional(),
  /**
   * A room children can't be booked into — a staff room, an office. It
   * stays in the system for staff to check into and for ratio purposes,
   * but never appears on a booking form.
   */
  staffOnly: z.boolean().optional(),
  /**
   * Retired without being deleted. Every historical booking and
   * attendance record still references this key, so removing the room
   * would orphan them; this hides it from everything forward-looking.
   */
  disabled: z.boolean().optional(),
  /**
   * A picture of the room.
   *
   * Validated against our own Blob storage rather than accepted as any
   * URL: this is rendered in the dashboard, so a raw address would let
   * whoever can edit a service point it at anything, and every request
   * for the page would then call out to that host.
   */
  photoUrl: safeAttachmentUrl.optional(),
});

// ── sessionTimes ────────────────────────────────────────────
export const sessionTimesSchema = z
  .object({
    bsc: roomSchema.optional(),
    asc: roomSchema.optional(),
    vc: roomSchema.optional(),
    extra1: roomSchema.optional(),
    extra2: roomSchema.optional(),
    extra3: roomSchema.optional(),
    extra4: roomSchema.optional(),
  })
  .partial();
export type SessionTimes = z.infer<typeof sessionTimesSchema>;
export type SessionKey =
  | "bsc"
  | "asc"
  | "vc"
  | "extra1"
  | "extra2"
  | "extra3"
  | "extra4";

/** The three that exist at every centre. */
export const CORE_SESSION_KEYS: SessionKey[] = ["bsc", "asc", "vc"];

/**
 * Spare slots a centre names itself. Unnamed ones are hidden everywhere
 * — an unconfigured "Extra 3" on a booking form is worse than nothing.
 */
export const EXTRA_SESSION_KEYS: SessionKey[] = [
  "extra1",
  "extra2",
  "extra3",
  "extra4",
];

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
  // No default label: an extra slot only exists once a centre names it.
  extra1: { label: "", start: "", end: "" },
  extra2: { label: "", start: "", end: "" },
  extra3: { label: "", start: "", end: "" },
  extra4: { label: "", start: "", end: "" },
};

export const SESSION_KEYS: SessionKey[] = [
  ...CORE_SESSION_KEYS,
  ...EXTRA_SESSION_KEYS,
];

/**
 * Session keys this centre actually uses: the three core programmes,
 * plus any extra slot that has been named.
 *
 * Everything parent-facing should iterate THIS, not SESSION_KEYS — an
 * empty "Extra 2" on a booking form is worse than no option at all.
 */
export function activeSessionKeys(
  sessionTimes: SessionTimes | null | undefined,
): SessionKey[] {
  return [
    ...CORE_SESSION_KEYS,
    ...EXTRA_SESSION_KEYS.filter((k) => sessionTimes?.[k]?.label?.trim()),
    // A disabled room is retired, not deleted — its historical bookings
    // still reference the key, but nothing forward-looking should offer
    // it.
  ].filter((k) => !sessionTimes?.[k]?.disabled);
}

/**
 * The rooms a FAMILY should ever see. Everything `activeSessionKeys`
 * gives, minus rooms children can't be booked into.
 *
 * Separate from the staff-facing list on purpose: a staff room still
 * needs to exist for rostering and ratios, it just isn't a thing anyone
 * books their child into.
 */
export function bookableSessionKeys(
  sessionTimes: SessionTimes | null | undefined,
): SessionKey[] {
  return activeSessionKeys(sessionTimes).filter(
    (k) => !sessionTimes?.[k]?.staffOnly,
  );
}

/**
 * Whether a child of this age fits the room, in whole years.
 *
 * Unknown age passes: refusing a booking because a date of birth is
 * missing from OUR record punishes the family for our data gap.
 */
export function childFitsRoom(
  room: { minAgeYears?: number; maxAgeYears?: number } | undefined,
  ageYears: number | null | undefined,
): boolean {
  if (!room) return true;
  if (ageYears === null || ageYears === undefined) return true;
  if (room.minAgeYears !== undefined && ageYears < room.minAgeYears) return false;
  if (room.maxAgeYears !== undefined && ageYears > room.maxAgeYears) return false;
  return true;
}

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
  // Falls back to the slot code for an unnamed extra, so a stray one
  // looks unfinished on screen rather than rendering as blank.
  return (
    sessionTimes?.[key]?.label?.trim() || DEFAULT_ROOMS[key].label || key
  );
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

/**
 * Fee tiers configured for a room, cheapest first.
 *
 * Archived tiers are EXCLUDED. Every caller of this is asking "what can
 * this room be charged at" — the booking form, the casual fee resolver,
 * the fee-change picker — and an archived rate is precisely one that
 * shouldn't be offered. `archivedRoomFees` exists for the one screen
 * that wants to look backwards.
 */
export function roomFees(
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): FeeTier[] {
  const fees = sessionTimes?.[key]?.fees ?? [];
  return [...fees]
    .filter((f) => !f.archived)
    .sort((a, b) => a.amountCents - b.amountCents);
}

/** The retired tiers for a room — history, not options. */
export function archivedRoomFees(
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): FeeTier[] {
  const fees = sessionTimes?.[key]?.fees ?? [];
  return [...fees]
    .filter((f) => f.archived)
    .sort((a, b) => a.amountCents - b.amountCents);
}

// ── casualBookingSettings ───────────────────────────────────
const dayEnum = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const sessionSettingSchema = z.object({
  enabled: z.boolean(),
  /**
   * Fallback price, in DOLLARS, kept for services that haven't set up
   * fee tiers on the room yet. Prefer `feeTierId`.
   */
  fee: z.number().nonnegative(),
  /**
   * The room fee this casual session charges at. Set it and the price
   * follows Rooms & fees, so a fee rise happens in one place instead of
   * being remembered here as well and quietly diverging.
   */
  feeTierId: z.string().optional(),
  spots: z.number().int().nonnegative(),
  cutOffHours: z.number().int().nonnegative(),
  days: z.array(dayEnum),
  /**
   * Who may book a casual spot in this room.
   *
   * "all" — any family at the centre. This is what vacation care needs:
   *   a child who never comes after school still comes in the holidays.
   * "enrolled" — only children who already hold a permanent booking for
   *   this room. Term-time before/after school care is usually this:
   *   the spare seats exist for the families already in the room, not
   *   as a public booking channel.
   *
   * Defaults to "all" when unset, which is the behaviour every centre
   * has had until now — changing the default would silently close
   * bookings that are open today.
   */
  availability: z.enum(["all", "enrolled"]).optional(),
});

/** Service-wide booking policy, as opposed to per-session config. */
const bookingPolicySchema = z.object({
  /**
   * Casual bookings can't be cancelled by the family at all.
   *
   * Off by default, which leaves the standard rule in place: cancel up
   * to the session's cut-off. Some centres cost a casual place the
   * moment it's taken, and for them a late cancellation is a fee
   * argument rather than a freed spot.
   */
  blockCasualCancellation: z.boolean().optional(),

  /**
   * 2026-08-04: `allowRecurringCancellation` is retired. Cancelling a
   * recurring booking is no longer a per-centre toggle — it's a fixed
   * rule (see RECURRING_CANCEL_DAYS): a week or more out, a family can
   * cancel; inside the week they can't, because the roster and the
   * catering are already set against that number.
   *
   * Kept in the schema so existing stored settings still parse rather
   * than failing validation on the next save.
   */
  allowRecurringCancellation: z.boolean().optional(),
});

/**
 * How far ahead a family must be to cancel a recurring booking.
 *
 * One week, fixed org-wide rather than per centre. A rule families have
 * to look up per centre isn't a rule they'll follow, and every centre
 * rosters on the same weekly cycle.
 */
export const RECURRING_CANCEL_DAYS = 7;
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

export const casualBookingSettingsSchema = z.object({
  bsc: sessionSettingSchema.optional(),
  asc: sessionSettingSchema.optional(),
  vc: sessionSettingSchema.optional(),
  extra1: sessionSettingSchema.optional(),
  extra2: sessionSettingSchema.optional(),
  extra3: sessionSettingSchema.optional(),
  extra4: sessionSettingSchema.optional(),
  policy: bookingPolicySchema.optional(),
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


/**
 * What a casual session costs, in DOLLARS.
 *
 * Reads the linked room fee tier first, so the price lives in one place
 * — Rooms & fees — rather than being typed twice and drifting. Falls
 * back to the per-session `fee` for services configured before tiers
 * existed, and finally to 0.
 */
export function resolveCasualFee(
  settings:
    | Partial<Record<SessionKey, { fee: number; feeTierId?: string }>>
    | null
    | undefined,
  sessionTimes: SessionTimes | null | undefined,
  key: SessionKey,
): number {
  const session = settings?.[key];
  if (!session) return 0;

  if (session.feeTierId) {
    const tier = (sessionTimes?.[key]?.fees ?? []).find(
      (f) => f.id === session.feeTierId,
    );
    // A tier that's been deleted must NOT silently fall back to a stale
    // typed-in number — that's how a family gets charged last year's
    // price. Fall back only when nothing was ever linked.
    if (tier) return tier.amountCents / 100;
  }

  return session.fee ?? 0;
}
