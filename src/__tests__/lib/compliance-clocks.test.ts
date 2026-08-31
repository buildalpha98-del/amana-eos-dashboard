import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_WINDOW_HOURS,
  SERIOUS_INCIDENT_CATEGORIES,
  isSeriousIncidentCategory,
  notificationDueAt,
  clockStatus,
  describeClock,
  requiresRegulatorNotification,
} from "@/lib/compliance-clocks";

const AWARE = new Date("2026-08-10T09:00:00.000Z");
const DUE = new Date("2026-08-11T09:00:00.000Z"); // +24h

describe("notificationDueAt", () => {
  it("is 24 hours after becoming aware", () => {
    expect(notificationDueAt(AWARE)?.toISOString()).toBe(DUE.toISOString());
    expect(NOTIFICATION_WINDOW_HOURS).toBe(24);
  });

  it("accepts an ISO string", () => {
    expect(notificationDueAt("2026-08-10T09:00:00.000Z")?.toISOString()).toBe(
      DUE.toISOString(),
    );
  });

  it("returns null for no awareness date rather than inventing one", () => {
    // Starting a clock the service never agreed to would be worse than
    // having no clock.
    expect(notificationDueAt(null)).toBeNull();
    expect(notificationDueAt(undefined)).toBeNull();
    expect(notificationDueAt("")).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(notificationDueAt("not-a-date")).toBeNull();
  });
});

describe("clockStatus — not yet notified", () => {
  it("is due while the deadline is ahead", () => {
    const s = clockStatus(DUE, null, new Date("2026-08-10T18:00:00.000Z"));
    expect(s.state).toBe("due");
    expect(s.hoursRemaining).toBe(15);
  });

  it("is overdue once the deadline passes", () => {
    const s = clockStatus(DUE, null, new Date("2026-08-11T12:00:00.000Z"));
    expect(s.state).toBe("overdue");
    expect(s.hoursRemaining).toBe(-3);
  });

  it("is still due at the exact deadline, not overdue", () => {
    expect(clockStatus(DUE, null, DUE).state).toBe("due");
  });
});

describe("clockStatus — notified", () => {
  it("is met when notified before the deadline", () => {
    const s = clockStatus(DUE, new Date("2026-08-10T20:00:00.000Z"));
    expect(s.state).toBe("met");
  });

  it("is LATE when notified after the deadline, never simply done", () => {
    // A register that hides lateness is worse than no register — it
    // removes the prompt to explain it.
    const s = clockStatus(DUE, new Date("2026-08-12T09:00:00.000Z"));
    expect(s.state).toBe("late");
    expect(s.hoursRemaining).toBe(-24);
  });

  it("counts notification exactly on the deadline as met", () => {
    expect(clockStatus(DUE, DUE).state).toBe("met");
  });

  it("ignores `now` once a notification exists", () => {
    // Lateness is judged against when it was notified, not when someone
    // happens to be looking at the register.
    const a = clockStatus(DUE, new Date("2026-08-10T20:00:00.000Z"), new Date("2027-01-01"));
    expect(a.state).toBe("met");
  });
});

describe("clockStatus — nothing to measure", () => {
  it("is not_applicable with no deadline", () => {
    const s = clockStatus(null, null);
    expect(s.state).toBe("not_applicable");
    expect(s.hoursRemaining).toBeNull();
  });

  it("is not_applicable for an unparseable deadline", () => {
    expect(clockStatus("rubbish", null).state).toBe("not_applicable");
  });

  it("treats an unparseable notifiedAt as not notified", () => {
    const s = clockStatus(DUE, "rubbish", new Date("2026-08-12T09:00:00.000Z"));
    expect(s.state).toBe("overdue");
  });
});

describe("describeClock", () => {
  it("reads plainly for each state", () => {
    expect(
      describeClock(clockStatus(DUE, null, new Date("2026-08-10T18:00:00.000Z"))),
    ).toBe("15 hours left");
    expect(
      describeClock(clockStatus(DUE, null, new Date("2026-08-11T12:00:00.000Z"))),
    ).toBe("Overdue by 3 hours");
    expect(describeClock(clockStatus(DUE, new Date("2026-08-10T20:00:00.000Z")))).toBe(
      "Notified in time",
    );
    expect(describeClock(clockStatus(null, null))).toBe("No deadline recorded");
  });

  it("switches to days past 48 hours", () => {
    const s = clockStatus(DUE, null, new Date("2026-08-14T09:00:00.000Z"));
    expect(describeClock(s)).toBe("Overdue by 3 days");
  });

  it("singularises one hour and one day", () => {
    expect(
      describeClock(clockStatus(DUE, null, new Date("2026-08-11T10:00:00.000Z"))),
    ).toBe("Overdue by 1 hour");
  });

  it("says due within the hour rather than 0 hours left", () => {
    const s = clockStatus(DUE, null, new Date("2026-08-11T08:40:00.000Z"));
    expect(describeClock(s)).toBe("Due within the hour");
  });
});

describe("serious incident categories", () => {
  it("covers Reg 12's list", () => {
    expect(SERIOUS_INCIDENT_CATEGORIES.map((c) => c.value)).toEqual([
      "death",
      "serious_injury",
      "serious_illness",
      "missing_child",
      "unauthorised_removal",
      "locked_in_or_out",
    ]);
  });

  it("recognises a listed category", () => {
    expect(isSeriousIncidentCategory("missing_child")).toBe(true);
  });

  it("rejects anything not on the list", () => {
    expect(isSeriousIncidentCategory("stubbed_toe")).toBe(false);
    expect(isSeriousIncidentCategory(null)).toBe(false);
    expect(isSeriousIncidentCategory("")).toBe(false);
  });
});

describe("requiresRegulatorNotification", () => {
  it("is true for a listed serious incident", () => {
    expect(
      requiresRegulatorNotification({ seriousIncidentCategory: "death" }),
    ).toBe(true);
  });

  it("is true when a service manually flags it", () => {
    expect(requiresRegulatorNotification({ reportableToAuthority: true })).toBe(
      true,
    );
  });

  it("cannot be turned OFF for a listed serious incident", () => {
    // Whether a Reg 12 category needs notifying is not a judgement call,
    // so the manual flag can add but never subtract.
    expect(
      requiresRegulatorNotification({
        seriousIncidentCategory: "missing_child",
        reportableToAuthority: false,
      }),
    ).toBe(true);
  });

  it("is false for an ordinary incident", () => {
    expect(
      requiresRegulatorNotification({
        seriousIncidentCategory: null,
        reportableToAuthority: false,
      }),
    ).toBe(false);
    expect(requiresRegulatorNotification({})).toBe(false);
  });
});
