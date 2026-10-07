import { describe, it, expect } from "vitest";
import { effectiveSummary, isDefaultKeyPolicyTitle } from "@/lib/key-policy-summaries";

describe("key policy summaries", () => {
  it.each([
    "Code of Conduct Policy",
    "Child Safe Code of Conduct",
    "Privacy and Confidentiality Policy",
    "Privacy Policy",
  ])("%s is a key policy by default", (t) => expect(isDefaultKeyPolicyTitle(t)).toBe(true));

  it("other policies aren't", () => expect(isDefaultKeyPolicyTitle("Sun Safe Policy")).toBe(false));

  it("the admin's own summary wins over the default", () => {
    expect(effectiveSummary({ title: "Privacy Policy", summary: "Ours" })).toBe("Ours");
  });

  it("falls back to the built-in short version", () => {
    expect(effectiveSummary({ title: "Code of Conduct Policy", summary: null })).toMatch(/mandatory reporter/i);
    expect(effectiveSummary({ title: "Privacy and Confidentiality Policy", summary: "  " })).toMatch(/passwords/i);
  });

  it("no summary for an ordinary policy", () => {
    expect(effectiveSummary({ title: "Sun Safe Policy", summary: null })).toBeNull();
  });
});
