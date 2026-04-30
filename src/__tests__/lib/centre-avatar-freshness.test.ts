import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  daysSince,
  isGateOpen,
} from "@/lib/centre-avatar/freshness";

describe("centre-avatar/freshness", () => {
  const now = new Date("2026-04-25T00:00:00Z");

  describe("classifyFreshness", () => {
    it("returns fresh when updated within 30 days", () => {
      expect(classifyFreshness(new Date("2026-04-24T00:00:00Z"), now)).toBe("fresh");
      expect(classifyFreshness(new Date("2026-03-27T00:00:00Z"), now)).toBe("fresh");
    });

    it("returns aging when updated 31\u201360 days ago", () => {
      expect(classifyFreshness(new Date("2026-03-20T00:00:00Z"), now)).toBe("aging");
      expect(classifyFreshness(new Date("2026-02-25T00:00:00Z"), now)).toBe("aging");
    });

    it("returns stale when updated over 60 days ago", () => {
      expect(classifyFreshness(new Date("2026-02-20T00:00:00Z"), now)).toBe("stale");
      expect(classifyFreshness(new Date("2025-10-01T00:00:00Z"), now)).toBe("stale");
    });
  });

  describe("daysSince", () => {
    it("returns whole days between two dates", () => {
      expect(daysSince(new Date("2026-04-20T00:00:00Z"), now)).toBe(5);
      expect(daysSince(new Date("2026-04-25T00:00:00Z"), now)).toBe(0);
    });
  });

  describe("isGateOpen", () => {
    it("returns false when never opened", () => {
      expect(isGateOpen(null, null, "u1", now)).toBe(false);
    });

    it("returns false when opened by a different user", () => {
      expect(
        isGateOpen(new Date("2026-04-24T00:00:00Z"), "u2", "u1", now),
      ).toBe(false);
    });

    it("returns true when the current user opened it within 7 days", () => {
      expect(
        isGateOpen(new Date("2026-04-20T00:00:00Z"), "u1", "u1", now),
      ).toBe(true);
    });

    it("returns false when opened >7 days ago", () => {
      expect(
        isGateOpen(new Date("2026-04-10T00:00:00Z"), "u1", "u1", now),
      ).toBe(false);
    });
  });
});
