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
    expect(isInductionLocked("new_starter", null, { now })).toBe(true);
  });
  it("in_training without grace is locked", () => {
    expect(isInductionLocked("in_training", null, { now })).toBe(true);
  });
  it("in_training with future grace is NOT locked (backfill still working)", () => {
    expect(isInductionLocked("in_training", future, { now })).toBe(false);
  });
  it("in_training with expired grace is locked", () => {
    expect(isInductionLocked("in_training", past, { now })).toBe(true);
  });
  it("awaiting_signoff is NOT locked (regains dashboard while waiting)", () => {
    expect(isInductionLocked("awaiting_signoff", null, { now })).toBe(false);
  });
  it("cleared is NOT locked", () => {
    expect(isInductionLocked("cleared", null, { now })).toBe(false);
  });
  it("undefined/null status is NOT locked", () => {
    expect(isInductionLocked(undefined, null, { now })).toBe(false);
    expect(isInductionLocked(null, null, { now })).toBe(false);
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

/**
 * 2026-08-25 incident: the 5-week backfill grace expired and locked 77 of 82
 * active staff at once — including all 4 owners and the admin. Because
 * `/onboarding` (practical sign-off + override) is not an induction surface
 * and the lock ran before the role check with no role exemption, NOBODY could
 * reach the tool that unlocks people. Admin-tier roles administer the gate, so
 * the gate must never lock them out of it.
 */
describe("isInductionLocked — exempt roles", () => {
  it.each(["owner", "head_office", "admin"])(
    "%s administers the gate, so is never locked by it",
    (role) => {
      expect(isInductionLocked("in_training", null, { role, now })).toBe(false);
      expect(isInductionLocked("new_starter", null, { role, now })).toBe(false);
    },
  );

  // Marketing has no child-facing duties, so the OSHC induction curriculum
  // (child safety, first day on the floor, active supervision) does not apply.
  it("marketing is exempt — the induction curriculum is child-facing", () => {
    expect(isInductionLocked("in_training", null, { role: "marketing", now })).toBe(false);
  });

  it.each(["member", "staff", "eos_viewer", "eos_implementer"])(
    "%s is still locked — exemption does not extend to floor-facing roles",
    (role) => {
      expect(isInductionLocked("in_training", null, { role, now })).toBe(true);
    },
  );

  it("omitting role keeps the pre-existing locked behaviour", () => {
    expect(isInductionLocked("in_training", null, { now })).toBe(true);
  });
});

describe("isInductionAllowedPath — compliance surface", () => {
  /**
   * The WWCC blocker is unsatisfiable unless a locked user can reach the cert
   * uploader, which lives on /compliance. The route scopes staff to their own
   * certs server-side (`scope=self` / role==="staff"), so exposing it to a
   * locked user leaks nothing.
   */
  it("allows /compliance so a locked staffer can upload their WWCC", () => {
    expect(isInductionAllowedPath("/compliance")).toBe(true);
  });

  it("still blocks the admin induction surface", () => {
    expect(isInductionAllowedPath("/onboarding")).toBe(false);
  });
});
