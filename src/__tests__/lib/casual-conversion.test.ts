/**
 * Pure-helper tests for the casual conversion library.
 *
 * `computeEligibility` is DB-touching (integration territory); we
 * pin down `daysUntilResponseDeadline` here since that's the pure
 * function the UI uses for its 21-day countdown.
 */
import { describe, it, expect } from "vitest";
import { daysUntilResponseDeadline } from "@/lib/casual-conversion";

const dayMs = 86400000;

describe("daysUntilResponseDeadline", () => {
  it("returns 21 when asOf == electedAt", () => {
    const electedAt = new Date("2026-06-01T00:00:00Z");
    const out = daysUntilResponseDeadline(electedAt, electedAt);
    expect(out).toBe(21);
  });

  it("counts down as days pass", () => {
    const electedAt = new Date("2026-06-01T00:00:00Z");
    const tenDaysLater = new Date(electedAt.getTime() + 10 * dayMs);
    expect(daysUntilResponseDeadline(electedAt, tenDaysLater)).toBe(11);
  });

  it("returns 0 exactly on the deadline day", () => {
    const electedAt = new Date("2026-06-01T00:00:00Z");
    const day21 = new Date(electedAt.getTime() + 21 * dayMs);
    expect(daysUntilResponseDeadline(electedAt, day21)).toBe(0);
  });

  it("returns negative when overdue", () => {
    const electedAt = new Date("2026-06-01T00:00:00Z");
    const day25 = new Date(electedAt.getTime() + 25 * dayMs);
    expect(daysUntilResponseDeadline(electedAt, day25)).toBe(-4);
  });
});
