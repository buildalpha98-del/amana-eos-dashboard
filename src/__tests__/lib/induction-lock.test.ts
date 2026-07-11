/**
 * Edge-safe induction lock helpers (imported by middleware + sidebar).
 * Pure functions — no Prisma, no DB mock needed.
 */
import { describe, it, expect } from "vitest";
import {
  isInductionLocked,
  isInductionAllowedPath,
  INDUCTION_ALLOWED_PREFIXES,
} from "@/lib/induction-lock";

const now = new Date("2026-07-07T00:00:00Z");
const future = new Date("2026-08-11T00:00:00Z");
const past = new Date("2026-06-01T00:00:00Z");

describe("isInductionLocked", () => {
  it("new_starter is locked", () => {
    expect(isInductionLocked("new_starter", null, now)).toBe(true);
  });
  it("in_training without grace is locked", () => {
    expect(isInductionLocked("in_training", null, now)).toBe(true);
  });
  it("in_training with future grace is NOT locked (backfill still working)", () => {
    expect(isInductionLocked("in_training", future, now)).toBe(false);
  });
  it("in_training with expired grace is locked", () => {
    expect(isInductionLocked("in_training", past, now)).toBe(true);
  });
  it("awaiting_signoff is NOT locked (regains dashboard while waiting)", () => {
    expect(isInductionLocked("awaiting_signoff", null, now)).toBe(false);
  });
  it("cleared is NOT locked", () => {
    expect(isInductionLocked("cleared", null, now)).toBe(false);
  });
  it("undefined/null status is NOT locked", () => {
    expect(isInductionLocked(undefined, null, now)).toBe(false);
    expect(isInductionLocked(null, null, now)).toBe(false);
  });
});

describe("isInductionAllowedPath", () => {
  it("allows the induction surfaces", () => {
    expect(isInductionAllowedPath("/my-training")).toBe(true);
    expect(isInductionAllowedPath("/learn/enr-123")).toBe(true);
    expect(isInductionAllowedPath("/profile")).toBe(true);
    expect(isInductionAllowedPath("/handbook")).toBe(true);
    expect(isInductionAllowedPath("/policies")).toBe(true);
  });
  it("blocks everything else", () => {
    expect(isInductionAllowedPath("/rocks")).toBe(false);
    expect(isInductionAllowedPath("/dashboard")).toBe(false);
    expect(isInductionAllowedPath("/roster/me")).toBe(false);
  });
  it("every allowed prefix resolves as allowed", () => {
    for (const p of INDUCTION_ALLOWED_PREFIXES) {
      expect(isInductionAllowedPath(p)).toBe(true);
    }
  });
});
