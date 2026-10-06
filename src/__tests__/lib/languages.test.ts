import { describe, it, expect } from "vitest";
import { languageFromText, isPreferredLanguage } from "@/lib/languages";
import { compileAudienceWhere, audienceRulesSchema } from "@/lib/audience-rules";

describe("languageFromText (backfill for families before the dropdown)", () => {
  it.each([
    ["Arabic", "Arabic"],
    ["arabic and english", "Arabic"],
    ["English, Urdu", "Urdu"],
    ["Bengali", "Bangla"],
    ["Farsi", "Dari / Persian"],
    ["english", "English"],
    ["Swahili", "Other"],
  ])("%s → %s", (input, expected) => {
    expect(languageFromText(input)).toBe(expected);
  });

  it("says nothing for a blank answer", () => {
    expect(languageFromText("  ")).toBeNull();
    expect(languageFromText(undefined)).toBeNull();
  });

  it("only accepts list values as-is", () => {
    expect(isPreferredLanguage("Arabic")).toBe(true);
    expect(isPreferredLanguage("arabic")).toBe(false);
  });
});

describe("email audiences by preferred language", () => {
  it("targets only families who chose one of the languages", () => {
    const rules = audienceRulesSchema.parse({ languages: ["Arabic", "Urdu"] });
    expect(compileAudienceWhere(rules)).toMatchObject({
      subscribed: true,
      preferredLanguage: { in: ["Arabic", "Urdu"] },
    });
  });

  it("rejects a language that isn't on the list", () => {
    expect(audienceRulesSchema.safeParse({ languages: ["Klingon"] }).success).toBe(false);
  });

  it("leaves language out entirely when no rule is set", () => {
    expect(compileAudienceWhere({})).not.toHaveProperty("preferredLanguage");
  });
});
