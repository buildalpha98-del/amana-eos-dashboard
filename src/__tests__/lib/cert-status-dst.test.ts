// Force Sydney time BEFORE importing anything that touches Date, so the DST
// transitions are actually exercised (CI runs in UTC, which has none).
// Spring forward: Sun 4 Oct 2026 (2am → 3am, the span loses an hour).
// Fall back: Sun 4 Apr 2027 (3am → 2am, the span gains an hour).
process.env.TZ = "Australia/Sydney";

import { describe, it, expect } from "vitest";
import { getCertStatus } from "@/lib/cert-status";

describe("getCertStatus — daysLeft across DST transitions (Australia/Sydney)", () => {
  it("counts calendar days exactly across a spring-forward (span is N days minus 1h)", () => {
    // 20 Sep 2026 → 21 Oct 2026 is 31 calendar days, crossing 4 Oct spring-forward.
    // Math.floor on the 31d−1h millisecond span undercounted this to 30,
    // flipping "valid" to "expiring" a day early.
    const asOf = new Date(2026, 8, 20);
    const expiry = new Date(2026, 9, 21);
    const res = getCertStatus(expiry, asOf);
    expect(res.daysLeft).toBe(31);
    expect(res.status).toBe("valid");
  });

  it("keeps the 30-day expiring boundary across a spring-forward", () => {
    // 20 Sep 2026 → 20 Oct 2026 is exactly 30 calendar days.
    const res = getCertStatus(new Date(2026, 9, 20), new Date(2026, 8, 20));
    expect(res.daysLeft).toBe(30);
    expect(res.status).toBe("expiring");
  });

  it("does not overcount across a fall-back (span is N days plus 1h)", () => {
    // 20 Mar 2027 → 20 Apr 2027 is 31 calendar days, crossing 4 Apr fall-back.
    const res = getCertStatus(new Date(2027, 3, 20), new Date(2027, 2, 20));
    expect(res.daysLeft).toBe(31);
    expect(res.status).toBe("valid");
  });
});
