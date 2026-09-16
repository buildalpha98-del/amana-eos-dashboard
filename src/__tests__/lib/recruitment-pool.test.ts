/**
 * Casual staff pool vocabulary and readiness.
 *
 * `stage` was unvalidated free text before 2026-09-15 — the convert route
 * wrote "hired", the schema comment listed a different set, and nothing
 * checked either — so rows carry legacy values that must still render.
 */
import { describe, it, expect } from "vitest";
import {
  POOL_STAGES,
  isPoolStage,
  normaliseStage,
  stageLabel,
  sourceLabel,
  poolReadiness,
  daysSinceContact,
} from "@/lib/recruitment/pool";

describe("pool stages", () => {
  it("recognises every canonical stage", () => {
    for (const s of POOL_STAGES) expect(isPoolStage(s)).toBe(true);
  });

  it("maps legacy values onto the current funnel rather than dropping them", () => {
    expect(normaliseStage("screened")).toBe("screening");
    expect(normaliseStage("offered")).toBe("interviewed");
    expect(normaliseStage("accepted")).toBe("hired");
    expect(normaliseStage("rejected")).toBe("not_suitable");
  });

  it("falls back to applied for null, empty or unknown values", () => {
    expect(normaliseStage(null)).toBe("applied");
    expect(normaliseStage("")).toBe("applied");
    expect(normaliseStage("nonsense")).toBe("applied");
  });

  it("never shows a raw token to a user", () => {
    expect(stageLabel("available")).toBe("In the pool");
    expect(stageLabel("accepted")).toBe("Hired");
    expect(stageLabel("nonsense")).toBe("Applied");
  });

  it("labels sources, including ones added later", () => {
    expect(sourceLabel("indeed")).toBe("Indeed");
    expect(sourceLabel("website")).toBe("Website");
    expect(sourceLabel(null)).toBe("Unknown");
    expect(sourceLabel("some_new_board")).toBe("some new board");
  });
});

describe("poolReadiness", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  const base = { wwccNumber: "WWC123", wwccExpiry: null, hasFirstAid: true };

  it("blocks anyone without a WWCC — it's the legal floor for child-facing work", () => {
    const r = poolReadiness({ ...base, wwccNumber: null }, now);
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/no wwcc/i);
  });

  it("blocks an expired WWCC", () => {
    const r = poolReadiness({ ...base, wwccExpiry: "2026-09-01" }, now);
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/expired/i);
  });

  it("warns when the WWCC is inside the 60-day window", () => {
    expect(poolReadiness({ ...base, wwccExpiry: "2026-10-15" }, now).status).toBe("expiring");
  });

  it("is ready with a valid WWCC and first aid", () => {
    const r = poolReadiness({ ...base, wwccExpiry: "2027-06-30" }, now);
    expect(r.status).toBe("ready");
  });

  it("warns, not blocks, on missing first aid — it's trainable, a WWCC isn't", () => {
    const r = poolReadiness({ ...base, wwccExpiry: "2027-06-30", hasFirstAid: false }, now);
    expect(r.status).toBe("expiring");
    expect(r.reason).toMatch(/first aid/i);
  });

  it("ignores an unparseable expiry rather than blocking on bad data", () => {
    expect(poolReadiness({ ...base, wwccExpiry: "not-a-date" }, now).status).toBe("ready");
  });
});

describe("daysSinceContact", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it("returns null when nobody has ever made contact", () => {
    expect(daysSinceContact(null, now)).toBeNull();
  });

  it("counts whole days since the last contact", () => {
    expect(daysSinceContact("2026-09-15T01:00:00Z", now)).toBe(0);
    expect(daysSinceContact("2026-06-17T12:00:00Z", now)).toBe(90);
  });

  it("treats an unparseable timestamp as never contacted", () => {
    expect(daysSinceContact("rubbish", now)).toBeNull();
  });
});
