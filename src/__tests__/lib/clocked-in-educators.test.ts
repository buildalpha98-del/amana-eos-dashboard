import { describe, expect, it } from "vitest";
import {
  clockedInEducatorIds,
  type ClockedShift,
} from "@/lib/clocked-in-educators";

const now = new Date("2026-10-12T16:00:00+11:00");
const shift: ClockedShift = {
  sessionType: "asc",
  status: "published",
  actualStart: new Date("2026-10-12T14:00:00+11:00"),
  actualEnd: null,
  user: {
    id: "educator",
    active: true,
    isCentreAccount: false,
    excludeFromRatio: false,
  },
};
describe("actual educator coverage", () => {
  it("counts distinct people, not overlapping shift records or names", () => {
    expect(
      clockedInEducatorIds(
        [shift, shift, { ...shift, user: { ...shift.user!, id: "another" } }],
        "asc",
        now,
      ),
    ).toEqual(["educator", "another"]);
  });
  it.each<Partial<ClockedShift>>([
    { status: "draft" },
    { actualStart: null },
    { actualStart: new Date("2026-10-13T14:00:00+11:00") },
    { actualEnd: now },
    { sessionType: "bsc" },
    { user: null },
    { user: { ...shift.user!, active: false } },
    { user: { ...shift.user!, isCentreAccount: true } },
    { user: { ...shift.user!, excludeFromRatio: true } },
  ])("excludes unavailable or ineligible records: %j", (override) => {
    expect(
      clockedInEducatorIds([{ ...shift, ...override }], "asc", now),
    ).toEqual([]);
  });
});
