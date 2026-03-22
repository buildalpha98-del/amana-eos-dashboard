import { describe, it, expect } from "vitest";
import { todayISO, daysAgoISO } from "@/lib/owna-sync";

describe("OWNA sync helpers", () => {
  describe("todayISO", () => {
    it("returns a YYYY-MM-DD formatted string", () => {
      const result = todayISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns a valid date", () => {
      const result = todayISO();
      const d = new Date(result);
      expect(d.getTime()).not.toBeNaN();
    });
  });

  describe("daysAgoISO", () => {
    it("returns a YYYY-MM-DD formatted string", () => {
      const result = daysAgoISO(7);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns a date in the past", () => {
      const today = new Date(todayISO());
      const weekAgo = new Date(daysAgoISO(7));
      expect(weekAgo.getTime()).toBeLessThan(today.getTime());
    });

    it("returns today when days=0", () => {
      expect(daysAgoISO(0)).toBe(todayISO());
    });
  });
});
