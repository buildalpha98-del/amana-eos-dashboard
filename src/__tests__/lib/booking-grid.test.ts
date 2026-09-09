/**
 * The one place the parent's booking grid meets the dashboard's vocabulary.
 *
 * The grid speaks in programs (riseAndShine / amanaAfternoons /
 * holidayQuest); generateBookings, the enrolment PDF and the children
 * tab speak in session types (bsc / asc / vc) with lowercase weekdays.
 * Until PR #254 the portal wrote only the first, so a family's answer
 * reached nobody. These cover the translation and the backfill that
 * repairs the enrolments submitted before the fix.
 */
import { describe, it, expect } from "vitest";
import {
  bookingGridFromSessions,
  needsBookingGridBackfill,
  backfillBookingGrid,
} from "@/lib/booking-grid";

describe("bookingGridFromSessions", () => {
  it("maps each program to its session type", () => {
    const grid = bookingGridFromSessions({
      riseAndShine: ["Monday"],
      amanaAfternoons: ["Monday", "Friday"],
      holidayQuest: ["yes"],
    });
    expect(grid.sessionTypes.sort()).toEqual(["asc", "bsc", "vc"]);
  });

  it("lowercases weekdays, because that's what the lookup uses", () => {
    // DAY_NAME_TO_INDEX in booking-generator.ts is keyed "monday". A
    // capitalised name misses it and generates nothing, silently.
    const grid = bookingGridFromSessions({ amanaAfternoons: ["Monday"] });
    expect(grid.days.asc).toEqual(["monday"]);
  });

  it("keeps a whole-of-session tick out of the weekday list", () => {
    // Casual bookings and Holiday Quest store ["yes"] rather than days.
    // Left in, generateBookings would look up a weekday called "yes".
    const grid = bookingGridFromSessions({ holidayQuest: ["yes"] });
    expect(grid.sessionTypes).toEqual(["vc"]);
    expect(grid.days.vc).toEqual([]);
  });

  it("ignores a row key that isn't on the grid", () => {
    // `beforeSchool` and `afterSchool` are the two keys the old code
    // read and no writer has ever produced. They must not resurrect.
    const grid = bookingGridFromSessions({
      beforeSchool: ["Monday"],
      afterSchool: ["Tuesday"],
    });
    expect(grid.sessionTypes).toEqual([]);
  });

  it("skips a program with nothing ticked", () => {
    const grid = bookingGridFromSessions({
      riseAndShine: [],
      amanaAfternoons: ["Monday"],
    });
    expect(grid.sessionTypes).toEqual(["asc"]);
  });

  it("survives a Json column holding something other than an object", () => {
    // Every caller reads this out of a Json column where the declared
    // type is a hope, not a guarantee.
    expect(bookingGridFromSessions(null).sessionTypes).toEqual([]);
    expect(bookingGridFromSessions("none").sessionTypes).toEqual([]);
    expect(bookingGridFromSessions([1, 2]).sessionTypes).toEqual([]);
    expect(bookingGridFromSessions({ asc: "monday" }).sessionTypes).toEqual([]);
  });
});

describe("needsBookingGridBackfill", () => {
  const broken = {
    bookingType: "permanent",
    startDate: "2026-09-01",
    sessions: { amanaAfternoons: ["Monday"] },
    days: [],
  };

  it("spots a family whose answer never reached the readers", () => {
    expect(needsBookingGridBackfill(broken)).toBe(true);
  });

  it("leaves a record that already carries the canonical shape", () => {
    // Re-running the backfill must be a no-op, not a rewrite.
    expect(
      needsBookingGridBackfill({
        ...broken,
        sessionTypes: ["asc"],
        days: { asc: ["monday"] },
      }),
    ).toBe(false);
  });

  it("leaves a record a human has since corrected by hand", () => {
    // Staff set this child's sessions themselves. Overwriting from the
    // original grid answer would undo their correction.
    expect(
      needsBookingGridBackfill({
        ...broken,
        sessionTypes: ["bsc"],
        days: { bsc: ["tuesday"] },
      }),
    ).toBe(false);
  });

  it("leaves a record with no grid answer to translate", () => {
    // Public-form enrolments never had `sessions` — there is nothing
    // here to recover, and inventing one would be a guess.
    expect(needsBookingGridBackfill({ bookingType: "permanent" })).toBe(false);
    expect(needsBookingGridBackfill({ sessions: {} })).toBe(false);
  });

  it("leaves a pre-grid draft's flat day list alone", () => {
    // A flat list with no session attached can't be assigned to one
    // without guessing, and a wrong guess is the wrong roll.
    expect(
      needsBookingGridBackfill({ bookingType: "permanent", days: ["Monday"] }),
    ).toBe(false);
  });

  it("doesn't fall over on a malformed blob", () => {
    expect(needsBookingGridBackfill(null)).toBe(false);
    expect(needsBookingGridBackfill("prefs")).toBe(false);
    expect(needsBookingGridBackfill([])).toBe(false);
  });
});

