import { describe, it, expect } from "vitest";
import {
  pickTopRecentIncidents,
  priorityScore,
  type RankableIncident,
} from "@/lib/incident-priority";

function inc(
  id: string,
  severity: string,
  daysAgo: number,
  reportable = false,
  deleted = false,
): RankableIncident {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    id,
    severity,
    incidentDate: d,
    reportableToAuthority: reportable,
    deleted,
  };
}

describe("priorityScore", () => {
  it("ranks reportable-to-authority above any non-reportable, regardless of severity or recency", () => {
    const reportableMinor = inc("a", "minor", 30, true);
    const nonReportableSerious = inc("b", "serious", 0);
    expect(priorityScore(reportableMinor)).toBeGreaterThan(
      priorityScore(nonReportableSerious),
    );
  });

  it("ranks higher severity above lower (within reportable status)", () => {
    expect(priorityScore(inc("s", "serious", 5))).toBeGreaterThan(
      priorityScore(inc("r", "reportable", 5)),
    );
    expect(priorityScore(inc("r", "reportable", 5))).toBeGreaterThan(
      priorityScore(inc("m", "moderate", 5)),
    );
    expect(priorityScore(inc("m", "moderate", 5))).toBeGreaterThan(
      priorityScore(inc("min", "minor", 5)),
    );
  });

  it("breaks severity ties by recency (newer wins)", () => {
    expect(priorityScore(inc("today", "serious", 0))).toBeGreaterThan(
      priorityScore(inc("week-ago", "serious", 7)),
    );
  });

  it("returns 0 for the severity component on unknown labels", () => {
    const unknown = inc("?", "totally_unknown", 5);
    const minor = inc("min", "minor", 5);
    expect(priorityScore(unknown)).toBeLessThan(priorityScore(minor));
  });
});

describe("pickTopRecentIncidents", () => {
  it("returns an empty list for empty input", () => {
    expect(pickTopRecentIncidents([], 5)).toEqual([]);
  });

  it("filters out soft-deleted incidents", () => {
    const out = pickTopRecentIncidents(
      [
        inc("keep", "serious", 1),
        inc("drop", "serious", 0, false, true),
      ],
      5,
    );
    expect(out.map((i) => i.id)).toEqual(["keep"]);
  });

  it("limits to N", () => {
    const items = [
      inc("a", "minor", 0),
      inc("b", "minor", 1),
      inc("c", "minor", 2),
      inc("d", "minor", 3),
    ];
    expect(pickTopRecentIncidents(items, 2)).toHaveLength(2);
  });

  it("orders by reportable → severity → recency in a mixed list", () => {
    const items = [
      inc("old-minor", "minor", 30),
      inc("today-moderate", "moderate", 0),
      inc("yesterday-serious", "serious", 1),
      inc("today-minor-reportable", "minor", 0, true),
      inc("week-old-reportable-serious", "serious", 7, true),
    ];
    const out = pickTopRecentIncidents(items, 5);
    expect(out.map((i) => i.id)).toEqual([
      // Both reportable rows first; among them, severity wins.
      "week-old-reportable-serious",
      "today-minor-reportable",
      // Then non-reportable by severity, then recency.
      "yesterday-serious",
      "today-moderate",
      "old-minor",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [inc("a", "minor", 1), inc("b", "serious", 2)];
    const before = items.map((i) => i.id);
    pickTopRecentIncidents(items, 5);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});
