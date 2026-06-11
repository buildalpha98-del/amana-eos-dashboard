import { describe, it, expect } from "vitest";
import {
  DEFAULT_SESSION_TIMES,
  defaultTimesForSession,
  eachDateInRange,
  isHhMm,
  isIsoDate,
  isRpSessionType,
  cellKey,
  indexEntriesByCell,
  type RpSessionType,
} from "@/lib/responsible-person";

describe("defaultTimesForSession", () => {
  it("returns the federal default when no sessionTimes given", () => {
    expect(defaultTimesForSession("bsc")).toEqual({ start: "06:30", end: "08:30" });
    expect(defaultTimesForSession("asc")).toEqual({ start: "15:00", end: "18:30" });
    expect(defaultTimesForSession("vc")).toEqual({ start: "06:30", end: "18:30" });
  });

  it("prefers the service's configured times when valid", () => {
    const st = { asc: { start: "15:30", end: "18:00" } };
    expect(defaultTimesForSession("asc", st)).toEqual({ start: "15:30", end: "18:00" });
  });

  it("falls back per-field when a configured time is malformed", () => {
    const st = { asc: { start: "not-a-time", end: "18:00" } };
    expect(defaultTimesForSession("asc", st)).toEqual({
      start: DEFAULT_SESSION_TIMES.asc.start, // federal fallback
      end: "18:00",
    });
  });

  it("ignores non-object sessionTimes / missing block", () => {
    expect(defaultTimesForSession("bsc", null)).toEqual(DEFAULT_SESSION_TIMES.bsc);
    expect(defaultTimesForSession("bsc", "garbage")).toEqual(DEFAULT_SESSION_TIMES.bsc);
    expect(defaultTimesForSession("bsc", { asc: { start: "07:00" } })).toEqual(
      DEFAULT_SESSION_TIMES.bsc,
    );
  });
});

describe("guards", () => {
  it("isHhMm", () => {
    expect(isHhMm("06:30")).toBe(true);
    expect(isHhMm("23:59")).toBe(true);
    expect(isHhMm("24:00")).toBe(false);
    expect(isHhMm("6:30")).toBe(false);
    expect(isHhMm("abc")).toBe(false);
    expect(isHhMm(630)).toBe(false);
  });

  it("isIsoDate", () => {
    expect(isIsoDate("2026-04-20")).toBe(true);
    expect(isIsoDate("20-04-2026")).toBe(false);
    expect(isIsoDate("2026-4-2")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("isRpSessionType", () => {
    expect(isRpSessionType("bsc")).toBe(true);
    expect(isRpSessionType("asc")).toBe(true);
    expect(isRpSessionType("vc")).toBe(true);
    expect(isRpSessionType("xx")).toBe(false);
    expect(isRpSessionType(null)).toBe(false);
  });
});

describe("eachDateInRange", () => {
  // 2026-04-20 is a Monday; 25/26 are Sat/Sun.
  it("returns weekdays only by default", () => {
    expect(eachDateInRange("2026-04-20", "2026-04-26")).toEqual([
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
      "2026-04-24",
    ]);
  });

  it("includes weekends when weekdaysOnly is false", () => {
    expect(eachDateInRange("2026-04-20", "2026-04-26", { weekdaysOnly: false })).toHaveLength(
      7,
    );
  });

  it("handles a single day", () => {
    expect(eachDateInRange("2026-04-20", "2026-04-20")).toEqual(["2026-04-20"]);
  });

  it("returns [] when from > to or input is malformed", () => {
    expect(eachDateInRange("2026-04-26", "2026-04-20")).toEqual([]);
    expect(eachDateInRange("nope", "2026-04-20")).toEqual([]);
  });
});

describe("cellKey + indexEntriesByCell", () => {
  it("keys by date|session and is last-write-wins", () => {
    const entries: { date: string; sessionType: RpSessionType; tag: string }[] = [
      { date: "2026-04-20", sessionType: "bsc", tag: "a" },
      { date: "2026-04-20", sessionType: "asc", tag: "b" },
      { date: "2026-04-20", sessionType: "bsc", tag: "dup" }, // overwrites "a"
    ];
    const idx = indexEntriesByCell(entries);
    expect(idx[cellKey("2026-04-20", "bsc")].tag).toBe("dup");
    expect(idx[cellKey("2026-04-20", "asc")].tag).toBe("b");
    expect(Object.keys(idx)).toHaveLength(2);
  });

  it("slices ISO datetimes to the date portion for the key", () => {
    const idx = indexEntriesByCell([
      { date: "2026-04-20T00:00:00.000Z", sessionType: "vc" },
    ]);
    expect(idx[cellKey("2026-04-20", "vc")]).toBeDefined();
  });
});
