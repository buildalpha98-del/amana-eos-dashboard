import { describe, it, expect } from "vitest";
import {
  bucketCertExpiryByService,
  type CertInputWithService,
} from "@/lib/cert-expiry-summary";

const ASOF = new Date("2026-05-04T10:00:00Z");

function daysFrom(asOf: Date, offsetDays: number): Date {
  const d = new Date(asOf);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function cert(
  serviceId: string,
  userId: string | null,
  type: CertInputWithService["type"],
  offsetDays: number,
): CertInputWithService {
  return {
    serviceId,
    userId,
    type,
    expiryDate: daysFrom(ASOF, offsetDays),
  };
}

describe("bucketCertExpiryByService", () => {
  it("returns empty rollup for empty input", () => {
    const out = bucketCertExpiryByService([], ASOF);
    expect(out.orgTotals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
    });
    expect(out.services).toEqual([]);
    expect(out.asOf).toBe("2026-05-04");
  });

  it("excludes services with zero affected certs from the row list", () => {
    const out = bucketCertExpiryByService(
      [
        cert("svc-1", "u-1", "wwcc", -3), // expired → counts
        cert("svc-2", "u-2", "wwcc", 90), // valid (out of window) → service excluded
      ],
      ASOF,
    );
    expect(out.services).toHaveLength(1);
    expect(out.services[0].serviceId).toBe("svc-1");
  });

  it("excludes centre-level certs (userId=null) from the rollup", () => {
    const out = bucketCertExpiryByService(
      [cert("svc-1", null, "wwcc", -1)],
      ASOF,
    );
    expect(out.services).toEqual([]);
    expect(out.orgTotals.expired).toBe(0);
  });

  it("aggregates per-service totals + distinct staff count", () => {
    const out = bucketCertExpiryByService(
      [
        // svc-1: 2 staff with various cert problems
        cert("svc-1", "u-1", "wwcc", -3), // expired
        cert("svc-1", "u-1", "first_aid", 5), // critical (same user)
        cert("svc-1", "u-2", "wwcc", 12), // warning
        // svc-2: 1 staff with one cert
        cert("svc-2", "u-3", "food_safety", 25), // upcoming
      ],
      ASOF,
    );
    expect(out.services).toHaveLength(2);

    const svc1 = out.services.find((s) => s.serviceId === "svc-1")!;
    expect(svc1.totals).toEqual({
      expired: 1,
      critical: 1,
      warning: 1,
      upcoming: 0,
    });
    expect(svc1.affectedStaffCount).toBe(2);
    expect(svc1.status).toBe("expired"); // worst across the centre

    const svc2 = out.services.find((s) => s.serviceId === "svc-2")!;
    expect(svc2.totals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 1,
    });
    expect(svc2.affectedStaffCount).toBe(1);
    expect(svc2.status).toBe("upcoming");

    expect(out.orgTotals).toEqual({
      expired: 1,
      critical: 1,
      warning: 1,
      upcoming: 1,
    });
  });

  it("sorts services worst-status-first, then by total count desc", () => {
    const out = bucketCertExpiryByService(
      [
        // svc-mild: 3 upcoming, none worse
        cert("svc-mild", "u-1", "wwcc", 25),
        cert("svc-mild", "u-2", "wwcc", 25),
        cert("svc-mild", "u-3", "wwcc", 25),
        // svc-warning: 1 warning
        cert("svc-warning", "u-w", "first_aid", 12),
        // svc-critical-many: 3 critical
        cert("svc-critical-many", "u-a", "wwcc", 5),
        cert("svc-critical-many", "u-b", "wwcc", 5),
        cert("svc-critical-many", "u-c", "wwcc", 5),
        // svc-critical-few: 1 critical
        cert("svc-critical-few", "u-d", "wwcc", 5),
      ],
      ASOF,
    );
    expect(out.services.map((s) => s.serviceId)).toEqual([
      // Worst status first: critical beats warning beats upcoming.
      // Within critical, more counts first.
      "svc-critical-many",
      "svc-critical-few",
      "svc-warning",
      "svc-mild",
    ]);
  });

  it("counts distinct staff (multiple certs per user roll up to one)", () => {
    const out = bucketCertExpiryByService(
      [
        cert("svc-1", "u-1", "wwcc", -3),
        cert("svc-1", "u-1", "first_aid", -2),
        cert("svc-1", "u-1", "food_safety", 5),
      ],
      ASOF,
    );
    expect(out.services[0].affectedStaffCount).toBe(1);
    expect(out.services[0].totals.expired).toBe(2);
    expect(out.services[0].totals.critical).toBe(1);
  });

  it("status escalates to the worst across all of a service's affected staff", () => {
    const out = bucketCertExpiryByService(
      [
        // u-1 has only an upcoming cert.
        cert("svc-1", "u-1", "wwcc", 25),
        // u-2 has an expired cert — so the SERVICE status is expired.
        cert("svc-1", "u-2", "wwcc", -1),
      ],
      ASOF,
    );
    expect(out.services[0].status).toBe("expired");
    expect(out.services[0].affectedStaffCount).toBe(2);
  });
});
