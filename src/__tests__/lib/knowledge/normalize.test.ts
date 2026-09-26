import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  parseFilenameMeta,
  canonicalState,
  inferTier,
  hashContent,
  looksLikeCredential,
} from "@/lib/knowledge/normalize";

describe("normalizeTitle", () => {
  it("strips version, state, OSHC and extension so duplicates collide", () => {
    expect(normalizeTitle("QA2 Rest Time Procedure OSHC V2.docx")).toBe(
      "qa2 rest time procedure",
    );
    expect(normalizeTitle("QA2 Rest Time Procedure OSHC V3.docx")).toBe(
      "qa2 rest time procedure",
    );
    expect(normalizeTitle("QA2 Bushfire Policy NSW OSHC V11.docx")).toBe(
      "qa2 bushfire policy",
    );
    // Extension allowlist: only a recognised document extension is stripped —
    // a dotted non-extension token (e.g. a financial-year suffix) is not
    // eaten, it just collapses to a space like any other punctuation.
    expect(normalizeTitle("Budget Report FY23.24")).toBe("budget report fy23 24");
  });
  it("collapses punctuation and whitespace", () => {
    expect(normalizeTitle("  QA7 — Dealing with Complaints  Policy ")).toBe(
      "qa7 dealing with complaints policy",
    );
  });
});

describe("parseFilenameMeta", () => {
  it("reads QA, version and state from a policy filename", () => {
    expect(parseFilenameMeta("QA2 Bushfire Policy NSW OSHC V11.docx")).toEqual({
      qualityArea: 2,
      version: 11,
      state: "NSW",
      category: "policy",
    });
  });
  it("reads procedure/sop categories and leaves unknowns null", () => {
    expect(parseFilenameMeta("QA5 Behaviour Guidance Procedure OSHC V4.docx").category).toBe("procedure");
    expect(parseFilenameMeta("OPS-10 Emergency Evacuation Procedures.docx")).toEqual({
      qualityArea: null,
      version: null,
      state: null,
      category: "procedure",
    });
    expect(parseFilenameMeta("Weekly Menu Template.docx").category).toBe("guide");
  });
});

describe("canonicalState", () => {
  it("maps full names and abbreviations case-insensitively", () => {
    expect(canonicalState("New South Wales")).toBe("NSW");
    expect(canonicalState("nsw")).toBe("NSW");
    expect(canonicalState("Victoria")).toBe("VIC");
    expect(canonicalState("")).toBeNull();
    expect(canonicalState(null)).toBeNull();
    expect(canonicalState("Narnia")).toBeNull();
  });
});

describe("inferTier", () => {
  it("is safety_critical for QA2 and for safety keywords in the title", () => {
    expect(inferTier({ qualityArea: 2, title: "QA2 Rest Time Policy" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: null, title: "Child Protection Policy" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: null, title: "OPS-10 Emergency Evacuation Procedures" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: 7, title: "Governance Policy" })).toBe("general");
    expect(inferTier({ qualityArea: null, title: "Weekly Menu Template" })).toBe("general");
  });

  it("requires a child-safety context for 'collection' and 'transport', not the bare word", () => {
    expect(inferTier({ qualityArea: null, title: "Data Collection Policy" })).toBe("general");
  });
  it("does not flag generic transport-related titles", () => {
    expect(inferTier({ qualityArea: null, title: "Transport Allowance Policy" })).toBe("general");
  });
  it("is safety_critical for QA2 regardless of wording", () => {
    expect(
      inferTier({ qualityArea: 2, title: "QA2 Safe Transportation Procedure OSHC V1" }),
    ).toBe("safety_critical");
  });
  it("is safety_critical for safe collection of children even outside QA2", () => {
    expect(
      inferTier({ qualityArea: null, title: "Safe Collection of Children Procedure" }),
    ).toBe("safety_critical");
  });

  describe("a company SOP is never safety-critical (the Jayden SOP set is over a year stale)", () => {
    it("OPS-08 Medical Administration as an SOP is general", () => {
      expect(inferTier({ qualityArea: null, title: "OPS-08 Medical Administration", category: "sop" })).toBe("general");
    });
    it("the category beats a matching safety keyword AND the QA2 rule", () => {
      // "Emergency Evacuation" matches the keyword list; as a procedure it is safety_critical, as an SOP it is not.
      expect(inferTier({ qualityArea: null, title: "OPS-10 Emergency Evacuation Procedures", category: "sop" })).toBe("general");
      expect(inferTier({ qualityArea: null, title: "OPS-10 Emergency Evacuation Procedures", category: "procedure" })).toBe("safety_critical");
      expect(inferTier({ qualityArea: 2, title: "Medication Administration", category: "sop" })).toBe("general");
    });
    it("the state procedure that SHOULD answer a medication question stays safety_critical", () => {
      expect(inferTier({ qualityArea: 2, title: "QA2 Managing Medical Conditions Procedure OSHC V3", category: "procedure" })).toBe("safety_critical");
      expect(inferTier({ qualityArea: null, title: "Administration of First Aid Procedure", category: "procedure" })).toBe("safety_critical");
    });
    it("other categories (and no category) keep the title/QA heuristic", () => {
      expect(inferTier({ qualityArea: null, title: "Medication Policy", category: "policy" })).toBe("safety_critical");
      expect(inferTier({ qualityArea: null, title: "Medication Policy", category: null })).toBe("safety_critical");
      expect(inferTier({ qualityArea: null, title: "Weekly Menu Template", category: "guide" })).toBe("general");
    });
  });
});

