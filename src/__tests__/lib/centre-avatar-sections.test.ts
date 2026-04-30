import { describe, it, expect } from "vitest";
import {
  SECTION_KEYS,
  sectionSchemas,
  snapshotSchema,
  parentAvatarSchema,
  programmeMixSchema,
  assetLibrarySchema,
} from "@/lib/centre-avatar/sections";

describe("centre-avatar/sections", () => {
  it("exposes all four section keys in a stable order", () => {
    expect(SECTION_KEYS).toEqual([
      "snapshot",
      "parentAvatar",
      "programmeMix",
      "assetLibrary",
    ]);
  });

  it("accepts a minimal snapshot", () => {
    const parsed = snapshotSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("accepts a snapshot with numbers + parent drivers", () => {
    const parsed = snapshotSchema.safeParse({
      centreDetails: { officialName: "Amana Greystanes" },
      numbers: { totalSchoolStudents: 400, ascEnrolments: 120 },
      parentDrivers: ["working parents", "cultural fit"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unreasonably long officialName", () => {
    const parsed = snapshotSchema.safeParse({
      centreDetails: { officialName: "x".repeat(500) },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a parent avatar with psychographics only", () => {
    const parsed = parentAvatarSchema.safeParse({
      psychographics: {
        primaryConcern: "worried about safety",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a programme name when programmes array is supplied", () => {
    const parsed = programmeMixSchema.safeParse({
      programmes: [{ name: "", running: true }],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty asset library", () => {
    const parsed = assetLibrarySchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("section dispatcher maps keys to the right schema", () => {
    expect(sectionSchemas.snapshot).toBe(snapshotSchema);
    expect(sectionSchemas.parentAvatar).toBe(parentAvatarSchema);
    expect(sectionSchemas.programmeMix).toBe(programmeMixSchema);
    expect(sectionSchemas.assetLibrary).toBe(assetLibrarySchema);
  });
});
