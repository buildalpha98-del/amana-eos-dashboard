import { describe, expect, it } from "vitest";
import { websiteEnrolContext } from "@/lib/website-enrol-context";
describe("website enrolment context", () => {
  it("keeps recognised centre and programme without accepting redirect or personal data", () => {
    const p = websiteEnrolContext(
      new URLSearchParams(
        "centre=mfis-greenacre&program=holiday-quest&email=private@example.test&redirect=https://evil.test&days=arbitrary",
      ),
    );
    expect(p.toString()).toBe("centre=mfis-greenacre&program=holiday-quest");
  });
  it("ignores unknown centres, prototype names and arbitrary programmes", () => {
    for (const centre of ["unknown", "__proto__", "constructor"])
      expect(
        websiteEnrolContext(new URLSearchParams({ centre, program: "unknown" }))
          .size,
      ).toBe(0);
  });
});
