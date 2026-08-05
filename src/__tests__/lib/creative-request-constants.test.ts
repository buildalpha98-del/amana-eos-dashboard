import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  addBusinessDays,
  defaultDueDate,
  STATUS_TIMESTAMP_FIELD,
  TURNAROUND_BUSINESS_DAYS,
  FULFILLER_ROLES,
  effectiveDueDate,
  DEFAULT_CHECKLISTS,
} from "@/lib/creative-request/constants";

describe("isValidTransition", () => {
  it("allows the happy path", () => {
    expect(isValidTransition("new", "briefed")).toBe(true);
    expect(isValidTransition("briefed", "in_progress")).toBe(true);
    expect(isValidTransition("in_progress", "in_review")).toBe(true);
    expect(isValidTransition("in_review", "changes_requested")).toBe(true);
    expect(isValidTransition("changes_requested", "in_review")).toBe(true);
    expect(isValidTransition("in_review", "approved")).toBe(true);
    expect(isValidTransition("approved", "delivered")).toBe(true);
  });
  it("rejects skips and moves out of terminal states", () => {
    expect(isValidTransition("new", "approved")).toBe(false);
    expect(isValidTransition("delivered", "new")).toBe(false);
    expect(isValidTransition("cancelled", "briefed")).toBe(false);
  });
  it("allows cancel from every non-terminal state except approved", () => {
    for (const from of ["new", "briefed", "in_progress", "in_review", "changes_requested"] as const) {
      expect(isValidTransition(from, "cancelled")).toBe(true);
    }
    expect(isValidTransition("approved", "cancelled")).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Wed 2026-08-05 + 3 business days = Mon 2026-08-10
    const wed = new Date("2026-08-05T00:00:00Z");
    expect(addBusinessDays(wed, 3).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
  it("Friday + 1 = Monday", () => {
    const fri = new Date("2026-08-07T00:00:00Z");
    expect(addBusinessDays(fri, 1).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("defaultDueDate", () => {
  it("uses the type's turnaround", () => {
    const wed = new Date("2026-08-05T00:00:00Z");
    // social_tile = 2 business days → Fri 2026-08-07
    expect(defaultDueDate("social_tile", wed).toISOString().slice(0, 10)).toBe("2026-08-07");
  });
});

describe("maps", () => {
  it("covers every type and status", () => {
    expect(Object.keys(TURNAROUND_BUSINESS_DAYS)).toHaveLength(8);
    expect(STATUS_TIMESTAMP_FIELD.delivered).toBe("deliveredAt");
    expect(STATUS_TIMESTAMP_FIELD.new).toBeNull();
    expect(FULFILLER_ROLES).toContain("marketing");
  });
});

describe("effectiveDueDate", () => {
  it("credits live pause time (still paused, no banked ms)", () => {
    const dueDate = new Date("2026-08-05T00:00:00Z");
    const pausedAt = new Date("2026-08-01T00:00:00Z");
    const now = new Date("2026-08-01T05:00:00Z"); // 5h into the pause
    expect(effectiveDueDate(dueDate, 0, pausedAt, now).toISOString()).toBe(
      new Date(dueDate.getTime() + 5 * 3_600_000).toISOString(),
    );
  });

  it("credits banked pausedMs when not currently paused", () => {
    const dueDate = new Date("2026-08-05T00:00:00Z");
    const bankedMs = 2 * 3_600_000; // 2h banked from an earlier pause
    expect(effectiveDueDate(dueDate, bankedMs, null).toISOString()).toBe(
      new Date(dueDate.getTime() + bankedMs).toISOString(),
    );
  });

  it("credits banked AND live pause together (second review round)", () => {
    const dueDate = new Date("2026-08-05T00:00:00Z");
    const bankedMs = 2 * 3_600_000; // 2h from round one
    const pausedAt = new Date("2026-08-02T00:00:00Z");
    const now = new Date("2026-08-02T03:00:00Z"); // 3h into round two
    expect(effectiveDueDate(dueDate, bankedMs, pausedAt, now).toISOString()).toBe(
      new Date(dueDate.getTime() + 5 * 3_600_000).toISOString(),
    );
  });
});

describe("DEFAULT_CHECKLISTS", () => {
  it("covers all 8 request types with a non-empty checklist", () => {
    expect(Object.keys(DEFAULT_CHECKLISTS)).toHaveLength(8);
    for (const items of Object.values(DEFAULT_CHECKLISTS)) {
      expect(items.length).toBeGreaterThan(0);
    }
  });
});
