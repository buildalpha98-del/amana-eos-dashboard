import type { CasualBookingSettings } from "@/lib/service-settings";

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
 * 6. currentCasualBookings must be < spots
 */
export function checkCasualBookingAllowed(input: CheckInput): CheckResult {
  const { settings, sessionType, bookingDate, now, currentCasualBookings } = input;

  if (!settings) {
    return { ok: false, reason: "Casual bookings not configured for this service" };
  }

  const s = settings[sessionType];
  if (!s) {
    return {
      ok: false,
      reason: `Casual ${sessionType.toUpperCase()} is not configured for this service`,
    };
  }

  if (!s.enabled) {
    return {
      ok: false,
      reason: `Casual ${sessionType.toUpperCase()} bookings are not accepted at this service`,
    };
  }

  const dayKey = DAY_KEY[bookingDate.getUTCDay()];
  if (!s.days.includes(dayKey)) {
    return {
      ok: false,
      reason: `Casual ${sessionType.toUpperCase()} is not available on ${DAY_LABEL[dayKey]} at this service`,
    };
  }

  const msCutoff = s.cutOffHours * 60 * 60 * 1000;
  if (bookingDate.getTime() - now.getTime() < msCutoff) {
    return {
      ok: false,
      reason: `Bookings must be made at least ${s.cutOffHours} hour${s.cutOffHours === 1 ? "" : "s"} before the session`,
    };
  }

  if (currentCasualBookings >= s.spots) {
    return { ok: false, reason: "No casual spots available for this session" };
  }

  return { ok: true };
}
