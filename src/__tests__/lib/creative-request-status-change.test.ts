import { describe, it, expect } from "vitest";
import { applyStatusChange } from "@/lib/creative-request/status-change";

const base = { status: "in_progress", pausedAt: null, pausedMs: 0 } as const;

describe("applyStatusChange", () => {
  it("stamps the stage timestamp", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const data = applyStatusChange({ ...base }, "in_review", now);
    expect(data.status).toBe("in_review");
    expect(data.inReviewAt).toEqual(now);
  });

  it("starts the pause clock on entering in_review", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const data = applyStatusChange({ ...base }, "in_review", now);
    expect(data.pausedAt).toEqual(now);
  });

  it("accumulates pausedMs on leaving in_review", () => {
    const enteredAt = new Date("2026-08-05T00:00:00Z");
    const now = new Date("2026-08-05T02:00:00Z"); // 2h later
    const data = applyStatusChange(
      { status: "in_review", pausedAt: enteredAt, pausedMs: 60_000 },
      "changes_requested",
      now,
    );
    expect(data.pausedAt).toBeNull();
    expect(data.pausedMs).toBe(60_000 + 2 * 3_600_000);
    expect(data.changesRequestedAt).toEqual(now);
  });

  it("clamps pausedMs below Int32 max (month-long pause must not overflow)", () => {
    const enteredAt = new Date("2026-07-01T00:00:00Z");
    const now = new Date("2026-08-05T00:00:00Z"); // 35 days later
    const data = applyStatusChange(
      { status: "in_review", pausedAt: enteredAt, pausedMs: 0 },
      "approved",
      now,
    );
    expect(data.pausedMs).toBe(2_000_000_000);
  });

  it("does not touch pause fields on unrelated transitions", () => {
    const now = new Date();
    const data = applyStatusChange({ ...base, status: "briefed" }, "in_progress", now);
    expect(data.pausedAt).toBeUndefined();
    expect(data.pausedMs).toBeUndefined();
  });
});
