/**
 * Per-service content — the fields the parent My Centre tab reads.
 *
 * The important property is BACKWARD COMPATIBILITY: every centre's
 * stored blob predates these fields, and losing the About text while
 * adding a map field would be the worst possible trade.
 */
import { describe, it, expect } from "vitest";
import {
  mergeServiceContent,
  serviceContentSchema,
  SERVICE_CONTENT_DEFAULTS,
  toParentContent,
} from "@/lib/service-content-shared";

describe("service content — the My Centre fields", () => {
  it("defaults every new field so an unedited centre still renders", () => {
    const merged = mergeServiceContent(null);
    expect(merged.locationWithinSchool).toBe("");
    expect(merged.meetingPoints).toBe("");
    expect(merged.vision).toBe("");
    expect(merged.serviceMapUrl).toBe("");
    expect(merged.policyDocumentIds).toEqual([]);
    expect(merged.enrolmentThankYou).toBe("");
  });

  it("keeps content saved before these fields existed", () => {
    // Every centre's stored blob predates them. Losing the About text
    // while adding a map field would be the worst possible trade.
    const merged = mergeServiceContent({
      about: "We are lovely",
      dailyRoutine: "3:15 pick up",
    });
    expect(merged.about).toBe("We are lovely");
    expect(merged.dailyRoutine).toBe("3:15 pick up");
    expect(merged.vision).toBe("");
    expect(merged.enrolmentThankYou).toBe("");
  });

  // 2026-09-24: the per-centre SharePoint quick-link shown in the
  // service page header.
  describe("sharepointUrl", () => {
    it("keeps a saved link on read", () => {
      const merged = mergeServiceContent({
        sharepointUrl: "https://amanaoshc.sharepoint.com/sites/greenacre",
      });
      expect(merged.sharepointUrl).toBe(
        "https://amanaoshc.sharepoint.com/sites/greenacre",
      );
    });

    it("defaults to empty — the header button hides rather than dead-linking", () => {
      const merged = mergeServiceContent({ about: "Hi" });
      expect(merged.sharepointUrl).toBe("");
    });

    it("validates on write", () => {
      const ok = serviceContentSchema.safeParse({
        ...SERVICE_CONTENT_DEFAULTS,
        sharepointUrl: "https://amanaoshc.sharepoint.com/sites/greenacre",
      });
      expect(ok.success).toBe(true);
    });
  });

  // 2026-09-08: the parent enrolment thank-you page's per-centre message.
  describe("enrolmentThankYou", () => {
    it("keeps a saved thank-you message on read", () => {
      const merged = mergeServiceContent({
        enrolmentThankYou: "We'll call within 2 business days to confirm your start date.",
      });
      expect(merged.enrolmentThankYou).toBe(
        "We'll call within 2 business days to confirm your start date.",
      );
    });

    it("falls back to empty (page shows its own generic message) when unset", () => {
      const merged = mergeServiceContent({ about: "Hi" });
      expect(merged.enrolmentThankYou).toBe("");
    });

    it("validates on write", () => {
      const ok = serviceContentSchema.safeParse({
        ...SERVICE_CONTENT_DEFAULTS,
        enrolmentThankYou: "Welcome to the family!",
      });
      expect(ok.success).toBe(true);
    });

    it("rejects an over-long thank-you message", () => {
      const ok = serviceContentSchema.safeParse({
        ...SERVICE_CONTENT_DEFAULTS,
        enrolmentThankYou: "x".repeat(2_001),
      });
      expect(ok.success).toBe(false);
    });
  });

  it("drops non-string policy ids rather than passing them to a query", () => {
    const merged = mergeServiceContent({
      policyDocumentIds: ["doc-1", 42, null, "", "doc-2"],
    });
    expect(merged.policyDocumentIds).toEqual(["doc-1", "doc-2"]);
  });

  it("validates the new fields on write", () => {
    const ok = serviceContentSchema.safeParse({
      ...SERVICE_CONTENT_DEFAULTS,
      locationWithinSchool: "Hall, next to the canteen. Enter via Gate 3.",
      vision: "Beyond The Bell",
      serviceMapUrl: "https://blob.example/map.png",
      serviceMapName: "map.png",
      policyDocumentIds: ["doc-1"],
    });
    expect(ok.success).toBe(true);
  });
});

describe("service content staffNotes", () => {
  it("defaults staffNotes to empty and accepts up to 4000 chars", () => {
    expect(SERVICE_CONTENT_DEFAULTS.staffNotes).toBe("");
    const ok = serviceContentSchema.safeParse({
      ...SERVICE_CONTENT_DEFAULTS,
      staffNotes: "Gate code 1234. Evacuation point: oval.",
    });
    expect(ok.success).toBe(true);
    const tooLong = serviceContentSchema.safeParse({
      ...SERVICE_CONTENT_DEFAULTS,
      staffNotes: "x".repeat(4001),
    });
    expect(tooLong.success).toBe(false);
  });

  it("mergeServiceContent falls back to '' for a non-string staffNotes", () => {
    expect(mergeServiceContent({ staffNotes: 42 }).staffNotes).toBe("");
  });

  it("toParentContent strips staffNotes and nothing else", () => {
    const merged = mergeServiceContent({ ...SERVICE_CONTENT_DEFAULTS, about: "Hi", staffNotes: "Gate 1234" });
    const parent = toParentContent(merged);
    expect("staffNotes" in parent).toBe(false);
    expect(parent.about).toBe("Hi");
    expect(Object.keys(parent).sort()).toEqual(
      Object.keys(SERVICE_CONTENT_DEFAULTS).filter((k) => k !== "staffNotes").sort(),
    );
  });
});
