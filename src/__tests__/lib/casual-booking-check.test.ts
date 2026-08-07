import { describe, it, expect } from "vitest";
import { checkCasualBookingAllowed } from "@/lib/casual-booking-check";
import type { CasualBookingSettings } from "@/lib/service-settings";

const nowUtc = new Date("2026-04-22T10:00:00.000Z");

const settings: CasualBookingSettings = {
  bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon", "tue", "wed", "thu", "fri"] },
  asc: { enabled: false, fee: 45, spots: 0, cutOffHours: 24, days: [] },
  // vc omitted — treated as "not configured"
};

describe("checkCasualBookingAllowed", () => {
  it("400 when settings are null/absent", () => {
    const r = checkCasualBookingAllowed({
      settings: null,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/aren't open online/i);
  });

  it("400 when session-type entry is missing", () => {
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "vc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/aren't open online|doesn't take casual/i);
  });

  it("400 when session-type is disabled", () => {
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "asc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/doesn't take casual/i);
  });

  it("400 when booking date's day isn't in days[]", () => {
    // 2026-04-25 is a Saturday — not in settings.bsc.days
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-25T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
    });
    expect(r.ok).toBe(false);
    // Names the room the family knows, not the session code.
    if (!r.ok) expect(r.reason).toMatch(/doesn't run on Saturday|doesn't run on/i);
  });

  it("400 when cutOffHours not met", () => {
    // booking "2026-04-22T12:00" with now "2026-04-22T10:00" → only 2h lead; settings.bsc needs 12h
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-22T12:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/at least \d+ hours?/i);
  });

  it("400 when spots exhausted (equal count)", () => {
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is full that day/i);
  });

  it("200 for valid booking", () => {
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 1,
    });
    expect(r.ok).toBe(true);
  });
});

/**
 * 2026-08-06 — closures and enrolled-only rooms.
 */
describe("block-out dates", () => {
  const base = {
    settings,
    sessionType: "bsc" as const,
    bookingDate: new Date("2026-04-24T00:00:00Z"),
    now: nowUtc,
    currentCasualBookings: 0,
  };

  it("refuses a blocked-out day and says why", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      blockedOutReason: "pupil-free day",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/pupil-free day/);
  });

  it("still refuses when no reason was given", () => {
    const r = checkCasualBookingAllowed({ ...base, blockedOutReason: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/isn't running that day/i);
  });

  it("closed beats full — the honest answer wins", () => {
    // Both conditions true: the room is at capacity AND the centre is
    // shut. Telling a family it's full would be a lie they'd act on.
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 99,
      blockedOutReason: "centre closed",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/centre closed/);
  });

  it("null means not blocked out", () => {
    const r = checkCasualBookingAllowed({ ...base, blockedOutReason: null });
    expect(r.ok).toBe(true);
  });
});

describe("enrolled-only rooms", () => {
  const enrolledOnly: CasualBookingSettings = {
    bsc: {
      enabled: true,
      fee: 40,
      spots: 5,
      cutOffHours: 12,
      days: ["mon", "tue", "wed", "thu", "fri"],
      availability: "enrolled",
    },
  };
  const base = {
    settings: enrolledOnly,
    sessionType: "bsc" as const,
    bookingDate: new Date("2026-04-24T00:00:00Z"),
    now: nowUtc,
    currentCasualBookings: 0,
  };

  it("refuses a child who isn't already booked into the room", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      childEnrolledInSession: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already booked into it/i);
  });

  it("allows a child who is", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      childEnrolledInSession: true,
    });
    expect(r.ok).toBe(true);
  });

  it("an unset availability still means everyone — no silent closure", () => {
    // Every centre has run "all" until now; defaulting the other way
    // would close bookings that are open today.
    const r = checkCasualBookingAllowed({
      settings,
      sessionType: "bsc",
      bookingDate: new Date("2026-04-24T00:00:00Z"),
      now: nowUtc,
      currentCasualBookings: 0,
      childEnrolledInSession: false,
    });
    expect(r.ok).toBe(true);
  });
});

