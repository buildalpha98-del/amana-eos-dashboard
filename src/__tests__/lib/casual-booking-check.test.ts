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