describe("backfillBookingGrid", () => {
  const broken = {
    bookingType: "permanent",
    startDate: "2026-09-01",
    sessions: { riseAndShine: ["Monday"], amanaAfternoons: ["Monday", "Friday"] },
    days: [],
  };

  it("writes the shape every reader wants", () => {
    const fixed = backfillBookingGrid(broken)!;
    expect(fixed.sessionTypes).toEqual(["bsc", "asc"]);
    expect(fixed.days).toEqual({
      bsc: ["monday"],
      asc: ["monday", "friday"],
    });
  });

  it("replaces the flat day list rather than leaving it beside the record", () => {
    // The old value was an ARRAY under the same key. Two shapes under
    // one name is how a reader ends up with `Object.entries(["Monday"])`.
    const fixed = backfillBookingGrid(broken)!;
    expect(Array.isArray(fixed.days)).toBe(false);
  });

  it("keeps everything else the family typed", () => {
    const fixed = backfillBookingGrid(broken)!;
    expect(fixed.bookingType).toBe("permanent");
    expect(fixed.startDate).toBe("2026-09-01");
    // The parent's own answer stays readable in its original words.
    expect(fixed.sessions).toEqual(broken.sessions);
  });

  it("returns null when there's nothing to repair", () => {
    // The caller uses this to decide whether to write at all, so an
    // untouched record is never rewritten.
    expect(backfillBookingGrid({ bookingType: "casual" })).toBeNull();
    expect(
      backfillBookingGrid({ ...broken, sessionTypes: ["asc"] }),
    ).toBeNull();
  });

  it("is idempotent", () => {
    const once = backfillBookingGrid(broken)!;
    expect(backfillBookingGrid(once)).toBeNull();
  });
});

/**
 * The pairing that matters: what the backfill produces has to be what
 * generateBookings can actually read. Asserting the shape in isolation
 * would have passed for the original bug too.
 */
describe("backfillBookingGrid → generateBookings", () => {
  it("produces bookings for a repaired permanent enrolment", async () => {
    const { generateBookings } = await import("@/lib/booking-generator");
    const fixed = backfillBookingGrid({
      bookingType: "permanent",
      startDate: "2020-01-01",
      sessions: { amanaAfternoons: ["Monday", "Tuesday"] },
      days: [],
    })!;

    const rows = generateBookings("child-1", "svc-1", fixed, { weeksAhead: 2 });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.sessionType))).toEqual(new Set(["asc"]));
  });

  it("produced none before the repair — the bug, stated as a test", async () => {
    const { generateBookings } = await import("@/lib/booking-generator");
    const broken = {
      bookingType: "permanent",
      startDate: "2020-01-01",
      sessions: { amanaAfternoons: ["Monday", "Tuesday"] },
      days: [],
    };
    expect(generateBookings("child-1", "svc-1", broken, { weeksAhead: 2 })).toEqual([]);
  });

  it("doesn't invent a roll for a whole-of-session tick", async () => {
    // Holiday Quest is a real selection with no weekly pattern. It shows
    // on the pack; it must not put the child on a Monday roll.
    const { generateBookings } = await import("@/lib/booking-generator");
    const fixed = backfillBookingGrid({
      bookingType: "permanent",
      startDate: "2020-01-01",
      sessions: { holidayQuest: ["yes"] },
    })!;
    expect(generateBookings("child-1", "svc-1", fixed, { weeksAhead: 2 })).toEqual([]);
  });
});
