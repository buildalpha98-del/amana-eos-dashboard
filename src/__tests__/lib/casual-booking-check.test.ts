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
    if (!r.ok) expect(r.reason).toMatch(/not configured/i);
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
    if (!r.ok) expect(r.reason).toMatch(/not configured|not accepted/i);
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
    if (!r.ok) expect(r.reason).toMatch(/not accepted/i);
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
    if (!r.ok) expect(r.reason).toMatch(/not available on/i);
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
    if (!r.ok) expect(r.reason).toMatch(/no casual spots/i);
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
