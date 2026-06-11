// Force AEST (UTC+10) BEFORE importing anything that touches Date, so the
// local-midnight → UTC-rollover bug is actually exercised. OSHC runs in
// Australia; the register + roster week grids must key cells on the LOCAL
// date, not the UTC date (which rolls a local-midnight Monday back to Sunday).
process.env.TZ = "Australia/Sydney";

import { describe, it, expect } from "vitest";
import { getWeekStart, toLocalIsoDate } from "@/lib/utils";

describe("toLocalIsoDate — timezone-safe week dates", () => {
  it("formats a Date by its local calendar day", () => {
    // Local midnight Monday 4 May 2026.
    expect(toLocalIsoDate(new Date(2026, 4, 4, 0, 0, 0))).toBe("2026-05-04");
  });

  it("returns the LOCAL Monday for a mid-week AEST moment (the Monday-empty regression)", () => {
    // 1pm AEST on Wednesday 6 May 2026 — that week's Monday is 4 May.
    const wed = new Date("2026-05-06T03:00:00.000Z");
    const monday = getWeekStart(wed);

    // The fix: local calendar day is Monday 4 May.
    expect(toLocalIsoDate(monday)).toBe("2026-05-04");

    // The bug it replaces: toISOString() rolled local-midnight Monday back to
    // Sunday 3 May in AEST, shifting the whole grid a day so the Mon column
    // showed an empty Sunday.
    expect(monday.toISOString().slice(0, 10)).toBe("2026-05-03");
  });
});
