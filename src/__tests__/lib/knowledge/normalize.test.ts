import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  parseFilenameMeta,
  canonicalState,
  inferTier,
  hashContent,
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
});

describe("hashContent", () => {
  it("is stable and ignores trailing whitespace differences", () => {
    expect(hashContent("abc\n")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    expect(hashContent("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
