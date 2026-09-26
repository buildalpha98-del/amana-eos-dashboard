import { describe, it, expect } from "vitest";
import { isAllowedReferenceHost, ALLOWED_REFERENCE_HOSTS } from "@/lib/reference-hosts";
describe("reference hosts", () => {
  it("accepts allow-listed hosts case-insensitively and rejects everything else", () => {
    expect(isAllowedReferenceHost("https://www.acecqa.gov.au/x")).toBe(true);
    expect(isAllowedReferenceHost("https://WWW.NHMRC.GOV.AU/x")).toBe(true);
    expect(isAllowedReferenceHost("https://evil.example/x")).toBe(false);
    expect(isAllowedReferenceHost("not a url")).toBe(false);
    expect(ALLOWED_REFERENCE_HOSTS.has("allergy.org.au")).toBe(true);
  });
});
