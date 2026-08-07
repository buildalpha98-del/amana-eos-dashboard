import type { CasualBookingSettings, SessionTimes } from "@/lib/service-settings";
import { childFitsRoom, roomLabel } from "@/lib/service-settings";

export type SessionType = "bsc" | "asc" | "vc";

interface CheckInput {
  settings: CasualBookingSettings | null;
  sessionType: SessionType;
  /** UTC midnight of the requested booking date. */
  bookingDate: Date;
  /** Current server time. */
  now: Date;
  /** Existing casual bookings (status in [requested, confirmed]) for this (service, date, sessionType). */
  currentCasualBookings: number;
  /**
   * The centre's room configuration, so refusals name the room the way
   * the family knows it. "Casual ASC is not configured" means nothing to
   * someone who was told the room is called Amana Afternoons.
   */
  sessionTimes?: SessionTimes | null;
  /**
   * The centre (or this room) isn't running that day — a pupil-free day,
   * a closure. Checked BEFORE spots, because "we're closed" is the true
   * answer and "full" would be a lie.
   */
  blockedOutReason?: string | null;
  /**
   * Whether this child already holds a permanent booking for this room.
   * Only consulted when the room is set to "enrolled" availability.
   */
  childEnrolledInSession?: boolean;
  /**
   * The child's age in whole years, for rooms that carry an age range.
   * Null/undefined when we don't hold a date of birth — which passes,
   * because our missing data isn't the family's fault.
   */
  childAgeYears?: number | null;
  /**
   * This day's capacity, when it differs from the room's usual number
   * (CasualDayConfig). Undefined means "use the room's".
   */
  spotsOverride?: number | null;
  /**
   * The day is open for staff to fill but not for families to book —
   * a vacation-care day held for siblings, or one not yet announced.
   */
  closedForBooking?: boolean;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: string };

const DAY_LABEL: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Check whether a casual booking request is allowed for the given service's
 * `casualBookingSettings`.
 *
 * Rules (in order):
 * 1. settings must exist
 * 2. a session-type entry must exist
 * 3. session-type must be enabled
 * 4. booking date's day-of-week must be in settings.days[]
 * 5. now + cutOffHours must not exceed bookingDate
 * 6. an "enrolled" room only takes children already booked into it
 * 7. currentCasualBookings must be < spots
 *
 * A block-out (closure / pupil-free day) short-circuits ahead of all of
 * them, because "we're closed" is the honest answer.
 */
export function checkCasualBookingAllowed(input: CheckInput): CheckResult {
  const { settings, sessionType, bookingDate, now, currentCasualBookings } = input;
  const room = roomLabel(input.sessionTimes ?? null, sessionType);

  // Every refusal below tells the family what to do next. "Not
  // configured" is a fact about our database, not an answer to someone
  // trying to book their child in.
  const ASK_OFFICE = "Please message head office and we'll sort it out.";

  if (!settings) {
    return {
      ok: false,
      reason: `Casual bookings aren't open online at this centre yet. ${ASK_OFFICE}`,
    };
  }

  const s = settings[sessionType];
  if (!s) {
    return {
      ok: false,
      reason: `Casual bookings for ${room} aren't open online yet. ${ASK_OFFICE}`,
    };
  }

  if (!s.enabled) {
    return {
      ok: false,
      reason: `${room} doesn't take casual bookings at this centre. ${ASK_OFFICE}`,
    };
  }

  // Closed beats every other reason. Telling a family the room is full
  // on a day the centre isn't open would be both wrong and infuriating.
  if (input.blockedOutReason !== undefined && input.blockedOutReason !== null) {
    return {
      ok: false,
      reason: input.blockedOutReason
        ? `${room} isn't running that day — ${input.blockedOutReason}.`
        : `${room} isn't running that day.`,
    };
  }

  // Retired or staff-only rooms are never bookable, whatever the casual
  // settings still say — the settings blob and the room config are
  // separate objects and can disagree.
  const roomConfig = input.sessionTimes?.[sessionType];
  if (roomConfig?.disabled) {
    return {
      ok: false,
      reason: `${room} isn't running at this centre any more. ${ASK_OFFICE}`,
    };
  }
  if (roomConfig?.staffOnly) {
    return {
      ok: false,
      reason: `${room} isn't a room children are booked into.`,
    };
  }
  if (!childFitsRoom(roomConfig, input.childAgeYears)) {
    const min = roomConfig?.minAgeYears;
    const max = roomConfig?.maxAgeYears;
    const range =
      min !== undefined && max !== undefined
        ? `${min}–${max}`
        : min !== undefined
          ? `${min} and up`
          : `up to ${max}`;
    return {
      ok: false,
      reason: `${room} is for children aged ${range}. ${ASK_OFFICE}`,
    };
  }

  const dayKey = DAY_KEY[bookingDate.getUTCDay()];
  if (!s.days.includes(dayKey)) {
    return {
      ok: false,
      reason: `${room} doesn't run on ${DAY_LABEL[dayKey]} at this centre.`,
    };
  }

  const msCutoff = s.cutOffHours * 60 * 60 * 1000;
  if (bookingDate.getTime() - now.getTime() < msCutoff) {
    return {
      ok: false,
      reason: `Bookings must be made at least ${s.cutOffHours} hour${s.cutOffHours === 1 ? "" : "s"} before the session`,
    };
  }

  // Enrolled-only rooms: term-time before/after school care where the
  // spare seats exist for families already in the room, not as a public
  // booking channel. Unset means "all", the behaviour every centre has
  // had until now.
  if (s.availability === "enrolled" && input.childEnrolledInSession === false) {
    return {
      ok: false,
      reason: `${room} casual spots are for children already booked into it. ${ASK_OFFICE}`,
    };
  }

  // Held back deliberately — staff can still place a child, families
  // can't. Distinct from "full": there may be seats, they're just not
  // on sale.
  if (input.closedForBooking) {
    return {
      ok: false,
      reason: `${room} isn't open for online booking that day. ${ASK_OFFICE}`,
    };
  }

  const spots =
    input.spotsOverride === undefined || input.spotsOverride === null
      ? s.spots
      : input.spotsOverride;
  if (currentCasualBookings >= spots) {
    return {
      ok: false,
      reason: `${room} is full that day. Message head office and we'll add you to the list.`,
    };
  }

  return { ok: true };
}
