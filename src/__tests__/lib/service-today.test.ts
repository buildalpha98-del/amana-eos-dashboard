/**
 * "Today" is the centre's (Sydney) day everywhere (2026-10-09).
 *
 * Vercel runs in UTC, where Sydney is a day AHEAD from 13:00/14:00 UTC
 * until midnight UTC — 10–11am the next Sydney morning. Every "today",
 * week and month on the server, and every crons that fires on Sydney's
 * morning, was a day behind in that window.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  serviceTodayISO,
  serviceDateISO,
  serviceDateOnly,
  serviceWeekStart,
  serviceMonthStart,
  serviceMidnight,
  serviceDayBounds,
} from "@/lib/timezone";

// Monday 12 Oct 2026, 7:30am AEDT === Sunday 11 Oct, 20:30 UTC — when the
// Monday-morning crons run.
const MON_MORNING = new Date("2026-10-11T20:30:00Z");

describe("the centre's today", () => {
  it("is Sydney's date before 10–11am, not UTC's", () => {
    expect(serviceTodayISO(MON_MORNING)).toBe("2026-10-12");
    expect(serviceDateOnly(MON_MORNING).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("puts this week's Monday on Monday morning, not a week back", () => {
    expect(serviceWeekStart(MON_MORNING).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(serviceWeekStart(MON_MORNING, 0).toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("starts the month on the 1st at the centre", () => {
    expect(serviceMonthStart(new Date("2026-09-30T15:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("knows Sydney midnight in summer and winter time", () => {
    expect(serviceMidnight(new Date("2026-10-12T00:00:00Z")).toISOString()).toBe("2026-10-11T13:00:00.000Z");
    expect(serviceMidnight(new Date("2026-06-15T00:00:00Z")).toISOString()).toBe("2026-06-14T14:00:00.000Z");
    expect(serviceDayBounds(MON_MORNING).start.toISOString()).toBe("2026-10-11T13:00:00.000Z");
  });

  it("formats a browser's local-midnight date as that day, not the one before", () => {
    // What `new Date(2026, 9, 12)` is in a Sydney browser.
    expect(serviceDateISO(new Date("2026-10-11T13:00:00Z"))).toBe("2026-10-12");
    // And a @db.Date value from the server.
    expect(serviceDateISO(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
  });
});

describe("guard: nobody works out 'today' in UTC again", () => {
  const bad = /new Date\(\)\.toISOString\(\)\.(split\("T"\)\[0\]|slice\(0, ?10\)|substring\(0, ?10\))/;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__") walk(p);
      } else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(process.cwd(), "src"));

  it("uses serviceTodayISO() instead of new Date().toISOString().slice(0, 10)", () => {
    const offenders = files.filter((f) => bad.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.split("/src/")[1])).toEqual([]);
  });
});
