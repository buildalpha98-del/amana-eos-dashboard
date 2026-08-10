import { describe, it, expect } from "vitest";
import {
  expandBlockOutDates,
  isWeekend,
  dateOnly,
  MAX_RANGE_DAYS,
} from "@/lib/block-out-dates";

/** The days produced, as YYYY-MM-DD, for readable assertions. */
const ymd = (r: ReturnType<typeof expandBlockOutDates>) =>
  r.ok ? r.dates.map((d) => d.toISOString().slice(0, 10)) : [];

describe("isWeekend", () => {
  it("is true for Saturday and Sunday", () => {
    // 2026-08-08 is a Saturday, 2026-08-09 a Sunday.
    expect(isWeekend(dateOnly("2026-08-08"))).toBe(true);
    expect(isWeekend(dateOnly("2026-08-09"))).toBe(true);
  });

  it("is false Monday through Friday", () => {
    for (const d of [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]) {
      expect(isWeekend(dateOnly(d)), d).toBe(false);
    }
  });
});

describe("expandBlockOutDates — single day", () => {
  it("returns just that day", () => {
    const r = expandBlockOutDates({ date: "2026-08-03" });
    expect(ymd(r)).toEqual(["2026-08-03"]);
  });

  it("keeps a single day that IS a weekend", () => {
    // Picking one date is a deliberate choice, the same as naming one in
    // a list — never filtered. Being told the request was empty after
    // deliberately picking a Saturday would be absurd.
    const r = expandBlockOutDates({ date: "2026-08-08" });
    expect(ymd(r)).toEqual(["2026-08-08"]);
  });

  it("keeps a single weekend day even with weekend skipping on", () => {
    const r = expandBlockOutDates({
      date: "2026-08-09",
      excludeWeekends: true,
    });
    expect(ymd(r)).toEqual(["2026-08-09"]);
  });

  it("keeps a lone Saturday when weekend skipping is off", () => {
    const r = expandBlockOutDates({
      date: "2026-08-08",
      excludeWeekends: false,
    });
    expect(ymd(r)).toEqual(["2026-08-08"]);
  });
});

describe("expandBlockOutDates — ranges", () => {
  it("skips weekends by default", () => {
    // Mon 3rd to Fri 14th spans two weekends.
    const r = expandBlockOutDates({ date: "2026-08-03", endDate: "2026-08-14" });
    expect(ymd(r)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("includes weekends when asked", () => {
    const r = expandBlockOutDates({
      date: "2026-08-07",
      endDate: "2026-08-10",
      excludeWeekends: false,
    });
    expect(ymd(r)).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
  });

  it("refuses a multi-day range that is entirely weekend", () => {
    const r = expandBlockOutDates({ date: "2026-08-08", endDate: "2026-08-09" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/all weekend/i);
  });

  it("refuses a backwards range", () => {
    const r = expandBlockOutDates({ date: "2026-08-10", endDate: "2026-08-03" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/can't be before/i);
  });

  it("refuses a range longer than a term and says how long it was", () => {
    const r = expandBlockOutDates({ date: "2026-01-01", endDate: "2026-12-31" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("365 days");
  });

  it("allows a range of exactly the maximum length", () => {
    const start = dateOnly("2026-08-03");
    const end = new Date(start.getTime() + (MAX_RANGE_DAYS - 1) * 86_400_000);
    const r = expandBlockOutDates({
      date: "2026-08-03",
      endDate: end.toISOString().slice(0, 10),
      excludeWeekends: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dates).toHaveLength(MAX_RANGE_DAYS);
  });
});

describe("expandBlockOutDates — explicit lists", () => {
  it("takes the dates as given", () => {
    const r = expandBlockOutDates({ dates: ["2026-10-28", "2026-11-04"] });
    expect(ymd(r)).toEqual(["2026-10-28", "2026-11-04"]);
  });

  it("keeps a weekend that was listed explicitly", () => {
    // Someone typing a Saturday means it — silently dropping it would be
    // a lie about what was saved.
    const r = expandBlockOutDates({ dates: ["2026-08-08"] });
    expect(ymd(r)).toEqual(["2026-08-08"]);
  });

  it("ignores excludeWeekends for an explicit list", () => {
    const r = expandBlockOutDates({
      dates: ["2026-08-08", "2026-08-10"],
      excludeWeekends: true,
    });
    expect(ymd(r)).toEqual(["2026-08-08", "2026-08-10"]);
  });

  it("drops duplicates", () => {
    const r = expandBlockOutDates({
      dates: ["2026-08-03", "2026-08-03", "2026-08-04"],
    });
    expect(ymd(r)).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("sorts a list typed out of order", () => {
    const r = expandBlockOutDates({ dates: ["2026-11-04", "2026-10-28"] });
    expect(ymd(r)).toEqual(["2026-10-28", "2026-11-04"]);
  });

  it("wins over a range when both are given", () => {
    const r = expandBlockOutDates({
      date: "2026-08-03",
      endDate: "2026-08-14",
      dates: ["2026-12-25"],
    });
    expect(ymd(r)).toEqual(["2026-12-25"]);
  });
});

describe("expandBlockOutDates — nothing given", () => {
  it("asks for a date", () => {
    const r = expandBlockOutDates({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/give a date/i);
  });

  it("treats an empty list as nothing given", () => {
    const r = expandBlockOutDates({ dates: [] });
    expect(r.ok).toBe(false);
  });
});
