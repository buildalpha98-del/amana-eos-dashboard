// Regression test for the "cleared-field is silently undone" bug.
//
// Before this fix:
//   1. stripEmpty dropped keys whose value was an empty string.
//   2. The server's deepMerge then preserved the OLD value from the DB
//      (because the key wasn't in the payload).
//
// Result: a user clearing a field and saving had no effect.
//
// The fix changes stripEmpty to KEEP cleared fields as `null` (not drop the
// key), so deepMerge sees `null` and overrides with `null`. This test
// composes both functions to assert the round-trip works end-to-end.

import { describe, it, expect } from "vitest";
import { stripEmpty } from "@/components/centre-avatars/forms/FormPrimitives";
import { deepMergeSection } from "@/lib/centre-avatar/deep-merge";

describe("centre-avatar form save round-trip", () => {
  it("clearing a field at the top level overrides the saved value", () => {
    const previous = { officialName: "Greystanes", schoolName: "Greystanes Public" };
    const draft = { officialName: "", schoolName: "Greystanes Public" };
    const cleaned = stripEmpty(draft);
    const merged = deepMergeSection(previous, cleaned);
    expect(merged).toEqual({ officialName: null, schoolName: "Greystanes Public" });
  });

  it("clearing a deeply-nested field overrides the saved value", () => {
    const previous = {
      centreDetails: { officialName: "Greystanes", state: "NSW" },
      coordinator: { name: "Mirna" },
    };
    const draft = {
      centreDetails: { officialName: "", state: "NSW" },
      coordinator: { name: "Mirna" },
    };
    const cleaned = stripEmpty(draft);
    const merged = deepMergeSection(previous, cleaned) as Record<string, Record<string, unknown>>;
    expect(merged.centreDetails.officialName).toBeNull();
    expect(merged.centreDetails.state).toBe("NSW");
    expect(merged.coordinator.name).toBe("Mirna");
  });

  it("touching one subsection does not wipe sibling subsections", () => {
    // Akram opens parentAvatar form: only demographics is loaded into the
    // form draft. He edits one field. The form sends the whole `draft`
    // (which only contains demographics — psychographics is not in the form).
    const previous = {
      demographics: { ageRange: "30-45" },
      psychographics: { primaryConcern: "after-school enrichment" },
    };
    const draft = {
      demographics: { ageRange: "30-50" },
      // psychographics intentionally absent — it's not in this form
    };
    const cleaned = stripEmpty(draft);
    const merged = deepMergeSection(previous, cleaned) as Record<string, Record<string, unknown>>;
    expect(merged.demographics.ageRange).toBe("30-50");
    expect(merged.psychographics.primaryConcern).toBe("after-school enrichment");
  });

  it("trims whitespace-only strings to null (treated as cleared)", () => {
    const previous = { notes: "Important context" };
    const draft = { notes: "   " };
    const cleaned = stripEmpty(draft);
    const merged = deepMergeSection(previous, cleaned);
    expect(merged).toEqual({ notes: null });
  });

  it("empty arrays replace previous arrays (the user emptied the list)", () => {
    const previous = { parentDrivers: ["working parents", "cultural fit"] };
    const draft = { parentDrivers: [] as string[] };
    const cleaned = stripEmpty(draft);
    const merged = deepMergeSection(previous, cleaned);
    expect(merged).toEqual({ parentDrivers: [] });
  });
});
