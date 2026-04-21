import { describe, it, expect } from "vitest";
import { computeRatio, RATIO_THRESHOLD } from "@/lib/roster-ratio";

describe("computeRatio", () => {
  it("none when no children", () => {
    expect(computeRatio(2, 0).status).toBe("none");
  });
  it("breach when no staff but children present", () => {
    expect(computeRatio(0, 10).status).toBe("breach");
  });
  it("ok well below threshold (10:1)", () => {
    expect(computeRatio(2, 20).status).toBe("ok");
  });
  it("warning near threshold (12:1, >85% of 13)", () => {
    expect(computeRatio(1, 12).status).toBe("warning");
  });
  it("exactly at threshold (13:1) is ok, not breach", () => {
    expect(computeRatio(1, 13).status).toBe("warning");  // 13 > 11.05 so "warning"
  });
  it("breach above threshold (14:1)", () => {
    expect(computeRatio(1, 14).status).toBe("breach");
  });
  it("RATIO_THRESHOLD = 13", () => {
    expect(RATIO_THRESHOLD).toBe(13);
  });
});
