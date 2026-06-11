import { describe, it, expect } from "vitest";
import { getCertStatus } from "@/lib/cert-status";

const ASOF = new Date("2026-05-04T10:00:00Z");
const daysFrom = (base: Date, n: number) => new Date(base.getTime() + n * 86_400_000);

describe("getCertStatus", () => {
  it("returns missing for a null expiry date", () => {
    expect(getCertStatus(null, ASOF).status).toBe("missing");
  });

  describe("classified against an explicit asOf date (not the real clock)", () => {
    it("treats expiry exactly +30d as expiring (boundary)", () => {
      expect(getCertStatus(daysFrom(ASOF, 30), ASOF).status).toBe("expiring");
    });

    it("treats expiry +31d as valid", () => {
      expect(getCertStatus(daysFrom(ASOF, 31), ASOF).status).toBe("valid");
    });

    it("treats expiry the same day as expiring (0 days left)", () => {
      expect(getCertStatus(daysFrom(ASOF, 0), ASOF).status).toBe("expiring");
    });

    it("treats a past expiry as expired", () => {
      const res = getCertStatus(daysFrom(ASOF, -1), ASOF);
      expect(res.status).toBe("expired");
      expect(res.daysLeft).toBeLessThan(0);
    });

    it("is deterministic regardless of when the test runs", () => {
      // +60d from a fixed asOf is always valid, even years after this test was written.
      expect(getCertStatus(daysFrom(ASOF, 60), ASOF).status).toBe("valid");
    });
  });

  it("defaults asOf to the real clock (backward compatible)", () => {
    const oneYearOut = new Date(Date.now() + 365 * 86_400_000);
    expect(getCertStatus(oneYearOut).status).toBe("valid");
    const longExpired = new Date(Date.now() - 365 * 86_400_000);
    expect(getCertStatus(longExpired).status).toBe("expired");
  });
});
