import { describe, it, expect } from "vitest";
import {
  MTOP_OUTCOMES,
  NQS_AREAS,
  isMtopOutcome,
  isNqsArea,
  isPostStatus,
  isPubliclyVisible,
  nqsLabel,
} from "@/lib/curriculum";

describe("frameworks", () => {
  it("offers the five MTOP outcomes", () => {
    expect(MTOP_OUTCOMES).toHaveLength(5);
    expect(MTOP_OUTCOMES.map((o) => o.label)).toEqual([
      "Identity",
      "Community",
      "Wellbeing",
      "Learning",
      "Communication",
    ]);
  });

  it("offers the seven NQS quality areas", () => {
    expect(NQS_AREAS).toHaveLength(7);
    expect(NQS_AREAS[0].code).toBe("QA1");
    expect(NQS_AREAS[6].code).toBe("QA7");
  });

  it("validates membership", () => {
    expect(isMtopOutcome("Wellbeing")).toBe(true);
    expect(isMtopOutcome("Belonging")).toBe(false); // EYLF wording, not MTOP
    expect(isNqsArea("QA3")).toBe(true);
    expect(isNqsArea("QA8")).toBe(false);
  });

  it("labels an NQS area, and passes through an unknown code", () => {
    expect(nqsLabel("QA1")).toBe("QA1 · Educational program and practice");
    expect(nqsLabel("QA99")).toBe("QA99");
  });

  it("validates post status", () => {
    expect(isPostStatus("scheduled")).toBe(true);
    expect(isPostStatus("archived")).toBe(false);
    expect(isPostStatus(null)).toBe(false);
  });
});

describe("isPubliclyVisible", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("never shows a draft, whatever the date", () => {
    expect(isPubliclyVisible("draft", null, now)).toBe(false);
    expect(isPubliclyVisible("draft", "2020-01-01T00:00:00.000Z", now)).toBe(
      false,
    );
  });

  it("shows a published post with no publish date", () => {
    expect(isPubliclyVisible("published", null, now)).toBe(true);
  });

  it("hides a scheduled post until its time arrives", () => {
    expect(
      isPubliclyVisible("scheduled", "2026-08-01T18:00:00.000Z", now),
    ).toBe(false);
  });

  it("shows a scheduled post once the time has passed", () => {
    expect(
      isPubliclyVisible("scheduled", "2026-08-01T09:00:00.000Z", now),
    ).toBe(true);
  });

  it("shows a scheduled post exactly at its publish time", () => {
    // Boundary matters: "<=" not "<", or a post scheduled for 3pm sits
    // invisible for however long until the next read happens to be later.
    expect(
      isPubliclyVisible("scheduled", "2026-08-01T12:00:00.000Z", now),
    ).toBe(true);
  });

  it("hides a scheduled post that somehow has no date", () => {
    // Scheduled-with-no-time is incoherent; hiding is the safe reading,
    // since showing it would publish something nobody chose to publish.
    expect(isPubliclyVisible("scheduled", null, now)).toBe(false);
  });

  it("falls back to the status when the date is unparseable", () => {
    expect(isPubliclyVisible("published", "not a date", now)).toBe(true);
    expect(isPubliclyVisible("scheduled", "not a date", now)).toBe(false);
  });
});
