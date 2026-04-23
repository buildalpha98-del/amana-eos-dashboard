import { describe, it, expect } from "vitest";
import { getGreetingSubline } from "@/app/parent/utils/greeting";

function at(dateStr: string): Date {
  return new Date(dateStr);
}

describe("getGreetingSubline", () => {
  it("weekend — no bookings today", () => {
    const saturday = at("2026-04-25T10:00:00"); // Sat
    expect(getGreetingSubline({ children: [], bookings: [], now: saturday })).toBe(
      "No bookings today — see you Monday.",
    );
  });

  it("sunday weekend", () => {
    const sunday = at("2026-04-26T15:00:00"); // Sun
    expect(getGreetingSubline({ children: [], bookings: [], now: sunday })).toBe(
      "No bookings today — see you Monday.",
    );
  });

  it("vacation care day for one child", () => {
    const wed = at("2026-04-22T10:00:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }],
        bookings: [{ date: "2026-04-22", sessionType: "vc", status: "confirmed" }],
        now: wed,
      }),
    ).toBe("Vacation care day — Sophia in for the day.");
  });

  it("formats names for two-kid families", () => {
    const wed = at("2026-04-22T10:00:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }, { firstName: "Zayd" }],
        bookings: [{ date: "2026-04-22", sessionType: "vc", status: "confirmed" }],
        now: wed,
      }),
    ).toBe("Vacation care day — Sophia & Zayd in for the day.");
  });

  it("kid currently in care", () => {
    const wed = at("2026-04-22T16:00:00"); // 4pm
    const result = getGreetingSubline({
      children: [
        {
          firstName: "Sophia",
          attendanceToday: { signedInAt: "2026-04-22T15:20:00", signedOutAt: null },
        },
      ],
      bookings: [],
      now: wed,
    });
    expect(result).toBe("Sophia in good hands today.");
  });

  it("booked but not yet signed in after 7am", () => {
    const wed = at("2026-04-22T08:30:00");
    expect(
      getGreetingSubline({
        children: [
          { firstName: "Zayd" }, // no attendance
        ],
        bookings: [{ date: "2026-04-22", sessionType: "bsc", status: "confirmed" }],
        now: wed,
      }),
    ).toBe("Zayd haven't signed in yet — should be there soon.");
  });

  it("all kids signed out for the day", () => {
    const wed = at("2026-04-22T19:00:00");
    const result = getGreetingSubline({
      children: [
        {
          firstName: "Sophia",
          attendanceToday: {
            signedInAt: "2026-04-22T15:20:00",
            signedOutAt: "2026-04-22T18:02:00",
          },
        },
      ],
      bookings: [],
      now: wed,
    });
    expect(result).toMatch(/Everyone's home safe — signed out at/);
  });

  it("weekday early morning before BSC opens", () => {
    const wed = at("2026-04-22T06:30:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }],
        bookings: [],
        now: wed,
      }),
    ).toBe("Early start — BSC opens at 7:00.");
  });

  it("school hours (9am–3pm)", () => {
    const wed = at("2026-04-22T12:00:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }],
        bookings: [],
        now: wed,
      }),
    ).toBe("School's still in — pickup at 3:15.");
  });

  it("late evening after ASC closes", () => {
    const wed = at("2026-04-22T19:30:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }],
        bookings: [],
        now: wed,
      }),
    ).toBe("Day's wrapped — see you tomorrow.");
  });

  it("fallback — window between 7am and 9am with no booking data (and no signed-in kids)", () => {
    const wed = at("2026-04-22T07:30:00");
    expect(
      getGreetingSubline({
        children: [{ firstName: "Sophia" }],
        bookings: [],
        now: wed,
      }),
    ).toBe("Here's today at a glance.");
  });

  it("pure / deterministic — repeat call yields same result", () => {
    const wed = at("2026-04-22T12:00:00");
    const args = {
      children: [{ firstName: "Sophia" }],
      bookings: [],
      now: wed,
    };
    expect(getGreetingSubline(args)).toBe(getGreetingSubline(args));
  });
});
