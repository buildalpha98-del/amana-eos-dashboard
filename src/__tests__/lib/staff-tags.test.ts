import { describe, it, expect } from "vitest";
import {
  normaliseTag,
  normaliseTagList,
  MAX_TAGS_PER_USER,
  MAX_TAG_LENGTH,
} from "@/lib/staff-tags";

describe("normaliseTag", () => {
  it("lowercases and trims", () => {
    expect(normaliseTag("  NSW  ")).toBe("nsw");
    expect(normaliseTag("VIC")).toBe("vic");
  });

  it("collapses internal whitespace to hyphens so 'Lead trainer' = 'lead-trainer'", () => {
    expect(normaliseTag("Lead trainer")).toBe("lead-trainer");
    expect(normaliseTag("weekend  only")).toBe("weekend-only");
    expect(normaliseTag("  Multi   word  tag  ")).toBe("multi-word-tag");
  });

  it("accepts digits and hyphens already in the input", () => {
    expect(normaliseTag("cert-3")).toBe("cert-3");
    expect(normaliseTag("region-7")).toBe("region-7");
  });

  it("rejects empty / whitespace-only input", () => {
    expect(normaliseTag("")).toBeNull();
    expect(normaliseTag("   ")).toBeNull();
  });

  it("rejects forbidden characters (commas, slashes, emoji, accents)", () => {
    expect(normaliseTag("staff,nsw")).toBeNull();
    expect(normaliseTag("admin/lead")).toBeNull();
    expect(normaliseTag("🚀")).toBeNull();
    expect(normaliseTag("Café")).toBeNull();
  });

  it("rejects tags longer than MAX_TAG_LENGTH after normalisation", () => {
    expect(normaliseTag("a".repeat(MAX_TAG_LENGTH))).toBe(
      "a".repeat(MAX_TAG_LENGTH),
    );
    expect(normaliseTag("a".repeat(MAX_TAG_LENGTH + 1))).toBeNull();
  });

  it("returns null for non-string input (defensive)", () => {
    expect(normaliseTag(null as unknown as string)).toBeNull();
    expect(normaliseTag(undefined as unknown as string)).toBeNull();
    expect(normaliseTag(42 as unknown as string)).toBeNull();
  });
});

describe("normaliseTagList", () => {
  it("normalises and dedupes case variants of the same tag", () => {
    const { tags, rejected } = normaliseTagList(["NSW", "nsw", " Nsw "]);
    expect(tags).toEqual(["nsw"]);
    expect(rejected).toEqual([]);
  });

  it("preserves input order for first occurrence", () => {
    const { tags } = normaliseTagList(["zulu", "alpha", "Bravo", "zulu"]);
    expect(tags).toEqual(["zulu", "alpha", "bravo"]);
  });

  it("collects rejected raw inputs separately from accepted tags", () => {
    const { tags, rejected } = normaliseTagList([
      "nsw",
      "",
      "staff,nsw",
      "lead",
    ]);
    expect(tags).toEqual(["nsw", "lead"]);
    expect(rejected).toEqual(["", "staff,nsw"]);
  });

  it("caps the result at MAX_TAGS_PER_USER and drops the overflow silently", () => {
    const tooMany = Array.from(
      { length: MAX_TAGS_PER_USER + 5 },
      (_, i) => `tag-${i}`,
    );
    const { tags } = normaliseTagList(tooMany);
    expect(tags).toHaveLength(MAX_TAGS_PER_USER);
  });

  it("returns empty tags + empty rejected for empty input", () => {
    expect(normaliseTagList([])).toEqual({ tags: [], rejected: [] });
  });
});