describe("hashContent", () => {
  it("is stable and ignores trailing whitespace differences", () => {
    expect(hashContent("abc\n")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    expect(hashContent("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("looksLikeCredential", () => {
  it("matches a labelled password/key/token value", () => {
    expect(looksLikeCredential("Step 3: login with Password: hunter22")).toBe(true);
    expect(looksLikeCredential("api_key=abc123456789")).toBe(true);
    expect(looksLikeCredential("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(true);
    expect(looksLikeCredential("secret: amana_abcdefgh12")).toBe(true);
    expect(looksLikeCredential("access_token=abcdef123456")).toBe(true);
    expect(looksLikeCredential("pwd: hunter22")).toBe(true);
  });

  it("is case-insensitive on the label", () => {
    expect(looksLikeCredential("PASSWORD: hunter22")).toBe(true);
    expect(looksLikeCredential("Token = abcdef123456")).toBe(true);
  });

  it("does not match the label alone, or ordinary prose that mentions it", () => {
    expect(looksLikeCredential("Password policy")).toBe(false);
    expect(looksLikeCredential("Please reset your password before your first shift")).toBe(false);
    expect(looksLikeCredential("Staff receive a token of appreciation each term")).toBe(false);
    expect(looksLikeCredential("Enter your secret santa pick below")).toBe(false);
    expect(looksLikeCredential("Bearer bonds mature next quarter")).toBe(false);
  });

  it("requires a long-enough value, not just the label and a separator", () => {
    expect(looksLikeCredential("Password: ab")).toBe(false); // < 4 chars
    expect(looksLikeCredential("token: short")).toBe(false); // < 12 chars for the key/token/secret group
    expect(looksLikeCredential("Bearer short")).toBe(false); // < 16 chars
  });

  it("ignores policy prose that labels a field without giving it a secret-shaped value (2026-09-27 false positives)", () => {
    // A plain-word continuation after the label, not a value.
    expect(looksLikeCredential("Password: must be at least 8 characters")).toBe(false);
    expect(looksLikeCredential("Password: minimum eight characters")).toBe(false);
    // A reference number, not a secret: the key/token/secret group requires
    // a letter AND a digit/symbol, so an all-digit value doesn't count.
    expect(looksLikeCredential("Token: 12345678")).toBe(false);
    // A record-number-shaped label the guard was never meant to catch.
    expect(looksLikeCredential("CRN: 123456789A")).toBe(false);
  });

  it("ignores sentence punctuation glued to a plain-word value (the symbol must be INSIDE the value)", () => {
    expect(looksLikeCredential("Password: required.")).toBe(false);
    expect(looksLikeCredential("Password: mandatory!")).toBe(false);
    expect(looksLikeCredential("Password: confidential.")).toBe(false);
    expect(looksLikeCredential("Password: required, thanks.")).toBe(false);
    // …but a real secret that happens to end a sentence still matches.
    expect(looksLikeCredential("Password: hunter22.")).toBe(true);
    // Every labelled occurrence is checked, not only the first.
    expect(looksLikeCredential("Password: required. Later: Password: hunter22")).toBe(true);
  });

  it("still matches real credential shapes", () => {
    expect(looksLikeCredential("Password: hunter22")).toBe(true);
    expect(looksLikeCredential("password=Summer2026!")).toBe(true);
    expect(looksLikeCredential("api_key=amana_4eC39HqLyjWDarjtT1zdp7dc")).toBe(true);
    expect(looksLikeCredential("Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).toBe(true);
  });
});