/**
 * 2026-08-06 — room configuration beats casual settings.
 *
 * The casual-settings blob and the room config are separate objects on
 * the Service and can disagree. When they do, the room wins: a retired
 * or staff-only room is not bookable no matter what the settings say.
 */
describe("room configuration", () => {
  const base = {
    settings,
    sessionType: "bsc" as const,
    bookingDate: new Date("2026-04-24T00:00:00Z"),
    now: nowUtc,
    currentCasualBookings: 0,
  };

  it("refuses a retired room even when casual settings still allow it", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      sessionTimes: { bsc: { start: "06:30", end: "09:00", disabled: true } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/any more/i);
  });

  it("refuses a staff-only room", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      sessionTimes: { bsc: { start: "06:30", end: "09:00", staffOnly: true } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/children are booked into/i);
  });

  it("refuses a child below the room's age range, and says the range", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      sessionTimes: {
        bsc: { start: "06:30", end: "09:00", minAgeYears: 5 },
      },
      childAgeYears: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/5 and up/i);
  });

  it("lets an in-range child through", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      sessionTimes: {
        bsc: { start: "06:30", end: "09:00", minAgeYears: 5, maxAgeYears: 12 },
      },
      childAgeYears: 8,
    });
    expect(r.ok).toBe(true);
  });

  it("passes an unknown age — our missing DOB isn't the family's fault", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      sessionTimes: {
        bsc: { start: "06:30", end: "09:00", minAgeYears: 5 },
      },
      childAgeYears: null,
    });
    expect(r.ok).toBe(true);
  });
});

describe("bookableSessionKeys", () => {
  it("hides retired and staff-only rooms from families", async () => {
    const { bookableSessionKeys, activeSessionKeys } = await import(
      "@/lib/service-settings"
    );
    const times = {
      bsc: { start: "06:30", end: "09:00" },
      asc: { start: "15:00", end: "18:30", staffOnly: true },
      vc: { start: "07:00", end: "18:00", disabled: true },
    };
    // Staff still see the staff room; nobody sees the retired one.
    expect(activeSessionKeys(times)).toEqual(["bsc", "asc"]);
    expect(bookableSessionKeys(times)).toEqual(["bsc"]);
  });
});

/**
 * 2026-08-06 — per-day capacity, from CasualDayConfig.
 *
 * A vacation-care day often has a different number of seats from the
 * room's usual, and a day can be open for staff to fill while closed to
 * families. Both decide what a family is allowed to do, so both are
 * checked server-side.
 */
describe("per-day capacity", () => {
  const base = {
    settings,
    sessionType: "bsc" as const,
    bookingDate: new Date("2026-04-24T00:00:00Z"),
    now: nowUtc,
  };

  it("uses the day's override instead of the room's usual number", () => {
    // Room allows 2; this day allows 5, and 3 are taken.
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 3,
      spotsOverride: 5,
    });
    expect(r.ok).toBe(true);
  });

  it("an override can make a day SMALLER than the room's usual", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 1,
      spotsOverride: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/full that day/i);
  });

  it("null override falls back to the room's number", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 2,
      spotsOverride: null,
    });
    // Room's spots is 2, so 2 taken means full.
    expect(r.ok).toBe(false);
  });

  it("a closed day refuses families even with seats left", () => {
    // Held for siblings, or not announced yet. Staff can still place a
    // child; the app can't.
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 0,
      spotsOverride: 20,
      closedForBooking: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/isn't open for online booking/i);
  });

  it("closed is checked before full, so the message is the true one", () => {
    const r = checkCasualBookingAllowed({
      ...base,
      currentCasualBookings: 99,
      spotsOverride: 1,
      closedForBooking: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/isn't open for online booking/i);
  });
});
