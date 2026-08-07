import type { CasualBookingSettings, SessionTimes } from "@/lib/service-settings";
import { roomLabel } from "@/lib/service-settings";

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

  if (currentCasualBookings >= s.spots) {
    return {
      ok: false,
      reason: `${room} is full that day. Message head office and we'll add you to the list.`,
    };
  }

  return { ok: true };
}
