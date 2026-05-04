import { describe, it, expect } from "vitest";
import { bucketCertExpiry, type CertInput } from "@/lib/cert-expiry-summary";

const ASOF = new Date("2026-05-04T10:00:00Z");

function daysFrom(asOf: Date, offsetDays: number): Date {
  const d = new Date(asOf);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function cert(
  userId: string | null,
  type: CertInput["type"],
  offsetDays: number,
): CertInput {
  return {
    userId,
    type,
    expiryDate: daysFrom(ASOF, offsetDays),
  };
}

describe("bucketCertExpiry", () => {
  it("returns empty totals for an empty cert list", () => {
    const out = bucketCertExpiry([], ASOF);
    expect(out.totals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
    });
    expect(out.affectedStaff).toEqual([]);
    expect(out.asOf).toBe("2026-05-04");
  });

  it("classifies certs by distance from asOf", () => {
    const out = bucketCertExpiry(
      [
        cert("u-1", "wwcc", -5), // expired 5d ago
        cert("u-2", "first_aid", 0), // expires today → critical
        cert("u-3", "food_safety", 5), // critical
        cert("u-4", "wwcc", 10), // warning
        cert("u-5", "first_aid", 20), // upcoming
        cert("u-6", "wwcc", 60), // valid (out of window) → ignored
      ],
      ASOF,
    );
    expect(out.totals).toEqual({
      expired: 1,
      critical: 2,
      warning: 1,
      upcoming: 1,
    });
    expect(out.affectedStaff).toHaveLength(5);
  });

  it("ignores centre-level certs (userId=null)", () => {
    const out = bucketCertExpiry(
      [cert(null, "wwcc", -1), cert("u-1", "first_aid", -1)],
      ASOF,
    );
    expect(out.totals.expired).toBe(1);
    expect(out.affectedStaff.map((s) => s.userId)).toEqual(["u-1"]);
  });

  it("rolls multiple certs per user into a single row with worst-status escalation", () => {
    const out = bucketCertExpiry(
      [
        cert("u-1", "wwcc", -2), // expired
        cert("u-1", "first_aid", 5), // critical
        cert("u-1", "food_safety", 25), // upcoming
      ],
      ASOF,
    );
    expect(out.affectedStaff).toHaveLength(1);
    const alice = out.affectedStaff[0];
    expect(alice.status).toBe("expired");
    expect(alice.certs).toHaveLength(3);
    // Sorted: worst first.
    expect(alice.certs[0].status).toBe("expired");
    expect(alice.certs[1].status).toBe("critical");
    expect(alice.certs[2].status).toBe("upcoming");
    // Earliest expiry surfaced.
    expect(alice.earliestExpiry).toEqual(daysFrom(ASOF, -2));
  });

  it("sorts affected staff by severity then earliest expiry", () => {
    const out = bucketCertExpiry(
      [
        cert("u-clean-warning", "wwcc", 12), // warning
        cert("u-expired", "wwcc", -3), // expired
        cert("u-critical", "first_aid", 4), // critical
        cert("u-warning-earlier", "wwcc", 8), // warning, earlier than u-clean-warning
      ],
      ASOF,
    );
    expect(out.affectedStaff.map((s) => s.userId)).toEqual([
      "u-expired",
      "u-critical",
      "u-warning-earlier",
      "u-clean-warning",
    ]);
  });

  it("treats a cert that expires today as critical (0 days remaining), not expired", () => {
    const out = bucketCertExpiry([cert("u-1", "wwcc", 0)], ASOF);
    expect(out.totals).toEqual({
      expired: 0,
      critical: 1,
      warning: 0,
      upcoming: 0,
    });
    expect(out.affectedStaff[0].status).toBe("critical");
    expect(out.affectedStaff[0].certs[0].daysUntilExpiry).toBe(0);
  });

  it("uses calendar-day precision (mid-day asOf doesn't drift the bucket)", () => {
    // asOf is 10:00 UTC; cert expires at 23:59 the same day.
    // Should still classify as 0 days (critical), not -1 (expired).
    const out = bucketCertExpiry(
      [
        {
          userId: "u-1",
          type: "wwcc",
          expiryDate: new Date("2026-05-04T23:59:59Z"),
        },
      ],
      ASOF,
    );
    expect(out.affectedStaff[0].certs[0].daysUntilExpiry).toBe(0);
    expect(out.totals.critical).toBe(1);
  });

  it("ignores certs beyond the 30-day horizon", () => {
    const out = bucketCertExpiry(
      [cert("u-1", "wwcc", 31), cert("u-2", "first_aid", 90)],
      ASOF,
    );
    expect(out.totals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
    });
    expect(out.affectedStaff).toEqual([]);
  });
});
