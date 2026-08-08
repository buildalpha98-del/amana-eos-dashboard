import { describe, it, expect } from "vitest";

import {
  orgSettingsConfigSchema,
  ORG_SETTINGS_DEFAULTS,
  mergeOrgSettings,
} from "@/lib/org-settings-shared";

/**
 * First dedicated test file for org-settings-shared (Phase 7). The three
 * invariants every NEW config field must satisfy:
 *
 *  1. The schema carries a `.default()` — PATCH /api/org-settings/config is
 *     a strict FULL-REPLACE, so a legacy document (saved before the field
 *     existed) must still parse or every settings save breaks org-wide.
 *  2. ORG_SETTINGS_DEFAULTS includes the field (and round-trips the schema).
 *  3. The HAND-ROLLED per-field mergeOrgSettings carries the field — a
 *     missed merge branch silently never surfaces the stored value.
 */

/** A full valid document as saved BEFORE marketingWeeklyCap existed. */
function legacyDocument(): Record<string, unknown> {
  const doc = structuredClone(ORG_SETTINGS_DEFAULTS) as unknown as {
    email: Record<string, unknown>;
  };
  delete doc.email.marketingWeeklyCap;
  return doc as unknown as Record<string, unknown>;
}

describe("orgSettingsConfigSchema — email.marketingWeeklyCap", () => {
  it("accepts a legacy document WITHOUT the field and defaults it to 3 (full-replace PATCH rationale)", () => {
    const parsed = orgSettingsConfigSchema.parse(legacyDocument());
    expect(parsed.email.marketingWeeklyCap).toBe(3);
  });

  it("round-trips ORG_SETTINGS_DEFAULTS (defaults document is schema-valid, cap = 3)", () => {
    const parsed = orgSettingsConfigSchema.parse(ORG_SETTINGS_DEFAULTS);
    expect(parsed.email.marketingWeeklyCap).toBe(3);
    expect(ORG_SETTINGS_DEFAULTS.email.marketingWeeklyCap).toBe(3);
  });

  it("accepts the boundary values 1 and 20", () => {
    for (const cap of [1, 20]) {
      const doc = legacyDocument() as { email: Record<string, unknown> };
      doc.email.marketingWeeklyCap = cap;
      const parsed = orgSettingsConfigSchema.parse(doc);
      expect(parsed.email.marketingWeeklyCap).toBe(cap);
    }
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["above max", 21],
    ["non-integer", 2.5],
    ["string", "5"],
  ])("rejects an out-of-range / wrong-type cap (%s)", (_label, bad) => {
    const doc = legacyDocument() as { email: Record<string, unknown> };
    doc.email.marketingWeeklyCap = bad;
    expect(orgSettingsConfigSchema.safeParse(doc).success).toBe(false);
  });
});

describe("mergeOrgSettings — email.marketingWeeklyCap branch", () => {
  it("carries a stored cap through the merge", () => {
    const merged = mergeOrgSettings({ email: { marketingWeeklyCap: 7 } });
    expect(merged.email.marketingWeeklyCap).toBe(7);
  });

  it("falls back to the default (3) when the field is absent (legacy row)", () => {
    const merged = mergeOrgSettings({ email: { senderName: "Custom" } });
    expect(merged.email.marketingWeeklyCap).toBe(3);
    // The sibling fields still merge — the new branch must not disturb them.
    expect(merged.email.senderName).toBe("Custom");
  });

  it("falls back to the default for invalid stored values (permissive-on-read)", () => {
    for (const bad of [0, -2, 21, 2.5, "5", null]) {
      const merged = mergeOrgSettings({ email: { marketingWeeklyCap: bad } });
      expect(merged.email.marketingWeeklyCap).toBe(3);
    }
  });

  it("keeps custom sender identity AND custom cap together", () => {
    const merged = mergeOrgSettings({
      email: {
        senderEmail: "hello@example.com",
        senderName: "Example",
        marketingWeeklyCap: 5,
      },
    });
    expect(merged.email).toEqual({
      senderEmail: "hello@example.com",
      senderName: "Example",
      marketingWeeklyCap: 5,
    });
  });
});
