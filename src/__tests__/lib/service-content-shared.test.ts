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
} from "@/lib/service-content-shared";

describe("service content — the My Centre fields", () => {
  it("defaults every new field so an unedited centre still renders", () => {
    const merged = mergeServiceContent(null);
    expect(merged.locationWithinSchool).toBe("");
    expect(merged.meetingPoints).toBe("");
    expect(merged.vision).toBe("");
    expect(merged.serviceMapUrl).toBe("");
    expect(merged.policyDocumentIds).toEqual([]);
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
