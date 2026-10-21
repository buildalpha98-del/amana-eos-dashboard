/**
 * Educators see attendance, never family billing (Daniel, 2026-10-21).
 */
import { describe, expect, it } from "vitest";
import { canSeeFamilyBilling, redactChildBilling } from "@/lib/family-billing-access";

const child = {
  id: "c1",
  crn: "123456789A",
  enrolment: {
    primaryParent: { firstName: "Synthetic", mobile: "0400000000", crn: "987654321B" },
    secondaryParent: { firstName: "Second", crn: "111111111C" },
    authorisedPickup: [{ name: "Gran" }],
  },
};

describe("family billing access", () => {
  it.each(["owner", "head_office", "admin", "member"])("%s sees billing", (role) => {
    expect(canSeeFamilyBilling({ role })).toBe(true);
    expect(redactChildBilling({ role }, child)).toBe(child);
  });

  it.each(["staff", "marketing", "eos", "eos_viewer", "volunteer", null])("%s does not", (role) => {
    expect(canSeeFamilyBilling({ role })).toBe(false);
  });

  it("strips the child's and both parents' CRNs for an educator, and keeps what the floor needs", () => {
    const out = redactChildBilling({ role: "staff" }, child);
    expect(out.crn).toBeNull();
    expect(out.enrolment?.primaryParent).toEqual({ firstName: "Synthetic", mobile: "0400000000" });
    expect(out.enrolment?.secondaryParent).toEqual({ firstName: "Second" });
    expect(out.enrolment).toMatchObject({ authorisedPickup: [{ name: "Gran" }] });
    expect(JSON.stringify(out)).not.toMatch(/987654321B|111111111C|123456789A/);
  });

  it("copes with no enrolment", () => {
    expect(redactChildBilling({ role: "staff" }, { crn: "x", enrolment: null })).toEqual({ crn: null, enrolment: null });
  });
});
