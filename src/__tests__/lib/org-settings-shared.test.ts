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

// ── eos block (execution layer, 2026-08-31) ─────────────────────────────

import {
  orgSettingsConfigSchema as schema2,
  ORG_SETTINGS_DEFAULTS as defaults2,
  mergeOrgSettings as merge2,
} from "@/lib/org-settings-shared";

describe("eos.measurableOffTrackWeeks", () => {
  it("legacy documents without the block still parse (object default)", () => {
    // A pre-2026-08-31 stored config is exactly today's shape minus `eos`.
    const legacy = { ...(defaults2 as Record<string, unknown>) };
    delete legacy.eos;
    const parsed = schema2.parse(legacy as never);
    expect(parsed.eos.measurableOffTrackWeeks).toBe(3);
  });

  it("rejects out-of-range values", () => {
    expect(() =>
      schema2.parse({ ...defaults2, eos: { measurableOffTrackWeeks: 1 } } as never),
    ).toThrow();
    expect(() =>
      schema2.parse({ ...defaults2, eos: { measurableOffTrackWeeks: 7 } } as never),
    ).toThrow();
  });

  it("merge branch keeps a valid stored value and defaults an invalid one", () => {
    expect(merge2({ eos: { measurableOffTrackWeeks: 5 } }).eos.measurableOffTrackWeeks).toBe(5);
    expect(merge2({ eos: { measurableOffTrackWeeks: 99 } }).eos.measurableOffTrackWeeks).toBe(3);
    expect(merge2({}).eos.measurableOffTrackWeeks).toBe(3);
  });
});

// ─── Phase 9 (Staff Portal v2): compliance.requiredCertsByRole ──────────────

describe("compliance.requiredCertsByRole — schema", () => {
  it("legacy documents without the block still parse and get the defaults (full-replace PATCH rationale)", () => {
    const legacy = { ...(defaults2 as Record<string, unknown>) };
    delete legacy.compliance;
    const parsed = schema2.parse(legacy as never);
    expect(parsed.compliance.requiredCertsByRole.staff).toEqual([
      "wwcc",
      "first_aid",
      "cpr",
      "anaphylaxis",
      "child_protection",
    ]);
    expect(parsed.compliance.requiredCertsByRole.member).toEqual(
      parsed.compliance.requiredCertsByRole.staff,
    );
    expect(parsed.compliance.requiredCertsByRole.owner).toEqual([]);
    expect(parsed.compliance.requiredCertsByRole.marketing).toEqual([]);
  });

  it("round-trips ORG_SETTINGS_DEFAULTS", () => {
    const parsed = schema2.parse(defaults2);
    expect(parsed.compliance).toEqual(defaults2.compliance);
  });

  it("accepts a customised matrix (including an explicitly empty list)", () => {
    const doc = structuredClone(defaults2) as never as {
      compliance: { requiredCertsByRole: Record<string, string[]> };
    };
    doc.compliance.requiredCertsByRole.staff = ["wwcc", "asthma"];
    doc.compliance.requiredCertsByRole.member = [];
    const parsed = schema2.parse(doc as never);
    expect(parsed.compliance.requiredCertsByRole.staff).toEqual(["wwcc", "asthma"]);
    expect(parsed.compliance.requiredCertsByRole.member).toEqual([]);
  });

  it("rejects an unknown cert type", () => {
    const doc = structuredClone(defaults2) as never as {
      compliance: { requiredCertsByRole: Record<string, string[]> };
    };
    doc.compliance.requiredCertsByRole.staff = ["wwcc", "scuba_license"];
    expect(schema2.safeParse(doc as never).success).toBe(false);
  });

  it("rejects 'other' as a required type (excluded from the canonical list)", () => {
    const doc = structuredClone(defaults2) as never as {
      compliance: { requiredCertsByRole: Record<string, string[]> };
    };
    doc.compliance.requiredCertsByRole.staff = ["other"];
    expect(schema2.safeParse(doc as never).success).toBe(false);
  });

  it("rejects an unknown role key (strict object)", () => {
    const doc = structuredClone(defaults2) as never as {
      compliance: { requiredCertsByRole: Record<string, string[]> };
    };
    doc.compliance.requiredCertsByRole.coordinator = ["wwcc"];
    expect(schema2.safeParse(doc as never).success).toBe(false);
  });

  it("defaults a missing individual role key (document saved before a role existed)", () => {
    const doc = structuredClone(defaults2) as never as {
      compliance: { requiredCertsByRole: Record<string, string[] | undefined> };
    };
    delete doc.compliance.requiredCertsByRole.eos;
    const parsed = schema2.parse(doc as never);
    expect(parsed.compliance.requiredCertsByRole.eos).toEqual([]);
  });
});

describe("compliance.requiredCertsByRole — merge branch", () => {
  it("carries a stored matrix through the merge", () => {
    const merged = merge2({
      compliance: { requiredCertsByRole: { staff: ["wwcc", "asthma"] } },
    });
    expect(merged.compliance.requiredCertsByRole.staff).toEqual(["wwcc", "asthma"]);
    // Roles absent from the stored doc fall back to their defaults.
    expect(merged.compliance.requiredCertsByRole.member).toEqual([
      "wwcc",
      "first_aid",
      "cpr",
      "anaphylaxis",
      "child_protection",
    ]);
  });

  it("keeps an explicitly empty stored list (empty ≠ missing)", () => {
    const merged = merge2({
      compliance: { requiredCertsByRole: { staff: [] } },
    });
    expect(merged.compliance.requiredCertsByRole.staff).toEqual([]);
  });

  it("falls back to defaults when the block is absent (legacy row)", () => {
    const merged = merge2({});
    expect(merged.compliance).toEqual(defaults2.compliance);
  });

  it("drops invalid entries permissively on read (unknown types, dupes, non-strings)", () => {
    const merged = merge2({
      compliance: {
        requiredCertsByRole: { staff: ["wwcc", "bogus", "wwcc", 7, null, "cpr"] },
      },
    });
    expect(merged.compliance.requiredCertsByRole.staff).toEqual(["wwcc", "cpr"]);
  });

  it("falls back to the role default for a non-array stored value", () => {
    const merged = merge2({
      compliance: { requiredCertsByRole: { staff: "wwcc" } },
    });
    expect(merged.compliance.requiredCertsByRole.staff).toEqual(
      defaults2.compliance.requiredCertsByRole.staff,
    );
  });
});
