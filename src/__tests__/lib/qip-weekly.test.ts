import { describe, it, expect } from "vitest";
import {
  mondayOfWeekSydney,
  buildEvidenceExcerpts,
  parseTagResponse,
  parseChangesResponse,
} from "@/lib/qip-weekly";

describe("mondayOfWeekSydney", () => {
  it("returns Monday 00:00 Sydney for a mid-week instant", () => {
    // Fri 2026-07-10 06:00 UTC = Fri 16:00 AEST → Monday was 2026-07-06
    const monday = mondayOfWeekSydney(new Date("2026-07-10T06:00:00Z"));
    // Monday 00:00 AEST == Sunday 14:00 UTC
    expect(monday.toISOString()).toBe("2026-07-05T14:00:00.000Z");
  });

  it("keeps a Monday as its own week start", () => {
    // Mon 2026-07-06 06:00 UTC = Mon 16:00 AEST
    const monday = mondayOfWeekSydney(new Date("2026-07-06T06:00:00Z"));
    expect(monday.toISOString()).toBe("2026-07-05T14:00:00.000Z");
  });

  it("rolls a Sunday back to the previous Monday", () => {
    // Sun 2026-07-12 06:00 UTC = Sun 16:00 AEST → week started Mon 2026-07-06
    const monday = mondayOfWeekSydney(new Date("2026-07-12T06:00:00Z"));
    expect(monday.toISOString()).toBe("2026-07-05T14:00:00.000Z");
  });
});

describe("buildEvidenceExcerpts", () => {
  it("numbers items and clips to 300 chars", () => {
    const block = buildEvidenceExcerpts([
      {
        kind: "reflection",
        id: "r1",
        date: new Date("2026-07-07T05:00:00Z"),
        content: "A".repeat(400),
      },
      {
        kind: "observation",
        id: "o1",
        date: new Date("2026-07-08T05:00:00Z"),
        content: "Cubby play",
        mtopOutcomes: ["Learners"],
        childCount: 2,
      },
    ]);
    expect(block).toContain("1. [reflection");
    expect(block).toContain("2. [observation");
    expect(block).toContain("MTOP: Learners");
    expect(block).toContain("2 children");
    expect(block).not.toContain("A".repeat(301));
  });
});

describe("parseTagResponse", () => {
  it("parses valid JSON", () => {
    const r = parseTagResponse(
      '{"items":[{"index":1,"qualityAreas":[5],"mtopOutcomes":["Wellbeing"]}]}',
    );
    expect(r?.items[0].qualityAreas).toEqual([5]);
  });

  it("strips markdown fences", () => {
    const r = parseTagResponse(
      '```json\n{"items":[{"index":1,"qualityAreas":[],"mtopOutcomes":[]}]}\n```',
    );
    expect(r?.items).toHaveLength(1);
  });

  it("returns null on malformed JSON", () => {
    expect(parseTagResponse("not json at all")).toBeNull();
  });

  it("returns null on wrong shape", () => {
    expect(parseTagResponse('{"items":[{"index":"one"}]}')).toBeNull();
    expect(
      parseTagResponse('{"items":[{"index":1,"qualityAreas":[9],"mtopOutcomes":[]}]}'),
    ).toBeNull();
    expect(
      parseTagResponse(
        '{"items":[{"index":1,"qualityAreas":[1],"mtopOutcomes":["Bogus"]}]}',
      ),
    ).toBeNull();
  });
});

describe("parseChangesResponse", () => {
  it("parses valid changes", () => {
    const r = parseChangesResponse(
      '{"changes":[{"field":"strengths","proposedText":"We now...","rationale":"Evidence 1-2"}]}',
    );
    expect(r?.changes[0].field).toBe("strengths");
  });

  it("parses the empty-changes marker", () => {
    expect(parseChangesResponse('{"changes":[]}')?.changes).toEqual([]);
  });

  it("rejects invalid field names", () => {
    expect(
      parseChangesResponse(
        '{"changes":[{"field":"improvementGoal","proposedText":"x","rationale":"y"}]}',
      ),
    ).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseChangesResponse("oops")).toBeNull();
  });
});
